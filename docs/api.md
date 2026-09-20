# API

Base URL: whatever you set as `PUBLIC_API_URL` (the dev stack serves
`http://localhost:3001`). Interactive OpenAPI docs are at `/docs` when
`ENABLE_DOCS=true`; they are refused in production.

Every schema in this document is defined in `packages/contracts` and imported by
the API, the viewer and the plugin. The contract package is the source of truth;
this page explains it.

## Authentication

There is none. No accounts, no API keys, no sign-up: any client that can reach
the server may publish a note (see
[decision 15](decisions/0015-no-authentication-edit-tokens-instead.md)).

What is protected is _changing_ a note that already exists. Creating a share
returns an edit token:

```
X-Edit-Token: snt_<secret>
```

`PUT /v1/shares/:id`, `DELETE /v1/shares/:id` and `POST /v1/shares/:id/assets`
require it. The token is returned exactly once, in the create response, and the
server stores only `sha256(token)`, compared in constant time — a leaked
database yields no usable tokens, and no route ever echoes one back.

The share's id cannot serve as this credential: it travels in the link its
author hands out, so anyone holding the link could otherwise rewrite or delete
the note behind it.

**A lost token cannot be recovered.** The share stays published at its link and
can no longer be changed through the API. `cli issue-token --share <id>` mints
a replacement, which also invalidates the old one.

The `/v1/public/...` routes need no token at all: possession of the
21-character id is what grants read access.

## Errors

Every failure has the same shape and a stable `code`. Branch on `code`; treat
`message` as human-facing text that may change.

```json
{ "error": { "code": "NOT_FOUND", "message": "No such share" } }
```

| Code                     | Status | When                                                                           |
| ------------------------ | ------ | ------------------------------------------------------------------------------ |
| `VALIDATION_FAILED`      | 400    | Malformed body, query or path. Carries a `details` array of `{path, message}`. |
| `UNAUTHORIZED`           | 401    | Reserved. Nothing authenticates, so no route answers this.                     |
| `FORBIDDEN`              | 403    | Reserved. A wrong edit token answers `NOT_FOUND` instead — see below.          |
| `NOT_FOUND`              | 404    | No such share or attachment, **or** the edit token does not match it.          |
| `CONFLICT`               | 409    | Reserved.                                                                      |
| `PAYLOAD_TOO_LARGE`      | 413    | Markdown or attachment over this server's configured limit.                    |
| `UNSUPPORTED_MEDIA_TYPE` | 415    | Upload is not a PNG, JPEG, GIF or WebP, or the body was not multipart.         |
| `ASSET_LIMIT_REACHED`    | 422    | The share already has the maximum number of attachments.                       |
| `TOO_MANY_REQUESTS`      | 429    | Rate limit spent. `Retry-After` says when to come back.                        |
| `SERVICE_UNAVAILABLE`    | 503    | A dependency the request needs is down.                                        |
| `INTERNAL_ERROR`         | 500    | Anything unexpected. Details are logged, never returned.                       |

A share that exists but was presented the wrong edit token — or none — answers
`NOT_FOUND`, not `FORBIDDEN`. Distinguishing them would tell a caller holding a
public link whether that id is live and merely locked.

## Rate limits

Redis-backed fixed windows, keyed on the client address. Every caller is
anonymous, so there is nothing else to key on; an edit token would be the wrong
choice, since a caller could mint a fresh one by publishing a new share.
Defaults, all configurable:

| Bucket   | Routes                                     | Default      |
| -------- | ------------------------------------------ | ------------ |
| `write`  | `POST`/`PUT`/`DELETE` on shares and assets | 30 / minute  |
| `public` | `/v1/public/...`                           | 600 / minute |
| —        | `/health`, `/ready`                        | exempt       |

A route that declares no bucket draws from `write`, the strictest, so a new one
is limited even if somebody forgets the decorator.

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
```

Nothing to authenticate with: that is the whole setup.

### Is it up?

```bash
curl -s $API/health
# {"status":"ok"}

