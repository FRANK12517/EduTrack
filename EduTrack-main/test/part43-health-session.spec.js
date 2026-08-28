'use strict';
const assert = require('assert');
const http = require('http');
process.env.NODE_ENV = 'test';
const { handler } = require('../server');
const server = http.createServer((req, res) => handler(req, res));
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  let pending = 2;
  const check = (error) => { if (error) { console.error(error.stack); process.exitCode = 1; } if (--pending === 0) server.close(); };
  for (const route of ['/api/health', '/api/auth/session']) {
    http.get({ hostname: '127.0.0.1', port, path: route }, (res) => {
      let body = '';
      res.on('data', (x) => { body += x; });
      res.on('end', () => { try { assert.notStrictEqual(res.statusCode, 404); assert.doesNotMatch(body, /FUNCTION_INVOCATION_FAILED|Vercel/); } catch (e) { check(e); return; } check(); });
    }).on('error', check);
  }
});
console.log('Part 43 health/session checks started.');
