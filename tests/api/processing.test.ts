import request from 'supertest';

jest.mock('fs', () => {
    const actual = jest.requireActual('fs');
    return {
        ...actual,
        promises: {
            access: jest.fn(),
            readdir: jest.fn(),
            stat: jest.fn(),
            copyFile: jest.fn()
        }
    };
});
jest.mock('../../src/client-manager.js');
jest.mock('../../src/config.js');
jest.mock('../../src/result-manager.js');
jest.mock('../../src/parallel-processor.js');

import fs from 'fs';
const fsp = jest.mocked(fs.promises);

import {
    getAllClients,
    getClient,
    getClientConfig,
    resolveApiKey,
    ensureClientDirectories
} from '../../src/client-manager.js';
import { loadConfig } from '../../src/config.js';
import { getFailedResults, getResult, updateResult } from '../../src/result-manager.js';
import { processAllInvoices, processWithRetry } from '../../src/parallel-processor.js';

const mockedGetAllClients = jest.mocked(getAllClients);
const mockedGetClient = jest.mocked(getClient);
const mockedGetClientConfig = jest.mocked(getClientConfig);
const mockedResolveApiKey = jest.mocked(resolveApiKey);
const mockedEnsureClientDirectories = jest.mocked(ensureClientDirectories);
const mockedLoadConfig = jest.mocked(loadConfig);
const mockedGetFailedResults = jest.mocked(getFailedResults);
const mockedGetResult = jest.mocked(getResult);
const mockedUpdateResult = jest.mocked(updateResult);
const mockedProcessAllInvoices: any = jest.mocked(processAllInvoices);
const mockedProcessWithRetry = jest.mocked(processWithRetry);

import app from '../../server.js';

/**
 * Parse SSE response text into an array of event objects.
 */
function parseSSEEvents(text: string): any[] {
    return text
        .split('\n\n')
        .filter((chunk) => chunk.startsWith('data: '))
        .map((chunk) => JSON.parse(chunk.replace('data: ', '')));
}

const MOCK_GLOBAL_CONFIG = {
    output: { processedOriginalSubfolder: 'processed-original' },
    processing: { concurrency: 3 }
};
const MOCK_CLIENT_CONFIG = {
    model: 'gemini-3-flash-preview',
    folders: {
        base: '/invoices/acme',
        processedOriginal: '/invoices/acme/processed-original',
        csvPath: '/log.csv'
    },
    output: {},
    fieldDefinitions: [],
    tagDefinitions: [],
    promptTemplate: {}
};

beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadConfig.mockResolvedValue(MOCK_GLOBAL_CONFIG as any);
    mockedGetClientConfig.mockResolvedValue(MOCK_CLIENT_CONFIG as any);
    mockedGetClient.mockResolvedValue({ folderPath: '/invoices/acme' } as any);
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedEnsureClientDirectories.mockResolvedValue(undefined as any);
    fsp.access.mockResolvedValue(undefined);
    fsp.copyFile.mockResolvedValue(undefined);
});

// ============================================================================
// POST /api/clients/:id/results/retry
// ============================================================================

