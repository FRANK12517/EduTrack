'use strict';
const assert = require('assert');
const http = require('http');
process.env.NODE_ENV = 'test';
const { handler } = require('../server');
const server = http.createServer((req, res) => handler(req, res));
server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  http.get({ hostname: '127.0.0.1', port, path: '/api/auth/session' }, (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => {
      try {
        assert.ok([200, 401].includes(res.statusCode));
        assert.notStrictEqual(res.statusCode, 404);
        assert.doesNotMatch(body, /FUNCTION_INVOCATION_FAILED|Vercel|password|secret|token/i);
        console.log('Part 41 auth session checks passed.');
      } catch (error) { console.error(error.stack); process.exitCode = 1; }
      finally { server.close(); }
    });
  }).on('error', (error) => { console.error(error.stack); process.exitCode = 1; server.close(); });
});
