import request from 'supertest';

jest.mock('../../src/config.js');
jest.mock('../../src/prompt-builder.js');

import {
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
} from '../../src/config.js';
import { buildPromptPreview } from '../../src/prompt-builder.js';

const mockedLoadConfig = jest.mocked(loadConfig);
const mockedSaveConfig = jest.mocked(saveConfig);
const mockedUpdateFieldDefinitions = jest.mocked(updateFieldDefinitions);
const mockedUpdateTagDefinitions = jest.mocked(updateTagDefinitions);
const mockedUpdatePromptTemplate = jest.mocked(updatePromptTemplate);
const mockedUpdateRawPrompt = jest.mocked(updateRawPrompt);
const mockedClearRawPrompt = jest.mocked(clearRawPrompt);
const mockedExportConfig = jest.mocked(exportConfig);
const mockedImportConfig = jest.mocked(importConfig);
const mockedListBackups = jest.mocked(listBackups);
const mockedRestoreBackup = jest.mocked(restoreBackup);
const mockedBuildPromptPreview = jest.mocked(buildPromptPreview);

import app from '../../server.js';

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
    mockedLoadConfig.mockResolvedValue(MOCK_CONFIG as any);
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
        expect(mockedLoadConfig).toHaveBeenCalledWith({ requireFolders: false });
    });

    it('returns 500 on error', async () => {
        mockedLoadConfig.mockRejectedValue(new Error('parse error'));

        const res = await request(app).get('/api/config').expect(500);

        expect(res.body.error).toBe('Failed to load config');
    });
});

// ============================================================================
// PUT /api/config/fields
// ============================================================================

describe('PUT /api/config/fields', () => {
    it('updates field definitions', async () => {
        mockedUpdateFieldDefinitions.mockResolvedValue(undefined as any);
        const fieldDefinitions = [{ key: 'amount', label: 'Amount', type: 'number' }];

        const res = await request(app).put('/api/config/fields').send({ fieldDefinitions }).expect(200);

        expect(res.body.success).toBe(true);
        expect(mockedUpdateFieldDefinitions).toHaveBeenCalledWith(fieldDefinitions);
    });

    it('returns 400 when fieldDefinitions is missing', async () => {
        const res = await request(app).put('/api/config/fields').send({}).expect(400);

        expect(res.body.error).toBe('fieldDefinitions array is required');
    });

    it('returns 400 on validation error', async () => {
        mockedUpdateFieldDefinitions.mockRejectedValue(new Error('invalid type'));

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
        mockedLoadConfig.mockResolvedValue({ ...MOCK_CONFIG, tagDefinitions: undefined } as any);

        const res = await request(app).get('/api/config/tags').expect(200);

        expect(res.body.tagDefinitions).toBeNull();
    });

    it('returns 500 on error', async () => {
        mockedLoadConfig.mockRejectedValue(new Error('read error'));

        const res = await request(app).get('/api/config/tags').expect(500);

        expect(res.body.error).toBe('Failed to load tag definitions');
    });
});

// ============================================================================
// PUT /api/config/tags
// ============================================================================

describe('PUT /api/config/tags', () => {
    it('updates tag definitions', async () => {
        mockedUpdateTagDefinitions.mockResolvedValue(undefined as any);
        const tagDefinitions = [{ key: 'type', label: 'Type', values: ['X'] }];

        const res = await request(app).put('/api/config/tags').send({ tagDefinitions }).expect(200);

        expect(res.body.success).toBe(true);
        expect(mockedUpdateTagDefinitions).toHaveBeenCalledWith(tagDefinitions);
    });

    it('returns 400 when tagDefinitions is missing', async () => {
        const res = await request(app).put('/api/config/tags').send({}).expect(400);

        expect(res.body.error).toBe('tagDefinitions array is required');
    });

    it('returns 400 on validation error', async () => {
        mockedUpdateTagDefinitions.mockRejectedValue(new Error('bad values'));

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
        mockedLoadConfig.mockResolvedValue({ ...MOCK_CONFIG, rawPrompt: 'custom prompt text' } as any);

        const res = await request(app).get('/api/config/prompt').expect(200);

        expect(res.body.rawPrompt).toBe('custom prompt text');
    });

    it('returns 500 on error', async () => {
        mockedLoadConfig.mockRejectedValue(new Error('fail'));

        await request(app).get('/api/config/prompt').expect(500);
    });
});

