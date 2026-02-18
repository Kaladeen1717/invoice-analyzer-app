/**
 * Parallel processing with controlled concurrency
 */

const path = require('path');
const { processInvoice, getPdfFiles } = require('./processor');
const {
    getEnabledClients,
    getClientConfig,
    resolveApiKey,
    ensureClientDirectories,
    clientFolderExists
} = require('./client-manager');
const { appendInvoiceRow } = require('./csv-logger');
const { appendResult } = require('./result-manager');

/**
 * Sleep for a specified number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Process a single invoice with retry logic
 * @param {string} filePath - Path to the PDF file
 * @param {Object} config - Configuration object
 * @param {Object} options - Processing options
 * @param {string} options.apiKey - Optional API key for this client
 * @param {boolean} options.dryRun - If true, skip file moves and PDF enrichment
 * @returns {Promise<Object>} Processing result
 */
async function processWithRetry(filePath, config, options = {}) {
    const { apiKey, onProgress, dryRun } = options;
    const maxAttempts = config.processing.retryAttempts + 1;
    const baseDelay = config.processing.retryDelayMs || 1000;

    let lastError = null;
    const startTime = Date.now();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const result = await processInvoice(filePath, config, { apiKey, onProgress, dryRun });

        if (result.success) {
            result.duration = Date.now() - startTime;
            return result;
        }

        lastError = result.error;

        // Don't retry on the last attempt
        if (attempt < maxAttempts) {
            // Exponential backoff
            const delay = baseDelay * Math.pow(2, attempt - 1);
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
        error: lastError,
        tokenUsage: { promptTokens: 0, outputTokens: 0, totalTokens: 0 },
        duration: Date.now() - startTime
    };
}

/**
 * Process all invoices in the input folder with parallel execution
 * @param {Object} config - Configuration object
 * @param {Object} options - Processing options
 * @param {string} options.apiKey - Optional API key for this client
 * @param {string} options.csvPath - Optional path to CSV log file
 * @param {string[]} options.files - Optional list of filenames to process (filters from available PDFs)
 * @param {Function} options.onProgress - Progress callback for SSE
 * @param {Function} options.onComplete - Called when all processing is done
 * @param {Function} options.onInvoiceComplete - Called after each invoice is processed
 * @returns {Promise<Object>} Processing results summary
 */
async function processAllInvoices(config, options = {}) {
    const { apiKey, csvPath, onProgress, onComplete, onInvoiceComplete, storeResults = true, dryRun, files } = options;

    // Get all PDF files, then filter if specific files requested
    let pdfFiles = await getPdfFiles(config);
    if (files && files.length > 0) {
        const fileSet = new Set(files);
        pdfFiles = pdfFiles.filter((f) => fileSet.has(path.basename(f)));
    }

    if (pdfFiles.length === 0) {
        const result = {
            total: 0,
            success: 0,
            failed: 0,
            results: [],
            csvRowsAdded: 0,
            tokenUsage: { promptTokens: 0, outputTokens: 0, totalTokens: 0 }
        };
        if (onComplete) onComplete(result);
        return result;
    }

    // Use dynamic import for p-limit (ESM module)
    const pLimit = (await import('p-limit')).default;
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
    const results = [];

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
            if (result.success && !result.dryRun && csvPath) {
                try {
                    await appendInvoiceRow(csvPath, result, config);
                    csvRowsAdded++;
                } catch (csvError) {
                    console.error(`Warning: Failed to write to CSV: ${csvError.message}`);
                }
            }

            // Store result to processing-results.json
            if (storeResults && config.folders && config.folders.base) {
                try {
                    await appendResult(config.folders.base, result, {
                        model: config.model,
                        duration: result.duration
                    });
                } catch (err) {
                    console.error(`Warning: Failed to store processing result: ${err.message}`);
                }
            }

            // Call invoice complete callback
            if (onInvoiceComplete) {
                onInvoiceComplete(result);
            }

            if (onProgress) {
                let progressStatus = 'failed';
                if (result.success) progressStatus = result.dryRun ? 'dry-run-completed' : 'completed';
                onProgress({
                    status: progressStatus,
                    filename: result.originalFilename,
                    outputFilename: result.outputFilename,
                    error: result.error,
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
            const usage = r.tokenUsage || { promptTokens: 0, outputTokens: 0, totalTokens: 0 };
            return {
                promptTokens: acc.promptTokens + usage.promptTokens,
                outputTokens: acc.outputTokens + usage.outputTokens,
                totalTokens: acc.totalTokens + usage.totalTokens
            };
        },
        { promptTokens: 0, outputTokens: 0, totalTokens: 0 }
    );

    const summary = {
        total: pdfFiles.length,
        success: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
        csvRowsAdded,
        tokenUsage
    };

    if (onComplete) {
        onComplete(summary);
    }

    return summary;
}

/**
 * Create an event emitter for SSE progress updates
 * @param {Object} config - Configuration object
 * @returns {Object} Object with start() and subscribe() methods
 */
function createProgressEmitter(config) {
    const listeners = new Set();

    return {
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },

        async start() {
            return processAllInvoices(config, {
                onProgress: (data) => {
                    for (const listener of listeners) {
                        try {
                            listener(data);
                        } catch (e) {
                            console.error('Error in progress listener:', e);
                        }
                    }
                },
                onComplete: (summary) => {
                    for (const listener of listeners) {
                        try {
                            listener({ status: 'done', ...summary });
                        } catch (e) {
                            console.error('Error in complete listener:', e);
                        }
                    }
                }
            });
        }
    };
}

