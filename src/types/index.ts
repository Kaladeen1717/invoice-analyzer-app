// Re-export all shared type definitions.

export type {
    FieldType,
    FieldFormatKey,
    FieldFormatDefinition,
    OverrideSection,
    FieldDefinition,
    TagParameter,
    TagDefinition,
    PromptTemplate,
    OutputConfig,
    ProcessingConfig,
    FoldersConfig,
    AppConfig,
    ExportBundle,
    BackupMetadata,
    ImportResult,
    RestoreResult
} from './config.js';

export type {
    ClientFile,
    ClientInfo,
    ClientFolders,
    MergedClientConfig,
    ConfigSource,
    AnnotatedField,
    AnnotatedTag,
    FolderStatus,
    AnnotatedClientConfig
} from './client.js';

export type {
    TokenUsage,
    InvoiceAnalysis,
    ProcessingSuccess,
    ProcessingFailure,
    ProcessingResult,
    ProgressEvent,
    OnProgressCallback,
    OnCompleteCallback,
    OnInvoiceCompleteCallback,
    BatchResult,
    ProcessAllOptions,
    ClientBatchResult,
    MultiClientResult,
    OnClientStartCallback,
    OnClientCompleteCallback,
    GlobalResultRecord,
    ResultRecord,
    ResultsFileData,
    GetResultsOptions,
    PaginatedResults,
    SummaryStats
} from './processing.js';
