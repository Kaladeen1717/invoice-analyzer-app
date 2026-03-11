/**
 * Parallel processing with controlled concurrency
 */

import path from 'node:path';
import pLimit from 'p-limit';
import { processInvoice, getPdfFiles } from './processor.js';
import {
    getEnabledClients,
    getClientConfig,
    resolveApiKey,
    ensureClientDirectories,
    clientFolderExists
} from './client-manager.js';
import { appendInvoiceRow } from './csv-logger.js';
import { appendResult } from './result-manager.js';

import type {
    AppConfig,
    ProcessingResult,
    BatchResult,
    ProcessAllOptions,
    MultiClientResult,
    ClientBatchResult,
    TokenUsage,
    OnProgressCallback,
    OnCompleteCallback,
    OnClientStartCallback,
    OnClientCompleteCallback,
    MergedClientConfig
} from './types/index.js';

/**
 * Sleep for a specified number of milliseconds
 * @param ms - Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

interface RetryOptions {
    apiKey?: string;
    onProgress?: OnProgressCallback;
    dryRun?: boolean;
}

/**
 * Process a single invoice with retry logic
 * @param filePath - Path to the PDF file
 * @param config - Configuration object
 * @param options - Processing options
 * @returns Processing result
 */
export async function processWithRetry(
    filePath: string,
    config: AppConfig,
    options: RetryOptions = {}
): Promise<ProcessingResult> {
    const { apiKey, onProgress, dryRun } = options;
    const maxAttempts = config.processing.retryAttempts + 1;
    const baseDelay = config.processing.retryDelayMs || 1000;

    let lastError: string | null = null;
    const startTime = Date.now();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const result = await processInvoice(filePath, config, { apiKey, onProgress, dryRun });

        if (result.success) {
            (result as ProcessingResult & { duration?: number }).duration = Date.now() - startTime;
            return result;
        }

        lastError = (result as { error?: string }).error || null;

        // Don't retry on the last attempt
        if (attempt < maxAttempts) {
            // Rate-limited errors get more aggressive backoff (1s, 3s, 9s)
            // Other errors use standard exponential backoff (1s, 2s, 4s)
            const isRateLimit = (result as { isRateLimited?: boolean }).isRateLimited;
            const delay = isRateLimit ? baseDelay * Math.pow(3, attempt - 1) : baseDelay * Math.pow(2, attempt - 1);
            if (onProgress) {
                onProgress({
                    status: 'retrying',
                    filename: result.originalFilename,
                    attempt,
                    maxAttempts,
                    delay
                });
            }
            await sleep(delay);
        }
    }

    return {
        success: false,
        originalFilename: path.basename(filePath),
        error: lastError!,
        isRateLimited: false,
        rawResponse: null,
        tokenUsage: { promptTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: 0, thoughtsTokens: 0 },
        duration: Date.now() - startTime
    } as ProcessingResult & { duration: number };
}

/**
 * Process all invoices in the input folder with parallel execution
 * @param config - Configuration object
 * @param options - Processing options
 * @returns Processing results summary
 */
