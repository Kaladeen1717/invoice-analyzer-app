import fs from 'fs';
import path from 'path';
import os from 'os';
import {
    appendResult,
    getResults,
    getResult,
    getSummary,
    updateResult,
    getFailedResults,
    RESULTS_FILENAME,
    JSONL_FILENAME
} from '../src/result-manager.js';

const fsp = fs.promises;

let tmpDir: string;

beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'result-manager-test-'));
});

afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
});

function successResult(overrides = {}): any {
    return {
        success: true,
        originalFilename: 'invoice-001.pdf',
        outputFilename: 'Acme Corp - 20240115.pdf',
        analysis: { supplierName: 'Acme Corp', totalAmount: 1500, tags: { private: false } },
        tokenUsage: { promptTokens: 100, outputTokens: 50, totalTokens: 150, cachedTokens: 10, thoughtsTokens: 0 },
        ...overrides
    };
}

function failedResult(overrides = {}): any {
    return {
        success: false,
        originalFilename: 'invoice-002.pdf',
        error: 'Gemini API error: rate limit exceeded',
        tokenUsage: { promptTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: 0, thoughtsTokens: 0 },
        ...overrides
    };
}

describe('appendResult', () => {
    test('creates JSONL file when none exists', async () => {
        await appendResult(tmpDir, successResult(), { model: 'gemini-test', duration: 3000 });

        // Verify JSONL has 1 line
        const jsonl = await fsp.readFile(path.join(tmpDir, JSONL_FILENAME), 'utf-8');
        const lines = jsonl.trim().split('\n');
        expect(lines).toHaveLength(1);

        const record = JSON.parse(lines[0]);
        expect(record.status).toBe('success');
        expect(record.model).toBe('gemini-test');
        expect(record.duration).toBe(3000);
        expect(record.id).toBeTruthy();

        // Verify cache is built on read
        const result = await getResults(tmpDir);
        expect(result.results).toHaveLength(1);
    });

    test('appends to existing JSONL', async () => {
        await appendResult(tmpDir, successResult());
        await appendResult(tmpDir, failedResult());

        const jsonl = await fsp.readFile(path.join(tmpDir, JSONL_FILENAME), 'utf-8');
        const lines = jsonl.trim().split('\n');
        expect(lines).toHaveLength(2);

        // Verify cache via getResults (triggers rebuild)
        const result = await getResults(tmpDir);
        expect(result.results).toHaveLength(2);
    });

    test('stores extracted fields and tags for success', async () => {
        const record = await appendResult(tmpDir, successResult());
        expect(record.extractedFields.supplierName).toBe('Acme Corp');
        expect(record.tags.private).toBe(false);
    });

    test('stores error for failures', async () => {
        const record = await appendResult(tmpDir, failedResult());
        expect(record.status).toBe('failed');
        expect(record.error).toBe('Gemini API error: rate limit exceeded');
        expect(record.extractedFields).toEqual({});
    });
});

describe('getResults', () => {
    test('returns empty results when no file exists', async () => {
        const result = await getResults(tmpDir);
        expect(result.results).toEqual([]);
        expect(result.total).toBe(0);
        expect(result.hasMore).toBe(false);
    });

    test('returns results sorted newest first', async () => {
        await appendResult(tmpDir, successResult({ originalFilename: 'first.pdf' }));
        // Small delay to ensure different timestamps
        await new Promise((r) => setTimeout(r, 10));
        await appendResult(tmpDir, successResult({ originalFilename: 'second.pdf' }));

        const result = await getResults(tmpDir);
        expect(result.results[0].originalFilename).toBe('second.pdf');
        expect(result.results[1].originalFilename).toBe('first.pdf');
    });

    test('filters by status', async () => {
        await appendResult(tmpDir, successResult());
        await appendResult(tmpDir, failedResult());

        const failed = await getResults(tmpDir, { status: 'failed' });
        expect(failed.total).toBe(1);
        expect(failed.results[0].status).toBe('failed');

        const success = await getResults(tmpDir, { status: 'success' });
        expect(success.total).toBe(1);
        expect(success.results[0].status).toBe('success');
    });

    test('paginates results', async () => {
        for (let i = 0; i < 5; i++) {
            await appendResult(tmpDir, successResult({ originalFilename: `inv-${i}.pdf` }));
        }

        const page1 = await getResults(tmpDir, { limit: 2, offset: 0 });
        expect(page1.results).toHaveLength(2);
        expect(page1.total).toBe(5);
        expect(page1.hasMore).toBe(true);

        const page2 = await getResults(tmpDir, { limit: 2, offset: 4 });
        expect(page2.results).toHaveLength(1);
        expect(page2.hasMore).toBe(false);
    });
});

