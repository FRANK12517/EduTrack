# PostgreSQL Schema Reconciliation

**Decision:** `REPOSITORY INVESTIGATION COMPLETE — EXTERNAL EVIDENCE REQUIRED`
**Evidence:** static repository scan only; no database was contacted and no DDL or application SQL was changed.

- Discovered table names: **88**
- Locally defined tables: **84**
- Query-reference-only tables: **4**
- Decision: `REPOSITORY INVESTIGATION COMPLETE — EXTERNAL EVIDENCE REQUIRED`

Machine-readable detail lives in [`postgresql-schema-reconciliation.json`](postgresql-schema-reconciliation.json). Regenerate it with `node scripts/check-postgresql-schema-reconciliation.js --write`; verify it with `node scripts/check-postgresql-schema-reconciliation.js` and `node test/postgresql-schema-reconciliation.spec.js`. The scanner records literal source clauses and lexical query references. It cannot prove a table exists in production, enumerate dynamically assembled SQL, or map every queried column to a CRUD operation.

## Confirmed repository evidence

The scanner parsed 132 `CREATE TABLE` statements from three local sources: `db/relational.js` (75), `db/schema.sql` (55), and `scripts/legacy-account-cutover.js` (2). These contain 84 distinct locally defined table names. Four further table names are used by SQL but have no local table definition, giving 88 discovered names in this report. The runner/schema comparison is 48 shared names, 27 runner-only, and 7 schema-only. These are repository definitions and references, not a production table count.

Classification records 66 active application tables, 9 authentication/session tables, 3 system/operational audit tables, 1 migration-metadata table, 4 legacy cutover/archive tables, and 5 locally defined tables with no direct application SQL evidence. Those five are **unreferenced and require investigation**; they are not asserted to be retired or unused. There are no unclassified table names. The nine auth/session tables are `users`, `credentials`, `roles`, `permissions`, `role_permissions`, `user_roles`, `tenant_memberships`, `server_sessions`, and `password_reset_records`.

## Missing source definitions

| Table | Repository evidence | Remaining gap |
|---|---|---|
| `term_records` | `api/legacy.js` reads and writes reports; observed columns are recorded in JSON. | No type, nullability, key, index, constraint, or authoritative DDL evidence. |
| `subject_scores` | `api/legacy.js` selects `*` and writes observed columns recorded in JSON. | Full column set and type/key/index/constraint evidence are unknown. |
| `legacy_schools_archive` | Dynamically renamed from pre-cutover `schools`; recovery materialization reads `id` and `name`. | Exact preserved definition, data presence, and row counts require an isolated pre-cutover catalog/backup. |
| `legacy_users_archive` | Dynamically renamed from pre-cutover `users`; recovery materialization reads `id`, `email`, `staff_id`, `full_name`, and `role`. | Exact preserved definition, data presence, and row counts require an isolated pre-cutover catalog/backup. |

## Investigation of unreferenced tables

All five local tables have no direct application SQL match. Exact-name, alias/column, generic-helper, service/route, migration, and test references were inspected across the repository's active source files. No generic dynamic table CRUD for these relations was found; the server's interpolated count helper is restricted to a fixed `students`/`staff`/`classes` list. No local view, materialized-view, trigger, procedure, stored-function, or generated-column declarations were found in the inspected schema/runtime sources. The table-by-table evidence, inspected paths, and required next evidence are in the JSON.

| Table | Repository finding | Classification |
|---|---|---|
| `result_slips` | Runner DDL and result-slip UI names; no table query. Results paths use other result tables. UI terminology is not proof of relation use. | Unresolved |
| `school_fee_payments` | Preflight reads a count from generic table metadata; no relation CRUD. This is operational/indirect evidence only. | Indirect use |
| `school_fees` | Fee endpoints use `db.schoolFees` in the JSON compatibility store, not relational `school_fees`. A domain feature does not establish this table's use or data disposition. | Unresolved |
| `school_subjects` | Runner DDL/FK references and test cleanup names; no application query or generic CRUD path found. | Unresolved |
| `teacher_subject_assignments` | Runner DDL/FK references and test cleanup names; current relational code has teacher-class assignment paths, not a query for this relation. | Unresolved |

These findings do not establish that any table is unused, empty, or safe to drop. Verify old releases, jobs, source/target catalogs, and row counts with the owner before disposition.

The seven `db/schema.sql`-only hostel tables have application references and appear in the active application classification, even though the migration runner has no matching definitions. Runner-only definitions remain inventoried and are not presumed unused.

## Definition discrepancies

