'use strict';
const assert = require('assert');
const source = require('fs').readFileSync(require.resolve('../server'), 'utf8');
assert.doesNotMatch(source, /Access-Control-Allow-Origin[^\n]*\*/);
assert.match(source, /Access-Control-Allow-Credentials/);
assert.match(source, /OPTIONS/);
console.log('Part 43 CORS/security checks passed locally; external staging verification remains separate.');
