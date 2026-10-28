import { mkdir, realpath, stat, writeFile } from 'node:fs/promises';
import { join, relative, isAbsolute, sep } from 'node:path';
import type { Deployment } from '@deploygrid/database';

export async function containedPath(root: string, path: string) {
  const base = await realpath(root);
  const target = await realpath(join(base, path));
  const rel = relative(base, target);
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel))
    throw new Error('Configured path escapes the repository');
  return target;
}
const shellQuote = (text: string) => "'" + text.replaceAll("'", "'\\''") + "'";
const embeddedFile = (path: string, content: string) =>
  `RUN node -e ${shellQuote(`require('node:fs').writeFileSync(${JSON.stringify(path)}, Buffer.from(${JSON.stringify(Buffer.from(content).toString('base64'))}, 'base64'))`)}\n`;

// Served inside the generated image, with no package install or host filesystem mounts.
export const staticServer = String.raw`
import http from 'node:http';
import { stat, realpath } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, relative, extname } from 'node:path';
const root = '/site';
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon', '.woff2':'font/woff2', '.txt':'text/plain; charset=utf-8', '.wasm':'application/wasm' };
const server = http.createServer(async (req, res) => {
  const send = (status, message) => { res.writeHead(status, { 'Content-Type':'text/plain; charset=utf-8' }); res.end(req.method === 'HEAD' ? undefined : message); };
  if (!['GET','HEAD'].includes(req.method)) { res.setHeader('Allow','GET, HEAD'); return send(405,'Method not allowed'); }
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { return send(400,'Invalid path'); }
  if (path.includes('\0') || path.includes('\\') || path.split('/').some(p => p.startsWith('.'))) return send(404,'Not found');
  const safeFile = async (name) => {
    let target = await realpath(name);
    if (relative(root, target).split('/').includes('..')) throw Object.assign(new Error('Outside root'), { code:'EACCES' });
    let info = await stat(target);
    if (info.isDirectory()) { target = await realpath(resolve(target, 'index.html')); info = await stat(target); }
    if (relative(root, target).split('/').includes('..') || !info.isFile()) throw Object.assign(new Error('Not a file'), { code:'EACCES' });
    return { target, info };
  };
  try {
    let file;
    try { file = await safeFile(resolve(root, '.' + path)); }
    catch (error) {
      if (error.code !== 'ENOENT' || process.env.DEPLOYGRID_SPA !== 'true' || extname(path)) throw error;
      file = await safeFile(resolve(root,'index.html'));
    }
    res.writeHead(200, { 'Content-Type':types[extname(file.target)] || 'application/octet-stream', 'Content-Length':file.info.size, 'X-Content-Type-Options':'nosniff', 'Cache-Control':extname(file.target) === '.html' ? 'no-cache' : 'public, max-age=3600' });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file.target).on('error', () => res.destroy()).pipe(res);
  } catch (error) { send(error.code === 'ENOENT' ? 404 : 403, 'Not found'); }
});
server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('Static site listening'));
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
`;

export async function prepareBuild(
  workspace: string,
  repository: string | null,
  d: Deployment,
  environment: Record<string, string>,
) {
  const control = join(workspace, 'control');
  await mkdir(control, { recursive: true });
  const secret = join(control, 'environment.json');
  await writeFile(secret, JSON.stringify(environment), { mode: 0o600 });
  const context = repository
    ? await containedPath(repository, d.rootDirectory)
    : join(workspace, 'empty');
  if (!repository) await mkdir(context);
  if (!(await stat(context)).isDirectory()) throw new Error('Root directory must be a directory');
  let runtime = d.runtime;
  if (runtime === 'AUTO' && repository) {
    try {
      await containedPath(context, d.dockerfilePath);
      runtime = 'DOCKER';
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      runtime = 'NODE';
    }
  }
  if (d.sourceType === 'GIT' && d.serviceType !== 'STATIC' && runtime === 'DOCKER') {
    const dockerfile = await containedPath(context, d.dockerfilePath);
    if (!(await stat(dockerfile)).isFile()) throw new Error('Dockerfile must be a file');
    return { context, dockerfile, secret, runtime, noCache: Object.keys(environment).length > 0 };
  }
  const dockerfile = join(control, 'Dockerfile');
  let content: string;
  if (d.sourceType === 'IMAGE') {
    // The resulting image carries our ownership labels; the source image is never retagged or deleted.
    content = `FROM ${d.imageUrl}\n`;
    if (d.startCommand) content += `CMD ${JSON.stringify(['/bin/sh', '-c', d.startCommand])}\n`;
  } else {
    if (d.serviceType !== 'STATIC') await containedPath(context, 'package.json');
    const command =
      d.buildCommand ||
      (d.serviceType === 'STATIC'
        ? 'true'
        : 'if [ -f package-lock.json ]; then npm ci; else npm install; fi');
    const buildScript = `const fs=require('node:fs');const cp=require('node:child_process');const env={...process.env,...JSON.parse(fs.readFileSync('/run/secrets/deploygrid_env','utf8'))};const result=cp.spawnSync('/bin/sh',['-c',${JSON.stringify(command)}],{env,stdio:'inherit'});if(result.error)throw result.error;process.exit(result.status??1)`;
    content = `FROM node:22-alpine AS build\nWORKDIR /workspace\nCOPY . .\nRUN --mount=type=secret,id=deploygrid_env,required=true node -e ${shellQuote(buildScript)}\n`;
    if (d.serviceType === 'STATIC') {
      const validate = `const fs=require('node:fs');const path=require('node:path');const root=fs.realpathSync(${JSON.stringify('/workspace/' + d.publishDirectory)});if(!root.startsWith('/workspace/'))throw Error('Publish directory escapes root');function walk(p){for(const f of fs.readdirSync(p,{withFileTypes:true})){if(f.isSymbolicLink())throw Error('Published symlinks are not supported');if(f.isDirectory())walk(path.join(p,f.name));}}walk(root);if(!fs.statSync(path.join(root,'index.html')).isFile())throw Error('Publish directory needs index.html');`;
      content += `RUN node -e ${shellQuote(validate)}\nFROM node:22-alpine\nWORKDIR /site\nCOPY --from=build --chown=node:node /workspace/${d.publishDirectory}/ /site/\n`;
      content += embeddedFile('/server.mjs', staticServer);
      content += `ENV DEPLOYGRID_SPA=${d.spaFallback}\nUSER node\nCMD ["node", "/server.mjs"]\n`;
    } else {
      content += `RUN chown -R node:node /workspace\nUSER node\nCMD ${JSON.stringify(['/bin/sh', '-c', d.startCommand || 'npm start'])}\n`;
    }
  }
  await writeFile(dockerfile, content);
  return {
    context,
    dockerfile,
    secret,
    runtime: d.sourceType === 'IMAGE' ? 'IMAGE' : 'NODE',
    noCache: Object.keys(environment).length > 0,
  };
}
