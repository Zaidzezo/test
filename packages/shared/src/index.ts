import { z } from 'zod';
export function canonicalRepository(value: string): string {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.hostname !== 'github.com' || u.port || u.username || u.password || u.search || u.hash || !/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/.test(u.pathname)) throw new Error('Use an HTTPS github.com/owner/repository URL without credentials or extra parameters.');
  const path = u.pathname.replace(/\/$/, '').replace(/\.git$/, '');
  if (path.split('/').some(p => p === '.' || p === '..')) throw new Error('Invalid repository path');
  return 'https://github.com' + path;
}
export const projectSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z.string().min(1).max(63).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  repositoryUrl: z.string().transform((v, ctx) => { try { return canonicalRepository(v); } catch { ctx.addIssue({code:'custom',message:'Use https://github.com/owner/repository'}); return z.NEVER; } }),
  branch: z.string().max(160).regex(/^(?!-)(?!.*\.\.)(?!.*@\{)[A-Za-z0-9_./-]*$/).default(''),
  containerPort: z.number().int().min(1).max(65535).default(3000),
  healthPath: z.string().max(256).regex(/^\/(?!\/)[A-Za-z0-9_./~-]*$/).default('/')
});
export const statuses = ['QUEUED','CLONING','BUILDING','STARTING','VERIFYING','SUCCEEDED','FAILED'] as const;
export type Status = typeof statuses[number];
export const terminal = (s: string) => s === 'SUCCEEDED' || s === 'FAILED';
export function canTransition(from: Status, to: Status) { return !terminal(from) && (to === 'FAILED' || statuses.indexOf(to) === statuses.indexOf(from) + 1); }
export function healthAccepted(status: number) { return status >= 200 && status < 400; }
export class AppError extends Error { constructor(public code: string, message: string, public statusCode = 400) { super(message); } }
export function errorMessage(e: unknown) { return e instanceof Error ? e.message.slice(0,4000) : 'Unexpected operation failure'; }
export const positiveInt = (v: string | undefined, fallback: number) => z.coerce.number().int().positive().parse(v ?? fallback);
