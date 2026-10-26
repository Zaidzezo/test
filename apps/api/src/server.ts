import { buildApp } from './app.js';
import { db } from '@deploygrid/database';
import { queue, createGateway, closeGateway } from '@deploygrid/engine';
import { positiveInt } from '@deploygrid/shared';
const app = await buildApp();
const gateway = createGateway();
await new Promise<void>((resolve, reject) => {
  gateway.once('error', reject);
  gateway.listen(positiveInt(process.env.GATEWAY_PORT, 8080), '127.0.0.1', resolve);
});
await app.listen({ host: '127.0.0.1', port: Number(process.env.API_PORT ?? 4000) });
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    if (closing) return;
    closing = true;
    await closeGateway(gateway);
    await app.close();
    await queue.close();
    await db.$disconnect();
    process.exit(0);
  });
