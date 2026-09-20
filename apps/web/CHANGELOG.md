# @share-note/web

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