curl -s $API/ready
# {"status":"ready","checks":{"database":"up","redis":"up","storage":"up"}}
```

`/ready` answers `503` with the same body when a dependency is down.

`/ready` is what the plugin's "Test connection" button calls: with no key to
verify, the most a client can establish is that the address answers and is a
note-share server with its dependencies up.

### Share a note

```bash
curl -s -X POST $API/v1/shares \
  -H 'Content-Type: application/json' \
  -d '{"title":"Walkthrough","markdown":"# Walkthrough\n\n![[pixel.png]]"}'
```

```json
{
  "id": "CHl4zW0zr_0Ta88wYUr2T",
  "url": "http://localhost:3000/CHl4zW0zr_0Ta88wYUr2T",
  "contentHash": "9e8b5cb8f354731cddecdf124d14ae74f8b87bf1cc6e8a78b2f938ccb8959a11",
  "editToken": "snt_vHrqX-ZxatMXDa2CCDJfUu_uobAFrjp8Jl8UGAuNl3s"
}
```

No credential was sent. `url` is built from `PUBLIC_WEB_URL` and is the whole
product; `editToken` is the only copy there will ever be, and everything below
that changes this share presents it.

### Update it at the same URL

```bash
export ID=CHl4zW0zr_0Ta88wYUr2T
export TOKEN=snt_vHrqX-ZxatMXDa2CCDJfUu_uobAFrjp8Jl8UGAuNl3s

curl -s -X PUT $API/v1/shares/$ID \
  -H "X-Edit-Token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Walkthrough","markdown":"# Walkthrough\n\n![[pixel.png]]"}'
# {"id":"CHl4...","url":"...","contentHash":"9e8b...","updated":false}
```

`updated:false` means the submitted markdown hashed to what was already stored,
so nothing was written. Send different content and it becomes `true`:

```bash
curl -s -X PUT $API/v1/shares/$ID \
  -H "X-Edit-Token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Walkthrough","markdown":"# Walkthrough\n\nChanged.\n\n![[pixel.png]]"}'
# {"id":"CHl4...","url":"...","contentHash":"7cc1...","updated":true}
```

### Attach an image

```bash
curl -s -X POST $API/v1/shares/$ID/assets \
  -H "X-Edit-Token: $TOKEN" \
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
  -H "X-Edit-Token: $TOKEN" \
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

### Unshare

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE $API/v1/shares/$ID \
  -H "X-Edit-Token: $TOKEN"
# 204

curl -s -o /dev/null -w '%{http_code}\n' $API/v1/public/shares/$ID
# 404
curl -s -o /dev/null -w '%{http_code}\n' $API/v1/public/assets/zPG8NV9D81JpQFBAredae
# 404
```

The row and its objects are gone. There is no undo.

### What somebody holding only the link can do

Read it, and nothing else. Without the edit token, a write to a live share is
indistinguishable from a write to one that never existed:

```bash
curl -s -X PUT $API/v1/shares/$ID \
  -H 'Content-Type: application/json' -d '{"title":"hijack","markdown":"x"}'
# {"error":{"code":"NOT_FOUND","message":"No such share"}}

curl -s -X PUT $API/v1/shares/$ID -H "X-Edit-Token: snt_$(head -c 32 /dev/urandom | base64 | tr '+/' '-_' | head -c 43)" \
  -H 'Content-Type: application/json' -d '{"title":"hijack","markdown":"x"}'
# {"error":{"code":"NOT_FOUND","message":"No such share"}}
```

### When the budget runs out

```bash
for i in $(seq 1 34); do
  curl -s -o /dev/null -w '%{http_code} ' -X POST $API/v1/shares \
    -H 'Content-Type: application/json' \
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
pnpm --filter @share-note/api cli issue-token  --share <id>
pnpm --filter @share-note/api cli prune-assets [--grace-hours 24] [--dry-run]
```

`issue-token` mints a new edit token for an existing share and invalidates the
one it had. It is the way back for a share whose token was lost with the note
that held it, and for shares published before edit tokens existed.

The CLI runs from the compiled output, so build first (`pnpm --filter
@share-note/api build`). `prune-assets` deletes stored objects that no database
row references — see `docs/decisions/0008-unshare-is-a-hard-delete.md`.
