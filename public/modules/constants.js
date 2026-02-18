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

export const VALID_OVERRIDE_SECTIONS = ['fields', 'tags', 'prompt', 'output', 'model'];

export const DEFAULT_MODEL = 'gemini-3-flash-preview';
