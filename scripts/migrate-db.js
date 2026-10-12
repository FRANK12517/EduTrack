'use strict';
const relational = require('../db/relational');
const legacyAccountCutover = require('./legacy-account-cutover');

(async () => {
  const prepared = await legacyAccountCutover.prepare();
  await relational.migrate();
  if (prepared.needed) await legacyAccountCutover.materialize(prepared.foreignKeys);
  const [versions] = await relational.getPool().query('SELECT MAX(version) AS version FROM schema_migrations');
  console.log(JSON.stringify({ ok: true, migration: 'canonical-persistence-migration', version: Number(versions[0].version), legacyAccountCutover: prepared.needed }));
})().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => relational.close());
