import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Shared flat config. Callers pass the directory that holds their tsconfig so
 * type-aware rules resolve against the right project.
 *
 * @param {{ tsconfigRootDir: string, files?: string[] }} options
 * @returns {import('eslint').Linter.Config[]}
 */
export function baseConfig({ tsconfigRootDir, files = ['**/*.ts', '**/*.tsx'] }) {
  return [
    {
      ignores: [
        'dist/**',
        '.next/**',
        '.turbo/**',
        'coverage/**',
        'node_modules/**',
        'main.js',
        'src/generated/**',
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked.map((config) => ({ ...config, files })),
    ...tseslint.configs.stylisticTypeChecked.map((config) => ({ ...config, files })),
    {
      files,
      languageOptions: {
        globals: { ...globals.node },
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      linterOptions: {
        reportUnusedDisableDirectives: 'error',
      },
      rules: {
        // `any` is allowed only behind an explicit disable comment that says why.
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/switch-exhaustiveness-check': 'error',
        eqeqeq: ['error', 'smart'],
        'no-console': ['error', { allow: ['warn', 'error'] }],
        'no-restricted-syntax': [
          'error',
          {
            selector: "NewExpression[callee.name='Buffer']",
            message: 'Use Buffer.from / Buffer.alloc instead of the deprecated Buffer constructor.',
          },
        ],
      },
    },
    {
      files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/test/**/*.ts'],
      rules: {
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/unbound-method': 'off',
      },
    },
    {
      files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
      languageOptions: { globals: { ...globals.node } },
    },
    prettier,
  ];
}

export default baseConfig;
