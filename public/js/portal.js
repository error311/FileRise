// public/js/portal.js
// Standalone client portal logic – no imports from main app JS to avoid DOM coupling.
import { patchFetchForBasePath, withBase } from './basePath.js?v={{APP_QVER}}';
import { t, applyTranslations, setLocale } from './i18n.js?v={{APP_QVER}}';

// Ensure /api/* calls work when FileRise is mounted under a subpath (e.g. /fr).
patchFetchForBasePath();

const portalThemeStorageKey = 'fr_portal_theme';

let portal = null;
let portalFormDone = false;
let portalFilesCache = [];
let portalViewMode = 'list';
let portalZipBusy = false;
let portalDownloadAllDisabled = false;
let portalPath = '';
let portalPage = 1;
let portalFilesTotalEntries = 0;
let portalFilesTotalFiles = 0;
let portalFilesTotalPages = 1;
const portalFilesPerPage = 50;
const portalSubmissionRefKey = 'fr_portal_submission_ref:';
let portalSubmissionRef = '';
let portalSubmissionRefSlug = '';

function sanitizePortalSubmissionRef(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const cleaned = raw.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase();
  return cleaned.slice(0, 48);
}

function generatePortalSubmissionRef() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return 'PRT-' + stamp + '-' + rand;
}

function getPortalSubmissionRef() {
  const slug = getPortalSlug();
  if (!slug) return '';
  if (portalSubmissionRef && portalSubmissionRefSlug === slug) {
    return portalSubmissionRef;
  }
  portalSubmissionRef = '';
  portalSubmissionRefSlug = slug;
  const key = portalSubmissionRefKey + slug;
  let ref = '';
  try { ref = localStorage.getItem(key) || ''; } catch (e) { /* ignore */ }
  ref = sanitizePortalSubmissionRef(ref);
  if (!ref) {
    ref = generatePortalSubmissionRef();
    try { localStorage.setItem(key, ref); } catch (e) { /* ignore */ }
  }
  portalSubmissionRef = ref;
  return ref;
}

function setPortalSubmissionRef(value) {
  const slug = getPortalSlug();
  if (!slug) return;
  const key = portalSubmissionRefKey + slug;
  const ref = sanitizePortalSubmissionRef(value);
  if (!ref) return;
  portalSubmissionRef = ref;
  portalSubmissionRefSlug = slug;
  try { localStorage.setItem(key, ref); } catch (e) { /* ignore */ }
}

function getPortalThemeStored() {
  try { return localStorage.getItem(portalThemeStorageKey) || ''; } catch (e) { /* ignore */ }
  return '';
}

function setPortalThemeStored(theme) {
  try { localStorage.setItem(portalThemeStorageKey, theme); } catch (e) { /* ignore */ }
}

