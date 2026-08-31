/* EduTrack individual result-slip interaction repair.
 * This adapter only normalizes the selected student into the legacy slip index
 * input and guarantees the existing Fetch Result handler is callable. It does
 * not replace or modify mock-result generation.
 */
(function () {
  'use strict';
  if (window.__EDUTRACK_INDIVIDUAL_RESULT_SLIP_FIX__) return;
  window.__EDUTRACK_INDIVIDUAL_RESULT_SLIP_FIX__ = true;

  function byId(id) { return document.getElementById(id); }

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

  function ensureFetchHandler() {
    if (typeof window.fetchSlip === 'function') return window.fetchSlip;
    if (typeof window.fetchSlip === 'undefined' && typeof fetchSlip === 'function') {
      window.fetchSlip = fetchSlip;
      return window.fetchSlip;
    }
    return null;
  }

  function showFetchError(error) {
    var status = byId('slip-status');
    var message = error && error.message ? error.message : 'Result slip could not be generated.';
    if (status) status.innerHTML = '<span class="status-warn">⚠️ ' + message + '</span>';
    if (typeof window.toast === 'function') window.toast(message, 'error');
  }

  function runExistingSlipGeneration() {
    syncSelectedStudentToSlipIndex();
    var handler = ensureFetchHandler();
    if (!handler) {
      showFetchError(new Error('Result slip generation is unavailable. Please retry after the page finishes loading.'));
      return false;
    }
    try {
      handler.call(window);
      return true;
    } catch (error) {
      showFetchError(error);
      return false;
    }
  }

  function isIndividualFetchButton(element) {
    var button = element && element.closest ? element.closest('button') : null;
    if (!button) return false;
    var page = button.closest ? button.closest('#page-slip') : null;
    return !!page && /fetch\s+results?/i.test(String(button.textContent || ''));
  }

  document.addEventListener('click', function (event) {
    if (!isIndividualFetchButton(event.target)) return;
    /* Take ownership of this one individual-slip action so a stale or missing
       service adapter cannot replace the uploaded-reference legacy flow. */
    event.preventDefault();
    event.stopImmediatePropagation();
    runExistingSlipGeneration();
  }, true);

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return;
    var target = event.target;
    if (!target || (target.id !== 'slip-index' && target.id !== 'af-student')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    runExistingSlipGeneration();
  }, true);
})();
