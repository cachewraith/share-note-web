---
'@share-note/contracts': patch
'@share-note/plugin': patch
'@share-note/api': patch
'@share-note/web': patch
---

Rewrite the README for the people who install the plugin. It now describes what
the plugin does, how to install it from the community list, what each of the
four commands does and what is and is not published — rather than opening on the
monorepo layout, a pnpm quick start and the rendering pipeline. Obsidian shows
this file to anyone considering the plugin, so it was addressing the wrong
reader. The developer and operator material has not gone anywhere; it stays in
`docs/`, which the README links.

Also carries the self-hosting fix from the previous release cycle: `S3_REGION`
is now passed through to the API container, `S3_FORCE_PATH_STYLE` is
configurable, and Cloudflare R2 is documented as a storage backend.
