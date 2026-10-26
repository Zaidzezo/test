# DeployGrid

DeployGrid is a trusted, single-operator deployment platform. The Next.js dashboard uses a loopback Fastify control API; PostgreSQL stores state; a Redis/BullMQ host worker owns Git/Docker operations. A separate loopback application gateway maps stable `<slug>.localhost` hosts to current containers. Optional cloudflared processes share selected application routes only.

Use strict TypeScript, Zod validation, focused modules, formatted code and shell:false argument arrays. Keep database transactions short and free of Git/Docker/HTTP operations. Serialize project changes with row locks/reservations; never rewrite terminal deployment history. Keep the previous working container until candidate readiness and atomic promotion. Rollback creates a new attempt from an owned retained image and its original encrypted snapshot.

Never expose Docker TCP, mount its socket into applications, globally prune, or claim public multi-tenant security. Keep the control plane private. Environment values are write-only and encrypted with the preserved host key; never return snapshots, ciphertext or workspace paths in responses. Redact known literal values in logs without claiming arbitrary output can be made secret-safe. Never print .env or encryption keys.

Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:integration`, and `pnpm build`. Docker tests use an isolated local database and queue. `pnpm test:browser` starts its own isolated fixture runtime and production frontend: stop normal processes using 3000/4000/8080 first. Local Git clone substitution exists only in the explicitly guarded test harness; never add local path support to production request payloads. Public tunnel verification is a separate opt-in test; record external failures and skips accurately.

Keep PLANS.md and docs/VERIFICATION.md current. Priorities: six-item v2 roadmap correctness, actual browser behavior, migration compatibility and clear Windows upgrade instructions. Webhooks, cancellation, volumes, backup and remote-management authentication are separate work.
