# Self-Hosted Note Share

Share a single Obsidian note as a public link. The note opens in any browser —
formatting, tables, callouts, code highlighting and its images intact — and the
person reading it needs no account, no app and no Obsidian.

```
https://notes.example.com/V1StGXR8_Z5jdHi6B-myT
```

The link points at a server you run. Nothing is sent anywhere else, there is no
telemetry, and unsharing deletes the note from the server for good.

## What it does

- **Share the note you are in** with one command, and get the link on your
  clipboard.
- **Keep the link stable.** Edit the note, run _Update shared note_, and the
  same URL serves the new version. Anyone you already sent it to keeps working.
- **Bring the images along.** Embedded attachments upload with the note and are
  served from your server, not hotlinked from anywhere.
- **Take it down.** _Unshare note_ deletes the note and its images. The link
  stops working immediately.
- **Works on mobile** as well as desktop.

## Install

**From Obsidian** — Settings → Community plugins → Browse → search for
_Self-Hosted Note Share_ → Install, then Enable.

**By hand** — download `main.js`, `manifest.json` and `styles.css` from the
[latest release](https://github.com/cachewraith/share-note-web/releases/latest)
and drop them in `<vault>/.obsidian/plugins/self-hosted-note-share/`.

Obsidian 1.5.0 or newer.

## Setup

Open **Settings → Self-Hosted Note Share** and put in your server's address.
That is the only thing to configure — there is no account and no key. Press
**Test connection** to check the address answers.

Don't have a server yet? [Setting one up](docs/self-hosting.md) is a single
Docker Compose file on any VPS.

There is one option: **Copy link after sharing**, on by default, which puts the
URL on your clipboard the moment a note goes up.

## Commands

Run these from the command palette, or bind them to hotkeys.

| Command                | What it does                                         |
| ---------------------- | ---------------------------------------------------- |
| **Share note**         | Publishes the current note and copies its link.      |
| **Update shared note** | Pushes your edits to the link you already shared.    |
| **Copy share link**    | Puts the note's existing link back on the clipboard. |
| **Unshare note**       | Deletes the note from the server. Asks first.        |

Once a note is shared, the plugin records `share_id`, `share_url` and
`share_token` in its frontmatter, so the note itself remembers where it lives
and holds the one credential that can change it. None of that frontmatter is
ever published.

## Good to know

- **Your frontmatter is never published.** Tags, dates and anything else you
  keep up there stay in the vault. Only the body of the note is uploaded.
- **Only the images you embed are shown.** An image pasted in as an external
  URL renders as its alt text — the viewer will not fetch anything from another
  site on your reader's behalf.
- **Links to other notes (`[[Wikilinks]]`) render as their name.** Sharing a
  note shares that note, not everything it points at.
- **Unsharing is permanent.** There is no trash to restore from.
- **The note is what can edit the share.** Delete the note, or strip its
  frontmatter, and the published page stays up with no way to change or remove
  it from Obsidian — the server keeps only a digest of the token and cannot
  hand it back. Whoever runs the server can mint a new one.
- **A link is unguessable, not secret.** Each one carries 126 bits of entropy,
  so nobody will stumble onto it — but anyone you give it to can pass it on.

## Your server

The plugin is one half of the project. The other half is the server it
publishes to: an API and a viewer you run yourself, on your own domain, with
your own storage.

- [Setting up a server](docs/self-hosting.md) — Docker Compose, TLS, backups
- [Architecture and threat model](docs/architecture.md)
- [API reference](docs/api.md)
- [Roadmap and known limitations](docs/ROADMAP.md)

Found a security problem? Please report it privately rather than opening an
issue.

## Licence

[MIT](LICENSE).
