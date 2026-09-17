'use strict';
const relational = require('../db/relational');
const legacyAccountCutover = require('./legacy-account-cutover');

(async () => {
  const prepared = await legacyAccountCutover.prepare();
  await relational.migrate();
  if (prepared.needed) await legacyAccountCutover.materialize(prepared.foreignKeys);
  console.log(JSON.stringify({ ok: true, migration: 'part31-production-persistence-migration', version: 8, legacyAccountCutover: prepared.needed }));
})().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => relational.close());
