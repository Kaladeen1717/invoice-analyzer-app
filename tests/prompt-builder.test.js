const {
    buildExtractionPrompt,
    parseGeminiResponse,
    validateAnalysis,
    resolveTagInstruction
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
        fieldDefinitions: [
            {
                key: 'supplierName',
                label: 'Supplier',
                type: 'text',
                schemaHint: 'Full company/supplier name',
                instruction: 'extract the supplier name',
                enabled: true
            },
            {
                key: 'totalAmount',
                label: 'Amount',
                type: 'number',
                schemaHint: 'Total amount',
                instruction: 'extract total amount',
                enabled: true
            }
        ],
        output: { filenameTemplate: '{supplierName}.pdf', includeSummary: false }
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

    test('includes field instructions for enabled fields only', () => {
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

    test('includes summary instruction when enabled', () => {
        const config = {
            ...baseConfig,
            output: { ...baseConfig.output, includeSummary: true }
        };
        const prompt = buildExtractionPrompt(config);
        expect(prompt).toContain('summary');
    });

    describe('fieldFilter option', () => {
        const filterConfig = {
            ...baseConfig,
            fieldDefinitions: [
                {
                    key: 'supplierName',
                    label: 'Supplier',
                    type: 'text',
                    schemaHint: 'string',
                    instruction: 'extract supplier name',
                    enabled: true
                },
                {
                    key: 'totalAmount',
                    label: 'Amount',
                    type: 'number',
                    schemaHint: 'number',
                    instruction: 'extract total amount',
                    enabled: true
                },
                {
                    key: 'currency',
                    label: 'Currency',
                    type: 'text',
                    schemaHint: 'string',
                    instruction: 'extract currency',
                    enabled: true
                }
            ],
            tagDefinitions: [
                { id: 'private', label: 'Private', instruction: 'Set true if private', enabled: true },
                { id: 'receipt', label: 'Receipt', instruction: 'Set true if receipt', enabled: true },
                { id: 'disabled_tag', label: 'Disabled', instruction: 'Never shown', enabled: false }
            ],
            output: { ...baseConfig.output, includeSummary: true }
        };

        test('filters to specified fields only', () => {
            const prompt = buildExtractionPrompt(filterConfig, {
                fieldFilter: { fields: ['supplierName', 'currency'] }
            });
            expect(prompt).toContain('supplierName');
            expect(prompt).toContain('currency');
            expect(prompt).not.toContain('extract total amount');
        });

        test('filters to specified tags only', () => {
            const prompt = buildExtractionPrompt(filterConfig, {
                fieldFilter: { tags: ['receipt'] }
            });
            expect(prompt).toContain('tags.receipt');
            expect(prompt).not.toContain('tags.private');
        });

        test('excludes summary when fieldFilter.includeSummary is false', () => {
            const prompt = buildExtractionPrompt(filterConfig, {
                fieldFilter: { includeSummary: false }
            });
            expect(prompt).not.toContain('summary');
        });

        test('includes summary when fieldFilter.includeSummary is true', () => {
            const noSummaryConfig = {
                ...filterConfig,
                output: { ...filterConfig.output, includeSummary: false }
            };
            const prompt = buildExtractionPrompt(noSummaryConfig, {
                fieldFilter: { includeSummary: true }
            });
            expect(prompt).toContain('summary');
        });

        test('does not filter disabled fields into results', () => {
            const prompt = buildExtractionPrompt(filterConfig, {
                fieldFilter: { tags: ['disabled_tag'] }
            });
            expect(prompt).not.toContain('tags.disabled_tag');
        });

        test('returns all enabled fields when fieldFilter.fields is omitted', () => {
            const prompt = buildExtractionPrompt(filterConfig, {
                fieldFilter: { tags: ['private'] }
            });
            expect(prompt).toContain('supplierName');
            expect(prompt).toContain('totalAmount');
            expect(prompt).toContain('currency');
        });

        test('returns all enabled tags when fieldFilter.tags is omitted', () => {
            const prompt = buildExtractionPrompt(filterConfig, {
                fieldFilter: { fields: ['supplierName'] }
            });
            expect(prompt).toContain('tags.private');
            expect(prompt).toContain('tags.receipt');
        });

        test('backward compatible — no options acts like original', () => {
            const withOptions = buildExtractionPrompt(filterConfig, {});
            const without = buildExtractionPrompt(filterConfig);
            expect(withOptions).toBe(without);
        });
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
    test('fills missing fields with type-appropriate defaults', () => {
        const config = {
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
            fieldDefinitions: [
                { key: 'name', label: 'Name', type: 'text', schemaHint: 's', instruction: 'i', enabled: true }
            ]
        };
        const result = validateAnalysis({ name: 'Acme' }, config);
        expect(result.name).toBe('Acme');
    });

    test('falls back paymentDate to invoiceDate', () => {
        const config = {
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
