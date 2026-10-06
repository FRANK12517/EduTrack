'use strict';

const { handler } = require('../server');
const { handler: legacyHandler } = require('./legacy');

module.exports = function edutrackApi(req, res) {
  const route = req.url.split('?')[0];
  // The current School client uses the existing canonical cookie session.
  // Keep legacy bearer login/config/student routes available to their clients.
  if (route === '/api/login' || route === '/api/config' || route === '/api/students') {
    return legacyHandler(req, res);
  }
  return handler(req, res).catch(() => {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    res.end(JSON.stringify({ error: 'Internal server error' }));
  });
};
