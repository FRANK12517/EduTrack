'use strict';
const assert = require('assert');
const http = require('http');
process.env.NODE_ENV = 'test';
const { handler } = require('../server');
const server = http.createServer((req, res) => handler(req, res));
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  let pending = 2;
  const finish = (error) => { if (error) { console.error(error.stack); process.exitCode = 1; } if (--pending === 0) server.close(); };
  for (const route of ['/api/health', '/api/auth/session']) {
    http.get({ hostname: '127.0.0.1', port, path: route }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => { try { assert.notStrictEqual(res.statusCode, 404); assert.notStrictEqual(body, 'FUNCTION_INVOCATION_FAILED'); } catch (e) { finish(e); return; } finish(); });
    }).on('error', finish);
  }
});
console.log('Part 42 health/session checks started.');
