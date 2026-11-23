'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.NODE_ENV = 'test';
const relational = require('../db/relational');
const supabaseAuth = require('../lib/supabase-auth');

function localHost(hostname) {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(String(hostname || '').toLowerCase());
}

function assertLocalSupabaseTarget(env = process.env) {
  let databaseUrl;
  let authUrl;
  try {
    databaseUrl = new URL(String(env.SUPABASE_DB_URL || ''));
    authUrl = new URL(String(env.SUPABASE_URL || ''));
  } catch {
    throw new Error('Super Administrator authentication tests require the disposable local Supabase database and Auth service');
  }
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)
      || !localHost(databaseUrl.hostname) || databaseUrl.port !== '54322'
      || authUrl.protocol !== 'http:' || !localHost(authUrl.hostname) || authUrl.port !== '54321'
      || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Super Administrator authentication tests may only provision identities in the standard disposable local Supabase project');
  }
}

async function deleteFixtureRows(userId, auditSince) {
  const connection = await relational.getPool().connect();
  try {
    await connection.query('BEGIN');
    if (auditSince) {
      await connection.query("DELETE FROM audit_events WHERE event_type = 'SUPER_ADMIN_LOGIN_REJECTED' AND occurred_at >= $1", [auditSince]);
    }
    await connection.query('DELETE FROM audit_events WHERE actor_user_id = $1', [userId]);
    await connection.query('DELETE FROM server_sessions WHERE user_id = $1', [userId]);
    await connection.query('DELETE FROM tenant_memberships WHERE user_id = $1', [userId]);
    await connection.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
    await connection.query('DELETE FROM credentials WHERE user_id = $1', [userId]);
    await connection.query('DELETE FROM users WHERE id = $1', [userId]);
    await connection.query('COMMIT');
  } catch (error) {
    await connection.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

async function createSuperAdminFixture({ password }) {
  assertLocalSupabaseTarget();
  if (!password || String(password).length < 12) throw new Error('The Super Administrator test password does not meet the Auth policy');
  const identity = crypto.randomUUID().replaceAll('-', '');
  const userId = 'test-super-admin-' + identity;
  const email = userId + '@example.invalid';
  let authUserId = null;

  try {
    const user = await relational.upsertUser({
      id: userId,
      email,
      authPassword: String(password),
      role: 'SUPER_ADMIN',
      hierarchy: 'ROOT',
      scope: {},
      active: true,
      developmentFixture: false
    });
    authUserId = user.supabaseAuthUserId;
    const resolved = await relational.resolveAuthorization(userId);
    assert.equal(String(resolved?.user?.id), userId, 'the relational identity mapping must resolve');
    assert.ok(resolved.roles.includes('SUPER_ADMIN'), 'the test identity must have a persisted Super Admin role');
    const mappedUser = await relational.findUser(email);
    assert.equal(String(mappedUser?.supabaseAuthUserId), String(authUserId), 'the EduTrack user must map to the Supabase Auth UUID');
    return {
      email,
      userId,
      authUserId,
      async cleanup(auditSince) {
        let cleanupError;
        try { await deleteFixtureRows(userId, auditSince); } catch (error) { cleanupError = error; }
        try { await supabaseAuth.deleteUser(authUserId); } catch (error) {
          if (error?.status !== 404 && !cleanupError) cleanupError = error;
        }
        await relational.close().catch(error => { if (!cleanupError) cleanupError = error; });
        if (cleanupError) throw cleanupError;
      }
    };
  } catch (error) {
    try { await deleteFixtureRows(userId); } catch {}
    if (authUserId) {
      try { await supabaseAuth.deleteUser(authUserId); } catch {}
    } else {
      try {
        const existing = (await supabaseAuth.adminUsers()).find(item => String(item.email || '').toLowerCase() === email);
        if (existing?.id) await supabaseAuth.deleteUser(existing.id);
      } catch {}
    }
    await relational.close().catch(() => {});
    throw error;
  }
}

module.exports = { createSuperAdminFixture, relational };
