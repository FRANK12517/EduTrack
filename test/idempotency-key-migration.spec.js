'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const relational = fs.readFileSync('db/relational.js', 'utf8');
const migrateScript = fs.readFileSync('scripts/migrate-db.js', 'utf8');

assert.match(migrateScript, /relational\.migrate\(\)/);
assert.match(relational, /payment_intents[\s\S]*idempotency_key VARCHAR\(120\) NOT NULL/);
assert.match(relational, /communication_campaigns[\s\S]*idempotency_key VARCHAR\(120\) NULL/);
assert.match(relational, /ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR\(120\) NULL/);
assert.match(relational, /ALTER TABLE communication_campaigns ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR\(120\) NULL/);
assert.match(relational, /payment_intent_user_key \(user_id,idempotency_key\)/);
assert.match(relational, /communication_idempotency \(created_by,idempotency_key\)/);
assert.match(relational, /SELECT \* FROM payment_intents WHERE user_id=\? AND idempotency_key=\?/);
assert.match(relational, /INSERT INTO payment_intents \(id,reference,idempotency_key,user_id/);

console.log('Idempotency-key schema and additive migration contract passed.');
