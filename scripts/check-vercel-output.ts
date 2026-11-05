import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const output = path.resolve(process.argv[2] || '.vercel/output');
await access(path.join(output, 'static/index.html'));
await access(path.join(output, 'static/pastoral.svg'));
const functionDir = path.join(output, 'functions/api/index.func');
const config = JSON.parse(await readFile(path.join(functionDir, '.vc-config.json'), 'utf8'));
const { default: handler } = await import(pathToFileURL(path.join(functionDir, config.handler)).href);
assert.equal(typeof handler, 'function');
const server = createServer(handler);
server.listen(0, '127.0.0.1');
await once(server, 'listening');
try {
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const health = await fetch(`${base}/api/`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { message: 'Pastoral API' });
  const me = await fetch(`${base}/api/auth/me`);
  assert.equal(me.status, 401);
  const missing = await fetch(`${base}/api/inexistente`);
  assert.equal(missing.status, 404);
  console.log('Artefatos Vercel validados: frontend estático e API empacotada respondendo HTTP.');
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
