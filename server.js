require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');

// Import modules
const { VALID_OVERRIDE_SECTIONS, DEFAULT_PROCESSED_ORIGINAL_SUBFOLDER } = require('./src/constants');
const {
    loadConfig,
    saveConfig,
    updateFieldDefinitions,
    updateTagDefinitions,
    updatePromptTemplate,
    updateRawPrompt,
    clearRawPrompt,
    exportConfig,
    importConfig,
    listBackups,
    restoreBackup
} = require('./src/config');
const { buildPromptPreview } = require('./src/prompt-builder');
const { processAllInvoices, processWithRetry } = require('./src/parallel-processor');
const { getResults, getSummary, getResult, getFailedResults, updateResult } = require('./src/result-manager');
const {
    getAllClients,
    getClient,
    createClient,
    updateClient,
    deleteClient,
    getClientConfig,
    getAnnotatedClientConfig,
    getClientFolderStatus,
    isMultiClientMode,
    ensureClientDirectories,
    saveClientOverrides,
    removeClientOverrides,
    resolveApiKey
} = require('./src/client-manager');

const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static('public'));
app.use(express.json());

// Rate limiting for processing and file-access endpoints
const processingLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: 'Too many requests, please try again later' }
});

// Store active SSE connections for processing
const activeProcessing = new Map();

// ============================================================================
// CLIENT MANAGEMENT API ENDPOINTS
// ============================================================================

/**
 * GET /api/clients - List all clients with folder status
 */
app.get('/api/clients', async (req, res) => {
    try {
        const clients = await getAllClients();
        const globalConfig = await loadConfig();

        if (!clients) {
            return res.json({
                clients: [],
                mode: 'single-client'
            });
        }

        // Enrich each client with folder status
        const enrichedClients = await Promise.all(
            Object.entries(clients).map(async ([clientId, client]) => {
                const folderStatus = await getClientFolderStatus(
                    client.folderPath,
                    globalConfig.output?.processedOriginalSubfolder || DEFAULT_PROCESSED_ORIGINAL_SUBFOLDER
                );

                return {
                    clientId,
                    name: client.name,
                    enabled: client.enabled,
                    folderPath: client.folderPath,
                    apiKeyEnvVar: client.apiKeyEnvVar || null,
                    tagOverrides: client.tagOverrides || null,
                    folderStatus
                };
            })
        );

        res.json({
            clients: enrichedClients,
            mode: 'multi-client'
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to load clients',
            details: error.message
        });
    }
});

/**
 * GET /api/clients/:id - Get single client config
 */
