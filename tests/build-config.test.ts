import { it, expect, describe } from 'vitest';
import { mkdtemp, mkdir, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  relativePathSchema,
  imageReferenceSchema,
  createServiceSchema,
  checkServiceConfiguration,
  variableSchema,
  environmentUpdateSchema,
} from '@deploygrid/shared';
import { containedPath } from '../packages/engine/src/build';
describe('build input boundaries', () => {
  it.each(['../outside', '/absolute', 'a/../../b', 'a\\b', 'a b', '.git', 'a\nRUN something'])(
    'rejects unsafe path %s',
    (value) => expect(relativePathSchema.safeParse(value).success).toBe(false),
  );
  it.each([
    'node:22-alpine',
    'docker.io/library/nginx:alpine',
    'ghcr.io/org/app@sha256:' + 'a'.repeat(64),
  ])('accepts public image reference %s', (value) =>
    expect(imageReferenceSchema.safeParse(value).success).toBe(true),
  );
  it.each([
    '--privileged',
    'user:password@ghcr.io/org/app',
    'node\nRUN echo bad',
    'localhost:5000/app',
    'evil.example/org/app',
    'https://docker.io/node',
  ])('rejects unsafe image reference %s', (value) =>
    expect(imageReferenceSchema.safeParse(value).success).toBe(false),
  );
  it('accepts framework output paths', () => {
    expect(relativePathSchema.parse('.output/public')).toBe('.output/public');
  });
  it('rejects a symlink escaping a configured context', async () => {
    const root = await mkdtemp(join(tmpdir(), 'deploygrid-path-test-'));
    try {
      await mkdir(join(root, 'repository'));
      await mkdir(join(root, 'outside'));
      await symlink(join(root, 'outside'), join(root, 'repository', 'linked'));
      await expect(containedPath(join(root, 'repository'), 'linked')).rejects.toThrow('escapes');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('validates source requirements and reserves the injected port', () => {
    const base = { name: 'Image', slug: 'image' };
    expect(() => checkServiceConfiguration(createServiceSchema.parse(base))).toThrow('github.com');
    expect(() =>
      checkServiceConfiguration(
        createServiceSchema.parse({ ...base, sourceType: 'IMAGE', imageUrl: 'node:22-alpine' }),
      ),
    ).not.toThrow();
    expect(() =>
      checkServiceConfiguration(
        createServiceSchema.parse({
          ...base,
          sourceType: 'IMAGE',
          serviceType: 'STATIC',
          imageUrl: 'node:22-alpine',
        }),
      ),
    ).toThrow();
    expect(variableSchema.safeParse({ name: 'PORT', value: '1234' }).success).toBe(false);
    expect(environmentUpdateSchema.safeParse({ variables: [], remove: ['PORT'] }).success).toBe(
      true,
    );
  });
});
