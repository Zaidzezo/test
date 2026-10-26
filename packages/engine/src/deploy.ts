import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from '@deploygrid/database';
import { errorMessage, positiveInt, terminal } from '@deploygrid/shared';
import { run } from './process.js';
import { transition, failDeployment, LogBuffer } from './store.js';
import { imageName, labels, startCandidate, verifyHealth, owned } from './docker.js';
import { deploymentEnvironment, redact } from './environment.js';
import { cleanupDeployment, removeWorkspace } from './cleanup.js';
export async function cloneRepository(
  url: string,
  branch: string,
  directory: string,
  log: (text: string) => void,
) {
  await run(
    'git',
    ['clone', '--depth', '1', ...(branch ? ['--branch', branch] : []), '--', url, directory],
    { timeout: 120000, log },
  );
}
export async function deploy(
  id: string,
  clone = cloneRepository,
  makeLog: (id: string, scrub: (text: string) => string) => LogBuffer = (id, scrub) =>
    new LogBuffer(id, scrub),
) {
  const d = await db.deployment.findUniqueOrThrow({ where: { id } });
  if (terminal(d.status)) return;
  const p = await db.project.findUniqueOrThrow({ where: { id: d.projectId } });
  if (p.activeDeploymentId !== id) {
    await failDeployment(id, 'Deployment no longer owns the reservation');
    return;
  }
  if (d.status !== 'QUEUED') {
    await failDeployment(id, 'Interrupted attempt recovered. Deploy again to retry.');
    await db.deployment.update({ where: { id }, data: { cleanupPending: true } });
    await cleanupDeployment(id);
    return;
  }
  let directory: string | undefined;
  let promoted = false;
  let environment: Record<string, string> = {};
  const scrub = (text: string) => redact(text, environment);
  const log = makeLog(id, scrub);
  const flushTimer = setInterval(() => {
    void log.flush().catch(() => console.error('Deployment log flush failed; will retry.'));
  }, 1000);
  try {
    environment = deploymentEnvironment(d.environmentSnapshot);
    await transition(
      id,
      'CLONING',
      d.kind === 'ROLLBACK' ? 'Restoring a previously successful image' : 'CLONING',
    );
    let image = d.imageTag;
    if (d.kind === 'ROLLBACK') {
      if (!image) throw new Error('The selected deployment has no retained image');
      const info = JSON.parse(await run('docker', ['image', 'inspect', image])) as {
        Config: { Labels: Record<string, string> };
      }[];
      if (
        info[0]?.Config.Labels['deploygrid.project'] !== p.id ||
        info[0]?.Config.Labels['deploygrid.managed'] !== 'true'
      )
        throw new Error('Rollback image is missing or is not owned by this service');
      await transition(id, 'BUILDING', 'Reusing retained image; no rebuild required');
      log.append('Retained image verified.\n');
    } else {
      directory = await mkdtemp(join(tmpdir(), 'deploygrid-'));
      await db.deployment.update({ where: { id }, data: { workspacePath: directory } });
      await clone(d.repositoryUrl, d.branch, directory, log.append);
      const sha = await run('git', ['rev-parse', 'HEAD'], { cwd: directory });
      for (const file of ['Dockerfile', 'package.json'])
        if (!(await stat(join(directory, file))).isFile())
          throw new Error(`Required root ${file} is missing`);
      image = imageName(p.id, id);
      await db.deployment.update({ where: { id }, data: { commitSha: sha, imageTag: image } });
      await transition(id, 'BUILDING');
      await run(
        'docker',
        [
          'build',
          ...['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy']
            .filter((key) => process.env[key])
            .flatMap((key) => ['--build-arg', key]),
          '--progress',
          'plain',
          '-t',
          image,
          ...labels(p.id, id),
          '.',
        ],
        {
          cwd: directory,
          timeout: positiveInt(process.env.BUILD_TIMEOUT_MS, 600000),
          log: log.append,
        },
      );
    }
    await transition(id, 'STARTING');
    const candidate = await startCandidate(id, p.id, d.containerPort, image!, environment);
    await db.deployment.update({ where: { id }, data: candidate });
    await transition(id, 'VERIFYING');
    await verifyHealth(candidate.hostPort, d.healthPath, undefined, async () => {
      const c = await owned(candidate.containerId, p.id);
      if (c.State.Status !== 'running') throw new Error(`Candidate container is ${c.State.Status}`);
    });
    await db.$transaction(async (tx) => {
      const lock = await tx.project.updateMany({
        where: { id: p.id, activeDeploymentId: id },
        data: {
          currentDeploymentId: id,
          activeDeploymentId: null,
          runtimeStatus: 'RUNNING',
          desiredRunning: true,
          healthFailures: 0,
          healthMessage: null,
        },
      });
      if (!lock.count) throw new Error('Candidate lost its promotion reservation');
      const updated = await tx.deployment.updateMany({
        where: { id, status: 'VERIFYING' },
        data: { status: 'SUCCEEDED', finishedAt: new Date() },
      });
      if (!updated.count) throw new Error('Candidate changed before promotion');
      await tx.deploymentEvent.create({
        data: { deploymentId: id, type: 'state', message: 'SUCCEEDED' },
      });
      if (p.currentDeploymentId)
        await tx.deployment.update({
          where: { id: p.currentDeploymentId },
          data: { cleanupPending: true },
        });
    });
    promoted = true;
    if (p.currentDeploymentId) await cleanupDeployment(p.currentDeploymentId);
  } catch (error) {
    const message = scrub(errorMessage(error));
    log.append(message + '\n');
    if (promoted) {
      await db.deploymentEvent.create({
        data: { deploymentId: id, type: 'warning', level: 'warning', message },
      });
    } else {
      const failed = await db.deployment.findUnique({ where: { id } });
      if (failed?.containerId)
        try {
          await owned(failed.containerId, p.id);
          log.append((await run('docker', ['logs', '--tail', '50', failed.containerId])) + '\n');
        } catch {
          log.append('Container diagnostics unavailable.\n');
        }
      // Persist terminal state and release the reservation even if Docker cleanup fails.
      await failDeployment(id, message);
      await db.deployment.update({ where: { id }, data: { cleanupPending: true } });
      await cleanupDeployment(id);
    }
  } finally {
    clearInterval(flushTimer);
    // File removal never depends on successful database log writes.
    try {
      await log.finish();
    } catch {
      console.error('Final deployment logs could not be persisted.');
    }
    if (directory)
      try {
        await removeWorkspace(directory);
        await db.deployment.update({ where: { id }, data: { workspacePath: null } });
      } catch (error) {
        console.error('Workspace cleanup will be retried:', errorMessage(error));
        await db.deployment
          .update({ where: { id }, data: { cleanupPending: true } })
          .catch(() => undefined);
      }
  }
}
