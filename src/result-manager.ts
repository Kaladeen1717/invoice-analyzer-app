/**
 * Processing result storage — persists per-file results to processing-results.json
 * in each client's folder for history, retry, and statistics features.
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

/**
 * Read the results file for a client folder, or return empty structure if missing.
 * @param folderPath - The client's base folder path
 * @returns The results data { results: [], lastUpdated }
 */
async function readResultsFile(folderPath: string): Promise<ResultsFileData> {
    const filePath = path.join(folderPath, RESULTS_FILENAME);
    try {
        const data = await fs.promises.readFile(filePath, 'utf-8');
        return JSON.parse(data) as ResultsFileData;
    } catch {
        return { results: [], lastUpdated: null };
    }
}

/**
 * Write the results file atomically (write to temp, then rename).
 * @param folderPath - The client's base folder path
 * @param data - The full results data to write
 */
async function writeResultsFile(folderPath: string, data: ResultsFileData): Promise<void> {
    const filePath = path.join(folderPath, RESULTS_FILENAME);
    const tmpPath = filePath + '.tmp';
    await fs.promises.writeFile(tmpPath, JSON.stringify(data, null, 2));
    await fs.promises.rename(tmpPath, filePath);
}

/**
 * Append a single processing result to the client's results file.
 * @param folderPath - The client's base folder path
 * @param result - The processing result from the pipeline
 * @param options - Additional metadata
 * @returns The stored result record
 */
export async function appendResult(
    folderPath: string,
    result: ProcessingResult,
    options: { model?: string | null; duration?: number | null } = {}
): Promise<ResultRecord> {
    const data = await readResultsFile(folderPath);
    const now = new Date().toISOString();

    let status: ResultRecord['status'] = 'failed';
    if (result.success) status = (result as { dryRun?: boolean }).dryRun ? 'dry-run' : 'success';

    const record: ResultRecord = {
        id: crypto.randomUUID(),
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

    data.results.push(record);
    data.lastUpdated = now;

    await writeResultsFile(folderPath, data);
    return record;
}

/**
 * Get results with optional filtering and pagination.
 * @param folderPath - The client's base folder path
 * @param options - Query options
 * @returns Paginated results
 */
export async function getResults(folderPath: string, options: GetResultsOptions = {}): Promise<PaginatedResults> {
    const { status, limit = 50, offset = 0 } = options;
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
 * @param folderPath - The client's base folder path
 * @param id - The result ID
 * @returns The result record or null
 */
export async function getResult(folderPath: string, id: string): Promise<ResultRecord | null> {
    const data = await readResultsFile(folderPath);
    return data.results.find((r) => r.id === id) || null;
}

/**
 * Get aggregate statistics for a client's processing history.
 * @param folderPath - The client's base folder path
 * @returns Summary stats
 */
export async function getSummary(folderPath: string): Promise<SummaryStats> {
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
 * Used by retry to update failed results with new success/failure.
 * @param folderPath - The client's base folder path
 * @param id - The result ID to replace
 * @param result - The new processing result
 * @param options - Additional metadata (model, duration)
 * @returns The updated result record
 */
export async function updateResult(
    folderPath: string,
    id: string,
    result: ProcessingResult,
    options: { model?: string | null; duration?: number | null } = {}
): Promise<ResultRecord> {
    const data = await readResultsFile(folderPath);
    const index = data.results.findIndex((r) => r.id === id);
    if (index === -1) throw new Error(`Result ${id} not found`);

    const now = new Date().toISOString();
    const record: ResultRecord = {
        id,
        originalFilename: result.originalFilename,
        outputFilename: (result as { outputFilename?: string }).outputFilename || null,
        status: result.success ? 'success' : 'failed',
        model: options.model || data.results[index].model,
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
        rawResponse: null,
        duration: options.duration || null,
        retriedFrom: data.results[index].timestamp
    };

    data.results[index] = record;
    data.lastUpdated = now;

    await writeResultsFile(folderPath, data);
    return record;
}

/**
 * Get all failed result entries (for retry-all).
 * @param folderPath - The client's base folder path
 * @returns Array of failed result records
 */
export async function getFailedResults(folderPath: string): Promise<ResultRecord[]> {
    const data = await readResultsFile(folderPath);
    return data.results.filter((r) => r.status === 'failed');
}
