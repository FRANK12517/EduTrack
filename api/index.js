'use strict';

const { handler } = require('../server');

module.exports = function edutrackApi(req, res) {
  return handler(req, res).catch(() => {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    res.end(JSON.stringify({ error: 'Internal server error' }));
  });
};
