# Service sources phase 2A verification — 2026-10-28

- `pnpm typecheck` and `pnpm lint`: passed. Final frontend changes were linted and type-checked in the production web build.
- `pnpm test`: **64 passed**, including path/image boundaries, real symlink containment, source configuration requirements, import/encryption and multiline literal redaction.
- `pnpm test:integration`: **20 passed, one optional public-tunnel test skipped** (509.83 seconds), against a fresh isolated PostgreSQL database and queue. Actual Git, Docker, HTTP, database and Redis operations. All three migrations applied. No fixtures populated the normal workspace.
- Five new source scenarios cover static build variables/SPA/assets/HEAD/method rejection, secret absence from image metadata/history/runtime mount, configuration-preserving rollback and owned-resource deletion; native Node auto-detection with build/runtime variables and PORT=10000; failed-build preservation and host-command isolation; traversal/symlink rejection; public image execution with source ownership preserved; and sanitized missing-folder errors. Some checks share a scenario.
- `pnpm build`: all packages and production frontend passed. Final web bundle rebuilt after accessible labels and source-form validation fixes. Existing nonfatal Next ESLint-plugin warning remains.
- `pnpm test:browser`: **3 passed** (3.1 minutes). Existing release/configuration/rollback/health/runtime flows remain covered. New scenario switches from an invalid image draft to Static Site, builds real assets with variables, opens the SPA URL in Chromium, checks type filters and persisted settings, and checks the create form at mobile width. No page errors in successful scenarios.
- New screenshots inspected: `screenshots/phase2-static-create.png` and `screenshots/phase2-static-live.png`. The live screenshot is a real container response; the create image is an unsubmitted form.
- Additive migration applied successfully to the existing local database without resetting data or changing the key. Normal `pnpm start` launched all processes; diagnostics returned database/redis/docker/worker=true and dashboard HTTP 200.

## Issues found while executing this phase

Native source files inherited restrictive clone permissions, so the generated non-root runtime initially failed to read server.mjs. The generated image now changes application ownership before switching users; native deployment passed afterwards. Source switching now discards inactive fields from the submitted payload, and new selects have explicit accessible names.

Parallel frontend builds and Docker scenarios overwhelmed this shared runner. The three-release static scenario initially hit 240/360-second test deadlines. Heavy verification was then sequenced, and that scenario passed in 110.2 seconds; its test budget is 600 seconds while product build/readiness timeouts are unchanged. A fresh run also verified owned failed-image cleanup after an earlier long-running test process had cached the pre-fix module. The complete subsequent integration run passed.

An initial browser pass exposed a five-second log assertion that expired while Docker output was still loading. The bounded test wait is now 15 seconds; the final full browser run passed. Runtime values were already redacted as whole strings; multiline values are now also masked when persisted one line at a time (unit-tested).

## Boundaries

Browser Git fixtures use the explicitly guarded isolated harness; production never accepts local repository paths. Real public branch discovery succeeded with `git ls-remote` and through the normal frontend/API against Zaidzezo/test; its returned main branch was selected in the inspected create-form screenshot. The normal-worker public-source smoke also passed: it discovered main through the API, cloned actual public commit 6ca95d8d283fa4b93f0a443c2480089c34c6637c, built examples/static-site with a variable, served the SPA route through the stable gateway, and deleted the temporary service. Node 24 fetch discarded the test client's Host override; the helper now uses node:http, matching the gateway integration tests. The app routing code required no change. This verifies a real public source, not Internet hosting or tunnel connectivity.

Full Render parity is not claimed. Provider OAuth/tokens, other service types, additional generated runtimes, authenticated workspaces, cancellation/webhooks, custom TLS domains, replicas/disks/previews and shell remain open. Windows execution and public tunnel connectivity are not certified by this Linux run. See KNOWN-GAPS.md and ../AUDIT.md.

---

# Render parity phase 1 verification — 2026-10-28

- `pnpm typecheck`: passed for changed application/engine/shared code; final check also covers new tests.
- `pnpm lint`: passed.
- `pnpm test`: 44 passed, including eight parser/payload validation cases.
- `pnpm test:integration`: 15 passed, one optional external public-sharing test skipped. Isolated PostgreSQL database and Redis queue; actual Git, Docker, readiness, gateway, logs and rollback. New coverage proves encrypted initial configuration is used by the first running app; atomic environment update reserves the matching deployment snapshot; busy updates do not overwrite that configuration; invalid create payload leaves no service.
- `pnpm build`: passed for all packages and the production frontend. Existing nonfatal Next ESLint-plugin warning remains.
- No schema change in this phase; existing migrations apply to the fresh test database.
- `pnpm local`: actually launched against the existing local database; preserved the configured encryption key, found no pending migrations, and started all processes. API health returned ok; diagnostics returned database/redis/docker/worker=true; dashboard HTTP 200; unknown gateway host HTTP 404. Docker Desktop/Windows execution remains unverified in this Linux runner.

- `pnpm test:browser`: 2 passed (2.4 minutes), using actual Docker deployments. Covered create-with-variables and immediate logs, actual clone failure and error state, settings save, deletion, atomic save-and-deploy, log text filtering/download, rollback, runtime logs, health, sharing failure, start/stop, stable application URL, workspace search/grid and activity events. No browser page errors in the successful deployment scenario.
- Additional Chromium inspection: new variable editor rendered on desktop and at 390px without horizontal overflow; screenshot `docs/screenshots/phase1-create.png` inspected. This was an unsubmitted draft, not a fabricated live service.

 The full requested signup/tenant isolation, webhook, static site and cancellation acceptance scenarios are not passed: they require later phases in RENDER-ROADMAP.md. Source findings and remaining risk are in ../AUDIT.md.

