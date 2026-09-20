# Self-hosting

You need a machine with Docker, a domain, and something that terminates TLS.
Everything is one compose file.

## What you are running

| Container  | What it is                                                          |
| ---------- | ------------------------------------------------------------------- |
| `web`      | The viewer. Serves `https://notes.example.com/<id>`.                |
| `api`      | The API the plugin talks to, and where attachments are served from. |
| `migrate`  | A one-shot job that applies database migrations, then exits.        |
| `postgres` | Notes and metadata.                                                 |
| `redis`    | Rate-limit counters. Nothing durable.                               |
| `minio`    | Attachment storage. Replace with S3, R2 or Garage if you prefer.    |

## Set it up

```bash
curl -O https://raw.githubusercontent.com/cachewraith/share-note-web/main/docker-compose.prod.example.yml
curl -O https://raw.githubusercontent.com/cachewraith/share-note-web/main/.env.prod.example

mv docker-compose.prod.example.yml docker-compose.yml
mv .env.prod.example .env
```

Edit `.env`. The three that matter:

```bash
PUBLIC_WEB_URL=https://notes.example.com      # where share links point
PUBLIC_API_URL=https://notes-api.example.com  # where attachments are served
POSTGRES_PASSWORD=...                         # generate it, do not invent it
S3_SECRET_ACCESS_KEY=...
```

```bash
openssl rand -base64 33   # a reasonable way to produce each secret
```

Then:

```bash
docker compose up -d
docker compose logs -f api
```

`api` waits for `migrate` to finish, so the first start applies the schema.

## Put TLS in front

The compose file does not terminate TLS, and it publishes nothing to the host.
Both services must be reachable over https, because the API key travels in an
`Authorization` header.

Caddy is the shortest path:

```caddyfile
notes.example.com {
    reverse_proxy web:3000
}

notes-api.example.com {
    reverse_proxy api:3001
}
```

If your proxy sets `X-Forwarded-For`, and **only** then, set `TRUST_PROXY=true`.
Rate limiting keys on the client IP; believing a header that anything can send
would make it bypassable.

> Serving both from one hostname works too — route `/v1/*` to `api` and
> everything else to `web`, and set both public URLs to that hostname. The
> viewer's CSP is built from `PUBLIC_API_URL`, so it follows automatically.

## Create a user and a key

```bash
docker compose exec api node dist/cli/main.js create-user --email you@example.com
```

The key is printed once. Paste it, and `https://notes-api.example.com`, into the
plugin's settings and press "Test connection".

Other commands:

```bash
docker compose exec api node dist/cli/main.js create-key --email you@example.com
docker compose exec api node dist/cli/main.js revoke-key --prefix aBcD1234
docker compose exec api node dist/cli/main.js prune-assets --dry-run
```

## Upgrading

```bash
# Edit docker-compose.yml to the new tag, then:
docker compose pull
docker compose run --rm migrate
docker compose up -d
```

Migrations are backward compatible for one release, so the old API keeps working
against the new schema while containers roll over. Never skip more than one
minor version without reading its changelog.

## Backups

Two things hold state:

```bash
# Database
docker compose exec -T postgres pg_dump -U share_note share_note | gzip > notes-$(date +%F).sql.gz

# Attachments
docker compose exec -T minio mc mirror --overwrite local/share-note /backup/share-note
```

Restore the database _before_ the bucket: a share row pointing at a missing
object serves a broken image, while an object with no row is harmless garbage
that `prune-assets` collects.

Redis needs no backup. It holds rate-limit counters and nothing else.

## Housekeeping

An upload that stored its bytes and then failed, or an unshare whose bucket call
failed, leaves an object nothing references. They are unreachable, but they cost
disk:

```bash
docker compose exec api node dist/cli/main.js prune-assets --dry-run
docker compose exec api node dist/cli/main.js prune-assets
```

Worth a monthly cron entry. Objects younger than 24 hours are always spared, so
it cannot race an upload in flight.

## Configuration

Every variable is validated at boot; the container refuses to start on a bad
one and says which. The full list is in `apps/api/.env.example` and
`apps/web/.env.example`. The ones worth knowing:

