'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const dbModulePath = path.join(__dirname, '..', 'lib', 'db.js');
const mysqlPromisePath = require.resolve('mysql2/promise');
const previousMysqlModule = require.cache[mysqlPromisePath];
const previousDbModule = require.cache[require.resolve(dbModulePath)];
const previousEnv = {
  EDUTRACK_DATABASE_URL: process.env.EDUTRACK_DATABASE_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  TIDB_HOST: process.env.TIDB_HOST,
  TIDB_PORT: process.env.TIDB_PORT,
  TIDB_USER: process.env.TIDB_USER,
  TIDB_PASSWORD: process.env.TIDB_PASSWORD,
  TIDB_DATABASE: process.env.TIDB_DATABASE,
};

let receivedOptions;
require.cache[mysqlPromisePath] = {
  id: mysqlPromisePath,
  filename: mysqlPromisePath,
  loaded: true,
  exports: {
    createPool(options) {
      receivedOptions = options;
      return { execute: async () => [[], []] };
    },
  },
};

delete require.cache[require.resolve(dbModulePath)];
process.env.EDUTRACK_DATABASE_URL = 'mysql://url-user:url-password@db.example.test:4000/edutrack';
process.env.DATABASE_URL = 'mysql://fallback-user:fallback-password@fallback.example.test:4000/fallback';
for (const key of ['TIDB_HOST', 'TIDB_PORT', 'TIDB_USER', 'TIDB_PASSWORD', 'TIDB_DATABASE']) delete process.env[key];

try {
  const { getPool } = require(dbModulePath);
  getPool();
  assert.equal(receivedOptions.uri, process.env.EDUTRACK_DATABASE_URL);
  assert.deepEqual(receivedOptions.ssl, { minVersion: 'TLSv1.2' });
  assert.equal(receivedOptions.waitForConnections, true);
  assert.equal(receivedOptions.connectionLimit, 5);
  assert.equal(receivedOptions.maxIdle, 5);
  assert.equal(receivedOptions.idleTimeout, 60000);
  assert.equal(receivedOptions.queueLimit, 0);
  assert.equal(Object.hasOwn(receivedOptions, 'host'), false);
  assert.equal(Object.hasOwn(receivedOptions, 'user'), false);
  assert.equal(Object.hasOwn(receivedOptions, 'password'), false);
  assert.equal(Object.hasOwn(receivedOptions, 'database'), false);
  console.log('Database pool connection-URL, TLS, and pool-settings regression passed.');
} finally {
  if (previousDbModule) require.cache[require.resolve(dbModulePath)] = previousDbModule;
  else delete require.cache[require.resolve(dbModulePath)];
  if (previousMysqlModule) require.cache[mysqlPromisePath] = previousMysqlModule;
  else delete require.cache[mysqlPromisePath];
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
