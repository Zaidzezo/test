import { spawn, type ChildProcess } from 'node:child_process';
import { db } from '@deploygrid/database';
import { positiveInt, errorMessage } from '@deploygrid/shared';
interface Tunnel {
  child: ChildProcess;
  url?: string;
  connected: boolean;
  tail: string;
  timer: ReturnType<typeof setTimeout>;
  stopping: boolean;
}
const tunnels = new Map<string, Tunnel>();
let closed = false;
function diagnostics(tunnel: Tunnel) {
  return tunnel.tail
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .split('\n')
    .filter((line) => /failed|error|lookup|dial tcp|certificate/i.test(line))
    .slice(-2)
    .join(' ')
    .slice(-800);
}
async function fail(id: string, message: string) {
  await db.project.updateMany({
    where: { id },
    data: {
      shareEnabled: false,
      publicUrl: null,
      sharingStatus: 'FAILED',
      sharingError: message.slice(0, 1000),
    },
  });
}
async function terminate(tunnel: Tunnel) {
  clearTimeout(tunnel.timer);
  tunnel.stopping = true;
  if (!tunnel.child.pid || tunnel.child.exitCode !== null || tunnel.child.signalCode !== null)
    return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      tunnel.child.kill('SIGKILL');
      resolve();
    }, 3000);
    tunnel.child.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
    tunnel.child.kill('SIGTERM');
  });
}
export async function reconcileSharing() {
  if (closed) return;
  const projects = await db.project.findMany({
    select: {
      id: true,
      slug: true,
      shareEnabled: true,
      currentDeploymentId: true,
      desiredRunning: true,
    },
  });
  for (const [id, tunnel] of tunnels) {
    const p = projects.find((p) => p.id === id);
    if (!p?.shareEnabled || !p.currentDeploymentId || !p.desiredRunning) {
      await terminate(tunnel);
      tunnels.delete(id);
      if (p)
        await db.project.update({
          where: { id },
          data: { publicUrl: null, sharingStatus: 'DISABLED' },
        });
    }
  }
  for (const p of projects) {
    if (!p.shareEnabled || !p.currentDeploymentId || !p.desiredRunning || tunnels.has(p.id))
      continue;
    await db.project.update({
      where: { id: p.id },
      data: { sharingStatus: 'STARTING', publicUrl: null, sharingError: null },
    });
    const child = spawn(
      process.env.CLOUDFLARED_PATH ?? 'cloudflared',
      [
        'tunnel',
        '--no-autoupdate',
        '--url',
        `http://127.0.0.1:${positiveInt(process.env.GATEWAY_PORT, 8080)}`,
        '--http-host-header',
        `${p.slug}.localhost`,
        '--protocol',
        'http2',
      ],
      { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const tunnel: Tunnel = {
      child,
      connected: false,
      tail: '',
      stopping: false,
      timer: setTimeout(() => {
        tunnel.stopping = true;
        void fail(
          p.id,
          `Public tunnel did not connect within 60 seconds. ${diagnostics(tunnel)}`,
        ).catch((error) => console.error(errorMessage(error)));
        child.kill('SIGTERM');
      }, 60000),
    };
    tunnels.set(p.id, tunnel);
    const output = (chunk: Buffer) => {
      tunnel.tail = (tunnel.tail + chunk.toString()).slice(-8000);
      const url = tunnel.tail.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (url) tunnel.url = url[0];
      if (tunnel.tail.includes('Registered tunnel connection')) tunnel.connected = true;
      if (tunnel.url && tunnel.connected) {
        clearTimeout(tunnel.timer);
        void db.project
          .updateMany({
            where: { id: p.id, shareEnabled: true },
            data: { publicUrl: tunnel.url, sharingStatus: 'ACTIVE', sharingError: null },
          })
          .catch((error) => console.error(errorMessage(error)));
      }
    };
    child.stdout?.on('data', output);
    child.stderr?.on('data', output);
    child.on('error', (error) => {
      tunnel.stopping = true;
      clearTimeout(tunnel.timer);
      tunnels.delete(p.id);
      void fail(
        p.id,
        error.message.includes('ENOENT')
          ? 'cloudflared is not installed. Install it on the host and restart sharing.'
          : 'Unable to start cloudflared. Check the configured executable.',
      ).catch((error) => console.error(errorMessage(error)));
    });
    child.on('close', (code) => {
      clearTimeout(tunnel.timer);
      if (tunnels.get(p.id) === tunnel) tunnels.delete(p.id);
      if (!closed && !tunnel.stopping)
        void fail(
          p.id,
          `Public tunnel stopped (exit ${code}). ${diagnostics(tunnel) || 'Check outbound connectivity and restart sharing.'}`,
        ).catch((error) => console.error(errorMessage(error)));
    });
  }
}
export async function initializeSharing() {
  await db.project.updateMany({
    where: { shareEnabled: true },
    data: { sharingStatus: 'STARTING', publicUrl: null },
  });
  await reconcileSharing();
}
export async function closeSharing() {
  closed = true;
  await Promise.all([...tunnels.values()].map(terminate));
  tunnels.clear();
  await db.project.updateMany({
    where: { shareEnabled: true },
    data: { sharingStatus: 'STARTING', publicUrl: null },
  });
}