function getPortalThemeDefault() {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

let portalTheme = '';
let portalSiteConfig = null;
let portalBranding = null;

function withBaseIfRelative(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (raw[0] === '/') return withBase(raw);
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
  return withBase('/' + raw.replace(/^\.?\//, ''));
}

function upsertLink(selector, builder, href) {
  if (!href) return;
  let el = document.querySelector(selector);
  if (!el) {
    el = builder();
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function updatePortalIconLinks(branding) {
  if (!branding || typeof branding !== 'object') return;

  const svg = withBaseIfRelative(branding.faviconSvg || '');
  const png = withBaseIfRelative(branding.faviconPng || '');
  const ico = withBaseIfRelative(branding.faviconIco || '');
  const apple = withBaseIfRelative(branding.appleTouchIcon || '');
  const mask = withBaseIfRelative(branding.maskIcon || '');

  if (svg) {
    upsertLink('link[rel="icon"][type="image/svg+xml"]', () => {
      const link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/svg+xml';
      link.sizes = 'any';
      return link;
    }, svg);
  }

  if (png) {
    const pngLinks = document.querySelectorAll('link[rel="icon"][type="image/png"]');
    if (pngLinks.length) {
      pngLinks.forEach((link) => link.setAttribute('href', png));
    } else {
      upsertLink('link[rel="icon"][type="image/png"]', () => {
        const link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/png';
        return link;
      }, png);
    }
  }

  if (ico) {
    upsertLink('link[rel="shortcut icon"]', () => {
      const link = document.createElement('link');
      link.rel = 'shortcut icon';
      return link;
    }, ico);
  }

  if (apple) {
    upsertLink('link[rel="apple-touch-icon"]', () => {
      const link = document.createElement('link');
      link.rel = 'apple-touch-icon';
      return link;
    }, apple);
  }

  if (mask) {
    upsertLink('link[rel="mask-icon"]', () => {
      const link = document.createElement('link');
      link.rel = 'mask-icon';
      return link;
    }, mask);
    const maskLink = document.querySelector('link[rel="mask-icon"]');
    if (maskLink) {
      const color = String(branding.maskIconColor || '').trim();
      if (color) {
        maskLink.setAttribute('color', color);
      } else {
        maskLink.removeAttribute('color');
      }
    }
  }
}

function clearPortalFaviconFallback() {
  document.querySelectorAll('link[data-portal-fallback="1"]').forEach((el) => el.remove());
}

function applyPortalFaviconFallback(url) {
  const href = withBaseIfRelative(url);
  if (!href) return;
  const clean = href.split('?')[0].toLowerCase();
  let type = '';
  if (clean.endsWith('.svg') || clean.endsWith('.svgz')) {
    type = 'image/svg+xml';
  } else if (clean.endsWith('.png')) {
    type = 'image/png';
  }

  let icon = document.querySelector('link[rel="icon"][data-portal-fallback="1"]');
  if (!icon) {
    icon = document.createElement('link');
    icon.rel = 'icon';
    icon.setAttribute('data-portal-fallback', '1');
    document.head.appendChild(icon);
  }
  if (type) {
    icon.type = type;
  } else {
    icon.removeAttribute('type');
  }
  icon.href = href;

  let apple = document.querySelector('link[rel="apple-touch-icon"][data-portal-fallback="1"]');
  if (!apple) {
    apple = document.createElement('link');
    apple.rel = 'apple-touch-icon';
    apple.setAttribute('data-portal-fallback', '1');
    document.head.appendChild(apple);
  }
  apple.href = href;
}

function applyPortalThemeColor(isDark) {
  if (!portalBranding || typeof portalBranding !== 'object') return;
  const color = isDark
    ? String(portalBranding.themeColorDark || '').trim()
    : String(portalBranding.themeColorLight || '').trim();
  if (!color) return;
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = color;
}

function applyPortalSiteBranding(cfg) {
  if (!cfg || typeof cfg !== 'object') return;
  if (!cfg.pro || !cfg.pro.active) return;
  portalSiteConfig = cfg;
  portalBranding = (cfg && cfg.branding) ? cfg.branding : null;
  if (!portalBranding) return;
  updatePortalIconLinks(portalBranding);
  clearPortalFaviconFallback();
  applyPortalThemeColor(portalTheme === 'dark');
}

function applyPortalTheme(theme) {
  const next = (theme === 'dark' || theme === 'light') ? theme : getPortalThemeDefault();
  document.documentElement.setAttribute('data-portal-theme', next);
  portalTheme = next;
  applyPortalThemeOverrides();
  applyPortalThemeColor(next === 'dark');
  return next;
}

function setPortalCssVar(name, value) {
  const root = document.documentElement;
  const clean = (value == null) ? '' : String(value).trim();
  if (clean) {
    root.style.setProperty(name, clean);
  } else {
    root.style.removeProperty(name);
  }
}

function applyPortalThemeOverrides() {
  if (!portal || !portal.theme || typeof portal.theme !== 'object') {
    setPortalCssVar('--portal-body-bg', '');
    setPortalCssVar('--portal-surface', '');
    setPortalCssVar('--portal-text', '');
    setPortalCssVar('--portal-muted', '');
    setPortalCssVar('--portal-border', '');
    setPortalCssVar('--portal-shadow', '');
    return;
  }

  const theme = portal.theme || {};
  const cfg = (portalTheme === 'dark') ? (theme.dark || {}) : (theme.light || {});

  setPortalCssVar('--portal-body-bg', cfg.bodyBg || '');
  setPortalCssVar('--portal-surface', cfg.surface || '');
  setPortalCssVar('--portal-text', cfg.text || '');
  setPortalCssVar('--portal-muted', cfg.muted || '');
  setPortalCssVar('--portal-border', cfg.border || '');
  setPortalCssVar('--portal-shadow', cfg.shadow || '');
}

function parsePortalHexColor(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const hex = raw[0] === '#' ? raw.slice(1) : raw;
  if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(hex)) return null;
  const full = hex.length === 3
    ? hex.split('').map((c) => c + c).join('')
    : hex;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function parsePortalRgbColor(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^rgba?\(([^)]+)\)$/i);
  if (!match) return null;
  const parts = match[1].split(',').map((p) => p.trim());
  if (parts.length < 3) return null;
  const r = parseFloat(parts[0]);
  const g = parseFloat(parts[1]);
  const b = parseFloat(parts[2]);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
  return {
    r: Math.max(0, Math.min(255, r)),
    g: Math.max(0, Math.min(255, g)),
    b: Math.max(0, Math.min(255, b)),
  };
}

function getPortalAccentContrast(value) {
  const rgb = parsePortalHexColor(value) || parsePortalRgbColor(value);
  if (!rgb) return '';
  const lum = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return lum > 0.6 ? '#0f172a' : '#ffffff';
}

function updatePortalThemeToggle() {
  const btn = document.getElementById('portalThemeToggle');
  if (!btn) return;
  const isDark = portalTheme === 'dark';
  btn.textContent = isDark ? 'Light mode' : 'Dark mode';
  btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
}

function initPortalThemeToggle() {
  const btn = document.getElementById('portalThemeToggle');
  if (!btn) return;
  updatePortalThemeToggle();
  btn.addEventListener('click', () => {
    const next = portalTheme === 'dark' ? 'light' : 'dark';
    applyPortalTheme(next);
    setPortalThemeStored(next);
    updatePortalThemeToggle();
  });
}

applyPortalTheme(getPortalThemeStored() || getPortalThemeDefault());

function getStoredLocale() {
  try { return localStorage.getItem('language') || ''; } catch (e) { /* ignore */ }
  return '';
}

function getSavedLocale() {
  return getStoredLocale() || 'en';
}

let portalSiteConfigPromise = null;
async function fetchPortalSiteConfigOnce() {
  if (portalSiteConfig) return portalSiteConfig;
  if (portalSiteConfigPromise) return portalSiteConfigPromise;
  portalSiteConfigPromise = fetch(withBase('/api/siteConfig.php'), { credentials: 'include' })
    .then((res) => res.json().catch(() => ({})))
    .then((cfg) => {
      if (cfg && typeof cfg === 'object') {
        portalSiteConfig = cfg;
        applyPortalSiteBranding(cfg);
      }
      return portalSiteConfig;
    })
    .catch(() => portalSiteConfig);
  return portalSiteConfigPromise;
}

async function resolveLocale() {
  const stored = getStoredLocale();
  if (stored) {
    fetchPortalSiteConfigOnce();
    return stored;
  }
  try {
    const cfg = await fetchPortalSiteConfigOnce();
    const defaultLang = cfg && cfg.display && cfg.display.defaultLanguage
      ? String(cfg.display.defaultLanguage)
      : '';
    if (defaultLang) {
      setSavedLocale(defaultLang);
      return defaultLang;
    }
  } catch (e) { /* ignore */ }
  return 'en';
}

function setSavedLocale(locale) {
  if (!locale) return;
  try { localStorage.setItem('language', locale); } catch (e) { /* ignore */ }
}

async function applyLocale() {
  const saved = await resolveLocale();
  const applied = await setLocale(saved);
  applyTranslations();
  document.documentElement.lang = applied;
}

function setupLanguageSelect() {
  const select = document.getElementById('portalLangSelect');
  if (!select) return;

  const options = Array.from(select.options).map(opt => opt.value);
  const saved = getSavedLocale();
  select.value = options.includes(saved) ? saved : 'en';

  select.addEventListener('change', async () => {
    const next = select.value || 'en';
    setSavedLocale(next);
    const applied = await setLocale(next);
    applyTranslations();
    document.documentElement.lang = applied;
  });
}

const PORTAL_RESUMABLE_SRC = withBase('/vendor/resumable/1.1.0/resumable.min.js?v={{APP_QVER}}');
const PORTAL_RESUMABLE_TARGET = withBase('/api/upload/upload.php');
let portalResumableInstance = null;
let portalResumableReady = false;
let portalResumableLoadPromise = null;
let portalResumableChunkBytes = null;
let portalResumableBatch = null;
let portalResumableBusy = false;

function loadScriptOnce(src) {
  if (portalResumableLoadPromise) return portalResumableLoadPromise;
  portalResumableLoadPromise = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve(true);
    el.onerror = () => reject(new Error('Failed to load script: ' + src));
    document.head.appendChild(el);
  });
  return portalResumableLoadPromise;
}

async function getPortalResumableChunkBytes() {
  if (portalResumableChunkBytes) return portalResumableChunkBytes;
  let mb = 1.5;
  try {
    const cfg = await fetchPortalSiteConfigOnce();
    const raw = cfg && cfg.uploads && cfg.uploads.resumableChunkMb;
    if (raw !== undefined && raw !== null) {
      const parsed = parseFloat(raw);
      if (!Number.isNaN(parsed)) {
        mb = parsed;
      }
    }
  } catch (e) { /* ignore */ }
  mb = Math.max(0.5, Math.min(100, mb));
  portalResumableChunkBytes = mb * 1024 * 1024;
  return portalResumableChunkBytes;
}

async function initPortalResumable() {
  if (portalResumableReady && portalResumableInstance) return portalResumableInstance;
  if (window.Resumable) {
    portalResumableReady = true;
  } else {
    try {
      await loadScriptOnce(PORTAL_RESUMABLE_SRC);
    } catch (e) {
      console.warn('Resumable.js unavailable:', e);
      return null;
    }
  }

  if (!window.Resumable) return null;

  if (!portalResumableInstance) {
    const chunkSize = await getPortalResumableChunkBytes();
    portalResumableInstance = new window.Resumable({
      target: PORTAL_RESUMABLE_TARGET,
      chunkSize,
      simultaneousUploads: 3,
      forceChunkSize: true,
      testChunks: true,
      withCredentials: true,
      headers: { 'X-CSRF-Token': getCsrfToken() || '' },
      query: () => {
        const q = {
          folder: portalTargetFolder(),
          upload_token: getCsrfToken() || '',
          source: 'portal'
        };
        const portalSlug = getPortalSlug();
        if (portalSlug) {
          q.portal = portalSlug;
        }
        const submissionRef = getPortalSubmissionRef();
        if (submissionRef) {
          q.submissionRef = submissionRef;
        }
        const sourceId = portalSourceId();
        if (sourceId) {
          q.sourceId = sourceId;
        }
        return q;
      }
    });

    if (portalResumableInstance && portalResumableInstance.support === false) {
      portalResumableInstance = null;
      return null;
    }

    portalResumableInstance.on('fileProgress', () => {
      if (!portalResumableBatch || !portalResumableInstance) return;
      portalResumableBatch.hadProgress = true;
      const pct = Math.min(100, Math.max(0, Math.floor(portalResumableInstance.progress() * 100)));
      const base = t('portal_uploading', { count: portalResumableBatch.total }) || ('Uploading ' + portalResumableBatch.total + ' file(s)…');
      setStatus(base + ' ' + pct + '%');
      setUploadProgress(pct);
    });

    portalResumableInstance.on('fileSuccess', (file, message) => {
      if (!portalResumableBatch) return;
      let data = null;
      try { data = JSON.parse(message); } catch (e) { /* ignore */ }
      if (data && data.csrf_expired && data.csrf_token) {
        setCsrfToken(data.csrf_token);
        if (portalResumableInstance) {
          portalResumableInstance.opts.headers['X-CSRF-Token'] = data.csrf_token;
        }
        if (file && typeof file.retry === 'function') {
          file.retry();
        }
        return;
      }
      portalResumableBatch.success += 1;
    });

    portalResumableInstance.on('fileError', (file, message) => {
      if (!portalResumableBatch) return;
      portalResumableBatch.failed += 1;
      let detail = '';
      if (typeof message === 'string' && message.trim()) {
        try {
          const parsed = JSON.parse(message);
          detail = (parsed && (parsed.error || parsed.message)) ? String(parsed.error || parsed.message) : message.trim();
        } catch (e) {
          detail = message.trim();
        }
      }
      if (detail) {
        portalResumableBatch.lastError = detail;
      }
    });

    portalResumableInstance.on('complete', () => {
      const batch = portalResumableBatch;
      portalResumableBatch = null;
      portalResumableBusy = false;
      if (portalResumableInstance) {
        portalResumableInstance.cancel();
      }

      if (!batch) return;
      if (!batch.success && !batch.hadProgress && Array.isArray(batch.files) && batch.files.length) {
        showToast(t('portal_resumable_fallback') || 'Resumable upload did not start. Trying standard upload…', 'info');
        uploadFilesStandard(batch.files);
        return;
      }
      if (batch.success && !batch.failed) {
        setStatus(t('portal_upload_success', { count: batch.success }) || ('Uploaded ' + batch.success + ' file(s).'));
        showToast(t('portal_upload_complete') || 'Upload complete.', 'success');
      } else if (batch.success && batch.failed) {
        setStatus(t('portal_upload_partial', { count: batch.success, failed: batch.failed }) || ('Uploaded ' + batch.success + ' file(s), ' + batch.failed + ' failed.'), true);
        showToast(t('portal_upload_some_failed') || 'Some files failed to upload.', 'warning');
      } else {
        const base = t('portal_upload_failed') || 'Upload failed.';
        const detail = batch.lastError ? (' ' + batch.lastError) : '';
        setStatus(base + detail, true);
        showToast(base + detail, 'error');
      }

      if (batch.success > 0) {
        bumpUploadRateCounter(batch.success);
      }

      if (portalCanDownload()) {
        loadPortalFiles();
      }

      if (batch.success > 0 && portal && portal.showThankYou) {
        showThankYouScreen();
      }

      setUploadProgress(100);
      setTimeout(() => resetUploadProgress(), 600);
    });
  }

  portalResumableReady = true;
  return portalResumableInstance;
}

// --- Portal helpers: folder + download flag -----------------
function portalFolder() {
  if (!portal) return 'root';
  return portal.folder || portal.targetFolder || portal.path || 'root';
}

function normalizePortalPath(raw) {
  const trimmed = String(raw || '').replace(/\\/g, '/').trim();
  const clean = trimmed.replace(/^\/+|\/+$/g, '');
  if (!clean) {
    return { value: '', error: null };
  }
  const parts = clean.split('/').filter(Boolean);
  for (const seg of parts) {
    if (seg === '.' || seg === '..') {
      return { value: '', error: 'Invalid folder name.' };
    }
    if (seg.length > 255 || /[\x00-\x1F\x7F]/.test(seg)) {
      return { value: '', error: 'Invalid folder name.' };
    }
  }
  return { value: parts.join('/'), error: null };
}

function portalTargetFolder() {
  const base = portalFolder();
  const sub = portalPath;
  if (!sub) return base;
  if (base === 'root' || base === '') return sub;
  return base + '/' + sub;
}

function getPortalPathFromUrl() {
  try {
    const url = new URL(window.location.href);
    return (url.searchParams.get('path') || '').trim();
  } catch (e) {
    return '';
  }
}

function joinPortalPath(base, name) {
  if (!base) return name;
  return base.replace(/\/+$/g, '') + '/' + name;
}

function buildPortalUrl(path) {
  const url = new URL(window.location.href);
  if (path) {
    url.searchParams.set('path', path);
  } else {
    url.searchParams.delete('path');
  }
  return url.pathname + url.search + url.hash;
}

function updatePortalUrl(path, replace = false) {
  const next = buildPortalUrl(path);
  if (replace) {
    history.replaceState({ path }, '', next);
  } else {
    history.pushState({ path }, '', next);
  }
}

function navigatePortalPath(path, opts = {}) {
  const { replace = false } = opts;
  if (!portal || !portal.allowSubfolders) {
    return;
  }
  if (portalResumableBusy) {
    showToast(t('portal_upload_in_progress') || 'An upload is already in progress.', 'warning');
    return;
  }
  portalPath = path;
  portalPage = 1;
  updatePortalUrl(path, replace);
  renderPortalBreadcrumbs();
  if (portalCanDownload()) {
    loadPortalFiles();
  }
}

function renderPortalBreadcrumbs() {
  const el = qs('portalBreadcrumbs');
  if (!el) return;
  el.innerHTML = '';

  if (!portal) return;

  const rootLabel = (portal.title && portal.title.trim())
    ? portal.title.trim()
    : (portal.label || portal.slug || 'Portal');

  const rootLink = document.createElement('a');
  rootLink.href = buildPortalUrl('');
  rootLink.textContent = rootLabel;
  rootLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (portalPath) {
      navigatePortalPath('', { replace: false });
    }
  });
  el.appendChild(rootLink);

  if (!portal.allowSubfolders || !portalPath) return;

  const parts = portalPath.split('/').filter(Boolean);
  let acc = '';
  parts.forEach((part) => {
    acc = acc ? acc + '/' + part : part;
    const sep = document.createElement('span');
    sep.className = 'portal-breadcrumb-sep';
    sep.textContent = '/';
    el.appendChild(sep);

    const link = document.createElement('a');
    link.href = buildPortalUrl(acc);
    link.textContent = part;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigatePortalPath(acc, { replace: false });
    });
    el.appendChild(link);
  });
}

