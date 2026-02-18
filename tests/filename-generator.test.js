const {
    sanitizeForFilename,
    generateFilename,
    generateFormattedFilename,
    formatFieldValue,
    formatDateForDisplay
} = require('../src/filename-generator');

describe('sanitizeForFilename', () => {
    test('removes illegal characters', () => {
        expect(sanitizeForFilename('file<>:name')).toBe('filename');
    });

    test('normalizes whitespace', () => {
        expect(sanitizeForFilename('too   many   spaces')).toBe('too many spaces');
    });

    test('returns Unknown for null/undefined', () => {
        expect(sanitizeForFilename(null)).toBe('Unknown');
        expect(sanitizeForFilename(undefined)).toBe('Unknown');
    });

    test('returns Unknown for empty string after sanitization', () => {
        expect(sanitizeForFilename('***')).toBe('Unknown');
    });

    test('preserves normal punctuation', () => {
        expect(sanitizeForFilename('Acme Corp. - Invoice #123')).toBe('Acme Corp. - Invoice #123');
    });
});

describe('formatDateForDisplay', () => {
    test('converts YYYYMMDD to DD.MM.YYYY', () => {
        expect(formatDateForDisplay('20240115')).toBe('15.01.2024');
    });

    test('handles date with separators', () => {
        expect(formatDateForDisplay('2024-01-15')).toBe('15.01.2024');
    });

    test('returns Unknown for null/empty/Unknown', () => {
        expect(formatDateForDisplay(null)).toBe('Unknown');
        expect(formatDateForDisplay('')).toBe('Unknown');
        expect(formatDateForDisplay('Unknown')).toBe('Unknown');
    });

    test('returns original string for short dates', () => {
        expect(formatDateForDisplay('2024')).toBe('2024');
    });
});

describe('formatFieldValue', () => {
    test('formats totalAmount as clean number', () => {
        expect(formatFieldValue('totalAmount', null, { totalAmount: 1500.5 })).toBe('1500.50');
        expect(formatFieldValue('totalAmount', null, { totalAmount: 1500 })).toBe('1500');
        expect(formatFieldValue('totalAmount', null, { totalAmount: 'abc' })).toBe('0');
    });

    test('formats paymentDate as YYYYMMDD', () => {
        expect(formatFieldValue('paymentDate', null, { paymentDate: '2024-01-15' })).toBe('20240115');
    });

    test('formats paymentDateFormatted as DD.MM.YYYY', () => {
        expect(formatFieldValue('paymentDateFormatted', null, { paymentDate: '20240115' })).toBe('15.01.2024');
    });

    test('formats invoiceDateIfDifferent when dates differ', () => {
        const analysis = { paymentDate: '20240115', invoiceDate: '20240110' };
        expect(formatFieldValue('invoiceDateIfDifferent', null, analysis)).toBe(' - 10.01.2024');
    });

    test('returns empty when invoiceDateIfDifferent and dates match', () => {
        const analysis = { paymentDate: '20240115', invoiceDate: '20240115' };
        expect(formatFieldValue('invoiceDateIfDifferent', null, analysis)).toBe('');
    });

    test('formats currency as uppercase', () => {
        expect(formatFieldValue('currency', null, { currency: 'eur' })).toBe('EUR');
    });

    test('formats privateTag based on tags', () => {
        expect(formatFieldValue('privateTag', null, { tags: { private: true } })).toBe(' - PRIVATE');
        expect(formatFieldValue('privateTag', null, { tags: { private: false } })).toBe('');
        expect(formatFieldValue('privateTag', null, {})).toBe('');
    });

    test('returns empty for boolean and array fields', () => {
        expect(formatFieldValue('isPrivate', null, {})).toBe('');
        expect(formatFieldValue('documentTypes', null, {})).toBe('');
    });

    test('handles custom fields', () => {
        expect(formatFieldValue('customField', null, { customField: 'hello' })).toBe('hello');
        expect(formatFieldValue('customField', null, {})).toBe('Unknown');
    });
});

describe('generateFilename', () => {
    test('replaces placeholders with analysis values', () => {
        const result = generateFilename('{supplierName} - {invoiceNumber}.pdf', {
            supplierName: 'Acme Corp',
            invoiceNumber: 'INV-001'
        });
        expect(result).toBe('Acme Corp - INV-001.pdf');
    });

    test('adds .pdf extension if missing', () => {
        const result = generateFilename('{supplierName}', { supplierName: 'Test' });
        expect(result).toBe('Test.pdf');
    });

    test('uses Unknown for missing fields', () => {
        const result = generateFilename('{supplierName}.pdf', {});
        expect(result).toBe('Unknown.pdf');
    });
});

describe('generateFormattedFilename', () => {
    test('renders template with formatted fields', () => {
        const result = generateFormattedFilename('{supplierName} - {paymentDateFormatted} - {totalAmount}.pdf', {
            supplierName: 'Acme Corp',
            paymentDate: '20240115',
            totalAmount: 1500.5
        });
        expect(result).toBe('Acme Corp - 15.01.2024 - 1500.50.pdf');
    });

    test('handles tag placeholders from config', () => {
        const config = {
            tagDefinitions: [
                {
                    id: 'private',
                    label: 'Private',
                    instruction: 'test',
                    enabled: true,
                    output: {
                        filename: true,
                        filenamePlaceholder: 'privateTag',
                        filenameFormat: ' - PRIVATE'
                    }
                }
            ]
        };
        const result = generateFormattedFilename(
            '{supplierName}{privateTag}.pdf',
            {
                supplierName: 'Acme Corp',
                tags: { private: true }
            },
            config
        );
        expect(result).toBe('Acme Corp - PRIVATE.pdf');
    });

    test('omits inactive tag placeholders', () => {
        const config = {
            tagDefinitions: [
                {
                    id: 'private',
                    label: 'Private',
                    instruction: 'test',
                    enabled: true,
                    output: {
                        filename: true,
                        filenamePlaceholder: 'privateTag',
                        filenameFormat: ' - PRIVATE'
                    }
                }
            ]
        };
        const result = generateFormattedFilename(
            '{supplierName}{privateTag}.pdf',
            {
                supplierName: 'Acme Corp',
                tags: { private: false }
            },
            config
        );
        expect(result).toBe('Acme Corp.pdf');
    });

    test('cleans up double dashes from empty placeholders', () => {
        const result = generateFormattedFilename('{supplierName} - {invoiceDateIfDifferent}.pdf', {
            supplierName: 'Acme',
            paymentDate: '20240115',
            invoiceDate: '20240115'
        });
        expect(result).toBe('Acme.pdf');
    });
});
