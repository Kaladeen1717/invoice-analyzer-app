/**
 * Template-based filename generation for processed invoices
 */

const path = require('path');
const fs = require('fs').promises;

// Characters that are illegal in filenames across different operating systems
// eslint-disable-next-line no-control-regex
const ILLEGAL_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

// Maximum filename length (conservative for cross-platform compatibility)
const MAX_FILENAME_LENGTH = 200;

/**
 * Sanitize a string for use in a filename
 * Keeps spaces and common punctuation, removes only illegal characters
 * @param {string} str - The string to sanitize
 * @returns {string} The sanitized string
 */
function sanitizeForFilename(str) {
    if (str === undefined || str === null) {
        return 'Unknown';
    }

    let sanitized = String(str)
        .replace(ILLEGAL_CHARS, '') // Remove illegal characters
        .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
        .trim();

    // Ensure we have something
    if (!sanitized) {
        return 'Unknown';
    }

    return sanitized;
}

/**
 * Convert YYYYMMDD date to DD.MM.YYYY format
 * @param {string} dateStr - Date in YYYYMMDD format
 * @returns {string} Date in DD.MM.YYYY format
 */
function formatDateForDisplay(dateStr) {
    if (!dateStr || dateStr === 'Unknown') {
        return 'Unknown';
    }

    // Clean the date string
    const cleaned = String(dateStr).replace(/\D/g, '');

    if (cleaned.length >= 8) {
        const year = cleaned.substring(0, 4);
        const month = cleaned.substring(4, 6);
        const day = cleaned.substring(6, 8);
        return `${day}.${month}.${year}`;
    }

    // If not valid YYYYMMDD, return as-is
    return dateStr;
}

/**
 * Generate a filename from a template and analysis data
 * @param {string} template - The filename template (e.g., "{supplierName} - {paymentDate}.pdf")
 * @param {Object} analysis - The extracted invoice data
 * @returns {string} The generated filename
 */
function generateFilename(template, analysis) {
    let filename = template;

    // Replace all placeholders with their values
    const placeholderRegex = /\{(\w+)\}/g;
    filename = filename.replace(placeholderRegex, (match, fieldName) => {
        const value = analysis[fieldName];
        return sanitizeForFilename(value);
    });

    // Ensure filename ends with .pdf
    if (!filename.toLowerCase().endsWith('.pdf')) {
        filename += '.pdf';
    }

    // Truncate if too long (keeping the .pdf extension)
    if (filename.length > MAX_FILENAME_LENGTH) {
        const extension = '.pdf';
        const maxNameLength = MAX_FILENAME_LENGTH - extension.length;
        filename = filename.substring(0, maxNameLength) + extension;
    }

    return filename;
}

/**
 * Handle duplicate filenames by appending (1), (2), etc.
 * @param {string} outputDir - The output directory
 * @param {string} filename - The desired filename
 * @returns {Promise<string>} The unique filename
 */
async function getUniqueFilename(outputDir, filename) {
    const ext = path.extname(filename);
    const baseName = path.basename(filename, ext);

    let uniqueFilename = filename;
    let counter = 1;

    while (true) {
        try {
            const fullPath = path.join(outputDir, uniqueFilename);
            await fs.access(fullPath);
            // File exists, try next number
            uniqueFilename = `${baseName} (${counter})${ext}`;
            counter++;
        } catch {
            // File doesn't exist, we can use this name
            break;
        }
    }

    return uniqueFilename;
}

/**
 * Format a value for display in the filename
 * Handles special formatting for different field types
 * @param {string} fieldName - The name of the field
 * @param {*} value - The value to format
 * @param {Object} analysis - Full analysis object for context
 * @returns {string} The formatted value
 */
