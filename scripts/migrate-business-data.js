#!/usr/bin/env node
'use strict';

// Imports an explicitly selected local JSON business snapshot into an already
// migrated Supabase database. It never connects to or migrates from TiDB.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const relational = require('../db/relational');

const sourcePath = path.resolve(process.argv[2] || path.join(__dirname, '..', 'data', 'edutrack.json'));
const outPath = path.resolve(process.argv[3] || path.join(process.cwd(), 'part31-business-migration-summary.json'));
function fail(message) { console.error(message); process.exitCode = 1; }
function iso(value) { return value ? new Date(value).toISOString() : null; }
function id(prefix) { return `${prefix}_${crypto.randomBytes(10).toString('hex')}`; }
function text(value) { return value === undefined || value === null ? '' : String(value).trim(); }

async function main() {
  if (!relational.isConfigured()) throw new Error('SUPABASE_DB_URL is required');
  if (!fs.existsSync(sourcePath)) throw new Error(`JSON source not found: ${sourcePath}`);
  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const stats = { source: sourcePath, startedAt: new Date().toISOString(), discovered: {}, migrated: {}, skipped: {}, manualReview: [], duplicates: 0 };
  const note = (kind, collection, identifier, reason) => { stats.skipped[collection] = (stats.skipped[collection] || 0) + 1; stats.manualReview.push({ kind, collection, identifier: identifier || null, reason }); };
  const count = (key, total) => { stats.discovered[key] = Array.isArray(source[key]) ? source[key].length : 0; stats.migrated[key] = total; };
  const rows = (sql, params) => relational.domainRows(sql, params);
  const users = new Set((await rows('SELECT id FROM users', [])).map(row => row.id));
  const schools = new Set((await rows('SELECT id FROM schools', [])).map(row => row.id));
  const intentIds = new Map();
  for (const item of source.paymentIntents || []) {
    const reference = text(item.reference), userId = text(item.userId), key = text(item.idempotencyKey), planId = text(item.planId);
    if (!reference || !userId || !key || !planId || !users.has(userId) || !Number.isFinite(Number(item.amount))) { note('payment_intent', 'paymentIntents', reference, 'missing required field or user does not exist'); continue; }
    try {
      const saved = await rows(`INSERT INTO payment_intents (id,reference,idempotency_key,user_id,school_id,plan_id,amount,currency,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (user_id,idempotency_key) DO UPDATE SET status=EXCLUDED.status,updated_at=EXCLUDED.updated_at RETURNING id`,
      [text(item.id) || id('payintent'), reference, key, userId, schools.has(text(item.schoolId)) ? text(item.schoolId) : null, planId, Number(item.amount), text(item.currency) || 'GHS', text(item.status) || 'initialized', iso(item.createdAt) || new Date().toISOString(), iso(item.updatedAt) || iso(item.createdAt) || new Date().toISOString()]);
      if (intentIds.has(reference)) stats.duplicates += 1;
      intentIds.set(reference, saved[0].id);
    } catch (error) { note('payment_intent', 'paymentIntents', reference, error.code || 'database error'); }
  }
  count('paymentIntents', intentIds.size);
  const groups = [
    ['transactions', 'transaction', 'payment_transactions', 'id,reference,intent_id,user_id,school_id,plan_id,amount,currency,status,provider_event_id,created_at', (x) => [text(x.id)||id('txn'), text(x.reference), intentIds.get(text(x.reference))||null, text(x.userId), schools.has(text(x.schoolId))?text(x.schoolId):null, text(x.planId), Number(x.amount)||0, text(x.currency)||'GHS', text(x.status)||'success', text(x.eventId)||null, iso(x.createdAt)||new Date().toISOString()], 'ON CONFLICT (reference) DO UPDATE SET status=EXCLUDED.status'],
    ['subscriptions', 'subscription', 'subscriptions', 'id,user_id,school_id,plan_id,status,starts_at,expires_at,payment_reference,last_transaction_id,renewal_state,created_at,updated_at', (x) => [text(x.id)||id('sub'), text(x.userId), schools.has(text(x.schoolId))?text(x.schoolId):null, text(x.planId), x.active===false?'INACTIVE':'ACTIVE', iso(x.startsAt)||iso(x.createdAt)||new Date().toISOString(), iso(x.expiresAt), text(x.paymentReference)||text(x.reference)||null, text(x.lastTransactionId)||null, text(x.renewalState)||'MIGRATED', iso(x.createdAt)||new Date().toISOString(), iso(x.updatedAt)||iso(x.createdAt)||new Date().toISOString()], 'ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,expires_at=EXCLUDED.expires_at,updated_at=EXCLUDED.updated_at'],
    ['paymentEvents', 'payment_event', 'payment_events', 'id,event_id,reference,event_type,payload_json,received_at', (x) => [text(x.id)||id('payevent'), text(x.eventId), text(x.reference), text(x.eventType)||'charge.success', JSON.stringify(x.payload||null), iso(x.processedAt)||new Date().toISOString()], 'ON CONFLICT (event_id) DO NOTHING'],
    ['files', 'file', 'file_records', 'id,owner_user_id,school_id,storage_name,original_name,mime_type,size_bytes,category,associated_entity,created_at', (x) => [text(x.id), text(x.ownerUserId), schools.has(text(x.schoolId))?text(x.schoolId):null, text(x.storageName), text(x.originalName)||text(x.storageName), text(x.mimeType)||'application/octet-stream', Number(x.size)||0, text(x.category)||'legacy', text(x.associatedEntity)||null, iso(x.createdAt)||new Date().toISOString()], 'ON CONFLICT (id) DO UPDATE SET original_name=EXCLUDED.original_name,size_bytes=EXCLUDED.size_bytes'],
    ['passwordResets', 'password_reset', 'password_reset_records', 'id,user_id,token_hash,created_at,expires_at,used_at', (x) => [text(x.id)||id('reset'), text(x.userId), text(x.tokenHash), iso(x.createdAt)||new Date().toISOString(), iso(x.expiresAt)||new Date().toISOString(), iso(x.usedAt)], 'ON CONFLICT (token_hash) DO UPDATE SET used_at=EXCLUDED.used_at']
  ];
  for (const [collection, kind, table, columns, valuesFor, conflict] of groups) {
    let total = 0;
    for (const item of source[collection] || []) {
      const values = valuesFor(item), identifier = text(item.reference || item.eventId || item.id);
      if (collection === 'transactions' && (!values[1] || !values[3] || !values[5] || !users.has(values[3])) || collection === 'subscriptions' && (!values[1] || !values[3] || !users.has(values[1]) || !item.expiresAt) || collection === 'paymentEvents' && (!values[1] || !values[2]) || collection === 'files' && (!values[0] || !values[1] || !values[3] || !users.has(values[1])) || collection === 'passwordResets' && (!values[1] || !values[2] || !users.has(values[1]))) { note(kind, collection, identifier, 'missing required field or identity does not exist'); continue; }
      try {
        const marks = values.map(() => '?').join(',');
        await rows(`INSERT INTO ${table} (${columns}) VALUES (${marks}) ${conflict}`, values);
        total += 1;
      } catch (error) { note(kind, collection, identifier, error.code || 'database error'); }
    }
    count(collection, total);
  }
  let audits = 0;
  for (const item of source.audit || []) {
    try { await rows('INSERT INTO audit_events (id,event_type,actor_user_id,occurred_at,correlation_id,ip,user_agent,metadata_json) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT (id) DO NOTHING', [text(item.id)||id('audit'), text(item.action)||'LEGACY_EVENT', users.has(text(item.userId))?text(item.userId):null, iso(item.at)||new Date().toISOString(), text(item.correlationId)||null, text(item.ip)||null, text(item.userAgent).slice(0,300)||null, JSON.stringify(item)]); audits += 1; }
    catch (error) { note('audit', 'audit', item.id, error.code || 'database error'); }
  }
  count('audit', audits);
  stats.completedAt = new Date().toISOString(); stats.ok = stats.manualReview.length === 0;
  fs.writeFileSync(outPath, JSON.stringify(stats, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(stats, null, 2));
  if (!stats.ok) process.exitCode = 2;
}

main().catch(error => fail(error.stack || error.message)).finally(() => relational.close());
