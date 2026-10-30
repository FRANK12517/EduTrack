const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const inventory = require('../docs/postgresql-schema-reconciliation.json');

execFileSync(process.execPath, ['scripts/check-postgresql-schema-reconciliation.js'], { cwd: root, stdio: 'pipe' });

assert.equal(inventory.summary.repository_defined_table_count, 84);
assert.equal(inventory.summary.query_reference_only_table_count, 4);
assert.deepEqual(inventory.summary.missing_definition_tables, [
  'legacy_schools_archive',
  'legacy_users_archive',
  'subject_scores',
  'term_records'
]);
assert.equal(inventory.summary.unclassified_tables.length, 0);
assert.equal(inventory.reconciliation_decision, 'REPOSITORY INVESTIGATION COMPLETE — EXTERNAL EVIDENCE REQUIRED');
assert.deepEqual(inventory.summary.unknown_status_tables, []);
assert.equal(inventory.summary.unreferenced_tables_requiring_investigation.length, 5);
assert.deepEqual(inventory.summary.unreferenced_table_review_classifications, [
  { name: 'result_slips', classification: 'unresolved' },
  { name: 'school_fee_payments', classification: 'indirect_use' },
  { name: 'school_fees', classification: 'unresolved' },
  { name: 'school_subjects', classification: 'unresolved' },
  { name: 'teacher_subject_assignments', classification: 'unresolved' }
]);
assert.deepEqual(inventory.summary.conflicting_table_definitions, [
  'chat_conversations',
  'chat_messages',
  'communication_campaigns',
  'payment_transactions',
  'schools'
]);
assert.equal(inventory.summary.live_database_catalog_verified, false);
assert.equal(inventory.readiness.migration_readiness, false);
assert.equal(inventory.readiness.target_catalog_audit.prepared, true);
assert.equal(inventory.readiness.target_catalog_audit.executed, false);
assert.equal(inventory.readiness.source_evidence_request.responses_received, false);
for (const name of ['term_records', 'subject_scores', 'legacy_schools_archive', 'legacy_users_archive']) {
  const table = inventory.tables.find((item) => item.name === name);
  assert.equal(table.discrepancies.definition_missing_from_scanned_sources, true);
  assert.equal(table.definition_resolution.status, 'unresolved');
}
assert.equal(inventory.definition_conflict_reviews.length, 5);
assert.equal(inventory.summary.table_conflict_live_schema_verification_pending_count, 5);
assert.equal(inventory.summary.column_discrepancy_live_schema_verification_pending_count, 12);
assert.equal(inventory.summary.unresolved_sql_reference_candidate_count, inventory.summary.sql_reference_candidates.filter(({ classification }) => classification === 'unresolved').length);
assert.ok(inventory.application_relationships.every(({ verification }) => verification === 'repository_evidence_only_target_catalog_and_orphan_check_pending'));
assert.equal(inventory.repository_database_object_scan.local_declarations_found.length, 0);
assert.ok(inventory.tables.filter(({ repository_use_review }) => repository_use_review).every(({ repository_use_review }) => repository_use_review.exact_identifier_mentions.length > 0));

console.log('PostgreSQL schema reconciliation inventory checks passed.');
