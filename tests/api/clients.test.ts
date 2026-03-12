import request from 'supertest';

jest.mock('../../src/client-manager.js');
jest.mock('../../src/config.js');
jest.mock('../../src/prompt-builder.js');

import {
    getAllClients,
    getClient,
    createClient,
    updateClient,
    deleteClient,
    getClientConfig,
    getClientFolderStatus,
    getAnnotatedClientConfig,
    saveClientOverrides,
    removeClientOverrides
} from '../../src/client-manager.js';
import { loadConfig } from '../../src/config.js';
import { buildPromptPreview } from '../../src/prompt-builder.js';
import { VALID_OVERRIDE_SECTIONS } from '../../src/constants.js';

const mockedGetAllClients = jest.mocked(getAllClients);
const mockedGetClient = jest.mocked(getClient);
const mockedCreateClient = jest.mocked(createClient);
const mockedUpdateClient = jest.mocked(updateClient);
const mockedDeleteClient = jest.mocked(deleteClient);
const mockedGetClientConfig = jest.mocked(getClientConfig);
const mockedGetClientFolderStatus = jest.mocked(getClientFolderStatus);
const mockedGetAnnotatedClientConfig = jest.mocked(getAnnotatedClientConfig);
const mockedSaveClientOverrides = jest.mocked(saveClientOverrides);
const mockedRemoveClientOverrides = jest.mocked(removeClientOverrides);
const mockedLoadConfig = jest.mocked(loadConfig);
const mockedBuildPromptPreview = jest.mocked(buildPromptPreview);

import app from '../../server.js';

const MOCK_FOLDER_STATUS = { pending: 3, processed: 7, total: 10 };
const MOCK_GLOBAL_CONFIG = { output: { processedOriginalSubfolder: 'processed-original' } };

beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadConfig.mockResolvedValue(MOCK_GLOBAL_CONFIG as any);
    mockedGetClientFolderStatus.mockResolvedValue(MOCK_FOLDER_STATUS as any);
});

// ============================================================================
// GET /api/clients
// ============================================================================

describe('GET /api/clients', () => {
    it('returns enriched client list in multi-client mode', async () => {
        mockedGetAllClients.mockResolvedValue({
            acme: { name: 'Acme Corp', enabled: true, folderPath: '/invoices/acme' },
            globex: { name: 'Globex', enabled: false, folderPath: '/invoices/globex', apiKeyEnvVar: 'GLOBEX_KEY' }
        } as any);

        const res = await request(app).get('/api/clients').expect(200);

        expect(res.body.mode).toBe('multi-client');
        expect(res.body.clients).toHaveLength(2);
        expect(res.body.clients[0]).toMatchObject({
            clientId: 'acme',
            name: 'Acme Corp',
            enabled: true,
            folderStatus: MOCK_FOLDER_STATUS
        });
        expect(res.body.clients[1].apiKeyEnvVar).toBe('GLOBEX_KEY');
    });

    it('returns single-client mode when getAllClients returns null', async () => {
        mockedGetAllClients.mockResolvedValue(null as any);

        const res = await request(app).get('/api/clients').expect(200);

        expect(res.body.mode).toBe('single-client');
        expect(res.body.clients).toEqual([]);
    });

    it('returns 500 on error', async () => {
        mockedGetAllClients.mockRejectedValue(new Error('disk read failed'));

        const res = await request(app).get('/api/clients').expect(500);

        expect(res.body.error).toBe('Failed to load clients');
        expect(res.body.details).toBe('disk read failed');
    });
});

// ============================================================================
// GET /api/clients/:id
// ============================================================================

describe('GET /api/clients/:id', () => {
    it('returns client with folder status', async () => {
        mockedGetClient.mockResolvedValue({ name: 'Acme', enabled: true, folderPath: '/invoices/acme' } as any);

        const res = await request(app).get('/api/clients/acme').expect(200);

        expect(res.body.clientId).toBe('acme');
        expect(res.body.name).toBe('Acme');
        expect(res.body.folderStatus).toEqual(MOCK_FOLDER_STATUS);
    });

    it('returns 404 when client not found', async () => {
        mockedGetClient.mockRejectedValue(new Error('Client "nope" not found'));

        const res = await request(app).get('/api/clients/nope').expect(404);

        expect(res.body.error).toContain('not found');
    });

    it('returns 500 on generic error', async () => {
        mockedGetClient.mockRejectedValue(new Error('unexpected'));

        const res = await request(app).get('/api/clients/acme').expect(500);

        expect(res.body.error).toBe('Failed to get client');
    });
});

// ============================================================================
// POST /api/clients
// ============================================================================