describe('getResult', () => {
    test('returns result by ID', async () => {
        const record = await appendResult(tmpDir, successResult());
        const found = await getResult(tmpDir, record.id);
        expect(found!.originalFilename).toBe('invoice-001.pdf');
    });

    test('returns null for unknown ID', async () => {
        const found = await getResult(tmpDir, 'nonexistent');
        expect(found).toBeNull();
    });
});

describe('getSummary', () => {
    test('returns zeros when no results', async () => {
        const summary = await getSummary(tmpDir);
        expect(summary.total).toBe(0);
        expect(summary.success).toBe(0);
        expect(summary.failed).toBe(0);
        expect(summary.successRate).toBe(0);
    });

    test('aggregates stats correctly', async () => {
        await appendResult(tmpDir, successResult(), { model: 'test' });
        await appendResult(tmpDir, successResult(), { model: 'test' });
        await appendResult(tmpDir, failedResult(), { model: 'test' });

        const summary = await getSummary(tmpDir);
        expect(summary.total).toBe(3);
        expect(summary.success).toBe(2);
        expect(summary.failed).toBe(1);
        expect(summary.successRate).toBe(67);
        expect(summary.tokenUsage.totalTokens).toBe(300);
        expect(summary.tokenUsage.cachedTokens).toBe(20);
        expect(summary.firstProcessed).toBeTruthy();
        expect(summary.lastProcessed).toBeTruthy();
    });
});

describe('updateResult', () => {
    test('replaces a failed result with a new outcome', async () => {
        const original = await appendResult(tmpDir, failedResult());
        expect(original.status).toBe('failed');

        const updated = await updateResult(tmpDir, original.id, successResult(), { model: 'gemini-retry' });
        expect(updated.id).toBe(original.id);
        expect(updated.status).toBe('success');
        expect(updated.model).toBe('gemini-retry');
        expect(updated.retriedFrom).toBe(original.timestamp);

        const fetched = await getResult(tmpDir, original.id);
        expect(fetched!.status).toBe('success');
    });

    test('throws for unknown ID', async () => {
        await expect(updateResult(tmpDir, 'nonexistent', successResult())).rejects.toThrow('not found');
    });
});

describe('getFailedResults', () => {
    test('returns only failed results', async () => {
        await appendResult(tmpDir, successResult());
        await appendResult(tmpDir, failedResult({ originalFilename: 'fail1.pdf' }));
        await appendResult(tmpDir, failedResult({ originalFilename: 'fail2.pdf' }));

        const failed = await getFailedResults(tmpDir);
        expect(failed).toHaveLength(2);
        expect(failed.every((r: any) => r.status === 'failed')).toBe(true);
    });

    test('returns empty when no failures', async () => {
        await appendResult(tmpDir, successResult());
        const failed = await getFailedResults(tmpDir);
        expect(failed).toHaveLength(0);
    });
});

describe('concurrent writes (regression)', () => {
    test('all results are preserved under concurrent appendResult calls', async () => {
        const count = 10;
        const promises = Array.from({ length: count }, (_, i) =>
            appendResult(tmpDir, successResult({ originalFilename: `concurrent-${i}.pdf` }), { model: 'test' })
        );

        const records = await Promise.all(promises);
        expect(records).toHaveLength(count);

        // Verify JSONL has all lines
        const jsonl = await fsp.readFile(path.join(tmpDir, JSONL_FILENAME), 'utf-8');
        const lines = jsonl.trim().split('\n');
        expect(lines).toHaveLength(count);

        // Verify all records are readable (forces cache rebuild)
        const result = await getResults(tmpDir, { limit: 100 });
        expect(result.total).toBe(count);

        // Verify all unique IDs are present
        const ids = new Set(result.results.map((r) => r.id));
        expect(ids.size).toBe(count);
    });
});

