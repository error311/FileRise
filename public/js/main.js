// /js/main.js — light bootstrap

// ---- Toast bridge (global, early, race-proof) ----
(function installToastBridge() {
  if (window.__FR_TOAST_BRIDGE__) return;
  window.__FR_TOAST_BRIDGE__ = true;

  window.__FR_TOAST_Q = window.__FR_TOAST_Q || [];     // queued toasts until real toast is ready
  window.__REAL_TOAST__ = window.__REAL_TOAST__ || null; // set later once domUtils is loaded
  window.__FR_TOAST_FILTER__ = window.__FR_TOAST_FILTER__ || null; // filter hook (auth.js)

  window.showToast = function (msgOrKey, duration) {
    // Let auth.js (or anyone) rewrite/suppress messages centrally.
    try {
      if (typeof window.__FR_TOAST_FILTER__ === 'function') {
        const out = window.__FR_TOAST_FILTER__(msgOrKey);
        if (out === null) return;           // suppressed
        msgOrKey = out;                     // rewritten/translated
      }
    } catch { }

    if (typeof window.__REAL_TOAST__ === 'function') {
      return window.__REAL_TOAST__(msgOrKey, duration);
    }
    window.__FR_TOAST_Q.push([msgOrKey, duration]);
  };

  // Optional: generic event bridge
  window.addEventListener('filerise:toast', (e) => {
    const { message, duration } = (e && e.detail) || {};
    if (message) window.showToast(message, duration);
  });
})();

async function ensureToastReady() {
  if (window.__REAL_TOAST__) return;
  try {
    const dom = await import('/js/domUtils.js?v={{APP_QVER}}');  // real toast
    const real = dom.showToast || ((m, d) => console.log('TOAST:', m, d));

    // (Optional) “false-negative to success” normalizer
    const normalized = function (msg, dur) {
      try {
        const m = (msg || '').toString().toLowerCase();
        if (/does not exist|already exist|not found/.test(m) && window.__FR_LAST_OK) {
          window.__FR_LAST_OK = false;
          return real('Done.', dur);
        }
      } catch { }
      return real(msg, dur);
    };

    window.__REAL_TOAST__ = normalized;

    // Flush anything that queued before domUtils was ready
    const q = window.__FR_TOAST_Q || [];
    window.__FR_TOAST_Q = [];
    q.forEach(([m, d]) => window.__REAL_TOAST__(m, d));
  } catch {
    window.__REAL_TOAST__ = (m, d) => console.log('TOAST:', m, d);
  }
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

  function normalizeUrl(u) {
    try {
      const url = new URL(u, window.location.origin);
      // Keep path + stable query ordering
      const params = new URLSearchParams(url.search);
      const sorted = new URLSearchParams();
      [...params.keys()].sort().forEach(k => sorted.set(k, params.get(k)));
      return url.pathname + (sorted.toString() ? '?' + sorted.toString() : '');
    } catch { return String(u || ''); }
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
        } catch {
          // maybe urlencoded
          const p = new URLSearchParams(b);
          ['csrf', 'csrf_token', '_'].forEach(k => p.delete(k));
          return 'FORM:' + [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('&');
        }
      }
    } catch { }
    return 'B:' + String(b);
  }

  window.fetch = async (input, init = {}) => {
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

    // 1) Only coalesce mutating methods
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return nativeFetch(input, init);
    }

    // 2) Only same-origin API calls
    const isSameOrigin = (typeof input === 'string')
      ? input.startsWith('/') || input.startsWith(location.origin)
      : new URL(input.url).origin === location.origin;
    const urlPath = (typeof input === 'string') ? input : new URL(input.url).pathname;
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
        try { okJson = await clone.json(); } catch { }
        const okFlag = res.ok && okJson && (
          okJson.success === true || okJson.status === 'ok' || okJson.result === 'ok'
        );
        window.__FR_LAST_OK = !!okFlag;
      } catch { }
      return res;
    }).finally(() => {
      // let it linger briefly so very-rapid duplicates still coalesce
      setTimeout(() => inFlight.delete(key), 200);
    });

    inFlight.set(key, { ts: now, promise: p });
    return p.then(r => r.clone());
  };

  // Gentle toast normalizer (compatible with showToast(message, duration))
  const origToast = window.showToast;
  if (typeof origToast === 'function' && !origToast.__frWrapped) {
    const wrapped = function (msg, maybeDuration) {
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
      } catch { }
      const dur = (typeof maybeDuration === 'number') ? maybeDuration : undefined;
      return origToast(msg, dur);
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
  try { document.dispatchEvent(new Event('DOMContentLoaded')); } catch { }
  try { window.dispatchEvent(new Event('load')); } catch { }
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
  try { stored = localStorage.getItem('darkMode'); } catch { }

  // If no stored pref, fall back to system
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
      try { localStorage.setItem('darkMode', isDarkNext ? '1' : '0'); } catch { }
      applyDarkMode();
    });
  }

  // Listen to system changes only if user has NOT set a preference
  if (!window.__FR_FLAGS.wired.sysDarkMO) {
    window.__FR_FLAGS.wired.sysDarkMO = true;
    let stored = null; try { stored = localStorage.getItem('darkMode'); } catch { }
    if (stored === null && window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyDarkMode({ fromSystemChange: true });
      try { mq.addEventListener('change', handler); } catch { mq.addListener(handler); }
    }
  }
}

