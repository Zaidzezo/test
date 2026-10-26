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
