const fs = require('fs').promises;
const path = require('path');

const CONFIG_FILE = 'config.json';
const REQUIRED_FIELDS = ['processing', 'extraction', 'output'];

// Default document types (used when not specified in config)
const DEFAULT_DOCUMENT_TYPES = [
    { id: 'commercial_invoice', label: 'Commercial Invoice', description: 'Standard invoice for goods/services' },
    { id: 'proforma_invoice', label: 'Proforma Invoice', description: 'Preliminary invoice' },
    { id: 'receipt', label: 'Receipt', description: 'Payment confirmation' },
    { id: 'order_confirmation', label: 'Order Confirmation', description: 'Order confirmation' },
    { id: 'purchase_order', label: 'Purchase Order', description: 'Purchase request' },
    { id: 'government_taxes', label: 'Government/Taxes', description: 'Tax documents' }
];

let cachedConfig = null;

/**
 * Load and validate configuration from config.json
 * @param {Object} options - Load options
 * @param {boolean} options.requireFolders - Whether folders section is required (default: true for backward compat)
 * @returns {Promise<Object>} The configuration object
 */
async function loadConfig(options = {}) {
    const { requireFolders = true } = options;

    if (cachedConfig) {
        return cachedConfig;
    }

    const configPath = path.join(process.cwd(), CONFIG_FILE);

    try {
        const configData = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(configData);

        validateConfig(config, { requireFolders });

        // Apply defaults for new output fields
        config.output = {
            processedOriginalSubfolder: 'processed-original',
            processedEnrichedSubfolder: 'processed-enriched',
            csvFilename: 'invoice-log.csv',
            ...config.output
        };

        // Resolve relative paths to absolute (only if folders are provided)
        if (config.folders) {
            if (config.folders.input) {
                config.folders.input = path.resolve(process.cwd(), config.folders.input);
            }
            if (config.folders.output) {
                config.folders.output = path.resolve(process.cwd(), config.folders.output);
            }
            if (config.folders.input && config.folders.analyzedSubfolder) {
                config.folders.analyzed = path.join(config.folders.input, config.folders.analyzedSubfolder);
            }
        }

        cachedConfig = config;
        return config;
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error(`Configuration file not found: ${configPath}\nPlease copy config.json.example to config.json and update the paths.`);
        }
        throw error;
    }
}

const VALID_FIELD_TYPES = ['text', 'number', 'boolean', 'date', 'array'];

/**
 * Validate field definitions array
 * @param {Array} fieldDefinitions - Field definitions to validate
 */
function validateFieldDefinitions(fieldDefinitions) {
    if (!Array.isArray(fieldDefinitions)) {
        throw new Error('fieldDefinitions must be an array');
    }
    if (fieldDefinitions.length === 0) {
        throw new Error('fieldDefinitions must be a non-empty array');
    }
    for (const [index, field] of fieldDefinitions.entries()) {
        if (!field.key || typeof field.key !== 'string') {
            throw new Error(`fieldDefinitions[${index}]: must have a "key" string`);
        }
        if (!field.label || typeof field.label !== 'string') {
            throw new Error(`fieldDefinitions[${index}]: must have a "label" string`);
        }
        if (!VALID_FIELD_TYPES.includes(field.type)) {
            throw new Error(`fieldDefinitions[${index}]: "type" must be one of: ${VALID_FIELD_TYPES.join(', ')}`);
        }
        if (!field.schemaHint || typeof field.schemaHint !== 'string') {
            throw new Error(`fieldDefinitions[${index}]: must have a "schemaHint" string`);
        }
        if (!field.instruction || typeof field.instruction !== 'string') {
            throw new Error(`fieldDefinitions[${index}]: must have an "instruction" string`);
        }
        if (typeof field.enabled !== 'boolean') {
            throw new Error(`fieldDefinitions[${index}]: "enabled" must be a boolean`);
        }
    }
}

/**
 * Get field definitions from config, or null for legacy mode
 * @param {Object} config - The configuration object
 * @returns {Array|null} Field definitions array or null
 */
function getFieldDefinitions(config) {
    return config.fieldDefinitions || null;
}

/**
 * Validate document types array
 * @param {Array} documentTypes - Document types to validate
 */
function validateDocumentTypes(documentTypes) {
    if (!Array.isArray(documentTypes)) {
        throw new Error('documentTypes must be an array');
    }
    if (documentTypes.length === 0) {
        throw new Error('documentTypes must be a non-empty array');
    }
    for (const [index, dt] of documentTypes.entries()) {
        if (!dt.id || typeof dt.id !== 'string') {
            throw new Error(`documentTypes[${index}]: must have an "id" string`);
        }
        if (!dt.label || typeof dt.label !== 'string') {
            throw new Error(`documentTypes[${index}]: must have a "label" string`);
        }
    }
}

