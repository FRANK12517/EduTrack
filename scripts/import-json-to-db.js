'use strict';
const path = require('node:path');
const relational = require('../db/relational');
const source = process.argv[2] || path.join(__dirname, '..', 'data', 'edutrack.json');
relational.importJson(source).then(async (result) => { console.log(JSON.stringify(result)); await relational.close(); }).catch(async (error) => { console.error(error.message); await relational.close(); process.exitCode = 1; });
