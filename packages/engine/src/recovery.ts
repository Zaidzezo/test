import { db } from '@deploygrid/database';
import { queue, enqueue } from './queue.js';
import { failDeployment } from './store.js';
import { cleanupDeployment } from './cleanup.js';
import { errorMessage } from '@deploygrid/shared';
export async function reconcileDeployments() {
  const pending = await db.deployment.findMany({
    where: { status: { notIn: ['SUCCEEDED', 'FAILED'] } },
  });
  for (const d of pending)
    try {
      const job = await queue.getJob(d.id);
      const state = job ? await job.getState() : 'missing';
      if (d.status === 'QUEUED') {
        if (state === 'missing') await enqueue(d.id, d.projectId);
        else if (state === 'failed' || state === 'completed') {
          await job!.remove();
          await enqueue(d.id, d.projectId);
        }
      } else if (['missing', 'failed', 'completed'].includes(state)) {
        await failDeployment(d.id, 'Abandoned deployment recovered; create a new attempt.');
        await db.deployment.update({ where: { id: d.id }, data: { cleanupPending: true } });
      }
    } catch (error) {
      console.error('Deployment reconciliation failed:', errorMessage(error));
    }
  for (const d of await db.deployment.findMany({
    where: { cleanupPending: true, status: { in: ['SUCCEEDED', 'FAILED'] } },
    select: { id: true },
  }))
    try {
      await cleanupDeployment(d.id);
    } catch (error) {
      console.error('Cleanup retry failed:', errorMessage(error));
    }
  for (const p of await db.project.findMany({ where: { operationToken: { not: null } } }))
    try {
      const job = await queue.getJob(p.operationToken!);
      if (!job || ['failed', 'completed'].includes(await job.getState()))
        await db.project.updateMany({
          where: { id: p.id, operationToken: p.operationToken },
          data: { operationToken: null },
        });
    } catch (error) {
      console.error('Runtime reconciliation failed:', errorMessage(error));
    }
}
