import { spawn } from 'node:child_process';
import { AppError } from '@deploygrid/shared';
export async function run(command: string, args: string[], options: {cwd?: string; timeout?: number; log?: (text: string) => void} = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {cwd: options.cwd, shell: false, windowsHide: true, env: {...process.env, GIT_TERMINAL_PROMPT:'0'}});
    let output = ''; let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, options.timeout ?? 60000);
    const collect = (data: Buffer) => { const text = data.toString().replace(/\x1b\[[0-9;]*[A-Za-z]/g,''); output = (output + text).slice(-1000000); options.log?.(text); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    child.on('error', error => { clearTimeout(timer); reject(new AppError('COMMAND_UNAVAILABLE', `${command}: ${error.message}`, 503)); });
    child.on('close', code => { clearTimeout(timer); if (code === 0 && !timedOut) resolve(output.trim()); else reject(new Error(`${command} ${timedOut ? 'timed out' : `exited ${code}`}: ${output.slice(-3000)}`)); });
  });
}
