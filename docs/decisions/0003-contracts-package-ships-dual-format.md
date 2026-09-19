# 3. `@share-note/contracts` ships both ESM and CJS

- Status: accepted
- Date: 2026-09-20

## Context

The contracts package is consumed by three runtimes with different module
systems: NestJS (CommonJS), Next.js (bundler/ESM) and the Obsidian plugin
(bundled by esbuild into CommonJS).

## Decision

Build with tsup to `dist/index.js` (ESM), `dist/index.cjs` (CJS) and a single
`.d.ts`, exposed through the `exports` map.

The package is written against `ES2023 + DOM` libs and uses only isomorphic
APIs (`TextEncoder`, `RegExp`), so nothing in it assumes Node.

## Consequences

- One source of truth for schemas, error codes, limits and route paths.
- Consumers never import from `src`, so the public surface is the `exports` map.
