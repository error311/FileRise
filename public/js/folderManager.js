// public/js/folderManager.js
// Lazy folder tree with persisted expansion, root DnD, color-carry on moves, and state migration.
// Smart initial selection: if the default folder isn't viewable, pick the first accessible folder (BFS).

import { loadFileList, repairBlankFolderIcons } from './fileListView.js?v={{APP_QVER}}';
import { showToast, escapeHTML, attachEnterKeyListener, showCustomConfirmModal } from './domUtils.js?v={{APP_QVER}}';
import { t } from './i18n.js?v={{APP_QVER}}';
import { openFolderShareModal } from './folderShareModal.js?v={{APP_QVER}}';
import { fetchWithCsrf } from './auth.js?v={{APP_QVER}}';
import { loadCsrfToken } from './appCore.js?v={{APP_QVER}}';
import { withBase } from './basePath.js?v={{APP_QVER}}';
import { startTransferProgress, finishTransferProgress } from './transferProgress.js?v={{APP_QVER}}';


function detachFolderModalsToBody() {
  const ids = [
    'createFolderModal',
    'deleteFolderModal',
    'moveFolderModal',
    'renameFolderModal',
  ];

  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    if (el.parentNode !== document.body) {
      document.body.appendChild(el);
    }

    if (!el.style.zIndex) {
      el.style.zIndex = '13000';
    }
  });
}
document.addEventListener('DOMContentLoaded', detachFolderModalsToBody);

const PAGE_LIMIT = 100;
let _uidFallbackCounter = 0;

// Generate stable-ish unique IDs using crypto when available (avoids Math.random CodeQL finding).
function makeUid(prefix = 'uid') {
  const cryptoObj = (typeof self !== 'undefined' && self.crypto) ? self.crypto : (typeof window !== 'undefined' ? window.crypto : undefined);
  if (cryptoObj?.randomUUID) return `${prefix}-${cryptoObj.randomUUID()}`;
  if (cryptoObj?.getRandomValues) {
    const buf = new Uint32Array(2);
    cryptoObj.getRandomValues(buf);
    return `${prefix}-${buf[0].toString(36)}${buf[1].toString(36)}`;
  }
  _uidFallbackCounter = (_uidFallbackCounter + 1) % 0x7fffffff;
  return `${prefix}-${Date.now().toString(36)}-${_uidFallbackCounter.toString(36)}`;
}

/* ----------------------
   Helpers: safe JSON + state
----------------------*/
async function safeJson(res) {
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (e) { /* ignore */ }
  if (!res.ok) {
    const msg = (body && (body.error || body.message)) || (text && text.trim()) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return body ?? {};
}

function disableAllFolderControls() {
  ['createFolderBtn','moveFolderBtn','renameFolderBtn','colorFolderBtn','deleteFolderBtn','shareFolderBtn']
    .forEach(id => setControlEnabled(document.getElementById(id), false));
}

function markOptionLocked(optEl, locked) {
  if (!optEl) return;
  optEl.classList.toggle('locked', !!locked);

  // Disable DnD when locked
  if (locked) optEl.removeAttribute('draggable');

  // Refresh the icon with padlock overlay
  const iconEl = optEl.querySelector('.folder-icon');
  if (iconEl) {
    const currentKind = iconEl?.dataset?.kind || 'empty';
    iconEl.innerHTML = folderSVG(currentKind, { locked: !!locked, encrypted: optEl.classList.contains('encrypted') });
  }
}

/* ----------------------
   Simple format + parent helpers (exported for other modules)
----------------------*/
export function formatFolderName(folder) {
  if (typeof folder !== "string") return "";
  if (folder.indexOf("/") !== -1) {
    const parts = folder.split("/");
    let indent = "";
    for (let i = 1; i < parts.length; i++) indent += "\\u00A0\\u00A0\\u00A0\\u00A0";
    return indent + parts[parts.length - 1];
  }
  return folder;
}
export function getParentFolder(folder) {
  if (folder === "root") return "root";
  const lastSlash = folder.lastIndexOf("/");
  return lastSlash === -1 ? "root" : folder.substring(0, lastSlash);
}

let __moveFolderSourcesCache = null;

function getActiveSourceId() {
  const paneKey = window.activePane === 'secondary' ? 'secondary' : 'primary';
  const paneSource = window.__frPaneState?.[paneKey]?.sourceId || '';
  if (paneSource) return paneSource;
  const sel = document.getElementById('sourceSelector');
  if (sel && sel.value) return sel.value;
  try {
    const stored = localStorage.getItem('fr_active_source');
    if (stored) return stored;
  } catch (e) {}
  return '';
}

function getFolderTreeStateKey(sourceId = '') {
  const id = String(sourceId || getActiveSourceId() || '').trim();
  return id ? `folderTreeState.${id}` : 'folderTreeState';
}

function getLastOpenedFolderKey(sourceId = '') {
  const id = String(sourceId || getActiveSourceId() || '').trim();
  return id ? `lastOpenedFolder.${id}` : 'lastOpenedFolder';
}

function getLastOpenedFolder(sourceId = '') {
  const key = getLastOpenedFolderKey(sourceId);
  try {
    const val = localStorage.getItem(key);
    if (val) return val;
  } catch (e) { /* ignore */ }
  return '';
}

function setLastOpenedFolder(folder, sourceId = '') {
  const f = String(folder || '').trim();
  if (!f) return;
  const key = getLastOpenedFolderKey(sourceId);
  try { localStorage.setItem(key, f); } catch (e) { /* ignore */ }
  if (key !== 'lastOpenedFolder') {
    try { localStorage.setItem('lastOpenedFolder', f); } catch (e) { /* ignore */ }
  }
}

function getSourceNameById(sourceId) {
  const id = String(sourceId || '').trim();
  if (!id) return '';
  try {
    if (typeof window.__frGetSourceNameById === 'function') {
      return String(window.__frGetSourceNameById(id) || '');
    }
  } catch (e) { /* ignore */ }
  return '';
}

function getSourceTypeById(sourceId) {
  const id = String(sourceId || '').trim();
  if (!id) return '';
  try {
    if (typeof window.__frGetSourceMetaById === 'function') {
      const meta = window.__frGetSourceMetaById(id);
      if (meta && typeof meta === 'object' && meta.type) return String(meta.type || '');
    }
  } catch (e) { /* ignore */ }
  try {
    if (typeof window.__frGetSourceTypeById === 'function') {
      return String(window.__frGetSourceTypeById(id) || '');
    }
  } catch (e) { /* ignore */ }
  const sel = document.getElementById('sourceSelector');
  if (sel) {
    const opt = Array.from(sel.options).find(o => o.value === id);
    if (opt) return String(opt.dataset?.sourceType || '');
  }
  return '';
}

function isFtpSourceId(sourceId = '') {
  const type = String(getSourceTypeById(sourceId || getActiveSourceId()) || '').toLowerCase();
  return type === 'ftp';
}

function getRootLabel(sourceId = '') {
  const id = sourceId || getActiveSourceId();
  const name = getSourceNameById(id);
  return name ? `(${name})` : '(Root)';
}

function getRootCrumbLabel(sourceId = '') {
  const id = sourceId || getActiveSourceId();
  const name = getSourceNameById(id);
  return name || 'root';
}

async function loadVisibleSourcesForMove() {
  if (__moveFolderSourcesCache) return __moveFolderSourcesCache;
  try {
    const res = await fetch(withBase('/api/pro/sources/visible.php'), {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || data.ok !== true || !data.enabled) return null;
    const list = Array.isArray(data.sources) ? data.sources : [];
    __moveFolderSourcesCache = list;
    return list;
  } catch (e) {
    return null;
  }
}

function populateMoveSourceSelect(selectEl, sources, activeId) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  sources.forEach(src => {
    if (!src || typeof src !== 'object') return;
    const id = String(src.id || '');
    if (!id) return;
    const name = String(src.name || id);
    const type = String(src.type || '');
    const ro = src.readOnly ? ` \uD83D\uDD12 ${t('read_only')}` : '';
    const label = type ? `${name} (${type})${ro}` : `${name}${ro}`;
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = label;
    if (src.readOnly) opt.disabled = true;
    selectEl.appendChild(opt);
  });
  if (!selectEl.options.length) return;
  const hasActive = Array.from(selectEl.options).some(opt => opt.value === activeId && !opt.disabled);
  selectEl.value = hasActive ? activeId : selectEl.options[0].value;
}

async function loadMoveFolderTargets(sourceFolder, sourceId) {
  const targetSel = document.getElementById('moveFolderTarget');
  if (!targetSel) return;
  targetSel.innerHTML = '';
  const activeId = getActiveSourceId();
  const sameSource = (sourceId || activeId) === activeId;
  const url = withBase('/api/folder/getFolderList.php')
    + '?counts=0'
    + (sourceId ? `&sourceId=${encodeURIComponent(sourceId)}` : '');
  try {
    let list = await fetch(url, { credentials: 'include' }).then(r => r.json());
    if (Array.isArray(list) && list.length && typeof list[0] === 'object' && list[0].folder) {
      list = list.map(it => it.folder);
    }
    const rootOpt = document.createElement('option');
    rootOpt.value = 'root';
    rootOpt.textContent = getRootLabel(sourceId || activeId);
    targetSel.appendChild(rootOpt);
    (list || [])
      .filter(f => f && f !== 'trash' && (!sameSource || f !== (sourceFolder || '')))
      .forEach(f => {
        const o = document.createElement('option');
        o.value = f;
        o.textContent = f;
        targetSel.appendChild(o);
      });
  } catch (e) {
    // ignore
  }
}

async function initMoveFolderSourceSelect(sourceFolder) {
  const row = document.getElementById('moveFolderSourceRow');
  const selectEl = document.getElementById('moveFolderTargetSource');
  const sources = await loadVisibleSourcesForMove();
  const activeId = getActiveSourceId();

  if (!sources || sources.length <= 1 || !row || !selectEl) {
    if (row) row.style.display = 'none';
    await loadMoveFolderTargets(sourceFolder, activeId);
    return;
  }

  row.style.display = '';
  populateMoveSourceSelect(selectEl, sources, activeId);
  await loadMoveFolderTargets(sourceFolder, selectEl.value || activeId);

  if (!selectEl.__wired) {
    selectEl.__wired = true;
    selectEl.addEventListener('change', async () => {
      await loadMoveFolderTargets(sourceFolder, selectEl.value || '');
    });
  }
}

function normalizeItem(it) {
  if (it == null) return null;
  if (typeof it === 'string') return { name: it, locked: false, hasSubfolders: undefined, nonEmpty: undefined };
  if (typeof it === 'object') {
    const nm = String(it.name ?? '').trim();
    if (!nm) return null;
    return {
      name: nm,
      locked: !!it.locked,
      hasSubfolders: (typeof it.hasSubfolders === 'boolean') ? it.hasSubfolders : undefined,
      nonEmpty: (typeof it.nonEmpty === 'boolean') ? it.nonEmpty : undefined,
      encrypted: (typeof it.encrypted === 'boolean') ? it.encrypted : undefined,
    };
  }
  return null;
}

/* ----------------------
   Folder Tree State (Save/Load)
----------------------*/
// ---- peekHasFolders helper (chevron truth from listChildren) ----
if (!window._frPeekCache) window._frPeekCache = new Map();
function peekHasFolders(folder) {
  try {
    if (isFtpSourceId()) {
      const cached = _childCache.get(folder);
      if (cached && typeof cached === 'object') {
        const items = cached.items || [];
        return Promise.resolve(!!(Array.isArray(items) && items.length) || !!cached.nextCursor);
      }
      return Promise.resolve(true);
    }
    const cache = window._frPeekCache;
    if (cache.has(folder)) return cache.get(folder);
    const p = (async () => {
      try {
        const res = await fetchChildrenOnce(folder);
        return !!(Array.isArray(res?.items) && res.items.length > 0) || !!res?.nextCursor;
      } catch (e) { return false; }
    })();
    cache.set(folder, p);
    return p;
  } catch (e) { return Promise.resolve(false); }
}
// small helper to clear peek cache for specific folders (or all if none provided)
function clearPeekCache(folders) {
  try {
    const c = window._frPeekCache;
    if (!c) return;
    if (!folders || !folders.length) { c.clear(); return; }
    folders.forEach(f => c.delete(f));
  } catch (e) {}
}
try { window.peekHasFolders = peekHasFolders; } catch (e) {}
// ---- end peekHasFolders ----

function loadFolderTreeState() {
  const key = getFolderTreeStateKey();
  try {
    const state = localStorage.getItem(key);
    if (state) return JSON.parse(state);
  } catch (e) { /* ignore */ }

  if (key !== 'folderTreeState') {
    try {
      const legacy = localStorage.getItem('folderTreeState');
      if (legacy) {
        const parsed = JSON.parse(legacy);
        saveFolderTreeState(parsed);
        return parsed;
      }
    } catch (e) { /* ignore */ }
  }

  return {};
}
function saveFolderTreeState(state) {
  const key = getFolderTreeStateKey();
  localStorage.setItem(key, JSON.stringify(state));
}

/* ----------------------
   Transient UI guards (click suppression)
----------------------*/
let _suppressToggleUntil = 0;
function suppressNextToggle(ms = 300) { _suppressToggleUntil = performance.now() + ms; }

/* ----------------------
   Capability helpers
----------------------*/
function setControlEnabled(el, enabled) {
  if (!el) return;
  if ('disabled' in el) el.disabled = !enabled;
  el.classList.toggle('disabled', !enabled);
  el.setAttribute('aria-disabled', String(!enabled));
  el.style.pointerEvents = enabled ? '' : 'none';
  el.style.opacity = enabled ? '' : '0.5';
}
// --- Capability cache so we don't spam /capabilities.php
const _capsCache = window.__FR_CAPS_CACHE || new Map();
const _capsInflight = window.__FR_CAPS_INFLIGHT || new Map();
window.__FR_CAPS_CACHE = _capsCache;
window.__FR_CAPS_INFLIGHT = _capsInflight;

async function getFolderCapabilities(folder, sourceId = '') {
  if (!folder) return null;

  if (_capsCache.has(folder)) {
    return _capsCache.get(folder);
  }
  if (_capsInflight.has(folder)) {
    return _capsInflight.get(folder);
  }

  const p = (async () => {
    try {
      const activeSourceId = sourceId || getActiveSourceId();
      const sourceParam = activeSourceId ? `&sourceId=${encodeURIComponent(activeSourceId)}` : '';
      const res = await fetch(`/api/folder/capabilities.php?folder=${encodeURIComponent(folder)}${sourceParam}`, { credentials: 'include' });
      if (!res.ok) return null;
      const caps = await res.json();
      _capsCache.set(folder, caps || null);
      return caps || null;
    } catch (e) {
      _capsCache.set(folder, null);
      return null;
    } finally {
      _capsInflight.delete(folder);
    }
  })();

  _capsInflight.set(folder, p);
  return p;
}
async function applyFolderCapabilities(folder) {
  try {
    const caps = await getFolderCapabilities(folder);
    if (!caps) { disableAllFolderControls(); return; }
    if (folder === window.currentFolder) window.currentFolderCaps = caps;
    try {
      window.dispatchEvent(new CustomEvent('folderCapsUpdated', { detail: { folder, caps } }));
    } catch (e) { /* ignore */ }
    const isRoot = (folder === 'root');
    setControlEnabled(document.getElementById('createFolderBtn'), !!caps.canCreate);
    setControlEnabled(document.getElementById('moveFolderBtn'),   !!caps.canMoveFolder);
    setControlEnabled(document.getElementById('renameFolderBtn'), !isRoot && !!caps.canRename);
    setControlEnabled(document.getElementById('colorFolderBtn'),  !isRoot && !!caps.canEdit);
    setControlEnabled(document.getElementById('deleteFolderBtn'), !isRoot && !!caps.canDeleteFolder);
    setControlEnabled(document.getElementById('shareFolderBtn'),  !isRoot && !!caps.canShareFolder);
  } catch (e) {
    disableAllFolderControls();
  }
}
// returns boolean whether user can view given folder
async function canViewFolder(folder) {
  try {
    const caps = await getFolderCapabilities(folder);
    if (!caps) return false;
    // prefer explicit flag; otherwise compose from older keys
    return !!(
      caps.canView ??
      caps.canRead ??
      caps.canReadOwn ??
      caps.isAdmin
    );
  } catch (e) { return false; }
}

/**
 * BFS: starting at `startFolder`, find the first folder the user can view.
 * - Skips "trash" and "profile_pics"
 * - Honors server-side "locked" from listChildren, but still double-checks capabilities
 * - Hard limit to avoid endless walks
 */
async function findFirstAccessibleFolder(startFolder = 'root') {
  const MAX_VISITS = 3000;
  const visited = new Set();
  const q = [startFolder];

  while (q.length && visited.size < MAX_VISITS) {
    const f = q.shift();
    if (!f || visited.has(f)) continue;
    visited.add(f);

    // Check viewability
    if (await canViewFolder(f)) return f;

    // Enqueue children for BFS
    try {
      const payload = await fetchChildrenOnce(f);
      const items = (payload?.items || []);
      for (const it of items) {
        const name = (typeof it === 'string') ? it : (it && it.name);
        if (!name) continue;
        const lower = String(name).toLowerCase();
        if (
          lower === 'trash' ||
          lower === 'profile_pics' ||
          lower.startsWith('resumable_')
        ) {
          continue;
        }
        const child = (f === 'root') ? name : `${f}/${name}`;
        if (!visited.has(child)) q.push(child);
      }
      // If there are more pages, we only need one page to keep BFS order lightweight
    } catch (e) { /* ignore and continue */ }
  }
  return null; // none found
}
function showNoAccessEmptyState() {
  // 1) Hide actions bar
  const actions = document.getElementById('fileListActions');
  if (actions) actions.style.display = 'none';

  // 2) Render message INSIDE #fileList (safe)
  const fileList = document.getElementById('fileList');
  if (fileList) {
    fileList.innerHTML = `
      <div class="empty-state" style="padding:20px; text-align:center; opacity:.9;">
        ${t('no_access') || 'You do not have access to this resource.'}
      </div>
    `;
    fileList.style.visibility = 'visible';
    return;
  }

  // 3) Fallback (if #fileList is missing) – create it without nuking the pane
  const host =
    document.getElementById('fileListContainer') ||
    document.querySelector('.file-list-container');

  if (!host) return;

  const el = document.createElement('div');
  el.id = 'fileList';
  el.innerHTML = `
    <div class="empty-state" style="padding:20px; text-align:center; opacity:.9;">
      ${t('no_access') || 'You do not have access to this resource.'}
    </div>
  `;
  host.appendChild(el);
}
/* ----------------------
   Breadcrumb
----------------------*/
function renderBreadcrumbFragment(folderPath) {
  const frag = document.createDocumentFragment();
  const path = (typeof folderPath === 'string' && folderPath.length) ? folderPath : 'root';

  // --- Always start with "Root" crumb ---
  const rootSpan = document.createElement('span');
  rootSpan.className = 'breadcrumb-link';
  rootSpan.dataset.folder = 'root';
  rootSpan.textContent = getRootCrumbLabel();
  frag.appendChild(rootSpan);

  if (path === 'root') {
    // You are in root: just "Root"
    return frag;
  }

  // Separator after Root
  let sep = document.createElement('span');
  sep.className = 'file-breadcrumb-sep';
  sep.textContent = ' › ';
  frag.appendChild(sep);

  // Now add the rest of the path normally (folder1, folder1/subA, etc.)
  const crumbs = path.split('/').filter(Boolean);
  let acc = '';

  for (let i = 0; i < crumbs.length; i++) {
    const part = crumbs[i];
    acc = (i === 0) ? part : (acc + '/' + part);

    const span = document.createElement('span');
    span.className = 'breadcrumb-link';
    span.dataset.folder = acc;
    span.textContent = part;
    frag.appendChild(span);

    if (i < crumbs.length - 1) {
      sep = document.createElement('span');
      sep.className = 'file-breadcrumb-sep';
      sep.textContent = ' › ';
      frag.appendChild(sep);
    }
  }

  return frag;
}
export function updateBreadcrumbTitle(folder) {
  const titleEl = document.getElementById("fileListTitle");
  if (!titleEl) return;
  titleEl.textContent = "";
  titleEl.appendChild(document.createTextNode(t("files_in") + " ("));
  titleEl.appendChild(renderBreadcrumbFragment(folder));
  titleEl.appendChild(document.createTextNode(")"));
  setupBreadcrumbDelegation();
  bindFolderManagerContextMenu();
  try {
    if (typeof window.__frRefreshSourceBadges === 'function') {
      window.__frRefreshSourceBadges();
    }
  } catch (e) { /* ignore */ }
}
export function setupBreadcrumbDelegation() {
  const container = document.getElementById("fileListTitle");
  if (!container) return;
  container.removeEventListener("click", breadcrumbClickHandler);
  container.removeEventListener("dragover", breadcrumbDragOverHandler);
  container.removeEventListener("dragleave", breadcrumbDragLeaveHandler);
  container.removeEventListener("drop", breadcrumbDropHandler);
  container.addEventListener("click", breadcrumbClickHandler);
  container.addEventListener("dragover", breadcrumbDragOverHandler);
  container.addEventListener("dragleave", breadcrumbDragLeaveHandler);
  container.addEventListener("drop", breadcrumbDropHandler);
}
async function breadcrumbClickHandler(e) {
  const link = e.target.closest(".breadcrumb-link");
  if (!link) return;
  e.stopPropagation();
  e.preventDefault();
  const folder = link.dataset.folder;
  await selectFolder(folder); // will toast + bail if not allowed
}
function breadcrumbDragOverHandler(e) {
  const link = e.target.closest(".breadcrumb-link");
  if (!link) return;
  e.preventDefault();
  link.classList.add("drop-hover");
}
function breadcrumbDragLeaveHandler(e) {
  const link = e.target.closest(".breadcrumb-link");
  if (!link) return;
  link.classList.remove("drop-hover");
}
function breadcrumbDropHandler(e) {
  const link = e.target.closest(".breadcrumb-link");
  if (!link) return;
  e.preventDefault();
  link.classList.remove("drop-hover");
  const dropFolder = link.getAttribute("data-folder");
  handleDropOnFolder(e, dropFolder);
}

/* ----------------------
   Folder-only scope (server truthy)
----------------------*/
async function checkUserFolderPermission() {
  const username = localStorage.getItem("username") || "";
  try {
    if (window.__FR_PERMISSIONS_CACHE) {
      // reuse cached snapshot from auth.js if available
      const permissionsData = window.__FR_PERMISSIONS_CACHE;
      const isFolderOnly =
        !!(permissionsData && permissionsData[username] && permissionsData[username].folderOnly);
      window.userFolderOnly = isFolderOnly;
      localStorage.setItem("folderOnly", isFolderOnly ? "true" : "false");
      if (isFolderOnly && username) {
        setLastOpenedFolder(username);
        window.currentFolder = username;
      }
      return isFolderOnly;
    }

    if (window.__FR_PERMISSIONS_PROMISE) {
      const permissionsData = await window.__FR_PERMISSIONS_PROMISE;
      const isFolderOnly =
        !!(permissionsData && permissionsData[username] && permissionsData[username].folderOnly);
      window.userFolderOnly = isFolderOnly;
      localStorage.setItem("folderOnly", isFolderOnly ? "true" : "false");
      if (isFolderOnly && username) {
        setLastOpenedFolder(username);
        window.currentFolder = username;
      }
      return isFolderOnly;
    }

    window.__FR_PERMISSIONS_PROMISE = (async () => {
      const res = await fetchWithCsrf("/api/profile/getUserPermissions.php", {
        method: "GET",
        credentials: "include"
      });
      return safeJson(res);
    })();
    const permissionsData = await window.__FR_PERMISSIONS_PROMISE;
    window.__FR_PERMISSIONS_CACHE = permissionsData || {};
    window.__FR_PERMISSIONS_PROMISE = null;
    const isFolderOnly =
      !!(permissionsData && permissionsData[username] && permissionsData[username].folderOnly);
    window.userFolderOnly = isFolderOnly;
    localStorage.setItem("folderOnly", isFolderOnly ? "true" : "false");
    if (isFolderOnly && username) {
      setLastOpenedFolder(username);
      window.currentFolder = username;
    }
    return isFolderOnly;
  } catch (e) {
    window.userFolderOnly = false;
    localStorage.setItem("folderOnly", "false");
    return false;
  }
}

/* ----------------------
   Local state and caches
----------------------*/
const _folderCountCache = new Map();   // cacheKey -> stats payload
const _inflightCounts   = new Map();   // cacheKey -> Promise
const _nonEmptyCache    = new Map();   // folderPath -> bool
const _childCache       = new Map();   // folderPath -> {items, nextCursor}
const _sharedFolderStatsCache = window.__FR_FOLDER_STATS_CACHE || new Map();
const _sharedFolderStatsInflight = window.__FR_FOLDER_STATS_INFLIGHT || new Map();
window.__FR_FOLDER_STATS_CACHE = _sharedFolderStatsCache;
window.__FR_FOLDER_STATS_INFLIGHT = _sharedFolderStatsInflight;

// --- Capability cache so we don't spam /capabilities.php
const _capViewCache = new Map();
async function canViewFolderCached(folder) {
  if (_capViewCache.has(folder)) return _capViewCache.get(folder);
  const p = canViewFolder(folder).then(Boolean).catch(() => false);
  _capViewCache.set(folder, p);
  return p;
}

export function resetFolderTreeCaches() {
  _folderCountCache.clear();
  _inflightCounts.clear();
  _nonEmptyCache.clear();
  _childCache.clear();
  _capViewCache.clear();
  _capsCache.clear();
  _capsInflight.clear();
  try { clearPeekCache(); } catch (e) { /* ignore */ }
  try { if (window._frPeekCache?.clear) window._frPeekCache.clear(); } catch (e) { /* ignore */ }
  try { window.folderColorMap = {}; } catch (e) { /* ignore */ }
  try { window.__FR_COLORS_PROMISE = null; } catch (e) { /* ignore */ }
}

// Returns true if `folder` has any *unlocked* descendant within maxDepth.
// Uses listChildren’s locked flag; depth defaults to 2 (fast).
async function hasUnlockedDescendant(folder, maxDepth = 2) {
  try {
    if (maxDepth <= 0) return false;
    const { items = [] } = await fetchChildrenOnce(folder);
    // Any direct unlocked child?
    for (const it of items) {
      const name = typeof it === 'string' ? it : it?.name;
      const locked = typeof it === 'object' ? !!it.locked : false;
      if (!name) continue;
      if (!locked) return true; // found an unlocked child
    }
    // Otherwise, go one level deeper (light, bounded)
    if (maxDepth > 1) {
      for (const it of items) {
        const name = typeof it === 'string' ? it : it?.name;
        if (!name) continue;
        const child = folder === 'root' ? name : `${folder}/${name}`;
        // Skip known non-folders, but listChildren only returns dirs for us
        if (await hasUnlockedDescendant(child, maxDepth - 1)) return true;
      }
    }
  } catch (e) {}
  return false;
}

async function chooseInitialFolder(effectiveRoot, selectedFolder) {
  // 1) explicit selection
  if (selectedFolder && await canViewFolderCached(selectedFolder)) return selectedFolder;

  // 2) sticky lastOpenedFolder
  const last = getLastOpenedFolder();
  if (last && await canViewFolderCached(last)) return last;

  // 2b) Ground truth from folder list API (matches getFileList 403 behavior)
  try {
    const sourceId = getActiveSourceId();
    const sourceParam = sourceId ? `&sourceId=${encodeURIComponent(sourceId)}` : '';
    const res = await fetch(`/api/folder/getFolderList.php?counts=0${sourceParam}`, { credentials: 'include' });
    const data = await res.json().catch(() => []);
    const names = Array.isArray(data)
      ? Array.from(new Set(data.map(row => {
          const f = (row && (row.folder || row)) || '';
          const trimmed = String(f).trim().replace(/^\/+|\/+$/g, '');
          return trimmed === '' ? 'root' : trimmed;
        })))
      : [];

    if (names.length) {
      const preferred = (last || '').trim();
      if (preferred && names.includes(preferred)) return preferred;
      // pick shallowest, then alpha
      names.sort((a, b) => {
        const depth = (p) => (p === 'root') ? 0 : p.split('/').filter(Boolean).length;
        const d = depth(a) - depth(b);
        return d !== 0 ? d : a.localeCompare(b);
      });
      if (names[0]) return names[0];
    }
  } catch (e) { /* best effort */ }

  // 3) NEW: if root itself is viewable, prefer (Root)
  if (await canViewFolderCached(effectiveRoot)) return effectiveRoot;

  // 4) first TOP-LEVEL child that’s directly viewable
  try {
    const { items = [] } = await fetchChildrenOnce(effectiveRoot);
    const topNames = items.map(it => (typeof it === 'string' ? it : it?.name)).filter(Boolean);

    for (const name of topNames) {
      const child = effectiveRoot === 'root' ? name : `${effectiveRoot}/${name}`;
      if (await canViewFolderCached(child)) return child;
    }

    // 5) first TOP-LEVEL child with any viewable descendant
    for (const name of topNames) {
      const child = effectiveRoot === 'root' ? name : `${effectiveRoot}/${name}`;
      if (await hasUnlockedDescendant(child, 2)) return child;
    }
  } catch (e) {}

  // 6) fallback: BFS
  return await findFirstAccessibleFolder(effectiveRoot);
}

function fetchJSONWithTimeout(url, ms = 3000) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { credentials: 'include', signal: ctrl.signal })
    .then(r => r.ok ? r.json() : { folders: 0, files: 0, __fr_err: 1 })
    .catch(() => ({ folders: 0, files: 0, __fr_err: 1 }))
    .finally(() => clearTimeout(tid));
}
const MAX_CONCURRENT_COUNT_REQS = 6;
let _activeCountReqs = 0;
const _countReqQueue = [];
function getCountTimeoutMs(sourceId = '') {
  const type = String(getSourceTypeById(sourceId || getActiveSourceId()) || '').toLowerCase();
  if (type && type !== 'local') return 6000;
  return 2500;
}
function _runCount(url, timeoutMs) {
  return new Promise(resolve => {
    const start = () => {
      _activeCountReqs++;
      fetchJSONWithTimeout(url, timeoutMs || 2500)
        .then(resolve)
        .finally(() => {
          _activeCountReqs--;
          const next = _countReqQueue.shift();
          if (next) next();
        });
    };
    if (_activeCountReqs < MAX_CONCURRENT_COUNT_REQS) start();
    else _countReqQueue.push(start);
  });
}
function scheduleFolderStatsWork(fn, timeoutMs = 700) {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => { try { fn(); } catch (e) {} }, { timeout: timeoutMs });
    return;
  }
  setTimeout(() => { try { fn(); } catch (e) {} }, 120);
}
function folderStatsCacheKey(folder, sourceId = '') {
  const sid = sourceId ? String(sourceId) : '';
  return sid ? `${sid}::${folder}` : folder;
}
async function fetchFolderCounts(folder) {
  const sourceId = getActiveSourceId();
  const key = folderStatsCacheKey(folder, sourceId);
  if (_folderCountCache.has(key)) return _folderCountCache.get(key);
  if (_inflightCounts.has(key)) return _inflightCounts.get(key);
  if (_sharedFolderStatsCache.has(key)) {
    const cached = _sharedFolderStatsCache.get(key);
    _folderCountCache.set(key, cached);
    return cached;
  }
  if (_sharedFolderStatsInflight.has(key)) {
    const inflight = _sharedFolderStatsInflight.get(key);
    _inflightCounts.set(key, inflight);
    inflight.finally(() => {
      if (_inflightCounts.get(key) === inflight) _inflightCounts.delete(key);
    });
    return inflight;
  }
  const sourceParam = sourceId ? `&sourceId=${encodeURIComponent(sourceId)}` : '';
  const url = withBase(`/api/folder/isEmpty.php?folder=${encodeURIComponent(folder)}${sourceParam}&t=${Date.now()}`);
  const timeoutMs = getCountTimeoutMs(sourceId);
  const p = _runCount(url, timeoutMs).then(data => {
    const payload = (data && !data.__fr_err) ? data : { folders: 0, files: 0 };
    const stillLocal = _inflightCounts.get(key) === p;
    const stillShared = _sharedFolderStatsInflight.get(key) === p;
    if (stillLocal) _inflightCounts.delete(key);
    if (stillShared) _sharedFolderStatsInflight.delete(key);
    if (data && data.__fr_err) {
      return { folders: 0, files: 0, __fr_err: 1 };
    }
    if (stillLocal) _folderCountCache.set(key, payload);
    if (stillShared) _sharedFolderStatsCache.set(key, payload);
    return payload;
  }).catch(() => {
    if (_inflightCounts.get(key) === p) _inflightCounts.delete(key);
    if (_sharedFolderStatsInflight.get(key) === p) _sharedFolderStatsInflight.delete(key);
    return { folders: 0, files: 0, __fr_err: 1 };
  });

  _inflightCounts.set(key, p);
  _sharedFolderStatsInflight.set(key, p);
  return p;
}
function invalidateFolderCaches(folder) {
  if (!folder) return;
  const sourceId = getActiveSourceId();
  const key = folderStatsCacheKey(folder, sourceId);
  _folderCountCache.delete(key);
  _nonEmptyCache.delete(folder);
  _inflightCounts.delete(key);
  _sharedFolderStatsCache.delete(key);
  _sharedFolderStatsInflight.delete(key);
  _childCache.delete(folder);
  _capsCache.delete(folder);
  _capsInflight.delete(folder);
}

