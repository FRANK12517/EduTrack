'use strict';

// This cutover is deliberately executable only in the disposable TiDB test
// environment. Production execution requires a separately reviewed command.
const relational = require('../db/relational');

function qi(value) { return `\`${String(value).replace(/`/g, '``')}\``; }
function canonicalId(prefix, expression) { return `CONCAT('${prefix}_lg_', LOWER(SUBSTRING(SHA2(${expression},256),1,24)))`; }

function isAuthorizedIsolatedMigrationTarget(env = process.env) {
  if (env.NODE_ENV !== 'test') return false;
  return env.EDUTRACK_ALLOW_ISOLATED_LEGACY_ACCOUNT_CUTOVER === 'true'
    || env.EDUTRACK_RELEASE_GATE_TARGET === 'isolated-release-gate';
}

function isAuthorizedRecoveryRehearsalTarget(env = process.env) {
  if (env.NODE_ENV !== 'recovery-rehearsal') return false;
  if (env.EDUTRACK_RECOVERY_REHEARSAL_CONFIRMATION !== 'RECOVER_ISOLATED_REHEARSAL_ONLY') return false;
  if (!env.EDUTRACK_TIDB_RECOVERY_REHEARSAL_DATABASE_URL) return false;
  return ![
    'EDUTRACK_DATABASE_URL', 'DATABASE_URL', 'TIDB_HOST', 'TIDB_PORT', 'TIDB_USER',
    'TIDB_PASSWORD', 'TIDB_DATABASE', 'TIDB_CA_CERT',
    'EDUTRACK_TIDB_RELEASE_GATE_DATABASE_URL', 'EDUTRACK_TIDB_FRESH_TEST_DATABASE_URL',
    'EDUTRACK_TIDB_TEST_DATABASE_URL'
  ].some((key) => env[key]);
}

async function tableExists(db, table) {
  const [rows] = await db.query('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? LIMIT 1', [table]);
  return rows.length === 1;
}

async function userIdType(db) {
  const [rows] = await db.query("SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='id'");
  return rows[0]?.DATA_TYPE || null;
}

async function legacyInboundForeignKeys(db) {
  const [rows] = await db.query(`SELECT k.TABLE_NAME,k.COLUMN_NAME,k.CONSTRAINT_NAME,c.IS_NULLABLE
    FROM information_schema.KEY_COLUMN_USAGE k
    JOIN information_schema.COLUMNS c ON c.TABLE_SCHEMA=k.TABLE_SCHEMA AND c.TABLE_NAME=k.TABLE_NAME AND c.COLUMN_NAME=k.COLUMN_NAME
    WHERE k.TABLE_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME='users' AND k.REFERENCED_COLUMN_NAME='id'
    ORDER BY k.TABLE_NAME,k.ORDINAL_POSITION`);
  return rows;
}

async function legacyTables(db) {
  const [rows] = await db.query(`SELECT TABLE_NAME FROM information_schema.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME NOT IN (
      'legacy_account_identity_map','legacy_school_identity_map',
      'communication_campaigns','communication_campaign_recipients'
    ) ORDER BY TABLE_NAME`);
  return rows.map(row => row.TABLE_NAME);
}

function archiveName(table) { return `legacy_${table}_archive`; }

async function preflight(db, foreignKeys) {
  const [accounts] = await db.query(`SELECT COUNT(*) AS total,
    SUM(school_id IS NULL) AS missing_school,
    SUM(staff_id IS NULL OR TRIM(staff_id)='') AS missing_staff,
    SUM(full_name IS NULL OR TRIM(full_name)='') AS missing_name,
    SUM(role NOT IN ('HEADTEACHER','SUPER_ADMIN')) AS unsupported_role,
    SUM(email IS NULL OR TRIM(email)='') AS missing_email
    FROM users`);
  const value = accounts[0];
  if (Number(value.total) !== 2 || Number(value.missing_school) || Number(value.missing_staff) || Number(value.missing_name) || Number(value.unsupported_role)) {
    throw new Error('Legacy account preflight failed: account mapping is not deterministic');
  }
  for (const key of foreignKeys) {
    const [rows] = await db.query(`SELECT COUNT(*) AS populated FROM ${qi(key.TABLE_NAME)} WHERE ${qi(key.COLUMN_NAME)} IS NOT NULL`);
    if (Number(rows[0].populated) !== 0) throw new Error(`Legacy account preflight failed: ${key.TABLE_NAME}.${key.COLUMN_NAME} is populated`);
  }
  const [schoolOrphans] = await db.query('SELECT COUNT(*) AS count FROM users u LEFT JOIN schools s ON s.id=u.school_id WHERE s.id IS NULL');
  if (Number(schoolOrphans[0].count) !== 0) throw new Error('Legacy account preflight failed: orphan school mapping');
  return value;
}

