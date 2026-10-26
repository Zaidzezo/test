import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
const require = createRequire(new URL('../packages/database/package.json', import.meta.url));
const { Client } = require('pg');
const base = new URL(process.env.DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(base.hostname))
  throw new Error('Integration runner requires local PostgreSQL');
const admin = new Client({ connectionString: base.toString() });
const name = 'deploygrid_test_' + randomUUID().replaceAll('-', '');
await admin.connect();
await admin.query(`CREATE DATABASE "${name}"`);
base.pathname = '/' + name;
const browser = process.argv[2] === '--browser';
const env = {
  ...process.env,
  DATABASE_URL: base.toString(),
  DEPLOYGRID_QUEUE_NAME: name,
  ...(browser ? { DEPLOYGRID_TEST_RUNTIME: '1' } : {}),
};
async function pnpm(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [process.env.npm_execpath, ...args], {
      env,
      stdio: 'inherit',
      shell: false,
    });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}
let code = 1;
try {
  code = await pnpm(['--filter', '@deploygrid/database', 'migrate']);
  if (!code)
    code = await pnpm(
      browser
        ? ['exec', 'playwright', 'test', ...process.argv.slice(3)]
        : [
            'exec',
            'vitest',
            'run',
            '--config',
            'vitest.integration.config.ts',
            ...process.argv.slice(2),
          ],
    );
} finally {
  // A failed test hook must not leave Docker resources after its temporary database is dropped.
  const testClient = new Client({ connectionString: base.toString() });
  async function docker(args) {
    return new Promise((resolve, reject) => {
      const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      child.stderr.on('data', (data) => {
        output += data.toString();
      });
      child.on('error', reject);
      child.on('close', (status) =>
        status === 0 ? resolve(output.trim()) : reject(new Error(output.slice(-1000))),
      );
    });
  }
  try {
    await testClient.connect();
    const exists = await testClient.query(`SELECT to_regclass('public."Project"') AS relation`);
    if (exists.rows[0]?.relation) {
      const projects = await testClient.query('SELECT "id" FROM "Project"');
      for (const project of projects.rows) {
        const filters = [
          '--filter',
          'label=deploygrid.managed=true',
          '--filter',
          `label=deploygrid.project=${project.id}`,
        ];
        const containers = await docker(['ps', '-aq', ...filters]);
        if (containers) await docker(['rm', '-f', ...containers.split(/\s+/)]);
        const images = await docker(['images', '-q', ...filters]);
        if (images) await docker(['image', 'rm', ...new Set(images.split(/\s+/))]);
      }
    }
  } catch (error) {
    console.error('Isolated test cleanup:', error.message);
    code = 1;
  } finally {
    await testClient.end();
  }
  await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
}
process.exitCode = code;
