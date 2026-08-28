'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');
const runtimeEvidence = fs.readFileSync(path.join(__dirname, '..', 'PART41_RUNTIME_EVIDENCE.txt'), 'utf8');
assert.strictEqual(pkg.engines.node, '22.x');
assert.match(runtimeEvidence, /Connected Vercel project runtime metadata: Node\.js 24\.x/);
console.log('Part 42 Node runtime checks passed; actual staging Node 22 remains unverified.');