async function prepare() {
  const db = relational.getPool();
  try {
    const type = await userIdType(db);
    if (type !== 'bigint') return { needed: false };
    if (!isAuthorizedIsolatedMigrationTarget()) {
      throw new Error('Legacy account cutover is restricted to the explicitly authorized isolated test environment');
    }
    const foreignKeys = await legacyInboundForeignKeys(db);
    if (foreignKeys.length !== 12) throw new Error(`Legacy account preflight failed: expected 12 inbound user foreign keys, found ${foreignKeys.length}`);
    const metrics = await preflight(db, foreignKeys);
    const tables = await legacyTables(db);
    const archived = tables.map(archiveName);
    const [existingArchives] = await db.query(`SELECT TABLE_NAME FROM information_schema.TABLES
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${archived.map(() => '?').join(',')})`, archived);
    if (existingArchives.length) throw new Error('Legacy account cutover cannot resume from a partial archive state; restore the fresh isolated baseline before retrying');
    await db.query(`CREATE TABLE IF NOT EXISTS legacy_account_identity_map (
      legacy_user_id_text VARCHAR(80) PRIMARY KEY, canonical_user_id VARCHAR(80) NOT NULL UNIQUE,
      legacy_school_id_text VARCHAR(80) NOT NULL, migration_status VARCHAR(32) NOT NULL,
      migrated_at TIMESTAMP NOT NULL, metadata_json JSON NULL) ENGINE=InnoDB`);
    await db.query(`CREATE TABLE IF NOT EXISTS legacy_school_identity_map (
      legacy_school_id_text VARCHAR(80) PRIMARY KEY, canonical_school_id VARCHAR(80) NOT NULL UNIQUE,
      canonical_tenant_id VARCHAR(80) NOT NULL UNIQUE, migration_status VARCHAR(32) NOT NULL,
      migrated_at TIMESTAMP NOT NULL) ENGINE=InnoDB`);
    await db.query(`INSERT INTO legacy_school_identity_map (legacy_school_id_text,canonical_school_id,canonical_tenant_id,migration_status,migrated_at)
      SELECT CAST(id AS CHAR(80)),${canonicalId('sch', 'CAST(id AS CHAR)')},${canonicalId('ten', 'CAST(id AS CHAR)')},'PREPARED',CURRENT_TIMESTAMP FROM schools
      ON DUPLICATE KEY UPDATE migration_status=VALUES(migration_status)`);
    await db.query(`INSERT INTO legacy_account_identity_map (legacy_user_id_text,canonical_user_id,legacy_school_id_text,migration_status,migrated_at,metadata_json)
      SELECT CAST(id AS CHAR(80)),${canonicalId('usr', 'CAST(id AS CHAR)')},CAST(school_id AS CHAR(80)),'PREPARED',CURRENT_TIMESTAMP,
        JSON_OBJECT('legacyRole',role,'credentialTransition','RESET_REQUIRED') FROM users
      ON DUPLICATE KEY UPDATE migration_status=VALUES(migration_status)`);
    // A single multi-table rename keeps the legacy FK graph intact as archives;
    // all populated identity data remains available for deterministic rollback.
    await db.query(`RENAME TABLE ${tables.map(table => `${qi(table)} TO ${qi(archiveName(table))}`).join(', ')}`);
    return { needed: true, metrics, foreignKeys };
  } finally { /* relational.migrate owns the shared pool lifecycle */ }
}

