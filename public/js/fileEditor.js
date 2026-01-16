// fileEditor.js
import { escapeHTML, showToast } from './domUtils.js?v={{APP_QVER}}';
import { loadFileList } from './fileListView.js?v={{APP_QVER}}';
import { t } from './i18n.js?v={{APP_QVER}}';
import { buildPreviewUrl } from './filePreview.js?v={{APP_QVER}}';
import { withBase } from './basePath.js?v={{APP_QVER}}';

// thresholds for editor behavior
const EDITOR_PLAIN_THRESHOLD = 5 * 1024 * 1024;  // >5 MiB => force plain text, lighter settings
const EDITOR_BLOCK_THRESHOLD = 10 * 1024 * 1024; // >10 MiB => block editing

// ==== CodeMirror lazy loader ===============================================
const CM_BASE = withBase("/vendor/codemirror/5.65.18/");

// Stamp-friendly helpers (the stamper will replace {{APP_QVER}})
const coreUrl = (p) => `${CM_BASE}${p}?v={{APP_QVER}}`;

const CORE = {
  js: coreUrl("codemirror.min.js"),
  css: coreUrl("codemirror.min.css"),
  themeCss: coreUrl("theme/material-darker.min.css"),
};

// Which mode file to load for a given name/mime
const MODE_URL = {
  // core/common
  "xml": "mode/xml/xml.min.js?v={{APP_QVER}}",
  "css": "mode/css/css.min.js?v={{APP_QVER}}",
  "javascript": "mode/javascript/javascript.min.js?v={{APP_QVER}}",

  // meta / combos
  "htmlmixed": "mode/htmlmixed/htmlmixed.min.js?v={{APP_QVER}}",
  "application/x-httpd-php": "mode/php/php.min.js?v={{APP_QVER}}",

  // docs / data
  "markdown": "mode/markdown/markdown.min.js?v={{APP_QVER}}",
  "yaml": "mode/yaml/yaml.min.js?v={{APP_QVER}}",
  "properties": "mode/properties/properties.min.js?v={{APP_QVER}}",
  "sql": "mode/sql/sql.min.js?v={{APP_QVER}}",

  // shells
  "shell": "mode/shell/shell.min.js?v={{APP_QVER}}",

  // languages
  "python": "mode/python/python.min.js?v={{APP_QVER}}",
  "text/x-csrc": "mode/clike/clike.min.js?v={{APP_QVER}}",
  "text/x-c++src": "mode/clike/clike.min.js?v={{APP_QVER}}",
  "text/x-java": "mode/clike/clike.min.js?v={{APP_QVER}}",
  "text/x-csharp": "mode/clike/clike.min.js?v={{APP_QVER}}",
  "text/x-kotlin": "mode/clike/clike.min.js?v={{APP_QVER}}"
};

// Mode dependency graph
const MODE_DEPS = {
  "htmlmixed": ["xml", "javascript", "css"],
  "application/x-httpd-php": ["htmlmixed", "text/x-csrc"], // php overlays + clike bits
  "markdown": ["xml"]
};

// Map any mime/alias to the key we use in MODE_URL
function normalizeModeName(modeOption) {
  const name = typeof modeOption === "string" ? modeOption : (modeOption && modeOption.name);
  if (!name) return null;
  if (name === "text/html") return "htmlmixed";          // CodeMirror uses htmlmixed for HTML
  if (name === "php") return "application/x-httpd-php";  // prefer the full mime
  return name;
}

// ---- ONLYOFFICE integration -----------------------------------------------

function getExt(name) { const i = name.lastIndexOf('.'); return i >= 0 ? name.slice(i + 1).toLowerCase() : ''; }

// Cache OO capabilities (enabled flag + ext list) from /api/onlyoffice/status.php
let __ooCaps = { enabled: false, exts: new Set(), fetched: false, docsOrigin: null };

