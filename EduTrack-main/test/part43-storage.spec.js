'use strict';
const names = ['EDUTRACK_STORAGE_BUCKET', 'EDUTRACK_STORAGE_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
const missing = names.filter((name) => !process.env[name]);
if (String(process.env.EDUTRACK_STORAGE_MODE || '').toLowerCase() !== 's3' || missing.length) { console.log('Part 43 storage: NOT_PROVEN (private staging storage unavailable).'); process.exit(0); }
console.log('Part 43 storage configuration present; object operations require approved staging consent.');