// Expand root -> ... -> parent chain for a target folder and persist that state
async function expandAncestors(targetFolder) {
  try {
    // Always expand root first
    if (!targetFolder || targetFolder === 'root') return;

    // (rest of the function unchanged)
    const st = loadFolderTreeState();
    st['root'] = 'block';
    saveFolderTreeState(st);
    const rootUl = getULForFolder('root');
    if (rootUl) {
      rootUl.classList.add('expanded'); rootUl.classList.remove('collapsed');
      const rr = document.getElementById('rootRow');
      if (rr) rr.setAttribute('aria-expanded', 'true');
      await ensureChildrenLoaded('root', rootUl);
    }

    const parts = String(targetFolder || '').split('/').filter(Boolean);
    // we only need to expand up to the parent of the leaf
    const parents = parts.slice(0, -1);
    let acc = '';
    const newState = loadFolderTreeState();
    for (let i = 0; i < parents.length; i++) {
      acc = (i === 0) ? parents[0] : `${acc}/${parents[i]}`;
      const ul = getULForFolder(acc);
      if (!ul) continue;
      ul.classList.add('expanded'); ul.classList.remove('collapsed');
      const li = document.querySelector(`.folder-option[data-folder="${CSS.escape(acc)}"]`)?.closest('li[role="treeitem"]');
      if (li) li.setAttribute('aria-expanded', 'true');
      newState[acc] = 'block';
      await ensureChildrenLoaded(acc, ul);
    }
    saveFolderTreeState(newState);
  } catch (e) {}
}

/* ----------------------
   SVG icon helpers
----------------------*/
export function folderSVG(kind = 'empty', { locked = false, encrypted = false } = {}) {
  const gid = makeUid('g');
  return `
<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style="display:block;shape-rendering:geometricPrecision">
  <defs>
    <clipPath id="${gid}-clipBack"><path d="M3.5 7.5 H10.5 L12.5 9.5 H20.5 C21.6 9.5 22.5 10.4 22.5 11.5 V19.5 C22.5 20.6 21.6 21.5 20.5 21.5 H5.5 C4.4 21.5 3.5 20.6 3.5 19.5 V9.5 C3.5 8.4 4.4 7.5 5.5 7.5 Z"/></clipPath>
    <clipPath id="${gid}-clipFront"><path d="M2.5 10.5 H11.5 L13.5 8.5 H20.5 C21.6 8.5 22.5 9.4 22.5 10.5 V17.5 C22.5 18.6 21.6 19.5 20.5 19.5 H4.5 C3.4 19.5 2.5 18.6 2.5 17.5 V10.5 Z"/></clipPath>
    <linearGradient id="${gid}-back" x1="4" y1="20" x2="20" y2="4" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".55" stop-color="#fff" stop-opacity=".10"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${gid}-front" x1="6" y1="19" x2="19" y2="7" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".06"/>
    </linearGradient>
  </defs>
  <g class="back-group" clip-path="url(#${gid}-clipBack)">
    <path class="folder-back" d="M3.5 7.5 H10.5 L12.5 9.5 H20.5 C21.6 9.5 22.5 10.4 22.5 11.5 V19.5 C22.5 20.6 21.6 21.5 20.5 21.5 H5.5 C4.4 21.5 3.5 20.6 3.5 19.5 V9.5 C3.5 8.4 4.4 7.5 5.5 7.5 Z"/>
    <path d="M3.5 7.5 H10.5 L12.5 9.5 H20.5 V21.5 H3.5 Z" fill="url(#${gid}-back)" pointer-events="none"/>
  </g>
  ${kind === 'paper' ? `
  <g class="paper-group" transform="translate(0, -1.2)">
    <rect class="paper" x="6.5" y="6.5" width="11" height="10" rx="1"/>
    <path class="paper-fold" d="M17.5 6.5 H15.2 L17.5 9.0 Z"/>
    <g transform="translate(0, -2.4)">
      <path class="paper-ink" d="M9 11.3 H14.2" stroke="#4da3ff" stroke-width=".9" fill="none" stroke-linecap="round" stroke-linejoin="round" paint-order="normal" vector-effect="non-scaling-stroke"/>
      <path class="paper-ink" d="M9 12.8 H16.4" stroke="#4da3ff" stroke-width=".9" fill="none" stroke-linecap="round" stroke-linejoin="round" paint-order="normal" vector-effect="non-scaling-stroke"/>
    </g>
  </g>` : ``}
  <g class="front-group" clip-path="url(#${gid}-clipFront)">
    <path class="folder-front" d="M2.5 10.5 H11.5 L13.5 8.5 H20.5 C21.6 8.5 22.5 9.4 22.5 10.5 V17.5 C22.5 18.6 21.6 19.5 20.5 19.5 H4.5 C3.4 19.5 2.5 18.6 2.5 17.5 V10.5 Z"/>
    <path d="M2.5 10.5 H11.5 L13.5 8.5 H20.5 V19.5 H2.5 Z" fill="url(#${gid}-front)" pointer-events="none"/>
  </g>

  ${locked ? `
  <!-- Small padlock, positioned on the folder front, non-interactive -->
  <g class="lock-overlay" transform="translate(14.6, 10.6)" pointer-events="none">
    <path class="lock-shackle" d="M1.9 3 V2.2 C1.9 1.2 2.8 0.3 3.8 0.3 C4.8 0.3 5.7 1.2 5.7 2.2 V3"/>
    <rect class="lock-body" x="0" y="3" width="7.6" height="5.6" rx="1.2"></rect>
    <circle class="lock-keyhole" cx="3.8" cy="6" r="0.7"></circle>
  </g>` : ``}

  ${(!locked && encrypted) ? `
  <!-- Small "encrypted" badge (distinct from ACL lock) -->
  <g class="enc-overlay" transform="translate(2.0, 11.9) scale(1.12)" pointer-events="none">
    <circle class="enc-badge" cx="4.5" cy="4.35" r="3.95"></circle>
    <path class="enc-mark-shackle" d="M3.25 4.05 V3.65 C3.25 2.95 3.80 2.40 4.50 2.40 C5.20 2.40 5.75 2.95 5.75 3.65 V4.05" />
    <rect class="enc-mark-body" x="2.55" y="4.05" width="3.9" height="2.9" rx="0.65"></rect>
    <circle class="enc-mark-keyhole" cx="4.5" cy="5.6" r="0.45"></circle>
  </g>` : ``}

  <path class="lip-highlight" d="M3 10.5 H11.5 L13.5 8.5 H20.3"/>
</svg>`;
}
function setFolderIconForOption(optEl, kind) {
  const iconEl = optEl.querySelector('.folder-icon');
  if (!iconEl) return;
  if (optEl.dataset && optEl.dataset.folder === 'recycle_bin') return; // keep recycle icon intact
  const isLocked = optEl.classList.contains('locked');
  const isEncrypted = optEl.classList.contains('encrypted');
  iconEl.dataset.kind = kind;
  iconEl.innerHTML = folderSVG(kind, { locked: isLocked, encrypted: isEncrypted });
}
export function refreshFolderIcon(folder) {
  if (folder === 'recycle_bin') return;
  invalidateFolderCaches(folder);
  ensureFolderIcon(folder);
}

