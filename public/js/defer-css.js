// Promote any preloaded styles to real stylesheets without inline handlers (CSP-safe)
document.addEventListener('DOMContentLoaded', () => {
  // Promote any preloaded core CSS
  document.querySelectorAll('link[rel="preload"][as="style"][href]').forEach(link => {
    const href = link.getAttribute('href');
    if ([...document.querySelectorAll('link[rel="stylesheet"]')]
          .some(s => s.getAttribute('href') === href)) return;
    const sheet = document.createElement('link');
    sheet.rel = 'stylesheet';
    sheet.href = href;
    document.head.appendChild(sheet);
  });


  // Optionally load non-critical icon/extra font CSS after first paint:
  const extra = document.createElement('link');
  extra.rel = 'stylesheet';
  extra.href = '/css/vendor/material-icons.css?v={{APP_QVER}}';
  document.head.appendChild(extra);
});