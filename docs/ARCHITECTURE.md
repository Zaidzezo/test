# Architecture

The web app proxies REST/SSE to a loopback Fastify API; TanStack Query manages request state and refreshes project metadata. EventSource catches up via ordered database event IDs. A shared Prisma client with PostgreSQL driver pooling serves requests and streams; streams poll at 1-second intervals with bounded batches, heartbeat and disconnect cleanup.

The API validates with shared Zod schemas, creates an attempt and atomically reserves Project.activeDeploymentId in a short transaction. A racing reservation rolls its own attempt back. Repository, branch, port and health path are copied onto each attempt so history and retry inputs are stable even if future project settings change.

PostgreSQL and BullMQ are not a distributed transaction. Persist first; enqueue with deployment ID as job ID. The worker scans queued rows every 10 seconds and restores missing jobs. Worker concurrency defaults to one. Runtime actions share a persistent operation token with deployment reservation conditions, preventing control/edit/delete races with deployment.

Only the worker clones and builds. Unique temporary directories are cleaned in finally. Processes use spawn, argument arrays, shell:false, bounded output and deadlines. Docker deterministically names and labels candidates and images. Build logs are buffered into batches (40 lines or approximately 1 second), capped at 5000 lines of 2000 characters per attempt. Operational events have ordered database IDs. Runtime logs use a separate bounded endpoint.

Docker assigns loopback ports. Candidate HTTP readiness precedes an atomic current-pointer switch and terminal event. Old containers stop afterward; failures append warnings. Metrics inspect Docker and use its stats output. Start/restart re-inspect assigned ports before readiness because dynamic mappings may change.

Recovery follows BullMQ ownership: do not fail a job that remains active or waiting. A stalled in-progress job is redelivered and conservatively failed with candidate cleanup; terminal jobs return without new side effects. Missing/terminal jobs paired with nonterminal rows are detected by reconciliation. Operation tokens without live jobs are cleared. Current successful application containers are not deleted during recovery. This is at-least-once handling, not exactly once.

Remaining reconciliation gaps: old-container stop warnings require manual retry; host temp directories left by SIGKILL may require manual cleanup; periodic health/metrics reconciliation occurs while the project view is visible rather than through a fleet monitor. See LIMITATIONS.md.
