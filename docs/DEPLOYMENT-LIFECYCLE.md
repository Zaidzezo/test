# Deployment lifecycle

`QUEUED → CLONING → BUILDING → STARTING → VERIFYING → SUCCEEDED`

Any nonterminal state may become FAILED. Terminal records never resume. A retry creates a new attempt. State updates and event insertions share a short transaction; conditional status updates detect concurrent changes. Failure updates the attempt, emits its error and releases only the matching active reservation.

The current application stays available while a candidate clones, builds, starts and verifies. Docker allocates a separate loopback port. A 2xx/3xx readiness response permits atomic promotion, successful completion, runtime RUNNING and reservation release. Only afterward does the previous container stop. A failed candidate is removed; the current pointer and previous runtime stay intact.

SUCCEEDED is deployment history, not a claim that the container remains healthy forever. Runtime RUNNING/STOPPED/UNKNOWN is observed separately. Controls never rewrite successful deployment history. Runtime operation failures append separate events. Dynamic host ports are inspected after start/restart.

BullMQ can redeliver. Terminal jobs are no-ops; interrupted nonterminal attempts are failed conservatively instead of replaying uncertain external operations. Existing deterministic candidates are never duplicated. Reservations and job state drive reconciliation. Run one worker process per queue; concurrency within that process is configurable, but parallel builds have not been verified.
