# Limitations

- Trusted public GitHub code only; single operator; no authentication, tenant boundary or secure public hosting. Dockerfile builds have host-daemon power. No sandbox guarantee.
- One local Docker host and one worker process per queue. Worker concurrency defaults to one; parallel deployments are not certified. Remote daemon networking, high availability and autoscaling are unsupported.
- No private repository auth UI, runtime environment-variable editor, advanced secrets, webhook automation, cancellation or rollback. Re-deploy after failures.
- No stable ingress URL: Docker allocates a different localhost port for candidates and may do so after restart. Sharing URLs beyond this machine is unsupported.
- Limits apply to running application containers, not arbitrary Dockerfile build-time workloads. Build output and time are bounded, but build resource isolation is not a security boundary. Git timeout kills the CLI process; hard process crashes may leave helper processes/temp directories for manual inspection.
- Image/history retention is manual. Logs are bounded per deployment and runtime responses, but total historical rows/images can grow as attempts accumulate. Never globally prune. Retain current images; remove only explicitly selected resources bearing this project's ownership labels.
- A post-promotion failure to stop the old container produces a warning; automatic retry of that cleanup is deferred. Inspect the warning and stop only its labeled old container manually.
- Runtime health reflects Docker operation verification and visible-page metrics polling, not continuous health monitoring. UNKNOWN indicates operation/inspection failure; running is not a permanent health guarantee.
- Runtime operations use persistent tokens and BullMQ jobs but have no dedicated operation-history table. Failure details are attached to the current deployment; delete failures without a current deployment require worker logs.
- Dashboard lists up to 100 projects; UI displays latest 50 deployment attempts. API history/log pagination supports additional reads. SSE history catch-up is bounded per batch; event retention changes are not yet implemented.
- Application output may include sensitive data. Logs render as text, not HTML, but automatic arbitrary secret redaction is not attempted.
- Public Dockerfiles that install packages need working in-build DNS, registry access and TLS trust. The bundled dependency-free fixture avoids that dependency. A third-party npm build failure is not evidence of a successful deployment.
