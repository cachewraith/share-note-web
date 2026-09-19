# 8. Unshare deletes rows and objects

- Status: accepted
- Date: 2026-09-20

## Context

This is a privacy tool. "Unshare" must mean the content is gone, not flagged.

## Decision

`DELETE /v1/shares/:id` deletes the share row (assets cascade) and then deletes
every object for that share from the bucket. Object deletion happens after the
database commit; a failure there is logged and retried on the next sweep rather
than resurrecting the share.

`Share.deletedAt` and `Share.expiresAt` stay in the schema and are honoured by
every read path, so soft-delete or expiring links can be added later without
touching a single query.

## Consequences

- There is no undo. The plugin says so in its confirmation Notice.
- A crash between the two steps can orphan objects in the bucket. They are
  unreachable (the row that names them is gone) and are cleaned up by the
  `orphaned-assets` CLI command.
