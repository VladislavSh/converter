// Runs before the app, in old-browser-safe syntax. Chrome, Edge and other
// Chromium browsers say once per page load that the app can be installed (the
// "beforeinstallprompt" event). It can come before the app's modules have
// loaded, so it is caught here and kept for the "Install" button, which then
// opens the browser's own install dialog in one tap.
(function () {
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault(); // no browser banner: the "Install" button asks when the user wants it
    window.cartrateInstallPrompt = event;
    window.dispatchEvent(new Event('cartrate:installable'));
  });
})();