| Variable                | Default  | Why you would change it                                                                                  |
| ----------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `MARKDOWN_MAX_BYTES`    | 1048576  | Lower it. It cannot be raised above the protocol limit.                                                  |
| `ASSET_MAX_BYTES`       | 10485760 | Lower it if disk is tight.                                                                               |
| `ASSETS_PER_SHARE_MAX`  | 50       | Lower it.                                                                                                |
| `RATE_LIMIT_WRITE_MAX`  | 30/min   | Raise for a busy team, lower for a public server.                                                        |
| `RATE_LIMIT_PUBLIC_MAX` | 600/min  | Shared by every reader: the viewer calls the API from one address.                                       |
| `SHARE_CACHE_SECONDS`   | 0        | Above 0 the viewer caches lookups, and keeps serving unshared notes for longer than the number suggests. |
| `ENABLE_DOCS`           | false    | Serves OpenAPI at `/docs`. Refused in production.                                                        |
| `TRUST_PROXY`           | false    | Only with a proxy that overwrites `X-Forwarded-For`.                                                     |

## Using S3 instead of MinIO

Delete the `minio` and `minio-init` services, the `minio` entry under the API's
`depends_on`, and the `minio-data` volume. Then point the API at your bucket:

```bash
S3_ENDPOINT=https://s3.eu-west-1.amazonaws.com
S3_REGION=eu-west-1
S3_BUCKET=my-share-note
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=false
```

Set `S3_FORCE_PATH_STYLE=false` for AWS itself; leave it `true` for MinIO,
Garage and most self-hosted gateways. **Keep the bucket private** — attachments
are served through the API, which is what applies the correct `Content-Type` and
`nosniff`. A public bucket would bypass that.

The bucket is not created for you. Only the bundled `minio-init` job does that;
with an external provider, create it yourself before the first upload.

### Cloudflare R2

```bash
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=share-note
S3_FORCE_PATH_STYLE=true
```

The endpoint is account-scoped and carries no bucket name; R2 has no regions,
so its SigV4 region is the literal string `auto`. Give the API token
**Object Read & Write** on that one bucket, not account-wide access.

If you enabled R2's public `https://pub-<hash>.r2.dev` URL, turn it off. Nothing
in this project uses it, and it serves your attachments around the API — which
is what sets `Content-Type` and `nosniff`, and what enforces that an attachment
is only readable through the share it belongs to.

## Health

```bash
curl https://notes-api.example.com/health   # process is alive
curl https://notes-api.example.com/ready    # database, redis and bucket all up
```

`/ready` answers 503 with a per-dependency breakdown when something is down.
Both are exempt from rate limiting, so monitoring cannot lock itself out.

## A note on rate limits and the viewer

The viewer renders on the server, so its calls to `/v1/public/shares/:id` all
come from one address — the `web` container's. The `public` bucket therefore
bounds **total page views per minute across the whole site**, not per reader.
`RATE_LIMIT_PUBLIC_MAX` defaults to 600/minute for that reason.

If you want per-reader limiting, do it at the proxy in front of `web`, where
each reader's own address is visible. The API's public bucket is there to stop
resource abuse; it is not what makes links unguessable — 126 bits of entropy
is.

## Running it locally instead

```bash
pnpm install
pnpm dev:up
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @share-note/api build
pnpm --filter @share-note/api cli create-user --email you@example.com
pnpm --filter @share-note/api dev
pnpm --filter @share-note/web dev
```

If something already listens on 5432, 6379 or 9000, put overrides in a root
`.env` (`POSTGRES_PORT`, `REDIS_PORT`, `MINIO_PORT`) and point
`apps/api/.env` at the same numbers.

To run the integration tests against that stack:

```bash
export TEST_DATABASE_URL="postgresql://share_note:share_note@localhost:5432/share_note?schema=public"
export TEST_REDIS_URL="redis://localhost:6379"
export TEST_S3_ENDPOINT="http://localhost:9000"
pnpm --filter @share-note/api test:integration
```
