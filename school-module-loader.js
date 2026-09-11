(function () {
  'use strict';
  if (window.EDUTRACK_SCHOOL_MODULES) return;

  var activatedGroups = new Set();
  var activatingGroups = new Map();
  var registry = {
    CORE_LOGIN: [],
    SCHOOL_GENERAL: ['/school-sidebar.js?v=20260911-school-general'],
    SCHOOL_ADMIN: [], SCHOOL_ACADEMICS: [], SCHOOL_ATTENDANCE: [], SCHOOL_RESULTS: [],
    SCHOOL_ADMISSIONS: ['/online-admission.js', '/admissions-review.js'], SCHOOL_FINANCE: [],
    SCHOOL_STAFF: [], SCHOOL_STUDENTS: [], SCHOOL_TRANSPORT: ['/transport-management.js'],
    SCHOOL_HOSTEL: ['/hostel-management.js'], SCHOOL_COMMUNICATION: ['/communication-hub.js', '/chat-module.js'],
    SCHOOL_OPERATIONS: ['/control-panel.js'], SCHOOL_REPORTS: ['/analytics-narrative.js'],
    SCHOOL_ENTERPRISE: ['/quiz-module.js'], SCHOOL_SYSTEM: ['/qr-attendance.js']
  };
  var routeGroups = {
    dashboard:'SCHOOL_GENERAL', setup:'SCHOOL_ADMIN', subjects:'SCHOOL_ACADEMICS', schoolreport:'SCHOOL_REPORTS', annualreport:'SCHOOL_REPORTS',
    teachers:'SCHOOL_ATTENDANCE', teachersetup:'SCHOOL_STAFF', termconfig:'SCHOOL_ACADEMICS', tattendreport:'SCHOOL_ATTENDANCE', tattendanalytics:'SCHOOL_ATTENDANCE', tattendnotif:'SCHOOL_ATTENDANCE', teachalert5:'SCHOOL_ATTENDANCE', teachalertmonth:'SCHOOL_ATTENDANCE',
    'gnsis-admission':'SCHOOL_ADMISSIONS', pupils:'SCHOOL_ATTENDANCE', pupilsetup:'SCHOOL_STUDENTS', smslogs:'SCHOOL_STUDENTS', pupilreport:'SCHOOL_STUDENTS', 'pa-audittrail':'SCHOOL_ATTENDANCE', 'pa-reporting':'SCHOOL_ATTENDANCE', 'pa-automation':'SCHOOL_ATTENDANCE', htcritical:'SCHOOL_ATTENDANCE',
    entry:'SCHOOL_RESULTS', multientry:'SCHOOL_RESULTS', mock:'SCHOOL_RESULTS', students:'SCHOOL_STUDENTS', slip:'SCHOOL_RESULTS', mockresult:'SCHOOL_RESULTS', mockanalysis:'SCHOOL_RESULTS', broadsheet:'SCHOOL_RESULTS', rankings:'SCHOOL_RESULTS', analytics:'SCHOOL_RESULTS',
    'transport-management':'SCHOOL_TRANSPORT', 'hostel-management':'SCHOOL_HOSTEL', 'qr-attendance':'SCHOOL_SYSTEM', 'ges-school':'SCHOOL_REPORTS', integrity:'SCHOOL_SYSTEM', sync:'SCHOOL_SYSTEM'
  };

  function loadScript(src, marker) {
    var present = document.querySelector('script[data-edutrack-module="' + marker + '"]');
    if (present && present.dataset.loaded === 'true') return Promise.resolve();
    if (present) return new Promise(function (resolve, reject) {
      present.addEventListener('load', resolve, { once: true });
      present.addEventListener('error', reject, { once: true });
    });
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src; script.defer = true; script.dataset.edutrackModule = marker;
      script.onload = function () { script.dataset.loaded = 'true'; resolve(); };
      script.onerror = function () { reject(new Error('School module unavailable')); };
      document.head.appendChild(script);
    });
  }

  function dashboardVisible() {
    var dashboard = document.getElementById('page-dashboard');
    return Boolean(dashboard && !dashboard.classList.contains('hidden') && getComputedStyle(dashboard).display !== 'none');
  }

  async function activateSchoolGeneral(context) {
    var startedAt = performance.now();
    await loadScript(registry.SCHOOL_GENERAL[0], 'school-general-sidebar');
    var sidebar = window.EDUTRACK_SCHOOL_SIDEBAR;
    if (!sidebar || typeof sidebar.refresh !== 'function') throw new Error('School sidebar unavailable');
    var dashboard = document.getElementById('page-dashboard');
    if (!dashboard) throw new Error('School dashboard unavailable');
    dashboard.classList.remove('hidden');
    dashboard.dataset.schoolDashboardOpen = 'true';
    if (!sidebar.refresh()) throw new Error('School sidebar could not be rendered');
    var root = document.getElementById('sg-school-level');
    var scroll = document.getElementById('sidebarScroll');
    if (!dashboardVisible() || !root || !scroll || !root.querySelector('.school-nav-item')) throw new Error('School General dashboard is incomplete');
    document.documentElement.dataset.schoolGeneralReady = 'true';
    window.dispatchEvent(new CustomEvent('edutrack:school-general-ready', { detail: { context: context, durationMs: Math.round(performance.now() - startedAt) } }));
  }

  function groupFor(target) {
    if (target.indexOf('fms:') === 0) return 'SCHOOL_FINANCE';
    if (target.indexOf('section:') === 0) return 'SCHOOL_OPERATIONS';
    if (/ONLINE_ADMISSIONS|ADMISSIONS_REVIEW|gnsis/.test(target)) return 'SCHOOL_ADMISSIONS';
    if (/COMMUNICATION|CHAT/.test(target)) return 'SCHOOL_COMMUNICATION';
    if (/STAFF_MANAGEMENT|ASSIGN|ROLE_ASSIGN/.test(target)) return 'SCHOOL_STAFF';
    if (/PUBLISH|BLOCK|RESULT/.test(target)) return 'SCHOOL_RESULTS';
    if (/ent-|ENTERPRISE|QUIZ/.test(target)) return 'SCHOOL_ENTERPRISE';
    return routeGroups[target.replace(/^page:/, '')] || 'SCHOOL_SYSTEM';
  }
  function activateMatchingLegacyScripts(target) {
    var key = target.replace(/^page:/, '');
    var nodes = Array.prototype.slice.call(document.querySelectorAll('script[data-edutrack-lazy="true"]'));
    var matching = nodes.filter(function (node) { return node.textContent.indexOf('page-' + key) >= 0 || node.textContent.indexOf("'" + key + "'") >= 0; });
    return matching.reduce(function (chain, node) { return chain.then(function () {
      var script = document.createElement('script');
      Array.prototype.forEach.call(node.attributes, function (attribute) { if (attribute.name !== 'type' && attribute.name !== 'data-edutrack-lazy') script.setAttribute(attribute.name, attribute.value); });
      script.text = node.textContent; node.parentNode.replaceChild(script, node);
    }); }, Promise.resolve());
  }
  function runAction(action, node) { if (!action) return; Function(action).call(node); }
  function route(node) {
    if (!node || node.dataset.routing === 'true') return false;
    node.dataset.routing = 'true';
    var target = node.dataset.schoolTarget || '';
    var group = groupFor(target);
    activate(group).then(function () { return activateMatchingLegacyScripts(target); }).then(function () { runAction(node.dataset.schoolAction, node); }).catch(function () {
      var error = document.getElementById('v43LoginError'); if (error) { error.textContent = 'This School module could not be opened.'; error.style.display = 'block'; }
    }).finally(function () { delete node.dataset.routing; });
    return false;
  }

  function activate(name, context) {
    if (!Object.prototype.hasOwnProperty.call(registry, name)) return Promise.reject(new Error('Unknown School module group'));
    if (activatedGroups.has(name)) return Promise.resolve();
    if (activatingGroups.has(name)) return activatingGroups.get(name);
    var job = (name === 'SCHOOL_GENERAL' ? activateSchoolGeneral(context) : Promise.resolve()).then(function () {
      activatedGroups.add(name); activatingGroups.delete(name);
    }, function (error) { activatingGroups.delete(name); throw error; });
    activatingGroups.set(name, job);
    return job;
  }

  window.EDUTRACK_SCHOOL_MODULES = { activate: activate, route: route, groupFor: groupFor, activated: function (name) { return activatedGroups.has(name); }, registry: registry, routeGroups: routeGroups };
})();
