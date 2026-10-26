# Design decisions

- **PostgreSQL and Prisma:** relational history, foreign keys, indexed event ordering and transactional reservations. Prisma 7 uses its supported PostgreSQL JavaScript adapter; migrations remain SQL managed by Prisma.
- **BullMQ/Redis:** persisted background delivery and stalled-job handling without introducing a distributed event bus. A small reconciler bridges the database/queue dual-write gap.
- **Host-side worker:** Docker CLI through safe argument arrays avoids socket mounts in service containers and keeps the slow privileged operations outside API handlers. The worker intentionally does not hot reload mid-build.
- **SSE:** one-way state/log updates need less machinery than WebSockets. Persisted IDs support reconnect/catch-up. Compression is disabled for streaming routes/proxy to avoid buffering small log batches.
- **Single host:** keeps localhost port assignment, health checks and Docker ownership comprehensible. No Kubernetes or reverse proxy is required for this scope; changing URLs after deployment/restart is an explicit tradeoff.
- **UI:** dark graphite surfaces and violet accents prioritize operational hierarchy; real metrics only, no simulated empty-state activity. A small shadcn-style Radix/CVA button implements the shared accessible control primitive without adding unused UI packages. CSS handles restrained transitions; no animation dependency is needed.
- **Testing:** isolated databases and queue names prevent test attempts from being mistaken for abandoned production work. The local fixture redirects only clone input, leaving the deployment engine's external operations real. Public-repository browser success remains a separate network-dependent test.
