const fs = require('fs').promises;
const path = require('path');

let cachedClientsConfig = null;
let usingLegacyConfig = false;

/**
 * Discover client config files from clients/ folder
 * @returns {Promise<Object|null>} Object with clientId -> client config, or null if folder doesn't exist/is empty
 */
async function discoverClientFiles() {
    const clientsDir = path.join(process.cwd(), 'clients');

    try {
        const files = await fs.readdir(clientsDir);
        const jsonFiles = files.filter(f => f.endsWith('.json'));

        if (jsonFiles.length === 0) {
            return null;
        }

        const clients = {};

        for (const file of jsonFiles) {
            const clientId = path.basename(file, '.json');
            const filePath = path.join(clientsDir, file);

            try {
                const content = await fs.readFile(filePath, 'utf-8');
                const config = JSON.parse(content);

                // Validate the client config
                validateClientConfig(clientId, config);

                clients[clientId] = config;
            } catch (error) {
                if (error.code === 'ENOENT') {
                    continue;
                }
                throw new Error(`Failed to load client config "${file}": ${error.message}`);
            }
        }

        return Object.keys(clients).length > 0 ? { clients } : null;
    } catch (error) {
        if (error.code === 'ENOENT') {
            // clients/ folder doesn't exist
            return null;
        }
        throw error;
    }
}

/**
 * Validate a client configuration
 * @param {string} clientId - The client identifier
 * @param {Object} config - The client configuration object
 */
function validateClientConfig(clientId, config) {
    if (!config.name || typeof config.name !== 'string') {
        throw new Error(`Client "${clientId}": must have a "name" string`);
    }
    if (typeof config.enabled !== 'boolean') {
        throw new Error(`Client "${clientId}": must have an "enabled" boolean`);
    }
    if (!config.folderPath || typeof config.folderPath !== 'string') {
        throw new Error(`Client "${clientId}": must have a "folderPath" string`);
    }
    // tagOverrides is optional but must be an object if present
    if (config.tagOverrides !== undefined && (typeof config.tagOverrides !== 'object' || config.tagOverrides === null)) {
        throw new Error(`Client "${clientId}": "tagOverrides" must be an object`);
    }
}

/**
 * Validate legacy clients.json structure (allows extraction.privateAddressMarker)
 * @param {Object} config - Clients configuration to validate
 */
function validateLegacyClientsConfig(config) {
    if (!config.clients || typeof config.clients !== 'object') {
        throw new Error('clients.json must contain a "clients" object');
    }

    for (const [clientId, client] of Object.entries(config.clients)) {
        if (!client.name || typeof client.name !== 'string') {
            throw new Error(`Client "${clientId}" must have a "name" string`);
        }
        if (typeof client.enabled !== 'boolean') {
            throw new Error(`Client "${clientId}" must have an "enabled" boolean`);
        }
        if (!client.folderPath || typeof client.folderPath !== 'string') {
            throw new Error(`Client "${clientId}" must have a "folderPath" string`);
        }
        // For legacy config, privateAddressMarker can be in extraction, top-level, or tagOverrides
        // (no longer required — handled by unified tag system)
    }
}

/**
 * Load and validate clients configuration
 * Tries clients/ folder first, then falls back to legacy clients.json
 * @returns {Promise<Object|null>} Clients configuration object or null if not found
 */
async function loadClientsConfig() {
    if (cachedClientsConfig) {
        return cachedClientsConfig;
    }

    // 1. Try clients/ folder first
    const folderConfig = await discoverClientFiles();
    if (folderConfig) {
        cachedClientsConfig = folderConfig;
        usingLegacyConfig = false;
        return cachedClientsConfig;
    }

    // 2. Fall back to legacy clients.json
    const clientsPath = path.join(process.cwd(), 'clients.json');

    try {
        const fileContent = await fs.readFile(clientsPath, 'utf-8');
        const clientsConfig = JSON.parse(fileContent);

        validateLegacyClientsConfig(clientsConfig);

        // Show deprecation warning
        console.warn('\n⚠️  DEPRECATION WARNING: clients.json is deprecated.');
        console.warn('   Please migrate to individual client files in clients/ folder.');
        console.warn('   Run: node scripts/migrate-clients.js\n');

        cachedClientsConfig = clientsConfig;
        usingLegacyConfig = true;

        return cachedClientsConfig;
    } catch (error) {
        if (error.code === 'ENOENT') {
            // clients.json doesn't exist - return null to signal single-client mode
            return null;
        }
        throw new Error(`Failed to load clients.json: ${error.message}`);
    }
}

/**
 * Get all enabled clients
 * @returns {Promise<Object|null>} Object with clientId -> client config, or null for single-client mode
 */
async function getEnabledClients() {
    const clientsConfig = await loadClientsConfig();

    if (!clientsConfig) {
        return null; // Signal single-client mode
    }

    const enabledClients = {};
    for (const [clientId, client] of Object.entries(clientsConfig.clients)) {
        if (client.enabled) {
            enabledClients[clientId] = client;
        }
    }

    return enabledClients;
}