describe('POST /api/clients', () => {
    it('creates a client and returns 201', async () => {
        mockedCreateClient.mockResolvedValue(undefined as any);

        const res = await request(app)
            .post('/api/clients')
            .send({ clientId: 'acme', name: 'Acme Corp', folderPath: '/invoices/acme' })
            .expect(201);

        expect(res.body.success).toBe(true);
        expect(res.body.clientId).toBe('acme');
        expect(mockedCreateClient).toHaveBeenCalledWith('acme', {
            name: 'Acme Corp',
            enabled: true,
            folderPath: '/invoices/acme'
        });
    });

    it('passes optional apiKeyEnvVar and tagOverrides', async () => {
        mockedCreateClient.mockResolvedValue(undefined as any);
        const tagOverrides = { Vendor: { values: ['X'] } };

        await request(app)
            .post('/api/clients')
            .send({ clientId: 'acme', name: 'Acme', folderPath: '/f', apiKeyEnvVar: 'KEY', tagOverrides })
            .expect(201);

        expect(mockedCreateClient).toHaveBeenCalledWith(
            'acme',
            expect.objectContaining({ apiKeyEnvVar: 'KEY', tagOverrides })
        );
    });

    it('defaults enabled to true when not provided', async () => {
        mockedCreateClient.mockResolvedValue(undefined as any);

        await request(app).post('/api/clients').send({ clientId: 'acme', name: 'A', folderPath: '/f' }).expect(201);

        expect(mockedCreateClient).toHaveBeenCalledWith('acme', expect.objectContaining({ enabled: true }));
    });

    it('allows enabled=false', async () => {
        mockedCreateClient.mockResolvedValue(undefined as any);

        await request(app)
            .post('/api/clients')
            .send({ clientId: 'acme', name: 'A', folderPath: '/f', enabled: false })
            .expect(201);

        expect(mockedCreateClient).toHaveBeenCalledWith('acme', expect.objectContaining({ enabled: false }));
    });

    it('returns 400 when clientId is missing', async () => {
        const res = await request(app).post('/api/clients').send({ name: 'No ID' }).expect(400);

        expect(res.body.error).toBe('clientId is required');
    });

    it('returns 409 when client already exists', async () => {
        mockedCreateClient.mockRejectedValue(new Error('Client "acme" already exists'));

        const res = await request(app)
            .post('/api/clients')
            .send({ clientId: 'acme', name: 'Acme', folderPath: '/f' })
            .expect(409);

        expect(res.body.error).toContain('already exists');
    });

    it('returns 400 on validation error', async () => {
        mockedCreateClient.mockRejectedValue(new Error('Invalid folder path'));

        const res = await request(app)
            .post('/api/clients')
            .send({ clientId: 'acme', name: 'Acme', folderPath: '' })
            .expect(400);

        expect(res.body.error).toBe('Failed to create client');
    });
});

// ============================================================================
// PUT /api/clients/:id
// ============================================================================

describe('PUT /api/clients/:id', () => {
    const EXISTING_CLIENT = {
        name: 'Acme Corp',
        enabled: true,
        folderPath: '/invoices/acme',
        fieldOverrides: [{ key: 'total', label: 'Total', type: 'number', enabled: true }],
        model: 'gemini-2.0-flash',
        promptOverride: { preamble: 'Custom preamble' }
    };

    beforeEach(() => {
        mockedGetClient.mockResolvedValue(EXISTING_CLIENT as any);
        mockedUpdateClient.mockResolvedValue(undefined as any);
    });

    it('updates a client and preserves existing overrides', async () => {
        const res = await request(app)
            .put('/api/clients/acme')
            .send({ name: 'Acme Updated', folderPath: '/new' })
            .expect(200);

        expect(res.body.success).toBe(true);
        const passedConfig = mockedUpdateClient.mock.calls[0][1] as Record<string, unknown>;
        expect(passedConfig.name).toBe('Acme Updated');
        expect(passedConfig.folderPath).toBe('/new');
        expect(passedConfig.fieldOverrides).toEqual(EXISTING_CLIENT.fieldOverrides);
        expect(passedConfig.model).toBe(EXISTING_CLIENT.model);
        expect(passedConfig.promptOverride).toEqual(EXISTING_CLIENT.promptOverride);
    });

    it('preserves existing overrides when updating core properties', async () => {
        await request(app).put('/api/clients/acme').send({ name: 'New Name', folderPath: '/new-path' }).expect(200);

        const passedConfig = mockedUpdateClient.mock.calls[0][1] as Record<string, unknown>;
        expect(passedConfig.fieldOverrides).toEqual(EXISTING_CLIENT.fieldOverrides);
        expect(passedConfig.model).toBe('gemini-2.0-flash');
        expect(passedConfig.promptOverride).toEqual({ preamble: 'Custom preamble' });
    });

    it('passes optional fields', async () => {
        const tagOverrides = { Vendor: { values: ['Y'] } };

        await request(app)
            .put('/api/clients/acme')
            .send({ name: 'A', folderPath: '/f', apiKeyEnvVar: 'K', tagOverrides })
            .expect(200);

        expect(mockedUpdateClient).toHaveBeenCalledWith(
            'acme',
            expect.objectContaining({ apiKeyEnvVar: 'K', tagOverrides })
        );
    });

    it('clears apiKeyEnvVar when sent as empty string', async () => {
        await request(app).put('/api/clients/acme').send({ name: 'A', folderPath: '/f', apiKeyEnvVar: '' }).expect(200);

        const passedConfig = mockedUpdateClient.mock.calls[0][1] as Record<string, unknown>;
        expect(passedConfig.apiKeyEnvVar).toBeUndefined();
    });

    it('returns 404 when client not found', async () => {
        mockedGetClient.mockRejectedValue(new Error('Client "nope" not found'));

        const res = await request(app).put('/api/clients/nope').send({ name: 'X', folderPath: '/f' }).expect(404);

        expect(res.body.error).toContain('not found');
    });

    it('returns 400 on validation error', async () => {
        mockedUpdateClient.mockRejectedValue(new Error('bad data'));

        const res = await request(app).put('/api/clients/acme').send({ name: '', folderPath: '' }).expect(400);

        expect(res.body.error).toBe('Failed to update client');
    });
});

