# API

Base URL: whatever you set as `PUBLIC_API_URL` (the dev stack serves
`http://localhost:3001`). Interactive OpenAPI docs are at `/docs` when
`ENABLE_DOCS=true`; they are refused in production.

Every schema in this document is defined in `packages/contracts` and imported by
the API, the viewer and the plugin. The contract package is the source of truth;
this page explains it.

## Authentication

```
Authorization: Bearer snw_<prefix>_<secret>
```

Keys are created with the CLI and shown once:

```bash
pnpm --filter @share-note/api cli create-user --email you@example.com
```

The server stores only `sha256(key)` and compares digests in constant time. A
leaked database yields no usable keys. Revoke one with
`cli revoke-key --prefix <prefix>`.

The two `/v1/public/...` routes take no key: possession of the 21-character id
is what grants access.

## Errors

Every failure has the same shape and a stable `code`. Branch on `code`; treat
`message` as human-facing text that may change.

```json
{ "error": { "code": "NOT_FOUND", "message": "No such share" } }
```

| Code                     | Status | When                                                                           |
| ------------------------ | ------ | ------------------------------------------------------------------------------ |
| `VALIDATION_FAILED`      | 400    | Malformed body, query or path. Carries a `details` array of `{path, message}`. |
| `UNAUTHORIZED`           | 401    | Missing, malformed, unknown or revoked key. All four look identical.           |
| `FORBIDDEN`              | 403    | Reserved. Cross-owner access answers `NOT_FOUND` instead — see below.          |
| `NOT_FOUND`              | 404    | No such share or attachment, **or** it belongs to somebody else.               |
| `CONFLICT`               | 409    | Reserved.                                                                      |
| `PAYLOAD_TOO_LARGE`      | 413    | Markdown or attachment over this server's configured limit.                    |
| `UNSUPPORTED_MEDIA_TYPE` | 415    | Upload is not a PNG, JPEG, GIF or WebP, or the body was not multipart.         |
| `ASSET_LIMIT_REACHED`    | 422    | The share already has the maximum number of attachments.                       |
| `TOO_MANY_REQUESTS`      | 429    | Rate limit spent. `Retry-After` says when to come back.                        |
| `SERVICE_UNAVAILABLE`    | 503    | A dependency the request needs is down.                                        |
| `INTERNAL_ERROR`         | 500    | Anything unexpected. Details are logged, never returned.                       |

A share that exists but belongs to another user answers `NOT_FOUND`, not
`FORBIDDEN`. Distinguishing them would let anyone probe which ids are live.

## Rate limits

Redis-backed fixed windows, keyed by API-key prefix when one is presented and by
client IP otherwise. Defaults, all configurable:

| Bucket   | Routes                                     | Default      |
| -------- | ------------------------------------------ | ------------ |
| `write`  | `POST`/`PUT`/`DELETE` on shares and assets | 30 / minute  |
| `read`   | `GET /v1/me`, `GET /v1/shares`             | 300 / minute |
| `public` | `/v1/public/...`                           | 120 / minute |
| —        | `/health`, `/ready`                        | exempt       |

Responses carry `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`.
If Redis is unreachable the API answers `503` rather than letting requests
through unmetered.

## Limits

|                      | Default                                              |
| -------------------- | ---------------------------------------------------- |
| Markdown per note    | 1 MiB (UTF-8 bytes)                                  |
| Attachment           | 10 MiB                                               |
| Attachments per note | 50                                                   |
| Title                | 300 characters                                       |
| Accepted image types | `image/png`, `image/jpeg`, `image/gif`, `image/webp` |

The type is decided by the file's magic bytes, not by its extension or its
declared `Content-Type`. SVG is refused: it can carry script.

---

# Walkthrough

Every command below was run against the dev stack. Start it first:

```bash
pnpm dev:up
pnpm --filter @share-note/api build
pnpm --filter @share-note/api start
```