/**
 * Get all clients (including disabled)
 * @returns {Promise<Object|null>} Object with clientId -> client config, or null for single-client mode
 */
async function getAllClients() {
    const clientsConfig = await loadClientsConfig();

    if (!clientsConfig) {
        return null; // Signal single-client mode
    }

    return clientsConfig.clients;
}

/**
 * Get merged configuration for a specific client
 * Merges global config with client-specific overrides (full override, not merge)
 * @param {string} clientId - Client identifier
 * @param {Object} globalConfig - The global configuration object
 * @returns {Promise<Object>} Merged configuration object
 */
async function getClientConfig(clientId, globalConfig) {
    const clientsConfig = await loadClientsConfig();

    if (!clientsConfig) {
        throw new Error('No client configuration found (neither clients/ folder nor clients.json)');
    }

    const client = clientsConfig.clients[clientId];
    if (!client) {
        throw new Error(`Client "${clientId}" not found`);
    }

    // Build folder paths
    const processedOriginalSubfolder = globalConfig.output?.processedOriginalSubfolder || 'processed-original';
    const processedEnrichedSubfolder = globalConfig.output?.processedEnrichedSubfolder || 'processed-enriched';
    const csvFilename = globalConfig.output?.csvFilename || 'invoice-log.csv';

    const folders = {
        base: client.folderPath,
        input: client.folderPath, // New PDFs are placed directly in the base folder
        processedOriginal: path.join(client.folderPath, processedOriginalSubfolder),
        processedEnriched: path.join(client.folderPath, processedEnrichedSubfolder),
        csvPath: path.join(client.folderPath, csvFilename)
    };

    // Extraction config: client OVERRIDES global entirely (not merge)
    let extraction;
    if (client.extraction) {
        // Client has extraction config - use it entirely (override)
        extraction = { ...client.extraction };
    } else {
        // No client extraction - use global
        extraction = { ...globalConfig.extraction };
    }

    // Output config: client OVERRIDES global entirely (not merge)
    const output = client.output || globalConfig.output;

    // Document types: client can override, otherwise use global
    const documentTypes = client.documentTypes || globalConfig.documentTypes;

    // Field definitions: client can override, otherwise use global
    const fieldDefinitions = client.fieldDefinitions || globalConfig.fieldDefinitions;

    // Tag definitions: start with global, merge client tagOverrides (parameter values and enabled state)
    let tagDefinitions = globalConfig.tagDefinitions || null;
    if (tagDefinitions && client.tagOverrides) {
        tagDefinitions = tagDefinitions.map(tag => {
            const override = client.tagOverrides[tag.id];
            if (!override) return tag;

            const merged = { ...tag };
            // Allow client to override enabled state
            if (typeof override.enabled === 'boolean') {
                merged.enabled = override.enabled;
            }
            // Merge parameter values
            if (override.parameters && tag.parameters) {
                merged.parameters = { ...tag.parameters };
                for (const [paramKey, paramValue] of Object.entries(override.parameters)) {
                    if (merged.parameters[paramKey]) {
                        merged.parameters[paramKey] = { ...merged.parameters[paramKey], default: paramValue };
                    }
                }
            }
            return merged;
        });
    }

    return {
        clientId,
        name: client.name,
        enabled: client.enabled,
        apiKeyEnvVar: client.apiKeyEnvVar || null,
        folders,
        processing: globalConfig.processing,
        extraction,
        output,
        documentTypes,
        fieldDefinitions,
        tagDefinitions
    };
}

/**
 * Resolve API key for a client
 * Checks client-specific env var first, then falls back to default
 * @param {Object} clientConfig - Client configuration object
 * @returns {string} API key
 */
function resolveApiKey(clientConfig) {
    // 1. Check client-specific env var
    if (clientConfig.apiKeyEnvVar && process.env[clientConfig.apiKeyEnvVar]) {
        return process.env[clientConfig.apiKeyEnvVar];
    }

    // 2. Fall back to default
    if (process.env.GEMINI_API_KEY) {
        return process.env.GEMINI_API_KEY;
    }

    // 3. Error
    throw new Error(`No API key found for client "${clientConfig.name}". Set ${clientConfig.apiKeyEnvVar || 'GEMINI_API_KEY'} environment variable.`);
}

/**
 * Ensure client directories exist (create if missing)
 * @param {Object} clientConfig - Client configuration object
 */
async function ensureClientDirectories(clientConfig) {
    const { folders } = clientConfig;

    // Check if base folder exists
    try {
        await fs.access(folders.base);
    } catch {
        throw new Error(`Client folder does not exist: ${folders.base}`);
    }

    // Create subfolders if they don't exist
    await fs.mkdir(folders.processedOriginal, { recursive: true });
    await fs.mkdir(folders.processedEnriched, { recursive: true });
}

