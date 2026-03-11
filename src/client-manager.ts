import fs from 'node:fs';
import path from 'node:path';
import sanitize from 'sanitize-filename';
import {
    VALID_OVERRIDE_SECTIONS,
    DEFAULT_PROCESSED_ORIGINAL_SUBFOLDER,
    DEFAULT_PROCESSED_ENRICHED_SUBFOLDER,
    DEFAULT_CSV_FILENAME,
    safeJoin
} from './constants.js';

import type {
    AppConfig,
    ClientFile,
    MergedClientConfig,
    AnnotatedClientConfig,
    ClientFolders,
    FolderStatus,
    AnnotatedField,
    AnnotatedTag,
    FieldDefinition,
    TagDefinition,
    PromptTemplate,
    OutputConfig
} from './types/index.js';

interface ClientsConfig {
    clients: Record<string, ClientFile>;
}

let cachedClientsConfig: ClientsConfig | null = null;
let usingLegacyConfig = false;

/**
 * Discover client config files from clients/ folder
 * @returns Object with clientId -> client config, or null if folder doesn't exist/is empty
 */
export async function discoverClientFiles(): Promise<ClientsConfig | null> {
    const clientsDir = path.join(process.cwd(), 'clients');

    try {
        const files = await fs.promises.readdir(clientsDir);
        const jsonFiles = files.filter((f) => f.endsWith('.json'));

        if (jsonFiles.length === 0) {
            return null;
        }

        const clients: Record<string, ClientFile> = {};

        for (const file of jsonFiles) {
            const clientId = path.basename(file, '.json');
            const filePath = path.join(clientsDir, file);

            try {
                const content = await fs.promises.readFile(filePath, 'utf-8');
                const config = JSON.parse(content) as ClientFile;

                // Validate the client config
                validateClientConfig(clientId, config as unknown as Record<string, unknown>);

                clients[clientId] = config;
            } catch (error: unknown) {
                if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                    continue;
                }
                throw new Error(`Failed to load client config "${file}": ${(error as Error).message}`, {
                    cause: error
                });
            }
        }

        return Object.keys(clients).length > 0 ? { clients } : null;
    } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            // clients/ folder doesn't exist
            return null;
        }
        throw error;
    }
}

/**
 * Validate a client configuration
 * @param clientId - The client identifier
 * @param config - The client configuration object
 */
export function validateClientConfig(clientId: string, config: Record<string, unknown>): void {
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
    if (
        config.tagOverrides !== undefined &&
        (typeof config.tagOverrides !== 'object' || config.tagOverrides === null)
    ) {
        throw new Error(`Client "${clientId}": "tagOverrides" must be an object`);
    }
    // model is optional but must be a string if present
    if (config.model !== undefined && typeof config.model !== 'string') {
        throw new Error(`Client "${clientId}": "model" must be a string`);
    }
}

/**
 * Validate legacy clients.json structure (allows extraction.privateAddressMarker)
 * @param config - Clients configuration to validate
 */
function validateLegacyClientsConfig(config: Record<string, unknown>): void {
    if (!config.clients || typeof config.clients !== 'object') {
        throw new Error('clients.json must contain a "clients" object');
    }

    for (const [clientId, client] of Object.entries(config.clients as Record<string, Record<string, unknown>>)) {
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
 * @returns Clients configuration object or null if not found
 */
export async function loadClientsConfig(): Promise<ClientsConfig | null> {
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
        const fileContent = await fs.promises.readFile(clientsPath, 'utf-8');
        const clientsConfig = JSON.parse(fileContent) as Record<string, unknown>;

        validateLegacyClientsConfig(clientsConfig);

        // Show deprecation warning
        console.warn('\n⚠️  DEPRECATION WARNING: clients.json is deprecated.');
        console.warn('   Please migrate to individual client files in clients/ folder.');
        console.warn('   Run: node scripts/migrate-clients.js\n');

        cachedClientsConfig = clientsConfig as unknown as ClientsConfig;
        usingLegacyConfig = true;

        return cachedClientsConfig;
    } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            // clients.json doesn't exist - return null to signal single-client mode
            return null;
        }
        throw new Error(`Failed to load clients.json: ${(error as Error).message}`, { cause: error });
    }
}

