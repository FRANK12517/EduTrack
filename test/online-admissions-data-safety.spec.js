'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

assert.match(server, /if \(!relational\.isConfigured\(\)\) return json\(res,503,\{error:'Admission data service unavailable'\}\);/);
assert.match(server, /function admissionLevelForClassName\(name\)/);
assert.match(server, /const validLevels=new Set\(\['KG','LOWER_PRIMARY','UPPER_PRIMARY','JHS'\]\)/);
assert.match(server, /admissionLevelForClassName\(rows\[0\]\.class_name\)!==level/);
assert.match(server, /Selection is not valid for the selected school, jurisdiction, and educational level/);
assert.doesNotMatch(server, /if \(!relational\.isConfigured\(\)\) return json\(res,200,\{regions:\[\],districts:\[\],schools:\[\],classes:\[\]\}\);/);

console.log('Online Admissions data-safety regression suite passed.');
