import { mkdir, writeFile } from 'node:fs/promises';
const escape = (text) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
await mkdir('dist', { recursive: true });
await writeFile(
  'dist/index.html',
  `<!doctype html><html><head><meta charset="utf-8"><title>DeployGrid static site</title></head><body><h1>${escape(process.env.PUBLIC_TITLE || 'Hello from a real static build')}</h1><p>Built in a container. Try /dashboard with SPA rewriting enabled.</p></body></html>`,
);
await writeFile('dist/site.css', 'body { font-family: system-ui; margin: 3rem; }');
console.log('Static build complete');
