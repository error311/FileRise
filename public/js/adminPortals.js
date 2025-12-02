import { t } from './i18n.js?v={{APP_QVER}}';
import { showToast } from './domUtils.js?v={{APP_QVER}}';

// ─────────────────────────────
//  Portal intake presets
// ─────────────────────────────
const PORTAL_INTAKE_PRESETS = {
  legal: {
    label: 'Legal intake',
    title: 'Secure legal document upload',
    introText:
      'Upload engagement letters, signed agreements, IDs, and supporting documents here. ' +
      'Please avoid emailing sensitive files.',
    footerText:
      'If you uploaded something in error, contact our office. Please do not share this link.',
    brandColor: '#2563eb',
    requireForm: true,
    formVisible: {
      name: true,
      email: true,
      reference: true,
      notes: true,
    },
    formLabels: {
      name: 'Full legal name',
      email: 'Email address',
      reference: 'Matter / case #',
      notes: 'Notes for our team',
    },
    formDefaults: {
      name: '',
      email: '',
      reference: '',
      notes: '',
    },
    formRequired: {
      name: true,
      email: true,
      reference: true,
      notes: false,
    },
  },

  tax: {
    label: 'Tax client',
    title: 'Tax documents upload',
    introText:
      'Upload your tax documents (W-2s, 1099s, statements, prior returns, etc.). ' +
      'Please avoid emailing sensitive files.',
    footerText:
      'If you are unsure what to upload, contact our office before sending files.',
    brandColor: '#16a34a',
    requireForm: true,
    formVisible: {
      name: true,
      email: true,
      reference: true,
      notes: true,
    },
    formLabels: {
      name: 'Name (as on tax return)',
      email: 'Contact email',
      reference: 'Tax year(s)',
      notes: 'Notes / special situations',
    },
    formDefaults: {
      name: '',
      email: '',
      reference: '',
      notes: '',
    },
    formRequired: {
      name: true,
      email: true,
      reference: true,
      notes: false,
    },
  },

  order: {
    label: 'Order / RMA',
    title: 'Order / RMA upload',
    introText:
      'Upload photos of the item, receipts, and any supporting documents for your order or return.',
    footerText:
      'Include your order or RMA number so we can locate your purchase quickly.',
    brandColor: '#eab308',
    requireForm: true,
    formVisible: {
      name: true,
      email: true,
      reference: true,
      notes: true,
    },
    formLabels: {
      name: 'Contact name',
      email: 'Email for updates',
      reference: 'Order # / RMA #',
      notes: 'Describe the issue / reason for return',
    },
    formDefaults: {
      name: '',
      email: '',
      reference: '',
      notes: '',
    },
    formRequired: {
      name: false,
      email: true,
      reference: true,
      notes: true,
    },
  },
};

// Tiny JSON helper (same behavior as in adminPanel.js)
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

// Reusable custom confirm using #customConfirmModal from index.html
function portalConfirm(message) {
    const modal   = document.getElementById('customConfirmModal');
    const msgEl   = document.getElementById('confirmMessage');
    const yesBtn  = document.getElementById('confirmYesBtn');
    const noBtn   = document.getElementById('confirmNoBtn');
  
    // Fallback to window.confirm if modal isn't present
    if (!modal || !msgEl || !yesBtn || !noBtn) {
      return Promise.resolve(window.confirm(message));
    }
  
    msgEl.textContent = message;
    modal.style.display = 'block';
  
    return new Promise(resolve => {
      const cleanup = () => {
        modal.style.display = 'none';
        yesBtn.removeEventListener('click', onYes);
        noBtn.removeEventListener('click', onNo);
        // optional: close on backdrop click
        modal.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onEsc);
      };
  
      const onYes = (e) => {
        e?.preventDefault?.();
        cleanup();
        resolve(true);
      };
  
      const onNo = (e) => {
        e?.preventDefault?.();
        cleanup();
        resolve(false);
      };
  
      const onBackdrop = (e) => {
        if (e.target === modal) {
          cleanup();
          resolve(false);
        }
      };
  
      const onEsc = (e) => {
        if (e.key === 'Escape') {
          cleanup();
          resolve(false);
        }
      };
  
      yesBtn.addEventListener('click', onYes);
      noBtn.addEventListener('click', onNo);
      modal.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onEsc);
    });
  }

async function fetchAllPortals() {
  const res = await fetch('/api/pro/portals/list.php', {
    credentials: 'include',
    headers: { 'X-CSRF-Token': window.csrfToken || '' }
  });
  const data = await safeJson(res);
  return data && typeof data === 'object' && data.portals && typeof data.portals === 'object'
    ? data.portals
    : {};
}

async function saveAllPortals(portals) {
  const res = await fetch('/api/pro/portals/save.php', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': window.csrfToken || ''
    },
    body: JSON.stringify({ portals })
  });
  return await safeJson(res);
}

let __portalsCache = {};
// Shared folder list for portal folder picker (reuses getFolderList.php like folderManager.js)
let __portalFolderListLoaded = false;
let __portalFolderOptions = [];

// Cache portal submissions per slug for CSV export
const __portalSubmissionsCache = {};

async function loadPortalFolderList() {
  if (__portalFolderListLoaded) return __portalFolderOptions;
  try {
    const res = await fetch('/api/folder/getFolderList.php', { credentials: 'include' });
    const data = await res.json();
    let list = data;

    // Support both shapes: ["A/B", "C/D"] or [{ folder: "A/B" }, ...]
    if (Array.isArray(list) && list.length && typeof list[0] === 'object' && list[0].folder) {
      list = list.map(it => it.folder);
    }

    __portalFolderOptions = (list || [])
      .filter(Boolean)
      .filter(f => f !== 'trash' && f !== 'profile_pics');

    __portalFolderListLoaded = true;
  } catch (e) {
    console.error('Error loading portal folder list', e);
    __portalFolderOptions = [];
    __portalFolderListLoaded = true;
  }
  return __portalFolderOptions;
}

