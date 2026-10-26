import { run } from './process.js';
import { healthAccepted, positiveInt } from '@deploygrid/shared';
export const containerName = (id: string) => `deploygrid-${id}`;
export const imageName = (project: string, id: string) => `deploygrid-${project}-${id}`;
export const labels = (project: string, id: string) => [
  '--label',
  'deploygrid.managed=true',
  '--label',
  `deploygrid.project=${project}`,
  '--label',
  `deploygrid.deployment=${id}`,
];
export interface Inspection {
  Id: string;
  State: { Running: boolean; Status: string; StartedAt: string };
  RestartCount: number;
  Config: { Labels: Record<string, string> };
  NetworkSettings: { Ports: Record<string, { HostIp: string; HostPort: string }[] | null> };
}
export async function inspect(name: string): Promise<Inspection> {
  return JSON.parse(await run('docker', ['inspect', name]))[0] as Inspection;
}
export async function owned(name: string, projectId: string) {
  const c = await inspect(name);
  if (
    c.Config.Labels['deploygrid.managed'] !== 'true' ||
    c.Config.Labels['deploygrid.project'] !== projectId
  )
    throw new Error('Refusing to modify an unowned Docker container');
  return c;
}
export async function removeCandidate(id: string, projectId: string) {
  const ids = await run('docker', [
    'ps',
    '-aq',
    '--filter',
    'label=deploygrid.managed=true',
    '--filter',
    `label=deploygrid.project=${projectId}`,
    '--filter',
    `label=deploygrid.deployment=${id}`,
  ]);
  if (ids) await run('docker', ['rm', '-f', ...ids.split(/\s+/)]);
}
export async function startCandidate(
  id: string,
  projectId: string,
  port: number,
  image: string,
  environment: Record<string, string> = {},
) {
  const existing = await run('docker', ['ps', '-aq', '--filter', `name=^/${containerName(id)}$`]);
  if (existing) {
    await owned(containerName(id), projectId);
    throw new Error('Candidate already exists; retry with a new deployment');
  }
  await run(
    'docker',
    [
      'create',
      '--name',
      containerName(id),
      ...labels(projectId, id),
      '--restart',
      'unless-stopped',
      '--memory',
      process.env.CONTAINER_MEMORY ?? '512m',
      '--cpus',
      process.env.CONTAINER_CPUS ?? '1',
      '--pids-limit',
      String(positiveInt(process.env.CONTAINER_PIDS, 128)),
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges:true',
      '-p',
      `127.0.0.1::${port}`,
      ...Object.keys(environment).flatMap((name) => ['--env', name]),
      image,
    ],
    { env: environment },
  );
  await run('docker', ['start', containerName(id)]);
  const c = await owned(containerName(id), projectId);
  const binding = c.NetworkSettings.Ports[`${port}/tcp`]?.[0];
  if (c.State.Status !== 'running') throw new Error('Candidate container exited during startup');
  if (!binding || binding.HostIp !== '127.0.0.1')
    throw new Error('Docker did not assign a loopback port');
  return { containerId: c.Id, hostPort: Number(binding.HostPort) };
}
export async function verifyHealth(
  hostPort: number,
  path: string,
  timeout = positiveInt(process.env.HEALTH_TIMEOUT_MS, 60000),
  check?: () => Promise<void>,
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (check) await check();
    try {
      const response = await fetch(`http://127.0.0.1:${hostPort}${path}`, {
        signal: AbortSignal.timeout(Math.min(2000, Math.max(1, deadline - Date.now()))),
        redirect: 'manual',
      });
      await response.body?.cancel();
      if (healthAccepted(response.status)) return;
    } catch (error) {
      if (Date.now() >= deadline)
        throw new Error(
          `Application readiness timed out: ${error instanceof Error ? error.message : 'connection failure'}`,
        );
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(750, Math.max(0, deadline - Date.now()))),
    );
  }
  throw new Error('Application readiness timed out');
}
export async function runtimeSnapshot(id: string, projectId: string) {
  const c = await owned(id, projectId);
  const stats = c.State.Running
    ? (JSON.parse(
        await run('docker', ['stats', '--no-stream', '--format', '{{json .}}', id]),
      ) as Record<string, string>)
    : null;
  return {
    state: c.State.Status,
    running: c.State.Running,
    startedAt: c.State.StartedAt,
    restartCount: c.RestartCount,
    cpu: stats ? Number(stats.CPUPerc.replace('%', '')) : null,
    memory: stats?.MemUsage ?? null,
    memoryPercent: stats ? Number(stats.MemPerc.replace('%', '')) : null,
  };
}
