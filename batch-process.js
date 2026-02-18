#!/usr/bin/env node
/**
 * Batch Invoice Processor
 *
 * Processes PDF invoices using parallel execution.
 *
 * Multi-client mode (with clients.json):
 *   node batch-process.js              Process all enabled clients
 *   node batch-process.js --all        Process all enabled clients
 *   node batch-process.js --client X   Process only client X
 *   node batch-process.js --list       List all configured clients
 *
 * Single-client mode (without clients.json):
 *   node batch-process.js              Process invoices in config.json folders
 */

require('dotenv').config();
const { loadConfig, ensureDirectories } = require('./src/config');
const { processAllInvoices, processAllClients, processSingleClient } = require('./src/parallel-processor');
const { isMultiClientMode, getAllClients } = require('./src/client-manager');
// csv-logger imported by parallel-processor internally

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    dim: '\x1b[2m'
};

function log(message, color = '') {
    console.log(`${color}${message}${colors.reset}`);
}

function formatTokenCount(count) {
    if (count >= 1000000) {
        return (count / 1000000).toFixed(2) + 'M';
    } else if (count >= 1000) {
        return (count / 1000).toFixed(1) + 'K';
    }
    return count.toString();
}

function printTokenUsage(tokenUsage) {
    if (!tokenUsage || tokenUsage.totalTokens === 0) return;

    // Calculate media/PDF tokens (total - prompt - output)
    const mediaTokens = tokenUsage.totalTokens - tokenUsage.promptTokens - tokenUsage.outputTokens;

    log('\n  Gemini API Token Usage:', colors.bright);
    log(`    Prompt tokens: ${formatTokenCount(tokenUsage.promptTokens)}`, colors.dim);
    log(`    Media tokens:  ${formatTokenCount(mediaTokens)}`, colors.dim);
    log(`    Output tokens: ${formatTokenCount(tokenUsage.outputTokens)}`, colors.dim);
    log(`    Total tokens:  ${formatTokenCount(tokenUsage.totalTokens)}`, colors.cyan);
}

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        all: false,
        client: null,
        list: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--all' || arg === '-a') {
            options.all = true;
        } else if (arg === '--list' || arg === '-l') {
            options.list = true;
        } else if (arg === '--client' || arg === '-c') {
            if (i + 1 < args.length) {
                options.client = args[++i];
            } else {
                log('Error: --client requires a client ID', colors.red);
                process.exit(1);
            }
        } else if (arg === '--help' || arg === '-h') {
            showHelp();
            process.exit(0);
        } else if (arg.startsWith('-')) {
            log(`Unknown option: ${arg}`, colors.red);
            showHelp();
            process.exit(1);
        }
    }

    return options;
}

function showHelp() {
    console.log(`
${colors.bright}Invoice Batch Processor${colors.reset}

${colors.cyan}Usage:${colors.reset}
  node batch-process.js [options]

${colors.cyan}Options:${colors.reset}
  --all, -a            Process all enabled clients (default in multi-client mode)
  --client, -c <id>    Process only the specified client
  --list, -l           List all configured clients
  --help, -h           Show this help message

${colors.cyan}Examples:${colors.reset}
  node batch-process.js                    # Process all enabled clients
  node batch-process.js --client acme      # Process only 'acme' client
  node batch-process.js --list             # Show all clients

${colors.dim}Without clients.json, operates in single-client mode using config.json folders.${colors.reset}
`);
}

async function listClients() {
    const clients = await getAllClients();

    if (!clients) {
        log('No clients.json found. Running in single-client mode.', colors.yellow);
        return;
    }

    console.log('\n' + '='.repeat(60));
    log('  CONFIGURED CLIENTS', colors.bright + colors.cyan);
    console.log('='.repeat(60) + '\n');

    for (const [clientId, client] of Object.entries(clients)) {
        const status = client.enabled
            ? `${colors.green}enabled${colors.reset}`
            : `${colors.dim}disabled${colors.reset}`;

        log(`  ${colors.bright}${clientId}${colors.reset}`, '');
        log(`    Name:    ${client.name}`, colors.dim);
        log(`    Status:  ${status}`, '');
        log(`    Folder:  ${client.folderPath}`, colors.dim);
        if (client.apiKeyEnvVar) {
            log(`    API Key: ${client.apiKeyEnvVar}`, colors.dim);
        }
        console.log('');
    }
}

