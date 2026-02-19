const request = require('supertest');

jest.mock('../../src/client-manager');
jest.mock('../../src/config');
jest.mock('../../src/result-manager');

const { getAllClients, getClientConfig, isMultiClientMode } = require('../../src/client-manager');
const { loadConfig } = require('../../src/config');
const { getResults, getSummary } = require('../../src/result-manager');

const app = require('../../server');

const MOCK_GLOBAL_CONFIG = { output: { processedOriginalSubfolder: 'processed-original' } };
const MOCK_CLIENT_CONFIG = {
    folders: { base: '/invoices/acme', csvPath: '/invoices/acme/log.csv' },
    model: 'gemini-3-flash-preview'
};

beforeEach(() => {
    jest.clearAllMocks();
    loadConfig.mockResolvedValue(MOCK_GLOBAL_CONFIG);
    getClientConfig.mockResolvedValue(MOCK_CLIENT_CONFIG);
});

// ============================================================================
// GET /api/clients/:id/results
// ============================================================================

describe('GET /api/clients/:id/results', () => {
    it('returns paginated results', async () => {
        const mockResults = {
            results: [{ id: 'r1', status: 'success', originalFilename: 'inv.pdf' }],
            total: 1,
            limit: 50,
            offset: 0
        };
        getResults.mockResolvedValue(mockResults);

        const res = await request(app).get('/api/clients/acme/results').expect(200);

        expect(res.body).toEqual(mockResults);
        expect(getResults).toHaveBeenCalledWith('/invoices/acme', {
            status: undefined,
            limit: 50,
            offset: 0
        });
    });

    it('passes status filter and pagination params', async () => {
        getResults.mockResolvedValue({ results: [], total: 0 });

        await request(app).get('/api/clients/acme/results?status=failed&limit=10&offset=20').expect(200);

        expect(getResults).toHaveBeenCalledWith('/invoices/acme', {
            status: 'failed',
            limit: 10,
            offset: 20
        });
    });

    it('caps limit at 250', async () => {
        getResults.mockResolvedValue({ results: [], total: 0 });

        await request(app).get('/api/clients/acme/results?limit=999').expect(200);

        expect(getResults).toHaveBeenCalledWith('/invoices/acme', expect.objectContaining({ limit: 250 }));
    });

    it('defaults invalid limit/offset to 50/0', async () => {
        getResults.mockResolvedValue({ results: [], total: 0 });

        await request(app).get('/api/clients/acme/results?limit=abc&offset=xyz').expect(200);

        expect(getResults).toHaveBeenCalledWith('/invoices/acme', expect.objectContaining({ limit: 50, offset: 0 }));
    });

    it('returns 404 when client not found', async () => {
        getClientConfig.mockRejectedValue(new Error('Client "nope" not found'));

        const res = await request(app).get('/api/clients/nope/results').expect(404);

        expect(res.body.error).toContain('not found');
    });

    it('returns 500 on generic error', async () => {
        getResults.mockRejectedValue(new Error('read error'));

        await request(app).get('/api/clients/acme/results').expect(500);
    });
});

// ============================================================================
// GET /api/clients/:id/results/summary
// ============================================================================

describe('GET /api/clients/:id/results/summary', () => {
    it('returns aggregate statistics', async () => {
        const mockSummary = { total: 10, success: 8, failed: 2, successRate: 80 };
        getSummary.mockResolvedValue(mockSummary);

        const res = await request(app).get('/api/clients/acme/results/summary').expect(200);

        expect(res.body).toEqual(mockSummary);
        expect(getSummary).toHaveBeenCalledWith('/invoices/acme');
    });

    it('returns 404 when client not found', async () => {
        getClientConfig.mockRejectedValue(new Error('Client "nope" not found'));

        await request(app).get('/api/clients/nope/results/summary').expect(404);
    });

    it('returns 500 on generic error', async () => {
        getSummary.mockRejectedValue(new Error('parse error'));

        await request(app).get('/api/clients/acme/results/summary').expect(500);
    });
});

// ============================================================================
// GET /api/stats
// ============================================================================

describe('GET /api/stats', () => {
    it('returns aggregate stats across all clients', async () => {
        getAllClients.mockResolvedValue({
            acme: { name: 'Acme', enabled: true },
            globex: { name: 'Globex', enabled: true }
        });
        getSummary.mockResolvedValue({
            total: 5,
            success: 4,
            failed: 1,
            successRate: 80,
            tokenUsage: { totalTokens: 1000 },
            lastProcessed: '2026-01-15T10:00:00Z'
        });

        const res = await request(app).get('/api/stats').expect(200);

        expect(res.body.aggregate.totalProcessed).toBe(10);
        expect(res.body.aggregate.totalSuccess).toBe(8);
        expect(res.body.aggregate.totalFailed).toBe(2);
        expect(res.body.aggregate.totalTokens).toBe(2000);
        expect(res.body.perClient).toHaveProperty('acme');
        expect(res.body.perClient).toHaveProperty('globex');
    });

    it('returns empty aggregate when no clients', async () => {
        getAllClients.mockResolvedValue(null);

        const res = await request(app).get('/api/stats').expect(200);

        expect(res.body.aggregate.totalProcessed).toBe(0);
        expect(res.body.perClient).toEqual({});
    });

    it('skips clients with missing folders', async () => {
        getAllClients.mockResolvedValue({
            acme: { name: 'Acme', enabled: true },
            broken: { name: 'Broken', enabled: true }
        });
        getClientConfig.mockResolvedValueOnce(MOCK_CLIENT_CONFIG).mockRejectedValueOnce(new Error('folder missing'));
        getSummary.mockResolvedValue({
            total: 3,
            success: 3,
            failed: 0,
            successRate: 100,
            tokenUsage: { totalTokens: 500 },
            lastProcessed: '2026-01-10T00:00:00Z'
        });

        const res = await request(app).get('/api/stats').expect(200);

        expect(res.body.aggregate.totalProcessed).toBe(3);
        expect(res.body.perClient).toHaveProperty('acme');
        expect(res.body.perClient).not.toHaveProperty('broken');
    });

    it('calculates success rate', async () => {
        getAllClients.mockResolvedValue({ acme: { name: 'Acme', enabled: true } });
        getSummary.mockResolvedValue({
            total: 4,
            success: 3,
            failed: 1,
            successRate: 75,
            tokenUsage: { totalTokens: 100 },
            lastProcessed: null
        });

        const res = await request(app).get('/api/stats').expect(200);

        expect(res.body.aggregate.successRate).toBe(75);
    });

    it('returns 500 on error', async () => {
        getAllClients.mockRejectedValue(new Error('db error'));

        await request(app).get('/api/stats').expect(500);
    });
});