(function () {
  // ---------- tiny utils ----------
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
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
  function applySiteConfig(cfg) {
    try {
      const title = (cfg && cfg.header_title) ? String(cfg.header_title) : 'FileRise';
      document.title = title;
      const h1 = document.querySelector('.header-title h1'); if (h1) h1.textContent = title;

      const lo = (cfg && cfg.loginOptions) ? cfg.loginOptions : {};
      const disableForm = !!lo.disableFormLogin;
      const disableOIDC = !!lo.disableOIDCLogin;
      const disableBasic = !!lo.disableBasicAuth;

      const row = $('#loginForm'); if (row) row.style.display = disableForm ? 'none' : '';
      const oidc = $('#oidcLoginBtn'); if (oidc) oidc.style.display = disableOIDC ? 'none' : '';
      const basic = document.querySelector('a[href="/api/auth/login_basic.php"]');
      if (basic) basic.style.display = disableBasic ? 'none' : '';
    } catch { }
  }
  async function loadSiteConfig() {
    try {
      const r = await fetch('/api/siteConfig.php', { credentials: 'include' });
      const j = await r.json().catch(() => ({})); applySiteConfig(j);
    } catch { applySiteConfig({}); }
  }
  async function primeCsrf() {
    try {
      const tr = await fetch('/api/auth/token.php', { credentials: 'include' });
      const tj = await tr.json().catch(() => ({}));
      if (tj?.csrf_token) { setMeta('csrf-token', tj.csrf_token); window.csrfToken = tj.csrf_token; try { localStorage.setItem('csrf', tj.csrf_token); } catch { } }
    } catch { }
  }
  async function checkAuth() {
    try {
      const r = await fetch('/api/auth/checkAuth.php', { credentials: 'include' });
      const j = await r.json().catch(() => ({}));

      if (j?.csrf_token) {
        setMeta('csrf-token', j.csrf_token);
        window.csrfToken = j.csrf_token;
        try { localStorage.setItem('csrf', j.csrf_token); } catch { }
      }
      if (typeof j?.isAdmin !== 'undefined') {
        try { localStorage.setItem('isAdmin', j.isAdmin ? '1' : '0'); } catch { }
      }
      if (typeof j?.username !== 'undefined') {
        try { localStorage.setItem('username', j.username || ''); } catch { }
      }

      const setup = !!j?.setup || !!j?.setup_mode || j?.mode === 'setup' || j?.status === 'setup' || !!j?.requires_setup || !!j?.needs_setup;
      return { authed: !!j?.authenticated, setup, raw: j };
    } catch {
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
    try { j = await res.json(); } catch { }
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
    hide($('.main-wrapper'));
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
    } catch { }
    return false;
  }

  async function openTotpNow() {
    // refresh CSRF for the upcoming /totp_verify call
    try { await primeCsrf(); } catch { }
    window.pendingTOTP = true;
    // reuse the function you already export from auth.js
    try {
      const auth = await import('/js/auth.js?v={{APP_QVER}}');
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
      oidcBtn.addEventListener('click', () => { window.location.href = '/api/auth/auth.php?oidc=initiate'; });
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
          try { await primeCsrf(); } catch { }
          window.pendingTOTP = true;
          try {
            const auth = await import('/js/auth.js?v={{APP_QVER}}');
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
        if (looksLikeTOTP(r, j)) { await openTotpNow(); return; }

        if (j && (j.authenticated || j.success || j.status === 'ok' || j.result === 'ok')) return afterLogin();
      } catch { }

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
        if (looksLikeTOTP(r2, j2)) { await openTotpNow(); return; }

        if (j2 && (j2.authenticated || j2.success || j2.status === 'ok' || j2.result === 'ok')) return afterLogin();
      } catch { }
      alert('Login failed');
    });
  }
  function afterLogin() {
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
    const wrap = document.querySelector('.main-wrapper'); if (wrap) wrap.style.display = '';
    const login = document.getElementById('loginForm'); if (login) login.style.display = 'none';
    const hb = document.querySelector('.header-buttons'); if (hb) hb.style.visibility = 'hidden';
    (document.getElementById('mainOperations') || {}).style && (document.getElementById('mainOperations').style.display = 'none');
    (document.getElementById('uploadFileForm') || {}).style && (document.getElementById('uploadFileForm').style.display = 'none');
    (document.getElementById('fileListContainer') || {}).style && (document.getElementById('fileListContainer').style.display = 'none');

    window.setupMode = true;
    await primeCsrf();

    try { await import('/js/adminPanel.js?v={{APP_QVER}}'); } catch { }
    try { document.dispatchEvent(new Event('DOMContentLoaded')); } catch { }

    const addModal = document.getElementById('addUserModal'); if (addModal) addModal.style.display = 'block';

    const lu = document.getElementById('loginUsername'); if (lu) { lu.removeAttribute('autofocus'); lu.disabled = true; }
    const lp = document.getElementById('loginPassword'); if (lp) lp.disabled = true;

    document.querySelectorAll('[autofocus]').forEach(el => el.removeAttribute('autofocus'));
    bindSetupAddUser();
  }

  // ---------- HEAVY BOOT ----------
  async function bootHeavy() {
    if (window.__FR_FLAGS.bootPromise) return window.__FR_FLAGS.bootPromise;
    window.__FR_FLAGS.bootPromise = (async () => {
      if (window.__FR_FLAGS.booted) return; // no-op if somehow set
      window.__FR_FLAGS.booted = true;
      ensureToastReady();
      // show chrome
      const wrap = document.querySelector('.main-wrapper'); if (wrap) { wrap.hidden = false; wrap.classList?.remove('d-none', 'hidden'); wrap.style.display = 'block'; }
      const lf = document.getElementById('loginForm'); if (lf) lf.style.display = 'none';
      const hb = document.querySelector('.header-buttons'); if (hb) hb.style.visibility = 'visible';
      const ov = document.getElementById('loadingOverlay'); if (ov) ov.style.display = 'flex';

      try {
        // 0) refresh auth snapshot (once)
        let state = {};
        try {
          const r = await fetch('/api/auth/checkAuth.php', { credentials: 'include' });
          state = await r.json();
          if (state && state.username) localStorage.setItem('username', state.username);
          if (typeof state.isAdmin !== 'undefined') localStorage.setItem('isAdmin', state.isAdmin ? '1' : '0');
          window.__FR_AUTH_STATE = state;
        } catch { }

        // 1) i18n (safe)
        // i18n: honor saved language first, then apply translations
        try {
          const i18n = await import('/js/i18n.js?v={{APP_QVER}}').catch(() => import('/js/i18n.js'));
          let saved = 'en';
          try { saved = localStorage.getItem('language') || 'en'; } catch { }
          if (typeof i18n.setLocale === 'function') { await i18n.setLocale(saved); }
          if (typeof i18n.applyTranslations === 'function') { i18n.applyTranslations(); }
          try { document.documentElement.setAttribute('lang', saved); } catch { }
        } catch { }
        // 2) core app — **initialize exactly once** (this calls initUpload/initFileActions/loadFolderTree/etc.)
        const app = await import('/js/appCore.js?v={{APP_QVER}}');
        if (!window.__FR_FLAGS.initialized) {
          if (typeof app.loadCsrfToken === 'function') await app.loadCsrfToken();
          if (typeof app.initializeApp === 'function') app.initializeApp();

          window.__FR_FLAGS.initialized = true;

          // Show "Welcome back, <username>!" only once per tab-session
          try {
            if (!sessionStorage.getItem('__fr_welcomed')) {
              const name = (window.__FR_AUTH_STATE?.username) || localStorage.getItem('username') || '';
              const safe = String(name).replace(/[\r\n<>]/g, '').trim().slice(0, 60);

              window.showToast(safe ? `Welcome back, ${safe}!` : 'Welcome!', 3000);
              sessionStorage.setItem('__fr_welcomed', '1'); // prevent repeats on reload
            }
          } catch { }
        }


        // 3) auth/header bits — pass real state so “Admin Panel” shows up
        if (!window.__FR_FLAGS.wired.auth) {
          try {
            const auth = await import('/js/auth.js?v={{APP_QVER}}');
            auth.updateLoginOptionsUIFromStorage && auth.updateLoginOptionsUIFromStorage();
            auth.applyProxyBypassUI && auth.applyProxyBypassUI();
            auth.updateAuthenticatedUI && auth.updateAuthenticatedUI(state);

            // ⬇️ bind ALL the admin / change-password buttons once
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

        // 5) first file list — once (initializeApp doesn’t fetch list)
        if (!window.__FR_FLAGS.wired.firstList) {
          try {
            const flv = await import('/js/fileListView.js?v={{APP_QVER}}');
            window.currentFolder ||= 'root';
            if (typeof flv.loadFileList === 'function') await flv.loadFileList(window.currentFolder);
            const list = document.getElementById('fileListContainer'); if (list) list.style.display = '';
            updateFileListTitle();
          } catch { }
          window.__FR_FLAGS.wired.firstList = true;
        }
        // 6) light UI wiring — once each (no confirm bindings here; your modules own them)
        if (!window.__FR_FLAGS.wired.dark) { bindDarkMode(); window.__FR_FLAGS.wired.dark = true; }
        if (!window.__FR_FLAGS.wired.create) { wireCreateDropdown(); window.__FR_FLAGS.wired.create = true; }
        if (!window.__FR_FLAGS.wired.folder) { wireFolderButtons(); window.__FR_FLAGS.wired.folder = true; }
        if (!window.__FR_FLAGS.wired.lift) { liftModals(); window.__FR_FLAGS.wired.lift = true; }
        if (!window.__FR_FLAGS.wired.cancel) { bindCancelSafeties(); window.__FR_FLAGS.wired.cancel = true; }
        if (!window.__FR_FLAGS.wired.dragScroll) { bindDragAutoScroll(); window.__FR_FLAGS.wired.dragScroll = true; }
        wireModalEnterDefault();


      } catch (e) {
        console.error('[main] heavy boot failed', e);
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

    bindDarkMode();
    await loadSiteConfig();

    const { authed, setup } = await checkAuth();

    if (setup) { await bootSetupWizard(); return; }
    if (authed) { await bootHeavy(); return; }

    // login view
    show(document.querySelector('#main'));
    show(document.querySelector('#loginForm'));
    (document.querySelector('.header-buttons') || {}).style && (document.querySelector('.header-buttons').style.visibility = 'hidden');
    const ov = document.getElementById('loadingOverlay'); if (ov) ov.style.display = 'none';
    ['uploadCard', 'folderManagementCard'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
      try { el.inert = true; } catch { }
    });
    bindLogin();
    wireCreateDropdown();
    keepCreateDropdownWired();
    wireModalEnterDefault();

    await ensureToastReady();
    window.showToast('please_log_in_to_continue', 6000);

  }, { once: true }); // <— important
})();