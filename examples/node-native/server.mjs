import http from 'node:http';
import { readFile } from 'node:fs/promises';
const built = JSON.parse(await readFile('built.json', 'utf8'));
const server = http.createServer((_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({ ...built, greeting: process.env.GREETING || 'hello', port: process.env.PORT }),
  );
});
server.listen(Number(process.env.PORT || 3000), '0.0.0.0');
process.on('SIGTERM', () => server.close(() => process.exit(0)));
