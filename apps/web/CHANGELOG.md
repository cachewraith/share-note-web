# @share-note/web

## 0.3.0

### Minor Changes

- 771d45e: Remove authentication. The API no longer has accounts or API keys: anyone who
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

### Patch Changes

- Updated dependencies [771d45e]
  - @share-note/contracts@0.3.0

## 0.2.1

### Patch Changes

- 15c3ee6: Rewrite the README for the people who install the plugin. It now describes what
  the plugin does, how to install it from the community list, what each of the
  four commands does and what is and is not published — rather than opening on the
  monorepo layout, a pnpm quick start and the rendering pipeline. Obsidian shows
  this file to anyone considering the plugin, so it was addressing the wrong
  reader. The developer and operator material has not gone anywhere; it stays in
  `docs/`, which the README links.
  
  Also carries the self-hosting fix from the previous release cycle: `S3_REGION`
  is now passed through to the API container, `S3_FORCE_PATH_STYLE` is
  configurable, and Cloudflare R2 is documented as a storage backend.
- Updated dependencies [15c3ee6]
  - @share-note/contracts@0.2.1

## 0.2.0

### Minor Changes

- 10a8834: Rename the Obsidian plugin to "Self-Hosted Note Share", with the id
  `self-hosted-note-share`. The previous name was a character away from the
  existing community plugin "Share Note" and would have been confusing to users
  and rejected at review.
  
  This changes the folder Obsidian loads the plugin from, so a manual install of
  0.1.0 must be moved from `.obsidian/plugins/share-note-web/` to
  `.obsidian/plugins/self-hosted-note-share/`.
  
  Also adds the MIT LICENSE file the repository was missing, and points
  `authorUrl` at the author rather than at the plugin's own repository.

### Patch Changes

- Updated dependencies [10a8834]
  - @share-note/contracts@0.2.0

## 0.1.0

### Minor Changes

- 4ea921a: First release: share a note from Obsidian to a public link, update it at the
  same URL, unshare it, and view it with syntax highlighting, GFM tables,
  callouts, task lists and image attachments. Self-hosted with Docker.

### Patch Changes

- Updated dependencies [4ea921a]
  - @share-note/contracts@0.1.0
