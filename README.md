# share-note-web

Share a single Obsidian note as a public link. The note renders in any browser
with syntax highlighting, GFM tables, callouts and its attachments — no Obsidian
required on the other end.

```
https://notes.example.com/V1StGXR8_Z5jdHi6B-myT
```

Self-hosted, no telemetry, no third-party calls. Unshare deletes the content.

## What is in here

| Path                 | What it is                                                           |
| -------------------- | -------------------------------------------------------------------- |
| `apps/api`           | NestJS (Fastify) API: shares, attachments, API-key auth, rate limits |
| `apps/web`           | Next.js viewer: server-rendered, sanitized, cached                   |
| `apps/plugin`        | Obsidian plugin: share, update, unshare, copy link                   |
| `packages/contracts` | zod schemas, types and route constants — the API contract            |
| `packages/config`    | shared tsconfig, ESLint flat config, Prettier config                 |

## Quick start

Requires Node 22+, pnpm 11 and Docker.

```bash
pnpm install
docker compose up -d --wait            # postgres, redis, minio, bucket
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @share-note/api migrate:dev
pnpm --filter @share-note/api cli create-user --email you@example.com
```

That last command prints an API key once. Put it in the plugin's settings along
with `http://localhost:3001`.

```bash
pnpm --filter @share-note/api dev      # http://localhost:3001  (/docs for OpenAPI)
pnpm --filter @share-note/web dev      # http://localhost:3000
pnpm --filter @share-note/plugin dev   # rebuilds main.js on change
```

Run everything the way CI does:

```bash
pnpm verify                            # lint + typecheck + test + build
pnpm --filter @share-note/api test:integration
```

## Architecture in one paragraph

The plugin reads a note, strips its frontmatter, and `POST`s title and markdown
to the API, which stores it under a 21-character CSPRNG slug and returns the
public URL. Attachments referenced by the note are uploaded separately, sniffed
for their real type, and stored in S3-compatible object storage behind a
`StoragePort` interface. The viewer server-renders the note through a
unified/remark/rehype pipeline that sanitizes before it highlights. Re-sharing
`PUT`s to the same id, so the URL never changes; unsharing deletes the row and
its objects.

## Documentation

- [Architecture and threat model](docs/architecture.md)
- [API reference and curl walkthrough](docs/api.md)
- [Self-hosting](docs/self-hosting.md)
- [Releasing](docs/releasing.md)
- [Decisions](docs/decisions/)
- [Roadmap and known limitations](docs/ROADMAP.md)

## Licence

MIT.
