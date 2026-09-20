# 13. `@share-note/contracts/lite`: the contract without zod

- Status: accepted
- Date: 2026-09-20

## Context

The plugin bundles everything it imports into a single `main.js` that Obsidian
loads on desktop _and_ on phones. Using the contract's zod schemas for the four
flat responses it reads produced a 471 KB bundle, of which 453 KB was zod and
18 KB was the plugin.

Shipping a quarter of a megabyte of validation library to a phone to check
`{ id, url, contentHash }` is not proportionate, and bundle size is something
the Obsidian community-plugin review looks at.

Alternatives considered:

- **Keep zod.** Rejected: 25x the necessary bundle, on mobile.
- **Author the schemas with `zod/mini`.** Rejected: it would impose a more
  awkward authoring style on the API and the viewer, where size costs nothing.
- **Drop response validation in the plugin.** Rejected: it is what turns "this
  URL is not a share-note server" into a sentence rather than a later
  `undefined is not an object`.

## Decision

`packages/contracts` ships two entry points:

- `@share-note/contracts` — the zod schemas. Used by the API and the viewer,
  where they parse, coerce and generate the OpenAPI document.
- `@share-note/contracts/lite` — the same routes, limits, identifier patterns
  and error codes, plus hand-written type guards. No imports at all, so nothing
  is pulled in behind it.

Both are built from the same `src/constants.ts`, so the values cannot diverge.
The guards are the one genuine duplication, and `src/guards.test.ts` pins them:
every guard is checked against its schema over a valid payload and every
single-field corruption of it, so a schema change that the guards do not follow
fails the build.

## Consequences

- The plugin bundle is 18.5 KB.
- A new field in a response schema needs the matching guard updated; the
  agreement test says so rather than letting it pass silently.
- The guards _check_, they do not _parse_: no coercion, no defaults. That is
  the right shape for reading a response, and it is why the API — which coerces
  query strings and applies defaults — keeps the schemas.
