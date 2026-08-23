'use strict';
const assert = require('assert');
const http = require('http');
process.env.NODE_ENV = 'test';
process.env.EDUTRACK_ALLOWED_ORIGINS = 'https://www.edutrackgh.online,https://edutrackgh.online';
const { handler } = require('../server');
function request(headers) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => handler(req, res));
    server.listen(0, '127.0.0.1', () => {
      const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: '/api/health', headers }, (res) => {
        res.resume();
        res.on('end', () => server.close(() => resolve(res)));
      });
      req.on('error', (error) => server.close(() => reject(error)));
      req.end();
    });
  });
}
(async () => {
  const allowed = await request({ origin: 'https://www.edutrackgh.online' });
  assert.strictEqual(allowed.statusCode, 200);
  assert.strictEqual(allowed.headers['access-control-allow-origin'], 'https://www.edutrackgh.online');
  assert.strictEqual(allowed.headers['access-control-allow-credentials'], 'true');
  assert.strictEqual(allowed.headers.vary, 'Origin');
  assert.strictEqual(allowed.headers['x-content-type-options'], 'nosniff');
  assert.strictEqual(allowed.headers['x-frame-options'], 'DENY');
  const rejected = await request({ origin: 'https://evil.example' });
  assert.strictEqual(rejected.statusCode, 403);
  assert.strictEqual(rejected.headers['access-control-allow-origin'], undefined);
  console.log('Part 41 CORS and security checks passed.');
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