async function fetchOnlyOfficeCapsOnce() {
  if (__ooCaps.fetched) return __ooCaps;
  try {
    const r = await fetch('/api/onlyoffice/status.php', { credentials: 'include' });
    if (r.ok) {
      const j = await r.json();
      __ooCaps.enabled = !!j.enabled;
      __ooCaps.exts = new Set(Array.isArray(j.exts) ? j.exts : []);
      __ooCaps.docsOrigin = j.docsOrigin || null; // harmless if server doesn't send it
    }
  } catch (e) { /* ignore; keep defaults */ }
  __ooCaps.fetched = true;
  return __ooCaps;
}

async function shouldUseOnlyOffice(fileName) {
  const { enabled, exts } = await fetchOnlyOfficeCapsOnce();
  return enabled && exts.has(getExt(fileName));
}

function isAbsoluteHttpUrl(u) { return /^https?:\/\//i.test(u || ''); }

function normalizeSourceId(raw) {
  const id = String(raw || '').trim();
  return id;
}

// Folder encryption check (used to bypass ONLYOFFICE in encrypted folders)
const __folderEncryptedCache = new Map(); // folder -> Promise<bool>
async function isFolderEncrypted(folder, sourceId = '') {
  const f = (!folder || folder === '') ? 'root' : String(folder);
  const sid = normalizeSourceId(sourceId);
  const key = sid ? `${sid}::${f}` : f;
  if (__folderEncryptedCache.has(key)) return __folderEncryptedCache.get(key);
  const p = (async () => {
    try {
      const params = new URLSearchParams({
        folder: f,
        t: String(Date.now())
      });
      if (sid) params.set('sourceId', sid);
      const r = await fetch(withBase(`/api/folder/capabilities.php?${params.toString()}`), { credentials: 'include' });
      if (!r.ok) return false;
      const j = await r.json().catch(() => null);
      return !!(j && j.encryption && j.encryption.encrypted);
    } catch (e) {
      return false;
    }
  })();
  __folderEncryptedCache.set(key, p);
  return p;
}

// ---- script/css single-load with timeout guards ----
const _loadedScripts = new Set();
const _loadedCss = new Set();
let _corePromise = null;

function loadScriptOnce(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    if (_loadedScripts.has(url)) return resolve();
    const s = document.createElement("script");
    const timer = setTimeout(() => {
      try { s.remove(); } catch (e) { }
      reject(new Error(`Timeout loading: ${url}`));
    }, timeoutMs);
    s.src = url;
    s.async = true;
    s.onload = () => { clearTimeout(timer); _loadedScripts.add(url); resolve(); };
    s.onerror = () => { clearTimeout(timer); reject(new Error(`Load failed: ${url}`)); };
    document.head.appendChild(s);
  });
}

function loadCssOnce(href) {
  return new Promise((resolve, reject) => {
    if (_loadedCss.has(href)) return resolve();
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.onload = () => { _loadedCss.add(href); resolve(); };
    l.onerror = () => reject(new Error(`Load failed: ${href}`));
    document.head.appendChild(l);
  });
}

async function ensureCore() {
  if (_corePromise) return _corePromise;
  _corePromise = (async () => {
    // load CSS first to avoid FOUC
    await loadCssOnce(CORE.css);
    await loadCssOnce(CORE.themeCss);
    if (!window.CodeMirror) {
      await loadScriptOnce(CORE.js);
    }
  })();
  return _corePromise;
}

async function loadSingleMode(name) {
  const rel = MODE_URL[name];
  if (!rel) return;
  const url = rel.startsWith("http") ? rel : (rel.startsWith("/") ? withBase(rel) : (CM_BASE + rel));
  await loadScriptOnce(url);
}

function isModeRegistered(name) {
  return !!(
    (window.CodeMirror?.modes && window.CodeMirror.modes[name]) ||
    (window.CodeMirror?.mimeModes && window.CodeMirror.mimeModes[name])
  );
}

