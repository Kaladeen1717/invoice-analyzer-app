const request = require('supertest');

jest.mock('../../src/config');
jest.mock('../../src/prompt-builder');

const {
    loadConfig,
    saveConfig,
    updateFieldDefinitions,
    updateTagDefinitions,
    updatePromptTemplate,
    updateRawPrompt,
    clearRawPrompt,
    exportConfig,
    importConfig,
    listBackups,
    restoreBackup
} = require('../../src/config');
const { buildPromptPreview } = require('../../src/prompt-builder');

const app = require('../../server');

const MOCK_CONFIG = {
    model: 'gemini-3-flash-preview',
    fieldDefinitions: [{ key: 'vendor', label: 'Vendor', type: 'text' }],
    tagDefinitions: [{ key: 'category', label: 'Category', values: ['A', 'B'] }],
    output: { filenameTemplate: '{vendor}_{date}' },
    processing: { concurrency: 3 },
    promptTemplate: { header: 'Extract fields', footer: 'Return JSON' },
    rawPrompt: null
};

beforeEach(() => {
    jest.clearAllMocks();
    loadConfig.mockResolvedValue(MOCK_CONFIG);
});

// ============================================================================
// GET /api/config
// ============================================================================

describe('GET /api/config', () => {
    it('returns global configuration', async () => {
        const res = await request(app).get('/api/config').expect(200);

        expect(res.body.model).toBe('gemini-3-flash-preview');
        expect(res.body.fieldDefinitions).toEqual(MOCK_CONFIG.fieldDefinitions);
        expect(res.body.tagDefinitions).toEqual(MOCK_CONFIG.tagDefinitions);
        expect(res.body.output).toEqual(MOCK_CONFIG.output);
        expect(res.body.processing).toEqual(MOCK_CONFIG.processing);
        expect(loadConfig).toHaveBeenCalledWith({ requireFolders: false });
    });

    it('returns 500 on error', async () => {
        loadConfig.mockRejectedValue(new Error('parse error'));

        const res = await request(app).get('/api/config').expect(500);

        expect(res.body.error).toBe('Failed to load config');
    });
});

// ============================================================================
// PUT /api/config/fields
// ============================================================================

describe('PUT /api/config/fields', () => {
    it('updates field definitions', async () => {
        updateFieldDefinitions.mockResolvedValue();
        const fieldDefinitions = [{ key: 'amount', label: 'Amount', type: 'number' }];

        const res = await request(app).put('/api/config/fields').send({ fieldDefinitions }).expect(200);

        expect(res.body.success).toBe(true);
        expect(updateFieldDefinitions).toHaveBeenCalledWith(fieldDefinitions);
    });

    it('returns 400 when fieldDefinitions is missing', async () => {
        const res = await request(app).put('/api/config/fields').send({}).expect(400);

        expect(res.body.error).toBe('fieldDefinitions array is required');
    });

    it('returns 400 on validation error', async () => {
        updateFieldDefinitions.mockRejectedValue(new Error('invalid type'));

        const res = await request(app)
            .put('/api/config/fields')
            .send({ fieldDefinitions: [{ key: 'x', type: 'bad' }] })
            .expect(400);

        expect(res.body.error).toBe('Failed to update field definitions');
    });
});

// ============================================================================
// GET /api/config/tags
// ============================================================================

describe('GET /api/config/tags', () => {
    it('returns tag definitions', async () => {
        const res = await request(app).get('/api/config/tags').expect(200);

        expect(res.body.tagDefinitions).toEqual(MOCK_CONFIG.tagDefinitions);
    });

    it('returns null when no tags defined', async () => {
        loadConfig.mockResolvedValue({ ...MOCK_CONFIG, tagDefinitions: undefined });

        const res = await request(app).get('/api/config/tags').expect(200);

        expect(res.body.tagDefinitions).toBeNull();
    });

    it('returns 500 on error', async () => {
        loadConfig.mockRejectedValue(new Error('read error'));

        const res = await request(app).get('/api/config/tags').expect(500);

        expect(res.body.error).toBe('Failed to load tag definitions');
    });
});

