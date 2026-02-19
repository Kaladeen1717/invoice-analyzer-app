const request = require('supertest');

jest.mock('../../src/client-manager');
jest.mock('../../src/config');

const {
    getAllClients,
    getClient,
    createClient,
    updateClient,
    deleteClient,
    getClientFolderStatus,
    getAnnotatedClientConfig,
    saveClientOverrides,
    removeClientOverrides
} = require('../../src/client-manager');
const { loadConfig } = require('../../src/config');
const { VALID_OVERRIDE_SECTIONS } = require('../../src/constants');

const app = require('../../server');

const MOCK_FOLDER_STATUS = { pending: 3, processed: 7, total: 10 };
const MOCK_GLOBAL_CONFIG = { output: { processedOriginalSubfolder: 'processed-original' } };

beforeEach(() => {
    jest.clearAllMocks();
    loadConfig.mockResolvedValue(MOCK_GLOBAL_CONFIG);
    getClientFolderStatus.mockResolvedValue(MOCK_FOLDER_STATUS);
});

// ============================================================================
// GET /api/clients
// ============================================================================

describe('GET /api/clients', () => {
    it('returns enriched client list in multi-client mode', async () => {
        getAllClients.mockResolvedValue({
            acme: { name: 'Acme Corp', enabled: true, folderPath: '/invoices/acme' },
            globex: { name: 'Globex', enabled: false, folderPath: '/invoices/globex', apiKeyEnvVar: 'GLOBEX_KEY' }
        });

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
        getAllClients.mockResolvedValue(null);

        const res = await request(app).get('/api/clients').expect(200);

        expect(res.body.mode).toBe('single-client');
        expect(res.body.clients).toEqual([]);
    });

    it('returns 500 on error', async () => {
        getAllClients.mockRejectedValue(new Error('disk read failed'));

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
        getClient.mockResolvedValue({ name: 'Acme', enabled: true, folderPath: '/invoices/acme' });

        const res = await request(app).get('/api/clients/acme').expect(200);

        expect(res.body.clientId).toBe('acme');
        expect(res.body.name).toBe('Acme');
        expect(res.body.folderStatus).toEqual(MOCK_FOLDER_STATUS);
    });

    it('returns 404 when client not found', async () => {
        getClient.mockRejectedValue(new Error('Client "nope" not found'));

        const res = await request(app).get('/api/clients/nope').expect(404);

        expect(res.body.error).toContain('not found');
    });

    it('returns 500 on generic error', async () => {
        getClient.mockRejectedValue(new Error('unexpected'));

        const res = await request(app).get('/api/clients/acme').expect(500);

        expect(res.body.error).toBe('Failed to get client');
    });
});

// ============================================================================
// POST /api/clients
// ============================================================================