```bash
export API=http://localhost:3001
export KEY=$(pnpm --filter @share-note/api cli create-user --email you@example.com \
  | awk '/key:/ {print $2}')
```

### Is it up?

```bash
curl -s $API/health
# {"status":"ok"}

curl -s $API/ready
# {"status":"ready","checks":{"database":"up","redis":"up","storage":"up"}}
```

`/ready` answers `503` with the same body when a dependency is down.

### Does my key work?

```bash
curl -s $API/v1/me -H "Authorization: Bearer $KEY"
```

```json
{
  "userId": "7c3afbab-d7ab-4a9b-b329-9ebb68353fdb",
  "email": "you@example.com",
  "createdAt": "2026-09-19T19:25:44.318Z",
  "apiKey": { "id": "312ef2ad-...", "name": "obsidian", "prefix": "jcGx1UZF" }
}
```

This is what the plugin's "Test connection" button calls.

### Share a note

```bash
curl -s -X POST $API/v1/shares \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"title":"Walkthrough","markdown":"# Walkthrough\n\n![[pixel.png]]"}'
```

```json
{
  "id": "CHl4zW0zr_0Ta88wYUr2T",
  "url": "http://localhost:3000/CHl4zW0zr_0Ta88wYUr2T",
  "contentHash": "9e8b5cb8f354731cddecdf124d14ae74f8b87bf1cc6e8a78b2f938ccb8959a11"
}
```

`url` is built from `PUBLIC_WEB_URL`. That link is the whole product.

### Update it at the same URL

```bash
export ID=CHl4zW0zr_0Ta88wYUr2T

curl -s -X PUT $API/v1/shares/$ID \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"title":"Walkthrough","markdown":"# Walkthrough\n\n![[pixel.png]]"}'
# {"id":"CHl4...","url":"...","contentHash":"9e8b...","updated":false}
```

`updated:false` means the submitted markdown hashed to what was already stored,
so nothing was written. Send different content and it becomes `true`:

```bash
curl -s -X PUT $API/v1/shares/$ID \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"title":"Walkthrough","markdown":"# Walkthrough\n\nChanged.\n\n![[pixel.png]]"}'
# {"id":"CHl4...","url":"...","contentHash":"7cc1...","updated":true}
```

### Attach an image

```bash
curl -s -X POST $API/v1/shares/$ID/assets \
  -H "Authorization: Bearer $KEY" \
  -F "file=@pixel.png;filename=pixel.png"
```

```json
{
  "id": "zPG8NV9D81JpQFBAredae",
  "url": "http://localhost:3001/v1/public/assets/zPG8NV9D81JpQFBAredae",
  "filename": "pixel.png",
  "mime": "image/png",
  "size": 67,
  "sha256": "ebf4f635a17d10d6eb46ba680b70142419aa3220f228001a036d311a22ee9d2a",
  "created": true
}
```

`filename` is the name the note embeds it under — the viewer resolves
`![[pixel.png]]` against it. Uploading the same bytes under the same name again
answers `"created": false` and does no work, which is how the plugin avoids
re-uploading unchanged attachments. Uploading _different_ bytes under the same
name mints a new id, because asset URLs are served with a one-year immutable
cache.

An SVG is refused whatever it claims to be:

```bash
curl -s -X POST $API/v1/shares/$ID/assets \
  -H "Authorization: Bearer $KEY" \
  -F "file=@evil.svg;filename=logo.png;type=image/png"
# 415 {"error":{"code":"UNSUPPORTED_MEDIA_TYPE","message":"Attachment is not a PNG, JPEG, GIF or WebP image. SVG is not accepted."}}
```

### Read it as the public does

No key:

```bash
curl -s $API/v1/public/shares/$ID
```

