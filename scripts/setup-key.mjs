import { randomBytes } from 'node:crypto';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
try {
  await copyFile('.env.example', '.env', 1);
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}
let text = await readFile('.env', 'utf8');
const existing = text.match(/^DEPLOYGRID_ENCRYPTION_KEY=(.*)$/m);
if (existing && /^[a-f0-9]{64}$/i.test(existing[1].trim()))
  console.info('Encryption key already configured; preserved.');
else {
  if (existing?.[1].trim())
    throw new Error('Existing encryption key is invalid; refusing to overwrite it.');
  const line = 'DEPLOYGRID_ENCRYPTION_KEY=' + randomBytes(32).toString('hex');
  text = existing
    ? text.replace(/^DEPLOYGRID_ENCRYPTION_KEY=.*$/m, line)
    : text + '\n' + line + '\n';
  await writeFile('.env', text, { mode: 0o600 });
  console.info(
    'Encryption key saved to .env. Back up this file securely; losing the key makes stored variables unreadable. Restart API and worker.',
  );
}
