// /js/main.js — light bootstrap
import { getBasePath, stripBase, withBase, patchFetchForBasePath } from './basePath.js?v={{APP_QVER}}';

// Expose base path for non-module scripts / debugging.
try { window.__FR_BASE_PATH__ = getBasePath(); } catch (e) {}
try { patchFetchForBasePath(); } catch (e) {}

// ---- Toast bridge (global, early, race-proof) ----
(function installToastBridge() {
  if (window.__FR_TOAST_BRIDGE__) return;
  window.__FR_TOAST_BRIDGE__ = true;

  window.__FR_TOAST_Q = window.__FR_TOAST_Q || [];     // queued toasts until real toast is ready
  window.__REAL_TOAST__ = window.__REAL_TOAST__ || null; // set later once domUtils is loaded
  window.__FR_TOAST_FILTER__ = window.__FR_TOAST_FILTER__ || null; // filter hook (auth.js)

  window.showToast = function (msgOrKey, durationOrTone, maybeTone) {
    // Let auth.js (or anyone) rewrite/suppress messages centrally.
    try {
      if (typeof window.__FR_TOAST_FILTER__ === 'function') {
        const out = window.__FR_TOAST_FILTER__(msgOrKey);
        if (out === null) return;           // suppressed
        msgOrKey = out;                     // rewritten/translated
      }
    } catch (e) { }

    if (typeof window.__REAL_TOAST__ === 'function') {
      return window.__REAL_TOAST__(msgOrKey, durationOrTone, maybeTone);
    }
    window.__FR_TOAST_Q.push([msgOrKey, durationOrTone, maybeTone]);
  };

  // Optional: generic event bridge
  window.addEventListener('filerise:toast', (e) => {
    const { message, duration, tone } = (e && e.detail) || {};
    if (message) window.showToast(message, duration, tone);
  });
})();

async function ensureToastReady() {
  if (window.__REAL_TOAST__) return;
  try {
    const dom = await import(withBase('/js/domUtils.js?v={{APP_QVER}}'));  // real toast
    const real = dom.showToast || ((m, d) => console.log('TOAST:', m, d));

    // (Optional) “false-negative to success” normalizer
    const normalized = function (msg, dur, tone) {
      try {
        const m = (msg || '').toString().toLowerCase();
        if (/does not exist|already exist|not found/.test(m) && window.__FR_LAST_OK) {
          window.__FR_LAST_OK = false;
          return real('Done.', dur);
        }
      } catch (e) { }
      return real(msg, dur, tone);
    };

    window.__REAL_TOAST__ = normalized;

    // Flush anything that queued before domUtils was ready
    const q = window.__FR_TOAST_Q || [];
    window.__FR_TOAST_Q = [];
    q.forEach(([m, d, t]) => window.__REAL_TOAST__(m, d, t));
  } catch (e) {
    window.__REAL_TOAST__ = (m, d) => console.log('TOAST:', m, d);
  }
}

function isDemoHost() {
  try {
    const cfg = window.__FR_SITE_CFG__ || {};
    if (typeof cfg.demoMode !== 'undefined') {
      return !!cfg.demoMode;
    }
  } catch (e) {
    // ignore
  }
  // Fallback for older configs / direct demo host:
  return location.hostname.replace(/^www\./, '') === 'demo.filerise.net';
}

function showLoginTip(message) {
  const tip = document.getElementById('fr-login-tip');
  if (!tip) return;
  tip.innerHTML = ''; // clear

  if (message) {
    tip.append(document.createTextNode(message));
  }

  if (isDemoHost()) {
    const line = document.createElement('div');
    line.style.marginTop = '6px';
    const mk = t => {
      const k = document.createElement('code');
      k.textContent = t;
      return k;
    };
    line.append(
      document.createTextNode('Demo login — user: '), mk('demo'),
      document.createTextNode(' · pass: '), mk('demo')
    );
    tip.append(line);
  }

  tip.style.display = 'block';
}

const LOGIN_FAIL_STORAGE_KEY = 'fr_login_fail_state';
const LOGIN_FAIL_WINDOW_MS = 30 * 60 * 1000;
const LOGIN_FAIL_MAX = 5;

function readLoginFailState(now = Date.now()) {
  try {
    const raw = sessionStorage.getItem(LOGIN_FAIL_STORAGE_KEY);
    if (!raw) return { count: 0, last: 0 };
    const parsed = JSON.parse(raw);
    const count = Number(parsed.count) || 0;
    const last = Number(parsed.last) || 0;
    if (!last || (now - last) > LOGIN_FAIL_WINDOW_MS) {
      return { count: 0, last: 0 };
    }
    return { count, last };
  } catch (e) {
    return { count: 0, last: 0 };
  }
}

function writeLoginFailState(state) {
  try {
    sessionStorage.setItem(LOGIN_FAIL_STORAGE_KEY, JSON.stringify(state));
  } catch (e) { }
}

function resetLoginFailState() {
  try {
    sessionStorage.removeItem(LOGIN_FAIL_STORAGE_KEY);
  } catch (e) { }
}

function showLoginFailTip(count) {
  if (count >= LOGIN_FAIL_MAX) {
    showLoginTip('Too many failed login attempts. Please try again later.');
    return;
  }
  showLoginTip(`Failed to log in: ${count} of ${LOGIN_FAIL_MAX} attempts used.`);
}

function recordLoginFailure() {
  const now = Date.now();
  const state = readLoginFailState(now);
  const count = Math.min((state.count || 0) + 1, LOGIN_FAIL_MAX);
  writeLoginFailState({ count, last: now });
  showLoginFailTip(count);
  return count;
}

function showLoginLockoutTip() {
  showLoginTip('Too many failed login attempts. Please try again later.');
}

window.showLoginTip = showLoginTip;
window.__frRecordLoginFailure = recordLoginFailure;
window.__frResetLoginFailure = resetLoginFailState;
window.__frShowLoginLockoutTip = showLoginLockoutTip;

async function hideOverlaySmoothly(overlay) {
  if (!overlay) return;
  try { await document.fonts?.ready; } catch (e) { }
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  overlay.style.display = 'none';
}

function wireModalEnterDefault() {
  if (window.__FR_FLAGS.wired.enterDefault) return;
  window.__FR_FLAGS.wired.enterDefault = true;

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;

    // don’t hijack multiline inputs or anything explicitly opted-out
    const tgt = e.target;
    if (tgt && (tgt.tagName === 'TEXTAREA' || tgt.isContentEditable || tgt.closest('[data-no-enter]'))) return;

    // pick the topmost visible modal
    const modal = Array.from(document.querySelectorAll('.modal')).reverse().find(m => {
      const s = getComputedStyle(m);
      return s.display !== 'none' && s.visibility !== 'hidden' && s.pointerEvents !== 'none';
    });
    if (!modal) return;

    const btn = modal.querySelector('[data-default]');
    if (!btn || btn.disabled) return;

    e.preventDefault();
    btn.click();
  }, true); // capture so we beat other handlers
}

const MODAL_SELECTORS = [
  '.modal',
  '#adminPanelModal',
  '#userPanelModal',
  '#userPermissionsModal',
  '#adminUserHubModal',
  '#userFlagsModal',
  '#userGroupsModal',
  '#groupAclModal',
  '#clientPortalsModal',
  '#filePreviewModal',
  '#shareModal',
  '#tagModal',
  '#multiTagModal',
  '#searchEverywhereModal'
];
const MODAL_SELECTOR = MODAL_SELECTORS.join(', ');

function isModalVisible(el) {
  if (!el || !document.body || !document.body.contains(el)) return false;
  const s = getComputedStyle(el);
  return s.display !== 'none' && s.visibility !== 'hidden' && s.pointerEvents !== 'none';
}

function getOpenModals() {
  return Array.from(document.querySelectorAll(MODAL_SELECTOR)).filter(isModalVisible);
}

function getTopmostModal() {
  const open = getOpenModals();
  return open.length ? open[open.length - 1] : null;
}

