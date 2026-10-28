# Changelog

## Render parity — phase 1

- Service creation can atomically save encrypted runtime variables and reserve the first deployment, then navigate directly to streaming deployment logs.
- Shared bounded validation rejects duplicate/reserved keys; .env import handles comments, quotes, multiline and empty values without evaluating shell expressions.
- Environment changes can save only or save and deploy through a row-locked transaction. A busy service rejects the entire update. Rollback still uses the retained release's encrypted snapshot.
- Docker repositories no longer need package.json; deployment logs report real clone, build, readiness and promotion stages.
- Log viewer adds text search, downloaded displayed output, pause-on-scroll and jump to latest; copy errors are visible.
- SSE advertises the actual allowed request origin. Audit and explicit phased parity roadmap added.

## v2

Stable local routing, encrypted runtime variables, retained-image rollback, background health checks, optional application sharing, and service dashboard redesign.
