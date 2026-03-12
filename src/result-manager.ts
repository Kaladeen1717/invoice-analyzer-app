/**
 * Processing result storage — append-only JSONL as source of truth,
 * with processing-results.json as a derived cache for fast reads.
 *
 * Each write appends a line to results.jsonl. The JSON cache is rebuilt
 * on a debounced schedule or on-demand when a read detects staleness.
 * This eliminates the read-modify-write race that dropped results under
 * concurrent p-limit workers.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import type {
    ProcessingResult,
    ResultRecord,
    ResultsFileData,
    GetResultsOptions,
    PaginatedResults,
    SummaryStats,
    TokenUsage
} from './types/index.js';

export const RESULTS_FILENAME = 'processing-results.json';
export const JSONL_FILENAME = 'results.jsonl';

// ── Private: debounce timers for cache rebuilds ──

const rebuildTimers = new Map<string, NodeJS.Timeout>();
const dirtyPaths = new Set<string>();

// ── Private: JSONL helpers ──

async function appendJsonlLine(folderPath: string, record: ResultRecord): Promise<void> {
    const jsonlPath = path.join(folderPath, JSONL_FILENAME);
    await fs.promises.appendFile(jsonlPath, JSON.stringify(record) + '\n');
    dirtyPaths.add(folderPath);
}

function parseJsonlToMap(content: string): Map<string, ResultRecord> {
    const map = new Map<string, ResultRecord>();
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            const record = JSON.parse(trimmed) as ResultRecord;
            map.set(record.id, record); // last occurrence wins (dedup for retries)
        } catch {
            // Skip corrupt lines — more resilient than JSON (single corruption ≠ total loss)
        }
    }
    return map;
}

// ── Private: cache management ──

async function readResultsFile(folderPath: string): Promise<ResultsFileData> {
    const filePath = path.join(folderPath, RESULTS_FILENAME);
    try {
        const data = await fs.promises.readFile(filePath, 'utf-8');
        return JSON.parse(data) as ResultsFileData;
    } catch {
        return { results: [], lastUpdated: null };
    }
}

async function writeResultsFile(folderPath: string, data: ResultsFileData): Promise<void> {
    const filePath = path.join(folderPath, RESULTS_FILENAME);
    const tmpPath = filePath + '.tmp';
    await fs.promises.writeFile(tmpPath, JSON.stringify(data, null, 2));
    await fs.promises.rename(tmpPath, filePath);
}

async function rebuildResultsCache(folderPath: string): Promise<ResultsFileData> {
    const jsonlPath = path.join(folderPath, JSONL_FILENAME);
    const content = await fs.promises.readFile(jsonlPath, 'utf-8');
    const map = parseJsonlToMap(content);

    const results = Array.from(map.values()).sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const lastUpdated = results.length > 0 ? results[0].timestamp : null;
    const data: ResultsFileData = { results, lastUpdated };
    await writeResultsFile(folderPath, data);
    dirtyPaths.delete(folderPath);
    return data;
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.promises.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function isCacheStale(folderPath: string): Promise<boolean> {
    const jsonlPath = path.join(folderPath, JSONL_FILENAME);
    const cachePath = path.join(folderPath, RESULTS_FILENAME);
    try {
        const [jsonlStat, cacheStat] = await Promise.all([fs.promises.stat(jsonlPath), fs.promises.stat(cachePath)]);
        return jsonlStat.mtimeMs > cacheStat.mtimeMs;
    } catch {
        // Cache missing or JSONL missing — treat as stale so rebuild runs
        return true;
    }
}

async function migrateJsonToJsonl(folderPath: string): Promise<void> {
    const data = await readResultsFile(folderPath);
    if (data.results.length === 0) return;

    const jsonlPath = path.join(folderPath, JSONL_FILENAME);
    const lines = data.results.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await fs.promises.writeFile(jsonlPath, lines);

    // Rebuild cache to verify consistency
    const rebuilt = await rebuildResultsCache(folderPath);
    if (rebuilt.results.length !== data.results.length) {
        throw new Error(
            `Migration verification failed: expected ${data.results.length} records, got ${rebuilt.results.length}`
        );
    }
}

async function ensureFreshCache(folderPath: string): Promise<void> {
    const jsonlPath = path.join(folderPath, JSONL_FILENAME);
    const cachePath = path.join(folderPath, RESULTS_FILENAME);

    const jsonlExists = await fileExists(jsonlPath);
    const cacheExists = await fileExists(cachePath);

    if (!jsonlExists && cacheExists) {
        // Legacy data — migrate JSON → JSONL
        await migrateJsonToJsonl(folderPath);
        return;
    }

    if (jsonlExists && (dirtyPaths.has(folderPath) || (await isCacheStale(folderPath)))) {
        await rebuildResultsCache(folderPath);
    }
}

function scheduleCacheRebuild(folderPath: string): void {
    const existing = rebuildTimers.get(folderPath);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
        rebuildTimers.delete(folderPath);
        rebuildResultsCache(folderPath).catch(() => {
            // Fire-and-forget — reads will trigger rebuild via ensureFreshCache
        });
    }, 100);

    rebuildTimers.set(folderPath, timer);
}

// ── Private: record builder ──

function buildRecord(
    result: ProcessingResult,
    options: { id?: string; model?: string | null; duration?: number | null; retriedFrom?: string }
): ResultRecord {
    const now = new Date().toISOString();

    let status: ResultRecord['status'] = 'failed';
    if (result.success) status = (result as { dryRun?: boolean }).dryRun ? 'dry-run' : 'success';

    const record: ResultRecord = {
        id: options.id || crypto.randomUUID(),
        originalFilename: result.originalFilename,
        outputFilename: (result as { outputFilename?: string }).outputFilename || null,
        status,
        model: options.model || null,
        extractedFields: result.success ? (result as { analysis?: Record<string, unknown> }).analysis || {} : {},
        tags:
            result.success && (result as { analysis?: { tags?: Record<string, boolean> } }).analysis
                ? (result as { analysis: { tags?: Record<string, boolean> } }).analysis.tags || {}
                : {},
        tokenUsage: result.tokenUsage || {
            promptTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            cachedTokens: 0,
            thoughtsTokens: 0
        },
        timestamp: now,
        error: (result as { error?: string }).error || null,
        rawResponse: (result as { rawResponse?: string | null }).rawResponse || null,
        duration: options.duration || null
    };

    if (options.retriedFrom) {
        record.retriedFrom = options.retriedFrom;
    }

    return record;
}

// ── Public API ──

/**
 * Append a single processing result to the client's JSONL log.
 */
