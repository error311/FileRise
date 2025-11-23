// public/js/portal.js
// Standalone client portal logic – no imports from main app JS to avoid DOM coupling.

let portal = null;
let portalFormDone = false;

// --- Portal helpers: folder + download flag -----------------
function portalFolder() {
  if (!portal) return 'root';
  return portal.folder || portal.targetFolder || portal.path || 'root';
}

function portalCanDownload() {
  if (!portal) return false;

  // Prefer explicit flags if present
  if (typeof portal.allowDownload !== 'undefined') {
    return !!portal.allowDownload;
  }
  if (typeof portal.allowDownloads !== 'undefined') {
    return !!portal.allowDownloads;
  }

  // Fallback: uploadOnly = true => no downloads
  if (typeof portal.uploadOnly !== 'undefined') {
    return !portal.uploadOnly;
  }

  // Default: allow downloads
  return true;
}

// ----------------- DOM helpers / status -----------------
function qs(id) {
  return document.getElementById(id);
}

function setStatus(msg, isError = false) {
  const el = qs('portalStatus');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('text-danger', !!isError);
  if (!isError) {
    el.classList.add('text-muted');
  }
}

// ----------------- Form submit -----------------
async function submitPortalForm(slug, formData) {
  const payload = {
    slug,
    form: formData
  };
  const headers = { 'X-CSRF-Token': getCsrfToken() || '' };
  const res = await sendRequest('/api/pro/portals/submitForm.php', 'POST', payload, headers);
  if (!res || !res.success) {
    throw new Error((res && res.error) || 'Error saving form.');
  }
}

// ----------------- Toast -----------------
function showToast(message) {
  const toast = document.getElementById('customToast');
  if (!toast) {
    console.warn('Toast:', message);
    return;
  }
  toast.textContent = message;
  toast.style.display = 'block';
  // Force reflow
  void toast.offsetWidth;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.style.display = 'none';
    }, 200);
  }, 2500);
}

// ----------------- Fetch wrapper -----------------
async function sendRequest(url, method = 'GET', data = null, customHeaders = {}) {
  const options = {
    method,
    credentials: 'include',
    headers: { ...customHeaders }
  };

  if (data && !(data instanceof FormData)) {
    options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';
    options.body = JSON.stringify(data);
  } else if (data instanceof FormData) {
    options.body = data;
  }

  const res = await fetch(url, options);
  const text = await res.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }
  if (!res.ok) {
    throw payload;
  }
  return payload;
}

// ----------------- Portal form wiring -----------------
function setupPortalForm(slug) {
  const formSection = qs('portalFormSection');
  const uploadSection = qs('portalUploadSection');

  if (!portal || !portal.requireForm) {
    if (formSection) formSection.style.display = 'none';
    if (uploadSection) uploadSection.style.opacity = '1';
    return;
  }

  const key = 'portalFormDone:' + slug;
  if (sessionStorage.getItem(key) === '1') {
    portalFormDone = true;
    if (formSection) formSection.style.display = 'none';
    if (uploadSection) uploadSection.style.opacity = '1';
    return;
  }

  portalFormDone = false;
  if (formSection) formSection.style.display = 'block';
  if (uploadSection) uploadSection.style.opacity = '0.5';

  const nameEl    = qs('portalFormName');
  const emailEl   = qs('portalFormEmail');
  const refEl     = qs('portalFormReference');
  const notesEl   = qs('portalFormNotes');
  const submitBtn = qs('portalFormSubmit');

  const fd = portal.formDefaults || {};

  if (nameEl && fd.name && !nameEl.value) {
    nameEl.value = fd.name;
  }
  if (emailEl && fd.email && !emailEl.value) {
    emailEl.value = fd.email;
  } else if (emailEl && portal.clientEmail && !emailEl.value) {
    // fallback to clientEmail
    emailEl.value = portal.clientEmail;
  }
  if (refEl && fd.reference && !refEl.value) {
    refEl.value = fd.reference;
  }
  if (notesEl && fd.notes && !notesEl.value) {
    notesEl.value = fd.notes;
  }

  if (!submitBtn) return;

  submitBtn.onclick = async () => {
    const name      = nameEl ? nameEl.value.trim() : '';
    const email     = emailEl ? emailEl.value.trim() : '';
    const reference = refEl ? refEl.value.trim() : '';
    const notes     = notesEl ? notesEl.value.trim() : '';

    const req = portal.formRequired || {};
    const missing = [];

    if (req.name && !name)           missing.push('name');
    if (req.email && !email)         missing.push('email');
    if (req.reference && !reference) missing.push('reference');
    if (req.notes && !notes)         missing.push('notes');

    if (missing.length) {
      showToast('Please fill in: ' + missing.join(', ') + '.');
      return;
    }

    // default behavior when no specific required flags:
    if (!req.name && !req.email && !req.reference && !req.notes) {
      if (!name && !email) {
        showToast('Please provide at least a name or email.');
        return;
      }
    }

    try {
      await submitPortalForm(slug, { name, email, reference, notes });
      portalFormDone = true;
      sessionStorage.setItem(key, '1');
      if (formSection) formSection.style.display = 'none';
      if (uploadSection) uploadSection.style.opacity = '1';
      showToast('Thank you. You can now upload files.');
    } catch (e) {
      console.error(e);
      showToast('Error saving your info. Please try again.');
    }
  };
}