```json
{
  "id": "CHl4zW0zr_0Ta88wYUr2T",
  "title": "Walkthrough",
  "markdown": "# Walkthrough\n\nChanged.\n\n![[pixel.png]]",
  "contentHash": "7cc1898b...",
  "createdAt": "2026-09-19T19:27:14.057Z",
  "updatedAt": "2026-09-19T19:27:14.088Z",
  "assets": [
    {
      "id": "zPG8NV9D81JpQFBAredae",
      "url": "http://localhost:3001/v1/public/assets/zPG8NV9D81JpQFBAredae",
      "filename": "pixel.png",
      "mime": "image/png",
      "size": 67,
      "sha256": "ebf4f635..."
    }
  ]
}
```

There is no owner field, by construction.

The attachment streams with the type we sniffed at upload:

```bash
curl -sD - -o /dev/null $API/v1/public/assets/zPG8NV9D81JpQFBAredae
```

```
content-type: image/png
content-length: 67
content-disposition: inline; filename="pixel.png"; filename*=UTF-8''pixel.png
x-content-type-options: nosniff
x-robots-tag: noindex, nofollow
cache-control: public, max-age=31536000, immutable
etag: "ebf4f635a17d10d6eb46ba680b70142419aa3220f228001a036d311a22ee9d2a"
```

### List what I have shared

```bash
curl -s "$API/v1/shares?limit=2" -H "Authorization: Bearer $KEY"
```

```json
{
  "shares": [
    {
      "id": "CHl4zW0zr_0Ta88wYUr2T",
      "url": "http://localhost:3000/CHl4zW0zr_0Ta88wYUr2T",
      "title": "Walkthrough",
      "contentHash": "7cc1898b...",
      "assetCount": 1,
      "createdAt": "2026-09-19T19:27:14.057Z",
      "updatedAt": "2026-09-19T19:27:14.088Z"
    }
  ],
  "nextCursor": "CHl4zW0zr_0Ta88wYUr2T"
}
```

Pass `nextCursor` back as `?cursor=` for the next page. `nextCursor` is `null`
on the last page.

### Unshare

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE $API/v1/shares/$ID \
  -H "Authorization: Bearer $KEY"
# 204

curl -s -o /dev/null -w '%{http_code}\n' $API/v1/public/shares/$ID
# 404
curl -s -o /dev/null -w '%{http_code}\n' $API/v1/public/assets/zPG8NV9D81JpQFBAredae
# 404
```

The row and its objects are gone. There is no undo.

### What somebody else sees

```bash
export OTHER=$(pnpm --filter @share-note/api cli create-user | awk '/key:/ {print $2}')

curl -s -X PUT $API/v1/shares/$ID -H "Authorization: Bearer $OTHER" \
  -H 'Content-Type: application/json' -d '{"title":"hijack","markdown":"x"}'
# {"error":{"code":"NOT_FOUND","message":"No such share"}}

curl -s $API/v1/shares -H "Authorization: Bearer $OTHER"
# {"shares":[],"nextCursor":null}
```

### When the budget runs out

```bash
for i in $(seq 1 34); do
  curl -s -o /dev/null -w '%{http_code} ' -X POST $API/v1/shares \
    -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
    -d '{"title":"rl","markdown":"x"}'
done
# 201 ... 201 429 429 429 ...
```

```
ratelimit-limit: 30
ratelimit-remaining: 0
ratelimit-reset: 11
retry-after: 11

{"error":{"code":"TOO_MANY_REQUESTS","message":"Rate limit exceeded: 30 write requests per 60s"}}
```

## Operator commands

```bash
pnpm --filter @share-note/api cli create-user [--email <address>] [--key-name <name>]
pnpm --filter @share-note/api cli create-key  --email <address> [--key-name <name>]
pnpm --filter @share-note/api cli revoke-key  --prefix <prefix>
pnpm --filter @share-note/api cli prune-assets [--grace-hours 24] [--dry-run]
```

The CLI runs from the compiled output, so build first (`pnpm --filter
@share-note/api build`). `prune-assets` deletes stored objects that no database
row references — see `docs/decisions/0008-unshare-is-a-hard-delete.md`.
