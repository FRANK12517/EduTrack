'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');
const { chromium } = require('playwright');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 3421;
const BASE = `http://127.0.0.1:${PORT}`;
const DATABASE_URL = process.env.EDUTRACK_DATABASE_URL || 'mysql://edutrack_test:part19_test_password@127.0.0.1:3306/edutrack_part19_test';
const DEV = { email: 'part21-ui-dev@example.invalid', password: 'Part21-Ui-Password!', accessCode: 'Part21-Ui-Code!' };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function request(pathname, options = {}) { return new Promise((resolve, reject) => { const req = http.request(`${BASE}${pathname}`, { method: options.method || 'GET', headers: options.headers || {} }, (res) => { let raw=''; res.on('data', c => raw += c); res.on('end', () => { let body={}; try { body=raw?JSON.parse(raw):{}; } catch {} resolve({status:res.statusCode, headers:res.headers, body}); }); }); req.on('error', reject); if(options.body) req.write(options.body); req.end(); }); }
function waitForServer() { const started=Date.now(); return new Promise((resolve,reject)=>{ const poll=()=>request('/api/health').then(r=>r.status===200?resolve():retry()).catch(retry); const retry=()=>Date.now()-started>15000?reject(Error('server readiness timeout')):setTimeout(poll,100); poll(); }); }
function env(extra={}) { return {...process.env, EDUTRACK_DATABASE_URL:DATABASE_URL, DATABASE_URL:'', NODE_ENV:'development', EDUTRACK_ENABLE_DEV_ACCESS:'true', EDUTRACK_DEV_EMAIL:DEV.email, EDUTRACK_DEV_PASSWORD:DEV.password, EDUTRACK_DEV_ACCESS_CODE:DEV.accessCode, PORT:String(PORT), ...extra}; }
async function main(){
  const db=await mysql.createConnection(DATABASE_URL); let server; let browser;
  try {
    await db.query('SET FOREIGN_KEY_CHECKS=0');
    for(const table of ['audit_events','teacher_class_assignments','staff_school_assignments','parent_student_relationships','students','classes','staff','server_sessions','tenant_memberships','user_roles','credentials','users','schools','districts','regions','tenants','payment_events','subscriptions','payment_transactions','payment_intents','file_records','password_reset_records','schema_migrations']) await db.query(`TRUNCATE TABLE ${table}`).catch(()=>{});
    await db.query('SET FOREIGN_KEY_CHECKS=1');
    const migrated=spawnSync(process.execPath,['scripts/migrate-db.js'],{cwd:ROOT,env:env(),encoding:'utf8'}); assert.equal(migrated.status,0,migrated.stderr||migrated.stdout);
    const now=new Date();
    await db.query("INSERT INTO tenants (id,name,tenant_type,active,created_at,updated_at) VALUES ('tenant-a','Tenant A','SCHOOL_GROUP',1,?,?)",[now,now]);
    await db.query("INSERT INTO regions (id,name) VALUES ('region-a','Region A')");
    await db.query("INSERT INTO districts (id,region_id,name) VALUES ('district-a','region-a','District A')");
    const provision=spawnSync(process.execPath,['server.js','--provision-dev'],{cwd:ROOT,env:env(),encoding:'utf8'}); assert.equal(provision.status,0,provision.stderr||provision.stdout);
    server=spawn(process.execPath,['server.js'],{cwd:ROOT,env:env(),stdio:['ignore','pipe','pipe']});
    await waitForServer();
    browser=await chromium.launch({headless:true}); const page=await browser.newPage({viewport:{width:1024,height:900}});
    await page.goto(BASE,{waitUntil:'domcontentloaded'});
    const auth=await page.evaluate(async creds=>{const response=await fetch('/api/auth/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(creds)});return {ok:response.ok,body:await response.json()};},{email:DEV.email,password:DEV.password,accessCode:DEV.accessCode});
    assert.equal(auth.ok,true,JSON.stringify(auth.body)); await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#edutrack-part21-workflow-panel').waitFor({state:'visible',timeout:10000});
    async function fill(id,value){await page.waitForFunction(fieldId=>Boolean(document.getElementById(fieldId)),id,{timeout:15000});await page.evaluate(([fieldId,fieldValue])=>{const field=document.getElementById(fieldId);field.value=fieldValue;field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));},[id,value]);}
    await fill('p21-school-code','UI-SCH-21'); await fill('p21-school-name','UI School Original'); await fill('p21-tenant','tenant-a'); await fill('p21-region','region-a'); await fill('p21-district','district-a');
    await page.locator('#p21-school-create').click(); await page.waitForFunction(async()=>{const r=await window.EduTrackDomainAPI.listSchools();return r.schools?.some(s=>s.schoolCode==='UI-SCH-21');},null,{timeout:15000});
    let school=await page.evaluate(()=>window.EduTrackDomainAPI.listSchools()); assert.equal(school.schools.length,1); const schoolId=school.schools[0].id;
    await fill('p21-school-update-id',schoolId); await fill('p21-school-update-name','UI School Updated'); await page.locator('#p21-school-update').click(); await page.waitForFunction(()=>document.querySelector('#edutrack-part21-message')?.textContent.includes('updated'));
    await page.reload({waitUntil:'domcontentloaded'}); await page.locator('#edutrack-part21-workflow-panel').waitFor({state:'visible'}); await page.locator('#p21-school-refresh').click(); await page.waitForFunction(()=>document.querySelector('#p21-school-list')?.textContent.includes('UI School Updated'));
    await fill('p21-staff-id','UI-STF-21'); await fill('p21-staff-name','UI Staff Original'); await fill('p21-staff-tenant','tenant-a'); await fill('p21-staff-school',schoolId); await page.locator('#p21-staff-create').click(); await page.waitForFunction(async()=>{const r=await window.EduTrackDomainAPI.listStaff();return r.staff?.some(s=>s.staffIdentifier==='UI-STF-21');},null,{timeout:15000});
    let staff=await page.evaluate(()=>window.EduTrackDomainAPI.listStaff()); assert.equal(staff.staff.length,1); const staffId=staff.staff[0].id;
    await fill('p21-staff-update-id',staffId); await fill('p21-staff-update-name','UI Staff Updated'); await page.locator('#p21-staff-update').click(); await page.reload({waitUntil:'domcontentloaded'}); await page.locator('#edutrack-part21-workflow-panel').waitFor({state:'visible'}); await page.locator('#p21-staff-refresh').click(); await page.waitForFunction(()=>document.querySelector('#p21-staff-list')?.textContent.includes('UI Staff Updated'));
    await fill('p21-student-adm','UI-ADM-21'); await fill('p21-student-name','UI Student Original'); await fill('p21-student-tenant','tenant-a'); await fill('p21-student-school',schoolId); await page.locator('#p21-student-create').click(); await page.waitForFunction(async()=>{const r=await window.EduTrackDomainAPI.listStudents();return r.students?.some(s=>s.admissionNumber==='UI-ADM-21');},null,{timeout:15000});
    let student=await page.evaluate(()=>window.EduTrackDomainAPI.listStudents()); assert.equal(student.students.length,1); const studentId=student.students[0].id; const studentIdentifier=student.students[0].studentIdentifier;
    await fill('p21-student-update-id',studentId); await fill('p21-student-update-name','UI Student Updated'); await page.locator('#p21-student-update').click(); await page.reload({waitUntil:'domcontentloaded'}); await page.locator('#edutrack-part21-workflow-panel').waitFor({state:'visible'}); await page.locator('#p21-student-refresh').click(); await page.waitForFunction(()=>document.querySelector('#p21-student-list')?.textContent.includes('UI Student Updated'));
    await fill('p21-class-name','UI Class Original'); await fill('p21-class-tenant','tenant-a'); await fill('p21-class-school',schoolId); await page.locator('#p21-class-create').click(); await page.waitForFunction(async()=>{const r=await window.EduTrackDomainAPI.listClasses();return r.classes?.some(c=>c.name==='UI Class Original');},null,{timeout:15000});
    let klass=await page.evaluate(()=>window.EduTrackDomainAPI.listClasses()); assert.equal(klass.classes.length,1); const classId=klass.classes[0].id;
    await fill('p21-class-update-id',classId); await fill('p21-class-update-name','UI Class Updated'); await page.locator('#p21-class-update').click(); await page.reload({waitUntil:'domcontentloaded'}); await page.locator('#edutrack-part21-workflow-panel').waitFor({state:'visible'}); await page.locator('#p21-class-refresh').click(); await page.waitForFunction(()=>document.querySelector('#p21-class-list')?.textContent.includes('UI Class Updated'));
    assert.match(studentIdentifier,/^EDU-/);
    for(const width of [320,360,390,412,480]){await page.setViewportSize({width,height:900});await page.reload({waitUntil:'domcontentloaded'});await page.locator('#edutrack-part21-workflow-panel').waitFor({state:'visible'});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);assert.equal(overflow,false,`horizontal overflow at ${width}px`);assert.equal(await page.locator('#p21-school-create').isVisible(),true);assert.equal(await page.locator('#p21-student-create').isVisible(),true);}
    console.log('Part 21 UI/domain integration suite passed.');
  } finally {
    if(browser) await browser.close().catch(()=>{}); if(server&&!server.killed) server.kill('SIGTERM');
    await db.query('SET FOREIGN_KEY_CHECKS=0').catch(()=>{}); for(const table of ['audit_events','teacher_class_assignments','staff_school_assignments','parent_student_relationships','students','classes','staff','server_sessions','tenant_memberships','user_roles','credentials','users','schools','districts','regions','tenants','payment_events','subscriptions','payment_transactions','payment_intents','file_records','password_reset_records','schema_migrations']) await db.query(`TRUNCATE TABLE ${table}`).catch(()=>{}); await db.query('SET FOREIGN_KEY_CHECKS=1').catch(()=>{}); await db.end();
  }
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
