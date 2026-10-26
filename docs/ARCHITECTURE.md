# Architecture

Next.js sends REST/SSE requests to a loopback Fastify API. TanStack Query manages server state; EventSource uses persisted event IDs for reconnect/catch-up. Safe response serializers omit encrypted configuration snapshots and internal workspace paths.

The API locks the project row, creates an attempt and atomically reserves activeDeploymentId in a short transaction. It snapshots repository configuration and encrypted runtime variables. State transitions are conditional database updates paired with events. PostgreSQL/Redis are not one transaction: stable BullMQ IDs and reconciliation restore queued jobs.

The host-side worker owns Git, Docker and cloudflared processes. Only one worker process per queue is supported. Builds use explicit spawn argument arrays and deadlines. Candidates have deterministic ownership labels, loopback host ports, dropped capabilities and resource limits. HTTP readiness precedes atomic promotion. Old containers are stopped after promotion and retained images support rollback.

The built-in HTTP gateway listens on loopback port 8080 and maps `<slug>.localhost` to the current deployment's actual host port from PostgreSQL. It forwards streams, paths/query strings and HTTP upgrades. Unrecognized hosts have no route. It is a separate listener from the dashboard/API and does not proxy control-plane endpoints. Gateway shutdown closes upgraded sockets as well as ordinary connections.

Project variables use authenticated AES-256-GCM with independent nonces and a host-held key. Values are write-only through the API. Each attempt snapshots all variables into an encrypted payload. Rollback copies its source snapshot and uses a retained owned image; decryption only occurs inside the worker/runtime log-redaction path. Known literal values are scrubbed from complete log lines before persistence, including values split across process-output chunks.

The worker checks current containers and their HTTP health endpoints on an interval independent of dashboard visits. Four checks run at a time; each request has a two-second limit. Intentional stops are distinct from unexpected exits. Consecutive failures cross a configurable threshold before DEGRADED; successful responses reset failures and emit recovery events when appropriate. Observations are retained for seven days. Worker heartbeat runs independently so slow health checks do not report an idle worker.

Cleanup retries are persisted on deployments. Abandoned attempts are terminalized and reservations released before Docker cleanup. Each reconciliation item handles errors independently. Filesystem cleanup is independent of log writes. Previous-release cleanup retries stop only owned containers and preserve retained images. Runtime controls rediscover host ports after start/restart.

Public sharing is optional. The worker supervises one cloudflared process per enabled service, targeting the application gateway with a fixed service Host header. A URL is published only after cloudflared supplies a valid trycloudflare.com URL and confirms a registered connection. Missing executable, DNS and connection failures become FAILED with useful diagnostics. Disabling/stopping/deleting the service closes its tunnel; desired sharing resumes after a worker restart with a new quick-tunnel URL.
