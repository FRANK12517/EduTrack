const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outputPath = path.join(root, 'docs', 'postgresql-schema-reconciliation.json');
const definitionSources = [
  { path: 'db/relational.js', kind: 'migration_runner' },
  { path: 'db/schema.sql', kind: 'schema_inventory' },
  { path: 'scripts/legacy-account-cutover.js', kind: 'migration_script' }
];
const referenceOnlyTables = [
  { name: 'term_records', classification: 'active_application', evidence_source: 'api/legacy.js', query_observed_columns: ['id', 'school_id', 'student_id', 'academic_year', 'term', 'class_name', 'form', 'rank_in_class', 'index_no', 'total_score', 'subjects_sat', 'aggregate', 'class_position', 'conduct', 'interest', 'attitude', 'ct_remarks', 'ht_remarks', 'times_present', 'times_absent', 'total_school_days', 'promotion_status', 'result_date'], note: 'Legacy report reads and writes these observed column names. No type/nullability/key/index/constraint DDL is available.' },
  { name: 'subject_scores', classification: 'active_application', evidence_source: 'api/legacy.js', query_observed_columns: ['term_record_id', 'subject', 'class_score', 'exam_score', 'project', 'ce1', 'ce2', 'group_work', 'class_test', 'total_ca', 'ca_50', 'exam_50', 'total_score', 'grade', 'remark'], note: 'Legacy report issues SELECT * and writes these observed column names; the complete column list is unknown. No type/nullability/key/index/constraint DDL is available.' },
  { name: 'legacy_schools_archive', classification: 'legacy', evidence_source: 'scripts/legacy-account-cutover.js', query_observed_columns: ['id', 'name'], note: 'Dynamic RENAME TABLE output from the pre-cutover schools table. Materialization reads id and name; the full archived definition and data presence require an isolated pre-cutover catalog/backup.' },
  { name: 'legacy_users_archive', classification: 'legacy', evidence_source: 'scripts/legacy-account-cutover.js', query_observed_columns: ['id', 'email', 'staff_id', 'full_name', 'role'], note: 'Dynamic RENAME TABLE output from the pre-cutover users table. Materialization reads id, email, staff_id, full_name, and role; the full archived definition and data presence require an isolated pre-cutover catalog/backup.' }
];
const unreferencedTableReviews = {
  result_slips: {
    classification: 'unresolved',
    disposition: 'Runner DDL and result-slip UI terminology do not prove this relation is read or written. Current SQL evidence points to published_results and other result data; no direct result_slips query was found.',
    alias_and_column_search: ['result slip', 'published_result_id', 'issued_at', 'metadata_json'],
    files_examined: ['db/relational.js', 'db/schema.sql', 'api/legacy.js', 'server.js', 'lib/db.js', 'lib/postgres.js', 'individual-result-slip-fix.js', 'scripts/migrate-business-data.js', 'scripts/production-migration-preflight.js'],
    additional_evidence: [{ source: 'individual-result-slip-fix.js', line: 269, kind: 'ui_only_name_match', observation: 'UI resize helper name; not a database access.' }],
    evidence_required: 'Trace result-slip API/service call paths and compare with an authorized source/target catalog and row count; do not infer table use from UI feature terminology.'
  },
  school_fee_payments: {
    classification: 'indirect_use',
    disposition: 'Production migration preflight reads the school_fee_payments count from a generic table-count summary; no direct application SQL CRUD was found. A count/reporting reference does not prove the table exists or is used for feature writes.',
    alias_and_column_search: ['school fee payments', 'receipt_no', 'fee_id', 'student_id', 'paid_at'],
    files_examined: ['db/relational.js', 'db/schema.sql', 'api/legacy.js', 'server.js', 'lib/db.js', 'lib/postgres.js', 'scripts/production-migration-preflight.js', 'scripts/migrate-business-data.js'],
    additional_evidence: [{ source: 'scripts/production-migration-preflight.js', line: 56, kind: 'indirect_operational_count', observation: 'Reads tableCounts.school_fee_payments for a payment count metric; does not issue a query against this relation.' }],
    evidence_required: 'Trace the table-count producer, fee payment call paths, and authorized source/target catalog and row counts.'
  },
  school_fees: {
    classification: 'unresolved',
    disposition: 'The current fee routes use the JSON compatibility store (db.schoolFees), not the relational school_fees table. The domain feature therefore does not prove relation usage or table-data disposition.',
    alias_and_column_search: ['school fees', 'db.schoolFees', 'publication_status', 'scope_class', 'scope_student'],
    files_examined: ['db/relational.js', 'db/schema.sql', 'api/legacy.js', 'server.js', 'lib/db.js', 'lib/postgres.js'],
    additional_evidence: [{ source: 'server.js', line: 669, kind: 'json_compatibility_store', observation: 'Fee publish/sync paths read/write db.schoolFees in the JSON compatibility store, not the relational table.' }],
    evidence_required: 'Determine whether any deployed version or retained backup used the relational table; compare authorized catalogs and counts before declaring it unused.'
  },
  school_subjects: {
    classification: 'unresolved',
    disposition: 'Only migration-runner DDL, related FK names, and test cleanup lists were found; no direct application query or generic CRUD access was found.',
    alias_and_column_search: ['school subjects', 'school_id', 'subject_id'],
    files_examined: ['db/relational.js', 'db/schema.sql', 'api/legacy.js', 'server.js', 'lib/db.js', 'lib/postgres.js', 'scripts/migrate-business-data.js'],
    additional_evidence: [],
    evidence_required: 'Inspect deployed call paths, jobs, old releases, source/target catalogs, and row counts; retain data until owner disposition is approved.'
  },
  teacher_subject_assignments: {
    classification: 'unresolved',
    disposition: 'Only migration-runner DDL, related FK names, and test cleanup lists were found; the current relational API exposes teacher-class assignment, not a query for this table.',
    alias_and_column_search: ['teacher subject assignment', 'staff_id', 'subject_id', 'class_id', 'assigned_at'],
    files_examined: ['db/relational.js', 'db/schema.sql', 'api/legacy.js', 'server.js', 'lib/db.js', 'lib/postgres.js', 'scripts/migrate-business-data.js'],
    additional_evidence: [],
    evidence_required: 'Inspect deployed call paths, jobs, old releases, source/target catalogs, and row counts; retain data until owner disposition is approved.'
  }
};
const ignoreDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage', 'artifacts']);