// ----------------- CSRF helpers -----------------
function setCsrfToken(token) {
  if (!token) return;
  window.csrfToken = token;
  try {
    localStorage.setItem('csrf', token);
  } catch {
    // ignore
  }
  let meta = document.querySelector('meta[name="csrf-token"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'csrf-token';
    document.head.appendChild(meta);
  }
  meta.content = token;
}

function getCsrfToken() {
  return window.csrfToken || (document.querySelector('meta[name="csrf-token"]')?.content) || '';
}

async function loadCsrfToken() {
  const res = await fetch('/api/auth/token.php', { method: 'GET', credentials: 'include' });

  const hdr = res.headers.get('X-CSRF-Token');
  if (hdr) setCsrfToken(hdr);

  let body = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }

  const token = body.csrf_token || getCsrfToken();
  setCsrfToken(token);
}

// ----------------- Auth -----------------
async function ensureAuthenticated() {
  try {
    const data = await sendRequest('/api/auth/checkAuth.php', 'GET');
    if (!data || !data.username) {
      // redirect to main UI/login; after login, user can re-open portal link
      const target = encodeURIComponent(window.location.href);
window.location.href = '/portal-login.html?redirect=' + target;
      return null;
    }
    const lbl = qs('portalUserLabel');
    if (lbl) {
      lbl.textContent = data.username || '';
    }
    return data;
  } catch (e) {
    const target = encodeURIComponent(window.location.href);
window.location.href = '/portal-login.html?redirect=' + target;
    return null;
  }
}

// ----------------- Portal fetch + render -----------------
async function fetchPortal(slug) {
  setStatus('Loading portal details…');
  try {
    const data = await sendRequest('/api/pro/portals/get.php?slug=' + encodeURIComponent(slug), 'GET');
    if (!data || !data.success || !data.portal) {
      throw new Error((data && data.error) || 'Portal not found.');
    }
    portal = data.portal;
    return portal;
  } catch (e) {
    console.error(e);
    setStatus('This portal could not be found or is no longer available.', true);
    showToast('Portal not found or expired.');
    return null;
  }
}

