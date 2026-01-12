// public/js/portal.js
// Standalone client portal logic – no imports from main app JS to avoid DOM coupling.
import { patchFetchForBasePath, withBase } from './basePath.js?v={{APP_QVER}}';

// Ensure /api/* calls work when FileRise is mounted under a subpath (e.g. /fr).
patchFetchForBasePath();

let portal = null;
let portalFormDone = false;

// --- Portal helpers: folder + download flag -----------------
function portalFolder() {
  if (!portal) return 'root';
  return portal.folder || portal.targetFolder || portal.path || 'root';
}

function portalSourceId() {
  if (!portal) return '';
  const raw = portal.sourceId || portal.source || '';
  return typeof raw === 'string' ? raw.trim() : '';
}

function portalCanUpload() {
  if (!portal) return false;

  // Prefer explicit flags from backend (PortalController)
  if (typeof portal.canUpload !== 'undefined') {
    return !!portal.canUpload;
  }

  // Fallbacks for older bundles 
  if (typeof portal.allowUpload !== 'undefined') {
    return !!portal.allowUpload;
  }

  // Legacy behavior: portals were always upload-capable;
  // uploadOnly only controlled download visibility.
  return true;
}

function portalCanDownload() {
  if (!portal) return false;

  // Prefer explicit flag if present (PortalController)
  if (typeof portal.canDownload !== 'undefined') {
    return !!portal.canDownload;
  }

  // Fallback to allowDownload / allowDownloads (older payloads)
  if (typeof portal.allowDownload !== 'undefined') {
    return !!portal.allowDownload;
  }
  if (typeof portal.allowDownloads !== 'undefined') {
    return !!portal.allowDownloads;
  }

  // Legacy: uploadOnly = true => no downloads
  if (typeof portal.uploadOnly !== 'undefined') {
    return !portal.uploadOnly;
  }

  // Default: allow downloads
  return true;
}

function getPortalSlug() {
  return portal && (portal.slug || portal.label || '') || '';
}

function normalizeExtList(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[,\s]+/)
    .map(x => x.trim().replace(/^\./, '').toLowerCase())
    .filter(Boolean);
}

function getAllowedExts() {
  if (!portal || !portal.uploadExtWhitelist) return [];
  return normalizeExtList(portal.uploadExtWhitelist);
}

function getMaxSizeBytes() {
  if (!portal || !portal.uploadMaxSizeMb) return 0;
  const n = parseInt(portal.uploadMaxSizeMb, 10);
  if (!n || n <= 0) return 0;
  return n * 1024 * 1024;
}

// Simple per-browser-per-day counter; not true IP-based.
function applyUploadRateLimit(desiredCount) {
  if (!portal || !portal.uploadMaxPerDay) return desiredCount;

  const maxPerDay = parseInt(portal.uploadMaxPerDay, 10);
  if (!maxPerDay || maxPerDay <= 0) return desiredCount;

  const slug = getPortalSlug() || 'default';
  const today = new Date().toISOString().slice(0, 10);
  const key = 'portalUploadRate:' + slug;

  let state = { date: today, count: 0 };
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.date === today && typeof parsed.count === 'number') {
        state = parsed;
      }
    }
  } catch (e) {
    // ignore
  }

  if (state.count >= maxPerDay) {
    showToast('Daily upload limit reached for this portal.', 'warning');
    return 0;
  }

  const remaining = maxPerDay - state.count;
  if (desiredCount > remaining) {
    showToast('You can only upload ' + remaining + ' more file(s) today for this portal.', 'warning');
    return remaining;
  }

  return desiredCount;
}

function bumpUploadRateCounter(delta) {
  if (!portal || !portal.uploadMaxPerDay || !delta) return;

  const maxPerDay = parseInt(portal.uploadMaxPerDay, 10);
  if (!maxPerDay || maxPerDay <= 0) return;

  const slug = getPortalSlug() || 'default';
  const today = new Date().toISOString().slice(0, 10);
  const key = 'portalUploadRate:' + slug;

  let state = { date: today, count: 0 };
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.date === today && typeof parsed.count === 'number') {
        state = parsed.date === today ? parsed : state;
      }
    }
  } catch (e) {
    // ignore
  }

  if (state.date !== today) {
    state = { date: today, count: 0 };
  }

  state.count += delta;
  if (state.count < 0) state.count = 0;

  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch (e) {
    // ignore
  }
}