async function runSingleClientMode(config) {
    console.log('\n' + '='.repeat(60));
    log('  INVOICE BATCH PROCESSOR', colors.bright + colors.cyan);
    console.log('='.repeat(60) + '\n');

    log('Running in single-client mode (no clients.json found)', colors.yellow);
    console.log('');

    log(`Input folder:    ${config.folders.input}`, colors.dim);
    log(`Output folder:   ${config.folders.output}`, colors.dim);
    log(`Analyzed folder: ${config.folders.analyzed}`, colors.dim);
    log(`Concurrency:     ${config.processing.concurrency} parallel tasks`, colors.dim);
    console.log('');

    // Ensure directories exist
    await ensureDirectories(config);

    // Process all invoices
    const startTime = Date.now();
    let processedCount = 0;

    const results = await processAllInvoices(config, {
        onProgress: (progress) => {
            switch (progress.status) {
                case 'starting':
                    log(`Found ${progress.total} PDF files to process`, colors.cyan);
                    log(`Processing with ${progress.concurrency} concurrent tasks...\n`, colors.dim);
                    break;

                case 'analyzing':
                    process.stdout.write(
                        `${colors.dim}[${processedCount + 1}/${progress.total}] Analyzing: ${progress.filename}...${colors.reset}`
                    );
                    break;

                case 'retrying':
                    process.stdout.write(
                        `\n${colors.yellow}  Retry ${progress.attempt}/${progress.maxAttempts} after ${progress.delay}ms${colors.reset}`
                    );
                    break;

                case 'completed':
                    processedCount++;
                    console.log(`${colors.green} ✓${colors.reset}`);
                    log(`    → ${progress.outputFilename}`, colors.dim);
                    break;

                case 'failed':
                    processedCount++;
                    console.log(`${colors.red} ✗${colors.reset}`);
                    log(`    Error: ${progress.error}`, colors.red);
                    break;
            }
        }
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    printSummary(results, duration, config.folders.output);

    return results;
}

async function runMultiClientMode(config, clientId = null) {
    console.log('\n' + '='.repeat(60));
    log('  INVOICE BATCH PROCESSOR - MULTI-CLIENT MODE', colors.bright + colors.cyan);
    console.log('='.repeat(60) + '\n');

    const startTime = Date.now();

    if (clientId) {
        // Process single client
        log(`Processing client: ${clientId}`, colors.cyan);
        console.log('');

        let processedCount = 0;

        try {
            const results = await processSingleClient(clientId, config, {
                onProgress: (progress) => {
                    switch (progress.status) {
                        case 'starting':
                            log(`Found ${progress.total} PDF files to process`, colors.cyan);
                            log(`Processing with ${progress.concurrency} concurrent tasks...\n`, colors.dim);
                            break;

                        case 'analyzing':
                            process.stdout.write(
                                `${colors.dim}[${processedCount + 1}/${progress.total}] Analyzing: ${progress.filename}...${colors.reset}`
                            );
                            break;

                        case 'retrying':
                            process.stdout.write(
                                `\n${colors.yellow}  Retry ${progress.attempt}/${progress.maxAttempts} after ${progress.delay}ms${colors.reset}`
                            );
                            break;

                        case 'completed':
                            processedCount++;
                            console.log(`${colors.green} ✓${colors.reset}`);
                            log(`    → ${progress.outputFilename}`, colors.dim);
                            break;

                        case 'failed':
                            processedCount++;
                            console.log(`${colors.red} ✗${colors.reset}`);
                            log(`    Error: ${progress.error}`, colors.red);
                            break;
                    }
                }
            });

            const duration = ((Date.now() - startTime) / 1000).toFixed(1);

            // Print client summary
            console.log('\n' + '='.repeat(60));
            log(`  CLIENT: ${results.name} (${clientId})`, colors.bright + colors.cyan);
            console.log('='.repeat(60));

            log(`\n  Total files:     ${results.total}`, colors.bright);
            log(`  Successful:      ${results.success}`, colors.green);
            if (results.failed > 0) {
                log(`  Failed:          ${results.failed}`, colors.red);
            }
            if (results.csvRowsAdded > 0) {
                log(`  CSV rows added:  ${results.csvRowsAdded}`, colors.blue);
            }
            log(`  Duration:        ${duration}s`, colors.dim);

            // Print token usage
            printTokenUsage(results.tokenUsage);

            // List failed files
            printFailures(results.results);

            console.log('\n');
            return { totalFailed: results.failed, tokenUsage: results.tokenUsage };
        } catch (error) {
            log(`\nError processing client "${clientId}": ${error.message}`, colors.red);
            console.log('\n');
            return { totalFailed: 1 };
        }
    } else {
        // Process all clients
        log('Processing all enabled clients...', colors.cyan);
        console.log('');

        const allResults = await processAllClients(config, {
            onClientStart: ({ clientId, name, folderPath }) => {
                console.log('\n' + '-'.repeat(60));
                log(`  Client: ${name} (${clientId})`, colors.bright + colors.magenta);
                log(`  Folder: ${folderPath}`, colors.dim);
                console.log('-'.repeat(60) + '\n');
            },
            onProgress: (progress) => {
                switch (progress.status) {
                    case 'starting':
                        log(`Found ${progress.total} PDF files to process`, colors.cyan);
                        log(`Processing with ${progress.concurrency} concurrent tasks...\n`, colors.dim);
                        break;

                    case 'analyzing':
                        process.stdout.write(
                            `${colors.dim}[${progress.completed + 1}/${progress.total}] Analyzing: ${progress.filename}...${colors.reset}`
                        );
                        break;

                    case 'retrying':
                        process.stdout.write(
                            `\n${colors.yellow}  Retry ${progress.attempt}/${progress.maxAttempts} after ${progress.delay}ms${colors.reset}`
                        );
                        break;

                    case 'completed':
                        console.log(`${colors.green} ✓${colors.reset}`);
                        log(`    → ${progress.outputFilename}`, colors.dim);
                        break;

                    case 'failed':
                        console.log(`${colors.red} ✗${colors.reset}`);
                        log(`    Error: ${progress.error}`, colors.red);
                        break;
                }
            },
            onClientComplete: ({ success, failed, csvRowsAdded, skipped, error }) => {
                if (skipped) {
                    log(`\n  Skipped: ${error}`, colors.yellow);
                    return;
                }

                log(`\n  Results: ${success} successful, ${failed} failed`, success > 0 ? colors.green : colors.dim);
                if (csvRowsAdded > 0) {
                    log(`  CSV: ${csvRowsAdded} rows added`, colors.blue);
                }
            }
        });

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        // Print overall summary
        console.log('\n' + '='.repeat(60));
        log('  PROCESSING COMPLETE', colors.bright + colors.cyan);
        console.log('='.repeat(60));

        log(`\n  Total clients:   ${allResults.totalClients}`, colors.bright);
        log(`  Total files:     ${allResults.totalFiles}`, colors.bright);
        log(`  Successful:      ${allResults.totalSuccess}`, colors.green);
        if (allResults.totalFailed > 0) {
            log(`  Failed:          ${allResults.totalFailed}`, colors.red);
        }
        log(`  Duration:        ${duration}s`, colors.dim);

        // Print token usage
        printTokenUsage(allResults.tokenUsage);

        // Per-client summary
        const clientEntries = Object.entries(allResults.clients);
        if (clientEntries.length > 0) {
            log('\n  Per-client summary:', colors.bright);
            for (const [cId, client] of clientEntries) {
                if (client.skipped) {
                    log(`    ${cId}: ${colors.yellow}skipped${colors.reset} (${client.error})`, '');
                } else {
                    const status =
                        client.failed > 0
                            ? `${colors.green}${client.success}${colors.reset}/${colors.red}${client.failed}${colors.reset}`
                            : `${colors.green}${client.success}${colors.reset}`;
                    log(`    ${cId}: ${status} (${client.total} files)`, '');
                }
            }
        }

        console.log('\n');
        return allResults;
    }
}

function printSummary(results, duration, outputFolder) {
    console.log('\n' + '='.repeat(60));
    log('  PROCESSING COMPLETE', colors.bright + colors.cyan);
    console.log('='.repeat(60));

    log(`\n  Total files:     ${results.total}`, colors.bright);
    log(`  Successful:      ${results.success}`, colors.green);
    if (results.failed > 0) {
        log(`  Failed:          ${results.failed}`, colors.red);
    }
    log(`  Duration:        ${duration}s`, colors.dim);
    log(`  Output folder:   ${outputFolder}`, colors.dim);

    // Print token usage
    printTokenUsage(results.tokenUsage);

    printFailures(results.results);
    console.log('\n');
}

function printFailures(results) {
    const failures = results.filter((r) => !r.success);
    if (failures.length > 0) {
        log('\n  Failed files:', colors.yellow);
        for (const f of failures) {
            log(`    - ${f.originalFilename}: ${f.error}`, colors.red);
        }
    }
}

async function main() {
    const options = parseArgs();

    try {
        // Check if we're in multi-client mode
        const multiClient = await isMultiClientMode();

        // Handle --list
        if (options.list) {
            await listClients();
            process.exit(0);
        }

        // Load global configuration
        // In multi-client mode, folders are optional
        log('Loading configuration...', colors.dim);
        const config = await loadConfig({ requireFolders: !multiClient });

        let exitCode = 0;

        if (multiClient) {
            // Multi-client mode
            const results = await runMultiClientMode(config, options.client);
            exitCode = results.totalFailed > 0 ? 1 : 0;
        } else {
            // Single-client mode
            if (options.client) {
                log('Warning: --client flag ignored in single-client mode', colors.yellow);
            }
            const results = await runSingleClientMode(config);
            exitCode = results.failed > 0 ? 1 : 0;
        }

        process.exit(exitCode);
    } catch (error) {
        log(`\nError: ${error.message}`, colors.red);
        if (error.message.includes('config.json')) {
            log('\nPlease ensure config.json exists with valid settings.', colors.yellow);
            log('You can copy config.json.example as a starting point.', colors.dim);
        }
        if (error.message.includes('clients.json')) {
            log('\nFor multi-client mode, create clients.json with client configurations.', colors.yellow);
            log('You can copy clients.json.example as a starting point.', colors.dim);
        }
        process.exit(1);
    }
}

main();
