import { it, expect } from 'vitest';
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { db } from '@deploygrid/database';
import {
  queue,
  run,
  deploy,
  reserveDeployment,
  createGateway,
  closeGateway,
  reconcileSharing,
  closeSharing,
  removeCandidate,
} from '@deploygrid/engine';
it.skipIf(process.env.RUN_PUBLIC_SHARING !== '1')(
  'connects a real public tunnel to the application gateway',
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'deploygrid-public-fixture-'));
    let id: string | undefined;
    const gateway = createGateway();
    const previousPort = process.env.GATEWAY_PORT;
    try {
      await cp(resolve('examples/node-api'), directory, { recursive: true });
      await run('git', ['init', directory]);
      await run('git', ['-C', directory, 'add', '.']);
      await run('git', [
        '-C',
        directory,
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@localhost',
        'commit',
        '-m',
        'Public smoke fixture',
      ]);
      await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', resolve));
      process.env.GATEWAY_PORT = String((gateway.address() as { port: number }).port);
      const p = await db.project.create({
        data: {
          name: 'Public tunnel smoke',
          slug: 'public-smoke-' + randomUUID(),
          repositoryUrl: 'https://github.com/deploygrid/fixture',
          healthPath: '/health',
        },
      });
      id = p.id;
      const d = await reserveDeployment(id);
      await deploy(d.id, async (_url, _branch, path) => {
        await run('git', ['clone', '--', directory, path]);
      });
      expect((await db.deployment.findUniqueOrThrow({ where: { id: d.id } })).status).toBe(
        'SUCCEEDED',
      );
      await db.project.update({ where: { id }, data: { shareEnabled: true } });
      await reconcileSharing();
      const deadline = Date.now() + 70000;
      let status = await db.project.findUniqueOrThrow({ where: { id } });
      while (Date.now() < deadline && !['ACTIVE', 'FAILED'].includes(status.sharingStatus)) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        status = await db.project.findUniqueOrThrow({ where: { id } });
      }
      expect(status.sharingStatus, status.sharingError ?? 'Tunnel never connected').toBe('ACTIVE');
      expect(status.publicUrl).toMatch(/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/);
      const response = await fetch(`${status.publicUrl}/health`, {
        signal: AbortSignal.timeout(15000),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: 'ok' });
      const root = await fetch(`${status.publicUrl}/api/projects`, {
        signal: AbortSignal.timeout(15000),
      });
      expect(await root.json()).toMatchObject({ message: 'Hello from DeployGrid' });
    } finally {
      await closeSharing();
      await closeGateway(gateway);
      if (id) {
        const rows = await db.deployment.findMany({ where: { projectId: id } });
        for (const row of rows) await removeCandidate(row.id, id);
        for (const image of new Set(
          rows.map((d) => d.imageTag).filter((tag): tag is string => !!tag),
        ))
          if (await run('docker', ['images', '-q', image]))
            await run('docker', ['image', 'rm', image]);
        await db.project.delete({ where: { id } });
      }
      if (previousPort === undefined) delete process.env.GATEWAY_PORT;
      else process.env.GATEWAY_PORT = previousPort;
      await rm(directory, { recursive: true, force: true });
      await queue.obliterate({ force: true });
      await queue.close();
      await db.$disconnect();
    }
  },
  120000,
);
