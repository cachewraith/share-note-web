# 14. Migrations run as a job, not inside the API process

- Status: accepted
- Date: 2026-09-20

## Context

The brief asks for migrations to run automatically when the API container
starts, configurably. The straightforward reading — shell out to
`prisma migrate deploy` during bootstrap — has two problems in practice.

**Size.** The Prisma CLI is not a small tool. Putting it in the serving image
pulls in Prisma Studio, pglite, `effect`, `mysql2`, `postgres` and TypeScript:
763 MB for the API image, of which over 200 MB is machinery a request never
touches. That image is pulled by every replica on every deploy.

**Concurrency.** With more than one replica, every one of them runs
`migrate deploy` against the same database at the same time on a rollout.
Prisma takes an advisory lock so this is not a corruption risk, but it does
mean N processes racing, N ways for a rollout to stall, and a migration failure
surfacing as a crash-looping API rather than a failed deploy step.

## Decision

Two images from `apps/api/Dockerfile`:

- `--target runtime` — the API. `pnpm deploy --prod --no-optional` leaves the
  CLI out entirely. 445 MB.
- `--target migrate` — installs only the Prisma CLI, at the version read from
  the workspace catalog so it cannot drift from the client, and runs
  `prisma migrate deploy`. It runs to completion and exits.

Compose starts `migrate` first and gates the API on
`service_completed_successfully`. In Kubernetes it would be an init container
or a Job.

`RUN_MIGRATIONS_ON_START` still exists and still works where the CLI is present
— local development, or anyone who builds their own image with it. In the
published image it fails fast with a message naming the migrate image, rather
than crashing obscurely.

Reimplementing `migrate deploy` against `_prisma_migrations` was considered and
rejected: schema changes are the one place to use the vendor's own tool, and a
homegrown runner that disagrees with `prisma migrate dev` about a checksum is a
bad morning.

## Consequences

- The serving image is 42% smaller and contains no build tooling.
- A migration failure stops the deploy before any new API starts, instead of
  crash-looping.
- There is a third image to publish and pin. The release workflow builds all
  three from a matrix, and the prod compose example pins them together.
- Upgrades are `docker compose pull && docker compose run --rm migrate &&
docker compose up -d`, which is documented in `docs/self-hosting.md`.
