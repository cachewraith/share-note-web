# Roadmap

What is deliberately not in v1, and why. Nothing here is half-built: if it is on
this list, no code pretends it exists.

## Out of scope for v1, designed for

| Item                           | What already accommodates it                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| End-to-end encryption          | The API never needs to read markdown; rendering happens in the viewer and could move to the client.           |
| Password-protected shares      | `Share` already has a row-level place for a verifier; the public read path is a single service method.        |
| Expiring links (UI)            | `Share.expiresAt` exists and every read path honours it. Only the UI and the API field are missing.           |
| Soft delete / trash            | `Share.deletedAt` exists and every read path filters on it.                                                   |
| Comments, collaboration, teams | Would need a second authorization axis; today authorization is a single `ownerId` check in the service layer. |
| Billing                        | No per-user accounting exists.                                                                                |
| Full-text search               | Markdown is stored as `text`; a `tsvector` column and GIN index would be a migration, not a redesign.         |
| Custom themes                  | The viewer's colours are CSS custom properties on `:root`.                                                    |
| Open registration              | The auth module verifies keys and resolves users; only the sign-up route and email verification are missing.  |

## Known limitations

- **No background job runner.** Orphaned object cleanup is a CLI command
  (`pnpm --filter @share-note/api cli prune-assets`) rather than a scheduled
  sweep. Run it from cron if you self-host.
- **Rate limiting keys on the client IP.** Behind a proxy this needs
  `TRUST_PROXY=true` and a proxy that overwrites `X-Forwarded-For`.
- **Single-region object storage.** No CDN in front of `/v1/public/assets/:id`;
  put one there if you serve large images at volume.
- **List endpoint is cursor-paginated but unsorted beyond `createdAt desc`.**
  No filtering or search.

## Toolchain follow-ups

- TypeScript 7 and ESLint 10 are pinned back to 5.9 / 9 (see
  `docs/decisions/0002-typescript-and-lint-versions.md`). Revisit when NestJS
  and typescript-eslint support them.
