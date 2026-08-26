'use strict';

const mysql = require('mysql2/promise');

let pool;

function getPool() {
  if (!pool) {
    const connectionUri = process.env.EDUTRACK_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionUri) throw new Error('Relational database connection URL is not configured');
    pool = mysql.createPool({
      uri: connectionUri,
      ssl: { minVersion: 'TLSv1.2' },
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