function isFocusableVisible(el) {
  if (!el) return false;
  const s = getComputedStyle(el);
  if (s.display === 'none' || s.visibility === 'hidden') return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  return true;
}

function getFocusableElements(root) {
  if (!root) return [];
  const selector = [
    'a[href]',
    'area[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'iframe',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
  ].join(',');
  return Array.from(root.querySelectorAll(selector)).filter(isFocusableVisible);
}

function recordModalOpener(modal) {
  const active = document.activeElement;
  if (active && active !== document.body && !modal.contains(active)) {
    modal.__frPrevFocus = active;
  }
}

function restoreModalOpener(modal) {
  const prev = modal.__frPrevFocus;
  modal.__frPrevFocus = null;
  if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
    try { prev.focus({ preventScroll: true }); } catch (e) { prev.focus(); }
  }
}

function focusFirstInModal(modal) {
  if (!modal || !document.body.contains(modal)) return;
  if (modal.contains(document.activeElement)) return;
  const focusables = getFocusableElements(modal);
  if (focusables.length) {
    focusables[0].focus({ preventScroll: true });
  } else {
    modal.focus({ preventScroll: true });
  }
}

function trapFocusInModal(modal) {
  if (!modal || modal.__frTrapBound) return;
  modal.__frTrapBound = true;
  modal.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    if (getTopmostModal() !== modal) return;
    const focusables = getFocusableElements(modal);
    if (!focusables.length) {
      e.preventDefault();
      modal.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || !modal.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last || !modal.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  }, true);
}

function applyModalA11yAttrs(modal) {
  if (!modal) return;
  if (!modal.hasAttribute('role')) modal.setAttribute('role', 'dialog');
  if (!modal.hasAttribute('aria-modal')) modal.setAttribute('aria-modal', 'true');
  if (!modal.hasAttribute('tabindex')) modal.setAttribute('tabindex', '-1');
}

function handleModalOpen(modal) {
  if (!modal) return;
  modal.__frOpen = true;
  recordModalOpener(modal);
  applyModalA11yAttrs(modal);
  trapFocusInModal(modal);
  setTimeout(() => {
    if (!modal.contains(document.activeElement)) focusFirstInModal(modal);
  }, 0);
}

function handleModalClose(modal) {
  if (!modal) return;
  modal.__frOpen = false;
  restoreModalOpener(modal);
}

function refreshModalState(modal) {
  if (!modal || !document.body.contains(modal)) return;
  const visible = isModalVisible(modal);
  if (visible && !modal.__frOpen) handleModalOpen(modal);
  if (!visible && modal.__frOpen) handleModalClose(modal);
}

function closeModalElement(modal) {
  if (!modal) return false;
  if (typeof modal.__frClose === 'function') {
    modal.__frClose();
    return true;
  }

  const closeSelector = [
    '[data-fr-modal-close]',
    '.editor-close-btn',
    '.restore-close-btn',
    '.close-image-modal',
    '.modal-close',
    '.btn-close',
    '[aria-label="Close"]',
    '#confirmNoBtn',
    '[id^="close"]',
    '[id^="cancel"]'
  ].join(',');
  const closeBtn = modal.querySelector(closeSelector);
  if (closeBtn && !closeBtn.disabled && closeBtn.getAttribute('aria-disabled') !== 'true') {
    closeBtn.click();
    return true;
  }

  modal.style.display = 'none';
  return true;
}

function wireModalA11y() {
  if (window.__FR_FLAGS.wired.modalA11y) return;
  window.__FR_FLAGS.wired.modalA11y = true;

  document.querySelectorAll(MODAL_SELECTOR).forEach(refreshModalState);

  const modalObserver = new MutationObserver((mutations) => {
    const toRefresh = new Set();
    const toClose = new Set();

    mutations.forEach((m) => {
      if (m.type === 'attributes') {
        if (m.target && m.target.matches && m.target.matches(MODAL_SELECTOR)) {
          toRefresh.add(m.target);
        }
        return;
      }
      if (m.type !== 'childList') return;

      m.addedNodes.forEach((node) => {
        if (!node || node.nodeType !== 1) return;
        if (node.matches && node.matches(MODAL_SELECTOR)) toRefresh.add(node);
        node.querySelectorAll?.(MODAL_SELECTOR).forEach((el) => toRefresh.add(el));
      });
      m.removedNodes.forEach((node) => {
        if (!node || node.nodeType !== 1) return;
        if (node.matches && node.matches(MODAL_SELECTOR)) toClose.add(node);
        node.querySelectorAll?.(MODAL_SELECTOR).forEach((el) => toClose.add(el));
      });
    });

    toClose.forEach((modal) => {
      if (modal.__frOpen) handleModalClose(modal);
    });
    toRefresh.forEach(refreshModalState);
  });

  modalObserver.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden']
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = getOpenModals();
    if (!open.length) return;
    e.preventDefault();
    e.stopPropagation();
    closeModalElement(open[open.length - 1]);
  }, true);
}

window.__frGetOpenModals = getOpenModals;
window.__frIsModalOpen = () => getOpenModals().length > 0;

// One-shot guards
window.__FR_FLAGS = window.__FR_FLAGS || {
  booted: false,
  initialized: false,
  domReadyFired: false,
  wired: Object.create(null)
};

window.__FR_FLAGS.bootPromise = window.__FR_FLAGS.bootPromise || null;
window.__FR_FLAGS.entryStarted = window.__FR_FLAGS.entryStarted || false;

