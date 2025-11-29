// fileListView.js
import {
  escapeHTML,
  debounce,
  buildSearchAndPaginationControls,
  buildFileTableHeader,
  buildFileTableRow,
  buildBottomControls,
  updateFileActionButtons,
  showToast,
  updateRowHighlight,
  toggleRowSelection,
  attachEnterKeyListener
} from './domUtils.js?v={{APP_QVER}}';
import { t } from './i18n.js?v={{APP_QVER}}';
import { bindFileListContextMenu } from './fileMenu.js?v={{APP_QVER}}';
import { openDownloadModal } from './fileActions.js?v={{APP_QVER}}';
import { openTagModal, openMultiTagModal } from './fileTags.js?v={{APP_QVER}}';
import {
  getParentFolder,
  updateBreadcrumbTitle,
  setupBreadcrumbDelegation,
  showFolderManagerContextMenu,
  hideFolderManagerContextMenu,
  openRenameFolderModal,
  openDeleteFolderModal,
  refreshFolderIcon,
  openColorFolderModal,
  openMoveFolderUI,
  folderSVG
} from './folderManager.js?v={{APP_QVER}}';
import { openFolderShareModal } from './folderShareModal.js?v={{APP_QVER}}';
import {
  folderDragOverHandler,
  folderDragLeaveHandler,
  folderDropHandler
} from './fileDragDrop.js?v={{APP_QVER}}';

export let fileData = [];
export let sortOrder = { column: "uploaded", ascending: true };


const FOLDER_STRIP_PAGE_SIZE = 50;
// onnlyoffice
let OO_ENABLED = false;
let OO_EXTS = new Set();

export async function initOnlyOfficeCaps() {
  try {
    const r = await fetch('/api/onlyoffice/status.php', { credentials: 'include' });
    if (!r.ok) throw 0;
    const j = await r.json();
    OO_ENABLED = !!j.enabled;
    OO_EXTS = new Set(Array.isArray(j.exts) ? j.exts : []);
  } catch {
    OO_ENABLED = false;
    OO_EXTS = new Set();
  }
}

function wireFolderStripItems(strip) {
  if (!strip) return;

  // Click / DnD / context menu
  strip.querySelectorAll(".folder-item").forEach(el => {
    // 1) click to navigate
    el.addEventListener("click", () => {
      const dest = el.dataset.folder;
      if (!dest) return;

      window.currentFolder = dest;
      localStorage.setItem("lastOpenedFolder", dest);
      updateBreadcrumbTitle(dest);

      document.querySelectorAll(".folder-option.selected")
        .forEach(o => o.classList.remove("selected"));
      document
        .querySelector(`.folder-option[data-folder="${dest}"]`)
        ?.classList.add("selected");

      loadFileList(dest);
    });

    // 2) drag & drop
    el.addEventListener("dragover", folderDragOverHandler);
    el.addEventListener("dragleave", folderDragLeaveHandler);
    el.addEventListener("drop", folderDropHandler);

    // 3) right-click context menu
    el.addEventListener("contextmenu", e => {
      e.preventDefault();
      e.stopPropagation();

      const dest = el.dataset.folder;
      if (!dest) return;

      window.currentFolder = dest;
      localStorage.setItem("lastOpenedFolder", dest);

      strip.querySelectorAll(".folder-item.selected")
        .forEach(i => i.classList.remove("selected"));
      el.classList.add("selected");

      const menuItems = [
        {
          label: t("create_folder"),
          action: () => document.getElementById("createFolderModal").style.display = "block"
        },
        {
          label: t("move_folder"),
          action: () => openMoveFolderUI()
        },
        {
          label: t("rename_folder"),
          action: () => openRenameFolderModal()
        },
        {
          label: t("color_folder"),
          action: () => openColorFolderModal(dest)
        },
        {
          label: t("folder_share"),
          action: () => openFolderShareModal(dest)
        },
        {
          label: t("delete_folder"),
          action: () => openDeleteFolderModal()
        }
      ];
      showFolderManagerContextMenu(e.pageX, e.pageY, menuItems);
    });
  });

  // Close menu when clicking elsewhere
  document.addEventListener("click", hideFolderManagerContextMenu);

  // Folder icons
  strip.querySelectorAll(".folder-item").forEach(el => {
    const full = el.getAttribute('data-folder');
    if (full) attachStripIconAsync(el, full, 48);
  });
}

function renderFolderStripPaged(strip, subfolders) {
  if (!strip) return;

  if (!window.showFoldersInList || !subfolders.length) {
    strip.style.display = "none";
    strip.innerHTML = "";
    return;
  }

  const total = subfolders.length;
  const pageSize = FOLDER_STRIP_PAGE_SIZE;
  const totalPages = Math.ceil(total / pageSize);

  function drawPage(page) {
    const endIdx = Math.min(page * pageSize, total);
    const visible = subfolders.slice(0, endIdx);

    let html = visible.map(sf => `
      <div class="folder-item"
           data-folder="${sf.full}"
           draggable="true">
        <span class="folder-svg"></span>
        <div class="folder-name">
          ${escapeHTML(sf.name)}
        </div>
      </div>
    `).join("");

    if (endIdx < total) {
      html += `
        <button type="button"
                class="folder-strip-load-more">
          ${t('load_more_folders') || t('load_more') || 'Load more folders'}
        </button>
      `;
    }

    strip.innerHTML = html;

    applyFolderStripLayout(strip);
    wireFolderStripItems(strip);

    const loadMoreBtn = strip.querySelector(".folder-strip-load-more");
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        drawPage(page + 1);
      });
    }
  }

  drawPage(1);
}

// helper to repaint one strip item quickly
function repaintStripIcon(folder) {
  const el = document.querySelector(`#folderStripContainer .folder-item[data-folder="${CSS.escape(folder)}"]`);
  if (!el) return;
  const iconSpan = el.querySelector('.folder-svg');
  if (!iconSpan) return;

  const hex = (window.folderColorMap && window.folderColorMap[folder]) || '#f6b84e';
  const front = hex;
  const back = _lighten(hex, 14);
  const stroke = _darken(hex, 22);
  el.style.setProperty('--filr-folder-front', front);
  el.style.setProperty('--filr-folder-back', back);
  el.style.setProperty('--filr-folder-stroke', stroke);

  const kind = iconSpan.dataset.kind || 'empty';
  iconSpan.innerHTML = folderSVG(kind);
}

function applyFolderStripLayout(strip) {
  if (!strip) return;
  const hasItems = strip.querySelector('.folder-item') !== null;
  if (!hasItems) {
    strip.style.display = 'none';
    strip.classList.remove('folder-strip-mobile', 'folder-strip-desktop');
    return;
  }

  const isMobile = window.innerWidth <= 640; // tweak breakpoint if you want

  strip.classList.add('folder-strip-container');
  strip.classList.toggle('folder-strip-mobile', isMobile);
  strip.classList.toggle('folder-strip-desktop', !isMobile);

  strip.style.display = isMobile ? 'block' : 'flex';
  strip.style.overflowX = isMobile ? 'visible' : 'auto';
  strip.style.overflowY = isMobile ? 'auto' : 'hidden';
}

window.addEventListener('resize', () => {
  const strip = document.getElementById('folderStripContainer');
  if (strip) applyFolderStripLayout(strip);
});

// Listen once: update strip + tree + inline rows when folder color changes
window.addEventListener('folderColorChanged', (e) => {
  const { folder } = e.detail || {};
  if (!folder) return;

  // 1) Update the strip (if that folder is currently shown)
  repaintStripIcon(folder);

  // 2) Refresh the tree icon (existing function)
  try { refreshFolderIcon(folder); } catch { }

  // 3) Repaint any inline folder rows in the file table
  try {
    const safeFolder = CSS.escape(folder);
    document
      .querySelectorAll(`#fileList tr.folder-row[data-folder="${safeFolder}"]`)
      .forEach(row => {
        // reuse the same helper we used when injecting inline rows
        attachStripIconAsync(row, folder, 28);
      });
  } catch {
    // CSS.escape might not exist on very old browsers; fail silently
  }
});

// Hide "Edit" for files >10 MiB
const MAX_EDIT_BYTES = 10 * 1024 * 1024;

// Latest-response-wins guard (prevents double render/flicker if loadFileList gets called twice)
let __fileListReqSeq = 0;

window.itemsPerPage = parseInt(
  localStorage.getItem('itemsPerPage') || window.itemsPerPage || '50',
  10
);
window.currentPage = window.currentPage || 1;
window.viewMode = localStorage.getItem("viewMode") || "table";
window.currentSubfolders = window.currentSubfolders || [];

// Default folder display settings from localStorage
try {
  const storedStrip  = localStorage.getItem('showFoldersInList');
  const storedInline = localStorage.getItem('showInlineFolders');

  window.showFoldersInList = storedStrip === null ? true : storedStrip === 'true';
  window.showInlineFolders = storedInline === null ? true : storedInline === 'true';
} catch {
  // if localStorage blows up, fall back to both enabled
  window.showFoldersInList = true;
  window.showInlineFolders = true;
}

// Global flag for advanced search mode.
window.advancedSearchEnabled = false;

// --- Folder stats cache (for isEmpty.php) ---
const _folderStatsCache = new Map();

function fetchFolderStats(folder) {
  if (!folder) return Promise.resolve(null);

  if (_folderStatsCache.has(folder)) {
    return _folderStatsCache.get(folder);
  }

  const url = `/api/folder/isEmpty.php?folder=${encodeURIComponent(folder)}&t=${Date.now()}`;
  const p = _fetchJSONWithTimeout(url, 2500)
    .catch(() => ({ folders: 0, files: 0 }))
    .finally(() => {
      // keep the resolved value; the Promise itself stays in the map
    });

  _folderStatsCache.set(folder, p);
  return p;
}

/* ===========================================================
   SECURITY: build file URLs only via the API (no /uploads)
   =========================================================== */
