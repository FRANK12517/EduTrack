'use strict';
const assert = require('node:assert/strict');
const { config, signInWithPassword, getUser, ensureUser, updatePassword, deleteUser } = require('../lib/supabase-auth');
assert.throws(() => config({}), /SUPABASE_URL and SUPABASE_ANON_KEY/);
assert.throws(() => config({ SUPABASE_URL: 'http://auth.example.test', SUPABASE_ANON_KEY: 'anon' }), /HTTPS/);
assert.deepEqual(config({ SUPABASE_URL: 'http://localhost:54321/', SUPABASE_ANON_KEY: 'anon' }), { url: 'http://localhost:54321', anonKey: 'anon', serviceRoleKey: '' });
async function main() {
  const calls = [];
  const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon-test', SUPABASE_SERVICE_ROLE_KEY: 'service-test' };
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/v1/token?grant_type=password')) return { ok: true, json: async () => ({ access_token: 'access', refresh_token: 'refresh', expires_at: 123, user: { id: 'auth-uuid' } }) };
    if (url.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'auth-uuid', email: 'user@example.test' }) };
    if (url.endsWith('/auth/v1/admin/users?page=1&per_page=1000')) return { ok: true, json: async () => ({ users: [] }) };
    if (url.endsWith('/auth/v1/admin/users')) return { ok: true, json: async () => ({ id: 'created-uuid', email: 'new@example.test' }) };
    if (url.endsWith('/auth/v1/admin/users/auth-uuid')) return { ok: true, json: async () => ({ id: 'auth-uuid' }) };
    if (url.endsWith('/auth/v1/admin/users/created-uuid')) return { ok: true, json: async () => ({ id: 'created-uuid' }) };
    throw new Error('unexpected Supabase Auth request');
  };
  const session = await signInWithPassword(' USER@example.test ', 'password', { env, fetchImpl });
  assert.equal(session.user.id, 'auth-uuid');
  assert.equal(calls[0].options.headers.apikey, 'anon-test');
  assert.equal(JSON.parse(calls[0].options.body).email, 'user@example.test');
  assert.equal((await getUser('access', { env, fetchImpl })).id, 'auth-uuid');
  const created = await ensureUser({ email: 'new@example.test', password: 'strong-password', metadata: { edutrackUserId: 'usr-1' } }, { env, fetchImpl });
  assert.equal(created.id, 'created-uuid');
  assert.equal(calls[2].options.headers.apikey, 'service-test');
  assert.equal(JSON.parse(calls[3].options.body).email_confirm, true);
  await updatePassword('auth-uuid', 'another-strong-password', { env, fetchImpl });
  assert.equal(calls[4].options.method, 'PUT');
  assert.equal(JSON.parse(calls[4].options.body).password, 'another-strong-password');
  await deleteUser('created-uuid', { env, fetchImpl });
  assert.equal(calls[5].options.method, 'DELETE');
  assert.equal(calls[5].options.headers.apikey, 'service-test');
  console.log('Supabase Auth contract passed: password sign-in uses anon credentials, identity APIs use server-only service role, and provisioning, password updates, and fixture cleanup are explicit.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