// ---- Result guard + request coalescer (dedupe) ----
(function installResultGuardAndCoalescer() {
  if (window.__FR_FETCH_GUARD_INSTALLED) return;
  window.__FR_FETCH_GUARD_INSTALLED = true;

  const nativeFetch = window.fetch.bind(window);
  window.__FR_LAST_OK = false;

  const inFlight = new Map(); // key -> { ts, promise }

  const IGNORE_QUERY_KEYS = new Set(['t', '_', 'cache']);

  function normalizeUrl(u) {
    try {
      const url = new URL(u, window.location.origin);
      // Keep path + stable query ordering
      const params = new URLSearchParams(url.search);
      const sorted = new URLSearchParams();
      [...params.keys()].sort().forEach(k => {
        if (IGNORE_QUERY_KEYS.has(k)) return;
        sorted.set(k, params.get(k));
      });
      return url.pathname + (sorted.toString() ? '?' + sorted.toString() : '');
    } catch (e) { return String(u || ''); }
  }

  async function toStableBody(init) {
    const b = init && init.body;
    if (!b) return '';
    try {
      if (typeof b === 'string') {
        // try JSON
        try {
          const j = JSON.parse(b);
          // remove volatile fields like csrf
          delete j.csrf; delete j.csrf_token; delete j._;
          return 'JSON:' + JSON.stringify(j, Object.keys(j).sort());
        } catch (e) {
          // maybe urlencoded
          const p = new URLSearchParams(b);
          ['csrf', 'csrf_token', '_'].forEach(k => p.delete(k));
          return 'FORM:' + [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('&');
        }
      }
    } catch (e) { }
    return 'B:' + String(b);
  }

  window.fetch = async (input, init = {}) => {
    // Base-path aware: if mounted under /fr, rewrite /api/* -> /fr/api/*
    const base = (window.__FR_BASE_PATH__ && String(window.__FR_BASE_PATH__)) || '';
    if (base) {
      try {
        if (typeof input === 'string') {
          if (input.startsWith('/api/') && !input.startsWith(base + '/api/')) {
            input = base + input;
          }
        } else if (input && typeof input.url === 'string') {
          const u = new URL(input.url, window.location.origin);
          if (
            u.origin === window.location.origin &&
            u.pathname.startsWith('/api/') &&
            !u.pathname.startsWith(base + '/api/')
          ) {
            const rewritten = new URL(base + u.pathname + u.search + u.hash, window.location.origin);
            input = new Request(rewritten.toString(), input);
          }
        }
      } catch (e) { }
    }

    const method = (init.method || 'GET').toUpperCase();
    const urlKey = normalizeUrl(typeof input === 'string' ? input : (input && input.url) || '');
    const bodyKey = await toStableBody(init);
    const key = method + ' ' + urlKey + ' ' + bodyKey;

    const now = Date.now();
    const existing = inFlight.get(key);
    if (existing && (now - existing.ts) < 800) {
      // coalesce: return the same promise
      return existing.promise.then(r => r.clone());
    }

    const urlPathRaw = (typeof input === 'string') ? new URL(input, window.location.origin).pathname : new URL(input.url).pathname;
    const urlPath = stripBase(urlPathRaw);

    // 1) Only coalesce mutating methods OR specific noisy GETs
    const isCoalescableGet =
      method === 'GET' &&
      urlPath.startsWith('/api/') &&
      [
        '/api/auth/checkAuth.php',
        '/api/getUserPermissions.php',
        '/api/profile/getCurrentUser.php',
        '/api/folder/getFolderColors.php',
        '/api/folder/getFolderList.php',
        '/api/folder/listChildren.php',
        '/api/file/getFileList.php',
        '/api/file/getTrashItems.php',
        '/api/siteConfig.php',
        '/api/onlyoffice/status.php'
      ].some(p => urlPath.startsWith(p));

    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !isCoalescableGet) {
      return nativeFetch(input, init);
    }

    // 2) Only same-origin API calls
    const isSameOrigin = (typeof input === 'string')
      ? input.startsWith('/') || input.startsWith(location.origin)
      : new URL(input.url).origin === location.origin;
    if (!isSameOrigin || !urlPath.startsWith('/api/')) {
      return nativeFetch(input, init);
    }

    // 3) Never touch downloads/streams
    if (urlPath.includes('download') || urlPath.includes('zip')) {
      return nativeFetch(input, init);
    }

    // 4) Kill switch (handy for debugging)
    if (window.__FR_DISABLE_COALESCE) {
      return nativeFetch(input, init);
    }

    const p = nativeFetch(input, init).then(async (res) => {
      try {
        const clone = res.clone();
        let okJson = null;
        try { okJson = await clone.json(); } catch (e) { }
        const okFlag = res.ok && okJson && (
          okJson.success === true || okJson.status === 'ok' || okJson.result === 'ok'
        );
        window.__FR_LAST_OK = !!okFlag;
      } catch (e) { }
      return res;
    }).finally(() => {
      // let it linger briefly so very-rapid duplicates still coalesce
      setTimeout(() => inFlight.delete(key), 200);
    });

    inFlight.set(key, { ts: now, promise: p });
    return p.then(r => r.clone());
  };

    // ---- Safe redirect helper (prevents open redirects) ----
    function sanitizeRedirect(raw, { fallback = '/' } = {}) {
      if (!raw) return fallback;
      try {
        const str = String(raw).trim();
        if (!str) return fallback;
  
        // Resolve against current page so relative paths keep subpath mounts (e.g. /fr).
        const candidate = new URL(str, window.location.href);
  
        // Enforce same-origin
        if (candidate.origin !== window.location.origin) {
          return fallback;
        }
  
        // Limit to http/https
        if (candidate.protocol !== 'http:' && candidate.protocol !== 'https:') {
          return fallback;
        }
  
        // Return relative URL
        return candidate.pathname + candidate.search + candidate.hash;
      } catch (e) {
        return fallback;
      }
    }

  // Gentle toast normalizer (compatible with showToast(message, duration))
  const origToast = window.showToast;
  if (typeof origToast === 'function' && !origToast.__frWrapped) {
    const wrapped = function (msg, maybeDuration, maybeTone) {
      try {
        const m = (msg || '').toString().toLowerCase();
        const looksWrong =
          /does not exist|already exist|not found/.test(m) &&
          window.__FR_LAST_OK === true;
        if (looksWrong) {
          window.__FR_LAST_OK = false;
          // Keep default duration if not numeric
          const dur = (typeof maybeDuration === 'number') ? maybeDuration : undefined;
          return origToast('Done.', dur);
        }
      } catch (e) { }
      return origToast(msg, maybeDuration, maybeTone);
    };
    wrapped.__frWrapped = true;
    window.showToast = wrapped;
  }
})();


function bindDragAutoScroll() {
  if (window.__FR_FLAGS.wired.dragScroll) return;
  window.__FR_FLAGS.wired.dragScroll = true;

  const THRESH = 50;
  const SPEED = 20;
  document.addEventListener('dragover', (e) => {
    const y = e && typeof e.clientY === 'number' ? e.clientY : null;
    if (y == null) return;
    if (y < THRESH) window.scrollBy(0, -SPEED);
    else if (y > (window.innerHeight - THRESH)) window.scrollBy(0, SPEED);
  }, { passive: true });
}

function bindClickIfMissing(id, fnName) {
  const el = document.getElementById(id);
  if (!el || el.__bound) return;
  el.__bound = true;

  el.addEventListener('click', async (e) => {
    e.preventDefault();
    if (el.dataset.busy === '1') return;
    el.dataset.busy = '1';

    try {
      const acts = await ensureFileActionsLoaded();
      if (acts && typeof acts[fnName] === 'function') {
        await acts[fnName]();
      }
      // if API said success but no positive toast happened, give a neutral one
      if (window.__FR_LAST_OK === true && typeof window.showToast === 'function') {
        window.showToast('Done.', 'success');
        window.__FR_LAST_OK = false;
      }
    } catch (err) {
      console.warn(`[wire] ${fnName} error`, err);
    } finally {
      const modal = el.closest('.modal'); if (modal) modal.style.display = 'none';
      setTimeout(() => { el.dataset.busy = '0'; }, 600); // short cooldown
    }
  }, true);
}

function dispatchLegacyReadyOnce() {
  if (window.__FR_FLAGS.domReadyFired) return;
  window.__FR_FLAGS.domReadyFired = true;
  // Fire synthetic DOMContentLoaded/load once so legacy listeners in imported modules bind.
  try { document.dispatchEvent(new Event('DOMContentLoaded')); } catch (e) { }
  try { window.dispatchEvent(new Event('load')); } catch (e) { }
}

// -------- username label ( --------
function wireUserNameLabel(state) {
  const username = (state && state.username) || localStorage.getItem('username') || '';
  const btn = document.getElementById('userDropdownToggle') || document.getElementById('userMenuBtn');
  if (!btn) return;
  const label = btn.querySelector('.user-name-label');
  if (!label) return; // don’t inject new DOM
  label.textContent = username || '';
}

// -------- DARK MODE (persist + system fallback + a11y labels) --------
function applyDarkMode({ fromSystemChange = false } = {}) {
  let stored = null;
  try { stored = localStorage.getItem('darkMode'); } catch (e) { }

  let isDark = (stored === null)
    ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
    : (stored === '1' || stored === 'true');

  const root = document.documentElement;
  const body = document.body;

  [root, body].forEach(el => {
    if (!el) return;
    el.classList.toggle('dark-mode', isDark);
    el.setAttribute('data-theme', isDark ? 'dark' : 'light');
  });

  // keep UA chrome & bg consistent post-toggle
  const bg = isDark ? '#121212' : '#ffffff';
  root.style.backgroundColor = bg;
  root.style.colorScheme = isDark ? 'dark' : 'light';
  if (body) {
    body.style.backgroundColor = bg;
    body.style.colorScheme = isDark ? 'dark' : 'light';
  }
  const mt = document.querySelector('meta[name="theme-color"]');
  if (mt) mt.content = bg;
  const mcs = document.querySelector('meta[name="color-scheme"]');
  if (mcs) mcs.content = isDark ? 'dark light' : 'light dark';

  const btn = document.getElementById('darkModeToggle');
  const icon = document.getElementById('darkModeIcon');
  if (icon) icon.textContent = isDark ? 'light_mode' : 'dark_mode';
  if (btn) {
    const ttOn = (typeof t === 'function' ? t('switch_to_dark_mode') : 'Switch to dark mode');
    const ttOff = (typeof t === 'function' ? t('switch_to_light_mode') : 'Switch to light mode');
    const aria = (typeof t === 'function' ? (isDark ? t('light_mode') : t('dark_mode')) : (isDark ? 'Light mode' : 'Dark mode'));
    btn.classList.toggle('active', isDark);
    btn.setAttribute('aria-label', aria);
    btn.setAttribute('title', isDark ? ttOff : ttOn);
  }
}

