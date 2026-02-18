// Shared backend constants.
// Frontend constants live in public/modules/constants.js — keep in sync.

const VALID_FIELD_TYPES = ['text', 'number', 'boolean', 'date', 'array'];

const VALID_OVERRIDE_SECTIONS = ['fields', 'tags', 'prompt', 'output', 'model'];

const DEFAULT_MODEL = 'gemini-3-flash-preview';

const DEFAULT_PROCESSED_ORIGINAL_SUBFOLDER = 'processed-original';
const DEFAULT_PROCESSED_ENRICHED_SUBFOLDER = 'processed-enriched';
const DEFAULT_CSV_FILENAME = 'invoice-log.csv';

module.exports = {
    VALID_FIELD_TYPES,
    VALID_OVERRIDE_SECTIONS,
    DEFAULT_MODEL,
    DEFAULT_PROCESSED_ORIGINAL_SUBFOLDER,
    DEFAULT_PROCESSED_ENRICHED_SUBFOLDER,
    DEFAULT_CSV_FILENAME
};