async function ensureModeLoaded(modeOption) {
  await ensureCore();
  const name = normalizeModeName(modeOption);
  if (!name) return;
  if (isModeRegistered(name)) return;
  const deps = MODE_DEPS[name] || [];
  for (const d of deps) {
    if (!isModeRegistered(d)) await loadSingleMode(d);
  }
  await loadSingleMode(name);
}

// Public helper for callers (we keep your existing function name in use):
const MODE_LOAD_TIMEOUT_MS = 300; // allow closing immediately; don't wait forever
// ==== /CodeMirror lazy loader ===============================================

// ---- OO preconnect / prewarm ----
function injectOOPreconnect(origin) {
  try {
    if (!origin || !isAbsoluteHttpUrl(origin)) return;
    const make = (rel) => { const l = document.createElement('link'); l.rel = rel; l.href = origin; return l; };
    document.head.appendChild(make('dns-prefetch'));
    document.head.appendChild(make('preconnect'));
  } catch (e) { }
}

async function ensureOnlyOfficeApi(srcFromConfig, originFromConfig) {
  // Prefer explicit src; else derive from origin; else fall back to window/global or default prefix path
  let src = srcFromConfig;
  if (!src) {
    if (originFromConfig && isAbsoluteHttpUrl(originFromConfig)) {
      src = originFromConfig.replace(/\/$/, '') + '/web-apps/apps/api/documents/api.js';
    } else {
      src = window.ONLYOFFICE_API_SRC || '/onlyoffice/web-apps/apps/api/documents/api.js';
    }
  }
  if (window.DocsAPI && typeof window.DocsAPI.DocEditor === 'function') return;
  // Try once; if it times out and we derived from origin, fall back to the default prefix path
  try {
    console.time('oo:api.js');
    await loadScriptOnce(src);
  } catch (e) {
    if (src !== '/onlyoffice/web-apps/apps/api/documents/api.js') {
      await loadScriptOnce('/onlyoffice/web-apps/apps/api/documents/api.js');
    } else {
      throw e;
    }
  } finally {
    console.timeEnd('oo:api.js');
  }
}

// ===== ONLYOFFICE: full-screen modal + warm on every click =====
const ALWAYS_WARM_OO = true;      // warm EVERY time
const OO_WARM_MS     = 300;

function ensureOoModalCss() {
  const prev = document.getElementById('ooEditorModalCss');
  if (prev) return;

  const style = document.createElement('style');
  style.id = 'ooEditorModalCss';
  style.textContent = `
    #ooEditorModal{
      --oo-header-h: 40px;
      --oo-header-pad-v: 12px;
      --oo-header-pad-h: 18px;
      --oo-logo-h: 26px; /* tweak logo size */
    }

    #ooEditorModal{
      position:fixed!important; inset:0!important; margin:0!important; padding:0!important;
      display:flex!important; flex-direction:column!important; z-index:2147483646!important;
      background:var(--oo-modal-bg,#111)!important;
    }

    /* Header: logo (left) + title (fill) + absolute close (right) */
    #ooEditorModal .editor-header{
      position:relative; display:flex; align-items:center; gap:12px;
      min-height:var(--oo-header-h);
      padding:var(--oo-header-pad-v) var(--oo-header-pad-h);
      padding-right: calc(var(--oo-header-pad-h) + 64px); /* room for 32px round close */
      border-bottom:1px solid rgba(0,0,0,.15);
      box-sizing:border-box;
    }

    #ooEditorModal .editor-logo{
      height:var(--oo-logo-h); width:auto; flex:0 0 auto;
      display:block; user-select:none; -webkit-user-drag:none;
    }

    #ooEditorModal .editor-title{
      margin:0; font-size:18px; font-weight:700; line-height:1.2;
      overflow:hidden; white-space:nowrap; text-overflow:ellipsis;
      flex:1 1 auto;
    }

    /* Your scoped close button style */
    #ooEditorModal .editor-close-btn{
      position:absolute; top:5px; right:10px;
      display:flex; justify-content:center; align-items:center;
      font-size:20px; font-weight:bold; cursor:pointer; z-index:1000;
      width:32px; height:32px; border-radius:50%; text-align:center; line-height:30px;
      color:#ff4d4d; background-color:rgba(255,255,255,.9); border:2px solid transparent;
      transition:all .3s ease-in-out;
    }
    #ooEditorModal .editor-close-btn:hover{
      color:#fff; background-color:#ff4d4d;
      box-shadow:0 0 6px rgba(255,77,77,.8); transform:scale(1.05);
    }
    .dark-mode #ooEditorModal .editor-close-btn{ background-color:rgba(0,0,0,.7); color:#ff6666; }
    .dark-mode #ooEditorModal .editor-close-btn:hover{ background-color:#ff6666; color:#000; }

    #ooEditorModal .editor-body{
      position:relative!important; flex:1 1 auto!important; min-height:0!important; overflow:hidden!important;
    }
    #ooEditorModal #oo-editor{ width:100%!important; height:100%!important; }

        #ooEditorModal .oo-warm-overlay{
      position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
      background:rgba(0,0,0,.14); z-index:5; font-weight:600; font-size:14px;
      pointer-events: none; /* let clicks pass through to ONLYOFFICE (CSV dialog etc.) */
    }

    html.oo-lock, body.oo-lock{ height:100%!important; overflow:hidden!important; }
  `;
  document.head.appendChild(style);
}

