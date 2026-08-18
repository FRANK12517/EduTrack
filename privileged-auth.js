(function () {
  'use strict';
  var API = '/api';
  var submitting = false;
  function el(id) { return document.getElementById(id); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function request(path, options) {
    options = options || {}; options.credentials = 'same-origin';
    options.headers = Object.assign({'Content-Type':'application/json'}, options.headers || {});
    return fetch(API + path, options).then(function (r) { return r.json().catch(function(){ return {}; }).then(function (data) { if (!r.ok) { var e = new Error(data.error || 'Request failed'); e.status = r.status; throw e; } return data; }); });
  }
  function showError(message) {
    var node = el('v43LoginError'); if (node) { node.textContent = message; node.style.display = 'block'; }
  }
  function installFields() {
    if (el('edutrack-secure-admin-fields')) return;
    var container = document.createElement('div'); container.id = 'edutrack-secure-admin-fields';
    container.innerHTML = '<div class="login-section-label" style="margin-top:.75rem">SECURE ACCOUNT SIGN-IN (OPTIONAL)</div>' +
      '<div class="login-group"><input id="edutrack-auth-email" type="email" autocomplete="username" placeholder="Account email"></div>' +
      '<div class="login-group"><input id="edutrack-auth-password" type="password" autocomplete="current-password" placeholder="Password"></div>' +
      '<div class="login-group"><input id="edutrack-auth-code" type="password" autocomplete="one-time-code" placeholder="Access code"></div>';
    var pin = el('v43-pin-section'); if (pin && pin.parentNode) pin.parentNode.insertBefore(container, pin);
    var style = document.createElement('style'); style.textContent = '#edutrack-secure-admin-fields .login-group{margin:.35rem 0}#edutrack-secure-admin-fields input{width:100%;box-sizing:border-box}@media(max-width:480px){#v43LoginBtn{min-height:48px;touch-action:manipulation;cursor:pointer}}'; document.head.appendChild(style);
  }
  function hideLogin() { var login = el('login-screen'); if (login) { login.classList.remove('show'); login.classList.add('fade-out'); setTimeout(function(){ login.style.display = 'none'; }, 350); } }
  function renderDashboard(data) {
    var auth = data.authorization || {}; var isDev = auth.role === 'DEVELOPER_ROOT';
    var root = el('edutrack-privileged-dashboard'); if (!root) { root = document.createElement('main'); root.id = 'edutrack-privileged-dashboard'; document.body.appendChild(root); }
    root.style.display = 'block'; root.style.position = 'fixed'; root.style.inset = '0'; root.style.zIndex = '100000'; root.style.overflow = 'auto'; root.innerHTML = '<section class="epd-shell"><header class="epd-header"><div><div class="epd-kicker">EDUTRACK ADMINISTRATION</div><h1>' + (isDev ? 'Developer Root Dashboard' : 'Super Administrator Dashboard') + '</h1><p>Authenticated server-side as <strong>' + esc(auth.role) + '</strong>.</p></div><button id="epd-logout" type="button">Log out</button></header><div class="epd-grid"><article><span>Registered Schools</span><strong id="epd-schools">0</strong></article><article><span>Registered Staff</span><strong id="epd-staff">0</strong></article><article><span>Students</span><strong id="epd-students">0</strong></article><article><span>Transactions</span><strong id="epd-transactions">0</strong></article></div><section class="epd-panel"><h2>Authorized administration</h2><div class="epd-actions">' + (isDev ? '<button data-level="NATIONAL">National administration</button><button data-level="REGIONAL">Regional administration</button><button data-level="DISTRICT">District administration</button><button data-level="SCHOOL">School administration</button>' : '<button data-action="users">User management</button><button data-action="schools">School management</button><button data-action="subscriptions">Subscription management</button><button data-action="reports">Reports</button>') + '</div><p class="epd-empty">The registered-data store is currently empty. Create the first real records through the existing administration workflows.</p></section></section>';
    var css = document.getElementById('epd-style'); if (!css) { css = document.createElement('style'); css.id = 'epd-style'; css.textContent = '#edutrack-privileged-dashboard{display:none;min-height:100vh;background:#f4f7fb;color:#102a43;font-family:inherit}.epd-shell{max-width:1180px;margin:0 auto;padding:clamp(1rem,3vw,2.5rem)}.epd-header{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;background:#0b3954;color:#fff;border-radius:20px;padding:clamp(1.25rem,3vw,2.25rem);box-shadow:0 14px 35px #0b395433}.epd-kicker{font-size:.72rem;letter-spacing:.14em;opacity:.75;font-weight:800}.epd-header h1{margin:.35rem 0;font-size:clamp(1.5rem,4vw,2.4rem)}.epd-header p{margin:0;opacity:.85}.epd-header button,.epd-actions button{border:0;border-radius:10px;padding:.75rem 1rem;font-weight:800;cursor:pointer;touch-action:manipulation}.epd-header button{background:#fff;color:#0b3954}.epd-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin:1.25rem 0}.epd-grid article,.epd-panel{background:#fff;border-radius:16px;padding:1.25rem;box-shadow:0 8px 24px #102a4312}.epd-grid span{display:block;color:#627d98;font-size:.85rem}.epd-grid strong{display:block;font-size:2rem;margin-top:.35rem}.epd-panel h2{margin-top:0}.epd-actions{display:flex;flex-wrap:wrap;gap:.75rem}.epd-actions button{background:#147d92;color:white}.epd-empty{margin:1.25rem 0 0;padding:1rem;border:1px dashed #9fb3c8;border-radius:10px;color:#486581;background:#f8fbff}@media(max-width:700px){.epd-header{flex-direction:column}.epd-header button{width:100%}.epd-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:390px){.epd-grid{grid-template-columns:1fr}.epd-actions button{width:100%}}'; document.head.appendChild(css); }
    request('/admin/summary').then(function (s) { ['schools','staff','students','transactions'].forEach(function (k) { var n = el('epd-' + k); if (n) n.textContent = String(s[k] || 0); }); }).catch(function () {});
    el('epd-logout').onclick = function () { request('/auth/logout', {method:'POST'}).finally(function(){ location.reload(); }); };
    root.querySelectorAll('[data-level]').forEach(function(btn){ btn.onclick = function(){ if (typeof emsShowUpperLevelDashboard === 'function') emsShowUpperLevelDashboard(btn.dataset.level, auth.role, '', ''); }; });
    root.querySelectorAll('[data-action]').forEach(function(btn){ btn.onclick = function(){ if (typeof subAdminOpen === 'function') subAdminOpen(); else alert('This administration module is available from the existing system navigation.'); }; });
  }
  function privilegedLogin() {
    var email = el('edutrack-auth-email'), password = el('edutrack-auth-password'), code = el('edutrack-auth-code');
    if (!email || !password || !code || !email.value.trim() || !password.value || !code.value) return false;
    if (submitting) return true; submitting = true;
    var btn = el('v43LoginBtn'); if (btn) { btn.disabled = true; btn.textContent = 'Authenticating…'; }
    request('/auth/login', {method:'POST', body:JSON.stringify({email:email.value.trim(), password:password.value, accessCode:code.value})}).then(function(data){
      var role = data.authorization && data.authorization.role;
      if (role !== 'DEVELOPER_ROOT' && role !== 'SUPER_ADMIN') throw new Error('This account is not a privileged administrator.');
      hideLogin(); renderDashboard(data);
    }).catch(function(err){ showError(err.status === 401 ? 'Authentication failed.' : (err.message || 'Authentication failed.')); if (btn) { btn.disabled = false; btn.textContent = '🔐 Enter System'; } submitting = false; });
    return true;
  }
  function bind() { installFields(); var btn = el('v43LoginBtn'); if (!btn || btn.dataset.secureBound) return; btn.dataset.secureBound = 'true'; btn.addEventListener('click', function (event) { if (privilegedLogin()) { event.preventDefault(); event.stopImmediatePropagation(); } }, true); ['edutrack-auth-email','edutrack-auth-password','edutrack-auth-code'].forEach(function(id){ var e=el(id); if(e) e.addEventListener('keydown', function(ev){ if(ev.key==='Enter' && privilegedLogin()) ev.preventDefault(); }); }); }
  function restore() { request('/auth/session').then(function(data){ if (data.authorization && ['DEVELOPER_ROOT','SUPER_ADMIN'].indexOf(data.authorization.role) >= 0) { hideLogin(); renderDashboard(data); } }).catch(function(){}); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ bind(); restore(); }); else { bind(); restore(); }
})();