export async function processAllInvoices(config: AppConfig, options: ProcessAllOptions = {}): Promise<BatchResult> {
    const { apiKey, csvPath, onProgress, onComplete, onInvoiceComplete, storeResults = true, dryRun, files } = options;

    // Get all PDF files, then filter if specific files requested
    let pdfFiles = await getPdfFiles(config);
    if (files && files.length > 0) {
        const fileSet = new Set(files);
        pdfFiles = pdfFiles.filter((f) => fileSet.has(path.basename(f)));
    }

    if (pdfFiles.length === 0) {
        const result: BatchResult = {
            total: 0,
            success: 0,
            failed: 0,
            results: [],
            csvRowsAdded: 0,
            tokenUsage: { promptTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: 0 } as TokenUsage
        };
        if (onComplete) onComplete({ ...result, status: 'done' });
        return result;
    }

    const limit = pLimit(config.processing.concurrency);

    if (onProgress) {
        onProgress({
            status: 'starting',
            total: pdfFiles.length,
            concurrency: config.processing.concurrency
        });
    }

    let completed = 0;
    let csvRowsAdded = 0;
    const results: ProcessingResult[] = [];

    // Create processing tasks with concurrency limit
    const tasks = pdfFiles.map((filePath) => {
        return limit(async () => {
            const result = await processWithRetry(filePath, config, {
                apiKey,
                dryRun,
                onProgress: (progress) => {
                    if (onProgress) {
                        onProgress({
                            ...progress,
                            completed,
                            total: pdfFiles.length
                        });
                    }
                }
            });

            completed++;
            results.push(result);

            // Log to CSV if successful and csvPath is provided (skip for dry-run)
            if (result.success && !(result as { dryRun?: boolean }).dryRun && csvPath) {
                try {
                    await appendInvoiceRow(
                        csvPath,
                        result as {
                            outputFilename: string;
                            originalFilename: string;
                            analysis: Record<string, unknown>;
                        } & ProcessingResult,
                        config
                    );
                    csvRowsAdded++;
                } catch (csvError: unknown) {
                    console.error(`Warning: Failed to write to CSV: ${(csvError as Error).message}`);
                }
            }

            // Store result to processing-results.json
            const folders = config.folders as unknown as { base?: string };
            if (storeResults && folders && folders.base) {
                try {
                    await appendResult(folders.base, result, {
                        model: config.model,
                        duration: (result as { duration?: number }).duration
                    });
                } catch (err: unknown) {
                    console.error(`Warning: Failed to store processing result: ${(err as Error).message}`);
                }
            }

            // Call invoice complete callback
            if (onInvoiceComplete) {
                onInvoiceComplete(result);
            }

            if (onProgress) {
                let progressStatus = 'failed';
                if (result.success)
                    progressStatus = (result as { dryRun?: boolean }).dryRun ? 'dry-run-completed' : 'completed';
                onProgress({
                    status: progressStatus,
                    filename: result.originalFilename,
                    outputFilename: (result as { outputFilename?: string }).outputFilename,
                    error: (result as { error?: string }).error,
                    completed,
                    total: pdfFiles.length
                });
            }

            return result;
        });
    });

    // Wait for all tasks to complete
    await Promise.all(tasks);

    // Aggregate token usage
    const tokenUsage = results.reduce(
        (acc, r) => {
            const usage = r.tokenUsage || { promptTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: 0 };
            return {
                promptTokens: acc.promptTokens + usage.promptTokens,
                outputTokens: acc.outputTokens + usage.outputTokens,
                totalTokens: acc.totalTokens + usage.totalTokens,
                cachedTokens: acc.cachedTokens + (usage.cachedTokens || 0)
            };
        },
        { promptTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: 0 } as TokenUsage
    );

    const summary: BatchResult = {
        total: pdfFiles.length,
        success: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
        csvRowsAdded,
        tokenUsage
    };

    if (onComplete) {
        onComplete({ ...summary, status: 'done' });
    }

    return summary;
}

interface ProgressEmitter {
    subscribe(listener: (data: Record<string, unknown>) => void): () => boolean;
    start(): Promise<BatchResult>;
}

/**
 * Create an event emitter for SSE progress updates
 * @param config - Configuration object
 * @returns Object with start() and subscribe() methods
 */
export function createProgressEmitter(config: AppConfig): ProgressEmitter {
    const listeners = new Set<(data: Record<string, unknown>) => void>();

    return {
        subscribe(listener: (data: Record<string, unknown>) => void) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },

        async start() {
            return processAllInvoices(config, {
                onProgress: (data) => {
                    for (const listener of listeners) {
                        try {
                            listener(data as unknown as Record<string, unknown>);
                        } catch (e) {
                            console.error('Error in progress listener:', e);
                        }
                    }
                },
                onComplete: (summary) => {
                    for (const listener of listeners) {
                        try {
                            listener({ ...summary, status: 'done' } as unknown as Record<string, unknown>);
                        } catch (e) {
                            console.error('Error in complete listener:', e);
                        }
                    }
                }
            });
        }
    };
}

interface ProcessAllClientsOptions {
    onClientStart?: OnClientStartCallback;
    onClientComplete?: OnClientCompleteCallback;
    onProgress?: OnProgressCallback;
    onComplete?: (result: MultiClientResult) => void;
}

/**
 * Process all invoices for all enabled clients
 * @param globalConfig - Global configuration object
 * @param options - Processing options
 * @returns Processing results for all clients
 */
