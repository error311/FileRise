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
import { withBase } from './basePath.js?v={{APP_QVER}}';
import { t } from './i18n.js?v={{APP_QVER}}';
import { bindFileListContextMenu } from './fileMenu.js?v={{APP_QVER}}';
import {
  openDownloadModal,
  handleCopySelected,
  handleMoveSelected,
  handleDeleteSelected
} from './fileActions.js?v={{APP_QVER}}';
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
  startFolderCryptoJobFlow,
  folderSVG,
  expandTreePath,
  expandTreePathAsync,
  syncFolderTreeSelection,
  syncTreeAfterFolderMove
} from './folderManager.js?v={{APP_QVER}}';
import { openFolderShareModal } from './folderShareModal.js?v={{APP_QVER}}';
import {
  folderDragOverHandler,
  folderDragLeaveHandler,
  folderDropHandler
} from './fileDragDrop.js?v={{APP_QVER}}';

export let fileData = [];
export let sortOrder = { column: "modified", ascending: false };

let searchEverywhereBtn = null;
let searchEverywhereModal = null;
let searchEverywhereCard = null;
let searchEverywhereResultsEl = null;
let searchEverywhereInputEl = null;
let searchEverywhereLimitEl = null;
let pendingSearchSelection = null;

try {
  window.addEventListener('folderCapsUpdated', (e) => {
    const d = (e && e.detail) || {};
    const folder = d.folder || window.currentFolder || 'root';
    // Banner is only relevant for the currently viewed folder, but icons in the list may reference
    // other folders (e.g. decrypting from a parent folder view), so always refresh icons.
    if (folder === (window.currentFolder || 'root')) {
      updateEncryptedFolderBanner(folder);
      applyEncryptedFolderUiRestrictions();
    }

    // Best-effort: update icons for this specific folder if it's visible in the list/strip.
    try {
      const stripItem = document.querySelector(`#folderStripContainer .folder-item[data-folder="${CSS.escape(folder)}"]`);
      if (stripItem) attachStripIconAsync(stripItem, folder, 48);
    } catch (e2) { /* ignore */ }
    try {
      const row = document.querySelector(`#fileList tr.folder-row[data-folder="${CSS.escape(folder)}"]`);
      if (row) attachStripIconAsync(row, folder, 28);
    } catch (e3) { /* ignore */ }

    refreshEncryptedFolderIconsInList();
  });
} catch (e) { /* ignore */ }

function ensureEncryptedFolderBanner() {
  const titleEl = document.getElementById('fileListTitle');
  if (!titleEl) return null;
  let el = document.getElementById('frEncryptedFolderBanner');
  if (el) {
    titleEl.insertAdjacentElement('afterend', el);
    return el;
  }

  el = document.createElement('div');
  el.id = 'frEncryptedFolderBanner';
  el.className = 'fr-enc-banner';
  el.style.display = 'none';
  titleEl.insertAdjacentElement('afterend', el);
  return el;
}

function updateEncryptedFolderBanner(folder) {
  const el = ensureEncryptedFolderBanner();
  if (!el) return;

  const enc = window.currentFolderCaps?.encryption || null;
  const isEncrypted = !!enc?.encrypted;
  if (!isEncrypted) {
    el.style.display = 'none';
    el.textContent = '';
    return;
  }

  const inherited = !!enc?.inherited;
  const root = (enc && enc.root) ? String(enc.root) : (folder || 'root');
  const rootLabel = inherited && root ? ` (inherited from ${root})` : '';

  el.style.display = 'flex';
  el.textContent = '';

  const pill = document.createElement('span');
  pill.className = 'fr-enc-pill';
  pill.textContent = 'Encrypted';

  const text = document.createElement('div');
  text.className = 'fr-enc-text';
  text.textContent =
    `This folder${rootLabel} is encrypted. ` +
    'Video/audio previews, WebDAV, ONLYOFFICE, and ZIP create/extract are disabled.';

  el.append(pill, text);
}

function applyEncryptedFolderUiRestrictions() {
  const caps = window.currentFolderCaps || null;
  const inEncrypted = !!(caps && caps.encryption && caps.encryption.encrypted);
  const allowShare = !inEncrypted && (caps ? !!(caps.canShareFile || caps.canShare) : true);

  try {
    document.querySelectorAll('#fileList .share-btn').forEach(btn => {
      btn.style.display = allowShare ? '' : 'none';
    });
  } catch (e) { /* ignore */ }
}

function isEncryptedForFolderIcon(folder) {
  try {
    const enc = window.currentFolderCaps?.encryption || null;
    if (enc && enc.encrypted) return true;
  } catch (e) { /* ignore */ }
  try {
    const el = document.querySelector(`.folder-option[data-folder="${CSS.escape(folder)}"]`);
    return !!(el && el.classList.contains('encrypted'));
  } catch (e) {
    return false;
  }
}

function refreshEncryptedFolderIconsInList() {
  // Folder strip icons
  try {
    const strip = document.getElementById('folderStripContainer');
    if (strip) {
      strip.querySelectorAll('.folder-item').forEach(item => {
        const folder = item.getAttribute('data-folder') || '';
        if (!folder) return;
        const iconSpan = item.querySelector('.folder-svg');
        if (!iconSpan) return;
        const kind = iconSpan.dataset.kind || 'empty';
        iconSpan.innerHTML = folderSVG(kind, { encrypted: isEncryptedForFolderIcon(folder) });
      });
    }
  } catch (e) { /* best effort */ }

  // Inline folder rows
  try {
    document.querySelectorAll('#fileList tr.folder-row[data-folder], #fileListSecondary tr.folder-row[data-folder]').forEach(row => {
      const folder = row.getAttribute('data-folder') || '';
      if (!folder) return;
      const iconSpan = row.querySelector('.folder-svg');
      if (!iconSpan) return;
      const kind = iconSpan.dataset.kind || 'empty';
      iconSpan.innerHTML = folderSVG(kind, { encrypted: isEncryptedForFolderIcon(folder) });
    });
  } catch (e) { /* best effort */ }
}

function decodeHtmlEntities(str) {
  if (!str) return "";
  try {
    const input = String(str);
    return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, code) => {
      if (!code) return match;
      if (code[0] === '#') {
        const isHex = code[1] === 'x' || code[1] === 'X';
        const num = isHex ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        if (!Number.isFinite(num)) return match;
        try { return String.fromCodePoint(num); } catch (e) { return match; }
      }
      const table = {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
        nbsp: '\u00A0',
        colon: ':',
        slash: '/',
        backslash: '\\'
      };
      const lower = code.toLowerCase();
      return Object.prototype.hasOwnProperty.call(table, lower) ? table[lower] : match;
    });
  } catch (e) {
    return String(str);
  }
}

function compareSemverLite(a, b) {
  const pa = String(a || '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '').split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}


const FOLDER_STRIP_PAGE_SIZE = 50;
// onnlyoffice
let OO_ENABLED = false;
let OO_EXTS = new Set();

// Late-import safety: many legacy modules bind on DOMContentLoaded/load.
// If this file is imported after those events already fired, replay them once
// so modal buttons (delete/move/rename/etc.) wire up correctly.
(function ensureLegacyReadyReplay() {
  if (window.__FR_READY_REPLAYED__) return;
  if (document.readyState === 'loading') return; // native event still pending
  window.__FR_READY_REPLAYED__ = true;
  try { document.dispatchEvent(new Event('DOMContentLoaded')); } catch (e) { }
  try { window.dispatchEvent(new Event('load')); } catch (e) { }
})();

export async function initOnlyOfficeCaps() {
  if (window.__FR_OO_PROMISE) return window.__FR_OO_PROMISE;
  window.__FR_OO_PROMISE = (async () => {
    try {
      const r = await fetch(withBase('/api/onlyoffice/status.php'), { credentials: 'include' });
      if (!r.ok) throw 0;
      const j = await r.json();
      OO_ENABLED = !!j.enabled;
      OO_EXTS = new Set(Array.isArray(j.exts) ? j.exts : []);
    } catch (e) {
      OO_ENABLED = false;
      OO_EXTS = new Set();
    } finally {
      window.__FR_OO_PROMISE = null;
    }
  })();
  return window.__FR_OO_PROMISE;
}

function wireFolderStripItems(strip) {
  if (!strip) return;

  // Click / DnD / context menu
  strip.querySelectorAll(".folder-item").forEach(el => {
    // 1) click to navigate
    el.addEventListener("click", () => {
      const dest = el.dataset.folder;
      if (!dest) return;

      setCurrentFolderContext(dest);

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

      strip.querySelectorAll(".folder-item.selected")
        .forEach(i => i.classList.remove("selected"));
      el.classList.add("selected");

      const menuItems = [
        {
          label: t("create_folder"),
          action: () => {
            // Create inside this folder (without changing the current view yet)
            window.currentFolder = dest;
            const modal = document.getElementById("createFolderModal");
            if (modal) modal.style.display = "block";
            const input = document.getElementById("newFolderName");
            if (input) input.focus();
          }
        },
        {
          label: t("move_folder"),
          action: () => openMoveFolderUI(dest)
        },
        {
          label: t("rename_folder"),
          action: () => {
            window.currentFolder = dest;
            openRenameFolderModal();
          }
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
          action: () => {
            window.currentFolder = dest;
            openDeleteFolderModal();
          }
        }
      ];
      showFolderManagerContextMenu(e.pageX, e.pageY, menuItems);

      // Defensive: some browsers/styles occasionally blank the SVG after a contextmenu.
      // If it happens, repaint just this icon.
      try {
        queueMicrotask(() => {
          const iconSpan = el.querySelector('.folder-svg');
          if (iconSpan && String(iconSpan.innerHTML || '').trim() === '') {
            attachStripIconAsync(el, dest, 48);
          }
        });
      } catch (e2) { /* ignore */ }
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

function _trimLabel(str, max = 40) {
  if (!str) return "";
  const s = String(str);
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
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
  iconSpan.innerHTML = folderSVG(kind, { encrypted: isEncryptedForFolderIcon(folder) });
}
const TEXT_PREVIEW_MAX_BYTES = 512 * 1024;
const DEFAULT_HOVER_PREVIEW_MAX_MB = 8;
const MIN_HOVER_PREVIEW_MAX_MB = 1;
const MAX_HOVER_PREVIEW_MAX_MB = 50;
const OFFICE_SNIPPET_EXTS = new Set([
  'doc', 'docx', 'docm', 'dotx',
  'xls', 'xlsx', 'xlsm', 'xltx',
  'ppt', 'pptx', 'pptm', 'potx'
]);
const _fileSnippetCache = new Map();

function getMaxImagePreviewBytes() {
  const cfg = window.__FR_SITE_CFG__ || window.siteConfig || {};
  const display = (cfg && typeof cfg.display === 'object') ? cfg.display : {};
  const raw = parseInt(display.hoverPreviewMaxImageMb, 10);
  const mb = Number.isFinite(raw) ? raw : DEFAULT_HOVER_PREVIEW_MAX_MB;
  const clamped = Math.max(MIN_HOVER_PREVIEW_MAX_MB, Math.min(MAX_HOVER_PREVIEW_MAX_MB, mb));
  return clamped * 1024 * 1024;
}

function getFileExt(name) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

async function fillFileSnippet(file, snippetEl) {
  if (!snippetEl) return;
  snippetEl.textContent = "";
  snippetEl.style.display = "none";

  const folder = file.folder || window.currentFolder || "root";
  const key    = `${folder}::${file.name}`;
  const ext    = getFileExt(file.name || "");
  const bytes  = Number.isFinite(file.sizeBytes) ? file.sizeBytes : null;
  const isOffice = OFFICE_SNIPPET_EXTS.has(ext);

  // Reuse cache if we have it
  if (_fileSnippetCache.has(key)) {
    const cached = _fileSnippetCache.get(key);
    if (cached) {
      snippetEl.textContent = cached;
      snippetEl.style.display = "block";
    }
    return;
  }

  // ============================
  // OFFICE DOCS (DOCX/XLSX/PPTX)
  // ============================
  if (isOffice) {
    // Size guard (avoid parsing massive Office files)
    const MAX_OFFICE_BYTES = 20 * 1024 * 1024; // 20 MiB
    if (bytes != null && bytes > MAX_OFFICE_BYTES) {
      const msg = t("no_preview_available") || "No preview available";
      snippetEl.style.display = "block";
      snippetEl.textContent   = msg;
      _fileSnippetCache.set(key, msg);
      return;
    }

    snippetEl.style.display = "block";
    snippetEl.textContent   = t("loading") || "Loading...";

    try {
      const url = withBase(`/api/file/snippet.php?folder=${encodeURIComponent(folder)}&file=${encodeURIComponent(file.name)}&t=${Date.now()}`);
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw 0;

      const j = await res.json().catch(() => ({}));
      let text = (j && typeof j.snippet === "string") ? j.snippet : "";
      text = text || "";

      if (!text) {
        snippetEl.textContent = "";
        snippetEl.style.display = "none";
        _fileSnippetCache.set(key, "");
        return;
      }

      // Same visual rule as before: 6 lines, 600 chars, but let lines be a bit wider
      const MAX_LINES       = 6;
      const MAX_CHARS_TOTAL = 600;
      const MAX_LINE_CHARS  = 60;

      const rawLines = text.split(/\r?\n/);

      let visibleLines = rawLines.slice(0, MAX_LINES).map(line =>
        _trimLabel(line, MAX_LINE_CHARS)
      );

      let truncated =
        rawLines.length > MAX_LINES ||
        visibleLines.some((line, idx) => {
          const orig = rawLines[idx] || "";
          return orig.length > MAX_LINE_CHARS;
        });

      let snippet = visibleLines.join("\n");

      if (snippet.length > MAX_CHARS_TOTAL) {
        snippet = snippet.slice(0, MAX_CHARS_TOTAL);
        truncated = true;
      }

      snippet = snippet.trim();
      let finalSnippet = snippet || "(empty file)";
      if (truncated || j.truncated === true) {
        finalSnippet += "\n…";
      }

      _fileSnippetCache.set(key, finalSnippet);
      snippetEl.textContent = finalSnippet;

    } catch (e) {
      snippetEl.textContent = "";
      snippetEl.style.display = "none";
      _fileSnippetCache.set(key, "");
    }
    return;
  }

  // ============================
  // EXISTING TEXT FILE BEHAVIOR
  // ============================
  if (!canEditFile(file.name)) {
    // No text preview possible for this type – cache the fact and bail
    _fileSnippetCache.set(key, "");
    return;
  }

  if (bytes != null && bytes > TEXT_PREVIEW_MAX_BYTES) {
    // File is too large to safely preview inline
    const msg = t("no_preview_available") || "No preview available";
    snippetEl.style.display = "block";
    snippetEl.textContent = msg;
    _fileSnippetCache.set(key, msg);
    return;
  }

  snippetEl.style.display = "block";
  snippetEl.textContent = t("loading") || "Loading...";

  try {
    const url = apiFileUrl(folder, file.name, true);
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw 0;
    const text = await res.text();

    const MAX_LINES       = 6;
    const MAX_CHARS_TOTAL = 600;
    const MAX_LINE_CHARS  = 20;

    const allLines = text.split(/\r?\n/);

    let visibleLines = allLines.slice(0, MAX_LINES).map(line =>
      _trimLabel(line, MAX_LINE_CHARS)
    );

    let truncated =
      allLines.length > MAX_LINES ||
      visibleLines.some((line, idx) => {
        const orig = allLines[idx] || "";
        return orig.length > MAX_LINE_CHARS;
      });

    let snippet = visibleLines.join("\n");

    if (snippet.length > MAX_CHARS_TOTAL) {
      snippet = snippet.slice(0, MAX_CHARS_TOTAL);
      truncated = true;
    }

    snippet = snippet.trim();
    let finalSnippet = snippet || "(empty file)";
    if (truncated) {
      finalSnippet += "\n…";
    }

    _fileSnippetCache.set(key, finalSnippet);
    snippetEl.textContent = finalSnippet;

  } catch (e) {
    snippetEl.textContent = "";
    snippetEl.style.display = "none";
    _fileSnippetCache.set(key, "");
  }
}

function wireEllipsisContextMenu(fileListContent) {
  if (!fileListContent) return;

  fileListContent
    .querySelectorAll(".btn-actions-ellipsis")
    .forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const row = btn.closest("tr");
        if (!row) return;

        const rect = btn.getBoundingClientRect();
        const evt = new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.bottom
        });

        row.dispatchEvent(evt);
      });
    });
}

let hoverPreviewEl = null;
let hoverPreviewTimer = null;
let hoverPreviewActiveRow = null;
let hoverPreviewContext = null;
let hoverPreviewHoveringCard = false;

// Let other modules (drag/drop) kill the hover card instantly.
export function cancelHoverPreview() {
  try {
    if (hoverPreviewTimer) {
      clearTimeout(hoverPreviewTimer);
      hoverPreviewTimer = null;
    }
  } catch (e) {}

  hoverPreviewActiveRow = null;
  hoverPreviewContext = null;
  hoverPreviewHoveringCard = false;

  if (hoverPreviewEl) {
    hoverPreviewEl.style.display = 'none';
  }
}

function isHoverPreviewDisabled() {
  if (window.disableHoverPreview === true) return true;

  // Disable on touch / coarse pointer devices
  try {
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    if (coarse) return true;
  } catch (e) {}

  try {
    return localStorage.getItem("disableHoverPreview") === "true";
  } catch (e) {
    return false;
  }
}

function ensureHoverPreviewEl() {
  if (hoverPreviewEl) return hoverPreviewEl;

  const el = document.createElement("div");
  el.id = "hoverPreview";
  el.style.position = "fixed";
  el.style.zIndex = "9999";
  el.style.display = "none";
  el.innerHTML = `
    <div class="hover-preview-card">
      <div class="hover-preview-grid">
        <div class="hover-preview-left">
          <div class="hover-preview-thumb"></div>
          <pre class="hover-preview-snippet"></pre>
        </div>
        <div class="hover-preview-right">
          <div class="hover-preview-title"></div>
          <div class="hover-preview-meta"></div>
          <div class="hover-preview-props"></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  hoverPreviewEl = el;

  // ---- Layout + sizing tweaks ---------------------------------
  const card    = el.querySelector(".hover-preview-card");
  const grid    = el.querySelector(".hover-preview-grid");
  const leftCol = el.querySelector(".hover-preview-left");
  const rightCol = el.querySelector(".hover-preview-right");
  const thumb   = el.querySelector(".hover-preview-thumb");
  const snippet = el.querySelector(".hover-preview-snippet");
  const titleEl = el.querySelector(".hover-preview-title");
  const metaEl  = el.querySelector(".hover-preview-meta");
  const propsEl = el.querySelector(".hover-preview-props");

  if (card) {
    card.style.minWidth  = "380px";   // was 420
    card.style.maxWidth  = "600px";   // was 640
    card.style.minHeight = "200px";   // was 220
    card.style.padding   = "8px 10px"; // slightly tighter padding
    card.style.overflow  = "hidden";
  }

  if (grid) {
    grid.style.display             = "grid";
    grid.style.gridTemplateColumns = "200px minmax(240px, 1fr)"; // both columns ~9% smaller
    grid.style.gap                 = "10px";
    grid.style.alignItems          = "center";
  }

  if (leftCol) {
    leftCol.style.display        = "flex";
    leftCol.style.flexDirection  = "column";
    leftCol.style.justifyContent = "center";
    leftCol.style.minWidth       = "0";
  }

  if (rightCol) {
    rightCol.style.display        = "flex";
    rightCol.style.flexDirection  = "column";
    rightCol.style.justifyContent = "center";
    rightCol.style.minWidth       = "0";
    rightCol.style.overflow       = "hidden";
  }

  if (thumb) {
    thumb.style.display        = "flex";
    thumb.style.alignItems     = "center";
    thumb.style.justifyContent = "center";
    thumb.style.minHeight      = "120px"; // was 140
    thumb.style.marginBottom   = "4px";   // slightly tighter
  }
  

  if (snippet) {
    snippet.style.marginTop    = "4px";
    snippet.style.maxHeight    = "120px";
    snippet.style.overflow     = "auto";
    snippet.style.fontSize     = "0.78rem";
    snippet.style.whiteSpace   = "pre-wrap";
    snippet.style.padding      = "6px 8px";
    snippet.style.borderRadius = "6px";
    // Dark-mode friendly styling that still looks OK in light mode
    //snippet.style.backgroundColor = "rgba(39, 39, 39, 0.92)";
    snippet.style.color           = "#e5e7eb";
  }

  if (titleEl) {
    titleEl.style.fontWeight   = "600";
    titleEl.style.fontSize     = "0.95rem";
    titleEl.style.marginBottom = "2px";
    titleEl.style.whiteSpace   = "nowrap";
    titleEl.style.overflow     = "hidden";
    titleEl.style.textOverflow = "ellipsis";
    titleEl.style.maxWidth     = "100%";
  }

  if (metaEl) {
    metaEl.style.fontSize   = "0.8rem";
    metaEl.style.opacity    = "0.8";
    metaEl.style.marginBottom = "6px";
    metaEl.style.whiteSpace   = "nowrap";
    metaEl.style.overflow     = "hidden";
    metaEl.style.textOverflow = "ellipsis";
    metaEl.style.maxWidth     = "100%";
  }

  if (propsEl) {
    propsEl.style.fontSize   = "0.76rem";
    propsEl.style.lineHeight = "1.3";
    propsEl.style.maxHeight  = "140px";
    propsEl.style.overflow   = "auto";
    propsEl.style.paddingRight = "4px";
    propsEl.style.wordBreak  = "break-word";
  }

  // Allow the user to move onto the card without it vanishing
  el.addEventListener("mouseenter", () => {
    hoverPreviewHoveringCard = true;
  });

  el.addEventListener("mouseleave", () => {
    hoverPreviewHoveringCard = false;
    // If we've left both the row and the card, hide after a tiny delay
    setTimeout(() => {
      if (!hoverPreviewActiveRow && !hoverPreviewHoveringCard) {
        hideHoverPreview();
      }
    }, 120);
  });

  // Click anywhere on the card = open preview/editor/folder
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!hoverPreviewContext) return;

    const ctx = hoverPreviewContext;

    // Hide the hover card immediately so it doesn't hang around
    hideHoverPreview();

    if (ctx.type === "file") {
      openDefaultFileFromHover(ctx.file);
    } else if (ctx.type === "folder") {
      const dest = ctx.folder;
      if (dest) {
        setCurrentFolderContext(dest);
        loadFileList(dest);
      }
    }
  });

  return el;
}

function hideHoverPreview() {
  cancelHoverPreview();
}

// allow ESC to quickly dismiss the hover preview
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" || e.key === "Esc") {
    hideHoverPreview();
  }
});

function parentFolderOf(path) {
  if (!path || path === 'root') return 'root';
  const parts = String(path).split('/').filter(Boolean);
  if (parts.length <= 1) return 'root';
  parts.pop();
  return parts.join('/');
}

function invalidateFolderStats(folders) {
  try {
    const arr = Array.isArray(folders) ? folders : [folders];
    window.dispatchEvent(new CustomEvent('folderStatsInvalidated', {
      detail: { folders: arr }
    }));
  } catch (e) {
    // best effort only
  }
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

// Clamp gallery columns when viewport shrinks
window.addEventListener('resize', () => {
  const maxCols = getGalleryMaxColumns();
  if ((window.galleryColumns || 0) > maxCols) {
    applyGalleryColumns(maxCols);
  }
});

window.addEventListener('keydown', async (e) => {
  if (window.__frIsModalOpen && window.__frIsModalOpen()) return;
  if (isTextEntryTarget(e.target)) return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;

  const key = e.key;
  if (!['F3', 'F4', 'F5', 'F6', 'F7', 'F8'].includes(key)) return;
  e.preventDefault();
  e.stopPropagation();

  if (key === 'F5') return handleCopySelected(new Event('click'));
  if (key === 'F6') return handleMoveSelected(new Event('click'));
  if (key === 'F8') return handleDeleteSelected(new Event('click'));

  if (key === 'F7') {
    const btn = document.getElementById('createFolderBtn');
    if (btn && !btn.disabled) btn.click();
    return;
  }

  const files = getActiveSelectedFileObjects();
  if (!files.length) {
    showToast(t('no_files_selected') || 'No files selected.');
    return;
  }
  const file = files[0];
  const folder = file.folder || window.currentFolder || 'root';

  if (key === 'F3') {
    try {
      const url = apiFileUrl(folder, file.name, true);
      const m = await import('./filePreview.js?v={{APP_QVER}}');
      m.previewFile(url, file.name);
    } catch (err) {
      console.error('Failed to open preview', err);
    }
    return;
  }

  if (key === 'F4') {
    if (!canEditFile(file.name) || !file.editable) {
      showToast(t('file_not_editable') || 'File is not editable.');
      return;
    }
    try {
      const m = await import('./fileEditor.js?v={{APP_QVER}}');
      m.editFile(file.name, folder);
    } catch (err) {
      console.error('Failed to open editor', err);
    }
  }
});

window.addEventListener('keydown', (e) => {
  if (window.__frIsModalOpen && window.__frIsModalOpen()) return;
  if (isTextEntryTarget(e.target)) return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;

  const key = e.key;

  if (key === '/' && !e.shiftKey) {
    const input = document.getElementById('searchInput');
    if (input) {
      e.preventDefault();
      e.stopPropagation();
      input.focus();
      input.select();
    }
    return;
  }

  if (key === '?' || (key === '/' && e.shiftKey)) {
    e.preventDefault();
    e.stopPropagation();
    showToast('Shortcuts: / search, ? help, Del delete, F3 preview, F4 edit, F5 copy, F6 move, F7 new folder, F8 delete.', 6000);
    return;
  }

  if (key === 'Delete') {
    e.preventDefault();
    e.stopPropagation();
    const selectedFolder = getSelectedFolderPath();
    if (selectedFolder) {
      setCurrentFolderContext(selectedFolder);
      openDeleteFolderModal();
      return;
    }
    handleDeleteSelected(new Event('click'));
  }
});

// Listen once: update strip + tree + inline rows when folder color changes
window.addEventListener('folderColorChanged', (e) => {
  const { folder } = e.detail || {};
  if (!folder) return;

  // 1) Update the strip (if that folder is currently shown)
  repaintStripIcon(folder);

  // 2) Refresh the tree icon (existing function)
  try { refreshFolderIcon(folder); } catch (e) { }

  // 3) Repaint any inline folder rows in the file table
  try {
    const safeFolder = CSS.escape(folder);
    document
      .querySelectorAll(`#fileList tr.folder-row[data-folder="${safeFolder}"]`)
      .forEach(row => {
        // reuse the same helper we used when injecting inline rows
        attachStripIconAsync(row, folder, 28);
      });
  } catch (e) {
    // CSS.escape might not exist on very old browsers; fail silently
  }
});

