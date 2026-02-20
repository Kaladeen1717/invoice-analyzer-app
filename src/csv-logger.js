const fs = require('fs').promises;

/**
 * Build CSV headers dynamically from field definitions
 * @param {Object} config - Configuration object
 * @returns {string[]} Array of CSV column headers
 */
function buildCsvHeaders(config) {
    const fieldDefinitions = config.fieldDefinitions;
    const tagDefinitions = config.tagDefinitions;

    const headers = ['Enriched Filename', 'Original Filename'];
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
 * @param {any} value - Value to escape
 * @returns {string} CSV-safe string
 */
function escapeCSV(value) {
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
 * @param {string} dateStr - Date in YYYYMMDD or YYYY-MM-DD format
 * @returns {string} Date in YYYY-MM-DD format
 */
function formatDateForCSV(dateStr) {
    if (!dateStr || dateStr === 'Unknown') {
        return dateStr || '';
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
 * @param {string} csvPath - Path to the CSV file
 * @param {Object} config - Configuration object (for dynamic headers)
 */
async function ensureCsvExists(csvPath, config) {
    try {
        await fs.access(csvPath);
        // File exists, nothing to do
    } catch {
        // File doesn't exist, create it with headers
        const headers = buildCsvHeaders(config);
        const headerLine = headers.map((h) => escapeCSV(h)).join(',') + '\n';
        await fs.writeFile(csvPath, headerLine, 'utf-8');
    }
}

/**
 * Format an analysis value for CSV based on field type
 * @param {*} value - The raw value
 * @param {string} type - The field type (text, number, date, boolean, array)
 * @returns {string} Formatted CSV value
 */
function formatFieldForCSV(value, type) {
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

/**
 * Append an invoice row to the CSV file
 * @param {string} csvPath - Path to the CSV file
 * @param {Object} data - Invoice data
 * @param {string} data.outputFilename - The enriched filename
 * @param {string} data.originalFilename - The original filename
 * @param {Object} data.analysis - The analysis result from Gemini
 * @param {Object} config - Configuration object (for dynamic columns)
 */
async function appendInvoiceRow(csvPath, data, config) {
    const { outputFilename, originalFilename, analysis } = data;

    // Ensure CSV exists before appending
    await ensureCsvExists(csvPath, config);

    const fieldDefinitions = config.fieldDefinitions;
    const tagDefinitions = config.tagDefinitions;

    // Build row from enabled field definitions
    const row = [outputFilename || '', originalFilename || ''];
    const enabledFields = fieldDefinitions.filter((f) => f.enabled);

    for (const field of enabledFields) {
        row.push(formatFieldForCSV(analysis?.[field.key], field.type));
    }
    if (config.output && config.output.includeSummary) {
        row.push(analysis?.summary || '');
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
    await fs.appendFile(csvPath, rowLine, 'utf-8');
}

/**
 * Parse a CSV line handling quoted values
 * @param {string} line - CSV line to parse
 * @returns {Array<string>} Array of values
 */
function parseCSVLine(line) {
    const values = [];
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
 * @param {string} csvPath - Path to the CSV file
 * @returns {Promise<Array<string[]>>} Array of row value arrays (excluding header)
 */
async function readCsv(csvPath) {
    try {
        const content = await fs.readFile(csvPath, 'utf-8');
        const lines = content.split('\n').filter((line) => line.trim());

        if (lines.length === 0) {
            return [];
        }

        // Skip header row, return data rows as arrays
        return lines.slice(1).map((line) => parseCSVLine(line));
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

/**
 * Get the count of rows in a CSV file (excluding header)
 * @param {string} csvPath - Path to the CSV file
 * @returns {Promise<number>} Number of data rows
 */
async function getCsvRowCount(csvPath) {
    try {
        const content = await fs.readFile(csvPath, 'utf-8');
        const lines = content.split('\n').filter((line) => line.trim());
        return Math.max(0, lines.length - 1); // Subtract header row
    } catch (error) {
        if (error.code === 'ENOENT') {
            return 0;
        }
        throw error;
    }
}

module.exports = {
    buildCsvHeaders,
    ensureCsvExists,
    appendInvoiceRow,
    readCsv,
    getCsvRowCount,
    escapeCSV,
    formatDateForCSV,
    formatFieldForCSV
};
