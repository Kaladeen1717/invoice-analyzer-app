const { validateFieldFormat, validateAllFormats } = require('../src/format-validator');

describe('validateFieldFormat', () => {
    describe('skip validation for empty/unknown values', () => {
        test.each([undefined, null, '', 'Unknown'])('returns valid for %p', (value) => {
            expect(validateFieldFormat(value, 'iso8601')).toEqual({ valid: true });
        });
    });

    describe('unknown format returns valid', () => {
        test('returns valid for unrecognized format key', () => {
            expect(validateFieldFormat('anything', 'nonexistent')).toEqual({ valid: true });
        });

        test('returns valid for "none" format', () => {
            expect(validateFieldFormat('any value', 'none')).toEqual({ valid: true });
        });
    });

    describe('iso8601', () => {
        test('accepts valid YYYY-MM-DD', () => {
            expect(validateFieldFormat('2024-01-15', 'iso8601')).toEqual({ valid: true });
        });

        test('rejects invalid month', () => {
            const result = validateFieldFormat('2024-13-01', 'iso8601');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Invalid date values');
        });

        test('rejects invalid day', () => {
            const result = validateFieldFormat('2024-01-32', 'iso8601');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Invalid date values');
        });

        test('auto-corrects by stripping time component', () => {
            expect(validateFieldFormat('2024-01-15T14:30:00Z', 'iso8601')).toEqual({
                valid: true,
                corrected: '2024-01-15'
            });
        });

        test('rejects non-date strings', () => {
            const result = validateFieldFormat('not-a-date', 'iso8601');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('YYYY-MM-DD');
        });
    });

    describe('iso4217', () => {
        test('accepts valid uppercase currency code', () => {
            expect(validateFieldFormat('USD', 'iso4217')).toEqual({ valid: true });
        });

        test('auto-corrects lowercase to uppercase', () => {
            expect(validateFieldFormat('eur', 'iso4217')).toEqual({ valid: true, corrected: 'EUR' });
        });

        test('auto-corrects mixed case', () => {
            expect(validateFieldFormat('Dkk', 'iso4217')).toEqual({ valid: true, corrected: 'DKK' });
        });

        test('rejects wrong length', () => {
            expect(validateFieldFormat('US', 'iso4217').valid).toBe(false);
            expect(validateFieldFormat('USDD', 'iso4217').valid).toBe(false);
        });

        test('rejects non-letter characters', () => {
            expect(validateFieldFormat('U$D', 'iso4217').valid).toBe(false);
        });
    });

    describe('iso3166_alpha2', () => {
        test('accepts valid 2-letter country code', () => {
            expect(validateFieldFormat('DK', 'iso3166_alpha2')).toEqual({ valid: true });
        });

        test('auto-corrects lowercase', () => {
            expect(validateFieldFormat('dk', 'iso3166_alpha2')).toEqual({ valid: true, corrected: 'DK' });
        });

        test('rejects wrong length', () => {
            expect(validateFieldFormat('D', 'iso3166_alpha2').valid).toBe(false);
            expect(validateFieldFormat('DNK', 'iso3166_alpha2').valid).toBe(false);
        });
    });

    describe('iso3166_alpha3', () => {
        test('accepts valid 3-letter country code', () => {
            expect(validateFieldFormat('DNK', 'iso3166_alpha3')).toEqual({ valid: true });
        });

        test('auto-corrects lowercase', () => {
            expect(validateFieldFormat('dnk', 'iso3166_alpha3')).toEqual({ valid: true, corrected: 'DNK' });
        });

        test('rejects wrong length', () => {
            expect(validateFieldFormat('DK', 'iso3166_alpha3').valid).toBe(false);
        });
    });

    describe('iso9362', () => {
        test('accepts valid 8-char BIC', () => {
            expect(validateFieldFormat('DEUTDEFF', 'iso9362')).toEqual({ valid: true });
        });

        test('accepts valid 11-char BIC', () => {
            expect(validateFieldFormat('DEUTDEFF500', 'iso9362')).toEqual({ valid: true });
        });

        test('rejects wrong length', () => {
            expect(validateFieldFormat('DEUT', 'iso9362').valid).toBe(false);
        });

        test('rejects invalid format (numbers in first 6)', () => {
            expect(validateFieldFormat('D3UTDEFF', 'iso9362').valid).toBe(false);
        });
    });

    describe('iso13616', () => {
        test('accepts valid IBAN', () => {
            expect(validateFieldFormat('DK5000400440116243', 'iso13616')).toEqual({ valid: true });
        });

        test('accepts IBAN with spaces (stripped)', () => {
            expect(validateFieldFormat('DK50 0040 0440 1162 43', 'iso13616')).toEqual({ valid: true });
        });

        test('rejects missing country code', () => {
            expect(validateFieldFormat('5000400440116243', 'iso13616').valid).toBe(false);
        });
    });

    describe('iso11649', () => {
        test('accepts valid creditor reference', () => {
            expect(validateFieldFormat('RF18539007547034', 'iso11649')).toEqual({ valid: true });
        });

        test('rejects missing RF prefix', () => {
            expect(validateFieldFormat('18539007547034', 'iso11649').valid).toBe(false);
        });
    });

    describe('iso17442', () => {
        test('accepts valid 20-char LEI', () => {
            expect(validateFieldFormat('529900T8BM49AURSDO55', 'iso17442')).toEqual({ valid: true });
        });

        test('rejects wrong length', () => {
            expect(validateFieldFormat('529900T8BM49', 'iso17442').valid).toBe(false);
        });
    });
});