// Hide "Edit" for files >10 MiB
const MAX_EDIT_BYTES = 10 * 1024 * 1024;

// Max number of files allowed for non-ZIP multi-download
export const MAX_NONZIP_MULTI_DOWNLOAD = 20;

// Global queue + panel ref for stepper-style downloads
window.__nonZipDownloadQueue = window.__nonZipDownloadQueue || [];
window.__nonZipDownloadPanel = window.__nonZipDownloadPanel || null;

// Latest-response-wins guard (prevents double render/flicker if loadFileList gets called twice)
let __fileListReqSeq = { primary: 0, secondary: 0 };
let __dualPaneRestoreRunning = false;

window.itemsPerPage = parseInt(
  localStorage.getItem('itemsPerPage') || window.itemsPerPage || '50',
  10
);
window.currentPage = window.currentPage || 1;
window.viewMode = localStorage.getItem("viewMode") || "table";
window.currentSubfolders = window.currentSubfolders || [];

const PANE_FOLDER_STORAGE_KEYS = {
  primary: 'frPaneFolderPrimary',
  secondary: 'frPaneFolderSecondary'
};

function normalizePaneKey(pane) {
  return pane === 'secondary' ? 'secondary' : 'primary';
}

function readStoredPaneFolder(pane) {
  const key = PANE_FOLDER_STORAGE_KEYS[normalizePaneKey(pane)];
  if (!key) return "";
  try {
    return String(localStorage.getItem(key) || '').trim();
  } catch (e) {
    return "";
  }
}

function persistPaneFolder(pane, folder) {
  const key = PANE_FOLDER_STORAGE_KEYS[normalizePaneKey(pane)];
  if (!key || !folder) return;
  try {
    localStorage.setItem(key, folder);
  } catch (e) { /* ignore */ }
}

(function seedLastOpenedFolderFromPaneStorage() {
  try {
    const dualEnabled = localStorage.getItem('dualPaneMode') === 'true';
    if (!dualEnabled) return;
    const active = normalizePaneKey(localStorage.getItem('activePane'));
    const folder = readStoredPaneFolder(active);
    if (folder) localStorage.setItem('lastOpenedFolder', folder);
  } catch (e) { /* ignore */ }
})();

function ensurePaneState() {
  if (window.__frPaneState) return;
  const storedPrimary = readStoredPaneFolder('primary');
  const storedSecondary = readStoredPaneFolder('secondary');
  const initialFolder =
    storedPrimary ||
    window.currentFolder ||
    localStorage.getItem("lastOpenedFolder") ||
    "root";
  window.__frPaneState = {
    primary: {
      currentFolder: initialFolder,
      currentSubfolders: Array.isArray(window.currentSubfolders) ? window.currentSubfolders : [],
      currentPage: window.currentPage || 1,
      currentSearchTerm: window.currentSearchTerm || "",
      currentFolderCaps: window.currentFolderCaps || null,
      selectedFolderCaps: window.selectedFolderCaps || null,
      fileData: Array.isArray(fileData) ? fileData : [],
      hasLoaded: false,
      needsReload: false
    },
    secondary: {
      currentFolder: storedSecondary || null,
      currentSubfolders: [],
      currentPage: 1,
      currentSearchTerm: "",
      currentFolderCaps: null,
      selectedFolderCaps: null,
      fileData: [],
      hasLoaded: false,
      needsReload: false
    }
  };
}

function getPaneState(pane) {
  ensurePaneState();
  return window.__frPaneState[normalizePaneKey(pane)];
}

function savePaneState(pane, patch) {
  const state = getPaneState(pane);
  Object.assign(state, patch || {});
  if (patch && Object.prototype.hasOwnProperty.call(patch, 'currentFolder')) {
    persistPaneFolder(pane, state.currentFolder);
  }
}

function syncPaneStateFromGlobals(pane) {
  savePaneState(pane, {
    currentFolder: window.currentFolder || "root",
    currentSubfolders: Array.isArray(window.currentSubfolders) ? window.currentSubfolders : [],
    currentPage: window.currentPage || 1,
    currentSearchTerm: window.currentSearchTerm || "",
    currentFolderCaps: window.currentFolderCaps || null,
    selectedFolderCaps: window.selectedFolderCaps || null,
    fileData: Array.isArray(fileData) ? fileData : []
  });
}

function syncGlobalsFromPaneState(pane) {
  const state = getPaneState(pane);
  window.currentFolder = state.currentFolder || "root";
  window.currentSubfolders = Array.isArray(state.currentSubfolders) ? state.currentSubfolders : [];
  window.currentPage = state.currentPage || 1;
  window.currentSearchTerm = state.currentSearchTerm || "";
  window.currentFolderCaps = state.currentFolderCaps || null;
  window.selectedFolderCaps = state.selectedFolderCaps || null;
  fileData = Array.isArray(state.fileData) ? state.fileData : [];
}

function setPaneHasContent(pane, hasContent) {
  const selector = normalizePaneKey(pane) === 'secondary'
    ? '.secondary-pane'
    : '.primary-pane';
  const el = document.querySelector(selector);
  if (!el) return;
  el.classList.toggle('fr-pane-has-content', !!hasContent);
}

function getPaneLayoutMode(targetEl) {
  const pane = targetEl && targetEl.closest ? targetEl.closest('.file-list-pane') : null;
  const width = pane ? pane.getBoundingClientRect().width : window.innerWidth;
  if (width <= 720) return 'narrow';
  if (width <= 980) return 'medium';
  return 'wide';
}

function updatePaneWidthClasses() {
  const panes = document.querySelectorAll('.file-list-pane');
  panes.forEach(pane => {
    const width = pane.getBoundingClientRect().width;
    if (!width) return;
    const mode = width <= 720 ? 'narrow' : (width <= 980 ? 'medium' : 'wide');
    pane.classList.toggle('fr-pane-narrow', mode === 'narrow');
    pane.classList.toggle('fr-pane-medium', mode === 'medium');
  });
  updatePaneStickyClasses();
}

function updatePaneStickyClasses() {
  const panes = document.querySelectorAll('.file-list-pane');
  panes.forEach(pane => pane.classList.remove('fr-pane-sticky'));

  if (!window.dualPaneEnabled || panes.length < 2) return;

  const paneList = Array.from(panes);
  const heights = paneList.map(pane => pane.getBoundingClientRect().height || 0);
  const viewport = window.innerHeight || 0;
  const buffer = 24;

  if (!viewport || heights.every(h => h <= 0)) return;

  const canStick = heights.map(h => h + buffer <= viewport);

  if (canStick[0] && canStick[1]) {
    paneList.forEach(pane => pane.classList.add('fr-pane-sticky'));
    return;
  }

  if (canStick[0] && heights[0] < heights[1]) {
    paneList[0].classList.add('fr-pane-sticky');
  }
  if (canStick[1] && heights[1] < heights[0]) {
    paneList[1].classList.add('fr-pane-sticky');
  }
}

function ensureDualPaneTargetHint() {
  const actions = document.getElementById('fileListActions');
  if (!actions) return null;
  let hint = document.getElementById('dualPaneTargetHint');
  if (!hint) {
    hint = document.createElement('div');
    hint.id = 'dualPaneTargetHint';
    hint.className = 'file-list-dual-hint fr-dual-target-hint';
    actions.appendChild(hint);
  }
  return hint;
}

function updateDualPaneTargetHint() {
  const hint = ensureDualPaneTargetHint();
  if (!hint) return;
  if (!window.dualPaneEnabled || !window.__frPaneState) {
    hint.style.display = 'none';
    return;
  }
  const active = normalizePaneKey(window.activePane);
  const other = active === 'secondary' ? 'primary' : 'secondary';
  const otherFolder = window.__frPaneState?.[other]?.currentFolder || '';
  if (!otherFolder) {
    hint.style.display = 'none';
    return;
  }
  const sideLabel = other === 'secondary' ? 'Right' : 'Left';
  const folderLabel = otherFolder === 'root' ? '(Root)' : otherFolder;
  hint.textContent = `Target: ${sideLabel} -> ${folderLabel}`;
  hint.title = `Copy/move target is the ${sideLabel.toLowerCase()} pane folder.`;
  hint.style.display = 'inline-flex';
}

function updateInactivePanePlaceholder(inactiveKey) {
  if (!window.dualPaneEnabled) return;
  const container = document.getElementById('fileListContainerSecondary');
  if (!container) return;

  const ensurePlaceholderElements = () => {
    let hintEl = container.querySelector('.file-list-dual-hint');
    if (!hintEl) {
      let actionsWrap = container.querySelector('.file-list-actions');
      const hasToolbar = actionsWrap && actionsWrap.querySelector('#fileListActions');
      if (!actionsWrap || hasToolbar) {
        actionsWrap = document.createElement('div');
        actionsWrap.className = 'file-list-actions';
        const title = container.querySelector('#fileListTitleSecondary');
        if (title && title.parentNode === container) {
          title.insertAdjacentElement('afterend', actionsWrap);
        } else {
          container.insertBefore(actionsWrap, container.firstChild);
        }
      }

      hintEl = document.createElement('div');
      hintEl.className = 'file-list-dual-hint';
      hintEl.setAttribute('data-i18n-key', 'dual_pane_secondary_hint');
      hintEl.textContent = t('dual_pane_secondary_hint') || 'Select a folder to open here.';
      actionsWrap.appendChild(hintEl);
    }

    let emptyEl = container.querySelector('#fileListSecondary .empty-state');
    const listEl = container.querySelector('#fileListSecondary');
    if (!emptyEl && listEl && listEl.childElementCount === 0) {
      listEl.classList.add('file-list-secondary-empty');
      emptyEl = document.createElement('div');
      emptyEl.className = 'empty-state';
      emptyEl.setAttribute('data-i18n-key', 'dual_pane_secondary_empty');
      emptyEl.textContent = t('dual_pane_secondary_empty') || 'Select a folder to open in the right pane.';
      listEl.appendChild(emptyEl);
    }

    return { hintEl, emptyEl };
  };

  const state = getPaneState(inactiveKey);
  let folder = (state && typeof state.currentFolder === 'string')
    ? state.currentFolder.trim()
    : '';
  if (!folder) {
    folder = readStoredPaneFolder(inactiveKey);
  }
  const label = folder === 'root' ? 'root' : folder;

  const ensured = ensurePlaceholderElements();

  const titleEl = document.getElementById('fileListTitleSecondary');
  if (titleEl && !titleEl.dataset.baseText) {
    titleEl.dataset.baseText = titleEl.textContent || '';
  }

  const hintEl = ensured.hintEl || container.querySelector('.file-list-dual-hint');
  if (hintEl && !hintEl.dataset.baseText) {
    hintEl.dataset.baseText = hintEl.textContent || (t('dual_pane_secondary_hint') || 'Select a folder to open here.');
  }

  const emptyEl = ensured.emptyEl || container.querySelector('#fileListSecondary .empty-state');
  if (emptyEl && !emptyEl.dataset.baseText) {
    emptyEl.dataset.baseText = emptyEl.textContent || (t('dual_pane_secondary_empty') || 'Select a folder to open in the right pane.');
  }

  if (!folder) {
    if (titleEl && titleEl.dataset.baseText) titleEl.textContent = titleEl.dataset.baseText;
    if (hintEl && hintEl.dataset.baseText) hintEl.textContent = hintEl.dataset.baseText;
    if (emptyEl && emptyEl.dataset.baseText) emptyEl.textContent = emptyEl.dataset.baseText;
    return;
  }

  if (titleEl) {
    const prefix = t('files_in') || 'Files in';
    titleEl.textContent = `${prefix} (${formatBreadcrumbText(folder)})`;
  }
  if (hintEl) {
    hintEl.textContent = `${hintEl.dataset.baseText} (${label})`;
  }
  if (emptyEl) {
    emptyEl.textContent = `${emptyEl.dataset.baseText} (${label})`;
  }
}

function resetInactivePaneBaseText() {
  const titleEl = document.getElementById('fileListTitleSecondary');
  if (titleEl && titleEl.dataset) {
    delete titleEl.dataset.baseText;
  }

  const container = document.getElementById('fileListContainerSecondary');
  if (!container) return;

  const hintEl = container.querySelector('.file-list-dual-hint');
  if (hintEl && hintEl.dataset) {
    delete hintEl.dataset.baseText;
  }

  const emptyEl = container.querySelector('#fileListSecondary .empty-state');
  if (emptyEl && emptyEl.dataset) {
    delete emptyEl.dataset.baseText;
  }
}

function formatBreadcrumbText(folder) {
  const path = (typeof folder === 'string' && folder.length) ? folder : 'root';
  if (path === 'root') return 'root';
  const parts = path.split('/').filter(Boolean);
  return ['root', ...parts].join(' › ');
}

function resolvePaneFolderForTitle(paneKey, { fallbackToCurrent = false } = {}) {
  if (!paneKey) return '';
  let folder = '';
  try {
    const state = getPaneState(paneKey);
    folder = (state && typeof state.currentFolder === 'string')
      ? state.currentFolder.trim()
      : '';
  } catch (e) {
    folder = '';
  }

  if (!folder) {
    folder = readStoredPaneFolder(paneKey);
  }

  if (!folder && fallbackToCurrent) {
    folder = window.currentFolder || localStorage.getItem('lastOpenedFolder') || 'root';
  }

  return folder || '';
}

