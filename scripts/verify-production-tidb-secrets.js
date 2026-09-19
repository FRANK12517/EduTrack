'use strict';

// A standalone read-only identity probe. It deliberately never imports db/relational.
const mysql = require('mysql2/promise');
const { readonly } = require('../lib/production-preflight-readonly');

const REQUIRED = ['TIDB_HOST', 'TIDB_PORT', 'TIDB_USER', 'TIDB_PASSWORD', 'TIDB_DATABASE', 'TIDB_CA_CERT'];
function options(env = process.env) {
  if (env.EDUTRACK_PRODUCTION_PREFLIGHT_TARGET !== 'production-read-only') throw new Error('Production target is not explicitly authorized for read-only verification');
  if (REQUIRED.some(key => !env[key])) throw new Error('Required TiDB production verification secret is unavailable');
  if (env.TIDB_DATABASE !== 'edutrack_dev' || String(env.TIDB_PORT) !== '4000') throw new Error('TiDB target does not match the approved production database identity');
  return { host: env.TIDB_HOST, port: Number(env.TIDB_PORT), user: env.TIDB_USER, password: env.TIDB_PASSWORD, database: env.TIDB_DATABASE, ssl: { ca: env.TIDB_CA_CERT.replace(/\\n/g, '\n'), rejectUnauthorized: true }, multipleStatements: false };
}
async function main() {
  const raw = await mysql.createConnection(options());
  const db = readonly(raw);
  try {
    const [[row]] = await db.query('SELECT DATABASE() AS database_name');
    if (row.database_name !== 'edutrack_dev') throw new Error('Connected database does not match the approved production database identity');
    console.log('TiDB production identity verification passed.');
  } catch (error) {
    console.error('TiDB production identity verification failed.');
    process.exitCode = 1;
  } finally { await db.end(); }
}
if (require.main === module) main();
module.exports = { options };
