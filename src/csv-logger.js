const fs = require('fs').promises;
const path = require('path');

const CSV_HEADERS = [
    'Enriched Filename',
    'Original Filename',
    'Supplier Name',
    'Payment Date',
    'Invoice Date',
    'Invoice Number',
    'Currency',
    'Amount',
    'Document Types',
    'Private',
    'Summary',
    'Processed At'
];

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
 * Format date from YYYYMMDD to DD.MM.YYYY
 * @param {string} dateStr - Date in YYYYMMDD format
 * @returns {string} Date in DD.MM.YYYY format
 */
function formatDateForCSV(dateStr) {
    if (!dateStr || dateStr === 'Unknown' || dateStr.length !== 8) {
        return dateStr || '';
    }

    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);

    return `${day}.${month}.${year}`;
}

/**
 * Ensure CSV file exists with headers
 * Creates the file with headers if it doesn't exist
 * @param {string} csvPath - Path to the CSV file
 */
async function ensureCsvExists(csvPath) {
    try {
        await fs.access(csvPath);
        // File exists, nothing to do
    } catch {
        // File doesn't exist, create it with headers
        const headerLine = CSV_HEADERS.map(h => escapeCSV(h)).join(',') + '\n';
        await fs.writeFile(csvPath, headerLine, 'utf-8');
    }
}

/**
 * Append an invoice row to the CSV file
 * @param {string} csvPath - Path to the CSV file
 * @param {Object} data - Invoice data
 * @param {string} data.outputFilename - The enriched filename
 * @param {string} data.originalFilename - The original filename
 * @param {Object} data.analysis - The analysis result from Gemini
 */
async function appendInvoiceRow(csvPath, data) {
    const { outputFilename, originalFilename, analysis } = data;

    // Ensure CSV exists before appending
    await ensureCsvExists(csvPath);

    // Build row data
    const row = [
        outputFilename || '',
        originalFilename || '',
        analysis?.supplierName || '',
        formatDateForCSV(analysis?.paymentDate),
        formatDateForCSV(analysis?.invoiceDate),
        analysis?.invoiceNumber || '',
        analysis?.currency || '',
        analysis?.totalAmount || '',
        Array.isArray(analysis?.documentTypes) ? analysis.documentTypes.join('; ') : '',
        analysis?.isPrivate ? 'Yes' : 'No',
        analysis?.summary || '',
        new Date().toISOString()
    ];

    const rowLine = row.map(v => escapeCSV(v)).join(',') + '\n';
    await fs.appendFile(csvPath, rowLine, 'utf-8');
}

/**
 * Read all rows from a CSV file
 * @param {string} csvPath - Path to the CSV file
 * @returns {Promise<Array<Object>>} Array of row objects
 */
async function readCsv(csvPath) {
    try {
        const content = await fs.readFile(csvPath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());

        if (lines.length === 0) {
            return [];
        }

        // Skip header row
        const dataLines = lines.slice(1);

        return dataLines.map(line => {
            const values = parseCSVLine(line);
            return {
                enrichedFilename: values[0] || '',
                originalFilename: values[1] || '',
                supplierName: values[2] || '',
                paymentDate: values[3] || '',
                invoiceDate: values[4] || '',
                invoiceNumber: values[5] || '',
                currency: values[6] || '',
                amount: values[7] || '',
                documentTypes: values[8] || '',
                isPrivate: values[9] || '',
                summary: values[10] || '',
                processedAt: values[11] || ''
            };
        });
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
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
 * Get the count of rows in a CSV file (excluding header)
 * @param {string} csvPath - Path to the CSV file
 * @returns {Promise<number>} Number of data rows
 */
async function getCsvRowCount(csvPath) {
    try {
        const content = await fs.readFile(csvPath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        return Math.max(0, lines.length - 1); // Subtract header row
    } catch (error) {
        if (error.code === 'ENOENT') {
            return 0;
        }
        throw error;
    }
}

module.exports = {
    CSV_HEADERS,
    ensureCsvExists,
    appendInvoiceRow,
    readCsv,
    getCsvRowCount,
    escapeCSV,
    formatDateForCSV
};
