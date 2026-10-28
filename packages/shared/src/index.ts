import { z } from 'zod';
export function canonicalRepository(value: string): string {
  const u = new URL(value);
  if (
    u.protocol !== 'https:' ||
    u.hostname !== 'github.com' ||
    u.port ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    !/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/.test(u.pathname)
  )
    throw new Error(
      'Use an HTTPS github.com/owner/repository URL without credentials or extra parameters.',
    );
  const path = u.pathname.replace(/\/$/, '').replace(/\.git$/, '');
  if (path.split('/').some((p) => p === '.' || p === '..'))
    throw new Error('Invalid repository path');
  return 'https://github.com' + path;
}
export const relativePathSchema = z
  .string()
  .max(240)
  .regex(/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/)
  .refine(
    (value) => !value.split('/').some((p) => p === '.' || p === '..' || p.toLowerCase() === '.git'),
    'Use a relative path without traversal',
  );
export const imageReferenceSchema = z
  .string()
  .max(300)
  .regex(
    /^(?:(?:docker\.io|ghcr\.io)\/)?[a-z0-9]+(?:[._/-][a-z0-9]+)*(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}|@sha256:[a-f0-9]{64})?$/,
    'Use a public Docker Hub or GHCR image reference without credentials',
  )
  .refine((value) => {
    const host = value.split('/')[0];
    return !value.includes('/') || !host.includes('.') || ['docker.io', 'ghcr.io'].includes(host);
  }, 'Only public Docker Hub and GHCR registries are supported');
export const commandSchema = z
  .string()
  .max(2048)
  .refine((value) => !/[\0\r\n]/.test(value), 'Commands must fit on one line');
export const projectSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  serviceType: z.enum(['WEB', 'STATIC']).default('WEB'),
  sourceType: z.enum(['GIT', 'IMAGE']).default('GIT'),
  runtime: z.enum(['DOCKER', 'NODE', 'AUTO']).default('DOCKER'),
  imageUrl: imageReferenceSchema.or(z.literal('')).default(''),
  rootDirectory: relativePathSchema.or(z.literal('')).default(''),
  dockerfilePath: relativePathSchema.default('Dockerfile'),
  buildCommand: commandSchema.default(''),
  startCommand: commandSchema.default(''),
  publishDirectory: relativePathSchema.default('dist'),
  spaFallback: z.boolean().default(false),
  repositoryUrl: z
    .string()
    .default('')
    .transform((v, ctx) => {
      try {
        return v === '' ? '' : canonicalRepository(v);
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Use https://github.com/owner/repository' });
        return z.NEVER;
      }
    }),
  branch: z
    .string()
    .max(160)
    .regex(/^(?!-)(?!.*\.\.)(?!.*@\{)[A-Za-z0-9_./-]*$/)
    .default(''),
  containerPort: z.number().int().min(1).max(65535).default(3000),
  healthPath: z
    .string()
    .max(256)
    .regex(/^\/(?!\/)[A-Za-z0-9_./~-]*$/)
    .default('/'),
});
export const statuses = [
  'QUEUED',
  'CLONING',
  'BUILDING',
  'STARTING',
  'VERIFYING',
  'SUCCEEDED',
  'FAILED',
] as const;
export type Status = (typeof statuses)[number];
export const terminal = (s: string) => s === 'SUCCEEDED' || s === 'FAILED';
export function canTransition(from: Status, to: Status) {
  return (
    !terminal(from) && (to === 'FAILED' || statuses.indexOf(to) === statuses.indexOf(from) + 1)
  );
}
export function healthAccepted(status: number) {
  return status >= 200 && status < 400;
}
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode = 400,
  ) {
    super(message);
  }
}
export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message.slice(0, 4000) : 'Unexpected operation failure';
}
export const positiveInt = (v: string | undefined, fallback: number) =>
  z.coerce
    .number()
    .int()
    .positive()
    .parse(v ?? fallback);

export const variableKeySchema = z
  .string()
  .max(128)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