function bindDarkMode() {
  const btn = document.getElementById('darkModeToggle');
  if (btn && !btn.__bound) {
    btn.__bound = true;
    applyDarkMode(); // apply once on boot

    btn.addEventListener('click', () => {
      // Toggle relative to current DOM state
      const isDarkNext = !(document.documentElement.classList.contains('dark-mode') || document.body.classList.contains('dark-mode'));
      try { localStorage.setItem('darkMode', isDarkNext ? '1' : '0'); } catch (e) { }
      applyDarkMode();
    });
  }

  // Listen to system changes only if user has NOT set a preference
  if (!window.__FR_FLAGS.wired.sysDarkMO) {
    window.__FR_FLAGS.wired.sysDarkMO = true;
    let stored = null; try { stored = localStorage.getItem('darkMode'); } catch (e) { }
    if (stored === null && window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyDarkMode({ fromSystemChange: true });
      try { mq.addEventListener('change', handler); } catch (e) { mq.addListener(handler); }
    }
  }
}

(function () {
  // ---------- tiny utils ----------
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  // Safe show/hide that work with both CSS and [hidden]
  const unhide = (el) => { if (!el) return; el.removeAttribute('hidden'); el.style.display = ''; };
  const hideEl = (el) => { if (!el) return; el.setAttribute('hidden', ''); el.style.display = 'none'; };
  const show = (el) => {
    if (!el) return;
    el.hidden = false; el.classList?.remove('d-none', 'hidden');
    el.style.display = 'block'; el.style.visibility = 'visible'; el.style.opacity = '1';
  };
  const hide = (el) => { if (!el) return; el.style.display = 'none'; };
  const setMeta = (name, val) => {
    let m = document.querySelector(`meta[name="${name}"]`);
    if (!m) { m = document.createElement('meta'); m.name = name; document.head.appendChild(m); }
    m.content = val;
  };

    // ---------- site config / auth ----------
    function applySiteConfig(cfg, { phase = 'final' } = {}) {
      try {
        // Make config available globally
        window.siteConfig = cfg || {};
        window.__FR_FLAGS = window.__FR_FLAGS || {};
        try {
          const proMeta = (cfg && cfg.pro && typeof cfg.pro === 'object') ? cfg.pro : {};
          window.__FR_IS_PRO = !!proMeta.active;
          window.__FR_PRO_VERSION = proMeta.version || '';
          window.__FR_PRO_API_LEVEL = Number(proMeta.apiLevel || 0);
        } catch (e) {
          window.__FR_IS_PRO = false;
          window.__FR_PRO_VERSION = '';
          window.__FR_PRO_API_LEVEL = 0;
        }
        try {
          const ps = (cfg && cfg.proSearch && typeof cfg.proSearch === 'object') ? cfg.proSearch : {};
          const lim = Math.max(1, Math.min(200, Number(ps.defaultLimit || 50)));
          const isPro = window.__FR_IS_PRO === true;
          window.__FR_PRO_SEARCH_CFG__ = {
            enabled: isPro && !!ps.enabled,
            defaultLimit: lim,
            lockedByEnv: !!ps.lockedByEnv,
          };
        } catch (e) {
          window.__FR_PRO_SEARCH_CFG__ = { enabled: false, defaultLimit: 50, lockedByEnv: false };
        }
        try {
          const audit = (cfg && cfg.proAudit && typeof cfg.proAudit === 'object') ? cfg.proAudit : {};
          const isPro = window.__FR_IS_PRO === true;
          const levelRaw = (typeof audit.level === 'string') ? audit.level : 'standard';
          const level = (levelRaw === 'standard' || levelRaw === 'verbose') ? levelRaw : 'standard';
          window.__FR_PRO_AUDIT_CFG__ = {
            enabled: isPro && !!audit.enabled,
            level,
            maxFileMb: Number(audit.maxFileMb || 200),
            maxFiles: Number(audit.maxFiles || 10),
            available: !!audit.available,
          };
        } catch (e) {
          window.__FR_PRO_AUDIT_CFG__ = { enabled: false, level: 'standard', maxFileMb: 200, maxFiles: 10, available: false };
        }

        // Expose a simple boolean for ClamAV scanning
        if (cfg && cfg.clamav && typeof cfg.clamav.scanUploads !== 'undefined') {
          window.__FR_FLAGS.clamavScanUploads = !!cfg.clamav.scanUploads;
        }

        const title = (cfg && cfg.header_title) ? String(cfg.header_title) : 'FileRise';
  
        // Always keep <title> correct early (no visual flicker)
        document.title = title;
  
        // --- Header logo (branding) in BOTH phases ---
        try {
          const branding = (cfg && cfg.branding) ? cfg.branding : {};
          const customLogoUrl = branding.customLogoUrl || "";
          const logoImg = document.querySelector('.header-logo img');
          if (logoImg) {
            if (customLogoUrl) {
              logoImg.setAttribute('src', customLogoUrl);
              logoImg.setAttribute('alt', 'Site logo');
            } else {
              // fall back to default FileRise logo
              logoImg.setAttribute('src', withBase('/assets/logo.svg?v={{APP_QVER}}'));
              logoImg.setAttribute('alt', 'FileRise');
            }
          }
        } catch (e) {
          // non-fatal; ignore branding issues
        }
  
        // --- Header colors (branding) in BOTH phases ---
        try {
          const branding = (cfg && cfg.branding) ? cfg.branding : {};
          const root = document.documentElement;
  
          const light = branding.headerBgLight || '';
          const dark  = branding.headerBgDark  || '';
  
          if (light) root.style.setProperty('--header-bg-light', light);
          else root.style.removeProperty('--header-bg-light');
  
          if (dark) root.style.setProperty('--header-bg-dark', dark);
          else root.style.removeProperty('--header-bg-dark');
        } catch (e) {
          // non-fatal
        }
  
        // --- Footer HTML (branding) in BOTH phases ---
        try {
          const branding = (cfg && cfg.branding) ? cfg.branding : {};
          const footerEl = document.getElementById('siteFooter');
          if (footerEl) {
            const html = (branding.footerHtml || '').trim();
            if (html) {
              // allow simple HTML from config
              footerEl.innerHTML = html;
            } else {
              const year = new Date().getFullYear();
              footerEl.innerHTML =
  `&copy; ${year}&nbsp;<a href="https://filerise.net" target="_blank" rel="noopener noreferrer">FileRise</a>`;
            }
          }
        } catch (e) {
          // non-fatal
        }
  
        // --- Login options (apply in BOTH phases so login page is correct) ---
        const lo = (cfg && cfg.loginOptions) ? cfg.loginOptions : {};
  
        // be tolerant to key variants just in case
        const disableForm = !!(lo.disableFormLogin ?? lo.disable_form_login ?? lo.disableForm);
        const disableOIDC = !!(lo.disableOIDCLogin ?? lo.disable_oidc_login ?? lo.disableOIDC);
        const disableBasic = !!(lo.disableBasicAuth ?? lo.disable_basic_auth ?? lo.disableBasic);
  
        const showForm = !disableForm;
        const showOIDC = !disableOIDC;
        const showBasic = !disableBasic;
  
        const loginWrap = $('#loginForm');         // outer wrapper that contains buttons + form
        const authForm = $('#authForm');          // inner username/password form
        const oidcBtn = $('#oidcLoginBtn');      // OIDC button
        const basicSel = 'a[href$="api/auth/login_basic.php"], a[href$="/api/auth/login_basic.php"]';
        const basicLink = document.querySelector(basicSel);
  
        // 1) Show the wrapper if ANY method is enabled (form OR OIDC OR basic)
        if (loginWrap) {
          const anyMethod = showForm || showOIDC || showBasic;
          if (anyMethod) {
            loginWrap.removeAttribute('hidden');   // remove [hidden], which beats display:
            loginWrap.style.display = '';          // let CSS decide
          } else {
            loginWrap.setAttribute('hidden', '');
            loginWrap.style.display = '';
          }
        }
  
        // 2) Toggle the pieces inside the wrapper
        if (authForm) authForm.style.display = showForm ? '' : 'none';
        if (oidcBtn) oidcBtn.style.display = showOIDC ? '' : 'none';
        if (basicLink) basicLink.style.display = showBasic ? '' : 'none';
        const oidc = $('#oidcLoginBtn'); if (oidc) oidc.style.display = disableOIDC ? 'none' : '';
        const basic = document.querySelector(basicSel);
        if (basic) basic.style.display = disableBasic ? 'none' : '';
  
        // --- Header <h1> only in the FINAL phase (prevents visible flips) ---
        if (phase === 'final') {
          const h1 = document.querySelector('.header-title h1');
          if (h1) {
            // prevent i18n or legacy from overwriting it
            if (h1.hasAttribute('data-i18n-key')) h1.removeAttribute('data-i18n-key');
  
            if (h1.textContent !== title) h1.textContent = title;
  
            // lock it so late code can't stomp it
            if (!h1.__titleLock) {
              const mo = new MutationObserver(() => {
                if (h1.textContent !== title) h1.textContent = title;
              });
              mo.observe(h1, { childList: true, characterData: true, subtree: true });
              h1.__titleLock = mo;
            }
          }
        }
      } catch (e) { }
    }

  async function readyToReveal() {
    // Wait for CSS + fonts so the first revealed frame is fully styled
    try { await (window.__CSS_PROMISE__ || Promise.resolve()); } catch (e) { }
    try { await document.fonts?.ready; } catch (e) { }
    // Give layout one paint to settle
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  }

  async function revealAppAndHideOverlay() {
    const appRoot = document.getElementById('appRoot');
    const overlay = document.getElementById('loadingOverlay');
    await readyToReveal();
    if (appRoot) appRoot.style.visibility = 'visible';
    if (overlay) {
      overlay.style.transition = 'opacity .18s ease-out';
      overlay.style.opacity = '0';
      setTimeout(() => { overlay.style.display = 'none'; }, 220);
    }
  }

  async function loadSiteConfig() {
    if (window.__FR_SITE_CFG_PROMISE) return window.__FR_SITE_CFG_PROMISE;
    window.__FR_SITE_CFG_PROMISE = (async () => {
    try {
      const r = await fetch('/api/siteConfig.php', { credentials: 'include' });
      const j = await r.json().catch(() => ({}));
      window.__FR_SITE_CFG__ = j || {};
      window.__FR_DEMO__ = !!(window.__FR_SITE_CFG__.demoMode);
      // Early pass: title + login options (skip touching <h1> to avoid flicker)
      applySiteConfig(window.__FR_SITE_CFG__, { phase: 'early' });
      return window.__FR_SITE_CFG__;
    } catch (e) {
      window.__FR_SITE_CFG__ = {};
      window.__FR_DEMO__ = false; 
      applySiteConfig({}, { phase: 'early' });
      return null;
    } finally { window.__FR_SITE_CFG_PROMISE = null; }
    })();
    return window.__FR_SITE_CFG_PROMISE;
  }
  async function primeCsrf() {
    try {
      const tr = await fetch('/api/auth/token.php', { credentials: 'include' });
      const tj = await tr.json().catch(() => ({}));
      if (tj?.csrf_token) { setMeta('csrf-token', tj.csrf_token); window.csrfToken = tj.csrf_token; try { localStorage.setItem('csrf', tj.csrf_token); } catch (e) { } }
    } catch (e) { }
  }
  async function checkAuth() {
    try {
      const r = await fetch('/api/auth/checkAuth.php', { credentials: 'include' });
      const j = await r.json().catch(() => ({}));

      if (j?.csrf_token) {
        setMeta('csrf-token', j.csrf_token);
        window.csrfToken = j.csrf_token;
        try { localStorage.setItem('csrf', j.csrf_token); } catch (e) { }
      }
      if (typeof j?.isAdmin !== 'undefined') {
        try { localStorage.setItem('isAdmin', j.isAdmin ? '1' : '0'); } catch (e) { }
      }
      if (typeof j?.username !== 'undefined') {
        try { localStorage.setItem('username', j.username || ''); } catch (e) { }
      }

      const setup = !!j?.setup || !!j?.setup_mode || j?.mode === 'setup' || j?.status === 'setup' || !!j?.requires_setup || !!j?.needs_setup;
      return { authed: !!j?.authenticated, setup, raw: j };
    } catch (e) {
      return { authed: false, setup: false, raw: {} };
    }
  }

  // ---- Create dropdown + its two modals  ----
  function wireCreateDropdown() {
    const container = document.getElementById('createDropdown');
    const btn = document.getElementById('createBtn');
    const menu = document.getElementById('createMenu');
    const makeF = document.getElementById('createFileOption');
    const makeD = document.getElementById('createFolderOption');
    if (!container || !btn || !menu) return;

    // Ensure layout basics
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    btn.style.pointerEvents = 'auto';
    menu.style.pointerEvents = 'auto';
    menu.style.zIndex = '10010';

    // Show/hide button based on live auth flags
    const st = (window.__FR_AUTH_STATE || {});
    const readOnly = !!st.readOnly || (localStorage.getItem('readOnly') === 'true' || localStorage.getItem('readOnly') === '1');
    const disableUpload = !!st.disableUpload || (localStorage.getItem('disableUpload') === 'true' || localStorage.getItem('disableUpload') === '1');
    btn.style.display = (!readOnly && !disableUpload) ? 'inline-flex' : 'none';

    let justToggledAt = 0;

    function openMenu() {
      // Beat any CSS with !important
      menu.style.setProperty('display', 'block', 'important');
      btn.setAttribute('aria-expanded', 'true');
      justToggledAt = Date.now();
    }
    function closeMenu() {
      menu.style.setProperty('display', 'none', 'important');
      btn.setAttribute('aria-expanded', 'false');
    }
    function isOpen() {
      return getComputedStyle(menu).display !== 'none';
    }

    if (!btn.__bound) {
      btn.__bound = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation(); // block bubble-phase global closers
        if (isOpen()) closeMenu(); else openMenu();
      }, true); // use capture so we run before bubble-phase closers
    }

    // Close only when clicking truly outside our container.
    // Use capture and ignore the click that immediately follows our open() call.
    if (!menu.__outside) {
      menu.__outside = true;
      document.addEventListener('click', (e) => {
        // ignore the same-tick/rapid click that opened the menu
        if (Date.now() - justToggledAt < 120) return;
        if (!container.contains(e.target)) closeMenu();
      }, true); // capture to pre-empt other handlers
    }

    if (!menu.__esc) {
      menu.__esc = true;
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen()) closeMenu();
      });
    }

    const openModal = (id) => {
      const m = document.getElementById(id);
      if (m) { m.style.display = 'block'; closeMenu(); }
    };
    if (makeF && !makeF.__bound) { makeF.__bound = true; makeF.addEventListener('click', (e) => { e.preventDefault(); openModal('createFileModal'); }); }
    if (makeD && !makeD.__bound) { makeD.__bound = true; makeD.addEventListener('click', (e) => { e.preventDefault(); openModal('createFolderModal'); }); }
  }

  // ---- Modal cancel safety ----
  function bindCancelSafeties() {
    const ids = [
      '#cancelDeleteFiles', '#cancelCopyFiles', '#cancelMoveFiles', '#cancelDownloadZip', '#cancelDownloadFile',
      '#cancelCreateFile', '#cancelMoveFolder', '#cancelRenameFolder', '#cancelDeleteFolder', '#closeRestoreModal'
    ];
    ids.forEach(id => {
      const el = document.querySelector(id);
      if (el && !el.__safe) {
        el.__safe = true;
        el.addEventListener('click', (e) => {
          e.preventDefault();
          const modal = el.closest('.modal');
          if (modal) modal.style.display = 'none';
        });
      }
    });
  }

  function keepCreateDropdownWired() {
    if (window.__FR_FLAGS.wired.keepCreateMO) return;
    window.__FR_FLAGS.wired.keepCreateMO = true;
    const mo = new MutationObserver(() => {
      const btn = document.getElementById('createBtn');
      const menu = document.getElementById('createMenu');
      if (btn && menu && !btn.__bound) wireCreateDropdown();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // ---- Folder-level helpers: de-dupe selects only when a modal opens ----
  function dedupeSelect(el) {
    if (!el) return;
    const seen = new Set();
    const rm = [];
    Array.from(el.options).forEach(opt => {
      const key = (opt.value || opt.textContent || '').trim();
      if (!key) return;
      if (seen.has(key)) rm.push(opt); else seen.add(key);
    });
    rm.forEach(o => o.remove());
  }
  function dedupeByIdSoon(id) { setTimeout(() => { const el = document.getElementById(id); if (el) dedupeSelect(el); }, 60); }

  function wireFolderButtons() {
    const open = (id) => { const m = document.getElementById(id); if (m) m.style.display = 'block'; };

    const moveBtn = document.getElementById('moveFolderBtn');
    if (moveBtn && !moveBtn.__bound) {
      moveBtn.__bound = true;
      moveBtn.addEventListener('click', (e) => { e.preventDefault(); open('moveFolderModal'); dedupeByIdSoon('moveFolderTarget'); });
    }

    const shareBtn = document.getElementById('shareFolderBtn');
    if (shareBtn && !shareBtn.__bound) {
      shareBtn.__bound = true;
      shareBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const shareModal = document.getElementById('shareFolderModal');
        if (shareModal) shareModal.style.display = 'block';
        else document.dispatchEvent(new CustomEvent('filerise:share-folder', { detail: { folder: window.currentFolder || 'root' } }));
      });
    }

    const moveFilesOpenBtn = document.getElementById('moveSelectedBtn');
    if (moveFilesOpenBtn && !moveFilesOpenBtn.__dedupeHook) {
      moveFilesOpenBtn.__dedupeHook = true;
      moveFilesOpenBtn.addEventListener('click', () => dedupeByIdSoon('moveTargetFolder'));
    }
  }

  // ---- Lift modals above cards, always clickable ----
  function liftModals() {
    document.querySelectorAll('.modal').forEach(m => { m.style.pointerEvents = 'auto'; m.style.zIndex = '10000'; });
    document.querySelectorAll('.modal .modal-content').forEach(c => { c.style.position = 'relative'; c.style.zIndex = '10001'; });
  }

  // ---- Title fix after first list ----
  function updateFileListTitle() {
    const el = document.getElementById('fileListTitle');
    if (!el) return;
    const folder = (window.currentFolder || localStorage.getItem('lastOpenedFolder') || 'root');
    const name = folder === 'root' ? '(Root)' : folder;
    el.textContent = `Files in ${name}`;
    el.setAttribute('data-i18n-key', 'file_list_title');
  }

  // ---------- SETUP MODE ----------
  async function createUserSetup(username, password, isAdmin) {
    const csrf = window.csrfToken || localStorage.getItem('csrf') || '';
    const headers = { 'Content-Type': 'application/json' };
    if (csrf) headers['X-CSRF-Token'] = csrf;

    const res = await fetch('/api/addUser.php?setup=1', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ username, password, isAdmin: true, admin: true, grant_admin: true })
    });

    let j = {};
    try { j = await res.json(); } catch (e) { }
    if (!res.ok || j.error) throw new Error(j.error || `Add user failed (${res.status})`);
    return true;
  }
  function bindSetupAddUser() {
    const form = document.getElementById('addUserForm');
    if (!form || form.__bound) return;
    form.__bound = true;

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();

      const usernameEl = document.getElementById('newUsername');
      const passwordEl = document.getElementById('addUserPassword');
      const isAdminEl = document.getElementById('isAdmin');

      const username = (usernameEl?.value || '').trim();
      const password = (passwordEl?.value || '');
      const isAdmin = isAdminEl ? !!isAdminEl.checked : true;

      if (!username || !password) {
        alert('Enter a username and password.');
        (username ? passwordEl : usernameEl)?.focus();
        return;
      }

      try {
        await primeCsrf();
        await createUserSetup(username, password, isAdmin);
        const addModal = document.getElementById('addUserModal'); if (addModal) addModal.style.display = 'none';
        window.setupMode = false;
        window.location.reload();
      } catch (e) {
        alert(e.message || 'Failed to create user. Check server logs.');
        if (!username) usernameEl?.focus();
        else if (!password) passwordEl?.focus();
      }
    }, true);
  }

  // ---------- pre-auth login ----------
  function forceLoginVisible() {
    show($('#main'));
    show($('#loginForm'));
    const hb = $('.header-buttons'); if (hb) hb.style.visibility = 'hidden';
    const ov = $('#loadingOverlay'); if (ov) ov.style.display = 'none';
  }
  function looksLikeTOTP(res, body) {
    try {
      if (res && (res.headers.get('X-TOTP-Required') === '1' ||
        (res.redirected && /[?&]totp_required=1\b/.test(res.url)))) {
        return true;
      }
      if (body && (body.totp_required === true || body.error === 'TOTP_REQUIRED')) {
        return true;
      }
    } catch (e) { }
    return false;
  }
  function isDefinitiveLoginError(message) {
    return /invalid credentials|invalid username format|too many failed login attempts/i.test(String(message || ''));
  }
  function handleLoginFailureTip(message) {
    const msg = String(message || '');
    if (/too many failed login attempts/i.test(msg)) {
      if (typeof window.__frShowLoginLockoutTip === 'function') {
        window.__frShowLoginLockoutTip();
      }
      return;
    }
    if (/invalid credentials/i.test(msg)) {
      if (typeof window.__frRecordLoginFailure === 'function') {
        window.__frRecordLoginFailure();
      }
    }
  }

  async function openTotpNow() {
    // refresh CSRF for the upcoming /totp_verify call
    try { await primeCsrf(); } catch (e) { }
    window.pendingTOTP = true;
    // reuse the function you already export from auth.js
    try {
      const auth = await import(withBase('/js/auth.js?v={{APP_QVER}}'));
      if (typeof auth.openTOTPLoginModal === 'function') auth.openTOTPLoginModal();
    } catch (e) {
      console.warn('Could not import auth.js to open TOTP modal:', e);

      const m = document.getElementById('totpLoginModal'); if (m) m.style.display = 'block';
    }
  }
  function bindLogin() {
    const oidcBtn = $('#oidcLoginBtn');
    if (oidcBtn && !oidcBtn.__bound) {
      oidcBtn.__bound = true;
      oidcBtn.addEventListener('click', () => { window.location.href = withBase('/api/auth/auth.php?oidc=initiate'); });
    }

    const form = $('#authForm');
    if (!form || form.__bound) return;
    form.__bound = true;

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const username = ($('#loginUsername') || {}).value || '';
      const password = ($('#loginPassword') || {}).value || '';
      const remember = !!(document.getElementById('rememberMeCheckbox') || {}).checked;

      await primeCsrf();
      const csrf = window.csrfToken || localStorage.getItem('csrf') || '';

      // After showing the login form in the not-authed branch
      (async () => {
        const qp = new URLSearchParams(location.search);
        if (qp.get('totp_required') === '1') {
          try { await primeCsrf(); } catch (e) { }
          window.pendingTOTP = true;
          try {
            const auth = await import(withBase('/js/auth.js?v={{APP_QVER}}'));
            if (typeof auth.openTOTPLoginModal === 'function') auth.openTOTPLoginModal();
          } catch (e) {
            console.warn('openTOTPLoginModal import failed', e);
          }
        }
      })();

      // JSON first
      try {
        const r = await fetch('/api/auth/auth.php', {
          method: 'POST', credentials: 'include',
          headers: Object.assign({ 'Content-Type': 'application/json', 'Accept': 'application/json' }, csrf ? { 'X-CSRF-Token': csrf } : {}),
          body: JSON.stringify({ username: String(username).trim(), password: String(password).trim(), remember_me: !!remember })
        });
        const j = await r.clone().json().catch(() => ({}));

        //  TOTP step-up?
        if (looksLikeTOTP(r, j)) {
          if (typeof window.__frResetLoginFailure === 'function') {
            window.__frResetLoginFailure();
          }
          await openTotpNow();
          return;
        }

        if (j && (j.authenticated || j.success || j.status === 'ok' || j.result === 'ok')) {
          if (typeof window.__frResetLoginFailure === 'function') {
            window.__frResetLoginFailure();
          }
          return afterLogin();
        }

        if (j && j.error && isDefinitiveLoginError(j.error)) {
          handleLoginFailureTip(j.error);
          alert('Login failed');
          return;
        }
      } catch (e) { }

      // fallback form
      try {
        const p = new URLSearchParams();
        p.set('username', username); p.set('password', password); p.set('remember_me', remember ? '1' : '0');
        const r2 = await fetch('/api/auth/auth.php', {
          method: 'POST', credentials: 'include',
          headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' }, csrf ? { 'X-CSRF-Token': csrf } : {}),
          body: p.toString()
        });
        const j2 = await r2.clone().json().catch(() => ({}));

        //  TOTP step-up on fallback too
        if (looksLikeTOTP(r2, j2)) {
          if (typeof window.__frResetLoginFailure === 'function') {
            window.__frResetLoginFailure();
          }
          await openTotpNow();
          return;
        }

        if (j2 && (j2.authenticated || j2.success || j2.status === 'ok' || j2.result === 'ok')) {
          if (typeof window.__frResetLoginFailure === 'function') {
            window.__frResetLoginFailure();
          }
          return afterLogin();
        }

        if (j2 && j2.error) {
          handleLoginFailureTip(j2.error);
        }
      } catch (e) { }
      alert('Login failed');
    });
  }
  function afterLogin() {
    // If index.html was opened with ?redirect=<url>, honor that first
    try {
      const url = new URL(window.location.href);
      const raw = url.searchParams.get('redirect');
      const safe = sanitizeRedirect(raw, { fallback: null });
      if (safe) {
        window.location.href = safe;
        return;
      }
    } catch (e) {
      // ignore URL/param issues and fall back to normal behavior
    }

    const start = Date.now();
    (function poll() {
      checkAuth().then(({ authed }) => {
        if (authed) { window.location.reload(); return; }
        if (Date.now() - start < 5000) return setTimeout(poll, 200);
        alert('Login session not established');
      }).catch(() => setTimeout(poll, 250));
    })();
  }

  // ---------- SETUP MODE (no flicker) ----------
  async function bootSetupWizard() {
    const overlay = document.getElementById('loadingOverlay'); if (overlay) overlay.remove();
    const wrap = document.querySelector('.main-wrapper'); if (wrap) hideEl(wrap);
    const login = document.getElementById('loginForm'); if (login) login.style.display = 'none';
    const hb = document.querySelector('.header-buttons'); if (hb) hb.style.visibility = 'hidden';
    (document.getElementById('mainOperations') || {}).style && (document.getElementById('mainOperations').style.display = 'none');
    (document.getElementById('uploadFileForm') || {}).style && (document.getElementById('uploadFileForm').style.display = 'none');
    (document.getElementById('fileListContainer') || {}).style && (document.getElementById('fileListContainer').style.display = 'none');

    window.setupMode = true;
    await primeCsrf();

    try { await import(withBase('/js/adminPanel.js?v={{APP_QVER}}')); } catch (e) { }
    try { document.dispatchEvent(new Event('DOMContentLoaded')); } catch (e) { }

    const addModal = document.getElementById('addUserModal'); if (addModal) addModal.style.display = 'block';

    const lu = document.getElementById('loginUsername'); if (lu) { lu.removeAttribute('autofocus'); lu.disabled = true; }
    const lp = document.getElementById('loginPassword'); if (lp) lp.disabled = true;

    document.querySelectorAll('[autofocus]').forEach(el => el.removeAttribute('autofocus'));
    bindSetupAddUser();
  }

  // ---------- HEAVY BOOT ----------
  async function bootHeavy(preAuthState) {
    if (window.__FR_FLAGS.bootPromise) return window.__FR_FLAGS.bootPromise;
    window.__FR_FLAGS.bootPromise = (async () => {
      if (window.__FR_FLAGS.booted) return; // no-op if somehow set
      window.__FR_FLAGS.booted = true;
      ensureToastReady();
      // show chrome

      const hb = document.querySelector('.header-buttons'); if (hb) hb.style.visibility = 'visible';
      const ov = document.getElementById('loadingOverlay'); if (ov) ov.style.display = 'flex';

      try {
        // 0) refresh auth snapshot (once)
        let state = preAuthState || {};
        try {
          if (!state || !Object.keys(state).length) {
            const r = await fetch('/api/auth/checkAuth.php', { credentials: 'include' });
            state = await r.json();
          }
          if (state && state.username) localStorage.setItem('username', state.username);
          if (typeof state.isAdmin !== 'undefined') localStorage.setItem('isAdmin', state.isAdmin ? '1' : '0');
          window.__FR_AUTH_STATE = state;
        } catch (e) { }

        // authed → heavy boot path
        document.body.classList.add('authed');

        // 1) i18n (safe)
        // i18n: honor saved language first, then apply translations
        try {
          const i18n = await import(withBase('/js/i18n.js?v={{APP_QVER}}')).catch(async (err) => {
            console.error('[boot] import i18n.js failed (versioned)', err && err.message, err && err.sourceURL);
            return import(withBase('/js/i18n.js'));
          });
          let saved = 'en';
          try { saved = localStorage.getItem('language') || 'en'; } catch (e) { }
          if (typeof i18n.setLocale === 'function') { await i18n.setLocale(saved); }
          if (typeof i18n.applyTranslations === 'function') { i18n.applyTranslations(); }
          try { document.documentElement.setAttribute('lang', saved); } catch (e) { }
        } catch (e) {
          console.error('[boot] i18n import/apply failed', e && e.message, e && e.sourceURL);
        }
        // 2) core app — **initialize exactly once** (this calls initUpload/initFileActions/loadFolderTree/etc.)
        const app = await import(withBase('/js/appCore.js?v={{APP_QVER}}')).catch(async (err) => {
          console.error('[boot] import appCore.js failed (versioned)', err && err.message, err && err.sourceURL);
          return import(withBase('/js/appCore.js'));
        });
        if (!window.__FR_FLAGS.initialized) {
          if (typeof app.loadCsrfToken === 'function') await app.loadCsrfToken();
          if (typeof app.initializeApp === 'function') app.initializeApp();
          const darkBtn = document.getElementById('darkModeToggle');
          if (darkBtn) {
            darkBtn.removeAttribute('hidden');
            darkBtn.style.setProperty('display', 'inline-flex', 'important'); // beats any CSS
            darkBtn.style.visibility = ''; // just in case
          }
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = withBase('/css/vendor/material-icons.css?v={{APP_QVER}}');
          document.head.appendChild(link);


          window.__FR_FLAGS.initialized = true;

          try {
            if (!sessionStorage.getItem('__fr_welcomed')) {
              const name = (window.__FR_AUTH_STATE?.username) || localStorage.getItem('username') || '';
              const safe = String(name).replace(/[\r\n<>]/g, '').trim().slice(0, 60);

              window.showToast(safe ? `Welcome back, ${safe}!` : 'Welcome!', 3000);
              sessionStorage.setItem('__fr_welcomed', '1'); // prevent repeats on reload
            }
          } catch (e) { }
        }


        // 3) auth/header bits — pass real state so “Admin Panel” shows up
        if (!window.__FR_FLAGS.wired.auth) {
          try {
            const auth = await import(withBase('/js/auth.js?v={{APP_QVER}}')).catch(async (err) => {
              console.error('[boot] import auth.js failed (versioned)', err && err.message, err && err.sourceURL);
              return import(withBase('/js/auth.js'));
            });
            auth.updateLoginOptionsUIFromStorage && auth.updateLoginOptionsUIFromStorage();
            auth.applyProxyBypassUI && auth.applyProxyBypassUI();
            auth.updateAuthenticatedUI && auth.updateAuthenticatedUI(state);

            //  bind ALL the admin / change-password buttons once
            if (!window.__FR_FLAGS.wired.authInit && typeof auth.initAuth === 'function') {
              try { auth.initAuth(); } catch (e) { console.warn('[auth] initAuth failed', e); }
              window.__FR_FLAGS.wired.authInit = true;
            }
          } catch (e) {
            console.warn('[auth] import failed', e);
          }
          wireUserNameLabel(state);
          window.__FR_FLAGS.wired.auth = true;
        }

        // 4) legacy ready **only once** (prevents loops)
        dispatchLegacyReadyOnce();

        // 5) light UI wiring — once each (no confirm bindings here; your modules own them)
        if (!window.__FR_FLAGS.wired.dark) { bindDarkMode(); window.__FR_FLAGS.wired.dark = true; }
        if (!window.__FR_FLAGS.wired.create) { wireCreateDropdown(); window.__FR_FLAGS.wired.create = true; }
        if (!window.__FR_FLAGS.wired.folder) { wireFolderButtons(); window.__FR_FLAGS.wired.folder = true; }
        if (!window.__FR_FLAGS.wired.lift) { liftModals(); window.__FR_FLAGS.wired.lift = true; }
        if (!window.__FR_FLAGS.wired.cancel) { bindCancelSafeties(); window.__FR_FLAGS.wired.cancel = true; }
        if (!window.__FR_FLAGS.wired.dragScroll) { bindDragAutoScroll(); window.__FR_FLAGS.wired.dragScroll = true; }
        wireModalEnterDefault();
        wireModalA11y();


      } catch (e) {
        console.error('[main] heavy boot failed', e && e.message ? e.message : e, e && e.sourceURL, e && e.line, e && e.stack);
        alert('Failed to load app');
      } finally {
        if (ov) ov.style.display = 'none';
        window.setupMode = false;
      }
    })();
    return window.__FR_FLAGS.bootPromise;
  }

  // ---------- entry (no flicker: decide state BEFORE showing login) ----------
  document.addEventListener('DOMContentLoaded', async () => {
    if (window.__FR_FLAGS.entryStarted) return;
    window.__FR_FLAGS.entryStarted = true;

    // Always start clean
    document.body.classList.remove('authed');

    const overlay = document.getElementById('loadingOverlay');
    const wrap = document.querySelector('.main-wrapper');   // app shell
    const mainEl = document.getElementById('main');           // contains loginForm
    const login = document.getElementById('loginForm');

    bindDarkMode();
    await loadSiteConfig();

    const { authed, setup, raw: authRaw } = await checkAuth();

    if (setup) {
      // Setup wizard runs without the app shell
      hideEl(wrap);
      hideEl(login);
      await bootSetupWizard();
      await revealAppAndHideOverlay();

      return;
    }

    if (authed) {
      // Authenticated path: show app, hide login
      document.body.classList.add('authed');
      unhide(wrap);            // works whether CSS or [hidden] was used
      hideEl(login);
      await bootHeavy(authRaw || null);
      await revealAppAndHideOverlay();
      requestAnimationFrame(() => {
        const pre = document.getElementById('pretheme-css');
        if (pre) pre.remove();
      });
      return;
    }

    // ---- NOT AUTHED: show only the login view ----
    hideEl(wrap);              // ensure app shell stays hidden while logged out
    unhide(mainEl);
    unhide(login);
    if (login) login.style.display = '';
    // …wire stuff…
    applySiteConfig(window.__FR_SITE_CFG__ || {}, { phase: 'final' });
    // Auto-SSO if OIDC is the only enabled method (add ?noauto=1 to skip)
    (() => {
      const lo = (window.__FR_SITE_CFG__ && window.__FR_SITE_CFG__.loginOptions) || {};
      const disableForm = !!(lo.disableFormLogin ?? lo.disable_form_login ?? lo.disableForm);
      const disableBasic = !!(lo.disableBasicAuth ?? lo.disable_basic_auth ?? lo.disableBasic);
      const disableOIDC = !!(lo.disableOIDCLogin ?? lo.disable_oidc_login ?? lo.disableOIDC);

      const onlyOIDC = disableForm && disableBasic && !disableOIDC;
      const qp = new URLSearchParams(location.search);

      if (onlyOIDC && qp.get('noauto') !== '1') {
        const btn = document.getElementById('oidcLoginBtn');
        if (btn) setTimeout(() => btn.click(), 250);
      }
    })();
    await revealAppAndHideOverlay();
    const hb = document.querySelector('.header-buttons');
    if (hb) hb.style.visibility = 'hidden';

    // keep app cards inert while logged out (no layout poke)
    ['uploadCard', 'folderManagementCard'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.setAttribute('aria-hidden', 'true');
      try { el.inert = true; } catch (e) { }
    });

    bindLogin();
    wireCreateDropdown();
    keepCreateDropdownWired();
    wireModalEnterDefault();
    showLoginTip('Please log in to continue');

    if (overlay) overlay.style.display = 'none';
  }, { once: true });
})();