function portalSourceId() {
  if (!portal) return '';
  const raw = portal.sourceId || portal.source || '';
  return typeof raw === 'string' ? raw.trim() : '';
}

function portalCanUpload() {
  if (!portal) return false;

  // Prefer explicit flags from backend (PortalController)
  if (typeof portal.canUpload !== 'undefined') {
    return !!portal.canUpload;
  }

  // Fallbacks for older bundles 
  if (typeof portal.allowUpload !== 'undefined') {
    return !!portal.allowUpload;
  }

  // Legacy behavior: portals were always upload-capable;
  // uploadOnly only controlled download visibility.
  return true;
}

function portalCanDownload() {
  if (!portal) return false;

  // Prefer explicit flag if present (PortalController)
  if (typeof portal.canDownload !== 'undefined') {
    return !!portal.canDownload;
  }

  // Fallback to allowDownload / allowDownloads (older payloads)
  if (typeof portal.allowDownload !== 'undefined') {
    return !!portal.allowDownload;
  }
  if (typeof portal.allowDownloads !== 'undefined') {
    return !!portal.allowDownloads;
  }

  // Legacy: uploadOnly = true => no downloads
  if (typeof portal.uploadOnly !== 'undefined') {
    return !portal.uploadOnly;
  }

  // Default: allow downloads
  return true;
}

function getPortalSlug() {
  return portal && (portal.slug || portal.label || '') || '';
}

function normalizeExtList(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[,\s]+/)
    .map(x => x.trim().replace(/^\./, '').toLowerCase())
    .filter(Boolean);
}

function getAllowedExts() {
  if (!portal || !portal.uploadExtWhitelist) return [];
  return normalizeExtList(portal.uploadExtWhitelist);
}

function getMaxSizeBytes() {
  if (!portal || !portal.uploadMaxSizeMb) return 0;
  const n = parseInt(portal.uploadMaxSizeMb, 10);
  if (!n || n <= 0) return 0;
  return n * 1024 * 1024;
}

// Simple per-browser-per-day counter; not true IP-based.
function applyUploadRateLimit(desiredCount) {
  if (!portal || !portal.uploadMaxPerDay) return desiredCount;

  const maxPerDay = parseInt(portal.uploadMaxPerDay, 10);
  if (!maxPerDay || maxPerDay <= 0) return desiredCount;

  const slug = getPortalSlug() || 'default';
  const today = new Date().toISOString().slice(0, 10);
  const key = 'portalUploadRate:' + slug;

  let state = { date: today, count: 0 };
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.date === today && typeof parsed.count === 'number') {
        state = parsed;
      }
    }
  } catch (e) {
    // ignore
  }

  if (state.count >= maxPerDay) {
    showToast(t('portal_upload_limit_reached') || 'Daily upload limit reached for this portal.', 'warning');
    return 0;
  }

  const remaining = maxPerDay - state.count;
  if (desiredCount > remaining) {
    showToast(t('portal_upload_limit_remaining', { count: remaining }) || ('You can only upload ' + remaining + ' more file(s) today for this portal.'), 'warning');
    return remaining;
  }

  return desiredCount;
}

function bumpUploadRateCounter(delta) {
  if (!portal || !portal.uploadMaxPerDay || !delta) return;

  const maxPerDay = parseInt(portal.uploadMaxPerDay, 10);
  if (!maxPerDay || maxPerDay <= 0) return;

  const slug = getPortalSlug() || 'default';
  const today = new Date().toISOString().slice(0, 10);
  const key = 'portalUploadRate:' + slug;

  let state = { date: today, count: 0 };
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.date === today && typeof parsed.count === 'number') {
        state = parsed.date === today ? parsed : state;
      }
    }
  } catch (e) {
    // ignore
  }

  if (state.date !== today) {
    state = { date: today, count: 0 };
  }

  state.count += delta;
  if (state.count < 0) state.count = 0;

  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch (e) {
    // ignore
  }
}

function showThankYouScreen() {
  if (!portal || !portal.showThankYou) return;

  const section = qs('portalThankYouSection');
  const msgEl   = document.getElementById('portalThankYouMessage');
  const refEl   = document.getElementById('portalThankYouRef');
  const upload  = qs('portalUploadSection');

  if (msgEl) {
    const text =
      (portal.thankYouText && portal.thankYouText.trim()) ||
      (t('portal_thankyou_default') || 'Your files have been uploaded successfully.');
    msgEl.textContent = text;
  }

  if (refEl) {
    const showRef = !!portal.thankYouShowRef;
    const ref = showRef ? getPortalSubmissionRef() : '';
    if (ref) {
      refEl.textContent = 'Submission ID: ' + ref;
      refEl.style.display = 'block';
    } else {
      refEl.textContent = '';
      refEl.style.display = 'none';
    }
  }

  if (section) {
    section.style.display = 'block';
  }
  if (upload) {
    upload.style.opacity = '0.3';
  }
}

// ----------------- DOM helpers / status -----------------
function qs(id) {
  return document.getElementById(id);
}

function setStatus(msg, isError = false) {
  const el = qs('portalStatus');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('text-danger', !!isError);
  el.classList.toggle('text-muted', !isError);
}

function setUploadProgress(pct) {
  const wrap = qs('portalUploadProgress');
  const bar = qs('portalUploadProgressBar');
  if (!wrap || !bar) return;
  const safe = Math.max(0, Math.min(100, Math.round(pct)));
  wrap.classList.add('is-visible');
  wrap.classList.remove('is-indeterminate');
  bar.style.width = safe + '%';
  wrap.setAttribute('aria-valuenow', String(safe));
}

function setUploadProgressIndeterminate() {
  const wrap = qs('portalUploadProgress');
  const bar = qs('portalUploadProgressBar');
  if (!wrap || !bar) return;
  wrap.classList.add('is-visible');
  wrap.classList.add('is-indeterminate');
  bar.style.width = '40%';
  wrap.removeAttribute('aria-valuenow');
}

function resetUploadProgress() {
  const wrap = qs('portalUploadProgress');
  const bar = qs('portalUploadProgressBar');
  if (!wrap || !bar) return;
  wrap.classList.remove('is-visible');
  wrap.classList.remove('is-indeterminate');
  bar.style.width = '0%';
  wrap.removeAttribute('aria-valuenow');
}

// ----------------- Form labels (custom captions) -----------------
function applyPortalFormLabels() {
  if (!portal) return;

  const labels   = portal.formLabels  || {};
  const required = portal.formRequired || {};

  const defs = [
    { key: 'name',      forId: 'portalFormName',      defaultLabel: t('portal_form_label_name') || 'Name' },
    { key: 'email',     forId: 'portalFormEmail',     defaultLabel: t('portal_form_label_email') || 'Email' },
    { key: 'reference', forId: 'portalFormReference', defaultLabel: t('portal_form_label_reference') || 'Reference / Case / Order #' },
    { key: 'notes',     forId: 'portalFormNotes',     defaultLabel: t('portal_form_label_notes') || 'Notes' },
  ];

  defs.forEach(def => {
    const labelEl = document.querySelector(`label[for="${def.forId}"]`);
    if (!labelEl) return;

    const base = (labels[def.key] || def.defaultLabel || '').trim() || def.defaultLabel;
    const isRequired = !!required[def.key];

    // Add a subtle "*" for required fields; skip if already added
    const text = isRequired && !base.endsWith('*') ? `${base} *` : base;
    labelEl.textContent = text;
  });
}

