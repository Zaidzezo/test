# Verification evidence — 26 October 2026

This report describes commands actually executed in the cloud workspace. It does not certify a fresh machine, publication, every acceptance scenario or public multi-tenant security.

| Check | Actual outcome |
| --- | --- |
| Dependency installation | pnpm installation succeeded with native build permissions explicitly configured. Lockfile and package integrity verification remained enabled. A later frozen refresh reached installed packages but registry metadata/provenance requests began returning proxy 503; repeated retries were stopped. No verification was disabled. |
| PostgreSQL / Redis | Docker Compose started both services and passed their health checks. |
| Prisma generation | Prisma 7.3.0 client generated successfully with PostgreSQL JavaScript adapter. |
| Database migration | Initial SQL migration applied successfully; repeated production migration command reported no pending migrations. Each isolated integration run applied it to a fresh temporary database. |
| Strict type checking | Passed all workspace packages and root test TypeScript. |
| ESLint | Passed. Next.js build warns its framework-specific ESLint plugin is not installed; the repository uses TypeScript ESLint. |
| Unit tests | 26 passed: GitHub URL boundary, defaults/invalid config, slug/branch/health validation, state transitions, health codes and bounded errors. |
| Database / Docker integration | 6 tests passed in the final run, approximately 23 seconds including test startup. See cases below. |
| Production build | Passed; all four application routes and the framework not-found page built successfully. API/worker/shared packages passed strict compilation. |
| Production process startup | pnpm start launched API, worker and production Next.js. API health returned status ok. |
| Browser dashboard test | 1 passed against production Next.js in Chromium, approximately 6 seconds. Actual API calls, queued failed clone, SSE logs, settings, deletion and mobile no-overflow assertion. |
| Public GitHub deployment success test | FAILED / externally blocked. Earlier Docker welcome repository cloned and resolved commit 68c1b9f87c41fb3fef2667e27149865c2f42d1eb, but its Dockerfile failed during npm ci with npm's “Exit handler never called” error. A later attempt failed at Git clone with upstream proxy 503. The final success assertion failed; it is not counted as passing. |

## Real integration coverage

1. Fastify project creation/retrieval, configuration rejection and cross-origin write rejection.
2. Two simultaneous deployment HTTP requests produce exactly one 202 and one 409; one database attempt remains. Ordered events persist; invalid transition is rejected. A persisted interrupted CLONING attempt is conservatively failed and its reservation released.
3. Temporary Git fixture cloned by Git, real image built, loopback port discovered, HTTP health verified, commit SHA persisted. Repeated completed job creates no duplicate container. Successful redeployment stops the old container after promotion. Deliberately broken next build fails while previous current container remains running. Actual logs/stats read. Stop/start/restart perform Docker actions, rediscover changed host ports and verify health. History order and persisted build logs checked through the API.
4. Invalid executable in a Docker image produces FAILED and candidate cleanup.
5. Live container without an HTTP listener fails readiness; no current deployment appears and the candidate is removed.
6. Git clone error persists diagnostics and releases the active slot.

Tests use isolated temporary databases and queue names, remove only their own labeled containers/images and delete their temporary databases. The clone boundary is redirected to a temporary committed Git fixture; Docker, Git, HTTP, queue persistence and PostgreSQL remain real. This does not establish successful public GitHub → BullMQ → running-container acceptance end to end.

## Browser evidence

`docs/screenshots/dashboard.png`, `deployment.png`, and `mobile.png` are actual Playwright captures. The deployment screenshot intentionally records a real failure path. The optional public deployment test has not produced a successful application screenshot.

## Fixes found through execution

- Writable pnpm and Docker Buildx caches were needed in this cloud filesystem.
- Example Docker COPY ownership needed to match its non-root runtime user.
- SSE compression buffered output; disabling proxy compression restored immediate events.
- Docker can reassign a dynamic host port after stop/start; runtime controls now inspect and persist the new mapping before readiness.
- Creating a deployment before locking its referenced project could deadlock concurrent requests. Locking the project row before attempt insertion gives the verified 202/409 result.
- Tests initially shared production state; the test runner now creates a separate local database and queue namespace.

## Remaining verification

Retry `pnpm install --frozen-lockfile` and `pnpm test:browser:deploy` when upstream registry/GitHub connectivity works. Prefer a public repository containing the bundled dependency-free example; set E2E_REPOSITORY_URL as documented. Full worker SIGKILL/stalled-lock recovery, an actual SSE network disconnect/catch-up test, parallel builds and Windows/macOS execution have not been independently exercised. These are not reported as passed.

Cloud environment install/start instructions and binaries.prisma.sh allowlist addition were saved as a draft. Saving is not publication. Review/save the draft in environment settings and publish through the product when appropriate; new-task restoration remains unverified.
