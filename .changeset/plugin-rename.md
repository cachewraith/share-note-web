---
'@share-note/contracts': minor
'@share-note/plugin': minor
'@share-note/api': minor
'@share-note/web': minor
---

Rename the Obsidian plugin to "Self-Hosted Note Share", with the id
`self-hosted-note-share`. The previous name was a character away from the
existing community plugin "Share Note" and would have been confusing to users
and rejected at review.

This changes the folder Obsidian loads the plugin from, so a manual install of
0.1.0 must be moved from `.obsidian/plugins/share-note-web/` to
`.obsidian/plugins/self-hosted-note-share/`.

Also adds the MIT LICENSE file the repository was missing, and points
`authorUrl` at the author rather than at the plugin's own repository.
