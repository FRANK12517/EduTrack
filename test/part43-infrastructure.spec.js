'use strict';
const assert = require('assert');
assert.ok(process.env.EDUTRACK_PRODUCTION_BASE_URL === undefined || /^https:\/\//.test(process.env.EDUTRACK_PRODUCTION_BASE_URL));
if (!process.env.EDUTRACK_STAGING_BASE_URL) console.log('Part 43 infrastructure: BLOCKED (isolated staging endpoint unavailable).');
else assert.ok(!/localhost|127\.0\.0\.1/.test(process.env.EDUTRACK_STAGING_BASE_URL));