// ----------------- Form submit -----------------
async function submitPortalForm(slug, formData) {
  const payload = {
    slug,
    form: formData
  };
  const submissionRef = getPortalSubmissionRef();
  if (submissionRef) {
    payload.submissionRef = submissionRef;
  }
  const headers = { 'X-CSRF-Token': getCsrfToken() || '' };
  const res = await sendRequest('/api/pro/portals/submitForm.php', 'POST', payload, headers);
  if (!res || !res.success) {
    throw new Error((res && res.error) || t('portal_form_error_save') || 'Error saving form.');
  }
  if (res && res.submissionRef) {
    setPortalSubmissionRef(res.submissionRef);
  }
  return res && res.submissionRef ? res.submissionRef : submissionRef;
}

// ----------------- Toast -----------------
function showToast(message, durationOrTone = 2500, maybeTone) {
  const toast = document.getElementById('customToast');
  if (!toast) {
    console.warn('Toast:', message);
    return;
  }
  const text = (message == null) ? '' : String(message);
  let tone = '';
  let timeoutMs = 2500;

  if (typeof durationOrTone === 'number') {
    timeoutMs = durationOrTone;
  } else if (typeof durationOrTone === 'string') {
    tone = durationOrTone;
  }

  if (typeof maybeTone === 'string') {
    tone = maybeTone;
  } else if (typeof maybeTone === 'number' && typeof durationOrTone === 'string') {
    timeoutMs = maybeTone;
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    timeoutMs = 2500;
  }
  if (tone) {
    toast.dataset.tone = tone;
  } else {
    toast.removeAttribute('data-tone');
  }

  toast.textContent = text;
  toast.title = text.length > 160 ? text : '';
  toast.style.display = 'block';
  // Force reflow
  void toast.offsetWidth;
  toast.classList.add('show');

  if (toast.__hideTimer) clearTimeout(toast.__hideTimer);
  if (toast.__hideCleanupTimer) clearTimeout(toast.__hideCleanupTimer);

  toast.__hideTimer = setTimeout(() => {
    toast.classList.remove('show');
    toast.__hideCleanupTimer = setTimeout(() => {
      toast.style.display = 'none';
    }, 200);
  }, timeoutMs);
}

// ----------------- Fetch wrapper -----------------
async function sendRequest(url, method = 'GET', data = null, customHeaders = {}) {
  const options = {
    method,
    credentials: 'include',
    headers: { ...customHeaders }
  };

  if (data && !(data instanceof FormData)) {
    options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';
    options.body = JSON.stringify(data);
  } else if (data instanceof FormData) {
    options.body = data;
  }

  const res = await fetch(url, options);
  const text = await res.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (e) {
    payload = text;
  }
  if (!res.ok) {
    throw payload;
  }
  return payload;
}

// ----------------- Portal form wiring -----------------
function setupPortalForm(slug) {
  const formSection   = qs('portalFormSection');
  const uploadSection = qs('portalUploadSection');

  if (!portal || !portal.requireForm || !portalCanUpload()) {
    if (formSection) formSection.style.display = 'none';
    if (uploadSection) uploadSection.style.opacity = '1';
    return;
  }

  const key = 'portalFormDone:' + slug;
  if (sessionStorage.getItem(key) === '1') {
    portalFormDone = true;
    if (formSection) formSection.style.display = 'none';
    if (uploadSection) uploadSection.style.opacity = '1';
    return;
  }

  portalFormDone = false;
  if (formSection) formSection.style.display = 'block';
  if (uploadSection) uploadSection.style.opacity = '0.5';

  const nameEl    = qs('portalFormName');
  const emailEl   = qs('portalFormEmail');
  const refEl     = qs('portalFormReference');
  const notesEl   = qs('portalFormNotes');
  const submitBtn = qs('portalFormSubmit');

  const groupName      = qs('portalFormGroupName');
  const groupEmail     = qs('portalFormGroupEmail');
  const groupReference = qs('portalFormGroupReference');
  const groupNotes     = qs('portalFormGroupNotes');

  const labelName      = qs('portalFormLabelName');
  const labelEmail     = qs('portalFormLabelEmail');
  const labelReference = qs('portalFormLabelReference');
  const labelNotes     = qs('portalFormLabelNotes');

  const fd     = portal.formDefaults || {};
  const labels = portal.formLabels   || {};
  const visRaw = portal.formVisible  || portal.formVisibility || {};
  const req    = portal.formRequired || {};

  // default: visible when not specified
  const visible = {
    name:      visRaw.name      !== false,
    email:     visRaw.email     !== false,
    reference: visRaw.reference !== false,
    notes:     visRaw.notes     !== false,
  };

  // Apply labels (fallback to defaults)
  if (labelName)      labelName.textContent      = labels.name      || t('portal_form_label_name') || 'Name';
  if (labelEmail)     labelEmail.textContent     = labels.email     || t('portal_form_label_email') || 'Email';
  if (labelReference) labelReference.textContent = labels.reference || t('portal_form_label_reference') || 'Reference / Case / Order #';
  if (labelNotes)     labelNotes.textContent     = labels.notes     || t('portal_form_label_notes') || 'Notes';

  // Helper to (re)add the required star spans
  const setStar = (labelEl, isVisible, isRequired) => {
    if (!labelEl) return;
    // remove any previous star
    const old = labelEl.querySelector('.portal-required-star');
    if (old) old.remove();
    if (isVisible && isRequired) {
      const s = document.createElement('span');
      s.className = 'portal-required-star';
      s.textContent = ' *';
      labelEl.appendChild(s);
    }
  };

  // Show/hide groups
  if (groupName)      groupName.style.display      = visible.name      ? '' : 'none';
  if (groupEmail)     groupEmail.style.display     = visible.email     ? '' : 'none';
  if (groupReference) groupReference.style.display = visible.reference ? '' : 'none';
  if (groupNotes)     groupNotes.style.display     = visible.notes     ? '' : 'none';

  // Apply stars AFTER labels and visibility
  setStar(labelName,      visible.name,      !!req.name);
  setStar(labelEmail,     visible.email,     !!req.email);
  setStar(labelReference, visible.reference, !!req.reference);
  setStar(labelNotes,     visible.notes,     !!req.notes);

  // If literally no fields are visible, just treat as no form
  if (!visible.name && !visible.email && !visible.reference && !visible.notes) {
    portalFormDone = true;
    sessionStorage.setItem(key, '1');
    if (formSection) formSection.style.display = 'none';
    if (uploadSection) uploadSection.style.opacity = '1';
    return;
  }

  // Prefill defaults only for visible fields
  if (nameEl && visible.name && fd.name && !nameEl.value) {
    nameEl.value = fd.name;
  }
  if (emailEl && visible.email) {
    if (fd.email && !emailEl.value) {
      emailEl.value = fd.email;
    } else if (portal.clientEmail && !emailEl.value) {
      emailEl.value = portal.clientEmail;
    }
  }
  if (refEl && visible.reference && fd.reference && !refEl.value) {
    refEl.value = fd.reference;
  }
  if (notesEl && visible.notes && fd.notes && !notesEl.value) {
    notesEl.value = fd.notes;
  }

  if (!submitBtn) return;

  submitBtn.onclick = async () => {
    const name      = nameEl ? nameEl.value.trim()  : '';
    const email     = emailEl ? emailEl.value.trim() : '';
    const reference = refEl ? refEl.value.trim()    : '';
    const notes     = notesEl ? notesEl.value.trim() : '';

    const missing = [];

    // Only validate visible fields
    if (visible.name      && req.name      && !name)      missing.push(labels.name      || t('portal_form_label_name') || 'Name');
    if (visible.email     && req.email     && !email)     missing.push(labels.email     || t('portal_form_label_email') || 'Email');
    if (visible.reference && req.reference && !reference) missing.push(labels.reference || t('portal_form_label_reference') || 'Reference');
    if (visible.notes     && req.notes     && !notes)     missing.push(labels.notes     || t('portal_form_label_notes') || 'Notes');

    if (missing.length) {
      showToast(t('portal_form_missing_fields', { fields: missing.join(', ') }) || ('Please fill in: ' + missing.join(', ') + '.'), 'warning');
      return;
    }

    // default behavior when no specific required flags:
    // at least name or email, but only if those fields are visible
    if (!req.name && !req.email && !req.reference && !req.notes) {
      const hasNameField  = visible.name;
      const hasEmailField = visible.email;
      if ((hasNameField || hasEmailField) && !name && !email) {
        showToast(t('portal_form_require_one') || 'Please provide at least a name or email.', 'warning');
        return;
      }
    }

    try {
      await submitPortalForm(slug, { name, email, reference, notes });
      portalFormDone = true;
      sessionStorage.setItem(key, '1');
      if (formSection) formSection.style.display = 'none';
      if (uploadSection) uploadSection.style.opacity = '1';
      showToast(t('portal_form_thanks_ready') || 'Thank you. You can now upload files.', 'success');
    } catch (e) {
      console.error(e);
      showToast(t('portal_form_save_failed') || 'Error saving your info. Please try again.', 'error');
    }
  };
}

// ----------------- CSRF helpers -----------------
function setCsrfToken(token) {
  if (!token) return;
  window.csrfToken = token;
  try {
    localStorage.setItem('csrf', token);
  } catch (e) {
    // ignore
  }
  let meta = document.querySelector('meta[name="csrf-token"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'csrf-token';
    document.head.appendChild(meta);
  }
  meta.content = token;
}

function getCsrfToken() {
  return window.csrfToken || (document.querySelector('meta[name="csrf-token"]')?.content) || '';
}

