// public/js/pwa/sw.js
const SW_VERSION = '{{APP_QVER}}';
const STATIC_CACHE = `fr-static-${SW_VERSION}`;
const STATIC_ASSETS = [
  '/', '/index.html',
  '/css/styles.css?v={{APP_QVER}}',
  '/js/main.js?v={{APP_QVER}}',
  '/assets/logo.svg?v={{APP_QVER}}'
];