'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const http = require('http');

const root = path.resolve(__dirname, '..');
process.env.NODE_ENV = 'test';
process.env.EDUTRACK_ALLOWED_ORIGINS = 'https://www.edutrackgh.online,https://edutrackgh.online';
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

assert.strictEqual(packageJson.engines.node, '22.x', 'Node runtime must be pinned to 22.x');
assert.strictEqual(vercel.functions['api/index.js'].runtime, 'nodejs22.x');
assert.ok(vercel.rewrites.some((rule) => rule.source === '/api/:path*' && rule.destination === '/api/index.js'));
assert.strictEqual(typeof require('../api/index.js'), 'function');

const gateFiles = fs.readdirSync(root).filter((name) => /^PART39_.*\.(json|md|txt)$/.test(name));
for (const file of gateFiles) {
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  assert.ok(!(/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|Bearer\s+[A-Za-z0-9._-]{20,}|\"(password|secret|token|apiKey)\"\s*:\s*\"[^\"<>{} ]{12,}\"/i.test(content)), `${file} appears to contain a secret value`);
}

const check = execFileSync(process.execPath, ['--check', path.join(root, 'api/index.js')], { encoding: 'utf8' });
assert.strictEqual(check, '');

function request(handler, pathName, headers = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const req = http.request({ hostname: address.address, port: address.port, path: pathName, method: 'GET', headers }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => server.close(() => resolve({ status: res.statusCode, headers: res.headers, body })));
      });
      req.on('error', (error) => server.close(() => reject(error)));
      req.end();
    });
  });
}

(async () => {
  const api = require('../api/index.js');
  const health = await request(api, '/api/health');
  assert.notStrictEqual(health.status, 404);
  assert.strictEqual(health.headers['x-content-type-options'], 'nosniff');
  assert.strictEqual(health.headers['x-frame-options'], 'DENY');

  const session = await request(api, '/api/auth/session');
  assert.ok([200, 401].includes(session.status));
  assert.notStrictEqual(session.status, 404);

  const allowed = await request(api, '/api/health', { origin: 'https://www.edutrackgh.online' });
  assert.strictEqual(allowed.status, 200);
  assert.strictEqual(allowed.headers['access-control-allow-origin'], 'https://www.edutrackgh.online');
  assert.strictEqual(allowed.headers['access-control-allow-credentials'], 'true');

  const rejected = await request(api, '/api/health', { origin: 'https://evil.example' });
  assert.strictEqual(rejected.status, 403);
  assert.strictEqual(rejected.headers['access-control-allow-origin'], undefined);

  console.log('Part 39 deployment repair checks passed.');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
