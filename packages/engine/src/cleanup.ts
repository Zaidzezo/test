import { rm } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { db } from '@deploygrid/database';
import { errorMessage } from '@deploygrid/shared';
import { owned, removeCandidate } from './docker.js';
import { run } from './process.js';
export async function removeWorkspace(path: string) {
  const resolved = resolve(path);
  if (dirname(resolved) !== resolve(tmpdir()) || !basename(resolved).startsWith('deploygrid-'))
    throw new Error('Refusing to remove an unexpected workspace path');
  await rm(resolved, { recursive: true, force: true });
}
export async function cleanupDeployment(id: string) {
  const d = await db.deployment.findUnique({ where: { id }, include: { project: true } });
  if (!d) return;
  if (d.project.currentDeploymentId === id || d.project.activeDeploymentId === id) return;
  try {
    if (d.status === 'FAILED') {
      await removeCandidate(id, d.projectId);
      // A failed rollback shares a retained successful image; only a fresh failed build owns its tag.
      if (
        d.kind !== 'ROLLBACK' &&
        d.imageTag &&
        (await run('docker', ['images', '-q', d.imageTag]))
      ) {
        const images = JSON.parse(await run('docker', ['image', 'inspect', d.imageTag])) as {
          Config: { Labels: Record<string, string> };
        }[];
        const labels = images[0]?.Config.Labels;
        if (
          labels?.['deploygrid.managed'] !== 'true' ||
          labels['deploygrid.project'] !== d.projectId ||
          labels['deploygrid.deployment'] !== id
        )
          throw new Error('Refusing to remove an unowned failed release image');
        await run('docker', ['image', 'rm', d.imageTag]);
      }
    } else if (d.status === 'SUCCEEDED' && d.containerId) {
      // A missing old container is already clean; do not touch a container outside this project.
      const ids = await run('docker', [
        'ps',
        '-aq',
        '--filter',
        'label=deploygrid.managed=true',
        '--filter',
        `label=deploygrid.project=${d.projectId}`,
        '--filter',
        `label=deploygrid.deployment=${id}`,
      ]);
      if (ids) {
        await owned(d.containerId, d.projectId);
        await run('docker', ['stop', d.containerId]);
      }
    }
    if (d.workspacePath) await removeWorkspace(d.workspacePath);
    await db.deployment.update({
      where: { id },
      data: { cleanupPending: false, cleanupError: null, workspacePath: null },
    });
  } catch (error) {
    await db.deployment.update({
      where: { id },
      data: { cleanupPending: true, cleanupError: errorMessage(error) },
    });
  }
}
