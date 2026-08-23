'use strict';

const { URL } = require('node:url');
const relational = require('../../db/relational');

const GLOBAL_ROLES = new Set(['DEVELOPER_ROOT', 'SUPER_ADMIN']);
const SCOPE_KEYS = Object.freeze({ tenantId: 'tenantIds', regionId: 'regionIds', districtId: 'districtIds', schoolId: 'schoolIds', classId: 'classIds' });
const ROLE_LEVEL = Object.freeze({ NATIONAL_ADMIN: 'national', REGIONAL_ADMIN: 'region', DISTRICT_ADMIN: 'district', HEADTEACHER: 'school', TEACHER: 'school', PARENT: 'own', STUDENT: 'own' });

function requestScope(req) {
  const url = new URL(req.url || '/', 'http://edutrack.local');
  const scope = {};
  for (const key of Object.keys(SCOPE_KEYS)) { const value = url.searchParams.get(key); if (value) scope[key] = value; }
  return scope;
}
function normalizedRole(authz) { return authz?.roles?.[0] || null; }
function allowedIds(authz, key) {
  const values = new Set();
  for (const membership of authz?.memberships || []) {
    const scope = membership.scope || {};
    if (key === 'tenantId') values.add(membership.tenantId);
    for (const value of scope[SCOPE_KEYS[key]] || []) values.add(String(value));
    if (scope[key]) values.add(String(scope[key]));
  }
  return values;
}
function evaluateScope(authz, scope) {
  const role = normalizedRole(authz);
  if (!Object.keys(scope).length || GLOBAL_ROLES.has(role)) return { allowed: true };
  for (const [key, value] of Object.entries(scope)) {
    if (!allowedIds(authz, key).has(String(value))) return { allowed: false, reason: `unauthorized_${key}` };
  }
  return { allowed: true };
}
function evaluate(authz, { permission = null, roles = [], scope = {} } = {}) {
  if (!authz || !authz.user || !authz.user.active || !['ACTIVE', 'active', undefined].includes(authz.user.status)) return { allowed: false, status: 403, reason: 'inactive_account' };
  const role = normalizedRole(authz);
  if (!role || !ROLE_LEVEL[role] && !GLOBAL_ROLES.has(role)) return { allowed: false, status: 403, reason: 'unknown_role' };
  if (authz.user.development_fixture && process.env.NODE_ENV === 'production') return { allowed: false, status: 403, reason: 'development_fixture_disabled' };
  if (roles.length && !roles.includes(role)) return { allowed: false, status: 403, reason: 'role_denied' };
  if (permission && !authz.permissions.includes(permission) && !authz.permissions.includes('*')) return { allowed: false, status: 403, reason: 'permission_denied' };
  const scoped = evaluateScope(authz, scope);
  if (!scoped.allowed) return { allowed: false, status: 403, reason: scoped.reason };
  return { allowed: true, role, permission, scope };
}
async function resolve(auth) {
  if (!auth) return null;
  if (relational.isConfigured()) {
    const resolved = await relational.resolveAuthorization(auth.user.id);
    if (!resolved) return null;
    return { ...auth, authorization: resolved };
  }
  return { ...auth, authorization: { user: auth.user, roles: [auth.user.role], permissions: ['*'], memberships: [] } };
}
async function authorize(auth, req, options = {}) {
  const resolved = await resolve(auth);
  const scope = { ...requestScope(req), ...(options.scope || {}) };
  const result = evaluate(resolved?.authorization, { ...options, scope });
  return { ...result, auth: resolved, attemptedScope: scope };
}
module.exports = { GLOBAL_ROLES, ROLE_LEVEL, requestScope, evaluateScope, evaluate, resolve, authorize };
