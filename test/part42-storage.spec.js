'use strict';
const required = ['EDUTRACK_STORAGE_BUCKET', 'EDUTRACK_STORAGE_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
const missing = required.filter((name) => !process.env[name]);
if (String(process.env.EDUTRACK_STORAGE_MODE || '').toLowerCase() !== 's3' || missing.length) {
  console.log(`Part 42 storage: NOT_PROVEN (missing isolated staging configuration: ${missing.join(', ') || 'EDUTRACK_STORAGE_MODE'}).`);
  process.exit(0);
}
console.log('Part 42 storage configuration is present; live object-store checks require explicit approved staging consent.');
