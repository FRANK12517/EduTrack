'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const sidebarPath = path.join(__dirname, '..', 'school-sidebar.js');
const guidePath = path.join(__dirname, '..', 'school-user-guide.js');
const fixture = `<!doctype html><html><body><nav id="sidebar"><div id="sidebarPagerBar"></div><div id="sidebarScroll"></div></nav><main><section id="page-dashboard"></section><section id="page-setup"></section><section id="page-gnsis-admission"></section></main><script>window.CONFIG={schoolType:'PRIVATE'};window.showPage=function(){};window.emsDoLogout=function(){};window.EMS_I18N={openSwitcher:function(){}};window.EMS_GNSIS_LIFE={open:function(){}};</script></body></html>`;

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.EDUTRACK_BROWSER_PATH||(process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':'/usr/bin/chromium')});
  try {
    for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
      const page=await browser.newPage({viewport});
      await page.route('http://guide.test/',route=>route.fulfill({contentType:'text/html',body:fixture}));
      await page.goto('http://guide.test/');
      await page.evaluate(()=>{localStorage.setItem('v43_login_level','SCHOOL');localStorage.setItem('v43_login_role','Classroom Teacher');localStorage.setItem('edutrack_school_guide_tour_completed_v1','true')});
      await page.addScriptTag({path:sidebarPath}); await page.evaluate(()=>EDUTRACK_SCHOOL_SIDEBAR.refresh()); await page.addScriptTag({path:guidePath});
      await page.locator('[data-school-nav="User Guide"]').click();
      await page.locator('#edutrack-school-guide-overlay').waitFor();
      assert.match(await page.locator('.esg-dialog').innerText(),/integrated school management/i);
      assert.equal(await page.locator('.esg-dialog').innerText().then(t=>/School-level user management cannot grant District, Regional or National access/i.test(t)),false);
      await page.locator('.esg-search').fill('PGSID');
      assert.match(await page.locator('[data-guide-results]').innerText(),/Student Admission & Transfer Management/);
      await page.locator('.esg-search').fill('Record Payment');
      assert.match(await page.locator('[data-guide-results]').innerText(),/never record money against the wrong student/i);
      await page.locator('.esg-search').fill('5-Day / SISO');
      assert.match(await page.locator('[data-guide-results]').innerText(),/escalation logic/i);
      await page.locator('.esg-search').fill('User Accounts & Access Control');
      assert.equal(await page.locator('[data-guide-results] summary').allTextContents().then(items=>items.includes('User Accounts & Access Control')),false,'teacher guide must not expose hidden admin guidance');
      await page.locator('[data-guide-close]').first().click();
      await page.evaluate(()=>EDUTRACK_SCHOOL_GUIDE.restart());
      await page.locator('[data-tour-skip]').click();
      assert.equal(await page.locator('#edutrack-school-guide-overlay').count(),0);
      assert.equal(await page.locator('#sidebarPagerBar').evaluate(n=>getComputedStyle(n).display),'none');
      await page.close();
    }
    console.log('School-scoped searchable guide, tour controls, admission rename, and mobile safety passed.');
  } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