describe('POST /api/clients', () => {
    it('creates a client and returns 201', async () => {
        createClient.mockResolvedValue();

        const res = await request(app)
            .post('/api/clients')
            .send({ clientId: 'acme', name: 'Acme Corp', folderPath: '/invoices/acme' })
            .expect(201);

        expect(res.body.success).toBe(true);
        expect(res.body.clientId).toBe('acme');
        expect(createClient).toHaveBeenCalledWith('acme', {
            name: 'Acme Corp',
            enabled: true,
            folderPath: '/invoices/acme'
        });
    });

    it('passes optional apiKeyEnvVar and tagOverrides', async () => {
        createClient.mockResolvedValue();
        const tagOverrides = { Vendor: { values: ['X'] } };

        await request(app)
            .post('/api/clients')
            .send({ clientId: 'acme', name: 'Acme', folderPath: '/f', apiKeyEnvVar: 'KEY', tagOverrides })
            .expect(201);

        expect(createClient).toHaveBeenCalledWith(
            'acme',
            expect.objectContaining({ apiKeyEnvVar: 'KEY', tagOverrides })
        );
    });

    it('defaults enabled to true when not provided', async () => {
        createClient.mockResolvedValue();

        await request(app).post('/api/clients').send({ clientId: 'acme', name: 'A', folderPath: '/f' }).expect(201);

        expect(createClient).toHaveBeenCalledWith('acme', expect.objectContaining({ enabled: true }));
    });

    it('allows enabled=false', async () => {
        createClient.mockResolvedValue();

        await request(app)
            .post('/api/clients')
            .send({ clientId: 'acme', name: 'A', folderPath: '/f', enabled: false })
            .expect(201);

        expect(createClient).toHaveBeenCalledWith('acme', expect.objectContaining({ enabled: false }));
    });

    it('returns 400 when clientId is missing', async () => {
        const res = await request(app).post('/api/clients').send({ name: 'No ID' }).expect(400);

        expect(res.body.error).toBe('clientId is required');
    });

    it('returns 409 when client already exists', async () => {
        createClient.mockRejectedValue(new Error('Client "acme" already exists'));

        const res = await request(app)
            .post('/api/clients')
            .send({ clientId: 'acme', name: 'Acme', folderPath: '/f' })
            .expect(409);

        expect(res.body.error).toContain('already exists');
    });

    it('returns 400 on validation error', async () => {
        createClient.mockRejectedValue(new Error('Invalid folder path'));

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
    it('updates a client', async () => {
        updateClient.mockResolvedValue();

        const res = await request(app)
            .put('/api/clients/acme')
            .send({ name: 'Acme Updated', folderPath: '/new' })
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(updateClient).toHaveBeenCalledWith('acme', expect.objectContaining({ name: 'Acme Updated' }));
    });

    it('passes optional fields', async () => {
        updateClient.mockResolvedValue();
        const tagOverrides = { Vendor: { values: ['Y'] } };

        await request(app)
            .put('/api/clients/acme')
            .send({ name: 'A', folderPath: '/f', apiKeyEnvVar: 'K', tagOverrides })
            .expect(200);

        expect(updateClient).toHaveBeenCalledWith('acme', expect.objectContaining({ apiKeyEnvVar: 'K', tagOverrides }));
    });

    it('returns 404 when client not found', async () => {
        updateClient.mockRejectedValue(new Error('Client "nope" not found'));

        const res = await request(app).put('/api/clients/nope').send({ name: 'X', folderPath: '/f' }).expect(404);

        expect(res.body.error).toContain('not found');
    });

    it('returns 400 on validation error', async () => {
        updateClient.mockRejectedValue(new Error('bad data'));

        const res = await request(app).put('/api/clients/acme').send({ name: '', folderPath: '' }).expect(400);

        expect(res.body.error).toBe('Failed to update client');
    });
});

// ============================================================================
// DELETE /api/clients/:id
// ============================================================================

describe('DELETE /api/clients/:id', () => {
    it('deletes a client', async () => {
        deleteClient.mockResolvedValue();

        const res = await request(app).delete('/api/clients/acme').expect(200);

        expect(res.body.success).toBe(true);
        expect(deleteClient).toHaveBeenCalledWith('acme');
    });

    it('returns 404 when client not found', async () => {
        deleteClient.mockRejectedValue(new Error('Client "nope" not found'));

        await request(app).delete('/api/clients/nope').expect(404);
    });

    it('returns 500 on generic error', async () => {
        deleteClient.mockRejectedValue(new Error('permission denied'));

        const res = await request(app).delete('/api/clients/acme').expect(500);

        expect(res.body.error).toBe('Failed to delete client');
    });
});

// ============================================================================
// GET /api/clients/:id/status
// ============================================================================

describe('GET /api/clients/:id/status', () => {
    it('returns folder PDF counts', async () => {
        getClient.mockResolvedValue({ folderPath: '/invoices/acme' });

        const res = await request(app).get('/api/clients/acme/status').expect(200);

        expect(res.body.clientId).toBe('acme');
        expect(res.body.pending).toBe(3);
        expect(res.body.processed).toBe(7);
    });

    it('returns 404 when client not found', async () => {
        getClient.mockRejectedValue(new Error('Client "nope" not found'));

        await request(app).get('/api/clients/nope/status').expect(404);
    });

    it('returns 500 on generic error', async () => {
        getClient.mockRejectedValue(new Error('disk error'));

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
        getAnnotatedClientConfig.mockResolvedValue(annotated);

        const res = await request(app).get('/api/clients/acme/config').expect(200);

        expect(res.body).toEqual(annotated);
        expect(loadConfig).toHaveBeenCalledWith({ requireFolders: false });
    });

    it('returns 404 when client not found', async () => {
        getAnnotatedClientConfig.mockRejectedValue(new Error('Client "nope" not found'));

        await request(app).get('/api/clients/nope/config').expect(404);
    });

    it('returns 500 on generic error', async () => {
        getAnnotatedClientConfig.mockRejectedValue(new Error('parse error'));

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
        saveClientOverrides.mockResolvedValue();
        getAnnotatedClientConfig.mockResolvedValue(annotated);
    });

    it.each(VALID_OVERRIDE_SECTIONS)('saves overrides for section "%s"', async (section) => {
        const data = { key: 'value' };

        const res = await request(app).put('/api/clients/acme/overrides').send({ section, data }).expect(200);

        expect(res.body.success).toBe(true);
        expect(saveClientOverrides).toHaveBeenCalledWith('acme', section, data);
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
        saveClientOverrides.mockRejectedValue(new Error('Client "nope" not found'));

        await request(app).put('/api/clients/nope/overrides').send({ section: 'fields', data: {} }).expect(404);
    });
});

// ============================================================================
// DELETE /api/clients/:id/overrides/:section
// ============================================================================

describe('DELETE /api/clients/:id/overrides/:section', () => {
    const annotated = { fields: { source: 'global' } };

    beforeEach(() => {
        removeClientOverrides.mockResolvedValue();
        getAnnotatedClientConfig.mockResolvedValue(annotated);
    });

    it.each(VALID_OVERRIDE_SECTIONS)('removes overrides for section "%s"', async (section) => {
        const res = await request(app).delete(`/api/clients/acme/overrides/${section}`).expect(200);

        expect(res.body.success).toBe(true);
        expect(removeClientOverrides).toHaveBeenCalledWith('acme', section);
    });

    it('returns 400 for invalid section', async () => {
        const res = await request(app).delete('/api/clients/acme/overrides/bogus').expect(400);

        expect(res.body.error).toContain('Invalid section');
    });

    it('returns 404 when client not found', async () => {
        removeClientOverrides.mockRejectedValue(new Error('Client "nope" not found'));

        await request(app).delete('/api/clients/nope/overrides/fields').expect(404);
    });
});
