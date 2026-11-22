'use strict';
const relational = require('../db/relational');

(async () => {
  await relational.migrate();
  const { rows } = await relational.getPool().query(
    'SELECT version, name, applied_at FROM supabase_migrations.schema_migrations ORDER BY version'
  );
  console.log(JSON.stringify({ ok: true, provider: 'supabase-postgresql', migrations: rows }));
})().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => relational.close());