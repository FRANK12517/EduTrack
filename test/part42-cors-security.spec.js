'use strict';
const assert = require('assert');
const fs = require('fs');
const server = fs.readFileSync(require.resolve('../server'), 'utf8');
assert.doesNotMatch(server, /Access-Control-Allow-Origin[^\n]*\*/);
assert.match(server, /Access-Control-Allow-Credentials/);
assert.match(server, /OPTIONS/);
console.log('Part 42 CORS/security static checks passed; real staging verification remains infrastructure-dependent.');
