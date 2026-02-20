const { validateFieldDefinitions, validateTagDefinitions, validatePromptTemplate } = require('../src/config');

// Helper: valid field definition
function validField(overrides = {}) {
    return {
        key: 'testField',
        label: 'Test Field',
        type: 'text',
        schemaHint: 'string value',
        instruction: 'extract the test field',
        enabled: true,
        ...overrides
    };
}

// Helper: valid tag definition
function validTag(overrides = {}) {
    return {
        id: 'test_tag',
        label: 'Test Tag',
        instruction: 'set true if test',
        enabled: true,
        ...overrides
    };
}

describe('validateFieldDefinitions', () => {
    test('accepts valid field definitions', () => {
        expect(() => validateFieldDefinitions([validField()])).not.toThrow();
    });

    test('rejects non-array', () => {
        expect(() => validateFieldDefinitions('not an array')).toThrow('must be an array');
    });

    test('rejects empty array', () => {
        expect(() => validateFieldDefinitions([])).toThrow('non-empty array');
    });

    test('rejects missing key', () => {
        expect(() => validateFieldDefinitions([validField({ key: '' })])).toThrow('must have a "key" string');
    });

    test('rejects missing label', () => {
        expect(() => validateFieldDefinitions([validField({ label: '' })])).toThrow('must have a "label" string');
    });

    test('rejects invalid type', () => {
        expect(() => validateFieldDefinitions([validField({ type: 'invalid' })])).toThrow('"type" must be one of');
    });

    test('accepts all valid field types', () => {
        for (const type of ['text', 'number', 'boolean', 'date', 'array']) {
            expect(() => validateFieldDefinitions([validField({ type })])).not.toThrow();
        }
    });

    test('rejects missing schemaHint', () => {
        expect(() => validateFieldDefinitions([validField({ schemaHint: '' })])).toThrow('must have a "schemaHint"');
    });

    test('rejects missing instruction', () => {
        expect(() => validateFieldDefinitions([validField({ instruction: '' })])).toThrow('must have an "instruction"');
    });

    test('rejects non-boolean enabled', () => {
        expect(() => validateFieldDefinitions([validField({ enabled: 'yes' })])).toThrow('"enabled" must be a boolean');
    });

    test('accepts a reduced array after deletion', () => {
        const fields = [
            validField({ key: 'fieldA', label: 'Field A' }),
            validField({ key: 'fieldB', label: 'Field B' }),
            validField({ key: 'fieldC', label: 'Field C' })
        ];
        fields.splice(1, 1); // simulate deleting fieldB
        expect(() => validateFieldDefinitions(fields)).not.toThrow();
        expect(fields).toHaveLength(2);
    });

    test('accepts fields with extra properties like builtIn', () => {
        const fields = [
            validField({ key: 'invoiceNumber', label: 'Invoice Number', builtIn: true }),
            validField({ key: 'total', label: 'Total', builtIn: true })
        ];
        expect(() => validateFieldDefinitions(fields)).not.toThrow();
    });

    test('accepts multiple fields with unique keys', () => {
        const fields = [
            validField({ key: 'alpha', label: 'Alpha' }),
            validField({ key: 'beta', label: 'Beta' }),
            validField({ key: 'gamma', label: 'Gamma' })
        ];
        expect(() => validateFieldDefinitions(fields)).not.toThrow();
    });

    test('accepts field with valid format', () => {
        expect(() => validateFieldDefinitions([validField({ type: 'date', format: 'iso8601' })])).not.toThrow();
    });

    test('accepts field with format: iso4217 on text type', () => {
        expect(() => validateFieldDefinitions([validField({ type: 'text', format: 'iso4217' })])).not.toThrow();
    });

    test('accepts field without format (undefined)', () => {
        expect(() => validateFieldDefinitions([validField()])).not.toThrow();
    });

    test('accepts field with format: null', () => {
        expect(() => validateFieldDefinitions([validField({ format: null })])).not.toThrow();
    });

    test('accepts field with format: "none" on any type', () => {
        for (const type of ['text', 'number', 'boolean', 'date', 'array']) {
            expect(() => validateFieldDefinitions([validField({ type, format: 'none' })])).not.toThrow();
        }
    });

    test('rejects invalid format key', () => {
        expect(() => validateFieldDefinitions([validField({ format: 'invalid_format' })])).toThrow(
            '"format" must be one of'
        );
    });

    test('rejects format incompatible with field type', () => {
        expect(() => validateFieldDefinitions([validField({ type: 'text', format: 'iso8601' })])).toThrow(
            'not compatible with type "text"'
        );
    });

    test('rejects format incompatible with number type', () => {
        expect(() => validateFieldDefinitions([validField({ type: 'number', format: 'iso4217' })])).toThrow(
            'not compatible with type "number"'
        );
    });

    test('accepts fields with annotation properties (_source, _globalDefaults)', () => {
        const fields = [
            validField({
                key: 'invoiceNumber',
                label: 'Invoice Number',
                _source: 'override',
                _globalDefaults: {
                    label: 'Invoice Number',
                    type: 'text',
                    schemaHint: 'string value',
                    instruction: 'extract the invoice number',
                    enabled: true
                }
            }),
            validField({
                key: 'customField',
                label: 'Custom Field',
                _source: 'override',
                _globalDefaults: null
            })
        ];
        expect(() => validateFieldDefinitions(fields)).not.toThrow();
    });
});

