// Shared backend constants.
// Frontend constants live in public/modules/constants.js — keep in sync.

const VALID_FIELD_TYPES = ['text', 'number', 'boolean', 'date', 'array'];

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
    VALID_OVERRIDE_SECTIONS,
    DEFAULT_MODEL,
    DEFAULT_PROCESSED_ORIGINAL_SUBFOLDER,
    DEFAULT_PROCESSED_ENRICHED_SUBFOLDER,
    DEFAULT_CSV_FILENAME,
    safeJoin
};