---

# DeployGrid v2 verification — 26 October 2026

This is current-instance evidence, not a claim of production hosting, a fresh-machine restore, Windows certification or public multi-tenant security.

## Completed checks

- Frozen pnpm installation completed with lockfile/supply-chain policies passing. Native dependency permissions are explicit; TLS/checksum verification remained enabled.
- Both additive Prisma migrations applied to fresh test databases. Reapplying migrations to the existing development database reported no pending migrations.
- `pnpm setup:key` generated a key without printing it; a repeat invocation preserved it.
- Strict workspace/test/script TypeScript checking and ESLint passed.
- 36 unit tests passed: original validation/state tests plus authenticated encryption, reserved runtime-variable names, literal redaction and output-chunk boundaries.
- 13 real API/PostgreSQL/Docker/gateway integration tests passed. The optional external tunnel case was skipped in the default suite and is not counted as a successful public connection.
- Production Next.js build passed, including workspace, activity, create service, service details and deployment details routes. Backend packages passed compilation checks. The existing nonfatal Next.js framework-ESLint-plugin warning remains.

Both Chromium browser tests passed against the production frontend and isolated real worker runtime. The original test verifies validation, real clone-failure logs, settings, deletion and mobile layout. The v2 test verifies encrypted configuration, real Docker deployment/redeployment, retained-image rollback restoring the original value, stable gateway output, background health observations, explicit sharing failure when the executable is missing, stop/start, opening the actual application, search/grid controls and no mobile overflow. It also checked that no browser page errors occurred.

Test-created data lives only in a temporary database. Screenshots in `docs/screenshots/v2-workspace.png`, `v2-service.png`, `v2-health.png`, `v2-networking.png` and `v2-mobile.png` show actual operations and measurements. The missing-binary sharing error in the networking capture is intentional and real. The successful browser run completed with **2 passed**; no public tunnel success is claimed.

## Real integration coverage

The original six tests verify creation/validation, 202/409 deployment concurrency, persisted ordered transitions, Git clone/build/start/readiness, commit persistence, idempotent terminal delivery, safe redeployment, failed-build preservation, logs/stats, start/stop/restart with port rediscovery, candidate cleanup and clone failures.

Seven v2 tests add:

1. Write-only encrypted variables, original snapshots preserved after configuration changes, busy-project conflicts, reserved-name rejection and safe response serialization.
2. Retrying a failed buffered log write without losing the batch.
3. Removing a temporary checkout even when the final log write fails.
4. Real retained-image rollback with the original environment, no clone on rollback, stable gateway responses across releases, background health degradation and intentional-stop handling.
5. Persisting failed cleanup for a later retry.
6. Forwarding HTTP paths/query strings and raw upgrade traffic through the gateway; unrecognized/control-plane hosts are not routed.
7. Requiring a deployed service and explicit public-access confirmation before sharing; no public URL is invented while STARTING.

Git, Docker, PostgreSQL, HTTP and image rollback remain real. Only the repository source is redirected to a temporary committed fixture through a test-only clone dependency. Production APIs never accept local paths. The runner removes its own labeled containers/images before deleting its temporary database, including fallback cleanup when a test hook fails.

## Public tunnel result — blocked, not passed

The official cloudflared 2026.10.4 Linux executable was downloaded over verified HTTPS and checked against the official GitHub release SHA-256:

`ae5e8add7884b0531d66bbca4570d1de491ff6da51e4ebe7eb160cdf241d9e42`

The explicit real public-sharing test failed before a tunnel could connect. Running cloudflared directly isolated the cause:

```text
failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel":
... lookup api.trycloudflare.com ... read udp ... connection refused
```

The cloud runner blocks the native DNS connectivity used by cloudflared. This is distinct from API validation or Docker readiness. The feature persists FAILED with diagnostics; it never advertises an unverified public URL. A successful public connection still needs verification on a host with working outbound DNS/Cloudflare connectivity, such as the intended local installation. Quick tunnels also have no uptime guarantee.

The separate public GitHub repository smoke scenario is not newly certified in this revision; use a public copy of examples/node-api with E2E_REPOSITORY_URL to verify your own setup.

## Fixes discovered through execution

- Database row locking before attempt insertion avoids the original project foreign-key/concurrent-update deadlock.
- Docker can reassign a dynamic port after restart; runtime controls inspect and persist it before readiness.
- Non-root example container COPY ownership must match its runtime user.
- SSE proxy compression must be disabled to avoid buffering live logs.
- A failed log batch must not poison later batches or prevent checkout cleanup.
- Rollback can share an image with another historical attempt; remove all test-owned containers before their retained images.
- Missing cloudflared emits both error and close events; close must preserve the more useful missing-executable diagnostic.
- Interactive database transactions use a bounded 15-second database-only budget so a busy local Docker host does not hit Prisma's default five-second deadline during promotion. No external operations run inside those transactions.
- A typed, guarded isolated browser runtime is needed to exercise actual deployment/rollback/health without populating a normal workspace with fixtures.

## Remaining limits

Public tunnel connectivity, Windows/macOS execution, parallel builds, multiple worker processes and full process-kill/stalled-lease recovery are not reported as verified. Literal secret redaction cannot cover arbitrary encoded/transformed application output. See LIMITATIONS.md.
