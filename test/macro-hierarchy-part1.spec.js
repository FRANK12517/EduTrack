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
  for (const [role,{level}] of Object.entries(hierarchy.CORE_ROLES)) {
    const scope=level==='DISTRICT'?{districtIds:['d1']}:level==='REGIONAL'?{regionIds:['r1']}:{tenantId:'n1'};
    const auth={user:{active:true,hierarchy:level},roles:[role],permissions:['reporting.read'],memberships:[{tenantId:'n1',tenantType:level==='NATIONAL'?'NATIONAL':'SCHOOL',scope}]};
    assert.equal(authorization.evaluate(auth,{permission:'reporting.read'}).allowed,true,role);
    assert.equal(authorization.evaluate({...auth,memberships:[]},{permission:'reporting.read'}).allowed,false);
    assert.equal(authorization.evaluate(auth,{permission:'examinations.manage'}).allowed,false);
    assert.equal(authorization.evaluate(auth,{permission:'reporting.read',scope:{schoolId:'other'}}).allowed,false);
    assert.equal(authorization.evaluate({...auth,user:{active:true,hierarchy:'SCHOOL'}},{permission:'reporting.read'}).allowed,false);
    assert.equal(authorization.evaluate({...auth,rolePermissions:{[role]:[]}},{permission:'reporting.read'}).allowed,false,'other roles cannot lend resource permissions');
  }
  const filename=path.resolve(__dirname,'../db/relational.js');
  const localRequire=createRequire(filename);
  const calls=[]; let actor=true, district=true, auditFailure=false, rolledBack=false, committed=false;
  const conn={escape:value=>"'"+value.replace(/'/g,"''")+"'",beginTransaction:async()=>{},commit:async()=>{committed=true;},rollback:async()=>{rolledBack=true;},release(){},query:async(sql,params=[])=>{
    calls.push({sql,params});
    if(sql.startsWith('SELECT version FROM schema_migrations')) return [[{version:26}]];
    if(sql.startsWith('SELECT u.id,tm.scope_json')) return [actor?[{scope_json:{schoolIds:['s1']}}]:[]];
    if(sql.includes('FOR UPDATE')) return [[{id:'s1',district_id:district?'d1':null,region_id:district?'r1':null,district_sync_enabled:0}]];
    if(sql.startsWith('INSERT INTO audit_events')&&auditFailure)throw Error('audit failure');
    return [[]];
  }};
  const sandbox={require:name=>name==='mysql2/promise'?{createPool:()=>({...conn,getConnection:async()=>conn})}:localRequire(name),module:{exports:{}},process:{env:{EDUTRACK_DATABASE_URL:'mysql://test.invalid/unused'}},console,Buffer,__dirname:path.dirname(filename)};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),sandbox,{filename});
  const db=sandbox.module.exports;
  await db.ensureInitialized(); calls.length=0;
  for (const role of ['DISTRICT_ADMIN','REGIONAL_ADMIN','NATIONAL_ADMIN','DISTRICT_SISO','SUPER_ADMIN']) {
    await db.multiSchoolSummary({role,districtIds:['d1'],regionIds:['r1']});
    const query=calls.pop();
    assert.match(query.sql,/s\.district_sync_enabled=TRUE/);
    assert.match(query.sql,/s\.district_sync_actor_id IS NOT NULL/);
    assert.match(query.sql,/JOIN districts d ON d.id=s.district_id JOIN regions r ON r.id=d.region_id/);
    if(role.startsWith('DISTRICT'))assert.deepEqual(Array.from(query.params),['d1']);
    if(role.startsWith('REGIONAL'))assert.deepEqual(Array.from(query.params),['r1']);
  }
  calls.length=0;
  await db.multiSchoolSummary({role:'DISTRICT_ADMIN',districtIds:[]});
  assert.equal(calls.length,0,'missing scope must not query all schools');
  for(const level of ['district','regional','national','school']) {
    calls.length=0;
    await db.verifiedNarrativeAnalytics({level,schoolIds:['s1','s2']});
    assert.equal(calls.length,2);
    for(const query of calls)assert.equal(query.sql.includes('district_sync_enabled=TRUE'),level!=='school',level+' consent policy');
  }
  await assert.rejects(db.verifiedNarrativeAnalytics({level:'national',schoolIds:['s1'],classId:'foreign'}),/school scope/);
  calls.length=0;
  assert.equal((await db.setSchoolDistrictSync('s1',true,'ht1')).enabled,true);
  assert.ok(committed);
  assert.ok(calls.some(x=>x.sql.startsWith('INSERT INTO audit_events')));
  assert.deepEqual(Array.from(calls.find(x=>x.sql.startsWith('UPDATE schools')).params).slice(0,2),[true,'ht1']);
  actor=false;
  await assert.rejects(db.setSchoolDistrictSync('s1',true,'other'),/assigned Headteacher/);
  actor=true;
  await assert.rejects(db.setSchoolDistrictSync('s2',true,'ht1'),/assigned Headteacher/);
  district=false;
  await assert.rejects(db.setSchoolDistrictSync('s1',true,'ht1'),/canonical District/);
  assert.equal((await db.setSchoolDistrictSync('s1',false,'ht1')).enabled,false,'revocation works with unresolved hierarchy');
  district=true; auditFailure=true; rolledBack=false; committed=false;
  await assert.rejects(db.setSchoolDistrictSync('s1',true,'ht1'),/audit failure/);
  assert.ok(rolledBack); assert.equal(committed,false);
  await assert.rejects(db.setSchoolDistrictSync('s1','true','ht1'),/boolean/);
  let applied=false, root=false, failDdl=true; const migrationQueries=[];
  const migrationConnection={escape:conn.escape,query:async(sql,params)=>{
    migrationQueries.push({sql,params});
    if(sql.startsWith('SELECT version'))return [applied?[{version:26}]:[]];
    if(sql.startsWith('SELECT id FROM tenants'))return [root?[{id:'existing-national'}]:[]];
    if(sql.startsWith('INSERT INTO tenants'))root=true;
    if(sql.startsWith('ALTER TABLE schools')&&failDdl)throw Error('DDL rejected');
    if(sql.startsWith('INSERT INTO schema_migrations'))applied=true;
    return [[]];
  }};
  await assert.rejects(db.migrateMacroHierarchy(migrationConnection),/DDL rejected/);
  assert.equal(applied,false,'failed DDL must not mark migration applied');
  failDdl=false; await db.migrateMacroHierarchy(migrationConnection);
  assert.ok(applied);
  assert.equal(migrationQueries.filter(x=>x.sql.startsWith('INSERT INTO tenants')).length,1,'retry reuses National root');
  assert.ok(migrationQueries.some(x=>x.sql.startsWith('UPDATE regions')&&x.params[0]==='existing-national'));
  const before=migrationQueries.length;await db.migrateMacroHierarchy(migrationConnection);
  assert.equal(migrationQueries.length,before+1,'completed migration performs only version check');
  assert.ok(!migrationQueries.some(x=>/DROP |TRUNCATE |DELETE FROM /i.test(x.sql)));
  await assert.rejects(db.migrateMacroHierarchy({query:async sql=>[sql.startsWith('SELECT version')?[]:[{id:'n1'},{id:'n2'}]]}),/Multiple National roots/);
  let districtApplied=false,failGrant=true;const districtMigrationQueries=[];
  const districtConnection={query:async(sql,params)=>{districtMigrationQueries.push({sql,params});if(sql.startsWith('SELECT version'))return [districtApplied?[{version:27}]:[]];if(sql.startsWith('INSERT IGNORE INTO role_permissions')&&failGrant)throw Error('grant rejected');if(sql.startsWith('INSERT INTO schema_migrations'))districtApplied=true;return [[]];}};
  await assert.rejects(db.migrateDistrictDashboard(districtConnection),/grant rejected/);assert.equal(districtApplied,false);
  failGrant=false;await db.migrateDistrictDashboard(districtConnection);assert.equal(districtApplied,true);
  const districtCount=districtMigrationQueries.length;await db.migrateDistrictDashboard(districtConnection);assert.equal(districtMigrationQueries.length,districtCount+1);
  assert.ok(districtMigrationQueries.some(x=>x.sql.includes('FOREIGN KEY (school_id) REFERENCES schools(id)')));
  assert.ok(!districtMigrationQueries.some(x=>/DROP |TRUNCATE |DELETE FROM /i.test(x.sql)));
  assert.ok(districtMigrationQueries.filter(x=>x.sql.startsWith('INSERT IGNORE INTO role_permissions')).every(x=>x.params[0].startsWith('district.')));
  let upperApplied=false,upperFail=true;const upperQueries=[];const upperConnection={query:async(sql,params)=>{upperQueries.push({sql,params});if(sql.startsWith('SELECT version'))return [upperApplied?[{version:28}]:[]];if(sql.startsWith('INSERT IGNORE INTO role_permissions')&&upperFail)throw Error('upper grant rejected');if(sql.startsWith('INSERT INTO schema_migrations'))upperApplied=true;return [[]];}};
  await assert.rejects(db.migrateUpperDashboards(upperConnection),/upper grant rejected/);assert.equal(upperApplied,false);upperFail=false;await db.migrateUpperDashboards(upperConnection);assert.equal(upperApplied,true);const upperCount=upperQueries.length;await db.migrateUpperDashboards(upperConnection);assert.equal(upperQueries.length,upperCount+1);assert.ok(!upperQueries.some(x=>/CREATE TABLE|ALTER TABLE|DROP |DELETE FROM|TRUNCATE /i.test(x.sql)));
  assert.ok(upperQueries.filter(x=>x.sql.startsWith('INSERT IGNORE INTO role_permissions')).every(x=>/^(regional|national)\./.test(x.params[0])));
  console.log('PASS Part 4 migration: permission-only addition, failure/retry, completed-version skip, no table or ID changes');
  console.log('PASS Part 3 migration: additive domain table/FKs, explicit grants, failure propagation, retry, completed-version skip');
  console.log('PASS macro hierarchy: 15 role scopes/permissions, summary and narrative SQL gateways, Headteacher assignment, revocation, audit rollback');
  console.log('PASS migration: DDL failure propagation, retry without duplicate root, existing IDs, completed-version skip, ambiguous-root rejection');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
