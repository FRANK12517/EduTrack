'use strict';
const assert = require('node:assert/strict');
const { assertReadOnly } = require('../lib/production-preflight-readonly');
for (const sql of ['SELECT 1', ' show tables', 'DESCRIBE users', 'EXPLAIN SELECT * FROM users']) assert.doesNotThrow(() => assertReadOnly(sql));
for (const sql of ['INSERT INTO users VALUES (1)', ' update users set active=0', 'DELETE FROM users', 'CREATE TABLE x (id INT)', 'ALTER TABLE users ADD x INT', 'DROP TABLE users', 'TRUNCATE users', 'RENAME TABLE users TO x', 'SELECT 1 INTO OUTFILE \'x\'', 'SELECT 1 FOR UPDATE', 'SELECT 1; DELETE FROM users', '/* comment */ DELETE FROM users', 'WITH x AS (SELECT 1) UPDATE users SET active=0']) assert.throws(() => assertReadOnly(sql));
console.log('Production preflight read-only SQL guard passed.');
