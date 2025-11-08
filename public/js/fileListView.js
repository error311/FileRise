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
    openDeleteFolderModal
  } from './folderManager.js?v={{APP_QVER}}';
  import { openFolderShareModal } from './folderShareModal.js?v={{APP_QVER}}';
  import {
    folderDragOverHandler,
    folderDragLeaveHandler,
    folderDropHandler
  } from './fileDragDrop.js?v={{APP_QVER}}';
  
  export let fileData = [];
  export let sortOrder = { column: "uploaded", ascending: true };



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
  
  // Hide "Edit" for files >10 MiB
  const MAX_EDIT_BYTES = 10 * 1024 * 1024;
  
  // Latest-response-wins guard (prevents double render/flicker if loadFileList gets called twice)
  let __fileListReqSeq = 0;
  
  window.itemsPerPage = parseInt(
    localStorage.getItem('itemsPerPage') || window.itemsPerPage || '10',
    10
  );
  window.currentPage = window.currentPage || 1;
  window.viewMode = localStorage.getItem("viewMode") || "table";
  
  // Global flag for advanced search mode.
  window.advancedSearchEnabled = false;
  
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
    el.style.background  = 'rgba(34,197,94,.15)';
    el.style.color       = '#22c55e';
    return el;
  }

  if (Number.isFinite(state.seconds) && Number.isFinite(state.duration) && state.duration > 0) {
    const pct = Math.max(1, Math.min(99, Math.round((state.seconds / state.duration) * 100)));
    el.classList.add('progress');
    el.textContent = `${pct}%`;
    el.style.borderColor = 'rgba(234,88,12,.55)';
    el.style.background  = 'rgba(234,88,12,.18)';
    el.style.color       = '#ea580c';
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
  lazyLoadFuse().catch(() => {/* ignore; we’ll fall back */});
}

