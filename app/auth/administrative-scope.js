'use strict';

const LEVELS = Object.freeze(['SCHOOL', 'DISTRICT', 'REGIONAL', 'NATIONAL']);
const DIRECT = Object.freeze({ DEVELOPER_ROOT:'NATIONAL', SUPER_ADMIN:'NATIONAL', NATIONAL_ADMIN:'NATIONAL', REGIONAL_ADMIN:'REGIONAL', DISTRICT_ADMIN:'DISTRICT', HEADTEACHER:'SCHOOL', SCHOOL_ACCOUNTANT:'SCHOOL', ACCOUNTANT:'SCHOOL', TEACHER:'SCHOOL', PARENT:'SCHOOL', STUDENT:'SCHOOL' });

function normalizeLevel(value) { const level=String(value||'').trim().toUpperCase(); return LEVELS.includes(level)?level:null; }
function levelForRole(role,hierarchy) {
  const key=String(role||'').trim().toUpperCase().replace(/[\s-]+/g,'_');
  if(DIRECT[key]) return DIRECT[key];
  const hierarchyLevel=normalizeLevel(hierarchy); if(hierarchyLevel) return hierarchyLevel;
  if(/^NATIONAL_|DIRECTOR_GENERAL/.test(key)) return 'NATIONAL';
  if(/^REGIONAL_/.test(key)) return 'REGIONAL';
  if(/^DISTRICT_|SCHOOL_IMPROVEMENT_SUPPORT_OFFICER|\bSISO\b/.test(key)) return 'DISTRICT';
  return 'SCHOOL';
}
function dashboardForLevel(value){return `${(normalizeLevel(value)||'SCHOOL').toLowerCase()}-general`;}
function contextForUser(user){const role=user&&user.role;if(user&&user.authMode==='developer'){const administrativeLevel=normalizeLevel(user.developerLevel)||'NATIONAL';return{authMode:'developer',isDeveloper:true,developerLevel:administrativeLevel,developerRole:user.developerRole,region:user.region||null,district:user.district||null,role,administrativeLevel,dashboard:administrativeLevel.toLowerCase()};}const administrativeLevel=levelForRole(role,user&&user.hierarchy);const dashboard=role==='DEVELOPER_ROOT'?'developer-root':role==='SUPER_ADMIN'?'super-admin':dashboardForLevel(administrativeLevel);return{role,hierarchy:user&&user.hierarchy,scope:user&&user.scope,administrativeLevel,dashboard};}
function matches(user,requestedLevel){const requested=normalizeLevel(requestedLevel);return !requested||requested===levelForRole(user&&user.role,user&&user.hierarchy);}

module.exports={LEVELS,normalizeLevel,levelForRole,dashboardForLevel,contextForUser,matches};
