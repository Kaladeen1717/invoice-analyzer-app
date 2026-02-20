jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    promises: {
        readdir: jest.fn(),
        readFile: jest.fn(),
        writeFile: jest.fn(),
        unlink: jest.fn(),
        access: jest.fn(),
        mkdir: jest.fn()
    }
}));

const fs = require('fs').promises;
const path = require('path');

const {
    loadClientsConfig,
    getEnabledClients,
    getAllClients,
    getClientConfig,
    getAnnotatedClientConfig,
    getClient,
    createClient,
    updateClient,
    deleteClient,
    getClientFolderStatus,
    resolveApiKey,
    ensureClientDirectories,
    clientFolderExists,
    clearClientsCache,
    isMultiClientMode,
    isUsingLegacyConfig,
    saveClientOverrides,
    removeClientOverrides,
    discoverClientFiles,
    validateClientConfig
} = require('../src/client-manager');

// --- Shared fixtures ---

const MINIMAL_CLIENT = {
    name: 'Acme Corp',
    enabled: true,
    folderPath: '/invoices/acme'
};

const FULL_CLIENT = {
    ...MINIMAL_CLIENT,
    apiKeyEnvVar: 'ACME_API_KEY',
    model: 'gemini-pro',
    fieldOverrides: {
        invoiceDate: { enabled: false },
        customField: { enabled: true, type: 'text', label: 'Custom', schemaHint: 'h', instruction: 'i' }
    },
    tagOverrides: {
        private: { enabled: false },
        'custom-tag': { enabled: true, label: 'Custom Tag', instruction: 'i' }
    },
    promptOverride: { extraction: 'Custom extraction prompt' },
    outputOverride: { filenameTemplate: '{supplierName}.pdf' }
};

const GLOBAL_CONFIG = {
    processing: { concurrency: 5 },
    output: {
        filenameTemplate: '{supplierName} - {invoiceDate}.pdf',
        processedOriginalSubfolder: 'processed-original',
        processedEnrichedSubfolder: 'processed-enriched',
        csvFilename: 'invoice-log.csv'
    },
    model: 'gemini-flash',
    fieldDefinitions: [
        { key: 'supplierName', label: 'Supplier', type: 'text', schemaHint: 'h', instruction: 'i', enabled: true },
        { key: 'invoiceDate', label: 'Date', type: 'date', schemaHint: 'h', instruction: 'i', enabled: true },
        { key: 'totalAmount', label: 'Total', type: 'number', schemaHint: 'h', instruction: 'i', enabled: true }
    ],
    tagDefinitions: [
        { id: 'private', label: 'Private', instruction: 'i', enabled: true },
        { id: 'eu-reverse', label: 'EU Reverse Charge', instruction: 'i', enabled: true }
    ],
    promptTemplate: { extraction: 'Default extraction', validation: 'Default validation' }
};

/** Helper: set up fs mocks so loadClientsConfig discovers a clients/ folder */
function mockClientFolder(clients) {
    const files = Object.keys(clients).map((id) => `${id}.json`);
    fs.readdir.mockResolvedValue(files);
    for (const [id, config] of Object.entries(clients)) {
        fs.readFile.mockImplementation((filePath) => {
            const basename = path.basename(filePath, '.json');
            if (clients[basename]) {
                return Promise.resolve(JSON.stringify(clients[basename]));
            }
            const err = new Error('ENOENT');
            err.code = 'ENOENT';
            return Promise.reject(err);
        });
    }
}

