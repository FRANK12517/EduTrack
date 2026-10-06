'use strict';

const { URL } = require('node:url');
const relational = require('../../db/relational');
const administrativeScope = require('./administrative-scope');

const GLOBAL_ROLES = new Set(['DEVELOPER_ROOT', 'SUPER_ADMIN']);
const SCOPE_KEYS = Object.freeze({ tenantId: 'tenantIds', regionId: 'regionIds', districtId: 'districtIds', schoolId: 'schoolIds', classId: 'classIds' });
const ROLE_LEVEL = Object.freeze({ NATIONAL_ADMIN: 'national', REGIONAL_ADMIN: 'region', DISTRICT_ADMIN: 'district', HEADTEACHER: 'school', SCHOOL_ACCOUNTANT: 'school', ACCOUNTANT: 'school', TEACHER: 'school', PARENT: 'own', STUDENT: 'own' });

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
    if (key === 'tenantId' && membership.tenantId) values.add(String(membership.tenantId));
    for (const value of scope[SCOPE_KEYS[key]] || []) values.add(String(value));
    if (scope[key]) values.add(String(scope[key]));
  }
  return values;
}
function evaluateScope(authz, scope) {
  const role = normalizedRole(authz);
  if (!Object.keys(scope).length || GLOBAL_ROLES.has(role)) return { allowed: true };
  for (const [key, value] of Object.entries(scope)) {
    if(authz.verifiedMacroHierarchy && ['regionId','districtId'].includes(key)){const column=key==='regionId'?'region_id':'district_id';if(String(authz.verifiedMacroHierarchy[column])!==String(value))return {allowed:false,reason:'unauthorized_'+key};continue;}
    if (authz.verifiedMacroSchool && scope.schoolId === authz.verifiedMacroSchool.id) {
      const columns={schoolId:'id',tenantId:'tenant_id',districtId:'district_id',regionId:'region_id'};
      if (columns[key]) {
        if (String(authz.verifiedMacroSchool[columns[key]]) !== String(value)) return {allowed:false,reason:`unauthorized_${key}`};
        continue;
      }
    }
    if (!allowedIds(authz, key).has(String(value))) return { allowed: false, reason: `unauthorized_${key}` };
  }
  return { allowed: true };
}
function evaluate(authz, { permission = null, roles = [], scope = {} } = {}) {
  if (!authz || !authz.user || !authz.user.active || !['ACTIVE', 'active', undefined].includes(authz.user.status)) return { allowed: false, status: 403, reason: 'inactive_account' };
  const role = normalizedRole(authz);
  const core = administrativeScope.coreRole(role);
  if (!role || !ROLE_LEVEL[role] && !GLOBAL_ROLES.has(role) && !core) return { allowed: false, status: 403, reason: 'unknown_role' };
  if (core) {
    const assignedLevel = administrativeScope.normalizeLevel(authz.user.hierarchy);
    if (assignedLevel && assignedLevel !== core.level) return { allowed: false, status: 403, reason: 'administrative_level_mismatch' };
    const scopeKey = core.level === 'DISTRICT' ? 'districtId' : core.level === 'REGIONAL' ? 'regionId' : 'tenantId';
    if (!allowedIds(authz, scopeKey).size) return { allowed: false, status: 403, reason: 'administrative_scope_required' };
    if (core.level === 'NATIONAL' && !(authz.memberships || []).some(m => m.tenantType === 'NATIONAL')) return { allowed: false, status: 403, reason: 'national_scope_required' };
    if (!permission) return { allowed: false, status: 403, reason: 'resource_permission_required' };
  }
  if (authz.user.development_fixture && process.env.NODE_ENV === 'production') return { allowed: false, status: 403, reason: 'development_fixture_disabled' };
  if (roles.length && !roles.includes(role)) return { allowed: false, status: 403, reason: 'role_denied' };
  const permissions = core && authz.rolePermissions ? (authz.rolePermissions[role] || []) : (authz.permissions || []);
  if (permission && !permissions.includes(permission) && !permissions.includes('*')) return { allowed: false, status: 403, reason: 'permission_denied' };
  const scoped = evaluateScope(authz, scope);
  if (!scoped.allowed) return { allowed: false, status: 403, reason: scoped.reason };
  return { allowed: true, role, permission, scope };
}
async function resolve(auth) {
  if (!auth) return null;
  if (relational.isConfigured()) {
    let resolved = await relational.resolveAuthorization(auth.user.id);
    if (resolved && auth.session?.loginScope) resolved = await require('./login-hierarchy').constrainAuthorization(auth.user, resolved, auth.session.loginScope);
    if (!resolved) return null;
    return { ...auth, authorization: resolved };
  }
  return { ...auth, authorization: { user: auth.user, roles: [auth.user.role], permissions: ['*'], memberships: [] } };
}
async function authorize(auth, req, options = {}) {
  const resolved = await resolve(auth);
  const scope = { ...requestScope(req), ...(options.scope || {}) };
  if (administrativeScope.coreRole(normalizedRole(resolved?.authorization)) && scope.schoolId) {
    const context = relational.isConfigured() ? await relational.macroSchoolContext(resolved.authorization,String(scope.schoolId)) : null;
    if (!context) return {allowed:false,status:403,reason:'school_synchronization_or_scope_denied',auth:resolved,attemptedScope:scope};
    resolved.authorization.verifiedMacroSchool = context;
  }
  if(administrativeScope.coreRole(normalizedRole(resolved?.authorization))&&!scope.schoolId&&(scope.regionId||scope.districtId)){
    const context=relational.isConfigured()?await relational.macroHierarchyContext(resolved.authorization,scope):null;
    if(!context)return {allowed:false,status:403,reason:'administrative_hierarchy_scope_denied',auth:resolved,attemptedScope:scope};
    resolved.authorization.verifiedMacroHierarchy=context;
  }
  const result = evaluate(resolved?.authorization, { ...options, scope });
  return { ...result, auth: resolved, attemptedScope: scope };
}
module.exports = { GLOBAL_ROLES, ROLE_LEVEL, requestScope, evaluateScope, evaluate, resolve, authorize };
