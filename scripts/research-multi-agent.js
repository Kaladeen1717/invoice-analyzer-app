#!/usr/bin/env node

/**
 * Multi-Agent Research Harness (INV-56)
 *
 * Tests whether splitting extraction across multiple API calls improves accuracy.
 * Uses the eval-quality scoring functions to measure each strategy.
 *
 * Usage:
 *   node scripts/research-multi-agent.js                     # Run all strategies
 *   node scripts/research-multi-agent.js --strategy baseline  # Run one strategy
 *   node scripts/research-multi-agent.js --dry-run            # Use cached responses
 *   node scripts/research-multi-agent.js --invoice foo.pdf    # Single invoice
 *   node scripts/research-multi-agent.js --concurrency 10     # Parallel invoices (default: 10)
 *   node scripts/research-multi-agent.js --limit 50           # Only first N invoices
 *
 * Strategies:
 *   baseline    — Single API call with all fields + tags (current system)
 *   domainSplit — 3 calls: financial, identity+payment, temporal+classification
 *   fieldsTags  — 2 calls: all fields, then all tags + summary
 *   twoPass     — 2 calls: full extraction, then re-extract "Unknown"/0 fields
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

const CORPUS_DIR = path.join(__dirname, '..', 'tests', 'fixtures', 'eval-corpus');
const RESULTS_DIR = path.join(__dirname, '..', 'tests', 'fixtures', 'eval-results');

// ---------------------------------------------------------------------------
// Strategy definitions — which fields/tags go into each call
// ---------------------------------------------------------------------------

const STRATEGIES = {
    baseline: {
        label: 'Baseline (single call)',
        calls: [{ name: 'full', fieldFilter: null }]
    },

    domainSplit: {
        label: 'Domain Split (3 calls)',
        calls: [
            {
                name: 'financial',
                fieldFilter: {
                    fields: ['totalAmount', 'netAmount', 'vatAmount', 'taxRate', 'currency'],
                    tags: [],
                    includeSummary: false
                }
            },
            {
                name: 'identity_payment',
                fieldFilter: {
                    fields: [
                        'supplierName',
                        'supplierUrl',
                        'invoiceNumber',
                        'vatNumber',
                        'identifierType',
                        'poNumber',
                        'customerReference',
                        'iban',
                        'bicSwift',
                        'bankRegistrationNumber',
                        'bankAccountNumber',
                        'paymentTerms',
                        'paymentMethod'
                    ],
                    tags: [],
                    includeSummary: false
                }
            },
            {
                name: 'temporal_classification',
                fieldFilter: {
                    fields: ['invoiceDate', 'paymentDate'],
                    includeSummary: true
                    // tags: omitted = all enabled tags
                }
            }
        ]
    },

    fieldsTags: {
        label: 'Fields vs Tags (2 calls)',
        calls: [
            {
                name: 'fields',
                fieldFilter: {
                    tags: [],
                    includeSummary: false
                }
            },
            {
                name: 'tags',
                fieldFilter: {
                    fields: [],
                    includeSummary: true
                }
            }
        ]
    },

    twoPass: {
        label: 'Two-Pass Confidence (2 calls)',
        calls: [
            { name: 'pass1', fieldFilter: null },
            { name: 'pass2_reextract', fieldFilter: 'dynamic' }
        ]
    }
};

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs() {
    const args = process.argv.slice(2);
    const opts = { dryRun: false, strategy: null, invoice: null, concurrency: 10, limit: 0 };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--dry-run') opts.dryRun = true;
        else if (args[i] === '--strategy' && args[i + 1]) opts.strategy = args[++i];
        else if (args[i] === '--invoice' && args[i + 1]) opts.invoice = args[++i];
        else if (args[i] === '--concurrency' && args[i + 1]) opts.concurrency = parseInt(args[++i], 10);
        else if (args[i] === '--limit' && args[i + 1]) opts.limit = parseInt(args[++i], 10);
        else if (args[i] === '--help') {
            console.log(
                'Usage: node scripts/research-multi-agent.js [--dry-run] [--strategy <name>] [--invoice <name.pdf>] [--concurrency N] [--limit N]'
            );
            console.log('Strategies:', Object.keys(STRATEGIES).join(', '));
            process.exit(0);
        }
    }
    return opts;
}

// ---------------------------------------------------------------------------
// Corpus discovery
// ---------------------------------------------------------------------------

async function discoverCorpus(invoiceFilter) {
    const files = await fs.readdir(CORPUS_DIR);
    const pdfFiles = files.filter((f) => f.endsWith('.pdf'));

    const corpus = [];
    for (const pdf of pdfFiles) {
        const baseName = pdf.replace(/\.pdf$/, '');
        const truthFile = `${baseName}.truth.json`;

        if (!files.includes(truthFile)) continue;
        if (invoiceFilter && pdf !== invoiceFilter && baseName !== invoiceFilter) continue;

        corpus.push({
            name: baseName,
            pdfPath: path.join(CORPUS_DIR, pdf),
            truthPath: path.join(CORPUS_DIR, truthFile)
        });
    }
    return corpus;
}

// ---------------------------------------------------------------------------
// Single API call with optional fieldFilter + retry logic
// ---------------------------------------------------------------------------

async function callGeminiWithFilter(pdfPath, config, fieldFilter, cacheKey, dryRun, maxRetries = 3) {
    const cachePath = path.join(CORPUS_DIR, `${cacheKey}.cache.json`);

    // Check strategy-specific cache
    try {
        const cached = JSON.parse(await fs.readFile(cachePath, 'utf-8'));
        return {
            analysis: cached.analysis,
            tokenUsage: cached.tokenUsage || {},
            duration: cached.duration || 0,
            fromCache: true
        };
    } catch {
        // No strategy-specific cache
    }

    // For full extraction (baseline), check generate-truth cache as fallback
    if (!fieldFilter) {
        const baseName = path.basename(pdfPath, '.pdf');
        const fallbackPath = path.join(CORPUS_DIR, `${baseName}.cache.json`);
        try {
            const cached = JSON.parse(await fs.readFile(fallbackPath, 'utf-8'));
            // Copy to strategy-specific cache for future runs
            await fs.writeFile(cachePath, JSON.stringify(cached, null, 2));
            return {
                analysis: cached.analysis,
                tokenUsage: cached.tokenUsage || {},
                duration: cached.duration || 0,
                fromCache: true
            };
        } catch {
            // No fallback cache either
        }
    }

    if (dryRun) return null;

    // Real API call with retry
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            if (!fieldFilter) {
                // Full extraction — use analyzeInvoice
                const { analyzeInvoice } = require('../src/processor');
                const startTime = Date.now();
                const result = await analyzeInvoice(pdfPath, config);
                const duration = Date.now() - startTime;
                const { _tokenUsage, ...analysis } = result;
                const tokenUsage = _tokenUsage || { promptTokens: 0, outputTokens: 0, totalTokens: 0 };

                const cacheData = { analysis, tokenUsage, duration, cachedAt: new Date().toISOString() };
                await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2));
                return { analysis, tokenUsage, duration, fromCache: false };
            }

            // Filtered extraction — build prompt and call API directly
            const { buildExtractionPrompt, parseGeminiResponse } = require('../src/prompt-builder');
            const { DEFAULT_MODEL } = require('../src/constants');
            const { GoogleGenerativeAI } = require('@google/generative-ai');

            const startTime = Date.now();
            const prompt = buildExtractionPrompt(config, { fieldFilter });
            const pdfBuffer = await fs.readFile(pdfPath);
            const pdfBase64 = pdfBuffer.toString('base64');
            const modelName = config.model || DEFAULT_MODEL;
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: modelName });

            const result = await model.generateContent([
                { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
                { text: prompt }
            ]);

            const response = await result.response;
            const text = response.text();
            const usageMetadata = response.usageMetadata || {};
            const tokenUsage = {
                promptTokens: usageMetadata.promptTokenCount || 0,
                outputTokens: usageMetadata.candidatesTokenCount || 0,
                totalTokens: usageMetadata.totalTokenCount || 0
            };
            const duration = Date.now() - startTime;
            const analysis = parseGeminiResponse(text);

            const cacheData = { analysis, tokenUsage, duration, cachedAt: new Date().toISOString() };
            await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2));
            return { analysis, tokenUsage, duration, fromCache: false };
        } catch (error) {
            const isRetryable =
                error.message &&
                (error.message.includes('429') ||
                    error.message.includes('RATE_LIMIT') ||
                    error.message.includes('500') ||
                    error.message.includes('503'));

            if (isRetryable && attempt < maxRetries) {
                const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
                await new Promise((resolve) => setTimeout(resolve, delay));
                continue;
            }
            throw error;
        }
    }
}

// ---------------------------------------------------------------------------
// Merge results from multiple calls into a single analysis object
// ---------------------------------------------------------------------------

function mergeAnalyses(results) {
    const merged = {};
    for (const result of results) {
        if (!result || !result.analysis) continue;
        for (const [key, value] of Object.entries(result.analysis)) {
            if (key === 'tags') {
                merged.tags = { ...(merged.tags || {}), ...value };
            } else if (key === '_tokenUsage') {
                continue;
            } else {
                // Later calls can override earlier ones (for two-pass)
                merged[key] = value;
            }
        }
    }
    return merged;
}

function sumTokenUsage(results) {
    return results.reduce(
        (acc, r) => {
            if (!r || !r.tokenUsage) return acc;
            return {
                promptTokens: acc.promptTokens + (r.tokenUsage.promptTokens || 0),
                outputTokens: acc.outputTokens + (r.tokenUsage.outputTokens || 0),
                totalTokens: acc.totalTokens + (r.tokenUsage.totalTokens || 0)
            };
        },
        { promptTokens: 0, outputTokens: 0, totalTokens: 0 }
    );
}

function sumDuration(results) {
    return results.reduce((sum, r) => sum + (r ? r.duration || 0 : 0), 0);
}

// ---------------------------------------------------------------------------
// Build dynamic fieldFilter for two-pass strategy
// ---------------------------------------------------------------------------

function buildReextractFilter(pass1Analysis, config) {
    const fieldsToRetry = [];
    const enabledFields = config.fieldDefinitions.filter((f) => f.enabled);

    for (const field of enabledFields) {
        const value = pass1Analysis[field.key];
        if (field.type === 'text' && value === 'Unknown') fieldsToRetry.push(field.key);
        else if (field.type === 'number' && value === 0) fieldsToRetry.push(field.key);
        else if (field.type === 'date' && value === 'Unknown') fieldsToRetry.push(field.key);
    }

    if (fieldsToRetry.length === 0) return null;

    return { fields: fieldsToRetry, tags: [], includeSummary: false };
}

// ---------------------------------------------------------------------------
// Execute a strategy for one invoice
// ---------------------------------------------------------------------------

async function executeStrategy(strategyName, entry, config, dryRun) {
    const strategy = STRATEGIES[strategyName];
    const callResults = [];

    for (const call of strategy.calls) {
        const cacheKey = `${entry.name}.${strategyName}.${call.name}`;

        if (call.fieldFilter === 'dynamic') {
            // Two-pass: build filter from pass1 results
            const pass1 = callResults[0];
            if (!pass1) {
                callResults.push(null);
                continue;
            }
            const dynamicFilter = buildReextractFilter(pass1.analysis, config);
            if (!dynamicFilter) {
                callResults.push(null); // No fields to retry
                continue;
            }
            const result = await callGeminiWithFilter(entry.pdfPath, config, dynamicFilter, cacheKey, dryRun);
            callResults.push(result);
        } else {
            const result = await callGeminiWithFilter(entry.pdfPath, config, call.fieldFilter, cacheKey, dryRun);
            callResults.push(result);
        }
    }

    // Check if any call failed
    const validResults = callResults.filter(Boolean);
    if (validResults.length === 0) return null;

    const mergedAnalysis = mergeAnalyses(validResults);
    const totalTokenUsage = sumTokenUsage(validResults);
    const totalDuration = sumDuration(validResults);

    return {
        analysis: mergedAnalysis,
        tokenUsage: totalTokenUsage,
        duration: totalDuration,
        callCount: strategy.calls.length,
        callResults: callResults.map((r, i) => ({
            name: strategy.calls[i].name,
            tokenUsage: r ? r.tokenUsage : null,
            duration: r ? r.duration : 0,
            fromCache: r ? r.fromCache : false,
            skipped: !r
        }))
    };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function scoreTextField(extracted, expected) {
    if (expected === 'Unknown' || expected === undefined || expected === null) return { match: 'skip' };
    if (extracted === expected) return { match: 'exact', score: 1.0 };
    if (typeof extracted === 'string' && typeof expected === 'string') {
        if (extracted.toLowerCase() === expected.toLowerCase()) return { match: 'case_insensitive', score: 0.9 };
        if (
            extracted.toLowerCase().includes(expected.toLowerCase()) ||
            expected.toLowerCase().includes(extracted.toLowerCase())
        )
            return { match: 'contains', score: 0.7 };
    }
    if (extracted === 'Unknown') return { match: 'missing', score: 0.0 };
    return { match: 'wrong', score: 0.0 };
}

function scoreNumberField(extracted, expected) {
    if (expected === 0 || expected === undefined || expected === null) return { match: 'skip' };
    const ext = typeof extracted === 'number' ? extracted : parseFloat(extracted);
    const exp = typeof expected === 'number' ? expected : parseFloat(expected);
    if (isNaN(ext) || isNaN(exp)) return { match: 'wrong', score: 0.0 };
    if (ext === exp) return { match: 'exact', score: 1.0 };
    if (Math.abs(ext - exp) <= 0.01) return { match: 'tolerance', score: 0.95 };
    return { match: 'wrong', score: 0.0 };
}

function evaluateResult(analysis, truth, config) {
    const fieldScores = {};
    const tagScores = {};
    const enabledFields = config.fieldDefinitions.filter((f) => f.enabled);

    for (const field of enabledFields) {
        if (truth[field.key] === undefined) continue;
        let score;
        if (field.type === 'number') score = scoreNumberField(analysis[field.key], truth[field.key]);
        else if (field.type === 'boolean') {
            if (truth[field.key] === undefined || truth[field.key] === null) {
                score = { match: 'skip' };
            } else
                score =
                    analysis[field.key] === truth[field.key]
                        ? { match: 'exact', score: 1.0 }
                        : { match: 'wrong', score: 0.0 };
        } else score = scoreTextField(analysis[field.key], truth[field.key]);
        fieldScores[field.key] = score;
    }

    if (truth.tags && analysis.tags) {
        const enabledTags = (config.tagDefinitions || []).filter((t) => t.enabled);
        for (const tag of enabledTags) {
            if (truth.tags[tag.id] === undefined) continue;
            tagScores[tag.id] =
                analysis.tags[tag.id] === truth.tags[tag.id]
                    ? { match: 'exact', score: 1.0 }
                    : { match: 'wrong', score: 0.0 };
        }
    }

    const allScores = [...Object.values(fieldScores), ...Object.values(tagScores)].filter((s) => s.match !== 'skip');
    const total = allScores.reduce((sum, s) => sum + s.score, 0);
    const accuracy = allScores.length > 0 ? total / allScores.length : 0;
    const hallucinations = allScores.filter((s) => s.match === 'wrong').length;

    return {
        accuracy: Math.round(accuracy * 1000) / 1000,
        scoredFields: allScores.length,
        hallucinations,
        hallucinationRate: allScores.length > 0 ? Math.round((hallucinations / allScores.length) * 1000) / 1000 : 0,
        fieldScores,
        tagScores
    };
}

// ---------------------------------------------------------------------------
// Per-field accuracy aggregation
// ---------------------------------------------------------------------------

function aggregatePerField(invoiceResults) {
    const fieldAcc = {};
    const tagAcc = {};

    for (const result of invoiceResults) {
        for (const [key, score] of Object.entries(result.evaluation.fieldScores)) {
            if (score.match === 'skip') continue;
            if (!fieldAcc[key]) fieldAcc[key] = { total: 0, correct: 0, wrong: 0, missing: 0 };
            fieldAcc[key].total++;
            if (score.score >= 0.9) fieldAcc[key].correct++;
            else if (score.match === 'missing') fieldAcc[key].missing++;
            else fieldAcc[key].wrong++;
        }
        for (const [key, score] of Object.entries(result.evaluation.tagScores)) {
            if (score.match === 'skip') continue;
            if (!tagAcc[key]) tagAcc[key] = { total: 0, correct: 0, wrong: 0 };
            tagAcc[key].total++;
            if (score.score >= 0.9) tagAcc[key].correct++;
            else tagAcc[key].wrong++;
        }
    }

    // Compute accuracy percentages
    for (const data of Object.values(fieldAcc)) {
        data.accuracy = data.total > 0 ? Math.round((data.correct / data.total) * 1000) / 1000 : 0;
    }
    for (const data of Object.values(tagAcc)) {
        data.accuracy = data.total > 0 ? Math.round((data.correct / data.total) * 1000) / 1000 : 0;
    }

    return { fieldAcc, tagAcc };
}

// ---------------------------------------------------------------------------
// Display helpers
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

    console.log('Multi-Agent Research Harness (INV-56)');
    console.log(`Mode: ${opts.dryRun ? 'dry-run (cached)' : 'live (Gemini API)'}`);
    console.log(`Concurrency: ${opts.concurrency}\n`);

    const { loadConfig } = require('../src/config');
    const config = await loadConfig({ requireFolders: false });

    let corpus = await discoverCorpus(opts.invoice);
    if (corpus.length === 0) {
        console.error('No evaluation invoices found. Run generate-truth.js first to set up corpus.');
        process.exit(1);
    }

    if (opts.limit > 0) {
        corpus = corpus.slice(0, opts.limit);
        console.log(`Limiting to first ${opts.limit} invoices`);
    }

    console.log(`Corpus: ${corpus.length} invoices with ground truth`);

    const strategiesToRun = opts.strategy ? [opts.strategy] : Object.keys(STRATEGIES);
    const allResults = {};

    // Dynamic import for p-limit (ESM module)
    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(opts.concurrency);

    for (const strategyName of strategiesToRun) {
        if (!STRATEGIES[strategyName]) {
            console.error(`Unknown strategy: ${strategyName}`);
            console.error('Available:', Object.keys(STRATEGIES).join(', '));
            process.exit(1);
        }

        const strategy = STRATEGIES[strategyName];
        console.log(`\n${'─'.repeat(70)}`);
        console.log(`Strategy: ${strategy.label}`);
        console.log('─'.repeat(70));

        const invoiceResults = [];
        const startTime = Date.now();
        let completed = 0;
        let errors = 0;

        const tasks = corpus.map((entry) =>
            limit(async () => {
                const index = ++completed;
                try {
                    const truth = JSON.parse(await fs.readFile(entry.truthPath, 'utf-8'));
                    const result = await executeStrategy(strategyName, entry, config, opts.dryRun);

                    if (!result) {
                        console.log(
                            `  [${String(index).padStart(4)}/${corpus.length}] ${entry.name.substring(0, 50).padEnd(50)} skipped`
                        );
                        return;
                    }

                    const evaluation = evaluateResult(result.analysis, truth, config);
                    invoiceResults.push({
                        name: entry.name,
                        evaluation,
                        tokenUsage: result.tokenUsage,
                        duration: result.duration,
                        callCount: result.callCount,
                        callResults: result.callResults
                    });

                    const elapsed = Date.now() - startTime;
                    const rate = index / (elapsed / 1000);
                    const remaining = (corpus.length - index) / rate;
                    const eta = formatDuration(remaining * 1000);

                    const cacheLabel = result.callResults.every((c) => c.fromCache || c.skipped)
                        ? 'cached'
                        : `${formatDuration(result.duration)}`;

                    console.log(
                        `  [${String(index).padStart(4)}/${corpus.length}] ${entry.name.substring(0, 50).padEnd(50)} ${(evaluation.accuracy * 100).toFixed(0).padStart(4)}%  ${String(result.tokenUsage.totalTokens).padStart(6)} tok  ${cacheLabel.padStart(7)}  ETA: ${eta}`
                    );
                } catch (error) {
                    errors++;
                    console.error(
                        `  [${String(index).padStart(4)}/${corpus.length}] ${entry.name.substring(0, 50).padEnd(50)} ERROR: ${error.message.substring(0, 50)}`
                    );
                }
            })
        );

        await Promise.all(tasks);

        if (invoiceResults.length === 0) continue;

        const totalElapsed = Date.now() - startTime;

        // Aggregate
        const avgAccuracy = invoiceResults.reduce((s, r) => s + r.evaluation.accuracy, 0) / invoiceResults.length;
        const totalTokens = invoiceResults.reduce((s, r) => s + r.tokenUsage.totalTokens, 0);
        const totalDuration = invoiceResults.reduce((s, r) => s + r.duration, 0);
        const totalHallucinations = invoiceResults.reduce((s, r) => s + r.evaluation.hallucinations, 0);
        const { fieldAcc, tagAcc } = aggregatePerField(invoiceResults);

        allResults[strategyName] = {
            label: strategy.label,
            accuracy: Math.round(avgAccuracy * 1000) / 1000,
            totalTokens,
            avgTokensPerInvoice: Math.round(totalTokens / invoiceResults.length),
            totalDuration,
            avgDurationPerInvoice: Math.round(totalDuration / invoiceResults.length),
            wallTime: totalElapsed,
            hallucinations: totalHallucinations,
            errors,
            invoiceCount: invoiceResults.length,
            fieldAccuracy: fieldAcc,
            tagAccuracy: tagAcc,
            invoices: invoiceResults
        };

        console.log(
            `\n  → ${invoiceResults.length} invoices | ${(avgAccuracy * 100).toFixed(1)}% accuracy | ${Math.round(totalTokens / invoiceResults.length)} tokens/invoice | ${errors} errors | ${formatDuration(totalElapsed)} wall time`
        );
    }

    // -----------------------------------------------------------------------
    // Comparison table
    // -----------------------------------------------------------------------

    if (Object.keys(allResults).length > 1) {
        console.log(`\n${'═'.repeat(80)}`);
        console.log('COMPARISON SUMMARY');
        console.log('═'.repeat(80));

        const baseline = allResults.baseline;

        // Overall accuracy table
        console.log(
            `\n  ${'Strategy'.padEnd(30)} ${'Accuracy'.padStart(10)} ${'Δ Acc'.padStart(8)} ${'Tok/inv'.padStart(10)} ${'Halluc'.padStart(8)} ${'Errors'.padStart(8)} ${'Wall'.padStart(8)}`
        );
        console.log(
            `  ${'-'.repeat(30)} ${'-'.repeat(10)} ${'-'.repeat(8)} ${'-'.repeat(10)} ${'-'.repeat(8)} ${'-'.repeat(8)} ${'-'.repeat(8)}`
        );

        for (const [, data] of Object.entries(allResults)) {
            const accStr = `${(data.accuracy * 100).toFixed(1)}%`;
            const tokStr = `${data.avgTokensPerInvoice}`;
            const delta = baseline ? `${((data.accuracy - baseline.accuracy) * 100).toFixed(1)}%` : 'N/A';
            const hallStr = `${data.hallucinations}`;
            const errStr = `${data.errors}`;
            const wallStr = formatDuration(data.wallTime);
            console.log(
                `  ${data.label.padEnd(30)} ${accStr.padStart(10)} ${delta.padStart(8)} ${tokStr.padStart(10)} ${hallStr.padStart(8)} ${errStr.padStart(8)} ${wallStr.padStart(8)}`
            );
        }

        // Per-field accuracy comparison
        if (baseline) {
            console.log('\n--- Per-Field Accuracy (Δ vs Baseline) ---');
            const allFieldKeys = Object.keys(baseline.fieldAccuracy);
            console.log(
                `  ${'Field'.padEnd(25)} ${'Baseline'.padStart(10)} ${Object.values(allResults)
                    .filter((d) => d.label !== baseline.label)
                    .map((d) => d.label.substring(0, 12).padStart(14))
                    .join('')}`
            );
            console.log(
                `  ${'-'.repeat(25)} ${'-'.repeat(10)} ${Object.values(allResults)
                    .filter((d) => d.label !== baseline.label)
                    .map(() => '-'.repeat(14))
                    .join('')}`
            );

            for (const key of allFieldKeys) {
                const baseAcc = baseline.fieldAccuracy[key]
                    ? (baseline.fieldAccuracy[key].accuracy * 100).toFixed(1) + '%'
                    : 'N/A';
                const others = Object.entries(allResults)
                    .filter(([name]) => name !== 'baseline')
                    .map(([, data]) => {
                        if (!data.fieldAccuracy[key]) return 'N/A'.padStart(14);
                        const acc = data.fieldAccuracy[key].accuracy * 100;
                        const baseVal = baseline.fieldAccuracy[key] ? baseline.fieldAccuracy[key].accuracy * 100 : 0;
                        const delta = acc - baseVal;
                        const sign = delta >= 0 ? '+' : '';
                        return `${acc.toFixed(1)}% ${sign}${delta.toFixed(1)}`.padStart(14);
                    })
                    .join('');
                console.log(`  ${key.padEnd(25)} ${baseAcc.padStart(10)} ${others}`);
            }

            // Per-tag accuracy comparison
            const allTagKeys = Object.keys(baseline.tagAccuracy);
            if (allTagKeys.length > 0) {
                console.log('\n--- Per-Tag Accuracy (Δ vs Baseline) ---');
                console.log(
                    `  ${'Tag'.padEnd(25)} ${'Baseline'.padStart(10)} ${Object.values(allResults)
                        .filter((d) => d.label !== baseline.label)
                        .map((d) => d.label.substring(0, 12).padStart(14))
                        .join('')}`
                );
                console.log(
                    `  ${'-'.repeat(25)} ${'-'.repeat(10)} ${Object.values(allResults)
                        .filter((d) => d.label !== baseline.label)
                        .map(() => '-'.repeat(14))
                        .join('')}`
                );

                for (const key of allTagKeys) {
                    const baseAcc = baseline.tagAccuracy[key]
                        ? (baseline.tagAccuracy[key].accuracy * 100).toFixed(1) + '%'
                        : 'N/A';
                    const others = Object.entries(allResults)
                        .filter(([name]) => name !== 'baseline')
                        .map(([, data]) => {
                            if (!data.tagAccuracy[key]) return 'N/A'.padStart(14);
                            const acc = data.tagAccuracy[key].accuracy * 100;
                            const baseVal = baseline.tagAccuracy[key] ? baseline.tagAccuracy[key].accuracy * 100 : 0;
                            const delta = acc - baseVal;
                            const sign = delta >= 0 ? '+' : '';
                            return `${acc.toFixed(1)}% ${sign}${delta.toFixed(1)}`.padStart(14);
                        })
                        .join('');
                    console.log(`  ${key.padEnd(25)} ${baseAcc.padStart(10)} ${others}`);
                }
            }
        }

        // Decision framework
        if (baseline) {
            console.log('\n--- Decision Framework ---');
            for (const [name, data] of Object.entries(allResults)) {
                if (name === 'baseline') continue;
                const gain = (data.accuracy - baseline.accuracy) * 100;
                const costMult = (data.avgTokensPerInvoice / baseline.avgTokensPerInvoice).toFixed(1);
                let recommendation;
                if (gain < 5) recommendation = 'REJECT — accuracy gain <5%, not worth cost/complexity';
                else if (gain < 15) recommendation = 'DEFER — accuracy gain 5-15%, expand corpus for more data';
                else recommendation = 'ADOPT — accuracy gain >15%, create implementation ticket';
                console.log(
                    `  ${data.label}: ${gain >= 0 ? '+' : ''}${gain.toFixed(1)}% accuracy, ${costMult}x tokens → ${recommendation}`
                );
            }
        }

        console.log('\n' + '═'.repeat(80));
    }

    // Save results (strip per-invoice details for smaller file, keep aggregates)
    await fs.mkdir(RESULTS_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultPath = path.join(RESULTS_DIR, `research-${timestamp}.json`);
    await fs.writeFile(
        resultPath,
        JSON.stringify(
            {
                timestamp: new Date().toISOString(),
                model: config.model,
                dryRun: opts.dryRun,
                corpusSize: corpus.length,
                strategies: allResults
            },
            null,
            2
        )
    );
    console.log(`\nResults saved to: ${resultPath}`);
}

main().catch((err) => {
    console.error('Research failed:', err.message);
    process.exit(1);
});