// ============================================================================
// PUT /api/config/tags
// ============================================================================

describe('PUT /api/config/tags', () => {
    it('updates tag definitions', async () => {
        updateTagDefinitions.mockResolvedValue();
        const tagDefinitions = [{ key: 'type', label: 'Type', values: ['X'] }];

        const res = await request(app).put('/api/config/tags').send({ tagDefinitions }).expect(200);

        expect(res.body.success).toBe(true);
        expect(updateTagDefinitions).toHaveBeenCalledWith(tagDefinitions);
    });

    it('returns 400 when tagDefinitions is missing', async () => {
        const res = await request(app).put('/api/config/tags').send({}).expect(400);

        expect(res.body.error).toBe('tagDefinitions array is required');
    });

    it('returns 400 on validation error', async () => {
        updateTagDefinitions.mockRejectedValue(new Error('bad values'));

        const res = await request(app)
            .put('/api/config/tags')
            .send({ tagDefinitions: [{}] })
            .expect(400);

        expect(res.body.error).toBe('Failed to update tag definitions');
    });
});

// ============================================================================
// GET /api/config/prompt
// ============================================================================

describe('GET /api/config/prompt', () => {
    it('returns prompt template and raw prompt', async () => {
        const res = await request(app).get('/api/config/prompt').expect(200);

        expect(res.body.promptTemplate).toEqual(MOCK_CONFIG.promptTemplate);
        expect(res.body.rawPrompt).toBeNull();
    });

    it('returns rawPrompt when set', async () => {
        loadConfig.mockResolvedValue({ ...MOCK_CONFIG, rawPrompt: 'custom prompt text' });

        const res = await request(app).get('/api/config/prompt').expect(200);

        expect(res.body.rawPrompt).toBe('custom prompt text');
    });

    it('returns 500 on error', async () => {
        loadConfig.mockRejectedValue(new Error('fail'));

        await request(app).get('/api/config/prompt').expect(500);
    });
});

// ============================================================================
// PUT /api/config/prompt
// ============================================================================

describe('PUT /api/config/prompt', () => {
    it('updates prompt template', async () => {
        updatePromptTemplate.mockResolvedValue();
        const promptTemplate = { header: 'New header' };

        const res = await request(app).put('/api/config/prompt').send({ promptTemplate }).expect(200);

        expect(res.body.success).toBe(true);
        expect(updatePromptTemplate).toHaveBeenCalledWith(promptTemplate);
    });

    it('returns 400 when promptTemplate is missing', async () => {
        const res = await request(app).put('/api/config/prompt').send({}).expect(400);

        expect(res.body.error).toBe('promptTemplate object is required');
    });

    it('returns 400 on validation error', async () => {
        updatePromptTemplate.mockRejectedValue(new Error('invalid'));

        const res = await request(app).put('/api/config/prompt').send({ promptTemplate: {} }).expect(400);

        expect(res.body.error).toBe('Failed to update prompt template');
    });
});

// ============================================================================
// PUT /api/config/prompt/raw
// ============================================================================

describe('PUT /api/config/prompt/raw', () => {
    it('saves raw prompt', async () => {
        updateRawPrompt.mockResolvedValue();

        const res = await request(app)
            .put('/api/config/prompt/raw')
            .send({ rawPrompt: 'Extract all data' })
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(updateRawPrompt).toHaveBeenCalledWith('Extract all data');
    });

    it('returns 400 when rawPrompt is missing', async () => {
        const res = await request(app).put('/api/config/prompt/raw').send({}).expect(400);

        expect(res.body.error).toBe('rawPrompt string is required');
    });

    it('returns 400 on error', async () => {
        updateRawPrompt.mockRejectedValue(new Error('write failed'));

        const res = await request(app).put('/api/config/prompt/raw').send({ rawPrompt: 'x' }).expect(400);

        expect(res.body.error).toBe('Failed to update raw prompt');
    });
});

// ============================================================================
// DELETE /api/config/prompt/raw
// ============================================================================