function showThankYouScreen() {
  if (!portal || !portal.showThankYou) return;

  const section = qs('portalThankYouSection');
  const msgEl   = document.getElementById('portalThankYouMessage');
  const upload  = qs('portalUploadSection');

  if (msgEl) {
    const text =
      (portal.thankYouText && portal.thankYouText.trim()) ||
      'Thank you. Your files have been uploaded successfully.';
    msgEl.textContent = text;
  }

  if (section) {
    section.style.display = 'block';
  }
  if (upload) {
    upload.style.opacity = '0.3';
  }
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

// ----------------- Form labels (custom captions) -----------------
function applyPortalFormLabels() {
  if (!portal) return;

  const labels   = portal.formLabels  || {};
  const required = portal.formRequired || {};

  const defs = [
    { key: 'name',      forId: 'portalFormName',      defaultLabel: 'Name' },
    { key: 'email',     forId: 'portalFormEmail',     defaultLabel: 'Email' },
    { key: 'reference', forId: 'portalFormReference', defaultLabel: 'Reference / Case / Order #' },
    { key: 'notes',     forId: 'portalFormNotes',     defaultLabel: 'Notes' },
  ];

  defs.forEach(def => {
    const labelEl = document.querySelector(`label[for="${def.forId}"]`);
    if (!labelEl) return;

    const base = (labels[def.key] || def.defaultLabel || '').trim() || def.defaultLabel;
    const isRequired = !!required[def.key];

    // Add a subtle "*" for required fields; skip if already added
    const text = isRequired && !base.endsWith('*') ? `${base} *` : base;
    labelEl.textContent = text;
  });
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
function showToast(message, durationOrTone = 2500, maybeTone) {
  const toast = document.getElementById('customToast');
  if (!toast) {
    console.warn('Toast:', message);
    return;
  }
  const text = (message == null) ? '' : String(message);
  let tone = '';
  let timeoutMs = 2500;

  if (typeof durationOrTone === 'number') {
    timeoutMs = durationOrTone;
  } else if (typeof durationOrTone === 'string') {
    tone = durationOrTone;
  }

  if (typeof maybeTone === 'string') {
    tone = maybeTone;
  } else if (typeof maybeTone === 'number' && typeof durationOrTone === 'string') {
    timeoutMs = maybeTone;
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    timeoutMs = 2500;
  }
  if (tone) {
    toast.dataset.tone = tone;
  } else {
    toast.removeAttribute('data-tone');
  }

  toast.textContent = text;
  toast.title = text.length > 160 ? text : '';
  toast.style.display = 'block';
  // Force reflow
  void toast.offsetWidth;
  toast.classList.add('show');

  if (toast.__hideTimer) clearTimeout(toast.__hideTimer);
  if (toast.__hideCleanupTimer) clearTimeout(toast.__hideCleanupTimer);

  toast.__hideTimer = setTimeout(() => {
    toast.classList.remove('show');
    toast.__hideCleanupTimer = setTimeout(() => {
      toast.style.display = 'none';
    }, 200);
  }, timeoutMs);
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
  } catch (e) {
    payload = text;
  }
  if (!res.ok) {
    throw payload;
  }
  return payload;
}

// ----------------- Portal form wiring -----------------
function setupPortalForm(slug) {
  const formSection   = qs('portalFormSection');
  const uploadSection = qs('portalUploadSection');

  if (!portal || !portal.requireForm || !portalCanUpload()) {
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

  const groupName      = qs('portalFormGroupName');
  const groupEmail     = qs('portalFormGroupEmail');
  const groupReference = qs('portalFormGroupReference');
  const groupNotes     = qs('portalFormGroupNotes');

  const labelName      = qs('portalFormLabelName');
  const labelEmail     = qs('portalFormLabelEmail');
  const labelReference = qs('portalFormLabelReference');
  const labelNotes     = qs('portalFormLabelNotes');

  const fd     = portal.formDefaults || {};
  const labels = portal.formLabels   || {};
  const visRaw = portal.formVisible  || portal.formVisibility || {};
  const req    = portal.formRequired || {};

  // default: visible when not specified
  const visible = {
    name:      visRaw.name      !== false,
    email:     visRaw.email     !== false,
    reference: visRaw.reference !== false,
    notes:     visRaw.notes     !== false,
  };

  // Apply labels (fallback to defaults)
  if (labelName)      labelName.textContent      = labels.name      || 'Name';
  if (labelEmail)     labelEmail.textContent     = labels.email     || 'Email';
  if (labelReference) labelReference.textContent = labels.reference || 'Reference / Case / Order #';
  if (labelNotes)     labelNotes.textContent     = labels.notes     || 'Notes';

  // Helper to (re)add the required star spans
  const setStar = (labelEl, isVisible, isRequired) => {
    if (!labelEl) return;
    // remove any previous star
    const old = labelEl.querySelector('.portal-required-star');
    if (old) old.remove();
    if (isVisible && isRequired) {
      const s = document.createElement('span');
      s.className = 'portal-required-star';
      s.textContent = ' *';
      labelEl.appendChild(s);
    }
  };

  // Show/hide groups
  if (groupName)      groupName.style.display      = visible.name      ? '' : 'none';
  if (groupEmail)     groupEmail.style.display     = visible.email     ? '' : 'none';
  if (groupReference) groupReference.style.display = visible.reference ? '' : 'none';
  if (groupNotes)     groupNotes.style.display     = visible.notes     ? '' : 'none';

  // Apply stars AFTER labels and visibility
  setStar(labelName,      visible.name,      !!req.name);
  setStar(labelEmail,     visible.email,     !!req.email);
  setStar(labelReference, visible.reference, !!req.reference);
  setStar(labelNotes,     visible.notes,     !!req.notes);

  // If literally no fields are visible, just treat as no form
  if (!visible.name && !visible.email && !visible.reference && !visible.notes) {
    portalFormDone = true;
    sessionStorage.setItem(key, '1');
    if (formSection) formSection.style.display = 'none';
    if (uploadSection) uploadSection.style.opacity = '1';
    return;
  }

  // Prefill defaults only for visible fields
  if (nameEl && visible.name && fd.name && !nameEl.value) {
    nameEl.value = fd.name;
  }
  if (emailEl && visible.email) {
    if (fd.email && !emailEl.value) {
      emailEl.value = fd.email;
    } else if (portal.clientEmail && !emailEl.value) {
      emailEl.value = portal.clientEmail;
    }
  }
  if (refEl && visible.reference && fd.reference && !refEl.value) {
    refEl.value = fd.reference;
  }
  if (notesEl && visible.notes && fd.notes && !notesEl.value) {
    notesEl.value = fd.notes;
  }

  if (!submitBtn) return;

  submitBtn.onclick = async () => {
    const name      = nameEl ? nameEl.value.trim()  : '';
    const email     = emailEl ? emailEl.value.trim() : '';
    const reference = refEl ? refEl.value.trim()    : '';
    const notes     = notesEl ? notesEl.value.trim() : '';

    const missing = [];

    // Only validate visible fields
    if (visible.name      && req.name      && !name)      missing.push(labels.name      || 'Name');
    if (visible.email     && req.email     && !email)     missing.push(labels.email     || 'Email');
    if (visible.reference && req.reference && !reference) missing.push(labels.reference || 'Reference');
    if (visible.notes     && req.notes     && !notes)     missing.push(labels.notes     || 'Notes');

    if (missing.length) {
      showToast('Please fill in: ' + missing.join(', ') + '.', 'warning');
      return;
    }

    // default behavior when no specific required flags:
    // at least name or email, but only if those fields are visible
    if (!req.name && !req.email && !req.reference && !req.notes) {
      const hasNameField  = visible.name;
      const hasEmailField = visible.email;
      if ((hasNameField || hasEmailField) && !name && !email) {
        showToast('Please provide at least a name or email.', 'warning');
        return;
      }
    }

    try {
      await submitPortalForm(slug, { name, email, reference, notes });
      portalFormDone = true;
      sessionStorage.setItem(key, '1');
      if (formSection) formSection.style.display = 'none';
      if (uploadSection) uploadSection.style.opacity = '1';
      showToast('Thank you. You can now upload files.', 'success');
    } catch (e) {
      console.error(e);
      showToast('Error saving your info. Please try again.', 'error');
    }
  };
}

// ----------------- CSRF helpers -----------------
function setCsrfToken(token) {
  if (!token) return;
  window.csrfToken = token;
  try {
    localStorage.setItem('csrf', token);
  } catch (e) {
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
  } catch (e) {
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
      window.location.href = withBase('/portal-login.html?redirect=' + target);
      return null;
    }
    const lbl = qs('portalUserLabel');
    if (lbl) {
      lbl.textContent = data.username || '';
    }
    return data;
  } catch (e) {
    const target = encodeURIComponent(window.location.href);
    window.location.href = withBase('/portal-login.html?redirect=' + target);
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
    showToast('Portal not found or expired.', 'error');
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
  const logoImg = document.querySelector('.portal-logo img');
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

    const bits = [];

    if (portal.uploadMaxSizeMb) {
      bits.push('Max file size: ' + portal.uploadMaxSizeMb + ' MB');
    }

    const exts = getAllowedExts();
    if (exts.length) {
      bits.push('Allowed types: ' + exts.join(', '));
    }

    if (portal.uploadMaxPerDay) {
      bits.push('Daily upload limit: ' + portal.uploadMaxPerDay + ' file(s)');
    }

    if (bits.length) {
      descEl.textContent += ' (' + bits.join(' • ') + ')';
    }
  }

  if (logoImg) {
    if (portal.logoUrl && portal.logoUrl.trim()) {
      logoImg.src = portal.logoUrl.trim();
    } else if (portal.logoFile && portal.logoFile.trim()) {
      // Fallback if backend only supplies logoFile
      logoImg.src = withBase('/uploads/profile_pics/' + encodeURIComponent(portal.logoFile.trim()));
    }
  }

  const uploadsEnabled   = portalCanUpload();
  const downloadsEnabled = portalCanDownload();

  if (subtitleEl) {
    let text = '';
    if (uploadsEnabled && downloadsEnabled) {
      text = 'Upload & download';
    } else if (uploadsEnabled && !downloadsEnabled) {
      text = 'Upload only';
    } else if (!uploadsEnabled && downloadsEnabled) {
      text = 'Download only';
    } else {
      text = 'Access only';
    }
    subtitleEl.textContent = text;
  }

  if (footerEl) {
    footerEl.textContent = portal.footerText && portal.footerText.trim()
      ? portal.footerText.trim()
      : '';
  }

  const formSection   = qs('portalFormSection');
  const uploadSection = qs('portalUploadSection');

  // If uploads are disabled, hide upload + form (form is only meaningful for uploads)
  if (!uploadsEnabled) {
    if (formSection) {
      formSection.style.display = 'none';
    }
    if (uploadSection) {
      uploadSection.style.display = 'none';
    }

    const statusEl = qs('portalStatus');
    if (statusEl) {
      statusEl.textContent = 'Uploads are disabled for this portal.';
      statusEl.classList.remove('text-muted');
      statusEl.classList.add('text-warning');
    }
  }
  applyPortalFormLabels();
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
    const sourceId = portalSourceId();
    const sourceParam = sourceId ? '&sourceId=' + encodeURIComponent(sourceId) : '';
    const data = await sendRequest('/api/file/getFileList.php?folder=' + encodeURIComponent(folder) + sourceParam, 'GET');
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
    const portalSlug = getPortalSlug();

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
        const thumbUrl = withBase(
          '/api/file/download.php?folder=' +
          encodeURIComponent(folder) +
          '&file=' + encodeURIComponent(fname) +
          '&inline=1&t=' + Date.now() +
          '&source=portal' +
          (portalSlug ? '&portal=' + encodeURIComponent(portalSlug) : '') +
          sourceParam
        );

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
        a.href = withBase(
          '/api/file/download.php?folder=' +
          encodeURIComponent(folder) +
          '&file=' + encodeURIComponent(fname) +
          '&source=portal' +
          (portalSlug ? '&portal=' + encodeURIComponent(portalSlug) : '') +
          sourceParam
        );
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

  if (!portalCanUpload()) {
    showToast('Uploads are disabled for this portal.', 'warning');
    setStatus('Uploads are disabled for this portal.', true);
    return;
  }

  if (portal.requireForm && !portalFormDone) {
    showToast('Please fill in your details before uploading.', 'warning');
    return;
  }

  let files = Array.from(fileList);
  if (!files.length) return;

  // 1) Filter by max size
  const maxBytes = getMaxSizeBytes();
  if (maxBytes > 0) {
    const tooBigNames = [];
    files = files.filter(f => {
      if (f.size && f.size > maxBytes) {
        tooBigNames.push(f.name || 'unnamed');
        return false;
      }
      return true;
    });
    if (tooBigNames.length) {
      showToast(
        'Skipped ' +
          tooBigNames.length +
          ' file(s) over ' +
          portal.uploadMaxSizeMb +
          ' MB.',
        'warning'
      );
    }
  }

  // 2) Filter by allowed extensions
  const allowedExts = getAllowedExts();
  if (allowedExts.length) {
    const skipped = [];
    files = files.filter(f => {
      const name = f.name || '';
      const parts = name.split('.');
      const ext = parts.length > 1 ? parts.pop().trim().toLowerCase() : '';
      if (!ext || !allowedExts.includes(ext)) {
        skipped.push(name || 'unnamed');
        return false;
      }
      return true;
    });
    if (skipped.length) {
      showToast(
        'Skipped ' +
          skipped.length +
          ' file(s) not matching allowed types: ' +
          allowedExts.join(', '),
        'warning'
      );
    }
  }

  if (!files.length) {
    setStatus('No files to upload after applying portal rules.', true);
    return;
  }

  // 3) Rate-limit per day (simple per-browser guard)
  const requestedCount = files.length;
  const allowedCount = applyUploadRateLimit(requestedCount);
  if (!allowedCount) {
    setStatus('Upload blocked by daily limit.', true);
    return;
  }
  if (allowedCount < requestedCount) {
    files = files.slice(0, allowedCount);
  }

  const folder = portalFolder();
  const portalSlug = getPortalSlug();
  const sourceId = portalSourceId();

  setStatus('Uploading ' + files.length + ' file(s)…');
  let successCount = 0;
  let failureCount = 0;

  for (const file of files) {
    const form = new FormData();

    const csrf = getCsrfToken() || '';

    // Match main upload.js
    form.append('file[]', file);
    form.append('folder', folder);
    form.append('source', 'portal');
    if (sourceId) {
      form.append('sourceId', sourceId);
    }
    if (portalSlug) {
      form.append('portal', portalSlug);
    }
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
            'X-CSRF-Token': csrf || '',
            'X-FR-Source': 'portal'
          },
          body: form
        });

        const text = await resp.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
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
    showToast('Upload complete.', 'success');
  } else if (successCount && failureCount) {
    setStatus('Uploaded ' + successCount + ' file(s), ' + failureCount + ' failed.', true);
    showToast('Some files failed to upload.', 'warning');
  } else {
    setStatus('Upload failed.', true);
    showToast('Upload failed.', 'error');
  }

  // Bump local daily counter by successful uploads
  if (successCount > 0) {
    bumpUploadRateCounter(successCount);
  }

  if (portalCanDownload()) {
    loadPortalFiles();
  }

  // Optional thank-you screen
  if (successCount > 0 && portal.showThankYou) {
    showThankYouScreen();
  }
}

