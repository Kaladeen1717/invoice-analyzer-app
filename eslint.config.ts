import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
    // Global ignores
    {
        ignores: ['node_modules/', 'dist/', 'public/', 'backups/', 'uploads/', 'output/', 'clients/', 'config.json']
    },

    // Base recommended rules
    eslint.configs.recommended,
    ...tseslint.configs.recommended,

    // Backend: ESM + Node.js
    {
        files: ['src/**/*.ts', 'server.ts', 'batch-process.ts', 'scripts/**/*.ts'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.node
            }
        },
        rules: {
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
        }
    },

    // Frontend: ES Modules + Browser
    {
        files: ['src/frontend/**/*.ts'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser
            }
        },
        rules: {
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
        }
    },

    // Tests (TypeScript — target config after INV-76)
    {
        files: ['tests/**/*.ts'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.node,
                ...globals.jest
            }
        },
        rules: {
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-require-imports': 'off'
        }
    },

    // Tests (JavaScript — transitional, until INV-76 converts them to .ts)
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                ...globals.jest
            }
        },
        rules: {
            ...eslint.configs.recommended.rules,
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            '@typescript-eslint/no-require-imports': 'off'
        }
    },

    // Prettier override (disables formatting rules that conflict)
    prettier
);