// --- Mobile switcher + PWA SW (mobile-only) ---
(() => {
  // keep it simple + robust
  const qs = new URLSearchParams(location.search);
  const hasFrAppHint = qs.get('frapp') === '1';

  const isStandalone =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    (typeof navigator.standalone === 'boolean' && navigator.standalone);

  const isCapUA = /\bCapacitor\b/i.test(navigator.userAgent);
  const hasCapBridge = !!(window.Capacitor && window.Capacitor.Plugins);

  // “mobile-ish”: native mobile UAs OR touch + reasonably narrow viewport (covers iPad-on-Mac UA)
  const isMobileish =
    /Android|iPhone|iPad|iPod|Mobile|Silk|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) <= 900);

  // load the switcher only in the mobile app, or mobile standalone PWA, or when explicitly hinted
  const shouldLoadSwitcher =
    hasCapBridge || isCapUA || (isStandalone && isMobileish) || (hasFrAppHint && isMobileish);

  // expose a flag to inspect later
  window.FR_APP = !!(hasCapBridge || isCapUA || (isStandalone && isMobileish));

  const QVER = (window.APP_QVER && String(window.APP_QVER)) || '{{APP_QVER}}';

  if (shouldLoadSwitcher) {
    import(withBase(`/js/mobile/switcher.js?v=${encodeURIComponent(QVER)}`))
      .then(() => {
        if (hasFrAppHint && !sessionStorage.getItem('frx_opened_once')) {
          sessionStorage.setItem('frx_opened_once', '1');
          window.dispatchEvent(new CustomEvent('frx:openSwitcher'));
        }
      })
      .catch(err => console.info('[FileRise] switcher import failed:', err));
  }

  // SW only for web (https or localhost), never in Capacitor
  const onHttps = location.protocol === 'https:' || location.hostname === 'localhost';
  if ('serviceWorker' in navigator && onHttps && !hasCapBridge && !isCapUA) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(withBase(`/sw.js?v=${encodeURIComponent(QVER)}`)).catch(() => { });
    });
  }
})();
