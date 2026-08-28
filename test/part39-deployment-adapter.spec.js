'use strict';

const assert = require('assert');
const http = require('http');

process.env.NODE_ENV = 'test';
const api = require('../api/index.js');

assert.strictEqual(typeof api, 'function', 'Vercel adapter must export a request handler');

function request(handler, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const req = http.request({ hostname: address.address, port: address.port, path, method: 'GET', headers }, (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => server.close(() => resolve({ status: res.statusCode, headers: res.headers, body: raw })));
      });
      req.on('error', (error) => server.close(() => reject(error)));
      req.end();
    });
  });
}

(async () => {
  const health = await request(api, '/api/health');
  assert.notStrictEqual(health.status, 404, 'health route must be reachable through the deployment adapter');
  assert.strictEqual(health.headers['x-content-type-options'], 'nosniff');

  const session = await request(api, '/api/auth/session');
  assert.notStrictEqual(session.status, 404, 'session route must be reachable through the deployment adapter');
  assert.ok([200, 401].includes(session.status), `unexpected session status: ${session.status}`);

  console.log('Part 39 deployment adapter checks passed.');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
