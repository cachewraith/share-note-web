# 6. Frontmatter is stripped by the plugin and again by the viewer

- Status: accepted
- Date: 2026-09-20

## Context

Obsidian notes carry YAML frontmatter: tags, dates, private fields, and — after
sharing — `share_id` and `share_url` that the plugin writes back.

`GET /v1/public/shares/:id` returns the raw markdown, so anything left in the
stored note is publicly readable, not merely unrendered.

## Decision

Strip it in two places, for two different reasons:

1. **Plugin, before upload** — so private frontmatter never leaves the vault.
   This is the one that matters. It also keeps the content hash stable when the
   plugin writes `share_id` back into the note, so an immediate re-share is a
   no-op instead of an update.
2. **Viewer, before rendering** — a share can also be created with `curl`, and
   the viewer must not render a stray `---` block as a table.

## Consequences

- Two small implementations of the same 15-line function, in two packages that
  do not otherwise share code. Accepted: hoisting it into `contracts` would put
  markdown processing into a package whose job is the API contract.
- Both are unit-tested against the same awkward cases (no frontmatter, empty
  frontmatter, `---` inside a fenced code block, CRLF).
