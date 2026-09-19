import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Root config: covers the plain-JS tooling files that live outside any
 * workspace package (scripts/, config files). Apps and packages bring their own.
 */
export default [
  {
    ignores: ['apps/**', 'packages/**', 'node_modules/**', '.turbo/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      'no-console': 'off',
    },
  },
  prettier,
];