// Lazy + backward-compatible search
function searchFiles(searchTerm) {
  if (!searchTerm) return fileData;

  // kick off Fuse load in the background, but don't await
  lazyLoadFuse().catch(() => { /* ignore */ });

  // keys config (matches your original)
  const fuseKeys = [
    { name: 'name',      weight: 0.1 },
    { name: 'uploader',  weight: 0.1 },
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
          summaryElem.style.cssText = "float:right; margin:0 60px 0 auto; font-size:0.9em;";
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
        subfolders = subfolders.filter(sf => !hidden.has(sf.name));
  
        let strip = document.getElementById("folderStripContainer");
        if (!strip) {
          strip = document.createElement("div");
          strip.id = "folderStripContainer";
          strip.className = "folder-strip-container";
          actionsContainer.parentNode.insertBefore(strip, actionsContainer);
        }
  
        if (window.showFoldersInList && subfolders.length) {
          strip.innerHTML = subfolders.map(sf => `
            <div class="folder-item" data-folder="${sf.full}" draggable="true">
              <i class="material-icons">folder</i>
              <div class="folder-name">${escapeHTML(sf.name)}</div>
            </div>
          `).join("");
          strip.style.display = "flex";
  
          strip.querySelectorAll(".folder-item").forEach(el => {
            // 1) click to navigate
            el.addEventListener("click", () => {
              const dest = el.dataset.folder;
              window.currentFolder = dest;
              localStorage.setItem("lastOpenedFolder", dest);
              updateBreadcrumbTitle(dest);
              document.querySelectorAll(".folder-option.selected").forEach(o => o.classList.remove("selected"));
              document.querySelector(`.folder-option[data-folder="${dest}"]`)?.classList.add("selected");
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
              window.currentFolder = dest;
              localStorage.setItem("lastOpenedFolder", dest);
  
              strip.querySelectorAll(".folder-item.selected").forEach(i => i.classList.remove("selected"));
              el.classList.add("selected");
  
              const menuItems = [
                {
                  label: t("create_folder"),
                  action: () => document.getElementById("createFolderModal").style.display = "block"
                },
                {
                  label: t("rename_folder"),
                  action: () => openRenameFolderModal()
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
  
          document.addEventListener("click", hideFolderManagerContextMenu);
  
        } else {
          strip.style.display = "none";
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
  
  /**
   * Render table view
   */
  export function renderFileTable(folder, container, subfolders) {
    const fileListContent = container || document.getElementById("fileList");
    const searchTerm = (window.currentSearchTerm || "").toLowerCase();
    const itemsPerPageSetting = parseInt(localStorage.getItem("itemsPerPage") || "10", 10);
    let currentPage = window.currentPage || 1;
  
    const filteredFiles = searchFiles(searchTerm);
  
    const totalFiles = filteredFiles.length;
    const totalPages = Math.ceil(totalFiles / itemsPerPageSetting);
    if (currentPage > totalPages) {
      currentPage = totalPages > 0 ? totalPages : 1;
      window.currentPage = currentPage;
    }
  
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
    const startIndex = (currentPage - 1) * itemsPerPageSetting;
    const endIndex = Math.min(startIndex + itemsPerPageSetting, totalFiles);
    let rowsHTML = "<tbody>";
    if (totalFiles > 0) {
      filteredFiles.slice(startIndex, endIndex).forEach((file, idx) => {
        // Build row with a neutral base, then correct the links/preview below.
        // Give the row an ID so we can patch attributes safely
        const idSafe = encodeURIComponent(file.name) + "-" + (startIndex + idx);
        let rowHTML = buildFileTableRow(file, fakeBase);
        
        // add row id + data-file-name, and ensure the name cell also has "name-cell"
        rowHTML = rowHTML
  .replace("<tr", `<tr id="file-row-${idSafe}" data-file-name="${escapeHTML(file.name)}"`)
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
            // keep the original filename content, then add your tag badges, then close
            return `${open}<span class="filename-text">${inner}</span>${tagBadgesHTML}${close}`;
          }
        );
      });
    } else {
      rowsHTML += `<tr><td colspan="8">No files found.</td></tr>`;
    }
    rowsHTML += "</tbody></table>";
    const bottomControlsHTML = buildBottomControls(itemsPerPageSetting);
  
    fileListContent.innerHTML = combinedTopHTML + headerHTML + rowsHTML + bottomControlsHTML;

    wireSelectAll(fileListContent);
  
    // PATCH each row's preview/thumb to use the secure API URLs
    if (totalFiles > 0) {
      filteredFiles.slice(startIndex, endIndex).forEach((file, idx) => {
        const rowEl = document.getElementById(`file-row-${encodeURIComponent(file.name)}-${startIndex + idx}`);
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
  
    // Row-select
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
  
    document.querySelectorAll("table.table thead th[data-column]").forEach(cell => {
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
    
    document.querySelectorAll("#fileList tbody tr").forEach(row => {
      row.setAttribute("draggable", "true");
      import('./fileDragDrop.js?v={{APP_QVER}}').then(module => {
        row.addEventListener("dragstart", module.fileDragStartHandler);
      });
    });
    document.querySelectorAll(".download-btn, .edit-btn, .rename-btn").forEach(btn => {
      btn.addEventListener("click", e => e.stopPropagation());
    });
    bindFileListContextMenu();
    refreshViewedBadges(folder).catch(() => {});
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
    refreshViewedBadges(folder).catch(() => {});
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
      "txt","text","md","markdown","rst",
      "html","htm","xhtml","shtml",
      "css","scss","sass","less",
      "js","mjs","cjs","jsx",
      "ts","tsx",
      "json","jsonc","ndjson",
      "yml","yaml","toml","xml","plist",
      "ini","conf","config","cfg","cnf","properties","props","rc",
      "env","dotenv",
      "csv","tsv","tab",
      "log",
      "sh","bash","zsh","ksh","fish",
      "bat","cmd",
      "ps1","psm1","psd1",
      "py","pyw","rb","pl","pm","go","rs","java","kt","kts",
      "scala","sc","groovy","gradle",
      "c","h","cpp","cxx","cc","hpp","hh","hxx",
      "m","mm","swift","cs","fs","fsx","dart","lua","r","rmd",
      "sql","vue","svelte","twig","mustache","hbs","handlebars","ejs","pug","jade"
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