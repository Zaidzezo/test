import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { mkdtemp, cp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { db } from '@deploygrid/database';
import {
  deploy,
  run,
  reserveDeployment,
  removeCandidate,
  owned,
  runtimeSnapshot,
  runtimeOperation,
  queue,
  transition,
} from '@deploygrid/engine';
import { buildApp } from '../apps/api/src/app.js';
const app = await buildApp();
const projectIds: string[] = [];
let fixture: string;
const clone = async (_url: string, _branch: string, path: string) => {
  await run('git', ['clone', '--', fixture, path]);
};
async function commitFixture(dockerfile: string) {
  await writeFile(join(fixture, 'Dockerfile'), dockerfile);
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
    'Failure fixture',
  ]);
}
async function newProject() {
  const p = await db.project.create({
    data: {
      name: 'Integration',
      slug: 'test-' + randomUUID(),
      repositoryUrl: 'https://github.com/deploygrid/fixture',
      healthPath: '/health',
    },
  });
  projectIds.push(p.id);
  return p;
}
beforeAll(async () => {
  await run('docker', ['info', '--format', '{{.ServerVersion}}']);
  await db.$queryRaw`SELECT 1`;
  fixture = await mkdtemp(join(tmpdir(), 'deploygrid-fixture-'));
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
    'Fixture',
  ]);
});
afterAll(async () => {
  for (const id of projectIds) {
    for (const d of await db.deployment.findMany({ where: { projectId: id } })) {
      await removeCandidate(d.id, id);
      if (d.imageTag && (await run('docker', ['images', '-q', d.imageTag])))
        await run('docker', ['image', 'rm', d.imageTag]);
    }
    await db.project.delete({ where: { id } });
  }
  if (fixture) await rm(fixture, { recursive: true, force: true });
  await app.close();
  if (process.env.DEPLOYGRID_QUEUE_NAME?.startsWith('deploygrid_test_'))
    await queue.obliterate({ force: true });
  await queue.close();
  await db.$disconnect();
});
describe('database and REST', () => {
  it('creates, validates and retrieves projects', async () => {
    const slug = 'api-' + randomUUID();
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'API fixture', slug, repositoryUrl: 'https://github.com/acme/app' },
    });
    expect(res.statusCode).toBe(201);
    const p = res.json();
    projectIds.push(p.id);
    expect((await app.inject({ url: '/api/projects/' + p.id })).json().slug).toBe(slug);
    expect(
      (await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Invalid' } }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/projects',
          headers: { origin: 'https://evil.test' },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
  });
  it('accepts exactly one simultaneous deployment and persists ordered events', async () => {
    const p = await newProject();
    const responses = await Promise.all([
      app.inject({ method: 'POST', url: `/api/projects/${p.id}/deployments` }),
      app.inject({ method: 'POST', url: `/api/projects/${p.id}/deployments` }),
    ]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([202, 409]);
    const d = await db.deployment.findFirstOrThrow({ where: { projectId: p.id } });
    expect(await db.deployment.count({ where: { projectId: p.id } })).toBe(1);
    await transition(d.id, 'CLONING');
    await expect(transition(d.id, 'SUCCEEDED')).rejects.toThrow();
    const events = await db.deploymentEvent.findMany({
      where: { deploymentId: d.id },
      orderBy: { id: 'asc' },
    });
    expect(events.map((e) => e.message)).toEqual(['QUEUED', 'CLONING']);
    await deploy(d.id, clone);
    expect((await db.deployment.findUniqueOrThrow({ where: { id: d.id } })).status).toBe('FAILED');
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: p.id } })).activeDeploymentId,
    ).toBeNull();
  });
});
describe('real Docker vertical slice', () => {
  it('builds, verifies, redeploys, preserves on failure, reads metrics/logs and controls containers', async () => {
    const p = await newProject();
    const first = await reserveDeployment(p.id);
    await deploy(first.id, clone);
    const d = await db.deployment.findUniqueOrThrow({ where: { id: first.id } });
    expect(d.errorMessage).toBeNull();
    expect(d.status).toBe('SUCCEEDED');
    expect(d.commitSha).toMatch(/^[a-f0-9]{40}$/);
    expect((await fetch(`http://127.0.0.1:${d.hostPort}/health`)).status).toBe(200);
    expect((await runtimeSnapshot(d.containerId!, p.id)).running).toBe(true);
    expect(await run('docker', ['logs', d.containerId!])).toContain('Example listening');
    await deploy(first.id, clone);
    expect((await owned(d.containerId!, p.id)).State.Running).toBe(true);
    const next = await reserveDeployment(p.id);
    await deploy(next.id, clone);
    const second = await db.deployment.findUniqueOrThrow({ where: { id: next.id } });
    expect(second.status).toBe('SUCCEEDED');
    expect((await owned(d.containerId!, p.id)).State.Running).toBe(false);
    await writeFile(
      join(fixture, 'Dockerfile'),
      'FROM node:22-alpine\nRUN node -e "process.exit(1)"\n',
    );
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
      'Broken build',
    ]);
    const broken = await reserveDeployment(p.id);
    await deploy(broken.id, clone);
    expect((await db.deployment.findUniqueOrThrow({ where: { id: broken.id } })).status).toBe(
      'FAILED',
    );
    expect((await db.project.findUniqueOrThrow({ where: { id: p.id } })).currentDeploymentId).toBe(
      second.id,
    );
    expect((await owned(second.containerId!, p.id)).State.Running).toBe(true);
    for (const action of ['stop', 'start', 'restart']) {
      const token = randomUUID();
      await db.project.update({ where: { id: p.id }, data: { operationToken: token } });
      await runtimeOperation(p.id, action, token);
      expect((await owned(second.containerId!, p.id)).State.Running).toBe(action !== 'stop');
    }
    const history = await app.inject({ url: `/api/projects/${p.id}/deployments` });
    expect(history.json().map((x: { id: string }) => x.id)).toEqual([broken.id, next.id, first.id]);
    const logs = await app.inject({ url: `/api/deployments/${broken.id}/logs` });
    expect(logs.json().some((x: { type: string }) => x.type === 'log')).toBe(true);
  });
  it('rejects container startup failure and removes only its candidate', async () => {
    await commitFixture('FROM node:22-alpine\nCMD ["/nonexistent-command"]\n');
    const p = await newProject();
    const d = await reserveDeployment(p.id);
    await deploy(d.id, clone);
    expect((await db.deployment.findUniqueOrThrow({ where: { id: d.id } })).status).toBe('FAILED');
    expect(
      await run('docker', ['ps', '-aq', '--filter', `label=deploygrid.deployment=${d.id}`]),
    ).toBe('');
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: p.id } })).activeDeploymentId,
    ).toBeNull();
  });
  it('rejects a container that never becomes healthy', async () => {
    await commitFixture('FROM node:22-alpine\nCMD ["node", "-e", "setInterval(()=>{},1000)"]\n');
    const old = process.env.HEALTH_TIMEOUT_MS;
    process.env.HEALTH_TIMEOUT_MS = '1000';
    try {
      const p = await newProject();
      const d = await reserveDeployment(p.id);
      await deploy(d.id, clone);
      expect(
        (await db.deployment.findUniqueOrThrow({ where: { id: d.id } })).errorMessage,
      ).toContain('readiness timed out');
      expect((await db.project.findUniqueOrThrow({ where: { id: p.id } })).runtimeStatus).toBe(
        'NOT_DEPLOYED',
      );
      expect(
        await run('docker', ['ps', '-aq', '--filter', `label=deploygrid.deployment=${d.id}`]),
      ).toBe('');
    } finally {
      if (old === undefined) delete process.env.HEALTH_TIMEOUT_MS;
      else process.env.HEALTH_TIMEOUT_MS = old;
    }
  });
  it('releases reservation on clone failure', async () => {
    const p = await newProject();
    const d = await reserveDeployment(p.id);
    await deploy(d.id, async () => {
      throw new Error('Git unavailable');
    });
    expect((await db.deployment.findUniqueOrThrow({ where: { id: d.id } })).errorMessage).toContain(
      'Git unavailable',
    );
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: p.id } })).activeDeploymentId,
    ).toBeNull();
  });
});
