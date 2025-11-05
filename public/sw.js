// Root-scoped stub. Keeps the worker’s scope at “/” level
try {
  self.importScripts('/js/pwa/sw.js?v={{APP_QVER}}');
} catch (_) {
  // no-op
}