function refreshPaneTitlesFromState() {
  ensurePaneState();
  let storedActive = null;
  try { storedActive = localStorage.getItem('activePane'); } catch (e) { storedActive = null; }

  const active = normalizePaneKey(window.activePane || storedActive || 'primary');
  const activeFolder = resolvePaneFolderForTitle(active, { fallbackToCurrent: true });
  if (activeFolder) {
    updateBreadcrumbTitle(activeFolder);
  }

  if (window.dualPaneEnabled) {
    const other = active === 'secondary' ? 'primary' : 'secondary';
    updateInactivePanePlaceholder(other);
    updateDualPaneTargetHint();
  }
}

// Default folder display settings from localStorage
try {
  const storedStrip  = localStorage.getItem('showFoldersInList');
  const storedInline = localStorage.getItem('showInlineFolders');

  window.showFoldersInList = storedStrip === null ? true : storedStrip === 'true';
  window.showInlineFolders = storedInline === null ? true : storedInline === 'true';
} catch (e) {
  // if localStorage blows up, fall back to both enabled
  window.showFoldersInList = true;
  window.showInlineFolders = true;
}

// Dual pane mode (UI-only scaffolding)
function setActivePane(pane, opts) {
  ensurePaneState();
  const next = normalizePaneKey(pane);
  const current = normalizePaneKey(window.activePane);

  if (current !== next) {
    syncPaneStateFromGlobals(current);

    const activeContainer = document.getElementById('fileListContainer');
    const inactiveContainer = document.getElementById('fileListContainerSecondary');
    if (activeContainer && inactiveContainer) {
      activeContainer.id = 'fileListContainerSecondary';
      inactiveContainer.id = 'fileListContainer';
    }

    const activeTitle = document.getElementById('fileListTitle');
    const inactiveTitle = document.getElementById('fileListTitleSecondary');
    if (activeTitle && inactiveTitle) {
      activeTitle.id = 'fileListTitleSecondary';
      inactiveTitle.id = 'fileListTitle';
    }

    const activeList = document.getElementById('fileList');
    const inactiveList = document.getElementById('fileListSecondary');
    if (activeList && inactiveList) {
      activeList.id = 'fileListSecondary';
      inactiveList.id = 'fileList';
    }
  }

  window.activePane = next;

  const activeContainer = document.getElementById('fileListContainer');
  const inactiveContainer = document.getElementById('fileListContainerSecondary');
  if (activeContainer) activeContainer.classList.add('fr-pane-active');
  if (inactiveContainer) inactiveContainer.classList.remove('fr-pane-active');

  const actions = document.getElementById('fileListActions');
  if (actions && activeContainer) {
    const title = activeContainer.querySelector('#fileListTitle');
    if (title && title.parentNode === activeContainer) {
      title.insertAdjacentElement('afterend', actions);
    } else {
      activeContainer.insertBefore(actions, activeContainer.firstChild);
    }

    const strip = document.getElementById('folderStripContainer');
    if (strip) {
      actions.parentNode.insertBefore(strip, actions);
    }
  }

  syncGlobalsFromPaneState(next);
  const state = getPaneState(next);
  if (state.currentFolder) {
    updateBreadcrumbTitle(state.currentFolder);
    try { syncFolderTreeSelection(state.currentFolder); } catch (e) { /* ignore */ }
  }
  updateEncryptedFolderBanner(state.currentFolder || window.currentFolder || 'root');
  refreshFileSummaryForPane(next);
  if (state.needsReload && state.currentFolder) {
    savePaneState(next, { needsReload: false });
    state.needsReload = false;
    loadFileList(state.currentFolder);
  } else if (
    window.dualPaneEnabled &&
    !state.hasLoaded &&
    state.currentFolder &&
    !(opts && opts.skipAutoLoad)
  ) {
    // Lazy-load the pane's last folder only when it becomes active.
    loadFileList(state.currentFolder);
  }

  setPaneHasContent(next, !!state.hasLoaded);
  applyEncryptedFolderUiRestrictions();
  updateFileActionButtons();
  updatePaneWidthClasses();
  updateDualPaneTargetHint();
  updateInactivePanePlaceholder(next === 'secondary' ? 'primary' : 'secondary');

  if (!opts || !opts.skipStore) {
    try { localStorage.setItem('activePane', next); } catch (e) { /* ignore */ }
  }
}

function applyDualPaneMode(force) {
  let enabled = false;
  try {
    enabled = (typeof force === 'boolean')
      ? force
      : localStorage.getItem('dualPaneMode') === 'true';
  } catch (e) { /* ignore */ }
  window.dualPaneEnabled = enabled;

  const shell = document.getElementById('fileListShell');
  if (shell) shell.classList.toggle('dual-pane', enabled);

  const storedActive = (function () {
    try { return localStorage.getItem('activePane'); } catch (e) { return null; }
  })();
  if (enabled) {
    setActivePane(storedActive === 'secondary' ? 'secondary' : 'primary', { skipStore: true, skipAutoLoad: true });
  } else {
    setActivePane('primary', { skipStore: true, skipAutoLoad: true });
  }

  const primaryPane = document.querySelector('.file-list-pane.primary-pane');
  const secondaryPane = document.querySelector('.file-list-pane.secondary-pane');
  if (enabled) {
    if (primaryPane) primaryPane.style.display = '';
    if (secondaryPane) secondaryPane.style.display = '';
  } else {
    if (primaryPane) primaryPane.style.display = '';
    if (secondaryPane) secondaryPane.style.display = 'none';
    if (primaryPane) primaryPane.classList.remove('fr-pane-active');
    if (secondaryPane) secondaryPane.classList.remove('fr-pane-active');
  }
  updatePaneWidthClasses();
  updateDualPaneTargetHint();
}

window.applyDualPaneMode = applyDualPaneMode;

try {
  window.addEventListener('filerise:i18n-applied', () => {
    resetInactivePaneBaseText();
    refreshPaneTitlesFromState();
  });
} catch (e) { /* ignore */ }

// Activate pane on click
document.addEventListener('click', (e) => {
  const pane = e.target && e.target.closest
    ? e.target.closest('.file-list-pane')
    : null;
  if (!pane) return;
  setActivePane(pane.classList.contains('secondary-pane') ? 'secondary' : 'primary');
}, true);

function isPaneDropTargetAllowed(target) {
  if (!target || !target.closest) return true;
  return !target.closest('.folder-item, .folder-row, .folder-option, .folder-strip-container, .folder-tree');
}

function paneDragOverHandler(e) {
  if (!window.dualPaneEnabled) return;
  if (!isPaneDropTargetAllowed(e.target)) return;
  e.preventDefault();
  e.currentTarget.classList.add('fr-pane-drop-target');
}

function paneDragLeaveHandler(e) {
  e.currentTarget.classList.remove('fr-pane-drop-target');
}

async function maybeRestoreInactivePane(activePaneKey) {
  if (!window.dualPaneEnabled || __dualPaneRestoreRunning) return;
  ensurePaneState();

  const active = normalizePaneKey(activePaneKey || window.activePane);
  const other = active === 'secondary' ? 'primary' : 'secondary';
  const state = window.__frPaneState?.[other];
  const otherFolder = (state && state.currentFolder) || readStoredPaneFolder(other);

  if (!otherFolder || (state && state.hasLoaded)) return;

  __dualPaneRestoreRunning = true;
  try {
    if (normalizePaneKey(window.activePane) !== other) {
      setActivePane(other, { skipStore: true });
    }
    await loadFileList(otherFolder, { pane: other, skipFallback: true });
  } catch (e) { /* ignore */ }
  finally {
    if (normalizePaneKey(window.activePane) !== active) {
      setActivePane(active, { skipStore: true });
    }
    __dualPaneRestoreRunning = false;
  }
}

function pruneMovedFolderFromInactivePane(sourceFolder, sourceParent) {
  if (!window.dualPaneEnabled || !sourceFolder || !window.__frPaneState) return;

  const inactiveKey = normalizePaneKey(window.activePane) === 'secondary'
    ? 'primary'
    : 'secondary';
  const state = window.__frPaneState[inactiveKey];
  if (!state || state.currentFolder !== sourceParent) return;

  if (Array.isArray(state.currentSubfolders)) {
    state.currentSubfolders = state.currentSubfolders.filter(sf => sf.full !== sourceFolder);
  }

  const list = document.getElementById('fileListSecondary');
  if (!list) return;

  try {
    const row = list.querySelector(`tr.folder-row[data-folder="${CSS.escape(sourceFolder)}"]`);
    if (row) row.remove();
  } catch (e) { /* ignore */ }
}

function getPaneListForKey(paneKey) {
  const pane = document.querySelector(
    paneKey === 'secondary' ? '.file-list-pane.secondary-pane' : '.file-list-pane.primary-pane'
  );
  if (!pane) return null;
  return pane.querySelector('#fileList, #fileListSecondary') || pane;
}

function pruneMovedFilesFromInactivePane(sourceFolder, movedFiles) {
  if (!window.dualPaneEnabled || !sourceFolder || !window.__frPaneState) return;

  const names = Array.isArray(movedFiles)
    ? movedFiles.map(f => {
        if (!f) return '';
        if (typeof f === 'string') return f;
        if (typeof f === 'object') {
          return String(f.name || f.file || f.filename || f.fileName || '');
        }
        return String(f);
      }).map(n => String(n || '').trim()).filter(Boolean)
    : [];
  if (!names.length) return;

  const nameSet = new Set();
  names.forEach(name => {
    const raw = String(name || '').trim();
    if (!raw) return;
    nameSet.add(raw);
    const decoded = decodeHtmlEntities(raw);
    if (decoded && decoded !== raw) {
      nameSet.add(decoded);
    }
  });
  ['primary', 'secondary'].forEach(paneKey => {
    const state = window.__frPaneState[paneKey];
    if (!state || state.currentFolder !== sourceFolder) return;

    if (Array.isArray(state.fileData)) {
      state.fileData = state.fileData.filter(f => f && !nameSet.has(f.name));
    }

    const list = getPaneListForKey(paneKey);
    if (!list) return;

    list.querySelectorAll('tr[data-file-name], .gallery-card[data-file-name]').forEach(row => {
      const raw = row.getAttribute('data-file-name') || '';
      const decoded = decodeHtmlEntities(raw);
      if (nameSet.has(raw) || nameSet.has(decoded)) {
        row.remove();
      }
    });
  });
}

async function paneDropHandler(e) {
  if (!window.dualPaneEnabled) return;
  if (!isPaneDropTargetAllowed(e.target)) return;
  e.preventDefault();
  e.currentTarget.classList.remove('fr-pane-drop-target');

  const paneKey = e.currentTarget.classList.contains('secondary-pane') ? 'secondary' : 'primary';
  const targetFolder = getPaneState(paneKey)?.currentFolder || '';
  if (!targetFolder) return;

  let dragData = null;
  try {
    const raw = e.dataTransfer.getData('application/json') || '{}';
    dragData = JSON.parse(raw);
  } catch (err) {
    dragData = null;
  }

  if (!dragData) return;

  const scheduleRepair = () => {
    try {
      const kick = () => { try { repairBlankFolderIcons({ force: true }); } catch (e) {} };
      if (typeof queueMicrotask === 'function') queueMicrotask(kick);
      setTimeout(kick, 80);
      setTimeout(kick, 250);
    } catch (e) { /* ignore */ }
  };

  if (dragData.dragType === 'folder' && dragData.folder) {
    const sourceFolder = String(dragData.folder || '').trim();
    if (!sourceFolder || sourceFolder === 'root') return;
    if (targetFolder === sourceFolder || targetFolder.startsWith(sourceFolder + '/')) {
      showToast('Invalid destination.');
      return;
    }

    if (normalizePaneKey(window.activePane) !== paneKey) {
      setActivePane(paneKey);
    }

    const sourceParent = dragData.sourceFolder || parentFolderOf(sourceFolder);

    try {
      const res = await fetch('/api/folder/moveFolder.php', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': window.csrfToken
        },
        body: JSON.stringify({
          source: sourceFolder,
          destination: targetFolder
        })
      });
      const data = await res.json().catch(() => ({}));
      if (data && !data.error) {
        showToast(`Folder moved to ${targetFolder}!`);
        invalidateFolderStats([sourceParent, targetFolder]);
        await syncTreeAfterFolderMove(sourceFolder, targetFolder);
        markPaneNeedsReloadForFolder(sourceParent);
        pruneMovedFolderFromInactivePane(sourceFolder, sourceParent);
        scheduleRepair();
      } else {
        showToast(`Error: ${data && data.error || 'Could not move folder'}`);
      }
    } catch (err) {
      console.error('Error moving folder:', err);
      showToast('Error moving folder.');
    }
    return;
  }

  const files = Array.isArray(dragData.files) ? dragData.files : [];
  if (!files.length) return;

  const sourceFolder = dragData.sourceFolder || window.currentFolder || 'root';
  if (targetFolder === sourceFolder) {
    showToast('Already in target folder.');
    return;
  }

  if (normalizePaneKey(window.activePane) !== paneKey) {
    setActivePane(paneKey);
  }

  try {
    const res = await fetch('/api/file/moveFiles.php', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': window.csrfToken
      },
      body: JSON.stringify({
        source: sourceFolder,
        files,
        destination: targetFolder
      })
    });
    const data = await res.json().catch(() => ({}));
    if (data.success) {
      showToast(`File(s) moved successfully to ${targetFolder}!`);
      invalidateFolderStats([sourceFolder, targetFolder]);
      loadFileList(targetFolder).finally(scheduleRepair);
      refreshFolderIcon(targetFolder);
      refreshFolderIcon(sourceFolder);
      markPaneNeedsReloadForFolder(sourceFolder);
      pruneMovedFilesFromInactivePane(sourceFolder, files);
    } else {
      showToast(`Error moving files: ${data.error || 'Unknown error'}`);
    }
  } catch (err) {
    console.error('Error moving files:', err);
    showToast('Error moving files.');
  }
}

function bindPaneDropTargets() {
  const panes = document.querySelectorAll('.file-list-pane');
  panes.forEach(pane => {
    if (pane.dataset.dropBound === '1') return;
    pane.dataset.dropBound = '1';
    pane.addEventListener('dragover', paneDragOverHandler);
    pane.addEventListener('dragleave', paneDragLeaveHandler);
    pane.addEventListener('drop', paneDropHandler);
  });
}

// Apply initial dual-pane state once DOM is ready
try { applyDualPaneMode(); } catch (e) { /* ignore */ }
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => applyDualPaneMode(), { once: true });
}
if (typeof window.__frDualPanePending !== 'undefined') {
  try { applyDualPaneMode(!!window.__frDualPanePending); } catch (e) { /* ignore */ }
  delete window.__frDualPanePending;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => bindPaneDropTargets(), { once: true });
} else {
  bindPaneDropTargets();
}

try {
  window.addEventListener('resize', debounce(updatePaneWidthClasses, 150));
} catch (e) { /* ignore */ }

// Global flag for advanced search mode.
window.advancedSearchEnabled = false;

// ---- Inline folder selection helpers --------------------------
function getFolderCheckboxes() {
  return Array.from(document.querySelectorAll('#fileList .folder-checkbox'));
}

function getFileCheckboxes() {
  return Array.from(document.querySelectorAll('#fileList .file-checkbox'));
}

function getActiveSelectedFileNames() {
  return Array.from(document.querySelectorAll('#fileList .file-checkbox:checked'))
    .map(cb => cb.value);
}

function getActiveSelectedFileObjects() {
  const selected = getActiveSelectedFileNames();
  if (!selected.length) return [];
  const selectedSet = new Set(selected);
  return (Array.isArray(fileData) ? fileData : [])
    .filter(f => selectedSet.has(escapeHTML(f.name)));
}

function clearFolderSelections() {
  getFolderCheckboxes().forEach(cb => {
    if (cb.checked) {
      cb.checked = false;
      updateRowHighlight(cb);
    }
  });
  window.selectedInlineFolder = null;
  window.selectedFolderCaps = null;
  savePaneState(normalizePaneKey(window.activePane), { selectedFolderCaps: null });
}

function clearFileSelections() {
  getFileCheckboxes().forEach(cb => {
    if (cb.checked) {
      cb.checked = false;
      updateRowHighlight(cb);
    }
  });
}

function getSelectedFolderPath() {
  const cb = document.querySelector('#fileList .folder-checkbox:checked');
  return cb ? cb.dataset.folder || null : null;
}

async function refreshSelectedFolderCaps(folder) {
  if (!folder) {
    window.selectedFolderCaps = null;
    savePaneState(normalizePaneKey(window.activePane), { selectedFolderCaps: null });
    updateFileActionButtons();
    return;
  }
  window.selectedFolderCaps = null;
  try {
    const caps = await fetchFolderCaps(folder);
    window.selectedFolderCaps = caps || null;
    savePaneState(normalizePaneKey(window.activePane), { selectedFolderCaps: window.selectedFolderCaps });
  } catch (e) {
    window.selectedFolderCaps = null;
    savePaneState(normalizePaneKey(window.activePane), { selectedFolderCaps: null });
  }
  updateFileActionButtons();
}

function isTextEntryTarget(target) {
  const tag = target?.tagName ? target.tagName.toLowerCase() : '';
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
}

function markPaneNeedsReloadForFolder(folder) {
  if (!window.dualPaneEnabled || !window.__frPaneState || !folder) return;
  const active = normalizePaneKey(window.activePane);
  ['primary', 'secondary'].forEach(pane => {
    if (pane === active) return;
    const state = window.__frPaneState[pane];
    if (state && state.currentFolder === folder) {
      state.needsReload = true;
    }
  });
}

function handleFolderCheckboxChange(cb) {
  if (!cb) return;

  // Enforce single-select folders and mutually exclusive with files
  if (cb.checked) {
    clearFileSelections();
    getFolderCheckboxes().forEach(other => {
      if (other !== cb && other.checked) {
        other.checked = false;
        updateRowHighlight(other);
      }
    });
    window.selectedInlineFolder = cb.dataset.folder || null;
  } else {
    window.selectedInlineFolder = null;
  }

  updateRowHighlight(cb);
  updateFileActionButtons();
  refreshSelectedFolderCaps(window.selectedInlineFolder);
}

function setCurrentFolderContext(folder) {
  if (!folder) return;
  window.currentFolder = folder;
  try { localStorage.setItem("lastOpenedFolder", folder); } catch (e) { /* ignore */ }
  updateBreadcrumbTitle(folder);
  savePaneState(normalizePaneKey(window.activePane), { currentFolder: folder });
}

function clampRowHeight(v) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return 44;
  return Math.max(20, Math.min(60, n));
}

function applyRowHeight(v) {
  const h = clampRowHeight(v);
  document.documentElement.style.setProperty('--file-row-height', `${h}px`);
  localStorage.setItem('rowHeight', h);

  // compact marker for tiny rows
  if (h <= 32) {
    document.documentElement.setAttribute('data-row-compact', '1');
  } else {
    document.documentElement.removeAttribute('data-row-compact');
  }

  try { syncFolderIconSizeToRowHeight(); } catch (e) {}
  return h;
}

function getGalleryMaxColumns() {
  const w = window.innerWidth;
  if (w < 600) return 1;
  if (w < 1024) return 3;
  if (w < 1440) return 4;
  return 6;
}

function clampGalleryColumns(v) {
  const max = getGalleryMaxColumns();
  const n = parseInt(v, 10);
  const base = Number.isFinite(n) ? n : 3;
  return Math.max(1, Math.min(max, base));
}

// Apply stored row height immediately so the table uses it on first render.
applyRowHeight(localStorage.getItem('rowHeight') || '44');

// Base gallery column value (clamped per screen width)
window.galleryColumns = clampGalleryColumns(localStorage.getItem('galleryColumns') || window.galleryColumns || 3);

