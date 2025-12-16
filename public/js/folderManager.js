// public/js/folderManager.js
// Lazy folder tree with persisted expansion, root DnD, color-carry on moves, and state migration.
// Smart initial selection: if the default folder isn't viewable, pick the first accessible folder (BFS).

import { loadFileList } from './fileListView.js?v={{APP_QVER}}';
import { showToast, escapeHTML, attachEnterKeyListener } from './domUtils.js?v={{APP_QVER}}';
import { t } from './i18n.js?v={{APP_QVER}}';
import { openFolderShareModal } from './folderShareModal.js?v={{APP_QVER}}';
import { fetchWithCsrf } from './auth.js?v={{APP_QVER}}';
import { loadCsrfToken } from './appCore.js?v={{APP_QVER}}';


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
    iconEl.innerHTML = folderSVG(currentKind, { locked: !!locked });
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
  const state = localStorage.getItem("folderTreeState");
  return state ? JSON.parse(state) : {};
}
function saveFolderTreeState(state) {
  localStorage.setItem("folderTreeState", JSON.stringify(state));
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

async function getFolderCapabilities(folder) {
  if (!folder) return null;

  if (_capsCache.has(folder)) {
    return _capsCache.get(folder);
  }
  if (_capsInflight.has(folder)) {
    return _capsInflight.get(folder);
  }

  const p = (async () => {
    try {
      const res = await fetch(`/api/folder/capabilities.php?folder=${encodeURIComponent(folder)}`, { credentials: 'include' });
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
  rootSpan.textContent = 'root';
  frag.appendChild(rootSpan);

  if (path === 'root') {
    // You are in root: just "Root"
    return frag;
  }

  // Separator after Root
  let sep = document.createElement('span');
  sep.className = 'file-breadcrumb-sep';
  sep.textContent = '›';
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
      sep.textContent = '›';
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
        localStorage.setItem("lastOpenedFolder", username);
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
        localStorage.setItem("lastOpenedFolder", username);
        window.currentFolder = username;
      }
      return isFolderOnly;
    }

    window.__FR_PERMISSIONS_PROMISE = (async () => {
      const res = await fetchWithCsrf("/api/getUserPermissions.php", {
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
      localStorage.setItem("lastOpenedFolder", username);
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
const _folderCountCache = new Map();   // folderPath -> {folders, files}
const _inflightCounts   = new Map();   // folderPath -> Promise
const _nonEmptyCache    = new Map();   // folderPath -> bool
const _childCache       = new Map();   // folderPath -> {items, nextCursor}

// --- Capability cache so we don't spam /capabilities.php
const _capViewCache = new Map();
async function canViewFolderCached(folder) {
  if (_capViewCache.has(folder)) return _capViewCache.get(folder);
  const p = canViewFolder(folder).then(Boolean).catch(() => false);
  _capViewCache.set(folder, p);
  return p;
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
  const last = localStorage.getItem("lastOpenedFolder");
  if (last && await canViewFolderCached(last)) return last;

  // 2b) Ground truth from folder list API (matches getFileList 403 behavior)
  try {
    const res = await fetch('/api/folder/getFolderList.php', { credentials: 'include' });
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
    .then(r => r.ok ? r.json() : { folders: 0, files: 0 })
    .catch(() => ({ folders: 0, files: 0 }))
    .finally(() => clearTimeout(tid));
}
const MAX_CONCURRENT_COUNT_REQS = 6;
let _activeCountReqs = 0;
const _countReqQueue = [];
function _runCount(url) {
  return new Promise(resolve => {
    const start = () => {
      _activeCountReqs++;
      fetchJSONWithTimeout(url, 2500)
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
async function fetchFolderCounts(folder) {
  if (_folderCountCache.has(folder)) return _folderCountCache.get(folder);
  if (_inflightCounts.has(folder)) return _inflightCounts.get(folder);
  const url = `/api/folder/isEmpty.php?folder=${encodeURIComponent(folder)}&t=${Date.now()}`;
  const p = _runCount(url).then(data => {
    const result = { folders: Number(data?.folders || 0), files: Number(data?.files || 0) };
    _folderCountCache.set(folder, result);
    _inflightCounts.delete(folder);
    return result;
  });
  _inflightCounts.set(folder, p);
  return p;
}
function invalidateFolderCaches(folder) {
  if (!folder) return;
  _folderCountCache.delete(folder);
  _nonEmptyCache.delete(folder);
  _inflightCounts.delete(folder);
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
export function folderSVG(kind = 'empty', { locked = false } = {}) {
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

  <path class="lip-highlight" d="M3 10.5 H11.5 L13.5 8.5 H20.3"/>
</svg>`;
}
function setFolderIconForOption(optEl, kind) {
  const iconEl = optEl.querySelector('.folder-icon');
  if (!iconEl) return;
  if (optEl.dataset && optEl.dataset.folder === 'recycle_bin') return; // keep recycle icon intact
  const isLocked = optEl.classList.contains('locked');
  iconEl.dataset.kind = kind;
  iconEl.innerHTML = folderSVG(kind, { locked: isLocked });
}
export function refreshFolderIcon(folder) {
  if (folder === 'recycle_bin') return;
  invalidateFolderCaches(folder);
  ensureFolderIcon(folder);
}
function ensureFolderIcon(folder) {
  if (folder === 'recycle_bin') return; // keep custom recycle icon intact
  const opt = document.querySelector(`.folder-option[data-folder="${CSS.escape(folder)}"]`);
  if (!opt) return;

  setFolderIconForOption(opt, 'empty');

  Promise.all([
    fetchFolderCounts(folder).catch(() => ({ folders: 0, files: 0 })),
    peekHasFolders(folder).catch(() => false)
  ]).then(([cnt, hasKids]) => {
    const folders = Number(cnt?.folders || 0);
    const files   = Number(cnt?.files || 0);
    const hasAny  = (folders + files) > 0;

    setFolderIconForOption(opt, hasAny ? 'paper' : 'empty');
    updateToggleForOption(folder, !!hasKids || folders > 0);
  }).catch(() => {});
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

    Promise.all([
      fetchFolderCounts(f).catch(() => ({ folders: 0, files: 0 })),
      peekHasFolders(f).catch(() => false)
    ]).then(([cnt, hasKids]) => {
      const folders = Number(cnt?.folders || 0);
      const files   = Number(cnt?.files || 0);
      const hasAny  = (folders + files) > 0;

      try { setFolderIconForOption(opt, hasAny ? 'paper' : 'empty'); } catch (e) {}
      // IMPORTANT: chevron is true if EITHER we have subfolders (peek) OR counts say so
      try { updateToggleForOption(f, !!hasKids || folders > 0); } catch (e) {}
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
      showToast(t('folder_color_cleared'));
    } catch (err) {
      showToast(err.message || 'Error');
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
      showToast(t('folder_color_saved'));
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
      ${paperBall(7.0, 2.55, 1.85, true)}
      ${paperBall(10.0, 2.30, 1.75, true)}
      ${paperBall(12.9, 2.50, 1.95, true)}
      ${paperBall(15.6, 2.55, 1.60, true)}
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
          <rect x="5.35" y="1.20" width="13.3" height="8.20" rx="3.0"/>
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
    const k = r * 0.72;
    const d = `
      M ${cx - r} ${cy}
      C ${cx - r} ${cy - k}, ${cx - k} ${cy - r}, ${cx} ${cy - r}
      C ${cx + k} ${cy - r}, ${cx + r} ${cy - k}, ${cx + r} ${cy}
      C ${cx + r} ${cy + k}, ${cx + k} ${cy + r}, ${cx} ${cy + r}
      C ${cx - k} ${cy + r}, ${cx - r} ${cy + k}, ${cx - r} ${cy}
      Z
    `;
    return `
      <path d="${d}" fill="#f7f9ff" stroke="#c7d2e4" stroke-width="0.48"/>
      <path d="M ${cx - r*0.55} ${cy - r*0.05}
               C ${cx - r*0.15} ${cy - r*0.65}, ${cx + r*0.35} ${cy - r*0.40}, ${cx + r*0.35} ${cy - r*0.05}"
            fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="0.55" stroke-linecap="round"/>
      <path d="M ${cx - r*0.28} ${cy + r*0.15} l ${r*0.60} ${-r*0.38}"
            fill="none" stroke="#8fa7cf" stroke-opacity="0.55" stroke-width="0.50" stroke-linecap="round"/>
      <path d="M ${cx - r*0.08} ${cy + r*0.50} l ${r*0.35} ${-r*0.25}"
            fill="none" stroke="#8fa7cf" stroke-opacity="0.45" stroke-width="0.45" stroke-linecap="round"/>
      ${extra ? `
        <path d="M ${cx - r*0.55} ${cy - r*0.10} l ${r*0.38} ${r*0.28}"
              fill="none" stroke="#8fa7cf" stroke-opacity="0.50" stroke-width="0.45" stroke-linecap="round"/>
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
  opt.className = 'folder-option' + (locked ? ' locked' : '');
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
  icon.innerHTML = folderSVG('empty', { locked });

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
  localStorage.setItem('lastOpenedFolder', window.currentFolder || newPath);

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

    // prevent moving into self/descendant
    if (dropFolder === sourceFolder || (dropFolder + "/").startsWith(sourceFolder + "/")) {
      showToast("Invalid destination.", 4000);
      return;
    }

    fetchWithCsrf("/api/folder/moveFolder.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ source: sourceFolder, destination: dropFolder })
    })
      .then(safeJson)
      .then(async (data) => {
        if (data && !data.error) {
          showToast(`Folder moved to ${dropFolder}!`);
          // reuse the shared tree-sync helper so icons, chevrons, selection, and file list all match
          await syncTreeAfterFolderMove(sourceFolder, dropFolder);
        } else {
          showToast("Error: " + (data && data.error || "Could not move folder"), 5000);
        }
      })
      .catch(err => {
        console.error("Error moving folder:", err);
        showToast("Error moving folder", 5000);
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
      showToast("Invalid destination.", 4000);
      return;
    }

    fetchWithCsrf("/api/folder/moveFolder.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ source: sourceFolder, destination: dropFolder })
    })
      .then(safeJson)
      .then(async (data) => {
        if (data && !data.error) {
          showToast(`Folder moved to ${dropFolder}!`);
          await syncTreeAfterFolderMove(sourceFolder, dropFolder);
        } else {
          showToast("Error: " + (data && data.error || "Could not move folder"), 5000);
        }
      })
      .catch(err => {
        console.error("Error moving folder:", err);
        showToast("Error moving folder", 5000);
      });

    return;
  }

  // --- existing FILE(S) move branch (unchanged) ---
  // File(s) move
  const filesToMove = dragData && (dragData.files ? dragData.files : (dragData.fileName ? [dragData.fileName] : []));
  if (!filesToMove || filesToMove.length === 0) return;

  fetchWithCsrf("/api/file/moveFiles.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ source: dragData.sourceFolder, files: filesToMove, destination: dropFolder })
  }).then(safeJson).then(data => {
    if (data.success) {
      showToast(`File(s) moved successfully to ${dropFolder}!`);
      refreshFolderIcon(dragData.sourceFolder);
      refreshFolderIcon(dropFolder);
      loadFileList(dragData.sourceFolder);
    } else {
      showToast("Error moving files: " + (data.error || "Unknown error"));
    }
  }).catch(() => showToast("Error moving files."));
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
    showToast(t('no_access') || "You do not have access to this resource.");
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
  localStorage.setItem("lastOpenedFolder", selected);
  updateBreadcrumbTitle(selected);
  applyFolderCapabilities(selected);
  ensureFolderIcon(selected);
  loadFileList(selected);

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
    let effectiveLabel = "(Root)";
    if (window.userFolderOnly && username) {
      effectiveRoot = username;
      effectiveLabel = `(Root)`;
      localStorage.setItem("lastOpenedFolder", username);
      window.currentFolder = username;
    } else {
      window.currentFolder = localStorage.getItem("lastOpenedFolder") || "root";
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
        fetchFolderCounts(effectiveRoot).then(({ folders, files }) => {
          const hasAny = (folders + files) > 0;
          try { setFolderIconForOption(ro, hasAny ? 'paper' : 'empty'); } catch (e) {}
          return peekHasFolders(effectiveRoot).then(hasKids => {
            try { updateToggleForOption(effectiveRoot, !!hasKids || folders > 0); } catch (e) {}
          });
        }).catch(() => {});
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
localStorage.setItem("lastOpenedFolder", target);
selectFolder(target);
// ---------------------------------------------------------------------------
    // --------------------------------------------

  } catch (err) {
    console.error("Error loading folder tree:", err);
    if (err.status === 403) showToast("You don't have permission to view folders.");
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
    { label: t('move_folder'),   action: () => openMoveFolderUI(folder) },
    { label: t('rename_folder'), action: () => openRenameFolderModal()  },
    ...(canColor ? [{ label: t('color_folder'), action: () => openColorFolderModal(folder) }] : []),
    { label: t('folder_share'),  action: () => openFolderShareModal(folder) },
    { label: t('delete_folder'), action: () => openDeleteFolderModal()  },
  ];

  showFolderManagerContextMenu(clientX, clientY, menuItems);
}

async function folderManagerContextMenuHandler(e) {
  const target = e.target.closest('.folder-option, .breadcrumb-link');
  if (!target) return;
  e.preventDefault();
  e.stopPropagation();

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
          showToast('Empty recycle bin action is not available.');
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
export function openRenameFolderModal() {
  detachFolderModalsToBody();
  const selectedFolder = window.currentFolder || "root";
  if (!selectedFolder || selectedFolder === "root") { showToast("Please select a valid folder to rename."); return; }
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
    showToast("Please enter a valid new folder name."); return;
  }
  const parentPath = getParentFolder(selectedFolder);
  const newFolderFull = parentPath === "root" ? newNameBasename : parentPath + "/" + newNameBasename;
  fetchWithCsrf("/api/folder/renameFolder.php", {
    method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
    body: JSON.stringify({ oldFolder: window.currentFolder, newFolder: newFolderFull })
  }).then(safeJson).then(async data => {
    if (data.success) {
      showToast("Folder renamed successfully!");
      const oldPath = selectedFolder;
      window.currentFolder = newFolderFull;
      localStorage.setItem("lastOpenedFolder", newFolderFull);

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

      // restore any open nodes we had saved
      await expandAndLoadSavedState();

      // re-select the renamed node
      selectFolder(newFolderFull);
    } else {
      showToast("Error: " + (data.error || "Could not rename folder"));
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
  if (!selectedFolder || selectedFolder === "root") { showToast("Please select a valid folder to delete."); return; }
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
  fetchWithCsrf("/api/folder/deleteFolder.php", {
    method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
    body: JSON.stringify({ folder: selectedFolder })
  }).then(safeJson).then(async data => {
    if (data.success) {
      showToast("Folder deleted successfully!");
      const parent = getParentFolder(selectedFolder);
      window.currentFolder = parent;
      localStorage.setItem("lastOpenedFolder", parent);
      invalidateFolderCaches(parent);
      clearPeekCache([parent, selectedFolder]);
      const ul = getULForFolder(parent);
      if (ul) { ul._renderedOnce = false; ul.innerHTML = ""; await ensureChildrenLoaded(parent, ul); }
      selectFolder(parent);
    } else {
      showToast("Error: " + (data.error || "Could not delete folder"));
    }
  }).catch(err => console.error("Error deleting folder:", err)).finally(() => {
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
  const input = document.getElementById("newFolderName");
  const folderInput = input ? input.value.trim() : "";
  if (!folderInput) return showToast("Please enter a folder name.");
  const selectedFolder = window.currentFolder || "root";
  const parent = selectedFolder === "root" ? "" : selectedFolder;

  try { await loadCsrfToken(); } catch (e) { return showToast("Could not refresh CSRF token. Please reload."); }

  fetchWithCsrf("/api/folder/createFolder.php", {
    method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
    body: JSON.stringify({ folderName: folderInput, parent })
  }).then(safeJson).then(async data => {
    if (!data.success) throw new Error(data.error || "Server rejected the request");
    showToast("Folder created!");
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
    }

    window.currentFolder = full;
    localStorage.setItem("lastOpenedFolder", full);
    selectFolder(full);

  }).catch(e => showToast("Error creating folder: " + e.message)).finally(() => {
    const modal = document.getElementById("createFolderModal");
    const input2 = document.getElementById("newFolderName");
    if (modal) modal.style.display = "none";
    if (input2) input2.value = "";
  });
});

/* ----------------------
   Move (modal) + Color carry + State migration as well
----------------------*/
export function openMoveFolderUI(sourceFolder) {
  detachFolderModalsToBody();
  const modal = document.getElementById('moveFolderModal');
  const targetSel = document.getElementById('moveFolderTarget');
  if (sourceFolder && sourceFolder !== 'root') window.currentFolder = sourceFolder;
  if (targetSel) {
    targetSel.innerHTML = '';
    fetch('/api/folder/getFolderList.php', { credentials: 'include' }).then(r => r.json()).then(list => {
      if (Array.isArray(list) && list.length && typeof list[0] === 'object' && list[0].folder) list = list.map(it => it.folder);
      const rootOpt = document.createElement('option'); rootOpt.value = 'root'; rootOpt.textContent = '(Root)'; targetSel.appendChild(rootOpt);
      (list || []).filter(f => f && f !== 'trash' && f !== (window.currentFolder || '')).forEach(f => {
        const o = document.createElement('option'); o.value = f; o.textContent = f; targetSel.appendChild(o);
      });
    }).catch(() => {});
  }
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
    if (!cf || cf === 'root') { showToast('Select a non-root folder to move.'); return; }
    openMoveFolderUI(cf);
  });
  if (cancelBtn) cancelBtn.addEventListener('click', () => { if (modal) modal.style.display = 'none'; });

  if (confirmBtn) confirmBtn.addEventListener('click', async () => {
    if (!targetSel) return;
    const destination = targetSel.value;
    const source = window.currentFolder;

    if (!destination) { showToast('Pick a destination'); return; }
    if (destination === source || (destination + '/').startsWith(source + '/')) {
      showToast('Invalid destination'); return;
    }

    // snapshot expansion before move
    const preState = loadFolderTreeState();

    try {
      const res = await fetch('/api/folder/moveFolder.php', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.csrfToken },
        body: JSON.stringify({ source, destination })
      });
      const data = await safeJson(res);
      if (res.ok && data && !data.error) {
        const base = source.split('/').pop();
        const newPath = (destination === 'root' ? '' : destination + '/') + base;

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
        localStorage.setItem("lastOpenedFolder", window.currentFolder || newPath);

        if (modal) modal.style.display = 'none';
        refreshFolderIcon(srcParent); refreshFolderIcon(dstParent);
        showToast('Folder moved');
        selectFolder(window.currentFolder || newPath);

      } else {
        showToast('Error: ' + (data && data.error || 'Move failed'));
      }
    } catch (e) { console.error(e); showToast('Move failed'); }
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
    if (!cf || cf === "root") { showToast("Please select a valid folder to rename."); return; }
    openRenameFolderModal();
  });

  const deleteBtn = document.getElementById("deleteFolderBtn");
  if (deleteBtn) deleteBtn.addEventListener("click", () => {
    const cf = window.currentFolder || "root";
    if (!cf || cf === "root") { showToast("Please select a valid folder to delete."); return; }
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
      if (!selectedFolder || selectedFolder === "root") { showToast("Please select a valid folder to share."); return; }
      openFolderShareModal(selectedFolder);
    });
  }
  const colorFolderBtn = document.getElementById("colorFolderBtn");
  if (colorFolderBtn) {
    colorFolderBtn.addEventListener("click", () => {
      const selectedFolder = window.currentFolder || "root";
      if (!selectedFolder || selectedFolder === "root") { showToast(t('please_select_valid_folder') || "Please select a valid folder."); return; }
      openColorFolderModal(selectedFolder);
    });
  }
});

// Initial context menu delegation bind
bindFolderManagerContextMenu();
