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
/* ----------------------
   Transient UI guards (click suppression)
----------------------*/
let _suppressToggleUntil = 0;
function suppressNextToggle(ms = 300) {
  _suppressToggleUntil = performance.now() + ms;
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
  setControlEnabled(document.getElementById('colorFolderBtn'), !isRoot && !!caps.canRename);
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
  } catch (_) { /* noop */ }

  // FOLDER MOVE FALLBACK (folder->folder)
  if (!dragData) {
    const plain = (e.dataTransfer && e.dataTransfer.getData("application/x-filerise-folder")) ||
      (e.dataTransfer && e.dataTransfer.getData("text/plain")) || "";
    const sourceFolder = String(plain || "").trim();
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
      .then(data => {
        if (data && !data.error) {
          showToast(`Folder moved to ${dropFolder}!`);
          // Make icons reflect new emptiness without reload
refreshFolderIcon(dragData.sourceFolder);
refreshFolderIcon(dropFolder);

          if (window.currentFolder &&
            (window.currentFolder === sourceFolder || window.currentFolder.startsWith(sourceFolder + "/"))) {
            const base = sourceFolder.split("/").pop();
            const newPath = (dropFolder === "root" ? "" : dropFolder + "/") + base;

            // carry color without await
            const oldColor = window.folderColorMap[sourceFolder];
            if (oldColor) {
              saveFolderColor(newPath, oldColor)
                .then(() => saveFolderColor(sourceFolder, ''))
                .catch(() => { });
            }

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

    return;
  }

  // File(s) drop path (unchanged)
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
        refreshFolderIcon(dragData.sourceFolder);
        refreshFolderIcon(dropFolder);
      } else {
        showToast("Error moving files: " + (data.error || "Unknown error"));
      }
    })
    .catch(error => {
      console.error("Error moving files via drop on breadcrumb:", error);
      showToast("Error moving files.");
    });
}

// ---- Folder Colors (state + helpers) ----
window.folderColorMap = {}; // { "path": "#RRGGBB", ... }

async function loadFolderColors() {
  try {
    const r = await fetch('/api/folder/getFolderColors.php', { credentials: 'include' });
    if (!r.ok) return (window.folderColorMap = {});
    window.folderColorMap = await r.json() || {};
  } catch { window.folderColorMap = {}; }
}