// --- Folder stats cache (for isEmpty.php) ---
const _folderStatsCache = new Map();
const _folderSummaryCache = new Map();
const MAX_CONCURRENT_FOLDER_STATS_REQS = 6;
let _activeFolderStatsReqs = 0;
const _folderStatsQueue = [];

function _runFolderStats(url) {
  return new Promise(resolve => {
    const start = () => {
      _activeFolderStatsReqs++;
      _fetchJSONWithTimeout(url, 2500)
        .then(resolve)
        .finally(() => {
          _activeFolderStatsReqs--;
          const next = _folderStatsQueue.shift();
          if (next) next();
        });
    };

    if (_activeFolderStatsReqs < MAX_CONCURRENT_FOLDER_STATS_REQS) start();
    else _folderStatsQueue.push(start);
  });
}

function fetchFolderStats(folder) {
  if (!folder) return Promise.resolve(null);

  if (_folderStatsCache.has(folder)) {
    return _folderStatsCache.get(folder);
  }

  const url = withBase(`/api/folder/isEmpty.php?folder=${encodeURIComponent(folder)}&t=${Date.now()}`);
  const p = _runFolderStats(url).then(data => {
    // If this was a transient network/server failure, don't poison the cache.
    if (data && data.__fr_err) {
      _folderStatsCache.delete(folder);
      return { folders: 0, files: 0 };
    }
    return data || { folders: 0, files: 0 };
  });

  _folderStatsCache.set(folder, p);
  return p;
}

function fetchFolderSummaryStats(folder) {
  if (!folder) return Promise.resolve(null);

  if (_folderSummaryCache.has(folder)) {
    return _folderSummaryCache.get(folder);
  }

  const url = withBase(`/api/folder/isEmpty.php?folder=${encodeURIComponent(folder)}&deep=1&t=${Date.now()}`);
  const p = _fetchJSONWithTimeout(url, 6000).then(data => {
    if (data && data.__fr_err) {
      _folderSummaryCache.delete(folder);
      return null;
    }
    return data || null;
  });

  _folderSummaryCache.set(folder, p);
  return p;
}

// --- Folder "peek" cache (first few child folders/files) ---
const FOLDER_PEEK_MAX_ITEMS = 6;
const _folderPeekCache = new Map();

// Listen for invalidation events from drag/drop, etc.
window.addEventListener('folderStatsInvalidated', (e) => {
  const detail = e.detail || {};
  let folders = detail.folders || detail.folder || null;
  if (!folders) return;
  if (!Array.isArray(folders)) folders = [folders];

  folders.forEach(f => {
    if (!f) return;
    _folderStatsCache.delete(f);
    _folderPeekCache.delete(f);
    _folderSummaryCache.delete(f);

    try { refreshFolderIcon(f); } catch (e2) { /* ignore */ }

    try {
      const safe = CSS.escape(f);
      const stripItem = document.querySelector(`#folderStripContainer .folder-item[data-folder="${safe}"]`);
      if (stripItem) attachStripIconAsync(stripItem, f, 48);
      document
        .querySelectorAll(
          `#fileList tr.folder-row[data-folder="${safe}"], ` +
          `#fileListSecondary tr.folder-row[data-folder="${safe}"]`
        )
        .forEach(row => attachStripIconAsync(row, f, 28));
    } catch (e3) { /* ignore */ }
  });
});

/**
 * Best-effort peek: first few direct child folders + files for a folder.
 * Uses existing getFolderList.php + getFileList.php.
 *
 * Returns: { items: Array<{type,name}>, truncated: boolean }
 */
async function fetchFolderPeek(folder) {
  if (!folder) return null;

  if (_folderPeekCache.has(folder)) {
    return _folderPeekCache.get(folder);
  }

  const p = (async () => {
    try {
      // 1) Files in this folder
      let files = [];
      try {
        const res = await fetch(
          withBase(`/api/file/getFileList.php?folder=${encodeURIComponent(folder)}&recursive=0&t=${Date.now()}`),
          { credentials: "include" }
        );
        const raw = await safeJson(res);
        if (Array.isArray(raw.files)) {
          files = raw.files;
        } else if (raw.files && typeof raw.files === "object") {
          files = Object.entries(raw.files).map(([name, meta]) => ({
            ...(meta || {}),
            name
          }));
        }
      } catch (e) {
        // ignore file errors; we can still show folders
      }

      // 2) Direct subfolders
      let subfolderNames = [];
      try {
        const res2 = await fetch(
          withBase(`/api/folder/getFolderList.php?folder=${encodeURIComponent(folder)}`),
          { credentials: "include" }
        );
        const raw2 = await safeJson(res2);

        if (Array.isArray(raw2)) {
          const allPaths = raw2.map(item => item.folder ?? item);
          const depth = folder === "root" ? 1 : folder.split("/").length + 1;

          subfolderNames = allPaths
            .filter(p => {
              if (folder === "root") return p.indexOf("/") === -1;
              if (!p.startsWith(folder + "/")) return false;
              return p.split("/").length === depth;
            })
            .map(p => p.split("/").pop() || p);
        }
      } catch (e) {
        // ignore folder errors
      }

      const items = [];

      // Folders first
      for (const name of subfolderNames) {
        if (!name) continue;
        items.push({ type: "folder", name });
        if (items.length >= FOLDER_PEEK_MAX_ITEMS) break;
      }

      // Then a few files
      if (items.length < FOLDER_PEEK_MAX_ITEMS && Array.isArray(files)) {
        for (const f of files) {
          if (!f || !f.name) continue;
          items.push({ type: "file", name: f.name });
          if (items.length >= FOLDER_PEEK_MAX_ITEMS) break;
        }
      }

      // Were there more candidates than we showed?
      const totalCandidates =
        (Array.isArray(subfolderNames) ? subfolderNames.length : 0) +
        (Array.isArray(files) ? files.length : 0);

      const truncated = totalCandidates > items.length;

      return { items, truncated };
    } catch (e) {
      return null;
    }
  })();

  _folderPeekCache.set(folder, p);
  return p;
}

/* ===========================================================
   SECURITY: build file URLs only via the API (no /uploads)
   =========================================================== */
   function apiFileUrl(folder, name, inline = false) {
    const fParam = folder && folder !== "root" ? folder : "root";
    const q = new URLSearchParams({
      folder: fParam,
      file: name,
      inline: inline ? "1" : "0"
    });
  
    // Try to find this file in fileData to get a stable cache key
    try {
      if (Array.isArray(fileData)) {
        const meta = fileData.find(
          f => f.name === name && (f.folder || "root") === fParam
        );
        if (meta) {
          const v = meta.cacheKey || meta.modified || meta.uploaded || meta.sizeBytes;
          if (v != null && v !== "") {
            q.set("t", String(v));  // stable per-file token
          }
        }
      }
    } catch (e) { /* best-effort only */ }
  
	    return withBase(`/api/file/download.php?${q.toString()}`);
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
    // Clear any folder selection when toggling all files
    document.querySelectorAll('#fileList .folder-checkbox:checked').forEach(cb => {
      cb.checked = false;
      updateRowHighlight(cb);
    });
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

function fillHoverPreviewForRow(row) {
  if (isHoverPreviewDisabled()) {
    hideHoverPreview();
    return;
  }

  const el        = ensureHoverPreviewEl();
  const titleEl   = el.querySelector(".hover-preview-title");
  const metaEl    = el.querySelector(".hover-preview-meta");
  const thumbEl   = el.querySelector(".hover-preview-thumb");
  const propsEl   = el.querySelector(".hover-preview-props");
  const snippetEl = el.querySelector(".hover-preview-snippet");

  

  if (!titleEl || !metaEl || !thumbEl || !propsEl || !snippetEl) return;

// Reset content
thumbEl.innerHTML = "";
propsEl.innerHTML = "";
snippetEl.textContent = "";
snippetEl.style.display = "none";
metaEl.textContent = "";
titleEl.textContent = "";

// reset snippet style defaults (for file previews)
snippetEl.style.whiteSpace   = "pre-wrap";
snippetEl.style.overflowX    = "auto";
snippetEl.style.textOverflow = "clip";
snippetEl.style.wordBreak    = "break-word";

// Reset per-row sizing...
thumbEl.style.minHeight = "0";

  const isFolder = row.classList.contains("folder-row");

  if (isFolder) {
    // =========================
    //   FOLDER HOVER PREVIEW
    // =========================
    const folderPath = row.dataset.folder || "";
    const folderName = folderPath.split("/").pop() || folderPath || "(root)";

    titleEl.textContent = folderName;

    hoverPreviewContext = {
      type: "folder",
      folder: folderPath
    };

    // Right column: icon + path (start props array so we can append later)
    const props = [];

    props.push(`
      <div class="hover-prop-line" style="display:flex;align-items:center;margin-bottom:4px;">
        <span class="hover-preview-icon material-icons" style="margin-right:6px;">folder</span>
        <strong>${t("folder") || "Folder"}</strong>
      </div>
    `);

    props.push(`
      <div class="hover-prop-line">
        <strong>${t("path") || "Path"}:</strong> ${escapeHTML(folderPath || "root")}
      </div>
    `);

    propsEl.innerHTML = props.join("");

    // --- Owner + "Your access" (from capabilities) --------------------
    fetchFolderCaps(folderPath).then(caps => {
      if (!caps || !document.body.contains(el)) return;
      if (!hoverPreviewContext || hoverPreviewContext.folder !== folderPath) return;

      // Update the type label to include "(encrypted)" when applicable
      const isEnc = !!(caps && caps.encryption && caps.encryption.encrypted);
      props[0] = `
        <div class="hover-prop-line" style="display:flex;align-items:center;margin-bottom:4px;">
          <span class="hover-preview-icon material-icons" style="margin-right:6px;">folder</span>
          <strong>${t("folder") || "Folder"}${isEnc ? " (encrypted)" : ""}</strong>
        </div>
      `;

      const owner = caps.owner || caps.user || "";
      if (owner) {
        props.push(`
          <div class="hover-prop-line">
            <strong>${t("owner") || "Owner"}:</strong> ${escapeHTML(owner)}
          </div>
        `);
      }

      // Summarize what the current user can do in this folder
      const perms = [];
      if (caps.canUpload || caps.canCreate)    perms.push(t("perm_upload") || "Upload");
      if (caps.canMoveFolder)                  perms.push(t("perm_move")   || "Move");
      if (caps.canRename)                      perms.push(t("perm_rename") || "Rename");
      if (caps.canShareFolder)                 perms.push(t("perm_share")  || "Share");
      if (caps.canDeleteFolder || caps.canDelete)
                                              perms.push(t("perm_delete") || "Delete");

      if (perms.length) {
        const label = t("your_access") || "Your access";
        props.push(`
          <div class="hover-prop-line">
            <strong>${escapeHTML(label)}:</strong> ${escapeHTML(perms.join(", "))}
          </div>
        `);
      }

      propsEl.innerHTML = props.join("");
    }).catch(() => {});
    // ------------------------------------------------------------------

    // --- Meta: counts + size + created/modified -----------------------
    fetchFolderStats(folderPath).then(stats => {
      if (!stats || !document.body.contains(el)) return;
      if (!hoverPreviewContext || hoverPreviewContext.folder !== folderPath) return;

      const foldersCount = Number.isFinite(stats.folders) ? stats.folders : 0;
      const filesCount   = Number.isFinite(stats.files)   ? stats.files   : 0;

      let bytes = null;
      const sizeCandidates = [stats.bytes, stats.sizeBytes, stats.size, stats.totalBytes];
      for (const v of sizeCandidates) {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0) {
          bytes = n;
          break;
        }
      }

      const pieces = [];
      if (foldersCount) pieces.push(`${foldersCount} folder${foldersCount === 1 ? "" : "s"}`);
      if (filesCount)   pieces.push(`${filesCount} file${filesCount === 1 ? "" : "s"}`);
      if (!pieces.length) pieces.push("0 items");

      const sizeLabel = bytes != null && bytes >= 0 ? formatSize(bytes) : "";
      metaEl.textContent = sizeLabel
        ? `${pieces.join(", ")} • ${sizeLabel}`
        : pieces.join(", ");

      // Optional: created / modified range under the path/owner/access
      const created  = typeof stats.earliest_uploaded === "string" ? stats.earliest_uploaded : "";
      const modified = typeof stats.latest_mtime       === "string" ? stats.latest_mtime      : "";

      if (modified) {
        props.push(`
          <div class="hover-prop-line">
            <strong>${t("modified") || "Modified"}:</strong> ${escapeHTML(modified)}
          </div>
        `);
      }

      if (created) {
        props.push(`
          <div class="hover-prop-line">
            <strong>${t("created") || "Created"}:</strong> ${escapeHTML(created)}
          </div>
        `);
      }

      propsEl.innerHTML = props.join("");
    }).catch(() => {});
    // ------------------------------------------------------------------

    // Left side: peek inside folder (first few children)
fetchFolderPeek(folderPath).then(result => {
  if (!document.body.contains(el)) return;
  if (!hoverPreviewContext || hoverPreviewContext.folder !== folderPath) return;

  // Folder mode: force single-line-ish behavior and avoid wrapping
  snippetEl.style.whiteSpace   = "pre";
  snippetEl.style.wordBreak    = "normal";
  snippetEl.style.overflowX    = "hidden";
  snippetEl.style.textOverflow = "ellipsis";

  if (!result) {
    const msg =
      t("no_files_or_folders") ||
      t("no_files_found") ||
      "No files or folders";

    snippetEl.textContent = msg;
    snippetEl.style.display = "block";
    return;
  }

  const { items, truncated } = result;

  if (!items || !items.length) {
    const msg =
      t("no_files_or_folders") ||
      t("no_files_found") ||
      "No files or folders";

    snippetEl.textContent = msg;
    snippetEl.style.display = "block";
    return;
  }

  const MAX_LABEL_CHARS = 42; // tweak to taste

  const lines = items.map(it => {
    const prefix = it.type === "folder" ? "📁 " : "📄 ";
    const trimmed = _trimLabel(it.name, MAX_LABEL_CHARS);
    return prefix + trimmed;
  });

  // If we had to cut the list to FOLDER_PEEK_MAX_ITEMS, show a clean final "…"
  if (truncated && lines.length) {
    lines[lines.length - 1] = "…";
  }

  snippetEl.textContent = lines.join("\n");
  snippetEl.style.display = "block";
}).catch(() => {});

  } else {
    // ======================
    //   FILE HOVER PREVIEW
    // ======================
    const name = row.getAttribute("data-file-name");

    // If this row isn't a real file row (e.g. "No files found"), don't show hover preview.
    if (!name) {
      hoverPreviewContext = null;
      hideHoverPreview();
      return;
    }

    const paneEl = row.closest('.file-list-pane');
    const paneKey = paneEl && paneEl.classList.contains('secondary-pane') ? 'secondary' : 'primary';
    const paneFiles = (window.__frPaneState &&
      window.__frPaneState[paneKey] &&
      Array.isArray(window.__frPaneState[paneKey].fileData))
      ? window.__frPaneState[paneKey].fileData
      : (Array.isArray(fileData) ? fileData : []);
    const rawName = decodeHtmlEntities(name);
    const file = paneFiles.find(f => f.name === rawName || escapeHTML(f.name) === name);

    // If we can't resolve a real file from fileData, also skip the preview
    if (!file) {
      hoverPreviewContext = null;
      hideHoverPreview();
      return;
    }

    hoverPreviewContext = {
      type: "file",
      file
    };

    titleEl.textContent = file.name;

    // IMPORTANT: no duplicate "size • modified • owner" under the title
    metaEl.textContent = "";

    const ext   = getFileExt(file.name);
    const lower = file.name.toLowerCase();
    const isImage = /\.(jpg|jpeg|png|gif|bmp|webp|ico|tif|tiff|heic)$/i.test(lower);
    const isVideo = /\.(mp4|mkv|webm|mov|ogv)$/i.test(lower);
    const isAudio = /\.(mp3|wav|m4a|ogg|flac|aac|wma|opus)$/i.test(lower);
    const isPdf   = /\.pdf$/i.test(lower);

    const folder = file.folder || window.currentFolder || "root";
    const url    = apiFileUrl(folder, file.name, true);
    const canTextPreview = canEditFile(file.name);

    // Left: image / video preview OR text snippet OR "No preview"
    if (isImage) {
      const bytes = Number.isFinite(file.sizeBytes) ? file.sizeBytes : null;
      const maxImagePreviewBytes = getMaxImagePreviewBytes();
      if (bytes != null && bytes > maxImagePreviewBytes) {
        thumbEl.innerHTML = `
          <div style="
            padding:6px 8px;
            border-radius:6px;
            font-size:0.82rem;
            text-align:center;
            background-color:rgba(15,23,42,0.92);
            color:#e5e7eb;
            max-width:100%;
          ">
            ${escapeHTML(t("preview_too_large") || "Preview disabled for large image")}
          </div>
        `;
      } else {
      // --- image thumbnail
      thumbEl.style.minHeight = "140px";
      const img = document.createElement("img");
      img.src = url;
      img.alt = file.name;
      img.style.maxWidth  = "180px";
      img.style.maxHeight = "120px";
      img.style.display   = "block";
      thumbEl.appendChild(img);
      }

    } else if (isVideo) {
      // --- NEW: lightweight video thumbnail ---
      const bytes = Number.isFinite(file.sizeBytes) ? file.sizeBytes : null;
      const MAX_VIDEO_PREVIEW_BYTES = 1 * 1024 * 1024 * 1024; // 1 GiB cap (just metadata anyway)
    
      if (bytes == null || bytes <= MAX_VIDEO_PREVIEW_BYTES) {
        thumbEl.style.minHeight = "140px";
    
        const video = document.createElement("video");
        video.src = url;
        video.muted = true;
        video.playsInline = true;
        video.preload = "metadata"; // only fetch metadata + keyframe, not full file
        video.controls = false;
        video.style.maxWidth  = "200px";
        video.style.maxHeight = "120px";
        video.style.display   = "block";
        video.style.borderRadius = "6px";
    
        // Try to seek a tiny bit in so we don't get a black frame
        video.addEventListener("loadedmetadata", () => {
          try {
            const dur = video.duration;
            if (Number.isFinite(dur) && dur > 1) {
              video.currentTime = Math.min(1, dur / 3);
            }
          } catch (e) {
            // best effort; ignore errors
          }
        });
    
        // graceful fallback if the video can't load
        video.addEventListener("error", () => {
          const msg = t("no_preview_available") || "No preview available";
          thumbEl.innerHTML = `
            <div style="
              padding:6px 8px;
              border-radius:6px;
              font-size:0.8rem;
              text-align:center;
              background-color:rgba(15,23,42,0.92);
              color:#e5e7eb;
              max-width:100%;
            ">
              ${escapeHTML(msg)}
            </div>
          `;
        });
    
        thumbEl.appendChild(video);
    
        const overlay = document.createElement("div");
        overlay.textContent = "▶";
        overlay.style.position = "absolute";
        overlay.style.fontSize = "1.6rem";
        overlay.style.opacity = "0.85";
        thumbEl.appendChild(overlay);
    
      } else {
        // too big for preview → fall through to "No preview available"
      }
    }

    // Icon type for right column
    let iconName = "insert_drive_file";
    if (isImage)      iconName = "image";
    else if (isVideo) iconName = "movie";
    else if (isAudio) iconName = "audiotrack";
    else if (isPdf)   iconName = "picture_as_pdf";

    const props = [];

    // Icon row at the top of the right column
    props.push(`
      <div class="hover-prop-line" style="display:flex;align-items:center;margin-bottom:4px;">
        <span class="hover-preview-icon material-icons" style="margin-right:6px;">${iconName}</span>
        <strong>${escapeHTML(ext || "").toUpperCase() || t("file") || "File"}</strong>
      </div>
    `);

    if (ext) {
      props.push(`<div class="hover-prop-line"><strong>${t("extension") || "Ext"}:</strong> .${escapeHTML(ext)}</div>`);
    }
    if (Number.isFinite(file.sizeBytes) && file.sizeBytes >= 0) {
      const prettySize = formatSize(file.sizeBytes);
      props.push(`
        <div class="hover-prop-line hover-prop-size">
          <strong>${t("size") || "Size"}:</strong>
          <span class="hover-prop-value"
                style="margin-left:4px; font-variant-numeric:tabular-nums;">
            ${escapeHTML(prettySize)}
          </span>
        </div>
      `);
    }
    if (file.modified) {
      props.push(`<div class="hover-prop-line"><strong>${t("modified") || "Modified"}:</strong> ${escapeHTML(file.modified)}</div>`);
    }
    if (file.uploaded) {
      props.push(`<div class="hover-prop-line"><strong>${t("created") || "Created"}:</strong> ${escapeHTML(file.uploaded)}</div>`);
    }
    if (file.uploader) {
      props.push(`<div class="hover-prop-line"><strong>${t("owner") || "Owner"}:</strong> ${escapeHTML(file.uploader)}</div>`);
    }

    // --- NEW: Tags / Metadata line ------------------------------------
    (function addMetaLine() {
      // Tags from backend: file.tags = [{ name, color }, ...]
      const tagNames = Array.isArray(file.tags)
        ? file.tags
            .map(t => t && t.name ? String(t.name).trim() : "")
            .filter(Boolean)
        : [];

      // Optional extra metadata if you ever add it to fileData
      const mime =
        file.mime ||
        file.mimetype ||
        file.contentType ||
        "";

      const extraPieces = [];
      if (mime) extraPieces.push(mime);

      // Example future fields; safe even if undefined
      if (Number.isFinite(file.durationSeconds)) {
        extraPieces.push(`${file.durationSeconds}s`);
      }
      if (file.width && file.height) {
        extraPieces.push(`${file.width}×${file.height}`);
      }

      const parts = [];

      if (tagNames.length) {
        parts.push(tagNames.join(", "));
      }
      if (extraPieces.length) {
        parts.push(extraPieces.join(" • "));
      }

      if (!parts.length) return; // nothing to show

      const useMetadataLabel = parts.length > 1 || extraPieces.length > 0;
      const labelKey = useMetadataLabel ? "metadata" : "tags";
      const label = t(labelKey) || (useMetadataLabel ? "MetaData" : "Tags");

      props.push(
        `<div class="hover-prop-line"><strong>${escapeHTML(label)}:</strong> ${escapeHTML(parts.join(" • "))}</div>`
      );
    })();
    // ------------------------------------------------------------------

    propsEl.innerHTML = props.join("");

    propsEl.innerHTML = props.join("");

        // Text snippet (left) for smaller text/code files
        if (canTextPreview) {
          fillFileSnippet(file, snippetEl);
        } else if (!isImage && !isVideo) {
          // Non-image, non-video, non-text → explicit "No preview"
          const msg = t("no_preview_available") || "No preview available";
          thumbEl.innerHTML = `
            <div style="
              padding:6px 8px;
              border-radius:6px;
              font-size:0.8rem;
              text-align:center;
              background-color:rgba(15,23,42,0.92);
              color:#e5e7eb;
              max-width:100%;
            ">
              ${escapeHTML(msg)}
            </div>
          `;
        }
  }
}