/**
 * Validate the configuration object
 * @param {Object} config - The configuration to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.requireFolders - Whether folders section is required
 */
function validateConfig(config, options = {}) {
    const { requireFolders = true } = options;

    // Check required top-level fields
    for (const field of REQUIRED_FIELDS) {
        if (!config[field]) {
            throw new Error(`Missing required configuration field: ${field}`);
        }
    }

    // Validate documentTypes if present
    if (config.documentTypes) {
        validateDocumentTypes(config.documentTypes);
    }

    // Validate folders (only required in single-client mode)
    if (requireFolders) {
        if (!config.folders) {
            throw new Error('Missing required configuration field: folders');
        }
        if (!config.folders.input) {
            throw new Error('Missing required configuration: folders.input');
        }
        if (!config.folders.output) {
            throw new Error('Missing required configuration: folders.output');
        }
        if (!config.folders.analyzedSubfolder) {
            throw new Error('Missing required configuration: folders.analyzedSubfolder');
        }
    }

    // Validate processing
    if (typeof config.processing.concurrency !== 'number' || config.processing.concurrency < 1) {
        throw new Error('processing.concurrency must be a positive number');
    }
    if (typeof config.processing.retryAttempts !== 'number' || config.processing.retryAttempts < 0) {
        throw new Error('processing.retryAttempts must be a non-negative number');
    }

    // Validate field definitions if present
    if (config.fieldDefinitions) {
        validateFieldDefinitions(config.fieldDefinitions);
    }

    // Validate extraction.fields (only required in legacy mode without fieldDefinitions)
    if (!config.fieldDefinitions) {
        if (!Array.isArray(config.extraction.fields) || config.extraction.fields.length === 0) {
            throw new Error('extraction.fields must be a non-empty array');
        }
    }

    // Validate output
    if (!config.output.filenameTemplate) {
        throw new Error('Missing required configuration: output.filenameTemplate');
    }
}

/**
 * Ensure all required directories exist
 * @param {Object} config - The configuration object
 */
async function ensureDirectories(config) {
    await fs.mkdir(config.folders.input, { recursive: true });
    await fs.mkdir(config.folders.output, { recursive: true });
    await fs.mkdir(config.folders.analyzed, { recursive: true });
}

/**
 * Get configuration synchronously (must call loadConfig first)
 * @returns {Object} The cached configuration
 */
function getConfig() {
    if (!cachedConfig) {
        throw new Error('Configuration not loaded. Call loadConfig() first.');
    }
    return cachedConfig;
}

/**
 * Clear the cached configuration (useful for testing)
 */
function clearConfigCache() {
    cachedConfig = null;
}

/**
 * Get document types from config or return defaults
 * @returns {Array} Array of document type objects with id, label, description
 */
function getDocumentTypes() {
    return cachedConfig?.documentTypes || DEFAULT_DOCUMENT_TYPES;
}

/**
 * Get the default document types
 * @returns {Array} Array of default document type objects
 */
function getDefaultDocumentTypes() {
    return DEFAULT_DOCUMENT_TYPES;
}

/**
 * Save configuration to config.json (partial update).
 * Reads current file, merges updates, writes back, clears cache.
 * @param {Object} updates - Key-value pairs to merge into config
 */
async function saveConfig(updates) {
    const configPath = path.join(process.cwd(), CONFIG_FILE);
    const configData = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configData);

    Object.assign(config, updates);

    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    clearConfigCache();
}

/**
 * Update fieldDefinitions in config.json.
 * Validates before saving.
 * @param {Array} fieldDefinitions - The field definitions array
 */
async function updateFieldDefinitions(fieldDefinitions) {
    validateFieldDefinitions(fieldDefinitions);
    await saveConfig({ fieldDefinitions });
}

// ============================================================================
// CONFIG EXPORT / IMPORT / BACKUP
// ============================================================================

const BACKUPS_DIR = path.join(process.cwd(), 'backups');
const CLIENTS_DIR = path.join(process.cwd(), 'clients');

/**
 * Export configuration by scope
 * @param {string} scope - 'fields', 'global', 'client:<id>', 'clients', 'all'
 * @returns {Promise<Object>} Export bundle with metadata envelope
 */
