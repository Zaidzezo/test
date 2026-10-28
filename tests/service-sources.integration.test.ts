import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { mkdtemp, cp, mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { db } from '@deploygrid/database';
import {
  deploy,
  reserveDeployment,
  run,
  owned,
  removeCandidate,
  runtimeOperation,
  queue,
} from '@deploygrid/engine';
import { buildApp } from '../apps/api/src/app';
const app = await buildApp();
const ids: string[] = [];
let fixture: string;
const clone = async (_url: string, _branch: string, path: string) => {
  await run('git', ['clone', '--', fixture, path]);
};
async function create(override: Record<string, unknown>) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/projects',
    payload: {
      name: 'Sources test',
      slug: 'source-' + randomUUID(),
      repositoryUrl: 'https://github.com/deploygrid/source-fixture',
      ...override,
    },
  });
  expect(response.statusCode, response.body).toBe(201);
  const p = response.json();
  ids.push(p.id);
  return p;
}
async function release(id: string) {
  const d = await reserveDeployment(id);
  await deploy(d.id, clone);
  const result = await db.deployment.findUniqueOrThrow({ where: { id: d.id } });
  expect(result.status, result.errorMessage ?? '').toBe('SUCCEEDED');
  return result;
}
beforeAll(async () => {
  fixture = await mkdtemp(join(tmpdir(), 'deploygrid-source-fixture-'));
  await mkdir(join(fixture, 'apps'));
  await cp(resolve('examples/static-site'), join(fixture, 'apps/site'), { recursive: true });
  await cp(resolve('examples/node-native'), join(fixture, 'apps/native'), { recursive: true });
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
    'Source fixtures',
  ]);
});
afterAll(async () => {
  for (const id of ids) {
    const history = await db.deployment.findMany({ where: { projectId: id } });
    for (const d of history) await removeCandidate(d.id, id);
    for (const tag of new Set(history.map((d) => d.imageTag).filter((v): v is string => !!v))) {
      if (await run('docker', ['images', '-q', tag])) await run('docker', ['image', 'rm', tag]);
    }
    await db.project.deleteMany({ where: { id } });
  }
  await rm(fixture, { recursive: true, force: true });
  await app.close();
  await queue.obliterate({ force: true });
  await queue.close();
  await db.$disconnect();
});
describe('generated builds and static publication', () => {
  it('builds static assets with secret mounts, serves SPA routes safely, rolls back configuration and deletes owned resources', async () => {
    const secret = 'private-build-' + randomUUID();
    const p = await create({
      serviceType: 'STATIC',
      runtime: 'NODE',
      rootDirectory: 'apps/site',
      buildCommand: `node -e 'console.log(process.env.BUILD_TOKEN)' && node build.mjs`,
      publishDirectory: 'dist',
      spaFallback: true,
      variables: [
        { name: 'PUBLIC_TITLE', value: 'Static first release' },
        { name: 'BUILD_TOKEN', value: secret },
      ],
    });
    const first = await release(p.id);
    const url = `http://127.0.0.1:${first.hostPort}`;
    expect(await (await fetch(url + '/dashboard/nested')).text()).toContain('Static first release');
    const css = await fetch(url + '/site.css');
    expect(css.headers.get('content-type')).toContain('text/css');
    expect((await fetch(url + '/missing.js')).status).toBe(404);
    expect((await fetch(url + '/.env')).status).toBe(404);
    expect((await fetch(url + '/%2e%2e%2fetc/passwd')).status).toBe(404);
    expect((await fetch(url + '/', { method: 'HEAD' })).headers.get('content-length')).toBeTruthy();
    expect((await fetch(url + '/', { method: 'POST' })).status).toBe(405);
    const logs = await db.deploymentEvent.findMany({ where: { deploymentId: first.id } });
    expect(JSON.stringify(logs)).not.toContain(secret);
    expect(JSON.stringify(logs)).toContain('[REDACTED]');
    expect(await run('docker', ['history', '--no-trunc', first.imageTag!])).not.toContain(secret);
    expect(await run('docker', ['image', 'inspect', first.imageTag!])).not.toContain(secret);
    await expect(
      run('docker', ['exec', first.containerId!, 'test', '-e', '/run/secrets/deploygrid_env']),
    ).rejects.toThrow();
    const settings = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${p.id}`,
      payload: { spaFallback: false },
    });
    expect(settings.statusCode).toBe(200);
    const saved = await app.inject({
      method: 'POST',
      url: `/api/projects/${p.id}/environment`,
      payload: {
        variables: [{ name: 'PUBLIC_TITLE', value: 'Static second release' }],
        action: 'deploy',
      },
    });
    const secondId = saved.json().deploymentId;
    await deploy(secondId, clone);
    const second = await db.deployment.findUniqueOrThrow({ where: { id: secondId } });
    expect(second.status, second.errorMessage ?? '').toBe('SUCCEEDED');
    expect(await (await fetch(`http://127.0.0.1:${second.hostPort}/`)).text()).toContain(
      'Static second release',
    );
    expect((await fetch(`http://127.0.0.1:${second.hostPort}/dashboard/nested`)).status).toBe(404);
    const rollback = await reserveDeployment(p.id, first.id);
    await deploy(rollback.id, async () => {
      throw Error('Rollback must not clone');
    });
    const restored = await db.deployment.findUniqueOrThrow({ where: { id: rollback.id } });
    expect(restored.status, restored.errorMessage ?? '').toBe('SUCCEEDED');
    expect(restored.spaFallback).toBe(true);
    expect(
      await (await fetch(`http://127.0.0.1:${restored.hostPort}/dashboard/nested`)).text(),
    ).toContain('Static first release');
    const images = (await db.deployment.findMany({ where: { projectId: p.id } })).map(
      (d) => d.imageTag!,
    );
    const token = randomUUID();
    await db.project.update({ where: { id: p.id }, data: { operationToken: token } });
    await runtimeOperation(p.id, 'delete', token);
    expect(await run('docker', ['ps', '-aq', '--filter', `label=deploygrid.project=${p.id}`])).toBe(
      '',
    );
    for (const image of images) expect(await run('docker', ['images', '-q', image])).toBe('');
  }, 600000);
  it('detects a native Node repository, injects build and runtime variables, and preserves live service on a failed build', async () => {
    const p = await create({
      runtime: 'AUTO',
      rootDirectory: 'apps/native',
      buildCommand: 'node build.mjs',
      startCommand: 'node server.mjs',
      containerPort: 10000,
      variables: [
        { name: 'PUBLIC_TITLE', value: 'Build-time title' },
        { name: 'GREETING', value: 'Runtime greeting' },
      ],
    });
    const first = await release(p.id);
    expect(await (await fetch(`http://127.0.0.1:${first.hostPort}/`)).json()).toEqual({
      title: 'Build-time title',
      greeting: 'Runtime greeting',
      port: '10000',
    });
    const marker = join(tmpdir(), 'deploygrid-host-marker-' + randomUUID());
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${p.id}`,
      payload: { buildCommand: `touch ${marker}; exit 1` },
    });
    expect(response.statusCode).toBe(200);
    const failed = await reserveDeployment(p.id);
    await deploy(failed.id, clone);
    expect((await db.deployment.findUniqueOrThrow({ where: { id: failed.id } })).status).toBe(
      'FAILED',
    );
    expect((await owned(first.containerId!, p.id)).State.Running).toBe(true);
    expect((await db.project.findUniqueOrThrow({ where: { id: p.id } })).currentDeploymentId).toBe(
      first.id,
    );
    await expect(stat(marker)).rejects.toThrow();
  }, 240000);
  it('rejects publish-directory traversal and symlinked output before promotion', async () => {
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {
        name: 'Bad',
        slug: 'bad',
        repositoryUrl: 'https://github.com/deploygrid/fixture',
        serviceType: 'STATIC',
        publishDirectory: '../outside',
      },
    });
    expect(invalid.statusCode).toBe(400);
    const p = await create({
      serviceType: 'STATIC',
      runtime: 'NODE',
      rootDirectory: 'apps/site',
      buildCommand: 'node build.mjs && ln -s /etc/passwd dist/leak.txt',
    });
    const d = await reserveDeployment(p.id);
    await deploy(d.id, clone);
    const result = await db.deployment.findUniqueOrThrow({ where: { id: d.id } });
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toContain('symlinks');
    expect(await run('docker', ['ps', '-aq', '--filter', `label=deploygrid.project=${p.id}`])).toBe(
      '',
    );
  });
  it('starts a public base image with a container-only command override and keeps source image ownership separate', async () => {
    const command = `node -e 'require("http").createServer((q,s)=>s.end("image service")).listen(Number(process.env.PORT),"0.0.0.0")'`;
    const p = await create({
      sourceType: 'IMAGE',
      repositoryUrl: '',
      imageUrl: 'node:22-alpine',
      startCommand: command,
      containerPort: 10000,
    });
    const d = await release(p.id);
    expect(d.commitSha).toBeNull();
    expect(await (await fetch(`http://127.0.0.1:${d.hostPort}/`)).text()).toBe('image service');
    expect((await owned(d.containerId!, p.id)).State.Running).toBe(true);
    expect(await run('docker', ['images', '-q', 'node:22-alpine'])).toBeTruthy();
  });
  it('does not expose temporary workspace paths when a configured source folder is missing', async () => {
    const p = await create({ runtime: 'NODE', rootDirectory: 'missing-folder' });
    const d = await reserveDeployment(p.id);
    await deploy(d.id, clone);
    const failed = await db.deployment.findUniqueOrThrow({ where: { id: d.id } });
    expect(failed.status).toBe('FAILED');
    expect(failed.errorMessage).toContain('[workspace]');
    expect(failed.errorMessage).not.toContain('deploygrid-');
  });
});