beforeEach(() => {
    jest.clearAllMocks();
    clearClientsCache();
    fs.writeFile.mockResolvedValue();
    fs.mkdir.mockResolvedValue();
    // Suppress deprecation warnings in tests
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

// ============================================================================
// discoverClientFiles
// ============================================================================

describe('discoverClientFiles', () => {
    test('discovers client JSON files in clients/ folder', async () => {
        mockClientFolder({ acme: MINIMAL_CLIENT });

        const result = await discoverClientFiles();

        expect(result).toEqual({ clients: { acme: MINIMAL_CLIENT } });
    });

    test('returns null when clients/ folder does not exist', async () => {
        const err = new Error('ENOENT');
        err.code = 'ENOENT';
        fs.readdir.mockRejectedValue(err);

        const result = await discoverClientFiles();

        expect(result).toBeNull();
    });

    test('returns null when clients/ folder has no JSON files', async () => {
        fs.readdir.mockResolvedValue(['readme.txt', '.gitkeep']);

        const result = await discoverClientFiles();

        expect(result).toBeNull();
    });

    test('skips files that fail to read with ENOENT', async () => {
        fs.readdir.mockResolvedValue(['good.json', 'gone.json']);
        fs.readFile.mockImplementation((filePath) => {
            if (filePath.includes('gone')) {
                const err = new Error('ENOENT');
                err.code = 'ENOENT';
                return Promise.reject(err);
            }
            return Promise.resolve(JSON.stringify(MINIMAL_CLIENT));
        });

        const result = await discoverClientFiles();

        expect(result.clients).toHaveProperty('good');
        expect(result.clients).not.toHaveProperty('gone');
    });

    test('throws on invalid JSON in client file', async () => {
        fs.readdir.mockResolvedValue(['bad.json']);
        fs.readFile.mockResolvedValue('not valid json');

        await expect(discoverClientFiles()).rejects.toThrow('Failed to load client config "bad.json"');
    });

    test('throws on validation failure', async () => {
        fs.readdir.mockResolvedValue(['invalid.json']);
        fs.readFile.mockResolvedValue(JSON.stringify({ name: 'Test' })); // missing enabled, folderPath

        await expect(discoverClientFiles()).rejects.toThrow('must have an "enabled" boolean');
    });
});

// ============================================================================
// validateClientConfig
// ============================================================================

describe('validateClientConfig', () => {
    test('accepts valid minimal config', () => {
        expect(() => validateClientConfig('test', MINIMAL_CLIENT)).not.toThrow();
    });

    test('rejects missing name', () => {
        expect(() => validateClientConfig('test', { enabled: true, folderPath: '/p' })).toThrow(
            'must have a "name" string'
        );
    });

    test('rejects non-string name', () => {
        expect(() => validateClientConfig('test', { name: 123, enabled: true, folderPath: '/p' })).toThrow(
            'must have a "name" string'
        );
    });

    test('rejects missing enabled', () => {
        expect(() => validateClientConfig('test', { name: 'A', folderPath: '/p' })).toThrow(
            'must have an "enabled" boolean'
        );
    });

    test('rejects non-boolean enabled', () => {
        expect(() => validateClientConfig('test', { name: 'A', enabled: 'yes', folderPath: '/p' })).toThrow(
            'must have an "enabled" boolean'
        );
    });

    test('rejects missing folderPath', () => {
        expect(() => validateClientConfig('test', { name: 'A', enabled: true })).toThrow(
            'must have a "folderPath" string'
        );
    });

    test('accepts optional tagOverrides as object', () => {
        expect(() =>
            validateClientConfig('test', { ...MINIMAL_CLIENT, tagOverrides: { private: { enabled: false } } })
        ).not.toThrow();
    });

    test('rejects tagOverrides that is not an object', () => {
        expect(() => validateClientConfig('test', { ...MINIMAL_CLIENT, tagOverrides: 'bad' })).toThrow(
            '"tagOverrides" must be an object'
        );
    });

    test('rejects tagOverrides that is null', () => {
        expect(() => validateClientConfig('test', { ...MINIMAL_CLIENT, tagOverrides: null })).toThrow(
            '"tagOverrides" must be an object'
        );
    });

    test('accepts optional model as string', () => {
        expect(() => validateClientConfig('test', { ...MINIMAL_CLIENT, model: 'gemini-pro' })).not.toThrow();
    });

    test('rejects model that is not a string', () => {
        expect(() => validateClientConfig('test', { ...MINIMAL_CLIENT, model: 123 })).toThrow(
            '"model" must be a string'
        );
    });
});

// ============================================================================
// loadClientsConfig
// ============================================================================

describe('loadClientsConfig', () => {
    test('loads from clients/ folder', async () => {
        mockClientFolder({ acme: MINIMAL_CLIENT });

        const result = await loadClientsConfig();

        expect(result).toEqual({ clients: { acme: MINIMAL_CLIENT } });
    });

    test('caches result on subsequent calls', async () => {
        mockClientFolder({ acme: MINIMAL_CLIENT });

        await loadClientsConfig();
        await loadClientsConfig();

        // readdir only called once (second call uses cache)
        expect(fs.readdir).toHaveBeenCalledTimes(1);
    });

    test('falls back to legacy clients.json when clients/ folder empty', async () => {
        fs.readdir.mockResolvedValue([]); // empty clients folder
        const legacyConfig = { clients: { acme: MINIMAL_CLIENT } };
        fs.readFile.mockResolvedValue(JSON.stringify(legacyConfig));

        const result = await loadClientsConfig();

        expect(result).toEqual(legacyConfig);
        expect(isUsingLegacyConfig()).toBe(true);
    });

    test('returns null when no clients/ folder and no clients.json', async () => {
        const enoent = new Error('ENOENT');
        enoent.code = 'ENOENT';
        fs.readdir.mockResolvedValue([]); // empty clients folder
        fs.readFile.mockRejectedValue(enoent);

        const result = await loadClientsConfig();

        expect(result).toBeNull();
    });

    test('throws on invalid clients.json', async () => {
        fs.readdir.mockResolvedValue([]);
        fs.readFile.mockResolvedValue('not json');

        await expect(loadClientsConfig()).rejects.toThrow('Failed to load clients.json');
    });
});

// ============================================================================
// getAllClients / getEnabledClients
// ============================================================================

describe('getAllClients', () => {
    test('returns all clients including disabled', async () => {
        const disabled = { ...MINIMAL_CLIENT, name: 'Disabled', enabled: false };
        mockClientFolder({ acme: MINIMAL_CLIENT, disabled });

        const result = await getAllClients();

        expect(Object.keys(result)).toHaveLength(2);
        expect(result.disabled.enabled).toBe(false);
    });

    test('returns null in single-client mode', async () => {
        const enoent = new Error('ENOENT');
        enoent.code = 'ENOENT';
        fs.readdir.mockResolvedValue([]);
        fs.readFile.mockRejectedValue(enoent);

        expect(await getAllClients()).toBeNull();
    });
});

describe('getEnabledClients', () => {
    test('returns only enabled clients', async () => {
        const disabled = { ...MINIMAL_CLIENT, name: 'Disabled', enabled: false };
        mockClientFolder({ acme: MINIMAL_CLIENT, disabled });

        const result = await getEnabledClients();

        expect(Object.keys(result)).toEqual(['acme']);
    });

    test('returns null in single-client mode', async () => {
        const enoent = new Error('ENOENT');
        enoent.code = 'ENOENT';
        fs.readdir.mockResolvedValue([]);
        fs.readFile.mockRejectedValue(enoent);

        expect(await getEnabledClients()).toBeNull();
    });
});

// ============================================================================
// getClient
// ============================================================================

describe('getClient', () => {
    test('returns raw client config', async () => {
        mockClientFolder({ acme: MINIMAL_CLIENT });

        const result = await getClient('acme');

        expect(result).toEqual(MINIMAL_CLIENT);
    });

    test('throws when client not found', async () => {
        mockClientFolder({ acme: MINIMAL_CLIENT });

        await expect(getClient('nonexistent')).rejects.toThrow('Client "nonexistent" not found');
    });

    test('throws when no client config exists', async () => {
        const enoent = new Error('ENOENT');
        enoent.code = 'ENOENT';
        fs.readdir.mockResolvedValue([]);
        fs.readFile.mockRejectedValue(enoent);

        await expect(getClient('any')).rejects.toThrow('No client configuration found');
    });
});

// ============================================================================
// getClientConfig — config merging
// ============================================================================

describe('getClientConfig', () => {
    describe('folder paths', () => {
        test('builds folder paths from client folderPath and global output config', async () => {
            mockClientFolder({ acme: MINIMAL_CLIENT });

            const result = await getClientConfig('acme', GLOBAL_CONFIG);

            expect(result.folders).toEqual({
                base: '/invoices/acme',
                input: '/invoices/acme',
                processedOriginal: path.join('/invoices/acme', 'processed-original'),
                processedEnriched: path.join('/invoices/acme', 'processed-enriched'),
                csvPath: path.join('/invoices/acme', 'invoice-log.csv')
            });
        });

        test('uses defaults when global output config is missing', async () => {
            mockClientFolder({ acme: MINIMAL_CLIENT });

            const result = await getClientConfig('acme', { processing: {} });

            expect(result.folders.processedOriginal).toContain('processed-original');
            expect(result.folders.processedEnriched).toContain('processed-enriched');
            expect(result.folders.csvPath).toContain('invoice-log.csv');
        });
    });

    describe('field merging', () => {
        test('uses global fields when no overrides', async () => {
            mockClientFolder({ acme: MINIMAL_CLIENT });

            const result = await getClientConfig('acme', GLOBAL_CONFIG);

            expect(result.fieldDefinitions).toEqual(GLOBAL_CONFIG.fieldDefinitions);
        });

        test('applies field enabled toggles from fieldOverrides', async () => {
            const client = {
                ...MINIMAL_CLIENT,
                fieldOverrides: { invoiceDate: { enabled: false } }
            };
            mockClientFolder({ acme: client });

            const result = await getClientConfig('acme', GLOBAL_CONFIG);

            const invoiceDate = result.fieldDefinitions.find((f) => f.key === 'invoiceDate');
            expect(invoiceDate.enabled).toBe(false);

            // Other fields unchanged
            const supplierName = result.fieldDefinitions.find((f) => f.key === 'supplierName');
            expect(supplierName.enabled).toBe(true);
        });

        test('adds custom fields from fieldOverrides', async () => {
            const client = {
                ...MINIMAL_CLIENT,
                fieldOverrides: {
                    customTaxId: { enabled: true, type: 'text', label: 'Tax ID', schemaHint: 'h', instruction: 'i' }
                }
            };
            mockClientFolder({ acme: client });

            const result = await getClientConfig('acme', GLOBAL_CONFIG);

            // Global fields still present
            expect(result.fieldDefinitions).toHaveLength(4); // 3 global + 1 custom
            const custom = result.fieldDefinitions.find((f) => f.key === 'customTaxId');
            expect(custom).toBeDefined();
            expect(custom.label).toBe('Tax ID');
        });

        test('preserves field properties when override only sets enabled', async () => {
            const client = {
                ...MINIMAL_CLIENT,
                fieldOverrides: { supplierName: { enabled: false } }
            };
            mockClientFolder({ acme: client });

            const result = await getClientConfig('acme', GLOBAL_CONFIG);

            const field = result.fieldDefinitions.find((f) => f.key === 'supplierName');
            expect(field.enabled).toBe(false);
            expect(field.label).toBe('Supplier'); // preserved from global
            expect(field.type).toBe('text');
        });

        test('uses legacy fieldDefinitions for backward compat (full replacement)', async () => {
            const legacyFields = [{ key: 'custom', label: 'Custom', type: 'text', enabled: true }];
            const client = { ...MINIMAL_CLIENT, fieldDefinitions: legacyFields };
            mockClientFolder({ acme: client });

            const result = await getClientConfig('acme', GLOBAL_CONFIG);

            expect(result.fieldDefinitions).toEqual(legacyFields);
        });
    });

    describe('tag merging', () => {
        test('uses global tags when no overrides', async () => {
            mockClientFolder({ acme: MINIMAL_CLIENT });

            const result = await getClientConfig('acme', GLOBAL_CONFIG);

            expect(result.tagDefinitions).toEqual(GLOBAL_CONFIG.tagDefinitions);
        });

        test('applies tag enabled toggles from tagOverrides', async () => {
            const client = {
                ...MINIMAL_CLIENT,
                tagOverrides: { private: { enabled: false } }
            };
            mockClientFolder({ acme: client });

            const result = await getClientConfig('acme', GLOBAL_CONFIG);

            const privateTag = result.tagDefinitions.find((t) => t.id === 'private');
            expect(privateTag.enabled).toBe(false);

            const euTag = result.tagDefinitions.find((t) => t.id === 'eu-reverse');
            expect(euTag.enabled).toBe(true); // unchanged
        });

        test('adds custom tags from tagOverrides', async () => {
            const client = {
                ...MINIMAL_CLIENT,
                tagOverrides: {
                    'custom-region': { enabled: true, label: 'Region', instruction: 'i' }
                }
            };
            mockClientFolder({ acme: client });

            const result = await getClientConfig('acme', GLOBAL_CONFIG);

            expect(result.tagDefinitions).toHaveLength(3); // 2 global + 1 custom
            const custom = result.tagDefinitions.find((t) => t.id === 'custom-region');
            expect(custom.label).toBe('Region');
        });

        test('returns null tagDefinitions when global has none', async () => {
            mockClientFolder({ acme: MINIMAL_CLIENT });
            const configNoTags = { ...GLOBAL_CONFIG, tagDefinitions: undefined };

            const result = await getClientConfig('acme', configNoTags);

            expect(result.tagDefinitions).toBeNull();
        });
    });

    describe('output merging', () => {
        test('uses global output when no overrides', async () => {
            mockClientFolder({ acme: MINIMAL_CLIENT });

            const result = await getClientConfig('acme', GLOBAL_CONFIG);

            expect(result.output).toEqual(GLOBAL_CONFIG.output);
        });

        test('merges outputOverride into global output', async () => {
            const client = {
                ...MINIMAL_CLIENT,
                outputOverride: { filenameTemplate: '{supplierName}.pdf' }
            };
            mockClientFolder({ acme: client });

            const result = await getClientConfig('acme', GLOBAL_CONFIG);

            expect(result.output.filenameTemplate).toBe('{supplierName}.pdf');
            // Other output settings preserved from global
            expect(result.output.processedOriginalSubfolder).toBe('processed-original');
        });

        test('uses legacy output for full replacement', async () => {
            const legacyOutput = { filenameTemplate: 'custom.pdf', csvFilename: 'custom.csv' };
            const client = { ...MINIMAL_CLIENT, output: legacyOutput };
            mockClientFolder({ acme: client });

            const result = await getClientConfig('acme', GLOBAL_CONFIG);

            expect(result.output).toEqual(legacyOutput);
        });

        test('outputOverride takes precedence over legacy output', async () => {
            const client = {
                ...MINIMAL_CLIENT,
                outputOverride: { filenameTemplate: 'override.pdf' },
                output: { filenameTemplate: 'legacy.pdf' }
            };
            mockClientFolder({ acme: client });

            const result = await getClientConfig('acme', GLOBAL_CONFIG);

            expect(result.output.filenameTemplate).toBe('override.pdf');
        });
    });

    describe('prompt merging', () => {
        test('uses global prompt when no overrides', async () => {
            mockClientFolder({ acme: MINIMAL_CLIENT });

            const result = await getClientConfig('acme', GLOBAL_CONFIG);

            expect(result.promptTemplate).toEqual(GLOBAL_CONFIG.promptTemplate);
        });

        test('merges promptOverride section-by-section into global', async () => {
            const client = {
                ...MINIMAL_CLIENT,
                promptOverride: { extraction: 'Custom extraction' }
            };
            mockClientFolder({ acme: client });

            const result = await getClientConfig('acme', GLOBAL_CONFIG);

            expect(result.promptTemplate.extraction).toBe('Custom extraction');
            expect(result.promptTemplate.validation).toBe('Default validation'); // preserved
        });

        test('uses legacy promptTemplate for full replacement', async () => {
            const legacyPrompt = { extraction: 'Legacy only' };
            const client = { ...MINIMAL_CLIENT, promptTemplate: legacyPrompt };
            mockClientFolder({ acme: client });

            const result = await getClientConfig('acme', GLOBAL_CONFIG);

            expect(result.promptTemplate).toEqual(legacyPrompt);
        });
    });

    describe('model merging', () => {
        test('client model overrides global', async () => {
            const client = { ...MINIMAL_CLIENT, model: 'gemini-pro' };
            mockClientFolder({ acme: client });

            const result = await getClientConfig('acme', GLOBAL_CONFIG);

            expect(result.model).toBe('gemini-pro');
        });

        test('falls back to global model', async () => {
            mockClientFolder({ acme: MINIMAL_CLIENT });

            const result = await getClientConfig('acme', GLOBAL_CONFIG);

            expect(result.model).toBe('gemini-flash');
        });

        test('returns null when neither client nor global has model', async () => {
            mockClientFolder({ acme: MINIMAL_CLIENT });

            const result = await getClientConfig('acme', { processing: {} });

            expect(result.model).toBeNull();
        });
    });

    describe('metadata', () => {
        test('includes clientId, name, enabled, apiKeyEnvVar', async () => {
            const client = { ...MINIMAL_CLIENT, apiKeyEnvVar: 'CUSTOM_KEY' };
            mockClientFolder({ acme: client });

            const result = await getClientConfig('acme', GLOBAL_CONFIG);

            expect(result.clientId).toBe('acme');
            expect(result.name).toBe('Acme Corp');
            expect(result.enabled).toBe(true);
            expect(result.apiKeyEnvVar).toBe('CUSTOM_KEY');
        });

        test('apiKeyEnvVar defaults to null', async () => {
            mockClientFolder({ acme: MINIMAL_CLIENT });

            const result = await getClientConfig('acme', GLOBAL_CONFIG);

            expect(result.apiKeyEnvVar).toBeNull();
        });

        test('includes global processing config', async () => {
            mockClientFolder({ acme: MINIMAL_CLIENT });

            const result = await getClientConfig('acme', GLOBAL_CONFIG);

            expect(result.processing).toEqual({ concurrency: 5 });
        });
    });

    describe('error cases', () => {
        test('throws when client not found', async () => {
            mockClientFolder({ acme: MINIMAL_CLIENT });

            await expect(getClientConfig('missing', GLOBAL_CONFIG)).rejects.toThrow('Client "missing" not found');
        });

        test('throws when no client config exists', async () => {
            const enoent = new Error('ENOENT');
            enoent.code = 'ENOENT';
            fs.readdir.mockResolvedValue([]);
            fs.readFile.mockRejectedValue(enoent);

            await expect(getClientConfig('any', GLOBAL_CONFIG)).rejects.toThrow('No client configuration found');
        });
    });
});

// ============================================================================
// getAnnotatedClientConfig — source annotations
// ============================================================================

describe('getAnnotatedClientConfig', () => {
    test('marks all fields as global when no overrides', async () => {
        mockClientFolder({ acme: MINIMAL_CLIENT });
        fs.access.mockRejectedValue(new Error('ENOENT')); // folder status check

        const result = await getAnnotatedClientConfig('acme', GLOBAL_CONFIG);

        result.fieldDefinitions.forEach((f) => {
            expect(f._source).toBe('global');
        });
    });

    test('marks overridden fields as override', async () => {
        const client = {
            ...MINIMAL_CLIENT,
            fieldOverrides: { invoiceDate: { enabled: false } }
        };
        mockClientFolder({ acme: client });
        fs.access.mockRejectedValue(new Error('ENOENT'));

        const result = await getAnnotatedClientConfig('acme', GLOBAL_CONFIG);

        const invoiceDate = result.fieldDefinitions.find((f) => f.key === 'invoiceDate');
        expect(invoiceDate._source).toBe('override');
        expect(invoiceDate.enabled).toBe(false);

        const supplierName = result.fieldDefinitions.find((f) => f.key === 'supplierName');
        expect(supplierName._source).toBe('global');
    });

    test('marks custom fields as custom', async () => {
        const client = {
            ...MINIMAL_CLIENT,
            fieldOverrides: {
                customTaxId: { enabled: true, type: 'text', label: 'Tax ID' }
            }
        };
        mockClientFolder({ acme: client });
        fs.access.mockRejectedValue(new Error('ENOENT'));

        const result = await getAnnotatedClientConfig('acme', GLOBAL_CONFIG);

        const custom = result.fieldDefinitions.find((f) => f.key === 'customTaxId');
        expect(custom._source).toBe('custom');
    });

    test('marks all tags as global when no overrides', async () => {
        mockClientFolder({ acme: MINIMAL_CLIENT });
        fs.access.mockRejectedValue(new Error('ENOENT'));

        const result = await getAnnotatedClientConfig('acme', GLOBAL_CONFIG);

        result.tagDefinitions.forEach((t) => {
            expect(t._source).toBe('global');
        });
    });

    test('marks overridden tags as override and custom tags as custom', async () => {
        const client = {
            ...MINIMAL_CLIENT,
            tagOverrides: {
                private: { enabled: false },
                'custom-region': { enabled: true, label: 'Region', instruction: 'i' }
            }
        };
        mockClientFolder({ acme: client });
        fs.access.mockRejectedValue(new Error('ENOENT'));

        const result = await getAnnotatedClientConfig('acme', GLOBAL_CONFIG);

        const privateTag = result.tagDefinitions.find((t) => t.id === 'private');
        expect(privateTag._source).toBe('override');

        const customTag = result.tagDefinitions.find((t) => t.id === 'custom-region');
        expect(customTag._source).toBe('custom');

        const euTag = result.tagDefinitions.find((t) => t.id === 'eu-reverse');
        expect(euTag._source).toBe('global');
    });

    test('marks prompt as global when no override', async () => {
        mockClientFolder({ acme: MINIMAL_CLIENT });
        fs.access.mockRejectedValue(new Error('ENOENT'));

        const result = await getAnnotatedClientConfig('acme', GLOBAL_CONFIG);

        expect(result.promptTemplate._source).toBe('global');
    });

    test('marks prompt as override when promptOverride set', async () => {
        const client = { ...MINIMAL_CLIENT, promptOverride: { extraction: 'Custom' } };
        mockClientFolder({ acme: client });
        fs.access.mockRejectedValue(new Error('ENOENT'));

        const result = await getAnnotatedClientConfig('acme', GLOBAL_CONFIG);

        expect(result.promptTemplate._source).toBe('override');
        expect(result.promptTemplate.extraction).toBe('Custom');
        expect(result.promptTemplate.validation).toBe('Default validation'); // global preserved
    });

    test('marks model as global or override', async () => {
        mockClientFolder({ acme: MINIMAL_CLIENT });
        fs.access.mockRejectedValue(new Error('ENOENT'));

        const resultGlobal = await getAnnotatedClientConfig('acme', GLOBAL_CONFIG);
        expect(resultGlobal.model).toEqual({ value: 'gemini-flash', _source: 'global' });

        clearClientsCache();
        const clientWithModel = { ...MINIMAL_CLIENT, model: 'gemini-pro' };
        mockClientFolder({ acme: clientWithModel });

        const resultOverride = await getAnnotatedClientConfig('acme', GLOBAL_CONFIG);
        expect(resultOverride.model).toEqual({ value: 'gemini-pro', _source: 'override' });
    });

    test('marks filename template as global or override', async () => {
        mockClientFolder({ acme: MINIMAL_CLIENT });
        fs.access.mockRejectedValue(new Error('ENOENT'));

        const resultGlobal = await getAnnotatedClientConfig('acme', GLOBAL_CONFIG);
        expect(resultGlobal.filenameTemplate._source).toBe('global');

        clearClientsCache();
        const clientWithOutput = { ...MINIMAL_CLIENT, outputOverride: { filenameTemplate: 'custom.pdf' } };
        mockClientFolder({ acme: clientWithOutput });

        const resultOverride = await getAnnotatedClientConfig('acme', GLOBAL_CONFIG);
        expect(resultOverride.filenameTemplate._source).toBe('override');
        expect(resultOverride.filenameTemplate.template).toBe('custom.pdf');
    });

    test('includes client metadata and folder status', async () => {
        mockClientFolder({ acme: MINIMAL_CLIENT });
        fs.access.mockRejectedValue(new Error('ENOENT')); // folder doesn't exist

        const result = await getAnnotatedClientConfig('acme', GLOBAL_CONFIG);

        expect(result.client).toMatchObject({
            name: 'Acme Corp',
            clientId: 'acme',
            enabled: true,
            folderPath: '/invoices/acme'
        });
        expect(result.client.folderStatus.exists).toBe(false);
    });
});

// ============================================================================
// createClient / updateClient / deleteClient
// ============================================================================

describe('createClient', () => {
    test('creates a new client file', async () => {
        const enoent = new Error('ENOENT');
        enoent.code = 'ENOENT';
        fs.access.mockRejectedValue(enoent); // file doesn't exist yet

        await createClient('new-client', MINIMAL_CLIENT);

        expect(fs.mkdir).toHaveBeenCalled(); // ensure clients/ dir
        expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining('new-client.json'), expect.any(String));
    });

    test('rejects invalid client ID format', async () => {
        await expect(createClient('UPPERCASE', MINIMAL_CLIENT)).rejects.toThrow(
            'Client ID must be lowercase alphanumeric with hyphens only'
        );
        await expect(createClient('has spaces', MINIMAL_CLIENT)).rejects.toThrow(
            'Client ID must be lowercase alphanumeric with hyphens only'
        );
        await expect(createClient('has_underscore', MINIMAL_CLIENT)).rejects.toThrow(
            'Client ID must be lowercase alphanumeric with hyphens only'
        );
    });

    test('rejects duplicate client ID', async () => {
        fs.access.mockResolvedValue(undefined); // file already exists

        await expect(createClient('existing', MINIMAL_CLIENT)).rejects.toThrow('Client "existing" already exists');
    });

    test('validates config before writing', async () => {
        const enoent = new Error('ENOENT');
        enoent.code = 'ENOENT';
        fs.access.mockRejectedValue(enoent);

        await expect(createClient('test', { name: 'Test' })).rejects.toThrow('must have an "enabled" boolean');
        expect(fs.writeFile).not.toHaveBeenCalled();
    });
});

describe('updateClient', () => {
    test('updates an existing client file', async () => {
        fs.access.mockResolvedValue(undefined); // file exists

        await updateClient('acme', MINIMAL_CLIENT);

        expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining('acme.json'), expect.any(String));
    });

    test('throws when client not found', async () => {
        const enoent = new Error('ENOENT');
        enoent.code = 'ENOENT';
        fs.access.mockRejectedValue(enoent);

        await expect(updateClient('missing', MINIMAL_CLIENT)).rejects.toThrow('Client "missing" not found');
    });

    test('validates config before writing', async () => {
        fs.access.mockResolvedValue(undefined);

        await expect(updateClient('acme', { name: 'Test' })).rejects.toThrow('must have an "enabled" boolean');
        expect(fs.writeFile).not.toHaveBeenCalled();
    });
});