async function materialize(foreignKeys) {
  const db = relational.getPool();
  const conn = await db.getConnection();
  try {
    if (!isAuthorizedIsolatedMigrationTarget() && !isAuthorizedRecoveryRehearsalTarget()) {
      throw new Error('Canonical identity materialization is restricted to an explicitly authorized isolated target');
    }
    if (!(await tableExists(conn, 'legacy_users_archive'))) return { needed: false };
    await conn.beginTransaction();
    await conn.query(`INSERT INTO tenants (id,name,tenant_type,active,created_at,updated_at)
      SELECT m.canonical_tenant_id,s.name,'SCHOOL',TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      FROM legacy_school_identity_map m JOIN legacy_schools_archive s ON CAST(s.id AS CHAR)=m.legacy_school_id_text
      ON DUPLICATE KEY UPDATE name=VALUES(name),updated_at=VALUES(updated_at)`);
    await conn.query(`INSERT INTO schools (id,tenant_id,name,active,created_at,updated_at)
      SELECT m.canonical_school_id,m.canonical_tenant_id,s.name,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      FROM legacy_school_identity_map m JOIN legacy_schools_archive s ON CAST(s.id AS CHAR)=m.legacy_school_id_text
      ON DUPLICATE KEY UPDATE tenant_id=VALUES(tenant_id),name=VALUES(name),active=VALUES(active),updated_at=VALUES(updated_at)`);
    await conn.query(`INSERT INTO users (id,email,staff_id,status,active,development_fixture,hierarchy,scope_json,created_at,updated_at)
      SELECT m.canonical_user_id,NULLIF(TRIM(u.email),''),u.staff_id,'RESET_REQUIRED',TRUE,FALSE,
        CASE u.role WHEN 'SUPER_ADMIN' THEN 'ROOT' ELSE 'SCHOOL' END,
        CASE u.role WHEN 'SUPER_ADMIN' THEN JSON_ARRAY('ROOT') ELSE JSON_ARRAY('SCHOOL') END,
        COALESCE(u.created_at,CURRENT_TIMESTAMP),CURRENT_TIMESTAMP
      FROM legacy_account_identity_map m JOIN legacy_users_archive u ON CAST(u.id AS CHAR)=m.legacy_user_id_text
      ON DUPLICATE KEY UPDATE email=VALUES(email),staff_id=VALUES(staff_id),status='RESET_REQUIRED',active=TRUE,updated_at=VALUES(updated_at)`);
    await conn.query(`INSERT INTO credentials (id,user_id,password_hash,access_code_hash,status,created_at,updated_at)
      SELECT ${canonicalId('cred', 'm.legacy_user_id_text')},m.canonical_user_id,'RESET_REQUIRED',NULL,'RESET_REQUIRED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      FROM legacy_account_identity_map m
      ON DUPLICATE KEY UPDATE password_hash='RESET_REQUIRED',access_code_hash=NULL,status='RESET_REQUIRED',updated_at=VALUES(updated_at)`);
    await conn.query(`INSERT INTO user_roles (user_id,role_id,assigned_at)
      SELECT m.canonical_user_id,CONCAT('role_',LOWER(u.role)),CURRENT_TIMESTAMP
      FROM legacy_account_identity_map m JOIN legacy_users_archive u ON CAST(u.id AS CHAR)=m.legacy_user_id_text
      ON DUPLICATE KEY UPDATE role_id=VALUES(role_id),assigned_at=VALUES(assigned_at)`);
    await conn.query(`INSERT INTO tenant_memberships (user_id,tenant_id,scope_json,active,created_at)
      SELECT m.canonical_user_id,s.canonical_tenant_id,JSON_OBJECT('schoolId',s.canonical_school_id),TRUE,CURRENT_TIMESTAMP
      FROM legacy_account_identity_map m JOIN legacy_school_identity_map s ON s.legacy_school_id_text=m.legacy_school_id_text
      ON DUPLICATE KEY UPDATE scope_json=VALUES(scope_json),active=TRUE`);
    await conn.query(`INSERT INTO staff (id,user_id,staff_identifier,full_name,email,staff_type,status,tenant_id,school_id,created_at,updated_at)
      SELECT ${canonicalId('stf', 'm.legacy_user_id_text')},m.canonical_user_id,u.staff_id,u.full_name,NULLIF(TRIM(u.email),''),u.role,'RESET_REQUIRED',s.canonical_tenant_id,s.canonical_school_id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      FROM legacy_account_identity_map m
      JOIN legacy_users_archive u ON CAST(u.id AS CHAR)=m.legacy_user_id_text
      JOIN legacy_school_identity_map s ON s.legacy_school_id_text=m.legacy_school_id_text
      ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),full_name=VALUES(full_name),email=VALUES(email),status='RESET_REQUIRED',updated_at=VALUES(updated_at)`);
    await conn.query("UPDATE legacy_account_identity_map SET migration_status='MIGRATED',migrated_at=CURRENT_TIMESTAMP");
    await conn.query("UPDATE legacy_school_identity_map SET migration_status='MIGRATED',migrated_at=CURRENT_TIMESTAMP");
    await conn.query(`INSERT INTO audit_events (id,event_type,actor_user_id,occurred_at,metadata_json) VALUES
      ('audit_legacy_account_cutover','LEGACY_ACCOUNT_CUTOVER',NULL,CURRENT_TIMESTAMP,JSON_OBJECT('credentialTransition','RESET_REQUIRED','legacyPasswordsCopied',false))
      ON DUPLICATE KEY UPDATE occurred_at=VALUES(occurred_at),metadata_json=VALUES(metadata_json)`);
    await conn.commit();
    return { needed: true };
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
}

module.exports = { prepare, materialize, isAuthorizedIsolatedMigrationTarget, isAuthorizedRecoveryRehearsalTarget };