// ============================================================================
// PUT /api/config/prompt
// ============================================================================

describe('PUT /api/config/prompt', () => {
    it('updates prompt template', async () => {
        mockedUpdatePromptTemplate.mockResolvedValue(undefined as any);
        const promptTemplate = { header: 'New header' };

        const res = await request(app).put('/api/config/prompt').send({ promptTemplate }).expect(200);

        expect(res.body.success).toBe(true);
        expect(mockedUpdatePromptTemplate).toHaveBeenCalledWith(promptTemplate);
    });

    it('returns 400 when promptTemplate is missing', async () => {
        const res = await request(app).put('/api/config/prompt').send({}).expect(400);

        expect(res.body.error).toBe('promptTemplate object is required');
    });

    it('returns 400 on validation error', async () => {
        mockedUpdatePromptTemplate.mockRejectedValue(new Error('invalid'));

        const res = await request(app).put('/api/config/prompt').send({ promptTemplate: {} }).expect(400);

        expect(res.body.error).toBe('Failed to update prompt template');
    });
});

// ============================================================================
// PUT /api/config/prompt/raw
// ============================================================================

describe('PUT /api/config/prompt/raw', () => {
    it('saves raw prompt', async () => {
        mockedUpdateRawPrompt.mockResolvedValue(undefined as any);

        const res = await request(app)
            .put('/api/config/prompt/raw')
            .send({ rawPrompt: 'Extract all data' })
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(mockedUpdateRawPrompt).toHaveBeenCalledWith('Extract all data');
    });

    it('returns 400 when rawPrompt is missing', async () => {
        const res = await request(app).put('/api/config/prompt/raw').send({}).expect(400);

        expect(res.body.error).toBe('rawPrompt string is required');
    });

    it('returns 400 on error', async () => {
        mockedUpdateRawPrompt.mockRejectedValue(new Error('write failed'));

        const res = await request(app).put('/api/config/prompt/raw').send({ rawPrompt: 'x' }).expect(400);

        expect(res.body.error).toBe('Failed to update raw prompt');
    });
});

// ============================================================================
// DELETE /api/config/prompt/raw
// ============================================================================

describe('DELETE /api/config/prompt/raw', () => {
    it('clears raw prompt', async () => {
        mockedClearRawPrompt.mockResolvedValue(undefined as any);

        const res = await request(app).delete('/api/config/prompt/raw').expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.message).toContain('structured template');
        expect(mockedClearRawPrompt).toHaveBeenCalled();
    });

    it('returns 500 on error', async () => {
        mockedClearRawPrompt.mockRejectedValue(new Error('write failed'));

        const res = await request(app).delete('/api/config/prompt/raw').expect(500);

        expect(res.body.error).toBe('Failed to clear raw prompt');
    });
});

// ============================================================================
// POST /api/config/prompt/preview
// ============================================================================

