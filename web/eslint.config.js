import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import importPlugin from 'eslint-plugin-import'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

// Central place to declare ignored folders beyond dist
const IGNORE_DIRS = ['dist', 'coverage', '.lighthouseci'];

export default defineConfig([
  globalIgnores(IGNORE_DIRS),
  // App source files (src/**) - use app tsconfig
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        project: ['./tsconfig.app.json'],
        // Use fileURLToPath to avoid leading slash on Windows ("/D:/...") which causes parserOptions.tsconfigRootDir error
        tsconfigRootDir: dirname(fileURLToPath(import.meta.url)),
      },
    },
    plugins: { import: importPlugin },
    rules: {
      // Potential noise reducers / clarity adjustments (safe defaults)
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': ['error', { destructuring: 'all' }],
      // Guard against future circular deps (analytics refactor learned)
      'import/no-cycle': ['error', { maxDepth: 1 }],
    },
  },
  // Config files (vite, vitest) - use node tsconfig
  {
    files: ['vite.config.ts', 'vitest.config.ts'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      parserOptions: {
        project: ['./tsconfig.node.json'],
        tsconfigRootDir: dirname(fileURLToPath(import.meta.url)),
      },
    },
  },
  // Test files and playwright config - basic linting without strict type checking
  {
    files: ['tests/**/*.ts', 'playwright.config.ts'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node, ...globals.browser },
      // Skip TypeScript project for test files to avoid project inclusion issues
      parser: tseslint.parser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
  // React JSX runtime tweaks if needed
  {
    files: ['src/**/*.{tsx,jsx}'],
    rules: {
      'react-refresh/only-export-components': 'off', // adjust if hot reload warnings are noisy
    },
  },
])
