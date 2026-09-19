'use strict';

const relational = require('../db/relational');

async function main() {
  const db = relational.getPool();
  try {
    const [ids] = await db.query(`SELECT TABLE_NAME,DATA_TYPE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE() AND ((TABLE_NAME='users' AND COLUMN_NAME='id') OR (TABLE_NAME='schools' AND COLUMN_NAME='id'))
      ORDER BY TABLE_NAME`);
    const types = Object.fromEntries(ids.map(row => [row.TABLE_NAME, row.DATA_TYPE]));
    const [foreignKeys] = await db.query(`SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA=DATABASE() AND CONSTRAINT_NAME='fk_admhist_changer'
        AND TABLE_NAME='admission_status_history' AND COLUMN_NAME='changed_by_user_id'
        AND REFERENCED_TABLE_NAME='users' AND REFERENCED_COLUMN_NAME='id' LIMIT 1`);
    const [users] = await db.query('SELECT COUNT(*) AS count FROM users');
    const [allTables] = await db.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');
    const artifacts = allTables.filter(row => ['legacy_account_identity_map', 'legacy_school_identity_map'].includes(row.TABLE_NAME) || /^legacy_.*_archive$/.test(row.TABLE_NAME));
    const fresh = types.users === 'bigint' && types.schools === 'bigint' && foreignKeys.length === 1 && Number(users[0].count) === 2 && artifacts.length === 0;
    const completedCutover = types.users === 'varchar' && types.schools === 'varchar' && artifacts.some(row => row.TABLE_NAME === 'legacy_account_identity_map') && artifacts.some(row => row.TABLE_NAME === 'legacy_users_archive');
    const valid = fresh || completedCutover;
    console.log(JSON.stringify({ freshLegacyBaseline: fresh, completedIsolatedCutover: completedCutover, usersIdType: types.users || null, schoolsIdType: types.schools || null, admissionHistoryUserForeignKey: foreignKeys.length === 1, legacyUserCount: Number(users[0].count), cutoverArtifacts: artifacts.length }));
    if (!valid) process.exitCode = 1;
  } finally { await db.end(); }
}

main().catch((error) => { console.error(`Fresh legacy baseline verification failed: ${error.code || 'DATABASE_ERROR'} ${error.message || ''}`); process.exitCode = 1; });