function positionHoverPreview(x, y) {
  const el = ensureHoverPreviewEl();
  const CARD_OFFSET_X = 16;
  const CARD_OFFSET_Y = 12;

  let left = x + CARD_OFFSET_X;
  let top  = y + CARD_OFFSET_Y;

  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (left + rect.width > vw - 10) {
    left = x - rect.width - CARD_OFFSET_X;
  }
  if (top + rect.height > vh - 10) {
    top = y - rect.height - CARD_OFFSET_Y;
  }

  el.style.left = `${Math.max(4, left)}px`;
  el.style.top  = `${Math.max(4, top)}px`;
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
    .then(r => r.ok ? r.json() : { folders: 0, files: 0, __fr_err: 1 })
    .catch(() => ({ folders: 0, files: 0, __fr_err: 1 }))
    .finally(() => clearTimeout(tid));
}

// Defensive: some browsers occasionally blank out inline SVGs elsewhere when a context menu opens.
// This only repaints *blank* strip/inline-folder icons (no re-render churn when nothing is wrong).
export function repairBlankFolderIcons({ force = false } = {}) {
  const isBroken = (el) => {
    if (!el) return true;
    const html = String(el.innerHTML || '').trim();
    if (!html) return true;
    const svg = el.querySelector('svg');
    if (!svg) return true;
    // If the SVG exists but is missing expected parts, treat it as broken.
    // (Some Safari/WebKit glitches leave an empty <svg> shell.)
    if (!svg.querySelector('.folder-front') && !svg.querySelector('.folder-back')) return true;
    return false;
  };

  // Folder strip icons
  try {
    const strip = document.getElementById('folderStripContainer');
    if (strip) {
      strip.querySelectorAll('.folder-item[data-folder]').forEach(item => {
        const folder = item.getAttribute('data-folder') || '';
        if (!folder) return;
        const iconSpan = item.querySelector('.folder-svg');
        if (!force && !isBroken(iconSpan)) return;
        attachStripIconAsync(item, folder, 48, { preserveKind: true });
      });
    }
  } catch (e) { /* best effort */ }

  // Inline folder rows
  try {
    document.querySelectorAll('#fileList tr.folder-row[data-folder]').forEach(row => {
      const folder = row.getAttribute('data-folder') || '';
      if (!folder) return;
      const iconSpan = row.querySelector('.folder-svg');
      if (!force && !isBroken(iconSpan)) return;
      attachStripIconAsync(row, folder, 28, { preserveKind: true });
    });
  } catch (e) { /* best effort */ }
}

// Paint initial icon, then flip to "paper" if non-empty
function attachStripIconAsync(hostEl, fullPath, size = 28, { preserveKind = false } = {}) {
  const hex = (window.folderColorMap && window.folderColorMap[fullPath]) || '#f6b84e';
  const front = hex;
  const back = _lighten(hex, 14);
  const stroke = _darken(hex, 22);

  hostEl.style.setProperty('--filr-folder-front', front);
  hostEl.style.setProperty('--filr-folder-back', back);
  hostEl.style.setProperty('--filr-folder-stroke', stroke);

  const iconSpan = hostEl.querySelector('.folder-svg');
  if (!iconSpan) return;

  const encrypted = isEncryptedForFolderIcon(fullPath);

  // 1) initial icon
  const currentKind = iconSpan.dataset.kind || 'empty';
  const firstKind = preserveKind ? currentKind : 'empty';
  iconSpan.dataset.kind = firstKind;
  iconSpan.innerHTML = folderSVG(firstKind, { encrypted });

  // make sure this brand-new SVG is sized correctly
  try { syncFolderIconSizeToRowHeight(); } catch (e) {}

  fetchFolderStats(fullPath)
  .then(stats => {
    if (!stats) return;
    const folders = Number.isFinite(stats.folders) ? stats.folders : 0;
    const files   = Number.isFinite(stats.files)   ? stats.files   : 0;

    if ((folders + files) > 0 && iconSpan.dataset.kind !== 'paper') {
      iconSpan.dataset.kind = 'paper';
      iconSpan.innerHTML = folderSVG('paper', { encrypted });
      try { syncFolderIconSizeToRowHeight(); } catch (e) {}
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
  try { body = text ? JSON.parse(text) : null; } catch (e) { /* ignore */ }

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

function normalizeFolderPath(folder) {
  if (!folder) return "";
  const trimmed = String(folder).trim().replace(/^\/+|\/+$/g, "");
  return trimmed === "" ? "root" : trimmed;
}

function folderDepthScore(folder) {
  if (!folder || folder === "root") return 0;
  return folder.split("/").filter(Boolean).length;
}

async function findBestAccessibleFolder({ lastOpenedFolder } = {}) {
  try {
    const res = await fetch(withBase('/api/folder/getFolderList.php'), { credentials: 'include' });
    const data = await safeJson(res);
    const names = Array.isArray(data)
      ? data.map(row => normalizeFolderPath(row?.folder || row)).filter(Boolean)
      : [];
    if (!names.length) return null;

    const unique = Array.from(new Set(names));
    const preferred = normalizeFolderPath(lastOpenedFolder);
    if (preferred && unique.includes(preferred)) return preferred;

    unique.sort((a, b) => {
      const depthDiff = folderDepthScore(a) - folderDepthScore(b);
      return depthDiff !== 0 ? depthDiff : a.localeCompare(b);
    });
    return unique[0] || null;
  } catch (e) {
    return null;
  }
}

// --- Folder capabilities + owner cache ----------------------
const _folderCapsCache  = window.__FR_CAPS_CACHE || new Map();
const _folderCapsInflight = window.__FR_CAPS_INFLIGHT || new Map();
window.__FR_CAPS_CACHE = _folderCapsCache;
window.__FR_CAPS_INFLIGHT = _folderCapsInflight;

async function fetchFolderCaps(folder) {
  if (!folder) return null;
  if (_folderCapsCache.has(folder)) {
    return _folderCapsCache.get(folder);
  }
  if (_folderCapsInflight.has(folder)) {
    return _folderCapsInflight.get(folder);
  }

      const p = (async () => {
    try {
      const res  = await fetch(
        withBase(`/api/folder/capabilities.php?folder=${encodeURIComponent(folder)}`),
        { credentials: 'include' }
      );
      const data = await safeJson(res);
      _folderCapsCache.set(folder, data || null);

      if (data && (data.owner || data.user)) {
        _folderOwnerCache.set(folder, data.owner || data.user || "");
      }
      return data || null;
    } catch (e) {
      _folderCapsCache.set(folder, null);
      return null;
    } finally {
      _folderCapsInflight.delete(folder);
    }
  })();

  _folderCapsInflight.set(folder, p);
  return p;
}

async function refreshCurrentFolderCaps(folder) {
  window.currentFolderCaps = null;
  savePaneState(normalizePaneKey(window.activePane), { currentFolderCaps: null });
  try {
    const caps = await fetchFolderCaps(folder);
    window.currentFolderCaps = caps || null;
    savePaneState(normalizePaneKey(window.activePane), { currentFolderCaps: window.currentFolderCaps });
  } catch (e) {
    window.currentFolderCaps = null;
    savePaneState(normalizePaneKey(window.activePane), { currentFolderCaps: null });
  }
  updateEncryptedFolderBanner(folder);
  refreshEncryptedFolderIconsInList();
  applyEncryptedFolderUiRestrictions();
  updateFileActionButtons();
}

// --- Folder owner cache + helper ----------------------
const _folderOwnerCache = new Map();

async function fetchFolderOwner(folder) {
  if (!folder) return "";
  if (_folderOwnerCache.has(folder)) {
    return _folderOwnerCache.get(folder);
  }

  try {
    const data = await fetchFolderCaps(folder);
    const owner = data && (data.owner || data.user || "");
    _folderOwnerCache.set(folder, owner || "");
    return owner || "";
  } catch (e) {
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
    const res = await fetch(withBase(`/api/media/getViewedMap.php?folder=${encodeURIComponent(folder)}&t=${Date.now()}`), { credentials: 'include' });
    const j = await res.json();
    map = j?.map || null;
  } catch (e) { /* ignore */ }

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
  if (!Number.isFinite(totalBytes) || totalBytes < 0) return "";

  if (totalBytes < 1024) {
    return totalBytes + " B";
  } else if (totalBytes < 1024 * 1024) {
    return (totalBytes / 1024).toFixed(1) + " KB";
  } else if (totalBytes < 1024 * 1024 * 1024) {
    return (totalBytes / (1024 * 1024)).toFixed(1) + " MB";
  } else {
    return (totalBytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
  }
}


function ensureNonZipDownloadPanel() {
  if (window.__nonZipDownloadPanel) return window.__nonZipDownloadPanel;

  const panel = document.createElement('div');
  panel.id = 'nonZipDownloadPanel';
  panel.setAttribute('role', 'status');

  // Simple bottom-right card using Bootstrap-ish styles + inline layout tweaks
  panel.style.position = 'fixed';
  panel.style.top = '50%';
  panel.style.left = '50%';
  panel.style.transform = 'translate(-50%, -50%)';
  panel.style.zIndex = '9999';
  panel.style.width    = 'min(440px, 95vw)';
  panel.style.minWidth = '280px';
  panel.style.maxWidth = '440px';
  panel.style.padding = '14px 16px';
  panel.style.borderRadius = '12px';
  panel.style.boxShadow = '0 18px 40px rgba(0,0,0,0.35)';
  panel.style.backgroundColor = 'var(--filr-menu-bg, #222)';
  panel.style.color = 'var(--filr-menu-fg, #f9fafb)';
  panel.style.fontSize = '0.9rem';
  panel.style.display = 'none';

  panel.innerHTML = `
    <div class="nonzip-title" style="margin-bottom:6px; font-weight:600;"></div>
    <div class="nonzip-sub" style="margin-bottom:8px; opacity:0.85;"></div>
    <div class="nonzip-actions" style="display:flex; justify-content:flex-end; gap:6px;">
      <button type="button"
              class="btn btn-sm btn-secondary nonzip-cancel-btn">
        ${t('cancel') || 'Cancel'}
      </button>
      <button type="button"
              class="btn btn-sm btn-primary nonzip-next-btn">
        ${t('download_next') || 'Download next'}
      </button>
    </div>
  `;

  document.body.appendChild(panel);

  const nextBtn   = panel.querySelector('.nonzip-next-btn');
  const cancelBtn = panel.querySelector('.nonzip-cancel-btn');

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      triggerNextNonZipDownload();
    });
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      clearNonZipQueue(true);
    });
  }

  window.__nonZipDownloadPanel = panel;
  return panel;
}

function updateNonZipPanelText() {
  const panel = ensureNonZipDownloadPanel();
  const q = window.__nonZipDownloadQueue || [];
  const count = q.length;

  const titleEl = panel.querySelector('.nonzip-title');
  const subEl   = panel.querySelector('.nonzip-sub');

  if (!titleEl || !subEl) return;

  if (!count) {
    titleEl.textContent = t('no_files_queued') || 'No files queued.';
    subEl.textContent   = '';
    return;
  }

  const title =
    t('nonzip_queue_title') ||
    'Files queued for download';

  const raw = t('nonzip_queue_subtitle') ||
    '{count} files queued. Click "Download next" for each file.';

  const msg = raw.replace('{count}', String(count));

  titleEl.textContent = title;
  subEl.textContent   = msg;
}

function showNonZipPanel() {
  const panel = ensureNonZipDownloadPanel();
  updateNonZipPanelText();
  panel.style.display = 'block';
}

function hideNonZipPanel() {
  const panel = ensureNonZipDownloadPanel();
  panel.style.display = 'none';
}

function clearNonZipQueue(showToastCancel = false) {
  window.__nonZipDownloadQueue = [];
  hideNonZipPanel();
  if (showToastCancel) {
    showToast(
      t('nonzip_queue_cleared') || 'Download queue cleared.',
      'info'
    );
  }
}

function triggerNextNonZipDownload() {
  const q = window.__nonZipDownloadQueue || [];
  if (!q.length) {
    hideNonZipPanel();
    showToast(
      t('downloads_started') || 'All downloads started.',
      'success'
    );
    return;
  }

  const { folder, name } = q.shift();
  const url = apiFileUrl(folder || 'root', name, /* inline */ false);

  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);

  try {
    a.click();
  } finally {
    setTimeout(() => {
      if (a && a.parentNode) {
        a.parentNode.removeChild(a);
      }
    }, 500);
  }

  // Update queue + UI
  window.__nonZipDownloadQueue = q;
  if (q.length) {
    updateNonZipPanelText();
  } else {
    hideNonZipPanel();
    showToast(
      t('downloads_started') || 'All downloads started.',
      'success'
    );
  }
}

// Optional debug helpers if you want them globally:
window.triggerNextNonZipDownload = triggerNextNonZipDownload;
window.clearNonZipQueue          = clearNonZipQueue;


function getLocalSummaryStats() {
  const files = Array.isArray(fileData) ? fileData.length : 0;
  const bytes = Array.isArray(fileData)
    ? fileData.reduce((sum, file) => {
      const b = Number.isFinite(file.sizeBytes)
        ? file.sizeBytes
        : parseSizeToBytes(file.size || "");
      return sum + (Number.isFinite(b) && b > 0 ? b : 0);
    }, 0)
    : 0;
  const folders = Array.isArray(window.currentSubfolders)
    ? window.currentSubfolders.length
    : 0;
  return { folders, files, bytes };
}

function buildFolderSummaryHTML(stats, fallback) {
  const safeTitle = (key, fallbackText) => {
    const val = t(key);
    return val && val !== key ? val : fallbackText;
  };
  const fmtCount = (val) => Number.isFinite(val) ? val.toLocaleString() : "-";

  const folders = Number.isFinite(stats?.folders) ? stats.folders : fallback?.folders;
  const files = Number.isFinite(stats?.files) ? stats.files : fallback?.files;
  const bytes = Number.isFinite(stats?.bytes) ? stats.bytes : fallback?.bytes;

  const folderTitle = safeTitle("total_folders", "Total folders");
  const fileTitle = safeTitle("total_files", "Total files");
  const sizeTitle = safeTitle("total_size", "Total size");

  const sizeStr = Number.isFinite(bytes) ? formatSize(bytes) : "-";

  return `
    <span class="fr-summary-item" title="${escapeHTML(folderTitle)}">
      <span class="material-icons" aria-hidden="true">folder</span>
      <span class="fr-summary-count">${fmtCount(folders)}</span>
    </span>
    <span class="fr-summary-sep" aria-hidden="true">&middot;</span>
    <span class="fr-summary-item" title="${escapeHTML(fileTitle)}">
      <span class="material-icons" aria-hidden="true">insert_drive_file</span>
      <span class="fr-summary-count">${fmtCount(files)}</span>
    </span>
    <span class="fr-summary-sep" aria-hidden="true">&middot;</span>
    <span class="fr-summary-item" title="${escapeHTML(sizeTitle)}">
      <span class="material-icons" aria-hidden="true">storage</span>
      <span class="fr-summary-count">${escapeHTML(sizeStr)}</span>
    </span>
  `.trim();
}