/**
 * Get all enabled clients
 * @returns Object with clientId -> client config, or null for single-client mode
 */
export async function getEnabledClients(): Promise<Record<string, ClientFile> | null> {
    const clientsConfig = await loadClientsConfig();

    if (!clientsConfig) {
        return null; // Signal single-client mode
    }

    const enabledClients: Record<string, ClientFile> = {};
    for (const [clientId, client] of Object.entries(clientsConfig.clients)) {
        if (client.enabled) {
            enabledClients[clientId] = client;
        }
    }

    return enabledClients;
}

/**
 * Get all clients (including disabled)
 * @returns Object with clientId -> client config, or null for single-client mode
 */
export async function getAllClients(): Promise<Record<string, ClientFile> | null> {
    const clientsConfig = await loadClientsConfig();

    if (!clientsConfig) {
        return null; // Signal single-client mode
    }

    return clientsConfig.clients;
}

/**
 * Get merged configuration for a specific client
 * Merges global config with client-specific overrides (full override, not merge)
 * @param clientId - Client identifier
 * @param globalConfig - The global configuration object
 * @returns Merged configuration object
 */
export async function getClientConfig(clientId: string, globalConfig: AppConfig): Promise<MergedClientConfig> {
    const clientsConfig = await loadClientsConfig();

    if (!clientsConfig) {
        throw new Error('No client configuration found (neither clients/ folder nor clients.json)');
    }

    const client = clientsConfig.clients[clientId];
    if (!client) {
        throw new Error(`Client "${clientId}" not found`);
    }

    // Build folder paths
    const processedOriginalSubfolder =
        globalConfig.output?.processedOriginalSubfolder || DEFAULT_PROCESSED_ORIGINAL_SUBFOLDER;
    const processedEnrichedSubfolder =
        globalConfig.output?.processedEnrichedSubfolder || DEFAULT_PROCESSED_ENRICHED_SUBFOLDER;
    const csvFilename = globalConfig.output?.csvFilename || DEFAULT_CSV_FILENAME;

    const folders: ClientFolders = {
        base: client.folderPath,
        input: client.folderPath, // New PDFs are placed directly in the base folder
        processedOriginal: path.join(client.folderPath, processedOriginalSubfolder),
        processedEnriched: path.join(client.folderPath, processedEnrichedSubfolder),
        csvPath: path.join(client.folderPath, csvFilename)
    };

    // Output config: outputOverride merges into global, legacy output replaces entirely
    let output: OutputConfig = globalConfig.output;
    if (client.outputOverride) {
        output = { ...globalConfig.output, ...client.outputOverride } as OutputConfig;
    } else if (client.output) {
        output = client.output as OutputConfig;
    }

    // Field definitions: toggle-only model with custom field support
    let fieldDefinitions: FieldDefinition[] = globalConfig.fieldDefinitions || [];
    if (client.fieldDefinitions) {
        // Backward compat: full replacement for unmigrated configs
        console.warn(`Client "${clientId}": fieldDefinitions is deprecated, migrate to fieldOverrides`);
        fieldDefinitions = client.fieldDefinitions;
    } else if (client.fieldOverrides) {
        const globalFieldKeys = new Set(fieldDefinitions.map((f) => f.key));
        // Apply enabled toggles to global fields
        fieldDefinitions = fieldDefinitions.map((field) => {
            const override = client.fieldOverrides![field.key];
            if (!override) return field;
            return { ...field, enabled: typeof override.enabled === 'boolean' ? override.enabled : field.enabled };
        });
        // Add custom fields (keys not in global)
        for (const [key, def] of Object.entries(client.fieldOverrides)) {
            if (!globalFieldKeys.has(key)) {
                fieldDefinitions.push({ ...(def as unknown as FieldDefinition), key });
            }
        }
    }

    // Tag definitions: toggle-only model with custom tag support
    let tagDefinitions: TagDefinition[] | null = globalConfig.tagDefinitions || null;
    if (tagDefinitions && client.tagOverrides) {
        const globalTagIds = new Set(tagDefinitions.map((t) => t.id));
        // Apply enabled toggles to global tags
        tagDefinitions = tagDefinitions.map((tag) => {
            const override = client.tagOverrides![tag.id];
            if (!override) return tag;
            return { ...tag, enabled: typeof override.enabled === 'boolean' ? override.enabled : tag.enabled };
        });
        // Add custom tags (ids not in global)
        for (const [id, def] of Object.entries(client.tagOverrides)) {
            if (!globalTagIds.has(id)) {
                tagDefinitions.push({ ...(def as unknown as TagDefinition), id });
            }
        }
    }

    // Prompt template: promptOverride merges section-by-section into global
    let promptTemplate: PromptTemplate | Record<string, never> =
        globalConfig.promptTemplate || ({} as Record<string, never>);
    if (client.promptOverride) {
        promptTemplate = { ...promptTemplate, ...client.promptOverride } as PromptTemplate;
    } else if (client.promptTemplate) {
        promptTemplate = client.promptTemplate;
    }

    // Model: client overrides global
    const model = client.model || globalConfig.model || null;

    return {
        clientId,
        name: client.name,
        enabled: client.enabled,
        apiKeyEnvVar: client.apiKeyEnvVar || null,
        model,
        folders,
        processing: globalConfig.processing,
        output,
        fieldDefinitions,
        tagDefinitions,
        promptTemplate
    };
}

