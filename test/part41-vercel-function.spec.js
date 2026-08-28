'use strict';
const assert = require('assert');
const before = process._getActiveHandles().length;
const api = require('../api/index.js');
assert.strictEqual(typeof api, 'function');
const after = process._getActiveHandles().length;
assert.ok(after <= before + 1, 'serverless import must not start a persistent HTTP listener');
console.log('Part 41 Vercel function checks passed.');
