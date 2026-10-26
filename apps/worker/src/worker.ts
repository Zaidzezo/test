import { Worker } from 'bullmq';
import { db } from '@deploygrid/database';
import {
  connection,
  queue,
  heartbeatKey,
  deploy,
  runtimeOperation,
  run,
  reconcileDeployments,
  monitorHealth,
  initializeSharing,
  reconcileSharing,
  closeSharing,
} from '@deploygrid/engine';
import { positiveInt, errorMessage } from '@deploygrid/shared';
await run('docker', ['info', '--format', '{{.ServerVersion}}']);
const worker = new Worker(
  process.env.DEPLOYGRID_QUEUE_NAME ?? 'deploygrid',
  async (job) => {
    if (job.name === 'deploy') await deploy(job.data.deploymentId);
    else if (job.name === 'runtime')
      await runtimeOperation(job.data.projectId, job.data.action, job.data.token);
  },
  { connection, concurrency: positiveInt(process.env.WORKER_CONCURRENCY, 1), lockDuration: 60000 },
);
worker.on('error', (error) =>
  console.error(JSON.stringify({ level: 'error', message: error.message })),
);
worker.on('failed', (job, error) =>
  console.error(JSON.stringify({ level: 'error', jobId: job?.id, message: error.message })),
);
await initializeSharing();
let pending: Promise<void> | null = null;
let closing = false;
let nextHealth = 0;
async function tick() {
  if (pending || closing) return;
  pending = (async () => {
    await reconcileDeployments();
    await reconcileSharing();
    if (Date.now() >= nextHealth) {
      await monitorHealth();
      nextHealth = Date.now() + positiveInt(process.env.HEALTH_INTERVAL_MS, 10000);
    }
  })()
    .catch((error) => console.error(errorMessage(error)))
    .finally(() => {
      pending = null;
    });
  await pending;
}
const heartbeat = () => {
  void queue.client
    .then((client) => client.set(heartbeatKey(), String(Date.now()), 'EX', 30))
    .catch((error) => console.error(errorMessage(error)));
};
heartbeat();
const heartbeatTimer = setInterval(heartbeat, 5000);
await tick();
const timer = setInterval(() => {
  void tick();
}, 5000);
console.info(JSON.stringify({ level: 'info', message: 'DeployGrid worker ready' }));
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    if (closing) return;
    closing = true;
    clearInterval(timer);
    clearInterval(heartbeatTimer);
    await worker.close();
    await pending;
    await closeSharing();
    await queue.close();
    await db.$disconnect();
    process.exit(0);
  });
