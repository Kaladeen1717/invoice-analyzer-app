import fs from 'node:fs';
import path from 'node:path';
import sanitize from 'sanitize-filename';

import {
    VALID_FIELD_TYPES,
    VALID_FIELD_FORMATS,
    FORMAT_NONE,
    DEFAULT_PROCESSED_ORIGINAL_SUBFOLDER,
    DEFAULT_PROCESSED_ENRICHED_SUBFOLDER,
    DEFAULT_CSV_FILENAME,
    safeJoin
} from './constants.js';

import type {
    AppConfig,
    FieldDefinition,
    TagDefinition,
    PromptTemplate,
    ExportBundle,
    BackupMetadata,
    ImportResult,
    RestoreResult,
    FieldFormatKey
} from './types/index.js';

const CONFIG_FILE = 'config.json';
const REQUIRED_FIELDS = ['processing', 'output'];

let cachedConfig: AppConfig | null = null;

/**
 * Load and validate configuration from config.json
 * @param options - Load options
 * @param options.requireFolders - Whether folders section is required (default: true for backward compat)
 * @returns The configuration object
 */
export async function loadConfig(options: { requireFolders?: boolean } = {}): Promise<AppConfig> {
    const { requireFolders = true } = options;

    if (cachedConfig) {
        return cachedConfig;
    }

    const configPath = path.join(process.cwd(), CONFIG_FILE);

    try {
        const configData = await fs.promises.readFile(configPath, 'utf-8');
        const config = JSON.parse(configData) as AppConfig;

        validateConfig(config as unknown as Record<string, unknown>, { requireFolders });

        // Apply defaults for new output fields
        config.output = {
            ...config.output,
            processedOriginalSubfolder:
                config.output.processedOriginalSubfolder || DEFAULT_PROCESSED_ORIGINAL_SUBFOLDER,
            processedEnrichedSubfolder:
                config.output.processedEnrichedSubfolder || DEFAULT_PROCESSED_ENRICHED_SUBFOLDER,
            csvFilename: config.output.csvFilename || DEFAULT_CSV_FILENAME
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
    } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error(
                `Configuration file not found: ${configPath}\nPlease copy config.json.example to config.json and update the paths.`
            );
        }
        throw error;
    }
}

/**
 * Validate field definitions array
 * @param fieldDefinitions - Field definitions to validate
 */
export function validateFieldDefinitions(fieldDefinitions: unknown): asserts fieldDefinitions is FieldDefinition[] {
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
        if (!(VALID_FIELD_TYPES as readonly string[]).includes(field.type)) {
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
        if (field.format !== undefined && field.format !== null) {
            if (field.format !== FORMAT_NONE && !VALID_FIELD_FORMATS[field.format as FieldFormatKey]) {
                throw new Error(
                    `fieldDefinitions[${index}]: "format" must be one of: ${Object.keys(VALID_FIELD_FORMATS).join(', ')}`
                );
            }
            if (
                field.format !== FORMAT_NONE &&
                !VALID_FIELD_FORMATS[field.format as FieldFormatKey].compatibleTypes.includes(field.type)
            ) {
                throw new Error(
                    `fieldDefinitions[${index}]: format "${field.format}" is not compatible with type "${field.type}"`
                );
            }
        }
    }
}

/**
 * Get field definitions from config, or null for legacy mode
 * @param config - The configuration object
 * @returns Field definitions array or null
 */
export function getFieldDefinitions(config: AppConfig): FieldDefinition[] | null {
    return config.fieldDefinitions || null;
}

/**
 * Validate tag definitions array
 * @param tagDefinitions - Tag definitions to validate
 */
