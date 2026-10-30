# PostgreSQL Migration — Missing Source Definition Evidence Request

**Purpose:** close repository-confirmed gaps before the EduTrack schema can be reconciled. This request is for evidence collection only. Do not run migrations, modify a database, or send credentials, personal records, or unrestricted dumps.

## Request to the database owner or archive custodian

For each table below, provide a schema-only export (preferred) or original `CREATE TABLE` statement from the authoritative source catalog, plus a separate read-only data-presence report. Preserve the source database, schema, server/version, capture time, and whether the export is pre-cutover or post-cutover. Redact data values and secrets. A screenshot, application model, or repository DDL copy is not an authoritative substitute for the source catalog.

For **each** table, confirm and include:

- [ ] Exact database/schema/table identity and source engine/version; the export’s capture date and migration/cutover state.
- [ ] Original `CREATE TABLE` statement or authoritative schema export, including every column name and native data types, type modifiers/precision/scale, character set/collation, and signedness where applicable.
- [ ] Nullability, defaults, generated/identity/auto-increment behavior, and any sequence ownership.
- [ ] Primary keys, unique keys, foreign keys (both referenced columns and delete/update actions), check/exclusion constraints, and all standalone/partial/expression indexes.
- [ ] Triggers and their functions, generated columns, views/materialized views, and any other database-specific behavior affecting reads or writes.
- [ ] Whether the table exists in the captured source; exact row count; whether records must be migrated, archived, retained for rollback, or have an owner-approved exclusion. Provide only aggregate counts, not row data.
- [ ] Known writer/reader modules, scheduled jobs, old application versions, import/export paths, and data-retention owner. Identify whether each reference is live, historical, or migration-only.
- [ ] If absent, confirm the catalog and backup/archive locations checked, and provide the evidence that establishes absence. Do not infer absence from the current application.

## Table-specific evidence

### `term_records`

- Repository evidence: `api/legacy.js` report handlers query and upsert `term_records`; the observed query/insert column names are in [`postgresql-schema-reconciliation.json`](postgresql-schema-reconciliation.json). No local `CREATE TABLE` was found.
- Likely source: the legacy academic/reporting database behind the legacy route. The SQL uses MySQL-style placeholders/upsert syntax, but the active shared adapter now wraps PostgreSQL; this does **not** identify the actual physical source or prove the relation exists in the current target. The source engine, schema, and whether the records were copied remain unknown.
- Provide the authoritative historical MySQL/TiDB schema export or actual source catalog export, and separately an authorized read-only Supabase catalog result if a target copy is expected. State clearly if the source and target are different systems.
- In addition to the common checklist: identify the candidate uniqueness key used for report upserts, explain the student/school/year/term relationship, and include row count and orphan counts against the referenced student/school IDs. Do not infer uniqueness or FK rules from the query alone.

### `subject_scores`

- Repository evidence: the same legacy academic/reporting handlers select `*` and upsert observed score fields; no local `CREATE TABLE` was found. The complete column set is unknown.
- Likely source: legacy academic/reporting storage, but no repository evidence establishes the physical database, schema, or whether it shares a schema/backup with `term_records`. Confirm those independently.
- Provide the complete authoritative schema export and separately the expected Supabase catalog entry, if migrated. `SELECT *` makes a full column listing essential.
- In addition to the common checklist: identify the unique key used by upserts (including subject identity/case rules), the score precision and null semantics, and the relationship to `term_records`; report row count and orphan score rows.

### `legacy_schools_archive`

- Repository evidence: `scripts/legacy-account-cutover.js` constructs this name by renaming the pre-cutover `schools` relation; recovery materialization reads `id` and `name`. The cutover source is gated for an explicitly isolated TiDB test/recovery environment. The repository does not prove that the operation ran in any real environment or that the archive currently exists.
- Likely source: a pre-cutover legacy account-cutover database/archive, not assumed to be the academic reporting source above. The intended archive definition is inherited from that particular source database’s `schools` table at rename time.
- Provide `SHOW CREATE TABLE` (or native equivalent) for the original pre-rename `schools` table and, if present, the post-rename `legacy_schools_archive`; identify the exact database/schema/backup and cutover timestamp. Include the identity-map version and evidence that the archive preserved its rows.
- In addition to the common checklist: confirm the actual `id` native type and whether `id`/`name` are nullable; report aggregate rows, distinct IDs, and mapping/orphan counts. Do not reconstruct the archive definition from current `db/schema.sql`.

### `legacy_users_archive`

- Repository evidence: `scripts/legacy-account-cutover.js` constructs this name by renaming the pre-cutover `users` relation; recovery materialization reads `id`, `email`, `staff_id`, `full_name`, and `role`. The cutover source is gated for an explicitly isolated TiDB test/recovery environment. The repository does not prove execution or current archive existence.
- Likely source: a pre-cutover legacy account-cutover database/archive. Do not assume it is the same physical source as the academic tables or that it shares the `legacy_schools_archive` backup without custodian confirmation.
- Provide `SHOW CREATE TABLE` (or native equivalent) for the original pre-rename `users` relation and, if present, the post-rename `legacy_users_archive`; identify the exact database/schema/backup and cutover timestamp. Include the associated identity-map version and evidence rows were preserved.
- In addition to the common checklist: confirm types/nullability for all fields read by recovery, aggregate rows, distinct legacy IDs, and mapping/orphan counts. Redact email/staff/name values.

## Handling and acceptance

Return four independently identified evidence packets; do not combine them under an assumed common source. A reviewer must verify provenance, completeness, record-presence evidence, and whether the capture reflects pre- or post-cutover state. Store schema/aggregate artifacts only in an approved access-controlled location. Do not place credentials, connection strings, source rows, or secrets in this repository.

The repository investigation found no authoritative definitions for these four relations. Until their packets are received and reviewed, the definitions remain unresolved and PostgreSQL migration readiness must not be declared.