// ─────────────────────────────────────────
//  Public entry point from adminPanel.js
// ─────────────────────────────────────────
export async function openClientPortalsModal() {
  const isDark = document.body.classList.contains('dark-mode');
  const overlayBg = isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.3)';
  const contentBg = isDark ? '#2c2c2c' : '#fff';
  const contentFg = isDark ? '#e0e0e0' : '#000';
  const borderCol = isDark ? '#555' : '#ccc';

  let modal = document.getElementById('clientPortalsModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'clientPortalsModal';
    modal.style.cssText = `
      position:fixed; inset:0; background:${overlayBg};
      display:flex; align-items:center; justify-content:center; z-index:3650;
    `;
    modal.innerHTML = `
      <div class="modal-content"
           style="background:${contentBg}; color:${contentFg};
                  padding:16px; max-width:980px; width:95%;
                  position:relative;
                  border:1px solid ${borderCol}; max-height:90vh; overflow:auto;">
        <span id="closeClientPortalsModal"
              class="editor-close-btn"
              style="right:8px; top:8px;">&times;</span>

        <h3>Client Portals</h3>
        <p class="muted" style="margin-top:-6px;">
          Create upload portals that point to specific folders. Clients can upload
          (and optionally download) files without seeing your full FileRise UI.
        </p>

        <div class="d-flex justify-content-between align-items-center" style="margin:8px 0 10px;">
          <button type="button" id="addPortalBtn" class="btn btn-sm btn-success">
            <i class="material-icons" style="font-size:16px;">cloud_upload</i>
            <span style="margin-left:4px;">Add portal</span>
          </button>
          <span id="clientPortalsStatus" class="small text-muted"></span>
        </div>

        <div id="clientPortalsBody" style="max-height:60vh; overflow:auto; margin-bottom:12px;">
          ${t('loading')}…
        </div>

        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button type="button" id="cancelClientPortals" class="btn btn-secondary">${t('cancel')}</button>
          <button type="button" id="saveClientPortals"   class="btn btn-primary">${t('save_settings')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('closeClientPortalsModal').onclick = () => (modal.style.display = 'none');
    document.getElementById('cancelClientPortals').onclick = () => (modal.style.display = 'none');
    document.getElementById('saveClientPortals').onclick = saveClientPortalsFromUI;
    document.getElementById('addPortalBtn').onclick = addEmptyPortalRow;
  } else {
    modal.style.background = overlayBg;
    const content = modal.querySelector('.modal-content');
    if (content) {
      content.style.background = contentBg;
      content.style.color = contentFg;
      content.style.border = `1px solid ${borderCol}`;
    }
  }

  modal.style.display = 'flex';
  await loadClientPortalsList();
}

// ─────────────────────────────────────────
//  Internal helpers – same behavior as now
// ─────────────────────────────────────────

async function loadClientPortalsList(useCacheOnly) {
  const body = document.getElementById('clientPortalsBody');
  const status = document.getElementById('clientPortalsStatus');
  if (!body) return;

  body.textContent = `${t('loading')}…`;
  if (status) {
    status.textContent = '';
    status.className = 'small text-muted';
  }

  try {
    let portals;
    if (useCacheOnly && __portalsCache && Object.keys(__portalsCache).length) {
      portals = __portalsCache;
    } else {
      portals = await fetchAllPortals();
      __portalsCache = portals || {};
    }

    const slugs = Object.keys(__portalsCache).sort((a, b) => a.localeCompare(b));
    if (!slugs.length) {
      body.innerHTML = `<p class="muted">No client portals defined yet. Click “Add portal” to create one.</p>`;
      return;
    }

    let html = '';
    slugs.forEach(slug => {
      const origin = window.location.origin || '';
      const portalPath = '/portal/' + encodeURIComponent(slug);
      const portalUrl = origin ? origin + portalPath : portalPath;

      const p = __portalsCache[slug] || {};
      const label = p.label || slug;
      const folder = p.folder || '';
      const clientEmail = p.clientEmail || '';
      const uploadOnly = !!p.uploadOnly;
      const allowDownload = p.allowDownload !== false; // default true
      const expiresAt = p.expiresAt ? String(p.expiresAt).slice(0, 10) : '';
      const brandColor = p.brandColor || '';
      const footerText = p.footerText || '';

      const formDefaults = p.formDefaults || {};
      const formRequired = p.formRequired || {};
      const formLabels   = p.formLabels   || {};
      const formVisible  = p.formVisible  || {};

      const uploadMaxSizeMb    = typeof p.uploadMaxSizeMb === 'number'
      ? p.uploadMaxSizeMb
      : (p.uploadMaxSizeMb ? parseInt(p.uploadMaxSizeMb, 10) || 0 : 0);

    const uploadExtWhitelist = p.uploadExtWhitelist || '';

    const uploadMaxPerDay    = typeof p.uploadMaxPerDay === 'number'
      ? p.uploadMaxPerDay
      : (p.uploadMaxPerDay ? parseInt(p.uploadMaxPerDay, 10) || 0 : 0);

    const showThankYou  = !!p.showThankYou;
    const thankYouText  = p.thankYouText || '';

      const defName  = formDefaults.name      || '';
      const defEmail = formDefaults.email     || '';
      const defRef   = formDefaults.reference || '';
      const defNotes = formDefaults.notes     || '';

      const lblName  = formLabels.name      || 'Name';
      const lblEmail = formLabels.email     || 'Email';
      const lblRef   = formLabels.reference || 'Reference / Case / Order #';
      const lblNotes = formLabels.notes     || 'Notes';

      const visibleName  = formVisible.name !== false;
      const visibleEmail = formVisible.email !== false;
      const visibleRef   = formVisible.reference !== false;
      const visibleNotes = formVisible.notes !== false;

      const title = p.title || '';
      const introText = p.introText || '';
      const requireForm = !!p.requireForm;

      html += `
        <div class="card portal-card" data-portal-slug="${slug}">
          <div class="portal-card-header" tabindex="0" role="button" aria-expanded="true">
            <span class="portal-card-caret">▸</span>
            <div class="portal-card-header-main">
              <strong>${label}</strong>
              <span class="portal-card-slug">${slug}</span>
            </div>
          </div>

          <button type="button"
                  class="btn btn-sm btn-danger portal-card-delete"
                  data-portal-action="delete"
                  title="Delete portal">
            <i class="material-icons" style="font-size:22px;">delete</i>
          </button>

          <div class="portal-card-body">
            <div class="portal-meta-row">
              <label style="font-weight:600;">
                Portal slug:
                <input type="text"
                       class="form-control form-control-sm"
                       data-portal-field="slug"
                       value="${slug}"
                       style="display:inline-block; width:160px; margin-left:4px;">
              </label>
              <label>
                Display name:
                <input type="text"
                       class="form-control form-control-sm"
                       data-portal-field="label"
                       value="${label}"
                       style="display:inline-block; width:220px; margin-left:4px;">
              </label>
            </div>

            <div class="portal-meta-row">
              <div class="portal-folder-row">
                <label>
                  Folder:
                  <input type="text"
                         class="form-control form-control-sm portal-folder-input"
                         data-portal-field="folder"
                         value="${folder}"
                         placeholder="e.g. Clients/Smith-Law-1234"
                         style="display:inline-block; width:260px; margin-left:4px;">
                </label>
                <button type="button"
                        class="btn btn-sm btn-outline-secondary ms-1 portal-folder-browse-btn">
                  Browse…
                </button>
              </div>
              <small class="text-muted" style="font-size:0.8rem;">
                URL:
                <a href="${portalPath}" target="_blank" rel="noopener">
                  ${portalUrl}
                </a>
              </small>
            </div>

            <div class="portal-meta-row">
              <label>
                Client email (optional):
                <input type="email"
                       class="form-control form-control-sm"
                       data-portal-field="clientEmail"
                       value="${clientEmail}"
                       style="display:inline-block; width:220px; margin-left:4px;" />
              </label>

              <div class="portal-expires-group">
                <label for="portal-exp-${slug}" class="mb-0">Expires:</label>
                <input
                  id="portal-exp-${slug}"
                  type="date"
                  class="form-control form-control-sm portal-expiry-input"
                  data-portal-field="expiresAt"
                  value="${expiresAt}"
                />
              </div>

              <label style="display:flex; align-items:center; gap:4px;">
                <input type="checkbox"
                       data-portal-field="uploadOnly"
                       ${uploadOnly ? 'checked' : ''} />
                <span>Upload only</span>
              </label>

              <label style="display:flex; align-items:center; gap:4px;">
                <input type="checkbox"
                       data-portal-field="allowDownload"
                       ${allowDownload ? 'checked' : ''} />
                <span>Allow download</span>
              </label>
            </div>

            <div style="margin-top:8px;">
              <div class="form-group" style="margin-bottom:6px;">
                <label style="margin:0;">
                  Portal title (optional):
                  <input type="text"
                         class="form-control form-control-sm"
                         data-portal-field="title"
                         value="${title}"
                         placeholder="e.g. Acme Corp – Secure Upload"
                         style="display:inline-block; width:260px; margin-left:4px;" />
                </label>
              </div>
              <div class="form-group" style="margin-bottom:6px;">
                <label style="margin:0; display:block;">
                  Instructions (shown on portal page):
                  <textarea class="form-control form-control-sm"
                            data-portal-field="introText"
                            rows="2"
                            placeholder="Describe what the client should upload, deadlines, etc.">${introText}</textarea>
                </label>
              </div>
              <label style="margin:0; display:flex; align-items:center; gap:4px;">
                <input type="checkbox"
                       data-portal-field="requireForm"
                       ${requireForm ? 'checked' : ''} />
                <span>Require info form before upload</span>
              </label>
            </div>

                        <div style="margin-top:8px;">
              <div class="form-group" style="margin-bottom:6px;">
                <label style="margin:0;">
                  Accent color:
                  <input type="text"
                         class="form-control form-control-sm"
                         data-portal-field="brandColor"
                         value="${brandColor}"
                         placeholder="#0b5ed7"
                         style="display:inline-block; width:120px; margin-left:4px;" />
                </label>
              </div>

              <div class="form-group" style="margin-bottom:6px;">
                <label style="margin:0; display:block;">
                  Footer text (shown at bottom of portal):
                  <textarea class="form-control form-control-sm"
                            data-portal-field="footerText"
                            rows="2"
                            placeholder="e.g. Confidential – do not share this link.">${footerText}</textarea>
                </label>
              </div>


                            <div class="form-group" style="margin-bottom:6px;">
                <strong style="font-size:0.85rem;">Upload rules</strong>
                <div class="text-muted" style="font-size:0.75rem; margin-top:2px;">
                  Optional per-portal limits. Leave blank / zero to use global defaults.
                </div>
              </div>

              <div class="form-row" style="margin-bottom:6px;">
                <div class="col-sm-4" style="margin-bottom:6px;">
                  <label style="margin:0; font-size:0.8rem;">Max file size (MB)</label>
                  <input type="number"
                         min="0"
                         class="form-control form-control-sm"
                         data-portal-field="uploadMaxSizeMb"
                         value="${uploadMaxSizeMb || ''}"
                         placeholder="e.g. 50">
                </div>
                <div class="col-sm-4" style="margin-bottom:6px;">
                  <label style="margin:0; font-size:0.8rem;">Allowed extensions</label>
                  <input type="text"
                         class="form-control form-control-sm"
                         data-portal-field="uploadExtWhitelist"
                         value="${uploadExtWhitelist || ''}"
                         placeholder="e.g. pdf,jpg,png">
                  <small class="text-muted" style="font-size:0.7rem;">
                    Comma-separated, no dots. Empty = allow all.
                  </small>
                </div>
                <div class="col-sm-4" style="margin-bottom:6px;">
                  <label style="margin:0; font-size:0.8rem;">Max uploads per day</label>
                  <input type="number"
                         min="0"
                         class="form-control form-control-sm"
                         data-portal-field="uploadMaxPerDay"
                         value="${uploadMaxPerDay || ''}"
                         placeholder="e.g. 50">
                  <small class="text-muted" style="font-size:0.7rem;">
                    Simple per-browser guard; 0 = unlimited.
                  </small>
                </div>
              </div>

              <div class="form-group" style="margin-bottom:8px;">
                <strong style="font-size:0.85rem;">Thank-you screen</strong>
                <div class="text-muted" style="font-size:0.75rem; margin-top:2px;">
                  Optionally show a message after a successful upload.
                </div>

                <label style="margin:4px 0; display:flex; align-items:center; gap:6px; font-size:0.8rem;">
                  <input type="checkbox"
                         data-portal-field="showThankYou"
                         ${showThankYou ? 'checked' : ''}>
                  <span>Show thank-you screen after upload</span>
                </label>

                <textarea class="form-control form-control-sm"
                          data-portal-field="thankYouText"
                          rows="2"
                          placeholder="e.g. Thank you for submitting your documents. Our team will review them shortly.">${thankYouText}</textarea>
              </div>

                            <div class="form-group" style="margin-bottom:6px;">
                <label style="margin:0; display:block;">
                  Portal logo:
                  <input type="text"
                         class="form-control form-control-sm"
                         data-portal-field="logoFile"
                         value="${p.logoFile || ''}"
                         placeholder="e.g. acme-portal.png" />
                </label>
                <div style="margin-top:4px; display:flex; align-items:center; gap:8px;">
                  <button type="button"
                class="btn btn-sm btn-primary portal-logo-upload-btn"
                style="min-width: 120px;">
                Upload logo…
                    </button>
                  <small class="text-muted" style="font-size:0.75rem;">
                    File is stored under <code>profile_pics</code>. Leave blank to use the default FileRise logo.
                  </small>
                </div>
              </div>

                          <div class="form-group" style="margin-bottom:4px;">
              <strong style="font-size:0.85rem;">Intake form</strong>
              <div class="text-muted" style="font-size:0.75rem; margin-top:2px;">
                Customize field labels shown on the portal, plus optional defaults &amp; required flags.
              </div>

                            <div style="margin-top:4px;">
                <label style="font-size:0.75rem; margin:0;">
                  Preset:
                  <select class="form-control form-control-sm portal-intake-preset"
                          style="display:inline-block; width:200px; margin-left:4px;">
                    <option value="">Choose preset…</option>
                    <option value="legal">Legal intake</option>
                    <option value="tax">Tax client</option>
                    <option value="order">Order / RMA</option>
                  </select>
                </label>
              </div>

                              <div class="col-sm-6" style="margin-bottom:6px;">
                  <label style="margin:0; font-size:0.8rem;">Name label</label>
                  <input type="text"
                         class="form-control form-control-sm"
                         data-portal-field="lblName"
                         value="${lblName}">
                  <label style="margin:4px 0 0; font-size:0.8rem;">Name default</label>
                  <input type="text"
                         class="form-control form-control-sm"
                         data-portal-field="defName"
                         value="${defName}">
                  <div style="margin-top:2px; display:flex; align-items:center; gap:8px; font-size:0.75rem;">
                    <label style="margin:0;">
                      <input type="checkbox"
                             data-portal-field="visName"
                             ${visibleName ? 'checked' : ''}>
                      show
                    </label>
                    <label style="margin:0;">
                      <input type="checkbox"
                             data-portal-field="reqName"
                             ${formRequired.name ? 'checked' : ''}>
                      required
                    </label>
                  </div>
                </div>

                                <div class="col-sm-6" style="margin-bottom:6px;">
                  <label style="margin:0; font-size:0.8rem;">Email label</label>
                  <input type="text"
                         class="form-control form-control-sm"
                         data-portal-field="lblEmail"
                         value="${lblEmail}">
                  <label style="margin:4px 0 0; font-size:0.8rem;">Email default</label>
                  <input type="text"
                         class="form-control form-control-sm"
                         data-portal-field="defEmail"
                         value="${defEmail}">
                  <div style="margin-top:2px; display:flex; align-items:center; gap:8px; font-size:0.75rem;">
                    <label style="margin:0;">
                      <input type="checkbox"
                             data-portal-field="visEmail"
                             ${visibleEmail ? 'checked' : ''}>
                      show
                    </label>
                    <label style="margin:0;">
                      <input type="checkbox"
                             data-portal-field="reqEmail"
                             ${formRequired.email ? 'checked' : ''}>
                      required
                    </label>
                  </div>
                </div>

                              <div class="col-sm-6" style="margin-bottom:6px;">
                  <label style="margin:0; font-size:0.8rem;">Reference label</label>
                  <input type="text"
                         class="form-control form-control-sm"
                         data-portal-field="lblRef"
                         value="${lblRef}">
                  <label style="margin:4px 0 0; font-size:0.8rem;">Reference default</label>
                  <input type="text"
                         class="form-control form-control-sm"
                         data-portal-field="defRef"
                         value="${defRef}">
                  <div style="margin-top:2px; display:flex; align-items:center; gap:8px; font-size:0.75rem;">
                    <label style="margin:0;">
                      <input type="checkbox"
                             data-portal-field="visRef"
                             ${visibleRef ? 'checked' : ''}>
                      show
                    </label>
                    <label style="margin:0;">
                      <input type="checkbox"
                             data-portal-field="reqRef"
                             ${formRequired.reference ? 'checked' : ''}>
                      required
                    </label>
                  </div>
                </div>

                                <div class="col-sm-6" style="margin-bottom:6px;">
                  <label style="margin:0; font-size:0.8rem;">Notes label</label>
                  <input type="text"
                         class="form-control form-control-sm"
                         data-portal-field="lblNotes"
                         value="${lblNotes}">
                  <label style="margin:4px 0 0; font-size:0.8rem;">Notes default</label>
                  <input type="text"
                         class="form-control form-control-sm"
                         data-portal-field="defNotes"
                         value="${defNotes}">
                  <div style="margin-top:2px; display:flex; align-items:center; gap:8px; font-size:0.75rem;">
                    <label style="margin:0;">
                      <input type="checkbox"
                             data-portal-field="visNotes"
                             ${visibleNotes ? 'checked' : ''}>
                      show
                    </label>
                    <label style="margin:0;">
                      <input type="checkbox"
                             data-portal-field="reqNotes"
                             ${formRequired.notes ? 'checked' : ''}>
                      required
                    </label>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div> <!-- /.portal-card-body -->
        </div>
      `;
    });

    body.innerHTML = html;

    // Wire collapse / expand, live label updates, etc. for each portal card
    body.querySelectorAll('.portal-card').forEach(card => {
      const header = card.querySelector('.portal-card-header');
      const bodyEl = card.querySelector('.portal-card-body');
      const caret = card.querySelector('.portal-card-caret');
      const headerLabelEl = card.querySelector('.portal-card-header-main strong');
      const headerSlugEl = card.querySelector('.portal-card-slug');
      const labelInput = card.querySelector('[data-portal-field="label"]');
      const slugInput = card.querySelector('[data-portal-field="slug"]');

      if (labelInput && headerLabelEl) {
        labelInput.addEventListener('input', () => {
          const val = labelInput.value.trim();
          headerLabelEl.textContent = val || '(unnamed portal)';
        });
      }

      if (slugInput && headerSlugEl) {
        slugInput.addEventListener('input', () => {
          const raw = slugInput.value.trim();
          headerSlugEl.textContent = raw || card.getAttribute('data-portal-slug') || '';
        });
      }

      if (!header || !bodyEl) return;

      const setExpanded = (expanded) => {
        header.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        bodyEl.style.display = expanded ? 'block' : 'none';
        if (caret) {
          caret.textContent = expanded ? '▾' : '▸';
        }
      };

      setExpanded(false);

      const toggle = () => {
        const expanded = header.getAttribute('aria-expanded') === 'true';
        setExpanded(!expanded);
      };

      header.addEventListener('click', toggle);
      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });
    });

    // Wire delete buttons (with custom confirm modal)
body.querySelectorAll('[data-portal-action="delete"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.card');
      if (!card) return;
  
      const slug = card.getAttribute('data-portal-slug') || '';
      const labelInput = card.querySelector('[data-portal-field="label"]');
      const name = (labelInput && labelInput.value.trim()) || slug || 'this portal';
  
      const ok = await portalConfirm(
        `Delete portal "${name}"?\n\n` +
        `Existing links for this portal will stop working once you click “Save settings”.`
      );
      if (!ok) return;
  
      if (slug && __portalsCache[slug]) {
        delete __portalsCache[slug];
      }
      card.remove();
    });
  });
        // Keep submissions viewer working
        attachPortalSubmissionsUI();
        // Intake presets dropdowns
        attachPortalPresetSelectors();
        // Attach folder pickers (browse button / optional integration with global picker)
        attachPortalFolderPickers();
        // Portal logo uploaders
        attachPortalLogoUploaders();


  } catch (e) {
    console.error(e);
    body.innerHTML = `<p class="text-danger">Error loading client portals.</p>`;
    if (status) {
      status.textContent = 'Error loading client portals.';
      status.className = 'small text-danger';
    }
  }
}

function addEmptyPortalRow() {
  if (!__portalsCache || typeof __portalsCache !== 'object') {
    __portalsCache = {};
  }

  let base = 'portal-' + Math.random().toString(36).slice(2, 8);
  let slug = base;
  let i = 1;
  while (__portalsCache[slug]) {
    slug = `${base}-${i++}`;
  }

  __portalsCache[slug] = {
    label: 'New client portal',
    folder: '',
    clientEmail: '',
    uploadOnly: true,
    allowDownload: false,
    expiresAt: ''
  };

  loadClientPortalsList(true);
}

// ─────────────────────
//  Folder picker helpers
// ─────────────────────

function attachPortalFolderPickers() {
    const body = document.getElementById('clientPortalsBody');
    if (!body) return;
  
    body.querySelectorAll('.portal-card').forEach(card => {
      const input = card.querySelector('[data-portal-field="folder"]');
      const browseBtn = card.querySelector('.portal-folder-browse-btn');
      if (!input) return;
  
      if (input.dataset._portalFolderPickerBound === '1') return;
      input.dataset._portalFolderPickerBound = '1';
  
      // Preferred path: if you ever add a central folder picker, use it:
      const useNativePicker = typeof window.FileRiseFolderPicker === 'function';
  
      const openPicker = async () => {
        if (useNativePicker) {
          try {
            const folder = await window.FileRiseFolderPicker({
              current: input.value || '',
              mode: 'select-folder',
              source: 'client-portals'
            });
            if (folder) input.value = folder;
            return;
          } catch (e) {
            console.error('Folder picker error', e);
            showToast('Could not open folder picker.');
            return;
          }
        }
  
        // Fallback: datalist built from /api/folder/getFolderList.php
        try {
          let datalist = document.getElementById('portalFolderList');
          if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = 'portalFolderList';
            document.body.appendChild(datalist);
  
            const folders = await loadPortalFolderList();
            datalist.innerHTML = '';
            folders.forEach(f => {
              const opt = document.createElement('option');
              opt.value = f;
              datalist.appendChild(opt);
            });
          }
  
          input.setAttribute('list', 'portalFolderList');
          input.focus();
          input.select();
        } catch (e) {
          console.error('Error preparing folder list', e);
          input.focus();
          input.select();
        }
      };
  
      // Clicking or focusing the input prepares the list
      input.addEventListener('focus', openPicker);
      input.addEventListener('click', openPicker);
  
      // Browse button does the same thing
      if (browseBtn && !browseBtn.__frFolderPickerBound) {
        browseBtn.__frFolderPickerBound = true;
        browseBtn.addEventListener('click', (e) => {
          e.preventDefault();
          openPicker();
        });
      }
    });
  }

  function attachPortalLogoUploaders() {
    const body = document.getElementById('clientPortalsBody');
    if (!body) return;
  
    body.querySelectorAll('.portal-card').forEach(card => {
      const uploadBtn = card.querySelector('.portal-logo-upload-btn');
      if (!uploadBtn) return;
      if (uploadBtn.__frLogoBound) return;
      uploadBtn.__frLogoBound = true;
  
      const slug = (card.getAttribute('data-portal-slug') || '').trim();
      const logoField = card.querySelector('[data-portal-field="logoFile"]');
  
      // Hidden file input per card
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.style.display = 'none';
      card.appendChild(fileInput);
  
      uploadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!slug) {
          showToast('Please set a portal slug before uploading a logo.');
          return;
        }
        fileInput.click();
      });
  
      fileInput.addEventListener('change', async () => {
        if (!fileInput.files || !fileInput.files.length) return;
  
        const file = fileInput.files[0];
        const formData = new FormData();
        formData.append('portal_logo', file);
        formData.append('slug', slug);
  
        try {
          const res = await fetch('/api/pro/portals/uploadLogo.php', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'X-CSRF-Token': window.csrfToken || ''
            },
            body: formData
          });
  
          const data = await safeJson(res);
          if (!data || data.success !== true) {
            throw new Error(data && data.error ? data.error : 'Upload failed');
          }
  
          const fileName = data.fileName || data.filename || '';
          if (logoField && fileName) {
            logoField.value = fileName;
          }
  
          showToast('Portal logo uploaded.');
        } catch (err) {
          console.error(err);
          showToast('Error uploading portal logo: ' + (err && err.message ? err.message : err));
        } finally {
          fileInput.value = '';
        }
      });
    });
  }

  // ─────────────────────
//  Intake presets helpers
// ─────────────────────

function applyPresetToPortalCard(card, presetKey) {
    const preset = PORTAL_INTAKE_PRESETS[presetKey];
    if (!preset) return;
  
    const setVal = (selector, value) => {
      const el = card.querySelector(selector);
      if (el) el.value = value != null ? String(value) : '';
    };
  
    const setChecked = (selector, value) => {
      const el = card.querySelector(selector);
      if (el) el.checked = !!value;
    };
  
    // Display name (admin label)
    if (preset.label) {
      setVal('[data-portal-field="label"]', preset.label);
      const headerLabelEl = card.querySelector('.portal-card-header-main strong');
      if (headerLabelEl) {
        headerLabelEl.textContent = preset.label;
      }
    }
  
    // Title / intro / footer / accent / require-form
    setVal('[data-portal-field="title"]', preset.title || '');
    setVal('[data-portal-field="introText"]', preset.introText || '');
    setVal('[data-portal-field="footerText"]', preset.footerText || '');
  
    if (preset.brandColor) {
      setVal('[data-portal-field="brandColor"]', preset.brandColor);
    }
  
    setChecked('[data-portal-field="requireForm"]', !!preset.requireForm);
  
    // Visibility toggles
    if (preset.formVisible) {
      setChecked('[data-portal-field="visName"]',  !!preset.formVisible.name);
      setChecked('[data-portal-field="visEmail"]', !!preset.formVisible.email);
      setChecked('[data-portal-field="visRef"]',   !!preset.formVisible.reference);
      setChecked('[data-portal-field="visNotes"]', !!preset.formVisible.notes);
    }
  
    // Labels
    if (preset.formLabels) {
      setVal('[data-portal-field="lblName"]',  preset.formLabels.name      || '');
      setVal('[data-portal-field="lblEmail"]', preset.formLabels.email     || '');
      setVal('[data-portal-field="lblRef"]',   preset.formLabels.reference || '');
      setVal('[data-portal-field="lblNotes"]', preset.formLabels.notes     || '');
    }
  
    // Defaults
    if (preset.formDefaults) {
      setVal('[data-portal-field="defName"]',  preset.formDefaults.name      || '');
      setVal('[data-portal-field="defEmail"]', preset.formDefaults.email     || '');
      setVal('[data-portal-field="defRef"]',   preset.formDefaults.reference || '');
      setVal('[data-portal-field="defNotes"]', preset.formDefaults.notes     || '');
    }
  
    // Required flags
    if (preset.formRequired) {
      setChecked('[data-portal-field="reqName"]',  !!preset.formRequired.name);
      setChecked('[data-portal-field="reqEmail"]', !!preset.formRequired.email);
      setChecked('[data-portal-field="reqRef"]',   !!preset.formRequired.reference);
      setChecked('[data-portal-field="reqNotes"]', !!preset.formRequired.notes);
    }
  
    showToast(`Applied "${preset.label}" preset.`);
  }
  
  function attachPortalPresetSelectors() {
    const body = document.getElementById('clientPortalsBody');
    if (!body) return;
  
    body.querySelectorAll('.portal-card').forEach(card => {
      const select = card.querySelector('.portal-intake-preset');
      if (!select || select._frPresetBound) return;
      select._frPresetBound = true;
  
      select.addEventListener('change', () => {
        const key = select.value;
        if (!key) return;
        applyPresetToPortalCard(card, key);
      });
    });
  }

// ─────────────────────
//  Submissions helpers
// ─────────────────────

async function fetchPortalSubmissions(slug) {
    const res = await fetch('/api/pro/portals/submissions.php?slug=' + encodeURIComponent(slug), {
      credentials: 'include',
      headers: {
        'X-CSRF-Token': window.csrfToken || ''
      }
    });
    const data = await safeJson(res);
    if (!data || data.success === false) {
      throw new Error((data && data.error) || 'Failed to load submissions');
    }
    const submissions = Array.isArray(data.submissions) ? data.submissions : [];
  
    // Cache for CSV export
    __portalSubmissionsCache[slug] = submissions;
  
    return submissions;
  }

function renderPortalSubmissionsList(listEl, countEl, submissions) {
  listEl.textContent = '';

  if (!Array.isArray(submissions) || submissions.length === 0) {
    countEl.textContent = 'No submissions';
    const empty = document.createElement('div');
    empty.className = 'portal-submissions-item portal-submissions-empty';
    empty.textContent = 'No submissions yet.';
    listEl.appendChild(empty);
    return;
  }

  countEl.textContent = submissions.length === 1
    ? '1 submission'
    : submissions.length + ' submissions';

  submissions.forEach(sub => {
    const item = document.createElement('div');
    item.className = 'portal-submissions-item';

    const header = document.createElement('div');
    header.className = 'portal-submissions-header';

    const headerParts = [];

    const created = sub.createdAt || sub.created_at || sub.timestamp || sub.time;
    if (created) {
      try {
        const d = typeof created === 'number'
          ? new Date(created * 1000)
          : new Date(created);

        if (!isNaN(d.getTime())) {
          headerParts.push(d.toLocaleString(undefined, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }));
        }
      } catch {
        headerParts.push(String(created));
      }
    }

    const raw = sub.raw || sub;
    const folder = sub.folder || (raw && raw.folder) || '';
    const submittedBy = sub.submittedBy || (raw && raw.submittedBy) || '';
    const ip = sub.ip || (raw && raw.ip) || '';

    if (folder) headerParts.push('Folder: ' + folder);
    if (submittedBy) headerParts.push('Submitted by: ' + submittedBy);
    if (ip) headerParts.push('IP: ' + ip);

    header.textContent = headerParts.join(' • ');

    const summary = document.createElement('div');
    summary.className = 'portal-submissions-summary';

    const form = raw.form || sub.form || raw;

    const summaryParts = [];
    const name = form.name || sub.name || '';
    const email = form.email || sub.email || '';
    const ref = form.reference || form.ref || sub.reference || sub.ref || '';
    const notes = form.notes || form.message || sub.notes || sub.message || '';

    if (name) summaryParts.push('Name: ' + name);
    if (email) summaryParts.push('Email: ' + email);
    if (ref) summaryParts.push('Ref: ' + ref);
    if (notes) summaryParts.push('Notes: ' + notes);

    summary.textContent = summaryParts.join(' • ');

    item.appendChild(header);
    if (summaryParts.length) {
      item.appendChild(summary);
    }

    listEl.appendChild(item);
  });
}

function normalizeSubmissionForCsv(sub) {
    const created = sub.createdAt || sub.created_at || sub.timestamp || sub.time || '';
    const raw = sub.raw || sub;
    const folder = sub.folder || (raw && raw.folder) || '';
    const submittedBy = sub.submittedBy || (raw && raw.submittedBy) || '';
    const ip = sub.ip || (raw && raw.ip) || '';
  
    const form = raw.form || sub.form || raw || {};
    const name = form.name || sub.name || '';
    const email = form.email || sub.email || '';
    const reference = form.reference || form.ref || sub.reference || sub.ref || '';
    const notes = form.notes || form.message || sub.notes || sub.message || '';
  
    return {
      created,
      folder,
      submittedBy,
      ip,
      name,
      email,
      reference,
      notes
    };
  }
  
  function csvEscape(val) {
    if (val == null) return '';
    const str = String(val);
    if (/[",\n\r]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }
  
  function exportSubmissionsToCsv(slug, submissions) {
    if (!Array.isArray(submissions) || !submissions.length) {
      showToast('No submissions to export.');
      return;
    }
  
    const header = [
      'Created',
      'Folder',
      'SubmittedBy',
      'IP',
      'Name',
      'Email',
      'Reference',
      'Notes'
    ];
  
    const lines = [];
    lines.push(header.map(csvEscape).join(','));
  
    submissions.forEach(sub => {
      const row = normalizeSubmissionForCsv(sub);
      const cols = [
        row.created,
        row.folder,
        row.submittedBy,
        row.ip,
        row.name,
        row.email,
        row.reference,
        row.notes
      ];
      lines.push(cols.map(csvEscape).join(','));
    });
  
    const csv = lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
  
    const a = document.createElement('a');
    a.href = url;
    a.download = (slug || 'portal') + '-submissions.csv';
  
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  }

function attachPortalSubmissionsUI() {
  const body = document.getElementById('clientPortalsBody');
  if (!body) return;

  body.querySelectorAll('.portal-card').forEach(card => {
    if (card.querySelector('.portal-submissions-block')) {
      return;
    }

    const slug = card.getAttribute('data-portal-slug') || '';
    if (!slug) return;

    const container = document.createElement('div');
    container.className = 'portal-submissions-block';

    const headerRow = document.createElement('div');
    headerRow.className = 'd-flex align-items-center justify-content-between mb-1';

    const title = document.createElement('strong');
    title.textContent = 'Submissions';

    const buttonsWrap = document.createElement('div');
    buttonsWrap.className = 'd-flex align-items-center';
    buttonsWrap.style.gap = '6px';

    const loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.className = 'btn btn-sm btn-outline-secondary portal-submissions-load-btn';
    loadBtn.textContent = 'Load submissions';
    loadBtn.setAttribute('data-portal-action', 'load-submissions');

    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'btn btn-sm btn-outline-secondary portal-submissions-export-btn';
    exportBtn.textContent = 'Export CSV';

    buttonsWrap.appendChild(loadBtn);
    buttonsWrap.appendChild(exportBtn);

    headerRow.appendChild(title);
    headerRow.appendChild(buttonsWrap);
    container.appendChild(headerRow);

    const countEl = document.createElement('small');
    countEl.className = 'text-muted portal-submissions-count';
    countEl.textContent = 'No submissions';
    container.appendChild(countEl);

    const listEl = document.createElement('div');
    listEl.className = 'portal-submissions-list';
    container.appendChild(listEl);

    const bodyEl = card.querySelector('.portal-card-body') || card;
    bodyEl.appendChild(container);

    const loadSubmissions = async () => {
      countEl.textContent = 'Loading...';
      listEl.textContent = '';

      try {
        const submissions = await fetchPortalSubmissions(slug);
        renderPortalSubmissionsList(listEl, countEl, submissions);
        return submissions;
      } catch (err) {
        console.error(err);
        countEl.textContent = 'Error loading submissions';
        showToast('Error loading submissions: ' + (err && err.message ? err.message : err));
        return [];
      }
    };

    loadBtn.addEventListener('click', () => {
      loadSubmissions();
    });

    exportBtn.addEventListener('click', async () => {
      let submissions = __portalSubmissionsCache[slug];

      // If we don't have anything cached yet, load them first
      if (!submissions || !submissions.length) {
        submissions = await loadSubmissions();
      }

      if (!submissions || !submissions.length) {
        showToast('No submissions to export yet.');
        return;
      }

      exportSubmissionsToCsv(slug, submissions);
    });

    // Initial auto-load so the admin sees something right away
    loadSubmissions();
  });
}

// ─────────────────────
//  Save portals
// ─────────────────────

async function saveClientPortalsFromUI() {
  const body = document.getElementById('clientPortalsBody');
  const status = document.getElementById('clientPortalsStatus');
  if (!body) return;

  const cards = body.querySelectorAll('.card[data-portal-slug]');
  const portals = {};

  cards.forEach(card => {
    const origSlug = card.getAttribute('data-portal-slug') || '';
    let slug = origSlug.trim();

    const getVal = (selector) => {
      const el = card.querySelector(selector);
      return el ? el.value || '' : '';
    };

    const label = getVal('[data-portal-field="label"]').trim();
    const folder = getVal('[data-portal-field="folder"]').trim();
    const clientEmail = getVal('[data-portal-field="clientEmail"]').trim();
    const expiresAt = getVal('[data-portal-field="expiresAt"]').trim();
    const title = getVal('[data-portal-field="title"]').trim();
    const introText = getVal('[data-portal-field="introText"]').trim();

    const brandColor = getVal('[data-portal-field="brandColor"]').trim();
    const footerText = getVal('[data-portal-field="footerText"]').trim();
    const logoFile   = getVal('[data-portal-field="logoFile"]').trim();
    const logoUrl    = getVal('[data-portal-field="logoUrl"]').trim(); // (optional, not exposed in UI yet)

    const defName  = getVal('[data-portal-field="defName"]').trim();
    const defEmail = getVal('[data-portal-field="defEmail"]').trim();
    const defRef   = getVal('[data-portal-field="defRef"]').trim();
    const defNotes = getVal('[data-portal-field="defNotes"]').trim();

    const lblName  = getVal('[data-portal-field="lblName"]').trim();
    const lblEmail = getVal('[data-portal-field="lblEmail"]').trim();
    const lblRef   = getVal('[data-portal-field="lblRef"]').trim();
    const lblNotes = getVal('[data-portal-field="lblNotes"]').trim();

    const uploadOnlyEl = card.querySelector('[data-portal-field="uploadOnly"]');
    const allowDownloadEl = card.querySelector('[data-portal-field="allowDownload"]');
    const requireFormEl = card.querySelector('[data-portal-field="requireForm"]');

    const uploadOnly = uploadOnlyEl ? !!uploadOnlyEl.checked : true;
    const allowDownload = allowDownloadEl ? !!allowDownloadEl.checked : false;
    const requireForm = requireFormEl ? !!requireFormEl.checked : false;
    const reqNameEl = card.querySelector('[data-portal-field="reqName"]');
    const reqEmailEl = card.querySelector('[data-portal-field="reqEmail"]');
    const reqRefEl = card.querySelector('[data-portal-field="reqRef"]');
    const reqNotesEl = card.querySelector('[data-portal-field="reqNotes"]');

    const reqName = reqNameEl ? !!reqNameEl.checked : false;
    const reqEmail = reqEmailEl ? !!reqEmailEl.checked : false;
    const reqRef = reqRefEl ? !!reqRefEl.checked : false;
    const reqNotes = reqNotesEl ? !!reqNotesEl.checked : false;

    const visNameEl  = card.querySelector('[data-portal-field="visName"]');
    const visEmailEl = card.querySelector('[data-portal-field="visEmail"]');
    const visRefEl   = card.querySelector('[data-portal-field="visRef"]');
    const visNotesEl = card.querySelector('[data-portal-field="visNotes"]');

    const visName  = visNameEl  ? !!visNameEl.checked  : true;
    const visEmail = visEmailEl ? !!visEmailEl.checked : true;
    const visRef   = visRefEl   ? !!visRefEl.checked   : true;
    const visNotes = visNotesEl ? !!visNotesEl.checked : true;

    const uploadMaxSizeMb    = getVal('[data-portal-field="uploadMaxSizeMb"]').trim();
    const uploadExtWhitelist = getVal('[data-portal-field="uploadExtWhitelist"]').trim();
    const uploadMaxPerDay    = getVal('[data-portal-field="uploadMaxPerDay"]').trim();
    const thankYouText       = getVal('[data-portal-field="thankYouText"]').trim();

    const showThankYouEl = card.querySelector('[data-portal-field="showThankYou"]');
    const showThankYou   = showThankYouEl ? !!showThankYouEl.checked : false;

    const slugInput = card.querySelector('[data-portal-field="slug"]');
    if (slugInput) {
      const rawSlug = slugInput.value.trim();
      if (rawSlug) slug = rawSlug;
    }

    if (!slug || !folder) {
      return;
    }

    portals[slug] = {
        label,
        folder,
        clientEmail,
        uploadOnly,
        allowDownload,
        expiresAt,
        title,
        introText,
        requireForm,
        brandColor,
        footerText,
        logoFile,
        logoUrl,
        formDefaults: {
          name: defName,
          email: defEmail,
          reference: defRef,
          notes: defNotes
        },
        formRequired: {
          name: reqName,
          email: reqEmail,
          reference: reqRef,
          notes: reqNotes
        },
        formLabels: {
          name: lblName,
          email: lblEmail,
          reference: lblRef,
          notes: lblNotes
        },
        formVisible: {
          name: visName,
          email: visEmail,
          reference: visRef,
          notes: visNotes
        },
        uploadMaxSizeMb: uploadMaxSizeMb ? parseInt(uploadMaxSizeMb, 10) || 0 : 0,
        uploadExtWhitelist,
        uploadMaxPerDay: uploadMaxPerDay ? parseInt(uploadMaxPerDay, 10) || 0 : 0,
        showThankYou,
        thankYouText,
      };
  });

  if (status) {
    status.textContent = 'Saving…';
    status.className = 'small text-muted';
  }

  try {
    const res = await saveAllPortals(portals);
    if (!res || res.success !== true) {
      throw new Error(res && res.error ? res.error : 'Unknown error saving client portals');
    }
    __portalsCache = portals;
    if (status) {
      status.textContent = 'Saved.';
      status.className = 'small text-success';
    }
    showToast('Client portals saved.');

    // Re-render from cache so headers / slugs / etc. all reflect the saved state
    await loadClientPortalsList(true);
  } catch (e) {
    console.error(e);
    if (status) {
      status.textContent = 'Error saving.';
      status.className = 'small text-danger';
    }
    showToast('Error saving client portals: ' + (e.message || e));
  }
}