export async function processAllClients(
    globalConfig: AppConfig,
    options: ProcessAllClientsOptions = {}
): Promise<MultiClientResult> {
    const { onClientStart, onClientComplete, onProgress, onComplete } = options;

    const enabledClients = await getEnabledClients();

    if (!enabledClients) {
        throw new Error('Multi-client mode not available. Create clients.json to enable.');
    }

    const clientIds = Object.keys(enabledClients);

    if (clientIds.length === 0) {
        const result: MultiClientResult = {
            clients: {},
            totalClients: 0,
            totalFiles: 0,
            totalSuccess: 0,
            totalFailed: 0,
            tokenUsage: { promptTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: 0 } as TokenUsage
        };
        if (onComplete) onComplete(result);
        return result;
    }

    const results: MultiClientResult = {
        clients: {},
        totalClients: clientIds.length,
        totalFiles: 0,
        totalSuccess: 0,
        totalFailed: 0,
        tokenUsage: { promptTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: 0 } as TokenUsage
    };

    for (const clientId of clientIds) {
        const client = enabledClients[clientId];

        // Get merged client config
        let clientConfig: MergedClientConfig;
        try {
            clientConfig = await getClientConfig(clientId, globalConfig);
        } catch (error: unknown) {
            console.error(`Error loading config for client "${clientId}": ${(error as Error).message}`);
            results.clients[clientId] = {
                name: client.name,
                error: (error as Error).message,
                skipped: true
            } as ClientBatchResult;
            continue;
        }

        // Check if client folder exists
        const folderExists = await clientFolderExists(clientConfig);
        if (!folderExists) {
            console.warn(`Warning: Folder not found for client "${client.name}": ${clientConfig.folders.base}`);
            results.clients[clientId] = {
                name: client.name,
                error: `Folder not found: ${clientConfig.folders.base}`,
                skipped: true
            } as ClientBatchResult;
            continue;
        }

        // Ensure client directories exist
        try {
            await ensureClientDirectories(clientConfig);
        } catch (error: unknown) {
            console.error(`Error creating directories for client "${client.name}": ${(error as Error).message}`);
            results.clients[clientId] = {
                name: client.name,
                error: (error as Error).message,
                skipped: true
            } as ClientBatchResult;
            continue;
        }

        // Resolve API key for this client
        let apiKey: string;
        try {
            apiKey = resolveApiKey(clientConfig);
        } catch (error: unknown) {
            console.error(`Error resolving API key for client "${client.name}": ${(error as Error).message}`);
            results.clients[clientId] = {
                name: client.name,
                error: (error as Error).message,
                skipped: true
            } as ClientBatchResult;
            continue;
        }

        if (onClientStart) {
            onClientStart({
                clientId,
                name: client.name,
                folderPath: clientConfig.folders.base
            });
        }

        // Process all invoices for this client
        const clientResults = await processAllInvoices(clientConfig as unknown as AppConfig, {
            apiKey,
            csvPath: clientConfig.folders.csvPath,
            onProgress: (progress) => {
                if (onProgress) {
                    onProgress({
                        ...progress,
                        clientId,
                        clientName: client.name
                    });
                }
            }
        });

        results.clients[clientId] = {
            name: client.name,
            ...clientResults
        };

        results.totalFiles += clientResults.total;
        results.totalSuccess += clientResults.success;
        results.totalFailed += clientResults.failed;

        // Aggregate token usage
        if (clientResults.tokenUsage) {
            results.tokenUsage.promptTokens += clientResults.tokenUsage.promptTokens;
            results.tokenUsage.outputTokens += clientResults.tokenUsage.outputTokens;
            results.tokenUsage.totalTokens += clientResults.tokenUsage.totalTokens;
            results.tokenUsage.cachedTokens += clientResults.tokenUsage.cachedTokens || 0;
        }

        if (onClientComplete) {
            onClientComplete({
                clientId,
                name: client.name,
                ...clientResults
            });
        }
    }

    if (onComplete) {
        onComplete(results);
    }

    return results;
}

interface ProcessSingleClientOptions {
    onProgress?: OnProgressCallback;
    onComplete?: OnCompleteCallback;
}

/**
 * Process a single client's invoices
 * @param clientId - The client ID
 * @param globalConfig - Global configuration object
 * @param options - Processing options
 * @returns Processing results for the client
 */
export async function processSingleClient(
    clientId: string,
    globalConfig: AppConfig,
    options: ProcessSingleClientOptions = {}
): Promise<ClientBatchResult> {
    const { onProgress, onComplete } = options;

    // Get merged client config
    const clientConfig = await getClientConfig(clientId, globalConfig);

    // Check if client folder exists
    const folderExists = await clientFolderExists(clientConfig);
    if (!folderExists) {
        throw new Error(`Folder not found: ${clientConfig.folders.base}`);
    }

    // Ensure client directories exist
    await ensureClientDirectories(clientConfig);

    // Resolve API key for this client
    const apiKey = resolveApiKey(clientConfig);

    // Process all invoices for this client
    const results = await processAllInvoices(clientConfig as unknown as AppConfig, {
        apiKey,
        csvPath: clientConfig.folders.csvPath,
        onProgress,
        onComplete
    });

    return {
        name: clientConfig.name,
        ...results
    } as ClientBatchResult;
}
