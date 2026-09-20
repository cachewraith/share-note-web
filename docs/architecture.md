# Architecture

## What the system does

Someone writes a note in Obsidian and runs "Share note". The plugin sends the
note's markdown to an API, which stores it under an unguessable 21-character id
and returns a URL. Anyone with that URL sees the note rendered in a browser.
Re-sharing replaces the content at the same URL. Unsharing deletes it.

That is the whole product. Everything below exists to make those four verbs
correct, safe and cheap to run.

## The pieces

```
┌──────────────┐   requestUrl    ┌─────────────────────────────┐
│   Obsidian   │ ──────────────► │  apps/api    NestJS/Fastify │
│  apps/plugin │   Bearer key    │                             │
└──────────────┘                 │  controller → service →     │
                                 │       repository / port     │
┌──────────────┐   fetch (SSR)   │                             │
│   Browser    │ ──────────────► │                             │
│              │                 └──────┬──────┬──────┬────────┘
│              │    ┌──────────┐        │      │      │
│              │ ─► │ apps/web │ ───────┘      │      │
└──────────────┘    │ Next.js  │               │      │
       ▲            └──────────┘               │      │
       │                                       ▼      ▼
       │   images                        ┌──────────┐ ┌───────┐
       └────────────────────────────────►│ Postgres │ │ Redis │
                     (/v1/public/assets) └──────────┘ └───────┘
                                                 │
                                          ┌──────▼──────┐
                                          │ S3 / MinIO  │
                                          └─────────────┘
```

`packages/contracts` sits underneath all three: zod schemas, error codes,
limits, id patterns and every route path. The API validates with it, the viewer
parses responses with it, the plugin checks against its zod-free `lite` build.
Nobody hand-writes a URL or an error string.

## Layering in the API

```
controller   HTTP only: bind parameters, call a service, return. No branching.
   ↓
service      Every business rule and every authorization check. No HTTP types.
   ↓
repository   Prisma queries.          port   StoragePort → S3 adapter.
```

The rule that matters is the middle one. `SharesService.findOwnedOrThrow` is the
only place that decides whether a caller may touch a share, and it is reachable
from a unit test with a plain object — no request, no database. Controllers
contain no logic, so there is nowhere else for an authorization check to hide.

Storage sits behind `StoragePort`. The S3 adapter is the only file that imports
the AWS SDK; swapping to a filesystem or GCS backend is one line in
`StorageModule`.

## Request path, end to end

1. **RateLimitGuard** — Redis fixed-window counter, keyed by API-key prefix or
   client IP. Runs first so a flood of bad keys is cheap to refuse.
2. **ApiKeyGuard** — global, so every route needs a key unless it is marked
   `@Public()`. Forgetting the decorator makes a route private.
3. **Validation pipe** — the contract's zod schema for the body, query and
   params. A failure arrives at the filter already shaped as a contract error.
4. **Controller → service → repository.**
5. **AppErrorFilter** — turns anything thrown into
   `{ error: { code, message } }`. Unrecognised failures become
   `INTERNAL_ERROR` with a fixed message; the real one is logged.

## Rendering path

`GET /<id>` on the viewer fetches `GET /v1/public/shares/<id>` server-side, then
runs the markdown through one unified pipeline:

```
remark-parse → remark-gfm → callouts → attachments → wikilinks
  → remark-rehype (allowDangerousHtml: false)
  → table alignment → SANITIZE → code-block decoration → Shiki → stringify
```

Everything that interprets note content runs **before** the sanitizer, so the
sanitizer is the single gate the whole document passes through. Highlighting and
the copy button run after it, which is why Shiki's inline styles and our own
`<button>` need no allowance for note content.

The lookup itself is **not** cached: caching it would mean serving a note after
it was unshared, and Next's `revalidate` is stale-while-revalidate, so the
window outlives its own TTL. The expensive half — markdown to highlighted HTML —
is memoised by content hash instead, so an edit misses the cache by construction
and an unchanged note costs one small database read.

## Data model

| Table      | Key facts                                                                       |
| ---------- | ------------------------------------------------------------------------------- |
| `users`    | UUID, optional email. Created by the CLI; there is no sign-up.                  |
| `api_keys` | `prefix` unique and indexed, `keyHash` = sha-256 of the whole key, `revokedAt`. |
| `shares`   | id is the 21-char public slug, indexed by `(ownerId, createdAt desc)`.          |
| `assets`   | id is a public slug, unique on `(shareId, filename)`, cascades from `shares`.   |

