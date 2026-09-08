'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const sidebarPath = path.join(__dirname, '..', 'school-sidebar.js');
const roles = [
  { name: 'Headteacher', admin: true },
  { name: 'Assistant Headteacher', admin: true },
  { name: 'Classroom Teacher', admin: false },
  { name: 'School Proprietor', admin: true }
];

const routeTargets = [
  'dashboard','setup','subjects','schoolreport','annualreport','teachers','teachersetup','termconfig',
  'tattendreport','tattendanalytics','tattendnotif','teachalert5','teachalertmonth','integrity','sync',
  'ges-assign-class','ges-assign-roles','ges-publish-results','ges-block-result','ges-publish-mock-results',
  'ges-block-mock-result','gnsis-admission','entry','multientry','mock','pupils','pupilsetup','smslogs',
  'pupilreport','pa-audittrail','pa-reporting','pa-automation','htcritical','lms-teacher','students','slip',
  'mockresult','mockanalysis','broadsheet','rankings','analytics','indexgen','ent-ai','ent-workflow','ent-bi',
  'ent-health','ent-library','ent-timetable','ent-procurement','ent-guidance','ges-school',
  'transport-management','hostel-management','qr-attendance','user-guide','copyright','acknowledgement','about'
];

function fixture() {
  const pages = routeTargets.map((id) => `<section id="page-${id}" class="hidden"></section>`).join('');
  return `<!doctype html><html><head><style>
    .sidebar{height:100vh;overflow-y:auto}.sidebar-scroll{height:100%;overflow-y:auto}
    .nav-supergroup-items,.nav-group-items{display:none}.open>.nav-supergroup-items,.open>.nav-group-items{display:block}
    [hidden]{display:none!important}.hidden{display:none}.nav-item.active{background:#def}
  </style></head><body><nav class="sidebar" id="sidebar"><div id="sidebarPagerBar"><button>Back</button><button>Next</button></div><div id="sidebarScroll">
    <div class="nav-supergroup open" id="sg-school-level" data-admin-level="SCHOOL"><button class="nav-supergroup-header"></button><div class="nav-supergroup-items"></div></div>
    <div class="nav-supergroup" data-admin-level="DISTRICT"></div><div class="nav-supergroup" data-admin-level="REGIONAL"></div><div class="nav-supergroup" data-admin-level="NATIONAL"></div>
  </div></nav><main>${pages}</main><script>
    window.CONFIG={schoolType:'PRIVATE'};window.showPage=function(id,el){window.__lastTarget='page:'+id;document.querySelectorAll('[id^=page-]').forEach(n=>n.classList.add('hidden'));var p=document.getElementById('page-'+id);if(p)p.classList.remove('hidden');document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));if(el)el.classList.add('active')};
    window.fmsShowPage=function(id){window.__lastTarget='fms:'+id};window.emsDoLogout=function(){window.__lastTarget='session:logout'};window.EMS_SLD={openSection:function(id){window.__lastTarget='section:'+id}};window.EMS_I18N={openSwitcher:function(){window.__lastTarget='api:EMS_I18N.openSwitcher'}};window.EMS_GNSIS_LIFE={open:function(id){window.__lastTarget='workflow:'+id}};window.EDUTRACK_STAFF_MANAGEMENT_PART3={open:function(){window.__lastTarget='api:EDUTRACK_STAFF_MANAGEMENT_PART3.open'}};
    ['GES_TEACHER_ASSIGN_UI','GES_ROLE_ASSIGN_UI','GES_RESULT_PUBLISH_UI','GES_RESULT_BLOCK_UI','GES_MOCK_RESULT_PUBLISH_UI','GES_MOCK_RESULT_BLOCK_UI'].forEach(n=>window[n]={render:function(){}});
    ['EDUTRACK_ONLINE_ADMISSIONS','EDUTRACK_COMMUNICATION_HUB','EDUTRACK_CHAT','EDUTRACK_CONTROL_PANEL','EDUTRACK_QUIZ_MODULE','EDUTRACK_ADMISSIONS_REVIEW'].forEach(n=>window[n]={open:function(){window.__lastTarget='api:'+n+'.open'}});
  </script></body></html>`;
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.EDUTRACK_BROWSER_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      for (const role of roles) {
        const page = await browser.newPage({ viewport });
        await page.route('http://sidebar.test/', route => route.fulfill({ contentType: 'text/html', body: fixture() }));
        await page.goto('http://sidebar.test/');
        await page.evaluate((name) => { localStorage.setItem('v43_login_level','SCHOOL'); localStorage.setItem('v43_login_role',name); }, role.name);
        await page.addScriptTag({ path: sidebarPath });
        await page.evaluate(() => { EDUTRACK_SCHOOL_SIDEBAR.build(); EDUTRACK_SCHOOL_SIDEBAR.activateScope(document.getElementById('sg-school-level')); });
        const state = await page.evaluate(() => ({
          visible: Array.from(document.querySelectorAll('#sg-school-level .school-nav-item,#sg-school-level .school-nav-group')).filter(n => getComputedStyle(n).display !== 'none').length,
          upperVisible: Array.from(document.querySelectorAll('[data-admin-level]:not([data-admin-level=SCHOOL])')).filter(n => getComputedStyle(n).display !== 'none').length,
          pager: getComputedStyle(document.getElementById('sidebarPagerBar')).display,
          overflow: getComputedStyle(document.getElementById('sidebarScroll')).overflowY,
          headteacherHidden: document.getElementById('ng-cat-headteacher').hidden,
          labels: Array.from(document.querySelectorAll('#sg-school-level .nav-label')).map(n => n.textContent.trim())
        }));
        assert.ok(state.visible > 10, `${role.name} must receive a populated menu`);
        assert.equal(state.upperVisible, 0, `${role.name} must not see upper-level navigation`);
        assert.equal(state.pager, 'none', `${role.name} must not be stranded on an empty paginated page`);
        assert.ok(['auto','scroll'].includes(state.overflow), `${role.name} sidebar must scroll`);
        assert.equal(state.headteacherHidden, !role.admin, `${role.name} RBAC mismatch`);
        assert.deepEqual(state.labels.slice(0, 6), ['Dashboard','Switch Language','Setup / Config','Headteacher','Subject Config','Reports']);
        await page.locator('[data-school-nav="Dashboard"]').evaluate(n => n.click());
        assert.equal(await page.locator('#page-dashboard').evaluate(n => n.classList.contains('hidden')), false);
        await page.locator('[data-school-nav="Student Database"]').evaluate(n => n.click());
        assert.equal(await page.locator('#page-students').evaluate(n => n.classList.contains('hidden')), false);
        await page.evaluate(() => EDUTRACK_SCHOOL_SIDEBAR.toggle('ng-cat-shared'));
        assert.equal(await page.locator('#ng-cat-shared').evaluate(n => n.classList.contains('open')), true);
        for (const id of await page.locator('#sg-school-level [onclick*="showPage("]').evaluateAll(nodes => nodes.map(n => (n.getAttribute('onclick').match(/showPage\('([^']+)'/)||[])[1]).filter(Boolean))) {
          assert.equal(await page.locator('#page-'+id).count(), 1, `${role.name}: unresolved route ${id}`);
        }
        if (role.name === 'Headteacher') {
          const targets = await page.locator('#sg-school-level .school-nav-item').evaluateAll(nodes => nodes.map(n => n.dataset.schoolTarget));
          assert.ok(targets.length >= 75, `complete menu expected, received ${targets.length} leaves`);
          assert.equal(targets.some(target => !target || /login|gallery|placeholder|comingsoon/i.test(target)), false, 'invalid School navigation target');
          for (let index = 0; index < targets.length; index++) {
            const result = await page.locator('#sg-school-level .school-nav-item').nth(index).evaluate(node => { window.__lastTarget=''; node.click(); return { expected:node.dataset.schoolTarget, actual:window.__lastTarget }; });
            assert.equal(result.actual, result.expected, `leaf did not open exact target: ${JSON.stringify(result)}`);
          }
        }
        await page.close();
      }
    }
    console.log('School sidebar role, pagination, hierarchy, route, desktop and mobile regression suite passed.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
