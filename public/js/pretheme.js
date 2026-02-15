// Apply theme colors before main CSS/JS to reduce flash on first paint.
(function () {
  try {
    var stored = localStorage.getItem('darkMode');
    var isDark = (stored === null)
      ? !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
      : (stored === '1' || stored === 'true');
    var theme = isDark ? 'dark' : 'light';
    var bg = isDark ? '#121212' : '#ffffff';
    var root = document.documentElement;

    function applyTheme(el) {
      if (!el) return;
      el.classList.toggle('dark-mode', isDark);
      el.setAttribute('data-theme', theme);
      el.style.colorScheme = theme;
    }

    applyTheme(root);
    root.style.backgroundColor = bg;
    root.style.setProperty('--pre-bg', bg);

    function applyBodyTheme() {
      var body = document.body;
      if (!body) return false;
      applyTheme(body);
      return true;
    }

    if (!applyBodyTheme()) {
      var applied = false;
      var onBodyReady = function () {
        if (applied) return;
        applied = applyBodyTheme();
      };

      if (typeof MutationObserver === 'function') {
        var observer = new MutationObserver(function () {
          onBodyReady();
          if (applied) observer.disconnect();
        });
        observer.observe(root, { childList: true });
      }

      document.addEventListener('DOMContentLoaded', onBodyReady, { once: true });
    }

    var metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', bg);
  } catch (e) {
    // Ignore early bootstrap errors.
  }
})();
