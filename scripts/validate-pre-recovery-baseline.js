'use strict';

const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { readonly } = require('../lib/production-preflight-readonly');

const EXPECTED_TABLES = [
  'admission_applications', 'admission_documents', 'admission_intakes', 'admission_status_history', 'attendance', 'audit_log',
  'chat_conversation_participants', 'chat_conversations', 'chat_message_attachments', 'chat_messages', 'comment_library',
  'communication_campaign_recipients', 'communication_campaigns', 'cross_school_admin_access', 'fees', 'multi_school_audit_log',
  'payments', 'school_control_panel_settings', 'school_group_members', 'school_groups', 'schools', 'students', 'subject_scores',
  'term_records', 'users'
];
const FORBIDDEN_ENV = [
  'EDUTRACK_DATABASE_URL', 'DATABASE_URL', 'EDUTRACK_PRODUCTION_DATABASE_URL', 'TIDB_HOST', 'TIDB_PORT', 'TIDB_USER',
  'TIDB_PASSWORD', 'TIDB_DATABASE', 'TIDB_CA_CERT', 'EDUTRACK_TIDB_RECOVERY_REHEARSAL_DATABASE_URL',
  'EDUTRACK_TIDB_RELEASE_GATE_DATABASE_URL', 'EDUTRACK_TIDB_FRESH_TEST_DATABASE_URL', 'EDUTRACK_TIDB_TEST_DATABASE_URL'
];
function config(env = process.env) {
  if (!env.EDUTRACK_TIDB_PRE_RECOVERY_DATABASE_URL || FORBIDDEN_ENV.some((key) => env[key])) {
    throw new Error('Pre-recovery read-only target is not explicitly authorized');
  }
  return { uri: env.EDUTRACK_TIDB_PRE_RECOVERY_DATABASE_URL, ssl: { rejectUnauthorized: true }, multipleStatements: false };
}
function q(value) { return `\`${String(value).replace(/`/g, '``')}\``; }
function numeric(type) { return /^(tinyint|smallint|mediumint|int|integer|bigint|decimal|numeric)$/i.test(String(type)); }
function classify(report) {
  const exact = report.tableCount === 25 && report.foreignKeyCount === 40 && report.bigintIdentifierCount === 64
    && report.varcharIdentifierCount === 7 && report.implicitReferenceCount === 7 && report.pgsidColumnCount === 0
    && report.usersIdType === 'bigint' && report.schoolsIdType === 'bigint' && report.requiredAdmissionHistoryForeignKey
    && report.archiveArtifactCount === 0 && report.canonicalIdentityArtifactCount === 0
    && EXPECTED_TABLES.length === Object.keys(report.tableRowCounts).length
    && EXPECTED_TABLES.every((table) => report.tableRowCounts[table] === (table === 'schools' ? 1 : table === 'users' ? 2 : 0));
  return exact ? 'EXACT_CLEAN_LEGACY_BASELINE_MATCH' : 'NOT_CLEAN_LEGACY_BASELINE';
}
function write(report) {
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync(path.join('artifacts', 'pre-recovery-baseline-validation.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
}
async function inspect(db) {
  const [tables] = await db.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME');
  const names = tables.map((row) => row.TABLE_NAME);
  const [columns] = await db.query('SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()');
  const [keys] = await db.query('SELECT TABLE_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME,CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE()');
  const foreign = keys.filter((key) => key.REFERENCED_TABLE_NAME);
  const foreignColumns = new Set(foreign.map((key) => `${key.TABLE_NAME}.${key.COLUMN_NAME}`));
  const identifiers = columns.filter((column) => /(^id$|_id$|^id_)/i.test(column.COLUMN_NAME));
  const rowCounts = {};
  for (const table of names) {
    const [[row]] = await db.query(`SELECT COUNT(*) AS count FROM ${q(table)}`);
    rowCounts[table] = Number(row.count);
  }
  const artifacts = names.filter((name) => /^legacy_.*_archive$/.test(name) || ['legacy_account_identity_map', 'legacy_school_identity_map'].includes(name));
  const report = {
    mode: 'READ_ONLY', target: 'PRE_RECOVERY', tableCount: names.length, foreignKeyCount: foreign.length,
    bigintIdentifierCount: identifiers.filter((column) => numeric(column.DATA_TYPE)).length,
    varcharIdentifierCount: identifiers.filter((column) => /^(varchar|char)$/i.test(String(column.DATA_TYPE))).length,
    implicitReferenceCount: identifiers.filter((column) => column.COLUMN_NAME !== 'id' && !foreignColumns.has(`${column.TABLE_NAME}.${column.COLUMN_NAME}`)).length,
    pgsidColumnCount: columns.filter((column) => /pgsid|permanent.*student|student.*identifier|admission.*number/i.test(column.COLUMN_NAME)).length,
    tableRowCounts: rowCounts,
    usersIdType: columns.find((column) => column.TABLE_NAME === 'users' && column.COLUMN_NAME === 'id')?.DATA_TYPE || null,
    schoolsIdType: columns.find((column) => column.TABLE_NAME === 'schools' && column.COLUMN_NAME === 'id')?.DATA_TYPE || null,
    requiredAdmissionHistoryForeignKey: foreign.some((key) => key.TABLE_NAME === 'admission_status_history' && key.COLUMN_NAME === 'changed_by_user_id' && key.REFERENCED_TABLE_NAME === 'users' && key.REFERENCED_COLUMN_NAME === 'id'),
    archiveArtifactCount: artifacts.filter((name) => /^legacy_.*_archive$/.test(name)).length,
    canonicalIdentityArtifactCount: artifacts.filter((name) => ['legacy_account_identity_map', 'legacy_school_identity_map'].includes(name)).length
  };
  report.classification = classify(report);
  return report;
}
async function main() {
  const raw = await mysql.createConnection(config()); const db = readonly(raw);
  try { const report = await inspect(db); write(report); console.log(report.classification); }
  finally { await db.end(); }
}
if (require.main === module) main().catch(() => { write({ mode: 'READ_ONLY', target: 'PRE_RECOVERY', classification: 'BASELINE_IDENTITY_NOT_PROVABLE' }); console.log('BASELINE_IDENTITY_NOT_PROVABLE'); process.exitCode = 1; });
module.exports = { EXPECTED_TABLES, FORBIDDEN_ENV, config, classify, inspect };