export function validateTagDefinitions(tagDefinitions: unknown): asserts tagDefinitions is TagDefinition[] {
    if (!Array.isArray(tagDefinitions)) {
        throw new Error('tagDefinitions must be an array');
    }
    const seenIds = new Set<string>();
    for (const [index, tag] of tagDefinitions.entries()) {
        if (!tag.id || typeof tag.id !== 'string') {
            throw new Error(`tagDefinitions[${index}]: must have an "id" string`);
        }
        if (!/^[a-z][a-z0-9_]*$/.test(tag.id)) {
            throw new Error(
                `tagDefinitions[${index}]: "id" must be lowercase alphanumeric with underscores (got "${tag.id}")`
            );
        }
        if (seenIds.has(tag.id)) {
            throw new Error(`tagDefinitions[${index}]: duplicate id "${tag.id}"`);
        }
        seenIds.add(tag.id);
        if (!tag.label || typeof tag.label !== 'string') {
            throw new Error(`tagDefinitions[${index}]: must have a "label" string`);
        }
        if (!tag.instruction || typeof tag.instruction !== 'string') {
            throw new Error(`tagDefinitions[${index}]: must have an "instruction" string`);
        }
        if (typeof tag.enabled !== 'boolean') {
            throw new Error(`tagDefinitions[${index}]: "enabled" must be a boolean`);
        }
        // Validate parameters if present
        if (tag.parameters && typeof tag.parameters === 'object') {
            for (const [paramKey, param] of Object.entries(tag.parameters) as [
                string,
                { label?: string; default?: unknown }
            ][]) {
                if (!param.label || typeof param.label !== 'string') {
                    throw new Error(`tagDefinitions[${index}].parameters.${paramKey}: must have a "label" string`);
                }
                if (!('default' in param)) {
                    throw new Error(`tagDefinitions[${index}].parameters.${paramKey}: must have a "default" value`);
                }
            }
        }
        // Validate top-level filename properties
        if (
            tag.filenamePlaceholder !== undefined &&
            tag.filenamePlaceholder !== null &&
            tag.filenamePlaceholder !== ''
        ) {
            if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(tag.filenamePlaceholder)) {
                throw new Error(`tagDefinitions[${index}].filenamePlaceholder: must be alphanumeric camelCase`);
            }
        }
        if (tag.filenameFormat !== undefined && tag.filenameFormat !== null) {
            if (typeof tag.filenameFormat !== 'string') {
                throw new Error(`tagDefinitions[${index}].filenameFormat: must be a string`);
            }
        }
    }
}

/**
 * Get tag definitions from config, or null for legacy mode
 * @param config - The configuration object
 * @returns Tag definitions array or null
 */
export function getTagDefinitions(config: AppConfig): TagDefinition[] | null {
    return config.tagDefinitions || null;
}

/**
 * Update tagDefinitions in config.json.
 * Validates before saving.
 * @param tagDefinitions - The tag definitions array
 */
export async function updateTagDefinitions(tagDefinitions: TagDefinition[]): Promise<void> {
    validateTagDefinitions(tagDefinitions);
    await saveConfig({ tagDefinitions });
}

/**
 * Validate promptTemplate object
 * @param promptTemplate - The prompt template to validate
 */
export function validatePromptTemplate(promptTemplate: unknown): asserts promptTemplate is PromptTemplate {
    if (!promptTemplate || typeof promptTemplate !== 'object') {
        throw new Error('promptTemplate must be an object');
    }
    for (const field of ['preamble', 'generalRules', 'suffix'] as const) {
        if (
            !(promptTemplate as Record<string, unknown>)[field] ||
            typeof (promptTemplate as Record<string, unknown>)[field] !== 'string'
        ) {
            throw new Error(`promptTemplate.${field} must be a non-empty string`);
        }
    }
}

/**
 * Update promptTemplate in config.json.
 * Also clears rawPrompt if switching back to structured mode.
 * @param promptTemplate - The prompt template object
 */
export async function updatePromptTemplate(promptTemplate: PromptTemplate): Promise<void> {
    validatePromptTemplate(promptTemplate);
    await saveConfig({ promptTemplate, rawPrompt: undefined });
    // Remove rawPrompt key from config file since saveConfig merges
    const configPath = path.join(process.cwd(), CONFIG_FILE);
    const raw = JSON.parse(await fs.promises.readFile(configPath, 'utf-8')) as Record<string, unknown>;
    delete raw.rawPrompt;
    await fs.promises.writeFile(configPath, JSON.stringify(raw, null, 2));
    clearConfigCache();
}

/**
 * Update rawPrompt in config.json (for raw edit mode).
 * @param rawPrompt - The full raw prompt string
 */
export async function updateRawPrompt(rawPrompt: string): Promise<void> {
    if (!rawPrompt || typeof rawPrompt !== 'string') {
        throw new Error('rawPrompt must be a non-empty string');
    }
    await saveConfig({ rawPrompt });
}

/**
 * Clear rawPrompt from config (switch back to structured mode).
 */
export async function clearRawPrompt(): Promise<void> {
    const configPath = path.join(process.cwd(), CONFIG_FILE);
    const raw = JSON.parse(await fs.promises.readFile(configPath, 'utf-8')) as Record<string, unknown>;
    delete raw.rawPrompt;
    await fs.promises.writeFile(configPath, JSON.stringify(raw, null, 2));
    clearConfigCache();
}