function apiFileUrl(folder, name, inline = false) {
  const f = folder && folder !== "root" ? folder : "root";
  const q = new URLSearchParams({
    folder: f,
    file: name,
    inline: inline ? "1" : "0",
    t: String(Date.now()) // cache-bust
  });
  return `/api/file/download.php?${q.toString()}`;
}

// Wire "select all" header checkbox for the current table render
function wireSelectAll(fileListContent) {
  // Be flexible about how the header checkbox is identified
  const selectAll = fileListContent.querySelector(
    'thead input[type="checkbox"].select-all, ' +
    'thead .select-all input[type="checkbox"], ' +
    'thead input#selectAll, ' +
    'thead input#selectAllCheckbox, ' +
    'thead input[data-select-all]'
  );
  if (!selectAll) return;

  const getRowCbs = () =>
    Array.from(fileListContent.querySelectorAll('tbody .file-checkbox'))
      .filter(cb => !cb.disabled);

  // Toggle all rows when the header checkbox changes
  selectAll.addEventListener('change', () => {
    const checked = selectAll.checked;
    getRowCbs().forEach(cb => {
      cb.checked = checked;
      updateRowHighlight(cb);
    });
    updateFileActionButtons();
    // No indeterminate state when explicitly toggled
    selectAll.indeterminate = false;
  });

  // Keep header checkbox state in sync with row selections
  const syncHeader = () => {
    const cbs = getRowCbs();
    const total = cbs.length;
    const checked = cbs.filter(cb => cb.checked).length;
    if (!total) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
      return;
    }
    selectAll.checked = checked === total;
    selectAll.indeterminate = checked > 0 && checked < total;
  };

  // Listen for any row checkbox changes to refresh header state
  fileListContent.addEventListener('change', (e) => {
    if (e.target && e.target.classList.contains('file-checkbox')) {
      syncHeader();
    }
  });

  // Initial sync on mount
  syncHeader();
}

// ---- Folder-strip icon helpers (same geometry as tree, but colored inline) ----
function _hexToHsl(hex) {
  hex = String(hex || '').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > .5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}
function _hslToHex(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  const f = n => {
    const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return '#' + f(0) + f(8) + f(4);
}
function _lighten(hex, amt = 14) { const { h, s, l } = _hexToHsl(hex); return _hslToHex(h, s, Math.min(100, l + amt)); }
function _darken(hex, amt = 22) { const { h, s, l } = _hexToHsl(hex); return _hslToHex(h, s, Math.max(0, l - amt)); }


// tiny fetch helper with timeout for folder counts
function _fetchJSONWithTimeout(url, ms = 2500) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { credentials: 'include', signal: ctrl.signal })
    .then(r => r.ok ? r.json() : { folders: 0, files: 0 })
    .catch(() => ({ folders: 0, files: 0 }))
    .finally(() => clearTimeout(tid));
}

// Paint initial icon, then flip to "paper" if non-empty
function attachStripIconAsync(hostEl, fullPath, size = 28) {
  const hex = (window.folderColorMap && window.folderColorMap[fullPath]) || '#f6b84e';
  const front = hex;
  const back = _lighten(hex, 14);
  const stroke = _darken(hex, 22);

  hostEl.style.setProperty('--filr-folder-front', front);
  hostEl.style.setProperty('--filr-folder-back', back);
  hostEl.style.setProperty('--filr-folder-stroke', stroke);

  const iconSpan = hostEl.querySelector('.folder-svg');
  if (!iconSpan) return;

  // 1) initial "empty" icon
  iconSpan.dataset.kind = 'empty';
  iconSpan.innerHTML = folderSVG('empty');

  // make sure this brand-new SVG is sized correctly
  try { syncFolderIconSizeToRowHeight(); } catch {}

  fetchFolderStats(fullPath)
  .then(stats => {
    if (!stats) return;
    const folders = Number.isFinite(stats.folders) ? stats.folders : 0;
    const files   = Number.isFinite(stats.files)   ? stats.files   : 0;

    if ((folders + files) > 0 && iconSpan.dataset.kind !== 'paper') {
      iconSpan.dataset.kind = 'paper';
      iconSpan.innerHTML = folderSVG('paper');
      try { syncFolderIconSizeToRowHeight(); } catch {}
    }
  })
  .catch(() => {});
}

/* -----------------------------
   Helper: robust JSON handling
   ----------------------------- */
// Parse JSON if possible; throw on non-2xx with useful message & status
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

// --- Folder capabilities + owner cache ----------------------
const _folderCapsCache  = new Map();

async function fetchFolderCaps(folder) {
  if (!folder) return null;
  if (_folderCapsCache.has(folder)) {
    return _folderCapsCache.get(folder);
  }
  try {
    const res  = await fetch(
      `/api/folder/capabilities.php?folder=${encodeURIComponent(folder)}`,
      { credentials: 'include' }
    );
    const data = await safeJson(res);
    _folderCapsCache.set(folder, data || null);

    if (data && (data.owner || data.user)) {
      _folderOwnerCache.set(folder, data.owner || data.user || "");
    }
    return data || null;
  } catch {
    _folderCapsCache.set(folder, null);
    return null;
  }
}

// --- Folder owner cache + helper ----------------------
const _folderOwnerCache = new Map();

async function fetchFolderOwner(folder) {
  if (!folder) return "";
  if (_folderOwnerCache.has(folder)) {
    return _folderOwnerCache.get(folder);
  }

  try {
    const res = await fetch(
      `/api/folder/capabilities.php?folder=${encodeURIComponent(folder)}`,
      { credentials: 'include' }
    );
    const data = await safeJson(res);
    const owner = data && (data.owner || data.user || "");
    _folderOwnerCache.set(folder, owner || "");
    return owner || "";
  } catch {
    _folderOwnerCache.set(folder, "");
    return "";
  }
}
// ---- Viewed badges (table + gallery) ----
// ---------- Badge factory (center text vertically) ----------
function makeBadge(state) {
  if (!state) return null;
  const el = document.createElement('span');
  el.className = 'status-badge';
  el.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    'vertical-align:middle',
    'margin-left:6px',
    'padding:2px 8px',
    'min-height:18px',
    'line-height:1',
    'border-radius:999px',
    'font-size:.78em',
    'border:1px solid rgba(0,0,0,.2)',
    'background:rgba(0,0,0,.06)'
  ].join(';');

  if (state.completed) {
    el.classList.add('watched');
    el.textContent = (t('watched') || t('viewed') || 'Watched');
    el.style.borderColor = 'rgba(34,197,94,.45)';
    el.style.background = 'rgba(34,197,94,.15)';
    el.style.color = '#22c55e';
    return el;
  }

  if (Number.isFinite(state.seconds) && Number.isFinite(state.duration) && state.duration > 0) {
    const pct = Math.max(1, Math.min(99, Math.round((state.seconds / state.duration) * 100)));
    el.classList.add('progress');
    el.textContent = `${pct}%`;
    el.style.borderColor = 'rgba(234,88,12,.55)';
    el.style.background = 'rgba(234,88,12,.18)';
    el.style.color = '#ea580c';
    return el;
  }

  return null;
}

// ---------- Public: set/clear badges for one file (table + gallery) ----------
function applyBadgeToDom(name, state) {
  const safe = CSS.escape(name);

  // Table
  document.querySelectorAll(`tr[data-file-name="${safe}"] .name-cell, tr[data-file-name="${safe}"] .file-name-cell`)
    .forEach(cell => {
      cell.querySelector('.status-badge')?.remove();
      const b = makeBadge(state);
      if (b) cell.appendChild(b);
    });

  // Gallery
  document.querySelectorAll(`.gallery-card[data-file-name="${safe}"] .gallery-file-name`)
    .forEach(title => {
      title.querySelector('.status-badge')?.remove();
      const b = makeBadge(state);
      if (b) title.appendChild(b);
    });
}

export function setFileWatchedBadge(name, watched = true) {
  applyBadgeToDom(name, watched ? { completed: true } : null);
}

export function setFileProgressBadge(name, seconds, duration) {
  if (duration > 0 && seconds >= 0) {
    applyBadgeToDom(name, { seconds, duration, completed: seconds >= duration - 1 });
  } else {
    applyBadgeToDom(name, null);
  }
}

export async function refreshViewedBadges(folder) {
  let map = null;
  try {
    const res = await fetch(`/api/media/getViewedMap.php?folder=${encodeURIComponent(folder)}&t=${Date.now()}`, { credentials: 'include' });
    const j = await res.json();
    map = j?.map || null;
  } catch { /* ignore */ }

  // Clear any existing badges
  document.querySelectorAll(
    '#fileList tr[data-file-name] .file-name-cell .status-badge, ' +
    '#fileList tr[data-file-name] .name-cell .status-badge, ' +
    '.gallery-card[data-file-name] .gallery-file-name .status-badge'
  ).forEach(n => n.remove());

  if (!map) return;

  // Table rows
  document.querySelectorAll('#fileList tr[data-file-name]').forEach(tr => {
    const name = tr.getAttribute('data-file-name');
    const state = map[name];
    if (!state) return;
    const cell = tr.querySelector('.name-cell, .file-name-cell');
    if (!cell) return;
    const badge = makeBadge(state);
    if (badge) cell.appendChild(badge);
  });

  // Gallery cards
  document.querySelectorAll('.gallery-card[data-file-name]').forEach(card => {
    const name = card.getAttribute('data-file-name');
    const state = map[name];
    if (!state) return;
    const title = card.querySelector('.gallery-file-name');
    if (!title) return;
    const badge = makeBadge(state);
    if (badge) title.appendChild(badge);
  });
}
/**
 * Convert a file size string (e.g. "456.9KB", "1.2 MB", "1024") into bytes.
 */
