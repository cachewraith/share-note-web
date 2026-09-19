# 12. The viewer renders only the share's own attachments

- Status: accepted
- Date: 2026-09-20

## Context

A shared note can reference an image in three ways: `![[diagram.png]]`,
`![alt](diagram.png)`, or `![alt](https://somewhere-else.example.com/x.png)`.
The first two name an attachment. The third points anywhere.

A note is untrusted input written by one person and opened by another. An
`<img>` at an arbitrary URL is a beacon: whoever controls that host learns the
IP address, user-agent and approximate time of everyone who opens the link.

## Decision

Resolve every image reference against the share's attachment manifest. Anything
that does not resolve is replaced by its alt text.

The viewer's CSP says the same thing a second way: `img-src` names only this
origin and the API's. So the rule is enforced in the markup and again in the
browser.

## Consequences

- A note that links an external image shows the alt text instead. That is
  visible and explainable, where a CSP-blocked image is just a broken icon.
- Embedding an image means attaching it, which is what the plugin does anyway.
- Unresolved `![[Some Note]]` — an embed of another note rather than a file —
  renders as its name. Transcluding notes is out of scope for v1.