`shares.deletedAt` and `shares.expiresAt` are reserved: unsharing is a hard
delete in v1, but every read already filters both, so soft delete or expiring
links can be added without touching a read path.

---

# Threat model

## What is being protected

1. **Notes that were never shared.** The vault. The plugin sends one note at a
   time, on an explicit command.
2. **Notes that were unshared.** "Unshare" must mean gone, not hidden.
3. **The link itself.** A share URL is a capability: whoever holds it can read
   the note, and nobody else should be able to find it.
4. **API keys.** A key can publish and delete on behalf of its owner.
5. **The reader.** Opening a shared link must not run somebody else's code or
   report the visit to a third party.

## Who the attackers are

|                           | Capability                                          | What they want                                            |
| ------------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| **A passer-by**           | Can request any URL on the server                   | To read notes they were not sent                          |
| **A share author**        | Can put arbitrary markdown and images on the server | To run script in another reader's browser, or beacon them |
| **Another user**          | Has a valid API key                                 | To read, change or delete someone else's shares           |
| **A network observer**    | Sees traffic                                        | To capture an API key or note content                     |
| **An operator's mistake** | Misconfiguration                                    | Anything the above want                                   |

Out of scope: the server operator, who can read the database by definition —
end-to-end encryption is on the roadmap and would change that. Also out of
scope: an attacker with vault access, and denial of service beyond rate limits.

## Threats and what answers them

### An unshared note still being served

Deleting the row is immediate, but a cache in front of it would not be. The
viewer therefore does not cache the lookup, and a regression test pins that
(`src/lib/api/client.test.ts`). An operator who opts into `SHARE_CACHE_SECONDS`
is told in the same breath what it costs.

The attachment endpoint _is_ cached hard — one year, immutable — which is safe
because an asset id is minted per distinct content and the row is deleted with
the share, so the id stops resolving.

### A passer-by enumerating shares — OWASP A01

Share and asset ids are 21 characters from a 64-symbol alphabet, drawn from
`crypto.randomBytes` — about 126 bits. Guessing one is not a strategy.

The public endpoints are rate limited by IP, so grinding is also slow. Ids never
appear in a listing, a sitemap or a log line that leaves the server, and both
the API and the viewer send `X-Robots-Tag: noindex, nofollow`, with the viewer
also sending `Referrer-Policy: no-referrer` so a shared link is not leaked to
sites it links to.

**Residual risk:** a link pasted somewhere public is public. That is inherent to
capability URLs.

### A user reaching another user's shares — OWASP A01

Every mutating route resolves the share through `findOwnedOrThrow`, which
compares `ownerId` to the authenticated principal. There is no route that takes
an owner id from the client.

A share owned by someone else answers `NOT_FOUND`, not `FORBIDDEN`: telling a
caller that an id exists but is not theirs would turn the API into an oracle for
which links are live.

Attachment uploads check ownership of the parent share before touching storage,
and storage keys are built from `shares/<shareId>/<assetId>.<ext>` — ids the
server generated, never the client's filename — so a crafted name cannot reach
another share's objects.

### Script in a shared note — OWASP A05

This is the sharpest edge in the product: rendering one person's markdown into a
page another person opens.

Four independent layers:

1. `remark-rehype` runs with `allowDangerousHtml: false`, so raw HTML in the
   source never becomes an element.
2. `rehype-sanitize` runs over the whole tree, with class names allowlisted _by
   value_ and no `style` attribute permitted at all.
3. Links are limited to `http`, `https` and `mailto`; images to `http` and
   `https`. `javascript:`, `data:` and `vbscript:` destinations are dropped.
4. The viewer's CSP allows scripts only with a per-request nonce, and nothing
   inline.

`src/lib/markdown/render.test.ts` holds 29 XSS cases covering script tags, event
handlers, `<iframe>`, `<object>`, `<style>`, `<form>`, `<base>`, `<meta
http-equiv>`, scheme obfuscation, class and id injection, and smuggling through
a callout title or an image alias.

**Why `style-src` keeps `'unsafe-inline'`:** Shiki colours each token with an
inline style and there is no way to hash them ahead of time. An inline _style_
cannot execute script, and a note cannot emit one anyway — the sanitizer strips
`style` from note content, so the only inline styles on the page are Shiki's,
added after sanitizing.

### A note beaconing its readers

