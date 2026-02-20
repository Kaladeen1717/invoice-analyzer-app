// Shared backend constants.
// Frontend constants live in public/modules/constants.js — keep in sync.

const VALID_FIELD_TYPES = ['text', 'number', 'boolean', 'date', 'array'];

const VALID_FIELD_FORMATS = {
    iso8601: { label: 'Date (ISO 8601)', standard: 'ISO 8601', pattern: 'YYYY-MM-DD', compatibleTypes: ['date'] },
    iso4217: {
        label: 'Currency Code (ISO 4217)',
        standard: 'ISO 4217',
        pattern: '3-letter code (USD)',
        compatibleTypes: ['text']
    },
    iso3166_alpha2: {
        label: 'Country Code (ISO 3166 α2)',
        standard: 'ISO 3166-1',
        pattern: '2-letter code (DK)',
        compatibleTypes: ['text']
    },
    iso3166_alpha3: {
        label: 'Country Code (ISO 3166 α3)',
        standard: 'ISO 3166-1',
        pattern: '3-letter code (DNK)',
        compatibleTypes: ['text']
    },
    iso9362: {
        label: 'BIC/SWIFT (ISO 9362)',
        standard: 'ISO 9362',
        pattern: '8 or 11 chars',
        compatibleTypes: ['text']
    },
    iso13616: {
        label: 'IBAN (ISO 13616)',
        standard: 'ISO 13616',
        pattern: 'Up to 34 alphanumeric',
        compatibleTypes: ['text']
    },
    iso11649: {
        label: 'Creditor Ref (ISO 11649)',
        standard: 'ISO 11649',
        pattern: 'RF + check digits',
        compatibleTypes: ['text']
    },
    iso17442: {
        label: 'LEI (ISO 17442)',
        standard: 'ISO 17442',
        pattern: '20-char alphanumeric',
        compatibleTypes: ['text']
    }
};

const FORMAT_NONE = 'none';

const VALID_OVERRIDE_SECTIONS = ['fields', 'tags', 'prompt', 'output', 'model'];

const DEFAULT_MODEL = 'gemini-3-flash-preview';

const DEFAULT_PROCESSED_ORIGINAL_SUBFOLDER = 'processed-original';
const DEFAULT_PROCESSED_ENRICHED_SUBFOLDER = 'processed-enriched';
const DEFAULT_CSV_FILENAME = 'invoice-log.csv';

const path = require('path');

/**
 * Safely join a base directory with an untrusted segment.
 * Resolves the full path and verifies it stays within the base directory.
 * This is the sanitization pattern recognized by CodeQL for js/path-injection.
 * @param {string} baseDir - Trusted root directory
 * @param {string} segment - Untrusted path segment (e.g. clientId, backupId)
 * @returns {string} The resolved, validated path
 */
function safeJoin(baseDir, segment) {
    const resolved = path.resolve(baseDir, segment);
    if (!resolved.startsWith(baseDir + path.sep) && resolved !== baseDir) {
        throw new Error(`Path traversal detected: "${segment}" escapes base directory`);
    }
    return resolved;
}

module.exports = {
    VALID_FIELD_TYPES,
    VALID_FIELD_FORMATS,
    FORMAT_NONE,
    VALID_OVERRIDE_SECTIONS,
    DEFAULT_MODEL,
    DEFAULT_PROCESSED_ORIGINAL_SUBFOLDER,
    DEFAULT_PROCESSED_ENRICHED_SUBFOLDER,
    DEFAULT_CSV_FILENAME,
    safeJoin
};
