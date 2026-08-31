/* EduTrack individual result-slip fetch-result repair (root/served copy).
 *
 * ROOT CAUSE OF "Service Unavailable" ON FETCH RESULT:
 * The Individual Result Slip page's "Fetch Results" button and the
 * Permanent ID input's Enter key both call the global fetchSlip().
 * That name is periodically reassigned (every ~1.5s, by an existing
 * additive script) to an "authoritative" implementation that calls the
 * relational server (/api/domain/students, /api/domain/results,
 * /api/domain/result-slips/:id). When that server call fails for any
 * reason (its own dependency currently unavailable, no published
 * result yet, network hiccup, etc.) the authoritative handler only
 * shows the raw error text and nothing is rendered, so the person sees
 * "Service Unavailable" and no result slip.
 *
 * FIX (additive, does not remove or replace the authoritative path):
 * Take ownership of the Fetch Results button and the Permanent ID
 * Enter-key action at the DOM level (capture phase), independent of
 * whichever function the global fetchSlip name currently points to.
 * Always try the authoritative, server-backed result first (preferred,
 * since it reflects officially published results). If — and only if —
 * that attempt fails, fall back to the original always-available
 * local/legacy result-slip renderer (the one driven by Score Entry
 * data already loaded on the page), so the requested student's result
 * is still displayed instead of a bare error, with a short notice
 * explaining a locally-held result is being shown.
 */
(function () {
  'use strict';
  if (window.__EDUTRACK_INDIVIDUAL_RESULT_SLIP_FIX__) return;
  window.__EDUTRACK_INDIVIDUAL_RESULT_SLIP_FIX__ = true;

  // Captured as early as possible (this script runs during the initial,
  // synchronous parse of the page, before any interval/timeout-driven
  // patch has had a chance to reassign window.fetchSlip), so this is a
  // stable reference to the original local/legacy result-slip renderer
  // regardless of what fetchSlip gets reassigned to afterwards.
  var legacyFetchSlip = (typeof window.fetchSlip === 'function') ? window.fetchSlip : null;

  function byId(id) { return document.getElementById(id); }

  function captureLegacyIfNeeded() {
    if (legacyFetchSlip) return;
    if (typeof window.fetchSlip === 'function' && !window.fetchSlip._edutrackAuthoritativeWrapper) {
      legacyFetchSlip = window.fetchSlip;
    }
  }

  function selectedStudentId() {
    var select = byId('af-student');
    return select && String(select.value || '').trim();
  }

  function syncSelectedStudentToSlipIndex() {
    var input = byId('slip-index');
    var selected = selectedStudentId();
    if (input && selected) input.value = selected;
    return input ? String(input.value || '').trim() : '';
  }

  function showNotice(message, tone) {
    var status = byId('slip-status');
    if (status) {
      var cls = tone === 'error' ? 'status-warn' : (tone === 'info' ? 'status-warn' : 'status-ok');
      var icon = tone === 'error' ? '⚠️' : 'ℹ️';
      status.innerHTML = '<span class="' + cls + '">' + icon + ' ' + message + '</span>';
    }
    if (typeof window.toast === 'function') window.toast(message, tone === 'error' ? 'error' : '');
  }

  function runLegacyFallback(reason) {
    captureLegacyIfNeeded();
    if (typeof legacyFetchSlip !== 'function') {
      showNotice('Result slip could not be loaded (' + (reason || 'service unavailable') + ').', 'error');
      return false;
    }
    try {
      legacyFetchSlip.call(window);
      // Legacy renderer sets its own success status text; append a short
      // note so it is clear this is locally-held data, not a fetch failure.
      var status = byId('slip-status');
      if (status && status.innerHTML) {
        status.innerHTML += ' <span class="status-warn" style="margin-left:.5rem">(Showing locally entered scores — the authoritative published result was not available: ' + (reason || 'service unavailable') + ')</span>';
      }
      return true;
    } catch (error) {
      showNotice((error && error.message) || 'Result slip could not be generated.', 'error');
      return false;
    }
  }

  function runAuthoritativeThenFallback() {
    var idx = syncSelectedStudentToSlipIndex();
    if (!idx) {
      var status = byId('slip-status');
      if (status) status.innerHTML = '<span class="status-warn">⚠️ Select a student, or enter a Permanent GES Student ID, then fetch results.</span>';
      var container = byId('slip-container');
      if (container) container.innerHTML = '';
      return;
    }

    var adapter = window.EduTrackLegacyAcademicAdapter;
    var authoritative = adapter && typeof adapter.fetchResultSlip === 'function' ? adapter.fetchResultSlip : null;

    if (!window.EduTrackDomainAPI || !authoritative) {
      // Server-backed API not available on this page load — use the
      // always-available local renderer directly, no need to round-trip
      // through a network call first.
      runLegacyFallback('server connection not yet established');
      return;
    }

    Promise.resolve()
      .then(function () { return authoritative(); })
      .catch(function (error) {
        var message = (error && error.message) || 'service unavailable';
        runLegacyFallback(message);
      });
  }

  function isIndividualFetchButton(element) {
    var button = element && element.closest ? element.closest('button') : null;
    if (!button) return false;
    var page = button.closest ? button.closest('#page-slip') : null;
    return !!page && /fetch\s+results?/i.test(String(button.textContent || ''));
  }

  document.addEventListener('click', function (event) {
    if (!isIndividualFetchButton(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    runAuthoritativeThenFallback();
  }, true);

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return;
    var target = event.target;
    if (!target || (target.id !== 'slip-index' && target.id !== 'af-student')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    runAuthoritativeThenFallback();
  }, true);

  // Keep window.fetchSlip callable for any other code path in the app
  // that invokes it directly by name (e.g. auto-fetch-on-selection),
  // routed through the same authoritative-then-fallback logic.
  function installGlobalWrapper() {
    captureLegacyIfNeeded();
    if (typeof window.fetchSlip === 'function' && window.fetchSlip._edutrackAuthoritativeWrapper) return;
    var wrapped = function () { runAuthoritativeThenFallback(); };
    wrapped._edutrackAuthoritativeWrapper = true;
    window.fetchSlip = wrapped;
  }
  installGlobalWrapper();
  setInterval(installGlobalWrapper, 1500);
})();
