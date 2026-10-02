'use strict';

const LEVELS = Object.freeze(['SCHOOL', 'DISTRICT', 'REGIONAL', 'NATIONAL']);
// Categories describe function only; permissions remain in role_permissions.
const CORE_ROLES = Object.freeze(Object.fromEntries(['DISTRICT','REGIONAL','NATIONAL'].flatMap(level => [
  ['DIRECTOR_OF_EDUCATION','Director of Education','DIRECTOR'],
  ['ADMIN','Administrator','ADMINISTRATOR'],
  [level === 'DISTRICT' ? 'SISO' : 'INSTITUTIONAL_SUPPORT_OFFICER', level === 'DISTRICT' ? 'School Improvement Support Officer (SISO)' : 'Institutional Support Officer','INSTITUTIONAL_SUPPORT'],
  ['EXAMINATION_OFFICER','Examination Officer','EXAMINATION'],
  ['SPORTS_OFFICER','Sports Officer','SPORTS']
].map(([suffix,label,category]) => [`${level}_${suffix}`, Object.freeze({level,category,label:`${level.charAt(0)+level.slice(1).toLowerCase()} ${label}`})]))));
function coreRole(role) { return CORE_ROLES[String(role || '').trim().toUpperCase().replace(/[\s-]+/g,'_')] || null; }
const DIRECT = Object.freeze({ DEVELOPER_ROOT:'NATIONAL', SUPER_ADMIN:'NATIONAL', NATIONAL_ADMIN:'NATIONAL', REGIONAL_ADMIN:'REGIONAL', DISTRICT_ADMIN:'DISTRICT', HEADTEACHER:'SCHOOL', SCHOOL_ACCOUNTANT:'SCHOOL', ACCOUNTANT:'SCHOOL', TEACHER:'SCHOOL', PARENT:'SCHOOL', STUDENT:'SCHOOL' });

function normalizeLevel(value) { const level=String(value||'').trim().toUpperCase(); return level === 'REGION' ? 'REGIONAL' : LEVELS.includes(level)?level:null; }
function levelForRole(role,hierarchy) {
  const key=String(role||'').trim().toUpperCase().replace(/[\s-]+/g,'_');
  if(DIRECT[key]) return DIRECT[key];
  if(CORE_ROLES[key]) return CORE_ROLES[key].level;
  const hierarchyLevel=normalizeLevel(hierarchy); if(hierarchyLevel) return hierarchyLevel;
  if(/^NATIONAL_|DIRECTOR_GENERAL/.test(key)) return 'NATIONAL';
  if(/^REGIONAL_/.test(key)) return 'REGIONAL';
  if(/^DISTRICT_|SCHOOL_IMPROVEMENT_SUPPORT_OFFICER|\bSISO\b/.test(key)) return 'DISTRICT';
  return 'SCHOOL';
}
function dashboardForLevel(value){return `${(normalizeLevel(value)||'SCHOOL').toLowerCase()}-general`;}
function contextForUser(user){const role=user&&user.role;if(user&&user.authMode==='developer'){const administrativeLevel=normalizeLevel(user.developerLevel)||'NATIONAL';return{authMode:'developer',isDeveloper:true,developerLevel:administrativeLevel,developerRole:user.developerRole,region:user.region||null,district:user.district||null,role,administrativeLevel,dashboard:administrativeLevel.toLowerCase()};}const administrativeLevel=levelForRole(role,user&&user.hierarchy);const dashboard=role==='DEVELOPER_ROOT'?'developer-root':role==='SUPER_ADMIN'?'super-admin':dashboardForLevel(administrativeLevel);return{role,hierarchy:user&&user.hierarchy,scope:user&&user.scope,administrativeLevel,dashboard};}
function matches(user,requestedLevel){const requested=normalizeLevel(requestedLevel);return !requested||requested===levelForRole(user&&user.role,user&&user.hierarchy);}

// Read-only oversight grants are separate from School management permissions.
const DISTRICT_PERMISSIONS = Object.freeze({
  DISTRICT_DIRECTOR_OF_EDUCATION: ['district.dashboard.view','district.schools.read','district.attendance.read','district.examinations.read','district.sports.read','district.reports.export'],
  DISTRICT_ADMIN: ['district.dashboard.view','district.schools.read','district.attendance.read','district.examinations.read','district.sports.read','district.reports.export'],
  DISTRICT_SISO: ['district.dashboard.view','district.schools.read','district.attendance.read'],
  DISTRICT_EXAMINATION_OFFICER: ['district.dashboard.view','district.schools.read','district.examinations.read','district.reports.export'],
  DISTRICT_SPORTS_OFFICER: ['district.dashboard.view','district.schools.read','district.sports.read','district.sports.manage']
});
const UPPER_PERMISSIONS = Object.freeze(Object.fromEntries(['REGIONAL','NATIONAL'].flatMap(level=>{
  const p=level.toLowerCase(),common=[p+'.dashboard.view',p+'.hierarchy.read',p+'.schools.read'];
  const grants={DIRECTOR_OF_EDUCATION:[p+'.attendance.read',p+'.examinations.read',p+'.sports.read',p+'.reports.export'],ADMIN:[p+'.attendance.read',p+'.examinations.read',p+'.sports.read',p+'.reports.export'],INSTITUTIONAL_SUPPORT_OFFICER:[p+'.attendance.read'],EXAMINATION_OFFICER:[p+'.examinations.read',p+'.reports.export'],SPORTS_OFFICER:[p+'.sports.read']};
  return Object.entries(grants).map(([role,permissions])=>[level+'_'+role,Object.freeze([...common,...permissions])]);
})));
module.exports={LEVELS,CORE_ROLES,DISTRICT_PERMISSIONS,UPPER_PERMISSIONS,coreRole,normalizeLevel,levelForRole,dashboardForLevel,contextForUser,matches};
