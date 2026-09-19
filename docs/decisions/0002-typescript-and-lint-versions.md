# 2. TypeScript 5.9 and ESLint 9, not the newest majors

- Status: accepted
- Date: 2026-09-20

## Context

TypeScript 7 (the native port) and ESLint 10 are both released. NestJS depends
on `experimentalDecorators` plus `emitDecoratorMetadata`, and Prisma generates
its client as TypeScript source that we compile.

## Decision

Pin TypeScript 5.9 and ESLint 9 with typescript-eslint 8.

## Consequences

- Decorator metadata, Prisma codegen and the Next.js plugin are all on
  combinations that are widely exercised.
- Revisit once typescript-eslint and NestJS publish support for the newer
  majors. Tracked in `docs/ROADMAP.md`.
