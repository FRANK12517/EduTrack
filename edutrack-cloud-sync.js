(function () {
  'use strict';
  window.addEventListener('online', function () { document.documentElement.dataset.edutrackOnline = 'true'; });
  window.addEventListener('offline', function () { document.documentElement.dataset.edutrackOnline = 'false'; });
  window.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest('button, [role="button"]');
    if (!button || !/cloud\s*sync/i.test(button.textContent || '')) return;
    if (typeof window.cloudSync !== 'function') return;
    event.preventDefault();
    button.disabled = true;
    var oldLabel = button.textContent;
    button.textContent = 'Syncing…';
    window.cloudSync().catch(function (error) { if (typeof window.toast === 'function') window.toast('Cloud sync failed: ' + error.message, 'error'); }).finally(function () { button.disabled = false; button.textContent = oldLabel; });
  }, true);
})();
