require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs').promises;

// Import modules
const { loadConfig, saveConfig, updateFieldDefinitions, updateTagDefinitions, updatePromptTemplate, updateRawPrompt, clearRawPrompt, exportConfig, importConfig, createBackup, listBackups, restoreBackup } = require('./src/config');
const { buildPromptPreview } = require('./src/prompt-builder');
const { processAllInvoices } = require('./src/parallel-processor');
const {
    getAllClients,
    getClient,
    createClient,
    updateClient,
    deleteClient,
    getClientConfig,
    getClientFolderStatus,
    isMultiClientMode,
    clearClientsCache,
    ensureClientDirectories
} = require('./src/client-manager');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static('public'));
app.use(express.json());

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
                    globalConfig.output?.processedOriginalSubfolder || 'processed-original'
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
            globalConfig.output?.processedOriginalSubfolder || 'processed-original'
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
            globalConfig.output?.processedOriginalSubfolder || 'processed-original'
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
            fieldDefinitions: config.fieldDefinitions || null,
            tagDefinitions: config.tagDefinitions || null,
            extraction: config.extraction,
            output: config.output,
            processing: config.processing,
            documentTypes: config.documentTypes || null
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
// PROCESSING API ENDPOINTS
// ============================================================================

/**
 * POST /api/clients/:id/process - Process specific client (SSE)
 */
app.post('/api/clients/:id/process', async (req, res) => {
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
            res.write('data: ' + JSON.stringify({
                status: 'error',
                error: `Client "${clientId}" is already being processed`
            }) + '\n\n');
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
            res.write('data: ' + JSON.stringify({
                status: 'error',
                error: `Folder does not exist: ${clientConfig.folders.base}`
            }) + '\n\n');
            res.end();
            activeProcessing.delete(clientId);
            return;
        }

        // Ensure subfolders exist (processed-original, processed-enriched)
        await ensureClientDirectories(clientConfig);

        // Merge client config with global config for processing
        const processingConfig = {
            ...globalConfig,
            folders: clientConfig.folders,
            extraction: clientConfig.extraction,
            output: clientConfig.output,
            documentTypes: clientConfig.documentTypes,
            fieldDefinitions: clientConfig.fieldDefinitions,
            tagDefinitions: clientConfig.tagDefinitions
        };

        // Start processing with progress streaming
        await processAllInvoices(processingConfig, {
            csvPath: clientConfig.folders.csvPath,
            onProgress: (data) => {
                res.write('data: ' + JSON.stringify({ ...data, clientId }) + '\n\n');
            },
            onComplete: (summary) => {
                res.write('data: ' + JSON.stringify({ status: 'done', clientId, ...summary }) + '\n\n');
                res.end();
                activeProcessing.delete(clientId);
            }
        });

    } catch (error) {
        res.write('data: ' + JSON.stringify({
            status: 'error',
            clientId,
            error: error.message
        }) + '\n\n');
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
app.post('/api/clients/process-all', async (req, res) => {
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
            res.write('data: ' + JSON.stringify({
                status: 'error',
                error: 'Processing all clients is already in progress'
            }) + '\n\n');
            res.end();
            return;
        }

        activeProcessing.set('all', true);

        const clients = await getAllClients();
        const globalConfig = await loadConfig();

        if (!clients || Object.keys(clients).length === 0) {
            res.write('data: ' + JSON.stringify({
                status: 'error',
                error: 'No clients configured'
            }) + '\n\n');
            res.end();
            activeProcessing.delete('all');
            return;
        }

        // Filter to enabled clients only
        const enabledClients = Object.entries(clients).filter(([_, client]) => client.enabled);

        if (enabledClients.length === 0) {
            res.write('data: ' + JSON.stringify({
                status: 'error',
                error: 'No enabled clients found'
            }) + '\n\n');
            res.end();
            activeProcessing.delete('all');
            return;
        }

        res.write('data: ' + JSON.stringify({
            status: 'starting-batch',
            totalClients: enabledClients.length,
            clients: enabledClients.map(([id, c]) => ({ clientId: id, name: c.name }))
        }) + '\n\n');

        let totalSuccess = 0;
        let totalFailed = 0;
        let completedClients = 0;

        // Process each enabled client sequentially
        for (const [clientId, client] of enabledClients) {
            res.write('data: ' + JSON.stringify({
                status: 'client-starting',
                clientId,
                clientName: client.name,
                clientNumber: completedClients + 1,
                totalClients: enabledClients.length
            }) + '\n\n');

            try {
                const clientConfig = await getClientConfig(clientId, globalConfig);

                // Check if folder exists
                try {
                    await fs.access(clientConfig.folders.base);
                } catch {
                    res.write('data: ' + JSON.stringify({
                        status: 'client-error',
                        clientId,
                        error: `Folder does not exist: ${clientConfig.folders.base}`
                    }) + '\n\n');
                    completedClients++;
                    continue;
                }

                // Ensure subfolders exist (processed-original, processed-enriched)
                await ensureClientDirectories(clientConfig);

                const processingConfig = {
                    ...globalConfig,
                    folders: clientConfig.folders,
                    extraction: clientConfig.extraction,
                    output: clientConfig.output,
                    documentTypes: clientConfig.documentTypes,
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
                        res.write('data: ' + JSON.stringify({
                            status: 'client-done',
                            clientId,
                            ...summary
                        }) + '\n\n');
                    }
                });

            } catch (error) {
                res.write('data: ' + JSON.stringify({
                    status: 'client-error',
                    clientId,
                    error: error.message
                }) + '\n\n');
            }

            completedClients++;
        }

        res.write('data: ' + JSON.stringify({
            status: 'done',
            mode: 'all',
            totalClients: enabledClients.length,
            totalSuccess,
            totalFailed
        }) + '\n\n');
        res.end();
        activeProcessing.delete('all');

    } catch (error) {
        res.write('data: ' + JSON.stringify({
            status: 'error',
            error: error.message
        }) + '\n\n');
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

app.listen(PORT, () => {
    console.log(`\n🚀 Invoice Analyzer Admin running on http://localhost:${PORT}`);
    console.log(`📄 Open http://localhost:${PORT} in your browser to manage clients\n`);

    if (!process.env.GEMINI_API_KEY) {
        console.warn('⚠️  WARNING: GEMINI_API_KEY not found in .env file');
        console.warn('   Please add your API key to continue\n');
    }
});