describe('DELETE /api/config/prompt/raw', () => {
    it('clears raw prompt', async () => {
        clearRawPrompt.mockResolvedValue();

        const res = await request(app).delete('/api/config/prompt/raw').expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.message).toContain('structured template');
        expect(clearRawPrompt).toHaveBeenCalled();
    });

    it('returns 500 on error', async () => {
        clearRawPrompt.mockRejectedValue(new Error('write failed'));

        const res = await request(app).delete('/api/config/prompt/raw').expect(500);

        expect(res.body.error).toBe('Failed to clear raw prompt');
    });
});

// ============================================================================
// POST /api/config/prompt/preview
// ============================================================================

describe('POST /api/config/prompt/preview', () => {
    it('builds prompt preview from current config', async () => {
        buildPromptPreview.mockReturnValue('Generated prompt text');

        const res = await request(app).post('/api/config/prompt/preview').send({}).expect(200);

        expect(res.body.preview).toBe('Generated prompt text');
        expect(buildPromptPreview).toHaveBeenCalledWith(MOCK_CONFIG, {});
    });

    it('passes template override to preview builder', async () => {
        buildPromptPreview.mockReturnValue('Custom preview');
        const override = { header: 'Override header' };

        const res = await request(app)
            .post('/api/config/prompt/preview')
            .send({ promptTemplate: override })
            .expect(200);

        expect(res.body.preview).toBe('Custom preview');
        expect(buildPromptPreview).toHaveBeenCalledWith(MOCK_CONFIG, override);
    });

    it('returns 500 on error', async () => {
        buildPromptPreview.mockImplementation(() => {
            throw new Error('build failed');
        });

        const res = await request(app).post('/api/config/prompt/preview').send({}).expect(500);

        expect(res.body.error).toBe('Failed to build prompt preview');
    });
});

// ============================================================================
// PUT /api/config/output
// ============================================================================

describe('PUT /api/config/output', () => {
    it('updates filename template', async () => {
        saveConfig.mockResolvedValue();

        const res = await request(app)
            .put('/api/config/output')
            .send({ filenameTemplate: '{vendor}_{amount}' })
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(saveConfig).toHaveBeenCalledWith({
            output: { ...MOCK_CONFIG.output, filenameTemplate: '{vendor}_{amount}' }
        });
    });

    it('returns 400 when filenameTemplate is missing', async () => {
        const res = await request(app).put('/api/config/output').send({}).expect(400);

        expect(res.body.error).toContain('filenameTemplate');
    });

    it('returns 400 when filenameTemplate is not a string', async () => {
        const res = await request(app).put('/api/config/output').send({ filenameTemplate: 123 }).expect(400);

        expect(res.body.error).toContain('filenameTemplate');
    });

    it('returns 400 when filenameTemplate is empty', async () => {
        const res = await request(app).put('/api/config/output').send({ filenameTemplate: '' }).expect(400);

        expect(res.body.error).toContain('filenameTemplate');
    });

    it('returns 400 on save error', async () => {
        saveConfig.mockRejectedValue(new Error('write failed'));

        const res = await request(app).put('/api/config/output').send({ filenameTemplate: '{vendor}' }).expect(400);

        expect(res.body.error).toBe('Failed to update output config');
    });
});

// ============================================================================
// PUT /api/config/model
// ============================================================================

describe('PUT /api/config/model', () => {
    it('updates global model', async () => {
        saveConfig.mockResolvedValue();

        const res = await request(app).put('/api/config/model').send({ model: 'gemini-2.0-flash' }).expect(200);

        expect(res.body.success).toBe(true);
        expect(saveConfig).toHaveBeenCalledWith({ model: 'gemini-2.0-flash' });
    });

    it('returns 400 when model is missing', async () => {
        const res = await request(app).put('/api/config/model').send({}).expect(400);

        expect(res.body.error).toContain('model');
    });

    it('returns 400 when model is not a string', async () => {
        const res = await request(app).put('/api/config/model').send({ model: 42 }).expect(400);

        expect(res.body.error).toContain('model');
    });

    it('returns 400 on save error', async () => {
        saveConfig.mockRejectedValue(new Error('write failed'));

        const res = await request(app).put('/api/config/model').send({ model: 'x' }).expect(400);

        expect(res.body.error).toBe('Failed to update model');
    });
});