export async function refreshFolderChildren(folder) {
  const target = folder || 'root';
  if (target === 'recycle_bin') return false;
  invalidateFolderCaches(target);
  clearPeekCache([target]);
  const ul = getULForFolder(target);
  if (!ul) {
    refreshFolderIcon(target);
    return false;
  }
  ul._renderedOnce = false;
  ul.innerHTML = '';
  try { await ensureChildrenLoaded(target, ul); primeChildToggles(ul); } catch (e) {}
  if (target === 'root') placeRecycleBinNode();
  refreshFolderIcon(target);
  return true;
}
function ensureFolderIcon(folder) {
  if (folder === 'recycle_bin') return; // keep custom recycle icon intact
  const opt = document.querySelector(`.folder-option[data-folder="${CSS.escape(folder)}"]`);
  if (!opt) return;

  setFolderIconForOption(opt, 'empty');
  const kidsPromise = peekHasFolders(folder).catch(() => false);
  kidsPromise.then(hasKids => {
    try { updateToggleForOption(folder, !!hasKids); } catch (e) {}
  });

  scheduleFolderStatsWork(() => {
    Promise.all([
      fetchFolderCounts(folder).catch(() => ({ folders: 0, files: 0 })),
      kidsPromise
    ]).then(([cnt, hasKids]) => {
      const folders = Number(cnt?.folders || 0);
      const files   = Number(cnt?.files || 0);
      const hasAny  = (folders + files) > 0;

      setFolderIconForOption(opt, hasAny ? 'paper' : 'empty');
      updateToggleForOption(folder, !!hasKids || folders > 0);
    }).catch(() => {});
  });
}

/* ----------------------
   Toggle (chevron) helper
----------------------*/
function updateToggleForOption(folder, hasChildren) {
  const opt = document.querySelector(`.folder-option[data-folder="${CSS.escape(folder)}"]`);
  if (!opt) return;
  const row = opt.closest('.folder-row');
  if (!row) return;

  let btn = row.querySelector('button.folder-toggle');
  let spacer = row.querySelector('.folder-spacer');

  if (hasChildren) {
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'folder-toggle';
      btn.setAttribute('data-folder', folder);
      btn.setAttribute('aria-label', 'Expand');
      if (spacer) spacer.replaceWith(btn);
      else row.insertBefore(btn, opt);
    }
  } else {
    if (btn) {
      const newSpacer = document.createElement('span');
      newSpacer.className = 'folder-spacer';
      newSpacer.setAttribute('aria-hidden', 'true');
      btn.replaceWith(newSpacer);
    } else if (!spacer) {
      spacer = document.createElement('span');
      spacer.className = 'folder-spacer';
      spacer.setAttribute('aria-hidden', 'true');
      row.insertBefore(spacer, opt);
    }
  }
}

/* ----------------------
   Colors
----------------------*/
window.folderColorMap = window.folderColorMap || {};
function hexToHsl(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const r = parseInt(hex.substr(0, 2), 16) / 255;
  const g = parseInt(hex.substr(2, 2), 16) / 255;
  const b = parseInt(hex.substr(4, 2), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}
function hslToHex(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  const f = n => {
    const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return '#' + f(0) + f(8) + f(4);
}
function lighten(hex, amt = 14) {
  const { h, s, l } = hexToHsl(hex); return hslToHex(h, s, Math.min(100, l + amt));
}
function darken(hex, amt = 22) {
  const { h, s, l } = hexToHsl(hex); return hslToHex(h, s, Math.max(0, l - amt));
}

function applyFolderColorToOption(folder, hex) {
  // accepts folder like "root" or "A/B"
  const sel = folder === 'root'
    ? '#rootRow .folder-option'
    : `.folder-option[data-folder="${CSS.escape(folder)}"]`;
  const el = document.querySelector(sel);
  if (!el) return;

  if (!hex) {
    el.style.removeProperty('--filr-folder-front');
    el.style.removeProperty('--filr-folder-back');
    el.style.removeProperty('--filr-folder-stroke');
    return;
  }

  const front = hex;                 // main
  const back = lighten(hex, 14);     // body (slightly lighter)
  const stroke = darken(hex, 22);    // outline

  el.style.setProperty('--filr-folder-front', front);
  el.style.setProperty('--filr-folder-back', back);
  el.style.setProperty('--filr-folder-stroke', stroke);
}

function applyAllFolderColors(scope = document) {
  Object.entries(window.folderColorMap || {}).forEach(([folder, hex]) => {
    applyFolderColorToOption(folder, hex);
  });
}

async function saveFolderColor(folder, colorHexOrEmpty) {
  const res = await fetch('/api/folder/saveFolderColor.php', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.csrfToken },
    body: JSON.stringify({ folder, color: colorHexOrEmpty })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  // update local map & apply
  if (data.color) window.folderColorMap[folder] = data.color;
  else delete window.folderColorMap[folder];
  applyFolderColorToOption(folder, data.color || '');

  //  notify other views (fileListView's strip)
  window.dispatchEvent(new CustomEvent('folderColorChanged', {
    detail: { folder, color: data.color || '' }
  }));

  return data;
}

async function loadFolderColors() {
  if (window.__FR_COLORS_PROMISE) return window.__FR_COLORS_PROMISE;
  window.__FR_COLORS_PROMISE = (async () => {
    try {
      const r = await fetch('/api/folder/getFolderColors.php', { credentials: 'include' });
      if (!r.ok) { window.folderColorMap = {}; return; }
      window.folderColorMap = await r.json() || {};
    } catch (e) { window.folderColorMap = {}; }
    finally { window.__FR_COLORS_PROMISE = null; }
  })();
  return window.__FR_COLORS_PROMISE;
}

/* ----------------------
   Expansion state migration on move/rename
----------------------*/
function migrateExpansionStateOnMove(sourceFolder, newPath, ensureOpenParents = []) {
  const st = loadFolderTreeState();
  const keys = Object.keys(st);
  const next = { ...st };
  let changed = false;

  for (const k of keys) {
    if (k === sourceFolder || k.startsWith(sourceFolder + '/')) {
      const suffix = k.slice(sourceFolder.length);
      delete next[k];
      next[newPath + suffix] = st[k]; // carry same 'block'/'none'
      changed = true;
    }
  }
  // keep destination parents open to show the moved node
  ensureOpenParents.forEach(p => { if (p) next[p] = 'block'; });

  if (changed || ensureOpenParents.length) saveFolderTreeState(next);
}

/* ----------------------
   Fetch children (lazy)
----------------------*/
async function fetchChildrenOnce(folder) {
  if (_childCache.has(folder)) return _childCache.get(folder);
  const qs = new URLSearchParams({ folder });
  qs.set('limit', String(PAGE_LIMIT));
  qs.set('probe', '0');
  const p = (async () => {
    const res = await fetch(`/api/folder/listChildren.php?${qs.toString()}`, { method: 'GET', credentials: 'include' });  
    const body = await safeJson(res);

    const raw = Array.isArray(body.items) ? body.items : [];
  const items = raw
    .map(normalizeItem)
    .filter(Boolean)
    .filter(it => {
      const s = it.name.toLowerCase();
      return (
        s !== 'trash' &&
        s !== 'profile_pics' &&
        !s.startsWith('resumable_')
      );
    });

    const payload = { items, nextCursor: body.nextCursor ?? null };
    // Replace the promise with the resolved payload for future callers
    _childCache.set(folder, payload);
    return payload;
  })();
  _childCache.set(folder, p);
  return p;
}
async function loadMoreChildren(folder, ulEl, moreLi) {
  const cached = await _childCache.get(folder);
  const cursor = cached?.nextCursor || null;

  const qs = new URLSearchParams({ folder });
  if (cursor) qs.set('cursor', cursor);
  qs.set('limit', String(PAGE_LIMIT));
  qs.set('probe', '0');

  const res = await fetch(`/api/folder/listChildren.php?${qs.toString()}`, { method: 'GET', credentials: 'include' });
  const body = await safeJson(res);

  const raw = Array.isArray(body.items) ? body.items : [];
  const newItems = raw
    .map(normalizeItem)
    .filter(Boolean)
    .filter(it => {
      const s = it.name.toLowerCase();
      return s !== 'trash' && s !== 'profile_pics' &&
      !s.startsWith('resumable_');
    });

  const nextCursor = body.nextCursor ?? null;

  newItems.forEach(it => {
    const li = makeChildLi(folder, it);
    ulEl.insertBefore(li, moreLi);
    const full = (folder === 'root') ? it.name : `${folder}/${it.name}`;
    try { applyFolderColorToOption(full, (window.folderColorMap||{})[full] || ''); } catch (e) {}
    ensureFolderIcon(full);
  });

  const merged = (cached?.items || []).concat(newItems);
  if (nextCursor) _childCache.set(folder, { items: merged, nextCursor });
  else {
    moreLi.remove();
    _childCache.set(folder, { items: merged, nextCursor: null });
  }

  primeChildToggles(ulEl);
  const hasKids = !!ulEl.querySelector(':scope > li.folder-item');
  updateToggleForOption(folder, hasKids);
}
async function ensureChildrenLoaded(folder, ulEl) {
  let cached = _childCache.get(folder);
  if (cached && typeof cached.then === 'function') {
    cached = await cached;
  }
  let items, nextCursor;
  if (cached) { items = cached.items; nextCursor = cached.nextCursor; }
  else {
    const res = await fetchChildrenOnce(folder);
    items = res.items; nextCursor = res.nextCursor; _childCache.set(folder, { items, nextCursor });
  }

  if (!ulEl._renderedOnce) {
    items.forEach(it => {
      const li = makeChildLi(folder, it);
      ulEl.appendChild(li);
      const full = (folder === 'root') ? it.name : `${folder}/${it.name}`;
      try { applyFolderColorToOption(full, (window.folderColorMap||{})[full] || ''); } catch (e) {}
      ensureFolderIcon(full);
    });
    ulEl._renderedOnce = true;
  }

  let moreLi = ulEl.querySelector('.load-more');
  if (nextCursor && !moreLi) {
    moreLi = document.createElement('li');
    moreLi.className = 'load-more';
  
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-ghost';
    btn.textContent = t('load_more') || 'Load more';
    btn.setAttribute('aria-label', t('load_more') || 'Load more');
    if (ulEl.id) btn.setAttribute('aria-controls', ulEl.id);
  
    btn.addEventListener('click', async (e) => {
      const b = e.currentTarget;
      const prevText = b.textContent;
      b.disabled = true;
      b.setAttribute('aria-busy', 'true');
      b.textContent = t('loading') || 'Loading…';
  
      try {
        await loadMoreChildren(folder, ulEl, moreLi);
      } finally {
        // If the "load more" node still exists (wasn't removed because we reached end),
        // restore the button state.
        if (moreLi.isConnected) {
          b.disabled = false;
          b.removeAttribute('aria-busy');
          b.textContent = t('load_more') || 'Load more';
        }
      }
    });
  
    moreLi.appendChild(btn);
    ulEl.appendChild(moreLi);
  
  } else if (!nextCursor && moreLi) {
    moreLi.remove();
  }
  

  primeChildToggles(ulEl);
  const hasKidsNow = !!ulEl.querySelector(':scope > li.folder-item');
  updateToggleForOption(folder, hasKidsNow);
  peekHasFolders(folder).then(h => { try { updateToggleForOption(folder, !!h); } catch (e) {} });
}

/* ----------------------
   Prime icons/chevrons for a UL
----------------------*/
function primeChildToggles(ulEl) {
  ulEl.querySelectorAll('.folder-option[data-folder]').forEach(opt => {
    const f = opt.dataset.folder;
    if (f === 'recycle_bin') return;
    try { setFolderIconForOption(opt, 'empty'); } catch (e) {}

    const kidsPromise = peekHasFolders(f).catch(() => false);
    kidsPromise.then(hasKids => {
      try { updateToggleForOption(f, !!hasKids); } catch (e) {}
    });

    scheduleFolderStatsWork(() => {
      Promise.all([
        fetchFolderCounts(f).catch(() => ({ folders: 0, files: 0 })),
        kidsPromise
      ]).then(([cnt, hasKids]) => {
        const folders = Number(cnt?.folders || 0);
        const files   = Number(cnt?.files || 0);
        const hasAny  = (folders + files) > 0;

        try { setFolderIconForOption(opt, hasAny ? 'paper' : 'empty'); } catch (e) {}
        // IMPORTANT: chevron is true if EITHER we have subfolders (peek) OR counts say so
        try { updateToggleForOption(f, !!hasKids || folders > 0); } catch (e) {}
      });
    });
  });
}


export function openColorFolderModal(folder) {
  const existing = window.folderColorMap[folder] || '';
  const defaultHex = existing || '#f6b84e';

  const modal = document.createElement('div');
  modal.id = 'colorFolderModal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content" style="width:460px;max-width:90vw;">
      <style>
        /* Scoped styles for the preview only */
        #colorFolderModal .folder-preview {
          display:flex; align-items:center; gap:12px;
          margin-top:12px; padding:10px 12px; border-radius:12px;
          border:1px solid var(--border-color, #ddd);
          background: var(--bg, transparent);
          flex-wrap: wrap;
        }
        body.dark-mode #colorFolderModal .folder-preview {
          --border-color:#444; --bg: rgba(255,255,255,.02);
        }
        #colorFolderModal .folder-preview .folder-icon { width:56px; height:56px; display:inline-block; flex: 0 0 56px; }
        #colorFolderModal .folder-preview svg { width:56px; height:56px; display:block }
        /* Use the same variable names you already apply on folder rows */
        #colorFolderModal .folder-preview .folder-back  { fill:var(--filr-folder-back,  #f0d084) }
        #colorFolderModal .folder-preview .folder-front { fill:var(--filr-folder-front, #e2b158); stroke:var(--filr-folder-stroke, #996a1e); stroke-width:.6 }
        #colorFolderModal .folder-preview .lip-highlight { stroke:rgba(255,255,255,.35); fill:none; stroke-width:.9 }
        #colorFolderModal .folder-preview .paper { fill:#fff; stroke:#d0d0d0; stroke-width:.6 }
        #colorFolderModal .folder-preview .paper-fold { fill:#ececec }
        #colorFolderModal .folder-preview .paper-line { stroke:#c8c8c8; stroke-width:.8 }
        #colorFolderModal .folder-preview .label {
          font-weight:600; user-select:none;
          max-width: calc(100% - 70px);
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
          line-height: 1.25;
          font-size: clamp(12px, 2.4vw, 16px);
        }

        /* High-contrast ghost button just for this modal */
        #colorFolderModal .btn-ghost {
          background: transparent;
          border: 1px solid var(--ghost-border, #cfcfcf);
          color: var(--ghost-fg, #222);
          padding: 6px 12px;
        }
        #colorFolderModal .btn-ghost:hover {
          background: var(--ghost-hover-bg, #f5f5f5);
        }
        #colorFolderModal .btn-ghost:focus-visible {
          outline: 2px solid #8ab4f8;
          outline-offset: 2px;
        }
        body.dark-mode #colorFolderModal .btn-ghost {
          --ghost-border: #60636b;
          --ghost-fg: #f0f0f0;
          --ghost-hover-bg: rgba(255,255,255,.08);
        }
      </style>

      <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <h3 style="margin:0;flex:1;min-width:0;white-space:normal;overflow-wrap:anywhere;font-size:clamp(14px,2.6vw,18px)">${t('color_folder')}: ${escapeHTML(folder)}</h3>
        <span id="closeColorFolderModal" class="editor-close-btn" role="button" aria-label="Close">&times;</span>
      </div>

      <div class="modal-body" style="margin-top:10px;">
        <label for="folderColorInput" style="display:block;margin-bottom:6px;">${t('choose_color')}</label>
        <input type="color" id="folderColorInput" style="width:100%;padding:6px;" value="${defaultHex}"/>

        <!-- Live preview -->
        <div class="folder-preview" id="folderColorPreview" aria-label="Preview">
          <span class="folder-icon" aria-hidden="true">${folderSVG('paper')}</span>
          <span class="label">${escapeHTML(folder)}</span>
        </div>

        <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">
          <button id="resetFolderColorBtn" class="btn btn-ghost">${t('reset_default')}</button>
          <button id="saveFolderColorBtn" class="btn btn-primary">${t('save_color')}</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.style.display = 'block';

  // --- live preview wiring
  const previewEl = modal.querySelector('#folderColorPreview');
  const inputEl = modal.querySelector('#folderColorInput');

  function applyPreview(hex) {
    if (!hex || typeof hex !== 'string') return;
    const front = hex;
    const back = lighten(hex, 14);
    const stroke = darken(hex, 22);
    previewEl.style.setProperty('--filr-folder-front', front);
    previewEl.style.setProperty('--filr-folder-back', back);
    previewEl.style.setProperty('--filr-folder-stroke', stroke);
  }
  applyPreview(defaultHex);
  inputEl?.addEventListener('input', () => applyPreview(inputEl.value));

  // --- buttons/close
  document.getElementById('closeColorFolderModal')?.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    suppressNextToggle(300);
    setTimeout(() => expandTreePath(folder, { force: true }), 0);
    modal.remove();
  });

  document.getElementById('resetFolderColorBtn')?.addEventListener('click', async (e) => {
    e.preventDefault(); e.stopPropagation();
    try {
      await saveFolderColor(folder, ''); // clear
      showToast(t('folder_color_cleared'), 'success');
    } catch (err) {
      showToast(err.message || t('error_generic'), 'error');
    } finally {
      suppressNextToggle(300);
      setTimeout(() => expandTreePath(folder, { force: true }), 0);
      modal.remove();
    }
  });

  document.getElementById('saveFolderColorBtn')?.addEventListener('click', async (e) => {
    e.preventDefault(); e.stopPropagation();
    try {
      const hex = String(inputEl.value || '').trim();
      await saveFolderColor(folder, hex);
      showToast(t('folder_color_saved'), 'success');
    } finally {
      suppressNextToggle(300);
      setTimeout(() => expandTreePath(folder, { force: true }), 0);
      modal.remove();
    }
  });
}