// Theme-aware background so there’s no white/gray edge
function applyModalBg(modal){
  const isDark = document.documentElement.classList.contains('dark-mode')
    || /^(1|true)$/i.test(localStorage.getItem('darkMode') || '');
  const cs = getComputedStyle(document.documentElement);
  const bg = (cs.getPropertyValue('--bg-color') || cs.getPropertyValue('--pre-bg') || '').trim()
           || (isDark ? '#121212' : '#ffffff');
  modal.style.setProperty('--oo-modal-bg', bg);
}

function lockPageScroll(on){
  [document.documentElement, document.body].forEach(el => el.classList.toggle('oo-lock', !!on));
}

function ensureOoFullscreenModal(){
  ensureOoModalCss();
  let modal = document.getElementById('ooEditorModal');
  if (!modal){
    modal = document.createElement('div');
    modal.id = 'ooEditorModal';
    modal.innerHTML = `
      <div class="editor-header">
        <img class="editor-logo" src="${withBase('/assets/logo.svg?v={{APP_QVER}}')}" alt="FileRise logo" />
        <h3 class="editor-title"></h3>
        <button id="closeEditorX" class="editor-close-btn" aria-label="${t("close") || "Close"}">&times;</button>
      </div>
      <div class="editor-body">
        <div id="oo-editor"></div>
      </div>
    `;
    document.body.appendChild(modal);
  } else {
    modal.querySelector('.editor-body').innerHTML = `<div id="oo-editor"></div>`;
    // ensure logo exists and is placed before title when reusing
    const header = modal.querySelector('.editor-header');
    if (!header.querySelector('.editor-logo')){
      const img = document.createElement('img');
      img.className = 'editor-logo';
      img.src = withBase('/assets/logo.svg?v={{APP_QVER}}');
      img.alt = 'FileRise logo';
      header.insertBefore(img, header.querySelector('.editor-title'));
    } else {
      // make sure order is logo -> title
      const logo = header.querySelector('.editor-logo');
      const title = header.querySelector('.editor-title');
      if (logo.nextElementSibling !== title){
        header.insertBefore(logo, title);
      }
    }
  }
  applyModalBg(modal);
  modal.style.display = 'flex';
  modal.focus();
  lockPageScroll(true);
  return modal;
}

// Overlay lives INSIDE the modal body
function setOoBusy(modal, on, label='Preparing editor…'){
  if (!modal) return;
  const body = modal.querySelector('.editor-body');
  let ov = body.querySelector('.oo-warm-overlay');
  if (on){
    if (!ov){
      ov = document.createElement('div');
      ov.className = 'oo-warm-overlay';
      ov.textContent = label;
      body.appendChild(ov);
    }
  } else if (ov){
    ov.remove();
  }
}

