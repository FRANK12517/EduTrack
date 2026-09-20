'use strict';

// Read-only state reconciliation; no migration modules are imported.
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { readonly } = require('../lib/production-preflight-readonly');
const { options } = require('./verify-production-tidb-secrets');

function quote(name) { return `\`${String(name).replace(/`/g, '``')}\``; }
async function main() {
  const raw = await mysql.createConnection(options()); const db = readonly(raw);
  try {
    const [tables] = await db.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME');
    const [ids] = await db.query("SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE,COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND (COLUMN_NAME='id' OR COLUMN_NAME LIKE '%\\_id' ESCAPE '\\\\') ORDER BY TABLE_NAME,COLUMN_NAME");
    const names = tables.map(row => row.TABLE_NAME); const archives = names.filter(name => /^legacy_.*_archive$/.test(name));
    const counts = {}; for (const name of [...new Set([...archives, 'users', 'schools', 'students', 'schema_migrations'].filter(name => names.includes(name)))]) { const [[row]] = await db.query(`SELECT COUNT(*) AS count FROM ${quote(name)}`); counts[name] = Number(row.count); }
    const migrations = names.includes('schema_migrations') ? (await db.query('SELECT version,name FROM schema_migrations ORDER BY version'))[0].map(row => ({ version: row.version, name: row.name })) : [];
    const report = { mode: 'READ_ONLY', target: 'PRODUCTION', database: 'edutrack_dev', legacyArchives: archives, canonicalTables: ['users','schools','tenants','credentials','user_roles','tenant_memberships','staff'].filter(name => names.includes(name)), counts, identifierTypes: ids, migrationHistory: migrations, state: archives.length ? 'ARCHIVED_OR_TRANSITIONED_REQUIRES_REVIEW' : 'NO_LEGACY_ARCHIVE_DETECTED' };
    const out = path.join('artifacts', 'production-state-reconciliation.json'); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2), { mode: 0o600 });
    console.log(`Production state reconciliation complete: ${report.state}`);
  } finally { await db.end(); }
}
if (require.main === module) main().catch(() => { console.error('Production state reconciliation failed.'); process.exitCode = 1; });
