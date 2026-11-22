// Applied before the stylesheet renders so the page never flashes the wrong theme.
try {
  var s = JSON.parse(localStorage.getItem('cartrate_state') || '{}');
  var t = s.theme === 'light' || s.theme === 'dark'
    ? s.theme
    : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  document.documentElement.dataset.theme = t;
} catch (_) { /* storage blocked: the stylesheet default (dark) applies */ }
