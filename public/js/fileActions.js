// fileActions.js
import { showToast, attachEnterKeyListener, escapeHTML, isArchiveFileName } from './domUtils.js?v={{APP_QVER}}';
import {
  loadFileList,
  formatFolderName,
  fileData,
  downloadSelectedFilesIndividually,
  startInlineRenameFromContext,
  MAX_NONZIP_MULTI_DOWNLOAD
} from './fileListView.js?v={{APP_QVER}}';
import { refreshFolderIcon, updateRecycleBinState } from './folderManager.js?v={{APP_QVER}}';
import { t } from './i18n.js?v={{APP_QVER}}';
import { withBase } from './basePath.js?v={{APP_QVER}}';
import { startTransferProgress, finishTransferProgress } from './transferProgress.js?v={{APP_QVER}}';

function getActiveFileListRoot() {
  return document.getElementById("fileList") || document;
}

function getActiveSelectedFileCheckboxes() {
  const root = getActiveFileListRoot();
  return Array.from(root.querySelectorAll(".file-checkbox:checked"));
}

function getTransferTotalsForNames(names) {
  const list = Array.isArray(names) ? names : [];
  const wanted = new Set(list.map(name => String(name || '')));
  const files = Array.isArray(fileData) ? fileData : [];

  let totalBytes = 0;
  let matched = 0;
  let unknown = 0;

  files.forEach(file => {
    if (!file || !file.name) return;
    const raw = String(file.name);
    const esc = escapeHTML(raw);
    if (!wanted.has(raw) && !wanted.has(esc)) return;
    matched += 1;
    if (Number.isFinite(file.sizeBytes)) {
      totalBytes += file.sizeBytes;
    } else {
      unknown += 1;
    }
  });

  const missing = Math.max(0, list.length - matched);
  if (missing) unknown += missing;

  return {
    totalBytes,
    bytesKnown: unknown === 0 && totalBytes > 0,
    itemCount: list.length
  };
}

function stripHtmlToText(raw) {
  const input = raw == null ? '' : String(raw);
  if (input === '') return '';
  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(input, 'text/html');
      const out = doc && doc.body ? doc.body.textContent : '';
      return (out || '').trim();
    } catch (e) {
      // Fall through to basic stripping.
    }
  }
  return input.replace(/[<>]/g, '').trim();
}

const ARCHIVE_FORMATS = ["zip", "7z"];
const ARCHIVE_NAME_SUFFIXES = ["zip", "7z", "rar"];
const ARCHIVE_EXT_RE = /\.(zip|7z|rar)$/i;

function syncArchiveFormatSelect() {
  const select = document.getElementById("archiveFormatSelect");
  if (!select) return;
  const rarOption = select.querySelector('option[value="rar"]');
  if (rarOption) {
    rarOption.remove();
  }
  if (!ARCHIVE_FORMATS.includes(select.value)) {
    select.value = "zip";
  }
}

function getSelectedArchiveFormat() {
  const select = document.getElementById("archiveFormatSelect");
  const value = select ? String(select.value || "").toLowerCase() : "zip";
  return ARCHIVE_FORMATS.includes(value) ? value : "zip";
}

function normalizeArchiveName(raw, format) {
  let name = String(raw || "").trim();
  if (!name) return "";
  const ext = format === "7z" ? "7z" : format;
  const lower = name.toLowerCase();
  for (const suffix of ARCHIVE_NAME_SUFFIXES) {
    const token = "." + suffix;
    if (lower.endsWith(token)) {
      name = name.slice(0, -token.length);
      break;
    }
  }
  if (name === "") name = "files";
  return name + "." + ext;
}

function updateArchiveNamePlaceholder(format) {
  const input = document.getElementById("zipFileNameInput");
  if (!input) return;
  const ext = format === "7z" ? "7z" : format;
  input.placeholder = `files.${ext}`;
  if (input.value && ARCHIVE_EXT_RE.test(input.value)) {
    input.value = normalizeArchiveName(input.value, format);
  }
}

let __copyMoveSourcesCache = null;

function getActivePaneKey() {
  return window.activePane === "secondary" ? "secondary" : "primary";
}

function getPaneSourceIdForKey(paneKey) {
  return window.__frPaneState?.[paneKey]?.sourceId || "";
}

function getActivePaneSourceId() {
  return getPaneSourceIdForKey(getActivePaneKey());
}

function getOtherPaneTarget() {
  if (!window.dualPaneEnabled || !window.__frPaneState) return { folder: "", sourceId: "" };
  const active = getActivePaneKey();
  const other = active === "secondary" ? "primary" : "secondary";
  const otherState = window.__frPaneState?.[other];
  const otherFolder = otherState?.currentFolder || "";
  const otherSourceId = otherState?.sourceId || "";
  const currentFolder = window.currentFolder || "";
  const currentSource = getActivePaneSourceId() || "";
  if (!otherFolder) return { folder: "", sourceId: otherSourceId };
  if (otherFolder === currentFolder && otherSourceId === currentSource) {
    return { folder: "", sourceId: otherSourceId };
  }
  return { folder: otherFolder, sourceId: otherSourceId };
}

function getActiveSourceId() {
  const paneSource = getActivePaneSourceId();
  if (paneSource) return paneSource;
  const sel = document.getElementById('sourceSelector');
  if (sel && sel.value) return sel.value;
  try {
    const stored = localStorage.getItem('fr_active_source');
    if (stored) return stored;
  } catch (e) {}
  return '';
}

function getSourceNameById(sourceId) {
  const id = String(sourceId || '').trim();
  if (!id) return '';
  try {
    if (typeof window.__frGetSourceNameById === 'function') {
      return String(window.__frGetSourceNameById(id) || '');
    }
  } catch (e) { /* ignore */ }
  const sel = document.getElementById('sourceSelector');
  if (sel) {
    const opt = Array.from(sel.options).find(o => o.value === id);
    if (opt) return String(opt.dataset?.sourceName || '');
  }
  return '';
}

function getRootLabel(sourceId = '') {
  const id = sourceId || getActiveSourceId();
  const name = getSourceNameById(id);
  return name ? `(${name})` : '(Root)';
}