describe('validateAllFormats', () => {
    test('corrects values and collects warnings', () => {
        const analysis = {
            currency: 'eur',
            paymentDate: '2024-01-15T10:00:00Z',
            badField: 'not-a-date'
        };
        const fieldDefinitions = [
            { key: 'currency', type: 'text', format: 'iso4217', enabled: true },
            { key: 'paymentDate', type: 'date', format: 'iso8601', enabled: true },
            { key: 'badField', type: 'date', format: 'iso8601', enabled: true }
        ];

        const { corrected, warnings } = validateAllFormats(analysis, fieldDefinitions);

        expect(corrected.currency).toBe('EUR');
        expect(corrected.paymentDate).toBe('2024-01-15');
        expect(corrected.badField).toBe('not-a-date');
        expect(warnings).toHaveLength(1);
        expect(warnings[0].field).toBe('badField');
    });

    test('skips fields with format "none"', () => {
        const analysis = { name: 'anything' };
        const fieldDefinitions = [{ key: 'name', type: 'text', format: 'none', enabled: true }];

        const { corrected, warnings } = validateAllFormats(analysis, fieldDefinitions);

        expect(corrected.name).toBe('anything');
        expect(warnings).toHaveLength(0);
    });

    test('skips fields without format', () => {
        const analysis = { name: 'Acme' };
        const fieldDefinitions = [{ key: 'name', type: 'text', enabled: true }];

        const { corrected, warnings } = validateAllFormats(analysis, fieldDefinitions);

        expect(corrected.name).toBe('Acme');
        expect(warnings).toHaveLength(0);
    });

    test('skips disabled fields', () => {
        const analysis = { currency: 'invalid' };
        const fieldDefinitions = [{ key: 'currency', type: 'text', format: 'iso4217', enabled: false }];

        const { corrected, warnings } = validateAllFormats(analysis, fieldDefinitions);

        expect(corrected.currency).toBe('invalid');
        expect(warnings).toHaveLength(0);
    });

    test('handles null/undefined fieldDefinitions', () => {
        const { corrected, warnings } = validateAllFormats({ a: 1 }, null);
        expect(corrected).toEqual({ a: 1 });
        expect(warnings).toHaveLength(0);
    });
});
