// Shared constants — single source of truth for the frontend.
// Backend constants are in src/constants.js (CommonJS) — keep in sync.

export const KNOWN_MODELS = [
    'gemini-3-flash-preview',
    'gemini-2.5-flash-preview-05-20',
    'gemini-2.5-pro-preview-05-06',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro'
];

export const VALID_FIELD_TYPES = ['text', 'number', 'boolean', 'date', 'array'];

export const VALID_FIELD_FORMATS = {
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

export const FORMAT_NONE = 'none';

export const VALID_OVERRIDE_SECTIONS = ['fields', 'tags', 'prompt', 'output', 'model'];

export const DEFAULT_MODEL = 'gemini-3-flash-preview';
