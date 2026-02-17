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

module.exports = {
    loadConfig,
    getConfig,
    ensureDirectories,
    clearConfigCache,
    getDocumentTypes,
    getDefaultDocumentTypes,
    validateFieldDefinitions,
    getFieldDefinitions
};
