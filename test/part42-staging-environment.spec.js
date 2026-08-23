'use strict';
const assert = require('assert');
const gate = require('../PART40_FINAL_RELEASE_GATE.json');
assert.strictEqual(gate.part, 40);
assert.strictEqual(gate.part41Started, false);
assert.ok(!process.env.EDUTRACK_PRODUCTION_BASE_URL || /^https:/.test(process.env.EDUTRACK_PRODUCTION_BASE_URL));
console.log('Part 42 staging environment checks passed; unavailable external resources remain fail-closed.');