// ============================================================================
// GET /api/config/export
// ============================================================================

describe('GET /api/config/export', () => {
    it('exports all config by default', async () => {
        const bundle = { scope: 'all', config: MOCK_CONFIG };
        exportConfig.mockResolvedValue(bundle);

        const res = await request(app).get('/api/config/export').expect(200);

        expect(res.body).toEqual(bundle);
        expect(exportConfig).toHaveBeenCalledWith('all');
    });

    it('exports specific scope', async () => {
        exportConfig.mockResolvedValue({ scope: 'fields' });

        await request(app).get('/api/config/export?scope=fields').expect(200);

        expect(exportConfig).toHaveBeenCalledWith('fields');
    });

    it('returns 404 when client not found', async () => {
        exportConfig.mockRejectedValue(new Error('Client "nope" not found'));

        const res = await request(app).get('/api/config/export?scope=client:nope').expect(404);

        expect(res.body.error).toContain('not found');
    });

    it('returns 400 on other errors', async () => {
        exportConfig.mockRejectedValue(new Error('invalid scope'));

        const res = await request(app).get('/api/config/export?scope=bad').expect(400);

        expect(res.body.error).toContain('invalid scope');
    });
});

// ============================================================================
// POST /api/config/import
// ============================================================================

describe('POST /api/config/import', () => {
    it('imports config bundle', async () => {
        const result = { restored: ['fields', 'tags'], backupId: 'backup-123' };
        importConfig.mockResolvedValue(result);
        const bundle = { scope: 'all', config: {} };

        const res = await request(app).post('/api/config/import').send(bundle).expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.restored).toEqual(['fields', 'tags']);
        expect(importConfig).toHaveBeenCalledWith(bundle);
    });

    it('returns 400 on import error', async () => {
        importConfig.mockRejectedValue(new Error('missing scope'));

        const res = await request(app).post('/api/config/import').send({}).expect(400);

        expect(res.body.error).toBe('Import failed');
    });
});

// ============================================================================
// GET /api/config/backups
// ============================================================================

describe('GET /api/config/backups', () => {
    it('lists available backups', async () => {
        const backups = [
            { id: 'backup-1', timestamp: '2026-01-01T00:00:00Z' },
            { id: 'backup-2', timestamp: '2026-01-02T00:00:00Z' }
        ];
        listBackups.mockResolvedValue(backups);

        const res = await request(app).get('/api/config/backups').expect(200);

        expect(res.body.backups).toEqual(backups);
    });

    it('returns 500 on error', async () => {
        listBackups.mockRejectedValue(new Error('disk error'));

        const res = await request(app).get('/api/config/backups').expect(500);

        expect(res.body.error).toBe('Failed to list backups');
    });
});

// ============================================================================
// POST /api/config/restore
// ============================================================================

describe('POST /api/config/restore', () => {
    it('restores from backup', async () => {
        const result = { restoredFrom: 'backup-1', safetyBackupId: 'safety-1' };
        restoreBackup.mockResolvedValue(result);

        const res = await request(app).post('/api/config/restore').send({ backupId: 'backup-1' }).expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.restoredFrom).toBe('backup-1');
        expect(restoreBackup).toHaveBeenCalledWith('backup-1');
    });

    it('returns 400 when backupId is missing', async () => {
        const res = await request(app).post('/api/config/restore').send({}).expect(400);

        expect(res.body.error).toBe('backupId is required');
    });

    it('returns 404 when backup not found', async () => {
        restoreBackup.mockRejectedValue(new Error('Backup not found'));

        const res = await request(app).post('/api/config/restore').send({ backupId: 'nope' }).expect(404);

        expect(res.body.error).toBe('Restore failed');
    });

    it('returns 500 on generic error', async () => {
        restoreBackup.mockRejectedValue(new Error('disk failure'));

        const res = await request(app).post('/api/config/restore').send({ backupId: 'x' }).expect(500);

        expect(res.body.error).toBe('Restore failed');
    });
});