// ============================================================================
// DELETE /api/clients/:id
// ============================================================================

describe('DELETE /api/clients/:id', () => {
    it('deletes a client', async () => {
        mockedDeleteClient.mockResolvedValue(undefined as any);

        const res = await request(app).delete('/api/clients/acme').expect(200);

        expect(res.body.success).toBe(true);
        expect(mockedDeleteClient).toHaveBeenCalledWith('acme');
    });

    it('returns 404 when client not found', async () => {
        mockedDeleteClient.mockRejectedValue(new Error('Client "nope" not found'));

        await request(app).delete('/api/clients/nope').expect(404);
    });

    it('returns 500 on generic error', async () => {
        mockedDeleteClient.mockRejectedValue(new Error('permission denied'));

        const res = await request(app).delete('/api/clients/acme').expect(500);

        expect(res.body.error).toBe('Failed to delete client');
    });
});

// ============================================================================
// GET /api/clients/:id/status
// ============================================================================

describe('GET /api/clients/:id/status', () => {
    it('returns folder PDF counts', async () => {
        mockedGetClient.mockResolvedValue({ folderPath: '/invoices/acme' } as any);

        const res = await request(app).get('/api/clients/acme/status').expect(200);

        expect(res.body.clientId).toBe('acme');
        expect(res.body.pending).toBe(3);
        expect(res.body.processed).toBe(7);
    });

    it('returns 404 when client not found', async () => {
        mockedGetClient.mockRejectedValue(new Error('Client "nope" not found'));

        await request(app).get('/api/clients/nope/status').expect(404);
    });

    it('returns 500 on generic error', async () => {
        mockedGetClient.mockRejectedValue(new Error('disk error'));

        const res = await request(app).get('/api/clients/acme/status').expect(500);

        expect(res.body.error).toBe('Failed to get client status');
    });
});

// ============================================================================
// GET /api/clients/:id/config
// ============================================================================

describe('GET /api/clients/:id/config', () => {
    it('returns annotated config', async () => {
        const annotated = { fields: { source: 'global' }, model: { source: 'client' } };
        mockedGetAnnotatedClientConfig.mockResolvedValue(annotated as any);

        const res = await request(app).get('/api/clients/acme/config').expect(200);

        expect(res.body).toEqual(annotated);
        expect(mockedLoadConfig).toHaveBeenCalledWith({ requireFolders: false });
    });

    it('returns 404 when client not found', async () => {
        mockedGetAnnotatedClientConfig.mockRejectedValue(new Error('Client "nope" not found'));

        await request(app).get('/api/clients/nope/config').expect(404);
    });

    it('returns 500 on generic error', async () => {
        mockedGetAnnotatedClientConfig.mockRejectedValue(new Error('parse error'));

        const res = await request(app).get('/api/clients/acme/config').expect(500);

        expect(res.body.error).toBe('Failed to get client config');
    });
});

// ============================================================================
// PUT /api/clients/:id/overrides
// ============================================================================

