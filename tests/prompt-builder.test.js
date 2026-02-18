const {
    buildExtractionPrompt,
    parseGeminiResponse,
    validateAnalysis,
    resolveTagInstruction,
    formatDocumentTypes,
    TAG_REPLACED_FIELDS
} = require('../src/prompt-builder');

describe('resolveTagInstruction', () => {
    test('substitutes parameter templates', () => {
        const tag = {
            instruction: 'Check if address "{{address}}" appears',
            parameters: { address: { label: 'Address', default: '123 Main St' } }
        };
        expect(resolveTagInstruction(tag)).toBe('Check if address "123 Main St" appears');
    });

    test('uses override values when provided', () => {
        const tag = {
            instruction: 'Check "{{address}}"',
            parameters: { address: { label: 'Address', default: '123 Main St' } }
        };
        expect(resolveTagInstruction(tag, { address: '456 Oak Ave' })).toBe('Check "456 Oak Ave"');
    });

    test('returns instruction unchanged when no parameters', () => {
        const tag = { instruction: 'Simple instruction' };
        expect(resolveTagInstruction(tag)).toBe('Simple instruction');
    });
});

describe('buildExtractionPrompt', () => {
    const baseConfig = {
        extraction: { fields: ['supplierName', 'totalAmount'], includeSummary: false },
        processing: { concurrency: 1, retryAttempts: 0 },
        output: { filenameTemplate: '{supplierName}.pdf' }
    };

    test('builds prompt with structured template', () => {
        const config = {
            ...baseConfig,
            promptTemplate: {
                preamble: 'Analyze this invoice:',
                generalRules: 'Use Unknown for missing fields.',
                suffix: 'Return valid JSON.'
            }
        };
        const prompt = buildExtractionPrompt(config);
        expect(prompt).toContain('Analyze this invoice:');
        expect(prompt).toContain('Use Unknown for missing fields.');
        expect(prompt).toContain('Return valid JSON.');
        expect(prompt).toContain('supplierName');
        expect(prompt).toContain('totalAmount');
    });

    test('uses rawPrompt when set', () => {
        const config = {
            ...baseConfig,
            rawPrompt: 'This is my raw prompt'
        };
        expect(buildExtractionPrompt(config)).toBe('This is my raw prompt');
    });

    test('includes field instructions for data-driven mode', () => {
        const config = {
            ...baseConfig,
            fieldDefinitions: [
                {
                    key: 'supplierName',
                    label: 'Supplier',
                    type: 'text',
                    schemaHint: 'string',
                    instruction: 'extract the supplier name',
                    enabled: true
                },
                {
                    key: 'amount',
                    label: 'Amount',
                    type: 'number',
                    schemaHint: 'number',
                    instruction: 'extract total amount',
                    enabled: true
                },
                {
                    key: 'notes',
                    label: 'Notes',
                    type: 'text',
                    schemaHint: 'string',
                    instruction: 'extract notes',
                    enabled: false
                }
            ]
        };
        const prompt = buildExtractionPrompt(config);
        expect(prompt).toContain('extract the supplier name');
        expect(prompt).toContain('extract total amount');
        expect(prompt).not.toContain('extract notes');
    });

    test('includes tag instructions when tagDefinitions present', () => {
        const config = {
            ...baseConfig,
            fieldDefinitions: [
                {
                    key: 'supplierName',
                    label: 'Supplier',
                    type: 'text',
                    schemaHint: 'string',
                    instruction: 'extract name',
                    enabled: true
                }
            ],
            tagDefinitions: [
                { id: 'private', label: 'Private', instruction: 'Set true if private', enabled: true },
                { id: 'urgent', label: 'Urgent', instruction: 'Set true if urgent', enabled: false }
            ]
        };
        const prompt = buildExtractionPrompt(config);
        expect(prompt).toContain('tags.private');
        expect(prompt).toContain('Set true if private');
        expect(prompt).not.toContain('tags.urgent');
    });

    test('excludes tag-replaced fields when tags are active', () => {
        const config = {
            ...baseConfig,
            fieldDefinitions: [
                {
                    key: 'supplierName',
                    label: 'Supplier',
                    type: 'text',
                    schemaHint: 'string',
                    instruction: 'name',
                    enabled: true
                },
                {
                    key: 'documentTypes',
                    label: 'Doc Types',
                    type: 'array',
                    schemaHint: 'array',
                    instruction: 'types',
                    enabled: true
                },
                {
                    key: 'isPrivate',
                    label: 'Private',
                    type: 'boolean',
                    schemaHint: 'bool',
                    instruction: 'private',
                    enabled: true
                }
            ],
            tagDefinitions: [{ id: 'private', label: 'Private', instruction: 'private check', enabled: true }]
        };
        const prompt = buildExtractionPrompt(config);
        expect(prompt).toContain('supplierName');
        expect(prompt).not.toMatch(/For documentTypes/);
        expect(prompt).not.toMatch(/For isPrivate/);
    });

    test('includes summary instruction when enabled', () => {
        const config = {
            ...baseConfig,
            extraction: { ...baseConfig.extraction, includeSummary: true }
        };
        const prompt = buildExtractionPrompt(config);
        expect(prompt).toContain('summary');
    });
});

