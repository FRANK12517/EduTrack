'use strict';

const postgres = require('./postgres-pool');
const { parameterize } = require('../db/relational');

async function query(sql, params = []) {
  const result = await postgres.getPool().query(parameterize(sql, params), params);
  return result.rows;
}

module.exports = { getPool: postgres.getPool, query, close: postgres.closePool };
