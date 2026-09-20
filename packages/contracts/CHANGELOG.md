# @share-note/contracts

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

## 0.1.0

### Minor Changes

- 4ea921a: First release: share a note from Obsidian to a public link, update it at the
  same URL, unshare it, and view it with syntax highlighting, GFM tables,
  callouts, task lists and image attachments. Self-hosted with Docker.