// Hidden warm-up DocEditor (creates DS session/cache) then destroys
async function warmDocServerOnce(cfg){
  let host = null, warmEditor = null;
  try{
    host = document.createElement('div');
    host.id = 'oo-warm-' + Math.random().toString(36).slice(2);
    Object.assign(host.style, {
      position:'absolute', left:'-99999px', top:'0', width:'2px', height:'2px', overflow:'hidden'
    });
    document.body.appendChild(host);

    const warmCfg = JSON.parse(JSON.stringify(cfg));
    warmCfg.events = Object.assign({}, warmCfg.events, { onAppReady(){}, onDocumentReady(){} });

    warmEditor = new window.DocsAPI.DocEditor(host.id, warmCfg);
    await new Promise(res => setTimeout(res, OO_WARM_MS));
  }catch (e) {} finally{
    try{ warmEditor?.destroyEditor?.(); }catch (e) {}
    try{ host?.remove(); }catch (e) {}
  }
}

// Full-screen OO open with hidden warm-up EVERY click, then real editor
async function openOnlyOffice(fileName, folder, sourceId = ''){
  let editor = null;
  let removeThemeListener = () => {};
  let cfg = null;
  let userClosed = false;

  // Build our full-screen modal
  const modal = ensureOoFullscreenModal();
  const titleEl = modal.querySelector('.editor-title');
  if (titleEl) titleEl.innerHTML = `${t("editing")}: ${escapeHTML(fileName)}`;

  const destroy = (removeModal = true) => {
    try { editor?.destroyEditor?.(); } catch (e) {}
    try { removeThemeListener(); } catch (e) {}
    if (removeModal) { try { modal.remove(); } catch (e) {} }
    lockPageScroll(false);
  };
  const onClose = () => { userClosed = true; destroy(true); };

  modal.querySelector('#closeEditorX')?.addEventListener('click', onClose);
  modal.addEventListener('keydown', (e) => { if (e.key === 'Escape') onClose(); });

  try{
    // 1) Fetch config
    const f = (!folder || folder === '') ? 'root' : String(folder);
    const sid = normalizeSourceId(sourceId);
    const params = new URLSearchParams({
      folder: f,
      file: fileName
    });
    if (sid) params.set('sourceId', sid);
    const url = withBase(`/api/onlyoffice/config.php?${params.toString()}`);
    const resp = await fetch(url, { credentials: 'include' });
    const text = await resp.text();

    try { cfg = JSON.parse(text); } catch (e) {
      throw new Error(`ONLYOFFICE config parse failed (HTTP ${resp.status}). First 120 chars: ${text.slice(0,120)}`);
    }
    if (!resp.ok) throw new Error(cfg?.error || `ONLYOFFICE config HTTP ${resp.status}`);

    // 2) Preconnect + load DocsAPI
    injectOOPreconnect(cfg.documentServerOrigin || null);
    await ensureOnlyOfficeApi(cfg.docs_api_js, cfg.documentServerOrigin);

        // 3) Theme + base events
        const isDark = document.documentElement.classList.contains('dark-mode')
        || /^(1|true)$/i.test(localStorage.getItem('darkMode') || '');
      cfg.events = (cfg.events && typeof cfg.events === 'object') ? cfg.events : {};
      cfg.editorConfig = cfg.editorConfig || {};
      cfg.editorConfig.customization = Object.assign(
        {}, cfg.editorConfig.customization, { uiTheme: isDark ? 'theme-dark' : 'theme-light' }
      );
  
      // Preserve any events coming from PHP side
      const prevOnRequestClose   = cfg.events.onRequestClose;
      const prevOnAppReady       = cfg.events.onAppReady;
      const prevOnDocumentReady  = cfg.events.onDocumentReady;
  
      cfg.events.onRequestClose = function () {
        if (typeof prevOnRequestClose === 'function') prevOnRequestClose();
        onClose();
      };
  
      // Important: hide overlay as soon as ONLYOFFICE UI is ready (CSV options dialog included)
      cfg.events.onAppReady = function () {
        setOoBusy(modal, false);
        if (typeof prevOnAppReady === 'function') prevOnAppReady();
      };
  
      // Still also clear it on full document ready
      cfg.events.onDocumentReady = function () {
        setOoBusy(modal, false);
        if (typeof prevOnDocumentReady === 'function') prevOnDocumentReady();
      };
  
      // 4) Warm EVERY click 
      if (ALWAYS_WARM_OO && !userClosed){
        setOoBusy(modal, true);          // overlay INSIDE modal body
        await warmDocServerOnce(cfg);
        if (userClosed) return;
      }
  
      // 5) Launch visible editor in full-screen modal
      editor = new window.DocsAPI.DocEditor('oo-editor', cfg);

    // Live theme switching + keep modal bg in sync
    const darkToggle = document.getElementById('darkModeToggle');
    const onDarkToggle = () => {
      const nowDark = document.documentElement.classList.contains('dark-mode');
      if (editor && typeof editor.setTheme === 'function') {
        editor.setTheme(nowDark ? 'dark' : 'light');
      }
      applyModalBg(modal);
    };
    if (darkToggle) {
      darkToggle.addEventListener('click', onDarkToggle);
      removeThemeListener = () => darkToggle.removeEventListener('click', onDarkToggle);
    }
  }catch(e){
    console.error('[ONLYOFFICE] failed to open:', e);
    showToast((e && e.message) ? e.message : t('onlyoffice_open_failed'));
    destroy(true);
  }
}
// ---- /ONLYOFFICE integration ----------------------------------------------