function formatFieldValue(fieldName, value, analysis = {}) {
    switch (fieldName) {
        case 'totalAmount': {
            const numValue = analysis.totalAmount !== undefined ? analysis.totalAmount : value;
            const num = parseFloat(numValue);
            if (isNaN(num)) return '0';
            return Number.isInteger(num) ? String(num) : num.toFixed(2);
        }

        case 'invoiceDate':
        case 'paymentDate': {
            const rawDateValue = analysis[fieldName] || value;
            if (!rawDateValue || rawDateValue === 'Unknown') return 'Unknown';
            const dateStr = String(rawDateValue).replace(/\D/g, '');
            if (dateStr.length >= 8) {
                return dateStr.substring(0, 8);
            }
            return dateStr || 'Unknown';
        }

        case 'paymentDateFormatted': {
            const paymentDateRaw = analysis.paymentDate;
            if (!paymentDateRaw || paymentDateRaw === 'Unknown') return 'Unknown';
            return formatDateForDisplay(paymentDateRaw);
        }

        case 'invoiceDateFormatted': {
            const invoiceDateRaw = analysis.invoiceDate;
            if (!invoiceDateRaw || invoiceDateRaw === 'Unknown') return 'Unknown';
            return formatDateForDisplay(invoiceDateRaw);
        }

        case 'invoiceDateIfDifferent': {
            const payDate = analysis.paymentDate;
            const invDate = analysis.invoiceDate;
            if (!invDate || invDate === 'Unknown') return '';
            if (payDate === invDate) return '';
            return ' - ' + formatDateForDisplay(invDate);
        }

        case 'currency': {
            const currencyValue = analysis.currency || value;
            if (!currencyValue || currencyValue === 'Unknown') return 'Unknown';
            return String(currencyValue).toUpperCase();
        }

        case 'privateTag': {
            const isPrivate = (analysis.tags && analysis.tags.private) || analysis.isPrivate;
            return isPrivate ? ' - PRIVATE' : '';
        }

        case 'isPrivate':
            return '';

        case 'documentTypes':
            return '';

        default: {
            const fieldValue = analysis[fieldName] !== undefined ? analysis[fieldName] : value;
            if (fieldValue === undefined || fieldValue === null) return 'Unknown';
            if (Array.isArray(fieldValue)) return '';
            if (typeof fieldValue === 'boolean') return '';
            const strValue = String(fieldValue);
            if (/^\d{8}$/.test(strValue)) return strValue;
            return strValue;
        }
    }
}

/**
 * Generate filename with formatted field values
 * @param {string} template - The filename template
 * @param {Object} analysis - The extracted invoice data
 * @param {Object} [config] - Optional config for tag definitions
 * @returns {string} The generated filename
 */
function generateFormattedFilename(template, analysis, config) {
    let filename = template;

    // Replace all placeholders with their formatted values
    const placeholderRegex = /\{(\w+)\}/g;

    // Fields that include their own separators and should not be sanitized
    const separatorFields = ['invoiceDateIfDifferent', 'privateTag'];

    // Build dynamic tag placeholder map from tagDefinitions
    const tagPlaceholders = {};
    if (config && config.tagDefinitions) {
        for (const tag of config.tagDefinitions) {
            if (tag.enabled && tag.output && tag.output.filename && tag.output.filenamePlaceholder) {
                tagPlaceholders[tag.output.filenamePlaceholder] = tag;
                // Tag placeholders include their own separators
                separatorFields.push(tag.output.filenamePlaceholder);
            }
        }
    }

    filename = filename.replace(placeholderRegex, (match, fieldName) => {
        // Check if this is a dynamic tag placeholder
        if (tagPlaceholders[fieldName]) {
            const tag = tagPlaceholders[fieldName];
            const isActive = analysis.tags && analysis.tags[tag.id];
            return isActive ? tag.output.filenameFormat || '' : '';
        }

        const value = analysis[fieldName];
        const formatted = formatFieldValue(fieldName, value, analysis);

        // Special handling for fields that can be empty (like privateTag)
        if (formatted === '' || formatted === null || formatted === undefined) {
            return '';
        }

        // Don't sanitize fields that include their own separators
        if (separatorFields.includes(fieldName)) {
            return formatted;
        }

        return sanitizeForFilename(formatted);
    });

    // Clean up any double spaces or leading/trailing dashes from empty tags
    filename = filename
        .replace(/\s+-\s+-/g, ' - ') // Remove double dashes
        .replace(/^\s*-\s*/g, '') // Remove leading dash
        .replace(/\s*-\s*\.pdf$/i, '.pdf') // Remove trailing dash before .pdf
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();

    // Ensure filename ends with .pdf
    if (!filename.toLowerCase().endsWith('.pdf')) {
        filename += '.pdf';
    }

    // Truncate if too long (keeping the .pdf extension)
    if (filename.length > MAX_FILENAME_LENGTH) {
        const extension = '.pdf';
        const maxNameLength = MAX_FILENAME_LENGTH - extension.length;
        filename = filename.substring(0, maxNameLength) + extension;
    }

    return filename;
}

module.exports = {
    sanitizeForFilename,
    generateFilename,
    generateFormattedFilename,
    getUniqueFilename,
    formatFieldValue,
    formatDateForDisplay
};
