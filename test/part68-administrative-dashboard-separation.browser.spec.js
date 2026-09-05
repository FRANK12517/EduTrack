'use strict';

const assert = require('assert');
const path = require('path');
const { chromium } = require('playwright');

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.EDUTRACK_BROWSER_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  try{
    for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
      const page=await browser.newPage({viewport,hasTouch:viewport.width<600,isMobile:viewport.width<600});
      await page.route('http://edutrack.test/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="login-screen"></div><div class="topbar"></div><div class="shell"><aside id="sidebarScroll"><div class="nav-group">District Level Officers</div><div class="nav-item">School Dashboard</div></aside></div></body></html>'}));
      await page.goto('http://edutrack.test/');
      await page.addScriptTag({path:path.join(__dirname,'..','admin-dashboard-separation.js')});
      for(const data of [{level:'DISTRICT',role:'District Examination Officer'},{level:'REGIONAL',role:'Regional ICT Coordinator'},{level:'NATIONAL',role:'National Accountant'}]){
        await page.evaluate(data=>window.EDUTRACK_ADMIN_DASHBOARDS.render(data.level,data.role,'Greater Accra','Accra Metro'),data);
        const shell=page.locator('#admin-level-shell');
        await shell.waitFor({state:'visible'});
        assert.equal(await shell.getAttribute('data-administrative-level'),data.level);
        assert.match(await shell.locator('.als-context').textContent(),new RegExp(data.level+' GENERAL DASHBOARD'));
        assert.equal(await page.locator('.shell').isVisible(),false,'school shell is not used by '+data.level);
      }
      if(viewport.width<600){assert.equal(await page.locator('.als-menu').isVisible(),true);const size=await page.locator('.als-menu').boundingBox();assert.ok(size.width>=44&&size.height>=44);}
      await page.evaluate(()=>{localStorage.setItem('v43_login_level','SCHOOL');window.EDUTRACK_ADMIN_DASHBOARDS.restoreSchool();});
      assert.equal(await page.locator('.shell').isVisible(),true);
      assert.equal(await page.getByText('District Level Officers',{exact:true}).count(),0,'upper-level entry removed from school sidebar DOM');
      await page.close();
    }
    console.log('PASS part68 desktop and mobile administrative dashboard separation');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
