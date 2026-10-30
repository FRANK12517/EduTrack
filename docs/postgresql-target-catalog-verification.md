# Read-Only Supabase Target Catalog Verification

**Status:** prepared, not executed. No Supabase connection was made. Run only after the database owner explicitly authorizes the named target and a read-only credential is available. This audit does not apply DDL, DML, policies, extensions, or migrations.

## What the audit collects

[`../scripts/postgresql-target-catalog-audit.sql`](../scripts/postgresql-target-catalog-audit.sql) runs one `SELECT` inside an explicit `READ ONLY` transaction and emits deterministic, sorted JSON for non-system schemas. It collects:

- Schema and relation names/kinds (tables, partitioned tables, views, materialized views, foreign tables, and sequences), persistence, and table RLS enabled/forced flags.
- Columns, native PostgreSQL type, ordinal, nullability, default presence, identity/generated kind, and fingerprints of defaults/generated expressions.
- Primary, unique, foreign-key, check, and exclusion constraints, validation/deferral flags, local/referenced columns, and definition fingerprints.
- Index names, access method, uniqueness/primary/valid/ready flags, and definition/predicate fingerprints.
- View/materialized-view names, populated state, and definition fingerprints.
- Non-internal trigger names, enabled state, trigger-function identity, and trigger/function definition fingerprints.
- RLS policies, command, permissive/restrictive mode, roles, and fingerprints for `USING`/`WITH CHECK` expressions.

Expressions and definitions are fingerprinted with PostgreSQL `md5()` instead of printed. This avoids emitting hard-coded literals from defaults, views, triggers, or policies. A fingerprint mismatch establishes a difference to inspect, not its semantic meaning. The snapshot reports metadata only and does not read application table rows. It includes the database name and server version to establish snapshot context; do not publish the resulting artifact outside approved access controls.

## Privileges and connection safety

- Obtain explicit authorization for the exact Supabase project/database, environment, operator, and capture window. Do not substitute production credentials or execute against production without explicit authorization.
- Use a dedicated read-only database role and a named libpq service entry (for example `edutrack_supabase_readonly`) with the verified host, port, database, SSL mode, and username. Keep the password in an access-controlled password file/secret store; do not place a URI or password in command history, command-line arguments, source, logs, screenshots, or this repository.
- The role needs `CONNECT` on the target database and catalog/schema metadata visibility for the application schemas. No application-table row `SELECT` is needed by this query. Do not grant broad data access such as `pg_read_all_data` solely for this audit. Have the owner supply an appropriately scoped metadata-visible account if the provider hides required metadata.
- Use Supabase’s required TLS connection mode and verify the named service points to the intended project before execution. Never echo the service configuration or password. Do not enable shell tracing (`set -x`) or verbose connection logging.
- The SQL starts `BEGIN TRANSACTION READ ONLY` and ends with `COMMIT`. Do not remove those statements or edit the query to add writes. Even with that safeguard, follow the explicit authorization and read-only-account requirement.

## Prepare and execute (future authorized operation only)

1. Have the owner configure a protected local libpq service file and password file. Confirm the alias resolves to the approved target without printing the URI/password; do not commit either file.
2. Verify `psql` is installed and the operator has write permission only to an approved local evidence directory. Choose a new, non-existing output path to avoid overwriting prior evidence.
3. After authorization, run from the repository root. Example for PowerShell; replace only the output path, not the read-only SQL:

   ```powershell
   psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --dbname="service=edutrack_supabase_readonly" --file="scripts/postgresql-target-catalog-audit.sql" --output="C:\approved\evidence\supabase-catalog-20261030.json"
   ```

   This command is documentation only and was **not** run. The `psql` quiet/tuples-only options leave the JSON result in the designated output file and suppress command tags. Use a fresh filename and an approved location. If the command fails, preserve the error without disclosing connection configuration and do not retry against another target.
4. Record project/database identity, capture time (UTC), server version, operator/authorization reference, role name (not its secret), client version, SQL file SHA-256, and output SHA-256 in an access-controlled evidence manifest. Verify the output parses as JSON and that the first/last JSON brackets are intact. Do not edit or normalize the captured file; compare a copy.
5. Do not execute this file until authorization is granted. The current deliverable is only preparation.

## Comparison procedure

Compare three separately sourced artifacts: (1) authoritative legacy/source DDL plus row-presence evidence, (2) [`postgresql-schema-reconciliation.json`](postgresql-schema-reconciliation.json) with its explicit source/provenance and unresolved flags, and (3) the read-only catalog snapshot above. The current repository inventory is not a substitute for the missing source packets requested in [`postgresql-missing-source-evidence-request.md`](postgresql-missing-source-evidence-request.md).

For every schema-qualified table, classify the result as **confirmed equal**, **confirmed different**, **unknown/missing evidence**, or **out of agreed scope**. First agree on schemas, naming/case rules, partition-parent policy, system-object exclusions, and intended object set. An existing target object is evidence that an object exists—not that it is correct or authoritative.

1. **Objects:** compare schemas and relations by schema-qualified name and kind. Report source tables missing in target, target-only/unexpected objects, kind mismatches, partition relations/parents, and views/materialized views separately. Confirm expected inclusion with the owner before labeling an object unexpected.
2. **Columns:** compare name/order, native type (including length/precision/scale/domain/array), nullability, default-presence/fingerprint, identity, and generated state/fingerprint. A default/expression fingerprint mismatch is confirmed drift but its meaning is unknown until separately reviewed. Missing source DDL means unknown, not target mismatch.
3. **Keys/constraints/indexes:** compare PK and unique columns/order, FK source and referenced columns/order, actions/deferral/validation, checks, exclusions, index method/uniqueness/validity/predicate and expression fingerprint. A local FK/name difference may be semantic only if verified from the full definitions; do not infer from the name alone.
4. **Views, triggers, and generated objects:** compare kind, relation/function identity, enabled/populated states, and fingerprints. For any changed hash, inspect definitions in a separately authorized, controlled review that redacts literals and secrets. Missing source definitions leave this comparison unknown.
5. **RLS:** compare table enabled/forced state and each policy’s role set, command, permissive mode, and `USING`/`WITH CHECK` fingerprints. No policy is deemed correct merely because one exists; role mapping and tenant-isolation semantics need an approved security review. This audit does not create or alter policies.
6. **Data-integrity risk:** this catalog query intentionally reads no table data and cannot prove row counts, orphans, duplicate business keys, migration completeness, source archive presence, or referential integrity of unvalidated constraints. Obtain separately authorized aggregate counts/orphan checks from both source and target before migration decisions.
7. **Report:** preserve confirmed differences with evidence paths and hashes; keep unavailable source/target objects, unverified row state, and unexplained expression hashes in an explicit unknown list. Do not convert unknowns to “equal,” mark migration-ready, or produce application schema SQL until each blocking source and catalog finding is reviewed and accepted.

## Limitations

This preparation performs no live comparison and cannot establish Supabase state. The query’s fingerprints are comparison aids, not proofs of equivalence; hash collision risk is nonzero and expressions need semantic review. System schemas are excluded. Internal triggers are omitted because FK/constraint metadata is reported separately. Application data, privileges/grants, RLS behavior under runtime roles, extensions, function inventories not attached to triggers, sequences’ current values, policies on objects without catalog visibility, and application-generated SQL are outside this snapshot. Record those as additional unknowns where relevant.