function renderPortalInfo() {
  if (!portal) return;
  const titleEl    = qs('portalTitle');
  const descEl     = qs('portalDescription');
  const subtitleEl = qs('portalSubtitle');
  const brandEl    = document.getElementById('portalBrandHeading');
  const footerEl   = document.getElementById('portalFooter');
  const drop       = qs('portalDropzone');
  const card       = document.querySelector('.portal-card');
  const formBtn    = qs('portalFormSubmit');
  const refreshBtn = qs('portalRefreshBtn');
  const filesSection = qs('portalFilesSection');

  const heading = portal.title && portal.title.trim()
    ? portal.title.trim()
    : (portal.label || portal.slug || 'Client portal');

  if (titleEl)  titleEl.textContent  = heading;
  if (brandEl)  brandEl.textContent  = heading;

  if (descEl) {
    if (portal.introText && portal.introText.trim()) {
      descEl.textContent = portal.introText.trim();
    } else {
      const folder = portalFolder();
      descEl.textContent = 'Files you upload here go directly into: ' + folder;
    }
  }

  if (subtitleEl) {
    const parts = [];
    if (portal.uploadOnly) parts.push('upload only');
    if (portalCanDownload()) parts.push('download allowed');
    subtitleEl.textContent = parts.length ? parts.join(' • ') : '';
  }

  if (footerEl) {
    footerEl.textContent = portal.footerText && portal.footerText.trim()
      ? portal.footerText.trim()
      : '';
  }

  const color = portal.brandColor && portal.brandColor.trim();
  if (color) {
    // expose brand color as a CSS variable for gallery styling
    document.documentElement.style.setProperty('--portal-accent', color);

    if (drop) {
      drop.style.borderColor = color;
    }
    if (card) {
      card.style.borderTop = '3px solid ' + color;
    }
    if (formBtn) {
      formBtn.style.backgroundColor = color;
      formBtn.style.borderColor = color;
    }
    if (refreshBtn) {
      refreshBtn.style.borderColor = color;
      refreshBtn.style.color = color;
    }
  }

  // Show/hide files section based on download capability
  if (filesSection) {
    filesSection.style.display = portalCanDownload() ? 'block' : 'none';
  }
}

// ----------------- File helpers for gallery -----------------
function formatFileSizeLabel(f) {
  // API currently returns f.size as a human-readable string, so prefer that
  if (f && f.size) return f.size;
  return '';
}

function fileExtLabel(name) {
  if (!name) return 'FILE';
  const parts = name.split('.');
  if (parts.length < 2) return 'FILE';
  const ext = parts.pop().trim().toUpperCase();
  if (!ext) return 'FILE';
  return ext.length <= 4 ? ext : ext.slice(0, 4);
}

function isImageName(name) {
  if (!name) return false;
  return /\.(jpe?g|png|gif|bmp|webp|svg)$/i.test(name);
}

