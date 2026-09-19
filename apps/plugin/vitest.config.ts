import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // Only `src/core` is unit-tested: it is the part with no Obsidian imports.
    include: ['src/core/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
});