async function loadVisibleSources() {
  if (__copyMoveSourcesCache) return __copyMoveSourcesCache;
  try {
    const res = await fetch(withBase('/api/pro/sources/visible.php'), {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || data.ok !== true || !data.enabled) return null;
    const list = Array.isArray(data.sources) ? data.sources : [];
    __copyMoveSourcesCache = list;
    return list;
  } catch (e) {
    return null;
  }
}

function populateSourceSelect(selectEl, sources, activeId) {
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

async function initCopyMoveSourceSelect(kind, preferredFolder = '', preferredSourceId = '') {
  const rowId = kind === 'move' ? 'moveFilesSourceRow' : 'copyFilesSourceRow';
  const selectId = kind === 'move' ? 'moveTargetSource' : 'copyTargetSource';
  const folderSelectId = kind === 'move' ? 'moveTargetFolder' : 'copyTargetFolder';
  const row = document.getElementById(rowId);
  const selectEl = document.getElementById(selectId);
  const sources = await loadVisibleSources();
  if (!sources || sources.length <= 1 || !row || !selectEl) {
    if (row) row.style.display = 'none';
    const active = getActiveSourceId();
    await loadCopyMoveFolderListForModal(folderSelectId, preferredFolder, active);
    return;
  }

  row.style.display = '';
  const activeId = getActiveSourceId();
  const preferredId = preferredSourceId || activeId;
  populateSourceSelect(selectEl, sources, preferredId);
  await loadCopyMoveFolderListForModal(folderSelectId, preferredFolder, selectEl.value || preferredId);

  if (!selectEl.__wired) {
    selectEl.__wired = true;
    selectEl.addEventListener('change', async () => {
      const srcId = selectEl.value || '';
      await loadCopyMoveFolderListForModal(folderSelectId, preferredFolder, srcId);
    });
  }
}

function selectPreferredFolderOption(folderSelect, preferredFolder) {
  if (!folderSelect || !preferredFolder) return;
  const options = Array.from(folderSelect.options || []);
  const match = options.find(opt => opt.value === preferredFolder);
  if (match) folderSelect.value = preferredFolder;
}

function markPaneNeedsReloadForFolder(folder, sourceId = "") {
  if (!window.dualPaneEnabled || !window.__frPaneState || !folder) return;
  const active = window.activePane === "secondary" ? "secondary" : "primary";
  ["primary", "secondary"].forEach(pane => {
    if (pane === active) return;
    const state = window.__frPaneState[pane];
    if (state && state.currentFolder === folder) {
      if (sourceId && state.sourceId && state.sourceId !== sourceId) return;
      state.needsReload = true;
    }
  });
}

export function handleDeleteSelected(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  const checkboxes = getActiveSelectedFileCheckboxes();
  if (checkboxes.length === 0) {
    showToast(t('no_files_selected'), 'warning');
    return;
  }
  window.filesToDelete = Array.from(checkboxes).map(chk => chk.value);
  const count = window.filesToDelete.length;
  document.getElementById("deleteFilesMessage").textContent = t("confirm_delete_files", { count: count });
  document.getElementById("deleteFilesModal").style.display = "block";
  attachEnterKeyListener("deleteFilesModal", "confirmDeleteFiles");
}

const FILE_MODAL_IDS = [
  'deleteFilesModal',
  'downloadZipModal',
  'downloadProgressModal',
  'createFileModal',
  'downloadFileModal',
  'copyFilesModal',
  'moveFilesModal',
  'renameFileModal',
  'createFolderModal', // if this exists in your HTML
];

function portalFileModalsToBody() {
  FILE_MODAL_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.parentNode !== document.body) {
      document.body.appendChild(el);
    }
  });
}

function getSelectedFileObjects() {
  const selected = getActiveSelectedFileCheckboxes().map(cb => cb.value);
  if (!selected.length) return [];
  const selectedSet = new Set(selected);
  return fileData.filter(f => selectedSet.has(escapeHTML(f.name)));
}

function getDownloadLimit() {
  const limit = window.maxNonZipDownloads || MAX_NONZIP_MULTI_DOWNLOAD;
  return Number.isFinite(limit) ? limit : MAX_NONZIP_MULTI_DOWNLOAD;
}


  // --- Upload modal "portal" support ---
  let _uploadCardSentinel = null;

  export function openUploadModal() {
    const modal = document.getElementById('uploadModal');
    const body  = document.getElementById('uploadModalBody');
    const card  = document.getElementById('uploadCard'); // <-- your existing card
    window.openUploadModal = openUploadModal;
    window.__pendingDropData = null;
    if (!modal || !body || !card) {
      console.warn('Upload modal or upload card not found');
      return;
    }
  
    // Create a hidden sentinel so we can put the card back in place later
    if (!_uploadCardSentinel) {
      _uploadCardSentinel = document.createElement('div');
      _uploadCardSentinel.id = 'uploadCardSentinel';
      _uploadCardSentinel.style.display = 'none';
      card.parentNode.insertBefore(_uploadCardSentinel, card);
    }
  
    // Move the actual card node into the modal (keeps all existing listeners)
    body.appendChild(card);
  
    // Show modal
    modal.style.display = 'block';
  
    // Focus the chooser for quick keyboard flow
    setTimeout(() => {
      const chooseBtn = document.getElementById('customChooseBtn');
      if (chooseBtn) chooseBtn.focus();
    }, 50);
  }
  
  export function closeUploadModal() {
    const modal = document.getElementById('uploadModal');
    const card  = document.getElementById('uploadCard');
  
    if (_uploadCardSentinel && _uploadCardSentinel.parentNode && card) {
      _uploadCardSentinel.parentNode.insertBefore(card, _uploadCardSentinel);
    }
    if (modal) modal.style.display = 'none';
  }

