'use strict';

const mysql = require('mysql2/promise');
const { getTiDbConnectionOptions, hasExplicitTiDbConfiguration } = require('./tidb-config');

let pool;

function getPool() {
  if (!pool) {
    const connectionUri = process.env.EDUTRACK_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionUri && !hasExplicitTiDbConfiguration()) throw new Error('Relational database connection configuration is not configured');
    const connectionOptions = connectionUri && !hasExplicitTiDbConfiguration()
      ? { uri: connectionUri }
      : getTiDbConnectionOptions();
    pool = mysql.createPool({
      ...connectionOptions,
      ssl: {
        ...connectionOptions.ssl,
        rejectUnauthorized: true,
      },
      waitForConnections: true,
      connectionLimit: 5,
      maxIdle: 5,
      idleTimeout: 60000,
      queueLimit: 0
    });
  }
  return pool;
}

async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

module.exports = { getPool, query };