describe('deleteClient', () => {
    test('deletes the client file', async () => {
        fs.unlink.mockResolvedValue(undefined);

        await deleteClient('acme');

        expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('acme.json'));
    });

    test('throws when client not found', async () => {
        const enoent = new Error('ENOENT');
        enoent.code = 'ENOENT';
        fs.unlink.mockRejectedValue(enoent);

        await expect(deleteClient('missing')).rejects.toThrow('Client "missing" not found');
    });
});

// ============================================================================
// saveClientOverrides / removeClientOverrides
// ============================================================================

describe('saveClientOverrides', () => {
    const existingConfig = { ...MINIMAL_CLIENT };

    beforeEach(() => {
        fs.readFile.mockResolvedValue(JSON.stringify(existingConfig));
    });

    test('saves field overrides and removes legacy fieldDefinitions', async () => {
        const configWithLegacy = { ...MINIMAL_CLIENT, fieldDefinitions: [{ key: 'old' }] };
        fs.readFile.mockResolvedValue(JSON.stringify(configWithLegacy));

        const overrides = { invoiceDate: { enabled: false } };
        await saveClientOverrides('acme', 'fields', overrides);

        const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
        expect(written.fieldOverrides).toEqual(overrides);
        expect(written.fieldDefinitions).toBeUndefined(); // legacy removed
    });

    test('saves tag overrides', async () => {
        const overrides = { private: { enabled: false } };
        await saveClientOverrides('acme', 'tags', overrides);

        const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
        expect(written.tagOverrides).toEqual(overrides);
    });

    test('saves prompt override', async () => {
        const overrides = { extraction: 'Custom prompt' };
        await saveClientOverrides('acme', 'prompt', overrides);

        const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
        expect(written.promptOverride).toEqual(overrides);
    });

    test('saves output override', async () => {
        const overrides = { filenameTemplate: 'custom.pdf' };
        await saveClientOverrides('acme', 'output', overrides);

        const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
        expect(written.outputOverride).toEqual(overrides);
    });

    test('saves model override', async () => {
        await saveClientOverrides('acme', 'model', 'gemini-pro');

        const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
        expect(written.model).toBe('gemini-pro');
    });

    test('throws on invalid section', async () => {
        await expect(saveClientOverrides('acme', 'invalid', {})).rejects.toThrow('Invalid override section: invalid');
    });

    test('throws when client not found', async () => {
        const enoent = new Error('ENOENT');
        enoent.code = 'ENOENT';
        fs.readFile.mockRejectedValue(enoent);

        await expect(saveClientOverrides('missing', 'fields', {})).rejects.toThrow('Client "missing" not found');
    });
});