async function exportConfig(scope) {
    const configPath = path.join(process.cwd(), CONFIG_FILE);
    const rawConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));

    let data;

    switch (scope) {
        case 'fields':
            data = {
                fieldDefinitions: rawConfig.fieldDefinitions || null,
                extraction: rawConfig.extraction
            };
            break;

        case 'global':
            data = { ...rawConfig };
            // Exclude folders (environment-specific)
            delete data.folders;
            break;

        case 'clients': {
            const clients = await loadClientFiles();
            data = { clients };
            break;
        }

        case 'all': {
            const allClients = await loadClientFiles();
            data = {
                config: { ...rawConfig },
                clients: allClients
            };
            delete data.config.folders;
            break;
        }

        default:
            if (scope.startsWith('client:')) {
                const clientId = scope.substring(7);
                const clientPath = path.join(CLIENTS_DIR, `${clientId}.json`);
                try {
                    data = { clientId, config: JSON.parse(await fs.readFile(clientPath, 'utf-8')) };
                } catch (err) {
                    if (err.code === 'ENOENT') throw new Error(`Client "${clientId}" not found`);
                    throw err;
                }
            } else {
                throw new Error(`Unknown export scope: "${scope}". Valid: fields, global, client:<id>, clients, all`);
            }
    }

    return {
        exportVersion: 1,
        exportedAt: new Date().toISOString(),
        scope,
        data
    };
}

/**
 * Read all client JSON files from clients/ directory
 * @returns {Promise<Object>} Map of clientId -> client config
 */
async function loadClientFiles() {
    const clients = {};
    try {
        const files = await fs.readdir(CLIENTS_DIR);
        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            const clientId = path.basename(file, '.json');
            const content = await fs.readFile(path.join(CLIENTS_DIR, file), 'utf-8');
            clients[clientId] = JSON.parse(content);
        }
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }
    return clients;
}

/**
 * Import a config bundle (auto-backup before write)
 * @param {Object} bundle - The export bundle to import
 * @returns {Promise<Object>} Import result summary
 */
async function importConfig(bundle) {
    // Validate envelope
    if (!bundle || typeof bundle !== 'object') {
        throw new Error('Invalid import bundle: must be a JSON object');
    }
    if (!bundle.scope || !bundle.data) {
        throw new Error('Invalid import bundle: missing "scope" or "data"');
    }

    // Auto-backup before import
    const backup = await createBackup(`pre-import-${bundle.scope}`);

    const configPath = path.join(process.cwd(), CONFIG_FILE);
    const imported = { scope: bundle.scope, backupId: backup.id, updated: [] };

    switch (bundle.scope) {
        case 'fields': {
            if (bundle.data.fieldDefinitions) {
                validateFieldDefinitions(bundle.data.fieldDefinitions);
            }
            const rawConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
            if (bundle.data.fieldDefinitions !== undefined) {
                rawConfig.fieldDefinitions = bundle.data.fieldDefinitions;
                imported.updated.push('fieldDefinitions');
            }
            if (bundle.data.extraction) {
                rawConfig.extraction = bundle.data.extraction;
                imported.updated.push('extraction');
            }
            await fs.writeFile(configPath, JSON.stringify(rawConfig, null, 2));
            clearConfigCache();
            break;
        }

        case 'global': {
            const rawConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
            const folders = rawConfig.folders; // Preserve environment-specific folders
            Object.assign(rawConfig, bundle.data);
            rawConfig.folders = folders;
            if (rawConfig.fieldDefinitions) {
                validateFieldDefinitions(rawConfig.fieldDefinitions);
            }
            await fs.writeFile(configPath, JSON.stringify(rawConfig, null, 2));
            clearConfigCache();
            imported.updated.push('config.json');
            break;
        }

        case 'clients': {
            if (!bundle.data.clients || typeof bundle.data.clients !== 'object') {
                throw new Error('Import bundle for "clients" scope must have data.clients object');
            }
            await fs.mkdir(CLIENTS_DIR, { recursive: true });
            for (const [clientId, config] of Object.entries(bundle.data.clients)) {
                await fs.writeFile(
                    path.join(CLIENTS_DIR, `${clientId}.json`),
                    JSON.stringify(config, null, 2)
                );
                imported.updated.push(`clients/${clientId}.json`);
            }
            break;
        }

        case 'all': {
            // Import global config
            if (bundle.data.config) {
                const rawConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
                const folders = rawConfig.folders;
                Object.assign(rawConfig, bundle.data.config);
                rawConfig.folders = folders;
                if (rawConfig.fieldDefinitions) {
                    validateFieldDefinitions(rawConfig.fieldDefinitions);
                }
                await fs.writeFile(configPath, JSON.stringify(rawConfig, null, 2));
                clearConfigCache();
                imported.updated.push('config.json');
            }
            // Import clients
            if (bundle.data.clients && typeof bundle.data.clients === 'object') {
                await fs.mkdir(CLIENTS_DIR, { recursive: true });
                for (const [clientId, config] of Object.entries(bundle.data.clients)) {
                    await fs.writeFile(
                        path.join(CLIENTS_DIR, `${clientId}.json`),
                        JSON.stringify(config, null, 2)
                    );
                    imported.updated.push(`clients/${clientId}.json`);
                }
            }
            break;
        }

        default:
            if (bundle.scope.startsWith('client:')) {
                const clientId = bundle.scope.substring(7);
                if (!bundle.data.config) {
                    throw new Error('Import bundle for single client must have data.config');
                }
                await fs.mkdir(CLIENTS_DIR, { recursive: true });
                await fs.writeFile(
                    path.join(CLIENTS_DIR, `${clientId}.json`),
                    JSON.stringify(bundle.data.config, null, 2)
                );
                imported.updated.push(`clients/${clientId}.json`);
            } else {
                throw new Error(`Unknown import scope: "${bundle.scope}"`);
            }
    }

    return imported;
}