// ----------------- Load files for portal gallery -----------------
async function loadPortalFiles() {
  if (!portal || !portalCanDownload()) return;

  const listEl = qs('portalFilesList');
  if (!listEl) return;

  listEl.innerHTML = '<div class="text-muted" style="padding:4px 0;">Loading files…</div>';

  try {
    const folder = portalFolder();
    const data = await sendRequest('/api/file/getFileList.php?folder=' + encodeURIComponent(folder), 'GET');
    if (!data || data.error) {
      const msg = (data && data.error) ? data.error : 'Error loading files.';
      listEl.innerHTML = '<div class="text-danger" style="padding:4px 0;">' + msg + '</div>';
      return;
    }

    // Normalize files: handle both array and object-return shapes
    let files = [];
    if (Array.isArray(data.files)) {
      files = data.files;
    } else if (data.files && typeof data.files === 'object') {
      files = Object.entries(data.files).map(([name, meta]) => {
        const f = meta || {};
        f.name = name;
        return f;
      });
    }

    if (!files.length) {
      listEl.innerHTML = '<div class="text-muted" style="padding:4px 0;">No files in this portal yet.</div>';
      return;
    }

    const accent = portal.brandColor && portal.brandColor.trim();

    listEl.innerHTML = '';
    listEl.classList.add('portal-files-grid'); // gallery layout

    const MAX = 24;
    const slice = files.slice(0, MAX);

    slice.forEach(f => {
      const card = document.createElement('div');
      card.className = 'portal-file-card';

      const icon = document.createElement('div');
      icon.className = 'portal-file-card-icon';

      const main = document.createElement('div');
      main.className = 'portal-file-card-main';

      const nameEl = document.createElement('div');
      nameEl.className = 'portal-file-card-name';
      nameEl.textContent = f.name || 'Unnamed file';

      const metaEl = document.createElement('div');
      metaEl.className = 'portal-file-card-meta text-muted';
      metaEl.textContent = formatFileSizeLabel(f);

      main.appendChild(nameEl);
      main.appendChild(metaEl);

      const actions = document.createElement('div');
      actions.className = 'portal-file-card-actions';

      // Thumbnail vs extension badge
      const fname = f.name || '';
      const folder = portalFolder();

      if (isImageName(fname)) {
        const thumbUrl =
          '/api/file/download.php?folder=' +
          encodeURIComponent(folder) +
          '&file=' + encodeURIComponent(fname) +
          '&inline=1&t=' + Date.now();

        const img = document.createElement('img');
        img.src = thumbUrl;
        img.alt = fname;
        // 🔧 constrain image so it doesn't fill the whole list
        img.style.maxWidth = '100%';
        img.style.maxHeight = '120px';
        img.style.objectFit = 'cover';
        img.style.display = 'block';
        img.style.borderRadius = '6px';

        icon.appendChild(img);
      } else {
        icon.textContent = fileExtLabel(fname);
      }

      if (accent) {
        icon.style.borderColor = accent;
      }

      if (portalCanDownload()) {
        const a = document.createElement('a');
        a.href = '/api/file/download.php?folder=' +
          encodeURIComponent(folder) +
          '&file=' + encodeURIComponent(fname);
        a.textContent = 'Download';
        a.className = 'portal-file-card-download';
        a.target = '_blank';
        a.rel = 'noopener';
        actions.appendChild(a);
      }

      card.appendChild(icon);
      card.appendChild(main);
      card.appendChild(actions);

      listEl.appendChild(card);
    });

    if (files.length > MAX) {
      const more = document.createElement('div');
      more.className = 'portal-files-more text-muted';
      more.textContent = 'And ' + (files.length - MAX) + ' more…';
      listEl.appendChild(more);
    }
  } catch (e) {
    console.error(e);
    listEl.innerHTML = '<div class="text-danger" style="padding:4px 0;">Error loading files.</div>';
  }
}

// ----------------- Upload -----------------
async function uploadFiles(fileList) {
  if (!portal || !fileList || !fileList.length) return;
  if (portal.requireForm && !portalFormDone) {
    showToast('Please fill in your details before uploading.');
    return;
  }

  const files = Array.from(fileList);
  const folder = portalFolder();

  setStatus('Uploading ' + files.length + ' file(s)…');
  let successCount = 0;
  let failureCount = 0;

  for (const file of files) {
    const form = new FormData();

    const csrf = getCsrfToken() || '';

    // Match main upload.js
    form.append('file[]', file);
    form.append('folder', folder);
    if (csrf) {
      form.append('upload_token', csrf);  // legacy alias, but your controller supports it
    }

    let retried = false;
    while (true) {
      try {
        const resp = await fetch('/api/upload/upload.php', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'X-CSRF-Token': csrf || ''
          },
          body: form
        });

        const text = await resp.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = {};
        }

        if (data && data.csrf_expired && data.csrf_token) {
          setCsrfToken(data.csrf_token);
          if (!retried) {
            retried = true;
            continue;
          }
        }

        if (!resp.ok || (data && data.error)) {
          failureCount++;
          console.error('Upload error:', data || text);
        } else {
          successCount++;
        }
        break;
      } catch (e) {
        console.error('Upload error:', e);
        failureCount++;
        break;
      }
    }
  }

  if (successCount && !failureCount) {
    setStatus('Uploaded ' + successCount + ' file(s).');
    showToast('Upload complete.');
  } else if (successCount && failureCount) {
    setStatus('Uploaded ' + successCount + ' file(s), ' + failureCount + ' failed.', true);
    showToast('Some files failed to upload.');
  } else {
    setStatus('Upload failed.', true);
    showToast('Upload failed.');
  }

  if (portalCanDownload()) {
    loadPortalFiles();
  }
}