/**
 * Validate the configuration object
 * @param config - The configuration to validate
 * @param options - Validation options
 * @param options.requireFolders - Whether folders section is required
 */
export function validateConfig(config: Record<string, unknown>, options: { requireFolders?: boolean } = {}): void {
    const { requireFolders = true } = options;

    // Check required top-level fields
    for (const field of REQUIRED_FIELDS) {
        if (!config[field]) {
            throw new Error(`Missing required configuration field: ${field}`);
        }
    }

    // Validate folders (only required in single-client mode)
    if (requireFolders) {
        if (!config.folders) {
            throw new Error('Missing required configuration field: folders');
        }
        const folders = config.folders as Record<string, unknown>;
        if (!folders.input) {
            throw new Error('Missing required configuration: folders.input');
        }
        if (!folders.output) {
            throw new Error('Missing required configuration: folders.output');
        }
        if (!folders.analyzedSubfolder) {
            throw new Error('Missing required configuration: folders.analyzedSubfolder');
        }
    }

    // Validate processing
    const processing = config.processing as Record<string, unknown>;
    if (typeof processing.concurrency !== 'number' || (processing.concurrency as number) < 1) {
        throw new Error('processing.concurrency must be a positive number');
    }
    if (typeof processing.retryAttempts !== 'number' || (processing.retryAttempts as number) < 0) {
        throw new Error('processing.retryAttempts must be a non-negative number');
    }

    // Validate field definitions if present
    if (config.fieldDefinitions) {
        validateFieldDefinitions(config.fieldDefinitions);
    }

    // Validate tag definitions if present
    if (config.tagDefinitions) {
        validateTagDefinitions(config.tagDefinitions);
    }

    // Validate promptTemplate if present
    if (config.promptTemplate) {
        validatePromptTemplate(config.promptTemplate);
    }

    // Validate output
    const output = config.output as Record<string, unknown>;
    if (!output.filenameTemplate) {
        throw new Error('Missing required configuration: output.filenameTemplate');
    }
}

/**
 * Ensure all required directories exist
 * @param config - The configuration object
 */
export async function ensureDirectories(config: AppConfig): Promise<void> {
    await fs.promises.mkdir(config.folders!.input, { recursive: true });
    await fs.promises.mkdir(config.folders!.output, { recursive: true });
    await fs.promises.mkdir(config.folders!.analyzed, { recursive: true });
}

/**
 * Get configuration synchronously (must call loadConfig first)
 * @returns The cached configuration
 */
export function getConfig(): AppConfig {
    if (!cachedConfig) {
        throw new Error('Configuration not loaded. Call loadConfig() first.');
    }
    return cachedConfig;
}

/**
 * Clear the cached configuration (useful for testing)
 */
export function clearConfigCache(): void {
    cachedConfig = null;
}

/**
 * Save configuration to config.json (partial update).
 * Reads current file, merges updates, writes back, clears cache.
 * @param updates - Key-value pairs to merge into config
 */
export async function saveConfig(updates: Record<string, unknown>): Promise<void> {
    const configPath = path.join(process.cwd(), CONFIG_FILE);
    const configData = await fs.promises.readFile(configPath, 'utf-8');
    const config = JSON.parse(configData) as Record<string, unknown>;

    Object.assign(config, updates);

    await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2));

    clearConfigCache();
}

/**
 * Update fieldDefinitions in config.json.
 * Validates before saving.
 * @param fieldDefinitions - The field definitions array
 */