function parseSizeToBytes(sizeStr) {
  if (!sizeStr) return 0;
  let s = sizeStr.trim();
  let value = parseFloat(s);
  let upper = s.toUpperCase();
  if (upper.includes("KB")) {
    value *= 1024;
  } else if (upper.includes("MB")) {
    value *= 1024 * 1024;
  } else if (upper.includes("GB")) {
    value *= 1024 * 1024 * 1024;
  }
  return value;
}

/**
 * Format the total bytes as a human-readable string.
 */
function formatSize(totalBytes) {
  if (totalBytes < 1024) {
    return totalBytes + " Bytes";
  } else if (totalBytes < 1024 * 1024) {
    return (totalBytes / 1024).toFixed(2) + " KB";
  } else if (totalBytes < 1024 * 1024 * 1024) {
    return (totalBytes / (1024 * 1024)).toFixed(2) + " MB";
  } else {
    return (totalBytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  }
}

/**
 * Build the folder summary HTML using the filtered file list.
 */
function buildFolderSummary(filteredFiles) {
  const totalFiles = filteredFiles.length;
  const totalBytes = filteredFiles.reduce((sum, file) => {
    return sum + parseSizeToBytes(file.size);
  }, 0);
  const sizeStr = formatSize(totalBytes);
  return `<strong>${t('total_files')}:</strong> ${totalFiles} &nbsp;|&nbsp; <strong>${t('total_size')}:</strong> ${sizeStr}`;
}

/**
 * Advanced Search toggle
 */
function toggleAdvancedSearch() {
  window.advancedSearchEnabled = !window.advancedSearchEnabled;
  const advancedBtn = document.getElementById("advancedSearchToggle");
  if (advancedBtn) {
    advancedBtn.textContent = window.advancedSearchEnabled ? "Basic Search" : "Advanced Search";
  }
  renderFileTable(window.currentFolder);
}

window.imageCache = window.imageCache || {};
function cacheImage(imgElem, key) {
  window.imageCache[key] = imgElem.src;
}
window.cacheImage = cacheImage;

/**
 * Fuse.js fuzzy search helper
 */
// --- Lazy Fuse loader (drop-in, CSP-safe, no inline) ---
const FUSE_SRC = '/vendor/fuse/6.6.2/fuse.min.js?v={{APP_QVER}}';
let _fuseLoadingPromise = null;

function loadScriptOnce(src) {
  // cache by src so we don't append multiple <script> tags
  if (loadScriptOnce._cache?.has(src)) return loadScriptOnce._cache.get(src);
  loadScriptOnce._cache = loadScriptOnce._cache || new Map();
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
  loadScriptOnce._cache.set(src, p);
  return p;
}

function lazyLoadFuse() {
  if (window.Fuse) return Promise.resolve(window.Fuse);
  if (!_fuseLoadingPromise) {
    _fuseLoadingPromise = loadScriptOnce(FUSE_SRC).then(() => window.Fuse);
  }
  return _fuseLoadingPromise;
}

// (Optional) warm-up call you can trigger from main.js after first render:
//   import { warmUpSearch } from './fileListView.js?v={{APP_QVER}}';
//   warmUpSearch();
// This just starts fetching Fuse in the background.
export function warmUpSearch() {
  lazyLoadFuse().catch(() => {/* ignore; we’ll fall back */ });
}

// Lazy + backward-compatible search
function searchFiles(searchTerm) {
  if (!searchTerm) return fileData;

  // kick off Fuse load in the background, but don't await
  lazyLoadFuse().catch(() => { /* ignore */ });

  // keys config (matches your original)
  const fuseKeys = [
    { name: 'name', weight: 0.1 },
    { name: 'uploader', weight: 0.1 },
    { name: 'tags.name', weight: 0.1 }
  ];
  if (window.advancedSearchEnabled) {
    fuseKeys.push({ name: 'content', weight: 0.7 });
  }

  // If Fuse is present, use it right away (synchronous API)
  if (window.Fuse) {
    const options = {
      keys: fuseKeys,
      threshold: 0.4,
      minMatchCharLength: 2,
      ignoreLocation: true
    };
    const fuse = new window.Fuse(fileData, options);
    const results = fuse.search(searchTerm);
    return results.map(r => r.item);
  }

  // Fallback (first keystrokes before Fuse finishes loading):
  // simple case-insensitive substring match on the same fields
  const q = String(searchTerm).toLowerCase();
  const hay = (v) => (v == null ? '' : String(v)).toLowerCase();
  return fileData.filter(item => {
    if (hay(item.name).includes(q)) return true;
    if (hay(item.uploader).includes(q)) return true;
    if (Array.isArray(item.tags) && item.tags.some(t => hay(t?.name).includes(q))) return true;
    if (window.advancedSearchEnabled && hay(item.content).includes(q)) return true;
    return false;
  });
}

/**
 * View mode toggle
 */
export function createViewToggleButton() {
  let toggleBtn = document.getElementById("toggleViewBtn");
  if (!toggleBtn) {
    toggleBtn = document.createElement("button");
    toggleBtn.id = "toggleViewBtn";
    toggleBtn.classList.add("btn", "btn-toggleview");

    if (window.viewMode === "gallery") {
      toggleBtn.innerHTML = '<i class="material-icons">view_list</i>';
      toggleBtn.title = t("switch_to_table_view");
    } else {
      toggleBtn.innerHTML = '<i class="material-icons">view_module</i>';
      toggleBtn.title = t("switch_to_gallery_view");
    }

    const headerButtons = document.querySelector(".header-buttons");
    if (headerButtons && headerButtons.lastElementChild) {
      headerButtons.insertBefore(toggleBtn, headerButtons.lastElementChild);
    } else if (headerButtons) {
      headerButtons.appendChild(toggleBtn);
    }
  }

  toggleBtn.onclick = () => {
    window.viewMode = window.viewMode === "gallery" ? "table" : "gallery";
    localStorage.setItem("viewMode", window.viewMode);
    loadFileList(window.currentFolder);
    if (window.viewMode === "gallery") {
      toggleBtn.innerHTML = '<i class="material-icons">view_list</i>';
      toggleBtn.title = t("switch_to_table_view");
    } else {
      toggleBtn.innerHTML = '<i class="material-icons">view_module</i>';
      toggleBtn.title = t("switch_to_gallery_view");
    }
  };

  return toggleBtn;
}

export function formatFolderName(folder) {
  if (folder === "root") return "(Root)";
  return folder
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}

// Expose inline DOM helpers.
window.toggleRowSelection = toggleRowSelection;
window.updateRowHighlight = updateRowHighlight;

export async function loadFileList(folderParam) {
  await initOnlyOfficeCaps();
  const reqId = ++__fileListReqSeq; // latest call wins
  const folder = folderParam || "root";
  const fileListContainer = document.getElementById("fileList");
  const actionsContainer = document.getElementById("fileListActions");

  // 1) show loader (only this request is allowed to render)
  fileListContainer.style.visibility = "hidden";
  fileListContainer.innerHTML = "<div class='loader'>Loading files...</div>";

  try {
    // Kick off both in parallel, but render as soon as FILES are ready
    const filesPromise = fetch(
      `/api/file/getFileList.php?folder=${encodeURIComponent(folder)}&recursive=1&t=${Date.now()}`,
      { credentials: 'include' }
    );
    const foldersPromise = fetch(
      `/api/folder/getFolderList.php?folder=${encodeURIComponent(folder)}`,
      { credentials: 'include' }
    );

    // ----- FILES FIRST -----
    const filesRes = await filesPromise;

    if (filesRes.status === 401) {
      // session expired — bounce to logout
      window.location.href = "/api/auth/logout.php";
      throw new Error("Unauthorized");
    }
    if (filesRes.status === 403) {
      // forbidden — friendly message, keep UI responsive
      fileListContainer.innerHTML = `
          <div class="empty-state">
            ${t("no_access_to_resource") || "You don't have access to this folder."}
          </div>`;
      showToast(t("no_access_to_resource") || "You don't have access to this folder.", "error");
      return [];
    }

    const data = await safeJson(filesRes);
    if (data.error) {
      throw new Error(typeof data.error === 'string' ? data.error : 'Server returned an error.');
    }

    // If another loadFileList ran after this one, bail before touching the DOM
    if (reqId !== __fileListReqSeq) return [];

    // 3) clear loader
    fileListContainer.innerHTML = "";

    // 4) handle “no files” case
    if (!data.files || Object.keys(data.files).length === 0) {
      if (reqId !== __fileListReqSeq) return [];
      fileListContainer.innerHTML = `
          <div class="empty-state">
            ${t("no_files_found")}
            <div style="margin-top:6px;font-size:.9em;color:#777">
              ${t("no_folder_access_yet") || "No folder access has been assigned to your account yet."}
            </div>
          </div>`;

      const summaryElem = document.getElementById("fileSummary");
      if (summaryElem) summaryElem.style.display = "none";
      const sliderContainer = document.getElementById("viewSliderContainer");
      if (sliderContainer) sliderContainer.style.display = "none";

      const strip = document.getElementById("folderStripContainer");
      if (strip) strip.style.display = "none";

      updateFileActionButtons();
      fileListContainer.style.visibility = "visible";
      // We still try to populate the folder strip below
    }

    // 5) normalize files array
    if (!Array.isArray(data.files)) {
      data.files = Object.entries(data.files).map(([name, meta]) => {
        meta.name = name;
        return meta;
      });
    }

    data.files = data.files.map(f => {
      f.fullName = (f.path || f.name).trim().toLowerCase();

      // Prefer numeric size if API provides it; otherwise parse the "1.2 MB" string
      let bytes = Number.isFinite(f.sizeBytes)
        ? f.sizeBytes
        : parseSizeToBytes(String(f.size || ""));

      if (!Number.isFinite(bytes)) bytes = Infinity;

      f.editable = canEditFile(f.name) && (bytes <= MAX_EDIT_BYTES);
      f.folder = folder;
      return f;
    });
    fileData = data.files;

    if (reqId !== __fileListReqSeq) return [];

    // 6) inject summary + slider
    if (actionsContainer) {
      // a) summary
      let summaryElem = document.getElementById("fileSummary");
      if (!summaryElem) {
        summaryElem = document.createElement("div");
        summaryElem.id = "fileSummary";
        summaryElem.style.cssText = "float:right; margin:0 30px 0 auto; font-size:0.9em;";
        actionsContainer.appendChild(summaryElem);
      }
      summaryElem.style.display = "block";
      summaryElem.innerHTML = buildFolderSummary(fileData);

      // b) slider
      const viewMode = window.viewMode || "table";
      let sliderContainer = document.getElementById("viewSliderContainer");
      if (!sliderContainer) {
        sliderContainer = document.createElement("div");
        sliderContainer.id = "viewSliderContainer";
        sliderContainer.style.cssText = "display:inline-flex; align-items:center; margin-right:auto; font-size:0.9em;";
        actionsContainer.insertBefore(sliderContainer, summaryElem);
      } else {
        sliderContainer.style.display = "inline-flex";
      }

      if (viewMode === "gallery") {
        const w = window.innerWidth;
        let maxCols;
        if (w < 600) maxCols = 1;
        else if (w < 900) maxCols = 2;
        else if (w < 1200) maxCols = 4;
        else maxCols = 6;

        const currentCols = Math.min(
          parseInt(localStorage.getItem("galleryColumns") || "3", 10),
          maxCols
        );

        sliderContainer.innerHTML = `
            <label for="galleryColumnsSlider" style="margin-right:8px;line-height:1;">
              ${t("columns")}:
            </label>
            <input
              type="range"
              id="galleryColumnsSlider"
              min="1"
              max="${maxCols}"
              value="${currentCols}"
              style="vertical-align:middle;"
            >
            <span id="galleryColumnsValue" style="margin-left:6px;line-height:1;">${currentCols}</span>
          `;
        const gallerySlider = document.getElementById("galleryColumnsSlider");
        const galleryValue = document.getElementById("galleryColumnsValue");
        gallerySlider.oninput = e => {
          const v = +e.target.value;
          localStorage.setItem("galleryColumns", v);
          galleryValue.textContent = v;
          document.querySelector(".gallery-container")
            ?.style.setProperty("grid-template-columns", `repeat(${v},1fr)`);
        };
      } else {
        const currentHeight = parseInt(localStorage.getItem("rowHeight") || "48", 10);
        sliderContainer.innerHTML = `
            <label for="rowHeightSlider" style="margin-right:8px;line-height:1;">
              ${t("row_height")}:
            </label>
            <input type="range" id="rowHeightSlider" min="30" max="60" value="${currentHeight}" style="vertical-align:middle;">
            <span id="rowHeightValue" style="margin-left:6px;line-height:1;">${currentHeight}px</span>
          `;
        const rowSlider = document.getElementById("rowHeightSlider");
        const rowValue = document.getElementById("rowHeightValue");
        rowSlider.oninput = e => {
          const v = e.target.value;
          document.documentElement.style.setProperty("--file-row-height", v + "px");
          localStorage.setItem("rowHeight", v);
          rowValue.textContent = v + "px";
            // mark compact mode for very low heights
  if (v <= 32) {
    document.documentElement.setAttribute('data-row-compact', '1');
  } else {
    document.documentElement.removeAttribute('data-row-compact');
  }
          syncFolderIconSizeToRowHeight();
        };
      }
    }

    // 7) render files
    if (reqId !== __fileListReqSeq) return [];

    if (window.viewMode === "gallery") {
      renderGalleryView(folder);
    } else {
      renderFileTable(folder);
    }
    updateFileActionButtons();
    fileListContainer.style.visibility = "visible";


    // ----- FOLDERS NEXT (populate strip when ready; doesn't block rows) -----
    try {
      const foldersRes = await foldersPromise;
      // If folders API forbids, just skip the strip; keep file rows rendered
      if (foldersRes.status === 403) {
        const strip = document.getElementById("folderStripContainer");
        if (strip) strip.style.display = "none";
        return data.files;
      }

      const folderRaw = await safeJson(foldersRes).catch(() => []); // don't block file render on strip issues
      if (reqId !== __fileListReqSeq) return data.files;

      // --- build ONLY the *direct* children of current folder ---
      let subfolders = [];
      const hidden = new Set(["profile_pics", "trash"]);
      if (Array.isArray(folderRaw)) {
        const allPaths = folderRaw.map(item => item.folder ?? item);
        const depth = folder === "root" ? 1 : folder.split("/").length + 1;
        subfolders = allPaths
          .filter(p => {
            if (folder === "root") return p.indexOf("/") === -1;
            if (!p.startsWith(folder + "/")) return false;
            return p.split("/").length === depth;
          })
          .map(p => ({ name: p.split("/").pop(), full: p }));
      }

      subfolders = subfolders.filter(sf => {
        const lower = (sf.name || "").toLowerCase();
        return !hidden.has(lower) && !lower.startsWith("resumable_");
      });

      // Expose for inline folder rows in table view
      window.currentSubfolders = subfolders;

      let strip = document.getElementById("folderStripContainer");
      if (!strip) {
        strip = document.createElement("div");
        strip.id = "folderStripContainer";
        strip.className = "folder-strip-container";
        actionsContainer.parentNode.insertBefore(strip, actionsContainer);
      }

      // NEW: paged + responsive strip
      renderFolderStripPaged(strip, subfolders);

      // Re-render table view once folders are known so they appear inline above files
      if (window.viewMode === "table" && reqId === __fileListReqSeq) {
        renderFileTable(folder);
      }
    } catch {
      // ignore folder errors; rows already rendered
    }

    return data.files;

  } catch (err) {
    console.error("Error loading file list:", err);
    if (err.status === 403) {
      showToast(t("no_access_to_resource") || "You don't have access to this folder.", "error");
      const fileListContainer = document.getElementById("fileList");
      if (fileListContainer) fileListContainer.textContent = t("no_access_to_resource") || "You don't have access to this folder.";
    } else if (err.message !== "Unauthorized") {
      const fileListContainer = document.getElementById("fileList");
      if (fileListContainer) fileListContainer.textContent = "Error loading files.";
    }
    return [];
  } finally {
    if (reqId === __fileListReqSeq) {
      fileListContainer.style.visibility = "visible";
    }
  }
}


function injectInlineFolderRows(fileListContent, folder, pageSubfolders) {
  const table = fileListContent.querySelector('table.filr-table');

  // Use the paged subfolders if provided, otherwise fall back to all
  const subfolders = Array.isArray(pageSubfolders) && pageSubfolders.length
    ? pageSubfolders
    : (Array.isArray(window.currentSubfolders) ? window.currentSubfolders : []);

  if (!table || !subfolders.length) return;

  const thead = table.tHead;
  const tbody = table.tBodies && table.tBodies[0];
  if (!thead || !tbody) return;

  const headerRow = thead.rows[0];
  if (!headerRow) return;

  const headerCells = Array.from(headerRow.cells);
  const colCount = headerCells.length;

  // --- Column indices -------------------------------------------------------
  let checkboxIdx = headerCells.findIndex(th =>
    th.classList.contains("checkbox-col") ||
    th.querySelector('input[type="checkbox"]')
  );

  let nameIdx = headerCells.findIndex(th =>
    (th.dataset && th.dataset.column === "name") ||
    /\bname\b/i.test((th.textContent || "").trim())
  );
  if (nameIdx < 0) {
    nameIdx = Math.min(1, colCount - 1); // fallback to 2nd col
  }

  let sizeIdx = headerCells.findIndex(th =>
    (th.dataset && (th.dataset.column === "size" || th.dataset.column === "filesize")) ||
    /\bsize\b/i.test((th.textContent || "").trim())
  );
  if (sizeIdx < 0) sizeIdx = -1;

  let uploaderIdx = headerCells.findIndex(th =>
    (th.dataset && th.dataset.column === "uploader") ||
    /\buploader\b/i.test((th.textContent || "").trim())
  );
  if (uploaderIdx < 0) uploaderIdx = -1;

  let actionsIdx = headerCells.findIndex(th =>
    (th.dataset && th.dataset.column === "actions") ||
    /\bactions?\b/i.test((th.textContent || "").trim()) ||
    /\bactions?-col\b/i.test(th.className || "")
  );
  if (actionsIdx < 0) actionsIdx = -1;

    // NEW: created / modified column indices (uploaded = created in your header)
    let createdIdx = headerCells.findIndex(th =>
      (th.dataset && (th.dataset.column === "uploaded" || th.dataset.column === "created")) ||
      /\b(uploaded|created)\b/i.test((th.textContent || "").trim())
    );
    if (createdIdx < 0) createdIdx = -1;
  
    let modifiedIdx = headerCells.findIndex(th =>
      (th.dataset && th.dataset.column === "modified") ||
      /\bmodified\b/i.test((th.textContent || "").trim())
    );
    if (modifiedIdx < 0) modifiedIdx = -1;

  // Remove any previous folder rows
  tbody.querySelectorAll("tr.folder-row").forEach(tr => tr.remove());


  
  const firstDataRow = tbody.firstElementChild;

  subfolders.forEach(sf => {
    const tr = document.createElement("tr");
    tr.classList.add("folder-row");
    tr.dataset.folder = sf.full;
  
    for (let i = 0; i < colCount; i++) {
      const td = document.createElement("td");

// *** copy header classes so responsive breakpoints match file rows ***
// but strip Bootstrap margin helpers (ml-2 / mx-2) so we don't get a big gap
const headerClass = headerCells[i] && headerCells[i].className;
if (headerClass) {
  td.className = headerClass;
  td.classList.remove("ml-2", "mx-2");
}
  
      // 1) icon / checkbox column
      if (i === checkboxIdx) {
        td.classList.add("folder-icon-cell");
        td.style.textAlign = "left";
        td.style.verticalAlign = "middle";
  
        const iconSpan = document.createElement("span");
        iconSpan.className = "folder-svg folder-row-icon";
        td.appendChild(iconSpan);
  
      // 2) name column
      } else if (i === nameIdx) {
        td.classList.add("name-cell", "file-name-cell", "folder-name-cell");
  
        const wrap = document.createElement("div");
        wrap.className = "folder-row-inner";
  
        const nameSpan = document.createElement("span");
        nameSpan.className = "folder-row-name";
        nameSpan.textContent = sf.name || sf.full;
  
        const metaSpan = document.createElement("span");
        metaSpan.className = "folder-row-meta";
        metaSpan.textContent = ""; // "(15 folders, 19 files)" later
  
        wrap.appendChild(nameSpan);
        wrap.appendChild(metaSpan);
        td.appendChild(wrap);
  
      // 3) size column
      } else if (i === sizeIdx) {
        td.classList.add("folder-size-cell");
        td.textContent = "…"; // placeholder until we load stats
  
      // 4) uploader / owner column
      } else if (i === uploaderIdx) {
        td.classList.add("uploader-cell", "folder-uploader-cell");
        td.textContent = ""; // filled asynchronously with owner
  
      // 5) actions column
    } else if (i === actionsIdx) {
      td.classList.add("folder-actions-cell");
    
      const group = document.createElement("div");
      group.className = "btn-group btn-group-sm folder-actions-group";
      group.setAttribute("role", "group");
group.setAttribute("aria-label", "File actions"); 
    
const makeActionBtn = (iconName, titleKey, btnClass, actionKey, handler) => {
  const btn = document.createElement("button");
  btn.type = "button";

  // base classes – same size as file actions
  btn.className = `btn ${btnClass} py-1`;

  // kill any Bootstrap margin helpers that got passed in
  btn.classList.remove("ml-2", "mx-2");

  btn.setAttribute("data-folder-action", actionKey);
  btn.setAttribute("data-i18n-title", titleKey);
  btn.title = t(titleKey);

  const icon = document.createElement("i");
  icon.className = "material-icons";
  icon.textContent = iconName;
  btn.appendChild(icon);

  btn.addEventListener("click", e => {
    e.stopPropagation();
    window.currentFolder = sf.full;
    try { localStorage.setItem("lastOpenedFolder", sf.full); } catch {}
    handler();
  });

  // start disabled; caps logic will enable
  btn.disabled = true;
  btn.style.pointerEvents = "none";
  btn.style.opacity = "0.5";

  group.appendChild(btn);
};
    
makeActionBtn("drive_file_move",            "move_folder",   "btn-warning folder-move-btn",     "move",   () => openMoveFolderUI());
makeActionBtn("palette",                    "color_folder",  "btn-color-folder","color",  () => openColorFolderModal(sf.full));
makeActionBtn("drive_file_rename_outline",  "rename_folder", "btn-warning folder-rename-btn",     "rename", () => openRenameFolderModal());
makeActionBtn("share",                      "share_folder",  "btn-secondary",   "share",  () => openFolderShareModal(sf.full));
    
      td.appendChild(group);
    }
  
      // IMPORTANT: always append the cell, no matter which column we're in
      tr.appendChild(td);
    }
  
    // click → navigate, same as before
    tr.addEventListener("click", e => {
      if (e.button !== 0) return;
      const dest = sf.full;
      if (!dest) return;
  
      window.currentFolder = dest;
      try { localStorage.setItem("lastOpenedFolder", dest); } catch { }
  
      updateBreadcrumbTitle(dest);
  
      document.querySelectorAll(".folder-option.selected")
        .forEach(o => o.classList.remove("selected"));
      const treeNode = document.querySelector(
        `.folder-option[data-folder="${CSS.escape(dest)}"]`
      );
      if (treeNode) treeNode.classList.add("selected");
  
      const strip = document.getElementById("folderStripContainer");
      if (strip) {
        strip.querySelectorAll(".folder-item.selected")
          .forEach(i => i.classList.remove("selected"));
        const stripItem = strip.querySelector(
          `.folder-item[data-folder="${CSS.escape(dest)}"]`
        );
        if (stripItem) stripItem.classList.add("selected");
      }
  
      loadFileList(dest);
    });
  
    
        // DnD + context menu – keep existing logic, but also add a visual highlight
        tr.addEventListener("dragover", e => {
          folderDragOverHandler(e);
          tr.classList.add("folder-row-droptarget");
        });
    
        tr.addEventListener("dragleave", e => {
          folderDragLeaveHandler(e);
          tr.classList.remove("folder-row-droptarget");
        });
    
        tr.addEventListener("drop", e => {
          folderDropHandler(e);
          tr.classList.remove("folder-row-droptarget");
        });
  
    tr.addEventListener("contextmenu", e => {
      e.preventDefault();
      e.stopPropagation();
  
      const dest = sf.full;
      if (!dest) return;
  
      window.currentFolder = dest;
      try { localStorage.setItem("lastOpenedFolder", dest); } catch { }
  
      const menuItems = [
        { label: t("create_folder"), action: () => document.getElementById("createFolderModal").style.display = "block" },
        { label: t("move_folder"),   action: () => openMoveFolderUI() },
        { label: t("rename_folder"), action: () => openRenameFolderModal() },
        { label: t("color_folder"),  action: () => openColorFolderModal(dest) },
        { label: t("folder_share"),  action: () => openFolderShareModal(dest) },
        { label: t("delete_folder"), action: () => openDeleteFolderModal() }
      ];
      showFolderManagerContextMenu(e.pageX, e.pageY, menuItems);
    });
  
    // insert row above first file row
    tbody.insertBefore(tr, firstDataRow || null);
  
   // ----- ICON: color + alignment (size is driven by row height) -----
attachStripIconAsync(tr, sf.full);
const iconSpan = tr.querySelector(".folder-row-icon");
if (iconSpan) {
  iconSpan.style.display = "inline-flex";
  iconSpan.style.alignItems = "center";
  iconSpan.style.justifyContent = "flex-start";
  iconSpan.style.marginLeft = "0px";   // small left nudge
  iconSpan.style.marginTop  = "0px";   // small down nudge
}
  
    // ----- FOLDER STATS + OWNER + CAPS -----
    const sizeCellIndex    = (sizeIdx    >= 0 && sizeIdx    < tr.cells.length) ? sizeIdx    : -1;
    const nameCellIndex    = (nameIdx    >= 0 && nameIdx    < tr.cells.length) ? nameIdx    : -1;
    const createdCellIndex = (createdIdx >= 0 && createdIdx < tr.cells.length) ? createdIdx : -1;
    const modifiedCellIndex = (modifiedIdx >= 0 && modifiedIdx < tr.cells.length) ? modifiedIdx : -1;
  
    fetchFolderStats(sf.full).then(stats => {
      if (!stats) return;
  
      const foldersCount = Number.isFinite(stats.folders) ? stats.folders : 0;
      const filesCount   = Number.isFinite(stats.files)   ? stats.files   : 0;
            // Try multiple possible size keys so backend + JS can drift a bit
            let bytes = null;
            const sizeCandidates = [
              stats.bytes,
              stats.sizeBytes,
              stats.size,
              stats.totalBytes
            ];
            for (const v of sizeCandidates) {
              const n = Number(v);
              if (Number.isFinite(n) && n >= 0) {
                bytes = n;
                break;
              }
            }
  
      let pieces = [];
      if (foldersCount) pieces.push(`${foldersCount} folder${foldersCount === 1 ? "" : "s"}`);
      if (filesCount)   pieces.push(`${filesCount} file${filesCount === 1 ? "" : "s"}`);
      if (!pieces.length) pieces.push("0 items");
      const countLabel = pieces.join(", ");
  
      if (nameCellIndex >= 0) {
        const nameCell = tr.cells[nameCellIndex];
        if (nameCell) {
          const metaSpan = nameCell.querySelector(".folder-row-meta");
          if (metaSpan) metaSpan.textContent = ` (${countLabel})`;
        }
      }
  
      if (sizeCellIndex >= 0) {
        const sizeCell = tr.cells[sizeCellIndex];
        if (sizeCell) {
          let sizeLabel = "—";
          if (bytes != null && bytes >= 0) {
            sizeLabel = formatSize(bytes);
          }
          sizeCell.textContent = sizeLabel;
          sizeCell.title = `${countLabel}${bytes != null && bytes >= 0 ? " • " + sizeLabel : ""}`;
        }
      }

      if (createdCellIndex >= 0) {
        const createdCell = tr.cells[createdCellIndex];
        if (createdCell) {
          const txt = (stats && typeof stats.earliest_uploaded === 'string')
            ? stats.earliest_uploaded
            : '';
          createdCell.textContent = txt;
        }
      }
      
      if (modifiedCellIndex >= 0) {
        const modCell = tr.cells[modifiedCellIndex];
        if (modCell) {
          const txt = (stats && typeof stats.latest_mtime === 'string')
            ? stats.latest_mtime
            : '';
          modCell.textContent = txt;
        }
      }
    }).catch(() => {
      if (sizeCellIndex >= 0) {
        const sizeCell = tr.cells[sizeCellIndex];
        if (sizeCell && !sizeCell.textContent) sizeCell.textContent = "—";
      }
    });
  
    // OWNER + action permissions
    if (uploaderIdx >= 0 || actionsIdx >= 0) {
      fetchFolderCaps(sf.full).then(caps => {
        if (!caps || !document.body.contains(tr)) return;
  
        if (uploaderIdx >= 0 && uploaderIdx < tr.cells.length) {
          const uploaderCell = tr.cells[uploaderIdx];
          if (uploaderCell) {
            const owner = caps.owner || caps.user || "";
            uploaderCell.textContent = owner || "";
          }
        }
  
        if (actionsIdx >= 0 && actionsIdx < tr.cells.length) {
          const actCell = tr.cells[actionsIdx];
          if (!actCell) return;
  
          actCell.querySelectorAll('button[data-folder-action]').forEach(btn => {
            const action = btn.getAttribute('data-folder-action');
            let enabled = false;
            switch (action) {
              case "move":
                enabled = !!caps.canMoveFolder;
                break;
              case "color":
                enabled = !!caps.canRename;          // same gate as tree “color” button
                break;
              case "rename":
                enabled = !!caps.canRename;
                break;
              case "share":
                enabled = !!caps.canShareFolder;
                break;
            }
            if (enabled === undefined) {
              enabled = true; // fallback so admin still gets buttons even if a flag is missing
            }
            if (enabled) {
              btn.disabled = false;
              btn.style.pointerEvents = "";
              btn.style.opacity = "";
            } else {
              btn.disabled = true;
              btn.style.pointerEvents = "none";
              btn.style.opacity = "0.5";
            }
          });
        }
      }).catch(() => { /* ignore */ });
    }
  });
  syncFolderIconSizeToRowHeight();
}
function syncFolderIconSizeToRowHeight() {
  const cs   = getComputedStyle(document.documentElement);
  const raw  = cs.getPropertyValue('--file-row-height') || '48px';
  const rowH = parseInt(raw, 10) || 60;

  const FUDGE          = 5;
  const MAX_GROWTH_ROW = 44;   // after this, stop growing the icon

  const BASE_ROW_FOR_OFFSET = 40; // where icon looks centered
  const OFFSET_FACTOR       = 0.25;

  // cap growth for size, like you already do
  const effectiveRow = Math.min(rowH, MAX_GROWTH_ROW);

  const boxSize = Math.max(25, Math.min(35, effectiveRow - 20 + FUDGE));
  const scale   = 1.20;

  // use your existing offset curve
  const clampedForOffset = Math.max(30, Math.min(60, rowH));
  let offsetY = (clampedForOffset - BASE_ROW_FOR_OFFSET) * OFFSET_FACTOR;

  // 30–44: untouched (you said this range is perfect)
  // 45–60: same curve, but shifted up slightly
  if (rowH > 53) {
    offsetY -= 3; 
  }

  document.querySelectorAll('#fileList .folder-row-icon').forEach(iconSpan => {
    iconSpan.style.width    = boxSize + 'px';
    iconSpan.style.height   = boxSize + 'px';
    iconSpan.style.overflow = 'visible';

    const svg = iconSpan.querySelector('svg');
    if (!svg) return;

    svg.setAttribute('width',  String(boxSize));
    svg.setAttribute('height', String(boxSize));
    svg.style.transformOrigin = 'left center';
    svg.style.transform       = `translateY(${offsetY}px) scale(${scale})`;
  });
}
/**
 * Render table view
 */
export function renderFileTable(folder, container, subfolders) {
  const fileListContent = container || document.getElementById("fileList");
  const searchTerm = (window.currentSearchTerm || "").toLowerCase();
  const itemsPerPageSetting = parseInt(localStorage.getItem("itemsPerPage") || "50", 10);
  let currentPage = window.currentPage || 1;

  // Files (filtered by search)
  const filteredFiles = searchFiles(searchTerm);

  // Inline folders: sort once (Explorer-style A→Z)
  const allSubfolders = Array.isArray(window.currentSubfolders)
    ? window.currentSubfolders
    : [];
  const subfoldersSorted = [...allSubfolders].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" })
  );

  const totalFiles   = filteredFiles.length;
  const totalFolders = subfoldersSorted.length;
  const totalRows    = totalFiles + totalFolders;
  const hasFolders   = totalFolders > 0;

  // Pagination is now over (folders + files)
  const totalPages = totalRows > 0
    ? Math.ceil(totalRows / itemsPerPageSetting)
    : 1;

  if (currentPage > totalPages) {
    currentPage = totalPages;
    window.currentPage = currentPage;
  }

  const startRow = (currentPage - 1) * itemsPerPageSetting;
  const endRow   = Math.min(startRow + itemsPerPageSetting, totalRows);

  // Figure out which folders + files belong to THIS page
  const pageFolders = [];
  const pageFiles   = [];

  for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
    if (rowIndex < totalFolders) {
      pageFolders.push(subfoldersSorted[rowIndex]);
    } else {
      const fileIdx = rowIndex - totalFolders;
      const file = filteredFiles[fileIdx];
      if (file) pageFiles.push(file);
    }
  }

  // Stable id per file row on this page
  const rowIdFor = (file, idx) =>
    `${encodeURIComponent(file.name)}-p${currentPage}-${idx}`;

  // We pass a harmless "base" string to keep buildFileTableRow happy,
  // then we will FIX the preview/thumbnail URLs to the API below.
  const fakeBase = "#/";

  const topControlsHTML = buildSearchAndPaginationControls({
    currentPage,
    totalPages,
    searchTerm: window.currentSearchTerm || ""
  });

  const combinedTopHTML = topControlsHTML;

  let headerHTML = buildFileTableHeader(sortOrder);

  headerHTML = headerHTML.replace(/<table([^>]*)>/i, (full, attrs) => {
    // If table already has class="", append filr-table. Otherwise add class attribute.
    if (/class\s*=\s*"/i.test(attrs)) {
      return full.replace(/class="([^"]*)"/i, (m, cls) => `class="${cls} filr-table"`);
    }
    return `<table class="filr-table"${attrs}>`;
  });

    let rowsHTML = "<tbody>";

  if (pageFiles.length > 0) {
    pageFiles.forEach((file, idx) => {
      const rowKey = rowIdFor(file, idx);
      let rowHTML = buildFileTableRow(file, fakeBase);

      // add row id + data-file-name, and ensure the name cell also has "name-cell"
      rowHTML = rowHTML
        .replace("<tr", `<tr id="file-row-${rowKey}" data-file-name="${escapeHTML(file.name)}"`)
        .replace('class="file-name-cell"', 'class="file-name-cell name-cell"');

      let tagBadgesHTML = "";
      if (file.tags && file.tags.length > 0) {
        tagBadgesHTML = '<div class="tag-badges" style="display:inline-block; margin-left:5px;">';
        file.tags.forEach(tag => {
          tagBadgesHTML += `<span style="background-color: ${tag.color}; color: #fff; padding: 2px 4px; border-radius: 3px; margin-right: 2px; font-size: 0.8em;">${escapeHTML(tag.name)}</span>`;
        });
        tagBadgesHTML += "</div>";
      }

      rowsHTML += rowHTML.replace(
        /(<td\s+class="[^"]*\bfile-name-cell\b[^"]*">)([\s\S]*?)(<\/td>)/,
        (m, open, inner, close) => {
          return `${open}<span class="filename-text">${inner}</span>${tagBadgesHTML}${close}`;
        }
      );
    });
  } else if (!hasFolders && totalFiles === 0) {
    // Only show "No files found" if there are no folders either
    rowsHTML += `<tr><td colspan="8">${t("no_files_found") || "No files found."}</td></tr>`;
  }

  rowsHTML += "</tbody></table>";

  const bottomControlsHTML = buildBottomControls(itemsPerPageSetting);

  fileListContent.innerHTML = combinedTopHTML + headerHTML + rowsHTML + bottomControlsHTML;

  // Inject inline folder rows for THIS page (Explorer-style)
  if (window.showInlineFolders !== false && pageFolders.length) {
    injectInlineFolderRows(fileListContent, folder, pageFolders);
  }
  wireSelectAll(fileListContent);

  // PATCH each row's preview/thumb to use the secure API URLs
    // PATCH each row's preview/thumb to use the secure API URLs
    if (pageFiles.length > 0) {
      pageFiles.forEach((file, idx) => {
        const rowKey = rowIdFor(file, idx);
        const rowEl = document.getElementById(`file-row-${rowKey}`);
        if (!rowEl) return;
  
        const previewUrl = apiFileUrl(file.folder || folder, file.name, true);
  
        // Preview button dataset
        const previewBtn = rowEl.querySelector(".preview-btn");
        if (previewBtn) {
          previewBtn.dataset.previewUrl = previewUrl;
          previewBtn.dataset.previewName = file.name;
        }
  
        // Thumbnail (if present)
        const thumbImg = rowEl.querySelector("img");
        if (thumbImg) {
          thumbImg.src = previewUrl;
          thumbImg.setAttribute("data-cache-key", previewUrl);
        }
  
        // Any anchor that might have been built to point at a file path
        rowEl.querySelectorAll('a[href]').forEach(a => {
          // Only rewrite obvious file anchors (ignore actions with '#', 'javascript:', etc.)
          if (/^#|^javascript:/i.test(a.getAttribute('href') || '')) return;
          a.href = previewUrl;
        });
      });
    }

  fileListContent.querySelectorAll('.folder-item').forEach(el => {
    el.addEventListener('click', () => loadFileList(el.dataset.folder));
  });

  // pagination clicks
  const prevBtn = document.getElementById("prevPageBtn");
  if (prevBtn) prevBtn.addEventListener("click", () => {
    if (window.currentPage > 1) {
      window.currentPage--;
      renderFileTable(folder, container);
    }
  });
  const nextBtn = document.getElementById("nextPageBtn");
  if (nextBtn) nextBtn.addEventListener("click", () => {
    if (window.currentPage < totalPages) {
      window.currentPage++;
      renderFileTable(folder, container);
    }
  });

  // advanced search toggle
  const advToggle = document.getElementById("advancedSearchToggle");
  if (advToggle) advToggle.addEventListener("click", () => {
    toggleAdvancedSearch();
  });

  // items-per-page selector
  const itemsSelect = document.getElementById("itemsPerPageSelect");
  if (itemsSelect) itemsSelect.addEventListener("change", e => {
    window.itemsPerPage = parseInt(e.target.value, 10);
    localStorage.setItem("itemsPerPage", window.itemsPerPage);
    window.currentPage = 1;
    renderFileTable(folder, container);
  });

  // Row-select (only file rows have checkboxes; folder rows are ignored here)
  fileListContent.querySelectorAll("tbody tr").forEach(row => {
    row.addEventListener("click", e => {
      const cb = row.querySelector(".file-checkbox");
      if (!cb) return;
      toggleRowSelection(e, cb.value);
    });
  });

  

  // Download buttons
  fileListContent.querySelectorAll(".download-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      openDownloadModal(btn.dataset.downloadName, btn.dataset.downloadFolder);
    });
  });

  // Edit buttons
  fileListContent.querySelectorAll(".edit-btn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const m = await import('./fileEditor.js?v={{APP_QVER}}');
      m.editFile(btn.dataset.editName, btn.dataset.editFolder);
    });
  });

  // Rename buttons
  fileListContent.querySelectorAll(".rename-btn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const m = await import('./fileActions.js?v={{APP_QVER}}');
      m.renameFile(btn.dataset.renameName, btn.dataset.renameFolder);
    });
  });

  // Preview buttons 
  fileListContent.querySelectorAll(".preview-btn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const m = await import('./filePreview.js?v={{APP_QVER}}');
      m.previewFile(btn.dataset.previewUrl, btn.dataset.previewName);
    });
  });

  createViewToggleButton();

  // search input
  const newSearchInput = document.getElementById("searchInput");
  if (newSearchInput) {
    newSearchInput.addEventListener("input", debounce(function () {
      window.currentSearchTerm = newSearchInput.value;
      window.currentPage = 1;
      renderFileTable(folder, container);
      setTimeout(() => {
        const freshInput = document.getElementById("searchInput");
        if (freshInput) {
          freshInput.focus();
          const len = freshInput.value.length;
          freshInput.setSelectionRange(len, len);
        }
      }, 0);
    }, 300));
  }

  const slider = document.getElementById('rowHeightSlider');
  const valueDisplay = document.getElementById('rowHeightValue');
  if (slider) {
    slider.addEventListener('input', e => {
      const v = +e.target.value;  // slider value in px
      document.documentElement.style.setProperty('--file-row-height', v + 'px');
      localStorage.setItem('rowHeight', v);
      valueDisplay.textContent = v + 'px';
    });
  }

  document.querySelectorAll("#fileList table.filr-table thead th[data-column]").forEach(cell => {
    cell.addEventListener("click", function () {
      const column = this.getAttribute("data-column");
      sortFiles(column, folder);
    });
  });
  document.querySelectorAll("#fileList .file-checkbox").forEach(checkbox => {
    checkbox.addEventListener("change", function (e) {
      updateRowHighlight(e.target);
      updateFileActionButtons();
    });
  });
  document.querySelectorAll(".share-btn").forEach(btn => {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      const fileName = this.getAttribute("data-file");
      const file = fileData.find(f => f.name === fileName);
      if (file) {
        import('./filePreview.js?v={{APP_QVER}}').then(module => {
          module.openShareModal(file, folder);
        });
      }
    });
  });
  updateFileActionButtons();

  // Dragstart only for file rows (skip folder rows)
  document.querySelectorAll("#fileList tbody tr").forEach(row => {
    if (row.classList.contains("folder-row")) return;
    row.setAttribute("draggable", "true");
    import('./fileDragDrop.js?v={{APP_QVER}}').then(module => {
      row.addEventListener("dragstart", module.fileDragStartHandler);
    });
  });

  document.querySelectorAll(".download-btn, .edit-btn, .rename-btn").forEach(btn => {
    btn.addEventListener("click", e => e.stopPropagation());
  });
  bindFileListContextMenu();
  refreshViewedBadges(folder).catch(() => { });
}

