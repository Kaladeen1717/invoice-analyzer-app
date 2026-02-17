require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs').promises;

// Import modules
const { loadConfig } = require('./src/config');
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
                    privateAddressMarker: client.privateAddressMarker,
                    apiKeyEnvVar: client.apiKeyEnvVar || null,
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
        const { clientId, name, enabled, folderPath, privateAddressMarker, apiKeyEnvVar } = req.body;

        if (!clientId) {
            return res.status(400).json({ error: 'clientId is required' });
        }

        const config = {
            name,
            enabled: enabled !== false,
            folderPath,
            privateAddressMarker
        };

        if (apiKeyEnvVar) {
            config.apiKeyEnvVar = apiKeyEnvVar;
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
        const { name, enabled, folderPath, privateAddressMarker, apiKeyEnvVar } = req.body;

        const config = {
            name,
            enabled: enabled !== false,
            folderPath,
            privateAddressMarker
        };

        if (apiKeyEnvVar) {
            config.apiKeyEnvVar = apiKeyEnvVar;
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
            documentTypes: clientConfig.documentTypes
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
                    documentTypes: clientConfig.documentTypes
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
