// Shared backend constants.
// Frontend constants live in public/modules/constants.js — keep in sync.

const VALID_FIELD_TYPES = ['text', 'number', 'boolean', 'date', 'array'];

const VALID_OVERRIDE_SECTIONS = ['fields', 'tags', 'prompt', 'output', 'model'];

const DEFAULT_MODEL = 'gemini-3-flash-preview';

const DEFAULT_PROCESSED_ORIGINAL_SUBFOLDER = 'processed-original';
const DEFAULT_PROCESSED_ENRICHED_SUBFOLDER = 'processed-enriched';
const DEFAULT_CSV_FILENAME = 'invoice-log.csv';

/**
 * Validate that a value is safe to use as a single path segment.
 * Rejects path traversal characters to prevent directory traversal attacks.
 * @param {string} value - The value to validate
 * @param {string} name - Parameter name for error messages
 */
function validatePathSegment(value, name) {
    if (typeof value !== 'string' || value.includes('/') || value.includes('\\') || value.includes('..')) {
        throw new Error(`Invalid ${name}: must not contain path separators or ".."`);
    }
}

module.exports = {
    VALID_FIELD_TYPES,
    VALID_OVERRIDE_SECTIONS,
    DEFAULT_MODEL,
    DEFAULT_PROCESSED_ORIGINAL_SUBFOLDER,
    DEFAULT_PROCESSED_ENRICHED_SUBFOLDER,
    DEFAULT_CSV_FILENAME,
    validatePathSegment
};
