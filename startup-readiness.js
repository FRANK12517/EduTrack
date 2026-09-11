(function () {
  'use strict';

  function loginShellIsReady() {
    var levels = ['NATIONAL', 'REGIONAL', 'DISTRICT', 'SCHOOL', 'STUDENT', 'PARENT'];
    var cards = document.querySelectorAll('.login-level-btn');
    var cardLevels = Array.prototype.map.call(cards, function (card) { return card.dataset.level; });
    return document.readyState !== 'loading' &&
      levels.every(function (level) { return cardLevels.indexOf(level) !== -1; }) &&
      Boolean(document.getElementById('v43LoginBtn'));
  }

  function publishWhenReady(attemptsRemaining) {
    if (loginShellIsReady()) {
      document.documentElement.dataset.appReady = 'true';
      window.dispatchEvent(new CustomEvent('edutrack:login-shell-ready'));
      return;
    }
    if (attemptsRemaining > 0) window.setTimeout(function () { publishWhenReady(attemptsRemaining - 1); }, 25);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { publishWhenReady(80); }, { once: true });
  else publishWhenReady(80);
})();
