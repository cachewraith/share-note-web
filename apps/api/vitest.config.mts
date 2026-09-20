import { resolve } from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Vitest always runs with the package root as cwd.
const alias = { '@': resolve('src') };

/**
 * swc (not esbuild) does the TypeScript transform here: Nest's DI depends on
 * `emitDecoratorMetadata`, which esbuild does not implement.
 *
 * Two projects: `unit` is pure and always runs; `integration` needs the compose
 * services and runs serially against a real Postgres, Redis and MinIO.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: { alias },
  test: {
    globals: false,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          // `pnpm verify` runs every package's tasks at once; a few of these
          // hash thousands of ids and are slow when the box is busy. Generous
          // here so a loaded machine does not look like a broken build.
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['test/**/*.integration.test.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
