import { it, expect, vi } from 'vitest';
import { LogBuffer } from '../packages/engine/src/store';
import { redact } from '../packages/engine/src/environment';
it('does not persist a secret split between process output chunks', async () => {
  const writer = vi.fn(async (lines: string[]) => {
    void lines;
    return undefined;
  });
  const buffer = new LogBuffer(
    'test',
    (text) => redact(text, { TOKEN: 'split-secret-value' }),
    writer,
  );
  buffer.append('token=split-se');
  await buffer.flush();
  expect(writer).not.toHaveBeenCalled();
  buffer.append('cret-value\n');
  await buffer.flush();
  expect(writer).toHaveBeenCalledWith(['token=[REDACTED]']);
});
it('flushes an unterminated final line explicitly and bounds oversized lines', async () => {
  const writer = vi.fn(async (lines: string[]) => {
    void lines;
    return undefined;
  });
  const buffer = new LogBuffer('test', (text) => text, writer);
  buffer.append('Final diagnostic');
  await buffer.finish();
  expect(writer).toHaveBeenCalledWith(['Final diagnostic']);
  buffer.append('x'.repeat(65537));
  await buffer.finish();
  expect(writer).toHaveBeenLastCalledWith(['[Output line exceeded 64 KiB and was omitted]']);
});