describe('POST /api/clients/:id/results/retry', () => {
    it('retries all failed results', async () => {
        const failedResults = [
            { id: 'r1', status: 'failed', originalFilename: 'inv1.pdf' },
            { id: 'r2', status: 'failed', originalFilename: 'inv2.pdf' }
        ];
        mockedGetFailedResults.mockResolvedValue(failedResults as any);
        mockedProcessWithRetry.mockResolvedValue({
            success: true,
            outputFilename: 'out.pdf',
            duration: 1000
        } as any);
        mockedUpdateResult.mockResolvedValue(undefined as any);

        const res = await request(app).post('/api/clients/retry-all/results/retry').send({ all: true }).expect(200);

        const events = parseSSEEvents(res.text);
        expect(events[0]).toMatchObject({ status: 'connected' });
        expect(events.find((e) => e.status === 'retry-starting')).toMatchObject({ total: 2 });
        expect(events.filter((e) => e.status === 'retry-completed')).toHaveLength(2);
        expect(events.find((e) => e.status === 'retry-done')).toMatchObject({ success: 2, failed: 0 });
    });

    it('retries specific result IDs', async () => {
        mockedGetResult.mockResolvedValueOnce({
            id: 'r1',
            status: 'failed',
            originalFilename: 'inv.pdf'
        } as any);
        mockedProcessWithRetry.mockResolvedValue({
            success: true,
            outputFilename: 'out.pdf',
            duration: 500
        } as any);
        mockedUpdateResult.mockResolvedValue(undefined as any);

        const res = await request(app)
            .post('/api/clients/retry-ids/results/retry')
            .send({ resultIds: ['r1'] })
            .expect(200);

        const events = parseSSEEvents(res.text);
        expect(events.find((e) => e.status === 'retry-done')).toMatchObject({ success: 1, failed: 0 });
        expect(mockedGetResult).toHaveBeenCalledWith('/invoices/acme', 'r1');
    });

    it('skips non-failed results from resultIds', async () => {
        mockedGetResult.mockResolvedValueOnce({
            id: 'r1',
            status: 'success',
            originalFilename: 'inv.pdf'
        } as any);

        const res = await request(app)
            .post('/api/clients/retry-skip/results/retry')
            .send({ resultIds: ['r1'] })
            .expect(200);

        const events = parseSSEEvents(res.text);
        expect(events.find((e) => e.status === 'error')).toMatchObject({
            error: 'No failed results to retry'
        });
    });

    it('returns error when neither resultIds nor all provided', async () => {
        const res = await request(app).post('/api/clients/retry-none/results/retry').send({}).expect(200);

        const events = parseSSEEvents(res.text);
        expect(events.find((e) => e.status === 'error')).toMatchObject({
            error: 'Provide resultIds array or all: true'
        });
    });

    it('returns error when no failed results found', async () => {
        mockedGetFailedResults.mockResolvedValue([]);

        const res = await request(app).post('/api/clients/retry-empty/results/retry').send({ all: true }).expect(200);

        const events = parseSSEEvents(res.text);
        expect(events.find((e) => e.status === 'error')).toMatchObject({
            error: 'No failed results to retry'
        });
    });

    it('reports individual retry failures', async () => {
        mockedGetFailedResults.mockResolvedValue([{ id: 'r1', status: 'failed', originalFilename: 'inv.pdf' }] as any);
        mockedProcessWithRetry.mockResolvedValue({
            success: false,
            error: 'API timeout',
            duration: 5000
        } as any);
        mockedUpdateResult.mockResolvedValue(undefined as any);

        const res = await request(app).post('/api/clients/retry-fail/results/retry').send({ all: true }).expect(200);

        const events = parseSSEEvents(res.text);
        expect(events.find((e) => e.status === 'retry-failed')).toMatchObject({
            resultId: 'r1',
            error: 'API timeout'
        });
        expect(events.find((e) => e.status === 'retry-done')).toMatchObject({ success: 0, failed: 1 });
    });

    it('handles processWithRetry throwing', async () => {
        mockedGetFailedResults.mockResolvedValue([{ id: 'r1', status: 'failed', originalFilename: 'inv.pdf' }] as any);
        mockedProcessWithRetry.mockRejectedValue(new Error('crash'));

        const res = await request(app).post('/api/clients/retry-crash/results/retry').send({ all: true }).expect(200);

        const events = parseSSEEvents(res.text);
        expect(events.find((e) => e.status === 'retry-failed')).toMatchObject({ error: 'crash' });
        expect(events.find((e) => e.status === 'retry-done')).toMatchObject({ success: 0, failed: 1 });
    });

    it('tries processed-original folder then input folder for source file', async () => {
        mockedGetFailedResults.mockResolvedValue([{ id: 'r1', status: 'failed', originalFilename: 'inv.pdf' }] as any);
        // First access (processed-original) fails, second (input folder) succeeds
        fsp.access.mockRejectedValueOnce(new Error('ENOENT')).mockResolvedValueOnce(undefined);
        mockedProcessWithRetry.mockResolvedValue({
            success: true,
            outputFilename: 'out.pdf',
            duration: 100
        } as any);
        mockedUpdateResult.mockResolvedValue(undefined as any);

        const res = await request(app)
            .post('/api/clients/retry-fallback/results/retry')
            .send({ all: true })
            .expect(200);

        const events = parseSSEEvents(res.text);
        expect(events.find((e) => e.status === 'retry-completed')).toBeDefined();
        // copyFile should NOT have been called since processed-original didn't exist
        expect(fsp.copyFile).not.toHaveBeenCalled();
    });

    it('errors when source file not found in any location', async () => {
        mockedGetFailedResults.mockResolvedValue([{ id: 'r1', status: 'failed', originalFilename: 'inv.pdf' }] as any);
        fsp.access.mockRejectedValue(new Error('ENOENT'));

        const res = await request(app).post('/api/clients/retry-nofile/results/retry').send({ all: true }).expect(200);

        const events = parseSSEEvents(res.text);
        expect(events.find((e) => e.status === 'retry-failed')).toMatchObject({
            error: expect.stringContaining('not found')
        });
    });

    it('sends error event on top-level failure', async () => {
        mockedLoadConfig.mockRejectedValue(new Error('config broken'));

        const res = await request(app)
            .post('/api/clients/retry-toplevel/results/retry')
            .send({ all: true })
            .expect(200);

        const events = parseSSEEvents(res.text);
        expect(events.find((e) => e.status === 'error')).toMatchObject({ error: 'config broken' });
    });
});