An `<img>` pointing at an attacker's server reports the IP, user-agent and
timing of everyone who opens the link. The pipeline resolves every image against
the share's own attachments and replaces anything unresolved with its alt text,
and `img-src` names only this origin and the API's. See
`docs/decisions/0012-viewer-only-renders-its-own-attachments.md`.

### A malicious upload — OWASP A08

The declared `Content-Type` and the file extension are both attacker-controlled
and neither is trusted. `sniffImageMimeType` reads the magic bytes and accepts
only PNG, JPEG, GIF and WebP; the sniffed type is what gets stored and what is
later sent as `Content-Type`, together with `X-Content-Type-Options: nosniff`.

SVG is refused outright: it is a scripting document, not a raster image, and
serving one from the API's origin would hand an attacker script execution there.

Uploads carry a sha-256 that the object store verifies, so a truncated or
altered body cannot be recorded as stored.

### Stolen API keys — OWASP A04, A07

Only `sha256(key)` is stored, so a database dump yields nothing usable. SHA-256
is deliberately the _fast_ hash here: the key is 256 bits of CSPRNG output, so
there is nothing to brute force, and a slow KDF would only add latency to every
request. (A password would be a different story — see
`docs/decisions/0005-api-key-format-and-hashing.md`.)

Verification looks the key up by prefix and compares digests with
`timingSafeEqual`; a miss still runs a decoy comparison, so response time does
not reveal which prefixes exist. Malformed, unknown, revoked and wrong-secret
all answer the same 401 after the same work.

Keys are revocable (`revokedAt`) and attributable (`lastUsedAt`, `name`). The
plugin refuses to send one over plain `http` to anything but loopback.

**Residual risk:** keys do not expire on their own. Rotating one is
`cli create-key` then `cli revoke-key`.

### Hostile input sizes — OWASP A06

Markdown is capped at 1 MiB measured in UTF-8 bytes (not code units — a
multi-byte payload cannot slip past a length check); attachments at 10 MiB,
enforced by `@fastify/multipart` at the socket so an oversized body is never
buffered; 50 attachments per share; Fastify's own `bodyLimit` sits above the
markdown limit. All are configurable downward, never upward.

Listing is cursor-paginated with a hard maximum, so no query is unbounded.

### The rate limiter itself failing — OWASP A10

If Redis is unreachable the guard **denies** (503) rather than letting requests
through unmetered. A control that fails open stops working exactly when it is
needed. `/health` and `/ready` are exempt, so an orchestrator can still tell a
degraded instance from a dead one.

**Residual risk:** a Redis outage is a full outage, including for readers. That
is a deliberate trade, recorded in
`docs/decisions/0009-rate-limiting-is-ours-and-fails-closed.md`.

### Leaking through responses and logs — OWASP A09

Unrecognised errors answer `INTERNAL_ERROR` with a fixed message; the stack is
logged, never returned. Prisma's `query` log level is off, because it would
write note content to stdout on every write. The exception filter deliberately
does not log request bodies. Nothing logs an API key — only its prefix — and the
public share payload has no owner field, by construction and by test.

OpenAPI docs are refused when `NODE_ENV=production`: the config schema rejects
the combination at boot rather than trusting anyone to remember.

### Supply chain — OWASP A03

Install scripts are blocked by default; the five packages that genuinely need
them are listed in `onlyBuiltDependencies`, and `@scarf/scarf` (telemetry) is
explicitly refused. Every version is pinned exactly in the pnpm catalog and CI
installs with `--frozen-lockfile`. Images are built from pinned base tags and
published with provenance and an SBOM.

The plugin makes no request to anything but the configured server. It has no
telemetry and no analytics.

### Misconfiguration — OWASP A02

Every environment variable is validated by a zod schema at boot, and the process
refuses to start on a bad one, naming the offending variables without echoing
their values. `TRUST_PROXY` defaults to false, because believing
`X-Forwarded-For` without a proxy in front makes rate limiting trivially
bypassable. CORS defaults to allowing no browser origin at all. Helmet sets the
response headers, and the viewer adds its own CSP.

## What is deliberately not defended

- **The operator.** They hold the database and the bucket.
- **A leaked link.** Capability URLs are the design.
- **Volumetric DoS.** Rate limiting handles abuse, not a botnet; put a CDN or a
  WAF in front if that is your threat.
- **Traffic analysis.** Sizes and timings are visible to a network observer even
  over TLS.
