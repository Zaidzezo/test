# Changelog

## Service sources — phase 2A

- Added static publication with publish-directory validation, SPA rewrites, MIME/cache headers, dotfile/traversal denial and real Docker serving.
- Added generated Node builds and public image releases, optional root/Dockerfile paths and real Git branch discovery.
- Added immutable build/source snapshots and additive database migration; rollback reuses the original built release and settings.
- Added BuildKit-mounted environment variables for builds without plaintext build arguments; caches are bypassed for configured variables.
- Container PORT is injected from the configured port. Service listings/settings now reflect actual types and source choices.


## Render parity — phase 1

- Service creation can atomically save encrypted runtime variables and reserve the first deployment, then navigate directly to streaming deployment logs.
- Shared bounded validation rejects duplicate/reserved keys; .env import handles comments, quotes, multiline and empty values without evaluating shell expressions.
- Environment changes can save only or save and deploy through a row-locked transaction. A busy service rejects the entire update. Rollback still uses the retained release's encrypted snapshot.
- Docker repositories no longer need package.json; deployment logs report real clone, build, readiness and promotion stages.
- Log viewer adds text search, downloaded displayed output, pause-on-scroll and jump to latest; copy errors are visible.
- SSE advertises the actual allowed request origin. Audit and explicit phased parity roadmap added.

## v2

Stable local routing, encrypted runtime variables, retained-image rollback, background health checks, optional application sharing, and service dashboard redesign.
