// ESLint flat config. One shared TS rule set for frontend + backend; React
// rules activate only on .tsx / .jsx files.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import globals from 'globals'

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'server-build/**',
      'coverage/**',
      '.vite/**',
      '.tanstack/**',
      'src/routeTree.gen.ts',
      'data/**',
      'tests/**',
      'test-results/**',
      'playwright-report/**',
      // Paperclip transient scratch from other agents / runs (debug scripts,
      // screenshot helpers, etc.). These are workspace-local and not part
      // of the IPAM source tree; linting them floods `npm run lint` with
      // browser-globals errors that don't reflect the codebase.
      '.paperclip/**',
      '.paperclip-tmp/**',
      'eslint.config.js',
      'vitest.config.ts',
      'vite.config.ts',
    ],
  },

  // Base JS recommended
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Frontend / shared TS
  {
    files: ['src/**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
    },
    settings: { react: { version: '18.3' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      // Match the strictness set by tsconfig (noUnusedLocals etc.).
      // ESLint can't catch what tsc catches, so we only enable stylistic
      // and React-specific rules here.
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'jsx-a11y/alt-text': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      // The codebase uses inline `import('...')` types extensively for
      // generic-constraint lookups (drizzle column types, Hono Context in
      // ad-hoc handlers). The rule still enforces `type` imports at the
      // top level; only the `import()` *type-annotation* form is allowed.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports', disallowTypeAnnotations: false },
      ],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'prefer-const': 'error',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
    },
  },

  // Backend-specific globals (Node)
  {
    files: ['src/server/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  // Node-only maintenance scripts use the same ESM runtime as the server.
  {
    files: ['scripts/**/*.{js,mjs,ts}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Tests: relax any/no-explicit-any + allow console for diagnostics
  {
    files: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.ts', 'tests/**/*.ts', 'playwright.config.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
)
