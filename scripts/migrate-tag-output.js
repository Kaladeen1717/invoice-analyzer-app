#!/usr/bin/env node

/**
 * Migration: Move tag output properties to top-level
 *
 * Before: tag.output.filenamePlaceholder, tag.output.filenameFormat, tag.output.pdf/csv/filename
 * After:  tag.filenamePlaceholder, tag.filenameFormat (output object removed)
 *
 * Migrates config.json global tags.
 * Creates backup before modifying.
 */

const fs = require('fs').promises;
const path = require('path');

const CONFIG_PATH = path.join(process.cwd(), 'config.json');

async function migrate() {
    console.log('Tag Output Migration');
    console.log('====================\n');

    // Read config
    let raw;
    try {
        raw = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf-8'));
    } catch (err) {
        console.error('Failed to read config.json:', err.message);
        process.exit(1);
    }

    const tags = raw.tagDefinitions;
    if (!tags || !Array.isArray(tags)) {
        console.log('No tagDefinitions found in config.json. Nothing to migrate.');
        return;
    }

    // Check if migration is needed
    const needsMigration = tags.some((t) => t.output && typeof t.output === 'object');
    if (!needsMigration) {
        console.log('Tags already migrated (no output objects found). Nothing to do.');
        return;
    }

    // Backup
    const backupPath = CONFIG_PATH + '.pre-tag-output-migration';
    await fs.writeFile(backupPath, JSON.stringify(raw, null, 2));
    console.log(`Backup: ${backupPath}\n`);

    // Migrate each tag
    let migrated = 0;
    for (const tag of tags) {
        if (!tag.output || typeof tag.output !== 'object') continue;

        // Move filenamePlaceholder and filenameFormat to top-level
        if (tag.output.filenamePlaceholder) {
            tag.filenamePlaceholder = tag.output.filenamePlaceholder;
        }
        if (tag.output.filenameFormat) {
            tag.filenameFormat = tag.output.filenameFormat;
        }

        // Remove output object
        delete tag.output;
        migrated++;
        console.log(`  Migrated tag: ${tag.id} (${tag.label})`);
    }

    // Write back
    await fs.writeFile(CONFIG_PATH, JSON.stringify(raw, null, 2));
    console.log(`\nMigrated ${migrated} tag(s). Config saved.`);
}

migrate().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
