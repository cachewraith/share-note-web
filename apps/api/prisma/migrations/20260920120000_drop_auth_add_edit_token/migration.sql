-- The API no longer authenticates. A share is written with an edit token
-- instead of an owner: the token is returned once when the share is created
-- and only its hash is kept here.
--
-- Additive and nullable on purpose. The previous release's API is still
-- serving while this runs and during the container rollover that follows, and
-- it writes "ownerId" on every insert — so the column keeps existing and only
-- loses its NOT NULL. "users", "api_keys" and "ownerId" itself are dropped one
-- release later, per docs/releasing.md.
--
-- Shares that predate this migration have a NULL "editTokenHash". They stay
-- readable at their existing links and cannot be updated or unshared through
-- the API until `cli issue-token` mints a token for them.

ALTER TABLE "shares" ADD COLUMN "editTokenHash" CHAR(64);
ALTER TABLE "shares" ALTER COLUMN "ownerId" DROP NOT NULL;