document.addEventListener("DOMContentLoaded", function () {
  const cancelDelete = document.getElementById("cancelDeleteFiles");
  if (cancelDelete) {
    cancelDelete.addEventListener("click", function () {
      document.getElementById("deleteFilesModal").style.display = "none";
      window.filesToDelete = [];
    });
  }

  const confirmDelete = document.getElementById("confirmDeleteFiles");
  if (confirmDelete) {
    confirmDelete.setAttribute("data-default", "");
    const deleteMsg = document.getElementById("deleteFilesMessage");
    const setDeletingState = (busy) => {
      if (busy) {
        confirmDelete.dataset.originalLabel = confirmDelete.innerHTML;
        confirmDelete.innerHTML =
          '<span class="material-icons spinning" style="font-size:16px; vertical-align:middle; margin-right:6px;">autorenew</span>Deleting...';
        confirmDelete.disabled = true;
        if (cancelDelete) cancelDelete.disabled = true;
        if (deleteMsg) {
          deleteMsg.dataset.originalText = deleteMsg.textContent || "";
          deleteMsg.textContent = "Deleting...";
        }
        return;
      }
      confirmDelete.innerHTML = confirmDelete.dataset.originalLabel || confirmDelete.innerHTML;
      confirmDelete.disabled = false;
      if (cancelDelete) cancelDelete.disabled = false;
      if (deleteMsg && deleteMsg.dataset.originalText) {
        deleteMsg.textContent = deleteMsg.dataset.originalText;
        delete deleteMsg.dataset.originalText;
      }
      delete confirmDelete.dataset.originalLabel;
    };
    confirmDelete.addEventListener("click", function () {
      if (confirmDelete.dataset.busy === "1") return;
      confirmDelete.dataset.busy = "1";
      setDeletingState(true);
      const selection = Array.isArray(window.filesToDelete) ? window.filesToDelete : [];
      const fileCount = selection.length;
      const totals = getTransferTotalsForNames(selection);
      const progress = startTransferProgress({
        action: 'Deleting',
        itemCount: totals.itemCount,
        itemLabel: totals.itemCount === 1 ? 'file' : 'files',
        totalBytes: totals.totalBytes,
        bytesKnown: totals.bytesKnown,
        source: window.currentFolder || 'root',
        destination: 'Trash'
      });
      let ok = false;
      let errMsg = '';
      const slowTimer = setTimeout(() => {
        showToast(
          fileCount > 0
            ? `Deleting ${fileCount} file${fileCount === 1 ? '' : 's'}...`
            : 'Deleting files...',
          'info'
        );
      }, 2500);
      fetch("/api/file/deleteFiles.php", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": window.csrfToken
        },
        body: JSON.stringify({ folder: window.currentFolder, files: window.filesToDelete })
      })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            ok = true;
            showToast(t('delete_files_success'), 'success');
            // deleteFiles.php moves items into Trash; update the recycle bin indicator immediately.
            updateRecycleBinState(true);
            loadFileList(window.currentFolder);
            refreshFolderIcon(window.currentFolder);
          } else {
            ok = false;
            errMsg = data.error || t('delete_files_error_default');
            showToast(t('delete_files_error', { error: errMsg }), 'error');
          }
        })
        .catch(error => {
          ok = false;
          errMsg = error && error.message ? error.message : t('delete_files_error_default');
          console.error("Error deleting files:", error);
        })
        .finally(() => {
          clearTimeout(slowTimer);
          setDeletingState(false);
          delete confirmDelete.dataset.busy;
          document.getElementById("deleteFilesModal").style.display = "none";
          window.filesToDelete = [];
          finishTransferProgress(progress, { ok, error: errMsg });
        });
    });
  }
});

