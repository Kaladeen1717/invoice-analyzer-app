#!/usr/bin/env node

/**
 * Pipeline Test Harness (INV-79)
 *
 * Runs the extraction pipeline on eval-corpus PDFs with live Gemini API
 * calls and appends results to a persistent run log. No side effects —
 * PDFs stay in place, no file moves, no enriched PDFs, no CSV writes.
 *
 * Features:
 *   - Concurrent API calls via p-limit (default: 10)
 *   - Rate-limit retry with exponential backoff
 *   - Progress counter with ETA
 *   - Persistent run log at tests/fixtures/pipeline-runs.json
 *   - Optional --label for tagging runs
 *
 * Usage:
 *   npx tsx scripts/test-pipeline.ts                          # Process all corpus PDFs
 *   npx tsx scripts/test-pipeline.ts --limit 20               # First N PDFs only
 *   npx tsx scripts/test-pipeline.ts --concurrency 5          # Parallel API calls (default: 10)
 *   npx tsx scripts/test-pipeline.ts --invoice foo.pdf         # Single specific PDF
 *   npx tsx scripts/test-pipeline.ts --label "after prompt tweak"  # Tag the run
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pLimit from 'p-limit';
import type { AppConfig } from '../src/types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CORPUS_DIR = path.join(__dirname, '..', 'tests', 'fixtures', 'eval-corpus');
const RUN_LOG_PATH = path.join(__dirname, '..', 'tests', 'fixtures', 'pipeline-runs.json');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedArgs {
    concurrency: number;
    limit: number;
    invoice: string | null;
    label: string | null;
}

interface TokenUsage {
    promptTokens: number;
    outputTokens: number;
    totalTokens: number;
}

interface ExtractionResult {
    analysis: Record<string, unknown>;
    tokenUsage: TokenUsage;
    duration: number;
}

interface PipelineRunResult {
    filename: string;
    success: boolean;
    durationMs: number;
    tokenUsage: TokenUsage;
    analysis: Record<string, unknown> | null;
    error: string | null;
}

interface PipelineRun {
    id: string;
    timestamp: string;
    label: string | null;
    model: string;
    configSnapshot: {
        fieldCount: number;
        enabledFields: string[];
        enabledTags: string[];
        hasRawPrompt: boolean;
    };
    stats: {
        total: number;
        success: number;
        failed: number;
        durationMs: number;
        tokenUsage: TokenUsage;
    };
    results: PipelineRunResult[];
}

interface PipelineRunsFile {
    runs: PipelineRun[];
}

interface FieldDefinition {
    key: string;
    enabled: boolean;
}

interface TagDefinition {
    id: string;
    enabled: boolean;
}

interface Config {
    model?: string;
    fieldDefinitions: FieldDefinition[];
    tagDefinitions?: TagDefinition[];
    rawPrompt?: string;
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(): ParsedArgs {
    const args = process.argv.slice(2);
    const opts: ParsedArgs = { concurrency: 10, limit: 0, invoice: null, label: null };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--concurrency' && args[i + 1]) opts.concurrency = parseInt(args[++i], 10);
        else if (args[i] === '--limit' && args[i + 1]) opts.limit = parseInt(args[++i], 10);
        else if (args[i] === '--invoice' && args[i + 1]) opts.invoice = args[++i];
        else if (args[i] === '--label' && args[i + 1]) opts.label = args[++i];
        else if (args[i] === '--help') {
            console.log(
                'Usage: npx tsx scripts/test-pipeline.ts [--limit N] [--concurrency N] [--invoice file.pdf] [--label "..."]'
            );
            process.exit(0);
        }
    }
    return opts;
}

// ---------------------------------------------------------------------------
// Discover PDFs
// ---------------------------------------------------------------------------

async function discoverPDFs(invoiceFilter: string | null): Promise<string[]> {
    const files = await fs.readdir(CORPUS_DIR);
    let pdfFiles = files.filter((f) => f.endsWith('.pdf')).sort();

    if (invoiceFilter) {
        const match = pdfFiles.find((f) => f === invoiceFilter || f.includes(invoiceFilter));
        if (!match) {
            console.error(`\nError: No PDF matching "${invoiceFilter}" found in eval-corpus`);
            process.exit(1);
        }
        pdfFiles = [match];
    }

    return pdfFiles;
}

// ---------------------------------------------------------------------------
// Extract a single invoice with retry
// ---------------------------------------------------------------------------

async function extractWithRetry(pdfPath: string, config: Config, maxRetries = 3): Promise<ExtractionResult> {
    const { analyzeInvoice } = await import('../src/processor.js');

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const startTime = Date.now();
            const result = await analyzeInvoice(pdfPath, config as unknown as AppConfig);
            const duration = Date.now() - startTime;

            const { _tokenUsage, ...analysis } = result as Record<string, unknown>;
            const tokenUsage = (_tokenUsage as TokenUsage) || {
                promptTokens: 0,
                outputTokens: 0,
                totalTokens: 0
            };

            return { analysis, tokenUsage, duration };
        } catch (error) {
            const message = (error as Error).message;
            const isRateLimit = message && (message.includes('429') || message.includes('RATE_LIMIT'));
            const isServerError = message && (message.includes('500') || message.includes('503'));

            if ((isRateLimit || isServerError) && attempt < maxRetries) {
                const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
                process.stdout.write(` [retry ${attempt}/${maxRetries} in ${delay / 1000}s]`);
                await new Promise((resolve) => setTimeout(resolve, delay));
                continue;
            }

            throw error;
        }
    }

    throw new Error('Exhausted retries');
}

// ---------------------------------------------------------------------------
// Run log persistence
// ---------------------------------------------------------------------------

async function appendRunToLog(run: PipelineRun): Promise<void> {
    let data: PipelineRunsFile = { runs: [] };

    try {
        const content = await fs.readFile(RUN_LOG_PATH, 'utf-8');
        data = JSON.parse(content) as PipelineRunsFile;
    } catch {
        // File doesn't exist or is invalid — start fresh
    }

    data.runs.push(run);
    await fs.writeFile(RUN_LOG_PATH, JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m${secs}s`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
    const opts = parseArgs();

    console.log('Pipeline Test Harness (INV-79)');
    console.log(`Concurrency: ${opts.concurrency}${opts.label ? ` | Label: "${opts.label}"` : ''}`);

    // Verify API key
    if (!process.env.GEMINI_API_KEY) {
        console.error('\nError: GEMINI_API_KEY not set in .env');
        process.exit(1);
    }

    // Load config
    const { loadConfig } = await import('../src/config.js');
    const config = (await loadConfig({ requireFolders: false })) as unknown as Config;

    // Discover PDFs
    let pdfFiles = await discoverPDFs(opts.invoice);

    if (opts.limit > 0 && !opts.invoice) {
        pdfFiles = pdfFiles.slice(0, opts.limit);
        console.log(`Limiting to first ${opts.limit} PDFs`);
    }

    console.log(`\nProcessing: ${pdfFiles.length} PDFs\n`);

    // Process with concurrency
    const limit = pLimit(opts.concurrency);
    const startTime = Date.now();
    let completed = 0;
    const results: PipelineRunResult[] = [];

    const tasks = pdfFiles.map((filename) =>
        limit(async () => {
            const index = ++completed;
            const elapsed = Date.now() - startTime;
            const rate = index / (elapsed / 1000);
            const remaining = (pdfFiles.length - index) / rate;
            const eta = formatDuration(remaining * 1000);

            const pdfPath = path.join(CORPUS_DIR, filename);

            try {
                const { analysis, tokenUsage, duration } = await extractWithRetry(pdfPath, config);

                results.push({
                    filename,
                    success: true,
                    durationMs: duration,
                    tokenUsage,
                    analysis,
                    error: null
                });

                console.log(
                    `  [${String(index).padStart(4)}/${pdfFiles.length}] ${filename.substring(0, 55).padEnd(55)} ${formatDuration(duration).padStart(6)} ${tokenUsage.totalTokens.toString().padStart(6)} tokens  ETA: ${eta}`
                );
            } catch (error) {
                results.push({
                    filename,
                    success: false,
                    durationMs: Date.now() - startTime,
                    tokenUsage: { promptTokens: 0, outputTokens: 0, totalTokens: 0 },
                    analysis: null,
                    error: (error as Error).message
                });

                console.error(
                    `  [${String(index).padStart(4)}/${pdfFiles.length}] ${filename.substring(0, 55).padEnd(55)} ERROR: ${(error as Error).message.substring(0, 60)}`
                );
            }
        })
    );

    await Promise.all(tasks);

    const totalDuration = Date.now() - startTime;
    const successResults = results.filter((r) => r.success);
    const failedResults = results.filter((r) => !r.success);

    // Build run object
    const enabledFields = config.fieldDefinitions.filter((f) => f.enabled).map((f) => f.key);
    const enabledTags = (config.tagDefinitions || []).filter((t) => t.enabled).map((t) => t.id);

    const totalTokenUsage: TokenUsage = {
        promptTokens: results.reduce((sum, r) => sum + r.tokenUsage.promptTokens, 0),
        outputTokens: results.reduce((sum, r) => sum + r.tokenUsage.outputTokens, 0),
        totalTokens: results.reduce((sum, r) => sum + r.tokenUsage.totalTokens, 0)
    };

    const run: PipelineRun = {
        id: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        label: opts.label,
        model: config.model || 'default',
        configSnapshot: {
            fieldCount: enabledFields.length,
            enabledFields,
            enabledTags,
            hasRawPrompt: !!config.rawPrompt
        },
        stats: {
            total: pdfFiles.length,
            success: successResults.length,
            failed: failedResults.length,
            durationMs: totalDuration,
            tokenUsage: totalTokenUsage
        },
        results
    };

    // Append to run log
    await appendRunToLog(run);

    // ---------------------------------------------------------------------------
    // Summary
    // ---------------------------------------------------------------------------

    console.log('\n' + '='.repeat(70));
    console.log('PIPELINE TEST SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total PDFs:      ${pdfFiles.length}`);
    console.log(`Successful:      ${successResults.length}`);
    console.log(`Failed:          ${failedResults.length}`);
    console.log(`Total time:      ${formatDuration(totalDuration)}`);
    console.log(`Avg per invoice: ${formatDuration(Math.round(totalDuration / pdfFiles.length))}`);

    if (successResults.length > 0) {
        console.log(`Total tokens:    ${totalTokenUsage.totalTokens.toLocaleString()}`);
        console.log(
            `Avg tokens:      ${Math.round(totalTokenUsage.totalTokens / successResults.length).toLocaleString()}`
        );
    }

    if (failedResults.length > 0) {
        console.log('\n--- Errors ---');
        for (const r of failedResults) {
            console.log(`  ${r.filename}: ${(r.error || '').substring(0, 100)}`);
        }
    }

    console.log('\n' + '='.repeat(70));
    console.log(`Run log saved to: ${RUN_LOG_PATH}`);
}

main().catch((err: Error) => {
    console.error('Pipeline test failed:', err.message);
    process.exit(1);
});