// ==== Editor (CodeMirror) path =============================================

function getModeForFile(fileName) {
  const dot = fileName.lastIndexOf(".");
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";

  switch (ext) {
    case "html":
    case "htm": return "text/html";
    case "xml": return "xml";
    case "md":
    case "markdown": return "markdown";
    case "yml":
    case "yaml": return "yaml";
    case "css": return "css";
    case "js": return "javascript";
    case "json": return { name: "javascript", json: true };
    case "php": return "application/x-httpd-php";
    case "py": return "python";
    case "sql": return "sql";
    case "sh":
    case "bash":
    case "zsh":
    case "bat": return "shell";
    case "ini":
    case "conf":
    case "config":
    case "properties": return "properties";
    case "c":
    case "h": return "text/x-csrc";
    case "cpp":
    case "cxx":
    case "hpp":
    case "hh":
    case "hxx": return "text/x-c++src";
    case "java": return "text/x-java";
    case "cs": return "text/x-csharp";
    case "kt":
    case "kts": return "text/x-kotlin";
    default: return "text/plain";
  }
}
export { getModeForFile };

function adjustEditorSize() {
  const modal = document.querySelector(".editor-modal");
  if (modal && window.currentEditor) {
    const headerHeight = 60; // adjust as needed
    const availableHeight = modal.clientHeight - headerHeight;
    window.currentEditor.setSize("100%", availableHeight + "px");
  }
}
export { adjustEditorSize };

function observeModalResize(modal) {
  if (!modal) return;
  const resizeObserver = new ResizeObserver(() => adjustEditorSize());
  resizeObserver.observe(modal);
}
export { observeModalResize };

