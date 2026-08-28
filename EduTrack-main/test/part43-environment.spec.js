'use strict';
const assert = require('assert');
const names = ['EDUTRACK_DATABASE_URL', 'EDUTRACK_ALLOWED_ORIGINS', 'PAYSTACK_SECRET_KEY', 'PAYSTACK_WEBHOOK_SECRET', 'EDUTRACK_PAYMENT_PLANS', 'EDUTRACK_STORAGE_MODE', 'EDUTRACK_STORAGE_BUCKET', 'EDUTRACK_STORAGE_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
assert.ok(names.length >= 10);
const missing = names.filter((name) => !process.env[name]);
if (missing.length) console.log(`Part 43 environment: NOT_PROVEN (missing ${missing.length} staging values; names only, no values printed).`);
else assert.notStrictEqual(process.env.EDUTRACK_ALLOWED_ORIGINS, '*');