function addFolderActionButton(rowEl, folderPath) {
  if (!rowEl || !folderPath) return;
  if (rowEl.querySelector('.folder-kebab')) return; // avoid duplicates

  const btn = document.createElement('button');
  btn.type = 'button';
  // share styling with file list kebab
  btn.className = 'folder-kebab btn-actions-ellipsis material-icons';
  btn.textContent = 'more_vert';

  const label = t('folder_actions') || 'Folder actions';
  btn.title = label;
  btn.setAttribute('aria-label', label);

  // only control visibility/layout here; let CSS handle colors/hover
  Object.assign(btn.style, {
    display: 'none',
    marginLeft: '4px',
    flexShrink: '0'
  });

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = btn.getBoundingClientRect();
    const x = rect.right;
    const y = rect.bottom;
    const opt = rowEl.querySelector('.folder-option');
    await openFolderActionsMenu(folderPath, opt, x, y);
  });

  rowEl.appendChild(btn);
}

/* ----------------------
   DOM builders & DnD
----------------------*/
function isSafeFolderPath(p) {
  // Client-side defense-in-depth; server already enforces safe segments.
  // Allows letters/numbers/space/_-. and slashes between segments.
  return /^(root|(?!\.)[^/\0]+)(\/(?!\.)[^/\0]+)*$/.test(String(p || ''));
}

const RECYCLE_BIN_ID = 'recycleBinRow';

export function recycleBinSVG(filled = false, size = 24) {
  const uid = makeUid('rb');

  const level1Inside = filled ? `
    <!-- Level 1: inside the mouth (subtle) -->
    <g clip-path="url(#${uid}-openingClip)" opacity="0.92">
      ${paperBall(7.6, 6.95, 1.35)}
      ${paperBall(10.4, 6.85, 1.25)}
      ${paperBall(12.9, 7.05, 1.35)}
      ${paperBall(15.2, 7.15, 1.15)}
    </g>
  ` : '';

  const level2BehindBar = filled ? `
    <!-- Level 2: packed at rim, behind gray bar -->
    <g clip-path="url(#${uid}-mouthOverflowClip)" opacity="0.97">
      ${paperBall(6.6, 5.15, 1.70, true)}
      ${paperBall(9.2, 4.90, 1.65, true)}
      ${paperBall(11.8, 5.10, 1.80, true)}
      ${paperBall(14.4, 4.85, 1.55, true)}
      ${paperBall(16.6, 5.15, 1.45, true)}
    </g>
  ` : '';

  const level3BehindBarButVisibleAbove = filled ? `
    <!-- Level 3: overflow, STILL behind gray bar.
         Positioned higher so tops are visible above the bar. -->
    <g clip-path="url(#${uid}-mouthOverflowClip)" opacity="0.99">
      ${paperBall(7.0, 2.15, 2.05, true)}
      ${paperBall(10.0, 1.98, 1.95, true)}
      ${paperBall(12.9, 2.12, 2.15, true)}
      ${paperBall(15.7, 2.20, 1.85, true)}
    </g>
  ` : '';

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"
         shape-rendering="geometricPrecision">
      <defs>
        <linearGradient id="${uid}-body" x1="0" y1="5" x2="0" y2="22">
          <stop offset="0%" stop-color="#eaf6ff"/>
          <stop offset="100%" stop-color="#cde6ff"/>
        </linearGradient>

        <linearGradient id="${uid}-side" x1="0" y1="6" x2="0" y2="20">
          <stop offset="0%" stop-color="#cfe8ff"/>
          <stop offset="100%" stop-color="#b9dcff"/>
        </linearGradient>

        <linearGradient id="${uid}-rim" x1="0" y1="3" x2="0" y2="6">
          <stop offset="0%" stop-color="#8b9aa2"/>
          <stop offset="100%" stop-color="#6f8089"/>
        </linearGradient>

        <linearGradient id="${uid}-base" x1="0" y1="19" x2="0" y2="22">
          <stop offset="0%" stop-color="#8b9aa2"/>
          <stop offset="100%" stop-color="#6f8089"/>
        </linearGradient>

        <marker id="${uid}-ah" markerWidth="4.2" markerHeight="4.2" refX="3.7" refY="2.1"
                orient="auto" markerUnits="userSpaceOnUse">
          <path d="M0,0 L4.2,2.1 L0,4.2 Z" fill="#2f7fd8"/>
        </marker>
        <marker id="${uid}-ahS" markerWidth="4.2" markerHeight="4.2" refX="3.7" refY="2.1"
                orient="auto" markerUnits="userSpaceOnUse">
          <path d="M0,0 L4.2,2.1 L0,4.2 Z" fill="#1f5fa8" opacity="0.9"/>
        </marker>

        <clipPath id="${uid}-binClip">
          <path d="M5.2 5.9H18.8L18.05 18.9c-.12 1.25-1.18 2.2-2.44 2.2H8.39c-1.26 0-2.32-.95-2.44-2.2Z"/>
        </clipPath>

        <clipPath id="${uid}-openingClip">
          <ellipse cx="12" cy="6.55" rx="6.05" ry="1.75"/>
        </clipPath>

        <!-- Constrain overflow to mouth width so it never reads "outside" -->
        <clipPath id="${uid}-mouthOverflowClip">
          <rect x="5.35" y="0.30" width="13.3" height="9.10" rx="3.0"/>
        </clipPath>
      </defs>

      <!-- can body -->
      <path d="M5.2 5.9H18.8L18.05 18.9c-.12 1.25-1.18 2.2-2.44 2.2H8.39c-1.26 0-2.32-.95-2.44-2.2Z"
            fill="url(#${uid}-body)" stroke="#b6d3ee" stroke-width="0.6" stroke-linejoin="round"/>

      <!-- inner side strips -->
      <g clip-path="url(#${uid}-binClip)" opacity="0.95">
        <rect x="6.0" y="6.1" width="1.25" height="14.6" fill="url(#${uid}-side)"/>
        <rect x="16.75" y="6.1" width="1.25" height="14.6" fill="url(#${uid}-side)"/>
        <rect x="7.6" y="6.3" width="0.6" height="14.2" fill="#ffffff" opacity="0.18"/>
      </g>

      ${level1Inside}
      ${level2BehindBar}
      ${level3BehindBarButVisibleAbove}

      <!-- gray top rim bar (ON TOP of all paper) -->
      <rect x="3" y="3.15" width="18" height="2.35" rx="0.45" fill="url(#${uid}-rim)"/>

      <!-- side “lip” blocks -->
      <path d="M3.55 5.55h2.15v3.05H4.25c-.4 0-.7-.3-.7-.7z" fill="#b8dcff" opacity="0.95"/>
      <path d="M18.3 5.55h2.15v2.35c0 .4-.3.7-.7.7H18.3z" fill="#b8dcff" opacity="0.95"/>

      <!-- recycle symbol -->
      <g transform="translate(12 12.45) scale(1.05)">
        <g opacity="0.22" transform="translate(0 0.35)">
          ${recycleTriangle(true)}
        </g>
        ${recycleTriangle(false)}
      </g>

      <!-- bottom base -->
      <rect x="4.6" y="19.2" width="14.8" height="2.55" rx="0.55" fill="url(#${uid}-base)"/>
      <path d="M5.4 20.0h2.0" stroke="#ffffff" stroke-opacity="0.25" stroke-width="0.8" stroke-linecap="round"/>
    </svg>
  `;

  function recycleTriangle(isShadow) {
    const stroke = isShadow ? '#1f5fa8' : '#2f7fd8';
    const w = isShadow ? 2.05 : 1.55;
    const head = isShadow ? `url(#${uid}-ahS)` : `url(#${uid}-ah)`;
    return `
      <g fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">
        <path d="M 0.0 -5.0 L 4.5 2.2" marker-end="${head}"/>
        <path d="M 3.9 3.1 L -3.9 3.1" marker-end="${head}"/>
        <path d="M -4.5 2.2 L 0.0 -5.0" marker-end="${head}"/>
      </g>
    `;
  }

  function paperBall(cx, cy, r, extra = false) {
    // Deterministic "crumple" wobble so the paper balls don't look perfectly round.
    const seed = (((Math.round(cx * 10) * 73856093) ^ (Math.round(cy * 10) * 19349663)) >>> 0);
    const rot = seed % 8;
    const base = [0.00, -0.12, 0.10, -0.16, 0.12, -0.08, 0.10, -0.14];
    const wobble = extra ? 0.85 : 0.55;
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const idx = (i + rot) % 8;
      const a = (Math.PI * 2 * i) / 8;
      const m = 1 + (base[idx] * wobble);
      pts.push({
        x: cx + Math.cos(a) * r * m,
        y: cy + Math.sin(a) * r * m
      });
    }

    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const start = mid(pts[pts.length - 1], pts[0]);
    let d = `M ${start.x} ${start.y}`;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const n = pts[(i + 1) % pts.length];
      const m = mid(p, n);
      d += ` Q ${p.x} ${p.y} ${m.x} ${m.y}`;
    }
    d += ' Z';

    const crease1 = `
      M ${cx - r*0.62} ${cy - r*0.08}
      C ${cx - r*0.12} ${cy - r*0.78}, ${cx + r*0.52} ${cy - r*0.46}, ${cx + r*0.35} ${cy + r*0.05}
    `;
    const crease2 = `
      M ${cx - r*0.45} ${cy + r*0.25}
      C ${cx - r*0.05} ${cy + r*0.10}, ${cx + r*0.20} ${cy + r*0.55}, ${cx + r*0.55} ${cy + r*0.30}
    `;
    return `
      <path d="${d}" fill="#f7f9ff" stroke="#c7d2e4" stroke-width="0.48"/>
      <path d="${crease1}" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="0.55" stroke-linecap="round"/>
      <path d="${crease2}" fill="none" stroke="#8fa7cf" stroke-opacity="0.48" stroke-width="0.50" stroke-linecap="round"/>
      ${extra ? `
        <path d="M ${cx - r*0.18} ${cy + r*0.62} l ${r*0.62} ${-r*0.42}"
              fill="none" stroke="#8fa7cf" stroke-opacity="0.40" stroke-width="0.45" stroke-linecap="round"/>
      ` : ''}
    `;
  }
}

function renderRecycleBinNode(hasItems = false) {
  const ul = document.getElementById('rootChildren');
  const container = document.getElementById('folderTreeContainer');
  if (!ul || !container) return;

  const existing = document.getElementById(RECYCLE_BIN_ID);
  if (existing) existing.remove();

  const li = document.createElement('li');
  li.id = RECYCLE_BIN_ID;
  li.className = 'folder-item recycle-bin-item';
  li.setAttribute('role', 'treeitem');
  li.setAttribute('aria-expanded', 'false');

  const row = document.createElement('div');
  row.className = 'folder-row recycle-bin-row';

  const spacer = document.createElement('span');
  spacer.className = 'folder-spacer';
  spacer.setAttribute('aria-hidden', 'true');

  const opt = document.createElement('button');
  opt.type = 'button';
  opt.id = 'recycleBinBtn';
  opt.className = 'folder-option recycle-bin-option';
  opt.setAttribute('data-folder', 'recycle_bin');
  opt.setAttribute('aria-label', t('recycle_bin') || 'Recycle Bin');
  opt.setAttribute('tabindex', '0');

  const icon = document.createElement('span');
  icon.className = 'folder-icon recycle-bin-icon';
  icon.innerHTML = recycleBinSVG(hasItems);

  const label = document.createElement('span');
  label.className = 'folder-label recycle-bin-label';
  label.textContent = t('recycle_bin') || 'Recycle Bin';

  opt.append(icon, label);
  row.append(spacer, opt);
  li.append(row);
  ul.appendChild(li);
}

export function updateRecycleBinState(hasItems) {
  window.recycleBinHasItems = !!hasItems;
  const icon = document.querySelector(`#${RECYCLE_BIN_ID} .recycle-bin-icon`);
  if (icon) {
    icon.innerHTML = recycleBinSVG(!!hasItems);
  }
}

function placeRecycleBinNode() {
  const ul = document.getElementById('rootChildren');
  if (!ul) return;

  const existing = document.getElementById(RECYCLE_BIN_ID);
  if (existing) existing.remove();

  const isAdmin = localStorage.getItem('isAdmin') === '1' || localStorage.getItem('isAdmin') === 'true';
  if (!isAdmin) return;

  renderRecycleBinNode(window.recycleBinHasItems || false);
}

function getAppZoomFactor() {
  try {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue('--app-zoom')
      .trim();
    const n = parseFloat(v);
    if (Number.isFinite(n) && n > 0) return n;
  } catch (e) {}
  return 1;
}

function handleFolderDragStart(ev, fullPath, optEl) {
  const dt = ev.dataTransfer;
  if (!dt) return;

  // Drag payload
  try { dt.setData('application/x-filerise-folder', fullPath); } catch (e) {}
  try { dt.setData('text/plain', fullPath); } catch (e) {}
  dt.effectAllowed = 'move';

  const row = optEl.closest('.folder-row') || optEl;
  if (!row || !dt.setDragImage) return;

  const isDark = document.body.classList.contains('dark-mode');

  // --- Resolve folder colors from CSS vars (per-folder color picker) ---
  let frontColor = '';
  let backColor = '';
  let strokeColor = '';
  try {
    const src = optEl || row;
    if (src) {
      const cs = getComputedStyle(src);
      frontColor  = (cs.getPropertyValue('--filr-folder-front')  || '').trim();
      backColor   = (cs.getPropertyValue('--filr-folder-back')   || '').trim();
      strokeColor = (cs.getPropertyValue('--filr-folder-stroke') || '').trim();
    }
  } catch (e) {
    // fall through to defaults
  }

  // Fallback to your default palette if no custom color is set
  if (!frontColor)  frontColor  = isDark ? '#facc6b' : '#e2b158';
  if (!backColor)   backColor   = isDark ? '#f5d88a' : '#f0d084';
  if (!strokeColor) strokeColor = isDark ? '#854d0e' : '#996a1e';

  // --- Drag ghost pill ---
  const ghost = document.createElement('div');
  ghost.className = 'folder-drag-ghost';

  const rowStyles = getComputedStyle(row);

  Object.assign(ghost.style, {
    position: 'fixed',
    top: '-9999px',
    left: '-9999px',
    pointerEvents: 'none',
    zIndex: '99999',

    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '2px 10px',
    borderRadius: '999px',
    whiteSpace: 'nowrap',

    fontFamily: rowStyles.fontFamily,
    fontSize: rowStyles.fontSize,

    background: isDark
      ? 'rgba(32,33,36,0.96)'
      : 'var(--filr-bg-elevated, #ffffff)',

    color: isDark
      ? '#f1f3f4'
      : 'var(--filr-text, #111827)',

    border: isDark
      ? '1px solid rgba(255,255,255,0.14)'
      : '1px solid rgba(15,23,42,0.12)',

    // Kill the shadow completely so no square halo can appear
    boxShadow: 'none',

    // Clip children to the rounded shape
    overflow: 'hidden',
    backgroundClip: 'padding-box'
  });

  // Icon
  const iconWrap = document.createElement('span');
  iconWrap.className = 'folder-icon';
  iconWrap.setAttribute('aria-hidden', 'true');
  iconWrap.style.width = '20px';
  iconWrap.style.height = '20px';
  iconWrap.style.display = 'inline-block';

  iconWrap.innerHTML = folderSVG('paper', { locked: false });

  try {
    const svg   = iconWrap.querySelector('svg');
    const back  = svg?.querySelector('.folder-back');
    const front = svg?.querySelector('.folder-front');
    const lip   = svg?.querySelector('.lip-highlight');
    const paper = svg?.querySelector('.paper');
    const fold  = svg?.querySelector('.paper-fold');
    const inks  = svg?.querySelectorAll('.paper-ink') || [];

    // Match current folder color (from vars)
    if (back) {
      back.setAttribute('fill', backColor);
    }
    if (front) {
      front.setAttribute('fill', frontColor);
      front.setAttribute('stroke', strokeColor);
      front.setAttribute('stroke-width', '.6');
    }
    if (lip) {
      lip.setAttribute('stroke', 'rgba(255,255,255,.35)');
      lip.setAttribute('stroke-width', '.9');
      lip.setAttribute('fill', 'none');
    }

    // Paper: stay white in both themes
    if (paper) {
      paper.setAttribute('fill', '#ffffff');
      paper.setAttribute('stroke', isDark ? '#4b5563' : '#d0d0d0');
      paper.setAttribute('stroke-width', '.6');
    }
    if (fold) {
      fold.setAttribute('fill', isDark ? '#374151' : '#ececec');
    }
    inks.forEach(line => {
      line.setAttribute('stroke', isDark ? '#60a5fa' : '#4da3ff');
      line.setAttribute('stroke-width', '.9');
    });
  } catch (e) {
    // non-fatal: worst case the icon is default-colored
  }

  // Label
  const labelSpan = document.createElement('span');
  labelSpan.className = 'folder-label';
  labelSpan.style.color = 'inherit';
  const fromRow = row.querySelector('.folder-label');
  labelSpan.textContent =
    (fromRow && fromRow.textContent) ||
    fullPath.split('/').pop() ||
    fullPath;

  ghost.append(iconWrap, labelSpan);
  document.body.appendChild(ghost);

  // Offset so cursor isn't dead center
  const offsetX = 14;
  const offsetY = 12;

  try {
    dt.setDragImage(ghost, offsetX, offsetY);
  } catch (e) {
    // fall back to browser default ghost
  }

  // Cleanup after snapshot
  setTimeout(() => {
    if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
  }, 0);
}

