'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

(async()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const marker=html.indexOf('v138 — SCHOOL DATA SYNCHRONIZATION MANAGEMENT');
  const start=html.lastIndexOf('<script>',marker)+8,end=html.indexOf('</script>',marker);
  const values=new Map([['v43_login_level','SCHOOL'],['v43_login_role','Headteacher'],['ems_sync_settings_v138',JSON.stringify({enabled:true})]]);
  const requests=[],messages=[],listeners={};let fail=false,serverEnabled=false;
  const sandbox={console,Date,Math,JSON,Promise,setTimeout:()=>0,setInterval:()=>0,navigator:{userAgent:'test'},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},document:{readyState:'loading',addEventListener(){},getElementById:()=>null,querySelectorAll:()=>[]},CONFIG:{school:'School',schoolNo:'s1',district:'District',region:'Region'},fetch:async(url,options)=>{
    requests.push({url,options});
    if(fail)throw Error('offline');
    if(options.method==='POST')serverEnabled=JSON.parse(options.body).enabled;
    return {ok:true,json:async()=>({schoolId:'s1',districtId:'d1',enabled:serverEnabled})};
  }};
  sandbox.window=sandbox;sandbox.addEventListener=(event,fn)=>{listeners[event]=fn;};sandbox.toast=message=>messages.push(message);
  vm.runInNewContext(html.slice(start,end),sandbox);
  const ui=sandbox.EMS_SYNC;
  assert.equal(ui.isEnabled(),false,'browser ON is not consent');
  ui.openToggleConfirm(true);await ui.confirmToggle();
  assert.equal(ui.isEnabled(),true);
  assert.equal(requests[0].url,'/api/school-district-sync');
  assert.equal(requests[0].options.credentials,'same-origin');
  assert.equal(JSON.parse(values.get('ems_sync_settings_v138')).schoolId,'s1');
  ui.openToggleConfirm(false);await ui.confirmToggle();assert.equal(ui.isEnabled(),false);
  values.set('v43_login_role','HEADTEACHER');assert.equal(ui.isHeadteacher(),true,'canonical School login role remains the Headteacher');
  fail=true;ui.openToggleConfirm(true);await ui.confirmToggle();
  assert.equal(ui.isEnabled(),false);assert.match(messages.at(-1),/Unable to confirm/);
  fail=false;values.set('v43_login_role','Teacher');const count=requests.length;
  ui.openToggleConfirm(true);await ui.confirmToggle();assert.equal(requests.length,count,'Teacher cannot submit consent');
  values.set('v43_login_role','Headteacher');
  await ui.runSync();assert.equal(ui.isEnabled(),false,'manual synchronization rechecks OFF');
  console.log('PASS actual EMS_SYNC UI: untrusted local ON, verified enable/disable, offline failure, Teacher denial, manual recheck');
})().catch(error=>{console.error(error);process.exitCode=1;});