export function handleDownloadMultiSelected(e) {
  if (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  const files = getSelectedFileObjects();
  if (!files.length) {
    showToast(t('no_files_selected_for_download'), 'warning');
    return;
  }

  const limit = getDownloadLimit();
  const caps = window.currentFolderCaps || null;
  const inEncryptedFolder = !!(caps && caps.encryption && caps.encryption.encrypted);

  // In encrypted folders, archive creation is disabled. Allow plain downloads up to the limit only.
  if (inEncryptedFolder) {
    if (files.length > limit) {
      showToast(t('encrypted_download_limit', { limit }), 'warning');
      return;
    }
    downloadSelectedFilesIndividually(files);
    return;
  }

  // Normal behavior: download individually up to the limit; archive for more than the limit.
  if (files.length > limit) {
    handleDownloadZipSelected(e || new Event("click"));
    return;
  }

  downloadSelectedFilesIndividually(files);
}

attachEnterKeyListener("downloadZipModal", "confirmDownloadZip");
export function handleDownloadZipSelected(e) {
  if (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  const caps = window.currentFolderCaps || null;
  const inEncryptedFolder = !!(caps && caps.encryption && caps.encryption.encrypted);
  if (inEncryptedFolder) {
    const files = getSelectedFileObjects();
    const limit = getDownloadLimit();
    if (files.length > limit) {
      showToast(t('encrypted_download_limit', { limit }), 'warning');
      return;
    }
    // If we got here via an old/hidden archive action, fall back to plain download.
    downloadSelectedFilesIndividually(files);
    return;
  }

  const checkboxes = getActiveSelectedFileCheckboxes();
  if (checkboxes.length === 0) {
    showToast(t('no_files_selected_for_download'), 'warning');
    return;
  }
  window.filesToDownload = Array.from(checkboxes).map(chk => chk.value);
  document.getElementById("downloadZipModal").style.display = "block";
  syncArchiveFormatSelect();
  updateArchiveNamePlaceholder(getSelectedArchiveFormat());
  setTimeout(() => {
    const input = document.getElementById("zipFileNameInput");
    input.focus();
  }, 100);
};

export function handleCreateFileSelected(e) {
  e.preventDefault(); e.stopImmediatePropagation();
  const modal = document.getElementById('createFileModal');
  modal.style.display = 'block';
  setTimeout(() => {
    const inp = document.getElementById('createFileNameInput');
    if (inp) inp.focus();
  }, 100);
}

/**
 * Open the “New File” modal
 */
export function openCreateFileModal() {
  const modal = document.getElementById('createFileModal');
  const input = document.getElementById('createFileNameInput');
  if (!modal || !input) {
    console.error('Create-file modal or input not found');
    return;
  }
  input.value = '';
  modal.style.display = 'block';
  setTimeout(() => input.focus(), 0);
}


export async function handleCreateFile(e) {
  e.preventDefault();
  const input = document.getElementById('createFileNameInput');
  if (!input) return console.error('Create-file input missing');
  const name = input.value.trim();
  if (!name) {
    showToast(t('newfile_placeholder'), 'warning');  // or a more explicit error
    return;
  }

  const confirmBtn = document.getElementById('confirmCreateFile');
  const cancelBtn = document.getElementById('cancelCreateFile');
  const setCreatingState = (busy) => {
    if (!confirmBtn) return;
    if (busy) {
      if (!confirmBtn.dataset.originalLabel) {
        confirmBtn.dataset.originalLabel = confirmBtn.innerHTML;
      }
      confirmBtn.innerHTML =
        '<span class="material-icons spinning" style="font-size:16px; vertical-align:middle; margin-right:6px;">autorenew</span>Creating...';
      confirmBtn.disabled = true;
      if (cancelBtn) cancelBtn.disabled = true;
      return;
    }
    if (confirmBtn.dataset.originalLabel) {
      confirmBtn.innerHTML = confirmBtn.dataset.originalLabel;
      delete confirmBtn.dataset.originalLabel;
    }
    confirmBtn.disabled = false;
    if (cancelBtn) cancelBtn.disabled = false;
  };
  if (confirmBtn && confirmBtn.dataset.busy === "1") return;
  if (confirmBtn) confirmBtn.dataset.busy = "1";
  setCreatingState(true);

  const folder = window.currentFolder || 'root';
  try {
    const res = await fetch('/api/file/createFile.php', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': window.csrfToken
      },
      // ⚠️ must send `name`, not `filename`
      body: JSON.stringify({ folder, name })
    });
    const raw = await res.text();
    let js = null;
    if (raw) {
      try { js = JSON.parse(raw); } catch (e) { js = null; }
    }
    if (!res.ok || !js || !js.success) {
      const text = stripHtmlToText(raw);
      const msg = (js && (js.error || js.message)) || text || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    showToast(t('file_created'), 'success');
    loadFileList(folder);
    refreshFolderIcon(folder);
  } catch (err) {
    showToast(err.message || t('error_creating_file'), 'error');
  } finally {
    if (confirmBtn) delete confirmBtn.dataset.busy;
    setCreatingState(false);
    document.getElementById('createFileModal').style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const cancel = document.getElementById('cancelCreateFile');
  const confirm = document.getElementById('confirmCreateFile');
  if (cancel && !cancel.__wiredCreateFile) {
    cancel.__wiredCreateFile = true;
    cancel.addEventListener('click', () => document.getElementById('createFileModal').style.display = 'none');
  }
  if (confirm && !confirm.__wiredCreateFile) {
    confirm.__wiredCreateFile = true;
    confirm.addEventListener('click', handleCreateFile);
  }
});

export function openDownloadModal(fileName, folder) {
  // Store file details globally for the download confirmation function.
  window.singleFileToDownload = fileName;
  window.currentFolder = folder || "root";

  // Optionally pre-fill the file name input in the modal.
  const input = document.getElementById("downloadFileNameInput");
  if (input) {
    input.value = fileName; // Use file name as-is (or modify if desired)
  }

  // Show the single file download modal (a new modal element).
  document.getElementById("downloadFileModal").style.display = "block";

  // Optionally focus the input after a short delay.
  setTimeout(() => {
    if (input) input.focus();
  }, 100);
}

export function confirmSingleDownload() {
  // 1) Get and validate the filename
  const input = document.getElementById("downloadFileNameInput");
  const fileName = input.value.trim();
  if (!fileName) {
    showToast(t('download_file_name_required'), 'warning');
    return;
  }

  // 2) Hide the download-name modal
  document.getElementById("downloadFileModal").style.display = "none";

  // 3) Build the direct download URL
  const folder = window.currentFolder || "root";
  let downloadURL = withBase("/api/file/download.php")
    + "?folder=" + encodeURIComponent(folder)
    + "&file=" + encodeURIComponent(window.singleFileToDownload);
  const sourceId = getActiveSourceId();
  if (sourceId) {
    downloadURL += "&sourceId=" + encodeURIComponent(sourceId);
  }

  // 4) Trigger native browser download
  const a = document.createElement("a");
  a.href = downloadURL;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // 5) Notify the user
  showToast(t('download_started'), 'info');
}

export function handleExtractZipSelected(e) {
  if (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  const checkboxes = getActiveSelectedFileCheckboxes();
  if (!checkboxes.length) {
    showToast(t('no_files_selected'), 'warning');
    return;
  }
  const archiveFiles = Array.from(checkboxes)
    .map(chk => chk.value)
    .filter(name => isArchiveFileName(name));
  if (!archiveFiles.length) {
    showToast(t('no_archive_files_selected'), 'warning');
    return;
  }

  // Prepare and show the spinner-only modal
  const modal = document.getElementById("downloadProgressModal");
  const titleEl = document.getElementById("downloadProgressTitle");
  const spinner = modal.querySelector(".download-spinner");
  const progressBar = document.getElementById("downloadProgressBar");
  const progressPct = document.getElementById("downloadProgressPercent");

  if (titleEl) titleEl.textContent = t('extracting_files');
  if (spinner) spinner.style.display = "inline-block";
  if (progressBar) progressBar.style.display = "none";
  if (progressPct) progressPct.style.display = "none";

  modal.style.display = "block";

  fetch("/api/file/extractZip.php", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": window.csrfToken
    },
    body: JSON.stringify({
      folder: window.currentFolder || "root",
      files: archiveFiles
    })
  })
    .then(response => response.json())
    .then(data => {
      modal.style.display = "none";
      const extracted = Array.isArray(data.extractedFiles) ? data.extractedFiles : [];
      const extractedMsg = extracted.length
        ? t('extract_result_files', { files: extracted.join(", ") })
        : t('extract_result_default');
      const warning = (data && typeof data.warning === "string" && data.warning.trim()) ? data.warning.trim() : "";

      if (data.success) {
        if (warning) {
          showToast(t('extract_result_warning', { result: extractedMsg, warning }), 'warning');
        } else {
          showToast(extractedMsg, 'success');
        }
      } else if (extracted.length) {
        const warnMsg = warning || data.error || t('extract_error_some_failed');
        showToast(t('extract_result_warning', { result: extractedMsg, warning: warnMsg }), 'warning');
      } else {
        const errMsg = warning || data.error || t('unknown_error');
        showToast(t('extract_error_prefix', { error: errMsg }), 'error');
      }
      loadFileList(window.currentFolder);
    })
    .catch(error => {
      modal.style.display = "none";
      console.error("Error extracting archive files:", error);
      showToast(t('extract_error_generic'), 'error');
    });
}

