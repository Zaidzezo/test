import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { db } from '@deploygrid/database';
import { AppError } from '@deploygrid/shared';
function encryptionKey() {
  const value = process.env.DEPLOYGRID_ENCRYPTION_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value))
    throw new AppError(
      'ENCRYPTION_KEY_REQUIRED',
      'Run pnpm setup:key, then restart the API and worker to enable environment variables.',
      503,
    );
  return Buffer.from(value, 'hex');
}
export function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(
    ':',
  );
}
export function decrypt(value: string): string {
  const [iv, tag, data] = value.split(':');
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'hex'));
  cipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([cipher.update(Buffer.from(data, 'hex')), cipher.final()]).toString('utf8');
}
export function snapshotEnvironment(
  variables: { name: string; encryptedValue: string }[],
): string | null {
  return variables.length
    ? encrypt(
        JSON.stringify(
          Object.fromEntries(variables.map((v) => [v.name, decrypt(v.encryptedValue)])),
        ),
      )
    : null;
}
export function deploymentEnvironment(snapshot: string | null): Record<string, string> {
  return snapshot ? (JSON.parse(decrypt(snapshot)) as Record<string, string>) : {};
}
export function redact(text: string, values: Record<string, string>): string {
  let result = text;
  for (const value of Object.values(values)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length))
    result = result.replaceAll(value, '[REDACTED]');
  return result;
}
export async function saveVariable(projectId: string, name: string, value: string) {
  const encryptedValue = encrypt(value);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id"=${projectId} FOR UPDATE`;
    const p = await tx.project.findUnique({ where: { id: projectId } });
    if (!p) throw new AppError('NOT_FOUND', 'Service not found', 404);
    if (p.activeDeploymentId || p.operationToken)
      throw new AppError('PROJECT_BUSY', 'Wait for the active operation to finish.', 409);
    await tx.projectVariable.upsert({
      where: { projectId_name: { projectId, name } },
      create: { projectId, name, encryptedValue },
      update: { encryptedValue },
    });
  });
}
export async function deleteVariable(projectId: string, name: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id"=${projectId} FOR UPDATE`;
    const p = await tx.project.findUnique({ where: { id: projectId } });
    if (!p) throw new AppError('NOT_FOUND', 'Service not found', 404);
    if (p.activeDeploymentId || p.operationToken)
      throw new AppError('PROJECT_BUSY', 'Wait for the active operation to finish.', 409);
    await tx.projectVariable.deleteMany({ where: { projectId, name } });
  });
}