// A helper to compute the max image height based on the current column count.
function getMaxImageHeight() {
  const columns = parseInt(window.galleryColumns || 3, 10);
  return 150 * (7 - columns);
}

export function renderGalleryView(folder, container) {
  const fileListContent = container || document.getElementById("fileList");
  const searchTerm = (window.currentSearchTerm || "").toLowerCase();
  const filteredFiles = searchFiles(searchTerm);

  // API preview base (we’ll build per-file URLs)
  const apiBase = `/api/file/download.php?folder=${encodeURIComponent(folder)}&file=`;

  // pagination settings
  const itemsPerPage = window.itemsPerPage;
  let currentPage = window.currentPage || 1;
  const totalFiles = filteredFiles.length;
  const totalPages = Math.ceil(totalFiles / itemsPerPage);
  if (currentPage > totalPages) {
    currentPage = totalPages || 1;
    window.currentPage = currentPage;
  }

  // --- Top controls: search + pagination + items-per-page ---
  let galleryHTML = buildSearchAndPaginationControls({
    currentPage,
    totalPages,
    searchTerm: window.currentSearchTerm || ""
  });

  // wire up search input just like table view
  setTimeout(() => {
    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
      searchInput.addEventListener("input", debounce(() => {
        window.currentSearchTerm = searchInput.value;
        window.currentPage = 1;
        renderGalleryView(folder);
        setTimeout(() => {
          const f = document.getElementById("searchInput");
          if (f) {
            f.focus();
            const len = f.value.length;
            f.setSelectionRange(len, len);
          }
        }, 0);
      }, 300));
    }
  }, 0);

  // determine column max by screen size
  const numColumns = window.galleryColumns || 3;
  const w = window.innerWidth;
  let maxCols = 6;
  if (w < 600) maxCols = 1;
  else if (w < 900) maxCols = 2;
  const startCols = Math.min(numColumns, maxCols);
  window.galleryColumns = startCols;

  // --- Start gallery grid ---
  galleryHTML += `
      <div class="gallery-container"
           style="display:grid;
                  grid-template-columns:repeat(${numColumns},1fr);
                  gap:10px;
                  padding:10px;">
    `;

  // slice current page
  const startIdx = (currentPage - 1) * itemsPerPage;
  const pageFiles = filteredFiles.slice(startIdx, startIdx + itemsPerPage);

  pageFiles.forEach((file, idx) => {
    const idSafe = encodeURIComponent(file.name) + "-" + (startIdx + idx);

    // build preview URL from API (cache-busted)
    const previewURL = `${apiBase}${encodeURIComponent(file.name)}&t=${Date.now()}`;

    // thumbnail
    let thumbnail;
    if (/\.(jpe?g|png|gif|bmp|webp|svg|ico)$/i.test(file.name)) {
      const cacheKey = previewURL; // include folder & file
      if (window.imageCache && window.imageCache[cacheKey]) {
        thumbnail = `<img
            src="${window.imageCache[cacheKey]}"
            class="gallery-thumbnail"
            data-cache-key="${cacheKey}"
            alt="${escapeHTML(file.name)}"
            style="max-width:100%; max-height:${getMaxImageHeight()}px; display:block; margin:0 auto;">`;
      } else {
        thumbnail = `<img
            src="${previewURL}"
            class="gallery-thumbnail"
            data-cache-key="${cacheKey}"
            alt="${escapeHTML(file.name)}"
            style="max-width:100%; max-height:${getMaxImageHeight()}px; display:block; margin:0 auto;">`;
      }
    } else if (/\.(mp3|wav|m4a|ogg|flac|aac|wma|opus)$/i.test(file.name)) {
      thumbnail = `<span class="material-icons gallery-icon">audiotrack</span>`;
    } else {
      thumbnail = `<span class="material-icons gallery-icon">insert_drive_file</span>`;
    }

    // tag badges
    let tagBadgesHTML = "";
    if (file.tags && file.tags.length) {
      tagBadgesHTML = `<div class="tag-badges" style="margin-top:4px;">`;
      file.tags.forEach(tag => {
        tagBadgesHTML += `<span style="background-color:${tag.color};
                                     color:#fff;
                                     padding:2px 4px;
                                     border-radius:3px;
                                     margin-right:2px;
                                     font-size:0.8em;">
              ${escapeHTML(tag.name)}
            </span>`;
      });
      tagBadgesHTML += `</div>`;
    }

    // card with checkbox, preview, info, buttons
    galleryHTML += `
        <div class="gallery-card"
             data-file-name="${escapeHTML(file.name)}"
             style="position:relative; border:1px solid #ccc; padding:5px; text-align:center;">
          <input type="checkbox"
                 class="file-checkbox"
                 id="cb-${idSafe}"
                 value="${escapeHTML(file.name)}"
                 style="position:absolute; top:5px; left:5px; z-index:10;">
          <label for="cb-${idSafe}"
                 style="position:absolute; top:5px; left:5px; width:16px; height:16px;"></label>
  
          <div class="gallery-preview" style="cursor:pointer;"
               data-preview-url="${previewURL}"
               data-preview-name="${file.name}">
            ${thumbnail}
          </div>
  
          <div class="gallery-info" style="margin-top:5px;">
            <span class="gallery-file-name"
                  style="display:block; white-space:normal; overflow-wrap:break-word;">
              ${escapeHTML(file.name)}
            </span>
            ${tagBadgesHTML}
  
            <div class="btn-group btn-group-sm btn-group-hover" role="group" aria-label="File actions" style="margin-top:5px;">
              <button
                type="button"
                class="btn btn-success py-1 download-btn"
                data-download-name="${escapeHTML(file.name)}"
                data-download-folder="${file.folder || "root"}"
                title="${t('download')}"
              >
                <i class="material-icons">file_download</i>
              </button>
  
              ${file.editable ? `
              <button
                type="button"
                class="btn btn-secondary py-1 edit-btn"
                data-edit-name="${escapeHTML(file.name)}"
                data-edit-folder="${file.folder || "root"}"
                title="${t('edit')}"
              >
                <i class="material-icons">edit</i>
              </button>` : ""}
  
              <button
                type="button"
                class="btn btn-warning py-1 rename-btn"
                data-rename-name="${escapeHTML(file.name)}"
                data-rename-folder="${file.folder || "root"}"
                title="${t('rename')}"
              >
                <i class="material-icons">drive_file_rename_outline</i>
              </button>
  
              <button
                type="button"
                class="btn btn-secondary py-1 share-btn"
                data-file="${escapeHTML(file.name)}"
                title="${t('share')}"
              >
                <i class="material-icons">share</i>
              </button>
            </div>
          </div>
        </div>
      `;
  });

  galleryHTML += `</div>`; // end gallery-container

  // bottom controls
  galleryHTML += buildBottomControls(itemsPerPage);

  // render
  fileListContent.innerHTML = galleryHTML;


  // pagination buttons for gallery
  const prevBtn = document.getElementById("prevPageBtn");
  if (prevBtn) prevBtn.addEventListener("click", () => {
    if (window.currentPage > 1) {
      window.currentPage--;
      renderGalleryView(folder, container);
    }
  });
  const nextBtn = document.getElementById("nextPageBtn");
  if (nextBtn) nextBtn.addEventListener("click", () => {
    if (window.currentPage < totalPages) {
      window.currentPage++;
      renderGalleryView(folder, container);
    }
  });

  // advanced search toggle
  const advToggle = document.getElementById("advancedSearchToggle");
  if (advToggle) advToggle.addEventListener("click", () => {
    toggleAdvancedSearch();
  });

  // context menu in gallery
  bindFileListContextMenu();

  // items-per-page selector for gallery
  const itemsSelect = document.getElementById("itemsPerPageSelect");
  if (itemsSelect) itemsSelect.addEventListener("change", e => {
    window.itemsPerPage = parseInt(e.target.value, 10);
    localStorage.setItem("itemsPerPage", window.itemsPerPage);
    window.currentPage = 1;
    renderGalleryView(folder, container);
  });

  // cache images on load
  fileListContent.querySelectorAll('.gallery-thumbnail').forEach(img => {
    const key = img.dataset.cacheKey;
    img.addEventListener('load', () => cacheImage(img, key));
  });

  // preview clicks (dynamic import to avoid global dependency)
  fileListContent.querySelectorAll(".gallery-preview").forEach(el => {
    el.addEventListener("click", async () => {
      const m = await import('./filePreview.js?v={{APP_QVER}}');
      m.previewFile(el.dataset.previewUrl, el.dataset.previewName);
    });
  });

  // download clicks
  fileListContent.querySelectorAll(".download-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      openDownloadModal(btn.dataset.downloadName, btn.dataset.downloadFolder);
    });
  });

  // edit clicks
  fileListContent.querySelectorAll(".edit-btn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const m = await import('./fileEditor.js?v={{APP_QVER}}');
      m.editFile(btn.dataset.editName, btn.dataset.editFolder);
    });
  });

  // rename clicks
  fileListContent.querySelectorAll(".rename-btn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const m = await import('./fileActions.js?v={{APP_QVER}}');
      m.renameFile(btn.dataset.renameName, btn.dataset.renameFolder);
    });
  });

  // share clicks
  fileListContent.querySelectorAll(".share-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const fileName = btn.dataset.file;
      const fileObj = fileData.find(f => f.name === fileName);
      if (fileObj) {
        import('./filePreview.js?v={{APP_QVER}}').then(m => m.openShareModal(fileObj, folder));
      }
    });
  });

  // checkboxes
  fileListContent.querySelectorAll(".file-checkbox").forEach(cb => {
    cb.addEventListener("change", () => updateFileActionButtons());
  });

  // slider
  const slider = document.getElementById("galleryColumnsSlider");
  if (slider) {
    slider.addEventListener("input", () => {
      const v = +slider.value;
      document.getElementById("galleryColumnsValue").textContent = v;
      window.galleryColumns = v;
      document.querySelector(".gallery-container")
        .style.gridTemplateColumns = `repeat(${v},1fr)`;
      document.querySelectorAll(".gallery-thumbnail")
        .forEach(img => img.style.maxHeight = getMaxImageHeight() + "px");
    });
  }

  // pagination helpers
  window.changePage = newPage => {
    window.currentPage = newPage;
    if (window.viewMode === "gallery") renderGalleryView(folder);
    else renderFileTable(folder);
  };

  window.changeItemsPerPage = cnt => {
    window.itemsPerPage = +cnt;
    localStorage.setItem("itemsPerPage", cnt);
    window.currentPage = 1;
    if (window.viewMode === "gallery") renderGalleryView(folder);
    else renderFileTable(folder);
  };
  refreshViewedBadges(folder).catch(() => { });
  updateFileActionButtons();
  createViewToggleButton();
}

