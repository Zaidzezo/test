# DeployGrid v2 outcome

- [x] Independent checkout cleanup, retryable log batches, isolated reconciliation errors and persisted Docker cleanup retries.
- [x] AES-256-GCM write-only environment variables and immutable encrypted deployment snapshots, with an idempotent local key setup command.
- [x] Retained-image rollback through reservations, ownership verification, candidate readiness and atomic promotion.
- [x] Stable loopback application gateway with HTTP path/query/stream and upgrade forwarding.
- [x] Background health checks, desired running state, consecutive-failure handling, recovery events and health history independent of dashboard polling.
- [x] Opt-in real cloudflared process management and application-only routing, explicit public confirmation and accurate missing-binary/network errors.
- [x] Render-inspired service-oriented frontend with searchable/filterable workspace table, grid/list controls, service navigation, environment/networking/health panels, real metrics, activity feed and native confirmation dialogs.
- [x] Compatible additive migration, existing data/key preservation checks, source formatting, Windows upgrade instructions and evidence documentation.
- [x] Frozen dependency installation; 36 unit tests; 13 actual API/PostgreSQL/Docker/gateway tests; 2 Chromium browser tests; type checking, ESLint and production build.
- [ ] Real public tunnel connection: attempted and blocked by the runner's native DNS restrictions; not reported as passed. Default suite skips this opt-in external test.
- [ ] Windows/macOS certification, multi-worker/parallel-build validation and full process-kill/stalled-lease acceptance tests remain limitations.

Implemented scope is the six-item roadmap accepted in chat. GitHub webhooks, cancellation, persistent application volumes, retention controls, backup and remote-management authentication remain separate work. See docs/VERIFICATION.md for precise test evidence and docs/LIMITATIONS.md for operational boundaries.

# Render parity expansion

User authorized a phased implementation on 2026-10-28. See docs/RENDER-ROADMAP.md for dependencies and AUDIT.md for findings. Current phase addresses atomic first deployment/configuration and log usability. Later phases remain open; do not describe this as full Render parity or multi-tenant hosting.

Phase 1 validation: 44 unit tests, 15 real integration tests (one optional public-sharing test skipped), two real Chromium scenarios; production build, final typecheck and lint passed. No full Render parity or tenant isolation is claimed.

Phase 1 launcher verified end to end against the existing local database. The normal development stack is running via pnpm local.

# Phase 2A — service sources

Implement static sites, native Node builds, public image sources, root/Dockerfile settings, real branch discovery, BuildKit variables and immutable build snapshots. Verify static SPA behavior, build secrecy, symlink rejection, failure preservation, rollback/deletion and browser creation. Follow-on phase 2B (worker/private/cron/database types and provider integration) and phases 3–5 remain open. No auth/CDN/TLS claims.

Phase 2A evidence: 64 unit tests, 20 integration tests (one optional tunnel skipped), three Chromium scenarios; type checking, lint and production build passed. Existing database migration preserved data/key, and normal production startup reported all four infrastructure components healthy. Native permissions, source switching, select labels, failed image cleanup and multiline redaction were corrected during verification.

Normal production worker public-source smoke passed against GitHub main (6ca95d8), including branch API, static build, SPA gateway route and service cleanup. Phase 2B begins with real background worker lifecycles; private/cron/database types remain separate pending work.
