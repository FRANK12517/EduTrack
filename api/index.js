'use strict';

const { handler } = require('../server');
const { handler: legacyHandler } = require('./legacy');

module.exports = function edutrackApi(req, res) {
  const route = req.url.split('?')[0];
  // TEMPORARY DIAGNOSTIC — reports only the database name currently in use
  // by this deployment (never the credentials). Remove this block once the
  // EDUTRACK_DATABASE_URL / DATABASE_URL mismatch investigation is done.
  if (route === '/api/debug-db') {
    let dbName = null;
    let source = null;
    try {
      const uri = process.env.EDUTRACK_DATABASE_URL || process.env.DATABASE_URL;
      source = process.env.EDUTRACK_DATABASE_URL ? 'EDUTRACK_DATABASE_URL' : (process.env.DATABASE_URL ? 'DATABASE_URL' : null);
      if (uri) {
        const withoutScheme = uri.replace(/^mysql:\/\//i, '');
        const afterAuth = withoutScheme.split('@').pop();
        const afterHost = afterAuth.split('/')[1] || '';
        dbName = afterHost.split('?')[0] || null;
      }
    } catch (e) { /* leave dbName null on any parse failure */ }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ envVarUsed: source, database: dbName }));
  }
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
