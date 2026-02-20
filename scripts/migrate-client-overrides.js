#!/usr/bin/env node

/**
 * Migration: Simplify client override storage
 *
 * 1. Convert fieldDefinitions (full array) -> fieldOverrides (sparse object)
 *    - Diff against global config, keep only enabled toggles for global fields
 *    - Keep full definitions for custom fields (keys not in global)
 *
 * 2. Strip parameter values from tagOverrides (keep only enabled toggles)
 *
 * 3. Migrate tag output properties in tagOverrides (same as global migration)
 *
 * Creates backup of each client file before modifying.
 */

const fs = require('fs').promises;
const path = require('path');

const CONFIG_PATH = path.join(process.cwd(), 'config.json');
const CLIENTS_DIR = path.join(process.cwd(), 'clients');

async function migrate() {
    console.log('Client Overrides Migration');
    console.log('==========================\n');

    // Read global config for field definitions reference
    let globalConfig;
    try {
        globalConfig = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf-8'));
    } catch (err) {
        console.error('Failed to read config.json:', err.message);
        process.exit(1);
    }

    const globalFields = globalConfig.fieldDefinitions || [];
    const globalFieldKeys = new Set(globalFields.map((f) => f.key));
    const globalFieldMap = new Map(globalFields.map((f) => [f.key, f]));

    // Read client files
    let clientFiles;
    try {
        const files = await fs.readdir(CLIENTS_DIR);
        clientFiles = files.filter((f) => f.endsWith('.json'));
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log('No clients/ directory found. Nothing to migrate.');
            return;
        }
        throw err;
    }

    if (clientFiles.length === 0) {
        console.log('No client files found. Nothing to migrate.');
        return;
    }

    let totalMigrated = 0;

    for (const file of clientFiles) {
        const filePath = path.join(CLIENTS_DIR, file);
        const clientId = path.basename(file, '.json');
        const raw = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        let changed = false;

        // 1. Convert fieldDefinitions -> fieldOverrides
        if (raw.fieldDefinitions && Array.isArray(raw.fieldDefinitions)) {
            const fieldOverrides = {};

            for (const field of raw.fieldDefinitions) {
                if (globalFieldKeys.has(field.key)) {
                    // Global field — only store enabled toggle if different
                    const globalField = globalFieldMap.get(field.key);
                    if (field.enabled !== globalField.enabled) {
                        fieldOverrides[field.key] = { enabled: field.enabled };
                    }
                } else {
                    // Custom field — store full definition
                    fieldOverrides[field.key] = { ...field };
                }
            }

            // Backup
            const backupPath = filePath + '.pre-override-migration';
            await fs.writeFile(backupPath, JSON.stringify(raw, null, 2));

            delete raw.fieldDefinitions;
            if (Object.keys(fieldOverrides).length > 0) {
                raw.fieldOverrides = fieldOverrides;
            }

            console.log(`  ${clientId}: fieldDefinitions -> fieldOverrides`);
            changed = true;
        }

        // 2. Simplify tagOverrides (remove parameter values, keep enabled toggles)
        if (raw.tagOverrides && typeof raw.tagOverrides === 'object') {
            const simplified = {};
            for (const [tagId, override] of Object.entries(raw.tagOverrides)) {
                const simple = {};
                if (typeof override.enabled === 'boolean') {
                    simple.enabled = override.enabled;
                }
                // Only keep the override if it has meaningful content
                if (Object.keys(simple).length > 0) {
                    simplified[tagId] = simple;
                }
            }

            if (JSON.stringify(simplified) !== JSON.stringify(raw.tagOverrides)) {
                if (!changed) {
                    const backupPath = filePath + '.pre-override-migration';
                    await fs.writeFile(backupPath, JSON.stringify(raw, null, 2));
                }
                raw.tagOverrides = Object.keys(simplified).length > 0 ? simplified : undefined;
                if (!raw.tagOverrides) delete raw.tagOverrides;
                console.log(`  ${clientId}: tagOverrides simplified`);
                changed = true;
            }
        }

        if (changed) {
            await fs.writeFile(filePath, JSON.stringify(raw, null, 2));
            totalMigrated++;
        }
    }

    console.log(`\nMigrated ${totalMigrated} client(s) out of ${clientFiles.length}.`);
}

migrate().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
