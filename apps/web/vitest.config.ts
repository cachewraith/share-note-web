import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    passWithNoTests: true,
    // Shiki's first render loads grammars and themes; on a loaded CI box that
    // can take a while. Every test after the warm-up is milliseconds.
    testTimeout: 30_000,
  },
});
