'use strict';
const hierarchy = require('../../ghana-hierarchy');
const administrative = require('./administrative-scope');
const relational = require('../../db/relational');

const normalize = value => String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
const regionName = value => normalize(value).replace(/ REGION$/, '');
const districtName = value => normalize(value).replace(/METROPOLITAN/g, 'METRO').replace(/SECONDI/g, 'SEKONDI');

function validSelection(input) {
  const core = administrative.CORE_ROLES[input.role];
  if (!core || core.level !== input.administrativeLevel) return false;
  if (core.level === 'NATIONAL') return !Object.hasOwn(input, 'region') && !Object.hasOwn(input, 'district');
  if (!hierarchy.hasRegion(input.region)) return false;
  return core.level === 'REGIONAL' ? !Object.hasOwn(input, 'district') : hierarchy.validPair(input.region, input.district);
}

// Resolve display choices to persisted IDs through the existing scoped hierarchy.
// No school operational data or synchronization changes are involved in login.
async function resolveSelection(user, input, authz) {
  if (!validSelection(input) || !user || user.role !== input.role || !relational.isConfigured()) return null;
  authz = authz || await relational.resolveAuthorization(user.id);
  if (!authz || authz.roles[0] !== input.role || !authz.user.active || authz.user.status !== 'ACTIVE') return null;
  if (!(authz.rolePermissions[input.role] || []).includes(input.administrativeLevel.toLowerCase() + '.dashboard.view')) return null;
  const result = { level: input.administrativeLevel, role: input.role };
  if (result.level === 'NATIONAL') {
    return authz.memberships.some(m => m.tenantType === 'NATIONAL') ? result : null;
  }
  const regions = await relational.macroHierarchyRows(authz, 'regions');
  const matches = regions.filter(row => regionName(row.name) === regionName(input.region));
  if (matches.length !== 1) return null;
  result.regionId = matches[0].id; result.region = input.region;
  if (result.level === 'DISTRICT') {
    const districts = await relational.macroHierarchyRows(authz, 'districts', result.regionId);
    const matches = districts.filter(row => districtName(row.name) === districtName(input.district));
    if (matches.length !== 1) return null;
    result.districtId = matches[0].id; result.district = input.district;
  }
  return result;
}

async function constrainAuthorization(user, authz, selection) {
  if (selection.level === 'SCHOOL') {
    if (user.role !== selection.role || !authz.user.active || authz.user.status !== 'ACTIVE') return null;
    const rows = await relational.domainRows("SELECT s.id,d.id district_id,r.id region_id FROM staff st JOIN schools s ON s.id=st.school_id JOIN districts d ON d.id=s.district_id JOIN regions r ON r.id=d.region_id WHERE st.user_id=? AND st.status='ACTIVE' AND s.active=TRUE", [user.id]);
    if (rows.length !== 1 || rows[0].id !== selection.schoolId || rows[0].district_id !== selection.districtId || rows[0].region_id !== selection.regionId) return null;
    return authz;
  }
  const current = await resolveSelection(user, { administrativeLevel: selection.level, role: selection.role,
    ...(selection.region ? {region: selection.region} : {}), ...(selection.district ? {district: selection.district} : {}) }, authz);
  if (!current || current.regionId !== selection.regionId || current.districtId !== selection.districtId) return null;
  return { ...authz, memberships: authz.memberships.map(m => ({...m, scope: {...m.scope,
    ...(current.regionId ? {regionId:current.regionId, regionIds:[current.regionId]} : {}),
    ...(current.districtId ? {districtId:current.districtId, districtIds:[current.districtId]} : {})}})) };
}
module.exports = { validSelection, resolveSelection, constrainAuthorization };
