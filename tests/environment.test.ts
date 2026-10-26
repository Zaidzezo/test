import { it, expect, describe } from 'vitest';
import {
  encrypt,
  decrypt,
  redact,
  deploymentEnvironment,
} from '../packages/engine/src/environment';
import { variableSchema } from '@deploygrid/shared';
describe('runtime configuration security', () => {
  it('authenticates ciphertext and uses independent nonces', () => {
    const a = encrypt('secret'),
      b = encrypt('secret');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe('secret');
    const parts = a.split(':');
    parts[1] = '0'.repeat(32);
    expect(() => decrypt(parts.join(':'))).toThrow();
  });
  it('rejects a missing encryption key without losing existing values', () => {
    const old = process.env.DEPLOYGRID_ENCRYPTION_KEY;
    try {
      delete process.env.DEPLOYGRID_ENCRYPTION_KEY;
      expect(() => encrypt('secret')).toThrow('setup:key');
      expect(deploymentEnvironment(null)).toEqual({});
    } finally {
      process.env.DEPLOYGRID_ENCRYPTION_KEY = old;
    }
  });
  it.each(['DOCKER_HOST', 'PATH', 'NODE_OPTIONS', 'GIT_CONFIG_GLOBAL', 'LD_PRELOAD'])(
    'rejects host process override %s',
    (name) => expect(variableSchema.safeParse({ name, value: 'value' }).success).toBe(false),
  );
  it('supports a normal runtime variable and masks literal values in logs', () => {
    expect(variableSchema.parse({ name: 'API_TOKEN', value: 'secret' })).toEqual({
      name: 'API_TOKEN',
      value: 'secret',
    });
    expect(redact('token=secret', { API_TOKEN: 'secret' })).toBe('token=[REDACTED]');
  });
});
