#!/usr/bin/env node

/**
 * Migration script to convert legacy clients.json to individual client files
 * in the clients/ folder.
 *
 * Usage: node scripts/migrate-clients.js [--dry-run]
 *
 * Options:
 *   --dry-run  Show what would be created without actually creating files
 */

const fs = require('fs').promises;
const path = require('path');

const CLIENTS_JSON = path.join(process.cwd(), 'clients.json');
const CLIENTS_DIR = path.join(process.cwd(), 'clients');

async function main() {
    const dryRun = process.argv.includes('--dry-run');

    console.log('Client Configuration Migration Tool');
    console.log('===================================\n');

    if (dryRun) {
        console.log('DRY RUN MODE - No files will be created\n');
    }

    // Check if clients.json exists
    try {
        await fs.access(CLIENTS_JSON);
    } catch {
        console.log('No clients.json found. Nothing to migrate.');
        return;
    }

    // Check if clients/ folder already has files
    try {
        const existingFiles = await fs.readdir(CLIENTS_DIR);
        const jsonFiles = existingFiles.filter((f) => f.endsWith('.json'));
        if (jsonFiles.length > 0) {
            console.log('WARNING: clients/ folder already contains client files:');
            jsonFiles.forEach((f) => console.log(`  - ${f}`));
            console.log('\nMigration will skip existing clients.\n');
        }
    } catch {
        // clients/ folder doesn't exist yet
    }

    // Read clients.json
    let clientsConfig;
    try {
        const content = await fs.readFile(CLIENTS_JSON, 'utf-8');
        clientsConfig = JSON.parse(content);
    } catch (error) {
        console.error(`Failed to read clients.json: ${error.message}`);
        process.exit(1);
    }

    if (!clientsConfig.clients || typeof clientsConfig.clients !== 'object') {
        console.error('Invalid clients.json: must contain a "clients" object');
        process.exit(1);
    }

    const clients = Object.entries(clientsConfig.clients);
    if (clients.length === 0) {
        console.log('No clients found in clients.json');
        return;
    }

    console.log(`Found ${clients.length} client(s) to migrate:\n`);

    // Create clients/ folder if not exists
    if (!dryRun) {
        await fs.mkdir(CLIENTS_DIR, { recursive: true });
    }

    let migrated = 0;
    let skipped = 0;

    for (const [clientId, client] of clients) {
        const outputFile = path.join(CLIENTS_DIR, `${clientId}.json`);

        // Check if file already exists
        try {
            await fs.access(outputFile);
            console.log(`  SKIP: ${clientId}.json (already exists)`);
            skipped++;
            continue;
        } catch {
            // File doesn't exist, proceed with migration
        }

        // Extract privateAddressMarker from extraction block if needed (migrate to tagOverrides)
        const privateAddressMarker =
            client.privateAddressMarker || (client.extraction && client.extraction.privateAddressMarker);

        // Build new client config structure
        const newConfig = {
            name: client.name,
            enabled: client.enabled,
            folderPath: client.folderPath,
            apiKeyEnvVar: client.apiKeyEnvVar || null
        };

        // Migrate privateAddressMarker to tagOverrides
        if (privateAddressMarker) {
            newConfig.tagOverrides = {
                private: {
                    parameters: {
                        address: privateAddressMarker
                    }
                }
            };
        }

        // Optionally include extraction overrides (without privateAddressMarker)
        if (client.extraction) {
            const { privateAddressMarker: _, ...otherExtraction } = client.extraction;
            if (Object.keys(otherExtraction).length > 0) {
                newConfig.extraction = otherExtraction;
            }
        }

        // Optionally include output overrides
        if (client.output) {
            newConfig.output = client.output;
        }

        // Optionally include custom documentTypes
        if (client.documentTypes) {
            newConfig.documentTypes = client.documentTypes;
        }

        console.log(`  ${dryRun ? 'WOULD CREATE' : 'CREATE'}: ${clientId}.json`);
        console.log(`    Name: ${newConfig.name}`);
        console.log(`    Enabled: ${newConfig.enabled}`);
        console.log(`    Folder: ${newConfig.folderPath}`);
        if (newConfig.tagOverrides) {
            console.log(`    Tag Overrides: private.address = "${privateAddressMarker}"`);
        }
        console.log();

        if (!dryRun) {
            await fs.writeFile(outputFile, JSON.stringify(newConfig, null, 2) + '\n');
        }

        migrated++;
    }

    console.log('\n-----------------------------------');
    console.log(`Migration complete: ${migrated} migrated, ${skipped} skipped`);

    if (!dryRun && migrated > 0) {
        console.log('\nNext steps:');
        console.log('1. Verify the new client files in clients/ folder');
        console.log('2. Test with: node batch-process.js --list');
        console.log('3. Once verified, you can delete clients.json');
    }
}

main().catch((error) => {
    console.error('Migration failed:', error.message);
    process.exit(1);
});