describe('parseGeminiResponse', () => {
    test('parses plain JSON', () => {
        const result = parseGeminiResponse('{"supplierName": "Acme"}');
        expect(result).toEqual({ supplierName: 'Acme' });
    });

    test('strips markdown code fences', () => {
        const result = parseGeminiResponse('```json\n{"supplierName": "Acme"}\n```');
        expect(result).toEqual({ supplierName: 'Acme' });
    });

    test('strips plain code fences', () => {
        const result = parseGeminiResponse('```\n{"supplierName": "Acme"}\n```');
        expect(result).toEqual({ supplierName: 'Acme' });
    });

    test('throws on invalid JSON', () => {
        expect(() => parseGeminiResponse('not json')).toThrow('Failed to parse Gemini response');
    });
});

describe('validateAnalysis', () => {
    test('fills missing fields with type-appropriate defaults (data-driven)', () => {
        const config = {
            extraction: { fields: [] },
            fieldDefinitions: [
                { key: 'name', label: 'Name', type: 'text', schemaHint: 's', instruction: 'i', enabled: true },
                { key: 'amount', label: 'Amount', type: 'number', schemaHint: 'n', instruction: 'i', enabled: true },
                { key: 'flag', label: 'Flag', type: 'boolean', schemaHint: 'b', instruction: 'i', enabled: true },
                { key: 'items', label: 'Items', type: 'array', schemaHint: 'a', instruction: 'i', enabled: true }
            ]
        };
        const result = validateAnalysis({}, config);
        expect(result.name).toBe('Unknown');
        expect(result.amount).toBe(0);
        expect(result.flag).toBe(false);
        expect(result.items).toEqual([]);
    });

    test('preserves existing values', () => {
        const config = {
            extraction: { fields: [] },
            fieldDefinitions: [
                { key: 'name', label: 'Name', type: 'text', schemaHint: 's', instruction: 'i', enabled: true }
            ]
        };
        const result = validateAnalysis({ name: 'Acme' }, config);
        expect(result.name).toBe('Acme');
    });

    test('falls back paymentDate to invoiceDate', () => {
        const config = {
            extraction: { fields: [] },
            fieldDefinitions: [
                {
                    key: 'paymentDate',
                    label: 'Pay Date',
                    type: 'date',
                    schemaHint: 's',
                    instruction: 'i',
                    enabled: true
                },
                {
                    key: 'invoiceDate',
                    label: 'Inv Date',
                    type: 'date',
                    schemaHint: 's',
                    instruction: 'i',
                    enabled: true
                }
            ]
        };
        const result = validateAnalysis({ invoiceDate: '20240115' }, config);
        expect(result.paymentDate).toBe('20240115');
    });

    test('ensures tag booleans default to false', () => {
        const config = {
            extraction: { fields: [] },
            fieldDefinitions: [],
            tagDefinitions: [
                { id: 'private', label: 'Private', instruction: 'i', enabled: true },
                { id: 'urgent', label: 'Urgent', instruction: 'i', enabled: true }
            ]
        };
        const result = validateAnalysis({ tags: { private: true } }, config);
        expect(result.tags.private).toBe(true);
        expect(result.tags.urgent).toBe(false);
    });
});

describe('formatDocumentTypes', () => {
    test('returns Unknown for empty/null', () => {
        expect(formatDocumentTypes(null)).toBe('Unknown');
        expect(formatDocumentTypes([])).toBe('Unknown');
    });

    test('maps type IDs to labels', () => {
        const result = formatDocumentTypes(['commercial_invoice', 'receipt']);
        expect(result).toContain('Commercial Invoice');
        expect(result).toContain('Receipt');
    });
});

describe('TAG_REPLACED_FIELDS', () => {
    test('contains expected fields', () => {
        expect(TAG_REPLACED_FIELDS).toContain('documentTypes');
        expect(TAG_REPLACED_FIELDS).toContain('isPrivate');
    });
});
