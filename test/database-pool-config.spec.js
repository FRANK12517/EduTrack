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
  DB_HOST: process.env.DB_HOST,
  DB_PORT: process.env.DB_PORT,
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_NAME: process.env.DB_NAME,
  DB_CA_CERT: process.env.DB_CA_CERT,
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
for (const key of ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DB_CA_CERT']) delete process.env[key];

try {
  const { getPool } = require(dbModulePath);
  getPool();
  assert.equal(receivedOptions.uri, process.env.EDUTRACK_DATABASE_URL);
  assert.deepEqual(receivedOptions.ssl, { rejectUnauthorized: true });
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

  process.env.EDUTRACK_DATABASE_URL = '';
  process.env.DATABASE_URL = '';
  process.env.DB_PASSWORD = 'test-password';
  process.env.DB_CA_CERT = '-----BEGIN CERTIFICATE-----\\ncertificate\\n-----END CERTIFICATE-----';
  delete require.cache[require.resolve(dbModulePath)];
  const explicitDb = require(dbModulePath);
  explicitDb.getPool();
  assert.equal(receivedOptions.ssl.ca, '-----BEGIN CERTIFICATE-----\ncertificate\n-----END CERTIFICATE-----');
  assert.equal(receivedOptions.ssl.rejectUnauthorized, true);
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
