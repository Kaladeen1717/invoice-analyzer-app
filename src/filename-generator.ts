/**
 * Template-based filename generation for processed invoices
 */

import path from 'node:path';
import fs from 'node:fs';

import type { AppConfig, TagDefinition } from './types/index.js';

// Characters that are illegal in filenames across different operating systems
// eslint-disable-next-line no-control-regex
const ILLEGAL_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

// Maximum filename length (conservative for cross-platform compatibility)
const MAX_FILENAME_LENGTH = 200;

/**
 * Sanitize a string for use in a filename
 * Keeps spaces and common punctuation, removes only illegal characters
 * @param str - The string to sanitize
 * @returns The sanitized string
 */
export function sanitizeForFilename(str: unknown): string {
    if (str === undefined || str === null) {
        return 'Unknown';
    }

    const sanitized = String(str)
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
 * Convert date to ISO 8601 (YYYY-MM-DD) format
 * Accepts both YYYYMMDD (legacy) and YYYY-MM-DD (ISO) input
 * @param dateStr - Date in YYYYMMDD or YYYY-MM-DD format
 * @returns Date in YYYY-MM-DD format
 */
export function formatDateForDisplay(dateStr: unknown): string {
    if (!dateStr || dateStr === 'Unknown') {
        return 'Unknown';
    }

    const str = String(dateStr);

    // Already ISO 8601 format (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        return str;
    }

    // Clean non-digits for legacy YYYYMMDD input
    const cleaned = str.replace(/\D/g, '');

    if (cleaned.length >= 8) {
        const year = cleaned.substring(0, 4);
        const month = cleaned.substring(4, 6);
        const day = cleaned.substring(6, 8);
        return `${year}-${month}-${day}`;
    }

    return str;
}

/**
 * Generate a filename from a template and analysis data
 * @param template - The filename template (e.g., "{supplierName} - {paymentDate}.pdf")
 * @param analysis - The extracted invoice data
 * @returns The generated filename
 */
