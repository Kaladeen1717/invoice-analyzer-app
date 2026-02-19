#!/usr/bin/env node

/**
 * Generate Draft Ground Truth Files (INV-55)
 *
 * Runs baseline extraction on all PDFs in the eval corpus and saves
 * results as .truth.json files for human review. Also caches raw API
 * responses for future --dry-run usage in eval scripts.
 *
 * Features:
 *   - Concurrent API calls via p-limit (default: 10)
 *   - Resumable: skips PDFs that already have .truth.json (use --force to overwrite)
 *   - Rate-limit retry: backs off on 429 errors
 *   - Progress counter with ETA
 *   - Summary statistics at the end
 *
 * Usage:
 *   node scripts/generate-truth.js                  # Process all PDFs without truth
 *   node scripts/generate-truth.js --force           # Overwrite existing truth files
 *   node scripts/generate-truth.js --concurrency 10  # Parallel API calls (default: 10)
 *   node scripts/generate-truth.js --limit 50        # Only process first N PDFs
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

const CORPUS_DIR = path.join(__dirname, '..', 'tests', 'fixtures', 'eval-corpus');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs() {
    const args = process.argv.slice(2);
    const opts = { force: false, concurrency: 10, limit: 0 };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--force') opts.force = true;
        else if (args[i] === '--concurrency' && args[i + 1]) opts.concurrency = parseInt(args[++i], 10);
        else if (args[i] === '--limit' && args[i + 1]) opts.limit = parseInt(args[++i], 10);
        else if (args[i] === '--help') {
            console.log('Usage: node scripts/generate-truth.js [--force] [--concurrency N] [--limit N]');
            process.exit(0);
        }
    }
    return opts;
}

// ---------------------------------------------------------------------------
// Discover PDFs
// ---------------------------------------------------------------------------

async function discoverPDFs(force) {
    const files = await fs.readdir(CORPUS_DIR);
    const pdfFiles = files.filter((f) => f.endsWith('.pdf'));

    const toProcess = [];
    const skipped = [];

    for (const pdf of pdfFiles) {
        const baseName = pdf.replace(/\.pdf$/, '');
        const truthPath = path.join(CORPUS_DIR, `${baseName}.truth.json`);

        if (!force) {
            try {
                await fs.access(truthPath);
                skipped.push(baseName);
                continue;
            } catch {
                // Truth file doesn't exist — needs processing
            }
        }

        toProcess.push({
            name: baseName,
            pdfPath: path.join(CORPUS_DIR, pdf),
            truthPath,
            cachePath: path.join(CORPUS_DIR, `${baseName}.cache.json`)
        });
    }

    return { toProcess, skipped, totalPDFs: pdfFiles.length };
}

// ---------------------------------------------------------------------------
// Extract a single invoice with retry
// ---------------------------------------------------------------------------

async function extractWithRetry(entry, config, maxRetries = 3) {
    const { analyzeInvoice } = require('../src/processor');

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const startTime = Date.now();
            const result = await analyzeInvoice(entry.pdfPath, config);
            const duration = Date.now() - startTime;

            const { _tokenUsage, ...analysis } = result;
            const tokenUsage = _tokenUsage || { promptTokens: 0, outputTokens: 0, totalTokens: 0 };

            return { analysis, tokenUsage, duration };
        } catch (error) {
            const isRateLimit =
                error.message && (error.message.includes('429') || error.message.includes('RATE_LIMIT'));
            const isServerError = error.message && (error.message.includes('500') || error.message.includes('503'));

            if ((isRateLimit || isServerError) && attempt < maxRetries) {
                const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
                process.stdout.write(` [retry ${attempt}/${maxRetries} in ${delay / 1000}s]`);
                await new Promise((resolve) => setTimeout(resolve, delay));
                continue;
            }

            throw error;
        }
    }
}

// ---------------------------------------------------------------------------
// Progress display
// ---------------------------------------------------------------------------

function formatDuration(ms) {
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

async function main() {
    const opts = parseArgs();

    console.log('Generate Draft Ground Truth Files (INV-55)');
    console.log(`Concurrency: ${opts.concurrency} | Force: ${opts.force}`);

    // Verify API key
    if (!process.env.GEMINI_API_KEY) {
        console.error('\nError: GEMINI_API_KEY not set in .env');
        process.exit(1);
    }

    // Load config
    const { loadConfig } = require('../src/config');
    const config = await loadConfig({ requireFolders: false });

    // Discover PDFs
    const { toProcess, skipped, totalPDFs } = await discoverPDFs(opts.force);

    console.log(`\nCorpus: ${totalPDFs} PDFs total`);
    if (skipped.length > 0) {
        console.log(`Skipping: ${skipped.length} already have .truth.json (use --force to overwrite)`);
    }

    let queue = toProcess;
    if (opts.limit > 0) {
        queue = queue.slice(0, opts.limit);
        console.log(`Limiting to first ${opts.limit} PDFs`);
    }

    if (queue.length === 0) {
        console.log('\nNothing to process. All PDFs already have truth files.');
        process.exit(0);
    }

    console.log(`Processing: ${queue.length} PDFs\n`);

    // Process with concurrency
    // Dynamic import for p-limit (ESM module)
    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(opts.concurrency);
    const startTime = Date.now();
    let completed = 0;
    let errors = 0;
    const errorList = [];
    const results = [];

    const tasks = queue.map((entry) =>
        limit(async () => {
            const index = ++completed;
            const elapsed = Date.now() - startTime;
            const rate = index / (elapsed / 1000);
            const remaining = (queue.length - index) / rate;
            const eta = formatDuration(remaining * 1000);

            try {
                const { analysis, tokenUsage, duration } = await extractWithRetry(entry, config);

                // Save .truth.json (just the field values + tags, no metadata)
                await fs.writeFile(entry.truthPath, JSON.stringify(analysis, null, 2));

                // Save .cache.json (full response with metadata for eval scripts)
                const cacheData = {
                    analysis,
                    tokenUsage,
                    duration,
                    cachedAt: new Date().toISOString()
                };
                await fs.writeFile(entry.cachePath, JSON.stringify(cacheData, null, 2));

                results.push({ name: entry.name, analysis, tokenUsage, duration });

                console.log(
                    `  [${String(index).padStart(4)}/${queue.length}] ${entry.name.substring(0, 55).padEnd(55)} ${formatDuration(duration).padStart(6)} ${tokenUsage.totalTokens.toString().padStart(6)} tokens  ETA: ${eta}`
                );
            } catch (error) {
                errors++;
                errorList.push({ name: entry.name, error: error.message });
                console.error(
                    `  [${String(index).padStart(4)}/${queue.length}] ${entry.name.substring(0, 55).padEnd(55)} ERROR: ${error.message.substring(0, 60)}`
                );
            }
        })
    );

    await Promise.all(tasks);

    const totalDuration = Date.now() - startTime;

    // ---------------------------------------------------------------------------
    // Summary
    // ---------------------------------------------------------------------------

    console.log('\n' + '='.repeat(70));
    console.log('EXTRACTION SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total PDFs:     ${queue.length}`);
    console.log(`Successful:     ${results.length}`);
    console.log(`Errors:         ${errors}`);
    console.log(`Total time:     ${formatDuration(totalDuration)}`);
    console.log(`Avg per invoice: ${formatDuration(Math.round(totalDuration / queue.length))}`);

    if (results.length > 0) {
        const totalTokens = results.reduce((sum, r) => sum + r.tokenUsage.totalTokens, 0);
        console.log(`Total tokens:   ${totalTokens.toLocaleString()}`);
        console.log(`Avg tokens:     ${Math.round(totalTokens / results.length).toLocaleString()}`);

        // Per-field "Unknown" / 0 rates
        console.log('\n--- Field Coverage ---');
        const enabledFields = config.fieldDefinitions.filter((f) => f.enabled);
        for (const field of enabledFields) {
            let unknownCount = 0;
            for (const r of results) {
                const val = r.analysis[field.key];
                if (field.type === 'number' && val === 0) unknownCount++;
                else if (field.type === 'text' && val === 'Unknown') unknownCount++;
                else if (field.type === 'date' && val === 'Unknown') unknownCount++;
            }
            const coverage = ((1 - unknownCount / results.length) * 100).toFixed(1);
            const bar = '█'.repeat(Math.round(coverage / 5)).padEnd(20, '░');
            console.log(`  ${field.key.padEnd(25)} ${bar} ${coverage.padStart(5)}%  (${unknownCount} unknown)`);
        }

        // Per-tag distribution
        const enabledTags = (config.tagDefinitions || []).filter((t) => t.enabled);
        if (enabledTags.length > 0) {
            console.log('\n--- Tag Distribution ---');
            for (const tag of enabledTags) {
                let trueCount = 0;
                for (const r of results) {
                    if (r.analysis.tags && r.analysis.tags[tag.id] === true) trueCount++;
                }
                const pct = ((trueCount / results.length) * 100).toFixed(1);
                console.log(`  ${tag.id.padEnd(25)} ${String(trueCount).padStart(5)} true  (${pct}%)`);
            }
        }
    }

    if (errorList.length > 0) {
        console.log('\n--- Errors ---');
        for (const { name, error } of errorList) {
            console.log(`  ${name}: ${error.substring(0, 100)}`);
        }
    }

    console.log('\n' + '='.repeat(70));

    // Save summary
    const summaryPath = path.join(CORPUS_DIR, '_extraction-summary.json');
    const summary = {
        timestamp: new Date().toISOString(),
        model: config.model,
        totalPDFs: queue.length,
        successful: results.length,
        errors,
        totalDuration,
        errorList: errorList.length > 0 ? errorList : undefined
    };
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`Summary saved to: ${summaryPath}`);
}

main().catch((err) => {
    console.error('Generation failed:', err.message);
    process.exit(1);
});