/**
 * Process all invoices for all enabled clients
 * @param {Object} globalConfig - Global configuration object
 * @param {Object} options - Processing options
 * @param {Function} options.onClientStart - Called when starting to process a client
 * @param {Function} options.onClientComplete - Called when a client is done
 * @param {Function} options.onProgress - Progress callback for each invoice
 * @param {Function} options.onComplete - Called when all clients are done
 * @returns {Promise<Object>} Processing results for all clients
 */
async function processAllClients(globalConfig, options = {}) {
    const { onClientStart, onClientComplete, onProgress, onComplete } = options;

    const enabledClients = await getEnabledClients();

    if (!enabledClients) {
        throw new Error('Multi-client mode not available. Create clients.json to enable.');
    }

    const clientIds = Object.keys(enabledClients);

    if (clientIds.length === 0) {
        const result = {
            clients: {},
            totalClients: 0,
            totalFiles: 0,
            totalSuccess: 0,
            totalFailed: 0,
            tokenUsage: { promptTokens: 0, outputTokens: 0, totalTokens: 0 }
        };
        if (onComplete) onComplete(result);
        return result;
    }

    const results = {
        clients: {},
        totalClients: clientIds.length,
        totalFiles: 0,
        totalSuccess: 0,
        totalFailed: 0,
        tokenUsage: { promptTokens: 0, outputTokens: 0, totalTokens: 0 }
    };

    for (const clientId of clientIds) {
        const client = enabledClients[clientId];

        // Get merged client config
        let clientConfig;
        try {
            clientConfig = await getClientConfig(clientId, globalConfig);
        } catch (error) {
            console.error(`Error loading config for client "${clientId}": ${error.message}`);
            results.clients[clientId] = {
                name: client.name,
                error: error.message,
                skipped: true
            };
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
            };
            continue;
        }

        // Ensure client directories exist
        try {
            await ensureClientDirectories(clientConfig);
        } catch (error) {
            console.error(`Error creating directories for client "${client.name}": ${error.message}`);
            results.clients[clientId] = {
                name: client.name,
                error: error.message,
                skipped: true
            };
            continue;
        }

        // Resolve API key for this client
        let apiKey;
        try {
            apiKey = resolveApiKey(clientConfig);
        } catch (error) {
            console.error(`Error resolving API key for client "${client.name}": ${error.message}`);
            results.clients[clientId] = {
                name: client.name,
                error: error.message,
                skipped: true
            };
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
        const clientResults = await processAllInvoices(clientConfig, {
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

/**
 * Process a single client's invoices
 * @param {string} clientId - The client ID
 * @param {Object} globalConfig - Global configuration object
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processing results for the client
 */
async function processSingleClient(clientId, globalConfig, options = {}) {
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
    const results = await processAllInvoices(clientConfig, {
        apiKey,
        csvPath: clientConfig.folders.csvPath,
        onProgress,
        onComplete
    });

    return {
        clientId,
        name: clientConfig.name,
        ...results
    };
}

module.exports = {
    processWithRetry,
    processAllInvoices,
    createProgressEmitter,
    processAllClients,
    processSingleClient
};
