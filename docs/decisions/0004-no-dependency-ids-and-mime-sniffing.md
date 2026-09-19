# 4. Slug generation and MIME sniffing without dependencies

- Status: accepted
- Date: 2026-09-20

## Context

Two small pieces of security-relevant logic were candidates for a dependency:

- unguessable public ids — `nanoid`
- MIME detection from file content — `file-type`

Both packages are ESM-only at the versions we would want, and the API is
CommonJS. Interop shims for security-critical code are a bad trade.

## Decision

Implement both in the API, in ~30 lines each, with unit tests:

- `src/common/ids.ts` — nanoid's algorithm (mask-and-reject over a 64-symbol
  URL-safe alphabet, bytes from `node:crypto.randomBytes`), 21 characters,
  ~126 bits of entropy. Rejection sampling keeps the distribution uniform; a
  naive `% 64` would not matter for a 64-symbol alphabet but the mask keeps the
  code honest if the alphabet ever changes.
- `src/common/mime.ts` — magic-byte checks for PNG, JPEG, GIF and WebP only.

## Consequences

- Two fewer dependencies on the path that decides whether a file is safe to
  store, and no CJS/ESM interop layer around it.
- The alphabet and the magic-byte tables are ours to maintain. Both are frozen
  formats, so this is close to zero upkeep.
