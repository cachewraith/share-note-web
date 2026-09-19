import { baseConfig } from './base.js';

/**
 * NestJS relies on parameter decorators and constructor injection, which trip a
 * couple of rules that are correct everywhere else.
 *
 * @param {{ tsconfigRootDir: string }} options
 * @returns {import('eslint').Linter.Config[]}
 */
export function nestConfig(options) {
  return [
    ...baseConfig(options),
    {
      files: ['**/*.ts'],
      rules: {
        '@typescript-eslint/no-extraneous-class': 'off',
        '@typescript-eslint/class-literal-property-style': 'off',
        '@typescript-eslint/no-useless-constructor': 'off',
      },
    },
  ];
}

export default nestConfig;
