(function () {
  'use strict';

  // Presentation-only enhancement: existing attendance renderers, handlers,
  // records, and server submissions remain authoritative.
  function byId(id) { return document.getElementById(id); }
  function installStyles() {
    if (byId('edutrack-attendance-register-ui-style')) return;
    var style = document.createElement('style');
    style.id = 'edutrack-attendance-register-ui-style';
    style.textContent = `
      #page-teachers,#page-pupils{--ar-ink:#17324d;--ar-muted:#607286;--ar-line:#dbe5ec;--ar-accent:#0b7285;--ar-surface:#fff;--ar-soft:#f5f8fa}
      #page-teachers .page-title,#page-pupils .page-title{color:var(--ar-ink);letter-spacing:-.025em;margin-bottom:.35rem}
      #page-teachers .announcement,#page-pupils .announcement{background:linear-gradient(135deg,#edf9fa,#f7fbfc);border:1px solid #bfe4e8;border-left:4px solid var(--ar-accent);border-radius:12px;color:#285267;line-height:1.45;padding:.8rem 1rem}
      #page-teachers .card.no-print,#page-pupils .card.no-print{border:1px solid var(--ar-line);border-radius:14px;box-shadow:0 4px 16px rgba(27,55,76,.055)}
      #page-pupils .card.no-print>div:first-child{align-items:end!important;gap:.85rem!important}
      #page-teachers .form-group label,#page-pupils .form-group label{color:var(--ar-ink);font-size:.72rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
      #page-teachers select,#page-pupils select,#page-teachers input,#page-pupils input{border:1px solid #c9d9e2;border-radius:9px;min-height:42px;background:#fff;color:var(--ar-ink)}
      #page-teachers select:focus,#page-pupils select:focus,#page-teachers input:focus,#page-pupils input:focus{border-color:var(--ar-accent);box-shadow:0 0 0 3px rgba(11,114,133,.14);outline:0}
      .attend-table-wrap,.pa-table-wrap{position:relative;overflow:auto;overscroll-behavior-inline:contain;-webkit-overflow-scrolling:touch;background:var(--ar-surface);border:1px solid var(--ar-line)!important;border-radius:14px!important;box-shadow:0 4px 18px rgba(27,55,76,.06)}
      .attend-table-wrap::after,.pa-table-wrap::after{content:'Scroll horizontally to view all dates →';display:block;position:sticky;left:0;width:max-content;padding:.45rem .7rem;color:var(--ar-muted);background:rgba(255,255,255,.96);font-size:.7rem;font-weight:700}
      .attend-table,.pa-table,#page-pupils .gw-table{min-width:900px!important;border-collapse:separate;border-spacing:0;background:#fff}
      .attend-table th,.pa-table th,#page-pupils .gw-table th{background:var(--ar-ink);color:#fff;border-bottom:1px solid #294c66;font-size:.69rem;letter-spacing:.015em;padding:.65rem .55rem!important;white-space:nowrap}
      .attend-table td,.pa-table td,#page-pupils .gw-table td{border-bottom:1px solid #e6edf1;color:#314b5d;padding:.55rem .45rem!important}
      .attend-table tbody tr:nth-child(even) td,.pa-table tbody tr:nth-child(even) td,#page-pupils .gw-table tbody tr:nth-child(even) td{background:#f9fbfc}
      .attend-table tbody tr:hover td,.pa-table tbody tr:hover td,#page-pupils .gw-table tbody tr:hover td{background:#eef9fa!important}
      .attend-table th:first-child,.attend-table td:first-child,.pa-table th:nth-child(1),.pa-table td:nth-child(1),.pa-table th:nth-child(2),.pa-table td:nth-child(2),#page-pupils .gw-table th:first-child,#page-pupils .gw-table td:first-child{position:sticky;background:inherit;z-index:2}
      .attend-table th:first-child,.attend-table td:first-child,#page-pupils .gw-table th:first-child,#page-pupils .gw-table td:first-child{left:0}.pa-table th:nth-child(1),.pa-table td:nth-child(1){left:0}.pa-table th:nth-child(2),.pa-table td:nth-child(2){left:42px;box-shadow:3px 0 8px rgba(18,47,66,.09)}
      .attend-table thead th,.pa-table thead th,#page-pupils .gw-table thead th{position:sticky;top:0;z-index:4}.attend-table thead th:first-child,.pa-table thead th:nth-child(-n+2),#page-pupils .gw-table thead th:first-child{background:var(--ar-ink);z-index:6}
      .attend-status-btn,.pa-btn,#page-pupils .gw-status-btn{min-width:38px!important;min-height:38px!important;border-radius:10px!important;box-shadow:none;touch-action:manipulation}
      #page-teachers .teacher-row-name{color:var(--ar-ink);font-size:.8rem;font-weight:800}#page-teachers .teacher-row-meta{color:var(--ar-muted)}
      #page-teachers .attend-summary-grid,#page-pupils .pa-kpi-grid{gap:.7rem}#page-teachers .attend-summary-grid>*,#page-pupils .pa-kpi-grid>*{border-radius:12px;border:1px solid var(--ar-line);box-shadow:none}
      #page-teachers .btn,#page-pupils .btn{min-height:42px;border-radius:9px;touch-action:manipulation}
      @media(max-width:768px){#page-teachers,#page-pupils{padding:.85rem!important;overflow-x:hidden}#page-teachers .page-title,#page-pupils .page-title{font-size:1.15rem}#page-pupils .card.no-print>div:first-child{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))}.attend-table-wrap,.pa-table-wrap{border-radius:10px!important;margin-inline:-.15rem}.attend-table,.pa-table,#page-pupils .gw-table{min-width:780px!important}.attend-table th,.pa-table th,#page-pupils .gw-table th{padding:.55rem .4rem!important}.attend-table td,.pa-table td,#page-pupils .gw-table td{padding:.45rem .35rem!important}}
      @media(max-width:420px){#page-pupils .card.no-print>div:first-child{grid-template-columns:1fr}#page-teachers .attend-summary-grid,#page-pupils .pa-kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.attend-status-btn,.pa-btn,#page-pupils .gw-status-btn{min-width:44px!important;min-height:44px!important}.attend-table,.pa-table,#page-pupils .gw-table{min-width:740px!important}}
    `;
    document.head.appendChild(style);
  }
  function enhance() {
    installStyles();
    [['page-teachers','Teacher'],['page-pupils','Student']].forEach(function (item) { var page=byId(item[0]); if(page){page.dataset.attendanceRegisterUi=item[1];page.setAttribute('aria-label',item[1]+' attendance register');} });
    document.querySelectorAll('.attend-table-wrap,.pa-table-wrap').forEach(function (wrap) { wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Attendance register. Scroll horizontally to view dates and totals.'); });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance);else enhance();
  new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
  window.EDUTRACK_ATTENDANCE_REGISTER_UI={refresh:enhance};
})();