document.addEventListener("DOMContentLoaded", () => {
  const zipNameModal = document.getElementById("downloadZipModal");
  const progressModal = document.getElementById("downloadProgressModal");
  const cancelZipBtn = document.getElementById("cancelDownloadZip");
  const confirmZipBtn = document.getElementById("confirmDownloadZip");
  const formatSelect = document.getElementById("archiveFormatSelect");
  const cancelCreate = document.getElementById('cancelCreateFile');

  if (cancelCreate && !cancelCreate.__wiredCreateFile) {
    cancelCreate.__wiredCreateFile = true;
    cancelCreate.addEventListener('click', () => {
      document.getElementById('createFileModal').style.display = 'none';
    });
  }

  const confirmCreate = document.getElementById('confirmCreateFile');
  if (confirmCreate && !confirmCreate.__wiredCreateFile) {
    confirmCreate.__wiredCreateFile = true;
    confirmCreate.addEventListener('click', handleCreateFile);
  }
  if (confirmCreate) {
    attachEnterKeyListener('createFileModal', 'confirmCreateFile');
  }

  // 1) Cancel button hides the name modal
  if (cancelZipBtn) {
    cancelZipBtn.addEventListener("click", () => {
      zipNameModal.style.display = "none";
    });
  }

  if (formatSelect) {
    syncArchiveFormatSelect();
    formatSelect.addEventListener("change", () => {
      updateArchiveNamePlaceholder(getSelectedArchiveFormat());
    });
  }

  // 2) Confirm button kicks off the archive+download
  if (confirmZipBtn) {
    confirmZipBtn.setAttribute("data-default", "");
    confirmZipBtn.addEventListener("click", async () => {
      let archiveName = '';
      let ui = null;
      try {
        // a) Validate archive filename
        const format = getSelectedArchiveFormat();
        const rawName = document.getElementById("zipFileNameInput").value.trim();
        if (!rawName) { showToast(t('archive_name_required'), 'warning'); return; }
        archiveName = normalizeArchiveName(rawName, format);

        // b) Hide the name‐input modal, show the progress modal
        zipNameModal.style.display = "none";
        progressModal.style.display = "block";

        // c) Title text (optional)
        const titleEl = document.getElementById("downloadProgressTitle");
        if (titleEl) titleEl.textContent = `Preparing ${archiveName}…`;

        // d) Queue the job
        const res = await fetch("/api/file/downloadZip.php", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": window.csrfToken },
          body: JSON.stringify({ folder: window.currentFolder || "root", files: window.filesToDownload, format })
        });
        const jsr = await res.json().catch(() => ({}));
        if (!res.ok || !jsr.ok) {
          const msg = (jsr && jsr.error) ? jsr.error : `Status ${res.status}`;
          throw new Error(msg);
        }
        const statusUrl = jsr.statusUrl;
        const downloadUrl = jsr.downloadUrl + "&name=" + encodeURIComponent(archiveName);

        // Ensure a progress UI exists in the modal
        function ensureZipProgressUI() {
        const modalEl = document.getElementById("downloadProgressModal");
        if (!modalEl) {
          // really shouldn't happen, but fall back to body
          console.warn("downloadProgressModal not found; falling back to document.body");
        }
        // Prefer a dedicated content node inside the modal
        let host =
          (modalEl && modalEl.querySelector("#downloadProgressContent")) ||
          (modalEl && modalEl.querySelector(".modal-body")) ||
          (modalEl && modalEl.querySelector(".rise-modal-body")) ||
          (modalEl && modalEl.querySelector(".modal-content")) ||
          (modalEl && modalEl.querySelector(".content")) ||
          null;

        // If no suitable container, create one inside the modal
        if (!host) {
          host = document.createElement("div");
          host.id = "downloadProgressContent";
          (modalEl || document.body).appendChild(host);
        }

        // Helper: ensure/move an element with given id into host
        function ensureInHost(id, tag, init) {
          let el = document.getElementById(id);
          if (el && el.parentElement !== host) host.appendChild(el); // move if it exists elsewhere
          if (!el) {
            el = document.createElement(tag);
            el.id = id;
            if (typeof init === "function") init(el);
            host.appendChild(el);
          }
          return el;
        }

        // Title
        const title = ensureInHost("downloadProgressTitle", "div", (el) => {
          el.style.marginBottom = "8px";
          el.textContent = "Preparing…";
        });

        // Progress bar (native <progress>)
        const bar = (function () {
          let el = document.getElementById("downloadProgressBar");
          if (el && el.parentElement !== host) host.appendChild(el); // move into modal
          if (!el) {
            el = document.createElement("progress");
            el.id = "downloadProgressBar";
            host.appendChild(el);
          }
          el.max = 100;
          el.value = 0;
          el.style.display = "";     // override any inline display:none
          el.style.width = "100%";
          el.style.height = "1.1em";
          return el;
        })();

        // Text line
        const text = ensureInHost("downloadProgressText", "div", (el) => {
          el.style.marginTop = "8px";
          el.style.fontSize = "0.9rem";
          el.style.whiteSpace = "nowrap";
          el.style.overflow = "hidden";
          el.style.textOverflow = "ellipsis";
        });

        // Optional spinner hider
        const hideSpinner = () => {
          const sp = document.getElementById("downloadSpinner");
          if (sp) sp.style.display = "none";
        };

        return { bar, text, title, hideSpinner };
      }

      function humanBytes(n) {
        if (!Number.isFinite(n) || n < 0) return "";
        const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0, x = n;
        while (x >= 1024 && i < u.length - 1) { x /= 1024; i++; }
        return x.toFixed(x >= 10 || i === 0 ? 0 : 1) + " " + u[i];
      }
      function mmss(sec) {
        sec = Math.max(0, sec | 0);
        const m = (sec / 60) | 0, s = sec % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
      }

        ui = ensureZipProgressUI();
        const t0 = Date.now();

        // e) Poll until ready
        while (true) {
          await new Promise(r => setTimeout(r, 1200));
          const s = await fetch(`${statusUrl}&_=${Date.now()}`, {
            credentials: "include", cache: "no-store",
          }).then(r => r.json());

          if (s.error) throw new Error(s.error);
          if (ui.title) ui.title.textContent = `Preparing ${archiveName}…`;

          // --- RENDER PROGRESS ---
          if (s.status === "queued" && ui.text) {
            ui.text.textContent = "Queued… starting worker";
          } else if (typeof s.pct === "number" && ui.bar && ui.text) {
            if ((s.phase !== 'finalizing') && (s.pct < 99)) {
              ui.hideSpinner && ui.hideSpinner();
              const filesDone = s.filesDone ?? 0;
              const filesTotal = s.filesTotal ?? 0;
              const bytesDone = s.bytesDone ?? 0;
              const bytesTotal = s.bytesTotal ?? 0;

              // Determinate 0–98% while enumerating
              const pct = Math.max(0, Math.min(98, s.pct | 0));
              if (!ui.bar.hasAttribute("value")) ui.bar.value = 0;
              ui.bar.value = pct;
              ui.text.textContent =
                `${pct}% — ${filesDone}/${filesTotal} files, ${humanBytes(bytesDone)} / ${humanBytes(bytesTotal)}`;
            } else {
              // FINALIZING: keep progress at 100% and show timer + selected totals
              if (!ui.bar.hasAttribute("value")) ui.bar.value = 100;
              ui.bar.value = 100; // lock at 100 during finalizing
              const since = s.finalizeAt ? Math.max(0, (Date.now() / 1000 | 0) - (s.finalizeAt | 0)) : 0;
              const selF = s.selectedFiles ?? s.filesTotal ?? 0;
              const selB = s.selectedBytes ?? s.bytesTotal ?? 0;
              ui.text.textContent = `Finalizing… ${mmss(since)} — ${selF} file${selF === 1 ? '' : 's'}, ~${humanBytes(selB)}`;
            }
          } else if (ui.text) {
            ui.text.textContent = "Still preparing…";
          }
          // --- /RENDER ---

          if (s.ready) {
            // Snap to 100 and close modal just before download
            if (ui.bar) { ui.bar.max = 100; ui.bar.value = 100; }
            progressModal.style.display = "none";
            await new Promise(r => setTimeout(r, 0));
            break;
          }
          if (Date.now() - t0 > 15 * 60 * 1000) throw new Error("Timed out preparing archive");
        }

        // f) Trigger download
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = archiveName;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        a.remove();

        // g) Reset for next time
        if (ui.bar) ui.bar.value = 0;
        if (ui.text) ui.text.textContent = "";
        if (Array.isArray(window.filesToDownload)) window.filesToDownload = [];
      } catch (err) {
        const msg = (err && err.message) ? err.message : t('archive_prepare_failed');
        progressModal.style.display = "none";
        if (ui && ui.bar) ui.bar.value = 0;
        if (ui && ui.text) ui.text.textContent = "";
        showToast(msg, 'error');
      }
    });
  }
});

