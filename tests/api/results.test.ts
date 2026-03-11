import request from 'supertest';

jest.mock('../../src/client-manager.js');
jest.mock('../../src/config.js');
jest.mock('../../src/result-manager.js');

import { getAllClients, getClientConfig } from '../../src/client-manager.js';
import { loadConfig } from '../../src/config.js';
import { getResults, getSummary } from '../../src/result-manager.js';

const mockedGetAllClients = jest.mocked(getAllClients);
const mockedGetClientConfig = jest.mocked(getClientConfig);
const mockedLoadConfig = jest.mocked(loadConfig);
const mockedGetResults = jest.mocked(getResults);
const mockedGetSummary = jest.mocked(getSummary);

import app from '../../server.js';

const MOCK_GLOBAL_CONFIG = { output: { processedOriginalSubfolder: 'processed-original' } };
const MOCK_CLIENT_CONFIG = {
    folders: { base: '/invoices/acme', csvPath: '/invoices/acme/log.csv' },
    model: 'gemini-3-flash-preview'
};

beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadConfig.mockResolvedValue(MOCK_GLOBAL_CONFIG as any);
    mockedGetClientConfig.mockResolvedValue(MOCK_CLIENT_CONFIG as any);
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
        mockedGetResults.mockResolvedValue(mockResults as any);

        const res = await request(app).get('/api/clients/acme/results').expect(200);

        expect(res.body).toEqual(mockResults);
        expect(mockedGetResults).toHaveBeenCalledWith('/invoices/acme', {
            status: undefined,
            limit: 50,
            offset: 0
        });
    });

    it('passes status filter and pagination params', async () => {
        mockedGetResults.mockResolvedValue({ results: [], total: 0 } as any);

        await request(app).get('/api/clients/acme/results?status=failed&limit=10&offset=20').expect(200);

        expect(mockedGetResults).toHaveBeenCalledWith('/invoices/acme', {
            status: 'failed',
            limit: 10,
            offset: 20
        });
    });

    it('caps limit at 250', async () => {
        mockedGetResults.mockResolvedValue({ results: [], total: 0 } as any);

        await request(app).get('/api/clients/acme/results?limit=999').expect(200);

        expect(mockedGetResults).toHaveBeenCalledWith('/invoices/acme', expect.objectContaining({ limit: 250 }));
    });

    it('defaults invalid limit/offset to 50/0', async () => {
        mockedGetResults.mockResolvedValue({ results: [], total: 0 } as any);

        await request(app).get('/api/clients/acme/results?limit=abc&offset=xyz').expect(200);

        expect(mockedGetResults).toHaveBeenCalledWith(
            '/invoices/acme',
            expect.objectContaining({ limit: 50, offset: 0 })
        );
    });

    it('returns 404 when client not found', async () => {
        mockedGetClientConfig.mockRejectedValue(new Error('Client "nope" not found'));

        const res = await request(app).get('/api/clients/nope/results').expect(404);

        expect(res.body.error).toContain('not found');
    });

    it('returns 500 on generic error', async () => {
        mockedGetResults.mockRejectedValue(new Error('read error'));

        await request(app).get('/api/clients/acme/results').expect(500);
    });
});

// ============================================================================
// GET /api/clients/:id/results/summary
// ============================================================================

describe('GET /api/clients/:id/results/summary', () => {
    it('returns aggregate statistics', async () => {
        const mockSummary = { total: 10, success: 8, failed: 2, successRate: 80 };
        mockedGetSummary.mockResolvedValue(mockSummary as any);

        const res = await request(app).get('/api/clients/acme/results/summary').expect(200);

        expect(res.body).toEqual(mockSummary);
        expect(mockedGetSummary).toHaveBeenCalledWith('/invoices/acme');
    });

    it('returns 404 when client not found', async () => {
        mockedGetClientConfig.mockRejectedValue(new Error('Client "nope" not found'));

        await request(app).get('/api/clients/nope/results/summary').expect(404);
    });

    it('returns 500 on generic error', async () => {
        mockedGetSummary.mockRejectedValue(new Error('parse error'));

        await request(app).get('/api/clients/acme/results/summary').expect(500);
    });
});

// ============================================================================
// GET /api/stats
// ============================================================================

describe('GET /api/stats', () => {
    it('returns aggregate stats across all clients', async () => {
        mockedGetAllClients.mockResolvedValue({
            acme: { name: 'Acme', enabled: true },
            globex: { name: 'Globex', enabled: true }
        } as any);
        mockedGetSummary.mockResolvedValue({
            total: 5,
            success: 4,
            failed: 1,
            successRate: 80,
            tokenUsage: { totalTokens: 1000 },
            lastProcessed: '2026-01-15T10:00:00Z'
        } as any);

        const res = await request(app).get('/api/stats').expect(200);

        expect(res.body.aggregate.totalProcessed).toBe(10);
        expect(res.body.aggregate.totalSuccess).toBe(8);
        expect(res.body.aggregate.totalFailed).toBe(2);
        expect(res.body.aggregate.totalTokens).toBe(2000);
        expect(res.body.perClient).toHaveProperty('acme');
        expect(res.body.perClient).toHaveProperty('globex');
    });

    it('returns empty aggregate when no clients', async () => {
        mockedGetAllClients.mockResolvedValue(null as any);

        const res = await request(app).get('/api/stats').expect(200);

        expect(res.body.aggregate.totalProcessed).toBe(0);
        expect(res.body.perClient).toEqual({});
    });

    it('skips clients with missing folders', async () => {
        mockedGetAllClients.mockResolvedValue({
            acme: { name: 'Acme', enabled: true },
            broken: { name: 'Broken', enabled: true }
        } as any);
        mockedGetClientConfig
            .mockResolvedValueOnce(MOCK_CLIENT_CONFIG as any)
            .mockRejectedValueOnce(new Error('folder missing'));
        mockedGetSummary.mockResolvedValue({
            total: 3,
            success: 3,
            failed: 0,
            successRate: 100,
            tokenUsage: { totalTokens: 500 },
            lastProcessed: '2026-01-10T00:00:00Z'
        } as any);

        const res = await request(app).get('/api/stats').expect(200);

        expect(res.body.aggregate.totalProcessed).toBe(3);
        expect(res.body.perClient).toHaveProperty('acme');
        expect(res.body.perClient).not.toHaveProperty('broken');
    });

    it('calculates success rate', async () => {
        mockedGetAllClients.mockResolvedValue({ acme: { name: 'Acme', enabled: true } } as any);
        mockedGetSummary.mockResolvedValue({
            total: 4,
            success: 3,
            failed: 1,
            successRate: 75,
            tokenUsage: { totalTokens: 100 },
            lastProcessed: null
        } as any);

        const res = await request(app).get('/api/stats').expect(200);

        expect(res.body.aggregate.successRate).toBe(75);
    });

    it('returns 500 on error', async () => {
        mockedGetAllClients.mockRejectedValue(new Error('db error'));

        await request(app).get('/api/stats').expect(500);
    });
});
