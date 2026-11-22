// Runs before the app, in old-browser-safe syntax. Right after a release the
// server can hand out a mix of old and new files for a minute, and the app
// then fails to start. If that happens the page is loaded again — twice at
// most, so a real bug cannot turn into an endless loop. main.js clears the
// counter once the app is on screen.
(function () {
  var KEY = 'cartrate_retry';
  var MAX_RETRIES = 2;
  var WAIT_MS = 2500;
  var scheduled = false;

  window.addEventListener('error', function (event) {
    // Scripts only: a flag image that failed to load is not a reason to reload
    var target = event.target;
    var isScript = target === window || (target && target.tagName === 'SCRIPT');
    if (!isScript || scheduled || document.body.classList.contains('is-ready')) return;
    try {
      var tries = Number(sessionStorage.getItem(KEY)) || 0;
      if (tries >= MAX_RETRIES) return;
      sessionStorage.setItem(KEY, String(tries + 1));
      scheduled = true;
      setTimeout(function () { location.reload(); }, WAIT_MS * (tries + 1));
    } catch (_) { /* storage blocked: without a counter it is safer not to reload */ }
  }, true);
})();
