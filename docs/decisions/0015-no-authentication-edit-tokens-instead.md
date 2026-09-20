# 15. The API has no authentication; a per-share edit token guards writes

- Status: accepted
- Date: 2026-09-20
- Supersedes the API-key half of [4](0004-public-ids-are-csprng-nanoids.md)

## Context

Until 0.2.1 the API authenticated every write with an API key. A key belonged
to a user, a user owned their shares, and the service layer compared the
share's `ownerId` against the caller on update, unshare and attachment upload.
Keys were minted by `cli create-user` and pasted into the plugin's settings.

That is a reasonable design for a product where the person installing the
plugin also runs the server. It is a bad one for the product this is becoming:
the owner wants anyone to be able to publish to their server, without being
issued anything first. Requiring a key means either handing keys out by hand or
building registration, email verification and the account surface that follows.

The instruction was explicit: no authentication, anyone can use it, and the
random share id is the thing that protects a note.

## Decision

**No authentication.** `POST /v1/shares` takes no credential. Any client that
can reach the server may publish, and the rate limiter — keyed on the client
address, the only thing an anonymous caller has — is what bounds the cost.

**A per-share capability token for writes.** Creating a share mints
`snt_<32 CSPRNG bytes>`, returns it exactly once in the create response, and
stores only `sha256(token)`. `PUT`, `DELETE` and attachment upload require it
in an `X-Edit-Token` header.

The token exists because the share id cannot do this job. The id is printed in
the link its author hands out; making it the write credential would let every
reader of a note rewrite or delete it. Read access and write access need
different secrets, and only one of them is meant to travel.

The plugin keeps the token in the note's frontmatter, beside `share_id` and
`share_url`. Frontmatter is never uploaded, so publishing a note does not
publish the token that controls it, and copying the note to another vault
carries the ability to update the share with it.

**Listing is gone.** `GET /v1/shares` and `GET /v1/me` were owner-scoped. With
no owner they would have listed every note on the server to anybody who asked,
so both routes were removed rather than reinterpreted.

A wrong token, a missing token and a share that does not exist all answer
`404 NOT_FOUND`, which is the rule the ownership check already followed: a
different answer would tell a caller holding a link whether that id is live.

## Consequences

**What this gives up.** There is no revocation, no per-user accounting, and no
way to enumerate what you have published — the note in your vault is the
record. Anyone who can reach the API can fill the object store; the write rate
limit is the only thing bounding that, and an operator who does not want a
public service has to keep the API off the public internet.

**Losing a token strands a share.** The server cannot reissue what it never
stored, so a note published from a vault that is later lost stays up at its
link with nobody able to take it down through the API. `cli issue-token
--share <id>` mints a replacement for exactly this, and for shares created
before this release, which have no token at all.

**The old tables stay for one release.** `users`, `api_keys` and
`Share.ownerId` are no longer read or written, but dropping them in the same
migration that stops writing them would break the previous release's API during
a rolling deploy (see [releasing](../releasing.md)). The migration only adds
`editTokenHash` and relaxes `ownerId` to nullable; the drop is a later one.

## Alternatives considered

**Leave writes unauthenticated too**, so the share id is the only secret. This
is the most literal reading of the instruction and the smallest diff. Rejected:
it makes every shared link a delete button for whoever receives it, which is
not what "anyone can publish" was asking for.

**Self-service sign-up** — keep keys, add a registration route so nobody has to
be issued one by hand. Rejected by the owner: it is still an account, and it
brings verification, abuse handling and a user table that has to mean
something.
