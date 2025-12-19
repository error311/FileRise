// Service Worker entrypoint.
// This file is registered as `/sw.js` (or `/<base>/sw.js` for subpath installs like `/fr`),
// and it imports the real worker implementation from `/js/pwa/sw.js`.
try {
  self.importScripts('js/pwa/sw.js?v={{APP_QVER}}');
} catch (e) {
  // no-op
}