describe('PUT /api/clients/:id/overrides', () => {
    const annotated = { fields: { source: 'client' } };

    beforeEach(() => {
        mockedSaveClientOverrides.mockResolvedValue(undefined as any);
        mockedGetAnnotatedClientConfig.mockResolvedValue(annotated as any);
    });

    it.each(VALID_OVERRIDE_SECTIONS)('saves overrides for section "%s"', async (section) => {
        const data = { key: 'value' };

        const res = await request(app).put('/api/clients/acme/overrides').send({ section, data }).expect(200);

        expect(res.body.success).toBe(true);
        expect(mockedSaveClientOverrides).toHaveBeenCalledWith('acme', section, data);
        expect(res.body.fields).toEqual(annotated.fields);
    });

    it('returns 400 when section is missing', async () => {
        const res = await request(app)
            .put('/api/clients/acme/overrides')
            .send({ data: { x: 1 } })
            .expect(400);

        expect(res.body.error).toBe('section and data are required');
    });

    it('returns 400 when data is missing', async () => {
        const res = await request(app).put('/api/clients/acme/overrides').send({ section: 'fields' }).expect(400);

        expect(res.body.error).toBe('section and data are required');
    });

    it('returns 400 for invalid section', async () => {
        const res = await request(app)
            .put('/api/clients/acme/overrides')
            .send({ section: 'bogus', data: {} })
            .expect(400);

        expect(res.body.error).toContain('Invalid section');
    });

    it('returns 404 when client not found', async () => {
        mockedSaveClientOverrides.mockRejectedValue(new Error('Client "nope" not found'));

        await request(app).put('/api/clients/nope/overrides').send({ section: 'fields', data: {} }).expect(404);
    });
});

// ============================================================================
// DELETE /api/clients/:id/overrides/:section
// ============================================================================

describe('DELETE /api/clients/:id/overrides/:section', () => {
    const annotated = { fields: { source: 'global' } };

    beforeEach(() => {
        mockedRemoveClientOverrides.mockResolvedValue(undefined as any);
        mockedGetAnnotatedClientConfig.mockResolvedValue(annotated as any);
    });

    it.each(VALID_OVERRIDE_SECTIONS)('removes overrides for section "%s"', async (section) => {
        const res = await request(app).delete(`/api/clients/acme/overrides/${section}`).expect(200);

        expect(res.body.success).toBe(true);
        expect(mockedRemoveClientOverrides).toHaveBeenCalledWith('acme', section);
    });

    it('returns 400 for invalid section', async () => {
        const res = await request(app).delete('/api/clients/acme/overrides/bogus').expect(400);

        expect(res.body.error).toContain('Invalid section');
    });

    it('returns 404 when client not found', async () => {
        mockedRemoveClientOverrides.mockRejectedValue(new Error('Client "nope" not found'));

        await request(app).delete('/api/clients/nope/overrides/fields').expect(404);
    });
});

// ============================================================================
// POST /api/clients/:id/prompt/preview
// ============================================================================

describe('POST /api/clients/:id/prompt/preview', () => {
    it('returns assembled prompt preview for client', async () => {
        const mergedConfig = {
            model: 'gemini-2.0-flash',
            fieldDefinitions: [{ key: 'total', label: 'Total', type: 'number', enabled: true }],
            promptTemplate: { preamble: 'Analyze this invoice' }
        };
        mockedGetClientConfig.mockResolvedValue(mergedConfig as any);
        mockedBuildPromptPreview.mockReturnValue('Assembled prompt text here');

        const res = await request(app).post('/api/clients/acme/prompt/preview').send({}).expect(200);

        expect(res.body.preview).toBe('Assembled prompt text here');
        expect(mockedGetClientConfig).toHaveBeenCalledWith('acme', MOCK_GLOBAL_CONFIG);
        expect(mockedBuildPromptPreview).toHaveBeenCalledWith(mergedConfig, {});
    });

    it('passes promptTemplate overrides to buildPromptPreview', async () => {
        mockedGetClientConfig.mockResolvedValue({ model: 'test' } as any);
        mockedBuildPromptPreview.mockReturnValue('Preview with override');

        const override = { preamble: 'Custom preamble' };
        const res = await request(app)
            .post('/api/clients/acme/prompt/preview')
            .send({ promptTemplate: override })
            .expect(200);

        expect(res.body.preview).toBe('Preview with override');
        expect(mockedBuildPromptPreview).toHaveBeenCalledWith({ model: 'test' }, override);
    });

    it('returns 404 when client not found', async () => {
        mockedGetClientConfig.mockRejectedValue(new Error('Client "nope" not found'));

        const res = await request(app).post('/api/clients/nope/prompt/preview').send({}).expect(404);

        expect(res.body.error).toContain('not found');
    });
});