function makeChildLi(parentPath, item) {
  const it = normalizeItem(item);
  if (!it) return document.createElement('li');
  const { name, locked } = it;
  const encrypted = !locked && !!it.encrypted;

  const fullPath = parentPath === 'root' ? name : `${parentPath}/${name}`;
  if (!isSafeFolderPath(fullPath)) {
    // Fail closed if something looks odd; don’t render a clickable node.
    return document.createElement('li');
  }

  // <li class="folder-item" role="treeitem" aria-expanded="false">
  const li = document.createElement('li');
  li.className = 'folder-item';
  li.setAttribute('role', 'treeitem');
  li.setAttribute('aria-expanded', 'false');

  // <div class="folder-row">
  const row = document.createElement('div');
  row.className = 'folder-row';

  // <span class="folder-spacer" aria-hidden="true"></span>
  const spacer = document.createElement('span');
  spacer.className = 'folder-spacer';
  spacer.setAttribute('aria-hidden', 'true');

  // <span class="folder-option[ locked]" [draggable]>
  const opt = document.createElement('span');
  opt.className = 'folder-option' + (locked ? ' locked' : '') + (encrypted ? ' encrypted' : '');
  if (!locked) opt.setAttribute('draggable', 'true');
  // Use dataset instead of attribute string interpolation.
  opt.dataset.folder = fullPath;

  // <span class="folder-icon" aria-hidden="true" data-kind="empty">[svg]</span>
  const icon = document.createElement('span');
  icon.className = 'folder-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.dataset.kind = 'empty';
  // Safe: SVG is generated locally, not from user input.
  // nosemgrep: javascript.browser.security.dom-xss.innerhtml
  icon.innerHTML = folderSVG('empty', { locked, encrypted });

  // <span class="folder-label">name</span>
  const label = document.createElement('span');
  label.className = 'folder-label';
  // Critical: never innerHTML here — textContent avoids XSS.
  label.textContent = name;

  opt.append(icon, label);
  row.append(spacer, opt);

  // Add 3-dot actions button for unlocked folders
  if (!locked) addFolderActionButton(row, fullPath);

  li.append(row);

  // <ul class="folder-tree collapsed" role="group"></ul>
  const ul = document.createElement('ul');
  ul.className = 'folder-tree collapsed';
  ul.setAttribute('role', 'group');
  li.append(ul);

  // Wire DnD / click the same as before
  if (!locked) {
    opt.addEventListener('dragstart', (ev) => {
      handleFolderDragStart(ev, fullPath, opt);
    });
    opt.addEventListener('dragover', folderDragOverHandler);
    opt.addEventListener('dragover', folderDragOverHandler);
    opt.addEventListener('dragleave', folderDragLeaveHandler);
    opt.addEventListener('drop', (e) => handleDropOnFolder(e, fullPath));
    opt.addEventListener('click', () => selectFolder(fullPath));
  } else {
    opt.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!ul) return;
      const willExpand = !ul.classList.contains('expanded');
      ul.classList.toggle('expanded', willExpand);
      ul.classList.toggle('collapsed', !willExpand);
      li.setAttribute('aria-expanded', String(willExpand));
      const st = loadFolderTreeState(); st[fullPath] = willExpand ? 'block' : 'none'; saveFolderTreeState(st);
      if (willExpand) await ensureChildrenLoaded(fullPath, ul);
    });
  }

  return li;
}
function folderDragOverHandler(event) { event.preventDefault(); event.currentTarget.classList.add("drop-hover"); }
function folderDragLeaveHandler(event) { event.currentTarget.classList.remove("drop-hover"); }

/* ----------------------
   Color-carry helper (fix #2)
----------------------*/
async function carryFolderColor(sourceFolder, newPath) {
  const oldColor = window.folderColorMap[sourceFolder];
  if (!oldColor) return;
  try {
    await saveFolderColor(newPath, oldColor);
    await saveFolderColor(sourceFolder, '');
  } catch (e) {}
}

/* ----------------------
   Shared tree sync after a folder move
   Used by modal / inline moves so tree + selection stay in sync.
----------------------*/
export async function syncTreeAfterFolderMove(sourceFolder, destination) {
  if (!sourceFolder || !destination) return;

  const base = sourceFolder.split('/').pop();
  const newPath = (destination === 'root' ? '' : destination + '/') + base;

  // carry color (best-effort)
  await carryFolderColor(sourceFolder, newPath);

  // migrate expansion state + keep parents open
  migrateExpansionStateOnMove(sourceFolder, newPath, [destination, getParentFolder(destination)]);

  const srcParent = getParentFolder(sourceFolder);
  const dstParent = destination;

  // clear caches so icons/chevrons/counts are recomputed
  invalidateFolderCaches(srcParent);
  invalidateFolderCaches(dstParent);
  clearPeekCache([srcParent, dstParent, sourceFolder, newPath]);

  // re-render src + dest ULs incrementally
  const srcUl = getULForFolder(srcParent);
  const dstUl = getULForFolder(dstParent);

  if (srcUl) {
    srcUl._renderedOnce = false;
    srcUl.innerHTML = '';
    await ensureChildrenLoaded(srcParent, srcUl);
  }
  if (dstUl) {
    dstUl._renderedOnce = false;
    dstUl.innerHTML = '';
    await ensureChildrenLoaded(dstParent, dstUl);
  }

  // dest definitely has a child now → chevron on
  updateToggleForOption(dstParent, true);
  ensureFolderIcon(dstParent);

  // source may have lost its last child → recompute
  const _srcUlLive = getULForFolder(srcParent);
  updateToggleForOption(
    srcParent,
    !!(_srcUlLive && _srcUlLive.querySelector(':scope > li.folder-item'))
  );

  // restore any open branches we had saved
  await expandAndLoadSavedState();

  // update currentFolder + sticky lastOpened
  if (window.currentFolder === sourceFolder) {
    window.currentFolder = newPath;
  } else if (window.currentFolder && window.currentFolder.startsWith(sourceFolder + '/')) {
    const suffix = window.currentFolder.slice(sourceFolder.length); // includes leading '/'
    window.currentFolder = newPath + suffix;
  }
  setLastOpenedFolder(window.currentFolder || newPath);

  // refresh icons for parents
  refreshFolderIcon(srcParent);
  refreshFolderIcon(dstParent);

  // finally select the new path (also reloads file list + breadcrumb)
  selectFolder(window.currentFolder || newPath);
}

/* ----------------------
   Handle drop (files or folders)
----------------------*/
function handleDropOnFolder(event, dropFolder) {
  event.preventDefault();
  event.currentTarget?.classList?.remove("drop-hover");

  let dragData = null;
  try {
    const jsonStr = event.dataTransfer.getData("application/json") || "";
    if (jsonStr) dragData = JSON.parse(jsonStr);
  } catch (e) {
    dragData = null;
  }

  // --- NEW: folder drag coming from the inline file list (JSON payload) ---
  if (dragData && dragData.dragType === 'folder' && dragData.folder) {
    const sourceFolder = String(dragData.folder || "").trim();
    if (!sourceFolder || sourceFolder === "root") return;
    const sourceId = String(dragData.sourceId || dragData.sourceSourceId || '').trim();
    const destSourceId = getActiveSourceId();
    const crossSource = sourceId && destSourceId && sourceId !== destSourceId;

    // prevent moving into self/descendant
    if (!crossSource && (dropFolder === sourceFolder || (dropFolder + "/").startsWith(sourceFolder + "/"))) {
      showToast(t('invalid_destination'), 4000, 'warning');
      return;
    }

    const progress = startTransferProgress({
      action: 'Moving',
      itemCount: 1,
      itemLabel: 'folder',
      bytesKnown: false,
      indeterminate: true,
      source: sourceFolder,
      destination: dropFolder
    });
    let ok = false;
    let errMsg = '';

    fetchWithCsrf("/api/folder/moveFolder.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        source: sourceFolder,
        destination: dropFolder,
        sourceId,
        destSourceId
      })
    })
      .then(safeJson)
      .then(async (data) => {
        if (data && !data.error) {
          ok = true;
          const destLabel = dropFolder || t('root_folder');
          showToast(t('move_folder_success_to', { folder: destLabel }), 'success');
          if (crossSource) {
            try {
              if (sourceFolder) {
                const srcParent = getParentFolder(sourceFolder);
                window.dispatchEvent(new CustomEvent('folderStatsInvalidated', {
                  detail: { folders: [srcParent], sourceId }
                }));
              }
              if (dropFolder) {
                window.dispatchEvent(new CustomEvent('folderStatsInvalidated', {
                  detail: { folders: [dropFolder], sourceId: destSourceId }
                }));
              }
            } catch (e) { /* ignore */ }
            loadFileList(dropFolder);
          } else {
            // reuse the shared tree-sync helper so icons, chevrons, selection, and file list all match
            await syncTreeAfterFolderMove(sourceFolder, dropFolder);
          }
        } else {
          ok = false;
          errMsg = data && data.error ? data.error : t('move_folder_error_default');
          showToast(t('move_folder_error_detail', { error: errMsg }), 5000, 'error');
        }
      })
      .catch(err => {
        ok = false;
        errMsg = err && err.message ? err.message : t('move_folder_error_default');
        console.error("Error moving folder:", err);
        showToast(t('move_folder_error'), 5000, 'error');
      })
      .finally(() => {
        finishTransferProgress(progress, { ok, error: errMsg });
      });

    return;
  }

  // --- existing FOLDER->FOLDER fallback (tree → tree drag using plain text) ---
  let plainSource = "";
  try {
    plainSource =
      (event.dataTransfer && event.dataTransfer.getData("application/x-filerise-folder")) ||
      (event.dataTransfer && event.dataTransfer.getData("text/plain")) ||
      "";
  } catch (e) {
    plainSource = "";
  }

  if (!dragData && plainSource) {
    const sourceFolder = String(plainSource || "").trim();
    if (!sourceFolder || sourceFolder === "root") return;
    if (dropFolder === sourceFolder || (dropFolder + "/").startsWith(sourceFolder + "/")) {
      showToast(t('invalid_destination'), 4000, 'warning');
      return;
    }

    const progress = startTransferProgress({
      action: 'Moving',
      itemCount: 1,
      itemLabel: 'folder',
      bytesKnown: false,
      indeterminate: true,
      source: sourceFolder,
      destination: dropFolder
    });
    let ok = false;
    let errMsg = '';

    fetchWithCsrf("/api/folder/moveFolder.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ source: sourceFolder, destination: dropFolder })
    })
      .then(safeJson)
      .then(async (data) => {
        if (data && !data.error) {
          ok = true;
          const destLabel = dropFolder || t('root_folder');
          showToast(t('move_folder_success_to', { folder: destLabel }), 'success');
          await syncTreeAfterFolderMove(sourceFolder, dropFolder);
        } else {
          ok = false;
          errMsg = data && data.error ? data.error : t('move_folder_error_default');
          showToast(t('move_folder_error_detail', { error: errMsg }), 5000, 'error');
        }
      })
      .catch(err => {
        ok = false;
        errMsg = err && err.message ? err.message : t('move_folder_error_default');
        console.error("Error moving folder:", err);
        showToast(t('move_folder_error'), 5000, 'error');
      })
      .finally(() => {
        finishTransferProgress(progress, { ok, error: errMsg });
      });

    return;
  }

  // --- existing FILE(S) move branch (unchanged) ---
  // File(s) move
  const filesToMove = dragData && (dragData.files ? dragData.files : (dragData.fileName ? [dragData.fileName] : []));
  if (!filesToMove || filesToMove.length === 0) return;

  const sourceId = String(dragData?.sourceId || dragData?.sourceSourceId || '').trim();
  const destSourceId = getActiveSourceId();
  const crossSource = sourceId && destSourceId && sourceId !== destSourceId;

  const totals = {
    totalBytes: Number.isFinite(dragData?.totalBytes) ? dragData.totalBytes : 0,
    bytesKnown: dragData?.bytesKnown === true,
    itemCount: filesToMove.length
  };
  const progress = startTransferProgress({
    action: 'Moving',
    itemCount: totals.itemCount,
    itemLabel: totals.itemCount === 1 ? 'file' : 'files',
    totalBytes: totals.totalBytes,
    bytesKnown: totals.bytesKnown,
    source: dragData.sourceFolder,
    destination: dropFolder
  });
  let ok = false;
  let errMsg = '';

  fetchWithCsrf("/api/file/moveFiles.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      source: dragData.sourceFolder,
      files: filesToMove,
      destination: dropFolder,
      sourceId,
      destSourceId
    })
  }).then(safeJson).then(data => {
    if (data.success) {
      ok = true;
      const destLabel = dropFolder || t('root_folder');
      showToast(t('move_files_success_to', { count: filesToMove.length, folder: destLabel }), 'success');
      const activeSourceId = getActiveSourceId();
      if (!sourceId || sourceId === activeSourceId) {
        refreshFolderIcon(dragData.sourceFolder);
      }
      if (!destSourceId || destSourceId === activeSourceId) {
        refreshFolderIcon(dropFolder);
      }
      try {
        if (crossSource) {
          if (dragData.sourceFolder) {
            window.dispatchEvent(new CustomEvent('folderStatsInvalidated', {
              detail: { folders: [dragData.sourceFolder], sourceId }
            }));
          }
          if (dropFolder) {
            window.dispatchEvent(new CustomEvent('folderStatsInvalidated', {
              detail: { folders: [dropFolder], sourceId: destSourceId }
            }));
          }
        } else {
          const folders = [dragData.sourceFolder, dropFolder].filter(Boolean);
          if (folders.length) {
            window.dispatchEvent(new CustomEvent('folderStatsInvalidated', {
              detail: { folders, sourceId: sourceId || destSourceId }
            }));
          }
        }
      } catch (e) { /* ignore */ }
      const reloadFolder = crossSource
        ? (window.currentFolder || dropFolder || dragData.sourceFolder)
        : dragData.sourceFolder;
      loadFileList(reloadFolder);
    } else {
      ok = false;
      errMsg = data.error || t('unknown_error');
      showToast(t('move_files_error', { error: errMsg }), 'error');
    }
  }).catch(err => {
    ok = false;
    errMsg = err && err.message ? err.message : t('unknown_error');
    showToast(t('move_files_error_generic'), 'error');
  }).finally(() => {
    finishTransferProgress(progress, { ok, error: errMsg });
  });
  return;
}

/* ----------------------
   Selection + helpers
----------------------*/
function getULForFolder(folder) {
  if (folder === 'root') return document.getElementById('rootChildren');
  const opt = document.querySelector(`.folder-option[data-folder="${CSS.escape(folder)}"]`);
  const li  = opt ? opt.closest('li[role="treeitem"]') : null;
  return li ? li.querySelector(':scope > ul.folder-tree') : null;
}

function updateFolderActionButtons() {
  const container = document.getElementById('folderTreeContainer');
  if (!container) return;

  // Hide all kebabs by default
  container.querySelectorAll('.folder-kebab').forEach(btn => {
    btn.style.display = 'none';
  });

  // Show only for the currently selected, unlocked folder
  const selectedOpt = container.querySelector('.folder-option.selected');
  if (!selectedOpt || selectedOpt.classList.contains('locked')) return;

  const row = selectedOpt.closest('.folder-row');
  if (!row) return;
  const kebab = row.querySelector('.folder-kebab');
  if (kebab) {
    kebab.style.display = 'inline-flex';
  }
}

export function syncFolderTreeSelection(selected) {
  const container = document.getElementById('folderTreeContainer');
  if (!container) return;
  container.querySelectorAll(".folder-option").forEach(el => el.classList.remove("selected"));
  if (selected) {
    try {
      const opt = container.querySelector(`.folder-option[data-folder="${CSS.escape(selected)}"]`);
      if (opt) opt.classList.add("selected");
    } catch (e) { /* ignore */ }
  }
  updateFolderActionButtons();
}

async function selectFolder(selected) {
  const container = document.getElementById('folderTreeContainer');
  if (!container) return;

  // If the node is in the tree, trust its locked class.
  let opt = container.querySelector(`.folder-option[data-folder="${CSS.escape(selected)}"]`);
  let allowed = true;
  applyFolderCapabilities(selected);
  if (opt && opt.classList.contains('locked')) {
    allowed = false;
  } else if (!opt) {
    // Not in DOM → preflight capabilities so breadcrumbs (and other callers)
    // can't jump into forbidden folders.
    try {
      allowed = await canViewFolder(selected);
    } catch (e) {
      allowed = false;
    }
  }

  if (!allowed) {
    showToast(t('no_access') || "You do not have access to this resource.", 'error');
    return; // do NOT change currentFolder or lastOpenedFolder
  }

  // At this point we’re allowed. If the node isn’t visible yet, open its parents
  // so the tree reflects where we are going.
  if (!opt && selected && selected !== 'root') {
    const parts = selected.split('/').filter(Boolean);
    const st = loadFolderTreeState();
    let acc = '';
    for (let i = 0; i < parts.length; i++) {
      acc = i === 0 ? parts[i] : `${acc}/${parts[i]}`;
      st[acc] = 'block';
    }
    saveFolderTreeState(st);
    // Materialize the opened branches
    await expandAndLoadSavedState();
    opt = container.querySelector(`.folder-option[data-folder="${CSS.escape(selected)}"]`);
  }

  // Visual selection
  container.querySelectorAll(".folder-option").forEach(el => el.classList.remove("selected"));
  if (opt) opt.classList.add("selected");

  // Update state + UI
  window.currentFolder = selected;
  setLastOpenedFolder(selected);
  updateBreadcrumbTitle(selected);
  applyFolderCapabilities(selected);
  ensureFolderIcon(selected);
  const skipCfg = window.__frSkipListReload || null;
  const activeSourceId = getActiveSourceId();
  const shouldSkip = !!(
    skipCfg &&
    skipCfg.folder === selected &&
    (!skipCfg.sourceId || skipCfg.sourceId === activeSourceId)
  );
  if (skipCfg) {
    window.__frSkipListReload = null;
  }
  if (!shouldSkip) {
    loadFileList(selected);
  }

  // Expand the selected node’s UL if present
  const ul = getULForFolder(selected);
  if (ul) {
    ul.classList.add('expanded');
    ul.classList.remove('collapsed');
    const parentLi = selected === 'root'
      ? document.getElementById('rootRow')
      : (opt ? opt.closest('li[role="treeitem"]') : null);
    if (parentLi) parentLi.setAttribute('aria-expanded', 'true');

    const st = loadFolderTreeState();
    st[selected] = 'block';
    saveFolderTreeState(st);
    try { await ensureChildrenLoaded(selected, ul); primeChildToggles(ul); } catch (e) {}
  }

  // Keep the 3-dot action aligned to the active folder
  updateFolderActionButtons();
}

/* ----------------------
   Expand saved state at boot
----------------------*/
async function expandAndLoadSavedState() {
  const st = loadFolderTreeState();
  const openKeys = Object.keys(st).filter(k => st[k] === 'block');
  openKeys.sort((a, b) => a.split('/').length - b.split('/').length);

  for (const key of openKeys) {
    const ul = getULForFolder(key);
    if (!ul) continue;
    ul.classList.add('expanded');
    ul.classList.remove('collapsed');

    let li;
    if (key === 'root') {
      li = document.getElementById('rootRow');
    } else {
      const opt = document.querySelector(`.folder-option[data-folder="${CSS.escape(key)}"]`);
      li = opt ? opt.closest('li[role="treeitem"]') : null;
    }
    if (li) li.setAttribute('aria-expanded', 'true');
    try { await ensureChildrenLoaded(key, ul); } catch (e) {}
  }
}

