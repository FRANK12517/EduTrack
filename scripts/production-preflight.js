'use strict';

const required = [
  'SUPABASE_DB_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'EDUTRACK_ALLOWED_ORIGINS', 'PAYSTACK_SECRET_KEY', 'PAYSTACK_WEBHOOK_SECRET',
  'EDUTRACK_STORAGE_BUCKET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'
];
const missing = required.filter(name => !process.env[name]);
const failures = [];
if (process.env.NODE_ENV !== 'production') failures.push('NODE_ENV must be production');
if (process.env.EDUTRACK_ENABLE_DEV_ACCESS === 'true') failures.push('development access must be disabled');
if (missing.length) failures.push(`missing required variables: ${missing.join(', ')}`);
if (process.env.SUPABASE_DB_URL && !/^postgres(?:ql)?:\/\//i.test(process.env.SUPABASE_DB_URL)) failures.push('SUPABASE_DB_URL must be a PostgreSQL URL');
if (process.env.SUPABASE_URL && !/^https:\/\//i.test(process.env.SUPABASE_URL)) failures.push('SUPABASE_URL must use HTTPS');
const origins = String(process.env.EDUTRACK_ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
const invalidOrigins = origins.filter(origin => { try { const u = new URL(origin); return u.protocol !== 'https:' || !u.hostname; } catch { return true; } });
if (!origins.length || origins.includes('*') || invalidOrigins.length) failures.push('allowed origins must be exact HTTPS origins without wildcards');
if (String(process.env.EDUTRACK_STORAGE_MODE || '').toLowerCase() !== 's3') failures.push('EDUTRACK_STORAGE_MODE must be s3');
if (failures.length) { console.error(JSON.stringify({ ok: false, failures }, null, 2)); process.exit(1); }
console.log(JSON.stringify({ ok: true, nodeEnv: process.env.NODE_ENV, originCount: origins.length, persistence: 'supabase-postgresql', storageMode: 's3' }, null, 2));
