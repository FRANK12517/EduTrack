'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const hierarchy = require('../app/auth/administrative-scope');
const authorization = require('../app/auth/authorization');

async function main() {
  assert.equal(Object.keys(hierarchy.CORE_ROLES).length,15);
  for (const level of ['DISTRICT','REGIONAL','NATIONAL']) {
    const roles=Object.entries(hierarchy.CORE_ROLES).filter(([,metadata])=>metadata.level===level);
    assert.equal(roles.length,5,level+' canonical roles');
    assert.deepEqual(new Set(roles.map(([,metadata])=>metadata.category)),new Set(['DIRECTOR','ADMINISTRATOR','INSTITUTIONAL_SUPPORT','EXAMINATION','SPORTS']));
    for (const [role] of roles) assert.equal(hierarchy.contextForUser({role,hierarchy:level}).dashboard,level.toLowerCase()+'-general');
  }
  for (const [role,alias] of [['REGIONAL_INSTITUTIONAL_SUPPORT_OFFICER','REGIONAL_SISO'],['NATIONAL_INSTITUTIONAL_SUPPORT_OFFICER','NATIONAL_SISO']]) assert.equal(hierarchy.coreRole(role),hierarchy.coreRole(alias));
  for (const [role,{level}] of Object.entries(hierarchy.CORE_ROLES)) {
    const scope=level==='DISTRICT'?{districtIds:['d1']}:level==='REGIONAL'?{regionIds:['r1']}:{tenantId:'n1'};
    const auth={user:{active:true,hierarchy:level},roles:[role],permissions:['reporting.read'],rolePermissions:{[role]:['reporting.read']},memberships:[{tenantId:'n1',tenantType:level==='NATIONAL'?'NATIONAL':'SCHOOL',scope}]};
    assert.equal(authorization.evaluate(auth,{permission:'reporting.read'}).allowed,true,role);
    assert.equal(authorization.evaluate({...auth,memberships:[]},{permission:'reporting.read'}).allowed,false);
    assert.equal(authorization.evaluate(auth,{permission:'examinations.manage'}).allowed,false);
    assert.equal(authorization.evaluate(auth,{permission:'reporting.read',scope:{schoolId:'other'}}).allowed,false);
    assert.equal(authorization.evaluate({...auth,user:{active:true,hierarchy:'SCHOOL'}},{permission:'reporting.read'}).allowed,false);
    assert.equal(authorization.evaluate({...auth,rolePermissions:{[role]:[]}},{permission:'reporting.read'}).allowed,false,'other roles cannot lend resource permissions');
  }
  assert.equal(authorization.evaluate({user:{active:true,hierarchy:'DISTRICT'},roles:['DISTRICT_DIRECTOR_OF_EDUCATION'],permissions:['*'],memberships:[{scope:{districtIds:['d1']}}]}, {permission:'district.dashboard.view'}).allowed,false,'core role must fail closed when role permissions are missing');
  const relational=require('../db/relational'),wasConfigured=relational.isConfigured,originalProduction=process.env.NODE_ENV;
  relational.isConfigured=()=>false;
  try {
    assert.equal(await authorization.resolve({user:{id:'officer',role:'DISTRICT_DIRECTOR_OF_EDUCATION'}}),null,'admin authorization cannot resolve without relational authority');
    process.env.NODE_ENV='production';
    assert.equal(await authorization.resolve({user:{id:'teacher',role:'TEACHER'}}),null,'production authorization cannot fall back to wildcard grants');
  } finally { relational.isConfigured=wasConfigured;if(originalProduction===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=originalProduction; }
  const regional = {roles:['REGIONAL_ADMIN'],memberships:[{tenantId:'n1',tenantType:'NATIONAL',scope:{regionId:'r1',regionIds:['r1'],districtIds:['d1']}}]};
  const regionalFilter=relational.macroHierarchyFilter(regional);
  assert.match(regionalFilter.sql,/sync_region\.id IN \(\?\)/);
  assert.deepEqual(regionalFilter.params,['r1','d1'],'regional district oversight is limited to server-authorized memberships');
  const district={roles:['DISTRICT_SISO'],memberships:[{tenantType:'DISTRICT',tenantId:'d1',scope:{districtId:'d1',districtIds:['d1']}}]};
  const districtFilter=relational.macroHierarchyFilter(district);
  assert.match(districtFilter.sql,/sync_district\.id IN \(\?\)/);
  assert.deepEqual(districtFilter.params,['d1']);
  const national={roles:['NATIONAL_EXAMINATION_OFFICER'],memberships:[{tenantType:'NATIONAL',tenantId:'n1',scope:{}}]};
  const nationalFilter=relational.macroHierarchyFilter(national);
  assert.match(nationalFilter.sql,/sync_region\.national_tenant_id IN \(\?\)/);
  assert.deepEqual(nationalFilter.params,['n1']);
  const schoolFilter=relational.macroSchoolFilter(district,'sc');
  assert.match(schoolFilter.sql,/sc\.active=TRUE AND sc\.district_sync_enabled=TRUE AND sc\.district_sync_actor_id IS NOT NULL/);
  assert.match(schoolFilter.sql,/sync_district\.id IN/);
  assert.throws(()=>relational.macroHierarchyFilter({roles:['TEACHER'],memberships:[]}),/Administrative role required/);
  assert.throws(()=>relational.synchronizedSchoolPredicate('s; DROP TABLE schools'),/Invalid school alias/);
  console.log('PASS macro hierarchy: 15 canonical dashboard routes, fail-closed role grants, jurisdiction filters, and school consent gate');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