describe('removeClientOverrides', () => {
    beforeEach(() => {
        const fullConfig = {
            ...MINIMAL_CLIENT,
            fieldOverrides: { invoiceDate: { enabled: false } },
            fieldDefinitions: [{ key: 'legacy' }],
            tagOverrides: { private: { enabled: false } },
            promptOverride: { extraction: 'Custom' },
            promptTemplate: { extraction: 'Legacy' },
            outputOverride: { filenameTemplate: 'custom.pdf' },
            model: 'gemini-pro'
        };
        fs.readFile.mockResolvedValue(JSON.stringify(fullConfig));
    });

    test('removes field overrides and legacy fieldDefinitions', async () => {
        await removeClientOverrides('acme', 'fields');

        const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
        expect(written.fieldOverrides).toBeUndefined();
        expect(written.fieldDefinitions).toBeUndefined();
    });

    test('removes tag overrides', async () => {
        await removeClientOverrides('acme', 'tags');

        const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
        expect(written.tagOverrides).toBeUndefined();
    });

    test('removes prompt override and legacy promptTemplate', async () => {
        await removeClientOverrides('acme', 'prompt');

        const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
        expect(written.promptOverride).toBeUndefined();
        expect(written.promptTemplate).toBeUndefined();
    });

    test('removes output override', async () => {
        await removeClientOverrides('acme', 'output');

        const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
        expect(written.outputOverride).toBeUndefined();
    });

    test('removes model override', async () => {
        await removeClientOverrides('acme', 'model');

        const written = JSON.parse(fs.writeFile.mock.calls[0][1]);
        expect(written.model).toBeUndefined();
    });

    test('throws on invalid section', async () => {
        await expect(removeClientOverrides('acme', 'bogus')).rejects.toThrow('Invalid override section: bogus');
    });

    test('throws when client not found', async () => {
        const enoent = new Error('ENOENT');
        enoent.code = 'ENOENT';
        fs.readFile.mockRejectedValue(enoent);

        await expect(removeClientOverrides('missing', 'fields')).rejects.toThrow('Client "missing" not found');
    });
});

