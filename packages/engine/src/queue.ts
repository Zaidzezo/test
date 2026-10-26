import { Queue } from 'bullmq';
export const connection = (() => {
  const url = new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    db: Number(url.pathname.slice(1) || 0),
    maxRetriesPerRequest: null,
  };
})();
export const queue = new Queue(process.env.DEPLOYGRID_QUEUE_NAME ?? 'deploygrid', {
  connection: { ...connection, maxRetriesPerRequest: 1, enableOfflineQueue: false },
  defaultJobOptions: { removeOnComplete: 100, removeOnFail: 100 },
});
export async function enqueue(deploymentId: string, projectId: string) {
  await queue.add('deploy', { deploymentId, projectId }, { jobId: deploymentId });
}

queue.on('error', (error) =>
  console.error(JSON.stringify({ level: 'error', component: 'queue', message: error.message })),
);

export const heartbeatKey = () => `${queue.name}:worker:heartbeat`;