export async function updateFieldDefinitions(fieldDefinitions: FieldDefinition[]): Promise<void> {
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
 * @param scope - 'fields', 'global', 'client:<id>', 'clients', 'all'
 * @returns Export bundle with metadata envelope
 */
export async function exportConfig(scope: string): Promise<ExportBundle> {
    const configPath = path.join(process.cwd(), CONFIG_FILE);
    const rawConfig = JSON.parse(await fs.promises.readFile(configPath, 'utf-8')) as Record<string, unknown>;

    let data: unknown;

    switch (scope) {
        case 'fields':
            data = {
                fieldDefinitions: rawConfig.fieldDefinitions || null,
                tagDefinitions: rawConfig.tagDefinitions || null
            };
            break;

        case 'global':
            data = { ...rawConfig };
            // Exclude folders (environment-specific)
            delete (data as Record<string, unknown>).folders;
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
            delete ((data as Record<string, unknown>).config as Record<string, unknown>).folders;
            break;
        }

        default:
            if (scope.startsWith('client:')) {
                const clientId = sanitize(scope.substring(7));
                const clientPath = safeJoin(CLIENTS_DIR, `${clientId}.json`);
                try {
                    data = { clientId, config: JSON.parse(await fs.promises.readFile(clientPath, 'utf-8')) };
                } catch (err: unknown) {
                    if ((err as NodeJS.ErrnoException).code === 'ENOENT')
                        throw new Error(`Client "${clientId}" not found`);
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
 * @returns Map of clientId -> client config
 */
async function loadClientFiles(): Promise<Record<string, unknown>> {
    const clients: Record<string, unknown> = {};
    try {
        const files = await fs.promises.readdir(CLIENTS_DIR);
        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            const clientId = path.basename(file, '.json');
            const content = await fs.promises.readFile(path.join(CLIENTS_DIR, file), 'utf-8');
            clients[clientId] = JSON.parse(content);
        }
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    return clients;
}

/**
 * Import a config bundle (auto-backup before write)
 * @param bundle - The export bundle to import
 * @returns Import result summary
 */
export async function importConfig(bundle: unknown): Promise<ImportResult> {
    // Validate envelope
    if (!bundle || typeof bundle !== 'object') {
        throw new Error('Invalid import bundle: must be a JSON object');
    }
    const b = bundle as Record<string, unknown>;
    if (!b.scope || !b.data) {
        throw new Error('Invalid import bundle: missing "scope" or "data"');
    }

    // Auto-backup before import
    const backup = await createBackup(`pre-import-${b.scope}`);

    const configPath = path.join(process.cwd(), CONFIG_FILE);
    const imported: ImportResult = { scope: b.scope as string, backupId: backup.id, updated: [] };
    const bundleData = b.data as Record<string, unknown>;

    switch (b.scope) {
        case 'fields': {
            if (bundleData.fieldDefinitions) {
                validateFieldDefinitions(bundleData.fieldDefinitions);
            }
            if (bundleData.tagDefinitions) {
                validateTagDefinitions(bundleData.tagDefinitions);
            }
            const rawConfig = JSON.parse(await fs.promises.readFile(configPath, 'utf-8')) as Record<string, unknown>;
            if (bundleData.fieldDefinitions !== undefined) {
                rawConfig.fieldDefinitions = bundleData.fieldDefinitions;
                imported.updated.push('fieldDefinitions');
            }
            if (bundleData.tagDefinitions !== undefined) {
                rawConfig.tagDefinitions = bundleData.tagDefinitions;
                imported.updated.push('tagDefinitions');
            }
            await fs.promises.writeFile(configPath, JSON.stringify(rawConfig, null, 2));
            clearConfigCache();
            break;
        }

        case 'global': {
            const rawConfig = JSON.parse(await fs.promises.readFile(configPath, 'utf-8')) as Record<string, unknown>;
            const folders = rawConfig.folders; // Preserve environment-specific folders
            Object.assign(rawConfig, bundleData);
            rawConfig.folders = folders;
            if (rawConfig.fieldDefinitions) {
                validateFieldDefinitions(rawConfig.fieldDefinitions);
            }
            await fs.promises.writeFile(configPath, JSON.stringify(rawConfig, null, 2));
            clearConfigCache();
            imported.updated.push('config.json');
            break;
        }

        case 'clients': {
            if (!bundleData.clients || typeof bundleData.clients !== 'object') {
                throw new Error('Import bundle for "clients" scope must have data.clients object');
            }
            await fs.promises.mkdir(CLIENTS_DIR, { recursive: true });
            for (const [clientId, config] of Object.entries(bundleData.clients as Record<string, unknown>)) {
                await fs.promises.writeFile(
                    path.join(CLIENTS_DIR, `${clientId}.json`),
                    JSON.stringify(config, null, 2)
                );
                imported.updated.push(`clients/${clientId}.json`);
            }
            break;
        }

        case 'all': {
            // Import global config
            if (bundleData.config) {
                const rawConfig = JSON.parse(await fs.promises.readFile(configPath, 'utf-8')) as Record<
                    string,
                    unknown
                >;
                const folders = rawConfig.folders;
                Object.assign(rawConfig, bundleData.config as Record<string, unknown>);
                rawConfig.folders = folders;
                if (rawConfig.fieldDefinitions) {
                    validateFieldDefinitions(rawConfig.fieldDefinitions);
                }
                await fs.promises.writeFile(configPath, JSON.stringify(rawConfig, null, 2));
                clearConfigCache();
                imported.updated.push('config.json');
            }
            // Import clients
            if (bundleData.clients && typeof bundleData.clients === 'object') {
                await fs.promises.mkdir(CLIENTS_DIR, { recursive: true });
                for (const [clientId, config] of Object.entries(bundleData.clients as Record<string, unknown>)) {
                    await fs.promises.writeFile(
                        path.join(CLIENTS_DIR, `${clientId}.json`),
                        JSON.stringify(config, null, 2)
                    );
                    imported.updated.push(`clients/${clientId}.json`);
                }
            }
            break;
        }

        default:
            if ((b.scope as string).startsWith('client:')) {
                const clientId = sanitize((b.scope as string).substring(7));
                if (!bundleData.config) {
                    throw new Error('Import bundle for single client must have data.config');
                }
                await fs.promises.mkdir(CLIENTS_DIR, { recursive: true });
                await fs.promises.writeFile(
                    safeJoin(CLIENTS_DIR, `${clientId}.json`),
                    JSON.stringify(bundleData.config, null, 2)
                );
                imported.updated.push(`clients/${clientId}.json`);
            } else {
                throw new Error(`Unknown import scope: "${b.scope}"`);
            }
    }

    return imported;
}

/**
 * Create a timestamped backup of current config
 * @param label - Optional label for the backup
 * @returns Backup metadata { id, path, timestamp, label }
 */
export async function createBackup(label?: string): Promise<BackupMetadata> {
    await fs.promises.mkdir(BACKUPS_DIR, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const id = label ? `${timestamp}_${sanitize(label)}` : timestamp;
    const backupDir = safeJoin(BACKUPS_DIR, id);
    await fs.promises.mkdir(backupDir);

    // Copy config.json
    const configPath = path.join(process.cwd(), CONFIG_FILE);
    try {
        await fs.promises.copyFile(configPath, path.join(backupDir, 'config.json'));
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }

    // Copy clients/ directory
    try {
        const clientFiles = await fs.promises.readdir(CLIENTS_DIR);
        if (clientFiles.length > 0) {
            const clientsBackupDir = path.join(backupDir, 'clients');
            await fs.promises.mkdir(clientsBackupDir);
            for (const file of clientFiles) {
                if (file.endsWith('.json')) {
                    await fs.promises.copyFile(path.join(CLIENTS_DIR, file), path.join(clientsBackupDir, file));
                }
            }
        }
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }

    // Write metadata
    const metadata: BackupMetadata = { id, timestamp: new Date().toISOString(), label: label || null };
    await fs.promises.writeFile(path.join(backupDir, '_metadata.json'), JSON.stringify(metadata, null, 2));

    return metadata;
}

/**
 * List available backups sorted newest-first
 * @returns Array of backup metadata objects
 */
export async function listBackups(): Promise<BackupMetadata[]> {
    try {
        const entries = await fs.promises.readdir(BACKUPS_DIR);
        const backups: BackupMetadata[] = [];

        for (const entry of entries) {
            const metaPath = path.join(BACKUPS_DIR, entry, '_metadata.json');
            try {
                const meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf-8')) as BackupMetadata;
                backups.push(meta);
            } catch {
                // Skip entries without valid metadata
            }
        }

        // Sort newest first
        backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        return backups;
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw err;
    }
}

/**
 * Restore from a specific backup (creates safety backup first)
 * @param backupId - The backup ID to restore
 * @returns Restore result { restoredFrom, safetyBackupId, restored }
 */
export async function restoreBackup(backupId: string): Promise<RestoreResult> {
    const backupDir = safeJoin(BACKUPS_DIR, sanitize(backupId));

    // Verify backup exists
    try {
        await fs.promises.access(backupDir);
    } catch {
        throw new Error(`Backup "${backupId}" not found`);
    }

    // Create safety backup before restoring
    const safety = await createBackup('pre-restore-safety');

    const restored: string[] = [];

    // Restore config.json
    const backupConfigPath = path.join(backupDir, 'config.json');
    const configPath = path.join(process.cwd(), CONFIG_FILE);
    try {
        await fs.promises.copyFile(backupConfigPath, configPath);
        clearConfigCache();
        restored.push('config.json');
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }

    // Restore clients/
    const backupClientsDir = path.join(backupDir, 'clients');
    try {
        const clientFiles = await fs.promises.readdir(backupClientsDir);
        await fs.promises.mkdir(CLIENTS_DIR, { recursive: true });
        for (const file of clientFiles) {
            if (file.endsWith('.json')) {
                await fs.promises.copyFile(path.join(backupClientsDir, file), path.join(CLIENTS_DIR, file));
                restored.push(`clients/${file}`);
            }
        }
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }

    return {
        restoredFrom: backupId,
        safetyBackupId: safety.id,
        restored
    };
}
