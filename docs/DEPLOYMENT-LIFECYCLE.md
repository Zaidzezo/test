# Deployment lifecycle

`QUEUED → CLONING → BUILDING → STARTING → VERIFYING → SUCCEEDED`

Any nonterminal state may become FAILED. A retry creates a new attempt; terminal history is not resumed. Project-row locking and conditional reservations serialize deployments against configuration changes and runtime actions without holding transactions across external work.

Normal deployment clones the repository, records the SHA, builds its image, starts a constrained candidate with its encrypted variable snapshot, checks readiness, then atomically sets currentDeploymentId and releases the active slot. The gateway resolves the new current pointer on subsequent requests; its hostname remains stable. Existing keep-alive/WebSocket connections are not guaranteed uninterrupted when an old container stops.

Rollback is a new ROLLBACK attempt referencing a previous successful source. It snapshots the source configuration, checks retained image ownership, records an explicit image-reuse event rather than claiming a rebuild, and follows candidate startup/readiness/promotion. A missing image or unreadable snapshot fails safely while preserving the existing current release.

After promotion the previous release is marked cleanupPending and its container stopped. Failure leaves the candidate FAILED and releases its reservation before cleanup. Cleanup errors are persisted for isolated retries. Temporary checkouts are removed independently of database logging. Images remain available until explicit project deletion/manual owner-scoped retention work.

Deployment SUCCEEDED is historical completion, not perpetual runtime health. Background checks independently maintain RUNNING/DEGRADED/STOPPED and recovery events. Verified runtime controls update desiredRunning; dynamically allocated ports are inspected again after start/restart. Metrics reads do not overwrite health judgments.

BullMQ delivery is at least once. Terminal jobs are no-ops. Interrupted in-progress attempts are failed conservatively after queue ownership is absent, rather than replaying uncertain builds. Full distributed lease fencing/multiple worker processes are outside the supported model.
