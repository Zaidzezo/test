import { writeFile } from 'node:fs/promises';
// This title is intentionally public. Never embed credentials into public artifacts.
await writeFile(
  'built.json',
  JSON.stringify({ title: process.env.PUBLIC_TITLE || 'Native Node service' }),
);
console.log('Native Node build complete');