// Responsive slider constraints based on screen size.
function updateSliderConstraints() {
  const slider = document.getElementById("galleryColumnsSlider");
  if (!slider) return;

  const width = window.innerWidth;
  let min = 1;
  let max;

  if (width < 600) {
    max = 1;
  } else if (width < 1024) {
    max = 3;
  } else if (width < 1440) {
    max = 4;
  } else {
    max = 6;
  }

  let currentVal = parseInt(slider.value, 10);
  if (currentVal > max) {
    currentVal = max;
    slider.value = max;
  }

  slider.min = min;
  slider.max = max;
  document.getElementById("galleryColumnsValue").textContent = currentVal;

  const galleryContainer = document.querySelector(".gallery-container");
  if (galleryContainer) {
    galleryContainer.style.gridTemplateColumns = `repeat(${currentVal}, 1fr)`;
  }
}

window.addEventListener('load', updateSliderConstraints);
window.addEventListener('resize', updateSliderConstraints);

export function sortFiles(column, folder) {
  if (sortOrder.column === column) {
    sortOrder.ascending = !sortOrder.ascending;
  } else {
    sortOrder.column = column;
    sortOrder.ascending = true;
  }
  fileData.sort((a, b) => {
    let valA = a[column] || "";
    let valB = b[column] || "";
    if (column === "modified" || column === "uploaded") {
      const parsedA = parseCustomDate(valA);
      const parsedB = parseCustomDate(valB);
      valA = parsedA;
      valB = parsedB;
    } else if (typeof valA === "string") {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }
    if (valA < valB) return sortOrder.ascending ? -1 : 1;
    if (valA > valB) return sortOrder.ascending ? 1 : -1;
    return 0;
  });
  if (window.viewMode === "gallery") {
    renderGalleryView(folder);
  } else {
    renderFileTable(folder);
  }
}

