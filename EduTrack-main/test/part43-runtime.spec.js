'use strict';
const assert = require('assert');
const pkg = require('../package.json');
assert.strictEqual(pkg.engines.node, '22.x');
if (process.env.EDUTRACK_STAGING_RUNTIME) assert.strictEqual(process.env.EDUTRACK_STAGING_RUNTIME, '22.x');
else console.log('Part 43 runtime: NOT_PROVEN (actual isolated staging runtime unavailable).');
