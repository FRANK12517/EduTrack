'use strict';

const { Client } = require('pg');
const relational = require('../db/relational');

function local(url) {
  const parsed = new URL(url);
  return ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
}

async function createConnection(connectionString = process.env.SUPABASE_DB_URL) {
  if (!connectionString) throw new Error('SUPABASE_DB_URL is required for PostgreSQL integration tests');
  const parsed = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('Integration tests require Supabase PostgreSQL');
  const client = new Client({ connectionString, ssl: local(connectionString) ? false : { rejectUnauthorized: true } });
  await client.connect();
  const connection = {
    async query(sql, values = []) {
      const truncate = String(sql).match(/^\s*TRUNCATE\s+TABLE\s+([a-z][a-z0-9_]*)\s*$/i);
      if (truncate) {
        const table = truncate[1].toLowerCase();
        if (table === 'schema_migrations') return [[], []];
        const result = await client.query(`TRUNCATE TABLE public."${table}" RESTART IDENTITY CASCADE`);
        return [result.rows, result.fields];
      }
      const result = await client.query(relational.parameterize(sql, values), values);
      return [result.rows, result.fields];
    },
    release: () => client.end(),
    end: () => client.end(),
    execute(sql, values = []) { return connection.query(sql, values); }
  };
  return connection;
}

function createPool(connectionString = process.env.SUPABASE_DB_URL) {
  if (!connectionString) throw new Error('SUPABASE_DB_URL is required for PostgreSQL integration tests');
  const { Pool } = require('pg');
  const parsed = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('Integration tests require Supabase PostgreSQL');
  const pool = new Pool({ connectionString, ssl: local(connectionString) ? false : { rejectUnauthorized: true } });
  return {
    async query(sql, values = []) {
      const result = await pool.query(relational.parameterize(sql, values), values);
      return [result.rows, result.fields];
    },
    async getConnection() {
      const client = await pool.connect();
      const connection = {
        async query(sql, values = []) {
          const result = await client.query(relational.parameterize(sql, values), values);
          return [result.rows, result.fields];
        },
        release: () => client.release(),
        end: () => client.release(),
        execute(sql, values = []) { return connection.query(sql, values); }
      };
      return connection;
    },
    end: () => pool.end()
  };
}

module.exports = { createConnection, createPool };
