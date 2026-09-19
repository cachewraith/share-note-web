import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { baseConfig } from './base.js';

/**
 * @param {{ tsconfigRootDir: string }} options
 * @returns {import('eslint').Linter.Config[]}
 */
export function nextConfig(options) {
  return [
    ...baseConfig(options),
    {
      files: ['**/*.ts', '**/*.tsx'],
      languageOptions: {
        globals: { ...globals.browser, ...globals.node },
      },
      plugins: {
        '@next/next': nextPlugin,
        'react-hooks': reactHooks,
      },
      rules: {
        ...nextPlugin.configs.recommended.rules,
        ...nextPlugin.configs['core-web-vitals'].rules,
        ...reactHooks.configs.recommended.rules,
        'react-hooks/react-compiler': 'off',
      },
    },
  ];
}

export default nextConfig;
