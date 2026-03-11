import fs from 'node:fs';

import type { AppConfig, FieldDefinition, InvoiceAnalysis } from './types/index.js';

/**
 * Build CSV headers dynamically from field definitions
 * @param config - Configuration object
 * @returns Array of CSV column headers
 */
export function buildCsvHeaders(config: AppConfig): string[] {
    const fieldDefinitions = config.fieldDefinitions as FieldDefinition[];
    const tagDefinitions = config.tagDefinitions;

    const headers: string[] = ['Enriched Filename', 'Original Filename'];
    const enabledFields = fieldDefinitions.filter((f) => f.enabled);

    for (const field of enabledFields) {
        headers.push(field.label);
    }
    if (config.output && config.output.includeSummary) {
        headers.push('Summary');
    }
    // Add tag columns
    if (tagDefinitions) {
        const enabledTags = tagDefinitions.filter((t) => t.enabled);
        for (const tag of enabledTags) {
            headers.push(tag.label);
        }
    }
    headers.push('Processed At');
    return headers;
}

/**
 * Escape a value for CSV (handles commas, quotes, and newlines)
 * @param value - Value to escape
 * @returns CSV-safe string
 */
export function escapeCSV(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }

    const str = String(value);

    // If value contains comma, quote, or newline, wrap in quotes and escape quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }

    return str;
}

/**
 * Format date to ISO 8601 (YYYY-MM-DD)
 * Accepts both YYYYMMDD (legacy) and YYYY-MM-DD (ISO) input
 * @param dateStr - Date in YYYYMMDD or YYYY-MM-DD format
 * @returns Date in YYYY-MM-DD format
 */
export function formatDateForCSV(dateStr: unknown): string {
    if (!dateStr || dateStr === 'Unknown') {
        return (dateStr as string) || '';
    }

    const str = String(dateStr);

    // Already ISO 8601
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        return str;
    }

    // Legacy YYYYMMDD (8 digits)
    if (/^\d{8}$/.test(str)) {
        return `${str.substring(0, 4)}-${str.substring(4, 6)}-${str.substring(6, 8)}`;
    }

    return str;
}

/**
 * Ensure CSV file exists with headers
 * Creates the file with headers if it doesn't exist
 * @param csvPath - Path to the CSV file
 * @param config - Configuration object (for dynamic headers)
 */
export async function ensureCsvExists(csvPath: string, config: AppConfig): Promise<void> {
    try {
        await fs.promises.access(csvPath);
        // File exists, nothing to do
    } catch {
        // File doesn't exist, create it with headers
        const headers = buildCsvHeaders(config);
        const headerLine = headers.map((h) => escapeCSV(h)).join(',') + '\n';
        await fs.promises.writeFile(csvPath, headerLine, 'utf-8');
    }
}

/**
 * Format an analysis value for CSV based on field type
 * @param value - The raw value
 * @param type - The field type (text, number, date, boolean, array)
 * @returns Formatted CSV value
 */
export function formatFieldForCSV(value: unknown, type: string): string {
    switch (type) {
        case 'date':
            return formatDateForCSV(value);
        case 'boolean':
            return value ? 'Yes' : 'No';
        case 'array':
            return Array.isArray(value) ? value.join('; ') : '';
        case 'number':
            return value !== undefined && value !== null ? String(value) : '';
        case 'text':
        default:
            return value !== undefined && value !== null ? String(value) : '';
    }
}

interface InvoiceRowData {
    outputFilename: string;
    originalFilename: string;
    analysis: InvoiceAnalysis;
}

/**
 * Append an invoice row to the CSV file
 * @param csvPath - Path to the CSV file
 * @param data - Invoice data
 * @param config - Configuration object (for dynamic columns)
 */
export async function appendInvoiceRow(csvPath: string, data: InvoiceRowData, config: AppConfig): Promise<void> {
    const { outputFilename, originalFilename, analysis } = data;

    // Ensure CSV exists before appending
    await ensureCsvExists(csvPath, config);

    const fieldDefinitions = config.fieldDefinitions as FieldDefinition[];
    const tagDefinitions = config.tagDefinitions;

    // Build row from enabled field definitions
    const row: string[] = [outputFilename || '', originalFilename || ''];
    const enabledFields = fieldDefinitions.filter((f) => f.enabled);

    for (const field of enabledFields) {
        row.push(formatFieldForCSV(analysis?.[field.key], field.type));
    }
    if (config.output && config.output.includeSummary) {
        row.push((analysis?.summary as string) || '');
    }
    // Add tag values
    if (tagDefinitions) {
        const enabledTags = tagDefinitions.filter((t) => t.enabled);
        for (const tag of enabledTags) {
            row.push(analysis?.tags?.[tag.id] ? 'Yes' : 'No');
        }
    }
    row.push(new Date().toISOString());

    const rowLine = row.map((v) => escapeCSV(v)).join(',') + '\n';
    await fs.promises.appendFile(csvPath, rowLine, 'utf-8');
}

/**
 * Parse a CSV line handling quoted values
 * @param line - CSV line to parse
 * @returns Array of values
 */
export function parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
        const char = line[i];

        if (inQuotes) {
            if (char === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                    // Escaped quote
                    current += '"';
                    i += 2;
                } else {
                    // End of quoted section
                    inQuotes = false;
                    i++;
                }
            } else {
                current += char;
                i++;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
                i++;
            } else if (char === ',') {
                values.push(current);
                current = '';
                i++;
            } else {
                current += char;
                i++;
            }
        }
    }

    values.push(current);
    return values;
}

/**
 * Read all rows from a CSV file
 * Returns rows as arrays of values (use buildCsvHeaders to get column names)
 * @param csvPath - Path to the CSV file
 * @returns Array of row value arrays (excluding header)
 */
export async function readCsv(csvPath: string): Promise<string[][]> {
    try {
        const content = await fs.promises.readFile(csvPath, 'utf-8');
        const lines = content.split('\n').filter((line) => line.trim());

        if (lines.length === 0) {
            return [];
        }

        // Skip header row, return data rows as arrays
        return lines.slice(1).map((line) => parseCSVLine(line));
    } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

/**
 * Get the count of rows in a CSV file (excluding header)
 * @param csvPath - Path to the CSV file
 * @returns Number of data rows
 */
export async function getCsvRowCount(csvPath: string): Promise<number> {
    try {
        const content = await fs.promises.readFile(csvPath, 'utf-8');
        const lines = content.split('\n').filter((line) => line.trim());
        return Math.max(0, lines.length - 1); // Subtract header row
    } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return 0;
        }
        throw error;
    }
}
