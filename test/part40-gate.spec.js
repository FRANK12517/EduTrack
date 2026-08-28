'use strict';
const assert = require('assert');
const gate = require('../PART40_FINAL_RELEASE_GATE.json');
assert.strictEqual(gate.part, 40);
assert.strictEqual(gate.secretValuesPrinted, false);
assert.strictEqual(gate.part41Started, false);
console.log('Part 40 gate artifact validated.');