function sourceText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function findDefinitions(text, source) {
  const definitions = [];
  const expression = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"\w.]+)/ig;
  let match;
  while ((match = expression.exec(text))) {
    const table = match[1].replace(/[`"]+/g, '').split('.').pop();
    const open = text.indexOf('(', expression.lastIndex);
    if (open < 0) continue;
    let depth = 0;
    let quote = null;
    let escaped = false;
    let close = -1;
    for (let index = open; index < text.length; index += 1) {
      const character = text[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === quote) {
          if (text[index + 1] === quote) index += 1;
          else quote = null;
        }
        continue;
      }
      if (character === "'" || character === '"' || character === '`') {
        quote = character;
        continue;
      }
      if (character === '(') depth += 1;
      if (character === ')' && --depth === 0) {
        close = index;
        break;
      }
    }
    if (close < 0) continue;
    const sql = text.slice(match.index, close + 1).trim();
    const body = text.slice(open + 1, close);
    const elements = splitTopLevel(body);
    const columns = [];
    const constraints = [];
    for (const element of elements) {
      const item = element.trim();
      if (!item) continue;
      if (/^(?:CONSTRAINT\b|PRIMARY\s+KEY\b|FOREIGN\s+KEY\b|UNIQUE\s+(?:KEY|INDEX)?\b|KEY\b|INDEX\b|CHECK\b)/i.test(item)) {
        constraints.push(item);
      } else {
        const columnMatch = item.match(/^\s*([`"\w]+)\s+([\w]+(?:\s*\([^)]*\))?(?:\s+UNSIGNED)?)([\s\S]*)$/i);
        if (columnMatch) {
          const name = columnMatch[1].replace(/[`"]+/g, '');
          columns.push({
            name,
            source_type: columnMatch[2].trim().replace(/\s+/g, ' ').toUpperCase(),
            definition: item,
            nullable: /\bNOT\s+NULL\b/i.test(columnMatch[3]) ? false : (/\bNULL\b/i.test(columnMatch[3]) ? true : null),
            default: (columnMatch[3].match(/\bDEFAULT\s+((?:'[^']*')|(?:"[^"]*")|[^\s,]+)/i) || [])[1] || null,
            inline_primary_key: /\bPRIMARY\s+KEY\b/i.test(columnMatch[3]),
            inline_unique: /\bUNIQUE\b/i.test(columnMatch[3])
          });
        } else {
          constraints.push(item);
        }
      }
    }
    definitions.push({ table, source, line: text.slice(0, match.index).split('\n').length, sql, columns, constraints });
    expression.lastIndex = close + 1;
  }
  return definitions;
}

function splitTopLevel(text) {
  const output = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (character === quote) {
        if (text[index + 1] === quote) index += 1;
        else quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"' || character === '`') quote = character;
    else if (character === '(') depth += 1;
    else if (character === ')') depth -= 1;
    else if (character === ',' && depth === 0) {
      output.push(text.slice(start, index));
      start = index + 1;
    }
  }
  output.push(text.slice(start));
  return output;
}

function extractStringFragments(text) {
  const fragments = [];
  let index = 0;
  while (index < text.length) {
    const quote = text[index];
    if (quote !== "'" && quote !== '"' && quote !== '`') {
      index += 1;
      continue;
    }
    const start = index;
    const line = text.slice(0, start).split('\n').length;
    index += 1;
    let value = '';
    let escaped = false;
    while (index < text.length) {
      const character = text[index++];
      if (escaped) {
        value += character;
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        if (text[index] === quote && quote !== '`') {
          value += quote;
          index += 1;
        } else break;
      } else value += character;
    }
    if (/\b(?:SELECT|INSERT|UPDATE|DELETE|ALTER)\b/i.test(value)) fragments.push({ text: value, line });
  }
  return fragments;
}

function allFiles(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoreDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) allFiles(fullPath, files);
    else if (/\.(?:js|cjs|mjs|sql)$/i.test(entry.name)) files.push(fullPath);
  }
  return files;
}

function tableMentions(text, knownNames) {
  if (!/\b(?:SELECT\b[\s\S]*\bFROM\b|INSERT\s+(?:IGNORE\s+)?INTO\b|DELETE\s+FROM\b)/i.test(text)) return new Map();
  const found = new Map();
  const patterns = [
    { operation: 'select', expression: /\bFROM\s+[`"\w.]+/ig },
    { operation: 'join', expression: /\bJOIN\s+[`"\w.]+/ig },
    { operation: 'insert', expression: /\bINSERT\s+(?:IGNORE\s+)?INTO\s+[`"\w.]+/ig },
    { operation: 'update', expression: /^\s*UPDATE\s+[`"\w.]+/ig },
    { operation: 'delete', expression: /\bDELETE\s+FROM\s+[`"\w.]+/ig }
  ];
  for (const { operation, expression } of patterns) {
    let match;
    while ((match = expression.exec(text))) {
      const table = match[0].split(/\s+/).pop().replace(/[`"]+/g, '').split('.').pop();
      if (knownNames.has(table)) found.set(table, [...new Set([...(found.get(table) || []), operation])]);
    }
  }
  return found;
}

function classifyReferenceCandidate(token, source) {
  if (/^unnest$/i.test(token)) return { classification: 'confirmed_database_operation', evidence_kind: 'postgres_set_returning_catalog_function', note: 'UNNEST expands catalog key/role arrays; it is a PostgreSQL function, not a relation.' };
  if (/^pg_(?:index|attribute|class|namespace)$/i.test(token) || /^(?:TABLES|COLUMNS|KEY_COLUMN_USAGE|REFERENTIAL_CONSTRAINTS|STATISTICS|tables|columns|key_column_usage|table_constraints|constraint_column_usage|referential_constraints)$/i.test(token)) {
    return { classification: 'confirmed_database_operation', evidence_kind: 'system_catalog_introspection', note: 'Catalog metadata relation queried by schema/recovery inspection tooling; not an application data table.' };
  }
  if (/^(?:LATERAL)$/i.test(token)) return { classification: 'false_positive', evidence_kind: 'sql_keyword', note: 'LATERAL is a SQL keyword, not a relation.' };
  if (/^(?:the|verified)$/i.test(token) && source === 'school-user-guide.js') return { classification: 'false_positive', evidence_kind: 'prose', note: 'Natural-language guide copy matched a SQL-like pattern.' };
  return { classification: 'unresolved', evidence_kind: 'unclassified_sql_like_text', note: 'Needs source-context review before being treated as a database relation.' };
}

function classify(name, appReferences, sources) {
  if (['legacy_account_identity_map', 'legacy_school_identity_map', 'legacy_schools_archive', 'legacy_users_archive'].includes(name)) return 'legacy';
  if (name === 'schema_migrations') return 'migration_metadata';
  if (new Set(['users', 'credentials', 'roles', 'permissions', 'role_permissions', 'user_roles', 'server_sessions', 'password_reset_records', 'tenant_memberships']).has(name)) return 'active_authentication_or_session';
  if (new Set(['audit_events', 'transport_audit_events', 'hostel_audit_events']).has(name) && appReferences.length) return 'active_system_or_operational';
  if (appReferences.length) return 'active_application';
  if (sources.some((source) => source.kind === 'migration_runner') || sources.every((source) => source.kind === 'schema_inventory')) return 'unreferenced_requiring_investigation';
  return 'unknown_status';
}

function proposedTypeMapping(sourceType) {
  const type = sourceType.toUpperCase();
  if (/^TINYINT\s*\(\s*1\s*\)/.test(type)) return { type: 'smallint or boolean', status: 'requires_value_domain_and_application_review' };
  if (/^TINYINT/.test(type)) return { type: 'smallint', status: 'verify range and signedness' };
  if (/\bUNSIGNED\b/.test(type)) return { type: 'adequately sized signed integer plus CHECK', status: 'verify maximum values' };
  if (/^JSON\b/.test(type)) return { type: 'json or jsonb', status: 'review operators, numeric behavior, and indexes' };
  if (/^DATETIME\b/.test(type)) return { type: 'timestamp without time zone or timestamp with time zone', status: 'determine whether values represent instants and identify source timezone' };
  if (/^TIMESTAMP\b/.test(type)) return { type: 'timestamp without time zone or timestamp with time zone', status: 'confirm MySQL session-time-zone semantics before choosing' };
  if (/^DECIMAL\b/.test(type)) return { type: 'numeric with identical precision and scale', status: 'preserve exact precision' };
  if (/^ENUM\b|^SET\b/.test(type)) return { type: 'text with CHECK or PostgreSQL enum', status: 'preserve allowed values and evolution behavior' };
  if (/^BIGINT\b/.test(type)) return { type: 'bigint', status: 'verify signedness and range' };
  if (/^(?:INT|INTEGER|SMALLINT)\b/.test(type)) return { type: type.toLowerCase(), status: 'verify signedness and range' };
  if (/^(?:VARCHAR|CHAR|TEXT)\b/.test(type)) return { type: type.toLowerCase().replace(/^varchar/, 'varchar'), status: 'preserve length and collation semantics' };
  if (/^BOOLEAN\b/.test(type)) return { type: 'boolean', status: 'verify source encoding and stored values' };
  if (/^DATE\b|^TIME\b/.test(type)) return { type: type.toLowerCase(), status: 'confirm precision and timezone semantics' };
  return { type: null, status: 'manual_mapping_required' };
}

const definitions = definitionSources.flatMap(({ path: relativePath, kind }) =>
  findDefinitions(sourceText(relativePath), { path: relativePath, kind }));
const migrationOperations = [];
for (const file of allFiles(root)) {
  const relative = path.relative(root, file).replace(/\\/g, '/');
  for (const fragment of extractStringFragments(fs.readFileSync(file, 'utf8'))) {
    for (const match of fragment.text.matchAll(/\bALTER\s+TABLE\s+[`"]?([\w.]+)/ig)) {
      if (relative === 'db/relational.js' || (relative.startsWith('scripts/') && /(?:migrat|cutover)/i.test(relative))) migrationOperations.push({ table: match[1].split('.').pop(), source: relative, line: fragment.line, statement: fragment.text.trim(), execution_status: 'migration_path_present_target_application_unverified' });
    }
  }
}
const names = [...new Set([...definitions.map(({ table }) => table), ...referenceOnlyTables.map(({ name }) => name)])].sort();
const knownNames = new Set(names);
const exactIdentifierMentions = new Map();
for (const name of Object.keys(unreferencedTableReviews)) {
  const expression = new RegExp(`\\b${name}\\b`, 'i');
  const mentions = [];
  for (const file of allFiles(root)) {
    const relative = path.relative(root, file).replace(/\\/g, '/');
    if (relative === 'scripts/check-postgresql-schema-reconciliation.js' || relative === 'test/postgresql-schema-reconciliation.spec.js') continue;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    const found = lines.flatMap((line, index) => expression.test(line) ? [index + 1] : []);
    if (found.length) mentions.push({ path: relative, lines: found });
  }
  exactIdentifierMentions.set(name, mentions);
}
const appFiles = allFiles(root).filter((file) => !file.includes(`${path.sep}test${path.sep}`) && !file.includes(`${path.sep}docs${path.sep}`));
const testFiles = allFiles(path.join(root, 'test'));
const appReferencesByTable = new Map();
const testReferencesByTable = new Map();
for (const [files, referenceMap] of [[appFiles, appReferencesByTable], [testFiles, testReferencesByTable]]) {
  for (const file of files) {
    const relative = path.relative(root, file).replace(/\\/g, '/');
    for (const fragment of extractStringFragments(fs.readFileSync(file, 'utf8'))) {
      const references = tableMentions(fragment.text, knownNames);
      for (const [name, operations] of references) {
        if (!referenceMap.has(name)) referenceMap.set(name, []);
        referenceMap.get(name).push({ path: relative, line: fragment.line, operations });
      }
    }
  }
}
const tables = names.map((name) => {
  const tableDefinitions = definitions.filter((definition) => definition.table === name);
  const appReferences = appReferencesByTable.get(name) || [];
  const testReferences = testReferencesByTable.get(name) || [];
  const useReview = unreferencedTableReviews[name] || null;
  const distinctDefinitions = new Set(tableDefinitions.map(({ sql }) => sql.replace(/\s+/g, ' ').trim().toLowerCase()));
  const columnsBySource = new Map();
  for (const definition of tableDefinitions) {
    const key = `${definition.source.path}:${definition.line}`;
    columnsBySource.set(key, definition.columns);
  }
  const columnNames = [...new Set(tableDefinitions.flatMap((definition) => definition.columns.map(({ name: column }) => column)))].sort();
  const columnConflicts = columnNames.map((column) => {
    const items = tableDefinitions.map((definition) => ({
      source: definition.source.path,
      line: definition.line,
      definition: definition.columns.find((item) => item.name === column) || null
    }));
    return { column, definitions: items };
  }).filter(({ definitions: items }) => new Set(items.map(({ definition }) => definition && `${definition.source_type}|${definition.nullable}|${definition.default}`)).size > 1);
  const allColumns = [];
  const colSeen = new Set();
  for (const definition of tableDefinitions) for (const column of definition.columns) {
    const key = `${definition.source.path}:${definition.line}:${column.name}`;
    if (!colSeen.has(key)) {
      colSeen.add(key);
      allColumns.push({ ...column, proposed_postgresql_mapping: proposedTypeMapping(column.source_type), source: definition.source.path, line: definition.line });
    }
  }
  const primaryKeyDefinitions = tableDefinitions.map((definition) => ({
    source: definition.source.path,
    line: definition.line,
    primary_key: [
      ...definition.columns.filter(({ inline_primary_key }) => inline_primary_key).map(({ name: column }) => column),
      ...definition.constraints.filter((constraint) => /^\s*(?:CONSTRAINT\s+\S+\s+)?PRIMARY\s+KEY\b/i.test(constraint)).map((constraint) => constraint.match(/\(([^)]*)\)/)?.[1] || constraint)
    ]
  })).filter(({ primary_key }) => primary_key.length);
  const duplicateColumns = tableDefinitions.flatMap((definition) => {
    const counts = new Map();
    for (const column of definition.columns) counts.set(column.name, (counts.get(column.name) || 0) + 1);
    return [...counts].filter(([, count]) => count > 1).map(([column]) => ({ source: definition.source.path, line: definition.line, column }));
  });
  const mysqlFeatures = [];
  for (const column of allColumns) {
    if (/\bTINYINT\b/i.test(column.source_type)) mysqlFeatures.push({ feature: 'TINYINT', column: column.name, source: column.source, line: column.line, proposed_postgresql_mapping: 'smallint; boolean only after confirming the source value domain and application semantics', status: 'requires_review' });
    if (/\bUNSIGNED\b/i.test(column.source_type)) mysqlFeatures.push({ feature: 'UNSIGNED', column: column.name, source: column.source, line: column.line, proposed_postgresql_mapping: 'select an adequately sized signed PostgreSQL type plus a CHECK constraint where required', status: 'requires_review' });
    if (/\bJSON\b/i.test(column.source_type)) mysqlFeatures.push({ feature: 'JSON', column: column.name, source: column.source, line: column.line, proposed_postgresql_mapping: 'json or jsonb after evaluating key order, numeric semantics, operators, and indexes', status: 'requires_review' });
  }
  for (const definition of tableDefinitions) {
    if (/ENGINE\s*=\s*InnoDB/i.test(definition.sql)) mysqlFeatures.push({ feature: 'ENGINE=InnoDB', source: definition.source.path, line: definition.line, proposed_postgresql_mapping: 'no direct DDL equivalent; PostgreSQL storage engine behavior is implicit', status: 'conversion_identified' });
    if (/\bUNIQUE\s+KEY\b/i.test(definition.sql)) mysqlFeatures.push({ feature: 'UNIQUE KEY', source: definition.source.path, line: definition.line, proposed_postgresql_mapping: 'UNIQUE constraint or unique index; preserve column order and null semantics', status: 'requires_review' });
    if (/\b(?:KEY|INDEX)\s+\w+\s*\(/i.test(definition.sql)) mysqlFeatures.push({ feature: 'inline KEY index', source: definition.source.path, line: definition.line, proposed_postgresql_mapping: 'separate CREATE INDEX statement; verify index method and uniqueness', status: 'requires_review' });
  }
  return {
    name,
    classification: useReview?.classification || referenceOnlyTables.find((item) => item.name === name)?.classification || classify(name, appReferences, tableDefinitions.map(({ source }) => source)),
    repository_use_review: useReview ? { ...useReview, exact_identifier_mentions: exactIdentifierMentions.get(name), migration_ddl_evidence: tableDefinitions.map(({ source, line }) => ({ source: source.path, line })), test_reference_files: [...new Set([...testReferences.map(({ path: sourcePath }) => sourcePath), ...exactIdentifierMentions.get(name).filter(({ path: sourcePath }) => sourcePath.startsWith('test/')).map(({ path: sourcePath }) => sourcePath)])] } : null,
    source_definitions: tableDefinitions.map(({ source, line, sql, columns, constraints }) => ({ source: source.path, line, sql, columns, constraints })),
    migration_operations: migrationOperations.filter(({ table: operationTable }) => operationTable === name),
    query_observed_columns_without_schema_claim: referenceOnlyTables.find((item) => item.name === name)?.query_observed_columns || [],
    columns: allColumns,
    primary_keys: primaryKeyDefinitions,
    foreign_keys: tableDefinitions.flatMap((definition) => definition.constraints.filter((constraint) => /\bFOREIGN\s+KEY\b/i.test(constraint)).map((definitionSql) => ({ source: definition.source.path, line: definition.line, definition: definitionSql }))),
    unique_constraints_and_indexes: [
      ...tableDefinitions.flatMap((definition) => definition.constraints.filter((constraint) => /\b(?:UNIQUE|KEY|INDEX)\b/i.test(constraint)).map((definitionSql) => ({ source: definition.source.path, line: definition.line, definition: definitionSql }))),
      ...tableDefinitions.flatMap((definition) => definition.columns.filter(({ inline_unique }) => inline_unique).map(({ name: column }) => ({ source: definition.source.path, line: definition.line, definition: `UNIQUE (${column})`, syntax: 'inline_column_constraint' })))
    ],
    application_references: appReferences,
    test_references: testReferences,
    mysql_specific_features: [...new Map(mysqlFeatures.map((item) => [JSON.stringify(item), item])).values()],
    discrepancies: {
      definition_missing_from_scanned_sources: tableDefinitions.length === 0,
      definitions_in_multiple_sources: new Set(tableDefinitions.map(({ source }) => source.path)).size > 1,
      duplicate_definitions_within_source: [...new Set(tableDefinitions.map(({ source }) => source.path))].filter((sourcePath) => tableDefinitions.filter(({ source }) => source.path === sourcePath).length > 1),
      conflicting_definitions: distinctDefinitions.size > 1,
      duplicate_columns: duplicateColumns,
      conflicting_columns: columnConflicts,
      conflicting_primary_keys: new Set(primaryKeyDefinitions.map(({ primary_key }) => primary_key.join(',').toLowerCase())).size > 1
    },
    migration_risk: tableDefinitions.length === 0 ? 'no_local_definition_found_reconcile_with_source_catalog' : tableDefinitions.some((definition) => /\b(?:TINYINT|UNSIGNED|JSON|DECIMAL|TIMESTAMP)\b/i.test(definition.sql)) ? 'review_semantics_and_data_before_type_conversion' : 'source_definition_requires_postgresql_review',
    definition_resolution: tableDefinitions.length === 0 ? { status: 'unresolved', evidence_source: referenceOnlyTables.find((item) => item.name === name)?.evidence_source || null, note: referenceOnlyTables.find((item) => item.name === name)?.note || 'No definition found; additional source evidence is required.' } : { status: 'local_source_definition_captured' }
  };
});

const conflictEvidence = {
  chat_conversations: 'The versioned relational migration defines the additional unique pair and participant/time indexes; db/relational.js reads and inserts conversations in chatConversation/chatConversations. db/schema.sql is only consumed as an inventory/fixture and backup artifact, so its omitted indexes do not replace the runtime DDL contract.',
  chat_messages: 'The versioned relational migration defines delivered_at and dedupe/page indexes; db/relational.js chatMessages selects delivered_at and sendChatMessage relies on the nonce uniqueness behavior. db/schema.sql omits these runtime elements.',
  communication_campaigns: 'The versioned relational migration and create/list/get campaign operations use scope_json, schedule_at, created_by, sent_at and updated_at. idempotency_key and its unique key exist in the migration definition/repair SQL but are not directly supplied by the current create operation. db/schema.sql is an incomplete inventory/backup fixture for this table.',
  payment_transactions: 'The column lists and unique semantics agree: reference is unique in both, and provider_event_id is unique as a named key in the runner versus an inline unique declaration in db/schema.sql. Payment duplicate checks and inserts use provider_event_id. This is a syntax/name difference, not a demonstrated semantic discrepancy.',
  schools: 'The application reads and writes school_code, address, contact_phone, contact_email and registration_metadata. The relational runner adds these through ALTER TABLE in the initial versioned migration, while db/schema.sql includes them directly. The ALTER statements swallow errors and run only when the schema version row is absent; therefore this reconciles the intended application contract but does not prove all existing installations received the columns.'
};
const definitionConflictReviews = tables.filter(({ discrepancies }) => discrepancies.conflicting_definitions).map((table) => ({
  table: table.name,
  sources: table.source_definitions.map(({ source, line, sql }) => ({ source, line, sql })),
  application_evidence: table.application_references,
  resolution: {
    status: 'resolved_at_repository_contract_level',
    canonical_application_contract_source: 'db/relational.js versioned DDL plus its applicable ALTER statements and current application query call sites',
    source_role_of_db_schema_sql: 'inventory_fixture_and_backup_artifact_not_the_migration_runner',
    explanation: conflictEvidence[table.name],
    confidence: table.name === 'payment_transactions' ? 'high_semantic_equivalence' : 'high_for_intended_application_contract',
    target_schema_verification: 'pending_read_only_database_catalog'
  }
}));

const manualColumnUsage = {
  'schools.school_code': [{ path: 'api/legacy.js', lines: [52, 98, 136, 143, 154], operations: ['select_filter', 'insert', 'upsert', 'join'] }, { path: 'server.js', lines: [1351], operations: ['select', 'join'] }, { path: 'db/relational.js', lines: [347, 381], operations: ['insert', 'update'] }],
  'schools.address': [{ path: 'server.js', lines: [324], operations: ['response_projection'] }, { path: 'db/relational.js', lines: [347, 381], operations: ['insert', 'update'] }],
  'schools.contact_phone': [{ path: 'server.js', lines: [324], operations: ['response_projection'] }, { path: 'db/relational.js', lines: [347, 381], operations: ['insert', 'update'] }],
  'schools.contact_email': [{ path: 'server.js', lines: [324], operations: ['response_projection'] }, { path: 'db/relational.js', lines: [347, 381], operations: ['insert', 'update'] }],
  'schools.registration_metadata': [{ path: 'server.js', lines: [324], operations: ['response_projection'] }, { path: 'db/relational.js', lines: [347], operations: ['insert'] }],
  'chat_messages.delivered_at': [{ path: 'db/relational.js', lines: [466], operations: ['select_projection'] }],
  'communication_campaigns.scope_json': [{ path: 'db/relational.js', lines: [459], operations: ['insert'] }],
  'communication_campaigns.schedule_at': [{ path: 'db/relational.js', lines: [459, 460], operations: ['insert', 'select_projection'] }],
  'communication_campaigns.created_by': [{ path: 'db/relational.js', lines: [459, 460], operations: ['insert', 'select_projection'] }],
  'communication_campaigns.idempotency_key': [{ path: 'db/relational.js', lines: [61, 182, 184], operations: ['definition', 'migration', 'unique_index'] }],
  'communication_campaigns.sent_at': [{ path: 'db/relational.js', lines: [459, 460], operations: ['update', 'select_projection'] }],
  'communication_campaigns.updated_at': [{ path: 'db/relational.js', lines: [459, 459], operations: ['insert', 'update'] }]
};
const columnDiscrepancies = tables.flatMap((table) => table.discrepancies.conflicting_columns.map(({ column, definitions: sourceDefinitionsForColumn }) => {
  const usage = manualColumnUsage[`${table.name}.${column}`] || [];
  const present = sourceDefinitionsForColumn.filter(({ definition }) => definition);
  const proposed = present[0]?.definition?.source_type ? proposedTypeMapping(present[0].definition.source_type) : { type: null, status: 'definition_missing_no_type_recommendation' };
  const applicationContract = table.name === 'schools' || table.name === 'chat_messages' || table.name === 'communication_campaigns';
  return {
    table: table.name,
    column,
    source_definitions: sourceDefinitionsForColumn.map(({ source, line, definition }) => ({ source, line, definition })),
    application_usage: usage.length ? { status: 'evidence_recorded', evidence: usage } : { status: 'not_directly_used_by_current_app_sql', evidence: [{ path: 'db/relational.js', lines: [table.source_definitions.find(({ source }) => source === 'db/relational.js')?.line || null], operations: ['DDL_or_constraint_only'] }] },
    proposed_postgresql_mapping: proposed,
    canonical_contract: {
      source: applicationContract ? 'db/relational.js_versioned_DDL_and_app_operations' : 'not_established',
      decision_status: applicationContract ? 'resolved_for_repository_application_contract' : 'unresolved',
      target_schema_verification: 'pending_read_only_database_catalog',
      compatibility_implication: applicationContract ? 'The runtime migration and application expect this column; db/schema.sql alone is insufficient to represent the application contract.' : 'Retain both source variants until the intended runtime contract is confirmed.'
    },
    nullability_and_default: sourceDefinitionsForColumn.map(({ source, definition }) => ({ source, nullable: definition?.nullable ?? null, default: definition?.default ?? null })),
    evidence_confidence: applicationContract ? 'repository_evidence_high_live_state_unverified' : 'insufficient',
    data_semantics_review: /(?:DECIMAL|DATETIME|TIMESTAMP|JSON|TINYINT)/i.test(present.map(({ definition }) => definition?.source_type || '').join(' ')) ? 'required_before_migration' : 'verify_nullability_and_default_behavior_before_migration'
  };
}));

const runnerNames = new Set(definitions.filter(({ source }) => source.path === 'db/relational.js').map(({ table }) => table));
const inventoryNames = new Set(definitions.filter(({ source }) => source.path === 'db/schema.sql').map(({ table }) => table));
const repositoryDefinedNames = new Set(definitions.map(({ table }) => table));
const unclassified = tables.filter(({ classification }) => !classification).map(({ name }) => name);
const foreignKeyFindings = [];
for (const table of tables) for (const foreignKey of table.foreign_keys) {
  const referencedTable = foreignKey.definition.match(/\bREFERENCES\s+[`"]?([\w.]+)/i)?.[1]?.split('.').pop();
  const referencedColumns = (foreignKey.definition.match(/\bREFERENCES\s+[`"]?[\w.]+[`"]?\s*\(([^)]*)\)/i)?.[1] || '').split(',').map((column) => column.trim().replace(/[`"]+/g, '')).filter(Boolean);
  const target = tables.find(({ name }) => name === referencedTable);
  if (!target) foreignKeyFindings.push({ table: table.name, source: foreignKey.source, line: foreignKey.line, referenced_table: referencedTable || null, status: 'referenced_table_not_defined_in_scanned_sources' });
  else for (const column of referencedColumns) if (!target.columns.some(({ name }) => name === column)) foreignKeyFindings.push({ table: table.name, source: foreignKey.source, line: foreignKey.line, referenced_table: referencedTable, referenced_column: column, status: 'referenced_column_not_found_in_scanned_definitions' });
}
const applicationRelationships = [
  { from_table: 'term_records', from_columns: ['student_id'], to_table: 'students', to_columns: ['id'], evidence: [{ source: 'api/legacy.js', line: 158, operation: 'JOIN s.id=tr.student_id' }], enforcement: 'application_join_only_database_constraint_unverified', deletion_behavior: 'unknown', recommendation: 'Verify orphan count and source FK metadata before proposing a PostgreSQL FK.' },
  { from_table: 'term_records', from_columns: ['school_id'], to_table: 'schools', to_columns: ['id'], evidence: [{ source: 'api/legacy.js', line: 158, operation: 'school-scoped filter' }], enforcement: 'application_scope_filter_only_database_constraint_unverified', deletion_behavior: 'unknown', recommendation: 'Verify school ownership and orphan rows; keep school/tenant scope enforcement explicit.' },
  { from_table: 'subject_scores', from_columns: ['term_record_id'], to_table: 'term_records', to_columns: ['id'], evidence: [{ source: 'api/legacy.js', line: 160, operation: 'filter by selected term record ids' }, { source: 'api/legacy.js', line: 172, operation: 'insert score tied to term record' }], enforcement: 'application_join_only_database_constraint_unverified', deletion_behavior: 'unknown', recommendation: 'Verify orphan score rows and approved score retention/deletion behavior.' },
  { from_table: 'chat_conversations', from_columns: ['school_id'], to_table: 'schools', to_columns: ['id'], evidence: [{ source: 'db/relational.js', line: 464, operation: 'school-scoped conversation select/insert' }], enforcement: 'no_foreign_key_in_scanned_DDL', deletion_behavior: 'unknown', recommendation: 'Evaluate FK and tenant-consistent composite scope; do not assume cascade.' },
  { from_table: 'chat_conversations', from_columns: ['participant_a', 'participant_b'], to_table: 'users', to_columns: ['id'], evidence: [{ source: 'db/relational.js', line: 464, operation: 'participant authorization and lookup' }], enforcement: 'application_authorization_no_foreign_key_in_scanned_DDL', deletion_behavior: 'unknown', recommendation: 'Validate identity lifetime and deletion policy before adding FKs.' },
  { from_table: 'chat_messages', from_columns: ['conversation_id'], to_table: 'chat_conversations', to_columns: ['id'], evidence: [{ source: 'db/relational.js', line: 465, operation: 'join' }, { source: 'db/relational.js', line: 467, operation: 'conversation-scoped insert/read' }], enforcement: 'application_join_only_database_constraint_unverified', deletion_behavior: 'unknown', recommendation: 'Check orphan messages and retention expectations; define deletion action only with product approval.' },
  { from_table: 'chat_messages', from_columns: ['sender_id', 'recipient_id'], to_table: 'users', to_columns: ['id'], evidence: [{ source: 'db/relational.js', line: 467, operation: 'message sender/recipient' }], enforcement: 'application_contact_authorization_no_foreign_key_in_scanned_DDL', deletion_behavior: 'unknown', recommendation: 'Verify user deletion and historical message retention requirements.' },
  { from_table: 'hostel_blocks', from_columns: ['hostel_id'], to_table: 'hostels', to_columns: ['id'], evidence: [{ source: 'db/schema.sql', line: 38, operation: 'named ownership column' }], enforcement: 'no_foreign_key_in_scanned_DDL', deletion_behavior: 'unknown', recommendation: 'Verify hierarchy, orphan records, and desired deletion behavior.' },
  { from_table: 'hostel_rooms', from_columns: ['block_id'], to_table: 'hostel_blocks', to_columns: ['id'], evidence: [{ source: 'db/schema.sql', line: 39, operation: 'named ownership column' }], enforcement: 'no_foreign_key_in_scanned_DDL', deletion_behavior: 'unknown', recommendation: 'Verify hierarchy, orphan records, and desired deletion behavior.' },
  { from_table: 'hostel_beds', from_columns: ['room_id'], to_table: 'hostel_rooms', to_columns: ['id'], evidence: [{ source: 'db/schema.sql', line: 40, operation: 'named ownership column' }], enforcement: 'no_foreign_key_in_scanned_DDL', deletion_behavior: 'unknown', recommendation: 'Verify hierarchy, orphan records, and desired deletion behavior.' },
  { from_table: 'hostel_assignments', from_columns: ['student_id'], to_table: 'students', to_columns: ['id'], evidence: [{ source: 'db/schema.sql', line: 41, operation: 'named assignment column' }], enforcement: 'no_foreign_key_in_scanned_DDL', deletion_behavior: 'unknown', recommendation: 'Verify student and school scope, duplicate active assignments, and deletion behavior.' },
  { from_table: 'hostel_assignments', from_columns: ['hostel_id', 'block_id', 'room_id', 'bed_id'], to_table: 'hostels/hostel_blocks/hostel_rooms/hostel_beds', to_columns: ['id'], evidence: [{ source: 'db/schema.sql', line: 41, operation: 'named assignment columns' }], enforcement: 'no_foreign_key_in_scanned_DDL', deletion_behavior: 'unknown', recommendation: 'Validate each hierarchy edge independently; target data and capacity rules are not in schema evidence.' },
  { from_table: 'hostel_roll_calls', from_columns: ['student_id'], to_table: 'students', to_columns: ['id'], evidence: [{ source: 'db/schema.sql', line: 42, operation: 'named attendance column' }], enforcement: 'no_foreign_key_in_scanned_DDL', deletion_behavior: 'unknown', recommendation: 'Verify attendance retention and student ownership before FK proposal.' },
  { from_table: 'legacy_school_identity_map', from_columns: ['legacy_school_id_text'], to_table: 'legacy_schools_archive', to_columns: ['id'], evidence: [{ source: 'scripts/legacy-account-cutover.js', line: 128, operation: 'archive id mapping join' }], enforcement: 'no_foreign_key_in_scanned_DDL_dynamic_archive', deletion_behavior: 'preserve_archive_for_rollback', recommendation: 'Compare source catalog types and archive snapshot before proposing a constraint.' },
  { from_table: 'legacy_account_identity_map', from_columns: ['legacy_user_id_text'], to_table: 'legacy_users_archive', to_columns: ['id'], evidence: [{ source: 'scripts/legacy-account-cutover.js', line: 139, operation: 'archive id mapping join' }], enforcement: 'no_foreign_key_in_scanned_DDL_dynamic_archive', deletion_behavior: 'preserve_archive_for_rollback', recommendation: 'Compare source catalog types and archive snapshot before proposing a constraint.' }
].map((relation) => ({
  ...relation,
  from_table_definition_available: tables.some(({ name, discrepancies }) => name === relation.from_table && !discrepancies.definition_missing_from_scanned_sources),
  to_table_definition_available: relation.to_table.split('/').every((targetName) => tables.some(({ name, discrepancies }) => name === targetName && !discrepancies.definition_missing_from_scanned_sources)),
  to_table_definitions_available_by_target: Object.fromEntries(relation.to_table.split('/').map((targetName) => [targetName, tables.some(({ name, discrepancies }) => name === targetName && !discrepancies.definition_missing_from_scanned_sources)])),
  verification: 'repository_evidence_only_target_catalog_and_orphan_check_pending'
}));
const referenceCandidates = new Map();
const allKnownReferences = new Set();
for (const file of appFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const relative = path.relative(root, file).replace(/\\/g, '/');
  for (const fragment of extractStringFragments(text)) {
    const candidates = [...fragment.text.matchAll(/\b(?:FROM|JOIN|INTO|DELETE\s+FROM)\s+[`"\w.]+|^\s*UPDATE\s+[`"\w.]+/ig)];
    for (const candidate of candidates) {
      const name = candidate[0].split(/\s+/).pop().replace(/[`"]+/g, '').split('.').pop();
      if (knownNames.has(name)) allKnownReferences.add(name);
      else if (!/^(?:select|values|set|where|information_schema|sqlite_master|dual)$/i.test(name)) {
        const line = fragment.line;
        const key = `${name}:${relative}:${line}`;
        referenceCandidates.set(key, { token: name, source: relative, line, ...classifyReferenceCandidate(name, relative) });
      }
    }
  }
}

const report = {
  inventory_version: 1,
  repository: { branch: require('node:child_process').execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim(), head: require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() },
  scope: 'Static extraction from repository files only. This is not a live database catalog and does not establish production table existence.',
  reconciliation_decision: 'REPOSITORY INVESTIGATION COMPLETE — EXTERNAL EVIDENCE REQUIRED',
  readiness: {
    repository_investigation: 'complete',
    migration_readiness: false,
    missing_source_definitions: ['term_records', 'subject_scores', 'legacy_schools_archive', 'legacy_users_archive'],
    target_catalog_audit: { sql_file: 'scripts/postgresql-target-catalog-audit.sql', instructions_file: 'docs/postgresql-target-catalog-verification.md', prepared: true, executed: false },
    source_evidence_request: { file: 'docs/postgresql-missing-source-evidence-request.md', prepared: true, responses_received: false }
  },
  sources: definitionSources.map(({ path: sourcePath, kind }) => ({ path: sourcePath, kind, table_definition_count: definitions.filter(({ source }) => source.path === sourcePath).length })),
  summary: {
    table_definition_count: definitions.length,
    unique_table_count: names.length,
    repository_defined_table_count: repositoryDefinedNames.size,
    query_reference_only_table_count: tables.filter(({ discrepancies }) => discrepancies.definition_missing_from_scanned_sources).length,
    missing_definition_tables: tables.filter(({ discrepancies }) => discrepancies.definition_missing_from_scanned_sources).map(({ name }) => name),
    shared_between_runner_and_schema: [...runnerNames].filter((name) => inventoryNames.has(name)).length,
    runner_only: [...runnerNames].filter((name) => !inventoryNames.has(name)).sort(),
    schema_only: [...inventoryNames].filter((name) => !runnerNames.has(name)).sort(),
    tables_defined_in_multiple_sources: tables.filter(({ discrepancies }) => discrepancies.definitions_in_multiple_sources).map(({ name }) => name),
    duplicate_table_definitions_within_source: tables.filter(({ discrepancies }) => discrepancies.duplicate_definitions_within_source.length).map(({ name }) => name),
    conflicting_table_definitions: tables.filter(({ discrepancies }) => discrepancies.conflicting_definitions).map(({ name }) => name),
    column_conflict_count: tables.reduce((total, table) => total + table.discrepancies.conflicting_columns.length, 0),
    column_discrepancy_repository_decision_count: columnDiscrepancies.filter(({ canonical_contract }) => canonical_contract.decision_status === 'resolved_for_repository_application_contract').length,
    column_discrepancy_live_schema_verification_pending_count: columnDiscrepancies.filter(({ canonical_contract }) => canonical_contract.target_schema_verification === 'pending_read_only_database_catalog').length,
    table_conflict_repository_decision_count: definitionConflictReviews.filter(({ resolution }) => resolution.status === 'resolved_at_repository_contract_level').length,
    table_conflict_live_schema_verification_pending_count: definitionConflictReviews.filter(({ resolution }) => resolution.target_schema_verification === 'pending_read_only_database_catalog').length,
    foreign_key_validation_findings: foreignKeyFindings,
    active_application_tables: tables.filter(({ classification }) => classification === 'active_application').map(({ name }) => name),
    active_authentication_or_session_tables: tables.filter(({ classification }) => classification === 'active_authentication_or_session').map(({ name }) => name),
    migration_metadata_tables: tables.filter(({ classification }) => classification === 'migration_metadata').map(({ name }) => name),
    unreferenced_tables_requiring_investigation: tables.filter(({ repository_use_review }) => repository_use_review).map(({ name }) => name),
    unreferenced_tables_reviewed: tables.filter(({ repository_use_review }) => repository_use_review).map(({ name }) => name),
    unreferenced_table_review_classifications: tables.filter(({ repository_use_review }) => repository_use_review).map(({ name, repository_use_review }) => ({ name, classification: repository_use_review.classification })),
    legacy_tables: tables.filter(({ classification }) => classification === 'legacy').map(({ name }) => name),
    test_only_tables: tables.filter(({ classification }) => classification === 'test_only').map(({ name }) => name),
    unknown_status_tables: tables.filter(({ classification }) => classification === 'unknown_status').map(({ name }) => name),
    unclassified_tables: unclassified,
    sql_reference_candidate_count: referenceCandidates.size,
    sql_reference_candidates_by_classification: [...referenceCandidates.values()].reduce((counts, item) => ({ ...counts, [item.classification]: (counts[item.classification] || 0) + 1 }), {}),
    unresolved_sql_reference_candidate_count: [...referenceCandidates.values()].filter(({ classification }) => classification === 'unresolved').length,
    sql_reference_candidates: [...referenceCandidates.values()].sort((left, right) => left.source.localeCompare(right.source) || left.line - right.line),
    unresolved_columns: 'Application query column references are not reliably enumerable by this lexical scanner; column-level contracts remain incomplete.',
    live_database_catalog_verified: false
  },
  definition_conflict_reviews: definitionConflictReviews,
  column_discrepancies: columnDiscrepancies,
  application_relationships: applicationRelationships,
  repository_database_object_scan: {
    sources_examined: ['db/relational.js', 'db/schema.sql', 'scripts/legacy-account-cutover.js', 'api/**/*.js', 'lib/**/*.js', 'server.js', 'scripts/**/*.js', 'test/**/*.js'],
    object_kinds_searched: ['views', 'materialized views', 'triggers', 'procedures', 'stored functions', 'generated columns'],
    local_declarations_found: [],
    limitation: 'No declaration was found by source scan; dynamically installed, external, or pre-existing database objects require catalog verification.'
  },
  remaining_blockers: [
    { id: 'unreferenced_table_usage_and_data_disposition', tables: ['result_slips', 'school_fee_payments', 'school_fees', 'school_subjects', 'teacher_subject_assignments'], status: 'unresolved', evidence_required: 'Owner-confirmed call paths, historical release/job review, authoritative source/target catalog presence, aggregate row counts, and approved retain/archive/exclude disposition.' },
    { id: 'term_records_definition', tables: ['term_records'], status: 'unresolved', evidence_required: 'Authoritative historical schema or authorized pre-migration database catalog plus types, nullability, keys, indexes, constraints, and data/row counts.' },
    { id: 'subject_scores_definition', tables: ['subject_scores'], status: 'unresolved', evidence_required: 'Authoritative schema or authorized catalog including complete SELECT * column set, types, keys/indexes, FKs, and data/row counts.' },
    { id: 'archive_table_definitions', tables: ['legacy_schools_archive', 'legacy_users_archive'], status: 'unresolved', evidence_required: 'Isolated pre-cutover SHOW CREATE TABLE/catalog and verified backup/row-count evidence; rename logic only establishes preservation of whatever source tables existed.' },
    { id: 'production_schema_application', tables: [], status: 'pending', evidence_required: 'Authorized read-only Supabase and source catalog comparison, including migration version, column presence, indexes, constraints, views, triggers, and data integrity.' }
  ],
  extraction_limitations: [
    'The scanner extracts statically visible CREATE TABLE statements and simple SQL table references; dynamically composed identifiers may be missed.',
    'Column definitions preserve the source clause, but MySQL inline and table-level constraints are not normalized into a complete relational model.',
    'Application reference detection is lexical and can include SQL-looking text in scripts; confirm each reference before treating it as runtime behavior.',
    'No production/Supabase catalog, migrations beyond the three listed definition sources, triggers, views, routines, or generated columns were verified.'
  ],
  tables
};

if (process.argv.includes('--write')) {
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${path.relative(root, outputPath)} (${tables.length} tables).`);
} else {
  if (!fs.existsSync(outputPath)) {
    console.error(`Missing ${path.relative(root, outputPath)}. Run with --write to generate the static report.`);
    process.exitCode = 1;
  } else {
    const committed = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    const markdown = fs.readFileSync(path.join(root, 'docs', 'postgresql-schema-reconciliation.md'), 'utf8');
    const committedNames = committed.tables.map(({ name }) => name).sort();
    const currentNames = tables.map(({ name }) => name).sort();
    const problems = [];
    if (JSON.stringify(committedNames) !== JSON.stringify(currentNames)) problems.push('Table set differs from the generated inventory.');
    if (JSON.stringify(committed.tables) !== JSON.stringify(tables)) problems.push('Table definitions, references, classifications, or findings are stale relative to the source scan.');
    if (JSON.stringify(committed.sources) !== JSON.stringify(report.sources)) problems.push('Source list or definition counts are stale.');
    if (JSON.stringify(committed.summary) !== JSON.stringify(report.summary)) problems.push('Summary counts or unresolved findings are stale.');
    if (committed.summary.unique_table_count !== currentNames.length) problems.push('Summary table count does not match entries.');
    if (committed.summary.table_definition_count !== definitions.length) problems.push('Summary definition count does not match extracted sources.');
    if (committed.summary.repository_defined_table_count !== repositoryDefinedNames.size) problems.push('Summary repository-defined table count does not match extracted sources.');
    if (committed.tables.some(({ classification }) => !classification)) problems.push('At least one table is unclassified.');
    const duplicateColumns = committed.tables.flatMap((table) => table.discrepancies.duplicate_columns.map((item) => `${table.name}.${item.column}`));
    if (duplicateColumns.length) problems.push(`Duplicate columns detected: ${duplicateColumns.join(', ')}`);
    const sameSourceDuplicates = committed.tables.filter((table) => table.discrepancies.duplicate_definitions_within_source.length);
    if (sameSourceDuplicates.length) problems.push(`Duplicate table definitions within a source: ${sameSourceDuplicates.map(({ name }) => name).join(', ')}`);
    if (JSON.stringify(committed.summary.runner_only) !== JSON.stringify([...runnerNames].filter((name) => !inventoryNames.has(name)).sort())) problems.push('Runner-only summary differs from source scan.');
    if (JSON.stringify(committed.summary.schema_only) !== JSON.stringify([...inventoryNames].filter((name) => !runnerNames.has(name)).sort())) problems.push('Schema-only summary differs from source scan.');
    const allowedClassifications = new Set(['active_application', 'active_authentication_or_session', 'active_system_or_operational', 'migration_metadata', 'migration_only', 'legacy', 'archived', 'test_only', 'unreferenced_requiring_investigation', 'unknown_status']);
    allowedClassifications.add('indirect_use');
    allowedClassifications.add('unresolved');
    if (committed.tables.some(({ classification }) => !allowedClassifications.has(classification))) problems.push('Table classification is missing or unsupported.');
    if (committed.tables.some(({ name, source_definitions }) => source_definitions.some(({ source }) => !definitionSources.some(({ path: knownSource }) => knownSource === source) && !fs.existsSync(path.join(root, source))))) problems.push('A source-definition provenance path is missing.');
    if (committed.tables.some(({ discrepancies, definition_resolution }) => discrepancies.definition_missing_from_scanned_sources && definition_resolution.status !== 'unresolved')) problems.push('A table with no local definition is incorrectly marked resolved.');
    if (committed.tables.some(({ classification, application_references }) => classification === 'active_application' && !application_references.length && !referenceOnlyTables.some(({ name }) => committedNames.includes(name)))) problems.push('Active table has no application reference evidence.');
    if (committed.definition_conflict_reviews.length !== committed.summary.conflicting_table_definitions.length || committed.definition_conflict_reviews.some(({ resolution }) => resolution.status !== 'resolved_at_repository_contract_level' || resolution.target_schema_verification !== 'pending_read_only_database_catalog')) problems.push('Definition conflict review is missing or falsely claims target verification.');
    if (committed.column_discrepancies.length !== committed.summary.column_conflict_count || committed.column_discrepancies.some(({ canonical_contract }) => !['resolved_for_repository_application_contract', 'unresolved'].includes(canonical_contract.decision_status) || canonical_contract.target_schema_verification !== 'pending_read_only_database_catalog')) problems.push('Column discrepancy decision is missing or falsely claims target verification.');
    const candidateClasses = new Set(['confirmed_database_operation', 'sql_definition_or_migration', 'test_only_sql', 'documentation_example', 'false_positive', 'unresolved']);
    if (committed.summary.sql_reference_candidates.length !== committed.summary.sql_reference_candidate_count || committed.summary.sql_reference_candidates.some(({ classification, note }) => !candidateClasses.has(classification) || !note)) problems.push('SQL-like candidate is unclassified or missing evidence.');
    if (committed.summary.unresolved_sql_reference_candidate_count !== committed.summary.sql_reference_candidates.filter(({ classification }) => classification === 'unresolved').length) problems.push('Unresolved SQL-candidate count is inconsistent.');
    if (committed.reconciliation_decision !== 'REPOSITORY INVESTIGATION COMPLETE — EXTERNAL EVIDENCE REQUIRED') problems.push('The report status must keep external source and target evidence as blockers.');
    if (committed.readiness.migration_readiness !== false || committed.readiness.target_catalog_audit.executed !== false || committed.readiness.source_evidence_request.responses_received !== false) problems.push('External evidence or migration readiness is incorrectly marked complete.');
    if (!Array.isArray(committed.remaining_blockers) || committed.remaining_blockers.length < 4 || committed.remaining_blockers.some(({ status }) => !['unresolved', 'pending'].includes(status))) problems.push('Required source-definition and read-only target-catalog blockers are missing.');
    const reviewedUnreferenced = new Set(['result_slips', 'school_fee_payments', 'school_fees', 'school_subjects', 'teacher_subject_assignments']);
    if (committed.summary.unknown_status_tables.length !== 0 || committed.summary.unreferenced_tables_reviewed.length !== 5 || committed.summary.unreferenced_tables_reviewed.some((name) => !reviewedUnreferenced.has(name)) || committed.summary.unreferenced_table_review_classifications.some(({ classification }) => !['indirect_use', 'unresolved'].includes(classification))) problems.push('All five unreferenced tables must have an evidence-backed indirect-use or unresolved review.');
    if (committed.tables.filter(({ repository_use_review }) => repository_use_review).some(({ repository_use_review }) => !repository_use_review.disposition || !repository_use_review.evidence_required || !repository_use_review.files_examined.length)) problems.push('Unreferenced table review is missing disposition, evidence requirements, or inspected-file evidence.');
    if (JSON.stringify(committed.remaining_blockers.flatMap(({ tables: names }) => names)) === '[]' || ['term_records', 'subject_scores', 'legacy_schools_archive', 'legacy_users_archive'].some((name) => !committed.tables.find((table) => table.name === name)?.discrepancies.definition_missing_from_scanned_sources || committed.tables.find((table) => table.name === name)?.definition_resolution.status !== 'unresolved')) problems.push('One or more of the four missing source definitions were incorrectly marked recovered.');
    if (committed.application_relationships.some(({ from_table, to_table, from_table_definition_available, to_table_definition_available, to_table_definitions_available_by_target }) => {
      const from = committed.tables.find(({ name }) => name === from_table);
      const targets = to_table.split('/');
      return !from || targets.some((name) => !committedNames.includes(name)) || from_table_definition_available !== !from.discrepancies.definition_missing_from_scanned_sources || to_table_definition_available !== targets.every((name) => !committed.tables.find((table) => table.name === name).discrepancies.definition_missing_from_scanned_sources) || targets.some((name) => to_table_definitions_available_by_target?.[name] !== !committed.tables.find((table) => table.name === name).discrepancies.definition_missing_from_scanned_sources);
    })) problems.push('Application relationship endpoint is missing or incorrectly marked.');
    const markdownCount = Number(markdown.match(/^- Discovered table names: \*\*(\d+)\*\*$/m)?.[1]);
    const markdownDefined = Number(markdown.match(/^- Locally defined tables: \*\*(\d+)\*\*$/m)?.[1]);
    const markdownMissing = Number(markdown.match(/^- Query-reference-only tables: \*\*(\d+)\*\*$/m)?.[1]);
    const markdownDecision = markdown.match(/^- Decision: `([^`]+)`$/m)?.[1];
    const evidenceRequestPath = path.join(root, 'docs', 'postgresql-missing-source-evidence-request.md');
    const catalogInstructionsPath = path.join(root, 'docs', 'postgresql-target-catalog-verification.md');
    const catalogSqlPath = path.join(root, 'scripts', 'postgresql-target-catalog-audit.sql');
    const evidenceRequest = fs.existsSync(evidenceRequestPath) ? fs.readFileSync(evidenceRequestPath, 'utf8') : '';
    const catalogInstructions = fs.existsSync(catalogInstructionsPath) ? fs.readFileSync(catalogInstructionsPath, 'utf8') : '';
    const catalogSql = fs.existsSync(catalogSqlPath) ? fs.readFileSync(catalogSqlPath, 'utf8') : '';
    const requiredEvidenceTerms = ['term_records', 'subject_scores', 'legacy_schools_archive', 'legacy_users_archive', 'CREATE TABLE', 'native data types', 'nullability', 'defaults', 'primary keys', 'unique keys', 'foreign keys', 'indexes', 'constraints', 'triggers', 'generated columns', 'records'];
    if (requiredEvidenceTerms.some((term) => !evidenceRequest.toLowerCase().includes(term.toLowerCase()))) problems.push('Source-evidence request omits a required table or schema/data checklist item.');
    if (['schemas', 'tables', 'columns', 'postgres_type', 'nullable', 'default_fingerprint', 'primary_key', 'unique', 'foreign_key', 'indexes', 'check', 'views', 'materialized_view', 'triggers', 'generated_kind', 'row_security_enabled', 'row_level_security_policies'].some((term) => !catalogSql.toLowerCase().includes(term.toLowerCase()))) problems.push('Catalog audit SQL omits a requested catalog object category.');
    const auditStatements = catalogSql.replace(/--[^\r\n]*/g, '').split(';').map((statement) => statement.trim()).filter(Boolean);
    const auditExecutableText = auditStatements.map((statement) => statement.replace(/'(?:''|[^'])*'/g, "''")).join('\n');
    if (auditStatements.length !== 3 || !/^BEGIN\s+TRANSACTION\s+READ\s+ONLY$/i.test(auditStatements[0] || '') || !/^SELECT\b/i.test(auditStatements[1] || '') || !/^COMMIT$/i.test(auditStatements[2] || '') || /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO)\b/i.test(auditExecutableText)) problems.push('Catalog SQL is not limited to a read-only transaction and SELECT.');
    if (!/never|not run|do not execute/i.test(catalogInstructions) || !/read.only/i.test(catalogInstructions)) problems.push('Catalog instructions must state read-only privileges and prohibit unauthorized execution.');
    if (markdownCount !== committed.summary.unique_table_count || markdownDefined !== committed.summary.repository_defined_table_count || markdownMissing !== committed.summary.query_reference_only_table_count || markdownDecision !== committed.reconciliation_decision || !committed.summary.unreferenced_tables_reviewed.every((name) => markdown.includes(`\`${name}\``))) problems.push('Readable Markdown summary or unreferenced-table findings disagree with JSON.');
    if (problems.length) {
      console.error(problems.join('\n'));
      process.exitCode = 1;
    } else {
      console.log(`Schema inventory checks passed: ${committed.summary.repository_defined_table_count} source-defined and ${committed.summary.query_reference_only_table_count} reference-only tables; ${committed.summary.column_conflict_count} column discrepancies recorded.`);
      console.log(`Static scan retained ${committed.summary.unresolved_sql_reference_candidate_count} unverified SQL-like reference candidates for review.`);
    }
  }
}