// ============================================================================
// resolveApiKey
// ============================================================================

describe('resolveApiKey', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    test('uses client-specific env var when set', () => {
        process.env.ACME_KEY = 'client-specific-key';
        process.env.GEMINI_API_KEY = 'default-key';

        const result = resolveApiKey({ name: 'Acme', apiKeyEnvVar: 'ACME_KEY' });

        expect(result).toBe('client-specific-key');
    });

    test('falls back to GEMINI_API_KEY when client var not set', () => {
        process.env.GEMINI_API_KEY = 'default-key';

        const result = resolveApiKey({ name: 'Acme', apiKeyEnvVar: 'UNSET_VAR' });

        expect(result).toBe('default-key');
    });

    test('falls back to GEMINI_API_KEY when no apiKeyEnvVar configured', () => {
        process.env.GEMINI_API_KEY = 'default-key';

        const result = resolveApiKey({ name: 'Acme' });

        expect(result).toBe('default-key');
    });

    test('throws when no API key found', () => {
        delete process.env.GEMINI_API_KEY;

        expect(() => resolveApiKey({ name: 'Acme', apiKeyEnvVar: 'UNSET_VAR' })).toThrow(
            'No API key found for client "Acme"'
        );
    });

    test('error message includes client env var name when set', () => {
        delete process.env.GEMINI_API_KEY;

        expect(() => resolveApiKey({ name: 'Acme', apiKeyEnvVar: 'ACME_KEY' })).toThrow('Set ACME_KEY');
    });

    test('error message defaults to GEMINI_API_KEY when no env var configured', () => {
        delete process.env.GEMINI_API_KEY;

        expect(() => resolveApiKey({ name: 'Acme' })).toThrow('Set GEMINI_API_KEY');
    });
});