export const variableNameSchema = variableKeySchema.refine(
  (name) =>
    !(
      /^(LD_|DYLD_|DOCKER_|GIT_|DEPLOYGRID_)/i.test(name) ||
      [
        'PORT',
        'PATH',
        'HOME',
        'USERPROFILE',
        'SYSTEMROOT',
        'COMSPEC',
        'PATHEXT',
        'TEMP',
        'TMP',
        'BASH_ENV',
        'ENV',
        'NODE_OPTIONS',
        'NODE_PATH',
        'HTTP_PROXY',
        'HTTPS_PROXY',
        'ALL_PROXY',
        'NO_PROXY',
      ].includes(name.toUpperCase())
    ),
  'This runtime variable is reserved.',
);
export const variableSchema = z.object({
  name: variableNameSchema,
  value: z
    .string()
    .max(16384)
    .refine((value) => !value.includes('\0'), 'NUL bytes are not allowed'),
});

// One bounded payload for initial creation and atomic environment updates.
export const variablesSchema = z
  .array(variableSchema)
  .max(50)
  .superRefine((variables, ctx) => {
    const names = new Set<string>();
    for (const [index, variable] of variables.entries()) {
      if (names.has(variable.name))
        ctx.addIssue({ code: 'custom', path: [index, 'name'], message: 'Duplicate variable key' });
      names.add(variable.name);
    }
  });
export function checkServiceConfiguration(value: z.infer<typeof projectSchema>) {
  if (value.sourceType === 'GIT' && !value.repositoryUrl)
    throw new AppError('VALIDATION_ERROR', 'Use https://github.com/owner/repository');
  if (value.sourceType === 'IMAGE' && (!value.imageUrl || value.serviceType !== 'WEB'))
    throw new AppError(
      'VALIDATION_ERROR',
      'Existing images require a Web Service and a public image reference',
    );
}
export const createServiceSchema = projectSchema.extend({
  variables: variablesSchema.default([]),
  deploy: z.boolean().default(false),
});
export const environmentUpdateSchema = z
  .object({
    variables: variablesSchema,
    remove: z.array(variableKeySchema).max(50).default([]),
    action: z.enum(['save', 'deploy']).default('save'),
  })
  .superRefine((value, ctx) => {
    if (value.variables.some((v) => value.remove.includes(v.name)))
      ctx.addIssue({ code: 'custom', message: 'Cannot save and remove the same key' });
  });

export type EnvironmentVariable = z.infer<typeof variableSchema>;
// Parse data only: no shell expansion, interpolation, command substitution or evaluation.
export function parseEnvironment(text: string): EnvironmentVariable[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .replaceAll('\r\n', '\n')
    .split('\n');
  const result = new Map<string, EnvironmentVariable>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) throw new Error(`Invalid .env assignment at line ${i + 1}`);
    const name = match[1];
    let value = match[2];
    const quote = value[0];
    if (quote === '"' || quote === "'") {
      let content = value.slice(1);
      let end = -1;
      for (;;) {
        for (let n = 0; n < content.length; n++) {
          if (quote === '"' && content[n] === '\\') {
            n++;
            continue;
          }
          if (content[n] === quote) {
            end = n;
            break;
          }
        }
        if (end >= 0) break;
        if (++i >= lines.length) throw new Error(`Unclosed quoted value for ${name}`);
        content += '\n' + lines[i];
      }
      const trailing = content.slice(end + 1).trim();
      if (trailing && !trailing.startsWith('#')) throw new Error(`Unexpected text after ${name}`);
      value = content.slice(0, end);
      if (quote === '"')
        value = value.replace(
          /\\(n|r|"|\\)/g,
          (_, c: string) => ({ n: '\n', r: '\r', '"': '"', '\\': '\\' })[c]!,
        );
    } else value = value.replace(/\s+#.*$/, '').trim();
    const parsed = variableSchema.safeParse({ name, value });
    if (!parsed.success) throw new Error(`Invalid or reserved variable key: ${name}`);
    result.set(name, parsed.data);
  }
  return variablesSchema.parse([...result.values()]);
}