describe('migration', () => {
    test('migrates legacy JSON to JSONL on first read', async () => {
        // Write legacy processing-results.json directly (no JSONL)
        const legacyData = {
            results: [
                {
                    id: 'legacy-1',
                    originalFilename: 'old-invoice.pdf',
                    outputFilename: null,
                    status: 'success',
                    model: 'gemini-old',
                    extractedFields: { amount: 100 },
                    tags: {},
                    tokenUsage: {
                        promptTokens: 50,
                        outputTokens: 25,
                        totalTokens: 75,
                        cachedTokens: 0,
                        thoughtsTokens: 0
                    },
                    timestamp: '2024-01-01T00:00:00.000Z',
                    error: null,
                    rawResponse: null,
                    duration: 1000
                },
                {
                    id: 'legacy-2',
                    originalFilename: 'old-invoice-2.pdf',
                    outputFilename: null,
                    status: 'failed',
                    model: 'gemini-old',
                    extractedFields: {},
                    tags: {},
                    tokenUsage: {
                        promptTokens: 0,
                        outputTokens: 0,
                        totalTokens: 0,
                        cachedTokens: 0,
                        thoughtsTokens: 0
                    },
                    timestamp: '2024-01-02T00:00:00.000Z',
                    error: 'some error',
                    rawResponse: null,
                    duration: null
                }
            ],
            lastUpdated: '2024-01-02T00:00:00.000Z'
        };

        await fsp.writeFile(path.join(tmpDir, RESULTS_FILENAME), JSON.stringify(legacyData, null, 2));

        // First read triggers migration
        const result = await getResults(tmpDir);
        expect(result.total).toBe(2);

        // Verify JSONL was created
        const jsonl = await fsp.readFile(path.join(tmpDir, JSONL_FILENAME), 'utf-8');
        const lines = jsonl.trim().split('\n');
        expect(lines).toHaveLength(2);

        // Verify records are accessible
        const found = await getResult(tmpDir, 'legacy-1');
        expect(found!.originalFilename).toBe('old-invoice.pdf');
    });
});

describe('retry dedup', () => {
    test('updateResult appends new JSONL line, getResult returns latest', async () => {
        const original = await appendResult(tmpDir, failedResult());
        await updateResult(tmpDir, original.id, successResult(), { model: 'retry-model' });

        // JSONL should have 2 lines (original + retry, same id)
        const jsonl = await fsp.readFile(path.join(tmpDir, JSONL_FILENAME), 'utf-8');
        const lines = jsonl.trim().split('\n');
        expect(lines).toHaveLength(2);

        // Both lines should have the same id
        const parsed = lines.map((l) => JSON.parse(l));
        expect(parsed[0].id).toBe(parsed[1].id);

        // getResult should return only the retry outcome (last wins)
        const fetched = await getResult(tmpDir, original.id);
        expect(fetched!.status).toBe('success');
        expect(fetched!.model).toBe('retry-model');
        expect(fetched!.retriedFrom).toBe(original.timestamp);
    });
});

describe('corrupt JSONL handling', () => {
    test('skips corrupt lines and recovers valid records', async () => {
        // Write JSONL with a corrupt line in the middle
        const validRecord = {
            id: 'valid-1',
            originalFilename: 'test.pdf',
            outputFilename: null,
            status: 'success',
            model: 'test',
            extractedFields: {},
            tags: {},
            tokenUsage: {
                promptTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                cachedTokens: 0,
                thoughtsTokens: 0
            },
            timestamp: '2024-01-01T00:00:00.000Z',
            error: null,
            rawResponse: null,
            duration: null
        };

        const jsonlContent = [JSON.stringify(validRecord), '{corrupt json here', ''].join('\n');

        await fsp.writeFile(path.join(tmpDir, JSONL_FILENAME), jsonlContent);

        const result = await getResults(tmpDir);
        expect(result.total).toBe(1);
        expect(result.results[0].id).toBe('valid-1');
    });
});
