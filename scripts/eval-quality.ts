#!/usr/bin/env node

/**
 * Extraction Quality Evaluation Script (MVE — Minimal Viable Evaluation)
 *
 * Evaluates invoice extraction accuracy against ground truth annotations.
 * Calls the real Gemini API (or uses cached responses in --dry-run mode).
 *
 * Usage:
 *   npx tsx scripts/eval-quality.ts                  # Run full evaluation
 *   npx tsx scripts/eval-quality.ts --dry-run        # Use cached API responses
 *   npx tsx scripts/eval-quality.ts --invoice foo.pdf # Evaluate a single invoice
 *   npx tsx scripts/eval-quality.ts --verbose         # Show per-field details
 *
 * Ground truth files: tests/fixtures/eval-corpus/<name>.truth.json
 * Invoice PDFs:       tests/fixtures/eval-corpus/<name>.pdf
 * Cached responses:   tests/fixtures/eval-corpus/<name>.cache.json
 * Results output:     tests/fixtures/eval-results/<timestamp>.json
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AppConfig } from '../src/types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CORPUS_DIR = path.join(__dirname, '..', 'tests', 'fixtures', 'eval-corpus');
const RESULTS_DIR = path.join(__dirname, '..', 'tests', 'fixtures', 'eval-results');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedArgs {
    dryRun: boolean;
    verbose: boolean;
    invoice: string | null;
}

interface CorpusEntry {
    name: string;
    pdfPath: string;
    truthPath: string;
    cachePath: string;
}

interface TokenUsage {
    promptTokens: number;
    outputTokens: number;
    totalTokens: number;
}

interface ExtractionResult {
    analysis: Record<string, unknown>;
    tokenUsage: TokenUsage;
    duration?: number;
    fromCache: boolean;
}

interface ScoreResult {
    match: string;
    score?: number;
    reason?: string;
}

interface EvaluationResult {
    fields: Record<string, ScoreResult>;
    tags: Record<string, ScoreResult>;
    accuracy: number;
    scoredFields: number;
    hallucinations: number;
    hallucinationRate: number;
}

interface InvoiceResult {
    name: string;
    extraction: {
        analysis: Record<string, unknown>;
        tokenUsage: TokenUsage;
        duration?: number;
        fromCache: boolean;
    };
    truth: Record<string, unknown>;
    evaluation: EvaluationResult;
}

interface FieldAccuracyData {
    scores: number[];
    total: number;
    correct: number;
    wrong: number;
    missing: number;
    accuracy?: number;
}

interface TagAccuracyData {
    scores: number[];
    total: number;
    correct: number;
    wrong: number;
    accuracy?: number;
}

interface AggregateResult {
    overallAccuracy: number;
    invoiceCount: number;
    totalScoredFields: number;
    totalHallucinations: number;
    hallucinationRate: number;
    fieldAccuracy: Record<string, FieldAccuracyData>;
    tagAccuracy: Record<string, TagAccuracyData>;
}

interface FieldDefinition {
    key: string;
    type: string;
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
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(): ParsedArgs {
    const args = process.argv.slice(2);
    const opts: ParsedArgs = { dryRun: false, verbose: false, invoice: null };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--dry-run') opts.dryRun = true;
        else if (args[i] === '--verbose') opts.verbose = true;
        else if (args[i] === '--invoice' && args[i + 1]) opts.invoice = args[++i];
        else if (args[i] === '--help') {
            console.log('Usage: npx tsx scripts/eval-quality.ts [--dry-run] [--verbose] [--invoice <name.pdf>]');
            process.exit(0);
        }
    }
    return opts;
}

// ---------------------------------------------------------------------------
// Corpus discovery
// ---------------------------------------------------------------------------

async function discoverCorpus(invoiceFilter: string | null): Promise<CorpusEntry[]> {
    const files = await fs.readdir(CORPUS_DIR);
    const pdfFiles = files.filter((f) => f.endsWith('.pdf'));

    const corpus: CorpusEntry[] = [];
    for (const pdf of pdfFiles) {
        const baseName = pdf.replace(/\.pdf$/, '');
        const truthFile = `${baseName}.truth.json`;

        if (!files.includes(truthFile)) {
            console.warn(`  Warning: No ground truth for ${pdf} — skipping`);
            continue;
        }

        if (invoiceFilter && pdf !== invoiceFilter && baseName !== invoiceFilter) {
            continue;
        }

        corpus.push({
            name: baseName,
            pdfPath: path.join(CORPUS_DIR, pdf),
            truthPath: path.join(CORPUS_DIR, truthFile),
            cachePath: path.join(CORPUS_DIR, `${baseName}.cache.json`)
        });
    }

    return corpus;
}

// ---------------------------------------------------------------------------
// Extraction (real API or cached)
// ---------------------------------------------------------------------------

async function extractInvoice(entry: CorpusEntry, config: Config, dryRun: boolean): Promise<ExtractionResult | null> {
    if (dryRun) {
        try {
            const cached = JSON.parse(await fs.readFile(entry.cachePath, 'utf-8')) as {
                analysis: Record<string, unknown>;
                tokenUsage?: TokenUsage;
            };
            return { analysis: cached.analysis, tokenUsage: cached.tokenUsage || ({} as TokenUsage), fromCache: true };
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                console.error(`  No cache for ${entry.name} — skipping (run without --dry-run first)`);
                return null;
            }
            throw err;
        }
    }

    // Real API call
    const { analyzeInvoice } = await import('../src/processor.js');
    const startTime = Date.now();
    const result = await analyzeInvoice(entry.pdfPath, config as unknown as AppConfig);
    const duration = Date.now() - startTime;

    // Separate token usage from analysis
    const { _tokenUsage, ...analysis } = result as Record<string, unknown>;
    const tokenUsage = (_tokenUsage as TokenUsage) || { promptTokens: 0, outputTokens: 0, totalTokens: 0 };

    // Cache the response for future --dry-run
    const cacheData = { analysis, tokenUsage, duration, cachedAt: new Date().toISOString() };
    await fs.writeFile(entry.cachePath, JSON.stringify(cacheData, null, 2));

    return { analysis, tokenUsage, duration, fromCache: false };
}

// ---------------------------------------------------------------------------
// Scoring functions
// ---------------------------------------------------------------------------

function scoreTextField(extracted: unknown, expected: unknown): ScoreResult {
    if (expected === 'Unknown' || expected === undefined || expected === null) {
        return { match: 'skip', reason: 'no ground truth' };
    }
    if (extracted === expected) {
        return { match: 'exact', score: 1.0 };
    }
    if (typeof extracted === 'string' && typeof expected === 'string') {
        if (extracted.toLowerCase() === expected.toLowerCase()) {
            return { match: 'case_insensitive', score: 0.9 };
        }
        if (
            extracted.toLowerCase().includes(expected.toLowerCase()) ||
            expected.toLowerCase().includes(extracted.toLowerCase())
        ) {
            return { match: 'contains', score: 0.7 };
        }
    }
    if (extracted === 'Unknown') {
        return { match: 'missing', score: 0.0, reason: 'returned Unknown' };
    }
    return { match: 'wrong', score: 0.0, reason: `got "${extracted}", expected "${expected}"` };
}

function scoreNumberField(extracted: unknown, expected: unknown): ScoreResult {
    if (expected === 0 || expected === undefined || expected === null) {
        return { match: 'skip', reason: 'no ground truth' };
    }
    const ext = typeof extracted === 'number' ? extracted : parseFloat(extracted as string);
    const exp = typeof expected === 'number' ? expected : parseFloat(expected as string);
    if (isNaN(ext) || isNaN(exp)) {
        return { match: 'wrong', score: 0.0, reason: `parse error` };
    }
    if (ext === exp) {
        return { match: 'exact', score: 1.0 };
    }
    if (Math.abs(ext - exp) <= 0.01) {
        return { match: 'tolerance', score: 0.95, reason: `within \u00b10.01` };
    }
    return { match: 'wrong', score: 0.0, reason: `got ${ext}, expected ${exp}` };
}

function scoreDateField(extracted: unknown, expected: unknown): ScoreResult {
    if (expected === 'Unknown' || expected === undefined || expected === null) {
        return { match: 'skip', reason: 'no ground truth' };
    }
    if (extracted === expected) {
        return { match: 'exact', score: 1.0 };
    }
    if (extracted === 'Unknown') {
        return { match: 'missing', score: 0.0, reason: 'returned Unknown' };
    }
    return { match: 'wrong', score: 0.0, reason: `got "${extracted}", expected "${expected}"` };
}

function scoreBooleanField(extracted: unknown, expected: unknown): ScoreResult {
    if (expected === undefined || expected === null) {
        return { match: 'skip', reason: 'no ground truth' };
    }
    if (extracted === expected) {
        return { match: 'exact', score: 1.0 };
    }
    return { match: 'wrong', score: 0.0, reason: `got ${extracted}, expected ${expected}` };
}

function scoreField(extracted: unknown, expected: unknown, fieldDef: FieldDefinition): ScoreResult {
    switch (fieldDef.type) {
        case 'number':
            return scoreNumberField(extracted, expected);
        case 'date':
            return scoreDateField(extracted, expected);
        case 'boolean':
            return scoreBooleanField(extracted, expected);
        case 'array':
            return { match: 'skip', reason: 'array scoring not implemented' };
        case 'text':
        default:
            return scoreTextField(extracted, expected);
    }
}

function scoreTag(extracted: unknown, expected: unknown): ScoreResult {
    if (expected === undefined || expected === null) {
        return { match: 'skip', reason: 'no ground truth' };
    }
    return scoreBooleanField(extracted, expected);
}

// ---------------------------------------------------------------------------
// Evaluate a single invoice
// ---------------------------------------------------------------------------

function evaluateInvoice(
    analysis: Record<string, unknown>,
    truth: Record<string, unknown>,
    config: Config
): EvaluationResult {
    const fieldResults: Record<string, ScoreResult> = {};
    const enabledFields = config.fieldDefinitions.filter((f) => f.enabled);

    for (const field of enabledFields) {
        if (truth[field.key] !== undefined) {
            fieldResults[field.key] = scoreField(analysis[field.key], truth[field.key], field);
        }
    }

    const tagResults: Record<string, ScoreResult> = {};
    if (truth.tags && analysis.tags) {
        const enabledTags = (config.tagDefinitions || []).filter((t) => t.enabled);
        for (const tag of enabledTags) {
            const truthTags = truth.tags as Record<string, unknown>;
            const analysisTags = analysis.tags as Record<string, unknown>;
            if (truthTags[tag.id] !== undefined) {
                tagResults[tag.id] = scoreTag(analysisTags[tag.id], truthTags[tag.id]);
            }
        }
    }

    // Compute aggregate score
    const allScores = [...Object.values(fieldResults), ...Object.values(tagResults)].filter((r) => r.match !== 'skip');

    const totalScore = allScores.reduce((sum, r) => sum + (r.score || 0), 0);
    const accuracy = allScores.length > 0 ? totalScore / allScores.length : 0;

    // Hallucination rate: confident wrong answers (not "Unknown" or 0, but wrong)
    const wrongAnswers = allScores.filter((r) => r.match === 'wrong');
    const hallucinations = wrongAnswers.length;
    const hallucinationRate = allScores.length > 0 ? hallucinations / allScores.length : 0;

    return {
        fields: fieldResults,
        tags: tagResults,
        accuracy: Math.round(accuracy * 1000) / 1000,
        scoredFields: allScores.length,
        hallucinations,
        hallucinationRate: Math.round(hallucinationRate * 1000) / 1000
    };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function aggregateResults(invoiceResults: InvoiceResult[]): AggregateResult {
    const fieldAccuracy: Record<string, FieldAccuracyData> = {};
    const tagAccuracy: Record<string, TagAccuracyData> = {};

    for (const result of invoiceResults) {
        for (const [key, score] of Object.entries(result.evaluation.fields)) {
            if (!fieldAccuracy[key]) fieldAccuracy[key] = { scores: [], total: 0, correct: 0, wrong: 0, missing: 0 };
            if (score.match === 'skip') continue;
            fieldAccuracy[key].total++;
            fieldAccuracy[key].scores.push(score.score || 0);
            if ((score.score || 0) >= 0.9) fieldAccuracy[key].correct++;
            else if (score.match === 'missing') fieldAccuracy[key].missing++;
            else fieldAccuracy[key].wrong++;
        }

        for (const [key, score] of Object.entries(result.evaluation.tags)) {
            if (!tagAccuracy[key]) tagAccuracy[key] = { scores: [], total: 0, correct: 0, wrong: 0 };
            if (score.match === 'skip') continue;
            tagAccuracy[key].total++;
            tagAccuracy[key].scores.push(score.score || 0);
            if ((score.score || 0) >= 0.9) tagAccuracy[key].correct++;
            else tagAccuracy[key].wrong++;
        }
    }

    // Compute averages
    for (const field of Object.values(fieldAccuracy)) {
        field.accuracy =
            field.total > 0 ? Math.round((field.scores.reduce((a, b) => a + b, 0) / field.total) * 1000) / 1000 : 0;
        delete (field as Partial<FieldAccuracyData>).scores;
    }
    for (const tag of Object.values(tagAccuracy)) {
        tag.accuracy =
            tag.total > 0 ? Math.round((tag.scores.reduce((a, b) => a + b, 0) / tag.total) * 1000) / 1000 : 0;
        delete (tag as Partial<TagAccuracyData>).scores;
    }

    const overallScores = invoiceResults.map((r) => r.evaluation.accuracy);
    const overallAccuracy =
        overallScores.length > 0
            ? Math.round((overallScores.reduce((a, b) => a + b, 0) / overallScores.length) * 1000) / 1000
            : 0;

    const totalHallucinations = invoiceResults.reduce((sum, r) => sum + r.evaluation.hallucinations, 0);
    const totalScored = invoiceResults.reduce((sum, r) => sum + r.evaluation.scoredFields, 0);

    return {
        overallAccuracy,
        invoiceCount: invoiceResults.length,
        totalScoredFields: totalScored,
        totalHallucinations,
        hallucinationRate: totalScored > 0 ? Math.round((totalHallucinations / totalScored) * 1000) / 1000 : 0,
        fieldAccuracy,
        tagAccuracy
    };
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

function displayResults(invoiceResults: InvoiceResult[], aggregate: AggregateResult, verbose: boolean): void {
    console.log('\n' + '='.repeat(70));
    console.log('EXTRACTION QUALITY EVALUATION');
    console.log('='.repeat(70));

    console.log(`\nInvoices evaluated: ${aggregate.invoiceCount}`);
    console.log(`Overall accuracy:   ${(aggregate.overallAccuracy * 100).toFixed(1)}%`);
    console.log(`Hallucination rate: ${(aggregate.hallucinationRate * 100).toFixed(1)}%`);
    console.log(`Fields scored:      ${aggregate.totalScoredFields}`);

    // Per-field accuracy table
    console.log('\n--- Field Accuracy ---');
    const fields = Object.entries(aggregate.fieldAccuracy).sort(
        ([, a], [, b]) => (a.accuracy || 0) - (b.accuracy || 0)
    );
    for (const [key, data] of fields) {
        const bar = '\u2588'.repeat(Math.round((data.accuracy || 0) * 20)).padEnd(20, '\u2591');
        console.log(
            `  ${key.padEnd(25)} ${bar} ${((data.accuracy || 0) * 100).toFixed(0).padStart(4)}%  (${data.correct}/${data.total} correct, ${data.wrong} wrong, ${data.missing} missing)`
        );
    }

    // Per-tag accuracy table
    if (Object.keys(aggregate.tagAccuracy).length > 0) {
        console.log('\n--- Tag Accuracy ---');
        const tags = Object.entries(aggregate.tagAccuracy).sort(
            ([, a], [, b]) => (a.accuracy || 0) - (b.accuracy || 0)
        );
        for (const [key, data] of tags) {
            const bar = '\u2588'.repeat(Math.round((data.accuracy || 0) * 20)).padEnd(20, '\u2591');
            console.log(
                `  ${key.padEnd(25)} ${bar} ${((data.accuracy || 0) * 100).toFixed(0).padStart(4)}%  (${data.correct}/${data.total} correct, ${data.wrong} wrong)`
            );
        }
    }

    // Per-invoice details
    if (verbose) {
        console.log('\n--- Per-Invoice Details ---');
        for (const result of invoiceResults) {
            console.log(`\n  ${result.name} — accuracy: ${(result.evaluation.accuracy * 100).toFixed(1)}%`);
            for (const [key, score] of Object.entries(result.evaluation.fields)) {
                if (score.match === 'skip') continue;
                const icon = (score.score || 0) >= 0.9 ? '\u2713' : score.match === 'missing' ? '?' : '\u2717';
                const detail = score.reason ? ` (${score.reason})` : '';
                console.log(`    ${icon} ${key}: ${score.match}${detail}`);
            }
            for (const [key, score] of Object.entries(result.evaluation.tags)) {
                if (score.match === 'skip') continue;
                const icon = (score.score || 0) >= 0.9 ? '\u2713' : '\u2717';
                const detail = score.reason ? ` (${score.reason})` : '';
                console.log(`    ${icon} tags.${key}: ${score.match}${detail}`);
            }
        }
    }

    console.log('\n' + '='.repeat(70));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
    const opts = parseArgs();

    console.log('Extraction Quality Evaluation');
    console.log(`Mode: ${opts.dryRun ? 'dry-run (cached responses)' : 'live (calling Gemini API)'}`);

    // Load config
    const { loadConfig } = await import('../src/config.js');
    const config = (await loadConfig({ requireFolders: false })) as unknown as Config;

    // Discover corpus
    const corpus = await discoverCorpus(opts.invoice);
    if (corpus.length === 0) {
        console.error('\nNo evaluation invoices found.');
        console.error(`Place PDF + .truth.json pairs in: ${CORPUS_DIR}`);
        console.error('\nGround truth format:');
        console.error(
            JSON.stringify(
                {
                    supplierName: 'Acme Corp',
                    totalAmount: 1500.5,
                    invoiceDate: '20240115',
                    tags: { commercial_invoice: true, receipt: false }
                },
                null,
                2
            )
        );
        process.exit(1);
    }

    console.log(`\nFound ${corpus.length} invoice(s) with ground truth\n`);

    // Process each invoice
    const invoiceResults: InvoiceResult[] = [];
    for (const entry of corpus) {
        process.stdout.write(`  Processing ${entry.name}...`);

        const truth = JSON.parse(await fs.readFile(entry.truthPath, 'utf-8')) as Record<string, unknown>;
        const extraction = await extractInvoice(entry, config, opts.dryRun);

        if (!extraction) {
            console.log(' skipped (no cache)');
            continue;
        }

        const evaluation = evaluateInvoice(extraction.analysis, truth, config);

        invoiceResults.push({
            name: entry.name,
            extraction: {
                analysis: extraction.analysis,
                tokenUsage: extraction.tokenUsage,
                duration: extraction.duration,
                fromCache: extraction.fromCache
            },
            truth,
            evaluation
        });

        const cacheLabel = extraction.fromCache ? ' (cached)' : ` (${extraction.duration}ms)`;
        console.log(` ${(evaluation.accuracy * 100).toFixed(1)}% accuracy${cacheLabel}`);
    }

    if (invoiceResults.length === 0) {
        console.error('\nNo invoices were evaluated.');
        process.exit(1);
    }

    // Aggregate and display
    const aggregate = aggregateResults(invoiceResults);
    displayResults(invoiceResults, aggregate, opts.verbose);

    // Save results
    await fs.mkdir(RESULTS_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultPath = path.join(RESULTS_DIR, `${timestamp}.json`);
    const resultData = {
        timestamp: new Date().toISOString(),
        model: config.model,
        dryRun: opts.dryRun,
        invoiceCount: invoiceResults.length,
        aggregate,
        invoices: invoiceResults
    };
    await fs.writeFile(resultPath, JSON.stringify(resultData, null, 2));
    console.log(`\nResults saved to: ${resultPath}`);
}

main().catch((err: Error) => {
    console.error('Evaluation failed:', err.message);
    process.exit(1);
});
