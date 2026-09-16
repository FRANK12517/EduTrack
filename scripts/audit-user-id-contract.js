'use strict';

const relational = require('../db/relational');

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

function isNumericType(type) {
  return /^(tinyint|smallint|mediumint|int|integer|bigint|decimal|numeric)/i.test(String(type));
}

async function main() {
  const db = relational.getPool();
  try {
    const describe = async (table) => {
      try {
        const [rows] = await db.query(`SHOW CREATE TABLE ${quoteIdentifier(table)}`);
        return rows[0]?.['Create Table'] || null;
      } catch { return null; }
    };
    const [userId] = await db.query(`SELECT DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH,
      CHARACTER_SET_NAME, COLLATION_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id'`);
    const [userMetrics] = await db.query(`SELECT COUNT(*) AS rows_total, COUNT(DISTINCT id) AS distinct_ids,
      COUNT(*) - COUNT(DISTINCT id) AS duplicate_ids, MAX(id) AS maximum_legacy_id FROM users`);
    const [accountMetrics] = await db.query(`SELECT
      COUNT(*) AS users_total,
      SUM(school_id IS NULL) AS users_without_school,
      COUNT(DISTINCT school_id) AS distinct_school_references,
      SUM(password_hash IS NULL OR password_hash = '') AS users_without_password_hash,
      MIN(CHAR_LENGTH(password_hash)) AS minimum_password_hash_length,
      MAX(CHAR_LENGTH(password_hash)) AS maximum_password_hash_length,
      SUM(password_hash REGEXP '^\\\\$2[aby]\\\\$') AS bcrypt_hashes,
      SUM(password_hash REGEXP '^\\\\$argon2') AS argon2_hashes
      FROM users`);
    const [roleMetrics] = await db.query(`SELECT role, COUNT(*) AS user_count FROM users GROUP BY role ORDER BY role`);
    const [schoolMapping] = await db.query(`SELECT
      SUM(users.school_id IS NOT NULL AND schools.id IS NULL) AS orphan_school_references,
      SUM(users.school_id IS NOT NULL AND schools.id IS NOT NULL) AS mapped_school_references
      FROM users LEFT JOIN schools ON users.school_id = schools.id`);
    const legacyStructures = {
      users: await describe('users'),
      schools: await describe('schools'),
      staff: await describe('staff'),
      credentials: await describe('credentials'),
      roles: await describe('roles'),
      userRoles: await describe('user_roles'),
      tenantMemberships: await describe('tenant_memberships')
    };
    const [foreignKeys] = await db.query(`SELECT k.TABLE_NAME, k.COLUMN_NAME, k.CONSTRAINT_NAME,
      k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME, c.DATA_TYPE, c.COLUMN_TYPE,
      c.IS_NULLABLE, c.CHARACTER_MAXIMUM_LENGTH, c.CHARACTER_SET_NAME, c.COLLATION_NAME,
      r.UPDATE_RULE, r.DELETE_RULE
      FROM information_schema.KEY_COLUMN_USAGE k
      JOIN information_schema.COLUMNS c ON c.TABLE_SCHEMA = k.TABLE_SCHEMA
        AND c.TABLE_NAME = k.TABLE_NAME AND c.COLUMN_NAME = k.COLUMN_NAME
      LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
        AND r.TABLE_NAME = k.TABLE_NAME AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
      WHERE k.TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME = 'users'
        AND k.REFERENCED_COLUMN_NAME = 'id'
      ORDER BY k.TABLE_NAME, k.ORDINAL_POSITION`);
    const [candidates] = await db.query(`SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE,
      CHARACTER_MAXIMUM_LENGTH, CHARACTER_SET_NAME, COLLATION_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> 'users' AND LOWER(COLUMN_NAME) REGEXP
        '(^user_id$|_user_id$|^created_by$|_created_by$|^updated_by$|_updated_by$|^changed_by$|_changed_by$|^approved_by$|_approved_by$|^reviewed_by$|_reviewed_by$|^owner_user_id$|_owner_user_id$|^actor_user_id$|_actor_user_id$)'
      ORDER BY TABLE_NAME, ORDINAL_POSITION`);
    const [indexes] = await db.query(`SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`);
    const indexMap = new Map();
    for (const index of indexes) {
      const key = `${index.TABLE_NAME}.${index.COLUMN_NAME}`;
      const values = indexMap.get(key) || [];
      values.push({ name: index.INDEX_NAME, unique: !Boolean(index.NON_UNIQUE), position: Number(index.SEQ_IN_INDEX) });
      indexMap.set(key, values);
    }
    const referenceColumns = new Map(candidates.map((column) => [`${column.TABLE_NAME}.${column.COLUMN_NAME}`, column]));
    for (const key of foreignKeys) {
      const reference = `${key.TABLE_NAME}.${key.COLUMN_NAME}`;
      if (!referenceColumns.has(reference)) referenceColumns.set(reference, {
        TABLE_NAME: key.TABLE_NAME,
        COLUMN_NAME: key.COLUMN_NAME,
        DATA_TYPE: key.DATA_TYPE,
        COLUMN_TYPE: key.COLUMN_TYPE,
        IS_NULLABLE: key.IS_NULLABLE,
        CHARACTER_MAXIMUM_LENGTH: key.CHARACTER_MAXIMUM_LENGTH,
        CHARACTER_SET_NAME: key.CHARACTER_SET_NAME,
        COLLATION_NAME: key.COLLATION_NAME
      });
    }
    const fkMap = new Map(foreignKeys.map((key) => [`${key.TABLE_NAME}.${key.COLUMN_NAME}`, key]));
    const references = [];
    for (const column of referenceColumns.values()) {
      const table = quoteIdentifier(column.TABLE_NAME);
      const name = quoteIdentifier(column.COLUMN_NAME);
      const join = `CAST(source.${name} AS CHAR) = CAST(users.id AS CHAR)`;
      const max = isNumericType(column.DATA_TYPE) ? `, MAX(source.${name}) AS maximum_value` : '';
      const [metrics] = await db.query(`SELECT COUNT(*) AS rows_total,
        SUM(source.${name} IS NULL) AS null_rows,
        SUM(source.${name} IS NOT NULL) AS populated_rows,
        SUM(source.${name} IS NOT NULL AND users.id IS NULL) AS orphan_rows,
        COUNT(DISTINCT source.${name}) AS distinct_values${max}
        FROM ${table} source LEFT JOIN users ON ${join}`);
      const key = `${column.TABLE_NAME}.${column.COLUMN_NAME}`;
      references.push({
        table: column.TABLE_NAME,
        column: column.COLUMN_NAME,
        type: { dataType: column.DATA_TYPE, columnType: column.COLUMN_TYPE, nullable: column.IS_NULLABLE === 'YES', length: column.CHARACTER_MAXIMUM_LENGTH, charset: column.CHARACTER_SET_NAME, collation: column.COLLATION_NAME },
        foreignKey: fkMap.get(key) || null,
        indexes: indexMap.get(key) || [],
        metrics: Object.fromEntries(Object.entries(metrics[0]).map(([key, value]) => [key, value === null ? 0 : value]))
      });
    }
    const tables = [...new Set(foreignKeys.map((key) => key.TABLE_NAME))];
    const definitions = {};
    for (const table of tables) {
      const [rows] = await db.query(`SHOW CREATE TABLE ${quoteIdentifier(table)}`);
      definitions[table] = rows[0]?.['Create Table'] || null;
    }
    console.log(JSON.stringify({ userId: userId[0] || null, userMetrics: userMetrics[0], accountMetrics: accountMetrics[0], roleMetrics, schoolMapping: schoolMapping[0], legacyStructures, foreignKeys, references, tableDefinitions: definitions }));
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error('User-ID contract audit failed.');
  process.exitCode = 1;
});