// ============================================================================
// POST /api/clients/:id/process
// ============================================================================

describe('POST /api/clients/:id/process', () => {
    it('processes invoices and streams progress', async () => {
        mockedProcessAllInvoices.mockImplementation(async (config: any, options: any) => {
            options.onProgress({ status: 'processing', filename: 'inv.pdf', current: 1, total: 1 });
            options.onComplete({ success: 1, failed: 0, total: 1 });
        });

        const res = await request(app).post('/api/clients/proc-ok/process').send({}).expect(200);

        const events = parseSSEEvents(res.text);
        expect(events[0]).toMatchObject({ status: 'connected', clientId: 'proc-ok' });
        expect(events.find((e) => e.status === 'processing')).toMatchObject({ filename: 'inv.pdf' });
        expect(events.find((e) => e.status === 'done')).toMatchObject({ success: 1, failed: 0 });
    });

    it('passes dryRun flag', async () => {
        mockedProcessAllInvoices.mockImplementation(async (config: any, options: any) => {
            options.onComplete({ success: 0, failed: 0, total: 0 });
        });

        const res = await request(app).post('/api/clients/proc-dry/process').send({ dryRun: true }).expect(200);

        const events = parseSSEEvents(res.text);
        expect(events.find((e) => e.status === 'done')).toMatchObject({ dryRun: true });
        expect(mockedProcessAllInvoices).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ dryRun: true })
        );
    });

    it('passes file selection', async () => {
        mockedProcessAllInvoices.mockImplementation(async (config: any, options: any) => {
            options.onComplete({ success: 1, failed: 0, total: 1 });
        });

        await request(app)
            .post('/api/clients/proc-files/process')
            .send({ files: ['specific.pdf'] })
            .expect(200);

        expect(mockedProcessAllInvoices).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ files: ['specific.pdf'] })
        );
    });

    it('sends error when folder does not exist', async () => {
        fsp.access.mockRejectedValue(new Error('ENOENT'));

        const res = await request(app).post('/api/clients/proc-nofolder/process').send({}).expect(200);

        const events = parseSSEEvents(res.text);
        expect(events.find((e) => e.status === 'error')).toMatchObject({
            error: expect.stringContaining('Folder does not exist')
        });
    });

    it('ensures client directories before processing', async () => {
        mockedProcessAllInvoices.mockImplementation(async (config: any, options: any) => {
            options.onComplete({ success: 0, failed: 0, total: 0 });
        });

        await request(app).post('/api/clients/proc-dirs/process').send({}).expect(200);

        expect(mockedEnsureClientDirectories).toHaveBeenCalledWith(MOCK_CLIENT_CONFIG);
    });

    it('sends error event on top-level failure', async () => {
        mockedLoadConfig.mockRejectedValue(new Error('config read failed'));

        const res = await request(app).post('/api/clients/proc-err/process').send({}).expect(200);

        const events = parseSSEEvents(res.text);
        expect(events.find((e) => e.status === 'error')).toMatchObject({ error: 'config read failed' });
    });
});

// ============================================================================
// POST /api/clients/process-all
// ============================================================================

