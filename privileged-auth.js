(function () {
  'use strict';

  // This file is intentionally public. It contains no developer secret and never
  // decides whether a credential is privileged; the server does that exclusively.
  var API = '/api';
  var submitting = false;
  var DEV_MODE_KEY = 'edutrack_auth_mode';
  var DEV_FLAG_KEY = 'edutrack_is_developer';
  var DEV_SESSION_KEYS = [
    DEV_MODE_KEY,
    DEV_FLAG_KEY,
    'edutrack_developer_role',
    'edutrack_developer_level',
    'edutrack_developer_region',
    'edutrack_developer_district',
    'v43_login_level',
    'v43_login_role',
    'v43_login_staffid',
    'ems_login_role',
    'ems_login_region',
    'ems_login_district',
    'uld_active_level'
  ];

  function el(id) { return document.getElementById(id); }
  function value(id) {
    var node = el(id);
    return node && typeof node.value === 'string' ? node.value.trim() : '';
  }
  function activeLevel() {
    var card = document.querySelector('.login-level-btn.active');
    return card && card.dataset ? String(card.dataset.level || '').toUpperCase() : '';
  }
  function accessCode() {
    return value('v43-developer-access-code') || value('v43-access-code') || value('v43-school-access-code');
  }
  function showError(message) {
    var node = el('v43LoginError');
    if (node) {
      node.textContent = message || 'Authentication failed';
      node.classList.add('show');
      node.style.display = 'block';
    }
  }
  function request(path, options) {
    options = options || {};
    var timeoutMs = Number(options.timeoutMs || 8000);
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timeout = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;
    options.credentials = 'same-origin';
    options.headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    if (controller) options.signal = controller.signal;
    delete options.timeoutMs;
    return fetch(API + path, options).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) {
          var error = new Error(data.error || 'Request failed');
          error.status = response.status;
          error.data = data;
          throw error;
        }
        return data;
      });
    }).finally(function () { if (timeout) clearTimeout(timeout); });
  }
  function setDeveloperState(data) {
    var authorization = data && data.authorization || {};
    var user = data && data.user || {};
    try {
      localStorage.setItem(DEV_MODE_KEY, 'developer');
      localStorage.setItem(DEV_FLAG_KEY, 'true');
      localStorage.setItem('edutrack_developer_role', String(authorization.developerRole || user.developerRole || ''));
      localStorage.setItem('edutrack_developer_level', String(authorization.developerLevel || user.developerLevel || ''));
      localStorage.setItem('edutrack_developer_region', String(authorization.region || user.region || ''));
      localStorage.setItem('edutrack_developer_district', String(authorization.district || user.district || ''));
      localStorage.setItem('v43_login_level', String(authorization.developerLevel || user.developerLevel || '').toUpperCase());
      localStorage.setItem('v43_login_role', String(authorization.developerRole || user.developerRole || ''));
      localStorage.setItem('v43_login_staffid', String(user.developerStaffId || ''));
      localStorage.setItem('ems_login_role', String(authorization.dashboard || '').toLowerCase());
      if (authorization.region || user.region) localStorage.setItem('ems_login_region', String(authorization.region || user.region));
      if (authorization.district || user.district) localStorage.setItem('ems_login_district', String(authorization.district || user.district));
    } catch (error) {
      throw new Error('Unable to establish the authenticated session');
    }
    window.__EDUTRACK_DEVELOPER_SERVER_SESSION__ = true;
    window.__EDUTRACK_DEVELOPER_SESSION_PENDING__ = false;
  }
  function clearDeveloperState() {
    try { DEV_SESSION_KEYS.forEach(function (key) { localStorage.removeItem(key); }); } catch (error) {}
    window.__EDUTRACK_DEVELOPER_SERVER_SESSION__ = false;
    window.__EDUTRACK_DEVELOPER_SESSION_PENDING__ = false;
  }
  function hideLogin() {
    var login = el('login-screen');
    if (!login) return;
    login.classList.remove('show');
    login.classList.add('fade-out');
    setTimeout(function () { login.style.display = 'none'; }, 350);
  }
  function routeDeveloper(data) {
    var authorization = data && data.authorization || {};
    var level = String(authorization.developerLevel || '').toUpperCase();
    var role = String(authorization.developerRole || '');
    var region = String(authorization.region || '');
    var district = String(authorization.district || '');
    hideLogin();
    if (typeof window.emsRouteAfterLogin === 'function') {
      window.emsRouteAfterLogin(level, role, region, district);
    } else if (level === 'SCHOOL' && typeof window.showPageById === 'function') {
      window.showPageById('dashboard');
    }
  }
  function developerFields() {
    var level = activeLevel();
    return {
      staffId: value('v43-staffId'),
      accessCode: accessCode(),
      level: level,
      role: value('v43-role'),
      region: value('v43-region'),
      district: value('v43-district')
    };
  }
  function isDeveloperResponse(data) {
    var auth = data && data.authorization || {};
    return auth.authMode === 'developer' && auth.isDeveloper === true && !!auth.developerLevel;
  }
  function fallbackToExistingLogin() {
    submitting = false;
    window.__EDUTRACK_DEVELOPER_SESSION_PENDING__ = false;
    if (typeof window.v43DoLogin === 'function') window.v43DoLogin();
  }
  function tryDeveloperLogin(event) {
    var fields = developerFields();
    if (!fields.level || !fields.staffId || !fields.accessCode || !fields.role) return false;
    if (submitting) return true;
    submitting = true;
    window.__EDUTRACK_DEVELOPER_SESSION_PENDING__ = true;
    if (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    var button = el('v43LoginBtn');
    if (button) { button.disabled = true; button.textContent = 'Authenticating…'; }
    request('/auth/developer-login', { method: 'POST', body: JSON.stringify(fields), timeoutMs: 5000 }).then(function (data) {
      if (!isDeveloperResponse(data)) throw new Error('Authentication failed');
      setDeveloperState(data);
      routeDeveloper(data);
      submitting = false;
      if (button) { button.disabled = false; button.textContent = 'Enter System'; }
    }).catch(function (error) {
      clearDeveloperState();
      if (error && error.status === 401) {
        // A failed developer match is not a failed ordinary login. Preserve the
        // original role/staff validation and all of its existing UI behavior.
        fallbackToExistingLogin();
        return;
      }
      // If the optional backend is unavailable, preserve the existing offline
      // login flow. Server-side developer credentials never fall back locally.
      if (!error || !error.status || error.status >= 500 || error.name === 'AbortError') {
        fallbackToExistingLogin();
        return;
      }
      submitting = false;
      if (button) { button.disabled = false; button.textContent = 'Enter System'; }
      showError('Authentication failed');
    });
    return true;
  }
  function bind() {
    var button = el('v43LoginBtn');
    if (!button || button.dataset.developerAuthBound) return;
    button.dataset.developerAuthBound = 'true';
    button.addEventListener('click', function (event) { tryDeveloperLogin(event); }, true);
  }
  function restoreDeveloperSession() {
    var mode = '';
    try { mode = localStorage.getItem(DEV_MODE_KEY) || ''; } catch (error) {}
    if (mode !== 'developer') return;
    window.__EDUTRACK_DEVELOPER_SESSION_PENDING__ = true;
    request('/auth/session').then(function (data) {
      if (!isDeveloperResponse(data)) throw new Error('Not a developer session');
      setDeveloperState(data);
      routeDeveloper(data);
    }).catch(function () {
      clearDeveloperState();
      var login = el('login-screen');
      if (login) { login.style.display = 'flex'; login.classList.remove('fade-out'); }
    });
  }
  window.EDUTRACK_DEVELOPER_LOGOUT = function () {
    clearDeveloperState();
    return request('/auth/logout', { method: 'POST' }).catch(function () {});
  };
  window.EDUTRACK_DEVELOPER_AUTH = { clear: clearDeveloperState, login: tryDeveloperLogin };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { bind(); restoreDeveloperSession(); });
  } else {
    bind();
    restoreDeveloperSession();
  }
})();

// Load the administrative dashboard shell after the existing authentication
// bridge so login-card context and dashboard routing share one source of truth.
(function loadAdministrativeDashboardSeparation() {
  if (document.querySelector('script[src="/admin-dashboard-separation.js"]')) return;
  var script = document.createElement('script');
  script.src = '/admin-dashboard-separation.js';
  script.defer = true;
  document.head.appendChild(script);
})();

// Apply the final School-only navigation hierarchy after all feature modules
// have registered their existing pages and public entry points.
(function loadSchoolSidebar() {
  if (document.querySelector('script[src="/school-sidebar.js"]')) return;
  var script = document.createElement('script');
  script.src = '/school-sidebar.js';
  script.defer = true;
  document.head.appendChild(script);
})();
