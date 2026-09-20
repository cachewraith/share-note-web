import { defineConfig } from 'tsup';

export default defineConfig({
  // Two entry points: the schemas, and a zod-free `lite` build for the
  // Obsidian plugin (see docs/decisions/0013).
  entry: ['src/index.ts', 'src/lite.ts'],
  format: ['esm', 'cjs'],
  // The package is consumed by Node (CJS), Next (bundler) and Obsidian's
  // esbuild bundle, so it ships both formats and its own types.
  dts: { compilerOptions: { lib: ['ES2023', 'DOM'] } },
  clean: true,
  sourcemap: true,
  treeshake: true,
  target: 'node22',
});