// ============================================================================
// ensureClientDirectories / clientFolderExists
// ============================================================================

describe('ensureClientDirectories', () => {
    test('creates subfolders when base folder exists', async () => {
        fs.access.mockResolvedValue(undefined);
        fs.mkdir.mockResolvedValue(undefined);

        await ensureClientDirectories({
            folders: {
                base: '/invoices/acme',
                processedOriginal: '/invoices/acme/processed-original',
                processedEnriched: '/invoices/acme/processed-enriched'
            }
        });

        expect(fs.mkdir).toHaveBeenCalledWith('/invoices/acme/processed-original', { recursive: true });
        expect(fs.mkdir).toHaveBeenCalledWith('/invoices/acme/processed-enriched', { recursive: true });
    });

    test('throws when base folder does not exist', async () => {
        fs.access.mockRejectedValue(new Error('ENOENT'));

        await expect(ensureClientDirectories({ folders: { base: '/missing' } })).rejects.toThrow(
            'Client folder does not exist: /missing'
        );
    });
});

describe('clientFolderExists', () => {
    test('returns true when folder exists', async () => {
        fs.access.mockResolvedValue(undefined);

        expect(await clientFolderExists({ folders: { base: '/exists' } })).toBe(true);
    });

    test('returns false when folder does not exist', async () => {
        fs.access.mockRejectedValue(new Error('ENOENT'));

        expect(await clientFolderExists({ folders: { base: '/missing' } })).toBe(false);
    });
});