// ----------------- Upload UI wiring -----------------
function wireUploadUI() {
  const drop = qs('portalDropzone');
  const input = qs('portalFileInput');
  const refreshBtn = qs('portalRefreshBtn');

  if (drop && input) {
    drop.addEventListener('click', () => input.click());

    input.addEventListener('change', (e) => {
      const files = e.target.files;
      if (files && files.length) {
        uploadFiles(files);
        input.value = '';
      }
    });

    ['dragenter', 'dragover'].forEach(ev => {
      drop.addEventListener(ev, e => {
        e.preventDefault();
        e.stopPropagation();
        drop.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(ev => {
      drop.addEventListener(ev, e => {
        e.preventDefault();
        e.stopPropagation();
        drop.classList.remove('dragover');
      });
    });

    drop.addEventListener('drop', e => {
      const dt = e.dataTransfer;
      if (!dt || !dt.files || !dt.files.length) return;
      uploadFiles(dt.files);
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadPortalFiles();
    });
  }
}

// ----------------- Slug + init -----------------
function getPortalSlugFromUrl() {
    try {
      const url = new URL(window.location.href);
  
      // 1) Normal case: slug is directly in query (?slug=portal-xxxxx)
      let slug = url.searchParams.get('slug');
      if (slug && slug.trim()) {
        return slug.trim();
      }
  
      // 2) Pretty URL: /portal/<slug>
      //    e.g. /portal/portal-h46ozd
      const pathMatch = url.pathname.match(/\/portal\/([^\/?#]+)/i);
      if (pathMatch && pathMatch[1]) {
        return pathMatch[1].trim();
      }
  
      // 3) Fallback: slug inside redirect param
      //    e.g. ?redirect=/portal.html?slug=portal-h46ozd
      const redirect = url.searchParams.get('redirect');
      if (redirect) {
        try {
          const redirectUrl = new URL(redirect, window.location.origin);
          const innerSlug = redirectUrl.searchParams.get('slug');
          if (innerSlug && innerSlug.trim()) {
            return innerSlug.trim();
          }
        } catch {
          // ignore parse errors
        }
  
        const m = redirect.match(/[?&]slug=([^&]+)/);
        if (m && m[1]) {
          return decodeURIComponent(m[1]).trim();
        }
      }
  
      // 4) Final fallback: old regex on our own query string
      const qs = window.location.search || '';
      const m2 = qs.match(/[?&]slug=([^&]+)/);
      return m2 && m2[1] ? decodeURIComponent(m2[1]).trim() : '';
    } catch {
      const qs = window.location.search || '';
      const m = qs.match(/[?&]slug=([^&]+)/);
      return m && m[1] ? decodeURIComponent(m[1]).trim() : '';
    }
  }

async function initPortal() {
  const slug = getPortalSlugFromUrl();
  if (!slug) {
    setStatus('Missing portal slug.', true);
    showToast('Portal slug missing in URL.');
    return;
  }

  try {
    await loadCsrfToken();
  } catch (e) {
    console.warn('CSRF load failed (may be fine if unauthenticated yet).', e);
  }

  const auth = await ensureAuthenticated();
  if (!auth) return;

  const p = await fetchPortal(slug);
  if (!p) return;

  renderPortalInfo();
  setupPortalForm(slug);
  wireUploadUI();

  if (portalCanDownload()) {
    loadPortalFiles();
  }

  setStatus('Ready.');
}

document.addEventListener('DOMContentLoaded', () => {
  initPortal().catch(err => {
    console.error(err);
    setStatus('Unexpected error initializing portal.', true);
    showToast('Unexpected error loading portal.');
  });
});