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
    // Runs in every worker, so no individual test pays for Shiki's warm-up.
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
