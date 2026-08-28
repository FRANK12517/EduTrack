'use strict';
const assert = require('assert');
const configured = Boolean(process.env.EDUTRACK_DATABASE_URL);
if (!configured) {
  console.log('Part 42 database: NOT_PROVEN (isolated staging database is unavailable).');
  process.exit(0);
}
assert.ok(/^mysql:|^mariadb:/.test(process.env.EDUTRACK_DATABASE_URL));
assert.ok(process.env.NODE_ENV === 'staging' || process.env.NODE_ENV === 'production');
console.log('Part 42 database configuration is present; external migration and persistence evidence still required.');
