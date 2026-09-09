'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless:true, executablePath:process.env.EDUTRACK_BROWSER_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '/usr/bin/chromium') });
  try {
    for (const viewport of [{width:1280,height:900},{width:390,height:844}]) {
      const page = await browser.newPage({ viewport, hasTouch:viewport.width < 600, isMobile:viewport.width < 600 });
      await page.route('http://cards.test/', route => route.fulfill({ contentType:'text/html', body:`<!doctype html><html><head><style>.login-level-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:360px}.login-level-btn{min-height:48px}</style></head><body><div id="login-screen"><div class="login-level-grid">${[['NATIONAL',1,1],['PARENT',2,1],['DISTRICT',3,1],['REGIONAL',1,2],['SCHOOL',3,2]].map(([level,column,row])=>`<button class="login-level-btn" data-level="${level}" style="grid-column:${column};grid-row:${row}">${level}</button>`).join('')}</div></div><script>window.EMS_LMS={Student:{openModal:function(){window.__studentOpened=(window.__studentOpened||0)+1}}};</script></body></html>` }));
      await page.goto('http://cards.test/');
      await page.addScriptTag({ path:path.join(__dirname,'..','privileged-auth.js') });
      await page.locator('#sd-login-btn').waitFor();
      const state = await page.locator('.login-level-grid').evaluate(grid => {
        const boundary=grid.getBoundingClientRect(), cards=Array.from(grid.querySelectorAll('.login-level-btn')).map(node=>{const r=node.getBoundingClientRect();return{level:node.dataset.level,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}});
        return {boundary:{left:boundary.left,right:boundary.right},cards};
      });
      assert.deepEqual(state.cards.map(card=>card.level).sort(), ['DISTRICT','NATIONAL','PARENT','REGIONAL','SCHOOL','STUDENT']);
      assert.equal(state.cards.length, 6, 'exactly six cards render');
      for (const card of state.cards) assert.ok(card.width>=44&&card.height>=44&&card.left>=state.boundary.left-1&&card.right<=state.boundary.right+1, card.level+' is visible and accessible');
      for(let i=0;i<state.cards.length;i++)for(let j=i+1;j<state.cards.length;j++){const a=state.cards[i],b=state.cards[j];assert.equal(Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top),false,a.level+' overlaps '+b.level)}
      await page.locator('#sd-login-btn').click();
      assert.equal(await page.evaluate(()=>window.__studentOpened),1,'Student card opens the existing Student portal');
      await page.evaluate(()=>EDUTRACK_LOGIN_CARDS.refresh());
      assert.equal(await page.locator('.login-level-btn[data-level="STUDENT"]').count(),1,'refresh cannot duplicate Student card');
      await page.close();
    }
    console.log('Six-card Student restoration, exact count, portal click, and responsive layout passed.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
