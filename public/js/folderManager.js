// folderManager.js

import { loadFileList } from './fileListView.js?v={{APP_QVER}}';
import { showToast, escapeHTML, attachEnterKeyListener } from './domUtils.js?v={{APP_QVER}}';
import { t } from './i18n.js?v={{APP_QVER}}';
import { openFolderShareModal } from './folderShareModal.js?v={{APP_QVER}}';
import { fetchWithCsrf } from './auth.js?v={{APP_QVER}}';
import { loadCsrfToken } from './appCore.js?v={{APP_QVER}}';

/* ----------------------
   Helpers: safe JSON + state
----------------------*/

// Robust JSON reader that surfaces server errors (with status)
async function safeJson(res) {
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* ignore */ }

  if (!res.ok) {
    const msg =
      (body && (body.error || body.message)) ||
      (text && text.trim()) ||
      `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return body ?? {};
}

/* ----------------------
   Helper Functions (Data/State)
----------------------*/

// Formats a folder name for display (e.g. adding indentations).
export function formatFolderName(folder) {
  if (typeof folder !== "string") return "";
  if (folder.indexOf("/") !== -1) {
    const parts = folder.split("/");
    let indent = "";
    for (let i = 1; i < parts.length; i++) {
      indent += "\u00A0\u00A0\u00A0\u00A0"; // 4 non-breaking spaces per level
    }
    return indent + parts[parts.length - 1];
  } else {
    return folder;
  }
}

// Build a tree structure from a flat array of folder paths.
function buildFolderTree(folders) {
  const tree = {};
  folders.forEach(folderPath => {
    if (typeof folderPath !== "string") return;
    const parts = folderPath.split('/');
    let current = tree;
    parts.forEach(part => {
      if (!current[part]) current[part] = {};
      current = current[part];
    });
  });
  return tree;
}

/* ----------------------
   Folder Tree State (Save/Load)
----------------------*/
function loadFolderTreeState() {
  const state = localStorage.getItem("folderTreeState");
  return state ? JSON.parse(state) : {};
}

function saveFolderTreeState(state) {
  localStorage.setItem("folderTreeState", JSON.stringify(state));
}

// Helper for getting the parent folder.
export function getParentFolder(folder) {
  if (folder === "root") return "root";
  const lastSlash = folder.lastIndexOf("/");
  return lastSlash === -1 ? "root" : folder.substring(0, lastSlash);
}

/* ----------------------
    Breadcrumb Functions
 ----------------------*/

function setControlEnabled(el, enabled) {
  if (!el) return;
  if ('disabled' in el) el.disabled = !enabled;
  el.classList.toggle('disabled', !enabled);
  el.setAttribute('aria-disabled', String(!enabled));
  el.style.pointerEvents = enabled ? '' : 'none';
  el.style.opacity = enabled ? '' : '0.5';
}

async function applyFolderCapabilities(folder) {
  const res = await fetch(`/api/folder/capabilities.php?folder=${encodeURIComponent(folder)}`, { credentials: 'include' });
  if (!res.ok) return;
  const caps = await res.json();
  window.currentFolderCaps = caps;

  const isRoot = (folder === 'root');
  setControlEnabled(document.getElementById('createFolderBtn'), !!caps.canCreate);
  setControlEnabled(document.getElementById('moveFolderBtn'), !!caps.canMoveFolder);
  setControlEnabled(document.getElementById('renameFolderBtn'), !isRoot && !!caps.canRename);
  setControlEnabled(document.getElementById('deleteFolderBtn'), !isRoot && !!caps.canDelete);
  setControlEnabled(document.getElementById('shareFolderBtn'), !isRoot && !!caps.canShareFolder);
}

// --- Breadcrumb Delegation Setup ---
export function setupBreadcrumbDelegation() {
  const container = document.getElementById("fileListTitle");
  if (!container) {
    console.error("Breadcrumb container (fileListTitle) not found.");
    return;
  }
  // Remove any existing event listeners to avoid duplicates.
  container.removeEventListener("click", breadcrumbClickHandler);
  container.removeEventListener("dragover", breadcrumbDragOverHandler);
  container.removeEventListener("dragleave", breadcrumbDragLeaveHandler);
  container.removeEventListener("drop", breadcrumbDropHandler);

  // Attach delegated listeners
  container.addEventListener("click", breadcrumbClickHandler);
  container.addEventListener("dragover", breadcrumbDragOverHandler);
  container.addEventListener("dragleave", breadcrumbDragLeaveHandler);
  container.addEventListener("drop", breadcrumbDropHandler);
}

// Click handler via delegation
function breadcrumbClickHandler(e) {
  const link = e.target.closest(".breadcrumb-link");
  if (!link) return;

  e.stopPropagation();
  e.preventDefault();

  const folder = link.dataset.folder;
  window.currentFolder = folder;
  localStorage.setItem("lastOpenedFolder", folder);

  updateBreadcrumbTitle(folder);
  applyFolderCapabilities(folder);
  expandTreePath(folder, { persist: false, includeLeaf: false });
  document.querySelectorAll(".folder-option").forEach(el => el.classList.remove("selected"));
  const target = document.querySelector(`.folder-option[data-folder="${folder}"]`);
  if (target) target.classList.add("selected");
  applyFolderCapabilities(window.currentFolder);

  loadFileList(folder);
}

// Dragover handler via delegation
function breadcrumbDragOverHandler(e) {
  const link = e.target.closest(".breadcrumb-link");
  if (!link) return;
  e.preventDefault();
  link.classList.add("drop-hover");
}

// Dragleave handler via delegation
function breadcrumbDragLeaveHandler(e) {
  const link = e.target.closest(".breadcrumb-link");
  if (!link) return;
  link.classList.remove("drop-hover");
}

// Drop handler via delegation
function breadcrumbDropHandler(e) {
  const link = e.target.closest(".breadcrumb-link");
  if (!link) return;
  e.preventDefault();
  link.classList.remove("drop-hover");
  const dropFolder = link.getAttribute("data-folder");
  let dragData;
  try {
    dragData = JSON.parse(e.dataTransfer.getData("application/json"));
  } catch (err) {
    console.error("Invalid drag data on breadcrumb:", err);
    return;
  }
  /* FOLDER MOVE FALLBACK */
  if (!dragData) {
    const plain = (event.dataTransfer && event.dataTransfer.getData("application/x-filerise-folder")) ||
      (event.dataTransfer && event.dataTransfer.getData("text/plain")) || "";
    if (plain) {
      const sourceFolder = String(plain).trim();
      if (sourceFolder && sourceFolder !== "root") {
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
          .then(data => {
            if (data && !data.error) {
              showToast(`Folder moved to ${dropFolder}!`);
              if (window.currentFolder && (window.currentFolder === sourceFolder || window.currentFolder.startsWith(sourceFolder + "/"))) {
                const base = sourceFolder.split("/").pop();
                const newPath = (dropFolder === "root" ? "" : dropFolder + "/") + base;
                window.currentFolder = newPath;
              }
              return loadFolderTree().then(() => {
                try { expandTreePath(window.currentFolder || "root", { persist: false, includeLeaf: false }); } catch (_) { }
                loadFileList(window.currentFolder || "root");
              });
            } else {
              showToast("Error: " + (data && data.error || "Could not move folder"), 5000);
            }
          })
          .catch(err => {
            console.error("Error moving folder:", err);
            showToast("Error moving folder", 5000);
          });
      }
    }
    return;
  }

  const filesToMove = dragData.files ? dragData.files : (dragData.fileName ? [dragData.fileName] : []);
  if (filesToMove.length === 0) return;

  fetchWithCsrf("/api/file/moveFiles.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      source: dragData.sourceFolder,
      files: filesToMove,
      destination: dropFolder
    })
  })
    .then(safeJson)
    .then(data => {
      if (data.success) {
        showToast(`File(s) moved successfully to ${dropFolder}!`);
        loadFileList(dragData.sourceFolder);
      } else {
        showToast("Error moving files: " + (data.error || "Unknown error"));
      }
    })
    .catch(error => {
      console.error("Error moving files via drop on breadcrumb:", error);
      showToast("Error moving files.");
    });
}

/* ----------------------
   Check Current User's Folder-Only Permission
----------------------*/
// Authoritatively determine from the server; still write to localStorage for UI,
// but ignore any preexisting localStorage override for security.
async function checkUserFolderPermission() {
  const username = localStorage.getItem("username") || "";
  try {
    const res = await fetchWithCsrf("/api/getUserPermissions.php", {
      method: "GET",
      credentials: "include"
    });
    const permissionsData = await safeJson(res);

    const isFolderOnly =
      !!(permissionsData &&
        permissionsData[username] &&
        permissionsData[username].folderOnly);

    window.userFolderOnly = isFolderOnly;
    localStorage.setItem("folderOnly", isFolderOnly ? "true" : "false");

    if (isFolderOnly && username) {
      localStorage.setItem("lastOpenedFolder", username);
      window.currentFolder = username;
    }
    return isFolderOnly;
  } catch (err) {
    console.error("Error fetching user permissions:", err);
    window.userFolderOnly = false;
    localStorage.setItem("folderOnly", "false");
    return false;
  }
}

// ---------------- SVG icons + icon helpers ----------------
const _nonEmptyCache = new Map();

/** Return inline SVG string for either an empty folder or folder-with-paper */
/* ----------------------
   Folder icon (SVG + fetch + cache)
----------------------*/

// Crisp emoji-like folder (empty / with paper)
function folderSVG(kind = 'empty') {
  return `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <!-- Angled back body -->
    <path class="folder-back"
      d="M3 7.4h7.6l1.6 1.8H20.3c1.1 0 2 .9 2 2v7.6c0 1.1-.9 2-2 2H5
         c-1.1 0-2-.9-2-2V9.4c0-1.1.9-2 2-2z"/>

    ${kind === 'paper'
      ? `
          <!-- Paper raised so it peeks above the lip -->
          <rect class="paper" x="6.1" y="5.7" width="11.8" height="10.8" rx="1.2"/>
          <!-- Bigger fold -->
          <path class="paper-fold" d="M18.0 5.7h-3.2l3.2 3.2z"/>
          <!-- Content lines -->
          <path class="paper-line" d="M7.7 8.2h8.3"/>
          <path class="paper-line" d="M7.7 9.8h7.2"/>
          <path class="paper-line" d="M7.7 11.3h6.0"/>
        `
      : ''
    }

    <!-- Front lip (angled) -->
    <path class="folder-front"
      d="M2.3 10.1H10.9l2.0-2.1h7.4c.94 0 1.7.76 1.7 1.7v7.3c0 .94-.76 1.7-1.7 1.7H4
         c-.94 0-1.7-.76-1.7-1.7v-6.9z"/>

    <!-- Subtle highlight along the lip to add depth -->
    <path class="lip-highlight"
      d="M3.3 10.2H11.2l1.7-1.8h7.0"
    />
  </svg>`;
}

const _folderCountCache = new Map();
const _inflightCounts = new Map();

// --- tiny fetch helper with timeout
function fetchJSONWithTimeout(url, ms = 3000) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { credentials: 'include', signal: ctrl.signal })
    .then(r => r.ok ? r.json() : { folders: 0, files: 0 })
    .catch(() => ({ folders: 0, files: 0 }))
    .finally(() => clearTimeout(tid));
}

// --- simple concurrency limiter (prevents 100 simultaneous requests)
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

  const url = `/api/folder/isEmpty.php?folder=${encodeURIComponent(folder)}`;
  const p = _runCount(url).then(data => {
    const result = {
      folders: Number(data?.folders || 0),
      files: Number(data?.files || 0),
    };
    _folderCountCache.set(folder, result);
    _inflightCounts.delete(folder);
    return result;
  });

  _inflightCounts.set(folder, p);
  return p;
}

function setFolderIconForOption(optEl, kind) {
  const iconEl = optEl.querySelector('.folder-icon');
  if (!iconEl) return;
  iconEl.dataset.kind = kind;
  iconEl.innerHTML = folderSVG(kind);
}

function ensureFolderIcon(folder) {
  const opt = document.querySelector(`.folder-option[data-folder="${CSS.escape(folder)}"]`);
  if (!opt) return;
  // Set a neutral default first so layout is stable
  setFolderIconForOption(opt, 'empty');

  fetchFolderCounts(folder).then(({ folders, files }) => {
    setFolderIconForOption(opt, (folders + files) > 0 ? 'paper' : 'empty');
  });
}
/** Set a folder row’s icon to 'empty' or 'paper' */
function setFolderIcon(folderPath, kind) {
  const iconEl = document.querySelector(`.folder-option[data-folder="${folderPath}"] .folder-icon`);
  if (!iconEl) return;
  if (iconEl.dataset.icon === kind) return;
  iconEl.dataset.icon = kind;
  iconEl.innerHTML = folderSVG(kind);
}

/** Fast local heuristic: mark 'paper' if we can see any subfolders under this LI */
function markNonEmptyIfHasChildren(folderPath) {
  const option = document.querySelector(`.folder-option[data-folder="${folderPath}"]`);
  if (!option) return false;
  const li = option.closest('li[role="treeitem"]');
  const childUL = li ? li.querySelector(':scope > ul') : null;
  const hasChildNodes = !!(childUL && childUL.querySelector('li'));
  if (hasChildNodes) { setFolderIcon(folderPath, 'paper'); _nonEmptyCache.set(folderPath, true); }
  return hasChildNodes;
}

/** ACL-aware check for files: call a tiny stats endpoint (see part C) */
async function fetchFolderNonEmptyACL(folderPath) {
  if (_nonEmptyCache.has(folderPath)) return _nonEmptyCache.get(folderPath);
  const { folders, files } = await fetchFolderCounts(folderPath);
  const nonEmpty = (folders + files) > 0;
  _nonEmptyCache.set(folderPath, nonEmpty);
  return nonEmpty;
}


/* ----------------------
   DOM Building Functions for Folder Tree
----------------------*/
function renderFolderTree(tree, parentPath = "", defaultDisplay = "block") {
  const state = loadFolderTreeState();
  let html = `<ul class="folder-tree ${defaultDisplay === 'none' ? 'collapsed' : 'expanded'}" role="group">`;

  for (const folder in tree) {
    const name = folder.toLowerCase();
    if (name === "trash" || name === "profile_pics") continue;

    const fullPath = parentPath ? parentPath + "/" + folder : folder;
    const hasChildren = Object.keys(tree[folder]).length > 0;
    const displayState = state[fullPath] !== undefined ? state[fullPath] : defaultDisplay;
    const isOpen = displayState !== 'none';

    html += `<li class="folder-item" role="treeitem" aria-expanded="${hasChildren ? String(isOpen) : 'false'}">`;

    html += `<div class="folder-row">`;
    if (hasChildren) {
      html += `<button type="button" class="folder-toggle" aria-label="${isOpen ? 'Collapse' : 'Expand'}" data-folder="${fullPath}"></button>`;
    } else {
      html += `<span class="folder-spacer" aria-hidden="true"></span>`;
    }
    html += `
  <span class="folder-option" draggable="true" data-folder="${fullPath}">
    <span class="folder-icon" aria-hidden="true" data-icon="${hasChildren ? 'paper' : 'empty'}">
  ${folderSVG(hasChildren ? 'paper' : 'empty')}
</span>
    <span class="folder-label">${escapeHTML(folder)}</span>
  </span>
`;
    html += `</div>`; // /.folder-row

    if (hasChildren) html += renderFolderTree(tree[folder], fullPath, displayState);
    html += `</li>`;
  }

  html += `</ul>`;
  return html;
}

// replace your current expandTreePath with this version
function expandTreePath(path, opts = {}) {
  const { force = false } = opts;
  const state = loadFolderTreeState();
  const parts = (path || '').split('/').filter(Boolean);
  let cumulative = '';

  parts.forEach((part, i) => {
    cumulative = i === 0 ? part : `${cumulative}/${part}`;
    const option = document.querySelector(`.folder-option[data-folder="${CSS.escape(cumulative)}"]`);
    if (!option) return;

    const li = option.closest('li[role="treeitem"]');
    const nestedUl = li ? li.querySelector(':scope > ul') : null;
    if (!nestedUl) return;

    // Only expand if caller forces it OR saved state says "block"
    const shouldExpand = force || state[cumulative] === 'block';
    nestedUl.classList.toggle('expanded', shouldExpand);
    nestedUl.classList.toggle('collapsed', !shouldExpand);
    li.setAttribute('aria-expanded', String(!!shouldExpand));
  });
}


/* ----------------------
   Drag & Drop Support for Folder Tree Nodes
----------------------*/
function folderDragOverHandler(event) {
  event.preventDefault();
  event.currentTarget.classList.add("drop-hover");
}

function folderDragLeaveHandler(event) {
  event.currentTarget.classList.remove("drop-hover");
}

function folderDropHandler(event) {
  event.preventDefault();
  event.currentTarget.classList.remove("drop-hover");
  const dropFolder = event.currentTarget.getAttribute("data-folder");
  let dragData = null;
  try {
    const jsonStr = event.dataTransfer.getData("application/json") || "";
    if (jsonStr) dragData = JSON.parse(jsonStr);
  }
  catch (e) {
    console.error("Invalid drag data", e);
    return;
  }
  /* FOLDER MOVE FALLBACK */
  if (!dragData) {
    const plain = (event.dataTransfer && event.dataTransfer.getData("application/x-filerise-folder")) ||
      (event.dataTransfer && event.dataTransfer.getData("text/plain")) || "";
    if (plain) {
      const sourceFolder = String(plain).trim();
      if (sourceFolder && sourceFolder !== "root") {
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
          .then(data => {
            if (data && !data.error) {
              showToast(`Folder moved to ${dropFolder}!`);
              if (window.currentFolder && (window.currentFolder === sourceFolder || window.currentFolder.startsWith(sourceFolder + "/"))) {
                const base = sourceFolder.split("/").pop();
                const newPath = (dropFolder === "root" ? "" : dropFolder + "/") + base;
                window.currentFolder = newPath;
              }
              return loadFolderTree().then(() => {
                try { expandTreePath(window.currentFolder || "root", { persist: false, includeLeaf: false }); } catch (_) { }
                loadFileList(window.currentFolder || "root");
              });
            } else {
              showToast("Error: " + (data && data.error || "Could not move folder"), 5000);
            }
          })
          .catch(err => {
            console.error("Error moving folder:", err);
            showToast("Error moving folder", 5000);
          });
      }
    }
    return;
  }

  const filesToMove = dragData.files ? dragData.files : (dragData.fileName ? [dragData.fileName] : []);
  if (filesToMove.length === 0) return;

  fetchWithCsrf("/api/file/moveFiles.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      source: dragData.sourceFolder,
      files: filesToMove,
      destination: dropFolder
    })
  })
    .then(safeJson)
    .then(data => {
      if (data.success) {
        showToast(`File(s) moved successfully to ${dropFolder}!`);
        loadFileList(dragData.sourceFolder);
      } else {
        showToast("Error moving files: " + (data.error || "Unknown error"));
      }
    })
    .catch(error => {
      console.error("Error moving files via drop:", error);
      showToast("Error moving files.");
    });
}

/* ----------------------
   Main Folder Tree Rendering and Event Binding
----------------------*/
// Safe breadcrumb DOM builder
function renderBreadcrumbFragment(folderPath) {
  const frag = document.createDocumentFragment();

  // Defensive normalize
  const path = (typeof folderPath === 'string' && folderPath.length) ? folderPath : 'root';
  const crumbs = path.split('/').filter(s => s !== ''); // no empty segments

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
      const sep = document.createElement('span');
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
  // Ensure context menu delegation is hooked to the dynamic breadcrumb container
  bindFolderManagerContextMenu();
}

export async function loadFolderTree(selectedFolder) {
  try {
    // Check if the user has folder-only permission (server-authoritative).
    await checkUserFolderPermission();

    // Determine effective root folder.
    const username = localStorage.getItem("username") || "root";
    let effectiveRoot = "root";
    let effectiveLabel = "(Root)";
    if (window.userFolderOnly && username) {
      effectiveRoot = username; // personal root
      effectiveLabel = `(Root)`;
      localStorage.setItem("lastOpenedFolder", username);
      window.currentFolder = username;
    } else {
      window.currentFolder = localStorage.getItem("lastOpenedFolder") || "root";
    }

    // Fetch folder list from the server (server enforces scope).
    const res = await fetchWithCsrf('/api/folder/getFolderList.php', {
      method: 'GET',
      credentials: 'include'
    });

    if (res.status === 401) {
      showToast("Session expired. Please log in again.");
      window.location.href = "/api/auth/logout.php";
      return;
    }
    if (res.status === 403) {
      showToast("You don't have permission to view folders.");
      return;
    }

    const folderData = await safeJson(res);

    let folders = [];
    if (Array.isArray(folderData) && folderData.length && typeof folderData[0] === "object" && folderData[0].folder) {
      folders = folderData.map(item => item.folder);
    } else if (Array.isArray(folderData)) {
      folders = folderData;
    }

    // Remove any global "root" entry (server shouldn't return it, but be safe).
    folders = folders.filter(folder => folder.toLowerCase() !== "root");

    // If restricted, filter client-side view to subtree for UX (server still enforces).
    if (window.userFolderOnly && effectiveRoot !== "root") {
      folders = folders.filter(folder => folder.startsWith(effectiveRoot + "/"));
      localStorage.setItem("lastOpenedFolder", effectiveRoot);
      window.currentFolder = effectiveRoot;
    }

    localStorage.setItem("lastOpenedFolder", window.currentFolder);

    // Render the folder tree.
    const container = document.getElementById("folderTreeContainer");
    if (!container) {
      console.error("Folder tree container not found.");
      return;
    }

    const state0 = loadFolderTreeState();
    const rootOpen = state0[effectiveRoot] !== 'none';

    let html = `
  <div id="rootRow" class="folder-row" role="treeitem" aria-expanded="${String(rootOpen)}">
    <button type="button" class="folder-toggle" data-folder="${effectiveRoot}" aria-label="${rootOpen ? 'Collapse' : 'Expand'}"></button>
    <span class="folder-option root-folder-option" data-folder="${effectiveRoot}">
      <span class="folder-icon" aria-hidden="true"></span>
      <span class="folder-label">${effectiveLabel}</span>
    </span>
  </div>
`;

    if (folders.length > 0) {
      const tree = buildFolderTree(folders);
      // 👇 pass the root's saved state down to first level
      html += renderFolderTree(tree, "", rootOpen ? "block" : "none");
    }
    container.innerHTML = html;

    const st = loadFolderTreeState();
    const rootUl = container.querySelector('#rootRow + ul');
    if (rootUl) {
      const expanded = (st[effectiveRoot] ?? 'block') === 'block';
      rootUl.classList.toggle('expanded', expanded);
      rootUl.classList.toggle('collapsed', !expanded);
      const rr = container.querySelector('#rootRow');
      if (rr) rr.setAttribute('aria-expanded', String(expanded));
    }

    // Prime icons for everything visible
    primeFolderIcons(container);

    function primeFolderIcons(scopeEl) {
      const opts = scopeEl.querySelectorAll('.folder-option[data-folder]');
      opts.forEach(opt => {
        const f = opt.getAttribute('data-folder');
        // Optional: if there are obvious children in DOM, show 'paper' immediately as a hint
        const li = opt.closest('li[role="treeitem"]');
        const hasChildren = !!(li && li.querySelector(':scope > ul > li'));
        setFolderIconForOption(opt, hasChildren ? 'paper' : 'empty');
        // Then confirm with server (files count)
        ensureFolderIcon(f);
      });
    }

    // Attach drag/drop event listeners.
    container.querySelectorAll(".folder-option").forEach(el => {
      const fp = el.getAttribute('data-folder');
      markNonEmptyIfHasChildren(fp);
      // Provide folder path payload for folder->folder DnD
      el.addEventListener("dragstart", (ev) => {
        const src = el.getAttribute("data-folder");
        try { ev.dataTransfer.setData("application/x-filerise-folder", src); } catch (e) { }
        try { ev.dataTransfer.setData("text/plain", src); } catch (e) { }
        ev.dataTransfer.effectAllowed = "move";
      });

      el.addEventListener("dragover", folderDragOverHandler);
      el.addEventListener("dragleave", folderDragLeaveHandler);
      el.addEventListener("drop", folderDropHandler);
    });

    if (selectedFolder) {
      window.currentFolder = selectedFolder;
    }
    localStorage.setItem("lastOpenedFolder", window.currentFolder);

    // Initial breadcrumb + file list
    updateBreadcrumbTitle(window.currentFolder);
    applyFolderCapabilities(window.currentFolder);
    ensureFolderIcon(window.currentFolder);
    loadFileList(window.currentFolder);

    // Show ancestors so the current selection is visible, but don't persist
    if (window.currentFolder && window.currentFolder !== effectiveRoot) {
      expandTreePath(window.currentFolder, { persist: false, includeLeaf: false });
    }

    const selectedEl = container.querySelector(`.folder-option[data-folder="${window.currentFolder}"]`);
    if (selectedEl) {
      container.querySelectorAll(".folder-option").forEach(item => item.classList.remove("selected"));
      selectedEl.classList.add("selected");
    }

    // Folder-option click: update selection, breadcrumbs, and file list
    container.querySelectorAll(".folder-option").forEach(el => {
      // Provide folder path payload for folder->folder DnD
      el.addEventListener("dragstart", (ev) => {
        const src = el.getAttribute("data-folder");
        try { ev.dataTransfer.setData("application/x-filerise-folder", src); } catch (e) { }
        try { ev.dataTransfer.setData("text/plain", src); } catch (e) { }
        ev.dataTransfer.effectAllowed = "move";
      });

      el.addEventListener("click", function (e) {
        e.stopPropagation();
        container.querySelectorAll(".folder-option").forEach(item => item.classList.remove("selected"));
        this.classList.add("selected");
        const selected = this.getAttribute("data-folder");
        window.currentFolder = selected;
        localStorage.setItem("lastOpenedFolder", selected);

        updateBreadcrumbTitle(selected);
        applyFolderCapabilities(selected);
        ensureFolderIcon(selected);
        loadFileList(selected);
      });
    });

    // Root toggle
    const rootToggle = container.querySelector("#rootRow .folder-toggle");
    if (rootToggle) {
      rootToggle.addEventListener("click", function (e) {
        e.stopPropagation();
        const nestedUl = container.querySelector("#rootRow + ul");
        if (!nestedUl) return;

        const state = loadFolderTreeState();
        const expanded = !(nestedUl.classList.contains("expanded"));
        nestedUl.classList.toggle("expanded", expanded);
        nestedUl.classList.toggle("collapsed", !expanded);

        document.getElementById("rootRow").setAttribute("aria-expanded", String(expanded));
        state[effectiveRoot] = expanded ? "block" : "none";
        saveFolderTreeState(state);
      });
    }

    // Other toggles

    container.querySelectorAll("button.folder-toggle").forEach(toggle => {
      toggle.addEventListener("click", function (e) {
        e.stopPropagation();
        const li = this.closest('li[role="treeitem"]');
        const siblingUl = li ? li.querySelector(':scope > ul') : null;
        const folderPath = this.getAttribute("data-folder");
        if (!siblingUl) return;

        const state = loadFolderTreeState();
        const expanded = !(siblingUl.classList.contains("expanded"));
        siblingUl.classList.toggle("expanded", expanded);
        siblingUl.classList.toggle("collapsed", !expanded);
        li.setAttribute("aria-expanded", String(expanded));
        state[folderPath] = expanded ? "block" : "none";
        saveFolderTreeState(state);
        ensureFolderIcon(folderPath);
      });
    });

  } catch (error) {
    console.error("Error loading folder tree:", error);
    if (error.status === 403) {
      showToast("You don't have permission to view folders.");
    }
  }
}

// For backward compatibility.
export function loadFolderList(selectedFolder) {
  loadFolderTree(selectedFolder);
}

/* ----------------------
   Folder Management (Rename, Delete, Create)
----------------------*/
const renameBtn = document.getElementById("renameFolderBtn");
if (renameBtn) renameBtn.addEventListener("click", openRenameFolderModal);

const deleteBtn = document.getElementById("deleteFolderBtn");
if (deleteBtn) deleteBtn.addEventListener("click", openDeleteFolderModal);

export function openRenameFolderModal() {
  const selectedFolder = window.currentFolder || "root";
  if (!selectedFolder || selectedFolder === "root") {
    showToast("Please select a valid folder to rename.");
    return;
  }
  const parts = selectedFolder.split("/");
  const input = document.getElementById("newRenameFolderName");
  const modal = document.getElementById("renameFolderModal");
  if (!input || !modal) return;
  input.value = parts[parts.length - 1];
  modal.style.display = "block";
  setTimeout(() => {
    input.focus();
    input.select();
  }, 100);
}

const cancelRename = document.getElementById("cancelRenameFolder");
if (cancelRename) {
  cancelRename.addEventListener("click", function () {
    const modal = document.getElementById("renameFolderModal");
    const input = document.getElementById("newRenameFolderName");
    if (modal) modal.style.display = "none";
    if (input) input.value = "";
  });
}
attachEnterKeyListener("renameFolderModal", "submitRenameFolder");

const submitRename = document.getElementById("submitRenameFolder");
if (submitRename) {
  submitRename.addEventListener("click", function (event) {
    event.preventDefault();
    const selectedFolder = window.currentFolder || "root";
    const input = document.getElementById("newRenameFolderName");
    if (!input) return;
    const newNameBasename = input.value.trim();
    if (!newNameBasename || newNameBasename === selectedFolder.split("/").pop()) {
      showToast("Please enter a valid new folder name.");
      return;
    }
    const parentPath = getParentFolder(selectedFolder);
    const newFolderFull = parentPath === "root" ? newNameBasename : parentPath + "/" + newNameBasename;

    fetchWithCsrf("/api/folder/renameFolder.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ oldFolder: window.currentFolder, newFolder: newFolderFull })
    })
      .then(safeJson)
      .then(data => {
        if (data.success) {
          showToast("Folder renamed successfully!");
          window.currentFolder = newFolderFull;
          localStorage.setItem("lastOpenedFolder", newFolderFull);
          loadFolderList(newFolderFull);
        } else {
          showToast("Error: " + (data.error || "Could not rename folder"));
        }
      })
      .catch(error => console.error("Error renaming folder:", error))
      .finally(() => {
        const modal = document.getElementById("renameFolderModal");
        const input2 = document.getElementById("newRenameFolderName");
        if (modal) modal.style.display = "none";
        if (input2) input2.value = "";
      });
  });
}

// === Move Folder Modal helper (shared by button + context menu) ===
function openMoveFolderUI(sourceFolder) {
  const modal = document.getElementById('moveFolderModal');
  const targetSel = document.getElementById('moveFolderTarget');

  // If you right-clicked a different folder than currently selected, use that
  if (sourceFolder && sourceFolder !== 'root') {
    window.currentFolder = sourceFolder;
  }

  // Fill target dropdown
  if (targetSel) {
    targetSel.innerHTML = '';
    fetch('/api/folder/getFolderList.php', { credentials: 'include' })
      .then(r => r.json())
      .then(list => {
        if (Array.isArray(list) && list.length && typeof list[0] === 'object' && list[0].folder) {
          list = list.map(it => it.folder);
        }
        // Root option
        const rootOpt = document.createElement('option');
        rootOpt.value = 'root'; rootOpt.textContent = '(Root)';
        targetSel.appendChild(rootOpt);

        (list || [])
          .filter(f => f && f !== 'trash' && f !== (window.currentFolder || ''))
          .forEach(f => {
            const o = document.createElement('option');
            o.value = f; o.textContent = f;
            targetSel.appendChild(o);
          });
      })
      .catch(() => { /* no-op */ });
  }

  if (modal) modal.style.display = 'block';
}

export function openDeleteFolderModal() {
  const selectedFolder = window.currentFolder || "root";
  if (!selectedFolder || selectedFolder === "root") {
    showToast("Please select a valid folder to delete.");
    return;
  }
  const msgEl = document.getElementById("deleteFolderMessage");
  const modal = document.getElementById("deleteFolderModal");
  if (!msgEl || !modal) return;
  msgEl.textContent = "Are you sure you want to delete folder " + selectedFolder + "?";
  modal.style.display = "block";
}

const cancelDelete = document.getElementById("cancelDeleteFolder");
if (cancelDelete) {
  cancelDelete.addEventListener("click", function () {
    const modal = document.getElementById("deleteFolderModal");
    if (modal) modal.style.display = "none";
  });
}
attachEnterKeyListener("deleteFolderModal", "confirmDeleteFolder");

const confirmDelete = document.getElementById("confirmDeleteFolder");
if (confirmDelete) {
  confirmDelete.addEventListener("click", function () {
    const selectedFolder = window.currentFolder || "root";

    fetchWithCsrf("/api/folder/deleteFolder.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ folder: selectedFolder })
    })
      .then(safeJson)
      .then(data => {
        if (data.success) {
          showToast("Folder deleted successfully!");
          window.currentFolder = getParentFolder(selectedFolder);
          localStorage.setItem("lastOpenedFolder", window.currentFolder);
          loadFolderList(window.currentFolder);
        } else {
          showToast("Error: " + (data.error || "Could not delete folder"));
        }
      })
      .catch(error => console.error("Error deleting folder:", error))
      .finally(() => {
        const modal = document.getElementById("deleteFolderModal");
        if (modal) modal.style.display = "none";
      });
  });
}

const createBtn = document.getElementById("createFolderBtn");
if (createBtn) {
  createBtn.addEventListener("click", function () {
    const modal = document.getElementById("createFolderModal");
    const input = document.getElementById("newFolderName");
    if (modal) modal.style.display = "block";
    if (input) input.focus();
  });
}

const cancelCreate = document.getElementById("cancelCreateFolder");
if (cancelCreate) {
  cancelCreate.addEventListener("click", function () {
    const modal = document.getElementById("createFolderModal");
    const input = document.getElementById("newFolderName");
    if (modal) modal.style.display = "none";
    if (input) input.value = "";
  });
}
attachEnterKeyListener("createFolderModal", "submitCreateFolder");

const submitCreate = document.getElementById("submitCreateFolder");
if (submitCreate) {
  submitCreate.addEventListener("click", async () => {
    const input = document.getElementById("newFolderName");
    const folderInput = input ? input.value.trim() : "";
    if (!folderInput) return showToast("Please enter a folder name.");

    const selectedFolder = window.currentFolder || "root";
    const parent = selectedFolder === "root" ? "" : selectedFolder;

    // 1) Guarantee fresh CSRF
    try {
      await loadCsrfToken();
    } catch {
      return showToast("Could not refresh CSRF token. Please reload.");
    }

    // 2) Call with fetchWithCsrf
    fetchWithCsrf("/api/folder/createFolder.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ folderName: folderInput, parent })
    })
      .then(safeJson)
      .then(data => {
        if (!data.success) throw new Error(data.error || "Server rejected the request");
        showToast("Folder created!");
        const full = parent ? `${parent}/${folderInput}` : folderInput;
        window.currentFolder = full;
        localStorage.setItem("lastOpenedFolder", full);
        loadFolderList(full);
      })
      .catch(e => {
        showToast("Error creating folder: " + e.message);
      })
      .finally(() => {
        const modal = document.getElementById("createFolderModal");
        const input2 = document.getElementById("newFolderName");
        if (modal) modal.style.display = "none";
        if (input2) input2.value = "";
      });
  });
}

// ---------- CONTEXT MENU SUPPORT FOR FOLDER MANAGER ----------
export function showFolderManagerContextMenu(x, y, menuItems) {
  let menu = document.getElementById("folderManagerContextMenu");
  if (!menu) {
    menu = document.createElement("div");
    menu.id = "folderManagerContextMenu";
    menu.style.position = "absolute";
    menu.style.padding = "5px 0";
    menu.style.minWidth = "150px";
    menu.style.zIndex = "9999";
    document.body.appendChild(menu);
  }
  if (document.body.classList.contains("dark-mode")) {
    menu.style.backgroundColor = "#2c2c2c";
    menu.style.border = "1px solid #555";
    menu.style.color = "#e0e0e0";
  } else {
    menu.style.backgroundColor = "#fff";
    menu.style.border = "1px solid #ccc";
    menu.style.color = "#000";
  }
  menu.innerHTML = "";
  menuItems.forEach(item => {
    const menuItem = document.createElement("div");
    menuItem.textContent = item.label;
    menuItem.style.padding = "5px 15px";
    menuItem.style.cursor = "pointer";
    menuItem.addEventListener("mouseover", () => {
      if (document.body.classList.contains("dark-mode")) {
        menuItem.style.backgroundColor = "#444";
      } else {
        menuItem.style.backgroundColor = "#f0f0f0";
      }
    });
    menuItem.addEventListener("mouseout", () => {
      menuItem.style.backgroundColor = "";
    });
    menuItem.addEventListener("click", () => {
      item.action();
      hideFolderManagerContextMenu();
    });
    menu.appendChild(menuItem);
  });
  menu.style.left = x + "px";
  menu.style.top = y + "px";
  menu.style.display = "block";
}

export function hideFolderManagerContextMenu() {
  const menu = document.getElementById("folderManagerContextMenu");
  if (menu) {
    menu.style.display = "none";
  }
}

function folderManagerContextMenuHandler(e) {
  const target = e.target.closest(".folder-option, .breadcrumb-link");
  if (!target) return;

  e.preventDefault();
  e.stopPropagation();

  const folder = target.getAttribute("data-folder");
  if (!folder) return;
  window.currentFolder = folder;
  applyFolderCapabilities(window.currentFolder);

  // Visual selection
  document.querySelectorAll(".folder-option, .breadcrumb-link").forEach(el => el.classList.remove("selected"));
  target.classList.add("selected");

  const menuItems = [
    {
      label: t("create_folder"),
      action: () => {
        const modal = document.getElementById("createFolderModal");
        const input = document.getElementById("newFolderName");
        if (modal) modal.style.display = "block";
        if (input) input.focus();
      }
    },
    {
      label: t("move_folder"),
      action: () => { openMoveFolderUI(folder); }
    },
    {
      label: t("rename_folder"),
      action: () => { openRenameFolderModal(); }
    },
    {
      label: t("folder_share"),
      action: () => { openFolderShareModal(folder); }
    },
    {
      label: t("delete_folder"),
      action: () => { openDeleteFolderModal(); }
    }
  ];
  showFolderManagerContextMenu(e.pageX, e.pageY, menuItems);
}

// Delegate contextmenu so it works with dynamically re-rendered breadcrumbs
function bindFolderManagerContextMenu() {
  const tree = document.getElementById("folderTreeContainer");
  if (tree) {
    // remove old bound handler if present
    if (tree._ctxHandler) {
      tree.removeEventListener("contextmenu", tree._ctxHandler, false);
    }
    tree._ctxHandler = function (e) {
      const onOption = e.target.closest(".folder-option");
      if (!onOption) return;
      folderManagerContextMenuHandler(e);
    };
    tree.addEventListener("contextmenu", tree._ctxHandler, false);
  }

  const title = document.getElementById("fileListTitle");
  if (title) {
    if (title._ctxHandler) {
      title.removeEventListener("contextmenu", title._ctxHandler, false);
    }
    title._ctxHandler = function (e) {
      const onCrumb = e.target.closest(".breadcrumb-link");
      if (!onCrumb) return;
      folderManagerContextMenuHandler(e);
    };
    title.addEventListener("contextmenu", title._ctxHandler, false);
  }
}

document.addEventListener("click", function () {
  hideFolderManagerContextMenu();
});

document.addEventListener("DOMContentLoaded", function () {
  document.addEventListener("keydown", function (e) {
    const tag = e.target.tagName ? e.target.tagName.toLowerCase() : "";
    if (tag === "input" || tag === "textarea" || (e.target && e.target.isContentEditable)) {
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace" || e.keyCode === 46 || e.keyCode === 8) {
      if (window.currentFolder && window.currentFolder !== "root") {
        e.preventDefault();
        openDeleteFolderModal();
      }
    }
  });
});

document.addEventListener("DOMContentLoaded", function () {
  const shareFolderBtn = document.getElementById("shareFolderBtn");
  if (shareFolderBtn) {
    shareFolderBtn.addEventListener("click", () => {
      const selectedFolder = window.currentFolder || "root";
      if (!selectedFolder || selectedFolder === "root") {
        showToast("Please select a valid folder to share.");
        return;
      }
      openFolderShareModal(selectedFolder);
    });
  } else {
    console.warn("shareFolderBtn element not found in the DOM.");
  }
});

// Initial context menu delegation bind
bindFolderManagerContextMenu();

document.addEventListener("DOMContentLoaded", () => {
  const moveBtn = document.getElementById('moveFolderBtn');
  const modal = document.getElementById('moveFolderModal');
  const targetSel = document.getElementById('moveFolderTarget');
  const cancelBtn = document.getElementById('cancelMoveFolder');
  const confirmBtn = document.getElementById('confirmMoveFolder');

  if (moveBtn) {
    moveBtn.addEventListener('click', () => {
      const cf = window.currentFolder || 'root';
      if (!cf || cf === 'root') { showToast('Select a non-root folder to move.'); return; }
      openMoveFolderUI(cf);
    });
  }

  if (cancelBtn) cancelBtn.addEventListener('click', () => { if (modal) modal.style.display = 'none'; });

  if (confirmBtn) confirmBtn.addEventListener('click', async () => {
    if (!targetSel) return;
    const destination = targetSel.value;
    const source = window.currentFolder;

    if (!destination) { showToast('Pick a destination'); return; }
    if (destination === source || (destination + '/').startsWith(source + '/')) {
      showToast('Invalid destination'); return;
    }

    try {
      const res = await fetch('/api/folder/moveFolder.php', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.csrfToken },
        body: JSON.stringify({ source, destination })
      });
      const data = await safeJson(res);
      if (res.ok && data && !data.error) {
        showToast('Folder moved');
        if (modal) modal.style.display = 'none';
        await loadFolderTree();
        const base = source.split('/').pop();
        const newPath = (destination === 'root' ? '' : destination + '/') + base;
        window.currentFolder = newPath;
        loadFileList(window.currentFolder || 'root');
      } else {
        showToast('Error: ' + (data && data.error || 'Move failed'));
      }
    } catch (e) { console.error(e); showToast('Move failed'); }
  });
});
