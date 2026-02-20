/**
 * Format-aware post-extraction validation
 * Validates extracted values against their declared format standards.
 * Returns validation results with optional auto-correction.
 */

const { FORMAT_NONE } = require('./constants');

/**
 * Validate a value against a declared format
 * @param {*} value - The extracted value to validate
 * @param {string} format - The format key (e.g., 'iso8601', 'iso4217')
 * @returns {{ valid: boolean, corrected?: string, error?: string }}
 */
function validateFieldFormat(value, format) {
    if (value === undefined || value === null || value === '' || value === 'Unknown') {
        return { valid: true };
    }

    const str = String(value);
    const validator = validators[format];
    if (!validator) {
        return { valid: true };
    }
    return validator(str);
}

const validators = {
    iso8601(value) {
        // Strip time component if present (auto-correct)
        const dateOnly = value.replace(/T.*$/, '');
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
            const [, month, day] = dateOnly.split('-').map(Number);
            if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                if (dateOnly !== value) {
                    return { valid: true, corrected: dateOnly };
                }
                return { valid: true };
            }
            return { valid: false, error: `Invalid date values: ${value}` };
        }
        return { valid: false, error: `Does not match YYYY-MM-DD pattern: ${value}` };
    },

    iso4217(value) {
        const upper = value.toUpperCase();
        if (/^[A-Z]{3}$/.test(upper)) {
            if (upper !== value) {
                return { valid: true, corrected: upper };
            }
            return { valid: true };
        }
        return { valid: false, error: `Not a valid 3-letter currency code: ${value}` };
    },

    iso3166_alpha2(value) {
        const upper = value.toUpperCase();
        if (/^[A-Z]{2}$/.test(upper)) {
            if (upper !== value) {
                return { valid: true, corrected: upper };
            }
            return { valid: true };
        }
        return { valid: false, error: `Not a valid 2-letter country code: ${value}` };
    },

    iso3166_alpha3(value) {
        const upper = value.toUpperCase();
        if (/^[A-Z]{3}$/.test(upper)) {
            if (upper !== value) {
                return { valid: true, corrected: upper };
            }
            return { valid: true };
        }
        return { valid: false, error: `Not a valid 3-letter country code: ${value}` };
    },

    iso9362(value) {
        // BIC/SWIFT: 8 or 11 alphanumeric, first 6 must be letters
        if (/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/i.test(value)) {
            return { valid: true };
        }
        return { valid: false, error: `Not a valid BIC/SWIFT code: ${value}` };
    },

    iso13616(value) {
        // IBAN: 2 letter country + 2 check digits + up to 30 alphanumeric BBAN
        const cleaned = value.replace(/\s/g, '');
        if (/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/i.test(cleaned)) {
            return { valid: true };
        }
        return { valid: false, error: `Not a valid IBAN format: ${value}` };
    },

    iso11649(value) {
        // Creditor Reference: starts with RF + 2 check digits + reference
        const cleaned = value.replace(/\s/g, '');
        if (/^RF\d{2}[A-Z0-9]{1,21}$/i.test(cleaned)) {
            return { valid: true };
        }
        return { valid: false, error: `Not a valid creditor reference (RF format): ${value}` };
    },

    iso17442(value) {
        // LEI: exactly 20 alphanumeric characters
        if (/^[A-Z0-9]{20}$/i.test(value)) {
            return { valid: true };
        }
        return { valid: false, error: `Not a valid LEI (20 alphanumeric chars required): ${value}` };
    }
};

/**
 * Validate all fields with format metadata in an analysis result
 * @param {Object} analysis - The extracted analysis data
 * @param {Array} fieldDefinitions - The field definitions with format metadata
 * @returns {{ corrected: Object, warnings: Array<{field: string, format: string, value: *, error: string}> }}
 */
function validateAllFormats(analysis, fieldDefinitions) {
    const corrected = { ...analysis };
    const warnings = [];

    if (!fieldDefinitions || !Array.isArray(fieldDefinitions)) {
        return { corrected, warnings };
    }

    for (const field of fieldDefinitions) {
        if (!field.enabled || !field.format || field.format === FORMAT_NONE) continue;

        const value = corrected[field.key];
        const result = validateFieldFormat(value, field.format);

        if (result.corrected !== undefined) {
            corrected[field.key] = result.corrected;
        }

        if (!result.valid) {
            warnings.push({
                field: field.key,
                format: field.format,
                value,
                error: result.error
            });
        }
    }

    return { corrected, warnings };
}

module.exports = {
    validateFieldFormat,
    validateAllFormats
};
