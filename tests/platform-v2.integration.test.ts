import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { mkdtemp, cp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { createConnection, type Socket } from 'node:net';
import { db } from '@deploygrid/database';
import {
  deploy,
  run,
  reserveDeployment,
  removeCandidate,
  saveVariable,
  deploymentEnvironment,
  checkProjectHealth,
  cleanupDeployment,
  createGateway,
  closeGateway,
  LogBuffer,
  queue,
  redact,
} from '@deploygrid/engine';
import { buildApp } from '../apps/api/src/app.js';
const app = await buildApp();
const ids: string[] = [];
let fixture: string;
let gateway: Server;
let gatewayPort: number;
async function project() {
  const p = await db.project.create({
    data: {
      name: 'V2 Integration',
      slug: 'v2-' + randomUUID(),
      repositoryUrl: 'https://github.com/deploygrid/test-fixture',
      healthPath: '/health',
    },
  });
  ids.push(p.id);
  return p;
}
const clone = async (_url: string, _branch: string, path: string, log: (text: string) => void) => {
  await run('git', ['clone', '--', fixture, path]);
  log('Real local Git fixture cloned.\n');
};
async function proxy(host: string, path = '/') {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port: gatewayPort, path, headers: { host } },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk.toString()));
        res.on('end', () => resolve({ status: res.statusCode!, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}
beforeAll(async () => {
  fixture = await mkdtemp(join(tmpdir(), 'deploygrid-v2-fixture-'));
  await cp(resolve('examples/node-api'), fixture, { recursive: true });
  await run('git', ['init', fixture]);
  await run('git', ['-C', fixture, 'add', '.']);
  await run('git', [
    '-C',
    fixture,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@localhost',
    'commit',
    '-m',
    'V2 fixture',
  ]);
  gateway = createGateway();
  await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', resolve));
  gatewayPort = (gateway.address() as { port: number }).port;
});
afterAll(async () => {
  vi.restoreAllMocks();
  await closeGateway(gateway);
  for (const id of ids) {
    const deployments = await db.deployment.findMany({ where: { projectId: id } });
    for (const d of deployments) await removeCandidate(d.id, id);
    for (const image of new Set(
      deployments.map((d) => d.imageTag).filter((tag): tag is string => !!tag),
    ))
      if (await run('docker', ['images', '-q', image])) await run('docker', ['image', 'rm', image]);
    await db.project.delete({ where: { id } });
  }
  await rm(fixture, { recursive: true, force: true });
  await app.close();
  await queue.obliterate({ force: true });
  await queue.close();
  await db.$disconnect();
});
describe('encrypted configuration and API boundaries', () => {
  it('stores write-only ciphertext, snapshots values, rejects unsafe keys and never returns snapshots', async () => {
    const p = await project();
    const secret = 'secret-' + randomUUID();
    const saved = await app.inject({
      method: 'PUT',
      url: `/api/projects/${p.id}/environment`,
      payload: { name: 'GREETING', value: secret },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.body).not.toContain(secret);
    const variable = await db.projectVariable.findFirstOrThrow({ where: { projectId: p.id } });
    expect(variable.encryptedValue).not.toContain(secret);
    const d = await reserveDeployment(p.id);
    expect(deploymentEnvironment(d.environmentSnapshot)).toEqual({ GREETING: secret });
    const list = await app.inject({ url: `/api/projects/${p.id}/environment` });
    expect(list.body).not.toContain(secret);
    expect(list.body).not.toContain('encryptedValue');
    expect((await app.inject({ url: `/api/deployments/${d.id}` })).body).not.toContain(
      'environmentSnapshot',
    );
    expect((await app.inject({ url: `/api/projects/${p.id}` })).body).not.toContain(
      'environmentSnapshot',
    );
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/projects/${p.id}/environment`,
          payload: { name: 'NEW_KEY', value: 'value' },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/projects/${p.id}/environment`,
          payload: { name: 'DOCKER_HOST', value: 'tcp://evil' },
        })
      ).statusCode,
    ).toBe(400);
    await db.project.update({ where: { id: p.id }, data: { activeDeploymentId: null } });
    await db.deployment.update({ where: { id: d.id }, data: { status: 'FAILED' } });
    await saveVariable(p.id, 'GREETING', 'updated');
    expect(deploymentEnvironment(d.environmentSnapshot).GREETING).toBe(secret);
  });
  it('retries buffered logs after a failed write without losing the batch', async () => {
    const p = await project();
    const d = await reserveDeployment(p.id);
    const writer = vi
      .fn(async (lines: string[]) => {
        await db.deploymentEvent.createMany({
          data: lines.map((message) => ({ deploymentId: d.id, type: 'log', message })),
        });
      })
      .mockRejectedValueOnce(new Error('Temporary outage'));
    const buffer = new LogBuffer(
      d.id,
      (text) => redact(text, { TOKEN: 'sensitive-token' }),
      writer,
    );
    buffer.append('value=sensitive-token\n');
    await expect(buffer.flush()).rejects.toThrow('Temporary outage');
    await buffer.flush();
    const events = await db.deploymentEvent.findMany({
      where: { deploymentId: d.id, type: 'log' },
    });
    expect(events.map((e) => e.message)).toEqual(['value=[REDACTED]']);
  });
  it('still removes the temporary checkout when final log persistence fails', async () => {
    const p = await project();
    const d = await reserveDeployment(p.id);
    let directory = '';
    await deploy(
      d.id,
      async (_url, _branch, path, log) => {
        directory = path;
        log('Fixture failed\n');
        throw new Error('Clone fixture failure');
      },
      (id, scrub) =>
        new LogBuffer(id, scrub, async () => {
          throw new Error('Unavailable log store');
        }),
    );
    await expect(stat(directory)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: p.id } })).activeDeploymentId,
    ).toBeNull();
  });
});
describe('real Docker rollback, stable routing and background health', () => {
  it('reuses a retained image and original environment, keeps URL stable and records health without page visits', async () => {
    const p = await project();
    await saveVariable(p.id, 'GREETING', 'first-release');
    const first = await reserveDeployment(p.id);
    await deploy(first.id, clone);
    const a = await db.deployment.findUniqueOrThrow({ where: { id: first.id } });
    expect(a.status, a.errorMessage ?? '').toBe('SUCCEEDED');
    let response = await proxy(`${p.slug}.localhost`);
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body).message).toBe('first-release');
    await saveVariable(p.id, 'GREETING', 'second-release');
    const second = await reserveDeployment(p.id);
    await deploy(second.id, clone);
    const b = await db.deployment.findUniqueOrThrow({ where: { id: second.id } });
    expect(b.status, b.errorMessage ?? '').toBe('SUCCEEDED');
    response = await proxy(`${p.slug}.localhost`);
    expect(JSON.parse(response.body).message).toBe('second-release');
    const rollback = await reserveDeployment(p.id, a.id);
    const neverClone = vi.fn(async () => {
      throw new Error('Rollback must not clone');
    });
    await deploy(rollback.id, neverClone);
    expect(neverClone).not.toHaveBeenCalled();
    const restored = await db.deployment.findUniqueOrThrow({ where: { id: rollback.id } });
    expect(restored.status, restored.errorMessage ?? '').toBe('SUCCEEDED');
    expect(restored.kind).toBe('ROLLBACK');
    expect(restored.imageTag).toBe(a.imageTag);
    response = await proxy(`${p.slug}.localhost`);
    expect(JSON.parse(response.body).message).toBe('first-release');
    await checkProjectHealth(p.id);
    expect((await db.project.findUniqueOrThrow({ where: { id: p.id } })).runtimeStatus).toBe(
      'RUNNING',
    );
    await run('docker', ['stop', restored.containerId!]);
    for (let i = 0; i < 3; i++) await checkProjectHealth(p.id);
    const degraded = await db.project.findUniqueOrThrow({ where: { id: p.id } });
    expect(degraded.runtimeStatus).toBe('DEGRADED');
    expect(await db.healthCheck.count({ where: { projectId: p.id } })).toBe(4);
    const health = await app.inject({ url: `/api/projects/${p.id}/health-checks` });
    expect(health.json()[0].status).toBe('DEGRADED');
    await db.project.update({ where: { id: p.id }, data: { desiredRunning: false } });
    await checkProjectHealth(p.id);
    expect((await db.project.findUniqueOrThrow({ where: { id: p.id } })).runtimeStatus).toBe(
      'STOPPED',
    );
    expect((await proxy(`${p.slug}.localhost`)).status).toBe(404);
    expect((await proxy('localhost')).status).toBe(404);
  });
  it('records failed cleanup for retry without changing the current release', async () => {
    const p = await project();
    const old = await db.deployment.create({
      data: {
        projectId: p.id,
        repositoryUrl: p.repositoryUrl,
        branch: '',
        containerPort: 3000,
        healthPath: '/',
        status: 'FAILED',
        cleanupPending: true,
        workspacePath: '/do-not-delete',
      },
    });
    await cleanupDeployment(old.id);
    const d = await db.deployment.findUniqueOrThrow({ where: { id: old.id } });
    expect(d.cleanupPending).toBe(true);
    expect(d.cleanupError).toContain('unexpected workspace');
  });
});
describe('gateway streaming and tunnel boundaries', () => {
  it('forwards paths, query strings and HTTP upgrades without exposing the dashboard', async () => {
    const upstream = createServer((req, res) => res.end(req.url));
    const sockets = new Set<Socket>();
    upstream.on('connection', (socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    upstream.on('upgrade', (req, socket) => {
      const accept = createHash('sha1')
        .update(String(req.headers['sec-websocket-key']) + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');
      socket.write(
        `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
      );
      socket.on('data', (data) => socket.write(data));
    });
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const port = (upstream.address() as { port: number }).port;
    const p = await project();
    const d = await db.deployment.create({
      data: {
        projectId: p.id,
        repositoryUrl: p.repositoryUrl,
        branch: '',
        containerPort: 3000,
        healthPath: '/',
        status: 'SUCCEEDED',
        hostPort: port,
      },
    });
    await db.project.update({ where: { id: p.id }, data: { currentDeploymentId: d.id } });
    try {
      expect((await proxy(`${p.slug}.localhost`, '/assets/app.js?v=2')).body).toBe(
        '/assets/app.js?v=2',
      );
      await new Promise<void>((resolve, reject) => {
        const socket = createConnection({ host: '127.0.0.1', port: gatewayPort });
        let handshake = false;
        socket.setTimeout(5000, () => {
          socket.destroy();
          reject(new Error('Upgrade timed out'));
        });
        socket.on('error', reject);
        socket.on('connect', () =>
          socket.write(
            `GET /socket HTTP/1.1\r\nHost: ${p.slug}.localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`,
          ),
        );
        socket.on('data', (data) => {
          if (!handshake) {
            expect(data.toString()).toContain('101 Switching Protocols');
            handshake = true;
            socket.write('gateway-echo');
          } else {
            expect(data.toString()).toContain('gateway-echo');
            socket.destroy();
            resolve();
          }
        });
      });
      expect((await proxy('127.0.0.1', '/api/projects')).status).toBe(404);
    } finally {
      for (const socket of sockets) socket.destroy();
      upstream.closeAllConnections();
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    }
  });
  it('requires an actual running deployment and explicit confirmation before public sharing', async () => {
    const p = await project();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/projects/${p.id}/sharing`,
          payload: { enabled: true, confirmPublic: true },
        })
      ).statusCode,
    ).toBe(409);
    const d = await db.deployment.create({
      data: {
        projectId: p.id,
        repositoryUrl: p.repositoryUrl,
        branch: '',
        containerPort: 3000,
        healthPath: '/',
        status: 'SUCCEEDED',
        hostPort: 12345,
      },
    });
    await db.project.update({ where: { id: p.id }, data: { currentDeploymentId: d.id } });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/projects/${p.id}/sharing`,
          payload: { enabled: true },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/projects/${p.id}/sharing`,
          payload: { enabled: true, confirmPublic: true },
        })
      ).json().status,
    ).toBe('STARTING');
    expect((await db.project.findUniqueOrThrow({ where: { id: p.id } })).publicUrl).toBeNull();
  });
});