/**
 * Resolve API key for a client
 * Checks client-specific env var first, then falls back to default
 * @param clientConfig - Client configuration object
 * @returns API key
 */
export function resolveApiKey(clientConfig: MergedClientConfig): string {
    // 1. Check client-specific env var
    if (clientConfig.apiKeyEnvVar && process.env[clientConfig.apiKeyEnvVar]) {
        return process.env[clientConfig.apiKeyEnvVar]!;
    }

    // 2. Fall back to default
    if (process.env.GEMINI_API_KEY) {
        return process.env.GEMINI_API_KEY;
    }

    // 3. Error
    throw new Error(
        `No API key found for client "${clientConfig.name}". Set ${clientConfig.apiKeyEnvVar || 'GEMINI_API_KEY'} environment variable.`
    );
}

/**
 * Ensure client directories exist (create if missing)
 * @param clientConfig - Client configuration object
 */
export async function ensureClientDirectories(clientConfig: MergedClientConfig): Promise<void> {
    const { folders } = clientConfig;

    // Check if base folder exists
    try {
        await fs.promises.access(folders.base);
    } catch {
        throw new Error(`Client folder does not exist: ${folders.base}`);
    }

    // Create subfolders if they don't exist
    await fs.promises.mkdir(folders.processedOriginal, { recursive: true });
    await fs.promises.mkdir(folders.processedEnriched, { recursive: true });
}

/**
 * Check if a client folder exists
 * @param clientConfig - Client configuration object
 * @returns Whether the folder exists
 */
export async function clientFolderExists(clientConfig: MergedClientConfig): Promise<boolean> {
    try {
        await fs.promises.access(clientConfig.folders.base);
        return true;
    } catch {
        return false;
    }
}

/**
 * Clear the cached clients configuration (mainly for testing)
 */
export function clearClientsCache(): void {
    cachedClientsConfig = null;
    usingLegacyConfig = false;
}

/**
 * Create a new client configuration file
 * @param clientId - The client identifier (used as filename)
 * @param config - The client configuration object
 */