// ============================================================================
// getClientFolderStatus
// ============================================================================

describe('getClientFolderStatus', () => {
    test('counts PDFs in input and processed folders', async () => {
        fs.access.mockResolvedValue(undefined);
        fs.readdir
            .mockResolvedValueOnce(['inv1.pdf', 'inv2.PDF', 'readme.txt']) // input folder
            .mockResolvedValueOnce(['done1.pdf']); // processed folder

        const result = await getClientFolderStatus('/invoices/acme');

        expect(result).toEqual({ exists: true, inputPdfCount: 2, processedCount: 1 });
    });

    test('returns exists: false when folder missing', async () => {
        fs.access.mockRejectedValue(new Error('ENOENT'));

        const result = await getClientFolderStatus('/missing');

        expect(result).toEqual({ exists: false, inputPdfCount: 0, processedCount: 0 });
    });

    test('handles missing processed subfolder', async () => {
        fs.access.mockResolvedValue(undefined);
        fs.readdir
            .mockResolvedValueOnce(['inv.pdf']) // input folder
            .mockRejectedValueOnce(new Error('ENOENT')); // no processed subfolder

        const result = await getClientFolderStatus('/invoices/acme');

        expect(result).toEqual({ exists: true, inputPdfCount: 1, processedCount: 0 });
    });
});

// ============================================================================
// isMultiClientMode / isUsingLegacyConfig
// ============================================================================

describe('isMultiClientMode', () => {
    test('returns true when clients exist', async () => {
        mockClientFolder({ acme: MINIMAL_CLIENT });

        expect(await isMultiClientMode()).toBe(true);
    });

    test('returns false when no clients config', async () => {
        const enoent = new Error('ENOENT');
        enoent.code = 'ENOENT';
        fs.readdir.mockResolvedValue([]);
        fs.readFile.mockRejectedValue(enoent);

        expect(await isMultiClientMode()).toBe(false);
    });
});