/**
 * Create a timestamped backup of current config
 * @param {string} [label] - Optional label for the backup
 * @returns {Promise<Object>} Backup metadata { id, path, timestamp, label }
 */
async function createBackup(label) {
    await fs.mkdir(BACKUPS_DIR, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const id = label ? `${timestamp}_${label}` : timestamp;
    const backupDir = path.join(BACKUPS_DIR, id);
    await fs.mkdir(backupDir);

    // Copy config.json
    const configPath = path.join(process.cwd(), CONFIG_FILE);
    try {
        await fs.copyFile(configPath, path.join(backupDir, 'config.json'));
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }

    // Copy clients/ directory
    try {
        const clientFiles = await fs.readdir(CLIENTS_DIR);
        if (clientFiles.length > 0) {
            const clientsBackupDir = path.join(backupDir, 'clients');
            await fs.mkdir(clientsBackupDir);
            for (const file of clientFiles) {
                if (file.endsWith('.json')) {
                    await fs.copyFile(
                        path.join(CLIENTS_DIR, file),
                        path.join(clientsBackupDir, file)
                    );
                }
            }
        }
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }

    // Write metadata
    const metadata = { id, timestamp: new Date().toISOString(), label: label || null };
    await fs.writeFile(path.join(backupDir, '_metadata.json'), JSON.stringify(metadata, null, 2));

    return metadata;
}

/**
 * List available backups sorted newest-first
 * @returns {Promise<Array>} Array of backup metadata objects
 */
async function listBackups() {
    try {
        const entries = await fs.readdir(BACKUPS_DIR);
        const backups = [];

        for (const entry of entries) {
            const metaPath = path.join(BACKUPS_DIR, entry, '_metadata.json');
            try {
                const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
                backups.push(meta);
            } catch {
                // Skip entries without valid metadata
            }
        }

        // Sort newest first
        backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        return backups;
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }
}

/**
 * Restore from a specific backup (creates safety backup first)
 * @param {string} backupId - The backup ID to restore
 * @returns {Promise<Object>} Restore result { restoredFrom, safetyBackupId, restored }
 */
async function restoreBackup(backupId) {
    const backupDir = path.join(BACKUPS_DIR, backupId);

    // Verify backup exists
    try {
        await fs.access(backupDir);
    } catch {
        throw new Error(`Backup "${backupId}" not found`);
    }

    // Create safety backup before restoring
    const safety = await createBackup('pre-restore-safety');

    const restored = [];

    // Restore config.json
    const backupConfigPath = path.join(backupDir, 'config.json');
    const configPath = path.join(process.cwd(), CONFIG_FILE);
    try {
        await fs.copyFile(backupConfigPath, configPath);
        clearConfigCache();
        restored.push('config.json');
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }

    // Restore clients/
    const backupClientsDir = path.join(backupDir, 'clients');
    try {
        const clientFiles = await fs.readdir(backupClientsDir);
        await fs.mkdir(CLIENTS_DIR, { recursive: true });
        for (const file of clientFiles) {
            if (file.endsWith('.json')) {
                await fs.copyFile(
                    path.join(backupClientsDir, file),
                    path.join(CLIENTS_DIR, file)
                );
                restored.push(`clients/${file}`);
            }
        }
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }

    return {
        restoredFrom: backupId,
        safetyBackupId: safety.id,
        restored
    };
}

module.exports = {
    loadConfig,
    getConfig,
    ensureDirectories,
    clearConfigCache,
    getDocumentTypes,
    getDefaultDocumentTypes,
    validateFieldDefinitions,
    getFieldDefinitions,
    saveConfig,
    updateFieldDefinitions,
    exportConfig,
    importConfig,
    createBackup,
    listBackups,
    restoreBackup
};