export function handleCopySelected(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  const checkboxes = getActiveSelectedFileCheckboxes();
  if (checkboxes.length === 0) {
    showToast(t('no_files_selected_for_copy'), 5000, 'warning');
    return;
  }
  window.filesToCopy = Array.from(checkboxes).map(chk => chk.value);
  document.getElementById("copyFilesModal").style.display = "block";
  const target = getOtherPaneTarget();
  initCopyMoveSourceSelect('copy', target.folder, target.sourceId);
}

export async function loadCopyMoveFolderListForModal(dropdownId, preferredFolder = "", sourceId = "") {
  const folderSelect = document.getElementById(dropdownId);
  if (!folderSelect) return;
  folderSelect.innerHTML = "";

  if (window.userFolderOnly) {
    const username = localStorage.getItem("username") || "root";
    try {
      const url = withBase("/api/folder/getFolderList.php")
        + "?restricted=1&counts=0"
        + (sourceId ? `&sourceId=${encodeURIComponent(sourceId)}` : "");
      const response = await fetch(url);
      let folders = await response.json();
      if (Array.isArray(folders) && folders.length && typeof folders[0] === "object" && folders[0].folder) {
        folders = folders.map(item => item.folder);
      }
      folders = folders.filter(folder =>
        folder.toLowerCase() !== "trash" &&
        (folder === username || folder.indexOf(username + "/") === 0)
      );

      const rootOption = document.createElement("option");
      rootOption.value = username;
      rootOption.textContent = formatFolderName(username);
      folderSelect.appendChild(rootOption);

      folders.forEach(folder => {
        if (folder !== username) {
          const option = document.createElement("option");
          option.value = folder;
          option.textContent = formatFolderName(folder);
          folderSelect.appendChild(option);
        }
      });
      selectPreferredFolderOption(folderSelect, preferredFolder);
    } catch (error) {
      console.error("Error loading folder list for modal:", error);
    }
    return;
  }

  try {
    const url = withBase("/api/folder/getFolderList.php")
      + "?counts=0"
      + (sourceId ? `&sourceId=${encodeURIComponent(sourceId)}` : "");
    const response = await fetch(url);
    let folders = await response.json();
    if (Array.isArray(folders) && folders.length && typeof folders[0] === "object" && folders[0].folder) {
      folders = folders.map(item => item.folder);
    }
    folders = folders.filter(folder => folder !== "root" && folder.toLowerCase() !== "trash");

    const rootOption = document.createElement("option");
    rootOption.value = "root";
    rootOption.textContent = getRootLabel(sourceId);
    folderSelect.appendChild(rootOption);

    if (Array.isArray(folders) && folders.length > 0) {
      folders.forEach(folder => {
        const option = document.createElement("option");
        option.value = folder;
        option.textContent = folder;
        folderSelect.appendChild(option);
      });
    }
    selectPreferredFolderOption(folderSelect, preferredFolder);
  } catch (error) {
    console.error("Error loading folder list for modal:", error);
  }
}

export function handleMoveSelected(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  const checkboxes = getActiveSelectedFileCheckboxes();
  if (checkboxes.length === 0) {
    showToast(t('no_files_selected_for_move'), 'warning');
    return;
  }
  window.filesToMove = Array.from(checkboxes).map(chk => chk.value);
  document.getElementById("moveFilesModal").style.display = "block";
  const target = getOtherPaneTarget();
  initCopyMoveSourceSelect('move', target.folder, target.sourceId);
}

