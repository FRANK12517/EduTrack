'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
module.exports=async function districtBrowser(base,accessCode,matrix){
 const browser=await chromium.launch({headless:true,executablePath:process.env.EDUTRACK_BROWSER_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
 let pages=0,parents=0,children=0;
 try{
  for(const viewport of [{width:1280,height:900},{width:390,height:844}])for(const role of Object.keys(matrix)){
   const context=await browser.newContext({viewport});const page=await context.newPage();
   page.setDefaultTimeout(15000);
   const diagnostics=[];page.on('pageerror',e=>diagnostics.push(e.message));page.on('response',r=>{if(r.url().includes('/api/'))diagnostics.push([new URL(r.url()).pathname,r.status()])});
   await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
   try{
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.locator('.login-level-btn[data-level="DISTRICT"]').click();
    await page.locator('#v43-role option[value="'+role+'"]').waitFor({state:'attached'});
    await page.locator('#v43-region').selectOption('Central Region');await page.locator('#v43-district').selectOption('Cape Coast Metro');await page.locator('#v43-role').selectOption(role);
    await page.locator('#v43-staffId').fill('STAFF-officer-'+role);

    await page.locator('#v43-access-code').fill(accessCode);
    await page.locator('#v43LoginBtn').click();
    await page.locator('#district-general-dashboard').waitFor();
    await page.waitForFunction(()=>document.getElementById('district-content')?.textContent.includes('20/30'));
    assert.equal(await page.locator('#district-title').textContent(),'District General Dashboard');
    assert.equal(await page.locator('.shell').isVisible(),false);
    assert.ok(await page.locator('#district-general-dashboard').evaluate(n=>n.scrollWidth<=innerWidth+1),'responsive dashboard has no horizontal page overflow');
    if(role==='DISTRICT_DIRECTOR_OF_EDUCATION'){const fs=require('fs'),path=require('path');const dir=path.join(__dirname,'..','artifacts','district-part3-acceptance');fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,'overview-'+viewport.width+'.png')});}
    assert.deepEqual(await page.locator('#district-terminal a').allTextContents(),['About the Developer','Copyright','Acknowledgement','Logout']);
    assert.equal(await page.locator('#district-navigation').evaluate(n=>n.lastElementChild.id),'district-terminal');
    const summaries=page.locator('#district-navigation summary');
    if(viewport.width<760)await page.locator('#district-menu').click();
    for(let i=0;i<await summaries.count();i++){await summaries.nth(i).click();assert.equal(await summaries.nth(i).evaluate(n=>n.parentNode.open),false);await summaries.nth(i).click();parents++}
    const routes=await page.locator('#district-navigation a').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.route,label:n.textContent})));
    for(const route of routes.filter(r=>r.id!=='logout')){
     if(viewport.width<760 && !(await page.locator('#district-navigation').isVisible()))await page.locator('#district-menu').click();
     await page.locator('#district-navigation a[data-route="'+route.id+'"]').click();
     await page.waitForFunction(label=>document.getElementById('district-title')?.textContent===label,route.label);
     await page.waitForFunction(()=>!document.getElementById('district-content')?.textContent.startsWith('Loading authorized'));
     const text=await page.locator('#district-content').innerText();
     assert.ok(text.trim().length>10,role+' '+route.id+' has content');
     assert.doesNotMatch(text,/This District component is not authorized|did not initialize|could not be loaded|Internal server error|Coming Soon/i,role+' '+route.id);
     if(route.id.startsWith('sports/'))assert.equal(await page.locator('#dsc-tab-content').count(),1,'existing sports component');
     children++;
    }
    if(matrix[role].includes('district.reports.export')){
      await page.evaluate(()=>location.hash='#/district/export');await page.locator('#district-export').waitFor();
      const downloadEvent=page.waitForEvent('download');await page.locator('#district-export').click();const download=await downloadEvent;
      assert.equal(download.suggestedFilename(),'district-synchronized-schools.csv');
    }
    if(role==='DISTRICT_SPORTS_OFFICER'){
      await page.evaluate(()=>location.hash='#/district/sports/calendar');await page.locator('#dsc-cal-name').waitFor();
      await page.locator('#district-sports-school').selectOption('s1');
      const eventName='Browser sports '+viewport.width;
      await page.locator('#dsc-cal-name').fill(eventName);
      await page.locator('button[onclick="EMS_DSC.addCalendar()"]').click();
      await page.waitForFunction(()=>document.getElementById('district-sports-status')?.textContent==='Record saved to EduTrack.');
      await page.waitForFunction(name=>document.getElementById('dsc-tab-content')?.textContent.includes(name),eventName);
      const saved=await context.request.get(base+'/api/control-panel/district?view=sports&districtId=d1');
      assert.ok((await saved.json()).records.some(r=>r.eventName===eventName&&r.schoolId==='s1'));
      for(const entry of [
       ['competitions','dsc-cmp-name','dsc-cmp-school','addCompetition','competitionName'],
       ['athletes','dsc-ath-name','dsc-ath-school','addAthlete','studentName'],
       ['coaches','dsc-cch-name','dsc-cch-school','addCoach','coachName'],
       ['equipment',null,'dsc-eqp-school','addEquipment',null],
       ['tournaments','dsc-trn-name',null,'addTournament','tournamentName']
      ]){
       await page.evaluate(tab=>location.hash='#/district/sports/'+tab,entry[0]);
       await page.locator('button[onclick="EMS_DSC.'+entry[3]+'()"]').waitFor();
       if(entry[1])await page.locator('#'+entry[1]).fill('Browser '+entry[0]+' '+viewport.width);
       if(entry[2])await page.locator('#'+entry[2]).selectOption('s1');else await page.locator('#district-sports-school').selectOption('s1');
       await page.locator('button[onclick="EMS_DSC.'+entry[3]+'()"]').click();
       await page.waitForFunction(()=>document.getElementById('district-sports-status')?.textContent==='Record saved to EduTrack.');
       const response=await context.request.get(base+'/api/control-panel/district?view=sports&districtId=d1');const records=(await response.json()).records;
       assert.ok(records.some(r=>r.type===entry[0]&&r.schoolId==='s1'&&(!entry[4]||r[entry[4]]==='Browser '+entry[0]+' '+viewport.width)),entry[0]+' is saved to canonical School ID');
      }
      await page.evaluate(()=>location.hash='#/district/sports/reports');await page.locator('#dsc-rep-dataset').waitFor();
      await page.locator('#dsc-rep-dataset').selectOption('Sports Calendar');
      await page.locator('button[onclick="EMS_DSC.fetchReportResult()"]').click();
      await page.waitForFunction(name=>document.getElementById('dsc-report-result')?.textContent.includes(name),eventName);
    }
    // Future functions can only enter above the permanent terminal section.
    await page.evaluate(()=>{window.EDUTRACK_ADMIN_DASHBOARDS.registerGroup({id:'test-extension',label:'Extension test',items:[{id:'test-extension',label:'Extension test',permission:'district.dashboard.view',render:function(host){host.textContent='Authorized extension component';}}]});});
    assert.equal(await page.locator('#district-navigation').evaluate(n=>n.lastElementChild.id),'district-terminal');
    assert.equal(await page.evaluate(()=>{try{window.EDUTRACK_ADMIN_DASHBOARDS.registerGroup({id:'bad',items:[{id:'logout',permission:'district.dashboard.view',render:function(){}}]});return false}catch(e){return true}}),true);
    await page.evaluate(()=>location.hash='#/district/test-extension');await page.waitForFunction(()=>document.getElementById('district-content')?.textContent==='Authorized extension component');
    await page.evaluate(()=>location.hash='#/district/school/s1');
    await page.waitForFunction(()=>document.getElementById('district-content')?.textContent.includes('School 1'));
    await page.evaluate(()=>location.hash='#/district/school/s2');
    await page.waitForFunction(()=>document.querySelector('#district-content [role="alert"]'));
    assert.doesNotMatch(await page.locator('#district-content').innerText(),/Pupil 2|PERMANENT-2/);
    await page.evaluate(()=>location.hash='#/district/school/coverage32');
    await page.waitForFunction(()=>document.querySelector('#district-content [role="alert"]'));
    assert.doesNotMatch(await page.locator('#district-content').innerText(),/Coverage School 32/);
    await page.evaluate(()=>location.hash='#/district/not-a-component');
    await page.waitForFunction(()=>document.querySelector('#district-content [role="alert"]'));
    if(viewport.width<760 && !(await page.locator('#district-navigation').isVisible()))await page.locator('#district-menu').click();
    await page.locator('#district-navigation a[data-route="logout"]').click();
    await page.locator('#district-logout').click();
    await page.locator('#login-screen').waitFor({state:'visible'});
    assert.equal(await page.locator('#district-general-dashboard').count(),0);
    assert.equal(await page.evaluate(()=>localStorage.getItem('v43_login_level')),null);
    assert.equal((await context.request.get(base+'/api/auth/session')).status(),401);
    assert.equal(await page.evaluate(()=>location.hash),'');
    await page.reload({waitUntil:'domcontentloaded'});
    assert.equal(await page.locator('#login-screen').isVisible(),true);
    pages++;
    console.log('PASS browser '+role+' '+viewport.width+'px: login, sidebar, drill-down attacks, logout');
   }catch(error){console.error('Browser diagnostics',diagnostics,await page.evaluate(()=>({active:document.querySelector('.login-level-btn.active')?.dataset.level,fields:Array.from(document.querySelectorAll('#v43DynamicFields input,#v43DynamicFields select')).map(n=>({id:n.id,filled:!!n.value})),button:document.getElementById('v43LoginBtn')?.outerHTML})));console.error('Browser failure',role,viewport.width,await page.locator('#v43LoginError').textContent().catch(()=>''));throw error}finally{await context.close()}
  }
 }finally{await browser.close()}
 console.log('PASS District browser acceptance: '+pages+' role/viewport sessions, '+parents+' sidebar parents, '+children+' sidebar children; real shell and HTTP/SQL fixture');
};
