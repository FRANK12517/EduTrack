'use strict';
const assert = require('assert');
const http = require('http');
process.env.NODE_ENV = 'test';
const { handler } = require('../server');
const server = http.createServer((req, res) => handler(req, res));
server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  http.get({ hostname: '127.0.0.1', port, path: '/api/health' }, (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => {
      try {
        assert.notStrictEqual(res.statusCode, 404);
        const parsed = JSON.parse(body);
        assert.strictEqual(parsed.ok, true);
        assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
        console.log('Part 41 health endpoint checks passed.');
      } catch (error) { console.error(error.stack); process.exitCode = 1; }
      finally { server.close(); }
    });
  }).on('error', (error) => { console.error(error.stack); process.exitCode = 1; server.close(); });
});
