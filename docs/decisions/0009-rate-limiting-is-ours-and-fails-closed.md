# 9. A Redis rate limiter of our own, and it fails closed

- Status: accepted
- Date: 2026-09-20

## Context

Every route needs a budget, stricter on writes. `@nestjs/throttler` is the
obvious choice, but its Redis storage is a separate, single-maintainer package,
and rate limiting is a security control on the path of every request.

## Decision

Write the guard: a fixed-window counter (`INCR` plus `EXPIRE NX`), about 70
lines with unit and integration tests, using the `ioredis` client the app
already has.

Fixed windows let a caller burst up to twice the limit across a window
boundary. That is acceptable for the abuse this exists to stop, and it costs one
round trip instead of the sorted-set bookkeeping a sliding window needs.

Callers are identified by API-key prefix when one is presented, by client IP
otherwise, so two users behind one NAT do not spend each other's budget. The
prefix is not a secret; the key itself never reaches Redis.

**When Redis is unreachable, the guard denies** (503) rather than letting
requests through. A rate limiter that fails open stops working exactly when the
system is under stress, which is when it is needed (OWASP A10). `/health` and
`/ready` are exempt from the budget entirely, so an orchestrator can still tell
a degraded instance from a dead one.

## Consequences

- One fewer third-party package on the request path, and the 429 body is the
  contract's error shape rather than Nest's default.
- A Redis outage is a full outage, including for the public viewer. That is a
  deliberate trade and is called out in the threat model and the roadmap.
- Multiple API instances share the counter, because the counter is in Redis.
