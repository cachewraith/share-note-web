import { baseConfig } from './base.js';

/**
 * @param {{ tsconfigRootDir: string }} options
 * @returns {import('eslint').Linter.Config[]}
 */
export function nodeConfig(options) {
  return baseConfig(options);
}

export default nodeConfig;
