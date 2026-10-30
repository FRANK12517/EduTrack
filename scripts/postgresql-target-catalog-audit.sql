BEGIN TRANSACTION READ ONLY;

SELECT jsonb_pretty(jsonb_build_object(
  'format_version', 1,
  'database', current_database(),
  'server_version', current_setting('server_version'),
  'schemas', (
    SELECT COALESCE(jsonb_agg(nspname ORDER BY nspname), '[]'::jsonb)
    FROM pg_catalog.pg_namespace
    WHERE nspname <> 'information_schema'
      AND nspname NOT LIKE 'pg\_%' ESCAPE '\'
  ),
  'tables', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'schema', n.nspname,
      'name', c.relname,
      'kind', CASE c.relkind WHEN 'p' THEN 'partitioned_table' ELSE 'table' END
    ) ORDER BY n.nspname, c.relname), '[]'::jsonb)
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname <> 'information_schema'
      AND n.nspname NOT LIKE 'pg\_%' ESCAPE '\'
      AND c.relkind IN ('r', 'p')
  ),
  'relations', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'schema', n.nspname,
      'name', c.relname,
      'kind', CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'p' THEN 'partitioned_table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized_view'
        WHEN 'f' THEN 'foreign_table'
        WHEN 'S' THEN 'sequence'
        ELSE c.relkind::text
      END,
      'row_security_enabled', c.relrowsecurity,
      'row_security_forced', c.relforcerowsecurity,
      'persistence', c.relpersistence::text
    ) ORDER BY n.nspname, c.relname), '[]'::jsonb)
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname <> 'information_schema'
      AND n.nspname NOT LIKE 'pg\_%' ESCAPE '\'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
  ),
  'columns', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'schema', n.nspname,
      'table', c.relname,
      'ordinal', a.attnum,
      'name', a.attname,
      'postgres_type', pg_catalog.format_type(a.atttypid, a.atttypmod),
      'nullable', NOT a.attnotnull,
      'has_default', d.adbin IS NOT NULL,
      'default_fingerprint', CASE WHEN d.adbin IS NULL THEN NULL ELSE md5(pg_catalog.pg_get_expr(d.adbin, d.adrelid, true)) END,
      'identity_kind', NULLIF(a.attidentity::text, ''),
      'generated_kind', NULLIF(a.attgenerated::text, ''),
      'generated_expression_fingerprint', CASE WHEN a.attgenerated = '' THEN NULL ELSE md5(pg_catalog.pg_get_expr(d.adbin, d.adrelid, true)) END
    ) ORDER BY n.nspname, c.relname, a.attnum), '[]'::jsonb)
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
    WHERE n.nspname <> 'information_schema'
      AND n.nspname NOT LIKE 'pg\_%' ESCAPE '\'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND a.attnum > 0
      AND NOT a.attisdropped
  ),
  'constraints', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'schema', n.nspname,
      'table', c.relname,
      'name', con.conname,
      'kind', CASE con.contype
        WHEN 'p' THEN 'primary_key'
        WHEN 'u' THEN 'unique'
        WHEN 'f' THEN 'foreign_key'
        WHEN 'c' THEN 'check'
        WHEN 'x' THEN 'exclusion'
        ELSE con.contype::text
      END,
      'validated', con.convalidated,
      'deferrable', con.condeferrable,
      'initially_deferred', con.condeferred,
      'definition_fingerprint', md5(pg_catalog.pg_get_constraintdef(con.oid, true)),
      'columns', COALESCE((
        SELECT jsonb_agg(a.attname ORDER BY k.ordinality)
        FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ordinality)
        JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
      ), '[]'::jsonb),
      'referenced_schema', rn.nspname,
      'referenced_table', rc.relname,
      'referenced_columns', COALESCE((
        SELECT jsonb_agg(a.attname ORDER BY k.ordinality)
        FROM unnest(con.confkey) WITH ORDINALITY AS k(attnum, ordinality)
        JOIN pg_catalog.pg_attribute a ON a.attrelid = rc.oid AND a.attnum = k.attnum
      ), '[]'::jsonb)
    ) ORDER BY n.nspname, c.relname, con.conname), '[]'::jsonb)
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_catalog.pg_class rc ON rc.oid = con.confrelid
    LEFT JOIN pg_catalog.pg_namespace rn ON rn.oid = rc.relnamespace
    WHERE n.nspname <> 'information_schema'
      AND n.nspname NOT LIKE 'pg\_%' ESCAPE '\'
  ),
  'indexes', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'schema', n.nspname,
      'table', t.relname,
      'name', i.relname,
      'unique', ix.indisunique,
      'primary', ix.indisprimary,
      'valid', ix.indisvalid,
      'ready', ix.indisready,
      'method', am.amname,
      'columns', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'position', k.ordinality,
          'column', a.attname,
          'key_column', k.ordinality <= ix.indnkeyatts
        ) ORDER BY k.ordinality)
        FROM unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ordinality)
        LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum AND k.attnum > 0
      ), '[]'::jsonb),
      'definition_fingerprint', md5(pg_catalog.pg_get_indexdef(i.oid)),
      'predicate_fingerprint', CASE WHEN ix.indpred IS NULL THEN NULL ELSE md5(pg_catalog.pg_get_expr(ix.indpred, ix.indrelid, true)) END
    ) ORDER BY n.nspname, t.relname, i.relname), '[]'::jsonb)
    FROM pg_catalog.pg_index ix
    JOIN pg_catalog.pg_class t ON t.oid = ix.indrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_catalog.pg_class i ON i.oid = ix.indexrelid
    JOIN pg_catalog.pg_am am ON am.oid = i.relam
    WHERE n.nspname <> 'information_schema'
      AND n.nspname NOT LIKE 'pg\_%' ESCAPE '\'
  ),
  'views', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'schema', n.nspname,
      'name', c.relname,
      'kind', CASE c.relkind WHEN 'm' THEN 'materialized_view' ELSE 'view' END,
      'materialized_data_populated', CASE WHEN c.relkind = 'm' THEN c.relispopulated ELSE NULL END,
      'definition_fingerprint', md5(pg_catalog.pg_get_viewdef(c.oid, true))
    ) ORDER BY n.nspname, c.relname), '[]'::jsonb)
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('v', 'm')
      AND n.nspname <> 'information_schema'
      AND n.nspname NOT LIKE 'pg\_%' ESCAPE '\'
  ),
  'triggers', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'schema', n.nspname,
      'table', c.relname,
      'name', t.tgname,
      'enabled_state', t.tgenabled::text,
      'internal', t.tgisinternal,
      'is_constraint_trigger', t.tgconstraint <> 0,
      'function_schema', fn.nspname,
      'function_name', f.proname,
      'definition_fingerprint', md5(pg_catalog.pg_get_triggerdef(t.oid, true)),
      'function_definition_fingerprint', md5(pg_catalog.pg_get_functiondef(f.oid))
    ) ORDER BY n.nspname, c.relname, t.tgname), '[]'::jsonb)
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_proc f ON f.oid = t.tgfoid
    JOIN pg_catalog.pg_namespace fn ON fn.oid = f.pronamespace
    WHERE n.nspname <> 'information_schema'
      AND n.nspname NOT LIKE 'pg\_%' ESCAPE '\'
      AND NOT t.tgisinternal
  ),
  'row_level_security_policies', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'schema', n.nspname,
      'table', c.relname,
      'name', p.polname,
      'permissive', p.polpermissive,
      'command', CASE p.polcmd WHEN 'r' THEN 'select' WHEN 'a' THEN 'insert' WHEN 'w' THEN 'update' WHEN 'd' THEN 'delete' ELSE 'all' END,
      'roles', COALESCE((
        SELECT jsonb_agg(policy_role_name ORDER BY policy_role_name)
        FROM (
          SELECT CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(role_oid) END AS policy_role_name
          FROM unnest(p.polroles) AS policy_role(role_oid)
        ) AS policy_roles
      ), '[]'::jsonb),
      'using_expression_fingerprint', CASE WHEN p.polqual IS NULL THEN NULL ELSE md5(pg_catalog.pg_get_expr(p.polqual, p.polrelid, true)) END,
      'check_expression_fingerprint', CASE WHEN p.polwithcheck IS NULL THEN NULL ELSE md5(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid, true)) END
    ) ORDER BY n.nspname, c.relname, p.polname), '[]'::jsonb)
    FROM pg_catalog.pg_policy p
    JOIN pg_catalog.pg_class c ON c.oid = p.polrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname <> 'information_schema'
      AND n.nspname NOT LIKE 'pg\_%' ESCAPE '\'
  )
)) AS catalog_snapshot;

COMMIT;
