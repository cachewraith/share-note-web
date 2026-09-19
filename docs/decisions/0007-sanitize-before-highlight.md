# 7. Sanitize before highlighting; CSP nonce on the viewer

- Status: accepted
- Date: 2026-09-20

## Context

Shared markdown is untrusted input rendered into a page on our own origin. Two
constraints pull against each other: `rehype-sanitize` must see the tree before
anything trusts it, and Shiki emits `<span style="color:…">` that the sanitizer
would otherwise strip.

## Decision

Pipeline order: `remark-parse` → `remark-gfm` → our Obsidian plugins →
`remark-rehype` (with `allowDangerousHtml: false`) → `rehype-sanitize` →
`@shikijs/rehype` → `rehype-stringify`.

Raw HTML in the source never becomes HTML: `remark-rehype` drops it, and the
sanitizer is the second line of defence rather than the only one. Highlighting
runs after the tree is already trusted, so its output needs no allowance in the
sanitize schema.

CSP is set from middleware with a per-request nonce for scripts. `style-src`
keeps `'unsafe-inline'` because Shiki's per-token colours are inline styles;
inline _styles_ cannot execute script, and `script-src` stays nonce-only.

## Consequences

- Every custom transform (callouts, wikilinks, embeds) runs _before_ the
  sanitizer and must therefore produce only elements the schema allows. The
  schema extension is explicit and tested.
- Pages render per request rather than being served from the full-route cache;
  the expensive part (fetch plus markdown render) is cached by content hash.
