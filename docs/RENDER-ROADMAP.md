# Phased Render parity implementation

The requested scope is substantially larger than the existing local deployment system. Each phase must ship with actual runtime tests; a menu item or label alone does not count as a capability. No paid plans, fake regions, fake teams or fabricated provider connections.

1. **Core creation and configuration (this change):** atomic first deployment with encrypted runtime variables; .env import; atomic environment save/deploy; Docker language independence; deployment narrative and usable log controls. Audit and regression evidence.
2. **Source and service types:** static publish artifacts/SPA rewrites, existing images, generated runtime Dockerfiles with isolated build configuration, provider/token integration and real branch discovery. Build-time secrets via BuildKit secret mounts, not image layers or plain build arguments. Add worker/private/cron/database types with their own readiness/routing contracts.
3. **Lifecycle and automation:** exact commit checkout, cancel fencing and subprocess/build cleanup, signed idempotent webhooks, deploy hooks, trigger metadata, service-level events, cache controls, server-side persisted log filters and retained metrics.
4. **Identity and infrastructure:** users/sessions, workspaces and roles enforced on every query/stream/action; cross-tenant acceptance tests; rate limits; TLS domains and DNS verification; one-command supported deployment. This must finish before exposing the control plane remotely.
5. **Advanced runtime and interface:** owned disks, multiple replicas/load balancing, optional authenticated shell, PR preview teardown, idle waking, notifications, accessible Render-style information hierarchy and workspace grouping backed by real models.

Known gaps: AUDIT.md. Existing API compatibility is preserved: POST /api/projects without `deploy` still creates only; the dashboard explicitly requests first deployment. No migration is required for phase 1.

## Requested acceptance coverage after phase 1

| # | Coverage | Still required |
| --- | --- | --- |
| 1 | Create Docker web service with encrypted variables and immediate first deployment; real running response tested | Signup, runtime generation and build-time variables |
| 2 | Write-only API, masked saved UI, known-literal log redaction | Authenticated reveal; arbitrary encoded output cannot be guaranteed secret-free |
| 3 | Save and deploy with atomic snapshot and metadata-only activity event | Build-only settings and service-level event history before first deployment |
| 4 | Failing build retains previous live container | Signed push webhook and auto-deploy |
| 5 | Retained-image rollback and original environment | Broader source metadata and manual exact-commit UX |
| 6 | Persisted deployment SSE, text search, displayed-output download, runtime log polling | Server-side time/type/level filtering; runtime log retention independent of containers |
| 7 | Existing interrupted-attempt reconciliation tests | Full process-kill/stalled-lease test, cancellation fencing |
| 8 | Not implemented | Static sites and SPA rewrite |
| 9 | Existing stop/start/delete and owned container/image cleanup | Typed-name deletion, suspended response, volumes/networks lifecycle |
| 10 | Not implemented | Identity, workspace authorization, adversarial cross-tenant tests |
