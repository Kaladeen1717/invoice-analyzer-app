// Processing pipeline type definitions.
// Extracted from src/processor.js, src/parallel-processor.js, src/result-manager.js.

/** Token usage from Gemini API response */
export interface TokenUsage {
    promptTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedTokens: number;
    thoughtsTokens?: number;
}

/** Extracted invoice data — keys are dynamic from fieldDefinitions */
export interface InvoiceAnalysis {
    [fieldKey: string]: unknown;
    tags?: Record<string, boolean>;
    summary?: string;
    _formatWarnings?: Array<{ field: string; format: string; value: unknown; error: string | undefined }>;
    _tokenUsage?: TokenUsage;
    // Legacy support
    isPrivate?: boolean;
}

/** Successful processing result */
export interface ProcessingSuccess {
    success: true;
    dryRun?: boolean;
    originalFilename: string;
    outputFilename: string;
    outputPath?: string;
    originalDestPath?: string;
    analyzedPath?: string;
    analysis: InvoiceAnalysis;
    tokenUsage: TokenUsage;
    duration?: number;
}

/** Failed processing result */
export interface ProcessingFailure {
    success: false;
    originalFilename: string;
    error: string;
    isRateLimited: boolean;
    rawResponse: string | null;
    tokenUsage: TokenUsage;
    duration?: number;
}

/** Union type for processing results */
export type ProcessingResult = ProcessingSuccess | ProcessingFailure;

/** Progress callback event data */
export interface ProgressEvent {
    status: string;
    filename?: string;
    outputFilename?: string;
    completed?: number;
    total?: number;
    attempt?: number;
    maxAttempts?: number;
    delay?: number;
    error?: string;
    analysis?: InvoiceAnalysis;
    [key: string]: unknown;
}

/** Callback signatures for processing pipeline */
export type OnProgressCallback = (progress: ProgressEvent) => void;
export type OnCompleteCallback = (summary: BatchResult & { status: 'done' }) => void;
export type OnInvoiceCompleteCallback = (result: ProcessingResult) => void;

/** Batch processing result */
export interface BatchResult {
    total: number;
    success: number;
    failed: number;
    results: ProcessingResult[];
    csvRowsAdded: number;
    tokenUsage: TokenUsage;
}

/** Options for processAllInvoices */
export interface ProcessAllOptions {
    apiKey?: string;
    csvPath?: string;
    onProgress?: OnProgressCallback;
    onComplete?: OnCompleteCallback;
    onInvoiceComplete?: OnInvoiceCompleteCallback;
    storeResults?: boolean;
    dryRun?: boolean;
    files?: string[];
}

/** Per-client batch result */
export interface ClientBatchResult extends BatchResult {
    name: string;
    error?: string;
    skipped?: boolean;
}

/** Multi-client processing result */
export interface MultiClientResult {
    clients: Record<string, ClientBatchResult>;
    totalClients: number;
    totalFiles: number;
    totalSuccess: number;
    totalFailed: number;
    tokenUsage: TokenUsage;
}

/** Client start callback */
export type OnClientStartCallback = (data: { clientId: string; name: string; folderPath: string }) => void;

/** Client complete callback */
export type OnClientCompleteCallback = (data: {
    clientId: string;
    name: string;
    total: number;
    success: number;
    failed: number;
    results: ProcessingResult[];
    csvRowsAdded: number;
    tokenUsage: TokenUsage;
}) => void;

/** Stored result record (in processing-results.json) */
export interface ResultRecord {
    id: string;
    originalFilename: string;
    outputFilename: string | null;
    status: 'success' | 'failed' | 'dry-run';
    model: string | null;
    extractedFields: Record<string, unknown>;
    tags: Record<string, boolean>;
    tokenUsage: TokenUsage;
    timestamp: string;
    error: string | null;
    rawResponse: string | null;
    duration: number | null;
    retriedFrom?: string;
}

/** Results file on-disk shape */
export interface ResultsFileData {
    results: ResultRecord[];
    lastUpdated: string | null;
}

/** Options for getResults() */
export interface GetResultsOptions {
    status?: 'success' | 'failed';
    limit?: number;
    offset?: number;
}

/** Paginated results response */
export interface PaginatedResults {
    results: ResultRecord[];
    total: number;
    hasMore: boolean;
}

/** Results summary statistics */
export interface SummaryStats {
    total: number;
    success: number;
    failed: number;
    dryRun: number;
    successRate: number;
    tokenUsage: TokenUsage;
    firstProcessed: string | null;
    lastProcessed: string | null;
}