async function loadCsrfToken() {
  const res = await fetch('/api/auth/token.php', { method: 'GET', credentials: 'include' });

  const hdr = res.headers.get('X-CSRF-Token');
  if (hdr) setCsrfToken(hdr);

  let body = {};
  try {
    body = await res.json();
  } catch (e) {
    body = {};
  }

  const token = body.csrf_token || getCsrfToken();
  setCsrfToken(token);
}

// ----------------- Auth -----------------
async function ensureAuthenticated() {
  try {
    const data = await sendRequest('/api/auth/checkAuth.php', 'GET');
    if (!data || !data.username) {
      // redirect to main UI/login; after login, user can re-open portal link
      const target = encodeURIComponent(window.location.href);
      window.location.href = withBase('/portal-login.html?redirect=' + target);
      return null;
    }
    const lbl = qs('portalUserLabel');
    if (lbl) {
      lbl.textContent = data.username || '';
    }
    return data;
  } catch (e) {
    const target = encodeURIComponent(window.location.href);
    window.location.href = withBase('/portal-login.html?redirect=' + target);
    return null;
  }
}

// ----------------- Portal fetch + render -----------------
async function fetchPortal(slug) {
  setStatus(t('portal_loading_details') || 'Loading portal details…');
  try {
    const data = await sendRequest('/api/pro/portals/get.php?slug=' + encodeURIComponent(slug), 'GET');
    if (!data || !data.success || !data.portal) {
      throw new Error((data && data.error) || t('portal_not_found') || 'Portal not found.');
    }
    portal = data.portal;
    return portal;
  } catch (e) {
    console.error(e);
    setStatus(t('portal_status_not_found') || 'This portal could not be found or is no longer available.', true);
    showToast(t('portal_toast_not_found') || 'Portal not found or expired.', 'error');
    return null;
  }
}