describe('POST /api/config/prompt/preview', () => {
    it('builds prompt preview from current config', async () => {
        mockedBuildPromptPreview.mockReturnValue('Generated prompt text');

        const res = await request(app).post('/api/config/prompt/preview').send({}).expect(200);

        expect(res.body.preview).toBe('Generated prompt text');
        expect(mockedBuildPromptPreview).toHaveBeenCalledWith(MOCK_CONFIG, {});
    });

    it('passes template override to preview builder', async () => {
        mockedBuildPromptPreview.mockReturnValue('Custom preview');
        const override = { header: 'Override header' };

        const res = await request(app)
            .post('/api/config/prompt/preview')
            .send({ promptTemplate: override })
            .expect(200);

        expect(res.body.preview).toBe('Custom preview');
        expect(mockedBuildPromptPreview).toHaveBeenCalledWith(MOCK_CONFIG, override);
    });

    it('returns 500 on error', async () => {
        mockedBuildPromptPreview.mockImplementation(() => {
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
        mockedSaveConfig.mockResolvedValue(undefined as any);

        const res = await request(app)
            .put('/api/config/output')
            .send({ filenameTemplate: '{vendor}_{amount}' })
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(mockedSaveConfig).toHaveBeenCalledWith({
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
        mockedSaveConfig.mockRejectedValue(new Error('write failed'));

        const res = await request(app).put('/api/config/output').send({ filenameTemplate: '{vendor}' }).expect(400);

        expect(res.body.error).toBe('Failed to update output config');
    });
});

// ============================================================================
// PUT /api/config/model
// ============================================================================

describe('PUT /api/config/model', () => {
    it('updates global model', async () => {
        mockedSaveConfig.mockResolvedValue(undefined as any);

        const res = await request(app).put('/api/config/model').send({ model: 'gemini-2.0-flash' }).expect(200);

        expect(res.body.success).toBe(true);
        expect(mockedSaveConfig).toHaveBeenCalledWith({ model: 'gemini-2.0-flash' });
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
        mockedSaveConfig.mockRejectedValue(new Error('write failed'));

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
        mockedExportConfig.mockResolvedValue(bundle as any);

        const res = await request(app).get('/api/config/export').expect(200);

        expect(res.body).toEqual(bundle);
        expect(mockedExportConfig).toHaveBeenCalledWith('all');
    });

    it('exports specific scope', async () => {
        mockedExportConfig.mockResolvedValue({ scope: 'fields' } as any);

        await request(app).get('/api/config/export?scope=fields').expect(200);

        expect(mockedExportConfig).toHaveBeenCalledWith('fields');
    });

    it('returns 404 when client not found', async () => {
        mockedExportConfig.mockRejectedValue(new Error('Client "nope" not found'));

        const res = await request(app).get('/api/config/export?scope=client:nope').expect(404);

        expect(res.body.error).toContain('not found');
    });

    it('returns 400 on other errors', async () => {
        mockedExportConfig.mockRejectedValue(new Error('invalid scope'));

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
        mockedImportConfig.mockResolvedValue(result as any);
        const bundle = { scope: 'all', config: {} };

        const res = await request(app).post('/api/config/import').send(bundle).expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.restored).toEqual(['fields', 'tags']);
        expect(mockedImportConfig).toHaveBeenCalledWith(bundle);
    });

    it('returns 400 on import error', async () => {
        mockedImportConfig.mockRejectedValue(new Error('missing scope'));

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
        mockedListBackups.mockResolvedValue(backups as any);

        const res = await request(app).get('/api/config/backups').expect(200);

        expect(res.body.backups).toEqual(backups);
    });

    it('returns 500 on error', async () => {
        mockedListBackups.mockRejectedValue(new Error('disk error'));

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
        mockedRestoreBackup.mockResolvedValue(result as any);

        const res = await request(app).post('/api/config/restore').send({ backupId: 'backup-1' }).expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.restoredFrom).toBe('backup-1');
        expect(mockedRestoreBackup).toHaveBeenCalledWith('backup-1');
    });

    it('returns 400 when backupId is missing', async () => {
        const res = await request(app).post('/api/config/restore').send({}).expect(400);

        expect(res.body.error).toBe('backupId is required');
    });

    it('returns 404 when backup not found', async () => {
        mockedRestoreBackup.mockRejectedValue(new Error('Backup not found'));

        const res = await request(app).post('/api/config/restore').send({ backupId: 'nope' }).expect(404);

        expect(res.body.error).toBe('Restore failed');
    });

    it('returns 500 on generic error', async () => {
        mockedRestoreBackup.mockRejectedValue(new Error('disk failure'));

        const res = await request(app).post('/api/config/restore').send({ backupId: 'x' }).expect(500);

        expect(res.body.error).toBe('Restore failed');
    });
});