function parseCustomDate(dateStr) {
  dateStr = dateStr.replace(/\s+/g, " ").trim();
  const parts = dateStr.split(" ");
  if (parts.length !== 2) {
    return new Date(dateStr).getTime();
  }
  const datePart = parts[0];
  const timePart = parts[1];
  const dateComponents = datePart.split("/");
  if (dateComponents.length !== 3) {
    return new Date(dateStr).getTime();
  }
  let month = parseInt(dateComponents[0], 10);
  let day = parseInt(dateComponents[1], 10);
  let year = parseInt(dateComponents[2], 10);
  if (year < 100) {
    year += 2000;
  }
  const timeRegex = /^(\d{1,2}):(\d{2})(AM|PM)$/i;
  const match = timePart.match(timeRegex);
  if (!match) {
    return new Date(dateStr).getTime();
  }
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === "PM" && hour !== 12) {
    hour += 12;
  }
  if (period === "AM" && hour === 12) {
    hour = 0;
  }
  return new Date(year, month - 1, day, hour, minute).getTime();
}

export function canEditFile(fileName) {
  if (!fileName || typeof fileName !== "string") return false;
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return false;
  const ext = fileName.slice(dot + 1).toLowerCase();

  // Your CodeMirror text-based types
  const textEditExts = new Set([
    "txt", "text", "md", "markdown", "rst",
    "html", "htm", "xhtml", "shtml",
    "css", "scss", "sass", "less",
    "js", "mjs", "cjs", "jsx",
    "ts", "tsx",
    "json", "jsonc", "ndjson",
    "yml", "yaml", "toml", "xml", "plist",
    "ini", "conf", "config", "cfg", "cnf", "properties", "props", "rc",
    "env", "dotenv",
    "csv", "tsv", "tab",
    "log",
    "sh", "bash", "zsh", "ksh", "fish",
    "bat", "cmd",
    "ps1", "psm1", "psd1",
    "py", "pyw", "rb", "pl", "pm", "go", "rs", "java", "kt", "kts",
    "scala", "sc", "groovy", "gradle",
    "c", "h", "cpp", "cxx", "cc", "hpp", "hh", "hxx",
    "m", "mm", "swift", "cs", "fs", "fsx", "dart", "lua", "r", "rmd",
    "sql", "vue", "svelte", "twig", "mustache", "hbs", "handlebars", "ejs", "pug", "jade"
  ]);

  if (textEditExts.has(ext)) return true;            // CodeMirror
  if (OO_ENABLED && OO_EXTS.has(ext)) return true;   // ONLYOFFICE types if enabled
  return false;
}

// Expose global functions for pagination and preview.
window.changePage = function (newPage) {
  window.currentPage = newPage;
  if (window.viewMode === 'gallery') {
    renderGalleryView(window.currentFolder);
  } else {
    renderFileTable(window.currentFolder);
  }
};

window.changeItemsPerPage = function (newCount) {
  window.itemsPerPage = parseInt(newCount, 10);
  localStorage.setItem('itemsPerPage', newCount);
  window.currentPage = 1;
  if (window.viewMode === 'gallery') {
    renderGalleryView(window.currentFolder);
  } else {
    renderFileTable(window.currentFolder);
  }
};

// fileListView.js (bottom)
window.loadFileList = loadFileList;
window.renderFileTable = renderFileTable;
window.renderGalleryView = renderGalleryView;
window.sortFiles = sortFiles;
window.toggleAdvancedSearch = toggleAdvancedSearch;