describe('validateTagDefinitions', () => {
    test('accepts valid tag definitions', () => {
        expect(() => validateTagDefinitions([validTag()])).not.toThrow();
    });

    test('rejects non-array', () => {
        expect(() => validateTagDefinitions('not an array')).toThrow('must be an array');
    });

    test('accepts empty array', () => {
        expect(() => validateTagDefinitions([])).not.toThrow();
    });

    test('rejects missing id', () => {
        expect(() => validateTagDefinitions([validTag({ id: '' })])).toThrow('must have an "id" string');
    });

    test('rejects invalid id format', () => {
        expect(() => validateTagDefinitions([validTag({ id: 'Invalid-ID' })])).toThrow(
            'must be lowercase alphanumeric'
        );
    });

    test('rejects duplicate ids', () => {
        expect(() => validateTagDefinitions([validTag({ id: 'dup' }), validTag({ id: 'dup' })])).toThrow(
            'duplicate id'
        );
    });

    test('rejects missing label', () => {
        expect(() => validateTagDefinitions([validTag({ label: '' })])).toThrow('must have a "label" string');
    });

    test('rejects missing instruction', () => {
        expect(() => validateTagDefinitions([validTag({ instruction: '' })])).toThrow(
            'must have an "instruction" string'
        );
    });

    test('rejects non-boolean enabled', () => {
        expect(() => validateTagDefinitions([validTag({ enabled: 1 })])).toThrow('"enabled" must be a boolean');
    });

    test('validates parameters when present', () => {
        const tag = validTag({
            parameters: {
                address: { label: 'Address', default: '123 Main St' }
            }
        });
        expect(() => validateTagDefinitions([tag])).not.toThrow();
    });

    test('rejects parameter without label', () => {
        const tag = validTag({
            parameters: {
                address: { default: '123 Main St' }
            }
        });
        expect(() => validateTagDefinitions([tag])).toThrow('must have a "label" string');
    });

    test('rejects parameter without default', () => {
        const tag = validTag({
            parameters: {
                address: { label: 'Address' }
            }
        });
        expect(() => validateTagDefinitions([tag])).toThrow('must have a "default" value');
    });

    test('validates output config booleans', () => {
        const tag = validTag({ output: { filename: 'yes' } });
        expect(() => validateTagDefinitions([tag])).toThrow('must be a boolean');
    });

    test('validates filenamePlaceholder format', () => {
        const tag = validTag({ output: { filenamePlaceholder: 'invalid-placeholder' } });
        expect(() => validateTagDefinitions([tag])).toThrow('must be alphanumeric camelCase');
    });

    test('accepts valid filenamePlaceholder', () => {
        const tag = validTag({ output: { filenamePlaceholder: 'privateTag' } });
        expect(() => validateTagDefinitions([tag])).not.toThrow();
    });
});

describe('validatePromptTemplate', () => {
    test('accepts valid prompt template', () => {
        expect(() =>
            validatePromptTemplate({
                preamble: 'Analyze this invoice',
                generalRules: 'Use Unknown for missing',
                suffix: 'Return JSON'
            })
        ).not.toThrow();
    });

    test('rejects non-object', () => {
        expect(() => validatePromptTemplate('string')).toThrow('must be an object');
        expect(() => validatePromptTemplate(null)).toThrow('must be an object');
    });

    test('rejects missing preamble', () => {
        expect(() => validatePromptTemplate({ generalRules: 'rules', suffix: 'suffix' })).toThrow(
            'preamble must be a non-empty string'
        );
    });

    test('rejects missing generalRules', () => {
        expect(() => validatePromptTemplate({ preamble: 'preamble', suffix: 'suffix' })).toThrow(
            'generalRules must be a non-empty string'
        );
    });

    test('rejects missing suffix', () => {
        expect(() => validatePromptTemplate({ preamble: 'preamble', generalRules: 'rules' })).toThrow(
            'suffix must be a non-empty string'
        );
    });
});
