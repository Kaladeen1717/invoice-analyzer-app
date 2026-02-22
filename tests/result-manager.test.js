const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const {
    appendResult,
    getResults,
    getResult,
    getSummary,
    updateResult,
    getFailedResults,
    RESULTS_FILENAME
} = require('../src/result-manager');

let tmpDir;

beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'result-manager-test-'));
});

afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
});

function successResult(overrides = {}) {
    return {
        success: true,
        originalFilename: 'invoice-001.pdf',
        outputFilename: 'Acme Corp - 20240115.pdf',
        analysis: { supplierName: 'Acme Corp', totalAmount: 1500, tags: { private: false } },
        tokenUsage: { promptTokens: 100, outputTokens: 50, totalTokens: 150, cachedTokens: 10, thoughtsTokens: 0 },
        ...overrides
    };
}

function failedResult(overrides = {}) {
    return {
        success: false,
        originalFilename: 'invoice-002.pdf',
        error: 'Gemini API error: rate limit exceeded',
        tokenUsage: { promptTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: 0, thoughtsTokens: 0 },
        ...overrides
    };
}

describe('appendResult', () => {
    test('creates results file when none exists', async () => {
        await appendResult(tmpDir, successResult(), { model: 'gemini-test', duration: 3000 });

        const data = JSON.parse(await fs.readFile(path.join(tmpDir, RESULTS_FILENAME), 'utf-8'));
        expect(data.results).toHaveLength(1);
        expect(data.results[0].status).toBe('success');
        expect(data.results[0].model).toBe('gemini-test');
        expect(data.results[0].duration).toBe(3000);
        expect(data.results[0].id).toBeTruthy();
        expect(data.lastUpdated).toBeTruthy();
    });

    test('appends to existing results', async () => {
        await appendResult(tmpDir, successResult());
        await appendResult(tmpDir, failedResult());

        const data = JSON.parse(await fs.readFile(path.join(tmpDir, RESULTS_FILENAME), 'utf-8'));
        expect(data.results).toHaveLength(2);
        expect(data.results[0].status).toBe('success');
        expect(data.results[1].status).toBe('failed');
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
        expect(found.originalFilename).toBe('invoice-001.pdf');
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
        expect(fetched.status).toBe('success');
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
        expect(failed.every((r) => r.status === 'failed')).toBe(true);
    });

    test('returns empty when no failures', async () => {
        await appendResult(tmpDir, successResult());
        const failed = await getFailedResults(tmpDir);
        expect(failed).toHaveLength(0);
    });
});
