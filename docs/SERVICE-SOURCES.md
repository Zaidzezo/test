# Service sources and builds

Supported service types are Web Service and Static Site. All run on this host; there are no pretend cloud regions or paid plans. The control plane remains trusted-local only.

## Public Git repository

Enter a public HTTPS GitHub URL. **Load repository branches** performs a real `git ls-remote` request and offers up to 200 discovered branches. You may also enter a branch directly. GitHub OAuth, provider tokens and repository search are not implemented.

**Root directory** scopes the Docker build context to that folder. Paths must be relative and cannot escape through `..`, absolute paths or symlinks. For Docker services, **Dockerfile path** is relative to that context. The container uses the repository Dockerfile's start command. Node mode generates a Dockerfile using `node:22-alpine`; Auto prefers a Dockerfile and otherwise uses Node. Other languages can use Docker mode; generated Python/Ruby/Go/Rust/Elixir runtimes are not implemented.

Node's blank build command defaults to `npm ci` when package-lock.json exists, otherwise `npm install`. Start defaults to `npm start`. Custom commands run under `/bin/sh -c` inside the container, never on the host. Choose a start command that forwards termination signals to its application process. There are runtime CPU/memory/PID limits and a build CLI timeout, but the host BuildKit builder does not yet have dedicated per-build resource isolation.

`PORT` is injected from the configured container port and cannot be set as a user variable. If a previous service stored its own PORT variable, set Container port to that intended value; the injected value takes precedence.

## Build variables

Every attempt keeps an encrypted environment and build-configuration snapshot. A temporary JSON file, outside the repository/build context, is passed as BuildKit secret `deploygrid_env`. The workspace is removed after the attempt. Values are not put into Docker build arguments, generated Dockerfiles, CMD, or image ENV. Known literal values are redacted from captured logs.

Node/static build commands receive the variables automatically. Existing Dockerfiles must explicitly mount the secret in the RUN instruction that needs it, for example:

```dockerfile
RUN --mount=type=secret,id=deploygrid_env,required=true \
    node -e 'const fs=require("fs");const cp=require("child_process");const env={...process.env,...JSON.parse(fs.readFileSync("/run/secrets/deploygrid_env","utf8"))};const r=cp.spawnSync("npm",["run","build"],{env,stdio:"inherit"});process.exit(r.status??1)'
```

BuildKit secrets alone do not invalidate cached layers. DeployGrid disables layer caching when an attempt has variables so changes are actually consumed. Build commands can write variables into artifacts or deliberately expose/encode them; neither encryption nor literal redaction prevents that. Never place credentials in build/start commands or public artifacts.

## Static sites

Use **Static Site**, set Root directory if needed, Build command, and Publish directory. A blank build command skips compilation, suitable for repositories containing prebuilt assets. For the sample in examples/static-site use `node build.mjs` and `dist`. A publish folder with index.html is required. Symlinked output is rejected.

Only that folder is copied into the final non-root serving image; source files and temporary secret mounts are not copied. Static assets are public. PUBLIC_TITLE in the sample is intentionally compiled into HTML. **Rewrite SPA routes to index.html** serves index.html for missing extensionless routes; missing assets still return 404. Dotfiles and traversal paths are denied. GET/HEAD, MIME types, streaming responses and basic cache headers are supported. This is a local HTTP static server behind the existing stable gateway, not a distributed CDN. Custom redirect/header rule editors and TLS custom domains remain open work.

Static releases use the same readiness, atomic promotion, retained-image rollback and owned-resource deletion as web releases. Rollback restores the built assets and that release's SPA/environment settings without rebuilding.

## Existing image

Choose Web Service → Existing Image. Public Docker Hub and GHCR names/tags/digests are accepted, without embedded credentials. The image must serve HTTP. Set its actual listening port; database/worker images are not Web Services. Optionally override the command using `/bin/sh -c`; images without a shell must keep their default command.

Each attempt builds a derived, labelled image from the source so ownership cleanup cannot delete the upstream image. The source is pulled for a new attempt. Rollback uses the retained derived image rather than pulling the mutable tag again. Host Docker credentials are not managed by DeployGrid; private registry integration is not provided.


## Optional public-source smoke test

With the normal app running and outbound GitHub/Docker access available, run:

```powershell
pnpm exec dotenv -e .env -- node scripts/smoke-public-source.mjs
```

This discovers the actual main branch of Zaidzezo/test, creates one temporary real Static Site from examples/static-site, waits for the production worker to clone/build it, checks the SPA URL, then deletes that specific service. It is separate from the isolated default test suite and does not require a local-Git substitution. It does not verify public Internet hosting or a tunnel.
