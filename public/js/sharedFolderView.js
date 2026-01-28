// sharedFolderView.js

document.addEventListener('DOMContentLoaded', function () {
  const dataEl = document.getElementById('shared-data');
  if (!dataEl) return;

  let payload = {};
  try {
    payload = JSON.parse(dataEl.textContent || '{}');
  } catch (e) {
    payload = {};
  }

  const token = String(payload.token || '');
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const shareRoot = String(payload.shareRoot || 'root');
  const currentPath = String(payload.path || '');
  const allowSubfolders = !!payload.allowSubfolders;
  const canDownloadAll = !!payload.canDownloadAll;
  const totalEntries = Number.isFinite(payload.totalEntries) ? payload.totalEntries : entries.length;

  const listEl = document.getElementById('shareListView');
  const galleryEl = document.getElementById('shareGalleryView');
  const emptyEl = document.getElementById('shareEmptyState');
  const searchEl = document.getElementById('shareSearchInput');
  const countEl = document.getElementById('shareCount');
  const toggleBtn = document.getElementById('toggleViewBtn');
  const downloadAllBtn = document.getElementById('downloadAllBtn');
  const themeToggleBtn = document.getElementById('shareThemeToggle');
  const uploadForm = document.querySelector('.fr-share-upload-form');

  const urlParams = new URLSearchParams(window.location.search || '');
  const pass = urlParams.get('pass') || '';
  const passParam = pass ? '&pass=' + encodeURIComponent(pass) : '';

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

    const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if (mq) {
      const handler = function () {
        const currentStored = getStoredTheme();
        if (currentStored !== 'light' && currentStored !== 'dark') {
          updateThemeLabel(currentStored);
        }
      };
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', handler);
      } else if (typeof mq.addListener === 'function') {
        mq.addListener(handler);
      }
    }

    themeToggleBtn.addEventListener('click', function () {
      const currentStored = getStoredTheme();
      const active = getActiveTheme(currentStored);
      const next = active === 'dark' ? 'light' : 'dark';
      setStoredTheme(next);
      applyTheme(next);
      updateThemeLabel(next);
    });
  }

  if (uploadForm && window.XMLHttpRequest && window.FormData) {
    const fileInput = uploadForm.querySelector('input[type="file"]');
    const submitBtn = uploadForm.querySelector('button[type="submit"]');
    const progressWrap = document.getElementById('shareUploadProgress');
    const progressFill = progressWrap ? progressWrap.querySelector('.fr-share-upload-progress-fill') : null;
    const progressText = document.getElementById('shareUploadProgressText');

    const setBusy = (busy) => {
      if (submitBtn) submitBtn.disabled = !!busy;
      if (fileInput) fileInput.disabled = !!busy;
    };

    const showProgress = () => {
      if (!progressWrap) return;
      progressWrap.hidden = false;
      progressWrap.classList.remove('is-error', 'is-indeterminate');
      if (progressFill) progressFill.style.width = '0%';
      if (progressText) progressText.textContent = 'Uploading...';
    };

    const setIndeterminate = () => {
      if (!progressWrap) return;
      progressWrap.classList.add('is-indeterminate');
      if (progressText) progressText.textContent = 'Uploading...';
    };

    const setProgress = (pct) => {
      if (progressWrap) progressWrap.classList.remove('is-indeterminate');
      if (progressFill) progressFill.style.width = pct + '%';
      if (progressText) progressText.textContent = 'Uploading... ' + pct + '%';
    };

    const setError = (msg) => {
      if (!progressWrap) return;
      progressWrap.classList.remove('is-indeterminate');
      progressWrap.classList.add('is-error');
      if (progressText) progressText.textContent = msg || 'Upload failed.';
    };

    uploadForm.addEventListener('submit', function (e) {
      if (!fileInput || !fileInput.files || !fileInput.files.length) return;
      if (uploadForm.dataset.busy === '1') {
        e.preventDefault();
        return;
      }

      e.preventDefault();
      uploadForm.dataset.busy = '1';
      showProgress();

      const formData = new FormData(uploadForm);
      const fileKey = (fileInput && fileInput.name) ? fileInput.name : 'fileToUpload';
      const existingFile = formData.get(fileKey);
      if (!(existingFile instanceof File) || !existingFile.name) {
        formData.set(fileKey, fileInput.files[0]);
      }
      setBusy(true);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadForm.action, true);

      xhr.upload.addEventListener('progress', function (evt) {
        if (evt.lengthComputable) {
          const pct = Math.min(100, Math.max(0, Math.round((evt.loaded / evt.total) * 100)));
          setProgress(pct);
        } else {
          setIndeterminate();
        }
      });

      xhr.addEventListener('load', function () {
        const ok = xhr.status >= 200 && xhr.status < 300;
        if (ok) {
          if (progressFill) progressFill.style.width = '100%';
          if (progressText) progressText.textContent = 'Upload complete. Refreshing...';
          window.location.reload();
          return;
        }

        let msg = '';
        try {
          const data = JSON.parse(xhr.responseText || '{}');
          if (data && data.error) msg = String(data.error);
        } catch (err) { }
        setError(msg || 'Upload failed.');
        uploadForm.dataset.busy = '0';
        setBusy(false);
      });

      xhr.addEventListener('error', function () {
        setError('Upload failed. Please try again.');
        uploadForm.dataset.busy = '0';
        setBusy(false);
      });

      xhr.send(formData);
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

  function joinPath(base, name) {
    const b = String(base || '').trim();
    if (!b) return name;
    return b.replace(/\/+$/, '') + '/' + name;
  }

  function buildShareUrl(path) {
    const p = path ? '&path=' + encodeURIComponent(path) : '';
    return withBasePath('/api/folder/shareFolder.php?token=' + encodeURIComponent(token) + passParam + p);
  }

  function buildDownloadFileUrl(path, inline) {
    const p = encodeURIComponent(path);
    const inl = inline ? '&inline=1' : '';
    return withBasePath('/api/folder/downloadSharedFile.php?token=' + encodeURIComponent(token) + passParam + '&path=' + p + inl);
  }

  function buildDownloadAllUrl(path) {
    const p = path ? '&path=' + encodeURIComponent(path) : '';
    return withBasePath('/api/folder/downloadSharedFolder.php?token=' + encodeURIComponent(token) + passParam + p);
  }

  function formatBytes(bytes) {
    if (bytes === null || typeof bytes === 'undefined') return '-';
    const n = Number(bytes);
    if (!Number.isFinite(n)) return '-';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(2) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(2) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }

  function formatDate(value) {
    if (!value) return '-';
    let ts = value;
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) ts = parsed;
    }
    if (typeof ts === 'number') {
      if (ts < 1000000000000) ts = ts * 1000;
      const d = new Date(ts);
      if (!Number.isNaN(d.getTime())) return d.toLocaleString();
    }
    return '-';
  }

  function getExt(name) {
    const idx = name.lastIndexOf('.');
    if (idx === -1) return '';
    return name.slice(idx + 1).toLowerCase();
  }

  const IMG_EXT = new Set(['jpg','jpeg','png','gif','bmp','webp','ico']);
  const VID_EXT = new Set(['mp4','mkv','webm','mov','ogv']);
  const AUD_EXT = new Set(['mp3','wav','m4a','ogg','flac','aac','wma','opus']);
  const PDF_EXT = new Set(['pdf']);

  function getPreviewType(name) {
    const ext = getExt(name);
    if (IMG_EXT.has(ext)) return 'image';
    if (VID_EXT.has(ext)) return 'video';
    if (AUD_EXT.has(ext)) return 'audio';
    if (PDF_EXT.has(ext)) return 'pdf';
    return '';
  }

  function renderBreadcrumbs() {
    const el = document.getElementById('shareBreadcrumbs');
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);

    const rootLabel = (shareRoot && shareRoot !== 'root')
      ? shareRoot.split('/').pop()
      : 'Shared folder';

    const rootLink = document.createElement('a');
    rootLink.href = buildShareUrl('');
    rootLink.textContent = rootLabel;
    el.appendChild(rootLink);

    if (!allowSubfolders || !currentPath) return;

    const parts = currentPath.split('/').filter(Boolean);
    let acc = '';
    parts.forEach((part) => {
      acc = acc ? acc + '/' + part : part;
      const sep = document.createElement('span');
      sep.className = 'fr-share-breadcrumb-sep';
      sep.textContent = '/';
      el.appendChild(sep);

      const link = document.createElement('a');
      link.href = buildShareUrl(acc);
      link.textContent = part;
      el.appendChild(link);
    });
  }

  function renderList(items) {
    if (!listEl) return;
    listEl.textContent = '';

    items.forEach((entry) => {
      const name = String(entry.name || '');
      const type = String(entry.type || 'file');
      const isFolder = type === 'folder';
      const fullPath = isFolder ? joinPath(currentPath, name) : joinPath(currentPath, name);

      const row = document.createElement('div');
      row.className = 'fr-share-row ' + (isFolder ? 'is-folder' : 'is-file');

      const nameCell = document.createElement('div');
      nameCell.className = 'fr-share-cell fr-share-cell-name';

      const icon = document.createElement('div');
      icon.className = 'fr-share-icon ' + (isFolder ? 'fr-share-icon-folder' : 'fr-share-icon-file');
      if (isFolder) {
        icon.textContent = 'DIR';
      } else {
        const ext = getExt(name).toUpperCase();
        icon.textContent = ext ? ext.slice(0, 4) : 'FILE';
      }

      const link = document.createElement('a');
      link.className = 'fr-share-link';
      link.textContent = name || '(unnamed)';
      link.title = name;
      if (isFolder) {
        link.href = buildShareUrl(fullPath);
      } else {
        link.href = buildDownloadFileUrl(fullPath, false);
      }

      nameCell.appendChild(icon);
      nameCell.appendChild(link);

      const sizeCell = document.createElement('div');
      sizeCell.className = 'fr-share-cell fr-share-cell-size';
      sizeCell.textContent = isFolder ? '-' : formatBytes(entry.size);

      const modCell = document.createElement('div');
      modCell.className = 'fr-share-cell fr-share-cell-modified';
      modCell.textContent = formatDate(entry.modified);

      const actionsCell = document.createElement('div');
      actionsCell.className = 'fr-share-cell fr-share-cell-actions';

      if (isFolder) {
        const openBtn = document.createElement('a');
        openBtn.className = 'fr-share-pill';
        openBtn.href = buildShareUrl(fullPath);
        openBtn.textContent = 'Open';
        actionsCell.appendChild(openBtn);
      } else {
        const previewType = getPreviewType(name);
        if (previewType) {
          const previewBtn = document.createElement('a');
          previewBtn.className = 'fr-share-pill';
          previewBtn.href = buildDownloadFileUrl(fullPath, true);
          previewBtn.target = '_blank';
          previewBtn.rel = 'noopener';
          previewBtn.textContent = 'Preview';
          actionsCell.appendChild(previewBtn);
        }
        const dlBtn = document.createElement('a');
        dlBtn.className = 'fr-share-pill fr-share-pill-primary';
        dlBtn.href = buildDownloadFileUrl(fullPath, false);
        dlBtn.textContent = 'Download';
        actionsCell.appendChild(dlBtn);
      }

      row.appendChild(nameCell);
      row.appendChild(sizeCell);
      row.appendChild(modCell);
      row.appendChild(actionsCell);
      listEl.appendChild(row);
    });
  }

  function renderGallery(items) {
    if (!galleryEl) return;
    galleryEl.textContent = '';

    items.forEach((entry) => {
      const name = String(entry.name || '');
      const type = String(entry.type || 'file');
      const isFolder = type === 'folder';
      const fullPath = joinPath(currentPath, name);

      const card = document.createElement('div');
      card.className = 'fr-share-card-item ' + (isFolder ? 'is-folder' : 'is-file');

      const preview = document.createElement('div');
      preview.className = 'fr-share-card-preview';

      if (isFolder) {
        const icon = document.createElement('div');
        icon.className = 'fr-share-icon fr-share-icon-folder';
        icon.textContent = 'DIR';
        preview.appendChild(icon);
      } else {
        const previewType = getPreviewType(name);
        if (previewType === 'image') {
          const img = document.createElement('img');
          img.src = buildDownloadFileUrl(fullPath, true);
          img.alt = name;
          preview.appendChild(img);
        } else {
          const icon = document.createElement('div');
          icon.className = 'fr-share-icon fr-share-icon-file';
          const ext = getExt(name).toUpperCase();
          icon.textContent = ext ? ext.slice(0, 4) : 'FILE';
          preview.appendChild(icon);
        }
      }

      const meta = document.createElement('div');
      meta.className = 'fr-share-card-meta';

      const title = document.createElement('div');
      title.className = 'fr-share-card-title';
      title.textContent = name || '(unnamed)';
      meta.appendChild(title);

      if (!isFolder) {
        const sub = document.createElement('div');
        sub.className = 'fr-share-card-sub';
        sub.textContent = formatBytes(entry.size);
        meta.appendChild(sub);
      }

      card.appendChild(preview);
      card.appendChild(meta);

      card.addEventListener('click', function () {
        if (isFolder) {
          window.location.href = buildShareUrl(fullPath);
        } else {
          const previewType = getPreviewType(name);
          if (previewType) {
            window.open(buildDownloadFileUrl(fullPath, true), '_blank', 'noopener');
          } else {
            window.location.href = buildDownloadFileUrl(fullPath, false);
          }
        }
      });

      galleryEl.appendChild(card);
    });
  }

  function updateCounts(filteredCount) {
    if (!countEl) return;
    const total = entries.length;
    if (filteredCount !== total) {
      countEl.textContent = filteredCount + ' of ' + total + ' items';
    } else {
      countEl.textContent = total + ' items';
    }
  }

  function applyFilter() {
    const term = (searchEl && searchEl.value) ? searchEl.value.trim().toLowerCase() : '';
    if (!term) return entries.slice();
    return entries.filter((entry) => String(entry.name || '').toLowerCase().includes(term));
  }

  function renderAll() {
    const filtered = applyFilter();
    const hasItems = filtered.length > 0;

    if (emptyEl) emptyEl.style.display = hasItems ? 'none' : '';
    if (listEl) listEl.style.display = viewMode === 'list' && hasItems ? '' : (viewMode === 'list' ? '' : 'none');
    if (galleryEl) galleryEl.style.display = viewMode === 'gallery' && hasItems ? '' : (viewMode === 'gallery' ? '' : 'none');

    if (hasItems) {
      renderList(filtered);
      renderGallery(filtered);
    } else {
      if (listEl) listEl.textContent = '';
      if (galleryEl) galleryEl.textContent = '';
    }
    updateCounts(filtered.length);
  }

  let viewMode = 'list';
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function () {
      viewMode = viewMode === 'list' ? 'gallery' : 'list';
      toggleBtn.textContent = viewMode === 'list' ? 'Gallery' : 'List';
      renderAll();
    });
  }

  if (searchEl) {
    searchEl.addEventListener('input', function () {
      renderAll();
    });
  }

  if (downloadAllBtn) {
    if (!canDownloadAll) {
      downloadAllBtn.disabled = true;
      downloadAllBtn.title = 'Download all is unavailable on this storage.';
    } else {
      downloadAllBtn.addEventListener('click', function () {
        window.location.href = buildDownloadAllUrl(currentPath);
      });
    }
  }

  renderBreadcrumbs();
  renderAll();
});