export async function createClient(clientId: string, config: Record<string, unknown>): Promise<void> {
    // Validate clientId format (lowercase, alphanumeric with hyphens)
    if (!/^[a-z0-9-]+$/.test(clientId)) {
        throw new Error('Client ID must be lowercase alphanumeric with hyphens only');
    }

    const clientsDir = path.join(process.cwd(), 'clients');
    const filePath = safeJoin(clientsDir, `${sanitize(clientId)}.json`);

    // Ensure clients directory exists
    await fs.promises.mkdir(clientsDir, { recursive: true });

    // Check if client already exists
    try {
        await fs.promises.access(filePath);
        throw new Error(`Client "${clientId}" already exists`);
    } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
        }
    }

    // Validate the config
    validateClientConfig(clientId, config);

    // Write the config file
    await fs.promises.writeFile(filePath, JSON.stringify(config, null, 2));

    // Clear cache so changes are reflected
    clearClientsCache();
}

/**
 * Update an existing client configuration
 * @param clientId - The client identifier
 * @param config - The updated client configuration object
 */
export async function updateClient(clientId: string, config: Record<string, unknown>): Promise<void> {
    const clientsDir = path.join(process.cwd(), 'clients');
    const filePath = safeJoin(clientsDir, `${sanitize(clientId)}.json`);

    // Check if client exists
    try {
        await fs.promises.access(filePath);
    } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error(`Client "${clientId}" not found`, { cause: error });
        }
        throw error;
    }

    // Validate the config
    validateClientConfig(clientId, config);

    // Write the updated config file
    await fs.promises.writeFile(filePath, JSON.stringify(config, null, 2));

    // Clear cache so changes are reflected
    clearClientsCache();
}

/**
 * Delete a client configuration file
 * @param clientId - The client identifier
 */
export async function deleteClient(clientId: string): Promise<void> {
    const clientsDir = path.join(process.cwd(), 'clients');
    const filePath = safeJoin(clientsDir, `${sanitize(clientId)}.json`);

    // Check if client exists and delete
    try {
        await fs.promises.unlink(filePath);
    } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error(`Client "${clientId}" not found`, { cause: error });
        }
        throw error;
    }

    // Clear cache so changes are reflected
    clearClientsCache();
}

/**
 * Get a single client's raw configuration (not merged with global config)
 * @param clientId - The client identifier
 * @returns The client configuration
 */