// ----------------- Upload UI wiring -----------------
function wireUploadUI() {
  const drop       = qs('portalDropzone');
  const input      = qs('portalFileInput');
  const refreshBtn = qs('portalRefreshBtn');

  const uploadsEnabled   = portalCanUpload();
  const downloadsEnabled = portalCanDownload();

  // Upload UI
  if (drop) {
    if (!uploadsEnabled) {
      // Visually dim + disable clicks
      drop.classList.add('portal-dropzone-disabled');
      drop.style.cursor = 'not-allowed';
    }
  }

  if (uploadsEnabled && drop && input) {
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

  // Download / refresh
  if (refreshBtn) {
    if (!downloadsEnabled) {
      refreshBtn.style.display = 'none';
    } else {
      refreshBtn.addEventListener('click', () => {
        loadPortalFiles();
      });
    }
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
        } catch (e) {
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
    } catch (e) {
      const qs = window.location.search || '';
      const m = qs.match(/[?&]slug=([^&]+)/);
      return m && m[1] ? decodeURIComponent(m[1]).trim() : '';
    }
  }

async function initPortal() {
  const slug = getPortalSlugFromUrl();
  if (!slug) {
    setStatus('Missing portal slug.', true);
    showToast('Portal slug missing in URL.', 'error');
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
    showToast('Unexpected error loading portal.', 'error');
  });
});