function renderPortalInfo() {
  if (!portal) return;
  const titleEl    = qs('portalTitle');
  const descEl     = qs('portalDescription');
  const subtitleEl = qs('portalSubtitle');
  const brandEl    = document.getElementById('portalBrandHeading');
  const footerEl   = document.getElementById('portalFooter');
  const drop       = qs('portalDropzone');
  const card       = document.querySelector('.portal-card');
  const logoImg = document.querySelector('.portal-logo img');
  const formBtn    = qs('portalFormSubmit');
  const refreshBtn = qs('portalRefreshBtn');
  const filesSection = qs('portalFilesSection');

  const heading = portal.title && portal.title.trim()
    ? portal.title.trim()
    : (portal.label || portal.slug || (t('portal_label_default') || 'Client portal'));

  if (titleEl)  titleEl.textContent  = heading;
  if (brandEl)  brandEl.textContent  = heading;
  try {
    document.title = heading;
  } catch (e) { /* ignore */ }

  if (descEl) {
    if (portal.introText && portal.introText.trim()) {
      descEl.textContent = portal.introText.trim();
    } else {
      const folder = portalTargetFolder();
      descEl.textContent = t('portal_desc_uploads_to', { folder }) || ('Files you upload here go directly into: ' + folder);
    }

    const bits = [];

    if (portal.uploadMaxSizeMb) {
      bits.push(t('portal_desc_max_file_size', { size: portal.uploadMaxSizeMb }) || ('Max file size: ' + portal.uploadMaxSizeMb + ' MB'));
    }

    const exts = getAllowedExts();
    if (exts.length) {
      bits.push(t('portal_desc_allowed_types', { types: exts.join(', ') }) || ('Allowed types: ' + exts.join(', ')));
    }

    if (portal.uploadMaxPerDay) {
      bits.push(t('portal_desc_daily_limit', { count: portal.uploadMaxPerDay }) || ('Daily upload limit: ' + portal.uploadMaxPerDay + ' file(s)'));
    }

    if (bits.length) {
      descEl.textContent += ' (' + bits.join(' • ') + ')';
    }
  }

  const buildPortalLogoUrl = (fileName) =>
    fileName ? `/api/public/profilePic.php?file=${encodeURIComponent(fileName)}` : '';

  let portalLogoUrl = '';
  if (portal.logoUrl && portal.logoUrl.trim()) {
    portalLogoUrl = portal.logoUrl.trim();
  } else if (portal.logoFile && portal.logoFile.trim()) {
    portalLogoUrl = buildPortalLogoUrl(portal.logoFile.trim());
  }

  const legacyMatch = portalLogoUrl.match(/\/uploads\/profile_pics\/([^?#]+)/);
  if (legacyMatch && legacyMatch[1]) {
    let legacyName = legacyMatch[1];
    try { legacyName = decodeURIComponent(legacyName); } catch (e) {}
    portalLogoUrl = buildPortalLogoUrl(legacyName);
  }

  if (logoImg && portalLogoUrl) {
    logoImg.src = portalLogoUrl.startsWith('/') ? withBase(portalLogoUrl) : portalLogoUrl;
  }

  const hasBrandIcon = !!(
    portalBranding &&
    (portalBranding.faviconSvg || portalBranding.faviconPng || portalBranding.faviconIco || portalBranding.appleTouchIcon || portalBranding.maskIcon)
  );
  if (hasBrandIcon) {
    clearPortalFaviconFallback();
  } else if (portalLogoUrl) {
    applyPortalFaviconFallback(portalLogoUrl);
  }

  const uploadsEnabled   = portalCanUpload();
  const downloadsEnabled = portalCanDownload();

  if (subtitleEl) {
    let text = '';
    if (uploadsEnabled && downloadsEnabled) {
      text = t('portal_mode_upload_download') || 'Upload & download';
    } else if (uploadsEnabled && !downloadsEnabled) {
      text = t('portal_mode_upload_only') || 'Upload only';
    } else if (!uploadsEnabled && downloadsEnabled) {
      text = t('portal_mode_download_only') || 'Download only';
    } else {
      text = t('portal_mode_access_only') || 'Access only';
    }
    subtitleEl.textContent = text;
  }

  if (footerEl) {
    footerEl.textContent = portal.footerText && portal.footerText.trim()
      ? portal.footerText.trim()
      : '';
  }

  if (!portal.allowSubfolders && portalPath) {
    portalPath = '';
    updatePortalUrl('', true);
  }

  const formSection   = qs('portalFormSection');
  const uploadSection = qs('portalUploadSection');

  // If uploads are disabled, hide upload + form (form is only meaningful for uploads)
  if (!uploadsEnabled) {
    if (formSection) {
      formSection.style.display = 'none';
    }
    if (uploadSection) {
      uploadSection.style.display = 'none';
    }

    const statusEl = qs('portalStatus');
    if (statusEl) {
      statusEl.textContent = t('portal_uploads_disabled') || 'Uploads are disabled for this portal.';
      statusEl.classList.remove('text-muted');
      statusEl.classList.add('text-warning');
    }
  }
  applyPortalFormLabels();
  const color = portal.brandColor && portal.brandColor.trim();
  if (color) {
    // expose brand color as a CSS variable for gallery styling
    document.documentElement.style.setProperty('--portal-accent', color);
    setPortalCssVar('--portal-accent-contrast', getPortalAccentContrast(color));

    if (drop) {
      drop.style.borderColor = color;
    }
    if (card) {
      card.style.borderTop = '3px solid ' + color;
    }
    if (formBtn) {
      formBtn.style.backgroundColor = color;
      formBtn.style.borderColor = color;
    }
    if (refreshBtn) {
      refreshBtn.style.borderColor = '';
      refreshBtn.style.color = '';
    }
  } else {
    setPortalCssVar('--portal-accent-contrast', '');
  }

  applyPortalThemeOverrides();

  // Show/hide files section based on download capability
  if (filesSection) {
    filesSection.style.display = portalCanDownload() ? 'block' : 'none';
  }

  renderPortalBreadcrumbs();
}

// ----------------- File helpers for gallery -----------------
function formatFileSizeLabel(f) {
  if (!f) return '';
  if (typeof f.size === 'string' && f.size.trim()) return f.size.trim();
  if (typeof f.size === 'number' && Number.isFinite(f.size)) {
    return formatBytes(f.size);
  }
  return '';
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(1) + ' GB';
}

function formatDateLabel(value) {
  if (!value) return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ts = value < 1000000000000 ? value * 1000 : value;
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
  }
  if (typeof value === 'string') return value;
  return '';
}

function fileExtLabel(name) {
  const fallback = t('portal_file_badge') || 'FILE';
  if (!name) return fallback;
  const parts = name.split('.');
  if (parts.length < 2) return fallback;
  const ext = parts.pop().trim().toUpperCase();
  if (!ext) return fallback;
  return ext.length <= 4 ? ext : ext.slice(0, 4);
}

function isImageName(name) {
  if (!name) return false;
  return /\.(jpe?g|png|gif|bmp|webp)$/i.test(name);
}

function updatePortalViewToggle() {
  const btn = qs('portalViewToggleBtn');
  if (!btn) return;
  const isGallery = portalViewMode === 'gallery';
  btn.textContent = isGallery ? 'List' : 'Gallery';
  btn.setAttribute('aria-pressed', isGallery ? 'true' : 'false');
}

function updatePortalFilesCount() {
  const el = qs('portalFilesCount');
  if (!el) return;
  if (!Number.isFinite(portalFilesTotalEntries)) {
    el.textContent = '';
    return;
  }
  let label = portalFilesTotalEntries + ' item' + (portalFilesTotalEntries === 1 ? '' : 's');
  if (Number.isFinite(portalFilesTotalFiles) && portalFilesTotalFiles > 0 && portalFilesTotalFiles !== portalFilesTotalEntries) {
    label += ' • ' + portalFilesTotalFiles + ' file' + (portalFilesTotalFiles === 1 ? '' : 's');
  }
  el.textContent = label;
}

function setPortalView(mode) {
  portalViewMode = (mode === 'gallery') ? 'gallery' : 'list';
  updatePortalViewToggle();
  renderPortalFiles(portalFilesCache);
}

function portalArchiveName() {
  const base = (portal && (portal.title || portal.label || portal.slug)) ? String(portal.title || portal.label || portal.slug) : 'portal-files';
  const cleaned = base.trim().replace(/[^A-Za-z0-9._-]/g, '_').replace(/_+/g, '_');
  return cleaned || 'portal-files';
}

function renderPortalList(listEl, files) {
  const folder = portalTargetFolder();
  const portalSlug = getPortalSlug();
  const sourceId = portalSourceId();
  const sourceParam = sourceId ? '&sourceId=' + encodeURIComponent(sourceId) : '';
  const submissionRef = getPortalSubmissionRef();
  const submissionRefParam = submissionRef ? '&submissionRef=' + encodeURIComponent(submissionRef) : '';
  const accent = portal && portal.brandColor && portal.brandColor.trim();
  const canDownload = portalCanDownload();

  files.forEach(f => {
    const entryType = (f && f.type) ? String(f.type) : 'file';
    const isFolder = entryType === 'folder';
    const name = f.name || (t('portal_file_unnamed') || 'Unnamed file');
    const nextPath = joinPortalPath(portalPath, name);

    const row = document.createElement('div');
    row.className = 'portal-file-row' + (isFolder ? ' portal-file-row-folder' : '');

    const nameCell = document.createElement('div');
    nameCell.className = 'portal-file-cell portal-file-cell-name';

    const icon = document.createElement('div');
    icon.className = 'portal-file-icon';
    if (isFolder) {
      icon.classList.add('is-folder');
      icon.textContent = 'DIR';
    } else {
      icon.textContent = fileExtLabel(name);
    }
    if (accent) {
      icon.style.borderColor = accent;
    }

    let nameEl;
    if (isFolder) {
      nameEl = document.createElement('a');
      nameEl.className = 'portal-file-link portal-folder-link';
      nameEl.textContent = name;
      nameEl.href = buildPortalUrl(nextPath);
      nameEl.addEventListener('click', (e) => {
        e.preventDefault();
        navigatePortalPath(nextPath);
      });
    } else {
      nameEl = document.createElement(canDownload ? 'a' : 'div');
      nameEl.className = 'portal-file-link';
      nameEl.textContent = name;
      if (canDownload) {
        nameEl.href = withBase(
          '/api/file/download.php?folder=' +
          encodeURIComponent(folder) +
          '&file=' + encodeURIComponent(name) +
          '&source=portal' +
          (portalSlug ? '&portal=' + encodeURIComponent(portalSlug) : '') +
          submissionRefParam +
          sourceParam
        );
        nameEl.target = '_blank';
        nameEl.rel = 'noopener';
      }
    }

    nameCell.appendChild(icon);
    nameCell.appendChild(nameEl);

    const sizeCell = document.createElement('div');
    sizeCell.className = 'portal-file-cell portal-file-cell-size';
    sizeCell.textContent = isFolder ? '-' : (formatFileSizeLabel(f) || '');

    const modifiedCell = document.createElement('div');
    modifiedCell.className = 'portal-file-cell portal-file-cell-modified';
    modifiedCell.textContent = formatDateLabel(f.modified) || '';

    const actions = document.createElement('div');
    actions.className = 'portal-file-cell portal-file-cell-actions';
    if (isFolder) {
      const openBtn = document.createElement('a');
      openBtn.href = buildPortalUrl(nextPath);
      openBtn.textContent = t('open') || 'Open';
      openBtn.className = 'portal-file-action';
      openBtn.addEventListener('click', (e) => {
        e.preventDefault();
        navigatePortalPath(nextPath);
      });
      actions.appendChild(openBtn);
    } else if (canDownload) {
      const a = document.createElement('a');
      a.href = withBase(
        '/api/file/download.php?folder=' +
        encodeURIComponent(folder) +
        '&file=' + encodeURIComponent(name) +
        '&source=portal' +
        (portalSlug ? '&portal=' + encodeURIComponent(portalSlug) : '') +
        submissionRefParam +
        sourceParam
      );
      a.textContent = t('download') || 'Download';
      a.className = 'portal-file-action portal-file-action-primary';
      a.target = '_blank';
      a.rel = 'noopener';
      actions.appendChild(a);
    }

    row.appendChild(nameCell);
    row.appendChild(sizeCell);
    row.appendChild(modifiedCell);
    row.appendChild(actions);
    listEl.appendChild(row);
  });
}

function renderPortalGallery(listEl, files) {
  const folder = portalTargetFolder();
  const portalSlug = getPortalSlug();
  const sourceId = portalSourceId();
  const sourceParam = sourceId ? '&sourceId=' + encodeURIComponent(sourceId) : '';
  const submissionRef = getPortalSubmissionRef();
  const submissionRefParam = submissionRef ? '&submissionRef=' + encodeURIComponent(submissionRef) : '';
  const accent = portal && portal.brandColor && portal.brandColor.trim();
  const canDownload = portalCanDownload();

  files.forEach(f => {
    const entryType = (f && f.type) ? String(f.type) : 'file';
    const isFolder = entryType === 'folder';
    const name = f.name || (t('portal_file_unnamed') || 'Unnamed file');
    const nextPath = joinPortalPath(portalPath, name);

    const card = document.createElement('div');
    card.className = 'portal-file-card' + (isFolder ? ' portal-file-card-folder' : '');

    const icon = document.createElement('div');
    icon.className = 'portal-file-card-icon';
    if (isFolder) {
      icon.classList.add('is-folder');
    }

    const main = document.createElement('div');
    main.className = 'portal-file-card-main';

    const nameEl = document.createElement('div');
    nameEl.className = 'portal-file-card-name';
    nameEl.textContent = name;

    const metaEl = document.createElement('div');
    metaEl.className = 'portal-file-card-meta';
    metaEl.textContent = isFolder ? (t('folder') || 'Folder') : formatFileSizeLabel(f);

    main.appendChild(nameEl);
    main.appendChild(metaEl);

    const actions = document.createElement('div');
    actions.className = 'portal-file-card-actions';

    if (!isFolder && isImageName(name)) {
      const thumbUrl = withBase(
        '/api/file/download.php?folder=' +
        encodeURIComponent(folder) +
        '&file=' + encodeURIComponent(name) +
        '&inline=1&t=' + Date.now() +
        '&source=portal' +
        (portalSlug ? '&portal=' + encodeURIComponent(portalSlug) : '') +
        sourceParam
      );

      const img = document.createElement('img');
      img.src = thumbUrl;
      img.alt = name;
      img.className = 'portal-file-card-thumb';

      icon.appendChild(img);
    } else {
      icon.textContent = isFolder ? 'DIR' : fileExtLabel(name);
    }

    if (accent) {
      icon.style.borderColor = accent;
    }

    if (isFolder) {
      const openBtn = document.createElement('a');
      openBtn.href = buildPortalUrl(nextPath);
      openBtn.textContent = t('open') || 'Open';
      openBtn.className = 'portal-file-card-download';
      openBtn.addEventListener('click', (e) => {
        e.preventDefault();
        navigatePortalPath(nextPath);
      });
      actions.appendChild(openBtn);
    } else if (canDownload) {
      const a = document.createElement('a');
      a.href = withBase(
        '/api/file/download.php?folder=' +
        encodeURIComponent(folder) +
        '&file=' + encodeURIComponent(name) +
        '&source=portal' +
        (portalSlug ? '&portal=' + encodeURIComponent(portalSlug) : '') +
        submissionRefParam +
        sourceParam
      );
      a.textContent = t('download') || 'Download';
      a.className = 'portal-file-card-download';
      a.target = '_blank';
      a.rel = 'noopener';
      actions.appendChild(a);
    }

    card.appendChild(icon);
    card.appendChild(main);
    card.appendChild(actions);
    listEl.appendChild(card);
  });
}

function renderPortalFiles(files) {
  const listEl = qs('portalFilesList');
  if (!listEl) return;

  const items = Array.isArray(files) ? files : [];
  portalFilesCache = items;
  updatePortalFilesCount();

  const downloadAllBtn = qs('portalDownloadAllBtn');
  if (downloadAllBtn) {
    downloadAllBtn.disabled = portalZipBusy || portalDownloadAllDisabled || portalFilesTotalFiles === 0;
    if (!portalDownloadAllDisabled && downloadAllBtn.hasAttribute('title')) {
      downloadAllBtn.removeAttribute('title');
    }
  }

  if (!items.length) {
    listEl.classList.remove('portal-files-grid');
    listEl.innerHTML = '<div class="text-muted" style="padding:4px 0;">' + (t('portal_files_empty') || 'No items in this folder yet.') + '</div>';
    return;
  }

  listEl.innerHTML = '';
  listEl.classList.toggle('portal-files-grid', portalViewMode === 'gallery');

  if (portalViewMode === 'gallery') {
    renderPortalGallery(listEl, items);
  } else {
    renderPortalList(listEl, items);
  }
}

function setPortalPage(nextPage) {
  const page = Math.max(1, Math.min(portalFilesTotalPages || 1, nextPage));
  if (page === portalPage) return;
  portalPage = page;
  loadPortalFiles();
}

function renderPortalPagination() {
  const el = qs('portalPagination');
  if (!el) return;

  el.innerHTML = '';

  if (!portalCanDownload() || portalFilesTotalPages <= 1) {
    el.style.display = 'none';
    return;
  }

  el.style.display = 'flex';

  const makeBtn = (label, page, disabled, active) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'portal-page-btn' + (active ? ' is-active' : '');
    btn.textContent = label;
    if (disabled) {
      btn.disabled = true;
    } else {
      btn.addEventListener('click', () => setPortalPage(page));
    }
    return btn;
  };

  el.appendChild(makeBtn('Prev', portalPage - 1, portalPage <= 1, false));

  const startPage = Math.max(1, portalPage - 2);
  const endPage = Math.min(portalFilesTotalPages, portalPage + 2);
  for (let i = startPage; i <= endPage; i++) {
    el.appendChild(makeBtn(String(i), i, false, i === portalPage));
  }

  el.appendChild(makeBtn('Next', portalPage + 1, portalPage >= portalFilesTotalPages, false));
}

async function pollPortalZipStatus(statusUrl, downloadUrl, archiveName) {
  const baseStatusUrl = withBase(statusUrl);
  const baseDownloadUrl = withBase(downloadUrl);
  const targetUrl = baseDownloadUrl + (baseDownloadUrl.includes('?') ? '&' : '?') + 'name=' + encodeURIComponent(archiveName);

  while (true) {
    await new Promise(resolve => setTimeout(resolve, 1200));
    const statusUrlWithCache = baseStatusUrl + (baseStatusUrl.includes('?') ? '&' : '?') + '_=' + Date.now();
    const status = await fetch(statusUrlWithCache, { credentials: 'include', cache: 'no-store' })
      .then(r => r.json());

    if (status.error) {
      throw status;
    }

    if (status.ready || status.status === 'done') {
      setStatus(t('portal_download_ready') || 'Download ready.');
      window.location.href = targetUrl;
      return;
    }

    if (status.status === 'error') {
      throw new Error(status.error || (t('portal_files_error') || 'Error loading files.'));
    }

    if (typeof status.pct === 'number') {
      setStatus((t('portal_download_preparing') || 'Preparing download…') + ' ' + status.pct + '%');
    } else {
      setStatus(t('portal_download_preparing') || 'Preparing download…');
    }
  }
}

async function fetchPortalAllFileNames() {
  const slug = getPortalSlug();
  if (!slug) return [];
  const params = new URLSearchParams({
    slug,
    path: portalPath || '',
    all: '1'
  });
  const data = await sendRequest(withBase('/api/pro/portals/listEntries.php?' + params.toString()), 'GET');
  return Array.isArray(data.files) ? data.files : [];
}

async function downloadAllPortalFiles() {
  if (!portalCanDownload() || portalZipBusy) return;

  if (!portalFilesTotalFiles) {
    showToast(t('portal_files_empty') || 'No files in this folder yet.', 'warning');
    return;
  }

  portalZipBusy = true;
  const btn = qs('portalDownloadAllBtn');
  if (btn) btn.disabled = true;

  try {
    setStatus(t('portal_download_preparing') || 'Preparing download…');

    const folder = portalTargetFolder();
    const files = await fetchPortalAllFileNames();
    if (!files.length) {
      throw new Error(t('portal_files_empty') || 'No files in this folder yet.');
    }
    const payload = { folder, files, format: 'zip' };
    const sourceId = portalSourceId();
    if (sourceId) {
      payload.sourceId = sourceId;
    }

    const res = await sendRequest('/api/file/downloadZip.php', 'POST', payload, {
      'X-CSRF-Token': getCsrfToken()
    });

    const statusUrl = res && res.statusUrl ? res.statusUrl : '';
    const downloadUrl = res && res.downloadUrl ? res.downloadUrl : '';
    if (!statusUrl || !downloadUrl) {
      throw new Error('Archive response missing status url.');
    }

    await pollPortalZipStatus(statusUrl, downloadUrl, portalArchiveName());
  } catch (err) {
    const msg = (err && err.error) ? err.error : (err && err.message ? err.message : (t('portal_files_error') || 'Error loading files.'));
    setStatus(msg, true);
    showToast(msg, 'error');
    if (btn && /archive operations are not supported|archive downloads are not allowed/i.test(msg)) {
      portalDownloadAllDisabled = true;
      btn.disabled = true;
      btn.title = msg;
    }
  } finally {
    portalZipBusy = false;
    if (btn) btn.disabled = portalZipBusy || portalDownloadAllDisabled || portalFilesCache.length === 0;
  }
}

// ----------------- Load files for portal list/gallery -----------------
async function loadPortalFiles() {
  if (!portal || !portalCanDownload()) return;

  const listEl = qs('portalFilesList');
  if (!listEl) return;

  listEl.innerHTML = '<div class="text-muted" style="padding:4px 0;">' + (t('portal_files_loading') || 'Loading files…') + '</div>';

  try {
    const slug = getPortalSlug();
    if (!slug) {
      throw new Error(t('portal_not_found') || 'Portal not found.');
    }

    const params = new URLSearchParams({
      slug,
      path: portalPath || '',
      page: String(portalPage),
      perPage: String(portalFilesPerPage)
    });

    const data = await sendRequest(withBase('/api/pro/portals/listEntries.php?' + params.toString()), 'GET');
    const entries = Array.isArray(data.entries) ? data.entries : [];

    const totalEntries = Number(data.totalEntries);
    const totalFiles = Number(data.totalFiles);
    const totalPages = Number(data.totalPages);
    const currentPage = Number(data.currentPage);

    portalFilesTotalEntries = Number.isFinite(totalEntries) ? totalEntries : entries.length;
    portalFilesTotalFiles = Number.isFinite(totalFiles) ? totalFiles : 0;
    portalFilesTotalPages = Number.isFinite(totalPages) ? totalPages : 1;
    portalPage = Number.isFinite(currentPage) ? currentPage : portalPage;

    renderPortalFiles(entries);
    renderPortalPagination();
    renderPortalBreadcrumbs();
  } catch (e) {
    console.error(e);
    listEl.innerHTML = '<div class="text-danger" style="padding:4px 0;">' + (t('portal_files_error') || 'Error loading files.') + '</div>';
    portalFilesCache = [];
    portalFilesTotalEntries = 0;
    portalFilesTotalFiles = 0;
    portalFilesTotalPages = 1;
    updatePortalFilesCount();
    renderPortalPagination();
  }
}

// ----------------- Upload -----------------
async function uploadFilesResumable(files) {
  const inst = await initPortalResumable();
  if (!inst) return false;
  if (inst.support === false) return false;

  if (portalResumableBusy) {
    showToast(t('portal_upload_in_progress') || 'An upload is already in progress.', 'warning');
    return true;
  }

  portalResumableBusy = true;
  portalResumableBatch = {
    total: files.length,
    success: 0,
    failed: 0,
    hadProgress: false,
    files: files.slice()
  };

  const uploadFolder = portalTargetFolder();
  const portalSlug = getPortalSlug();
  const sourceId = portalSourceId();
  inst.opts.headers['X-CSRF-Token'] = getCsrfToken() || '';
  inst.opts.query = () => {
    const q = {
      folder: uploadFolder,
      upload_token: getCsrfToken() || '',
      source: 'portal'
    };
    if (portalSlug) {
      q.portal = portalSlug;
    }
    const submissionRef = getPortalSubmissionRef();
    if (submissionRef) {
      q.submissionRef = submissionRef;
    }
    if (sourceId) {
      q.sourceId = sourceId;
    }
    return q;
  };
  inst.cancel();

  for (const file of files) {
    inst.addFile(file);
  }

  const queuedCount = inst.files ? inst.files.length : 0;
  if (!queuedCount) {
    portalResumableBusy = false;
    portalResumableBatch = null;
    return false;
  }

  portalResumableBatch.total = queuedCount;

  setStatus(t('portal_uploading', { count: queuedCount }) || ('Uploading ' + queuedCount + ' file(s)…'));
  setUploadProgress(0);
  inst.upload();
  showToast(t('upload_resumable_started') || 'Resumable upload started...', 'info');
  return true;
}

async function uploadFilesStandard(files) {
  setStatus(t('portal_uploading', { count: files.length }) || ('Uploading ' + files.length + ' file(s)…'));
  setUploadProgressIndeterminate();
  let successCount = 0;
  let failureCount = 0;
  let lastError = '';

  const folder = portalTargetFolder();
  const portalSlug = getPortalSlug();
  const sourceId = portalSourceId();

  for (const file of files) {
    const form = new FormData();

    const csrf = getCsrfToken() || '';

    // Match main upload.js
    form.append('file[]', file);
    form.append('folder', folder);
    form.append('source', 'portal');
    const submissionRef = getPortalSubmissionRef();
    if (submissionRef) {
      form.append('submissionRef', submissionRef);
    }
    if (sourceId) {
      form.append('sourceId', sourceId);
    }
    if (portalSlug) {
      form.append('portal', portalSlug);
    }
    if (csrf) {
      form.append('upload_token', csrf);  // legacy alias, but your controller supports it
    }

    let retried = false;
    while (true) {
      try {
        const resp = await fetch(withBase('/api/upload/upload.php'), {
          method: 'POST',
          credentials: 'include',
          headers: {
            'X-CSRF-Token': csrf || '',
            'X-FR-Source': 'portal'
          },
          body: form
        });

        const text = await resp.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          data = {};
        }

        if (data && data.csrf_expired && data.csrf_token) {
          setCsrfToken(data.csrf_token);
          if (!retried) {
            retried = true;
            continue;
          }
        }

        if (!resp.ok || (data && data.error)) {
          failureCount++;
          const detail = (data && (data.error || data.message)) ? (data.error || data.message) : text;
          if (detail) {
            lastError = String(detail).trim();
          }
          console.error('Upload error:', detail || data || text);
        } else {
          successCount++;
        }
        break;
      } catch (e) {
        console.error('Upload error:', e);
        failureCount++;
        break;
      }
    }
  }

  if (successCount && !failureCount) {
    setStatus(t('portal_upload_success', { count: successCount }) || ('Uploaded ' + successCount + ' file(s).'));
    showToast(t('portal_upload_complete') || 'Upload complete.', 'success');
  } else if (successCount && failureCount) {
    setStatus(t('portal_upload_partial', { count: successCount, failed: failureCount }) || ('Uploaded ' + successCount + ' file(s), ' + failureCount + ' failed.'), true);
    showToast(t('portal_upload_some_failed') || 'Some files failed to upload.', 'warning');
  } else {
    const base = t('portal_upload_failed') || 'Upload failed.';
    const detail = lastError ? (' ' + lastError) : '';
    setStatus(base + detail, true);
    showToast(base + detail, 'error');
  }

  setUploadProgress(100);
  setTimeout(() => resetUploadProgress(), 600);

  // Bump local daily counter by successful uploads
  if (successCount > 0) {
    bumpUploadRateCounter(successCount);
  }

  if (portalCanDownload()) {
    loadPortalFiles();
  }

  // Optional thank-you screen
  if (successCount > 0 && portal.showThankYou) {
    showThankYouScreen();
  }
}

