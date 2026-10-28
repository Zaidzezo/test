import Fastify from 'fastify';
import type { ServerResponse } from 'node:http';
import cors from '@fastify/cors';
import { z, ZodError } from 'zod';
import { db, Prisma } from '@deploygrid/database';
import { projectSchema, createServiceSchema, AppError } from '@deploygrid/shared';
import {
  reserveDeployment,
  reserveDeploymentInTransaction,
  encrypt,
  enqueue,
  projectInclude,
  scheduleOperation,
  runtimeSnapshot,
  owned,
  run,
} from '@deploygrid/engine';
import { deploymentDto, projectDto } from './serialize.js';
import { registerPlatformRoutes } from './platform-routes.js';
import { deploymentEnvironment, redact } from '@deploygrid/engine';
const params = z.object({ id: z.string().min(1).max(100) });
const cursorSchema = z.object({
  after: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export async function buildApp() {
  const app = Fastify({ logger: true, bodyLimit: 1048576, requestTimeout: 15000 });
  const streams = new Set<ServerResponse>();
  app.addHook('preClose', async () => {
    for (const stream of streams) stream.end();
  });
  const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  const allowedOrigins = new Set([origin]);
  const loopback = new URL(origin);
  if (['localhost', '127.0.0.1'].includes(loopback.hostname)) {
    loopback.hostname = loopback.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
    allowedOrigins.add(loopback.origin);
  }
  await app.register(cors, {
    origin: [...allowedOrigins],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  app.addHook('onRequest', async (req, reply) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers.origin &&
      !allowedOrigins.has(req.headers.origin)
    )
      return reply
        .code(403)
        .send({ error: { code: 'ORIGIN_DENIED', message: 'Untrusted request origin' } });
  });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        },
      });
    if (error instanceof AppError)
      return reply
        .code(error.statusCode)
        .send({ error: { code: error.code, message: error.message } });
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002')
        return reply.code(409).send({
          error: { code: 'CONFLICT', message: 'A project with this slug already exists' },
        });
      if (error.code === 'P2025')
        return reply
          .code(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
    }
    req.log.error(error);
    reply.code(503).send({
      error: {
        code: 'INFRASTRUCTURE_ERROR',
        message: 'An infrastructure operation failed. Check service logs.',
      },
    });
  });
  app.get('/api/health', async () => {
    await db.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  });
  app.get('/api/projects', async () =>
    (
      await db.project.findMany({
        include: projectInclude,
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
    ).map(projectDto),
  );
  app.post('/api/projects', async (req, reply) => {
    const { variables, deploy, ...data } = createServiceSchema.parse(req.body);
    const { project, deployment } = await db.$transaction(async (tx) => {
      const project = await tx.project.create({ data });
      if (variables.length)
        await tx.projectVariable.createMany({
          data: variables.map(({ name, value }) => ({
            projectId: project.id,
            name,
            encryptedValue: encrypt(value),
          })),
        });
      const deployment = deploy ? await reserveDeploymentInTransaction(tx, project.id) : null;
      return { project, deployment };
    });
    if (deployment) {
      try {
        await enqueue(deployment.id, project.id);
      } catch {
        req.log.warn('First deployment persisted; worker will reconcile queue delivery');
      }
    }
    return reply
      .code(201)
      .send({ ...projectDto(project), initialDeploymentId: deployment?.id ?? null });
  });
  app.get('/api/projects/:id', async (req) =>
    projectDto(
      await db.project.findUniqueOrThrow({
        where: params.parse(req.params),
        include: projectInclude,
      }),
    ),
  );
  app.patch('/api/projects/:id', async (req) => {
    const { id } = params.parse(req.params);
    const data = projectSchema.omit({ slug: true }).partial().parse(req.body);
    const result = await db.project.updateMany({
      where: { id, activeDeploymentId: null, operationToken: null },
      data,
    });
    if (!result.count) throw new AppError('PROJECT_BUSY', 'Project is missing or busy', 409);
    return projectDto(await db.project.findUniqueOrThrow({ where: { id } }));
  });
  app.delete('/api/projects/:id', async (req, reply) => {
    const { id } = params.parse(req.params);
    z.object({ confirm: z.literal(true) }).parse(req.body);
    return reply.code(202).send(await scheduleOperation(id, 'delete'));
  });
  app.post('/api/projects/:id/deployments', async (req, reply) => {
    const { id } = params.parse(req.params);
    const d = await reserveDeployment(id);
    try {
      await enqueue(d.id, id);
    } catch (error) {
      req.log.warn({ error }, 'Enqueue failed; queued record will be reconciled');
    }
    return reply.code(202).send(deploymentDto(d));
  });
  app.get('/api/projects/:id/deployments', async (req) => {
    const { id } = params.parse(req.params);
    const { after, limit } = cursorSchema.parse(req.query);
    return (
      await db.deployment.findMany({
        where: { projectId: id },
        orderBy: { createdAt: 'desc' },
        skip: after,
        take: limit,
      })
    ).map(deploymentDto);
  });
  app.get('/api/deployments/:id', async (req) =>
    deploymentDto(await db.deployment.findUniqueOrThrow({ where: params.parse(req.params) })),
  );
  app.get('/api/deployments/:id/logs', async (req) => {
    const { id } = params.parse(req.params);
    const { after, limit } = cursorSchema.parse(req.query);
    return db.deploymentEvent.findMany({
      where: { deploymentId: id, id: { gt: after } },
      orderBy: { id: 'asc' },
      take: limit,
    });
  });
  app.get('/api/deployments/:id/events', async (req, reply) => {
    const { id } = params.parse(req.params);
    await db.deployment.findUniqueOrThrow({ where: { id } });
    let after = z.coerce
      .number()
      .int()
      .nonnegative()
      .parse(req.headers['last-event-id'] ?? (req.query as { after?: string }).after ?? 0);
    streams.add(reply.raw);
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin':
        req.headers.origin && allowedOrigins.has(req.headers.origin) ? req.headers.origin : origin,
      Vary: 'Origin',
      'X-Accel-Buffering': 'no',
      'Content-Encoding': 'identity',
    });
    let closed = false;
    let busy = false;
    const tick = async () => {
      if (busy || closed || reply.raw.writableNeedDrain) return;
      busy = true;
      try {
        const events = await db.deploymentEvent.findMany({
          where: { deploymentId: id, id: { gt: after } },
          orderBy: { id: 'asc' },
          take: 200,
        });
        for (const event of events) {
          if (closed) break;
          after = event.id;
          if (!reply.raw.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`)) break;
        }
        if (!closed) reply.raw.write(': heartbeat\n\n');
      } catch (error) {
        req.log.error(error);
        reply.raw.end();
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => {
      void tick();
    }, 1000);
    reply.raw.on('close', () => {
      closed = true;
      streams.delete(reply.raw);
      clearInterval(timer);
    });
    await tick();
  });
  for (const action of ['start', 'stop', 'restart'])
    app.post(`/api/projects/:id/${action}`, async (req, reply) =>
      reply.code(202).send(await scheduleOperation(params.parse(req.params).id, action)),
    );
  async function current(id: string) {
    const p = await db.project.findUniqueOrThrow({
      where: { id },
      include: { currentDeployment: true },
    });
    if (!p.currentDeployment?.containerId)
      throw new AppError('NOT_DEPLOYED', 'No current application container', 409);
    return { p, d: p.currentDeployment };
  }
  app.get('/api/projects/:id/metrics', async (req) => {
    const { p, d } = await current(params.parse(req.params).id);
    return runtimeSnapshot(d.containerId!, p.id);
  });
  app.get('/api/projects/:id/runtime-logs', async (req) => {
    const { p, d } = await current(params.parse(req.params).id);
    await owned(d.containerId!, p.id);
    return {
      text: redact(
        await run('docker', ['logs', '--tail', '200', '--timestamps', d.containerId!]),
        deploymentEnvironment(d.environmentSnapshot),
      ),
    };
  });
  await registerPlatformRoutes(app);
  return app;
}
