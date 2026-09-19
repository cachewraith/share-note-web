import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  // The package is consumed by Node (CJS), Next (bundler) and Obsidian's
  // esbuild bundle, so it ships both formats and its own types.
  dts: { compilerOptions: { lib: ['ES2023', 'DOM'] } },
  clean: true,
  sourcemap: true,
  treeshake: true,
  target: 'node22',
});