document.addEventListener("DOMContentLoaded", function () {
  const cancelCopy = document.getElementById("cancelCopyFiles");
  if (cancelCopy) {
    cancelCopy.addEventListener("click", function () {
      document.getElementById("copyFilesModal").style.display = "none";
      window.filesToCopy = [];
    });
  }
  const confirmCopy = document.getElementById("confirmCopyFiles");
  if (confirmCopy) {
    confirmCopy.setAttribute("data-default", "");
    confirmCopy.addEventListener("click", function () {
      const targetFolder = document.getElementById("copyTargetFolder").value;
      if (!targetFolder) {
        showToast(t('copy_target_folder_required'), 5000, 'warning');
        return;
      }
      const sourceId = getActiveSourceId();
      const destSourceId = document.getElementById("copyTargetSource")?.value || sourceId;
      if (targetFolder === window.currentFolder && sourceId === destSourceId) {
        showToast(t('copy_same_folder_error'), 'error');
        return;
      }
      const selection = Array.isArray(window.filesToCopy) ? window.filesToCopy : [];
      const totals = getTransferTotalsForNames(selection);
      const progress = startTransferProgress({
        action: 'Copying',
        itemCount: totals.itemCount,
        itemLabel: totals.itemCount === 1 ? 'file' : 'files',
        totalBytes: totals.totalBytes,
        bytesKnown: totals.bytesKnown,
        source: window.currentFolder || 'root',
        destination: targetFolder
      });
      let ok = false;
      let errMsg = '';
      fetch("/api/file/copyFiles.php", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": window.csrfToken
        },
        body: JSON.stringify({
          source: window.currentFolder,
          files: window.filesToCopy,
          destination: targetFolder,
          sourceId,
          destSourceId
        })
      })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            ok = true;
            showToast(t('copy_files_success'), 5000, 'success');
            loadFileList(window.currentFolder);
            if (!destSourceId || destSourceId === sourceId) {
              refreshFolderIcon(targetFolder);
            }
            markPaneNeedsReloadForFolder(targetFolder, destSourceId);
          } else {
            ok = false;
            errMsg = data.error || t('copy_files_error_default');
            showToast(t('copy_files_error', { error: errMsg }), 5000, 'error');
          }
        })
        .catch(error => {
          ok = false;
          errMsg = error && error.message ? error.message : t('copy_files_error_default');
          console.error("Error copying files:", error);
        })
        .finally(() => {
          finishTransferProgress(progress, { ok, error: errMsg });
          document.getElementById("copyFilesModal").style.display = "none";
          window.filesToCopy = [];
        });
    });
  }
});

document.addEventListener("DOMContentLoaded", function () {
  const cancelMove = document.getElementById("cancelMoveFiles");
  if (cancelMove) {
    cancelMove.addEventListener("click", function () {
      document.getElementById("moveFilesModal").style.display = "none";
      window.filesToMove = [];
    });
  }
  const confirmMove = document.getElementById("confirmMoveFiles");
  if (confirmMove) {
    confirmMove.setAttribute("data-default", "");
    confirmMove.addEventListener("click", function () {
      const targetFolder = document.getElementById("moveTargetFolder").value;
      if (!targetFolder) {
        showToast(t('move_target_folder_required'), 'warning');
        return;
      }
      const sourceId = getActiveSourceId();
      const destSourceId = document.getElementById("moveTargetSource")?.value || sourceId;
      if (targetFolder === window.currentFolder && sourceId === destSourceId) {
        showToast(t('move_same_folder_error'), 'error');
        return;
      }
      const selection = Array.isArray(window.filesToMove) ? window.filesToMove : [];
      const totals = getTransferTotalsForNames(selection);
      const progress = startTransferProgress({
        action: 'Moving',
        itemCount: totals.itemCount,
        itemLabel: totals.itemCount === 1 ? 'file' : 'files',
        totalBytes: totals.totalBytes,
        bytesKnown: totals.bytesKnown,
        source: window.currentFolder || 'root',
        destination: targetFolder
      });
      let ok = false;
      let errMsg = '';
      fetch("/api/file/moveFiles.php", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": window.csrfToken
        },
        body: JSON.stringify({
          source: window.currentFolder,
          files: window.filesToMove,
          destination: targetFolder,
          sourceId,
          destSourceId
        })
      })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            ok = true;
            showToast(t('move_files_success'), 'success');
            loadFileList(window.currentFolder);
            if (!destSourceId || destSourceId === sourceId) {
              refreshFolderIcon(targetFolder);
              refreshFolderIcon(window.currentFolder);
            } else {
              refreshFolderIcon(window.currentFolder);
            }
            markPaneNeedsReloadForFolder(targetFolder, destSourceId);
            markPaneNeedsReloadForFolder(window.currentFolder, sourceId);
          } else {
            ok = false;
            errMsg = data.error || t('move_files_error_default');
            showToast(t('move_files_error', { error: errMsg }), 'error');
          }
        })
        .catch(error => {
          ok = false;
          errMsg = error && error.message ? error.message : t('move_files_error_default');
          console.error("Error moving files:", error);
        })
        .finally(() => {
          finishTransferProgress(progress, { ok, error: errMsg });
          document.getElementById("moveFilesModal").style.display = "none";
          window.filesToMove = [];
        });
    });
  }
});

export function handleRenameSelected(e) {
  if (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  const files = getSelectedFileObjects();
  if (files.length !== 1) {
    showToast(t("select_single_file") || "Select a single file to rename.", 'warning');
    return;
  }
  const file = files[0];
  const folder = file.folder || window.currentFolder || "root";

  // Prefer inline rename in table view when we can resolve a row.
  try {
    if (window.viewMode === "table" && typeof startInlineRenameFromContext === "function") {
      const checked = getActiveSelectedFileCheckboxes();
      const row = checked.length ? checked[0].closest("tr") : null;
      if (row && startInlineRenameFromContext(file, row)) {
        return;
      }
    }
  } catch (err) { /* ignore */ }

  renameFile(file.name, folder);
}

export function handleShareSelected(e) {
  if (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  const files = getSelectedFileObjects();
  if (files.length !== 1) {
    showToast(t("select_single_file") || "Select one file to share.", 'warning');
    return;
  }
  const fileObj = files[0];
  const folder = fileObj.folder || window.currentFolder || "root";

  import('./filePreview.js?v={{APP_QVER}}')
    .then(mod => mod.openShareModal(fileObj, folder))
    .catch(err => console.error("Failed to open share modal", err));
}

export async function handleToolbarMenuOpen(e) {
  if (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  const btn = e?.currentTarget || document.getElementById("toolbarMenuBtn");
  const rect = btn ? btn.getBoundingClientRect() : null;
  const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const y = rect ? rect.bottom + 6 : 60;
  const target = btn || document.getElementById("fileList") || document.body;

  try {
    const mod = await import('./fileMenu.js?v={{APP_QVER}}');
    const fakeEvent = {
      preventDefault() {},
      target,
      clientX: x,
      clientY: y
    };
    mod.fileListContextMenuHandler(fakeEvent);
  } catch (err) {
    console.error("Could not open toolbar menu", err);
  }
}

// Fallback: wire the overflow menu once DOM is ready in case initFileActions
// has not yet run when the button is rendered.
document.addEventListener("DOMContentLoaded", () => {
  const toolbarBtn = document.getElementById("toolbarMenuBtn");
  if (toolbarBtn) {
    toolbarBtn.addEventListener("click", handleToolbarMenuOpen);
  }
});

export function renameFile(oldName, folder) {
  window.fileToRename = oldName;
  window.fileFolder = folder || window.currentFolder || "root";
  document.getElementById("newFileName").value = oldName;
  document.getElementById("renameFileModal").style.display = "block";
  setTimeout(() => {
    const input = document.getElementById("newFileName");
    input.focus();
    const lastDot = oldName.lastIndexOf('.');
    if (lastDot > 0) {
      input.setSelectionRange(0, lastDot);
    } else {
      input.select();
    }
  }, 100);
}

document.addEventListener("DOMContentLoaded", () => {
  const cancelBtn = document.getElementById("cancelRenameFile");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", function () {
      document.getElementById("renameFileModal").style.display = "none";
      document.getElementById("newFileName").value = "";
    });
  }

  const submitBtn = document.getElementById("submitRenameFile");
  if (submitBtn) {
    submitBtn.setAttribute("data-default", "");
    submitBtn.addEventListener("click", function () {
      const newName = document.getElementById("newFileName").value.trim();
      if (!newName || newName === window.fileToRename) {
        document.getElementById("renameFileModal").style.display = "none";
        return;
      }
      const folderUsed = window.fileFolder;
      fetch("/api/file/renameFile.php", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": window.csrfToken
        },
        body: JSON.stringify({ folder: folderUsed, oldName: window.fileToRename, newName: newName })
      })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            showToast(t('rename_file_success'), 'success');
            loadFileList(folderUsed);
          } else {
            const errMsg = data.error || t('unknown_error');
            showToast(t('rename_file_error', { error: errMsg }), 'error');
          }
        })
        .catch(error => {
          console.error("Error renaming file:", error);
          showToast(t('rename_file_error_generic'), 'error');
        })
        .finally(() => {
          document.getElementById("renameFileModal").style.display = "none";
          document.getElementById("newFileName").value = "";
        });
    });
  }
});