Five source-definition differences are reconciled **at repository application-contract level only**. The current `db/relational.js` versioned runner and its applicable `ALTER` statements define the intended runtime contract; `db/schema.sql` is used as an inventory/fixture and backup artifact, not the migration runner. Every item still requires read-only target-catalog verification:

| Table | Repository-level decision | Target verification |
|---|---|---|
| `chat_conversations` | Runner indexes are the application contract. | Pending. |
| `chat_messages` | Runner `delivered_at`, nonce deduplication, and paging index match current read/send behavior. | Pending. |
| `communication_campaigns` | Runner columns/indexes match current create/list/get operations; `idempotency_key` exists in DDL but is not directly supplied by the current create operation. | Pending. |
| `payment_transactions` | `reference` and `provider_event_id` uniqueness are semantically represented by both definitions; named versus inline uniqueness is a syntax/name difference. | Pending. |
| `schools` | Application expects `school_code`, address/contact fields, and `registration_metadata`; runner `ALTER`s and schema inventory express these differently. The runner swallows ALTER errors and conditional migration behavior means successful installation is not proven. | Pending. |

The report records 12 column-level presence/type/nullability/default discrepancies with observed application-use evidence and provisional PostgreSQL type mapping where possible. Repository-contract decisions do not establish live database state. Static foreign-key target checks report no unresolved table/column names among extracted table-level FKs; implicit application relationships and live constraints remain unverified.

## Relationship review

The JSON records repository-evidenced joins, ownership columns, archive mappings, and application-level scope/authorization relationships. These are not asserted to be database-enforced FKs. For each edge, it records whether local endpoint definitions exist, the evidence source, the unknown deletion behavior, and the pending target/orphan verification. In particular, `subject_scores` → `term_records` and archive-map → archive edges cannot be fully reconciled without their source definitions. Hostel assignments reference four distinct hierarchy tables; the report tracks availability per target rather than treating the combined target label as a single table.

## PostgreSQL mapping candidates

Mapping proposals are per-column and provisional. Existing definitions include MySQL `JSON`, `TINYINT`, inline `KEY`/`UNIQUE KEY`, `ENGINE=InnoDB`, `DECIMAL`, `TIMESTAMP`, and string-valued `VARCHAR` identifiers. Proposals recorded in JSON include:

- Convert inline indexes into reviewed `CREATE INDEX` statements; preserve key order, uniqueness, null semantics, and conflict behavior.
- Map `TINYINT` to `smallint` unless data and application behavior prove a field is strictly Boolean; count/term values remain numeric.
- Choose `json` versus `jsonb` after checking equality/order expectations, numeric values, operators, indexes, and query usage.
- Preserve `DECIMAL(p,s)` as PostgreSQL `numeric(p,s)` without floating-point conversion.
- Resolve `TIMESTAMP` semantics from source database/session timezone and stored-data meaning before choosing `timestamp` or `timestamptz`.
- Preserve existing string identifiers and key values; do not infer identity/sequence conversion from names. `ENGINE=InnoDB` has no direct PostgreSQL DDL equivalent.

No conversion has been implemented. Proposals do not resolve source data quality, collations, defaults, actual target catalog, or missing table definitions.

## Blockers and next evidence

1. Obtain authoritative `term_records` and `subject_scores` DDL, including complete columns, types, nullability, keys, indexes, constraints, and data/row counts.
2. Obtain isolated pre-cutover catalog/backup evidence for both dynamically renamed archive tables.
3. Investigate the five unreferenced local tables; establish whether application call paths, jobs, or retained data depend on them.
4. Compare the repository application contract against authorized read-only Supabase and source catalogs: migration version, columns, indexes, constraints, views, triggers, routines, extensions, and data integrity.
5. Complete per-table/per-column CRUD, identifier, ownership/scope, data-sensitivity, timezone, and generated-object review; then run PostgreSQL integration/rehearsal checks before proposing executable migrations.

The checker validates source-extracted inventory, discrepancy reviews, unreferenced-table evidence, catalog SQL read-only guards, relationship evidence, and report synchronization. A passing check means only that this static report matches repository sources. It does not mean source definitions are complete or PostgreSQL migration-ready. Git history evidence could not be retrieved because the repository's partial/promisor objects were unavailable; no fetch was attempted. No production catalog was accessed, and no native schema, migration, runtime SQL, or RLS policy was created. See [`postgresql-missing-source-evidence-request.md`](postgresql-missing-source-evidence-request.md) and [`postgresql-target-catalog-verification.md`](postgresql-target-catalog-verification.md) for the outstanding external evidence and unexecuted read-only audit preparation.
