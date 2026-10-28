import { spawn } from 'node:child_process';

// Run pnpm through Node rather than a shell or a Windows .cmd shim.
async function execute(command, args) {
  const child = spawn(command, args, { stdio: 'inherit', shell: false, windowsHide: true });
  const forward = () => child.kill('SIGTERM');
  process.once('SIGINT', forward);
  process.once('SIGTERM', forward);
  try {
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) => resolve(code ?? 1));
    });
    if (code !== 0) throw new Error(`${args.join(' ')} exited ${code}`);
  } finally {
    process.removeListener('SIGINT', forward);
    process.removeListener('SIGTERM', forward);
  }
}
const pnpm = (args) => execute(process.execPath, [process.env.npm_execpath, ...args]);
try {
  console.log('Preparing local configuration (preserving existing keys)...');
  await pnpm(['setup:key']);
  console.log('Starting PostgreSQL and Redis. Docker Desktop must be running.');
  await execute('docker', ['compose', 'up', '-d', '--wait']);
  await pnpm(['db:generate']);
  await pnpm(['db:migrate']);
  console.log('Starting dashboard, API, gateway and worker...');
  await pnpm(['dev']);
} catch (error) {
  console.error(`Local startup stopped: ${error.message}`);
  console.error(
    'Check Docker Desktop and the command output above, then rerun pnpm local. Existing data is preserved.',
  );
  process.exitCode = 1;
}
