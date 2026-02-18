const js = require('@eslint/js');
const globals = require('globals');
const prettier = require('eslint-config-prettier');

module.exports = [
    // Global ignores
    {
        ignores: ['node_modules/', 'backups/', 'uploads/', 'output/', 'test-invoices/', 'clients/', 'config.json']
    },

    // Backend: CommonJS + Node.js
    {
        files: ['server.js', 'batch-process.js', 'src/**/*.js', 'scripts/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                ...globals.node
            }
        },
        rules: {
            ...js.configs.recommended.rules,
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'preserve-caught-error': 'off'
        }
    },

    // Frontend: ES Modules + Browser (post-Phase 6 modular files)
    {
        files: ['public/modules/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser
            }
        },
        rules: {
            ...js.configs.recommended.rules,
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
        }
    },

    // Frontend: app.js — ES module entry point (post-Phase 6)
    {
        files: ['public/app.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser
            }
        },
        rules: {
            ...js.configs.recommended.rules,
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
        }
    },

    // ESLint config file itself
    {
        files: ['eslint.config.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                ...globals.node
            }
        },
        rules: {
            ...js.configs.recommended.rules
        }
    },

    // Prettier override (disables formatting rules that conflict)
    prettier
];
