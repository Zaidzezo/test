import { describe, it, expect } from 'vitest';
import { createServiceSchema, environmentUpdateSchema, parseEnvironment } from '@deploygrid/shared';
describe('environment import and creation validation', () => {
  it('parses comments, quotes, exports, multiline, empty values and literal shell text', () => {
    expect(
      parseEnvironment(
        `# comment\nexport A="hello\\nworld" # comment\nB='first\nsecond'\nC=\nD=$(whoami)\nE=plain # comment`,
      ),
    ).toEqual([
      { name: 'A', value: 'hello\nworld' },
      { name: 'B', value: 'first\nsecond' },
      { name: 'C', value: '' },
      { name: 'D', value: '$(whoami)' },
      { name: 'E', value: 'plain' },
    ]);
  });
  it.each(['INVALID LINE', 'A="unterminated', 'A="ok" trailing', 'PATH=override'])(
    'rejects malformed or reserved input: %s',
    (input) => expect(() => parseEnvironment(input)).toThrow(),
  );
  it('uses the last duplicate assignment on import', () => {
    expect(parseEnvironment('A=first\nA=last')).toEqual([{ name: 'A', value: 'last' }]);
  });
  it('rejects duplicate keys in an API request and conflicting removals', () => {
    expect(
      environmentUpdateSchema.safeParse({
        variables: [
          { name: 'A', value: 'one' },
          { name: 'A', value: 'two' },
        ],
      }).success,
    ).toBe(false);
    expect(
      environmentUpdateSchema.safeParse({ variables: [{ name: 'A', value: '' }], remove: ['A'] })
        .success,
    ).toBe(false);
  });
  it('preserves compatibility with create-only clients', () => {
    const value = createServiceSchema.parse({
      name: 'Example',
      slug: 'example',
      repositoryUrl: 'https://github.com/example/app',
    });
    expect(value.deploy).toBe(false);
    expect(value.variables).toEqual([]);
  });
});
