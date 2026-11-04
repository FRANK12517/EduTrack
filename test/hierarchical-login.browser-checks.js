'use strict';
const assert=require('node:assert/strict');
const hierarchy=require('../ghana-hierarchy');
module.exports=async function(page){
 for(const level of ['SCHOOL','DISTRICT','REGIONAL','NATIONAL','SCHOOL']){
  await page.locator('.login-level-btn[data-level="'+level+'"]').click();
  await page.waitForFunction(level=>{const role=document.getElementById('v43-role');return role&&!role.disabled&&role.options.length===(level==='SCHOOL'?4:6)},level);
  const ids=await page.locator('#v43DynamicFields input,#v43DynamicFields select').evaluateAll(nodes=>nodes.map(n=>n.id));
  assert.deepEqual(ids,[...(level!=='NATIONAL'?['v43-region']:[]),...(['SCHOOL','DISTRICT'].includes(level)?['v43-district']:[]),'v43-role','v43-staffId',level==='SCHOOL'?'v43-school-access-code':'v43-access-code']);
  assert.equal(await page.locator('#district-password').count(),0);
  if(level==='SCHOOL')assert.deepEqual(await page.locator('#v43-role option').allTextContents(),['— Choose Role —','Headteacher','Assistant Headteacher','Classroom Teacher']);
  if(level!=='NATIONAL')assert.deepEqual(await page.locator('#v43-region option').evaluateAll(nodes=>nodes.slice(1).map(n=>n.value)),hierarchy.regions);
  if(['SCHOOL','DISTRICT'].includes(level)){
   assert.equal(await page.locator('#v43-district').isDisabled(),true);
   for(const region of hierarchy.regions){await page.locator('#v43-region').selectOption(region);assert.equal(await page.locator('#v43-district').inputValue(),'');assert.deepEqual(await page.locator('#v43-district option').evaluateAll(nodes=>nodes.slice(1).map(n=>n.value)),hierarchy.districtsFor(region));await page.locator('#v43-district').selectOption(hierarchy.districtsFor(region)[0]);}
   await page.locator('#v43-region').selectOption('');assert.equal(await page.locator('#v43-district').isDisabled(),true);assert.equal(await page.locator('#v43-district').inputValue(),'');
  }
 }
 console.log('PASS browser field matrix: four levels, canonical roles, all 16 region cascades, reset, disabled district and level reselection');
};
