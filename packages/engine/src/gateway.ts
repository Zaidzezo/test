import { createServer, request as httpRequest, type IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
const connections = new WeakMap<ReturnType<typeof createServer>, Set<Socket>>();
export async function closeGateway(server: ReturnType<typeof createServer>) {
  for (const socket of connections.get(server) ?? []) socket.destroy();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
import { db } from '@deploygrid/database';
import { positiveInt } from '@deploygrid/shared';
export function serviceUrl(slug: string) {
  return `http://${slug}.localhost:${positiveInt(process.env.GATEWAY_PORT, 8080)}`;
}
async function target(req: IncomingMessage) {
  const hostname = (req.headers.host ?? '').split(':')[0].toLowerCase();
  const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.localhost$/.exec(hostname);
  if (!match) return null;
  const p = await db.project.findUnique({
    where: { slug: match[1] },
    include: { currentDeployment: true },
  });
  if (!p?.currentDeployment?.hostPort || !p.desiredRunning) return null;
  return { port: p.currentDeployment.hostPort, host: hostname };
}
export function createGateway() {
  const server = createServer(async (req, res) => {
    try {
      const route = await target(req);
      if (!route) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('DeployGrid: no running application at this address.');
        return;
      }
      const upstream = httpRequest(
        {
          hostname: '127.0.0.1',
          port: route.port,
          path: req.url,
          method: req.method,
          headers: {
            ...req.headers,
            'x-forwarded-host': req.headers.host,
            'x-forwarded-proto': req.headers['x-forwarded-proto'] ?? 'http',
          },
        },
        (response) => {
          res.writeHead(response.statusCode ?? 502, response.headers);
          response.pipe(res);
        },
      );
      upstream.setTimeout(30000, () => upstream.destroy(new Error('Upstream timeout')));
      upstream.on('error', () => {
        if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('DeployGrid: application is unavailable.');
      });
      req.on('aborted', () => upstream.destroy());
      res.on('close', () => upstream.destroy());
      req.pipe(upstream);
    } catch {
      if (!res.headersSent) res.writeHead(503);
      res.end('DeployGrid: routing is temporarily unavailable.');
    }
  });
  const sockets = new Set<Socket>();
  connections.set(server, sockets);
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  server.on('upgrade', async (req, socket, head) => {
    try {
      const route = await target(req);
      if (!route) {
        socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
        return;
      }
      const upstream = httpRequest({
        hostname: '127.0.0.1',
        port: route.port,
        path: req.url,
        headers: req.headers,
      });
      upstream.on('upgrade', (response, remote, remoteHead) => {
        socket.write(
          `HTTP/1.1 ${response.statusCode} Switching Protocols\r\n` +
            Object.entries(response.headers)
              .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
              .join('\r\n') +
            '\r\n\r\n',
        );
        if (head.length) remote.write(head);
        if (remoteHead.length) socket.write(remoteHead);
        remote.on('error', () => socket.destroy());
        socket.on('error', () => remote.destroy());
        socket.on('close', () => remote.destroy());
        remote.on('close', () => socket.destroy());
        socket.on('end', () => remote.destroy());
        remote.on('end', () => socket.destroy());
        remote.pipe(socket);
        socket.pipe(remote);
      });
      upstream.on('response', () => {
        upstream.destroy();
        socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      });
      upstream.on('error', () => socket.destroy());
      socket.on('error', () => upstream.destroy());
      upstream.end();
    } catch {
      socket.destroy();
    }
  });
  return server;
}
