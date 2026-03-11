// Configuration-related type definitions.
// Extracted from src/config.js and src/constants.js data shapes.

export type FieldType = 'text' | 'number' | 'boolean' | 'date' | 'array';

export type FieldFormatKey =
    | 'iso8601'
    | 'iso4217'
    | 'iso3166_alpha2'
    | 'iso3166_alpha3'
    | 'iso9362'
    | 'iso13616'
    | 'iso11649'
    | 'iso17442';

export interface FieldFormatDefinition {
    label: string;
    standard: string;
    pattern: string;
    compatibleTypes: FieldType[];
}

export type OverrideSection = 'fields' | 'tags' | 'prompt' | 'output' | 'model';

export interface FieldDefinition {
    key: string;
    label: string;
    type: FieldType;
    schemaHint: string;
    instruction: string;
    enabled: boolean;
    format?: string | null;
}

export interface TagParameter {
    label: string;
    default: unknown;
}

export interface TagDefinition {
    id: string;
    label: string;
    instruction: string;
    enabled: boolean;
    parameters?: Record<string, TagParameter>;
    filenamePlaceholder?: string | null;
    filenameFormat?: string | null;
}

export interface PromptTemplate {
    preamble: string;
    generalRules: string;
    suffix: string;
}

export interface OutputConfig {
    filenameTemplate: string;
    processedOriginalSubfolder: string;
    processedEnrichedSubfolder: string;
    csvFilename: string;
    includeSummary?: boolean;
}

export interface ProcessingConfig {
    concurrency: number;
    retryAttempts: number;
    retryDelayMs?: number;
}

export interface FoldersConfig {
    input: string;
    output: string;
    analyzed: string;
    analyzedSubfolder: string;
}

export interface AppConfig {
    processing: ProcessingConfig;
    output: OutputConfig;
    folders?: FoldersConfig;
    fieldDefinitions?: FieldDefinition[];
    tagDefinitions?: TagDefinition[];
    promptTemplate?: PromptTemplate;
    rawPrompt?: string;
    model?: string;
}

export interface ExportBundle {
    exportVersion: number;
    exportedAt: string;
    scope: string;
    data: unknown;
}

export interface BackupMetadata {
    id: string;
    timestamp: string;
    label: string | null;
}

export interface ImportResult {
    scope: string;
    backupId: string;
    updated: string[];
}

export interface RestoreResult {
    restoredFrom: string;
    safetyBackupId: string;
    restored: string[];
}
