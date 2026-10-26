import { db, Prisma } from '@deploygrid/database';
import { AppError, canTransition, type Status } from '@deploygrid/shared';
import { snapshotEnvironment } from './environment.js';
export async function transition(id: string, to: Status, message: string = to) {
  return db.$transaction(async (tx) => {
    const d = await tx.deployment.findUniqueOrThrow({ where: { id } });
    if (!canTransition(d.status, to))
      throw new AppError('INVALID_TRANSITION', `${d.status} → ${to}`, 409);
    const result = await tx.deployment.updateMany({
      where: { id, status: d.status },
      data: {
        status: to,
        ...(to === 'CLONING' ? { startedAt: new Date() } : {}),
        ...(['SUCCEEDED', 'FAILED'].includes(to) ? { finishedAt: new Date() } : {}),
      },
    });
    if (!result.count) throw new AppError('STATE_CONFLICT', 'Deployment changed concurrently', 409);
    await tx.deploymentEvent.create({
      data: { deploymentId: id, type: 'state', level: to === 'FAILED' ? 'error' : 'info', message },
    });
  });
}
export async function reserveDeployment(projectId: string, sourceDeploymentId?: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT \"id\" FROM \"Project\" WHERE \"id\" = ${projectId} FOR UPDATE`;
    const p = await tx.project.findUnique({ where: { id: projectId } });
    if (!p) throw new AppError('NOT_FOUND', 'Project not found', 404);
    if (p.activeDeploymentId || p.operationToken)
      throw new AppError(
        'PROJECT_BUSY',
        'A deployment or runtime operation is already in progress.',
        409,
      );
    const source = sourceDeploymentId
      ? await tx.deployment.findFirst({
          where: { id: sourceDeploymentId, projectId, status: 'SUCCEEDED' },
        })
      : null;
    if (sourceDeploymentId && (!source?.imageTag || source.id === p.currentDeploymentId))
      throw new AppError(
        'INVALID_ROLLBACK',
        'Choose a previous successful deployment with a retained image.',
        409,
      );
    const snapshot = source
      ? source.environmentSnapshot
      : snapshotEnvironment(await tx.projectVariable.findMany({ where: { projectId } }));
    const d = await tx.deployment.create({
      data: {
        projectId,
        repositoryUrl: source?.repositoryUrl ?? p.repositoryUrl,
        branch: source?.branch ?? p.branch,
        containerPort: source?.containerPort ?? p.containerPort,
        healthPath: source?.healthPath ?? p.healthPath,
        environmentSnapshot: snapshot,
        kind: source ? 'ROLLBACK' : 'DEPLOY',
        sourceDeploymentId: source?.id,
        commitSha: source?.commitSha,
        imageTag: source?.imageTag,
      },
    });
    const lock = await tx.project.updateMany({
      where: { id: projectId, activeDeploymentId: null, operationToken: null },
      data: { activeDeploymentId: d.id },
    });
    if (!lock.count)
      throw new AppError(
        'PROJECT_BUSY',
        'A deployment or runtime operation is already in progress.',
        409,
      );
    await tx.deploymentEvent.create({
      data: { deploymentId: d.id, type: 'state', message: 'QUEUED' },
    });
    return d;
  });
}
export async function failDeployment(id: string, message: string) {
  await db.$transaction(async (tx) => {
    const d = await tx.deployment.findUniqueOrThrow({ where: { id } });
    if (d.status === 'SUCCEEDED' || d.status === 'FAILED') return;
    await tx.deployment.update({
      where: { id },
      data: { status: 'FAILED', errorMessage: message, finishedAt: new Date() },
    });
    await tx.deploymentEvent.create({
      data: { deploymentId: id, type: 'state', level: 'error', message },
    });
    await tx.project.updateMany({
      where: { id: d.projectId, activeDeploymentId: id },
      data: { activeDeploymentId: null },
    });
  });
}
export class LogBuffer {
  private lines: string[] = [];
  private count = 0;
  private pending: Promise<void> = Promise.resolve();
  constructor(
    private id: string,
    private scrub: (text: string) => string = (text) => text,
    private writer?: (lines: string[]) => Promise<unknown>,
  ) {}
  private partial = '';
  append = (text: string) => {
    const combined = this.partial + text;
    const lines = combined.split(/\r\n|\n|\r/);
    this.partial = lines.pop() ?? '';
    if (this.partial.length > 65536) {
      this.partial = '';
      lines.push('[Output line exceeded 64 KiB and was omitted]');
    }
    for (const line of lines)
      if (line && this.count++ < 5000) this.lines.push(this.scrub(line).slice(0, 2000));
    if (this.lines.length >= 40)
      void this.flush().catch(() =>
        console.error('Deployment log persistence failed; will retry.'),
      );
  };
  finish() {
    if (this.partial) this.append('\n');
    return this.flush();
  }
  flush(): Promise<void> {
    this.pending = this.pending
      .catch(() => undefined)
      .then(async () => {
        const batch = this.lines.splice(0);
        if (!batch.length) return;
        try {
          if (this.writer) await this.writer(batch);
          else
            await db.deploymentEvent.createMany({
              data: batch.map((message) => ({ deploymentId: this.id, type: 'log', message })),
            });
        } catch (error) {
          this.lines.unshift(...batch);
          throw error;
        }
      });
    return this.pending;
  }
}
export const projectInclude = {
  currentDeployment: true,
  deployments: { orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.ProjectInclude;
