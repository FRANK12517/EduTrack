'use strict';
const assert=require('node:assert/strict');const {chromium}=require('playwright');const fs=require('node:fs');const path=require('node:path');
module.exports=async function upperBrowser(base,accessCode,matrix){
 const browser=await chromium.launch({headless:true,executablePath:process.env.EDUTRACK_BROWSER_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});let sessions=0,parents=0,children=0;
 try{for(const viewport of [{width:1280,height:900},{width:390,height:844}])for(const [role,permissions] of Object.entries(matrix)){
  const level=role.startsWith('REGIONAL_')?'regional':'national',label=level==='regional'?'Regional':'National';const context=await browser.newContext({viewport});const page=await context.newPage();page.setDefaultTimeout(15000);
  await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  try{
   await page.goto(base,{waitUntil:'domcontentloaded'});if(role==='REGIONAL_DIRECTOR_OF_EDUCATION')await require('./hierarchical-login.browser-checks')(page);await page.locator('.login-level-btn[data-level="'+level.toUpperCase()+'"]').click();
   await page.locator('#v43-role option[value="'+role+'"]').waitFor({state:'attached'});if(level==='regional')await page.locator('#v43-region').selectOption('Central Region');await page.locator('#v43-role').selectOption(role);await page.locator('#v43-staffId').fill('STAFF-officer-'+role);
   await page.locator('#v43-access-code').fill(accessCode);await page.locator('#v43LoginBtn').click();
   await page.locator('#district-general-dashboard').waitFor();await page.waitForFunction(expected=>document.getElementById('district-content')?.textContent.includes(expected),level==='regional'?'20/30':'21/31');
   assert.equal(await page.locator('#district-title').textContent(),label+' General Dashboard');assert.equal(await page.locator('.shell').isVisible(),false);assert.equal(await page.locator('#district-general-dashboard').count(),1);
   assert.ok(await page.locator('#district-general-dashboard').evaluate(n=>n.scrollWidth<=innerWidth+1),'no horizontal page overflow');
   if(role.endsWith('DIRECTOR_OF_EDUCATION')){const dir=path.join(__dirname,'..','artifacts','macro-part4-acceptance');fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,level+'-'+viewport.width+'.png')});}
   assert.deepEqual(await page.locator('#district-terminal a').allTextContents(),['About the Developer','Copyright','Acknowledgement','Logout']);assert.equal(await page.locator('#district-navigation').evaluate(n=>n.lastElementChild.id),'district-terminal');
   if(viewport.width<760)await page.locator('#district-menu').click();const summaries=page.locator('#district-navigation summary');for(let i=0;i<await summaries.count();i++){await summaries.nth(i).click();assert.equal(await summaries.nth(i).evaluate(n=>n.parentNode.open),false);await summaries.nth(i).click();parents++}
   const routes=await page.locator('#district-navigation a').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.route,label:n.textContent})));
   for(const route of routes.filter(r=>r.id!=='logout')){
    if(viewport.width<760&&!await page.locator('#district-navigation').isVisible())await page.locator('#district-menu').click();
    await page.locator('#district-navigation a[data-route="'+route.id+'"]').click();await page.waitForFunction(label=>document.getElementById('district-title')?.textContent===label,route.label);await page.waitForFunction(()=>!document.getElementById('district-content')?.textContent.startsWith('Loading authorized'));
    const text=await page.locator('#district-content').innerText();assert.ok(text.trim().length>10);assert.doesNotMatch(text,/not authorized|Domain operation failed|Coming Soon|PRIVATE ATHLETE|PRIVATE PHONE|Pupil 1|PERMANENT-1/);children++;
   }
   // Exercise the actual hierarchy links, retaining each parent ID in subsequent requests.
   await page.evaluate(level=>location.hash='#/'+level+'/overview',level);
   if(level==='national'){await page.locator('#district-content a[href="#/national/region/r1"]').click();await page.waitForFunction(()=>document.getElementById('district-title')?.textContent==='Region');}
   const districtPath=level==='national'?'region/r1/district/d1':'district/d1';
   await page.locator('#district-content a[href="#/'+level+'/'+districtPath+'"]').click();await page.waitForFunction(()=>document.getElementById('district-title')?.textContent==='District');
   await page.locator('#district-content a[href="#/'+level+'/'+districtPath+'/school/s1"]').click();await page.waitForFunction(()=>document.getElementById('district-title')?.textContent==='Synchronized School');await page.waitForFunction(()=>document.getElementById('district-content')?.textContent.includes('School 1'));
   for(const attack of [level==='regional'?'district/d2/school/s2':'region/r3/district/d3/school/s3',level==='regional'?'district/d1b/school/s1':'region/r1/district/d2/school/s2',districtPath+'/school/coverage32','school/%ZZ','not-a-component']){
    await page.evaluate(args=>location.hash='#/'+args[0]+'/'+args[1],[level,attack]);await page.waitForFunction(()=>document.querySelector('#district-content [role="alert"]'));assert.doesNotMatch(await page.locator('#district-content').innerText(),/PRIVATE ATHLETE|PRIVATE PHONE|Pupil/);
   }
   for(const view of ['attendance','examinations','sports'])if(!permissions.includes(level+'.'+view+'.read')){await page.evaluate(args=>location.hash='#/'+args[0]+'/'+args[1],[level,view]);await page.waitForFunction(()=>document.querySelector('#district-content [role="alert"]'));}
   if(permissions.includes(level+'.reports.export')){await page.evaluate(level=>location.hash='#/'+level+'/export',level);await page.locator('#district-export').waitFor();const download=page.waitForEvent('download');await page.locator('#district-export').click();assert.equal((await download).suggestedFilename(),level+'-synchronized-schools.csv');}
   await page.evaluate(permission=>window.EDUTRACK_ADMIN_DASHBOARDS.registerGroup({id:'test-extension',label:'Extension',items:[{id:'test-extension',label:'Extension',permission,render:function(host){host.textContent='Verified extension component';}}]}),level+'.dashboard.view');assert.equal(await page.locator('#district-navigation').evaluate(n=>n.lastElementChild.id),'district-terminal');
   assert.equal(await page.evaluate(()=>{try{window.EDUTRACK_ADMIN_DASHBOARDS.registerGroup({id:'bad',items:[{id:'logout',permission:'national.dashboard.view',render:function(){}}]});return false}catch(e){return true}}),true);
   await page.evaluate(level=>location.hash='#/'+level+'/test-extension',level);await page.waitForFunction(()=>document.getElementById('district-content')?.textContent==='Verified extension component');
   if(viewport.width<760&&!await page.locator('#district-navigation').isVisible())await page.locator('#district-menu').click();await page.locator('#district-navigation a[data-route="logout"]').click();await page.locator('#district-logout').click();await page.locator('#login-screen').waitFor({state:'visible'});
   assert.equal(await page.locator('#district-general-dashboard').count(),0);assert.equal(await page.evaluate(()=>localStorage.getItem('v43_login_level')),null);assert.equal((await context.request.get(base+'/api/auth/session')).status(),401);assert.equal(await page.evaluate(()=>location.hash),'');await page.reload({waitUntil:'domcontentloaded'});assert.equal(await page.locator('#login-screen').isVisible(),true);
   sessions++;console.log('PASS browser '+role+' '+viewport.width+'px: first dashboard, every sidebar route, hierarchy links/attacks, privacy, terminal extensions, logout');
  }catch(error){console.error('Upper browser failure',role,viewport.width,await page.locator('#v43LoginError').textContent().catch(()=>''));throw error}finally{await context.close()}
 }}finally{await browser.close()}
 console.log('PASS Part 4 browser: '+sessions+' role/viewport sessions, '+parents+' sidebar parents, '+children+' content children and '+sessions+' logout flows');
};