async function uploadFiles(fileList) {
  if (!portal || !fileList || !fileList.length) return;

  resetUploadProgress();

  if (!portalCanUpload()) {
    showToast(t('portal_uploads_disabled') || 'Uploads are disabled for this portal.', 'warning');
    setStatus(t('portal_uploads_disabled') || 'Uploads are disabled for this portal.', true);
    return;
  }

  if (portal.requireForm && !portalFormDone) {
    showToast(t('portal_upload_form_required') || 'Please fill in your details before uploading.', 'warning');
    return;
  }

  let files = Array.from(fileList);
  if (!files.length) return;

  // 1) Filter by max size
  const maxBytes = getMaxSizeBytes();
  if (maxBytes > 0) {
    const tooBigNames = [];
    files = files.filter(f => {
      if (f.size && f.size > maxBytes) {
        tooBigNames.push(f.name || (t('portal_file_unnamed') || 'unnamed'));
        return false;
      }
      return true;
    });
    if (tooBigNames.length) {
      showToast(
        t('portal_upload_skipped_size', { count: tooBigNames.length, size: portal.uploadMaxSizeMb }) ||
          ('Skipped ' + tooBigNames.length + ' file(s) over ' + portal.uploadMaxSizeMb + ' MB.'),
        'warning'
      );
    }
  }

  // 2) Filter by allowed extensions
  const allowedExts = getAllowedExts();
  if (allowedExts.length) {
    const skipped = [];
    files = files.filter(f => {
      const name = f.name || '';
      const parts = name.split('.');
      const ext = parts.length > 1 ? parts.pop().trim().toLowerCase() : '';
      if (!ext || !allowedExts.includes(ext)) {
        skipped.push(name || (t('portal_file_unnamed') || 'unnamed'));
        return false;
      }
      return true;
    });
    if (skipped.length) {
      showToast(
        t('portal_upload_skipped_types', { count: skipped.length, types: allowedExts.join(', ') }) ||
          ('Skipped ' + skipped.length + ' file(s) not matching allowed types: ' + allowedExts.join(', ')),
        'warning'
      );
    }
  }

  if (!files.length) {
    setStatus(t('portal_upload_none_after_rules') || 'No files to upload after applying portal rules.', true);
    return;
  }

  // 3) Rate-limit per day (simple per-browser guard)
  const requestedCount = files.length;
  const allowedCount = applyUploadRateLimit(requestedCount);
  if (!allowedCount) {
    setStatus(t('portal_upload_blocked') || 'Upload blocked by daily limit.', true);
    return;
  }
  if (allowedCount < requestedCount) {
    files = files.slice(0, allowedCount);
  }

  const usedResumable = await uploadFilesResumable(files);
  if (usedResumable) return;

  await uploadFilesStandard(files);
}

