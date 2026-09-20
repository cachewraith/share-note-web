---
'@share-note/contracts': minor
'@share-note/plugin': minor
'@share-note/api': minor
'@share-note/web': minor
---

Remove authentication. The API no longer has accounts or API keys: anyone who
can reach it may publish a note, and the plugin needs nothing but a server
address. `cli create-user`, `cli create-key` and `cli revoke-key` are gone, as
are `GET /v1/me` and `GET /v1/shares` — the latter was owner-scoped and would
otherwise have listed every note on the server to anybody who asked.

Changing an existing share now needs that share's **edit token**, returned once
when it is created and presented in an `X-Edit-Token` header on update,
unshare and attachment upload. The share id cannot do this job: it travels in
the link its author hands out, so without a second secret every reader of a
note could rewrite or delete it. The plugin keeps the token in the note's
frontmatter as `share_token`, which is never uploaded.

**Upgrading.** Shares created before this release have no token and cannot be
updated or unshared through the API until an operator runs
`cli issue-token --share <id>`, which also rescues a share whose token was lost
with the note that held it. The migration is additive — it adds
`editTokenHash` and relaxes `ownerId` to nullable — so the previous release's
API keeps working against the new schema during a rollover; `users`, `api_keys`
and `ownerId` are dropped one release later.

Anyone who can reach the API can now publish to it. The write rate limit, keyed
on the client address, bounds how fast rather than who, so a server not meant
for the public should not be on the public internet. See
`docs/decisions/0015-no-authentication-edit-tokens-instead.md`.
