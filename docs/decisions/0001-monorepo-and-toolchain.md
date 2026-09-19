# 1. pnpm workspaces, Turborepo and a version catalog

- Status: accepted
- Date: 2026-09-20

## Context

Four deployables (API, viewer, Obsidian plugin, shared contracts) share one
API contract and one release version. They must not drift apart, and the
toolchain should not need babysitting.

## Decision

pnpm workspaces for linking, Turborepo for task orchestration and caching.

Every third-party version is declared once, in the `catalog:` block of
`pnpm-workspace.yaml`. Packages depend on `"catalog:"` instead of a range, so
there is exactly one place to bump a version and no way for two apps to resolve
different copies of `zod`.

Install scripts are blocked by default; the handful of packages that genuinely
need them are listed in `onlyBuiltDependencies`, and `@scarf/scarf` (telemetry)
is explicitly refused in `ignoredBuiltDependencies`. This is OWASP A03
(supply-chain) hygiene: a compromised transitive dependency cannot run code at
install time.

## Consequences

- One `pnpm verify` runs lint, typecheck, test and build across the workspace.
- Adding a dependency means adding it to the catalog first. Slightly more
  ceremony; no version skew.
- Turborepo caching means CI re-runs only what changed.