function refreshFileSummaryForPane(paneKey) {
  const actionsContainer = document.getElementById("fileListActions");
  if (!actionsContainer) return;

  let summaryElem = document.getElementById("fileSummary");
  if (!summaryElem) {
    summaryElem = document.createElement("div");
    summaryElem.id = "fileSummary";
    summaryElem.className = "fr-summary-pill";
    summaryElem.setAttribute("role", "status");
    summaryElem.setAttribute("aria-live", "polite");
    actionsContainer.appendChild(summaryElem);
  }

  const state = paneKey ? getPaneState(paneKey) : null;
  if (!state || !state.hasLoaded) {
    summaryElem.style.display = "none";
    summaryElem.innerHTML = "";
    summaryElem.dataset.folder = "";
    summaryElem.dataset.truncated = "0";
    summaryElem.removeAttribute("title");
    return;
  }

  const folder = state.currentFolder || window.currentFolder || "root";
  summaryElem.classList.add("fr-summary-pill");
  summaryElem.style.display = "flex";
  const fallbackStats = getLocalSummaryStats();
  summaryElem.innerHTML = buildFolderSummaryHTML(null, fallbackStats);
  summaryElem.dataset.folder = folder;
  summaryElem.dataset.truncated = "0";

  fetchFolderSummaryStats(folder).then(stats => {
    if (!stats || summaryElem.dataset.folder !== folder) return;
    summaryElem.innerHTML = buildFolderSummaryHTML(stats, fallbackStats);
    summaryElem.dataset.truncated = stats.truncated ? "1" : "0";
    if (stats.truncated) {
      summaryElem.title = "Totals capped for very large folders.";
    } else {
      summaryElem.removeAttribute("title");
    }
  });
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
const FUSE_SRC = withBase('/vendor/fuse/7.1.0/fuse.min.js?v={{APP_QVER}}');
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
    toggleBtn.classList.add("btn", "action-btn", "icon-only", "btn-light");

    if (window.viewMode === "gallery") {
      toggleBtn.innerHTML = '<i class="material-icons">view_list</i>';
      toggleBtn.title = t("switch_to_table_view");
    } else {
      toggleBtn.innerHTML = '<i class="material-icons">view_module</i>';
      toggleBtn.title = t("switch_to_gallery_view");
    }

    const actionsBar = document.getElementById("fileActionsBar");
    const headerButtons = document.querySelector(".header-buttons");

    if (actionsBar) {
      actionsBar.appendChild(toggleBtn);
    } else if (headerButtons && headerButtons.lastElementChild) {
      headerButtons.insertBefore(toggleBtn, headerButtons.lastElementChild);
    } else if (headerButtons) {
      headerButtons.appendChild(toggleBtn);
    }
  } else {
    const actionsBar = document.getElementById("fileActionsBar");
    if (actionsBar && toggleBtn.parentElement !== actionsBar) {
      actionsBar.appendChild(toggleBtn);
    }
  }

  toggleBtn.onclick = () => {
    hideViewOptionsPopover();
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

function ensureSearchEverywhereButton() {
  const cfg = window.__FR_PRO_SEARCH_CFG__ || {};
  const isPro = window.__FR_IS_PRO === true;
  const ver = window.__FR_PRO_VERSION || '';
  const hasMinVersion = isPro && compareSemverLite(ver, '1.3.0') >= 0;
  const enabled = isPro && hasMinVersion && !!cfg.enabled;
  const actionsBar = document.getElementById("fileActionsBar");
  if (!enabled || !actionsBar) {
    if (searchEverywhereBtn && searchEverywhereBtn.parentElement) {
      searchEverywhereBtn.parentElement.removeChild(searchEverywhereBtn);
    }
    return null;
  }

  if (!searchEverywhereBtn) {
    searchEverywhereBtn = document.createElement("button");
    searchEverywhereBtn.id = "searchEverywhereBtn";
    searchEverywhereBtn.className = "btn btn-light action-btn";
    searchEverywhereBtn.innerHTML = `
      <i class="material-icons" aria-hidden="true">travel_explore</i>
      <span style="margin-left:4px;">${t("search_everywhere_label") || "Search everywhere"}</span>
    `;
    searchEverywhereBtn.addEventListener("click", openSearchEverywhereModal);
  }

  if (searchEverywhereBtn.parentElement !== actionsBar) {
    actionsBar.appendChild(searchEverywhereBtn);
  }
  return searchEverywhereBtn;
}

function ensureSearchEverywhereModal() {
  if (searchEverywhereModal) return searchEverywhereModal;

  const overlay = document.createElement("div");
  overlay.id = "searchEverywhereModal";
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.55);
    z-index: 4000;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 16px;
  `;

  const card = document.createElement("div");
  card.className = "search-everywhere-card";
  card.style.cssText = `
    max-width: 720px;
    width: 100%;
    border-radius: 12px;
    padding: 16px;
    position: relative;
    box-shadow: 0 12px 35px rgba(0,0,0,0.35);
  `;
  card.innerHTML = `
    <button type="button"
            class="editor-close-btn"
            aria-label="${t("close") || "Close"}"
            id="searchEverywhereClose"
            style="top:8px; right:8px;">&times;</button>
    <div class="d-flex align-items-center" style="gap:10px; margin-bottom:10px;">
      <i class="material-icons" aria-hidden="true">travel_explore</i>
      <div>
        <div style="font-weight:600;">${t("search_everywhere_title") || "Search Everywhere"}</div>
        <div class="text-muted" style="font-size:12px;">${t("search_everywhere_desc") || "ACL-aware search across all folders you can access."}</div>
      </div>
    </div>
    <div class="form-group" style="margin-bottom:8px;">
      <input type="text" id="searchEverywhereInput" class="form-control" placeholder="${t("search_everywhere_placeholder") || "Type to search across all folders"}" autocomplete="off" />
    </div>
    <div class="d-flex align-items-center" style="gap:8px; margin-bottom:10px;">
      <label for="searchEverywhereLimit" class="mb-0" style="font-size:12px;">${t("search_everywhere_limit") || "Result limit"}</label>
      <input type="number" id="searchEverywhereLimit" class="form-control" style="max-width:100px;" min="1" max="200" />
      <button type="button" class="btn btn-primary btn-sm" id="searchEverywhereRun">${t("search_everywhere_run") || "Search"}</button>
    </div>
    <div id="searchEverywhereResults" style="max-height:320px; overflow:auto; border:1px solid #e0e0e0; border-radius:10px; padding:8px; background:rgba(0,0,0,0.02);">
      <div class="text-muted" style="font-size:12px;">${t("search_everywhere_hint") || "Results will appear here."}</div>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  searchEverywhereCard = card;
  const closeBtn = card.querySelector("#searchEverywhereClose");
  closeBtn?.addEventListener("click", closeSearchEverywhereModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeSearchEverywhereModal();
  });

  searchEverywhereModal = overlay;
  searchEverywhereResultsEl = card.querySelector("#searchEverywhereResults");
  searchEverywhereInputEl = card.querySelector("#searchEverywhereInput");
  searchEverywhereLimitEl = card.querySelector("#searchEverywhereLimit");

  const runBtn = card.querySelector("#searchEverywhereRun");
  runBtn?.addEventListener("click", () => {
    if (searchEverywhereInputEl) {
      runSearchEverywhere(searchEverywhereInputEl.value || '');
    }
  });
  searchEverywhereInputEl?.addEventListener("keydown", (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runSearchEverywhere(searchEverywhereInputEl.value || '');
    }
  });

  const dmToggle = document.getElementById('darkModeToggle');
  if (dmToggle && !dmToggle.__searchEverywhereTheme) {
    dmToggle.__searchEverywhereTheme = true;
    dmToggle.addEventListener('click', () => applySearchEverywhereTheme());
  }
  applySearchEverywhereTheme();

  return searchEverywhereModal;
}

function applySearchEverywhereTheme() {
  if (!searchEverywhereModal) return;
  const overlay = searchEverywhereModal;
  const card = searchEverywhereCard || overlay.querySelector(".search-everywhere-card");
  const isDark = document.body.classList.contains("dark-mode");

  overlay.style.background = isDark ? "rgba(0,0,0,0.72)" : "rgba(0,0,0,0.55)";
  if (card) {
    card.style.background = isDark ? "#141414" : "#ffffff";
    card.style.color = isDark ? "#f4f4f4" : "#000000";
    card.style.boxShadow = isDark ? "0 18px 45px rgba(0,0,0,0.65)" : "0 12px 35px rgba(0,0,0,0.2)";
    card.style.border = isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #e0e0e0";
  }

  if (searchEverywhereResultsEl) {
    searchEverywhereResultsEl.style.border = isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid #e0e0e0";
    searchEverywhereResultsEl.style.background = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)";
  }

  const inputs = searchEverywhereModal.querySelectorAll("#searchEverywhereInput, #searchEverywhereLimit");
  inputs.forEach((inp) => {
    if (isDark) {
      inp.style.background = "#1f1f1f";
      inp.style.color = "#f4f4f4";
      inp.style.borderColor = "#444";
    } else {
      inp.style.background = "";
      inp.style.color = "";
      inp.style.borderColor = "";
    }
  });

  searchEverywhereModal.querySelectorAll(".text-muted").forEach((el) => {
    el.style.color = isDark ? "rgba(255,255,255,0.72)" : "";
  });
}

function openSearchEverywhereModal() {
  ensureSearchEverywhereModal();
  if (!searchEverywhereModal) return;
  const cfg = window.__FR_PRO_SEARCH_CFG__ || {};
  const limit = Math.max(1, Math.min(200, Number(cfg.defaultLimit || 50)));
  if (searchEverywhereLimitEl) {
    searchEverywhereLimitEl.value = String(limit);
  }
  applySearchEverywhereTheme();
  searchEverywhereModal.style.display = "flex";
  requestAnimationFrame(() => {
    searchEverywhereInputEl?.focus();
  });
}

function closeSearchEverywhereModal() {
  if (searchEverywhereModal) {
    searchEverywhereModal.style.display = "none";
  }
}

function renderSearchEverywhereResults(items) {
  if (!searchEverywhereResultsEl) return;
  if (!Array.isArray(items) || !items.length) {
    searchEverywhereResultsEl.innerHTML = `<div class="text-muted" style="font-size:12px;">${t("search_everywhere_no_results") || "No results"}</div>`;
    return;
  }

  const rows = items.map((item) => {
    const icon = item.type === 'folder' ? 'folder' : 'insert_drive_file';
    const name = escapeHTML(item.name || '');
    const path = escapeHTML(item.path || '');
    const meta = escapeHTML(item.uploader ? `Uploaded by ${item.uploader}` : '');
    return `
      <div class="d-flex align-items-center search-everywhere-row" data-path="${path}" data-folder="${escapeHTML(item.folder || '')}" data-name="${escapeHTML(item.name || '')}" data-type="${item.type}" style="padding:6px 4px; border-bottom:1px solid rgba(0,0,0,0.05); cursor:pointer;">
        <i class="material-icons" aria-hidden="true" style="margin-right:8px;">${icon}</i>
        <div style="flex:1; min-width:0;">
          <div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div>
          <div class="text-muted" style="font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${path}</div>
          ${meta ? `<div class="text-muted" style="font-size:12px;">${meta}</div>` : ''}
        </div>
      </div>
    `;
  }).join("");

  searchEverywhereResultsEl.innerHTML = rows;
  searchEverywhereResultsEl.querySelectorAll('.search-everywhere-row').forEach((row) => {
    row.addEventListener('click', () => {
      const folder = row.getAttribute('data-folder') || 'root';
      const name = row.getAttribute('data-name') || '';
      navigateToSearchResult(folder, name);
    });
  });
}