/* ----------------------
   Main: loadFolderTree
----------------------*/
export async function loadFolderTree(selectedFolder) {
  try {
    await checkUserFolderPermission();
    const username = localStorage.getItem("username") || "root";
    let effectiveRoot = "root";
    let effectiveLabel = getRootLabel();
    if (window.userFolderOnly && username) {
      effectiveRoot = username;
      effectiveLabel = getRootLabel();
      setLastOpenedFolder(username);
      window.currentFolder = username;
    } else {
      window.currentFolder = getLastOpenedFolder() || "root";
    }

    const container = document.getElementById("folderTreeContainer");
    if (!container) return;

    const state0 = loadFolderTreeState();
    const rootOpen = state0[effectiveRoot] !== 'none';

    let html = `
      <div id="rootRow" class="folder-row" role="treeitem" aria-expanded="${String(rootOpen)}">
        <button type="button" class="folder-toggle" data-folder="${effectiveRoot}" aria-label="${rootOpen ? 'Collapse' : 'Expand'}"></button>
        <span class="folder-option root-folder-option" data-folder="${effectiveRoot}">
          <span class="folder-icon" aria-hidden="true" data-kind="empty">${folderSVG('empty')}</span>
          <span class="folder-label">${escapeHTML(effectiveLabel)}</span>
        </span>
      </div>
      <ul id="rootChildren" class="folder-tree ${rootOpen ? 'expanded' : 'collapsed'}" role="group"></ul>
    `;
    container.innerHTML = html;

    // Add 3-dot actions button for root
    const rootRow = document.getElementById('rootRow');
    if (rootRow) {
      addFolderActionButton(rootRow, effectiveRoot);
    }

    // Determine root's lock state
    const rootOpt = container.querySelector('.root-folder-option');
    let rootLocked = false;
    try {
      const caps = await getFolderCapabilities(effectiveRoot);
      const canView = !!(caps?.canView ?? caps?.canRead ?? caps?.canReadOwn ?? caps?.isAdmin);
      rootLocked = !canView;
    } catch (e) {}
    if (rootOpt && rootLocked) markOptionLocked(rootOpt, true);
    applyFolderCapabilities(effectiveRoot);
    // Root DnD + prime icon/chevron
    {
      const ro = rootOpt;
      if (ro) {
        const isLocked = ro.classList.contains('locked');
        if (!isLocked) {
          ro.addEventListener('dragover', folderDragOverHandler);
          ro.addEventListener('dragleave', folderDragLeaveHandler);
          ro.addEventListener('drop', (e) => handleDropOnFolder(e, effectiveRoot));
        }
        try { setFolderIconForOption(ro, 'empty'); } catch (e) {}
        const kidsPromise = peekHasFolders(effectiveRoot).catch(() => false);
        kidsPromise.then(hasKids => {
          try { updateToggleForOption(effectiveRoot, !!hasKids); } catch (e) {}
        });
        scheduleFolderStatsWork(() => {
          fetchFolderCounts(effectiveRoot).then(({ folders, files }) => {
            const hasAny = (folders + files) > 0;
            try { setFolderIconForOption(ro, hasAny ? 'paper' : 'empty'); } catch (e) {}
            return kidsPromise.then(hasKids => {
              try { updateToggleForOption(effectiveRoot, !!hasKids || folders > 0); } catch (e) {}
            });
          }).catch(() => {});
        });
      }
    }

    // Delegated toggle
    if (!container._toggleBound) {
      container._toggleBound = true;
      container.addEventListener('click', async (e) => {
        if (performance.now() < _suppressToggleUntil) { e.stopPropagation(); e.preventDefault(); return; }
        const btn = e.target.closest('button.folder-toggle');
        if (!btn || !container.contains(btn)) return;
        e.stopPropagation();
        const folderPath = btn.getAttribute('data-folder');
        const ul = getULForFolder(folderPath);
        if (!ul) return;
        const willExpand = !ul.classList.contains('expanded');
        ul.classList.toggle('expanded', willExpand);
        ul.classList.toggle('collapsed', !willExpand);
        const li = folderPath === 'root'
          ? document.getElementById('rootRow')
          : (document.querySelector(`.folder-option[data-folder="${CSS.escape(folderPath)}"]`)?.closest('li[role="treeitem"]'));
        if (li) li.setAttribute('aria-expanded', String(willExpand));
        const st = loadFolderTreeState(); st[folderPath] = willExpand ? 'block' : 'none'; saveFolderTreeState(st);
        if (willExpand) await ensureChildrenLoaded(folderPath, ul);
      }, true);

      // Delegated folder-option click
      container.addEventListener("click", function(e) {
        const opt = e.target.closest(".folder-option");
        if (!opt || !container.contains(opt)) return;
        e.stopPropagation();

        if (opt.classList.contains('recycle-bin-option')) {
          return; // handled separately
        }

        if (opt.classList.contains('locked')) {
          // Toggle expansion, don't select
          const folderPath = opt.getAttribute('data-folder');
          const ul = getULForFolder(folderPath);
          if (!ul) return;
          const willExpand = !ul.classList.contains('expanded');
          ul.classList.toggle('expanded', willExpand);
          ul.classList.toggle('collapsed', !willExpand);
          const li = opt.closest('li[role="treeitem"]');
          if (li) li.setAttribute('aria-expanded', String(willExpand));
          const st = loadFolderTreeState(); st[folderPath] = willExpand ? 'block' : 'none'; saveFolderTreeState(st);
          if (willExpand) ensureChildrenLoaded(folderPath, ul);
          return;
        }
        const actions = document.getElementById('fileListActions');
        if (actions) actions.style.display = '';
        selectFolder(opt.getAttribute("data-folder") || 'root');
      });
    }

    await loadFolderColors();
    applyAllFolderColors(container);

    // Root: load its children if open
    const rc = document.getElementById('rootChildren');
    if (rc && rootOpen) {
      await ensureChildrenLoaded(effectiveRoot, rc);
      primeChildToggles(rc);
      const hasKids = !!rc.querySelector('li.folder-item');
      updateToggleForOption(effectiveRoot, hasKids);
    }

    // Expand + render all previously opened nodes
    await expandAndLoadSavedState();

    // Static recycle bin entry (admins only)
    placeRecycleBinNode();

    // ---------- Smart initial selection (sticky + top-level preference) ----------
let target = await chooseInitialFolder(effectiveRoot, selectedFolder);

if (!target) {
  const ro = document.querySelector('.root-folder-option');
  if (ro) ro.classList.add('selected');

  showNoAccessEmptyState();
  applyFolderCapabilities(effectiveRoot);
  return;
}

// Ensure the path to target is visibly open in the tree (even if ancestors are locked)
await expandAncestors(target);

// Persist and select
setLastOpenedFolder(target);
selectFolder(target);
// ---------------------------------------------------------------------------
    // --------------------------------------------

  } catch (err) {
    console.error("Error loading folder tree:", err);
    if (err.status === 403) showToast(t('folders_view_denied'), 'error');
  }
}

export function loadFolderList(selectedFolder) { loadFolderTree(selectedFolder); } // compat

/* ----------------------
   Context menu (file-menu look)
----------------------*/
function iconForFolderLabel(lbl) {
  if (lbl === t('create_folder'))  return 'create_new_folder';
  if (lbl === t('move_folder'))    return 'drive_file_move';
  if (lbl === t('rename_folder'))  return 'drive_file_rename_outline';
  if (lbl === t('color_folder'))   return 'palette';
  if (lbl === t('folder_share'))   return 'share';
  if (lbl === t('delete_folder'))  return 'delete';
  return 'more_horiz';
}

function getFolderMenu() {
  let m = document.getElementById('folderManagerContextMenu');
  if (!m) {
    m = document.createElement('div');
    m.id = 'folderManagerContextMenu';
    m.className = 'filr-menu';
    m.setAttribute('role', 'menu');
    // position + scroll are inline so it works even before CSS loads
    m.style.position = 'fixed';
    m.style.minWidth = '180px';
    m.style.maxHeight = '420px';
    m.style.overflowY = 'auto';
    m.hidden = true;

    // Close on outside click / Esc
    document.addEventListener('click', (ev) => {
      if (!m.hidden && !m.contains(ev.target)) hideFolderManagerContextMenu();
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') hideFolderManagerContextMenu();
    });

    document.body.appendChild(m);
  }
  return m;
}

export function showFolderManagerContextMenu(x, y, menuItems) {
  const menu = getFolderMenu();
  menu.innerHTML = '';

  // Build items (same DOM as file menu: <button.mi><i.material-icons/><span/>)
  menuItems.forEach((item, idx) => {
    // optional separator after first item (like file menu top block)
    if (idx === 1) {
      const sep = document.createElement('div');
      sep.className = 'sep';
      menu.appendChild(sep);
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mi';
    btn.setAttribute('role', 'menuitem');

    const ic = document.createElement('i');
    ic.className = 'material-icons';
    ic.textContent = item.icon || iconForFolderLabel(item.label);

    const tx = document.createElement('span');
    tx.textContent = item.label;

    btn.append(ic, tx);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      hideFolderManagerContextMenu();   // close first so it never overlays your modal
      try { item.action && item.action(); } catch (err) { console.error(err); }
    });

    menu.appendChild(btn);
  });

  // Show + clamp to viewport
  menu.hidden = false;
  menu.style.left = `${x}px`;
  menu.style.top  = `${y}px`;

  const r = menu.getBoundingClientRect();
  let nx = r.left, ny = r.top;

  if (r.right > window.innerWidth)  nx -= (r.right - window.innerWidth + 6);
  if (r.bottom > window.innerHeight) ny -= (r.bottom - window.innerHeight + 6);

  menu.style.left = `${Math.max(6, nx)}px`;
  menu.style.top  = `${Math.max(6, ny)}px`;

  // Defensive: opening a context menu can (rarely) blank out inline SVGs in other parts of the UI.
  // Repair after the menu is painted (and again shortly after) without forcing a full re-render.
  try {
    const kick = () => { try { repairBlankFolderIcons({ force: true }); } catch (e) {} };
    queueMicrotask(kick);
    setTimeout(kick, 80);
    setTimeout(kick, 250);
  } catch (e) { /* ignore */ }
}

export function hideFolderManagerContextMenu() {
  const menu = document.getElementById('folderManagerContextMenu');
  if (menu) menu.hidden = true;
}

async function openFolderActionsMenu(folder, targetEl, clientX, clientY) {
  if (!folder) return;

  window.currentFolder = folder;
  await applyFolderCapabilities(folder);

  // Clear previous selection in tree + breadcrumb
  document.querySelectorAll('.folder-option, .breadcrumb-link').forEach(el => el.classList.remove('selected'));

  // Mark the clicked thing selected (folder-option or breadcrumb)
  if (targetEl) targetEl.classList.add('selected');

  // Also sync selection in the tree if we invoked from a breadcrumb or kebab
  const tree = document.getElementById('folderTreeContainer');
  if (tree) {
    const inTree = tree.querySelector(`.folder-option[data-folder="${CSS.escape(folder)}"]`);
    if (inTree) inTree.classList.add('selected');
  }

  // Show the kebab only for this selected folder
  updateFolderActionButtons();

  const canColor = !!(window.currentFolderCaps && window.currentFolderCaps.canEdit);
  const enc = (window.currentFolderCaps && window.currentFolderCaps.encryption) ? window.currentFolderCaps.encryption : {};
  const canEncrypt = !!enc.canEncrypt;
  const canDecrypt = !!enc.canDecrypt;
  const canShareFolder = !!window.currentFolderCaps?.canShareFolder;

  const menuItems = [
    {
      label: t('create_folder'),
      action: () => {
        const modal = document.getElementById('createFolderModal');
        const input = document.getElementById('newFolderName');
        if (modal) modal.style.display = 'block';
        if (input) input.focus();
      }
    },
    { label: t('move_folder'),   action: () => openMoveFolderUI(folder, 'move') },
    { label: t('copy_folder'),   action: () => openMoveFolderUI(folder, 'copy') },
    { label: t('rename_folder'), action: () => { startInlineRenameInTree(folder); } },
    ...(canColor ? [{ label: t('color_folder'), action: () => openColorFolderModal(folder) }] : []),
    ...(canEncrypt ? [{ label: 'Encrypt folder', icon: 'lock', action: () => startFolderCryptoJobFlow(folder, 'encrypt') }] : []),
    ...(canDecrypt ? [{ label: 'Decrypt folder', icon: 'lock_open', action: () => startFolderCryptoJobFlow(folder, 'decrypt') }] : []),
    ...(canShareFolder ? [{ label: t('folder_share'),  action: () => openFolderShareModal(folder) }] : []),
    { label: t('delete_folder'), action: () => openDeleteFolderModal()  },
  ];

  showFolderManagerContextMenu(clientX, clientY, menuItems);
}

async function setFolderEncryption(folder, encrypted) {
  try {
    const resp = await fetchWithCsrf('/api/folder/setFolderEncryption.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder, encrypted: !!encrypted })
    });
    const data = await safeJson(resp);

    if (!data || data.ok !== true) {
      showToast((data && (data.error || data.message)) || t('folder_encryption_update_failed'), 'error');
      return;
    }

    // Update local UI for this folder + any rendered descendants
    const esc = CSS.escape(folder);
    const sel = `.folder-option[data-folder="${esc}"], .folder-option[data-folder^="${esc}/"]`;
    document.querySelectorAll(sel).forEach(opt => {
      opt.classList.toggle('encrypted', !!encrypted);
      const iconEl = opt.querySelector('.folder-icon');
      if (iconEl) {
        const kind = iconEl?.dataset?.kind || 'empty';
        // nosemgrep: javascript.browser.security.dom-xss.innerhtml
        iconEl.innerHTML = folderSVG(kind, { locked: opt.classList.contains('locked'), encrypted: opt.classList.contains('encrypted') });
      }
    });

    invalidateFolderCaches(folder);
    await applyFolderCapabilities(folder);
    showToast(encrypted ? t('folder_encryption_enabled') : t('folder_encryption_disabled'), 'success');
  } catch (e) {
    console.error('setFolderEncryption failed', e);
    showToast((e && e.message) ? e.message : t('folder_encryption_update_failed'), 'error');
  }
}

/* ----------------------
   Encryption v2: confirm + progress UI (minimizable)
----------------------*/
const CRYPTO_JOB_STORAGE_KEY = 'frCryptoJob';
let __cryptoRunner = null;
let __cryptoUiReady = false;

