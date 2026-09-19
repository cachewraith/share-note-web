# 5. API keys: `snw_<prefix>_<secret>`, SHA-256, constant-time compare

- Status: accepted
- Date: 2026-09-20

## Context

The plugin authenticates with a bearer token. Keys must be revocable,
attributable, and never recoverable from the database.

## Decision

Wire format `snw_<8-char prefix>_<43-char secret>`. The secret is 32 bytes from
`randomBytes`, base64url-encoded. The database stores the prefix in clear
(unique, indexed) and `sha256(whole key)` as hex.

Verification: parse the format, look the row up by prefix, then compare digests
with `crypto.timingSafeEqual`.

SHA-256 — a deliberately _fast_ hash — is the right choice here, and this is the
one place where OWASP A04's "never use a fast hash" does not apply. That rule is
about passwords, which are low-entropy and guessable. This key carries 256 bits
of CSPRNG entropy, so there is nothing to brute force; a slow KDF would only add
latency to every request.

## Consequences

- A leaked database yields no usable keys.
- A leaked key can be attributed to a user and revoked by setting `revokedAt`.
- The prefix makes the key greppable in a support conversation without exposing
  the secret.
