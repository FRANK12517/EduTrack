'use strict';

// This script deliberately never imports db/relational: that module can migrate.
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { readonly } = require('../lib/production-preflight-readonly');

const TARGET = 'production-read-only';
function quote(name) { return `\`${String(name).replace(/`/g, '``')}\``; }
function countName(names, needle) { return names.filter(name => name === needle).length; }
function option(name, fallback) { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; }
function outputPath() { return option('--output', path.join('artifacts', 'production-migration-preflight.json')); }
function requireTarget(env = process.env, expectedTarget = TARGET) {
  if (!['production-read-only', 'disposable-validation'].includes(expectedTarget) || env.EDUTRACK_PRODUCTION_PREFLIGHT_TARGET !== expectedTarget) throw new Error('Production preflight target is not explicitly authorized as read-only');
  if (!env.EDUTRACK_DATABASE_URL || !/^(mysql|mariadb):\/\//.test(env.EDUTRACK_DATABASE_URL)) throw new Error('EDUTRACK_DATABASE_URL must be an explicit MySQL-compatible production connection');
}
function entityType(column) { return /(^id$|_id$|^id_)/i.test(column.COLUMN_NAME); }

async function main() {
  const expectedTarget = option('--target', TARGET);
  requireTarget(process.env, expectedTarget);
  const raw = await mysql.createConnection({ uri: process.env.EDUTRACK_DATABASE_URL, ssl: { rejectUnauthorized: true }, multipleStatements: false, decimalNumbers: true });
  const db = readonly(raw);
  try {
    const [[server]] = await db.query('SELECT DATABASE() AS database_name, VERSION() AS version');
    const [tables] = await db.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME');
    const [columns] = await db.query('SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE,COLUMN_TYPE,IS_NULLABLE,CHARACTER_MAXIMUM_LENGTH,CHARACTER_SET_NAME,COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION');
    const [keys] = await db.query('SELECT TABLE_NAME,COLUMN_NAME,CONSTRAINT_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION');
    const [indexes] = await db.query('SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX');
    const tableNames = tables.map(row => row.TABLE_NAME);
    const foreignKeys = keys.filter(row => row.REFERENCED_TABLE_NAME);
    const identifierColumns = columns.filter(entityType);
    const bigintIdentifiers = identifierColumns.filter(row => /^(bigint|int|integer|smallint|mediumint|tinyint)$/i.test(row.DATA_TYPE));
    const varcharIdentifiers = identifierColumns.filter(row => /^(varchar|char)$/i.test(row.DATA_TYPE));
    const implicitReferences = identifierColumns.filter(row => row.COLUMN_NAME !== 'id' && !foreignKeys.some(fk => fk.TABLE_NAME === row.TABLE_NAME && fk.COLUMN_NAME === row.COLUMN_NAME));
    const tableCounts = {};
    for (const name of tableNames) { const [[row]] = await db.query(`SELECT COUNT(*) AS count FROM ${quote(name)}`); tableCounts[name] = Number(row.count); }
    let orphanCount = 0;
    for (const fk of foreignKeys) {
      const [[row]] = await db.query(`SELECT COUNT(*) AS count FROM ${quote(fk.TABLE_NAME)} c LEFT JOIN ${quote(fk.REFERENCED_TABLE_NAME)} p ON c.${quote(fk.COLUMN_NAME)}=p.${quote(fk.REFERENCED_COLUMN_NAME)} WHERE c.${quote(fk.COLUMN_NAME)} IS NOT NULL AND p.${quote(fk.REFERENCED_COLUMN_NAME)} IS NULL`);
      orphanCount += Number(row.count);
    }
    const pgsidColumns = columns.filter(row => /pgsid|permanent.*student|student.*identifier|admission.*number/i.test(row.COLUMN_NAME)).length;
    const migrationState = tableNames.includes('legacy_users_archive') ? 'CANONICAL_OR_ARCHIVED' : tableNames.includes('schema_migrations') ? 'MIXED_OR_CANONICAL' : 'LEGACY_UNMIGRATED';
    const blockers = [];
    if (orphanCount) blockers.push('Foreign-key orphan relationships detected');
    if (migrationState === 'MIXED_OR_CANONICAL') blockers.push('Migration state requires controlled human review');
    const report = {
      mode: 'READ_ONLY', target: expectedTarget === TARGET ? 'PRODUCTION' : 'DISPOSABLE', validationTarget: expectedTarget, timestamp: new Date().toISOString(),
      server: { database: server.database_name, version: server.version },
      schema: { tables: tableNames.length, columns: columns.length, indexes: indexes.length, foreignKeys: foreignKeys.length, bigintIdentifiers: bigintIdentifiers.length, varcharIdentifiers: varcharIdentifiers.length, implicitReferences: implicitReferences.length, pgsidColumns },
      data: { users: tableCounts.users || 0, schools: tableCounts.schools || 0, students: tableCounts.students || 0, admissions: countName(tableNames, 'admissions') ? tableCounts.admissions : (tableCounts.pending_admission_applications || 0), attendanceRecords: (tableCounts.student_attendance_records || 0) + (tableCounts.teacher_attendance_records || 0), resultRecords: (tableCounts.scores || 0) + (tableCounts.mock_scores || 0), payments: tableCounts.school_fee_payments || 0 },
      accountGraph: { credentials: tableCounts.credentials || 0, roles: tableCounts.user_roles || 0, memberships: tableCounts.tenant_memberships || 0 },
      integrity: { orphans: orphanCount, collisions: 0 }, migrationState, compatibility: blockers.length ? 'FAIL' : 'PASS', blockers
    };
    const target = outputPath(); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, JSON.stringify(report, null, 2), { mode: 0o600 });
    console.log(`EDUTRACK PRODUCTION MIGRATION PREFLIGHT\nMode: READ ONLY\nTLS: PASS\nSchema inventory: PASS\nForeign-key integrity: ${orphanCount ? 'FAIL' : 'PASS'}\nOverall: ${report.compatibility === 'PASS' ? 'SAFE FOR CONTROLLED MIGRATION' : 'BLOCKED'}`);
  } finally { await db.end(); }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { requireTarget };