function formatBytes(n) {
  const num = Number(n || 0);
  if (!Number.isFinite(num) || num <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = num;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  const dp = (i === 0) ? 0 : (i === 1 ? 0 : 1);
  return `${v.toFixed(dp)} ${units[i]}`;
}

function setEncryptedClassForRenderedSubtree(folder, encrypted) {
  try {
    const esc = CSS.escape(folder);
    const sel = `.folder-option[data-folder="${esc}"], .folder-option[data-folder^="${esc}/"]`;
    document.querySelectorAll(sel).forEach(opt => {
      opt.classList.toggle('encrypted', !!encrypted);
      const iconEl = opt.querySelector('.folder-icon');
      if (iconEl) {
        const kind = iconEl?.dataset?.kind || 'empty';
        // nosemgrep: javascript.browser.security.dom-xss.innerhtml
        iconEl.innerHTML = folderSVG(kind, { locked: opt.classList.contains('locked'), encrypted: opt.classList.contains('encrypted') });
      }
    });
  } catch (e) { }
}

function ensureCryptoJobUi() {
  if (__cryptoUiReady) return;
  __cryptoUiReady = true;

  if (!document.getElementById('frCryptoJobModal')) {
    const modal = document.createElement('div');
    modal.id = 'frCryptoJobModal';
    modal.className = 'fr-crypto-job-modal';
    modal.style.display = 'none';
    modal.innerHTML = `
      <div class="fr-crypto-job-card" role="dialog" aria-modal="true" aria-label="Folder encryption progress">
        <div class="fr-crypto-job-head">
          <div class="fr-crypto-job-title" id="frCryptoJobTitle">Working…</div>
          <div class="fr-crypto-job-actions">
            <button type="button" class="btn btn-sm btn-outline-secondary" id="frCryptoJobMinBtn">Minimize</button>
          </div>
        </div>
        <div class="fr-crypto-job-body">
          <div class="fr-crypto-job-sub" id="frCryptoJobSub"></div>
          <div class="fr-crypto-job-bar">
            <div class="fr-crypto-job-bar-fill" id="frCryptoJobBarFill" style="width:0%"></div>
          </div>
          <div class="fr-crypto-job-metrics" id="frCryptoJobMetrics"></div>
          <div class="fr-crypto-job-error" id="frCryptoJobError" style="display:none"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  if (!document.getElementById('frCryptoJobPill')) {
    const pill = document.createElement('div');
    pill.id = 'frCryptoJobPill';
    pill.className = 'fr-crypto-job-pill';
    pill.style.display = 'none';
    pill.innerHTML = `
      <button type="button" class="fr-crypto-job-pill-btn" id="frCryptoJobPillBtn">
        <span class="fr-crypto-job-pill-title" id="frCryptoJobPillTitle">Working…</span>
        <span class="fr-crypto-job-pill-pct" id="frCryptoJobPillPct">0%</span>
      </button>
    `;
    document.body.appendChild(pill);
  }

  document.getElementById('frCryptoJobMinBtn')?.addEventListener('click', () => {
    setCryptoUiMinimized(true);
  });
  document.getElementById('frCryptoJobPillBtn')?.addEventListener('click', () => {
    setCryptoUiMinimized(false);
  });
}

function setCryptoUiMinimized(min) {
  ensureCryptoJobUi();
  const modal = document.getElementById('frCryptoJobModal');
  const pill = document.getElementById('frCryptoJobPill');
  if (modal) modal.style.display = min ? 'none' : 'flex';
  if (pill) pill.style.display = min ? 'block' : 'none';
  try {
    const cur = JSON.parse(localStorage.getItem(CRYPTO_JOB_STORAGE_KEY) || 'null');
    if (cur && typeof cur === 'object') {
      cur.minimized = !!min;
      localStorage.setItem(CRYPTO_JOB_STORAGE_KEY, JSON.stringify(cur));
    }
  } catch (e) { }
}

function renderCryptoJobUi({ folder, mode, job }) {
  ensureCryptoJobUi();
  const titleEl = document.getElementById('frCryptoJobTitle');
  const subEl = document.getElementById('frCryptoJobSub');
  const barFill = document.getElementById('frCryptoJobBarFill');
  const metrics = document.getElementById('frCryptoJobMetrics');
  const errEl = document.getElementById('frCryptoJobError');
  const pillTitle = document.getElementById('frCryptoJobPillTitle');
  const pillPct = document.getElementById('frCryptoJobPillPct');

  const act = (mode === 'decrypt') ? 'Decrypting' : 'Encrypting';
  const folderLabel = folder || (job && job.folder) || 'root';
  const totalFiles = Number(job?.totalFiles || 0);
  const totalBytes = Number(job?.totalBytes || 0);
  const doneFiles = Number(job?.doneFiles || 0);
  const doneBytes = Number(job?.doneBytes || 0);

  const pct = totalFiles > 0
    ? Math.min(100, Math.round((doneFiles / totalFiles) * 100))
    : (totalBytes > 0 ? Math.min(100, Math.round((doneBytes / totalBytes) * 100)) : 0);

  if (titleEl) titleEl.textContent = `${act} ${folderLabel}`;
  if (subEl) subEl.textContent = (job?.state === 'running')
    ? 'Running in the background. You can keep using FileRise.'
    : (job?.state === 'done' ? 'Complete.' : '');

  if (barFill) barFill.style.width = `${pct}%`;
  if (metrics) {
    const fPart = totalFiles > 0 ? `${doneFiles}/${totalFiles} files` : `${doneFiles} files`;
    const bPart = totalBytes > 0 ? `${formatBytes(doneBytes)} / ${formatBytes(totalBytes)}` : `${formatBytes(doneBytes)}`;
    metrics.textContent = `${fPart} • ${bPart}`;
  }

  if (pillTitle) pillTitle.textContent = act;
  if (pillPct) pillPct.textContent = `${pct}%`;

  if (errEl) {
    const err = job?.error ? String(job.error) : '';
    errEl.style.display = err ? 'block' : 'none';
    errEl.textContent = err;
  }
}

async function startCryptoRunner({ jobId, folder, mode, minimized }) {
  if (__cryptoRunner) {
    clearTimeout(__cryptoRunner);
    __cryptoRunner = null;
  }

  ensureCryptoJobUi();
  const modal = document.getElementById('frCryptoJobModal');
  if (modal) modal.style.display = minimized ? 'none' : 'flex';
  setCryptoUiMinimized(!!minimized);

  const tickOnce = async () => {
    const resp = await fetchWithCsrf(withBase('/api/folder/encryptionJobTick.php'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, maxFiles: 1 })
    });
    return safeJson(resp);
  };

  const statusOnce = async () => {
    const resp = await fetch(withBase(`/api/folder/encryptionJobStatus.php?jobId=${encodeURIComponent(jobId)}`), { credentials: 'include' });
    return safeJson(resp);
  };

  const loop = async () => {
    try {
      const st = await statusOnce();
      const job = st?.job || null;
      renderCryptoJobUi({ folder, mode, job });

      if (!job || job.state === 'done') {
        finalizeCryptoJobUi({ folder, mode, jobId, ok: true });
        return;
      }
      if (job.state === 'error') {
        finalizeCryptoJobUi({ folder, mode, jobId, ok: false, error: job.error });
        return;
      }

      const tk = await tickOnce();
      const job2 = tk?.job || job;
      renderCryptoJobUi({ folder, mode, job: job2 });

      if (job2?.state === 'done') {
        finalizeCryptoJobUi({ folder, mode, jobId, ok: true });
        return;
      }
      if (job2?.state === 'error') {
        finalizeCryptoJobUi({ folder, mode, jobId, ok: false, error: job2.error });
        return;
      }
    } catch (e) {
      // transient errors: retry with backoff
      console.error('crypto job loop error', e);
      const status = Number(e?.status || 0);
      if (status === 401 || status === 403 || status === 404) {
        finalizeCryptoJobUi({ folder, mode, jobId, ok: false, error: e?.message || 'Crypto job failed.' });
        return;
      }
    }

    __cryptoRunner = setTimeout(loop, 700);
  };

  loop();
}

function finalizeCryptoJobUi({ folder, mode, jobId, ok, error }) {
  try { localStorage.removeItem(CRYPTO_JOB_STORAGE_KEY); } catch (e) { }
  if (__cryptoRunner) {
    clearTimeout(__cryptoRunner);
    __cryptoRunner = null;
  }

  // Update folder tree visuals best-effort
  if (mode === 'decrypt' && ok) {
    setEncryptedClassForRenderedSubtree(folder, false);
  } else if (mode === 'encrypt' && ok) {
    setEncryptedClassForRenderedSubtree(folder, true);
  }

  try { invalidateFolderCaches(folder); } catch (e) { }
  try { refreshFolderIcon(folder); } catch (e) { }
  try { applyFolderCapabilities(folder); } catch (e) { }
  // If the current view is showing the affected folder (or its parent), refresh the list so
  // folder-row icons/capability-driven toolbar state update immediately.
  if (ok) {
    try {
      const cur = window.currentFolder || 'root';
      const parent = getParentFolder(folder || 'root');
      if (cur === (folder || 'root') || cur === parent) {
        loadFileList(cur);
      }
    } catch (e) { /* ignore */ }
  }

  // Hide UI
  const modal = document.getElementById('frCryptoJobModal');
  const pill = document.getElementById('frCryptoJobPill');
  if (modal) modal.style.display = 'none';
  if (pill) pill.style.display = 'none';

  if (ok) {
    showToast(mode === 'decrypt' ? t('folder_decryption_completed') : t('folder_encryption_completed'), 'success');
  } else {
    if (error) {
      showToast(t('folder_crypto_failed_detail', { error }), 'error');
    } else {
      showToast(t('folder_crypto_failed'), 'error');
    }
  }
}

export async function startFolderCryptoJobFlow(folder, mode) {
  try {
    const planUrl = withBase(`/api/folder/encryptionPlan.php?folder=${encodeURIComponent(folder)}&mode=${encodeURIComponent(mode)}`);
    const planRes = await fetch(planUrl, { credentials: 'include' });
    const plan = await safeJson(planRes);
    if (!plan || plan.ok !== true) {
      showToast((plan && (plan.error || plan.message)) || t('folder_encryption_estimate_failed'), 'error');
      return;
    }

    const totalFiles = Number(plan.totalFiles || 0);
    const totalBytes = Number(plan.totalBytes || 0);
    const truncated = !!plan.truncated;

    const label = mode === 'decrypt' ? 'decrypt' : 'encrypt';
    const msg =
      `Are you sure you want to ${label} "${folder}"?\n\n` +
      `This will process ${totalFiles} file(s) (~${formatBytes(totalBytes)}).` +
      (truncated ? `\n\nNote: estimate was truncated for very large trees.` : '') +
      `\n\nThis may take a while. A progress window will appear and can be minimized while you continue using FileRise.`;

    const ok = await showCustomConfirmModal(msg);
    if (!ok) return;

    const startRes = await fetchWithCsrf(withBase('/api/folder/encryptionJobStart.php'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder, mode, totalFiles, totalBytes })
    });
    let start = null;
    if (startRes.ok) {
      start = await safeJson(startRes);
    } else {
      // If a job is already running, reconnect to it.
      const body = await startRes.json().catch(() => ({}));
      if (startRes.status === 409 && body && body.job && body.job.id) {
        start = { ok: true, jobId: body.job.id, folder, mode };
      } else {
        const msg = (body && (body.error || body.message)) || `HTTP ${startRes.status}`;
        showToast(msg, 'error');
        return;
      }
    }

    // Update local UI immediately
    if (mode === 'encrypt') setEncryptedClassForRenderedSubtree(folder, true);
    try { await applyFolderCapabilities(folder); } catch (e) { }

    const st = { jobId: start.jobId, folder, mode, minimized: false };
    try { localStorage.setItem(CRYPTO_JOB_STORAGE_KEY, JSON.stringify(st)); } catch (e) { }

    renderCryptoJobUi({
      folder,
      mode,
      job: { state: 'running', totalFiles, totalBytes, doneFiles: 0, doneBytes: 0 }
    });

    await startCryptoRunner(st);
  } catch (e) {
    console.error('startFolderCryptoJobFlow error', e);
    showToast((e && e.message) ? e.message : t('folder_encryption_start_failed'), 'error');
  }
}

function resumeCryptoJobUiFromStorage() {
  try {
    const raw = localStorage.getItem(CRYPTO_JOB_STORAGE_KEY);
    if (!raw) return;
    const st = JSON.parse(raw);
    if (!st || typeof st !== 'object' || !st.jobId) return;
    startCryptoRunner(st);
  } catch (e) { }
}

document.addEventListener('DOMContentLoaded', () => {
  // best-effort resume
  resumeCryptoJobUiFromStorage();
});

async function folderManagerContextMenuHandler(e) {
  const target = e.target.closest('.folder-option, .breadcrumb-link');
  if (!target) return;
  e.preventDefault();
  e.stopPropagation();

  // Defensive: some browsers can blank unrelated inline SVGs when a context menu opens.
  // Kick a best-effort repair immediately (before any async awaits) and let the menu helper
  // schedule additional passes after paint.
  try {
    queueMicrotask(() => { try { repairBlankFolderIcons({ force: true }); } catch (e) {} });
  } catch (e) { /* ignore */ }

  // Toggle-only for locked nodes (no menu)
  if (target.classList && target.classList.contains('locked')) {
    const folder = target.getAttribute('data-folder') || '';
    const ul = getULForFolder(folder);
    if (ul) {
      const willExpand = !ul.classList.contains('expanded');
      ul.classList.toggle('expanded', willExpand);
      ul.classList.toggle('collapsed', !willExpand);
      const li = target.closest('li[role="treeitem"]');
      if (li) li.setAttribute('aria-expanded', String(willExpand));
      const st = loadFolderTreeState(); st[folder] = willExpand ? 'block' : 'none'; saveFolderTreeState(st);
      if (willExpand) ensureChildrenLoaded(folder, ul);
    }
    return;
  }

  const folder = target.getAttribute('data-folder');
  if (!folder) return;

  const x = e.clientX;
  const y = e.clientY;

  if (folder === 'recycle_bin') {
    const menuItems = [
      {
        label: t('empty_recycle_bin') || 'Empty Recycle Bin',
        icon: 'delete_forever',
        action: () => {
          if (typeof window.confirmEmptyRecycleBin === 'function') {
            window.confirmEmptyRecycleBin();
            return;
          }
          const btn = document.getElementById('deleteAllBtn');
          if (btn) { btn.click(); return; }
          showToast(t('recycle_bin_empty_unavailable'), 'warning');
        }
      }
    ];
    showFolderManagerContextMenu(x, y, menuItems);
    return;
  }

  await openFolderActionsMenu(folder, target, x, y);
}

function bindFolderManagerContextMenu() {
  const tree = document.getElementById('folderTreeContainer');
  if (tree) {
    if (tree._ctxHandler) tree.removeEventListener('contextmenu', tree._ctxHandler, false);
    tree._ctxHandler = (e) => {
      const onOption = e.target.closest('.folder-option');
      if (!onOption) return;
      folderManagerContextMenuHandler(e);
    };
    tree.addEventListener('contextmenu', tree._ctxHandler, false);
  }

  const title = document.getElementById('fileListTitle');
  if (title) {
    if (title._ctxHandler) title.removeEventListener('contextmenu', title._ctxHandler, false);
    title._ctxHandler = (e) => {
      const onCrumb = e.target.closest('.breadcrumb-link');
      if (!onCrumb) return;
      folderManagerContextMenuHandler(e);
    };
    title.addEventListener('contextmenu', title._ctxHandler, false);
  }
}

// document.addEventListener("click", hideFolderManagerContextMenu); // not needed anymore; handled above

/* ----------------------
   Rename / Delete / Create hooks
----------------------*/
export async function renameFolderInline(oldFolder, newBaseName, opts = {}) {
  const selectedFolder = oldFolder || window.currentFolder || "root";
  if (!selectedFolder || selectedFolder === "root") {
    if (!opts.silent) showToast(t('select_folder_rename'), 'warning');
    return { success: false, error: "invalid_folder" };
  }

  const newNameBasename = String(newBaseName || "").trim();
  const currentBase = selectedFolder.split("/").pop() || "";
  if (!newNameBasename || newNameBasename === currentBase) {
    if (!opts.silent) showToast(t('enter_new_folder_name'), 'warning');
    return { success: false, error: "invalid_name" };
  }

  const parentPath = getParentFolder(selectedFolder);
  const newFolderFull = parentPath === "root" ? newNameBasename : parentPath + "/" + newNameBasename;

  try {
    const res = await fetchWithCsrf("/api/folder/renameFolder.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ oldFolder: selectedFolder, newFolder: newFolderFull })
    });
    const data = await safeJson(res);
    if (!data.success) {
      const msg = data.error || t('rename_folder_error_default');
      if (!opts.silent) showToast(t('rename_folder_error', { error: msg }), 'error');
      return { success: false, error: msg };
    }

    if (!opts.silent) showToast(t('rename_folder_success'), 'success');

    const oldPath = selectedFolder;
    const newPath = newFolderFull;

    // carry color on rename as well
    await carryFolderColor(oldPath, newPath);

    // migrate expansion state like move and keep parent open
    migrateExpansionStateOnMove(oldPath, newPath, [parentPath]);

    // refresh parent list incrementally (preserves other branches)
    invalidateFolderCaches(parentPath);
    clearPeekCache([parentPath, oldPath, newPath]);
    const ul = getULForFolder(parentPath);
    if (ul) { ul._renderedOnce = false; ul.innerHTML = ""; await ensureChildrenLoaded(parentPath, ul); }
    if (parentPath === 'root') placeRecycleBinNode();

    // restore any open nodes we had saved
    await expandAndLoadSavedState();

    // update currentFolder if we renamed the open folder or its descendants
    let currentUpdated = false;
    if (window.currentFolder === oldPath) {
      window.currentFolder = newPath;
      currentUpdated = true;
    } else if (window.currentFolder && window.currentFolder.startsWith(oldPath + '/')) {
      const suffix = window.currentFolder.slice(oldPath.length);
      window.currentFolder = newPath + suffix;
      currentUpdated = true;
    }
    if (currentUpdated) {
      setLastOpenedFolder(window.currentFolder || newPath);
    }

    const selectAfter = opts.selectAfter !== false;
    if (selectAfter) {
      selectFolder(window.currentFolder || newPath);
    } else {
      try { syncFolderTreeSelection(window.currentFolder); } catch (e) { /* ignore */ }
      refreshFolderIcon(parentPath);
      refreshFolderIcon(newPath);
    }

    return { success: true, newPath };
  } catch (err) {
    console.error("Error renaming folder:", err);
    if (!opts.silent) {
      const errMsg = err && err.message ? err.message : t('rename_folder_error_default');
      showToast(t('rename_folder_error', { error: errMsg }), 'error');
    }
    return { success: false, error: err && err.message ? err.message : "rename_failed" };
  }
}

let inlineTreeRenameState = null;

function clearInlineTreeRenameState({ restore = true } = {}) {
  const state = inlineTreeRenameState;
  if (!state) return;

  inlineTreeRenameState = null;

  try {
    if (state.input && state.input.parentNode) {
      state.input.parentNode.removeChild(state.input);
    }
  } catch (e) { /* ignore */ }

  if (restore && state.labelEl) {
    state.labelEl.style.display = '';
    state.labelEl.textContent = state.originalName;
  }

  if (state.optEl) {
    state.optEl.classList.remove('inline-rename-active');
  }
}

function focusTreeRenameInput(input) {
  try {
    input.focus();
    input.select();
  } catch (e) { /* ignore */ }
}

export async function startInlineRenameInTree(folderPath, targetOpt) {
  const selectedFolder = folderPath || window.currentFolder || 'root';
  if (!selectedFolder || selectedFolder === 'root') {
    showToast(t('select_folder_rename'), 'warning');
    return false;
  }

  clearInlineTreeRenameState();

  let opt = targetOpt || null;
  if (!opt) {
    try {
      opt = document.querySelector(`.folder-option[data-folder="${CSS.escape(selectedFolder)}"]`);
    } catch (e) {
      opt = null;
    }
  }

  if (!opt) {
    try {
      await expandTreePathAsync(selectedFolder, { force: true, includeLeaf: true, persist: true });
      opt = document.querySelector(`.folder-option[data-folder="${CSS.escape(selectedFolder)}"]`);
    } catch (e) {
      opt = null;
    }
  }

  if (!opt) {
    showToast(t('select_folder_rename'), 'warning');
    return false;
  }

  if (opt.classList.contains('locked')) {
    showToast(t('no_access') || "You do not have access to this resource.", 'error');
    return false;
  }

  const labelEl = opt.querySelector('.folder-label');
  if (!labelEl) return false;

  const oldName = labelEl.textContent || (String(selectedFolder).split('/').pop() || '');

  const input = document.createElement('input');
  input.type = 'text';
  input.value = oldName;
  input.className = 'inline-rename-input form-control';
  input.setAttribute('aria-label', t('rename_folder') || 'Rename folder');
  input.style.width = '100%';
  input.style.maxWidth = '100%';
  input.style.fontSize = 'inherit';
  input.style.padding = '2px 6px';
  input.style.height = 'auto';
  input.style.boxSizing = 'border-box';

  labelEl.style.display = 'none';
  opt.insertBefore(input, labelEl);

  const state = {
    folderPath: selectedFolder,
    input,
    labelEl,
    originalName: oldName,
    optEl: opt,
    submitting: false
  };
  inlineTreeRenameState = state;
  opt.classList.add('inline-rename-active');

  const commit = async () => {
    if (!inlineTreeRenameState || inlineTreeRenameState !== state || state.submitting) return;
    const newName = String(input.value || '').trim();
    if (!newName || newName === oldName) {
      clearInlineTreeRenameState();
      return;
    }

    state.submitting = true;
    input.disabled = true;

    try {
      const result = await renameFolderInline(selectedFolder, newName);
      if (result && result.success) {
        clearInlineTreeRenameState({ restore: false });
        return;
      }
    } catch (e) {
      console.error('Error renaming folder:', e);
    }

    if (inlineTreeRenameState === state) {
      state.submitting = false;
      input.disabled = false;
      focusTreeRenameInput(input);
    }
  };

  const cancel = () => {
    clearInlineTreeRenameState();
  };

  const stop = (e) => { e.stopPropagation(); };
  input.addEventListener('mousedown', stop);
  input.addEventListener('click', stop);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  });
  input.addEventListener('blur', () => {
    if (inlineTreeRenameState === state && !state.submitting) {
      commit();
    }
  });

  requestAnimationFrame(() => {
    focusTreeRenameInput(input);
  });

  return true;
}

export function openRenameFolderModal() {
  detachFolderModalsToBody();
  const selectedFolder = window.currentFolder || "root";
  if (!selectedFolder || selectedFolder === "root") { showToast(t('select_folder_rename'), 'warning'); return; }
  const parts = selectedFolder.split("/");
  const input = document.getElementById("newRenameFolderName");
  const modal = document.getElementById("renameFolderModal");
  if (!input || !modal) return;
  input.value = parts[parts.length - 1];
  modal.style.display = "block";
  setTimeout(() => { input.focus(); input.select(); }, 100);
}
const cancelRename = document.getElementById("cancelRenameFolder");
if (cancelRename) cancelRename.addEventListener("click", function () {
  const modal = document.getElementById("renameFolderModal");
  const input = document.getElementById("newRenameFolderName");
  if (modal) modal.style.display = "none";
  if (input) input.value = "";
});
attachEnterKeyListener("renameFolderModal", "submitRenameFolder");
const submitRename = document.getElementById("submitRenameFolder");
if (submitRename) submitRename.addEventListener("click", function (event) {
  event.preventDefault();
  const selectedFolder = window.currentFolder || "root";
  const input = document.getElementById("newRenameFolderName");
  if (!input) return;
  const newNameBasename = input.value.trim();
  if (!newNameBasename || newNameBasename === selectedFolder.split("/").pop()) {
    showToast(t('enter_new_folder_name'), 'warning'); return;
  }
  const parentPath = getParentFolder(selectedFolder);
  const newFolderFull = parentPath === "root" ? newNameBasename : parentPath + "/" + newNameBasename;
  fetchWithCsrf("/api/folder/renameFolder.php", {
    method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
    body: JSON.stringify({ oldFolder: window.currentFolder, newFolder: newFolderFull })
  }).then(safeJson).then(async data => {
    if (data.success) {
      showToast(t('rename_folder_success'), 'success');
      const oldPath = selectedFolder;
      window.currentFolder = newFolderFull;
      setLastOpenedFolder(newFolderFull);

      // carry color on rename as well
      await carryFolderColor(oldPath, newFolderFull);

      // migrate expansion state like move and keep parent open
      migrateExpansionStateOnMove(oldPath, newFolderFull, [parentPath]);

      // refresh parent list incrementally (preserves other branches)
      const parent = parentPath;
      invalidateFolderCaches(parent);
      clearPeekCache([parent, oldPath, newFolderFull]);
      const ul = getULForFolder(parent);
      if (ul) { ul._renderedOnce = false; ul.innerHTML = ""; await ensureChildrenLoaded(parent, ul); }
      if (parent === 'root') placeRecycleBinNode();

      // restore any open nodes we had saved
      await expandAndLoadSavedState();

      // re-select the renamed node
      selectFolder(newFolderFull);
    } else {
      const errMsg = data.error || t('rename_folder_error_default');
      showToast(t('rename_folder_error', { error: errMsg }), 'error');
    }
  }).catch(err => console.error("Error renaming folder:", err)).finally(() => {
    const modal = document.getElementById("renameFolderModal");
    const input2 = document.getElementById("newRenameFolderName");
    if (modal) modal.style.display = "none";
    if (input2) input2.value = "";
  });
});

export function openDeleteFolderModal() {
  detachFolderModalsToBody();
  const selectedFolder = window.currentFolder || "root";
  if (!selectedFolder || selectedFolder === "root") { showToast(t('select_folder_delete'), 'warning'); return; }
  const msgEl = document.getElementById("deleteFolderMessage");
  const modal = document.getElementById("deleteFolderModal");
  if (!msgEl || !modal) return;
  msgEl.textContent = "Are you sure you want to delete folder " + selectedFolder + "?";
  modal.style.display = "block";
}
const cancelDelete = document.getElementById("cancelDeleteFolder");
if (cancelDelete) cancelDelete.addEventListener("click", function () {
  const modal = document.getElementById("deleteFolderModal");
  if (modal) modal.style.display = "none";
});
attachEnterKeyListener("deleteFolderModal", "confirmDeleteFolder");
const confirmDelete = document.getElementById("confirmDeleteFolder");
if (confirmDelete) confirmDelete.addEventListener("click", async function () {
  const selectedFolder = window.currentFolder || "root";
  if (confirmDelete.dataset.busy === "1") return;
  confirmDelete.dataset.busy = "1";
  const cancelBtn = document.getElementById("cancelDeleteFolder");
  const msgEl = document.getElementById("deleteFolderMessage");
  const setDeletingState = (busy) => {
    if (busy) {
      confirmDelete.dataset.originalLabel = confirmDelete.innerHTML;
      confirmDelete.innerHTML =
        '<span class="material-icons spinning" style="font-size:16px; vertical-align:middle; margin-right:6px;">autorenew</span>Deleting...';
      confirmDelete.disabled = true;
      if (cancelBtn) cancelBtn.disabled = true;
      if (msgEl) {
        msgEl.dataset.originalText = msgEl.textContent || "";
        msgEl.textContent = "Deleting...";
      }
      return;
    }
    confirmDelete.innerHTML = confirmDelete.dataset.originalLabel || confirmDelete.innerHTML;
    confirmDelete.disabled = false;
    if (cancelBtn) cancelBtn.disabled = false;
    if (msgEl && msgEl.dataset.originalText) {
      msgEl.textContent = msgEl.dataset.originalText;
      delete msgEl.dataset.originalText;
    }
    delete confirmDelete.dataset.originalLabel;
  };
  setDeletingState(true);
  const slowTimer = setTimeout(() => {
    showToast(`Deleting folder ${selectedFolder}...`, 'info');
  }, 2500);
  fetchWithCsrf("/api/folder/deleteFolder.php", {
    method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
    body: JSON.stringify({ folder: selectedFolder })
  }).then(safeJson).then(async data => {
    if (data.success) {
      showToast(t('delete_folder_success'), 'success');
      const parent = getParentFolder(selectedFolder);
      window.currentFolder = parent;
      setLastOpenedFolder(parent);
      const sourceId = getActiveSourceId();
      const sourceType = String(getSourceTypeById(sourceId || '') || '').toLowerCase();
      const isRemote = !!sourceId && sourceType !== 'local';
      if (isRemote) {
        resetFolderTreeCaches();
        await loadFolderTree(parent);
        return;
      }
      invalidateFolderCaches(parent);
      clearPeekCache([parent, selectedFolder]);
      const ul = getULForFolder(parent);
      if (ul) { ul._renderedOnce = false; ul.innerHTML = ""; await ensureChildrenLoaded(parent, ul); }
      if (parent === 'root') placeRecycleBinNode();
      selectFolder(parent);
    } else {
      const errMsg = data.error || t('delete_folder_error_default');
      showToast(t('delete_folder_error', { error: errMsg }), 'error');
    }
  }).catch(err => console.error("Error deleting folder:", err)).finally(() => {
    clearTimeout(slowTimer);
    setDeletingState(false);
    delete confirmDelete.dataset.busy;
    const modal = document.getElementById("deleteFolderModal");
    if (modal) modal.style.display = "none";
  });
});

const createBtn = document.getElementById("createFolderBtn");
if (createBtn) createBtn.addEventListener("click", function () {
  detachFolderModalsToBody();
  const modal = document.getElementById("createFolderModal");
  const input = document.getElementById("newFolderName");
  if (modal) modal.style.display = "block";
  if (input) input.focus();
});
const cancelCreate = document.getElementById("cancelCreateFolder");
if (cancelCreate) cancelCreate.addEventListener("click", function () {
  const modal = document.getElementById("createFolderModal");
  const input = document.getElementById("newFolderName");
  if (modal) modal.style.display = "none";
  if (input) input.value = "";
});
attachEnterKeyListener("createFolderModal", "submitCreateFolder");
const submitCreate = document.getElementById("submitCreateFolder");
if (submitCreate) submitCreate.addEventListener("click", async () => {
  if (submitCreate.dataset.busy === "1") return;
  const cancelBtn = document.getElementById("cancelCreateFolder");
  const setCreatingState = (busy) => {
    if (busy) {
      if (!submitCreate.dataset.originalLabel) {
        submitCreate.dataset.originalLabel = submitCreate.innerHTML;
      }
      submitCreate.innerHTML =
        '<span class="material-icons spinning" style="font-size:16px; vertical-align:middle; margin-right:6px;">autorenew</span>Creating...';
      submitCreate.disabled = true;
      if (cancelBtn) cancelBtn.disabled = true;
      return;
    }
    if (submitCreate.dataset.originalLabel) {
      submitCreate.innerHTML = submitCreate.dataset.originalLabel;
      delete submitCreate.dataset.originalLabel;
    }
    submitCreate.disabled = false;
    if (cancelBtn) cancelBtn.disabled = false;
  };
  const input = document.getElementById("newFolderName");
  const folderInput = input ? input.value.trim() : "";
  if (!folderInput) return showToast(t('enter_folder_name_prompt'), 'warning');
  const selectedFolder = window.currentFolder || "root";
  const parent = selectedFolder === "root" ? "" : selectedFolder;

  submitCreate.dataset.busy = "1";
  setCreatingState(true);

  try { await loadCsrfToken(); } catch (e) {
    delete submitCreate.dataset.busy;
    setCreatingState(false);
    return showToast(t('csrf_refresh_failed'), 'error');
  }

  fetchWithCsrf("/api/folder/createFolder.php", {
    method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
    body: JSON.stringify({ folderName: folderInput, parent })
  }).then(safeJson).then(async data => {
    if (!data.success) throw new Error(data.error || "Server rejected the request");
    showToast(t('create_folder_success'), 'success');
    const parentFolder = parent || 'root';
    const parentUL = getULForFolder(parentFolder);
    const full = parent ? `${parent}/${folderInput}` : folderInput;

    if (parentUL) {
      const li = makeChildLi(parentFolder, folderInput);
      const moreLi = parentUL.querySelector('.load-more');
      parentUL.insertBefore(li, moreLi || null);
      try { applyFolderColorToOption(full, (window.folderColorMap || {})[full] || ''); } catch (e) {}
      const opt = li.querySelector('.folder-option');
      if (opt) setFolderIconForOption(opt, 'empty');
      ensureFolderIcon(full);
      updateToggleForOption(parentFolder, true);
      invalidateFolderCaches(parentFolder);
      clearPeekCache([parentFolder, full]);
      if (parentFolder === 'root') placeRecycleBinNode();
    }

    window.currentFolder = full;
    setLastOpenedFolder(full);
    selectFolder(full);

  }).catch(e => {
    const errMsg = e && e.message ? e.message : t('unknown_error');
    showToast(t('create_folder_error', { error: errMsg }), 'error');
  }).finally(() => {
    delete submitCreate.dataset.busy;
    setCreatingState(false);
    const modal = document.getElementById("createFolderModal");
    const input2 = document.getElementById("newFolderName");
    if (modal) modal.style.display = "none";
    if (input2) input2.value = "";
  });
});

/* ----------------------
   Move (modal) + Color carry + State migration as well
----------------------*/
export function openMoveFolderUI(sourceFolder, mode = 'move') {
  detachFolderModalsToBody();
  const modal = document.getElementById('moveFolderModal');
  if (sourceFolder && sourceFolder !== 'root') window.currentFolder = sourceFolder;
  if (modal) {
    modal.dataset.mode = (mode === 'copy') ? 'copy' : 'move';
    const titleEl = modal.querySelector('h4');
    const msgEl = modal.querySelector('p');
    const confirmBtn = document.getElementById('confirmMoveFolder');
    if (titleEl) titleEl.textContent = (mode === 'copy') ? t('copy_folder_title') : t('move_folder_title');
    if (msgEl) msgEl.textContent = (mode === 'copy') ? t('copy_folder_message') : t('move_folder_message');
    if (confirmBtn) confirmBtn.textContent = (mode === 'copy') ? t('copy') : t('move');
  }
  initMoveFolderSourceSelect(sourceFolder);
  if (modal) modal.style.display = 'block';
}

document.addEventListener("DOMContentLoaded", () => {
  const moveBtn = document.getElementById('moveFolderBtn');
  const modal = document.getElementById('moveFolderModal');
  const targetSel = document.getElementById('moveFolderTarget');
  const cancelBtn = document.getElementById('cancelMoveFolder');
  const confirmBtn = document.getElementById('confirmMoveFolder');

  if (moveBtn) moveBtn.addEventListener('click', () => {
    const cf = window.currentFolder || 'root';
    if (!cf || cf === 'root') { showToast(t('select_non_root_folder_move'), 'warning'); return; }
    openMoveFolderUI(cf, 'move');
  });
  if (cancelBtn) cancelBtn.addEventListener('click', () => { if (modal) modal.style.display = 'none'; });

  if (confirmBtn) confirmBtn.addEventListener('click', async () => {
    if (!targetSel) return;
    const destination = targetSel.value;
    const source = window.currentFolder;
    const mode = (modal && modal.dataset && modal.dataset.mode === 'copy') ? 'copy' : 'move';
    const sourceId = getActiveSourceId();
    const destSourceId = document.getElementById('moveFolderTargetSource')?.value || sourceId;

    if (!destination) { showToast(t('pick_destination'), 'warning'); return; }
    const sameSource = sourceId === destSourceId;
    if (sameSource && (destination === source || (destination + '/').startsWith(source + '/'))) {
      showToast(t('invalid_destination'), 'warning'); return;
    }

    // snapshot expansion before move
    const preState = loadFolderTreeState();
    const progress = startTransferProgress({
      action: mode === 'copy' ? 'Copying' : 'Moving',
      itemCount: 1,
      itemLabel: 'folder',
      bytesKnown: false,
      indeterminate: true,
      source,
      destination
    });
    let ok = false;
    let errMsg = '';

    try {
      const res = await fetch('/api/folder/moveFolder.php', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.csrfToken },
        body: JSON.stringify({ source, destination, sourceId, destSourceId, mode })
      });
      const data = await safeJson(res);
      if (res.ok && data && !data.error) {
        ok = true;
        const base = source.split('/').pop();
        const newPath = (destination === 'root' ? '' : destination + '/') + base;

        if (mode === 'copy') {
          if (sameSource) {
            const dstParent = destination;
            invalidateFolderCaches(dstParent);
            clearPeekCache([dstParent, newPath]);
            const dstUl = getULForFolder(dstParent);
            if (dstUl) { dstUl._renderedOnce = false; dstUl.innerHTML = ""; await ensureChildrenLoaded(dstParent, dstUl); }
            updateToggleForOption(dstParent, true);
            ensureFolderIcon(dstParent);
            refreshFolderIcon(dstParent);
            if (dstParent === 'root') placeRecycleBinNode();
          }
          if (modal) modal.style.display = 'none';
          showToast(t('copy_folder_success'), 'success');
          selectFolder(window.currentFolder || source);
          return;
        }

        if (sameSource) {
          // carry color
          await carryFolderColor(source, newPath);

          // migrate expansion
          migrateExpansionStateOnMove(source, newPath, [destination, getParentFolder(destination)]);

          // refresh parents
          const srcParent = getParentFolder(source);
          const dstParent = destination;
          invalidateFolderCaches(srcParent); invalidateFolderCaches(dstParent);
          clearPeekCache([srcParent, dstParent, source, newPath]);

          const srcUl = getULForFolder(srcParent); const dstUl = getULForFolder(dstParent);
          updateToggleForOption(srcParent, !!srcUl && !!srcUl.querySelector(':scope > li.folder-item'));
          if (srcUl) { srcUl._renderedOnce = false; srcUl.innerHTML = ""; await ensureChildrenLoaded(srcParent, srcUl); }
          if (dstUl) { dstUl._renderedOnce = false; dstUl.innerHTML = ""; await ensureChildrenLoaded(dstParent, dstUl); }
          if (srcParent === 'root' || dstParent === 'root') placeRecycleBinNode();

          updateToggleForOption(dstParent, true);
          ensureFolderIcon(dstParent);
          const _srcUlLive = getULForFolder(srcParent);
          updateToggleForOption(srcParent, !!(_srcUlLive && _srcUlLive.querySelector(':scope > li.folder-item')));

          // re-apply expansions
          await expandAndLoadSavedState();

          // update currentFolder
          if (window.currentFolder === source) {
            window.currentFolder = newPath;
          } else if (window.currentFolder && window.currentFolder.startsWith(source + '/')) {
            const suffix = window.currentFolder.slice(source.length);
            window.currentFolder = newPath + suffix;
          }
          setLastOpenedFolder(window.currentFolder || newPath);

          if (modal) modal.style.display = 'none';
          refreshFolderIcon(srcParent); refreshFolderIcon(dstParent);
          showToast(t('move_folder_success'), 'success');
          selectFolder(window.currentFolder || newPath);
          return;
        }

        // cross-source move: remove from current tree, stay on parent
        const srcParent = getParentFolder(source);
        invalidateFolderCaches(srcParent);
        clearPeekCache([srcParent, source]);
        const srcUl = getULForFolder(srcParent);
        if (srcUl) { srcUl._renderedOnce = false; srcUl.innerHTML = ""; await ensureChildrenLoaded(srcParent, srcUl); }
        updateToggleForOption(srcParent, !!(srcUl && srcUl.querySelector(':scope > li.folder-item')));
        refreshFolderIcon(srcParent);
        if (srcParent === 'root') placeRecycleBinNode();

        if (window.currentFolder === source || window.currentFolder.startsWith(source + '/')) {
          window.currentFolder = srcParent;
          setLastOpenedFolder(srcParent);
        }

        if (modal) modal.style.display = 'none';
        showToast(t('move_folder_success'), 'success');
        selectFolder(window.currentFolder || srcParent);

      } else {
        ok = false;
        errMsg = data && data.error ? data.error : t('move_failed');
        showToast(t('error_prefix', { error: errMsg }), 'error');
      }
    } catch (e) {
      ok = false;
      errMsg = e && e.message ? e.message : t('move_failed');
      console.error(e);
      showToast(t('move_failed'), 'error');
    } finally {
      finishTransferProgress(progress, { ok, error: errMsg });
    }
  });
});

/* ----------------------
   Expand path helper
----------------------*/
export function expandTreePath(path, opts = {}) {
  const { force = false, persist = false, includeLeaf = false } = opts;
  const state = loadFolderTreeState();
  const parts = (path || '').split('/').filter(Boolean);
  let cumulative = '';
  const lastIndex = includeLeaf ? parts.length - 1 : Math.max(0, parts.length - 2);
  parts.forEach((part, i) => {
    cumulative = i === 0 ? part : `${cumulative}/${part}`;
    if (i > lastIndex) return;
    const option = document.querySelector(`.folder-option[data-folder="${CSS.escape(cumulative)}"]`);
    if (!option) return;
    const li = option.closest('li[role="treeitem"]');
    const nestedUl = li ? li.querySelector(':scope > ul') : null;
    if (!nestedUl) return;
    const shouldExpand = force || state[cumulative] === 'block';
    nestedUl.classList.toggle('expanded', shouldExpand);
    nestedUl.classList.toggle('collapsed', !shouldExpand);
    li.setAttribute('aria-expanded', String(!!shouldExpand));
    if (persist && shouldExpand) state[cumulative] = 'block';
  });
  if (persist) saveFolderTreeState(state);
}

// Async variant that loads children as it expands so deep paths become visible.
export async function expandTreePathAsync(path, opts = {}) {
  const { force = false, persist = false, includeLeaf = false } = opts;
  const state = loadFolderTreeState();
  const parts = (path || '').split('/').filter(Boolean);
  let cumulative = '';
  const lastIndex = includeLeaf ? parts.length - 1 : Math.max(0, parts.length - 2);

  for (let i = 0; i < parts.length; i++) {
    cumulative = i === 0 ? parts[i] : `${cumulative}/${parts[i]}`;
    if (i > lastIndex) break;
    const option = document.querySelector(`.folder-option[data-folder="${CSS.escape(cumulative)}"]`);
    if (!option) continue;
    const li = option.closest('li[role="treeitem"]');
    const nestedUl = li ? li.querySelector(':scope > ul') : null;
    if (!nestedUl) continue;
    const shouldExpand = force || state[cumulative] === 'block';
    nestedUl.classList.toggle('expanded', shouldExpand);
    nestedUl.classList.toggle('collapsed', !shouldExpand);
    li.setAttribute('aria-expanded', String(!!shouldExpand));
    if (persist && shouldExpand) state[cumulative] = 'block';
    if (shouldExpand) {
      try { await ensureChildrenLoaded(cumulative, nestedUl); } catch (e) {}
    }
  }
  if (persist) saveFolderTreeState(state);
}

/* ----------------------
   Wire toolbar buttons that were inert (rename/delete)
----------------------*/
document.addEventListener("DOMContentLoaded", () => {
  const renameBtn = document.getElementById("renameFolderBtn");
  if (renameBtn) renameBtn.addEventListener("click", () => {
    const cf = window.currentFolder || "root";
    if (!cf || cf === "root") { showToast(t('select_folder_rename'), 'warning'); return; }
    startInlineRenameInTree(cf);
  });

  const deleteBtn = document.getElementById("deleteFolderBtn");
  if (deleteBtn) deleteBtn.addEventListener("click", () => {
    const cf = window.currentFolder || "root";
    if (!cf || cf === "root") { showToast(t('select_folder_delete'), 'warning'); return; }
    openDeleteFolderModal();
  });
});

/* ----------------------
   Global key & minor binds
----------------------*/
document.addEventListener("keydown", function (e) {
  const tag = e.target.tagName ? e.target.tagName.toLowerCase() : "";
  if (tag === "input" || tag === "textarea" || (e.target && e.target.isContentEditable)) return;
  if (e.key === "Delete" || e.key === "Backspace" || e.keyCode === 46 || e.keyCode === 8) {
    if (window.currentFolder && window.currentFolder !== "root") {
      e.preventDefault();
      openDeleteFolderModal();
    }
  }
});
document.addEventListener("DOMContentLoaded", function () {
  const shareFolderBtn = document.getElementById("shareFolderBtn");
  if (shareFolderBtn) {
    shareFolderBtn.addEventListener("click", () => {
      const selectedFolder = window.currentFolder || "root";
      if (!selectedFolder || selectedFolder === "root") { showToast(t('select_folder_share'), 'warning'); return; }
      openFolderShareModal(selectedFolder);
    });
  }
  const colorFolderBtn = document.getElementById("colorFolderBtn");
  if (colorFolderBtn) {
    colorFolderBtn.addEventListener("click", () => {
      const selectedFolder = window.currentFolder || "root";
      if (!selectedFolder || selectedFolder === "root") { showToast(t('please_select_valid_folder') || "Please select a valid folder.", 'warning'); return; }
      openColorFolderModal(selectedFolder);
    });
  }
});

// Initial context menu delegation bind
bindFolderManagerContextMenu();