/**
 * Check if a client folder exists
 * @param {Object} clientConfig - Client configuration object
 * @returns {Promise<boolean>}
 */
async function clientFolderExists(clientConfig) {
    try {
        await fs.access(clientConfig.folders.base);
        return true;
    } catch {
        return false;
    }
}

/**
 * Clear the cached clients configuration (mainly for testing)
 */
function clearClientsCache() {
    cachedClientsConfig = null;
    usingLegacyConfig = false;
}

/**
 * Create a new client configuration file
 * @param {string} clientId - The client identifier (used as filename)
 * @param {Object} config - The client configuration object
 * @returns {Promise<void>}
 */
async function createClient(clientId, config) {
    // Validate clientId format (lowercase, alphanumeric with hyphens)
    if (!/^[a-z0-9-]+$/.test(clientId)) {
        throw new Error('Client ID must be lowercase alphanumeric with hyphens only');
    }

    const clientsDir = path.join(process.cwd(), 'clients');
    const filePath = path.join(clientsDir, `${clientId}.json`);

    // Ensure clients directory exists
    await fs.mkdir(clientsDir, { recursive: true });

    // Check if client already exists
    try {
        await fs.access(filePath);
        throw new Error(`Client "${clientId}" already exists`);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }

    // Validate the config
    validateClientConfig(clientId, config);

    // Write the config file
    await fs.writeFile(filePath, JSON.stringify(config, null, 2));

    // Clear cache so changes are reflected
    clearClientsCache();
}

/**
 * Update an existing client configuration
 * @param {string} clientId - The client identifier
 * @param {Object} config - The updated client configuration object
 * @returns {Promise<void>}
 */
async function updateClient(clientId, config) {
    const clientsDir = path.join(process.cwd(), 'clients');
    const filePath = path.join(clientsDir, `${clientId}.json`);

    // Check if client exists
    try {
        await fs.access(filePath);
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error(`Client "${clientId}" not found`);
        }
        throw error;
    }

    // Validate the config
    validateClientConfig(clientId, config);

    // Write the updated config file
    await fs.writeFile(filePath, JSON.stringify(config, null, 2));

    // Clear cache so changes are reflected
    clearClientsCache();
}

/**
 * Delete a client configuration file
 * @param {string} clientId - The client identifier
 * @returns {Promise<void>}
 */
async function deleteClient(clientId) {
    const clientsDir = path.join(process.cwd(), 'clients');
    const filePath = path.join(clientsDir, `${clientId}.json`);

    // Check if client exists and delete
    try {
        await fs.unlink(filePath);
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error(`Client "${clientId}" not found`);
        }
        throw error;
    }

    // Clear cache so changes are reflected
    clearClientsCache();
}

/**
 * Get a single client's raw configuration (not merged with global config)
 * @param {string} clientId - The client identifier
 * @returns {Promise<Object>} The client configuration
 */
async function getClient(clientId) {
    const clientsConfig = await loadClientsConfig();

    if (!clientsConfig) {
        throw new Error('No client configuration found');
    }

    const client = clientsConfig.clients[clientId];
    if (!client) {
        throw new Error(`Client "${clientId}" not found`);
    }

    return client;
}

/**
 * Get folder status for a client (PDF counts)
 * @param {string} folderPath - The client's folder path
 * @returns {Promise<Object>} Folder status with PDF counts
 */
async function getClientFolderStatus(folderPath, processedOriginalSubfolder = 'processed-original') {
    const result = {
        exists: false,
        inputPdfCount: 0,
        processedCount: 0
    };

    try {
        await fs.access(folderPath);
        result.exists = true;

        // Count PDFs in input folder (base folder, excluding subfolders)
        const files = await fs.readdir(folderPath);
        result.inputPdfCount = files.filter(f => f.toLowerCase().endsWith('.pdf')).length;

        // Count PDFs in processed-original subfolder
        const processedPath = path.join(folderPath, processedOriginalSubfolder);
        try {
            const processedFiles = await fs.readdir(processedPath);
            result.processedCount = processedFiles.filter(f => f.toLowerCase().endsWith('.pdf')).length;
        } catch {
            // Subfolder doesn't exist yet
        }
    } catch {
        // Folder doesn't exist
    }

    return result;
}

/**
 * Check if multi-client mode is available (clients/ folder or clients.json exists)
 * @returns {Promise<boolean>}
 */
async function isMultiClientMode() {
    const clientsConfig = await loadClientsConfig();
    return clientsConfig !== null;
}

/**
 * Check if using legacy clients.json configuration
 * @returns {boolean}
 */
function isUsingLegacyConfig() {
    return usingLegacyConfig;
}

module.exports = {
    loadClientsConfig,
    getEnabledClients,
    getAllClients,
    getClientConfig,
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
    discoverClientFiles,
    validateClientConfig
};
