# Roadmap

What is deliberately not in v1, and what is imperfect about what is. Nothing
here is half-built: if it is on this page, no code pretends it exists.

## Out of scope for v1, designed for

| Item                           | What already accommodates it                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| End-to-end encryption          | The API never needs to read markdown; rendering is one module and could move to the client.                                                   |
| Password-protected shares      | The public read path is a single service method, and `Share` has room for a verifier.                                                         |
| Expiring links (UI)            | `Share.expiresAt` exists and every read path honours it. Only the field on the API and the UI are missing.                                    |
| Soft delete / trash            | `Share.deletedAt` exists and every read path filters on it.                                                                                   |
| Comments, collaboration, teams | Would need a second authorization axis; today it is one `ownerId` check in the service layer.                                                 |
| Billing                        | No per-user accounting exists.                                                                                                                |
| Full-text search               | Markdown is stored as `text`; a `tsvector` column and a GIN index would be a migration, not a redesign.                                       |
| Custom themes                  | The viewer's colours are CSS custom properties on `:root`.                                                                                    |
| Open registration              | The auth module verifies keys and resolves users; only the sign-up route and email verification are missing.                                  |
| Transcluding notes             | `![[Some Note]]` renders as its name. Resolving it means uploading a second note's content, which is a product decision, not a technical one. |

## Known limitations

**Operational**

- **No background job runner.** Orphaned object cleanup is a CLI command
  (`cli prune-assets`), not a scheduled sweep. Run it from cron.
- **A Redis outage is a full outage.** The rate limiter fails closed on purpose
  ([ADR 9](decisions/0009-rate-limiting-is-ours-and-fails-closed.md)); readers
  are affected too.
- **Rate limiting keys on the client IP** for unauthenticated traffic. Behind a
  proxy this needs `TRUST_PROXY=true` and a proxy that overwrites
  `X-Forwarded-For`.
- **API keys do not expire.** Rotation is `create-key` then `revoke-key`.
- **No CDN in front of attachments.** Fine for notes; put one there if you serve
  large images at volume.

**Product**

- **Listing is `createdAt desc` only**, cursor-paginated, with no filter or
  search.
- **Attachments are addressed by filename within a share.** Two vault files with
  the same basename in different folders collide, and the later upload wins
  ([ADR 10](decisions/0010-attachments-keep-their-filename.md)).
- **External images render as alt text.** Deliberate
  ([ADR 12](decisions/0012-viewer-only-renders-its-own-attachments.md)), but it
  will surprise someone who pastes an image URL.
- **The plugin uploads one attachment at a time.** A note with 50 new images is
  50 sequential requests.

**Performance**

- **The viewer's first render is slow.** Shiki loads its grammars and themes on
  the first note a process renders — a few seconds — and every render after that
  is milliseconds. Pre-warm the process if cold starts matter.
- **Shiki ships every language.** Narrowing to a list would cut the viewer image
  and the cold start, at the cost of unhighlighted code in the languages left
  out.
- **The migrate image is 579 MB** for a job that runs for two seconds. That is
  the floor for the Prisma CLI's dependency closure; it is never pulled by a
  serving replica.

## Toolchain follow-ups

- TypeScript 7 and ESLint 10 are pinned back to 5.9 and 9
  ([ADR 2](decisions/0002-typescript-and-lint-versions.md)). Revisit when NestJS
  and typescript-eslint support them.
- `@prisma/client` contributes 71 MB to the API image, mostly runtime variants
  the Node build never loads.