async function runSearchEverywhere(term) {
  if (!term || !term.trim()) {
    showToast(t("enter_search_term") || "Enter a search term.");
    return;
  }
  ensureSearchEverywhereModal();
  if (searchEverywhereResultsEl) {
    searchEverywhereResultsEl.innerHTML = `<div class="text-muted" style="font-size:12px;">${t("loading") || "Loading..."} </div>`;
  }

  const limitVal = searchEverywhereLimitEl ? Number(searchEverywhereLimitEl.value || 50) : 50;
  const limit = Math.max(1, Math.min(200, limitVal || 50));

  try {
    const res = await fetch(withBase(`/api/pro/search/query.php?q=${encodeURIComponent(term)}&limit=${limit}`), {
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    renderSearchEverywhereResults(data.items || []);
    if (data.reindexed) {
      showToast(t("search_everywhere_reindexed") || "Index refreshed.");
    }
  } catch (e) {
    console.error('Search everywhere error', e);
    if (searchEverywhereResultsEl) {
      searchEverywhereResultsEl.innerHTML = `<div class="text-danger" style="font-size:12px;">${t("search_everywhere_error") || "Search failed."}</div>`;
    }
    showToast(t("search_everywhere_error") || "Search failed.");
  }
}

async function navigateToSearchResult(folder, name) {
  if (!folder) return;
  closeSearchEverywhereModal();
  const dest = decodeHtmlEntities(folder || 'root') || 'root';
  const targetName = decodeHtmlEntities(name || '');
  pendingSearchSelection = targetName ? { folder: dest, name: targetName } : null;
  setCurrentFolderContext(dest);

  // Refresh tree + strip selections to match the jumped folder
  try {
    await expandTreePathAsync(dest, { force: true, includeLeaf: true, persist: false });
    document.querySelectorAll(".folder-option.selected")
      .forEach(o => o.classList.remove("selected"));
    const treeNode = document.querySelector(`.folder-option[data-folder="${CSS.escape(dest)}"]`);
    if (treeNode) treeNode.classList.add("selected");
  } catch (e) { /* best effort */ }

  try {
    const strip = document.getElementById("folderStripContainer");
    if (strip) {
      strip.querySelectorAll(".folder-item.selected").forEach(i => i.classList.remove("selected"));
      const stripItem = strip.querySelector(`.folder-item[data-folder="${CSS.escape(dest)}"]`);
      if (stripItem) stripItem.classList.add("selected");
    }
  } catch (e) { /* best effort */ }

  await loadFileList(dest);
  // Extra safety: attempt highlight again after render settles
  setTimeout(() => maybeHighlightSearchedFile(dest), 80);
  setTimeout(() => maybeHighlightSearchedFile(dest), 220);
  setTimeout(() => maybeHighlightSearchedFile(dest), 500);
}

  function bindFolderToolbarActions() {
    const map = [
      { id: "folderMoveInlineBtn",   handler: (folder) => openMoveFolderUI(folder) },
      { id: "folderRenameInlineBtn", handler: () => openRenameFolderModal() },
      { id: "folderColorInlineBtn",  handler: (folder) => openColorFolderModal(folder) },
      { id: "folderEncryptInlineBtn", handler: (folder) => startFolderCryptoJobFlow(folder, 'encrypt') },
      { id: "folderDecryptInlineBtn", handler: (folder) => startFolderCryptoJobFlow(folder, 'decrypt') },
      { id: "folderShareInlineBtn",  handler: (folder) => openFolderShareModal(folder) },
      { id: "folderDeleteInlineBtn", handler: () => openDeleteFolderModal() }
    ];

  const selectedOrToast = () => {
    const folder = getSelectedFolderPath();
    if (!folder) {
      showToast(t("select_folder") || "Select a folder first.");
      return null;
    }
    return folder;
  };

  map.forEach(({ id, handler }) => {
    const btn = document.getElementById(id);
    if (!btn || btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => {
      const folder = selectedOrToast();
      if (!folder) return;
      setCurrentFolderContext(folder);
      handler(folder);
    });
  });
}

function applyGalleryColumns(cols) {
  const clamped = clampGalleryColumns(cols);
  window.galleryColumns = clamped;
  localStorage.setItem("galleryColumns", clamped);

  const grid = document.querySelector(".gallery-container");
  if (grid) {
    grid.style.gridTemplateColumns = `repeat(${clamped},1fr)`;
  }
  document.querySelectorAll(".gallery-thumbnail")
    .forEach(img => img.style.maxHeight = getMaxImageHeight() + "px");

  const val = document.getElementById("galleryColumnsValue");
  if (val) val.textContent = clamped;

  return clamped;
}

let viewOptionsPopover = null;
let viewOptionsAnchor = null;
let viewOptionsBound = false;

function hideViewOptionsPopover() {
  if (viewOptionsPopover) {
    viewOptionsPopover.style.display = "none";
  }
  viewOptionsAnchor = null;
  document.removeEventListener("click", viewOptionsOutside, true);
  document.removeEventListener("keydown", viewOptionsEscape, true);
  viewOptionsBound = false;
}

function viewOptionsOutside(ev) {
  if (!viewOptionsPopover || viewOptionsPopover.style.display === "none") return;
  const anchor = viewOptionsAnchor;
  if (viewOptionsPopover.contains(ev.target)) return;
  if (anchor && (ev.target === anchor || anchor.contains(ev.target))) return;
  hideViewOptionsPopover();
}

function viewOptionsEscape(ev) {
  if (ev.key === "Escape") hideViewOptionsPopover();
}

function ensureViewOptionsPopover() {
  if (viewOptionsPopover) return viewOptionsPopover;
  const el = document.createElement("div");
  el.id = "viewOptionsPopover";
  el.className = "filr-popover";
  el.style.display = "none";
  document.body.appendChild(el);
  viewOptionsPopover = el;
  return el;
}

function buildRowHeightControls(host) {
  const wrap = document.createElement("div");
  wrap.className = "vo-control";

  const label = document.createElement("div");
  label.className = "vo-label";
  label.textContent = t("row_height") || "Row height";

  const sliderRow = document.createElement("div");
  sliderRow.className = "vo-slider-row";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "20";
  slider.max = "60";
  slider.value = clampRowHeight(localStorage.getItem("rowHeight") || 44);
  slider.id = "rowHeightSlider";

  const value = document.createElement("span");
  value.id = "rowHeightValue";
  value.className = "vo-value";
  value.textContent = `${slider.value}px`;

  slider.addEventListener("input", () => {
    const h = applyRowHeight(slider.value);
    value.textContent = `${h}px`;
  });

  sliderRow.appendChild(slider);
  sliderRow.appendChild(value);

  wrap.appendChild(label);
  wrap.appendChild(sliderRow);
  host.appendChild(wrap);
}

function buildGalleryControls(host) {
  const wrap = document.createElement("div");
  wrap.className = "vo-control";

  const label = document.createElement("div");
  label.className = "vo-label";
  label.textContent = t("columns") || "Columns";

  const sliderRow = document.createElement("div");
  sliderRow.className = "vo-slider-row";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "1";
  slider.max = String(getGalleryMaxColumns());
  slider.value = clampGalleryColumns(localStorage.getItem("galleryColumns") || window.galleryColumns || 3);
  slider.id = "galleryColumnsSlider";

  const value = document.createElement("span");
  value.id = "galleryColumnsValue";
  value.className = "vo-value";
  value.textContent = slider.value;

  slider.addEventListener("input", () => {
    const cols = applyGalleryColumns(slider.value);
    value.textContent = cols;
  });

  sliderRow.appendChild(slider);
  sliderRow.appendChild(value);

  wrap.appendChild(label);
  wrap.appendChild(sliderRow);
  host.appendChild(wrap);
}

function currentZoomPercent() {
  try {
    if (window.fileriseZoom && typeof window.fileriseZoom.currentPercent === "function") {
      return window.fileriseZoom.currentPercent();
    }
  } catch (e) {}
  const css = getComputedStyle(document.documentElement).getPropertyValue('--app-zoom') || "1";
  const n = parseFloat(css);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 100;
}

function buildZoomControls(host) {
  const wrap = document.createElement("div");
  wrap.className = "vo-control";

  const label = document.createElement("div");
  label.className = "vo-label";
  label.textContent = t("zoom") || "Zoom";

  const row = document.createElement("div");
  row.className = "vo-slider-row";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "60";
  slider.max = "140";
  slider.step = "5";
  slider.value = currentZoomPercent();
  slider.id = "zoomPercentSlider";

  const value = document.createElement("span");
  value.id = "zoomPercentValue";
  value.className = "vo-value";
  value.textContent = `${slider.value}%`;

  const applyZoom = (pct) => {
    const api = window.fileriseZoom;
    if (api && typeof api.setPercent === "function") {
      api.setPercent(pct);
    } else {
      document.documentElement.style.setProperty('--app-zoom', String(pct / 100));
    }
    value.textContent = `${pct}%`;
    slider.value = String(pct);
  };

  slider.addEventListener("input", () => {
    applyZoom(parseInt(slider.value, 10));
  });

  const btnRow = document.createElement("div");
  btnRow.className = "vo-zoom-btns";

  const mkBtn = (icon, title, handler) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-sm btn-light vo-zoom-btn";
    b.title = title;
    b.innerHTML = `<span class="material-icons">${icon}</span>`;
    b.addEventListener("click", handler);
    return b;
  };

  btnRow.appendChild(mkBtn("remove", t("zoom_out") || "Zoom out", () => {
    const api = window.fileriseZoom;
    const next = api && api.out ? api.out() : currentZoomPercent() - 5;
    applyZoom(next);
  }));
  btnRow.appendChild(mkBtn("add", t("zoom_in") || "Zoom in", () => {
    const api = window.fileriseZoom;
    const next = api && api.in ? api.in() : currentZoomPercent() + 5;
    applyZoom(next);
  }));
  btnRow.appendChild(mkBtn("refresh", t("reset_zoom") || "Reset", () => {
    const api = window.fileriseZoom;
    const next = api && api.reset ? api.reset() : 100;
    applyZoom(next);
  }));

  row.appendChild(slider);
  row.appendChild(value);

  wrap.appendChild(label);
  wrap.appendChild(row);
  wrap.appendChild(btnRow);
  host.appendChild(wrap);
}

function buildDualPaneToggle(host) {
  const wrap = document.createElement("div");
  wrap.className = "vo-control";

  const row = document.createElement("label");
  row.className = "vo-toggle-row";

  const text = document.createElement("span");
  text.className = "vo-toggle-text";
  text.textContent = t("dual_pane_mode") || "Dual-pane mode";

  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.className = "vo-toggle-input";
  toggle.id = "voDualPaneToggle";
  toggle.checked = localStorage.getItem("dualPaneMode") === "true";
  toggle.setAttribute("aria-label", text.textContent);

  const applyDualPane = (enabled) => {
    localStorage.setItem("dualPaneMode", enabled ? "true" : "false");
    window.dualPaneEnabled = enabled;
    if (typeof window.applyDualPaneMode === "function") {
      window.applyDualPaneMode(enabled);
    } else {
      window.__frDualPanePending = enabled;
    }
    const panelToggle = document.getElementById("dualPaneMode");
    if (panelToggle) {
      panelToggle.checked = enabled;
    }
  };

  toggle.addEventListener("change", () => {
    applyDualPane(toggle.checked);
  });

  row.appendChild(text);
  row.appendChild(toggle);
  wrap.appendChild(row);
  host.appendChild(wrap);
}

function positionPopover(pop, anchor) {
  if (!anchor) return;
  const rect = anchor.getBoundingClientRect();
  pop.style.display = "block";
  pop.style.visibility = "hidden";

  const { width: pw, height: ph } = pop.getBoundingClientRect();
  let left = rect.left + rect.width - pw;
  let top = rect.bottom + 8;
  const padding = 8;

  left = Math.min(Math.max(padding, left), window.innerWidth - pw - padding);
  top = Math.min(Math.max(padding, top), window.innerHeight - ph - padding);

  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  pop.style.visibility = "visible";
}

function showViewOptionsPopover(triggerBtn) {
  const pop = ensureViewOptionsPopover();
  if (pop.style.display === "block" && viewOptionsAnchor === triggerBtn) {
    hideViewOptionsPopover();
    return;
  }

  pop.innerHTML = "";
  viewOptionsAnchor = triggerBtn || null;

  const title = document.createElement("div");
  title.className = "vo-title";
  title.textContent = t("view_options") || "View options";
  pop.appendChild(title);

  if (window.viewMode === "gallery") {
    buildGalleryControls(pop);
  } else {
    buildRowHeightControls(pop);
  }

  // separator then zoom controls
  const sep = document.createElement("div");
  sep.className = "vo-separator";
  pop.appendChild(sep);
  buildZoomControls(pop);

  const sep2 = document.createElement("div");
  sep2.className = "vo-separator";
  pop.appendChild(sep2);
  buildDualPaneToggle(pop);

  positionPopover(pop, triggerBtn);
  pop.style.display = "block";

  if (!viewOptionsBound) {
    document.addEventListener("click", viewOptionsOutside, true);
    document.addEventListener("keydown", viewOptionsEscape, true);
    viewOptionsBound = true;
  }
}

function bindViewOptionsButton() {
  const btn = document.getElementById("viewOptionsBtn");
  if (!btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";
  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    showViewOptionsPopover(btn);
  });
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

export async function loadFileList(folderParam, options = {}) {
  
  await initOnlyOfficeCaps();
  hideHoverPreview();
  const pane = normalizePaneKey(options.pane || window.activePane);
  const reqId = ++__fileListReqSeq[pane]; // latest call wins
  const folderOnly =
    window.userFolderOnly === true ||
    localStorage.getItem("folderOnly") === "true";
  const username = (localStorage.getItem("username") || "").trim();
  const lastOpenedFolder = (localStorage.getItem("lastOpenedFolder") || "").trim();
  const { skipFallback } = options || {};

  let folder = folderParam || window.currentFolder || lastOpenedFolder || "root";
  if (folderOnly && (!folder || folder === "root") && username) {
    folder = username;
    window.currentFolder = folder;
    try { localStorage.setItem("lastOpenedFolder", folder); } catch (e) { }
    updateBreadcrumbTitle(folder);
  }
  savePaneState(pane, { currentFolder: folder });

  const fileListContainer = document.getElementById("fileList");
  if (fileListContainer) {
    fileListContainer.classList.remove("file-list-secondary-empty");
  }
  const actionsContainer = document.getElementById("fileListActions");
  window.selectedFolderCaps = null;
  savePaneState(pane, { selectedFolderCaps: null });
  refreshCurrentFolderCaps(folder);

  // 1) show loader (only this request is allowed to render)
  fileListContainer.style.visibility = "hidden";
  fileListContainer.innerHTML = "<div class='loader'>Loading files...</div>";

  try {
    // Kick off both in parallel, but render as soon as FILES are ready
    const recursiveParam = folderOnly ? 0 : 1;
    const filesPromise = fetch(
      withBase(`/api/file/getFileList.php?folder=${encodeURIComponent(folder)}&recursive=${recursiveParam}&t=${Date.now()}`),
      { credentials: 'include' }
    );
    let foldersPromise = fetch(
      withBase(`/api/folder/getFolderList.php?folder=${encodeURIComponent(folder)}`),
      { credentials: 'include' }
    );

    // ----- FILES FIRST -----
    let filesRes = await filesPromise;

    // If the first attempt is forbidden (common for folder-only users or wrong folder),
    // retry smartly:
    //  - first, drop recursion
    //  - if still forbidden and we have a username, try that folder once
    if (filesRes.status === 403 && folder !== "root") {
      try {
        filesRes = await fetch(
          withBase(`/api/file/getFileList.php?folder=${encodeURIComponent(folder)}&recursive=0&t=${Date.now()}`),
          { credentials: "include" }
        );
      } catch (e) { /* ignore and fall through */ }
    }
    if (filesRes.status === 403 && username && folder !== username) {
      try {
        const alt = await fetch(
          withBase(`/api/file/getFileList.php?folder=${encodeURIComponent(username)}&recursive=0&t=${Date.now()}`),
          { credentials: "include" }
        );
        if (alt.ok) {
          // switch context to the user folder
          filesRes = alt;
          folder = username;
          window.currentFolder = folder;
          try { localStorage.setItem("lastOpenedFolder", folder); } catch (e) { }
          updateBreadcrumbTitle(folder);
          // remember that this is a folder-only session
          window.userFolderOnly = true;
          try { localStorage.setItem("folderOnly", "true"); } catch (e) { }
          refreshCurrentFolderCaps(folder);
          // refresh folders promise for the new folder context
          foldersPromise = fetch(
            withBase(`/api/folder/getFolderList.php?folder=${encodeURIComponent(folder)}`),
            { credentials: 'include' }
          );
        }
      } catch (e) { /* ignore; will fall back to the normal 403 handling */ }
    }

    if (filesRes.status === 401) {
      // session expired — bounce to logout
      window.location.href = withBase("/api/auth/logout.php");
      throw new Error("Unauthorized");
    }
    if (filesRes.status === 403) {
      if (!skipFallback) {
        const fallback = await findBestAccessibleFolder({ lastOpenedFolder });
        if (fallback && fallback !== folder) {
          setCurrentFolderContext(fallback);
          return await loadFileList(fallback, { skipFallback: true });
        }
      }
      // For folder-only users, treat 403 as "empty list" instead of hard error.
      if (folderOnly) {
        fileListContainer.innerHTML = `
            <div class="empty-state">
              ${t("no_files_found") || "No files found."}
            </div>`;
        const summaryElem = document.getElementById("fileSummary");
        if (summaryElem) summaryElem.style.display = "none";
        const strip = document.getElementById("folderStripContainer");
        if (strip) strip.style.display = "none";
        updateFileActionButtons();
        fileListContainer.style.visibility = "visible";
        return [];
      }

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
    if (reqId !== __fileListReqSeq[pane]) return [];

    // 3) clear loader
    fileListContainer.innerHTML = "";

    // 4) handle “no files” case
    if (!data.files || Object.keys(data.files).length === 0) {
      if (reqId !== __fileListReqSeq[pane]) return [];
      fileListContainer.innerHTML = `
          <div class="empty-state">
            ${t("no_files_found")}
            <div style="margin-top:6px;font-size:.9em;color:#777">
              ${t("no_folder_access_yet") || "No folder access has been assigned to your account yet."}
            </div>
          </div>`;

      const summaryElem = document.getElementById("fileSummary");
      if (summaryElem) summaryElem.style.display = "none";

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
    
      let bytes = Number.isFinite(f.sizeBytes)
        ? f.sizeBytes
        : parseSizeToBytes(String(f.size || ""));
    
      if (!Number.isFinite(bytes) || bytes < 0) {
        bytes = null;
      }
    
      f.sizeBytes = bytes;
    
      // New: normalize display size and create a stable cache key
      if (bytes != null) {
        f.size = formatSize(bytes);
      }
    
      const cacheKey =
        (f.modified && String(f.modified)) ||
        (f.uploaded && String(f.uploaded)) ||
        (bytes != null ? String(bytes) : "") ||
        f.name;
    
      f.cacheKey = cacheKey;
      f.folder   = folder;
    
      // For editing: if size is unknown, assume it's OK and let the editor enforce limits.
      const safeForEdit = (bytes == null) || (bytes <= MAX_EDIT_BYTES);
      f.editable = canEditFile(f.name) && safeForEdit;
    
      return f;
    });
    fileData = data.files;
    savePaneState(pane, { fileData: fileData, currentFolder: folder, hasLoaded: true });

    if (reqId !== __fileListReqSeq[pane]) return [];

    // 6) inject summary + slider
    if (actionsContainer) {
      // a) summary
      let summaryElem = document.getElementById("fileSummary");
      if (!summaryElem) {
        summaryElem = document.createElement("div");
        summaryElem.id = "fileSummary";
        summaryElem.className = "fr-summary-pill";
        summaryElem.setAttribute("role", "status");
        summaryElem.setAttribute("aria-live", "polite");
        actionsContainer.appendChild(summaryElem);
      }
      summaryElem.classList.add("fr-summary-pill");
      summaryElem.style.display = "flex";
      const fallbackStats = getLocalSummaryStats();
      summaryElem.innerHTML = buildFolderSummaryHTML(null, fallbackStats);
      summaryElem.dataset.folder = folder;
      summaryElem.dataset.truncated = "0";

      fetchFolderSummaryStats(folder).then(stats => {
        if (!stats || summaryElem.dataset.folder !== folder) return;
        summaryElem.innerHTML = buildFolderSummaryHTML(stats, fallbackStats);
        summaryElem.dataset.truncated = stats.truncated ? "1" : "0";
        if (stats.truncated) {
          summaryElem.title = "Totals capped for very large folders.";
        } else {
          summaryElem.removeAttribute("title");
        }
      });
    }

    // 7) render files
    if (reqId !== __fileListReqSeq[pane]) return [];

    if (window.viewMode === "gallery") {
      renderGalleryView(folder);
    } else {
      renderFileTable(folder);
    }
    updateFileActionButtons();
    fileListContainer.style.visibility = "visible";

    // Highlight a search-hit file if requested
    maybeHighlightSearchedFile(folder);

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
      if (reqId !== __fileListReqSeq[pane]) return data.files;

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
      savePaneState(pane, { currentSubfolders: subfolders });

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
      if (window.viewMode === "table" && reqId === __fileListReqSeq[pane]) {
        renderFileTable(folder);
      }
    } catch (e) {
      // ignore folder errors; rows already rendered
    }

    setPaneHasContent(pane, true);
    // Intentionally skip auto-restoring the inactive pane for lazy-load perf.
    updateDualPaneTargetHint();
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
    if (reqId === __fileListReqSeq[pane]) {
      fileListContainer.style.visibility = "visible";
    }
  }
}

function makeInlineFolderDragImage(labelText) {
  const isDark = document.body.classList.contains('dark-mode');

  const textColor = isDark
    ? '#f1f3f4'
    : 'var(--filr-text, #111827)';

  const bgColor = isDark
    ? 'rgba(32,33,36,0.96)'
    : 'var(--filr-bg-elevated, #ffffff)';

  const borderColor = isDark
    ? 'rgba(255,255,255,0.14)'
    : 'rgba(15,23,42,0.12)';

  const wrap = document.createElement('div');
  Object.assign(wrap.style, {
    position: 'fixed',
    top: '-9999px',
    left: '-9999px',
    zIndex: '99999',

    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',

    padding: '7px 16px',
    minHeight: '32px',
    maxWidth: '420px',
    whiteSpace: 'nowrap',

    borderRadius: '999px',
    overflow: 'hidden',
    backgroundClip: 'padding-box',

    background: bgColor,
    color: textColor,
    border: `1px solid ${borderColor}`,
    boxShadow: '0 4px 18px rgba(0,0,0,0.18)',

    fontSize: '14px',
    lineHeight: '1.4',
    fontWeight: '500',

    pointerEvents: 'none'
  });

  const icon = document.createElement('span');
  icon.className = 'material-icons';
  icon.textContent = 'folder';
  Object.assign(icon.style, {
    fontSize: '20px',
    lineHeight: '1',
    flexShrink: '0',
    color: textColor
  });

  const label = document.createElement('span');
  const txt = String(labelText || '');
  label.textContent = txt.length > 60 ? (txt.slice(0, 57) + '…') : txt;
  Object.assign(label.style, {
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  });

  wrap.appendChild(icon);
  wrap.appendChild(label);
  document.body.appendChild(wrap);

  return wrap;
}