export async function appendResult(
    folderPath: string,
    result: ProcessingResult,
    options: { model?: string | null; duration?: number | null } = {}
): Promise<ResultRecord> {
    const record = buildRecord(result, options);
    await appendJsonlLine(folderPath, record);
    scheduleCacheRebuild(folderPath);
    return record;
}

/**
 * Get results with optional filtering and pagination.
 */
export async function getResults(folderPath: string, options: GetResultsOptions = {}): Promise<PaginatedResults> {
    const { status, limit = 50, offset = 0 } = options;
    await ensureFreshCache(folderPath);
    const data = await readResultsFile(folderPath);

    // Sort newest first
    let filtered = data.results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (status) {
        filtered = filtered.filter((r) => r.status === status);
    }

    const total = filtered.length;
    const paged = filtered.slice(offset, offset + limit);

    return {
        results: paged,
        total,
        hasMore: offset + limit < total
    };
}

/**
 * Get a single result by ID.
 */
export async function getResult(folderPath: string, id: string): Promise<ResultRecord | null> {
    await ensureFreshCache(folderPath);
    const data = await readResultsFile(folderPath);
    return data.results.find((r) => r.id === id) || null;
}

/**
 * Get aggregate statistics for a client's processing history.
 */
export async function getSummary(folderPath: string): Promise<SummaryStats> {
    await ensureFreshCache(folderPath);
    const data = await readResultsFile(folderPath);
    const results = data.results;

    if (results.length === 0) {
        return {
            total: 0,
            success: 0,
            failed: 0,
            dryRun: 0,
            successRate: 0,
            tokenUsage: { promptTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: 0, thoughtsTokens: 0 },
            firstProcessed: null,
            lastProcessed: null
        };
    }

    const success = results.filter((r) => r.status === 'success').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const dryRunCount = results.filter((r) => r.status === 'dry-run').length;

    const tokenUsage = results.reduce(
        (acc, r) => {
            const usage: TokenUsage = r.tokenUsage || {
                promptTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                cachedTokens: 0,
                thoughtsTokens: 0
            };
            return {
                promptTokens: acc.promptTokens + usage.promptTokens,
                outputTokens: acc.outputTokens + usage.outputTokens,
                totalTokens: acc.totalTokens + usage.totalTokens,
                cachedTokens: acc.cachedTokens + (usage.cachedTokens || 0),
                thoughtsTokens: (acc.thoughtsTokens ?? 0) + (usage.thoughtsTokens || 0)
            };
        },
        { promptTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: 0, thoughtsTokens: 0 } as TokenUsage
    );

    const timestamps = results.map((r) => r.timestamp).sort();

    return {
        total: results.length,
        success,
        failed,
        dryRun: dryRunCount,
        successRate: Math.round((success / results.length) * 100),
        tokenUsage,
        firstProcessed: timestamps[0],
        lastProcessed: timestamps[timestamps.length - 1]
    };
}

/**
 * Replace a result entry by ID with a new processing outcome.
 * Appends a new JSONL line with the same ID — last occurrence wins on rebuild.
 */
export async function updateResult(
    folderPath: string,
    id: string,
    result: ProcessingResult,
    options: { model?: string | null; duration?: number | null } = {}
): Promise<ResultRecord> {
    await ensureFreshCache(folderPath);
    const data = await readResultsFile(folderPath);
    const original = data.results.find((r) => r.id === id);
    if (!original) throw new Error(`Result ${id} not found`);

    const record = buildRecord(result, {
        id,
        model: options.model || original.model,
        duration: options.duration,
        retriedFrom: original.timestamp
    });

    await appendJsonlLine(folderPath, record);
    scheduleCacheRebuild(folderPath);
    return record;
}

/**
 * Get all failed result entries (for retry-all).
 */
export async function getFailedResults(folderPath: string): Promise<ResultRecord[]> {
    await ensureFreshCache(folderPath);
    const data = await readResultsFile(folderPath);
    return data.results.filter((r) => r.status === 'failed');
}