export async function editFile(fileName, folder, sourceId = '') {
  // destroy any previous editor
  let existingEditor = document.getElementById("editorContainer");
  if (existingEditor) existingEditor.remove();

  const folderUsed = folder || window.currentFolder || "root";
  const sid = normalizeSourceId(sourceId);
  const fileUrl = buildPreviewUrl(folderUsed, fileName);

  const wantOO = await shouldUseOnlyOffice(fileName);
  if (wantOO) {
    const enc = await isFolderEncrypted(folderUsed, sid);
    if (!enc) {
      await openOnlyOffice(fileName, folderUsed, sid);
      return;
    }
    showToast(t('onlyoffice_disabled_encrypted'));
  }

  // Probe size safely via API. Prefer HEAD; if missing Content-Length, fall back to a 1-byte Range GET.
  async function probeSize(url) {
    try {
      const h = await fetch(url, { method: "HEAD", credentials: "include" });
      const len = h.headers.get("content-length") ?? h.headers.get("Content-Length");
      if (len && !Number.isNaN(parseInt(len, 10))) return parseInt(len, 10);
    } catch (e) { }
    try {
      const r = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        credentials: "include"
      });
      // Content-Range: bytes 0-0/12345
      const cr = r.headers.get("content-range") ?? r.headers.get("Content-Range");
      const m = cr && cr.match(/\/(\d+)\s*$/);
      if (m) return parseInt(m[1], 10);
    } catch (e) { }
    return null;
  }

  probeSize(fileUrl)
    .then(sizeBytes => {
      if (sizeBytes !== null && sizeBytes > EDITOR_BLOCK_THRESHOLD) {
        const maxMb = Math.round(EDITOR_BLOCK_THRESHOLD / (1024 * 1024));
        showToast(t('file_edit_too_large', { size: maxMb }));
        throw new Error("File too large.");
      }
      return fetch(fileUrl, { credentials: "include" });
    })
    .then(response => {
      if (!response.ok) throw new Error("HTTP error! Status: " + response.status);
      const lenHeader = response.headers.get("content-length") ?? response.headers.get("Content-Length");
      const sizeBytes = lenHeader ? parseInt(lenHeader, 10) : null;
      return Promise.all([response.text(), sizeBytes]);
    })
    .then(([content, sizeBytes]) => {
      const forcePlainText = sizeBytes !== null && sizeBytes > EDITOR_PLAIN_THRESHOLD;

      // --- Build modal immediately and wire close controls BEFORE any async loads ---
      const modal = document.createElement("div");
      modal.id = "editorContainer";
      modal.classList.add("modal", "editor-modal");
      modal.setAttribute("tabindex", "-1"); // for Escape handling
      modal.innerHTML = `
        <div class="editor-header">
          <h3 class="editor-title">
            ${t("editing")}: ${escapeHTML(fileName)}
            ${forcePlainText ? " <span style='font-size:.8em;opacity:.7'>(plain text mode)</span>" : ""}
          </h3>
          <div class="editor-controls">
            <button id="decreaseFont" class="btn btn-sm btn-secondary">${t("decrease_font")}</button>
            <button id="increaseFont" class="btn btn-sm btn-secondary">${t("increase_font")}</button>
          </div>
          <button id="closeEditorX" class="editor-close-btn" aria-label="${t("close")}">&times;</button>
        </div>
        <textarea id="fileEditor" class="editor-textarea">${escapeHTML(content)}</textarea>
        <div class="editor-footer">
          <button id="saveBtn" class="btn btn-primary" data-default disabled>${t("save")} </button>
          <button id="closeBtn" class="btn btn-secondary">${t("close")}</button>
        </div>
      `;
      document.body.appendChild(modal);
      modal.style.display = "block";
      modal.focus();

      let canceled = false;
      const doClose = () => {
        canceled = true;
        window.currentEditor = null;
        modal.remove();
      };

      // Wire close actions right away
      modal.addEventListener("keydown", (e) => { if (e.key === "Escape") doClose(); });
      document.getElementById("closeEditorX").addEventListener("click", doClose);
      document.getElementById("closeBtn").addEventListener("click", doClose);

      // Keep buttons responsive even before editor exists
      const decBtn = document.getElementById("decreaseFont");
      const incBtn = document.getElementById("increaseFont");
      decBtn.addEventListener("click", () => { });
      incBtn.addEventListener("click", () => { });

      // Theme + mode selection
      const isDarkMode = document.body.classList.contains("dark-mode");
      const theme = isDarkMode ? "material-darker" : "default";
      const desiredMode = forcePlainText ? "text/plain" : getModeForFile(fileName);

      // Start core+mode loading (don’t block closing)
      const modePromise = (async () => {
        await ensureCore();                 // load CM core + CSS
        if (!forcePlainText) {
          await ensureModeLoaded(desiredMode); // then load the needed mode + deps
        }
      })();

      // Wait up to MODE_LOAD_TIMEOUT_MS; then proceed with whatever is available
      const timeout = new Promise((res) => setTimeout(res, MODE_LOAD_TIMEOUT_MS));

      Promise.race([modePromise, timeout]).then(() => {
        if (canceled) return;

        if (!window.CodeMirror) {
          // Core not present: keep plain <textarea>; enable Save and bail gracefully
          document.getElementById("saveBtn").disabled = false;
          observeModalResize(modal);
          return;
        }

        const normName = normalizeModeName(desiredMode) || "text/plain";
        const initialMode = (forcePlainText || !isModeRegistered(normName)) ? "text/plain" : desiredMode;

        const cm = window.CodeMirror.fromTextArea(
          document.getElementById("fileEditor"),
          {
            lineNumbers: !forcePlainText,
            mode: initialMode,
            theme,
            viewportMargin: forcePlainText ? 20 : Infinity,
            lineWrapping: false
          }
        );
        window.currentEditor = cm;

        setTimeout(adjustEditorSize, 50);
        observeModalResize(modal);

        // Font controls (now that editor exists)
        let currentFontSize = 14;
        const wrapper = cm.getWrapperElement();
        wrapper.style.fontSize = currentFontSize + "px";
        cm.refresh();

        decBtn.addEventListener("click", function () {
          currentFontSize = Math.max(8, currentFontSize - 2);
          wrapper.style.fontSize = currentFontSize + "px";
          cm.refresh();
        });
        incBtn.addEventListener("click", function () {
          currentFontSize = Math.min(32, currentFontSize + 2);
          wrapper.style.fontSize = currentFontSize + "px";
          cm.refresh();
        });

        // Save
        const saveBtn = document.getElementById("saveBtn");
        saveBtn.disabled = false;
        saveBtn.addEventListener("click", function () {
          saveFile(fileName, folderUsed);
        });

        // Theme switch
        function updateEditorTheme() {
          const isDark = document.body.classList.contains("dark-mode");
          cm.setOption("theme", isDark ? "material-darker" : "default");
        }
        const toggle = document.getElementById("darkModeToggle");
        if (toggle) toggle.addEventListener("click", updateEditorTheme);

        // If we started in plain text due to timeout, flip to the real mode once it arrives
        modePromise.then(() => {
          if (!canceled && !forcePlainText) {
            const nn = normalizeModeName(desiredMode);
            if (nn && isModeRegistered(nn)) {
              cm.setOption("mode", desiredMode);
            }
          }
        }).catch(() => { /* stay in plain text */ });
      });
    })
    .catch(error => {
      if (error && error.name === "AbortError") return;
      console.error("Error loading file:", error);
    });
}

export function saveFile(fileName, folder) {
  const editor = window.currentEditor;
  if (!editor) {
    console.error("Editor not found!");
    return;
  }
  const folderUsed = folder || window.currentFolder || "root";
  const fileDataObj = {
    fileName: fileName,
    content: editor.getValue(),
    folder: folderUsed
  };
  fetch("/api/file/saveFile.php", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": window.csrfToken
    },
    body: JSON.stringify(fileDataObj)
  })
    .then(response => response.json())
    .then(result => {
      showToast(result.success || result.error);
      document.getElementById("editorContainer")?.remove();
      loadFileList(folderUsed);
    })
    .catch(error => console.error("Error saving file:", error));
}