function folderRowDragStartHandler(event, fullPath) {
  try { cancelHoverPreview(); } catch (e) {}

  if (!fullPath) return;

  const srcParent = parentFolderOf(fullPath);

  const payload = {
    dragType: 'folder',
    folder: fullPath,
    sourceFolder: srcParent
  };

  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('application/json', JSON.stringify(payload));
  event.dataTransfer.setData('text/plain', fullPath);

  const label = fullPath.split('/').pop() || fullPath;
  const ghost = makeInlineFolderDragImage(label);
  event.dataTransfer.setDragImage(ghost, 10, 10);
  setTimeout(() => {
    try { document.body.removeChild(ghost); } catch (e) {}
  }, 0);
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

      // Allow dragging this folder row itself (for folder → folder moves)
  tr.setAttribute('draggable', 'true');
  tr.addEventListener('dragstart', e => folderRowDragStartHandler(e, sf.full));
  
    for (let i = 0; i < colCount; i++) {
      const td = document.createElement("td");

// *** copy header classes so responsive breakpoints match file rows ***
// but strip Bootstrap margin helpers (ml-2 / mx-2) so we don't get a big gap
const headerClass = headerCells[i] && headerCells[i].className;
if (headerClass) {
  td.className = headerClass;
  td.classList.remove("ml-2", "mx-2");
}
  
      // 1) checkbox column (real checkbox; icon moves to name cell)
      if (i === checkboxIdx) {
        td.classList.add("folder-icon-cell", "checkbox-col");
        td.style.textAlign = "center";
        td.style.verticalAlign = "middle";
  
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "folder-checkbox";
        cb.dataset.folder = sf.full;
        cb.addEventListener("click", e => e.stopPropagation());
        cb.addEventListener("change", () => handleFolderCheckboxChange(cb));
        td.appendChild(cb);
  
      // 2) name column
      } else if (i === nameIdx) {
        td.classList.add("name-cell", "file-name-cell", "folder-name-cell");
  
        const wrap = document.createElement("div");
        wrap.className = "folder-row-inner";
  
        const iconSpan = document.createElement("span");
        iconSpan.className = "folder-svg folder-row-icon";
  
        const nameSpan = document.createElement("span");
        nameSpan.className = "folder-row-name";
        nameSpan.textContent = sf.name || sf.full;
  
        const metaSpan = document.createElement("span");
        metaSpan.className = "folder-row-meta";
        metaSpan.textContent = ""; // "(15 folders, 19 files)" later
  
        wrap.appendChild(iconSpan);
        wrap.appendChild(nameSpan);
        wrap.appendChild(metaSpan);
        td.appendChild(wrap);
  
      // 3) size column
      } else if (i === sizeIdx) {
        td.classList.add("folder-size-cell");
        td.textContent = "…"; // placeholder until we load stats
        // NEW: match file-row numeric alignment
        td.style.textAlign = "right";
        td.style.fontVariantNumeric = "tabular-nums";
  
      // 4) uploader / owner column
      } else if (i === uploaderIdx) {
        td.classList.add("uploader-cell", "folder-uploader-cell");
        td.textContent = ""; // filled asynchronously with owner
  
      // 5) actions column
    } else if (i === actionsIdx) {
      td.classList.add("folder-actions-cell");
    
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-link btn-actions-ellipsis";
      btn.title = t("more_actions");
    
      const icon = document.createElement("span");
      icon.className = "material-icons";
      icon.textContent = "more_vert";
    
      btn.appendChild(icon);
      td.appendChild(btn);
    }
  
      // IMPORTANT: always append the cell, no matter which column we're in
      tr.appendChild(td);
    }
  
    // click → navigate, same as before
    tr.addEventListener("click", e => {
      hideHoverPreview();
      if (e.target.closest(".folder-checkbox")) {
        return;
      }
      // If the click came from the 3-dot button, let the context menu logic handle it
      if (e.target.closest(".btn-actions-ellipsis")) {
        return;
      }
    
      if (e.button !== 0) return;
      const dest = sf.full;
      if (!dest) return;
      setCurrentFolderContext(dest);
    
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
  
      const menuItems = [
        {
          label: t("create_folder"),
          action: () => {
            window.currentFolder = dest;
            const modal = document.getElementById("createFolderModal");
            if (modal) modal.style.display = "block";
            const input = document.getElementById("newFolderName");
            if (input) input.focus();
          }
        },
        { label: t("move_folder"),   action: () => openMoveFolderUI(dest) },
        { label: t("rename_folder"), action: () => { window.currentFolder = dest; openRenameFolderModal(); } },
        { label: t("color_folder"),  action: () => openColorFolderModal(dest) },
        { label: t("folder_share"),  action: () => openFolderShareModal(dest) },
        { label: t("delete_folder"), action: () => { window.currentFolder = dest; openDeleteFolderModal(); } }
      ];
      showFolderManagerContextMenu(e.pageX, e.pageY, menuItems);

      // Defensive: repaint icon if it was blanked by the contextmenu interaction.
      try {
        queueMicrotask(() => {
          const iconSpan = tr.querySelector('.folder-svg');
          if (iconSpan && String(iconSpan.innerHTML || '').trim() === '') {
            attachStripIconAsync(tr, dest, 28);
          }
        });
      } catch (e2) { /* ignore */ }
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
  const raw  = cs.getPropertyValue('--file-row-height') || '44px';
  const rowH = parseInt(raw, 10) || 60;

  const FUDGE          = 1;
  const MAX_GROWTH_ROW = 44;   // after this, stop growing the icon

  const BASE_ROW_FOR_OFFSET = 20; // where icon looks centered
  const OFFSET_FACTOR       = -0.10;
  const effectiveRow = Math.min(rowH, MAX_GROWTH_ROW);

  const boxSize = Math.max(20, Math.min(35, effectiveRow - 20 + FUDGE));
  const scale   = 1.20;

  // use existing offset curve
  const clampedForOffset = Math.max(30, Math.min(60, rowH));
  let offsetY = (clampedForOffset - BASE_ROW_FOR_OFFSET) * OFFSET_FACTOR;
  if (rowH > 53) {
    offsetY -= -2; 
  }

  document.querySelectorAll(':is(#fileList, #fileListSecondary) .folder-row-icon').forEach(iconSpan => {
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

async function sortSubfoldersForCurrentOrder(subfolders) {
  const base = Array.isArray(subfolders) ? [...subfolders] : [];
  if (!base.length) return base;

  const col = sortOrder?.column || "uploaded";
  const ascending = sortOrder?.ascending !== false;
  const dir = ascending ? 1 : -1;

  // Name sort (A–Z / Z–A)
  if (col === "name") {
    base.sort((a, b) => {
      const n1 = (a.name || "").toLowerCase();
      const n2 = (b.name || "").toLowerCase();
      if (n1 < n2) return -1 * dir;
      if (n1 > n2) return  1 * dir;
      return 0;
    });
    return base;
  }

  // Size sort – use folder stats (bytes)
  if (col === "size" || col === "filesize") {
    const statsList = await Promise.all(
      base.map(sf => fetchFolderStats(sf.full).catch(() => null))
    );

    const decorated = base.map((sf, idx) => {
      const stats = statsList[idx];
      let bytes = 0;

      if (stats) {
        const candidates = [
          stats.bytes,
          stats.sizeBytes,
          stats.size,
          stats.totalBytes
        ];
        for (const v of candidates) {
          const n = Number(v);
          if (Number.isFinite(n) && n >= 0) {
            bytes = n;
            break;
          }
        }
      }

      return { sf, bytes };
    });

    decorated.sort((a, b) => {
      if (a.bytes < b.bytes) return -1 * dir;
      if (a.bytes > b.bytes) return  1 * dir;

      // tie-break by name
      const n1 = (a.sf.name || "").toLowerCase();
      const n2 = (b.sf.name || "").toLowerCase();
      if (n1 < n2) return -1 * dir;
      if (n1 > n2) return  1 * dir;
      return 0;
    });

    return decorated.map(d => d.sf);
  }

  // NEW: Created / Uploaded sort – use earliest_uploaded from stats
  if (col === "uploaded" || col === "created") {
    const statsList = await Promise.all(
      base.map(sf => fetchFolderStats(sf.full).catch(() => null))
    );

    const decorated = base.map((sf, idx) => {
      const stats = statsList[idx];
      let ts = 0;

      if (stats && typeof stats.earliest_uploaded === "string") {
        ts = parseCustomDate(String(stats.earliest_uploaded));
        if (!Number.isFinite(ts)) ts = 0;
      }

      return { sf, ts };
    });

    decorated.sort((a, b) => {
      if (a.ts < b.ts) return -1 * dir;
      if (a.ts > b.ts) return  1 * dir;

      // tie-break by name
      const n1 = (a.sf.name || "").toLowerCase();
      const n2 = (b.sf.name || "").toLowerCase();
      if (n1 < n2) return -1 * dir;
      if (n1 > n2) return  1 * dir;
      return 0;
    });

    return decorated.map(d => d.sf);
  }

  // NEW: Modified sort – use latest_mtime from stats
  if (col === "modified") {
    const statsList = await Promise.all(
      base.map(sf => fetchFolderStats(sf.full).catch(() => null))
    );

    const decorated = base.map((sf, idx) => {
      const stats = statsList[idx];
      let ts = 0;

      if (stats && typeof stats.latest_mtime === "string") {
        ts = parseCustomDate(String(stats.latest_mtime));
        if (!Number.isFinite(ts)) ts = 0;
      }

      return { sf, ts };
    });

    decorated.sort((a, b) => {
      if (a.ts < b.ts) return -1 * dir;
      if (a.ts > b.ts) return  1 * dir;

      // tie-break by name
      const n1 = (a.sf.name || "").toLowerCase();
      const n2 = (b.sf.name || "").toLowerCase();
      if (n1 < n2) return -1 * dir;
      if (n1 > n2) return  1 * dir;
      return 0;
    });

    return decorated.map(d => d.sf);
  }

  // Default: keep folders A–Z by name regardless of other sorts
  base.sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" })
  );
  return base;
}

async function openDefaultFileFromHover(file) {
  if (!file) return;
  const folder = file.folder || window.currentFolder || "root";

  try {
    if (canEditFile(file.name) && file.editable) {
      const m = await import('./fileEditor.js?v={{APP_QVER}}');
      m.editFile(file.name, folder);
    } else {
      const url = apiFileUrl(folder, file.name, true);
      const m = await import('./filePreview.js?v={{APP_QVER}}');
      m.previewFile(url, file.name);
    }
  } catch (e) {
    console.error("Failed to open hover preview action", e);
  }
}

/**
 * Render table view
 */


export async function renderFileTable(folder, container, subfolders) {
  const fileListContent = container || document.getElementById("fileList");
  const searchTerm = (window.currentSearchTerm || "").toLowerCase();
  const itemsPerPageSetting = parseInt(localStorage.getItem("itemsPerPage") || "50", 10);
  let currentPage = window.currentPage || 1;
  const targetSelection = (pendingSearchSelection && pendingSearchSelection.folder === folder)
    ? pendingSearchSelection
    : null;

  // Files (filtered by search)
  let filteredFiles = searchFiles(searchTerm);

  // Apply current sort (Modified desc by default for you)
  if (Array.isArray(filteredFiles) && filteredFiles.length) {
    filteredFiles = [...filteredFiles].sort(compareFilesForSort);
  }

  // Inline folders: sort once (Explorer-style A→Z)
  const allSubfolders = Array.isArray(window.currentSubfolders)
  ? window.currentSubfolders
  : [];

// NEW: sort folders according to current sort order (name / size)
const subfoldersSorted = await sortSubfoldersForCurrentOrder(allSubfolders);

  const totalFiles   = filteredFiles.length;
  const totalFolders = subfoldersSorted.length;
  const totalRows    = totalFiles + totalFolders;
  const hasFolders   = totalFolders > 0;

  // If we have a pending search target, jump to the page that contains it
  if (targetSelection && totalFiles > 0) {
    const idx = filteredFiles.findIndex(f => f.name === targetSelection.name);
    if (idx >= 0) {
      const targetPage = Math.floor(idx / itemsPerPageSetting) + 1;
      if (targetPage !== currentPage) {
        currentPage = targetPage;
        window.currentPage = currentPage;
      }
    }
  }

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
  updatePaneWidthClasses();

  (function rightAlignSizeColumn() {
    const table = fileListContent.querySelector("table.filr-table");
    if (!table || !table.tHead || !table.tBodies.length) return;
  
    const headerCells = Array.from(table.tHead.querySelectorAll("th"));
    const sizeIdx = headerCells.findIndex(th =>
      (th.dataset && (th.dataset.column === "size" || th.dataset.column === "filesize")) ||
      /\bsize\b/i.test((th.textContent || "").trim())
    );
    if (sizeIdx < 0) return;
  
    // Header
    headerCells[sizeIdx].style.textAlign = "right";
  
    // Body cells
    Array.from(table.tBodies[0].rows).forEach(row => {
      if (sizeIdx >= row.cells.length) return;
      row.cells[sizeIdx].style.textAlign = "right";
      row.cells[sizeIdx].style.fontVariantNumeric = "tabular-nums";
    });
  })();

  // ---- MOBILE FIX: show "Size" column for files (Name | Size | Actions) ----
  (function fixMobileFileSizeColumn() {
    const mode = getPaneLayoutMode(fileListContent);
    if (mode !== "narrow") return;

    const table = fileListContent.querySelector("table.filr-table");
    if (!table || !table.tHead || !table.tBodies.length) return;

    const thead = table.tHead;
    const tbody = table.tBodies[0];

    const headerCells = Array.from(thead.querySelectorAll("th"));
    // Find the Size column index by label or data-column
    const sizeIdx = headerCells.findIndex(th =>
      (th.dataset && (th.dataset.column === "size" || th.dataset.column === "filesize")) ||
      /\bsize\b/i.test((th.textContent || "").trim())
    );
    if (sizeIdx < 0) return;

    // Unhide Size header on mobile
    const sizeTh = headerCells[sizeIdx];
    sizeTh.classList.remove(
      "hide-small",
      "hide-medium",
      "d-none",
      "d-sm-table-cell",
      "d-md-table-cell",
      "d-lg-table-cell",
      "d-xl-table-cell"
    );

    // Unhide the Size cell in every body row (files + folders)
    Array.from(tbody.rows).forEach(row => {
      if (sizeIdx >= row.cells.length) return;
      const td = row.cells[sizeIdx];
      if (!td) return;

      td.classList.remove(
        "hide-small",
        "hide-medium",
        "d-none",
        "d-sm-table-cell",
        "d-md-table-cell",
        "d-lg-table-cell",
        "d-xl-table-cell"
      );
    });
  })();

// Inject inline folder rows for THIS page (Explorer-style) first
if (window.showInlineFolders !== false && pageFolders.length) {
  injectInlineFolderRows(fileListContent, folder, pageFolders);
}

  // Right-align meta columns: created / modified / owner
  (function rightAlignMetaColumns() {
    const table = fileListContent.querySelector("table.filr-table");
    if (!table || !table.tHead || !table.tBodies.length) return;

    const headerCells = Array.from(table.tHead.querySelectorAll("th"));
    const bodyRows = Array.from(table.tBodies[0].rows);

    function alignCol(matchFn, numeric = true) {
      const idx = headerCells.findIndex(matchFn);
      if (idx < 0) return;

      const th = headerCells[idx];
      th.style.textAlign = "right";

      bodyRows.forEach(row => {
        if (idx >= row.cells.length) return;
        const td = row.cells[idx];
        if (!td) return;
        td.style.textAlign = "right";
        if (numeric) {
          td.style.fontVariantNumeric = "tabular-nums";
        }
      });
    }

    // Uploaded / Created
    alignCol(th =>
      (th.dataset && (th.dataset.column === "uploaded" || th.dataset.column === "created")) ||
      /\b(uploaded|created)\b/i.test((th.textContent || "").trim())
    );

    // Modified
    alignCol(th =>
      (th.dataset && th.dataset.column === "modified") ||
      /\bmodified\b/i.test((th.textContent || "").trim())
    );

    // Owner / Uploader
    alignCol(th =>
      (th.dataset && th.dataset.column === "uploader") ||
      /\b(owner|uploader)\b/i.test((th.textContent || "").trim()),
      /* numeric = */ false   // names aren't numbers, but right-align anyway
    );
  })();

// Now wire 3-dot ellipsis so it also picks up folder rows
wireEllipsisContextMenu(fileListContent);

// Hover preview (desktop only, and only if user didn’t disable it)
if (window.innerWidth >= 768 && !isHoverPreviewDisabled()) {
  fileListContent.querySelectorAll("tbody tr").forEach(row => {
    if (row.classList.contains("folder-strip-row")) return;

    row.addEventListener("mouseenter", (e) => {
      hoverPreviewActiveRow = row;
      clearTimeout(hoverPreviewTimer);
      hoverPreviewTimer = setTimeout(() => {
        if (hoverPreviewActiveRow === row && !isHoverPreviewDisabled()) {
          fillHoverPreviewForRow(row);
          const el = ensureHoverPreviewEl();
          el.style.display = "block";
          positionHoverPreview(e.clientX, e.clientY);
        }
      }, 180);
    });

    row.addEventListener("mouseleave", () => {
      hoverPreviewActiveRow = null;
      clearTimeout(hoverPreviewTimer);
      setTimeout(() => {
        if (!hoverPreviewActiveRow && !hoverPreviewHoveringCard) {
          hideHoverPreview();
        }
      }, 120);
    });

    row.addEventListener("contextmenu", () => {
      hoverPreviewActiveRow = null;
      clearTimeout(hoverPreviewTimer);
      hideHoverPreview();
    });
  });
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
      clearFolderSelections();
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
  ensureSearchEverywhereButton();
  bindViewOptionsButton();

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

  document.querySelectorAll("#fileList table.filr-table thead th[data-column]").forEach(cell => {
    cell.addEventListener("click", function () {
      const column = this.getAttribute("data-column");
      sortFiles(column, folder);
    });
  });
  document.querySelectorAll("#fileList .file-checkbox").forEach(checkbox => {
    checkbox.addEventListener("change", function (e) {
      clearFolderSelections();
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
  bindFolderToolbarActions();
  updateFileActionButtons();
  maybeHighlightSearchedFile(folder);

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

  // Right-click context menu stays for power users
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
  let filteredFiles = searchFiles(searchTerm);

  if (Array.isArray(filteredFiles) && filteredFiles.length) {
    filteredFiles = [...filteredFiles].sort(compareFilesForSort);
  }

  // API preview base (we’ll build per-file URLs)
	  const apiBase = withBase(`/api/file/download.php?folder=${encodeURIComponent(folder)}&file=`);

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
  const maxCols = getGalleryMaxColumns();
  const startCols = Math.min(window.galleryColumns || 3, maxCols);
  window.galleryColumns = startCols;

  // --- Start gallery grid ---
  galleryHTML += `
      <div class="gallery-container"
           style="display:grid;
                  grid-template-columns:repeat(${startCols},1fr);
                  gap:10px;
                  padding:10px;">
    `;

  // slice current page
  const startIdx = (currentPage - 1) * itemsPerPage;
  const pageFiles = filteredFiles.slice(startIdx, startIdx + itemsPerPage);
  const maxImagePreviewBytes = getMaxImagePreviewBytes();

  pageFiles.forEach((file, idx) => {
    const idSafe = encodeURIComponent(file.name) + "-" + (startIdx + idx);

    const previewURL = apiFileUrl(folder, file.name, true);

    // thumbnail
    let thumbnail;
    if (/\.(jpe?g|png|gif|bmp|webp|ico)$/i.test(file.name)) {
      const bytes = Number.isFinite(file.sizeBytes) ? file.sizeBytes : null;
      const tooBig = bytes != null && bytes > maxImagePreviewBytes;
      if (tooBig) {
        const sizeLabel = bytes != null ? formatSize(bytes) : '';
        thumbnail = `
          <div class="gallery-placeholder" style="
            display:flex;
            align-items:center;
            justify-content:center;
            min-height:${getMaxImageHeight()}px;
            padding:10px;
            border-radius:8px;
            background:rgba(0,0,0,0.05);
            color:#444;
            font-size:0.9rem;
            text-align:center;
          ">
            ${escapeHTML(t("preview_too_large") || "Preview disabled for large image")}
            ${sizeLabel ? `<div style="font-size:0.8rem; opacity:0.75; margin-top:4px;">${escapeHTML(sizeLabel)}</div>` : ""}
          </div>
        `;
      } else {
        const cacheKey = previewURL; // include folder & file
        const src = (window.imageCache && window.imageCache[cacheKey]) || previewURL;
        thumbnail = `<img
            src="${src}"
            class="gallery-thumbnail"
            data-cache-key="${cacheKey}"
            alt="${escapeHTML(file.name)}"
            loading="lazy"
            decoding="async"
            fetchpriority="low"
            style="max-width:100%; max-height:${getMaxImageHeight()}px; display:block; margin:0 auto;">`;
      }
    } else if (/\.(mp4|mkv|webm|mov|ogv)$/i.test(file.name)) {
      thumbnail = `<span class="material-icons gallery-icon">movie</span>`;
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
             style="position:relative; border-radius: 12px; border:1px solid #ccc; padding:5px; text-align:center;">
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
  bindFolderToolbarActions();
  updateFileActionButtons();
  createViewToggleButton();
  ensureSearchEverywhereButton();
  bindViewOptionsButton();
  maybeHighlightSearchedFile(folder);
}

/**
 * Fallback: derive selected files from DOM checkboxes if no explicit list
 * of file objects is provided.
 */
function getSelectedFilesForDownload() {
  const checks = Array.from(document.querySelectorAll('#fileList .file-checkbox'));
  if (!checks.length) return [];

  // checkbox values are ESCAPED names
  const selectedEsc = checks.filter(cb => cb.checked).map(cb => cb.value);
  if (!selectedEsc.length) return [];

  const escSet = new Set(selectedEsc);

  const files = Array.isArray(fileData)
    ? fileData.filter(f => escSet.has(escapeHTML(f.name)))
    : [];

  return files.map(f => ({
    folder: f.folder || window.currentFolder || 'root',
    name: f.name
  }));
}

/**
 * Push selected files into a stepper queue and show the
 * bottom-right panel with "Download next / Cancel".
 *
 * Expects `fileObjs` to be an array of file objects from `fileData`
 * (e.g. currentSelection().files in fileMenu.js).
 */
export function downloadSelectedFilesIndividually(fileObjs) {
  const src = Array.isArray(fileObjs) ? fileObjs : [];

  if (!src.length) {
    showToast(t('no_files_selected') || 'No files selected.', 'warning');
    return;
  }

  const mapped = src.map(f => ({
    folder: f.folder || window.currentFolder || 'root',
    name: f.name
  }));

  const limit = window.maxNonZipDownloads || MAX_NONZIP_MULTI_DOWNLOAD;
  if (mapped.length > limit) {
    const inEncrypted = !!(window.currentFolderCaps && window.currentFolderCaps.encryption && window.currentFolderCaps.encryption.encrypted);
    const msg = inEncrypted
      ? `You selected ${mapped.length} files. In encrypted folders, downloads are limited to ${limit} files at a time.`
      : (t('too_many_plain_downloads') || `You selected ${mapped.length} files. For more than ${limit} files, please use "Download as ZIP".`);
    showToast(msg, 'warning');
    return;
  }

  // Replace any existing queue with the new one.
  window.__nonZipDownloadQueue = mapped.slice();

  // Show the panel; user will click "Download next" for each file.
  showNonZipPanel();

  // auto-fire the first file here:
  triggerNextNonZipDownload();
}

function compareFilesForSort(a, b) {
  const column = sortOrder?.column || "uploaded";
  const ascending = sortOrder?.ascending !== false;

  let valA = a[column] ?? "";
  let valB = b[column] ?? "";

  if (column === "size" || column === "filesize") {
    // numeric size
    valA = Number.isFinite(a.sizeBytes) ? a.sizeBytes : 0;
    valB = Number.isFinite(b.sizeBytes) ? b.sizeBytes : 0;
  } else if (column === "modified" || column === "uploaded") {
    // date sort (newest/oldest)
    const parsedA = parseCustomDate(String(valA || ""));
    const parsedB = parseCustomDate(String(valB || ""));
    valA = parsedA;
    valB = parsedB;
  } else {
    if (typeof valA === "string") valA = valA.toLowerCase();
    if (typeof valB === "string") valB = valB.toLowerCase();
  }

  if (valA < valB) return ascending ? -1 : 1;
  if (valA > valB) return ascending ?  1 : -1;
  return 0;
}

function maybeHighlightSearchedFile(folder) {
  if (!pendingSearchSelection) return;
  const target = pendingSearchSelection;
  if (!target || target.folder !== folder) return;
  const name = target.name;
  if (!name) return;

  const findRow = () => {
    const nodes = document.querySelectorAll('#fileList tr[data-file-name], .gallery-card[data-file-name]');
    for (const row of nodes) {
      const raw = row.getAttribute('data-file-name') || '';
      const decoded = decodeHtmlEntities(raw);
      if (raw === name || decoded === name) return row;
    }
    return null;
  };

  try {
    const row = findRow();
    if (!row) {
      if (typeof target.retries !== 'number') target.retries = 10;
      if (target.retries > 0) {
        target.retries -= 1;
        // Try again shortly in case the DOM finishes rendering
        setTimeout(() => maybeHighlightSearchedFile(folder), 120);
      }
      pendingSearchSelection = target;
      return;
    }

    const alreadySelected = row.classList.contains('row-selected') || row.classList.contains('selected');

    // Select checkbox if present
    const cb = row.querySelector('.file-checkbox');
    if (cb && !alreadySelected) {
      // clear other selections
      document.querySelectorAll('#fileList .file-checkbox').forEach(box => {
        if (box !== cb) {
          box.checked = false;
          updateRowHighlight(box);
        }
      });
      cb.checked = true;
      updateRowHighlight(cb);
      updateFileActionButtons();
    } else if (!cb && !alreadySelected) {
      row.classList.add('row-selected', 'selected');
    }

    if (!alreadySelected) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    if (!target.clearTimer) {
      const ref = target;
      target.clearTimer = setTimeout(() => {
        if (pendingSearchSelection === ref) {
          pendingSearchSelection = null;
        }
      }, 900);
    }
  } catch (e) {
    // best-effort highlight only; leave selection pending for a future render
  }
}


export function sortFiles(column, folder) {
  if (sortOrder.column === column) {
    sortOrder.ascending = !sortOrder.ascending;
  } else {
    sortOrder.column = column;
    sortOrder.ascending = true;
  }

  // Re-sort master fileData
  fileData.sort(compareFilesForSort);

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
window.downloadSelectedFilesIndividually = downloadSelectedFilesIndividually;