// ----------------- Upload UI wiring -----------------
function wireUploadUI() {
  const drop       = qs('portalDropzone');
  const input      = qs('portalFileInput');
  const refreshBtn = qs('portalRefreshBtn');
  const viewBtn    = qs('portalViewToggleBtn');
  const downloadAllBtn = qs('portalDownloadAllBtn');

  const uploadsEnabled   = portalCanUpload();
  const downloadsEnabled = portalCanDownload();

  // Upload UI
  if (drop) {
    if (!uploadsEnabled) {
      // Visually dim + disable clicks
      drop.classList.add('portal-dropzone-disabled');
      drop.style.cursor = 'not-allowed';
    }
  }

  if (uploadsEnabled && drop && input) {
    drop.addEventListener('click', () => input.click());

    input.addEventListener('change', (e) => {
      const files = e.target.files;
      if (files && files.length) {
        uploadFiles(files);
        input.value = '';
      }
    });

    ['dragenter', 'dragover'].forEach(ev => {
      drop.addEventListener(ev, e => {
        e.preventDefault();
        e.stopPropagation();
        drop.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(ev => {
      drop.addEventListener(ev, e => {
        e.preventDefault();
        e.stopPropagation();
        drop.classList.remove('dragover');
      });
    });

    drop.addEventListener('drop', e => {
      const dt = e.dataTransfer;
      if (!dt || !dt.files || !dt.files.length) return;
      uploadFiles(dt.files);
    });
  }

  // Download / refresh
  if (refreshBtn) {
    if (!downloadsEnabled) {
      refreshBtn.style.display = 'none';
    } else {
      refreshBtn.addEventListener('click', () => {
        loadPortalFiles();
      });
    }
  }

  if (viewBtn) {
    if (!downloadsEnabled) {
      viewBtn.style.display = 'none';
    } else {
      updatePortalViewToggle();
      viewBtn.addEventListener('click', () => {
        setPortalView(portalViewMode === 'list' ? 'gallery' : 'list');
      });
    }
  }

  if (downloadAllBtn) {
    if (!downloadsEnabled) {
      downloadAllBtn.style.display = 'none';
    } else {
      downloadAllBtn.addEventListener('click', () => {
        downloadAllPortalFiles();
      });
    }
  }
}

// ----------------- Slug + init -----------------
function getPortalSlugFromUrl() {
    try {
      const url = new URL(window.location.href);
  
      // 1) Normal case: slug is directly in query (?slug=portal-xxxxx)
      let slug = url.searchParams.get('slug');
      if (slug && slug.trim()) {
        return slug.trim();
      }
  
      // 2) Pretty URL: /portal/<slug>
      //    e.g. /portal/portal-h46ozd
      const pathMatch = url.pathname.match(/\/portal\/([^\/?#]+)/i);
      if (pathMatch && pathMatch[1]) {
        return pathMatch[1].trim();
      }
  
      // 3) Fallback: slug inside redirect param
      //    e.g. ?redirect=/portal.html?slug=portal-h46ozd
      const redirect = url.searchParams.get('redirect');
      if (redirect) {
        try {
          const redirectUrl = new URL(redirect, window.location.origin);
          const innerSlug = redirectUrl.searchParams.get('slug');
          if (innerSlug && innerSlug.trim()) {
            return innerSlug.trim();
          }
        } catch (e) {
          // ignore parse errors
        }
  
        const m = redirect.match(/[?&]slug=([^&]+)/);
        if (m && m[1]) {
          return decodeURIComponent(m[1]).trim();
        }
      }
  
      // 4) Final fallback: old regex on our own query string
      const qs = window.location.search || '';
      const m2 = qs.match(/[?&]slug=([^&]+)/);
      return m2 && m2[1] ? decodeURIComponent(m2[1]).trim() : '';
    } catch (e) {
      const qs = window.location.search || '';
      const m = qs.match(/[?&]slug=([^&]+)/);
      return m && m[1] ? decodeURIComponent(m[1]).trim() : '';
    }
  }

async function initPortal() {
  const slug = getPortalSlugFromUrl();
  if (!slug) {
    setStatus(t('portal_missing_slug') || 'Missing portal slug.', true);
    showToast(t('portal_slug_missing_url') || 'Portal slug missing in URL.', 'error');
    return;
  }

  try {
    await loadCsrfToken();
  } catch (e) {
    console.warn('CSRF load failed (may be fine if unauthenticated yet).', e);
  }

  const auth = await ensureAuthenticated();
  if (!auth) return;

  const p = await fetchPortal(slug);
  if (!p) return;

  const rawPath = getPortalPathFromUrl();
  if (rawPath) {
    const { value, error } = normalizePortalPath(rawPath);
    if (error) {
      showToast(error, 'warning');
    } else if (portal && portal.allowSubfolders) {
      portalPath = value;
    } else if (value) {
      showToast(t('portal_subfolder_not_allowed') || 'Subfolder access is not enabled for this portal.', 'warning');
      updatePortalUrl('', true);
    }
  }

  renderPortalInfo();
  setupPortalForm(slug);
  wireUploadUI();

  if (portalCanDownload()) {
    loadPortalFiles();
  }

  if (portal.allowSubfolders && !window.__portalPopstateBound) {
    window.__portalPopstateBound = true;
    window.addEventListener('popstate', () => {
      if (!portal || !portal.allowSubfolders) return;
      const raw = getPortalPathFromUrl();
      const { value, error } = normalizePortalPath(raw);
      if (error) return;
      if (value !== portalPath) {
        portalPath = value;
        portalPage = 1;
        renderPortalBreadcrumbs();
        if (portalCanDownload()) {
          loadPortalFiles();
        }
      }
    });
  }

  setStatus(t('portal_ready') || 'Ready.');
}

document.addEventListener('DOMContentLoaded', async () => {
  initPortalThemeToggle();
  await applyLocale();
  setupLanguageSelect();
  initPortal().catch(err => {
    console.error(err);
    setStatus(t('portal_init_error') || 'Unexpected error initializing portal.', true);
    showToast(t('portal_load_error') || 'Unexpected error loading portal.', 'error');
  });
});
