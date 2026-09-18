// sharedDropView.js
import { setLocale, t } from './i18n.js?v={{APP_QVER}}';

document.addEventListener('DOMContentLoaded', async function () {
  try {
    const saved = localStorage.getItem('language') || 'en';
    await setLocale(saved);
  } catch (e) {
    await setLocale('en');
  }

  const tx = (key, placeholders, fallback) => {
    const out = t(key, placeholders);
    if (out === key && typeof fallback === 'string') {
      return fallback;
    }
    return out;
  };

  const dataEl = document.getElementById('shared-data');
  if (!dataEl) return;

  let payload = {};
  try {
    payload = JSON.parse(dataEl.textContent || '{}');
  } catch (e) {
    payload = {};
  }

  const mode = String(payload.mode || '').toLowerCase();
  const hideListing = !!payload.hideListing;
  if (mode !== 'drop' && !hideListing) {
    return;
  }

  const token = String(payload.token || '');
  const shareRoot = String(payload.shareRoot || 'root');
  const currentPath = String(payload.path || '');
  const allowSubfolders = !!payload.allowSubfolders;
  const preserveFolderStructure = payload.preserveFolderStructure !== 0;
  const maxFileSizeMb = Number.isFinite(payload.maxFileSizeMb) ? Number(payload.maxFileSizeMb) : 0;
  const maxFileSizeBytes = maxFileSizeMb > 0 ? Math.round(maxFileSizeMb * 1024 * 1024) : 0;
  const allowedTypes = Array.isArray(payload.allowedTypes)
    ? payload.allowedTypes.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
    : [];
  const dailyFileLimit = Number.isFinite(payload.dailyFileLimit) ? Number(payload.dailyFileLimit) : 0;
  const maxTotalMbPerDay = Number.isFinite(payload.maxTotalMbPerDay) ? Number(payload.maxTotalMbPerDay) : 0;

  const form = document.getElementById('shareDropUploadForm');
  const dropzone = document.getElementById('shareDropzone');
  const fileInput = document.getElementById('shareDropFileInput');
  const folderInput = document.getElementById('shareDropFolderInput');
  const chooseFilesBtn = document.getElementById('shareChooseFilesBtn');
  const chooseFolderBtn = document.getElementById('shareChooseFolderBtn');
  const queueEl = document.getElementById('shareDropQueue');
  const rulesEl = document.getElementById('shareDropRules');
  const breadcrumbsEl = document.getElementById('shareBreadcrumbs');
  const themeToggleBtn = document.getElementById('shareThemeToggle');
  const dropUploadErrorId = 'shareDropUploadError';

  if (!form || !dropzone || !fileInput || !folderInput || !queueEl) {
    return;
  }

  function ensureDropUploadErrorEl() {
    let el = document.getElementById(dropUploadErrorId);
    if (el) return el;

    el = document.createElement('div');
    el.id = dropUploadErrorId;
    el.className = 'fr-share-alert fr-share-alert-error fr-share-upload-error';
    el.setAttribute('role', 'alert');
    el.hidden = true;

    if (form.parentNode) {
      form.parentNode.insertBefore(el, form.nextSibling);
    }
    return el;
  }

  function clearDropUploadError() {
    const el = document.getElementById(dropUploadErrorId);
    if (!el) return;
    el.hidden = true;
    el.textContent = '';
  }

  function showDropUploadError(message, statusCode) {
    const el = ensureDropUploadErrorEl();
    if (!el) return;
    const reason = String(message || tx('share_upload_failed', null, 'Upload failed.')).trim()
      || tx('share_upload_failed', null, 'Upload failed.');
    const code = Number.isFinite(statusCode) && statusCode > 0 ? Math.trunc(statusCode) : 0;
    el.textContent = code > 0
      ? tx('share_upload_failed_http', { code, reason }, 'Upload failed (HTTP ' + code + '): ' + reason)
      : tx('share_upload_failed_message', { reason }, 'Upload failed: ' + reason);
    el.hidden = false;
  }

  const THEME_KEY = 'fr_share_theme';

  function getStoredTheme() {
    try {
      const t = localStorage.getItem(THEME_KEY);
      return (t === 'light' || t === 'dark') ? t : 'auto';
    } catch (e) {
      return 'auto';
    }
  }

  function setStoredTheme(theme) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {
      // ignore
    }
  }

  function getSystemTheme() {
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
      ? 'dark'
      : 'light';
  }

  function getActiveTheme(storedTheme) {
    return (storedTheme === 'light' || storedTheme === 'dark') ? storedTheme : getSystemTheme();
  }

  function applyTheme(theme) {
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.setAttribute('data-share-theme', theme);
    } else {
      document.documentElement.removeAttribute('data-share-theme');
    }
  }

  function updateThemeLabel(storedTheme) {
    if (!themeToggleBtn) return;
    const active = getActiveTheme(storedTheme);
    themeToggleBtn.textContent = active === 'dark' ? 'Light mode' : 'Dark mode';
  }

  if (themeToggleBtn) {
    const storedTheme = getStoredTheme();
    applyTheme(storedTheme);
    updateThemeLabel(storedTheme);

    themeToggleBtn.addEventListener('click', function () {
      const currentStored = getStoredTheme();
      const active = getActiveTheme(currentStored);
      const next = active === 'dark' ? 'light' : 'dark';
      setStoredTheme(next);
      applyTheme(next);
      updateThemeLabel(next);
    });
  }

  function getBasePathFromLocation() {
    try {
      let p = String(window.location.pathname || '');
      p = p.replace(/\/api\/folder\/shareFolder\.php$/i, '');
      p = p.replace(/\/+$/, '');
      if (!p || p === '/') return '';
      if (!p.startsWith('/')) p = '/' + p;
      return p;
    } catch (e) {
      return '';
    }
  }

  function withBasePath(path) {
    const base = getBasePathFromLocation();
    const s = String(path || '');
    if (!base || !s.startsWith('/')) return s;
    if (s === base || s.startsWith(base + '/')) return s;
    return base + s;
  }

  function buildShareUrl(path) {
    const urlParams = new URLSearchParams(window.location.search || '');
    const pass = urlParams.get('pass') || '';
    const passParam = pass ? '&pass=' + encodeURIComponent(pass) : '';
    const p = path ? '&path=' + encodeURIComponent(path) : '';
    return withBasePath('/api/folder/shareFolder.php?token=' + encodeURIComponent(token) + passParam + p);
  }

  function renderBreadcrumbs() {
    if (!breadcrumbsEl) return;
    while (breadcrumbsEl.firstChild) breadcrumbsEl.removeChild(breadcrumbsEl.firstChild);

    const rootLabel = (shareRoot && shareRoot !== 'root')
      ? shareRoot.split('/').pop()
      : tx('share_drop_root_label', null, 'Upload files');

    const rootLink = document.createElement('a');
    rootLink.href = buildShareUrl('');
    rootLink.textContent = rootLabel;
    breadcrumbsEl.appendChild(rootLink);

    if (!allowSubfolders || !currentPath) return;

    const parts = currentPath.split('/').filter(Boolean);
    let acc = '';
    parts.forEach((part) => {
      acc = acc ? acc + '/' + part : part;
      const sep = document.createElement('span');
      sep.className = 'fr-share-breadcrumb-sep';
      sep.textContent = '/';
      breadcrumbsEl.appendChild(sep);

      const link = document.createElement('a');
      link.href = buildShareUrl(acc);
      link.textContent = part;
      breadcrumbsEl.appendChild(link);
    });
  }

  function formatBytes(bytes) {
    const n = Number(bytes || 0);
    if (!Number.isFinite(n) || n <= 0) return '0 B';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(2) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(2) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }

  function renderRules() {
    if (!rulesEl) return;
    rulesEl.textContent = '';

    const parts = [];
    if (maxFileSizeMb > 0) {
      parts.push(tx('share_drop_rule_max_file_size', { mb: maxFileSizeMb }, 'Max file size: ' + maxFileSizeMb + ' MB'));
    }
    if (allowedTypes.length) {
      const joined = allowedTypes.join(', ');
      parts.push(tx('share_drop_rule_allowed_types', { types: joined }, 'Allowed types: ' + joined));
    }
    if (dailyFileLimit > 0) {
      parts.push(tx('share_drop_rule_daily_file_limit', { count: dailyFileLimit }, 'Daily file limit: ' + dailyFileLimit));
    }
    if (maxTotalMbPerDay > 0) {
      parts.push(tx('share_drop_rule_daily_size_limit', { mb: maxTotalMbPerDay }, 'Daily size limit: ' + maxTotalMbPerDay + ' MB'));
    }
    if (preserveFolderStructure) {
      parts.push(tx('share_drop_rule_preserve_structure', null, 'Folder structure is preserved when available.'));
    }

    if (!parts.length) return;

    parts.forEach((msg) => {
      const tag = document.createElement('span');
      tag.className = 'fr-share-rule-pill';
      tag.textContent = msg;
      rulesEl.appendChild(tag);
    });
  }

  function getExt(name) {
    const idx = name.lastIndexOf('.');
    if (idx === -1) return '';
    return name.slice(idx + 1).toLowerCase();
  }

  function sanitizeRelativePath(raw, fallbackName) {
    let path = String(raw || '').replace(/\\/g, '/').trim();
    path = path.replace(/^\/+/, '').replace(/\/+$/, '');
    if (!path) return fallbackName;
    path = path.replace(/\/+/g, '/');
    const parts = path.split('/').filter(Boolean);
    const clean = [];
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i].trim();
      if (!seg || seg === '.' || seg === '..') {
        continue;
      }
      clean.push(seg);
    }
    if (!clean.length) {
      return fallbackName;
    }
    return clean.join('/');
  }

  function getRelativePathForItem(file) {
    const raw = preserveFolderStructure
      ? (file.webkitRelativePath || file.relativePath || file.name)
      : file.name;
    return sanitizeRelativePath(raw, file.name);
  }

  function appendCommonFormData(formData) {
    const tokenInput = form.querySelector('input[name="token"]');
    const passInput = form.querySelector('input[name="pass"]');
    const pathInput = form.querySelector('input[name="path"]');
    const shareTokenInput = form.querySelector('input[name="share_upload_token"]');

    if (tokenInput && tokenInput.value) formData.append('token', tokenInput.value);
    if (passInput && passInput.value) formData.append('pass', passInput.value);
    if (pathInput && pathInput.value) formData.append('path', pathInput.value);
    if (shareTokenInput && shareTokenInput.value) formData.append('share_upload_token', shareTokenInput.value);
    formData.append('response', 'json');
  }

  function xhrJson(url, formData, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      if (typeof onProgress === 'function') {
        xhr.upload.addEventListener('progress', onProgress);
      }
      xhr.addEventListener('load', function () {
        let data = null;
        let rawMessage = '';
        try {
          data = JSON.parse(xhr.responseText || '{}');
        } catch (e) {
          rawMessage = String(xhr.responseText || '').replace(/\s+/g, ' ').trim();
          if (rawMessage.length > 180) {
            rawMessage = rawMessage.slice(0, 180) + '...';
          }
          data = { error: rawMessage || tx('share_upload_failed', null, 'Upload failed.') };
        }
        if (xhr.status >= 200 && xhr.status < 300 && !data.error) {
          resolve(data);
          return;
        }
        const msg = data && data.error
          ? String(data.error)
          : tx('share_upload_failed_http', {
            code: xhr.status,
            reason: tx('share_upload_failed', null, 'Upload failed.'),
          }, 'Upload failed (HTTP ' + xhr.status + ').');
        const err = new Error(msg);
        err.status = xhr.status || 0;
        reject(err);
      });
      xhr.addEventListener('error', function () {
        const err = new Error(tx('share_upload_network_error', null, 'Network error. Please check your connection and try again.'));
        err.status = 0;
        reject(err);
      });
      xhr.send(formData);
    });
  }

  const queue = [];
  const rows = new Map();
  let running = 0;
  let uploadSequence = 0;
  const MAX_CONCURRENT = 2;
  const CHUNK_THRESHOLD = 8 * 1024 * 1024;
  const CHUNK_SIZE = 2 * 1024 * 1024;
  const uploadUrl = form.getAttribute('action') || withBasePath('/api/folder/uploadToSharedFolder.php');

  function prependRow(parent, child) {
    if (!parent || !child) return;
    if (typeof parent.prepend === 'function') {
      parent.prepend(child);
      return;
    }
    if (parent.firstChild) {
      parent.insertBefore(child, parent.firstChild);
    } else {
      parent.appendChild(child);
    }
  }

  function isFileLike(file) {
    return !!file && typeof file === 'object' && typeof file.name === 'string';
  }

  function ensureRow(item) {
    if (rows.has(item.id)) return rows.get(item.id);

    const row = document.createElement('div');
    row.className = 'fr-share-queue-item';

    const head = document.createElement('div');
    head.className = 'fr-share-queue-head';

    const nameEl = document.createElement('div');
    nameEl.className = 'fr-share-queue-name';
    nameEl.textContent = item.relativePath;

    const statusEl = document.createElement('div');
    statusEl.className = 'fr-share-queue-status';
    statusEl.textContent = tx('share_drop_status_queued', null, 'Queued');

    head.appendChild(nameEl);
    head.appendChild(statusEl);

    const meta = document.createElement('div');
    meta.className = 'fr-share-queue-meta';
    meta.textContent = isFileLike(item.file) ? formatBytes(item.file.size) : '-';

    const progressWrap = document.createElement('div');
    progressWrap.className = 'fr-share-queue-progress';
    const progressFill = document.createElement('div');
    progressFill.className = 'fr-share-queue-progress-fill';
    progressFill.style.width = '0%';
    progressWrap.appendChild(progressFill);

    row.appendChild(head);
    row.appendChild(meta);
    row.appendChild(progressWrap);
    prependRow(queueEl, row);

    const refs = { row, statusEl, progressFill, meta };
    rows.set(item.id, refs);
    return refs;
  }

  function setItemStatus(item, status, pct, message) {
    const refs = ensureRow(item);
    item.status = status;
    item.progress = Math.max(0, Math.min(100, Math.round(Number(pct || 0))));
    refs.progressFill.style.width = item.progress + '%';

    if (status === 'uploading') {
      refs.row.classList.remove('is-error', 'is-done');
      refs.statusEl.textContent = message || tx('share_uploading_progress', { pct: item.progress }, 'Uploading ' + item.progress + '%');
      return;
    }
    if (status === 'done') {
      refs.row.classList.remove('is-error');
      refs.row.classList.add('is-done');
      refs.statusEl.textContent = message || tx('share_drop_status_uploaded', null, 'Uploaded');
      refs.progressFill.style.width = '100%';
      return;
    }
    if (status === 'error') {
      refs.row.classList.add('is-error');
      refs.row.classList.remove('is-done');
      refs.statusEl.textContent = message || tx('share_drop_status_failed', null, 'Failed');
      return;
    }
    refs.statusEl.textContent = message || tx('share_drop_status_queued', null, 'Queued');
  }

  function validateQueueItem(item) {
    if (!item || !isFileLike(item.file)) {
      return tx('share_drop_error_invalid_file', null, 'Invalid file.');
    }
    if (!allowSubfolders && String(item.relativePath || '').indexOf('/') !== -1) {
      return tx(
        'share_drop_error_subfolders_disabled',
        null,
        'Skipped: subfolder uploads are not enabled for this share.'
      );
    }
    if (maxFileSizeBytes > 0 && item.file.size > maxFileSizeBytes) {
      return tx(
        'share_drop_error_size_exceeded',
        { mb: maxFileSizeMb },
        'Skipped: file is larger than ' + maxFileSizeMb + ' MB.'
      );
    }
    if (allowedTypes.length) {
      const ext = getExt(item.file.name || '');
      if (!ext || !allowedTypes.includes(ext)) {
        return tx('share_drop_error_type_not_allowed', null, 'Skipped: file type not allowed.');
      }
    }
    return '';
  }

  function makeUploadId() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID().replace(/-/g, '');
      }
      if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
        const arr = new Uint8Array(16);
        window.crypto.getRandomValues(arr);
        return Array.from(arr).map((n) => n.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) {
      // ignore
    }
    uploadSequence += 1;
    return 'upl' + String(Date.now()) + '_' + String(uploadSequence);
  }

  async function uploadSingle(item) {
    const formData = new FormData();
    appendCommonFormData(formData);
    const rel = getRelativePathForItem(item.file);
    if (rel !== item.file.name) {
      formData.append('relativePath', rel);
    }
    formData.append('fileToUpload', item.file, item.file.name);

    await xhrJson(uploadUrl, formData, function (evt) {
      if (!evt.lengthComputable) return;
      const pct = Math.min(100, Math.max(0, Math.round((evt.loaded / evt.total) * 100)));
      setItemStatus(item, 'uploading', pct);
    });
  }

  async function uploadChunked(item) {
    const rel = getRelativePathForItem(item.file);
    const totalChunks = Math.max(1, Math.ceil(item.file.size / CHUNK_SIZE));
    const uploadId = makeUploadId();

    for (let index = 1; index <= totalChunks; index++) {
      const start = (index - 1) * CHUNK_SIZE;
      const end = Math.min(item.file.size, start + CHUNK_SIZE);
      const blob = item.file.slice(start, end);

      const formData = new FormData();
      appendCommonFormData(formData);
      formData.append('resumableChunkNumber', String(index));
      formData.append('resumableTotalChunks', String(totalChunks));
      formData.append('resumableIdentifier', uploadId);
      formData.append('resumableFilename', item.file.name);
      formData.append('resumableTotalSize', String(item.file.size));
      formData.append('resumableCurrentChunkSize', String(blob.size));
      if (rel) {
        formData.append('resumableRelativePath', rel);
      }
      formData.append('file', blob, item.file.name + '.part' + index);

      const maxAttempts = 3;
      let attempt = 0;
      let sent = false;
      while (attempt < maxAttempts && !sent) {
        attempt += 1;
        try {
          await xhrJson(uploadUrl, formData, function (evt) {
            if (!evt.lengthComputable) return;
            const chunkPct = evt.total > 0 ? (evt.loaded / evt.total) : 0;
            const base = (index - 1) / totalChunks;
            const pct = Math.round((base + (chunkPct / totalChunks)) * 100);
            setItemStatus(item, 'uploading', pct);
          });
          sent = true;
        } catch (err) {
          if (attempt >= maxAttempts) {
            throw err;
          }
        }
      }

      const donePct = Math.round((index / totalChunks) * 100);
      setItemStatus(item, 'uploading', donePct);
    }
  }

  async function uploadItem(item) {
    const validationMsg = validateQueueItem(item);
    if (validationMsg) {
      setItemStatus(item, 'error', 0, validationMsg);
      return;
    }

    setItemStatus(item, 'uploading', 0, tx('share_uploading_progress', { pct: 0 }, 'Uploading 0%'));
    if (item.file.size >= CHUNK_THRESHOLD && item.file.size > CHUNK_SIZE) {
      await uploadChunked(item);
    } else {
      await uploadSingle(item);
    }
    setItemStatus(item, 'done', 100, tx('share_drop_status_uploaded', null, 'Uploaded'));
  }

  function runQueue() {
    while (running < MAX_CONCURRENT) {
      const next = queue.find((q) => q.status === 'queued');
      if (!next) break;
      running += 1;
      setItemStatus(next, 'uploading', 0, tx('share_uploading_progress', { pct: 0 }, 'Uploading 0%'));
      uploadItem(next)
        .catch((err) => {
          const msg = err && err.message ? err.message : tx('share_upload_failed', null, 'Upload failed.');
          const statusCode = (err && Number.isFinite(err.status)) ? Number(err.status) : 0;
          setItemStatus(next, 'error', next.progress || 0, msg);
          showDropUploadError(msg, statusCode);
        })
        .finally(() => {
          running -= 1;
          runQueue();
        });
    }
  }

  function enqueueFiles(items) {
    if (!Array.isArray(items) || !items.length) return;

    clearDropUploadError();
    let added = 0;
    items.forEach((it) => {
      const file = it.file;
      if (!isFileLike(file)) return;

      const relativePath = sanitizeRelativePath(
        preserveFolderStructure ? (it.relativePath || file.webkitRelativePath || file.name) : file.name,
        file.name
      );

      const id = makeUploadId() + '_' + String(queue.length + 1);
      const row = {
        id,
        file,
        relativePath,
        status: 'queued',
        progress: 0
      };
      queue.push(row);
      setItemStatus(row, 'queued', 0, tx('share_drop_status_queued', null, 'Queued'));
      added += 1;
    });

    if (added === 0) {
      const synthetic = {
        id: makeUploadId() + '_invalid',
        file: { name: 'upload', size: 0 },
        relativePath: tx('share_upload_selection_unavailable', null, 'Selection unavailable'),
        status: 'error',
        progress: 0
      };
      const errMsg = tx('share_upload_selection_read_error', null, 'Could not read selected file.');
      setItemStatus(synthetic, 'error', 0, errMsg);
      showDropUploadError(errMsg, 0);
      return;
    }

    runQueue();
  }

  function filesFromInputList(list) {
    return Array.from(list || []).map((file) => ({
      file,
      relativePath: file.webkitRelativePath || file.name
    }));
  }

  function readAllDirectoryEntries(reader) {
    return new Promise((resolve) => {
      const entries = [];
      const readBatch = function () {
        reader.readEntries(function (batch) {
          if (!batch || !batch.length) {
            resolve(entries);
            return;
          }
          for (let i = 0; i < batch.length; i++) {
            entries.push(batch[i]);
          }
          readBatch();
        });
      };
      readBatch();
    });
  }

  async function walkEntry(entry, prefix) {
    if (!entry) return [];

    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file(function (file) {
          const rel = prefix ? (prefix + file.name) : file.name;
          resolve([{ file, relativePath: rel }]);
        }, function () {
          resolve([]);
        });
      });
    }

    if (!entry.isDirectory) {
      return [];
    }

    const reader = entry.createReader();
    const children = await readAllDirectoryEntries(reader);
    let out = [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const childPrefix = prefix + entry.name + '/';
      const nested = await walkEntry(child, childPrefix);
      out = out.concat(nested);
    }
    return out;
  }

  async function filesFromDropEvent(e) {
    const dt = e.dataTransfer;
    if (!dt) return [];

    if (dt.items && dt.items.length && typeof dt.items[0].webkitGetAsEntry === 'function') {
      let out = [];
      const entries = [];
      for (let i = 0; i < dt.items.length; i++) {
        const entry = dt.items[i].webkitGetAsEntry();
        if (entry) entries.push(entry);
      }
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (entry.isFile) {
          const file = dt.items[i].getAsFile ? dt.items[i].getAsFile() : null;
          if (file) {
            out.push({ file, relativePath: file.name });
          }
          continue;
        }
        const nested = await walkEntry(entry, '');
        out = out.concat(nested);
      }
      if (out.length) return out;
    }

    return filesFromInputList(dt.files || []);
  }

  if (chooseFilesBtn) {
    chooseFilesBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation(); // The surrounding dropzone also opens the file picker.
      fileInput.click();
    });
  }

  if (chooseFolderBtn) {
    chooseFolderBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      folderInput.click();
    });
  }

  fileInput.addEventListener('change', function (e) {
    const items = filesFromInputList(e.target.files || []);
    enqueueFiles(items);
    fileInput.value = '';
  });

  folderInput.addEventListener('change', function (e) {
    const items = filesFromInputList(e.target.files || []);
    enqueueFiles(items);
    folderInput.value = '';
  });

  ['dragenter', 'dragover'].forEach(function (name) {
    dropzone.addEventListener(name, function (e) {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('is-dragover');
    });
  });

  ['dragleave', 'drop'].forEach(function (name) {
    dropzone.addEventListener(name, function (e) {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('is-dragover');
    });
  });

  dropzone.addEventListener('drop', async function (e) {
    const items = await filesFromDropEvent(e);
    enqueueFiles(items);
  });

  dropzone.addEventListener('click', function () {
    fileInput.click();
  });

  dropzone.addEventListener('keydown', function (e) {
    if (e.target !== dropzone) return; // Nested buttons handle their own keyboard activation.
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  renderBreadcrumbs();
  renderRules();
});
