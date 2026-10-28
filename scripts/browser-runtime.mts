// Integration-only runtime: the production worker never accepts local repository paths.
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

import { db } from '@deploygrid/database';
import {
  Worker,
  queue,
  heartbeatKey,
  connection,
  deploy,
  cloneRepository,
  runtimeOperation,
  createGateway,
  closeGateway,
  run,
  monitorHealth,
  reconcileSharing,
  closeSharing,
} from '@deploygrid/engine';
import { buildApp } from '../apps/api/src/app';
if (
  process.env.DEPLOYGRID_TEST_RUNTIME !== '1' ||
  !new URL(process.env.DATABASE_URL!).pathname.startsWith('/deploygrid_test_')
)
  throw new Error('Browser fixture runtime requires an isolated test database.');
const directory = await mkdtemp(join(tmpdir(), 'deploygrid-browser-fixture-'));
await cp(resolve('examples/node-api'), directory, { recursive: true });
await cp(resolve('examples/static-site'), join(directory, 'site'), { recursive: true });
await cp(resolve('examples/node-native'), join(directory, 'native'), { recursive: true });
await run('git', ['init', directory]);
await run('git', ['-C', directory, 'add', '.']);
await run('git', [
  '-C',
  directory,
  '-c',
  'user.name=Test',
  '-c',
  'user.email=test@localhost',
  'commit',
  '-m',
  'Browser fixture',
]);
const clone: typeof cloneRepository = async (url, branch, path, log) => {
  if (url === 'https://github.com/deploygrid/fixture')
    await run('git', ['clone', '--', directory, path], { log });
  else await cloneRepository(url, branch, path, log);
};
// Browser tests assert an honest missing-executable error, never a simulated public URL.
process.env.CLOUDFLARED_PATH = 'deploygrid-intentionally-missing-cloudflared';
const app = await buildApp();
const gateway = createGateway();
await new Promise<void>((resolve, reject) => {
  gateway.on('error', reject);
  gateway.listen(8080, '127.0.0.1', resolve);
});
await app.listen({ host: '127.0.0.1', port: 4000 });
const worker = new Worker(
  process.env.DEPLOYGRID_QUEUE_NAME!,
  async (job) => {
    if (job.name === 'deploy') await deploy(job.data.deploymentId, clone);
    else await runtimeOperation(job.data.projectId, job.data.action, job.data.token);
  },
  { connection, concurrency: 1 },
);
worker.on('error', console.error);
let monitoring: Promise<void> | null = null;
const timer = setInterval(() => {
  if (!monitoring)
    monitoring = (async () => {
      await monitorHealth();
      await reconcileSharing();
      await (await queue.client).set(heartbeatKey(), String(Date.now()), 'EX', 30);
    })()
      .catch(console.error)
      .finally(() => {
        monitoring = null;
      });
}, 1000);
const web = spawn(
  process.execPath,
  [process.env.npm_execpath!, '--filter', '@deploygrid/web', 'start'],
  { stdio: 'inherit', env: process.env, shell: false },
);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  web.kill('SIGTERM');
  await worker.close();
  await monitoring;
  await closeSharing();
  await closeGateway(gateway);
  await app.close();
  for (const p of await db.project.findMany({ select: { id: true } })) {
    const containers = await run('docker', [
      'ps',
      '-aq',
      '--filter',
      'label=deploygrid.managed=true',
      '--filter',
      `label=deploygrid.project=${p.id}`,
    ]);
    if (containers) await run('docker', ['rm', '-f', ...containers.split(/\s+/)]);
    const images = await run('docker', [
      'images',
      '-q',
      '--filter',
      'label=deploygrid.managed=true',
      '--filter',
      `label=deploygrid.project=${p.id}`,
    ]);
    if (images) await run('docker', ['image', 'rm', ...new Set(images.split(/\s+/))]);
  }
  await rm(directory, { recursive: true, force: true });
  await queue.obliterate({ force: true });
  await queue.close();
  await db.$disconnect();
  process.exit(0);
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    void close().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  });
web.on('exit', () => {
  if (!closing) void close();
});
