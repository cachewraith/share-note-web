# share-note-web

Share a single Obsidian note as a public link. The note renders in any browser
with syntax highlighting, GFM tables, callouts and its attachments — no Obsidian
required on the other end.

```
https://notes.example.com/V1StGXR8_Z5jdHi6B-myT
```

Self-hosted. No telemetry, no third-party requests, no accounts for readers.
Unsharing deletes the content.

## What is in here

| Path                 | What it is                                                        |
| -------------------- | ----------------------------------------------------------------- |
| `apps/api`           | NestJS on Fastify: shares, attachments, API-key auth, rate limits |
| `apps/web`           | Next.js viewer: server-rendered, sanitized, cached                |
| `apps/plugin`        | Obsidian plugin: share, update, copy link, unshare                |
| `packages/contracts` | zod schemas, types and route constants — the API contract         |
| `packages/config`    | shared tsconfig, ESLint flat config, Prettier config              |

## Quick start

Node 22+, pnpm 11, Docker.

```bash
pnpm install
pnpm dev:up                                       # postgres, redis, minio, migrations
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

pnpm --filter @share-note/api build
pnpm --filter @share-note/api cli create-user --email you@example.com
```

That last command prints an API key once. Put it, and `http://localhost:3001`,
into the plugin's settings.

```bash
pnpm --filter @share-note/api dev      # http://localhost:3001  (/docs for OpenAPI)
pnpm --filter @share-note/web dev      # http://localhost:3000
pnpm --filter @share-note/plugin dev   # rebuilds main.js on change
```

To try the plugin, symlink `apps/plugin` into a vault:

```bash
ln -s "$PWD/apps/plugin" /path/to/vault/.obsidian/plugins/self-hosted-note-share
```

Run everything the way CI does:

```bash
pnpm verify                                   # lint + typecheck + test + build
pnpm --filter @share-note/api test:integration        # needs the compose stack
```

For a real deployment, see [self-hosting](docs/self-hosting.md).

## How it works

The plugin reads a note, strips its frontmatter, and `POST`s the title and
markdown to the API, which stores it under a 21-character CSPRNG slug and
returns the public URL. Attachments the note embeds are uploaded separately,
identified by their magic bytes rather than their extension, and stored in
S3-compatible object storage behind a `StoragePort`. The viewer server-renders
the note through a unified/remark/rehype pipeline that **sanitizes before it
highlights**, under a CSP whose `script-src` is nonce-only. Re-sharing `PUT`s to
the same id, so the URL never changes; unsharing deletes the row and its
objects.

Three layers in the API — controller, service, repository/port — with every
authorization check in the service layer, where it is unit-testable without a
request object.

## Security

The sharp edges are rendering one person's markdown into another person's
browser, and making sure a link nobody was given cannot be found. Both are
covered in the [threat model](docs/architecture.md#threat-model), which maps
each threat to what answers it and says what is deliberately _not_ defended.

Found something? Please report it privately rather than opening an issue.

## Documentation

- [Architecture and threat model](docs/architecture.md)
- [API reference and a curl walkthrough](docs/api.md)
- [Self-hosting](docs/self-hosting.md)
- [Releasing](docs/releasing.md)
- [Decisions](docs/decisions/) — why things are the way they are
- [Roadmap and known limitations](docs/ROADMAP.md)

## Licence

[MIT](LICENSE).
