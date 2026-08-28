'use strict';
const relational = require('../db/relational');
relational.migrate().then(async () => { console.log(JSON.stringify({ ok: true, migration: 'part31-production-persistence-migration', version: 8 })); await relational.close(); }).catch(async (error) => { console.error(error.message); await relational.close(); process.exitCode = 1; });
