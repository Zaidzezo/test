import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
const require = createRequire(new URL('../packages/database/package.json', import.meta.url));
const { Client } = require('pg');
const base = new URL(process.env.DATABASE_URL);
if(!['127.0.0.1','localhost'].includes(base.hostname)) throw new Error('Integration runner requires local PostgreSQL');
const admin = new Client({connectionString:base.toString()});
const name = 'deploygrid_test_'+randomUUID().replaceAll('-','');
await admin.connect();await admin.query(`CREATE DATABASE "${name}"`);
base.pathname='/'+name;
const env={...process.env,DATABASE_URL:base.toString(),DEPLOYGRID_QUEUE_NAME:name};
async function pnpm(args){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[process.env.npm_execpath,...args],{env,stdio:'inherit',shell:false});child.on('error',reject);child.on('close',code=>resolve(code??1));});}
let code=1;
try {code=await pnpm(['--filter','@deploygrid/database','migrate']);if(!code)code=await pnpm(['exec','vitest','run','--config','vitest.integration.config.ts']);}
finally {await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);await admin.end();}
process.exitCode=code;
