import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@deploygrid/database';
import {
  AppError,
  variableSchema,
  variableKeySchema,
  environmentUpdateSchema,
} from '@deploygrid/shared';
import {
  saveVariable,
  encrypt,
  reserveDeploymentInTransaction,
  deleteVariable,
  reserveDeployment,
  enqueue,
  queue,
  heartbeatKey,
  run,
} from '@deploygrid/engine';
import { deploymentDto } from './serialize.js';
const params = z.object({ id: z.string().min(1).max(100) });
export async function registerPlatformRoutes(app: FastifyInstance) {
  app.get('/api/projects/:id/environment', async (req) => {
    const { id } = params.parse(req.params);
    await db.project.findUniqueOrThrow({ where: { id } });
    return db.projectVariable.findMany({
      where: { projectId: id },
      select: { name: true, updatedAt: true },
      orderBy: { name: 'asc' },
    });
  });
  app.put('/api/projects/:id/environment', async (req, reply) => {
    const { id } = params.parse(req.params);
    const variable = variableSchema.parse(req.body);
    await saveVariable(id, variable.name, variable.value);
    return reply.code(200).send({ name: variable.name, configured: true });
  });
  app.delete('/api/projects/:id/environment/:name', async (req, reply) => {
    const p = params.extend({ name: variableKeySchema }).parse(req.params);
    await deleteVariable(p.id, p.name);
    return reply.code(204).send();
  });
  app.post('/api/projects/:id/environment', async (req, reply) => {
    const { id } = params.parse(req.params);
    const body = environmentUpdateSchema.parse(req.body);
    const deployment = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id"=${id} FOR UPDATE`;
      const p = await tx.project.findUnique({ where: { id } });
      if (!p) throw new AppError('NOT_FOUND', 'Service not found', 404);
      if (p.activeDeploymentId || p.operationToken)
        throw new AppError('PROJECT_BUSY', 'Wait for the active operation to finish.', 409);
      for (const { name, value } of body.variables) {
        const encryptedValue = encrypt(value);
        await tx.projectVariable.upsert({
          where: { projectId_name: { projectId: id, name } },
          create: { projectId: id, name, encryptedValue },
          update: { encryptedValue },
        });
      }
      await tx.projectVariable.deleteMany({ where: { projectId: id, name: { in: body.remove } } });
      const d = body.action === 'deploy' ? await reserveDeploymentInTransaction(tx, id) : null;
      const eventTarget = d?.id ?? p.currentDeploymentId;
      if (eventTarget)
        await tx.deploymentEvent.create({
          data: {
            deploymentId: eventTarget,
            type: 'configuration',
            message: 'Environment updated',
          },
        });
      return d;
    });
    if (deployment) {
      try {
        await enqueue(deployment.id, id);
      } catch {
        req.log.warn('Environment deployment persisted; worker will reconcile queue delivery');
      }
    }
    return reply
      .code(deployment ? 202 : 200)
      .send({ saved: true, deploymentId: deployment?.id ?? null });
  });
  app.post('/api/projects/:id/rollback', async (req, reply) => {
    const { id } = params.parse(req.params);
    const { deploymentId } = z.object({ deploymentId: z.string().min(1).max(100) }).parse(req.body);
    const d = await reserveDeployment(id, deploymentId);
    try {
      await enqueue(d.id, id);
    } catch (error) {
      req.log.warn({ error }, 'Rollback queued in PostgreSQL; worker will reconcile');
    }
    return reply.code(202).send(deploymentDto(d));
  });
  app.get('/api/projects/:id/health-checks', async (req) => {
    const { id } = params.parse(req.params);
    const { limit } = z
      .object({ limit: z.coerce.number().int().min(1).max(200).default(60) })
      .parse(req.query);
    return db.healthCheck.findMany({
      where: { projectId: id },
      orderBy: { checkedAt: 'desc' },
      take: limit,
    });
  });
  app.post('/api/projects/:id/sharing', async (req) => {
    const { id } = params.parse(req.params);
    const body = z
      .object({ enabled: z.boolean(), confirmPublic: z.boolean().optional() })
      .parse(req.body);
    const p = await db.project.findUniqueOrThrow({ where: { id } });
    if (body.enabled && (!p.currentDeploymentId || !p.desiredRunning))
      throw new AppError('NOT_RUNNING', 'Deploy and start this service before sharing it.', 409);
    if (body.enabled && body.confirmPublic !== true)
      throw new AppError(
        'CONFIRM_PUBLIC',
        'Confirm that anyone with the link may access this application.',
      );
    await db.project.update({
      where: { id },
      data: {
        shareEnabled: body.enabled,
        sharingStatus: body.enabled ? 'STARTING' : 'DISABLED',
        publicUrl: null,
        sharingError: null,
      },
    });
    return { enabled: body.enabled, status: body.enabled ? 'STARTING' : 'DISABLED' };
  });
  app.get('/api/activity', async (req) => {
    const { before } = z
      .object({ before: z.coerce.number().int().nonnegative().optional() })
      .parse(req.query);
    return db.deploymentEvent.findMany({
      where: {
        type: { in: ['state', 'health', 'runtime', 'warning', 'configuration'] },
        ...(before ? { id: { lt: before } } : {}),
      },
      orderBy: { id: 'desc' },
      take: 30,
      include: {
        deployment: { select: { id: true, project: { select: { id: true, name: true } } } },
      },
    });
  });
  app.get('/api/system', async () => {
    const result: {
      database: boolean;
      redis: boolean;
      docker: boolean;
      worker: boolean;
      gatewayPort: number;
    } = {
      database: false,
      redis: false,
      docker: false,
      worker: false,
      gatewayPort: Number(process.env.GATEWAY_PORT ?? 8080),
    };
    await Promise.allSettled(
      [
        (async () => {
          await db.$queryRaw`SELECT 1`;
          result.database = true;
        })(),
        (async () => {
          const client = await queue.client;
          await client.ping();
          result.redis = true;
          const heartbeat = await client.get(heartbeatKey());
          result.worker = !!heartbeat && Date.now() - Number(heartbeat) < 30000;
        })(),
        (async () => {
          await run('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 5000 });
          result.docker = true;
        })(),
      ].map(async (operation) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            operation,
            new Promise<void>((resolve) => {
              timer = setTimeout(resolve, 5000);
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      }),
    );
    return result;
  });
}
