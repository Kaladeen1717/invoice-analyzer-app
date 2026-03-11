// Client-related type definitions.
// Extracted from src/client-manager.js data shapes.

import type { FieldDefinition, TagDefinition, PromptTemplate, OutputConfig, ProcessingConfig } from './config.js';

/** On-disk client JSON file shape (clients/{clientId}.json) */
export interface ClientFile {
    name: string;
    enabled: boolean;
    folderPath: string;
    apiKeyEnvVar?: string | null;
    model?: string;

    // Modern override format (preferred)
    fieldOverrides?: Record<string, { enabled?: boolean; [key: string]: unknown }>;
    tagOverrides?: Record<string, { enabled?: boolean; [key: string]: unknown }>;
    promptOverride?: Partial<PromptTemplate>;
    outputOverride?: Partial<OutputConfig>;

    // Legacy formats (deprecated, still supported for backward compatibility)
    fieldDefinitions?: FieldDefinition[];
    promptTemplate?: PromptTemplate;
    output?: Partial<OutputConfig>;
}

/** Client info returned by listing operations */
export interface ClientInfo {
    clientId: string;
    name: string;
    enabled: boolean;
    folderPath: string;
    apiKeyEnvVar: string | null;
}

/** Resolved folder paths for a client */
export interface ClientFolders {
    base: string;
    input: string;
    processedOriginal: string;
    processedEnriched: string;
    csvPath: string;
}

/** Merged client config (global + client overrides) */
export interface MergedClientConfig {
    clientId: string;
    name: string;
    enabled: boolean;
    apiKeyEnvVar: string | null;
    model: string | null;
    folders: ClientFolders;
    processing: ProcessingConfig;
    output: OutputConfig;
    fieldDefinitions: FieldDefinition[];
    tagDefinitions: TagDefinition[] | null;
    promptTemplate: PromptTemplate | Record<string, never>;
}

/** Source annotation for annotated config */
export type ConfigSource = 'global' | 'override' | 'custom';

/** Field with source annotation */
export interface AnnotatedField extends FieldDefinition {
    _source: ConfigSource;
}

/** Tag with source annotation */
export interface AnnotatedTag extends TagDefinition {
    _source: ConfigSource;
}

/** Folder status info */
export interface FolderStatus {
    exists: boolean;
    inputPdfCount: number;
    processedCount: number;
}

/** Annotated client config returned by getAnnotatedClientConfig() */
export interface AnnotatedClientConfig {
    client: {
        name: string;
        clientId: string;
        enabled: boolean;
        folderPath: string;
        apiKeyEnvVar: string | null;
        folderStatus: FolderStatus;
    };
    model: {
        value: string | null;
        _source: 'global' | 'override';
    };
    fieldDefinitions: AnnotatedField[];
    tagDefinitions: AnnotatedTag[];
    promptTemplate: PromptTemplate & { _source: 'global' | 'override' };
    filenameTemplate: {
        template: string;
        _source: 'global' | 'override';
    };
    output: OutputConfig & { _source: 'global' | 'override' };
}