export function generateFilename(template: string, analysis: Record<string, unknown>): string {
    let filename = template;

    // Replace all placeholders with their values
    const placeholderRegex = /\{(\w+)\}/g;
    filename = filename.replace(placeholderRegex, (_match: string, fieldName: string) => {
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
 * @param outputDir - The output directory
 * @param filename - The desired filename
 * @returns The unique filename
 */
export async function getUniqueFilename(outputDir: string, filename: string): Promise<string> {
    const ext = path.extname(filename);
    const baseName = path.basename(filename, ext);

    let uniqueFilename = filename;
    let counter = 1;

    while (true) {
        try {
            const fullPath = path.join(outputDir, uniqueFilename);
            await fs.promises.access(fullPath);
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
 * Apply format-driven formatting to a value
 * @param format - The format key (e.g., 'iso4217', 'iso8601')
 * @param value - The value to format
 * @returns The formatted value, or null if no format-specific logic applies
 */
export function applyFormatForFilename(format: string, value: unknown): string | null {
    if (!format || !value || value === 'Unknown') return null;
    const str = String(value);
    switch (format) {
        case 'iso4217':
        case 'iso3166_alpha2':
        case 'iso3166_alpha3':
            return str.toUpperCase();
        case 'iso8601':
            return formatDateForDisplay(str);
        default:
            return null;
    }
}

/**
 * Format a value for display in the filename
 * Handles special formatting for different field types
 * @param fieldName - The name of the field
 * @param value - The value to format
 * @param analysis - Full analysis object for context
 * @param format - Optional format key from field definition
 * @returns The formatted value
 */
export function formatFieldValue(
    fieldName: string,
    value: unknown,
    analysis: Record<string, unknown> = {},
    format?: string
): string {
    // Try format-driven logic first (if format is provided and field has a value)
    if (format) {
        const fieldValue = analysis[fieldName] !== undefined ? analysis[fieldName] : value;
        const formatted = applyFormatForFilename(format, fieldValue);
        if (formatted !== null) return formatted;
    }

    switch (fieldName) {
        case 'totalAmount': {
            const numValue = analysis.totalAmount !== undefined ? analysis.totalAmount : value;
            const num = parseFloat(numValue as string);
            if (isNaN(num)) return '0';
            return Number.isInteger(num) ? String(num) : num.toFixed(2);
        }

        case 'invoiceDate':
        case 'paymentDate': {
            const rawDateValue = (analysis[fieldName] || value) as string;
            if (!rawDateValue || rawDateValue === 'Unknown') return 'Unknown';
            return formatDateForDisplay(rawDateValue);
        }

        case 'paymentDateFormatted': {
            const paymentDateRaw = analysis.paymentDate as string;
            if (!paymentDateRaw || paymentDateRaw === 'Unknown') return 'Unknown';
            return formatDateForDisplay(paymentDateRaw);
        }

        case 'invoiceDateFormatted': {
            const invoiceDateRaw = analysis.invoiceDate as string;
            if (!invoiceDateRaw || invoiceDateRaw === 'Unknown') return 'Unknown';
            return formatDateForDisplay(invoiceDateRaw);
        }

        case 'invoiceDateIfDifferent': {
            const payDate = analysis.paymentDate as string;
            const invDate = analysis.invoiceDate as string;
            if (!invDate || invDate === 'Unknown') return '';
            if (payDate === invDate) return '';
            return ' - ' + formatDateForDisplay(invDate);
        }

        case 'currency': {
            const currencyValue = (analysis.currency || value) as string;
            if (!currencyValue || currencyValue === 'Unknown') return 'Unknown';
            return String(currencyValue).toUpperCase();
        }

        case 'privateTag': {
            const tags = analysis.tags as Record<string, boolean> | undefined;
            const isPrivate = (tags && tags.private) || analysis.isPrivate;
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
            if (/^\d{4}-\d{2}-\d{2}$/.test(strValue) || /^\d{8}$/.test(strValue)) return strValue;
            return strValue;
        }
    }
}

/**
 * Generate filename with formatted field values
 * @param template - The filename template
 * @param analysis - The extracted invoice data
 * @param config - Optional config for tag definitions
 * @returns The generated filename
 */
export function generateFormattedFilename(
    template: string,
    analysis: Record<string, unknown>,
    config?: Partial<Pick<AppConfig, 'tagDefinitions' | 'fieldDefinitions'>>
): string {
    let filename = template;

    // Replace all placeholders with their formatted values
    const placeholderRegex = /\{(\w+)\}/g;

    // Fields that include their own separators and should not be sanitized
    const separatorFields: string[] = ['invoiceDateIfDifferent', 'privateTag'];

    // Build dynamic tag placeholder map from tagDefinitions
    const tagPlaceholders: Record<string, TagDefinition> = {};
    if (config && config.tagDefinitions) {
        for (const tag of config.tagDefinitions) {
            if (tag.enabled && tag.filenamePlaceholder) {
                tagPlaceholders[tag.filenamePlaceholder] = tag;
                // Tag placeholders include their own separators
                separatorFields.push(tag.filenamePlaceholder);
            }
        }
    }

    // Build field format lookup from config
    const fieldFormatMap: Record<string, string> = {};
    if (config && config.fieldDefinitions) {
        for (const field of config.fieldDefinitions) {
            if (field.format) {
                fieldFormatMap[field.key] = field.format;
            }
        }
    }

    filename = filename.replace(placeholderRegex, (_match: string, fieldName: string) => {
        // Check if this is a dynamic tag placeholder
        if (tagPlaceholders[fieldName]) {
            const tag = tagPlaceholders[fieldName];
            const tags = analysis.tags as Record<string, boolean> | undefined;
            const isActive = tags && tags[tag.id];
            return isActive ? tag.filenameFormat || '' : '';
        }

        const value = analysis[fieldName];
        const format = fieldFormatMap[fieldName];
        const formatted = formatFieldValue(fieldName, value, analysis, format);

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
