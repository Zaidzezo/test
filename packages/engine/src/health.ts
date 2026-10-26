import { db, type RuntimeStatus } from '@deploygrid/database';
import { healthAccepted, positiveInt, errorMessage } from '@deploygrid/shared';
import { owned } from './docker.js';
export async function checkProjectHealth(id: string) {
  const p = await db.project.findUnique({ where: { id }, include: { currentDeployment: true } });
  const d = p?.currentDeployment;
  if (!p || !d?.containerId || p.operationToken) return;
  let status: RuntimeStatus = 'UNKNOWN',
    httpStatus: number | null = null,
    responseTimeMs: number | null = null,
    message: string | null = null;
  const start = Date.now();
  try {
    const container = await owned(d.containerId, p.id);
    if (!container.State.Running) {
      status = p.desiredRunning ? 'DEGRADED' : 'STOPPED';
      message = p.desiredRunning ? 'Application container exited unexpectedly' : null;
    } else if (!p.desiredRunning) {
      status = 'DEGRADED';
      message = 'Container is running although the service was stopped';
    } else {
      const binding = container.NetworkSettings.Ports[`${d.containerPort}/tcp`]?.[0];
      if (!binding || binding.HostIp !== '127.0.0.1')
        throw new Error('Application has no loopback port');
      const port = Number(binding.HostPort);
      if (port !== d.hostPort)
        await db.deployment.update({ where: { id: d.id }, data: { hostPort: port } });
      const response = await fetch(`http://127.0.0.1:${port}${d.healthPath}`, {
        signal: AbortSignal.timeout(2000),
        redirect: 'manual',
      });
      httpStatus = response.status;
      await response.body?.cancel();
      status = healthAccepted(httpStatus) ? 'RUNNING' : 'DEGRADED';
      if (status !== 'RUNNING') message = `Health endpoint returned HTTP ${httpStatus}`;
    }
  } catch (error) {
    status = 'DEGRADED';
    message = errorMessage(error);
  }
  responseTimeMs = Date.now() - start;
  const failures = status === 'RUNNING' || status === 'STOPPED' ? 0 : p.healthFailures + 1;
  const effective =
    status === 'DEGRADED' && failures < positiveInt(process.env.HEALTH_FAILURE_THRESHOLD, 3)
      ? p.runtimeStatus
      : status;
  await db.$transaction(async (tx) => {
    const updated = await tx.project.updateMany({
      where: {
        id,
        currentDeploymentId: d.id,
        operationToken: null,
        desiredRunning: p.desiredRunning,
      },
      data: {
        runtimeStatus: effective,
        healthFailures: failures,
        lastCheckedAt: new Date(),
        healthMessage: message,
      },
    });
    if (!updated.count) return;
    await tx.healthCheck.create({
      data: { projectId: id, deploymentId: d.id, status, httpStatus, responseTimeMs, message },
    });
    if (effective !== p.runtimeStatus)
      await tx.deploymentEvent.create({
        data: {
          deploymentId: d.id,
          type: 'health',
          level: effective === 'RUNNING' ? 'info' : 'warning',
          message:
            effective === 'RUNNING'
              ? 'Application recovered and is responding'
              : (message ?? effective),
        },
      });
  });
}
export async function monitorHealth() {
  const projects = await db.project.findMany({
    where: { currentDeploymentId: { not: null } },
    select: { id: true },
  });
  for (let offset = 0; offset < projects.length; offset += 4)
    await Promise.all(
      projects.slice(offset, offset + 4).map(async (p) => {
        try {
          await checkProjectHealth(p.id);
        } catch (error) {
          console.error('Health monitor:', errorMessage(error));
        }
      }),
    );
  await db.healthCheck.deleteMany({
    where: { checkedAt: { lt: new Date(Date.now() - 7 * 86400000) } },
  });
}
