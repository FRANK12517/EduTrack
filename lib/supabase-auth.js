'use strict';

function config(env = process.env) {
  const url = String(env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const anonKey = String(env.SUPABASE_ANON_KEY || '').trim();
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !anonKey) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required for Supabase Auth');
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('SUPABASE_URL must be a valid HTTPS URL'); }
  if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) throw new Error('SUPABASE_URL must use HTTPS');
  return { url, anonKey, serviceRoleKey };
}
function expiresAt(value) {
  if (value == null) return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric) && numeric > 0
    ? new Date(numeric < 1e12 ? numeric * 1000 : numeric)
    : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

async function request(path, { key, token = key, method = 'GET', body, fetchImpl = globalThis.fetch, env = process.env } = {}) {
  const settings = config(env);
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is required for Supabase Auth');
  const response = await fetchImpl(`${settings.url}/auth/v1${path}`, {
    method,
    headers: { apikey: key || settings.anonKey, Authorization: `Bearer ${token || key || settings.anonKey}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  let payload = {};
  try { payload = await response.json(); } catch { /* use status-only rejection */ }
  if (!response.ok) {
    const error = new Error('Supabase Auth request failed');
    error.status = response.status;
    error.code = payload.error_code || payload.code || 'SUPABASE_AUTH_REJECTED';
    throw error;
  }
  return payload;
}

async function signInWithPassword(email, password, options = {}) {
  const { anonKey } = config(options.env);
  const result = await request('/token?grant_type=password', { ...options, key: anonKey, method: 'POST', body: { email: String(email || '').trim().toLowerCase(), password: String(password || '') } });
  if (!result.user?.id || !result.access_token) throw new Error('Supabase Auth returned an incomplete session');
  return { user: result.user, accessToken: result.access_token, refreshToken: result.refresh_token, expiresAt: expiresAt(result.expires_at || (result.expires_in ? Date.now() + Number(result.expires_in) * 1000 : null)) };
}

async function getUser(accessToken, options = {}) {
  const { anonKey } = config(options.env);
  const user = await request('/user', { ...options, key: anonKey, token: accessToken });
  if (!user?.id) throw new Error('Supabase Auth returned no user identity');
  return user;
}

async function refreshSession(refreshToken, options = {}) {
  const { anonKey } = config(options.env);
  const result = await request('/token?grant_type=refresh_token', { ...options, key: anonKey, method: 'POST', body: { refresh_token: String(refreshToken || '') } });
  if (!result.user?.id || !result.access_token || !result.refresh_token) throw new Error('Supabase Auth returned an incomplete refreshed session');
  return { user: result.user, accessToken: result.access_token, refreshToken: result.refresh_token, expiresAt: expiresAt(result.expires_at || (result.expires_in ? Date.now() + Number(result.expires_in) * 1000 : null)) };
}

async function signOut(accessToken, options = {}) {
  const { anonKey } = config(options.env);
  await request('/logout', { ...options, key: anonKey, token: accessToken, method: 'POST' });
}

async function adminUsers(options = {}) {
  const settings = config(options.env);
  if (!settings.serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for server-side Auth provisioning');
  const output = [];
  for (let page = 1; page <= 100; page += 1) {
    const result = await request(`/admin/users?page=${page}&per_page=1000`, { ...options, key: settings.serviceRoleKey, token: settings.serviceRoleKey });
    const users = Array.isArray(result.users) ? result.users : [];
    output.push(...users);
    if (users.length < 1000) return output;
  }
  throw new Error('Supabase Auth user inventory exceeds the safe provisioning limit');
}

async function ensureUser({ email, password, metadata = {} }, options = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !password) throw new Error('A Supabase Auth email and password are required');
  const settings = config(options.env);
  if (!settings.serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for server-side Auth provisioning');
  const existing = (await adminUsers(options)).find((user) => String(user.email || '').toLowerCase() === normalizedEmail);
  if (!existing) {
    return request('/admin/users', { ...options, key: settings.serviceRoleKey, token: settings.serviceRoleKey, method: 'POST', body: { email: normalizedEmail, password: String(password), email_confirm: true, user_metadata: metadata } });
  }
  return request(`/admin/users/${encodeURIComponent(existing.id)}`, { ...options, key: settings.serviceRoleKey, token: settings.serviceRoleKey, method: 'PUT', body: { password: String(password), email_confirm: true, user_metadata: { ...existing.user_metadata, ...metadata } } });
}

async function updatePassword(authUserId, password, options = {}) {
  if (!password) throw new Error('A new password is required');
  const settings = config(options.env);
  if (!settings.serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for server-side Auth updates');
  return request(`/admin/users/${encodeURIComponent(authUserId)}`, {
    ...options,
    key: settings.serviceRoleKey,
    token: settings.serviceRoleKey,
    method: 'PUT',
    body: { password: String(password) }
  });
}

async function deleteUser(authUserId, options = {}) {
  if (!authUserId) throw new Error('A Supabase Auth identity is required for deletion');
  const settings = config(options.env);
  if (!settings.serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for server-side Auth deletion');
  await request(`/admin/users/${encodeURIComponent(authUserId)}`, {
    ...options,
    key: settings.serviceRoleKey,
    token: settings.serviceRoleKey,
    method: 'DELETE'
  });
}

module.exports = { config, signInWithPassword, getUser, refreshSession, signOut, ensureUser, updatePassword, deleteUser };
