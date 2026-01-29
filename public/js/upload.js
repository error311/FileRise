import { initFileActions } from './fileActions.js?v={{APP_QVER}}';
import { displayFilePreview } from './filePreview.js?v={{APP_QVER}}';
import { showToast, escapeHTML } from './domUtils.js?v={{APP_QVER}}';
import { refreshFolderIcon, refreshFolderChildren } from './folderManager.js?v={{APP_QVER}}';
import { loadFileList } from './fileListView.js?v={{APP_QVER}}';
import { t } from './i18n.js?v={{APP_QVER}}';
import { withBase } from './basePath.js?v={{APP_QVER}}';

const UPLOAD_URL = withBase('/api/upload/upload.php');
const RESUMABLE_TARGET = UPLOAD_URL;
const CHECK_EXISTING_URL = withBase('/api/upload/checkExisting.php');

function getActiveUploadSourceId() {
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

function getResumableChunkSizeBytes() {
  const cfg = window.__FR_SITE_CFG__ || window.siteConfig || {};
  const uploads = (cfg && typeof cfg === 'object') ? cfg.uploads : null;
  const raw = uploads ? uploads.resumableChunkMb : null;
  const num = parseFloat(raw);
  const mb = Number.isFinite(num) ? Math.min(100, Math.max(0.5, num)) : 1.5;
  return mb * 1024 * 1024;
}

// --- ClamAV scanning UI helpers ----------------------------------------

function isVirusScanLikelyEnabled() {
  try {
    if (
      window.__FR_FLAGS &&
      Object.prototype.hasOwnProperty.call(window.__FR_FLAGS, 'clamavScanUploads')
    ) {
      return !!window.__FR_FLAGS.clamavScanUploads;
    }

    // Fallbacks if you ever expose config globals directly
    const cfg =
      (window.appConfig)      ||
      (window.FR_CONFIG)      ||
      (window.__FR_CONFIG__)  ||
      (window.siteConfig)     ||
      null;

    return !!(cfg && cfg.clamav && cfg.clamav.scanUploads);
  } catch (e) {
    return false;
  }
}

let _virusScanNoticeDismissed = false;

function showVirusScanNotice() {
  if (!isVirusScanLikelyEnabled()) return;
  if (_virusScanNoticeDismissed) return;

  // If already visible, don't duplicate
  let existing = document.getElementById('frVirusScanNotice');
  if (existing) return;

  const box = document.createElement('div');
  box.id = 'frVirusScanNotice';
  box.className = 'fr-virus-notice card';

  // Minimal inline layout so we don't rely on extra CSS
  Object.assign(box.style, {
    position: 'fixed',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    maxWidth: '420px',
    width: 'calc(100% - 32px)', // nice on mobile too
    zIndex: '11080',
    padding: '16px 18px',
    borderRadius: '10px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
    backgroundColor: getComputedStyle(document.body).backgroundColor || '#fff',
    color: getComputedStyle(document.body).color || '#111',
  });

  box.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <div style="display:flex;align-items:center;gap:6px;flex:1;">
        <span class="material-icons" style="font-size:20px;flex-shrink:0;">shield</span>
        <div style="font-size:0.9rem;">
          <div style="font-weight:600;margin-bottom:2px;">
            ${escapeHTML(t ? t('clamav_scanning_title') || 'Scanning uploads for viruses…' : 'Scanning uploads for viruses…')}
          </div>
          <div style="font-size:0.8rem;opacity:0.8;">
            ${escapeHTML(t ? t('clamav_scanning_desc') || 'Uploads may take a little longer while antivirus scanning is enabled.' : 'Uploads may take a little longer while antivirus scanning is enabled.')}
          </div>
        </div>
      </div>
      <button type="button"
              id="frVirusScanNoticeClose"
              class="btn btn-sm btn-outline-secondary"
              style="flex-shrink:0;">
        ${escapeHTML(t ? t('close') || 'Close' : 'Close')}
      </button>
    </div>
    <div class="progress" style="height:6px;margin-top:8px;">
      <div class="progress-bar progress-bar-striped progress-bar-animated" style="width:100%;"></div>
    </div>
  `;

  document.body.appendChild(box);

  const closeBtn = box.querySelector('#frVirusScanNoticeClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      _virusScanNoticeDismissed = true; // don't nag again this session
      hideVirusScanNotice();
    });
  }
}

function hideVirusScanNotice() {
  const el = document.getElementById('frVirusScanNotice');
  if (el && el.parentNode) {
    el.parentNode.removeChild(el);
  }
}

// --- Lightweight tracking of in-progress resumable uploads (per user) ---
const RESUMABLE_DRAFTS_KEY = 'filr_resumable_drafts_v1';

function getCurrentUserKey() {
  // Try a few globals; fall back to browser profile
  const u =
    (window.currentUser && String(window.currentUser)) ||
    (window.appUser && String(window.appUser)) ||
    (window.username && String(window.username)) ||
    '';
  return u || 'anon';
}

function loadResumableDraftsAll() {
  try {
    const raw = localStorage.getItem(RESUMABLE_DRAFTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (e) {
    console.warn('Failed to read resumable drafts from localStorage', e);
    return {};
  }
}

function saveResumableDraftsAll(all) {
  try {
    localStorage.setItem(RESUMABLE_DRAFTS_KEY, JSON.stringify(all));
  } catch (e) {
    console.warn('Failed to persist resumable drafts to localStorage', e);
  }
}

// --- Single file-picker trigger guard (prevents multiple OS dialogs) ---
let _lastFilePickerOpen = 0;

function triggerFilePickerOnce() {
  const now = Date.now();
  // ignore any extra calls within 400ms of the last open
  if (now - _lastFilePickerOpen < 400) return;
  _lastFilePickerOpen = now;

  const fi = document.getElementById('file');
  if (fi) {
    fi.click();
  }
}

// Wire the "Choose files" button so it always uses the guarded trigger
function wireChooseButton() {
  const btn = document.getElementById('customChooseBtn');
  if (!btn || btn.__uploadBound) return;
  btn.__uploadBound = true;

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation(); // don't let it bubble to the drop-area click handler
    triggerFilePickerOnce();
  });
}

function wireFileInputChange(fileInput) {
  if (!fileInput || fileInput.__uploadChangeBound) return;
  fileInput.__uploadChangeBound = true;

  // For file picker, remove directory attributes so only files can be chosen.
  fileInput.removeAttribute("webkitdirectory");
  fileInput.removeAttribute("mozdirectory");
  fileInput.removeAttribute("directory");
  fileInput.setAttribute("multiple", "");

  fileInput.addEventListener("change", async function () {
    const files = Array.from(fileInput.files || []);
    if (!files.length) return;
  
    if (useResumable) {
      await queueResumableFiles(files);
    } else {
      // Non-resumable: normal XHR path, drag-and-drop etc.
      processFiles(files);
    }
  });
}

function setUploadButtonVisible(visible) {
  const btn = document.getElementById('uploadBtn');
  if (!btn) return;

  btn.style.display = visible ? 'block' : 'none';
  btn.disabled = !visible;
}

let _uploadRefreshTimer = null;
let _uploadRefreshFolder = '';

function scheduleUploadRefresh(folder, immediate = false) {
  const target = folder || window.currentFolder || 'root';
  _uploadRefreshFolder = target;
  if (_uploadRefreshTimer) {
    clearTimeout(_uploadRefreshTimer);
  }
  const delay = immediate ? 0 : 400;
  _uploadRefreshTimer = setTimeout(() => {
    _uploadRefreshTimer = null;
    const active = _uploadRefreshFolder || target;
    try { refreshFolderIcon(active); } catch (e) {}
    loadFileList(active);
  }, delay);
}

let _treeRefreshTimer = null;
let _treeRefreshFolder = '';

function getRelativePathForFile(file) {
  if (!file || typeof file !== 'object') return '';
  return (
    file.relativePath ||
    file.webkitRelativePath ||
    file.customRelativePath ||
    (file.file && (file.file.webkitRelativePath || file.file.customRelativePath)) ||
    ''
  );
}

function hasFolderPaths(files) {
  if (!Array.isArray(files)) return false;
  return files.some((file) => {
    const relRaw = getRelativePathForFile(file);
    if (!relRaw) return false;
    const rel = String(relRaw).replace(/\\/g, '/').replace(/^\/+/, '');
    return rel.includes('/');
  });
}

function scheduleFolderTreeRefresh(folder, immediate = false) {
  const target = folder || window.currentFolder || 'root';
  _treeRefreshFolder = target;
  if (_treeRefreshTimer) {
    clearTimeout(_treeRefreshTimer);
  }
  const delay = immediate ? 0 : 500;
  _treeRefreshTimer = setTimeout(() => {
    _treeRefreshTimer = null;
    const active = _treeRefreshFolder || target;
    const p = refreshFolderChildren(active);
    if (p && typeof p.catch === 'function') {
      p.catch(() => {});
    }
  }, delay);
}

function getUserDraftContext() {
  const all = loadResumableDraftsAll();
  const userKey = getCurrentUserKey();
  if (!all[userKey] || typeof all[userKey] !== 'object') {
    all[userKey] = {};
  }
  const drafts = all[userKey];
  return { all, userKey, drafts };
}

// Upsert / update a record for this resumable file
function upsertResumableDraft(file, percent) {
  if (!file || !file.uniqueIdentifier) return;

  const { all, userKey, drafts } = getUserDraftContext();
  const id     = file.uniqueIdentifier;
  const folder = window.currentFolder || 'root';
  const name   = file.fileName || file.name || 'Unnamed file';
  const size   = file.size || 0;

  const prev = drafts[id] || {};
  const p    = Math.max(0, Math.min(100, Math.floor(percent || 0)));

  // Avoid hammering localStorage if nothing substantially changed
  if (prev.lastPercent !== undefined && Math.abs(p - prev.lastPercent) < 1) {
    return;
  }

  drafts[id] = {
    identifier: id,
    fileName: name,
    size,
    folder,
    lastPercent: p,
    updatedAt: Date.now()
  };

  all[userKey] = drafts;
  saveResumableDraftsAll(all);
}

// Remove a single draft by identifier
function clearResumableDraft(identifier) {
  if (!identifier) return;
  const { all, userKey, drafts } = getUserDraftContext();
  if (drafts[identifier]) {
    delete drafts[identifier];
    all[userKey] = drafts;
    saveResumableDraftsAll(all);
  }
}

// Optionally clear all drafts for the current folder (used on full success)
function clearResumableDraftsForFolder(folder) {
  const { all, userKey, drafts } = getUserDraftContext();
  const f = folder || 'root';
  let changed = false;
  for (const [id, rec] of Object.entries(drafts)) {
    if (!rec || typeof rec !== 'object') continue;
    if (rec.folder === f) {
      delete drafts[id];
      changed = true;
    }
  }
  if (changed) {
    all[userKey] = drafts;
    saveResumableDraftsAll(all);
  }
}

// Show a small banner if there is any in-progress resumable upload for this folder
function showResumableDraftBanner() {
  const uploadCard = document.getElementById('uploadCard');
  if (!uploadCard) return;

  // Remove any existing banner first
  const existing = document.getElementById('resumableDraftBanner');
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }

  const { drafts } = getUserDraftContext();
  const folder = window.currentFolder || 'root';

  const candidates = Object.values(drafts)
    .filter(d =>
      d &&
      d.folder === folder &&
      typeof d.lastPercent === 'number' &&
      d.lastPercent > 0 &&
      d.lastPercent < 100
    )
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  if (!candidates.length) {
    return; // nothing to show
  }

  const latest = candidates[0];
  const count = candidates.length;

  const countText =
    count === 1
      ? 'You have a partially uploaded file'
      : `You have ${count} partially uploaded files. Latest:`;
  const resumeHint =
    count === 1
      ? 'Choose it again from your device to resume.'
      : 'Choose them again from your device to resume.';
  const dismissHint = 'Dismiss clears the partial uploads and temporary files.';
  const cleanupIds = candidates
    .map(entry => entry && entry.identifier)
    .filter(Boolean);

  const banner = document.createElement('div');
  banner.id = 'resumableDraftBanner';
  banner.className = 'upload-resume-banner';
  banner.innerHTML = `
    <div class="upload-resume-banner-inner">
      <span class="material-icons" style="vertical-align:middle;margin-right:6px;">cloud_upload</span>
      <span class="upload-resume-text">
        ${countText}
        <strong class="upload-resume-name">${escapeHTML(latest.fileName)}</strong>
        (~${latest.lastPercent}%).
        ${resumeHint}
        ${dismissHint}
      </span>
      <button type="button" class="upload-resume-dismiss-btn">Dismiss</button>
    </div>
  `;

  const dismissBtn = banner.querySelector('.upload-resume-dismiss-btn');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      // Clear all resumable hints for this folder when the user dismisses.
      clearResumableDraftsForFolder(folder);
      if (window.csrfToken && cleanupIds.length) {
        cleanupIds.forEach(identifier => {
          removeChunkFolderRepeatedly(identifier, window.csrfToken, folder, 2, 800);
        });
      }
      if (banner.parentNode) {
        banner.parentNode.removeChild(banner);
      }
    });
  }

  // Insert at top of uploadCard
  uploadCard.insertBefore(banner, uploadCard.firstChild);
}

/* -----------------------------------------------------
   Helpers for Drag–and–Drop Folder Uploads (Original Code)
----------------------------------------------------- */
// Recursively traverse a dropped folder.
function traverseFileTreePromise(item, path = "") {
  return new Promise((resolve) => {
    if (item.isFile) {
      item.file(file => {
        // Store relative path for folder uploads.
        Object.defineProperty(file, 'customRelativePath', {
          value: path + file.name,
          writable: true,
          configurable: true
        });
        Object.defineProperty(file, 'relativePath', {
          value: path + file.name,
          writable: true,
          configurable: true
        });
        resolve([file]);
      });
    } else if (item.isDirectory) {
      const dirReader = item.createReader();
      dirReader.readEntries(entries => {
        const promises = [];
        for (let i = 0; i < entries.length; i++) {
          promises.push(traverseFileTreePromise(entries[i], path + item.name + "/"));
        }
        Promise.all(promises).then(results => resolve(results.flat()));
      });
    } else {
      resolve([]);
    }
  });
}

// --- Lazy loader for Resumable.js (no CSP inline, cached, safe) ---
const RESUMABLE_SRC = withBase('/vendor/resumable/1.1.0/resumable.min.js?v={{APP_QVER}}');
let _resumableLoadPromise = null;

function loadScriptOnce(src) {
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

function lazyLoadResumable() {
  if (window.Resumable) return Promise.resolve(window.Resumable);
  if (!_resumableLoadPromise) {
    _resumableLoadPromise = loadScriptOnce(RESUMABLE_SRC).then(() => window.Resumable);
  }
  return _resumableLoadPromise;
}

// Optional: let main.js prefetch it in the background
export function warmUpResumable() {
  lazyLoadResumable().catch(() => {/* ignore warm-up failure */});
}

// Recursively retrieve files from DataTransfer items.
function getFilesFromDataTransferItems(items) {
  const promises = [];
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry();
    if (entry) {
      promises.push(traverseFileTreePromise(entry));
    }
  }
  return Promise.all(promises).then(results => results.flat());
}

function setDropAreaDefault() {
  const dropArea = document.getElementById("uploadDropArea");
  if (!dropArea) return;

  dropArea.innerHTML = `
    <div id="uploadInstruction" class="upload-instruction">
     ${t("upload_instruction")}
    </div>
    <div id="uploadFileRow" class="upload-file-row">
      <button id="customChooseBtn" type="button">${t("choose_files")}</button>
    </div>
    <div id="fileInfoWrapper" class="file-info-wrapper">
      <div id="fileInfoContainer" class="file-info-container">
        <span id="fileInfoDefault"> ${t("no_files_selected_default")}</span>
      </div>
    </div>
    <!-- File input for file picker (files only) -->
    <input
      type="file"
      id="file"
      name="file[]"
      class="form-control-file"
      multiple
      style="opacity:0; position:absolute; width:1px; height:1px;"
    />
  `;

  // After rebuilding markup, re-wire controls:
  const fileInput = dropArea.querySelector('#file');
  wireFileInputChange(fileInput);
  wireChooseButton();

  setUploadButtonVisible(false);
}

function adjustFolderHelpExpansion() {
  const uploadCard = document.getElementById("uploadCard");
  const folderHelpDetails = document.querySelector(".folder-help-details");
  if (uploadCard && folderHelpDetails) {
    if (uploadCard.offsetHeight > 400) {
      folderHelpDetails.setAttribute("open", "");
    } else {
      folderHelpDetails.removeAttribute("open");
    }
  }
}

function adjustFolderHelpExpansionClosed() {
  const folderHelpDetails = document.querySelector(".folder-help-details");
  if (folderHelpDetails) {
    folderHelpDetails.removeAttribute("open");
  }
}

function updateFileInfoCount() {
  const fileInfoContainer = document.getElementById("fileInfoContainer");
  if (fileInfoContainer && window.selectedFiles) {
    if (window.selectedFiles.length === 0) {
      fileInfoContainer.innerHTML = `<span id="fileInfoDefault">No files selected</span>`;
    } else if (window.selectedFiles.length === 1) {
      fileInfoContainer.innerHTML = `
        <div id="filePreviewContainer" class="file-preview-container" style="display:inline-block;">
          <span class="material-icons file-icon">insert_drive_file</span>
        </div>
        <span id="fileNameDisplay" class="file-name-display">${escapeHTML(window.selectedFiles[0].name || window.selectedFiles[0].fileName || "Unnamed File")}</span>
      `;
    } else {
      fileInfoContainer.innerHTML = `
        <div id="filePreviewContainer" class="file-preview-container" style="display:inline-block;">
          <span class="material-icons file-icon">insert_drive_file</span>
        </div>
        <span id="fileCountDisplay" class="file-name-display">${window.selectedFiles.length} files selected</span>
      `;
    }
    const previewContainer = document.getElementById("filePreviewContainer");
    if (previewContainer && window.selectedFiles.length > 0) {
      previewContainer.innerHTML = "";
      // For image files, try to show a preview (if available from the file object).
      displayFilePreview(window.selectedFiles[0].file || window.selectedFiles[0], previewContainer);
    }
  }
}

function applyResumableRelativePath(file) {
  if (!file || typeof file !== 'object') return;
  const rel = file.webkitRelativePath || file.customRelativePath || '';
  if (rel && (!('relativePath' in file) || !file.relativePath)) {
    Object.defineProperty(file, 'relativePath', {
      value: rel,
      writable: true,
      configurable: true
    });
  }
}

function normalizeUploadPath(raw) {
  return String(raw || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .trim();
}

function getUploadPathForFile(file) {
  if (!file || typeof file !== 'object') return '';
  const raw =
    file.customRelativePath ||
    file.relativePath ||
    file.webkitRelativePath ||
    file.name ||
    file.fileName ||
    '';
  return normalizeUploadPath(raw);
}

function ensureUploadConflictModal() {
  let modal = document.getElementById('uploadConflictModal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'uploadConflictModal';
  modal.className = 'modal';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="modal-content">
      <h4 id="uploadConflictTitle"></h4>
      <p id="uploadConflictMessage"></p>
      <div class="button-container" style="flex-wrap: wrap; justify-content: flex-end;">
        <button id="uploadConflictResume" class="btn btn-primary"></button>
        <button id="uploadConflictSkip" class="btn btn-secondary"></button>
        <button id="uploadConflictOverwrite" class="btn btn-danger"></button>
        <button id="uploadConflictCancel" class="btn btn-secondary"></button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  return modal;
}

function showUploadConflictModal(stats) {
  return new Promise((resolve) => {
    const modal = ensureUploadConflictModal();
    const titleEl = modal.querySelector('#uploadConflictTitle');
    const msgEl = modal.querySelector('#uploadConflictMessage');
    const resumeBtn = modal.querySelector('#uploadConflictResume');
    const skipBtn = modal.querySelector('#uploadConflictSkip');
    const overwriteBtn = modal.querySelector('#uploadConflictOverwrite');
    const cancelBtn = modal.querySelector('#uploadConflictCancel');

    const total = stats?.total || 0;
    const existing = stats?.existing || 0;
    const sameSize = stats?.sameSize || 0;
    const diffSize = stats?.diffSize || 0;

    const titleText = t('upload_conflict_title') || 'Existing files detected';
    const msgText = t('upload_conflict_message', {
      existing,
      total,
      same: sameSize,
      diff: diffSize
    }) || `Found ${existing} of ${total} files already in this folder.`;

    titleEl.textContent = titleText;
    msgEl.textContent = msgText;
    resumeBtn.textContent = t('upload_conflict_resume') || 'Resume';
    skipBtn.textContent = t('upload_conflict_skip') || 'Skip existing';
    overwriteBtn.textContent = t('upload_conflict_overwrite') || 'Overwrite';
    cancelBtn.textContent = t('cancel') || 'Cancel';

    modal.style.display = 'block';

    function cleanup(choice) {
      modal.style.display = 'none';
      resumeBtn.removeEventListener('click', onResume);
      skipBtn.removeEventListener('click', onSkip);
      overwriteBtn.removeEventListener('click', onOverwrite);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(choice);
    }

    function onResume() { cleanup('resume'); }
    function onSkip() { cleanup('skip'); }
    function onOverwrite() { cleanup('overwrite'); }
    function onCancel() { cleanup('cancel'); }

    resumeBtn.addEventListener('click', onResume);
    skipBtn.addEventListener('click', onSkip);
    overwriteBtn.addEventListener('click', onOverwrite);
    cancelBtn.addEventListener('click', onCancel);
  });
}

async function fetchExistingUploads(payload, retry = true) {
  try {
    const res = await fetch(CHECK_EXISTING_URL, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': window.csrfToken || ''
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => null);
    if (data && data.csrf_expired && data.csrf_token && retry) {
      window.csrfToken = data.csrf_token;
      return fetchExistingUploads(payload, false);
    }
    if (!res.ok || !data || typeof data !== 'object' || data.error) {
      return null;
    }
    return data;
  } catch (e) {
    console.warn('Upload existence check failed:', e);
    return null;
  }
}

async function filterExistingUploads(files) {
  const result = { files, autoStart: false };
  if (!Array.isArray(files) || files.length === 0) return result;
  if (!hasFolderPaths(files)) return result;

  const payloadFiles = [];
  files.forEach(file => {
    const path = getUploadPathForFile(file);
    if (!path) return;
    const size = typeof file.size === 'number'
      ? file.size
      : (file.file && typeof file.file.size === 'number' ? file.file.size : null);
    payloadFiles.push({ path, size });
  });

  if (!payloadFiles.length) return result;

  const payload = {
    folder: window.currentFolder || 'root',
    files: payloadFiles
  };
  const sourceId = getActiveUploadSourceId();
  if (sourceId) payload.sourceId = sourceId;

  const existingResult = await fetchExistingUploads(payload);
  if (!existingResult || !Array.isArray(existingResult.existing) || existingResult.existing.length === 0) {
    return result;
  }

  const existing = existingResult.existing;
  const existingCount = existing.length;
  const sameCount = existing.filter(e => e && e.sameSize === true).length;
  const diffCount = existingCount - sameCount;

  const choice = await showUploadConflictModal({
    total: payloadFiles.length,
    existing: existingCount,
    sameSize: sameCount,
    diffSize: diffCount
  });

  if (choice === 'cancel') return { files: [], autoStart: false };
  if (choice === 'overwrite') return { files, autoStart: true };

  const existingAny = new Set(existing.map(e => normalizeUploadPath(e.path)));
  const existingSame = new Set(
    existing.filter(e => e && e.sameSize === true).map(e => normalizeUploadPath(e.path))
  );

  const filtered = files.filter(file => {
    const path = getUploadPathForFile(file);
    if (!path) return true;
    if (choice === 'skip') {
      return !existingAny.has(path);
    }
    return !existingSame.has(path);
  });

  if (filtered.length === 0) {
    showToast(t('upload_conflict_all_skipped') || 'All selected files already exist.', 'info');
    return { files: filtered, autoStart: false };
  }

  const skipped = files.length - filtered.length;
  if (skipped > 0) {
    const msg = t('upload_conflict_skipped', { count: skipped }) || `Skipped ${skipped} existing file(s).`;
    showToast(msg, 'info');
  }

  return { files: filtered, autoStart: true };
}

function startResumableUploadNow() {
  if (!resumableInstance) return;
  if (!Array.isArray(resumableInstance.files) || resumableInstance.files.length === 0) {
    return;
  }
  if (typeof resumableInstance.isUploading === 'function' && resumableInstance.isUploading()) {
    return;
  }

  setUploadButtonVisible(false);
  showVirusScanNotice();
  resumableInstance.opts.headers = resumableInstance.opts.headers || {};
  resumableInstance.opts.headers['X-CSRF-Token'] = window.csrfToken;
  if (typeof resumableInstance.opts.query !== 'function') {
    resumableInstance.opts.query.folder = window.currentFolder || "root";
    resumableInstance.opts.query.upload_token = window.csrfToken;
    const sourceId = getActiveUploadSourceId();
    if (sourceId) {
      resumableInstance.opts.query.sourceId = sourceId;
    } else {
      delete resumableInstance.opts.query.sourceId;
    }
  }
  resumableInstance.upload();
  showToast(t('upload_resumable_started') || 'Resumable upload started...', 'info');
}

async function queueResumableFiles(files) {
  const filteredResult = await filterExistingUploads(files);
  const filtered = filteredResult && Array.isArray(filteredResult.files)
    ? filteredResult.files
    : [];
  const autoStart = !!filteredResult?.autoStart;
  if (!filtered || filtered.length === 0) return;

  if (!useResumable) {
    processFiles(filtered);
    return;
  }

  // New resumable batch: reset selectedFiles so the count is correct
  window.selectedFiles = [];
  _currentResumableIds.clear();

  if (!_resumableReady) await initResumableUpload();
  if (!resumableInstance) {
    // If Resumable failed to load, fall back to XHR
    processFiles(filtered);
    return;
  }

  if (_autoStartResumableTimer) {
    clearTimeout(_autoStartResumableTimer);
    _autoStartResumableTimer = null;
  }

  filtered.forEach(file => {
    applyResumableRelativePath(file);
    resumableInstance.addFile(file);
  });

  if (autoStart && resumableInstance) {
    // Defer until chunks are bootstrapped (Resumable builds chunks async).
    _autoStartResumableTimer = setTimeout(() => {
      _autoStartResumableTimer = null;
      startResumableUploadNow();
    }, 0);
  }
}

// Helper function to repeatedly call removeChunks.php
function removeChunkFolderRepeatedly(identifier, csrfToken, targetFolder = null, maxAttempts = 3, interval = 1000) {
  let attempt = 0;
  const folder = (typeof targetFolder === "string" && targetFolder.trim() !== "")
    ? targetFolder
    : (window.currentFolder || "root");
  const removalInterval = setInterval(() => {
    attempt++;
    const params = new URLSearchParams();
    // Prefix with "resumable_" to match your PHP regex.
    params.append('folder', 'resumable_' + identifier);
    params.append('csrf_token', csrfToken);
    params.append('targetFolder', folder);
    const sourceId = getActiveUploadSourceId();
    if (sourceId) {
      params.append('sourceId', sourceId);
    }
    fetch(withBase('/api/upload/removeChunks.php'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    })
      .then(response => response.json())
      .then(data => {
        console.log(`Chunk folder removal attempt ${attempt}:`, data);
      })
      .catch(err => {
        console.error(`Error on removal attempt ${attempt}:`, err);
      });
    if (attempt >= maxAttempts) {
      clearInterval(removalInterval);
    }
  }, interval);
}

/* -----------------------------------------------------
   File Entry Creation (with Pause/Resume and Restart)
----------------------------------------------------- */
// Create a file entry element with a remove button and a pause/resume button.
function createFileEntry(file) {
  const li = document.createElement("li");
  li.classList.add("upload-progress-item");
  li.style.display = "flex";
  li.dataset.uploadIndex = file.uploadIndex;

  // Remove button (always added)
  const removeBtn = document.createElement("button");
  removeBtn.classList.add("remove-file-btn");
  removeBtn.textContent = "×";
  // In your remove button event listener, replace the fetch call with:
  removeBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    const uploadIndex = file.uploadIndex;
    window.selectedFiles = window.selectedFiles.filter(f => f.uploadIndex !== uploadIndex);

    // Cancel the file upload if possible.
    if (typeof file.cancel === "function") {
      file.cancel();
      console.log("Canceled file upload:", file.fileName);
    }

    // Remove file from the resumable queue.
    if (resumableInstance && typeof resumableInstance.removeFile === "function") {
      resumableInstance.removeFile(file);
    }

    // Call our helper repeatedly to remove the chunk folder.
    if (file.uniqueIdentifier) {
      removeChunkFolderRepeatedly(file.uniqueIdentifier, window.csrfToken, file.targetFolder, 3, 1000);
    }

    li.remove();
    updateFileInfoCount();
    const anyItems = !!document.querySelector('li.upload-progress-item');
    setUploadButtonVisible(anyItems);
  });
  li.removeBtn = removeBtn;
  li.appendChild(removeBtn);

  // Add pause/resume/restart button if the file supports pause/resume.
  // Conditionally add the pause/resume button only if file.pause is available
  // Pause/Resume button (for resumable file–picker uploads)
  if (typeof file.pause === "function") {
    const pauseResumeBtn = document.createElement("button");
    pauseResumeBtn.setAttribute("type", "button"); // not a submit button
    pauseResumeBtn.classList.add("pause-resume-btn");
    // Start with pause icon and disable button until upload starts
    pauseResumeBtn.innerHTML = '<span class="material-icons pauseResumeBtn">pause_circle_outline</span>';
    pauseResumeBtn.disabled = true;
    pauseResumeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (file.isError) {
        // If the file previously failed, try restarting upload.
        if (typeof file.retry === "function") {
          file.retry();
          file.isError = false;
          pauseResumeBtn.innerHTML = '<span class="material-icons pauseResumeBtn">pause_circle_outline</span>';
        }
      } else if (!file.paused) {
        // Pause the upload (if possible)
        if (typeof file.pause === "function") {
          file.pause();
          file.paused = true;
          pauseResumeBtn.innerHTML = '<span class="material-icons pauseResumeBtn">play_circle_outline</span>';
        } else {
        }
      } else if (file.paused) {
        // Resume sequence: first call to resume (or upload() fallback)
        if (typeof file.resume === "function") {
          file.resume();
        } else {
          resumableInstance.upload();
        }
        // After a short delay, pause again then resume
        setTimeout(() => {
          if (typeof file.pause === "function") {
            file.pause();
          } else {
            resumableInstance.upload();
          }
          setTimeout(() => {
            if (typeof file.resume === "function") {
              file.resume();
            } else {
              resumableInstance.upload();
            }
          }, 100);
        }, 100);
        file.paused = false;
        pauseResumeBtn.innerHTML = '<span class="material-icons pauseResumeBtn">pause_circle_outline</span>';
      } else {
        console.error("Pause/resume function not available for file", file);
      }
    });
    li.appendChild(pauseResumeBtn);
  }

  // Preview element
  const preview = document.createElement("div");
  preview.className = "file-preview";
  displayFilePreview(file.file || file, preview);
  li.appendChild(preview);

  // File name display
  const nameDiv = document.createElement("div");
  nameDiv.classList.add("upload-file-name");
  nameDiv.textContent = file.name || file.fileName || file.file?.name || "Unnamed File";
  li.appendChild(nameDiv);

  // Progress bar container
  const progDiv = document.createElement("div");
  progDiv.classList.add("progress", "upload-progress-div");
  progDiv.style.flex = "0 0 250px";
  progDiv.style.marginLeft = "5px";
  const progBar = document.createElement("div");
  progBar.classList.add("progress-bar");
  progBar.style.width = "0%";
  progBar.innerText = "0%";
  progDiv.appendChild(progBar);
  li.appendChild(progDiv);

  li.progressBar = progBar;
  li.startTime = Date.now();
  return li;
}

/* -----------------------------------------------------
   Processing Files
   - Used for XHR fallback + grouping in the upload UI.
------------------------------------------------------ */
function processFiles(filesInput) {
  const fileInfoContainer = document.getElementById("fileInfoContainer");
  const files = Array.from(filesInput);

  if (fileInfoContainer) {
    if (files.length > 0) {
      if (files.length === 1) {
        fileInfoContainer.innerHTML = `
          <div id="filePreviewContainer" class="file-preview-container" style="display:inline-block;">
            <span class="material-icons file-icon">insert_drive_file</span>
          </div>
          <span id="fileNameDisplay" class="file-name-display">${escapeHTML(files[0].name || files[0].fileName || "Unnamed File")}</span>
        `;
      } else {
        fileInfoContainer.innerHTML = `
          <div id="filePreviewContainer" class="file-preview-container" style="display:inline-block;">
            <span class="material-icons file-icon">insert_drive_file</span>
          </div>
          <span id="fileCountDisplay" class="file-name-display">${files.length} files selected</span>
        `;
      }
      const previewContainer = document.getElementById("filePreviewContainer");
      if (previewContainer) {
        previewContainer.innerHTML = "";
        displayFilePreview(files[0].file || files[0], previewContainer);
      }
    } else {
      fileInfoContainer.innerHTML = `<span id="fileInfoDefault">No files selected</span>`;
    }
  }

  files.forEach((file, index) => {
    file.uploadIndex = index;
  });

  const progressContainer = document.getElementById("uploadProgressContainer");
  progressContainer.innerHTML = "";

  if (files.length > 0) {
    const maxDisplay = 10;
    const list = document.createElement("ul");
    list.classList.add("upload-progress-list");

    // Check for relative paths (for folder uploads).
    const hasRelativePaths = files.some(file => {
      const rel = file.webkitRelativePath || file.customRelativePath || "";
      return rel.trim() !== "";
    });

    if (hasRelativePaths) {
      // Group files by folder.
      const fileGroups = {};
      files.forEach(file => {
        let folderName = "Root";
        const relativePath = file.webkitRelativePath || file.customRelativePath || "";
        if (relativePath.trim() !== "") {
          const parts = relativePath.split("/");
          if (parts.length > 1) {
            folderName = parts.slice(0, parts.length - 1).join("/");
          }
        }
        if (!fileGroups[folderName]) {
          fileGroups[folderName] = [];
        }
        fileGroups[folderName].push(file);
      });

      Object.keys(fileGroups).forEach(folderName => {
        // Only show folder grouping if folderName is not "Root"
        if (folderName !== "Root") {
          const folderLi = document.createElement("li");
          folderLi.classList.add("upload-folder-group");
          folderLi.innerHTML = `<i class="material-icons folder-icon" style="vertical-align:middle; margin-right:8px;">folder</i> ${folderName}:`;
          list.appendChild(folderLi);
        }
        const nestedUl = document.createElement("ul");
        nestedUl.classList.add("upload-folder-group-list");
        fileGroups[folderName]
          .sort((a, b) => a.uploadIndex - b.uploadIndex)
          .forEach(file => {
            const li = createFileEntry(file);
            nestedUl.appendChild(li);
          });
        list.appendChild(nestedUl);
      });
    } else {
      // No relative paths – list files directly.
      files.forEach((file, index) => {
        const li = createFileEntry(file);
        li.style.display = (index < maxDisplay) ? "flex" : "none";
        li.dataset.uploadIndex = index;
        list.appendChild(li);
      });
      if (files.length > maxDisplay) {
        const extra = document.createElement("li");
        extra.classList.add("upload-progress-extra");
        extra.textContent = `Uploading additional ${files.length - maxDisplay} file(s)...`;
        extra.style.display = "flex";
        list.appendChild(extra);
      }
    }
    const listWrapper = document.createElement("div");
    listWrapper.classList.add("upload-progress-wrapper");
    listWrapper.style.maxHeight = "300px";
    listWrapper.style.overflowY = "auto";
    listWrapper.appendChild(list);
    progressContainer.appendChild(listWrapper);
  }

  adjustFolderHelpExpansion();
  window.addEventListener("resize", adjustFolderHelpExpansion);

  window.selectedFiles = files;
  updateFileInfoCount();
  setUploadButtonVisible(files.length > 0); 
}

/* -----------------------------------------------------
   Resumable.js Integration for File Picker Uploads
   (Only files chosen via file input use Resumable; folder uploads use original code.)
----------------------------------------------------- */
const useResumable = true;
let resumableInstance = null;
let _pendingPickedFiles = [];   // files picked before library/instance ready
let _resumableReady = false;
let _currentResumableIds = new Set();
let _autoStartResumableTimer = null;

// Make init async-safe; it resolves when Resumable is constructed
async function initResumableUpload() {
  if (resumableInstance) return;
  // Load the library if needed
  const ResumableCtor = await lazyLoadResumable().catch(err => {
    console.error('Failed to load Resumable.js:', err);
    return null;
  });
  if (!ResumableCtor) return;

  // Construct the instance once
  if (!resumableInstance) {
    resumableInstance = new ResumableCtor({
      target: RESUMABLE_TARGET,
      chunkSize: getResumableChunkSizeBytes(),
      simultaneousUploads: 3,
      forceChunkSize: true,
      testChunks: true,
      withCredentials: true,
      headers: { 'X-CSRF-Token': window.csrfToken },
      query: () => {
        const q = {
          folder: window.currentFolder || "root",
          upload_token: window.csrfToken
        };
        const sourceId = getActiveUploadSourceId();
        if (sourceId) q.sourceId = sourceId;
        return q;
      }
    });
  }

  // keep query fresh when folder changes (call this from your folder nav code)
  function updateResumableQuery() {
    if (!resumableInstance) return;
    resumableInstance.opts.headers['X-CSRF-Token'] = window.csrfToken;
    if (typeof resumableInstance.opts.query === 'function') return;
    resumableInstance.opts.query.folder = window.currentFolder || 'root';
    resumableInstance.opts.query.upload_token = window.csrfToken;
    const sourceId = getActiveUploadSourceId();
    if (sourceId) {
      resumableInstance.opts.query.sourceId = sourceId;
    } else {
      delete resumableInstance.opts.query.sourceId;
    }
  }



  resumableInstance.on("fileAdded", function (file) {
    // Build a stable per-file key
    const id =
      file.uniqueIdentifier ||
      ((file.fileName || file.name || '') + ':' + (file.size || 0));
  
    // If we've already seen this id in the current batch, skip wiring it again
    if (_currentResumableIds.has(id)) {
      return;
    }
    _currentResumableIds.add(id);
  
    // Initialize custom paused flag
    file.paused = false;
    file.uploadIndex = file.uniqueIdentifier;
    file.targetFolder = window.currentFolder || "root";
    if (!window.selectedFiles) {
      window.selectedFiles = [];
    }
    window.selectedFiles.push(file);
  
    // Track as in-progress draft at 0%
    upsertResumableDraft(file, 0);
    showResumableDraftBanner();
  
    const progressContainer = document.getElementById("uploadProgressContainer");
  
    // Check if a wrapper already exists; if not, create one with a UL inside.
    let listWrapper = progressContainer.querySelector(".upload-progress-wrapper");
    let list;
    if (!listWrapper) {
      listWrapper = document.createElement("div");
      listWrapper.classList.add("upload-progress-wrapper");
      listWrapper.style.maxHeight = "300px";
      listWrapper.style.overflowY = "auto";
      list = document.createElement("ul");
      list.classList.add("upload-progress-list");
      listWrapper.appendChild(list);
      progressContainer.appendChild(listWrapper);
    } else {
      list = listWrapper.querySelector("ul.upload-progress-list");
    }
  
    const li = createFileEntry(file);
    li.dataset.uploadIndex = file.uniqueIdentifier;
    list.appendChild(li);
    updateFileInfoCount();
    updateResumableQuery();
    setUploadButtonVisible(true);
  });

  resumableInstance.on("fileProgress", function (file) {
    const progress = file.progress(); // value between 0 and 1
    let percent = Math.floor(progress * 100);
  
    // Never persist a full 100% from progress alone.
    // If the tab dies here, we still want it to look resumable.
    if (percent >= 100) percent = 99;
  
    const li = document.querySelector(
      `li.upload-progress-item[data-upload-index="${file.uniqueIdentifier}"]`
    );
    if (li && li.progressBar) {
      if (percent < 99) {
        li.progressBar.style.width = percent + "%";
  
        const elapsed = (Date.now() - li.startTime) / 1000;
        let speed = "";
        if (elapsed > 0) {
          const bytesUploaded = progress * file.size;
          const spd = bytesUploaded / elapsed;
          if (spd < 1024)      speed = spd.toFixed(0) + " B/s";
          else if (spd < 1048576) speed = (spd / 1024).toFixed(1) + " KB/s";
          else                     speed = (spd / 1048576).toFixed(1) + " MB/s";
        }
        li.progressBar.innerText = percent + "% (" + speed + ")";
      } else {
        li.progressBar.style.width = "100%";
        li.progressBar.innerHTML =
          '<i class="material-icons spinning" style="vertical-align: middle;">autorenew</i>';
      }
  
      const pauseResumeBtn = li.querySelector(".pause-resume-btn");
      if (pauseResumeBtn) {
        pauseResumeBtn.disabled = false;
      }
    }
    if (li && li.progressBar) {
      if (percent < 99) {
        li.progressBar.style.width = percent + "%";

        // Calculate elapsed time and speed.
        const elapsed = (Date.now() - li.startTime) / 1000;
        let speed = "";
        if (elapsed > 0) {
          const bytesUploaded = progress * file.size;
          const spd = bytesUploaded / elapsed;
          if (spd < 1024) {
            speed = spd.toFixed(0) + " B/s";
          } else if (spd < 1048576) {
            speed = (spd / 1024).toFixed(1) + " KB/s";
          } else {
            speed = (spd / 1048576).toFixed(1) + " MB/s";
          }
        }
        li.progressBar.innerText = percent + "% (" + speed + ")";
      } else {
        // When progress reaches 99% or higher, show only a spinner icon.
        li.progressBar.style.width = "100%";
        li.progressBar.innerHTML = '<i class="material-icons spinning" style="vertical-align: middle;">autorenew</i>';
      }

      // Enable the pause/resume button once progress starts.
      const pauseResumeBtn = li.querySelector(".pause-resume-btn");
      if (pauseResumeBtn) {
        pauseResumeBtn.disabled = false;
      }
    }
    upsertResumableDraft(file, percent);
  });

  resumableInstance.on("fileSuccess", function (file, message) {
    // Try to parse JSON response
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      data = null;
    }

    // 1) Soft‐fail CSRF? then update token & retry this file
    if (data && data.csrf_expired) {
      // Update global and Resumable headers
      window.csrfToken = data.csrf_token;
      resumableInstance.opts.headers['X-CSRF-Token'] = data.csrf_token;
      resumableInstance.opts.query.upload_token = data.csrf_token;
      // Retry this chunk/file
      file.retry();
      return;
    }

    // 2) Otherwise treat as real success:
    const li = document.querySelector(
      `li.upload-progress-item[data-upload-index="${file.uniqueIdentifier}"]`
    );
    if (li && li.progressBar) {
      li.progressBar.style.width = "100%";
      li.progressBar.innerText = "Done";
      // remove action buttons
      const pauseResumeBtn = li.querySelector(".pause-resume-btn");
      if (pauseResumeBtn) pauseResumeBtn.style.display = "none";
      const removeBtn = li.querySelector(".remove-file-btn");
      if (removeBtn) removeBtn.style.display = "none";
      setTimeout(() => li.remove(), 5000);
    }
    if (!hasFolderPaths([file])) {
      scheduleUploadRefresh(window.currentFolder);
    }
    // This file finished successfully, remove its draft record
    clearResumableDraft(file.uniqueIdentifier);
    showResumableDraftBanner();
  });



  resumableInstance.on("fileError", function (file, message) {
    const li = document.querySelector(`li.upload-progress-item[data-upload-index="${file.uniqueIdentifier}"]`);
    if (li && li.progressBar) {
      li.progressBar.innerText = "Error";
    }
    // Mark file as errored so that the pause/resume button acts as a restart button.
    file.isError = true;
    const pauseResumeBtn = li ? li.querySelector(".pause-resume-btn") : null;
    if (pauseResumeBtn) {
      pauseResumeBtn.innerHTML = '<span class="material-icons pauseResumeBtn">replay</span>';
      pauseResumeBtn.disabled = false;
    }
    let msgText = "Error uploading file: " + (file.fileName || file.name || "");
    try {
      const parsed = JSON.parse(message);
      if (parsed && parsed.error) {
        msgText = parsed.error; // e.g. "Upload blocked: virus detected in file."
      }
    } catch (e) {
      // message wasn't JSON, ignore
    }
    showToast(msgText, 'error');
    // Treat errored file as no longer resumable (for now) and clear its hint
    showResumableDraftBanner();
  });

    resumableInstance.on("complete", function () {
    // If any file is marked with an error, leave the list intact.
    const files = Array.isArray(window.selectedFiles) ? window.selectedFiles : [];
    const hadFolderPaths = hasFolderPaths(files);
    const failed = files.filter(f => f && f.isError).length;
    const succeeded = Math.max(0, files.length - failed);
    const hasError = failed > 0;
    if (!hasError) {
      // All files succeeded—clear the file input and progress container after 5 seconds.
      setTimeout(() => {
        const fileInput = document.getElementById("file");
        if (fileInput) fileInput.value = "";
        const progressContainer = document.getElementById("uploadProgressContainer");
        if (progressContainer) {
          progressContainer.innerHTML = "";
        }
        window.selectedFiles = [];
        adjustFolderHelpExpansionClosed();
        const fileInfoContainer = document.getElementById("fileInfoContainer");
        if (fileInfoContainer) {
          fileInfoContainer.innerHTML = `<span id="fileInfoDefault">No files selected</span>`;
        }
        const dropArea = document.getElementById("uploadDropArea");
        if (dropArea) setDropAreaDefault();

        // IMPORTANT: clear Resumable's internal file list so the next upload
        // doesn't think there are still resumable files queued.
        if (resumableInstance) {
          // cancel() after completion just resets internal state; no chunks are deleted server-side.
          resumableInstance.cancel();
        }
        clearResumableDraftsForFolder(window.currentFolder || 'root');
        showResumableDraftBanner();
        setUploadButtonVisible(false); 
      }, 5000);
      if (succeeded > 0) {
        scheduleUploadRefresh(window.currentFolder, true);
        showToast(t('upload_summary_success', { succeeded }), 'success');
      }
    } else {
      showToast(t('upload_summary_failed', { failed, succeeded }), 'warning');
    }
    if (succeeded > 0 && hadFolderPaths) {
      scheduleFolderTreeRefresh(window.currentFolder, true);
    }
    // In all cases, once Resumable has finished its batch, hide the ClamAV notice.
    hideVirusScanNotice();
  });

  _resumableReady = true;
  if (_pendingPickedFiles.length) {
    updateResumableQuery();
    for (const f of _pendingPickedFiles) resumableInstance.addFile(f);
    _pendingPickedFiles = [];
  }

}

/* -----------------------------------------------------
   XHR-based submitFiles (fallback when Resumable is unavailable)
------------------------------------------------------ */
function submitFiles(allFiles) {
  const folderToUse = (() => {
    const f = window.currentFolder || "root";
    try { return decodeURIComponent(f); } catch (e) { return f; }
  })();

  const progressContainer = document.getElementById("uploadProgressContainer");
  const fileInput = document.getElementById("file");
  if (!progressContainer) {
    console.warn("submitFiles called but #uploadProgressContainer not found");
    return;
  }

  // --- Ensure there are progress list items for these files ---
  let listItems = progressContainer.querySelectorAll("li.upload-progress-item");

  if (!listItems.length) {
    // Guarantee each file has a stable uploadIndex
    allFiles.forEach((file, index) => {
      if (file.uploadIndex === undefined || file.uploadIndex === null) {
        file.uploadIndex = index;
      }
    });

    // Build the UI rows for these files
    // This will also set window.selectedFiles and fileInfoContainer, etc.
    processFiles(allFiles);

    // Re-query now that processFiles has populated the DOM
    listItems = progressContainer.querySelectorAll("li.upload-progress-item");
  }

  const progressElements = {};
  listItems.forEach(item => {
    progressElements[item.dataset.uploadIndex] = item;
  });

  let finishedCount = 0;
  let allSucceeded = true;
  const uploadResults = new Array(allFiles.length).fill(false);

  allFiles.forEach(file => {
    const formData = new FormData();
    const uploadFile = file.file || file;
    if (!(uploadFile instanceof Blob)) {
      const li = progressElements[file.uploadIndex];
      if (li && li.progressBar) {
        li.progressBar.innerText = "Error";
      }
      try {
        showToast(t('upload_read_error'), 6000, 'error');
      } catch (e) {}
      uploadResults[file.uploadIndex] = false;
      allSucceeded = false;
      finishedCount++;
      return;
    }
    const uploadName = uploadFile.name || file.name || file.fileName || "upload.bin";
    formData.append("file[]", uploadFile, uploadName);
    formData.append("folder", folderToUse);
    // Append CSRF token as "upload_token"
    formData.append("upload_token", window.csrfToken);
    const sourceId = getActiveUploadSourceId();
    if (sourceId) {
      formData.append("sourceId", sourceId);
    }
    const relativePath = file.webkitRelativePath || file.customRelativePath || "";
    if (relativePath.trim() !== "") {
      formData.append("relativePath", relativePath);
    }
    const xhr = new XMLHttpRequest();
    let currentPercent = 0;

    xhr.upload.addEventListener("progress", function (e) {
      if (e.lengthComputable) {
        currentPercent = Math.round((e.loaded / e.total) * 100);
        const li = progressElements[file.uploadIndex];
        if (li && li.progressBar) {
          const elapsed = (Date.now() - li.startTime) / 1000;
          let speed = "";
          if (elapsed > 0) {
            const spd = e.loaded / elapsed;
            if (spd < 1024) speed = spd.toFixed(0) + " B/s";
            else if (spd < 1048576) speed = (spd / 1024).toFixed(1) + " KB/s";
            else speed = (spd / 1048576).toFixed(1) + " MB/s";
          }
          li.progressBar.style.width = currentPercent + "%";
          li.progressBar.innerText = currentPercent + "% (" + speed + ")";
        }
      }
    });

    xhr.addEventListener("load", function () {
      let jsonResponse;
      try {
        jsonResponse = JSON.parse(xhr.responseText);
      } catch (e) {
        jsonResponse = null;
      }

      // ─── Soft-fail CSRF: retry this upload ───────────────────────
      if (jsonResponse && jsonResponse.csrf_expired) {
        console.warn("CSRF expired during upload, retrying chunk", file.uploadIndex);
        // 1) update global token + header
        window.csrfToken = jsonResponse.csrf_token;
        xhr.open("POST", UPLOAD_URL, true);
        xhr.withCredentials = true;
        xhr.setRequestHeader("X-CSRF-Token", window.csrfToken);
        // 2) re-send the same formData
        xhr.send(formData);
        return;  // skip the "finishedCount++" and error/success logic for now
      }

      // ─── Normal success/error handling ────────────────────────────
      const li = progressElements[file.uploadIndex];

      if (xhr.status >= 200 && xhr.status < 300 && (!jsonResponse || !jsonResponse.error)) {
        // real success
        if (li && li.progressBar) {
          li.progressBar.style.width = "100%";
          li.progressBar.innerText = "Done";
          if (li.removeBtn) li.removeBtn.style.display = "none";
        }
        uploadResults[file.uploadIndex] = true;

      } else {
        // real failure
        if (li && li.progressBar) {
          li.progressBar.innerText = "Error";
        }
        try {
          const msg =
            (jsonResponse && (jsonResponse.error || jsonResponse.message))
              ? String(jsonResponse.error || jsonResponse.message)
              : `Upload failed (HTTP ${xhr.status || 0}).`;
          console.error("Upload failed:", xhr.status, jsonResponse || xhr.responseText);
          showToast(msg, 7000, 'error');
        } catch (e) {
          // ignore toast failures
        }
        allSucceeded = false;
      }

      if (file.isClipboard) {
        setTimeout(() => {
          window.selectedFiles = [];
          updateFileInfoCount();
          const pc = document.getElementById("uploadProgressContainer");
          if (pc) pc.innerHTML = "";
          const fic = document.getElementById("fileInfoContainer");
          if (fic) {
            fic.innerHTML = `<span id="fileInfoDefault">No files selected</span>`;
          }
        }, 5000);
      }

      // ─── Only now count this upload as finished ───────────────────
      finishedCount++;
      if (finishedCount === allFiles.length) {
        const succeededCount = uploadResults.filter(Boolean).length;
        const failedCount = allFiles.length - succeededCount;

        setTimeout(() => {
          refreshFileList(allFiles, uploadResults, progressElements);
        }, 250);
      }
    });

    xhr.addEventListener("error", function () {
      const li = progressElements[file.uploadIndex];
      if (li && li.progressBar) {
        li.progressBar.innerText = "Error";
      }
      try {
        showToast(t('upload_network_error'), 6000, 'error');
      } catch (e) {}
      uploadResults[file.uploadIndex] = false;
      allSucceeded = false;
      finishedCount++;
      if (finishedCount === allFiles.length) {
        refreshFileList(allFiles, uploadResults, progressElements);
        // Immediate summary toast based on actual XHR outcomes
        const succeededCount = uploadResults.filter(Boolean).length;
        const failedCount = allFiles.length - succeededCount;
      }
    });

    xhr.addEventListener("abort", function () {
      const li = progressElements[file.uploadIndex];
      if (li && li.progressBar) {
        li.progressBar.innerText = "Aborted";
      }
      try {
        showToast(t('upload_aborted'), 5000, 'warning');
      } catch (e) {}
      uploadResults[file.uploadIndex] = false;
      allSucceeded = false;
      finishedCount++;
      if (finishedCount === allFiles.length) {
        refreshFileList(allFiles, uploadResults, progressElements);
      }
    });

    xhr.open("POST", UPLOAD_URL, true);
    xhr.withCredentials = true;
    xhr.setRequestHeader("X-CSRF-Token", window.csrfToken);
    xhr.send(formData);
  });

  function refreshFileList(allFiles, uploadResults, progressElements) {
    const hadFolderPaths = hasFolderPaths(allFiles);
    const transferSucceeded = Array.isArray(uploadResults)
      ? uploadResults.filter(Boolean).length
      : 0;
    loadFileList(folderToUse)
      .then(serverFiles => {
        initFileActions();
        // Be tolerant to API shapes: string or object with name/fileName/filename
        serverFiles = (serverFiles || [])
          .map(item => {
            if (typeof item === 'string') return item;
            const n = item?.name ?? item?.fileName ?? item?.filename ?? '';
            return String(n);
          })
          .map(s => s.trim().toLowerCase())
          .filter(Boolean);

        let overallSuccess = true;
        let succeeded = 0;

        allFiles.forEach(file => {
          const clientFileName = file.name.trim().toLowerCase();
          const li = progressElements[file.uploadIndex];
          const hadRelative = !!(file.webkitRelativePath || file.customRelativePath);

          if (!uploadResults[file.uploadIndex] ||
              (!hadRelative && !serverFiles.includes(clientFileName))) {
            if (li && li.progressBar) {
              li.progressBar.innerText = "Error";
            }
            overallSuccess = false;
          } else if (li) {
            succeeded++;

            // Schedule removal of successful file entry after 5 seconds.
            setTimeout(() => {
              li.remove();
              delete progressElements[file.uploadIndex];
              updateFileInfoCount();
              const pc = document.getElementById("uploadProgressContainer");
              if (pc && pc.querySelectorAll("li.upload-progress-item").length === 0) {
                const fi = document.getElementById("file");
                if (fi) fi.value = "";
                pc.innerHTML = "";
                adjustFolderHelpExpansionClosed();
                const fic = document.getElementById("fileInfoContainer");
                if (fic) {
                  fic.innerHTML = `<span id="fileInfoDefault">No files selected</span>`;
                }
                const dropArea = document.getElementById("uploadDropArea");
                if (dropArea) setDropAreaDefault();
                window.selectedFiles = [];
              }
            }, 5000);
          }
        });

        if (!overallSuccess) {
          const failed = allFiles.length - succeeded;
          showToast(t('upload_summary_failed', { failed, succeeded }), 'warning');
        } else {
          showToast(t('upload_summary_success', { succeeded }), 'success');
        }
        const anyItems = !!document.querySelector('li.upload-progress-item');
        setUploadButtonVisible(anyItems);
      })
      .catch(error => {
        console.error("Error fetching file list:", error);
        showToast(t('upload_may_have_failed'), 'warning');
      })
      .finally(() => {
        try { refreshFolderIcon(folderToUse); } catch (e) {}
        if (hadFolderPaths && transferSucceeded > 0) {
          scheduleFolderTreeRefresh(folderToUse, true);
        }
        hideVirusScanNotice();
      });
  }
}

/* -----------------------------------------------------
   Main initUpload: Sets up file input, drop area, and form submission.
----------------------------------------------------- */
function initUpload() {
  window.__FR_FLAGS = window.__FR_FLAGS || { wired: {} };
  window.__FR_FLAGS.wired = window.__FR_FLAGS.wired || {};

  const uploadForm = document.getElementById("uploadFileForm");
  const dropArea   = document.getElementById("uploadDropArea");

  // Always (re)build the inner markup and wire the Choose button
  setDropAreaDefault();
  wireChooseButton();

  const fileInput = document.getElementById("file");

  // For file picker, remove directory attributes so only files can be chosen.
  if (fileInput) {
    fileInput.removeAttribute("webkitdirectory");
    fileInput.removeAttribute("mozdirectory");
    fileInput.removeAttribute("directory");
    fileInput.setAttribute("multiple", "");
  }

  // Drag–and–drop events use Resumable when available, XHR as fallback.
  if (dropArea && !dropArea.__uploadBound) {
    dropArea.__uploadBound = true;
    dropArea.classList.add("upload-drop-area");

    dropArea.addEventListener("dragover", function (e) {
      e.preventDefault();
      dropArea.style.backgroundColor = document.body.classList.contains("dark-mode") ? "#333" : "#f8f8f8";
    });

    dropArea.addEventListener("dragleave", function (e) {
      e.preventDefault();
      dropArea.style.backgroundColor = "";
    });

    dropArea.addEventListener("drop", function (e) {
      e.preventDefault();
      dropArea.style.backgroundColor = "";
      const dt = e.dataTransfer || window.__pendingDropData || null;
      window.__pendingDropData = null;
      if (dt && dt.items && dt.items.length > 0) {
        getFilesFromDataTransferItems(dt.items).then(files => {
          if (files.length > 0) {
            queueResumableFiles(files);
          }
        });
      } else if (dt && dt.files && dt.files.length > 0) {
        queueResumableFiles(Array.from(dt.files));
      }
    });

    // Only trigger file picker when clicking the *bare* drop area, not controls inside it
    dropArea.addEventListener("click", function (e) {
      // If the click originated from the "Choose files" button or the file input itself,
      // let their handlers deal with it.
      if (e.target.closest('#customChooseBtn') || e.target.closest('#file')) {
        return;
      }
      triggerFilePickerOnce();
    });
  }

  if (uploadForm && !uploadForm.__uploadSubmitBound) {
    uploadForm.__uploadSubmitBound = true;
    uploadForm.addEventListener("submit", async function (e) {
      e.preventDefault();

      const files =
        (Array.isArray(window.selectedFiles) && window.selectedFiles.length)
          ? window.selectedFiles
          : (fileInput ? Array.from(fileInput.files || []) : []);

      if (!files || !files.length) {
        showToast(t('no_files_selected'), 'warning');
        return;
      }

      setUploadButtonVisible(false);
        // If ClamAV scanning is enabled, show a small non-blocking notice
      showVirusScanNotice();

      const hasResumablePayload = Array.isArray(files) && files.some(f => {
        if (!f || typeof f !== 'object') return false;
        if (f.file instanceof Blob) return true; // Resumable file wrapper
        return false;
      });
      const shouldUseResumable = useResumable && resumableInstance && hasResumablePayload;

      if (shouldUseResumable) {
        if (!_resumableReady) await initResumableUpload();
        if (resumableInstance) {
          resumableInstance.opts.headers['X-CSRF-Token'] = window.csrfToken;
          if (typeof resumableInstance.opts.query !== 'function') {
            resumableInstance.opts.query.folder = window.currentFolder || "root";
            resumableInstance.opts.query.upload_token = window.csrfToken;
            const sourceId = getActiveUploadSourceId();
            if (sourceId) {
              resumableInstance.opts.query.sourceId = sourceId;
            } else {
              delete resumableInstance.opts.query.sourceId;
            }
          }

          resumableInstance.upload();
          showToast(t('upload_resumable_started'), 'info');
        } else {
          submitFiles(files);
        }
      } else {
        if (resumableInstance) {
          resumableInstance.cancel();
        }
        submitFiles(files);
      }
    });
  }

  if (useResumable) {
    initResumableUpload();
  }
  showResumableDraftBanner();
}

export { initUpload };

// -------------------------
// Clipboard Paste Handler (Mimics Drag-and-Drop)
// -------------------------
document.addEventListener('paste', function handlePasteUpload(e) {
  const items = e.clipboardData?.items;
  if (!items) return;

  const files = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) {
        const ext = file.name.split('.').pop() || 'png';
        const renamedFile = new File([file], `image${Date.now()}.${ext}`, { type: file.type });
        renamedFile.isClipboard = true;

        Object.defineProperty(renamedFile, 'customRelativePath', {
          value: renamedFile.name,
          writable: true,
          configurable: true
        });

        files.push(renamedFile);
      }
    }
  }

  if (files.length > 0) {
    queueResumableFiles(files);
    showToast(t('upload_pasted_added'), 'success');
  }
});