app.get('/api/clients/:id', async (req, res) => {
    try {
        const clientId = req.params.id;
        const client = await getClient(clientId);
        const globalConfig = await loadConfig();
        const folderStatus = await getClientFolderStatus(
            client.folderPath,
            globalConfig.output?.processedOriginalSubfolder || DEFAULT_PROCESSED_ORIGINAL_SUBFOLDER
        );

        res.json({
            clientId,
            ...client,
            folderStatus
        });
    } catch (error) {
        if (error.message.includes('not found')) {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({
            error: 'Failed to get client',
            details: error.message
        });
    }
});

/**
 * POST /api/clients - Create new client
 */
app.post('/api/clients', async (req, res) => {
    try {
        const { clientId, name, enabled, folderPath, apiKeyEnvVar, tagOverrides } = req.body;

        if (!clientId) {
            return res.status(400).json({ error: 'clientId is required' });
        }

        const config = {
            name,
            enabled: enabled !== false,
            folderPath
        };

        if (apiKeyEnvVar) {
            config.apiKeyEnvVar = apiKeyEnvVar;
        }

        if (tagOverrides) {
            config.tagOverrides = tagOverrides;
        }

        await createClient(clientId, config);

        res.status(201).json({
            success: true,
            clientId,
            message: `Client "${clientId}" created successfully`
        });
    } catch (error) {
        if (error.message.includes('already exists')) {
            return res.status(409).json({ error: error.message });
        }
        res.status(400).json({
            error: 'Failed to create client',
            details: error.message
        });
    }
});

/**
 * PUT /api/clients/:id - Update client config
 */
app.put('/api/clients/:id', async (req, res) => {
    try {
        const clientId = req.params.id;
        const { name, enabled, folderPath, apiKeyEnvVar, tagOverrides } = req.body;

        const config = {
            name,
            enabled: enabled !== false,
            folderPath
        };

        if (apiKeyEnvVar) {
            config.apiKeyEnvVar = apiKeyEnvVar;
        }

        if (tagOverrides) {
            config.tagOverrides = tagOverrides;
        }

        await updateClient(clientId, config);

        res.json({
            success: true,
            clientId,
            message: `Client "${clientId}" updated successfully`
        });
    } catch (error) {
        if (error.message.includes('not found')) {
            return res.status(404).json({ error: error.message });
        }
        res.status(400).json({
            error: 'Failed to update client',
            details: error.message
        });
    }
});

/**
 * DELETE /api/clients/:id - Delete client
 */
app.delete('/api/clients/:id', async (req, res) => {
    try {
        const clientId = req.params.id;
        await deleteClient(clientId);

        res.json({
            success: true,
            clientId,
            message: `Client "${clientId}" deleted successfully`
        });
    } catch (error) {
        if (error.message.includes('not found')) {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({
            error: 'Failed to delete client',
            details: error.message
        });
    }
});

/**
 * GET /api/clients/:id/status - Get folder PDF counts for client
 */
app.get('/api/clients/:id/status', async (req, res) => {
    try {
        const clientId = req.params.id;
        const client = await getClient(clientId);
        const globalConfig = await loadConfig();
        const folderStatus = await getClientFolderStatus(
            client.folderPath,
            globalConfig.output?.processedOriginalSubfolder || DEFAULT_PROCESSED_ORIGINAL_SUBFOLDER
        );

        res.json({
            clientId,
            folderPath: client.folderPath,
            ...folderStatus
        });
    } catch (error) {
        if (error.message.includes('not found')) {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({
            error: 'Failed to get client status',
            details: error.message
        });
    }
});

/**
 * GET /api/clients/:id/config - Get annotated effective config for client
 */
app.get('/api/clients/:id/config', async (req, res) => {
    try {
        const clientId = req.params.id;
        const globalConfig = await loadConfig({ requireFolders: false });
        const annotated = await getAnnotatedClientConfig(clientId, globalConfig);
        res.json(annotated);
    } catch (error) {
        if (error.message.includes('not found')) {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({
            error: 'Failed to get client config',
            details: error.message
        });
    }
});

/**
 * PUT /api/clients/:id/overrides - Save per-section config overrides
 */
app.put('/api/clients/:id/overrides', async (req, res) => {
    try {
        const clientId = req.params.id;
        const { section, data } = req.body;

        if (!section || !data) {
            return res.status(400).json({ error: 'section and data are required' });
        }

        if (!VALID_OVERRIDE_SECTIONS.includes(section)) {
            return res
                .status(400)
                .json({ error: `Invalid section. Must be one of: ${VALID_OVERRIDE_SECTIONS.join(', ')}` });
        }

        await saveClientOverrides(clientId, section, data);

        // Return updated annotated config
        const globalConfig = await loadConfig({ requireFolders: false });
        const annotated = await getAnnotatedClientConfig(clientId, globalConfig);

        res.json({ success: true, ...annotated });
    } catch (error) {
        if (error.message.includes('not found')) {
            return res.status(404).json({ error: error.message });
        }
        res.status(400).json({
            error: 'Failed to save overrides',
            details: error.message
        });
    }
});

/**
 * DELETE /api/clients/:id/overrides/:section - Remove per-section config overrides
 */
app.delete('/api/clients/:id/overrides/:section', async (req, res) => {
    try {
        const { id: clientId, section } = req.params;

        if (!VALID_OVERRIDE_SECTIONS.includes(section)) {
            return res
                .status(400)
                .json({ error: `Invalid section. Must be one of: ${VALID_OVERRIDE_SECTIONS.join(', ')}` });
        }

        await removeClientOverrides(clientId, section);

        // Return updated annotated config
        const globalConfig = await loadConfig({ requireFolders: false });
        const annotated = await getAnnotatedClientConfig(clientId, globalConfig);

        res.json({ success: true, ...annotated });
    } catch (error) {
        if (error.message.includes('not found')) {
            return res.status(404).json({ error: error.message });
        }
        res.status(400).json({
            error: 'Failed to remove overrides',
            details: error.message
        });
    }
});

/**
 * POST /api/clients/:id/prompt/preview - Build prompt preview for client's merged config
 */
app.post('/api/clients/:id/prompt/preview', processingLimiter, async (req, res) => {
    try {
        const config = await loadConfig({ requireFolders: false });
        const mergedConfig = await getClientConfig(req.params.id, config);
        const templateOverride = req.body.promptTemplate || {};
        const preview = buildPromptPreview(mergedConfig, templateOverride);
        res.json({ preview });
    } catch (error) {
        if (error.message.includes('not found')) {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to build client prompt preview', details: error.message });
    }
});

// ============================================================================
// GLOBAL CONFIG API ENDPOINTS
// ============================================================================

/**
 * GET /api/config - Get global configuration
 */
app.get('/api/config', async (req, res) => {
    try {
        const config = await loadConfig({ requireFolders: false });
        res.json({
            model: config.model || null,
            fieldDefinitions: config.fieldDefinitions || null,
            tagDefinitions: config.tagDefinitions || null,
            output: config.output,
            processing: config.processing
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to load config', details: error.message });
    }
});

/**
 * PUT /api/config/fields - Update field definitions
 */
app.put('/api/config/fields', async (req, res) => {
    try {
        const { fieldDefinitions } = req.body;
        if (!fieldDefinitions) {
            return res.status(400).json({ error: 'fieldDefinitions array is required' });
        }
        await updateFieldDefinitions(fieldDefinitions);
        res.json({ success: true, message: 'Field definitions updated' });
    } catch (error) {
        res.status(400).json({ error: 'Failed to update field definitions', details: error.message });
    }
});

/**
 * GET /api/config/tags - Get tag definitions
 */
app.get('/api/config/tags', async (req, res) => {
    try {
        const config = await loadConfig({ requireFolders: false });
        res.json({ tagDefinitions: config.tagDefinitions || null });
    } catch (error) {
        res.status(500).json({ error: 'Failed to load tag definitions', details: error.message });
    }
});

/**
 * PUT /api/config/tags - Update tag definitions
 */
app.put('/api/config/tags', async (req, res) => {
    try {
        const { tagDefinitions } = req.body;
        if (!tagDefinitions) {
            return res.status(400).json({ error: 'tagDefinitions array is required' });
        }
        await updateTagDefinitions(tagDefinitions);
        res.json({ success: true, message: 'Tag definitions updated' });
    } catch (error) {
        res.status(400).json({ error: 'Failed to update tag definitions', details: error.message });
    }
});

/**
 * GET /api/config/prompt - Get prompt template
 */
app.get('/api/config/prompt', async (req, res) => {
    try {
        const config = await loadConfig({ requireFolders: false });
        res.json({
            promptTemplate: config.promptTemplate || null,
            rawPrompt: config.rawPrompt || null
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to load prompt config', details: error.message });
    }
});

/**
 * PUT /api/config/prompt - Update prompt template (structured mode)
 */
app.put('/api/config/prompt', async (req, res) => {
    try {
        const { promptTemplate } = req.body;
        if (!promptTemplate) {
            return res.status(400).json({ error: 'promptTemplate object is required' });
        }
        await updatePromptTemplate(promptTemplate);
        res.json({ success: true, message: 'Prompt template updated' });
    } catch (error) {
        res.status(400).json({ error: 'Failed to update prompt template', details: error.message });
    }
});

/**
 * PUT /api/config/prompt/raw - Update raw prompt (raw edit mode)
 */
app.put('/api/config/prompt/raw', async (req, res) => {
    try {
        const { rawPrompt } = req.body;
        if (!rawPrompt) {
            return res.status(400).json({ error: 'rawPrompt string is required' });
        }
        await updateRawPrompt(rawPrompt);
        res.json({ success: true, message: 'Raw prompt saved' });
    } catch (error) {
        res.status(400).json({ error: 'Failed to update raw prompt', details: error.message });
    }
});

/**
 * DELETE /api/config/prompt/raw - Clear raw prompt (revert to structured mode)
 */
app.delete('/api/config/prompt/raw', async (req, res) => {
    try {
        await clearRawPrompt();
        res.json({ success: true, message: 'Raw prompt cleared, using structured template' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear raw prompt', details: error.message });
    }
});

/**
 * POST /api/config/prompt/preview - Build prompt preview from template
 */
app.post('/api/config/prompt/preview', async (req, res) => {
    try {
        const config = await loadConfig({ requireFolders: false });
        const templateOverride = req.body.promptTemplate || {};
        const preview = buildPromptPreview(config, templateOverride);
        res.json({ preview });
    } catch (error) {
        res.status(500).json({ error: 'Failed to build prompt preview', details: error.message });
    }
});

/**
 * PUT /api/config/output - Update output configuration (filenameTemplate)
 */
app.put('/api/config/output', async (req, res) => {
    try {
        const { filenameTemplate } = req.body;
        if (!filenameTemplate || typeof filenameTemplate !== 'string') {
            return res.status(400).json({ error: 'filenameTemplate must be a non-empty string' });
        }
        const config = await loadConfig({ requireFolders: false });
        await saveConfig({ output: { ...config.output, filenameTemplate } });
        res.json({ success: true, message: 'Filename template updated' });
    } catch (error) {
        res.status(400).json({ error: 'Failed to update output config', details: error.message });
    }
});

/**
 * PUT /api/config/model - Update global model
 */
app.put('/api/config/model', async (req, res) => {
    try {
        const { model } = req.body;
        if (!model || typeof model !== 'string') {
            return res.status(400).json({ error: 'model must be a non-empty string' });
        }
        await saveConfig({ model });
        res.json({ success: true, message: 'Model updated' });
    } catch (error) {
        res.status(400).json({ error: 'Failed to update model', details: error.message });
    }
});

// ============================================================================
// CONFIG EXPORT / IMPORT / BACKUP API ENDPOINTS
// ============================================================================

/**
 * GET /api/config/export?scope=<scope> - Export configuration as JSON bundle
 * Scopes: fields, global, client:<id>, clients, all
 */
app.get('/api/config/export', async (req, res) => {
    try {
        const scope = req.query.scope || 'all';
        const bundle = await exportConfig(scope);
        res.json(bundle);
    } catch (error) {
        const status = error.message.includes('not found') ? 404 : 400;
        res.status(status).json({ error: error.message });
    }
});

/**
 * POST /api/config/import - Import a config bundle (auto-backup before write)
 */
app.post('/api/config/import', async (req, res) => {
    try {
        const bundle = req.body;
        const result = await importConfig(bundle);
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(400).json({ error: 'Import failed', details: error.message });
    }
});

/**
 * GET /api/config/backups - List available config backups
 */
app.get('/api/config/backups', async (req, res) => {
    try {
        const backups = await listBackups();
        res.json({ backups });
    } catch (error) {
        res.status(500).json({ error: 'Failed to list backups', details: error.message });
    }
});

/**
 * POST /api/config/restore - Restore from a backup (creates safety backup first)
 */
app.post('/api/config/restore', async (req, res) => {
    try {
        const { backupId } = req.body;
        if (!backupId) {
            return res.status(400).json({ error: 'backupId is required' });
        }
        const result = await restoreBackup(backupId);
        res.json({ success: true, ...result });
    } catch (error) {
        const status = error.message.includes('not found') ? 404 : 500;
        res.status(status).json({ error: 'Restore failed', details: error.message });
    }
});

// ============================================================================
// PROCESSING RESULTS API ENDPOINTS
// ============================================================================

/**
 * GET /api/clients/:id/results - Paginated processing results with optional status filter
 */
app.get('/api/clients/:id/results', async (req, res) => {
    try {
        const clientId = req.params.id;
        const globalConfig = await loadConfig({ requireFolders: false });
        const clientConfig = await getClientConfig(clientId, globalConfig);

        const status = req.query.status || undefined;
        const limit = Math.min(parseInt(req.query.limit) || 50, 250);
        const offset = parseInt(req.query.offset) || 0;

        const results = await getResults(clientConfig.folders.base, { status, limit, offset });
        res.json(results);
    } catch (error) {
        const status = error.message.includes('not found') ? 404 : 500;
        res.status(status).json({ error: error.message });
    }
});

/**
 * GET /api/clients/:id/results/summary - Aggregate processing statistics
 */
app.get('/api/clients/:id/results/summary', async (req, res) => {
    try {
        const clientId = req.params.id;
        const globalConfig = await loadConfig({ requireFolders: false });
        const clientConfig = await getClientConfig(clientId, globalConfig);

        const summary = await getSummary(clientConfig.folders.base);
        res.json(summary);
    } catch (error) {
        const status = error.message.includes('not found') ? 404 : 500;
        res.status(status).json({ error: error.message });
    }
});

/**
 * POST /api/clients/:id/results/retry - Retry failed invoice processing (SSE)
 * Body: { resultIds: ["uuid1", ...] } or { all: true }
 */
app.post('/api/clients/:id/results/retry', processingLimiter, async (req, res) => {
    const clientId = req.params.id;

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    res.write('data: ' + JSON.stringify({ status: 'connected', clientId }) + '\n\n');

    try {
        if (activeProcessing.has(clientId)) {
            res.write(
                'data: ' + JSON.stringify({ status: 'error', error: 'Client is already being processed' }) + '\n\n'
            );
            res.end();
            return;
        }

        activeProcessing.set(clientId, true);

        const globalConfig = await loadConfig();
        const clientConfig = await getClientConfig(clientId, globalConfig);
        const apiKey = resolveApiKey(clientConfig);

        const processingConfig = {
            ...globalConfig,
            model: clientConfig.model,
            folders: clientConfig.folders,
            output: clientConfig.output,
            fieldDefinitions: clientConfig.fieldDefinitions,
            tagDefinitions: clientConfig.tagDefinitions,
            promptTemplate: clientConfig.promptTemplate
        };

        // Determine which results to retry
        let resultsToRetry;
        if (req.body.all) {
            resultsToRetry = await getFailedResults(clientConfig.folders.base);
        } else if (req.body.resultIds && Array.isArray(req.body.resultIds)) {
            resultsToRetry = [];
            for (const id of req.body.resultIds) {
                const r = await getResult(clientConfig.folders.base, id);
                if (r && r.status === 'failed') resultsToRetry.push(r);
            }
        } else {
            res.write(
                'data: ' + JSON.stringify({ status: 'error', error: 'Provide resultIds array or all: true' }) + '\n\n'
            );
            res.end();
            activeProcessing.delete(clientId);
            return;
        }

        if (resultsToRetry.length === 0) {
            res.write('data: ' + JSON.stringify({ status: 'error', error: 'No failed results to retry' }) + '\n\n');
            res.end();
            activeProcessing.delete(clientId);
            return;
        }

        res.write('data: ' + JSON.stringify({ status: 'retry-starting', total: resultsToRetry.length }) + '\n\n');

        const originalFolder =
            clientConfig.folders.processedOriginal ||
            path.join(clientConfig.folders.base, DEFAULT_PROCESSED_ORIGINAL_SUBFOLDER);
        let retrySuccess = 0;
        let retryFailed = 0;

        for (let i = 0; i < resultsToRetry.length; i++) {
            const failedResult = resultsToRetry[i];
            const originalPath = path.join(clientConfig.folders.base, failedResult.originalFilename);
            const processedOriginalPath = path.join(originalFolder, failedResult.originalFilename);

            res.write(
                'data: ' +
                    JSON.stringify({
                        status: 'retry-processing',
                        filename: failedResult.originalFilename,
                        current: i + 1,
                        total: resultsToRetry.length,
                        resultId: failedResult.id
                    }) +
                    '\n\n'
            );

            try {
                // Copy file back to input folder for processing
                let filePath;
                try {
                    await fs.access(processedOriginalPath);
                    await fs.copyFile(processedOriginalPath, originalPath);
                    filePath = originalPath;
                } catch {
                    // File might still be in input folder
                    try {
                        await fs.access(originalPath);
                        filePath = originalPath;
                    } catch {
                        throw new Error(`Original file not found: ${failedResult.originalFilename}`);
                    }
                }

                const result = await processWithRetry(filePath, processingConfig, { apiKey });

                // Update the result record
                await updateResult(clientConfig.folders.base, failedResult.id, result, {
                    model: processingConfig.model,
                    duration: result.duration
                });

                if (result.success) {
                    retrySuccess++;
                    res.write(
                        'data: ' +
                            JSON.stringify({
                                status: 'retry-completed',
                                resultId: failedResult.id,
                                filename: failedResult.originalFilename,
                                outputFilename: result.outputFilename,
                                current: i + 1,
                                total: resultsToRetry.length
                            }) +
                            '\n\n'
                    );
                } else {
                    retryFailed++;
                    res.write(
                        'data: ' +
                            JSON.stringify({
                                status: 'retry-failed',
                                resultId: failedResult.id,
                                filename: failedResult.originalFilename,
                                error: result.error,
                                current: i + 1,
                                total: resultsToRetry.length
                            }) +
                            '\n\n'
                    );
                }
            } catch (error) {
                retryFailed++;
                res.write(
                    'data: ' +
                        JSON.stringify({
                            status: 'retry-failed',
                            resultId: failedResult.id,
                            filename: failedResult.originalFilename,
                            error: error.message,
                            current: i + 1,
                            total: resultsToRetry.length
                        }) +
                        '\n\n'
                );
            }
        }

        res.write(
            'data: ' +
                JSON.stringify({
                    status: 'retry-done',
                    success: retrySuccess,
                    failed: retryFailed,
                    total: resultsToRetry.length
                }) +
                '\n\n'
        );
        res.end();
        activeProcessing.delete(clientId);
    } catch (error) {
        res.write('data: ' + JSON.stringify({ status: 'error', error: error.message }) + '\n\n');
        res.end();
        activeProcessing.delete(clientId);
    }

    req.on('close', () => {
        activeProcessing.delete(clientId);
    });
});

/**
 * GET /api/stats - Aggregate processing statistics across all clients
 */
app.get('/api/stats', async (req, res) => {
    try {
        const clients = await getAllClients();
        const globalConfig = await loadConfig({ requireFolders: false });

        const aggregate = {
            totalProcessed: 0,
            totalSuccess: 0,
            totalFailed: 0,
            successRate: 0,
            totalTokens: 0,
            totalCachedTokens: 0,
            lastProcessed: null
        };

        const perClient = {};

        if (clients) {
            for (const [clientId] of Object.entries(clients)) {
                try {
                    const clientConfig = await getClientConfig(clientId, globalConfig);
                    const summary = await getSummary(clientConfig.folders.base);

                    perClient[clientId] = {
                        total: summary.total,
                        success: summary.success,
                        failed: summary.failed,
                        successRate: summary.successRate,
                        totalTokens: summary.tokenUsage.totalTokens,
                        totalCachedTokens: summary.tokenUsage.cachedTokens || 0,
                        lastProcessed: summary.lastProcessed
                    };

                    aggregate.totalProcessed += summary.total;
                    aggregate.totalSuccess += summary.success;
                    aggregate.totalFailed += summary.failed;
                    aggregate.totalTokens += summary.tokenUsage.totalTokens;
                    aggregate.totalCachedTokens += summary.tokenUsage.cachedTokens || 0;

                    if (
                        summary.lastProcessed &&
                        (!aggregate.lastProcessed || summary.lastProcessed > aggregate.lastProcessed)
                    ) {
                        aggregate.lastProcessed = summary.lastProcessed;
                    }
                } catch {
                    // Skip clients with missing folders
                }
            }
        }

        if (aggregate.totalProcessed > 0) {
            aggregate.successRate = Math.round((aggregate.totalSuccess / aggregate.totalProcessed) * 100);
        }

        res.json({ aggregate, perClient });
    } catch (error) {
        res.status(500).json({ error: 'Failed to load stats', details: error.message });
    }
});

// ============================================================================
// FILE LISTING API ENDPOINTS
// ============================================================================

/**
 * GET /api/clients/:id/files - List PDF files in client's input folder
 */
app.get('/api/clients/:id/files', processingLimiter, async (req, res) => {
    try {
        const clientId = req.params.id;
        const globalConfig = await loadConfig({ requireFolders: false });
        const clientConfig = await getClientConfig(clientId, globalConfig);

        const inputFolder = clientConfig.folders.base;

        try {
            await fs.access(inputFolder);
        } catch {
            return res.json({ files: [], folderPath: inputFolder, exists: false });
        }

        const entries = await fs.readdir(inputFolder);
        const pdfFiles = entries.filter((f) => f.toLowerCase().endsWith('.pdf'));

        const files = await Promise.all(
            pdfFiles.map(async (filename) => {
                const filePath = path.join(inputFolder, filename);
                const stat = await fs.stat(filePath);
                return {
                    filename,
                    size: stat.size,
                    lastModified: stat.mtime.toISOString()
                };
            })
        );

        files.sort((a, b) => a.filename.localeCompare(b.filename));

        res.json({ files, folderPath: inputFolder, exists: true });
    } catch (error) {
        const status = error.message.includes('not found') ? 404 : 500;
        res.status(status).json({ error: error.message });
    }
});

// ============================================================================
// PROCESSING API ENDPOINTS
// ============================================================================

/**
 * POST /api/clients/:id/process - Process specific client (SSE)
 */
app.post('/api/clients/:id/process', processingLimiter, async (req, res) => {
    const clientId = req.params.id;

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Send initial connection message
    res.write('data: ' + JSON.stringify({ status: 'connected', clientId }) + '\n\n');

    try {
        // Check if already processing this client
        if (activeProcessing.has(clientId)) {
            res.write(
                'data: ' +
                    JSON.stringify({
                        status: 'error',
                        error: `Client "${clientId}" is already being processed`
                    }) +
                    '\n\n'
            );
            res.end();
            return;
        }

        activeProcessing.set(clientId, true);

        const globalConfig = await loadConfig();
        const clientConfig = await getClientConfig(clientId, globalConfig);

        // Check if folder exists
        try {
            await fs.access(clientConfig.folders.base);
        } catch {
            res.write(
                'data: ' +
                    JSON.stringify({
                        status: 'error',
                        error: `Folder does not exist: ${clientConfig.folders.base}`
                    }) +
                    '\n\n'
            );
            res.end();
            activeProcessing.delete(clientId);
            return;
        }

        // Ensure subfolders exist (processed-original, processed-enriched)
        await ensureClientDirectories(clientConfig);

        // Merge client config with global config for processing
        const processingConfig = {
            ...globalConfig,
            model: clientConfig.model,
            folders: clientConfig.folders,
            output: clientConfig.output,
            fieldDefinitions: clientConfig.fieldDefinitions,
            tagDefinitions: clientConfig.tagDefinitions,
            promptTemplate: clientConfig.promptTemplate
        };

        // Check for dry-run mode and file selection
        const dryRun = req.body && req.body.dryRun === true;
        const files = req.body && Array.isArray(req.body.files) ? req.body.files : undefined;

        // Start processing with progress streaming
        await processAllInvoices(processingConfig, {
            csvPath: clientConfig.folders.csvPath,
            dryRun,
            files,
            onProgress: (data) => {
                res.write('data: ' + JSON.stringify({ ...data, clientId, dryRun }) + '\n\n');
            },
            onComplete: (summary) => {
                res.write('data: ' + JSON.stringify({ status: 'done', clientId, dryRun, ...summary }) + '\n\n');
                res.end();
                activeProcessing.delete(clientId);
            }
        });
    } catch (error) {
        res.write(
            'data: ' +
                JSON.stringify({
                    status: 'error',
                    clientId,
                    error: error.message
                }) +
                '\n\n'
        );
        res.end();
        activeProcessing.delete(clientId);
    }

    // Handle client disconnect
    req.on('close', () => {
        activeProcessing.delete(clientId);
    });
});

/**
 * POST /api/clients/process-all - Process all enabled clients (SSE)
 */
app.post('/api/clients/process-all', processingLimiter, async (req, res) => {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Send initial connection message
    res.write('data: ' + JSON.stringify({ status: 'connected', mode: 'all' }) + '\n\n');

    try {
        // Check if already processing all
        if (activeProcessing.has('all')) {
            res.write(
                'data: ' +
                    JSON.stringify({
                        status: 'error',
                        error: 'Processing all clients is already in progress'
                    }) +
                    '\n\n'
            );
            res.end();
            return;
        }

        activeProcessing.set('all', true);

        const clients = await getAllClients();
        const globalConfig = await loadConfig();

        if (!clients || Object.keys(clients).length === 0) {
            res.write(
                'data: ' +
                    JSON.stringify({
                        status: 'error',
                        error: 'No clients configured'
                    }) +
                    '\n\n'
            );
            res.end();
            activeProcessing.delete('all');
            return;
        }

        // Filter to enabled clients only
        const enabledClients = Object.entries(clients).filter(([_, client]) => client.enabled);

        if (enabledClients.length === 0) {
            res.write(
                'data: ' +
                    JSON.stringify({
                        status: 'error',
                        error: 'No enabled clients found'
                    }) +
                    '\n\n'
            );
            res.end();
            activeProcessing.delete('all');
            return;
        }

        res.write(
            'data: ' +
                JSON.stringify({
                    status: 'starting-batch',
                    totalClients: enabledClients.length,
                    clients: enabledClients.map(([id, c]) => ({ clientId: id, name: c.name }))
                }) +
                '\n\n'
        );

        let totalSuccess = 0;
        let totalFailed = 0;
        let completedClients = 0;

        // Process each enabled client sequentially
        for (const [clientId, client] of enabledClients) {
            res.write(
                'data: ' +
                    JSON.stringify({
                        status: 'client-starting',
                        clientId,
                        clientName: client.name,
                        clientNumber: completedClients + 1,
                        totalClients: enabledClients.length
                    }) +
                    '\n\n'
            );

            try {
                const clientConfig = await getClientConfig(clientId, globalConfig);

                // Check if folder exists
                try {
                    await fs.access(clientConfig.folders.base);
                } catch {
                    res.write(
                        'data: ' +
                            JSON.stringify({
                                status: 'client-error',
                                clientId,
                                error: `Folder does not exist: ${clientConfig.folders.base}`
                            }) +
                            '\n\n'
                    );
                    completedClients++;
                    continue;
                }

                // Ensure subfolders exist (processed-original, processed-enriched)
                await ensureClientDirectories(clientConfig);

                const processingConfig = {
                    ...globalConfig,
                    model: clientConfig.model,
                    folders: clientConfig.folders,
                    output: clientConfig.output,
                    fieldDefinitions: clientConfig.fieldDefinitions,
                    tagDefinitions: clientConfig.tagDefinitions
                };

                await processAllInvoices(processingConfig, {
                    csvPath: clientConfig.folders.csvPath,
                    onProgress: (data) => {
                        res.write('data: ' + JSON.stringify({ ...data, clientId }) + '\n\n');
                    },
                    onComplete: (summary) => {
                        totalSuccess += summary.success || 0;
                        totalFailed += summary.failed || 0;
                        res.write(
                            'data: ' +
                                JSON.stringify({
                                    status: 'client-done',
                                    clientId,
                                    ...summary
                                }) +
                                '\n\n'
                        );
                    }
                });
            } catch (error) {
                res.write(
                    'data: ' +
                        JSON.stringify({
                            status: 'client-error',
                            clientId,
                            error: error.message
                        }) +
                        '\n\n'
                );
            }

            completedClients++;
        }

        res.write(
            'data: ' +
                JSON.stringify({
                    status: 'done',
                    mode: 'all',
                    totalClients: enabledClients.length,
                    totalSuccess,
                    totalFailed
                }) +
                '\n\n'
        );
        res.end();
        activeProcessing.delete('all');
    } catch (error) {
        res.write(
            'data: ' +
                JSON.stringify({
                    status: 'error',
                    error: error.message
                }) +
                '\n\n'
        );
        res.end();
        activeProcessing.delete('all');
    }

    // Handle client disconnect
    req.on('close', () => {
        activeProcessing.delete('all');
    });
});

// ============================================================================
// HEALTH CHECK ENDPOINT
// ============================================================================

/**
 * GET /api/health - Health check
 */
app.get('/api/health', async (req, res) => {
    const multiClientMode = await isMultiClientMode();

    res.json({
        status: 'ok',
        geminiConfigured: !!process.env.GEMINI_API_KEY,
        mode: multiClientMode ? 'multi-client' : 'single-client'
    });
});

// ============================================================================
// START SERVER
// ============================================================================

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`\n🚀 Invoice Analyzer Admin running on http://localhost:${PORT}`);
        console.log(`📄 Open http://localhost:${PORT} in your browser to manage clients\n`);

        if (!process.env.GEMINI_API_KEY) {
            console.warn('⚠️  WARNING: GEMINI_API_KEY not found in .env file');
            console.warn('   Please add your API key to continue\n');
        }
    });
}

module.exports = app;
