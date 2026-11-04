(function(){
  'use strict';
  if(window.EDUTRACK_SCHOOL_ROUTE_HISTORY)return;
  var applied='',pending=null;
  var BACKENDS={
    'page:dashboard':'dashboard','guide:school':'public','api:EMS_I18N.openSwitcher':'public',
    
    
    
    'api:EDUTRACK_ONLINE_ADMISSIONS.open':'public','api:EDUTRACK_ADMISSIONS_REVIEW.open':'/api/admissions/review',
    'page:transport-management':'/api/transport/overview','page:hostel-management':'/api/hostel/overview','page:qr-attendance':'/api/attendance/qr/scan',
    'api:EDUTRACK_CHAT.open':'/api/chat/contacts',
    
    
  };
  var entries=new Map();
  function context(){return window._v43SchoolLoginContext||{}}
  function role(){return String(context().user&&context().user.role||'').toUpperCase()}
  function scope(){return context().authorization&&context().authorization.loginScope||{}}
  function authorized(){return window.__EDUTRACK_SCHOOL_SESSION_AUTHORIZED__===true&&String(context().authorization&&context().authorization.administrativeLevel||'').toUpperCase()==='SCHOOL'&&scope().level==='SCHOOL'&&Boolean(scope().schoolId)&&scope().role===context().user.role&&['HEADTEACHER','ASSISTANT_HEADTEACHER','TEACHER'].includes(role())}
  function targetId(target){return String(target||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
  function routeFor(target){return '#/school/'+(target==='page:dashboard'?'dashboard':targetId(target))}
  function init(){
    var root=document.getElementById('sg-school-level');if(!root)return false;
    entries.clear();
    root.querySelectorAll('.school-nav-item').forEach(function(node){
      var target=node.dataset.schoolTarget||'',route=routeFor(target),id=targetId(target);
      node.dataset.schoolRoute=(target==='page:dashboard'?'dashboard':id);node.dataset.schoolCanonicalRoute=route;
      var backend=BACKENDS[target]||'';node.dataset.schoolBackend=backend?'verified':'unavailable';
      if(target&&target!=='session:logout')entries.set(node.dataset.schoolRoute,{node:node,target:target,route:route,backend:backend});
      if(!backend&&target!=='session:logout'){node.dataset.schoolBackendMissing='true';node.hidden=true}else delete node.dataset.schoolBackendMissing;
    });
    restore();return true;
  }
  function showState(message){var content=document.getElementById('page-content')||document.getElementById('page-dashboard');if(!content)return;var state=document.getElementById('school-route-state');if(!state){state=document.createElement('section');state.id='school-route-state';state.setAttribute('role','status');state.style.cssText='padding:1rem;margin:1rem;border:1px solid #d5e0e2;border-radius:10px;background:#fff';content.appendChild(state)}state.textContent=message;state.hidden=false;content.dataset.schoolRouteState='true';}
  function clearState(){var state=document.getElementById('school-route-state');if(state){state.hidden=true;state.textContent=''}var content=document.getElementById('page-content')||document.getElementById('page-dashboard');if(content)delete content.dataset.schoolRouteState;}
  function expired(){applied='';window.__EDUTRACK_SCHOOL_SESSION_AUTHORIZED__=false;window._v43SchoolLoginContext=null;if(window.EDUTRACK_SCHOOL_AUTH)window.EDUTRACK_SCHOOL_AUTH.clear();var login=document.getElementById('login-screen');var dashboard=document.getElementById('page-dashboard');if(dashboard){dashboard.classList.add('hidden');dashboard.dataset.schoolDashboardOpen='false'}if(login){login.style.display='flex';login.classList.remove('fade-out','show')}showState('Your School session has expired. Sign in again.')}
  function validate(){
    if(pending)return pending;
    pending=fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}}).then(function(response){if(!response.ok)throw Error('session');return response.json()}).then(function(data){var a=data&&data.authorization||{},s=a.loginScope||{},u=data&&data.user||{};if(!data.authenticated||a.administrativeLevel!=='SCHOOL'||s.level!=='SCHOOL'||!s.schoolId||s.role!==u.role||!Array.isArray(a.permissions)||!['HEADTEACHER','ASSISTANT_HEADTEACHER','TEACHER'].includes(String(u.role||'').toUpperCase()))throw Error('session');window._v43SchoolLoginContext={authenticated:true,user:u,authorization:a,school:{id:s.schoolId,region:s.region,district:s.district}};window.__EDUTRACK_SCHOOL_SESSION_AUTHORIZED__=true;if(window.EDUTRACK_SCHOOL_SIDEBAR)window.EDUTRACK_SCHOOL_SIDEBAR.refresh();return data}).catch(function(error){expired();throw error}).finally(function(){pending=null});return pending;
  }
  function permitted(entry){if(!entry||!entry.backend||!authorized())return false;var p=entry.node.dataset.schoolPermission||'UNMAPPED',grants=context().authorization.permissions||[];return !entry.node.hidden&&(p==='PUBLIC'||p!=='UNMAPPED'&&(grants.includes('*')||grants.includes(p)))}
  function activate(entry){entries.forEach(function(e){e.node.classList.remove('active');e.node.removeAttribute('aria-current')});entry.node.classList.add('active');entry.node.setAttribute('aria-current','page');var group=entry.node.closest('.school-nav-group');if(group){group.classList.add('open');var button=group.querySelector(':scope > .nav-group-header');if(button)button.setAttribute('aria-expanded','true')}}
  function open(entry){return validate().then(function(){if(!permitted(entry)){clearState();showState(entry&&entry.backend?'Access denied for this School module.':'This module is unavailable because its server-backed implementation is not registered.');throw Error('route denied')}var loader=window.EDUTRACK_SCHOOL_MODULES;if(!loader||typeof loader.open!=='function')throw Error('module loader unavailable');return loader.open(entry.node)}).then(function(){activate(entry);clearState();applied=entry.route;return true}).catch(function(error){if(error.message!=='route denied'){showState('This School module could not be opened.');}return false})}
  function route(node){if(!node||!authorized())return false;if(node.dataset.schoolTarget==='session:logout'){return validate().then(function(){if(typeof window.emsDoLogout==='function')window.emsDoLogout();return false})}var entry=entries.get(node.dataset.schoolRoute);if(!entry)return false;return open(entry).then(function(ok){if(ok&&location.hash!==entry.route){history.pushState({schoolRoute:entry.node.dataset.schoolRoute},'',location.pathname+location.search+entry.route)}return false})}  function currentEntry(){var match=location.hash.match(/^#\/school\/([a-z0-9-]+)$/i);if(!match)return null;var entry=entries.get(match[1]);if(entry)return entry;var root=document.getElementById('sg-school-level');if(!root)return null;var node=Array.from(root.querySelectorAll('.school-nav-item')).find(function(n){return n.dataset.schoolCanonicalRoute===location.hash||routeFor(n.dataset.schoolTarget||'')===location.hash});if(!node)return null;var target=node.dataset.schoolTarget||'',id=node.dataset.schoolRoute||targetId(target);entry={node:node,target:target,route:routeFor(target),backend:BACKENDS[target]||''};entries.set(id,entry);return entry}
  function restore(){
    if(!location.hash.startsWith('#/school/'))return Promise.resolve(false);
    var entry=currentEntry();
    if(!entry){showState('School module not found.');return Promise.resolve(false)}
    if(!entry.backend){showState('This module is unavailable because its server-backed implementation is not registered.');return Promise.resolve(false)}
    return validate().then(function(){
      if(!permitted(entry)){showState('Access denied for this School module.');return false}
      if(applied===location.hash){clearState();return true}
      return open(entry);
    }).catch(function(){return false});
  }
  window.EDUTRACK_SCHOOL_ROUTE_HISTORY={init:init,route:route,restore:restore,validate:validate,entries:entries,backendFor:function(target){return BACKENDS[target]||null},routeFor:routeFor};
  window.addEventListener('popstate',restore);window.addEventListener('hashchange',restore);
  window.addEventListener('edutrack:school-dashboard-ready',function(){setTimeout(init,0)});
  window.addEventListener('edutrack:school-general-ready',init);
  window.addEventListener('edutrack:school-session',function(){setTimeout(init,0)});
  window.addEventListener('edutrack:school-session-invalid',function(){applied='';var d=document.getElementById('page-dashboard');if(d)d.classList.add('hidden')});
  document.addEventListener('DOMContentLoaded',init);setTimeout(init,0);
})();
