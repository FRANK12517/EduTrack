'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

assert.match(server, /function assertProductionConfiguration\(\{ requirePaystack = false \} = \{\}\)/);
assert.match(server, /if \(requirePaystack && \(!process\.env\.PAYSTACK_SECRET_KEY \|\| !process\.env\.PAYSTACK_WEBHOOK_SECRET\)\)/);
assert.match(server, /try \{ assertProductionConfiguration\(\); \}/);
assert.match(server, /Payment initialization unavailable/);
assert.match(server, /Payment verification unavailable/);
assert.match(server, /Webhook verification unavailable/);

console.log('Production read-route configuration gate regression suite passed.');