export async function getClient(clientId: string): Promise<ClientFile> {
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
 * @param folderPath - The client's folder path
 * @param processedOriginalSubfolder - Subfolder name for processed originals
 * @returns Folder status with PDF counts
 */
export async function getClientFolderStatus(
    folderPath: string,
    processedOriginalSubfolder: string = DEFAULT_PROCESSED_ORIGINAL_SUBFOLDER
): Promise<FolderStatus> {
    const result: FolderStatus = {
        exists: false,
        inputPdfCount: 0,
        processedCount: 0
    };

    try {
        await fs.promises.access(folderPath);
        result.exists = true;

        // Count PDFs in input folder (base folder, excluding subfolders)
        const files = await fs.promises.readdir(folderPath);
        result.inputPdfCount = files.filter((f) => f.toLowerCase().endsWith('.pdf')).length;

        // Count PDFs in processed-original subfolder
        const processedPath = path.join(folderPath, processedOriginalSubfolder);
        try {
            const processedFiles = await fs.promises.readdir(processedPath);
            result.processedCount = processedFiles.filter((f) => f.toLowerCase().endsWith('.pdf')).length;
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
 * @returns Whether multi-client mode is available
 */
export async function isMultiClientMode(): Promise<boolean> {
    const clientsConfig = await loadClientsConfig();
    return clientsConfig !== null;
}

/**
 * Check if using legacy clients.json configuration
 * @returns Whether using legacy config
 */
export function isUsingLegacyConfig(): boolean {
    return usingLegacyConfig;
}

/**
 * Get annotated effective config for a client, marking each setting's source
 * @param clientId - Client identifier
 * @param globalConfig - The global configuration object
 * @returns Annotated config with _source markers
 */
export async function getAnnotatedClientConfig(
    clientId: string,
    globalConfig: AppConfig
): Promise<AnnotatedClientConfig> {
    const clientsConfig = await loadClientsConfig();
    if (!clientsConfig) throw new Error('No client configuration found');

    const client = clientsConfig.clients[clientId];
    if (!client) throw new Error(`Client "${clientId}" not found`);

    // Field definitions: toggle-only model with custom field support
    const globalFields = globalConfig.fieldDefinitions || [];
    let effectiveFields: AnnotatedField[];
    if (client.fieldDefinitions) {
        // Backward compat: full replacement for unmigrated configs
        const globalFieldMap = new Map(globalFields.map((f) => [f.key, f]));
        effectiveFields = client.fieldDefinitions.map((f) => {
            const isGlobal = globalFieldMap.has(f.key);
            return { ...f, _source: (isGlobal ? 'override' : 'custom') as AnnotatedField['_source'] };
        });
    } else if (client.fieldOverrides) {
        const globalFieldKeys = new Set(globalFields.map((f) => f.key));
        effectiveFields = globalFields.map((f) => {
            const override = client.fieldOverrides![f.key];
            if (!override) return { ...f, _source: 'global' as const };
            return {
                ...f,
                enabled: typeof override.enabled === 'boolean' ? override.enabled : f.enabled,
                _source: 'override' as const
            };
        });
        // Add custom fields (keys not in global)
        for (const [key, def] of Object.entries(client.fieldOverrides)) {
            if (!globalFieldKeys.has(key)) {
                effectiveFields.push({ ...(def as unknown as FieldDefinition), key, _source: 'custom' as const });
            }
        }
    } else {
        effectiveFields = globalFields.map((f) => ({ ...f, _source: 'global' as const }));
    }

    // Tag definitions: toggle-only model with custom tag support
    const globalTags = globalConfig.tagDefinitions || [];
    const globalTagIds = new Set(globalTags.map((t) => t.id));
    const effectiveTags: AnnotatedTag[] = globalTags.map((tag) => {
        const override = client.tagOverrides?.[tag.id];
        if (!override) {
            return { ...tag, _source: 'global' as const };
        }
        return {
            ...tag,
            enabled: typeof override.enabled === 'boolean' ? override.enabled : tag.enabled,
            _source: 'override' as const
        };
    });
    // Add custom tags from overrides
    if (client.tagOverrides) {
        for (const [id, def] of Object.entries(client.tagOverrides)) {
            if (!globalTagIds.has(id)) {
                effectiveTags.push({ ...(def as unknown as TagDefinition), id, _source: 'custom' as const });
            }
        }
    }

    // Prompt template: section-level overrides or full override
    const globalPrompt = globalConfig.promptTemplate || ({} as PromptTemplate);
    let effectivePrompt: PromptTemplate & { _source: 'global' | 'override' };
    if (client.promptOverride) {
        effectivePrompt = { ...globalPrompt, ...client.promptOverride, _source: 'override' } as PromptTemplate & {
            _source: 'override';
        };
    } else if (client.promptTemplate) {
        effectivePrompt = { ...client.promptTemplate, _source: 'override' } as PromptTemplate & {
            _source: 'override';
        };
    } else {
        effectivePrompt = { ...globalPrompt, _source: 'global' } as PromptTemplate & { _source: 'global' };
    }

    // Filename template: outputOverride or legacy output
    const hasOutputOverride = !!(client.outputOverride && client.outputOverride.filenameTemplate);
    const hasLegacyOutput = !!(client.output && (client.output as Partial<OutputConfig>).filenameTemplate);
    const effectiveFilename = {
        template: hasOutputOverride
            ? client.outputOverride!.filenameTemplate!
            : hasLegacyOutput
              ? (client.output as Partial<OutputConfig>).filenameTemplate!
              : globalConfig.output?.filenameTemplate || '',
        _source: (hasOutputOverride || hasLegacyOutput ? 'override' : 'global') as 'global' | 'override'
    };

    // Model: client overrides global
    const effectiveModel = {
        value: client.model || globalConfig.model || null,
        _source: (client.model ? 'override' : 'global') as 'global' | 'override'
    };

    // Folder status
    const folderStatus = await getClientFolderStatus(
        client.folderPath,
        globalConfig.output?.processedOriginalSubfolder || DEFAULT_PROCESSED_ORIGINAL_SUBFOLDER
    );

    // Build output with _source
    const effectiveOutput = {
        ...(client.outputOverride
            ? { ...globalConfig.output, ...client.outputOverride }
            : client.output
              ? (client.output as OutputConfig)
              : globalConfig.output),
        _source: (client.outputOverride || client.output ? 'override' : 'global') as 'global' | 'override'
    } as OutputConfig & { _source: 'global' | 'override' };

    return {
        client: {
            name: client.name,
            clientId,
            enabled: client.enabled,
            folderPath: client.folderPath,
            apiKeyEnvVar: client.apiKeyEnvVar || null,
            folderStatus
        },
        model: effectiveModel,
        fieldDefinitions: effectiveFields,
        tagDefinitions: effectiveTags,
        promptTemplate: effectivePrompt,
        filenameTemplate: effectiveFilename,
        output: effectiveOutput
    };
}

/**
 * Save per-section overrides to a client's config file (partial update)
 * @param clientId - Client identifier
 * @param section - Override section: 'fields', 'tags', 'prompt', 'output', 'model'
 * @param data - The override data
 */
export async function saveClientOverrides(clientId: string, section: string, data: unknown): Promise<void> {
    const clientsDir = path.join(process.cwd(), 'clients');
    const filePath = safeJoin(clientsDir, `${sanitize(clientId)}.json`);

    let config: Record<string, unknown>;
    try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        config = JSON.parse(content) as Record<string, unknown>;
    } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            throw new Error(`Client "${clientId}" not found`, { cause: error });
        throw error;
    }

    switch (section) {
        case 'fields':
            config.fieldOverrides = data;
            delete config.fieldDefinitions;
            break;
        case 'tags':
            config.tagOverrides = data;
            break;
        case 'prompt':
            config.promptOverride = data;
            break;
        case 'output':
            config.outputOverride = data;
            break;
        case 'model':
            config.model = data;
            break;
        default:
            throw new Error(
                `Invalid override section: ${section}. Must be one of: ${VALID_OVERRIDE_SECTIONS.join(', ')}`
            );
    }

    await fs.promises.writeFile(filePath, JSON.stringify(config, null, 2));
    clearClientsCache();
}

/**
 * Remove a per-section override from a client's config file
 * @param clientId - Client identifier
 * @param section - Override section: 'fields', 'tags', 'prompt', 'output', 'model'
 */
export async function removeClientOverrides(clientId: string, section: string): Promise<void> {
    const clientsDir = path.join(process.cwd(), 'clients');
    const filePath = safeJoin(clientsDir, `${sanitize(clientId)}.json`);

    let config: Record<string, unknown>;
    try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        config = JSON.parse(content) as Record<string, unknown>;
    } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            throw new Error(`Client "${clientId}" not found`, { cause: error });
        throw error;
    }

    switch (section) {
        case 'fields':
            delete config.fieldOverrides;
            delete config.fieldDefinitions; // remove legacy too
            break;
        case 'tags':
            delete config.tagOverrides;
            break;
        case 'prompt':
            delete config.promptOverride;
            delete config.promptTemplate; // remove legacy too
            break;
        case 'output':
            delete config.outputOverride;
            break;
        case 'model':
            delete config.model;
            break;
        default:
            throw new Error(
                `Invalid override section: ${section}. Must be one of: ${VALID_OVERRIDE_SECTIONS.join(', ')}`
            );
    }

    await fs.promises.writeFile(filePath, JSON.stringify(config, null, 2));
    clearClientsCache();
}
