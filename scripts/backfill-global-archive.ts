#!/usr/bin/env node

/**
 * Backfill the global JSONL archive from existing per-client results.
 * Reads each client's results.jsonl (or processing-results.json for legacy),
 * strips rawResponse, adds clientId/clientName, and appends to data/global-results.jsonl.
 *
 * Usage: npx tsx scripts/backfill-global-archive.ts [--dry-run]
 *
 * Options:
 *   --dry-run  Show what would be written without actually writing
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';
import { getAllClients, getClientConfig } from '../src/client-manager.js';
import {
    JSONL_FILENAME,
    RESULTS_FILENAME,
    GLOBAL_ARCHIVE_DIR,
    GLOBAL_ARCHIVE_FILENAME
} from '../src/result-manager.js';

import type { ResultRecord, GlobalResultRecord } from '../src/types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.dirname(__dirname);

const dryRun = process.argv.includes('--dry-run');

function toGlobalRecord(record: ResultRecord, clientId: string, clientName: string): GlobalResultRecord {
    const globalRecord: GlobalResultRecord = {
        id: record.id,
        clientId,
        clientName,
        originalFilename: record.originalFilename,
        outputFilename: record.outputFilename,
        status: record.status,
        model: record.model,
        extractedFields: record.extractedFields,
        tags: record.tags,
        tokenUsage: record.tokenUsage,
        timestamp: record.timestamp,
        error: record.error,
        duration: record.duration
    };
    if (record.retriedFrom) globalRecord.retriedFrom = record.retriedFrom;
    return globalRecord;
}

function parseJsonlRecords(content: string): Map<string, ResultRecord> {
    const map = new Map<string, ResultRecord>();
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            const record = JSON.parse(trimmed) as ResultRecord;
            map.set(record.id, record); // last occurrence wins
        } catch {
            // Skip corrupt lines
        }
    }
    return map;
}

async function main() {
    console.log(dryRun ? '=== DRY RUN ===' : '=== Backfilling global archive ===');

    const globalConfig = await loadConfig({ requireFolders: false });
    const clients = await getAllClients();

    if (!clients || Object.keys(clients).length === 0) {
        console.log('No clients found.');
        return;
    }

    // Read existing global archive to check for already-archived IDs
    const archivePath = path.join(projectRoot, GLOBAL_ARCHIVE_DIR, GLOBAL_ARCHIVE_FILENAME);
    const existingIds = new Set<string>();

    try {
        const existingContent = await fs.promises.readFile(archivePath, 'utf-8');
        for (const line of existingContent.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                const record = JSON.parse(trimmed) as { id: string };
                existingIds.add(record.id);
            } catch {
                // Skip corrupt lines
            }
        }
        console.log(`Existing archive has ${existingIds.size} records.`);
    } catch {
        console.log('No existing archive found — creating fresh.');
    }

    let totalFound = 0;
    let totalSkipped = 0;
    let totalNew = 0;
    const newRecords: GlobalResultRecord[] = [];

    for (const [clientId, client] of Object.entries(clients)) {
        try {
            const clientConfig = await getClientConfig(clientId, globalConfig);
            const baseDir = clientConfig.folders.base;

            // Try JSONL first (post-INV-80), fall back to JSON
            let records: Map<string, ResultRecord>;
            const jsonlPath = path.join(baseDir, JSONL_FILENAME);
            const jsonPath = path.join(baseDir, RESULTS_FILENAME);

            try {
                const content = await fs.promises.readFile(jsonlPath, 'utf-8');
                records = parseJsonlRecords(content);
            } catch {
                try {
                    const content = await fs.promises.readFile(jsonPath, 'utf-8');
                    const data = JSON.parse(content) as { results: ResultRecord[] };
                    records = new Map(data.results.map((r) => [r.id, r]));
                } catch {
                    console.log(`  ${clientId} (${client.name}): no results found, skipping.`);
                    continue;
                }
            }

            const clientRecordCount = records.size;
            totalFound += clientRecordCount;

            let clientNew = 0;
            let clientSkipped = 0;

            for (const record of records.values()) {
                if (existingIds.has(record.id)) {
                    clientSkipped++;
                    totalSkipped++;
                    continue;
                }

                newRecords.push(toGlobalRecord(record, clientId, client.name));
                clientNew++;
                totalNew++;
            }

            console.log(
                `  ${clientId} (${client.name}): ${clientRecordCount} records, ${clientNew} new, ${clientSkipped} already archived.`
            );
        } catch (err: unknown) {
            console.error(`  ${clientId}: error — ${(err as Error).message}`);
        }
    }

    // Sort new records by timestamp
    newRecords.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (newRecords.length === 0) {
        console.log('\nNo new records to write.');
        return;
    }

    if (dryRun) {
        console.log(`\nWould write ${newRecords.length} records to ${archivePath}`);
    } else {
        await fs.promises.mkdir(path.dirname(archivePath), { recursive: true });
        const lines = newRecords.map((r) => JSON.stringify(r)).join('\n') + '\n';
        await fs.promises.appendFile(archivePath, lines);
        console.log(`\nWrote ${newRecords.length} records to ${archivePath}`);
    }

    console.log(`\nSummary: ${totalFound} found, ${totalSkipped} already archived, ${totalNew} newly added.`);
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
