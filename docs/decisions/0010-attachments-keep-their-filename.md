# 10. Attachments store the filename the note refers to them by

- Status: accepted
- Date: 2026-09-20

## Context

The viewer has to turn `![[diagram.png]]` into an `<img>` pointing at
`/v1/public/assets/<id>`. Something has to connect the name in the note to the
stored object. The original data model had no field for it.

The alternative was for the plugin to rewrite the markdown to absolute asset
URLs before upload. That would bake this server's hostname into the stored note
and make the content non-portable.

## Decision

Add `filename` to `Asset`, unique per share, and return it in the public share
payload. The viewer resolves embeds against it; the markdown stays as the author
wrote it.

The filename is stored as the note spells it — spaces, accents and all — because
it is matched against the note's own text. It is validated (no control
characters, no path separators, at most 255 characters) and never used to build
a storage key or a filesystem path; keys are derived from ids alone. The
`Content-Disposition` header carries an ASCII-sanitised copy plus the real name
as RFC 5987.

## Consequences

- Attachments are addressed by name within a share, so re-uploading under the
  same name replaces the old one — which is exactly what editing an image in
  the vault should do.
- A note that embeds two different files with the same name in different folders
  would collide. Obsidian discourages that, and the second upload wins.
