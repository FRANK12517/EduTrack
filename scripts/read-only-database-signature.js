'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { readonly } = require('../lib/production-preflight-readonly');
const { requireTarget } = require('./production-migration-preflight');

function option(name, fallback) { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; }
function quote(name) { return `\`${String(name).replace(/`/g, '``')}\``; }
async function main() {
  const expectedTarget = option('--target', 'disposable-validation');
  requireTarget(process.env, expectedTarget);
  const raw = await mysql.createConnection({ uri: process.env.EDUTRACK_DATABASE_URL, ssl: { rejectUnauthorized: true }, multipleStatements: false });
  const db = readonly(raw);
  try {
    const [tables] = await db.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME');
    const [columns] = await db.query('SELECT TABLE_NAME,COLUMN_NAME,ORDINAL_POSITION,COLUMN_TYPE,IS_NULLABLE,COLUMN_KEY FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION');
    const [foreignKeys] = await db.query('SELECT TABLE_NAME,COLUMN_NAME,CONSTRAINT_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION');
    const [indexes] = await db.query('SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX');
    const rows = {};
    for (const { TABLE_NAME } of tables) { const [[result]] = await db.query(`SELECT COUNT(*) AS count FROM ${quote(TABLE_NAME)}`); rows[TABLE_NAME] = Number(result.count); }
    const migrationState = Object.hasOwn(rows, 'schema_migrations') ? rows.schema_migrations : null;
    const normalized = { tables: tables.map(x => x.TABLE_NAME), columns, foreignKeys, indexes, rows, migrationState };
    const sha256 = crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    const report = { target: expectedTarget === 'disposable-validation' ? 'DISPOSABLE' : 'PRODUCTION', mode: 'READ_ONLY', sha256, tables: tables.length, columns: columns.length, foreignKeys: foreignKeys.length, indexes: indexes.length, rowCountSignature: crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex'), schemaMigrations: migrationState };
    const output = option('--output', path.join('artifacts', 'preflight-signature.json')); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 }); console.log(JSON.stringify(report));
  } finally { await db.end(); }
}
if (require.main === module) main().catch(() => { console.error('Read-only database signature failed.'); process.exitCode = 1; });
