'use strict';
const assert=require('node:assert/strict');
const hierarchy=require('../ghana-hierarchy');
module.exports=async function(page){
  // Hold the first public role response while switching levels; the stale National response must not fill the District form.
  let heldRoleRoute, releaseRoleRequest;
  const capturedRoleRequest = new Promise(resolve => { releaseRoleRequest = resolve; });
  const holdFirstRoleResponse = route => { if (!heldRoleRoute) { heldRoleRoute = route; releaseRoleRequest(); return; } return route.continue(); };
  await page.route('**/api/auth/login-options', holdFirstRoleResponse);
  await page.locator('.login-level-btn[data-level="NATIONAL"]').click();
  await capturedRoleRequest;
  await page.locator('.login-level-btn[data-level="DISTRICT"]').click();
  await page.locator('#v43-region').waitFor({state:'attached'});
  await heldRoleRoute.continue();
  await page.waitForFunction(() => { const role=document.getElementById('v43-role'); return role && !role.disabled && Array.from(role.options).filter(option=>option.value).length===5 && Array.from(role.options).filter(option=>option.value).every(option=>option.value.startsWith('DISTRICT_')); });
  await page.unroute('**/api/auth/login-options', holdFirstRoleResponse);
  assert.equal(await page.locator('#v43-role').inputValue(),'','an older National request cannot select a District role');
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
   for(const region of hierarchy.regions){if(level==='DISTRICT')await page.locator('#v43-role').selectOption('DISTRICT_ADMIN');await page.locator('#v43-region').selectOption(region);assert.equal(await page.locator('#v43-district').inputValue(),'');if(level==='DISTRICT')assert.equal(await page.locator('#v43-role').inputValue(),'','changing region clears the selected role');const districts=hierarchy.districtsFor(region);assert.deepEqual(await page.locator('#v43-district option').evaluateAll(nodes=>nodes.slice(1).map(n=>n.value)),districts);await page.locator('#v43-district').selectOption(districts[0]);if(level==='DISTRICT'&&districts.length>1){await page.locator('#v43-role').selectOption('DISTRICT_ADMIN');await page.locator('#v43-district').selectOption(districts[1]);assert.equal(await page.locator('#v43-role').inputValue(),'','changing district clears the selected role');await page.locator('#v43-district').selectOption(districts[0]);}}
   await page.locator('#v43-region').selectOption('');assert.equal(await page.locator('#v43-district').isDisabled(),true);assert.equal(await page.locator('#v43-district').inputValue(),'');
  }
 }
   await page.reload({waitUntil:'domcontentloaded'});
  let roleAttempts=0;
  const incompleteThenValid=route=>{roleAttempts++;if(roleAttempts===1)return route.fulfill({status:200,contentType:'application/json',body:'{"roles":{}}'});return route.continue()};
  await page.route('**/api/auth/login-options',incompleteThenValid);
  await page.locator('.login-level-btn[data-level="NATIONAL"]').click();
  await page.waitForFunction(()=>{const role=document.getElementById('v43-role'),error=document.getElementById('v43LoginError');return role&&role.disabled&&error&&error.style.display==='block'});
  assert.equal(await page.locator('#v43-role option').count(),1,'an empty response is not shown as a valid empty role list');
  await page.locator('.login-level-btn[data-level="NATIONAL"]').click();
  await page.waitForFunction(()=>{const role=document.getElementById('v43-role');return role&&!role.disabled&&role.options.length===6});
  assert.equal(roleAttempts,2,'retry requests fresh role metadata after an incomplete response');
  await page.unroute('**/api/auth/login-options',incompleteThenValid);
  assert.equal(await page.locator('#v43LoginError').isVisible(),false,'successful retry clears the role error');
console.log('PASS browser field matrix: four levels, canonical roles, all 16 region cascades, reset, disabled district and level reselection');
};
