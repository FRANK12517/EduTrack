'use strict';

const { handler } = require('../server');
const { handler: legacyHandler } = require('./legacy');

module.exports = function edutrackApi(req, res) {
  const route = req.url.split('?')[0];
  if (route === '/api/login' || route === '/api/school-login' || route === '/api/config' || route === '/api/students') {
    return legacyHandler(req, res);
  }
  return handler(req, res).catch(() => {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    res.end(JSON.stringify({ error: 'Internal server error' }));
  });
};
