# Known gaps vs Render

This is a working local deployment platform, not full Render parity. The implemented and verified subset is described in SERVICE-SOURCES.md and VERIFICATION.md.

| Capability | Gap and reason / next work |
| --- | --- |
| Signup, teams, workspaces, roles | No identity model or tenant ownership checks. The control plane must stay on loopback. Requires sessions, membership-aware queries and adversarial authorization tests before remote use. |
| Provider connections | Public GitHub URLs and actual branch discovery work. OAuth/token connections and repository search need an owner-configured GitHub integration and encrypted credential lifecycle. |
| Additional service types | Only Docker/Node Web Services and Static Sites currently work. Worker, private, cron and managed database types need distinct readiness, scheduling, routing, network and data lifecycles. |
| Generated language runtimes | Node 22 is generated; Docker supports other languages through the repository Dockerfile. Generated Python/Ruby/Go/Rust/Elixir builds still need runtime defaults and fixtures. |
| Deployment automation | Exact-commit manual deployment, cancellation, signed push webhooks, deploy hooks, trigger metadata and build filters remain phase 3. Cancellation needs fencing and build-process cleanup, not just a status label. |
| Build isolation | Secret mounts and CLI build timeout work, but BuildKit is still host-managed without dedicated per-build CPU/memory constraints or reliable remote-task cancellation. Trusted sources only. |
| Logs and metrics | Deployment history/SSE, runtime polling, text filtering and downloaded displayed output work. Persisted runtime log archives, time/type/level filters, HTTP metrics and historical metric ranges need storage/sampling policies. |
| Static hosting | Local artifact serving and SPA fallback work. Distributed CDN, configurable redirect/header rules and global caching are not provided by a single local host. |
| Domains/TLS | Stable localhost URLs and optional application tunnels exist. Managed domains need DNS verification, certificate lifecycle and an Internet-reachable host; a temporary tunnel is not permanent hosting. |
| Disks and scaling | One active container per service. Owned volumes, safe attachment/removal, replicas, load balancing and autoscaling require new storage/runtime models and tests. |
| Shell | Not implemented. It must have authenticated, authorized WebSockets, idle timeout and a restricted runtime boundary before being exposed. |
| PR previews, sleep, notifications | No pull-request cleanup integration, idle-wake gateway or notification delivery. These require real lifecycle jobs and provider configuration; no placeholder controls are shown. |
| Environment extras | Write-only variables, import, atomic save/deploy and build mounts work. PORT is injected from the configured port. Other Render compatibility variables, secret files, shared groups, authenticated reveal and separate rebuild/deploy policies remain open. |
| Full acceptance | Static SPA, rollback, failure preservation and variable behavior have runtime tests. Signup, cross-user isolation, push webhooks and full process-kill/cancel acceptance cannot be reported as passed. |

Windows execution is documented but not certified by this Linux runner. Build commands can deliberately publish secrets; encryption and literal redaction cannot prevent arbitrary exfiltration or encoded output.
