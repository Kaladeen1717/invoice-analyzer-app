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