describe('POST /api/clients/process-all', () => {
    it('processes all enabled clients', async () => {
        mockedGetAllClients.mockResolvedValue({
            acme: { name: 'Acme', enabled: true },
            globex: { name: 'Globex', enabled: true }
        } as any);
        mockedProcessAllInvoices.mockImplementation(async (config: any, options: any) => {
            options.onProgress({ status: 'processing', current: 1, total: 1 });
            options.onComplete({ success: 1, failed: 0 });
        });

        const res = await request(app).post('/api/clients/process-all').send({}).expect(200);

        const events = parseSSEEvents(res.text);
        expect(events[0]).toMatchObject({ status: 'connected', mode: 'all' });
        expect(events.find((e) => e.status === 'starting-batch')).toMatchObject({ totalClients: 2 });
        expect(events.filter((e) => e.status === 'client-starting')).toHaveLength(2);
        expect(events.filter((e) => e.status === 'client-done')).toHaveLength(2);
        expect(events.find((e) => e.status === 'done')).toMatchObject({
            mode: 'all',
            totalClients: 2,
            totalSuccess: 2,
            totalFailed: 0
        });
    });

    it('skips disabled clients', async () => {
        mockedGetAllClients.mockResolvedValue({
            acme: { name: 'Acme', enabled: true },
            disabled: { name: 'Disabled', enabled: false }
        } as any);
        mockedProcessAllInvoices.mockImplementation(async (config: any, options: any) => {
            options.onComplete({ success: 1, failed: 0 });
        });

        const res = await request(app).post('/api/clients/process-all').send({}).expect(200);

        const events = parseSSEEvents(res.text);
        expect(events.find((e) => e.status === 'starting-batch')).toMatchObject({ totalClients: 1 });
        expect(events.filter((e) => e.status === 'client-starting')).toHaveLength(1);
    });

    it('sends error when no clients configured', async () => {
        mockedGetAllClients.mockResolvedValue(null as any);

        const res = await request(app).post('/api/clients/process-all').send({}).expect(200);

        const events = parseSSEEvents(res.text);
        expect(events.find((e) => e.status === 'error')).toMatchObject({
            error: 'No clients configured'
        });
    });

    it('sends error when no enabled clients', async () => {
        mockedGetAllClients.mockResolvedValue({
            a: { name: 'A', enabled: false },
            b: { name: 'B', enabled: false }
        } as any);

        const res = await request(app).post('/api/clients/process-all').send({}).expect(200);

        const events = parseSSEEvents(res.text);
        expect(events.find((e) => e.status === 'error')).toMatchObject({
            error: 'No enabled clients found'
        });
    });

    it('reports client-error when folder does not exist', async () => {
        mockedGetAllClients.mockResolvedValue({ acme: { name: 'Acme', enabled: true } } as any);
        fsp.access.mockRejectedValue(new Error('ENOENT'));

        const res = await request(app).post('/api/clients/process-all').send({}).expect(200);

        const events = parseSSEEvents(res.text);
        expect(events.find((e) => e.status === 'client-error')).toMatchObject({
            error: expect.stringContaining('Folder does not exist')
        });
    });

    it('continues processing other clients on error', async () => {
        mockedGetAllClients.mockResolvedValue({
            broken: { name: 'Broken', enabled: true },
            good: { name: 'Good', enabled: true }
        } as any);
        // First client throws from getClientConfig, second succeeds
        mockedGetClientConfig
            .mockRejectedValueOnce(new Error('config broken'))
            .mockResolvedValueOnce(MOCK_CLIENT_CONFIG as any);
        mockedProcessAllInvoices.mockImplementation(async (config: any, options: any) => {
            options.onComplete({ success: 1, failed: 0 });
        });

        const res = await request(app).post('/api/clients/process-all').send({}).expect(200);

        const events = parseSSEEvents(res.text);
        expect(events.find((e) => e.status === 'client-error')).toMatchObject({
            clientId: 'broken',
            error: 'config broken'
        });
        expect(events.find((e) => e.status === 'client-done')).toMatchObject({ clientId: 'good' });
        expect(events.find((e) => e.status === 'done')).toMatchObject({ totalSuccess: 1 });
    });

    it('sends error event on top-level failure', async () => {
        mockedGetAllClients.mockRejectedValue(new Error('total failure'));

        const res = await request(app).post('/api/clients/process-all').send({}).expect(200);

        const events = parseSSEEvents(res.text);
        expect(events.find((e) => e.status === 'error')).toMatchObject({ error: 'total failure' });
    });
});

// ============================================================================
// GET /api/clients/:id/files
// ============================================================================

describe('GET /api/clients/:id/files', () => {
    it('lists PDF files in client folder', async () => {
        fsp.readdir.mockResolvedValue(['invoice1.pdf', 'invoice2.PDF', 'readme.txt'] as any);
        fsp.stat.mockResolvedValue({
            size: 12345,
            mtime: new Date('2026-01-15T10:00:00Z')
        } as any);

        const res = await request(app).get('/api/clients/acme/files').expect(200);

        expect(res.body.exists).toBe(true);
        expect(res.body.files).toHaveLength(2);
        expect(res.body.files[0]).toMatchObject({ filename: 'invoice1.pdf', size: 12345 });
    });

    it('returns empty list when folder does not exist', async () => {
        fsp.access.mockRejectedValue(new Error('ENOENT'));

        const res = await request(app).get('/api/clients/acme/files').expect(200);

        expect(res.body.exists).toBe(false);
        expect(res.body.files).toEqual([]);
    });

    it('returns sorted file list', async () => {
        fsp.readdir.mockResolvedValue(['zebra.pdf', 'alpha.pdf'] as any);
        fsp.stat.mockResolvedValue({ size: 100, mtime: new Date() } as any);

        const res = await request(app).get('/api/clients/acme/files').expect(200);

        expect(res.body.files[0].filename).toBe('alpha.pdf');
        expect(res.body.files[1].filename).toBe('zebra.pdf');
    });

    it('returns 404 when client not found', async () => {
        mockedGetClientConfig.mockRejectedValue(new Error('Client "nope" not found'));

        await request(app).get('/api/clients/nope/files').expect(404);
    });

    it('returns 500 on generic error', async () => {
        fsp.readdir.mockRejectedValue(new Error('permission denied'));

        await request(app).get('/api/clients/acme/files').expect(500);
    });
});