// Expose initFileActions so it can be called from fileManager.js
export function initFileActions() {
  portalFileModalsToBody();
  const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
  if (deleteSelectedBtn) {
    deleteSelectedBtn.replaceWith(deleteSelectedBtn.cloneNode(true));
    document.getElementById("deleteSelectedBtn").addEventListener("click", handleDeleteSelected);
  }
  const copySelectedBtn = document.getElementById("copySelectedBtn");
  if (copySelectedBtn) {
    copySelectedBtn.replaceWith(copySelectedBtn.cloneNode(true));
    document.getElementById("copySelectedBtn").addEventListener("click", handleCopySelected);
  }
  const moveSelectedBtn = document.getElementById("moveSelectedBtn");
  if (moveSelectedBtn) {
    moveSelectedBtn.replaceWith(moveSelectedBtn.cloneNode(true));
    document.getElementById("moveSelectedBtn").addEventListener("click", handleMoveSelected);
  }
  const downloadZipBtn = document.getElementById("downloadZipBtn");
  if (downloadZipBtn) {
    downloadZipBtn.replaceWith(downloadZipBtn.cloneNode(true));
    document.getElementById("downloadZipBtn").addEventListener("click", handleDownloadMultiSelected);
  }
  const extractZipBtn = document.getElementById("extractZipBtn");
  if (extractZipBtn) {
    extractZipBtn.replaceWith(extractZipBtn.cloneNode(true));
    document.getElementById("extractZipBtn").addEventListener("click", handleExtractZipSelected);
  }
  const renameSelectedBtn = document.getElementById("renameSelectedBtn");
  if (renameSelectedBtn) {
    renameSelectedBtn.replaceWith(renameSelectedBtn.cloneNode(true));
    document.getElementById("renameSelectedBtn").addEventListener("click", handleRenameSelected);
  }
  const shareSelectedBtn = document.getElementById("shareSelectedBtn");
  if (shareSelectedBtn) {
    shareSelectedBtn.replaceWith(shareSelectedBtn.cloneNode(true));
    document.getElementById("shareSelectedBtn").addEventListener("click", handleShareSelected);
  }
  const toolbarMenuBtn = document.getElementById("toolbarMenuBtn");
  if (toolbarMenuBtn) {
    toolbarMenuBtn.replaceWith(toolbarMenuBtn.cloneNode(true));
    document.getElementById("toolbarMenuBtn").addEventListener("click", handleToolbarMenuOpen);
  }
}


// Hook up the single‐file download modal buttons
document.addEventListener("DOMContentLoaded", () => {
  const cancelDownloadFileBtn = document.getElementById("cancelDownloadFile");
  if (cancelDownloadFileBtn) {
    cancelDownloadFileBtn.addEventListener("click", () => {
      document.getElementById("downloadFileModal").style.display = "none";
    });
  }

  const confirmSingleDownloadBtn = document.getElementById("confirmSingleDownloadButton");
  if (confirmSingleDownloadBtn) {
    confirmSingleDownloadBtn.addEventListener("click", confirmSingleDownload);
  }

  // Make Enter also confirm the download
  attachEnterKeyListener("downloadFileModal", "confirmSingleDownloadButton");
});

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('createBtn');
  const menu = document.getElementById('createMenu');
  const fileOpt = document.getElementById('createFileOption');
  const folderOpt = document.getElementById('createFolderOption');
  const uploadOpt = document.getElementById('uploadOption'); // NEW

  // Toggle dropdown on click
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
  });

  // Create File
  fileOpt.addEventListener('click', () => {
    menu.style.display = 'none';
    openCreateFileModal();  // your existing function
  });

  // Create Folder
  folderOpt.addEventListener('click', () => {
    menu.style.display = 'none';
    document.getElementById('createFolderModal').style.display = 'block';
    document.getElementById('newFolderName').focus();
  });

  // Close if you click anywhere else
  document.addEventListener('click', () => {
    menu.style.display = 'none';
  });
  if (uploadOpt) {
    uploadOpt.addEventListener('click', () => {
      if (menu) menu.style.display = 'none';
      openUploadModal();
    });
  }

  // Close buttons / backdrop
  const upModal = document.getElementById('uploadModal');
  const closeX  = document.getElementById('closeUploadModal');

  if (closeX) closeX.addEventListener('click', closeUploadModal);

  // click outside content to close
  if (upModal) {
    upModal.addEventListener('click', (e) => {
      if (e.target === upModal) closeUploadModal();
    });
  }

  // ESC to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && upModal && upModal.style.display === 'block') {
      closeUploadModal();
    }
  });
});

window.renameFile = renameFile;
