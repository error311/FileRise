// /public/js/defer-css.js
// Promote preloaded styles to real stylesheets (CSP-safe) and expose a load promise.
(function () {
  if (window.__CSS_PROMISE__) return;

  var loads = [];

  // Promote <link rel="preload" as="style"> IN-PLACE
  var preloads = document.querySelectorAll('link[rel="preload"][as="style"]');
  for (var i = 0; i < preloads.length; i++) {
    var l = preloads[i];
    // resolve when it finishes loading as a stylesheet
    loads.push(new Promise(function (res) { l.addEventListener('load', res, { once: true }); }));
    l.rel = 'stylesheet';
    if (!l.media || l.media === 'print') l.media = 'all'; // be explicit
    l.removeAttribute('as'); // keep some engines happy about "used" preload
  }

  // Also wait for any existing <link rel="stylesheet"> that haven't finished yet
  var styles = document.querySelectorAll('link[rel="stylesheet"]');
  for (var j = 0; j < styles.length; j++) {
    var s = styles[j];
    if (s.sheet) continue; // already applied
    loads.push(new Promise(function (res) { s.addEventListener('load', res, { once: true }); }));
  }

  // Safari quirk: nudge layout so promoted sheets apply immediately
  void document.documentElement.offsetHeight;

  window.__CSS_PROMISE__ = Promise.all(loads);
})();