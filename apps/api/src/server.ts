import { buildApp } from './app.js';
import { db } from '@deploygrid/database';
import { queue } from '@deploygrid/engine';
const app = await buildApp();
await app.listen({host:'127.0.0.1',port:Number(process.env.API_PORT ?? 4000)});
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,async () => {await app.close(); await queue.close(); await db.$disconnect(); process.exit(0);});