// tiny color utils
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
function lighten(hex, amt = 12) {
  const { h, s, l } = hexToHsl(hex); return hslToHex(h, s, Math.min(100, l + amt));
}
function darken(hex, amt = 18) {
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
  const back = lighten(hex, 14);    // body (slightly lighter)
  const stroke = darken(hex, 22);     // outline

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
        }
        body.dark-mode #colorFolderModal .folder-preview {
          --border-color:#444; --bg: rgba(255,255,255,.02);
        }
        #colorFolderModal .folder-preview .folder-icon { width:56px; height:56px; display:inline-block }
        #colorFolderModal .folder-preview svg { width:56px; height:56px; display:block }
        /* Use the same variable names you already apply on folder rows */
        #colorFolderModal .folder-preview .folder-back  { fill:var(--filr-folder-back,  #f0d084) }
        #colorFolderModal .folder-preview .folder-front { fill:var(--filr-folder-front, #e2b158); stroke:var(--filr-folder-stroke, #996a1e); stroke-width:.6 }
        #colorFolderModal .folder-preview .lip-highlight { stroke:rgba(255,255,255,.35); fill:none; stroke-width:.9 }
        #colorFolderModal .folder-preview .paper { fill:#fff; stroke:#d0d0d0; stroke-width:.6 }
        #colorFolderModal .folder-preview .paper-fold { fill:#ececec }
        #colorFolderModal .folder-preview .paper-line { stroke:#c8c8c8; stroke-width:.8 }
        #colorFolderModal .folder-preview .label { font-weight:600; user-select:none }

        /* High-contrast ghost button just for this modal */
        #colorFolderModal .btn-ghost {
          background: transparent;
          border: 1px solid var(--ghost-border, #cfcfcf);
          color: var(--ghost-fg, #222);
          padding: 6px 12px;
          border-radius: 8px;
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

      <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;">
        <h3 style="margin:0;">${t('color_folder')}: ${escapeHTML(folder)}</h3>
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

// Invalidate client-side folder "non-empty" caches
function invalidateFolderCaches(folder) {
  if (!folder) return;
  _folderCountCache.delete(folder);
  _nonEmptyCache.delete(folder);
  _inflightCounts.delete(folder);
}

// Public: force a fresh count + icon for a folder row
export function refreshFolderIcon(folder) {
  invalidateFolderCaches(folder);
  ensureFolderIcon(folder);
}

// ---------------- SVG icons + icon helpers ----------------
const _nonEmptyCache = new Map();

/** Return inline SVG string for either an empty folder or folder-with-paper */
/* ----------------------
   Folder icon (SVG + fetch + cache)
----------------------*/

// shared by folder tree + folder strip
export function folderSVG(kind = 'empty') {
  const gid = 'g' + Math.random().toString(36).slice(2, 8);

  // tweak these
  const PAPER_SHIFT_Y = -1.2;   // move paper up (negative = up)
  const INK_SHIFT_Y   = -0.8;   // extra lift for the blue lines

  return `
<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"
     style="display:block;shape-rendering:geometricPrecision">
  <defs>
    <clipPath id="${gid}-clipBack"><path d="M3.5 7.5 H10.5 L12.5 9.5 H20.5
      C21.6 9.5 22.5 10.4 22.5 11.5 V19.5
      C22.5 20.6 21.6 21.5 20.5 21.5 H5.5
      C4.4 21.5 3.5 20.6 3.5 19.5 V9.5
      C3.5 8.4 4.4 7.5 5.5 7.5 Z"/></clipPath>
    <clipPath id="${gid}-clipFront"><path d="M2.5 10.5 H11.5 L13.5 8.5 H20.5
      C21.6 8.5 22.5 9.4 22.5 10.5 V17.5
      C22.5 18.6 21.6 19.5 20.5 19.5 H4.5
      C3.4 19.5 2.5 18.6 2.5 17.5 V10.5 Z"/></clipPath>
    <linearGradient id="${gid}-back" x1="4" y1="20" x2="20" y2="4" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/>
      <stop offset=".55" stop-color="#fff" stop-opacity=".10"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${gid}-front" x1="6" y1="19" x2="19" y2="7" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity=".06"/>
    </linearGradient>
  </defs>

  <!-- BACK -->
  <g class="back-group" clip-path="url(#${gid}-clipBack)">
    <path class="folder-back"
      d="M3.5 7.5 H10.5 L12.5 9.5 H20.5
         C21.6 9.5 22.5 10.4 22.5 11.5 V19.5
         C22.5 20.6 21.6 21.5 20.5 21.5 H5.5
         C4.4 21.5 3.5 20.6 3.5 19.5 V9.5
         C3.5 8.4 4.4 7.5 5.5 7.5 Z"/>
    <path d="M3.5 7.5 H10.5 L12.5 9.5 H20.5 V21.5 H3.5 Z"
          fill="url(#${gid}-back)" pointer-events="none"/>
  </g>

  ${kind === 'paper' ? `
    <!-- Move the entire paper block up (keep your existing shift if you use it) -->
    <g class="paper-group" transform="translate(0, -1.2)">
      <rect class="paper" x="6.5" y="6.5" width="11" height="10" rx="1"/>
  
      <!-- Fold aligned to the paper's top-right corner (right edge = 17.5) -->
      <path class="paper-fold" d="M17.5 6.5 H15.2 L17.5 9.0 Z"/>

      <!-- handwriting dashes -->
<g transform="translate(0, -2.4)">
  <path class="paper-ink" d="M9 11.3 H14.2"
        stroke="#4da3ff" stroke-width=".9" fill="none"
        stroke-linecap="round" stroke-linejoin="round"
        paint-order="normal" vector-effect="non-scaling-stroke"/>
  <path class="paper-ink" d="M9 12.8 H16.4"
        stroke="#4da3ff" stroke-width=".9" fill="none"
        stroke-linecap="round" stroke-linejoin="round"
        paint-order="normal" vector-effect="non-scaling-stroke"/>
</g>
    </g>
  ` : ``}

  <!-- FRONT -->
  <g class="front-group" clip-path="url(#${gid}-clipFront)">
    <path class="folder-front"
      d="M2.5 10.5 H11.5 L13.5 8.5 H20.5
         C21.6 8.5 22.5 9.4 22.5 10.5 V17.5
         C22.5 18.6 21.6 19.5 20.5 19.5 H4.5
         C3.4 19.5 2.5 18.6 2.5 17.5 V10.5 Z"/>
    <path d="M2.5 10.5 H11.5 L13.5 8.5 H20.5 V19.5 H2.5 Z"
          fill="url(#${gid}-front)" pointer-events="none"/>
  </g>

  <!-- Lip highlight -->
  <path class="lip-highlight" d="M3 10.5 H11.5 L13.5 8.5 H20.3"/>
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

  // cache-bust query param to avoid any proxy/cdn caching
  const url = `/api/folder/isEmpty.php?folder=${encodeURIComponent(folder)}&t=${Date.now()}`;

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

function expandTreePath(path, opts = {}) {
  const { force = false, persist = false, includeLeaf = false } = opts;
  const state = loadFolderTreeState();
  const parts = (path || '').split('/').filter(Boolean);
  let cumulative = '';

  const lastIndex = includeLeaf ? parts.length - 1 : Math.max(0, parts.length - 2);

  parts.forEach((part, i) => {
    cumulative = i === 0 ? part : `${cumulative}/${part}`;
    if (i > lastIndex) return; // skip leaf unless asked

    const option = document.querySelector(`.folder-option[data-folder="${CSS.escape(cumulative)}"]`);
    if (!option) return;

    const li = option.closest('li[role="treeitem"]');
    const nestedUl = li ? li.querySelector(':scope > ul') : null;
    if (!nestedUl) return;

    const shouldExpand = force || state[cumulative] === 'block';
    nestedUl.classList.toggle('expanded', shouldExpand);
    nestedUl.classList.toggle('collapsed', !shouldExpand);
    li.setAttribute('aria-expanded', String(!!shouldExpand));

    if (persist && shouldExpand) {
      state[cumulative] = 'block';
    }
  });

  if (persist) saveFolderTreeState(state);
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
  } catch (e) {
    console.error("Invalid drag data", e);
    return;
  }

  // FOLDER MOVE FALLBACK (folder->folder)
  if (!dragData) {
    const plain = (event.dataTransfer && event.dataTransfer.getData("application/x-filerise-folder")) ||
      (event.dataTransfer && event.dataTransfer.getData("text/plain")) || "";
    const sourceFolder = String(plain || "").trim();
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
      .then(data => {
        if (data && !data.error) {
          showToast(`Folder moved to ${dropFolder}!`);

          if (window.currentFolder &&
            (window.currentFolder === sourceFolder || window.currentFolder.startsWith(sourceFolder + "/"))) {
            const base = sourceFolder.split("/").pop();
            const newPath = (dropFolder === "root" ? "" : dropFolder + "/") + base;

            // carry color without await
            const oldColor = window.folderColorMap[sourceFolder];
            if (oldColor) {
              saveFolderColor(newPath, oldColor)
                .then(() => saveFolderColor(sourceFolder, ''))
                .catch(() => { });
            }

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

    return;
  }

  // File(s) drop path (unchanged)
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
        refreshFolderIcon(dragData.sourceFolder);
        refreshFolderIcon(dropFolder);
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

    await loadFolderColors();
    try { applyAllFolderColors(container); } catch (e) {
      console.warn('applyAllFolderColors failed:', e);
    }

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
      expandTreePath(window.currentFolder, { force: true, persist: true, includeLeaf: false });
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

    // --- One delegated toggle handler (robust) ---
    (function bindToggleDelegation() {
      const container = document.getElementById('folderTreeContainer');
      if (!container || container._toggleBound) return;
      container._toggleBound = true;

      container.addEventListener('click', (e) => {
        if (performance.now() < _suppressToggleUntil) {
          e.stopPropagation();
          e.preventDefault();
          return;
        }
        const btn = e.target.closest('button.folder-toggle');
        if (!btn || !container.contains(btn)) return;
        e.stopPropagation();

        const folderPath = btn.getAttribute('data-folder');
        let siblingUl = null;
        let expandedTarget = null;

        // Root toggle?
        if (btn.closest('#rootRow')) {
          siblingUl = container.querySelector('#rootRow + ul');
          expandedTarget = document.getElementById('rootRow');
        } else {
          const li = btn.closest('li[role="treeitem"]');
          if (!li) return;
          siblingUl = li.querySelector(':scope > ul');
          expandedTarget = li;
        }
        if (!siblingUl) return;

        const expanded = !siblingUl.classList.contains('expanded');
        siblingUl.classList.toggle('expanded', expanded);
        siblingUl.classList.toggle('collapsed', !expanded);
        if (expandedTarget) expandedTarget.setAttribute('aria-expanded', String(expanded));

        const state = loadFolderTreeState();
        state[folderPath] = expanded ? 'block' : 'none';
        saveFolderTreeState(state);
      }, true);
    })();

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

          // carry color without await
          const oldPath = selectedFolder;
          const oldColor = window.folderColorMap[oldPath];
          if (oldColor) {
            saveFolderColor(newFolderFull, oldColor)
              .then(() => saveFolderColor(oldPath, ''))
              .catch(() => { });
          }

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
export function openMoveFolderUI(sourceFolder) {
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
          const parentForIcon = getParentFolder(selectedFolder);
refreshFolderIcon(parentForIcon);
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
        const parentForIcon = parent || 'root';
refreshFolderIcon(parentForIcon);
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
async function folderManagerContextMenuHandler(e) {
  const target = e.target.closest(".folder-option, .breadcrumb-link");
  if (!target) return;

  e.preventDefault();
  e.stopPropagation();

  const folder = target.getAttribute("data-folder");
  if (!folder) return;

  window.currentFolder = folder;
  await applyFolderCapabilities(folder); // <-- await ensures fresh caps

  // Visual selection
  document.querySelectorAll(".folder-option, .breadcrumb-link")
    .forEach(el => el.classList.remove("selected"));
  target.classList.add("selected");

  const canColor = !!(window.currentFolderCaps && window.currentFolderCaps.canRename);

  const menuItems = [
    {
      label: t("create_folder"), action: () => {
        const modal = document.getElementById("createFolderModal");
        const input = document.getElementById("newFolderName");
        if (modal) modal.style.display = "block";
        if (input) input.focus();
      }
    },
    { label: t("move_folder"), action: () => openMoveFolderUI(folder) },
    { label: t("rename_folder"), action: () => openRenameFolderModal() },
    ...(canColor ? [{ label: t("color_folder"), action: () => openColorFolderModal(folder) }] : []),
    { label: t("folder_share"), action: () => openFolderShareModal(folder) },
    { label: t("delete_folder"), action: () => openDeleteFolderModal() }
  ];

  showFolderManagerContextMenu(e.pageX, e.pageY, menuItems);
}

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
      menuItem.style.backgroundColor = document.body.classList.contains("dark-mode") ? "#444" : "#f0f0f0";
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

  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.display = "block";
}

export function hideFolderManagerContextMenu() {
  const menu = document.getElementById("folderManagerContextMenu");
  if (menu) menu.style.display = "none";
}

// Delegate contextmenu so it works with dynamically re-rendered breadcrumbs
function bindFolderManagerContextMenu() {
  const tree = document.getElementById("folderTreeContainer");
  if (tree) {
    if (tree._ctxHandler) tree.removeEventListener("contextmenu", tree._ctxHandler, false);
    tree._ctxHandler = (e) => {
      const onOption = e.target.closest(".folder-option");
      if (!onOption) return;
      folderManagerContextMenuHandler(e);
    };
    tree.addEventListener("contextmenu", tree._ctxHandler, false);
  }

  const title = document.getElementById("fileListTitle");
  if (title) {
    if (title._ctxHandler) title.removeEventListener("contextmenu", title._ctxHandler, false);
    title._ctxHandler = (e) => {
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

document.addEventListener("DOMContentLoaded", function () {
  const colorFolderBtn = document.getElementById("colorFolderBtn");
  if (colorFolderBtn) {
    colorFolderBtn.addEventListener("click", () => {
      const selectedFolder = window.currentFolder || "root";
      if (!selectedFolder || selectedFolder === "root") {
        showToast(t('please_select_valid_folder') || "Please select a valid folder.");
        return;
      }
      openColorFolderModal(selectedFolder);
    });
  } else {
    console.warn("colorFolderBtn element not found in the DOM.");
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
        const oldColor = window.folderColorMap[source];
        if (oldColor) {
          try {
            await saveFolderColor(newPath, oldColor);
            await saveFolderColor(source, '');
          } catch (_) { }
        }
        window.currentFolder = newPath;
        loadFileList(window.currentFolder || 'root');
      } else {
        showToast('Error: ' + (data && data.error || 'Move failed'));
      }
    } catch (e) { console.error(e); showToast('Move failed'); }
  });
});
