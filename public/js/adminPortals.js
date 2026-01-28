import { t } from './i18n.js?v={{APP_QVER}}';
import { showToast } from './domUtils.js?v={{APP_QVER}}';
import { withBase } from './basePath.js?v={{APP_QVER}}';

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
    theme: {
      light: {
        bodyBg: 'radial-gradient(1200px 600px at 10% -10%, rgba(37, 99, 235, 0.25), transparent 55%), linear-gradient(180deg, #f3f7ff 0%, #e8effa 100%)',
        surface: '#f8fbff',
        text: '#0b1a33',
        muted: '#4b6284',
        border: 'rgba(37, 99, 235, 0.2)',
        shadow: '0 18px 50px rgba(37, 99, 235, 0.18)',
      },
      dark: {
        bodyBg: 'radial-gradient(1200px 600px at 10% -10%, rgba(59, 130, 246, 0.25), transparent 55%), linear-gradient(180deg, #070d1a 0%, #0b1426 100%)',
        surface: '#0f1b2f',
        text: '#e6efff',
        muted: '#9bb1d1',
        border: 'rgba(96, 165, 250, 0.35)',
        shadow: '0 24px 70px rgba(2, 6, 23, 0.6)',
      },
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
    theme: {
      light: {
        bodyBg: 'radial-gradient(1200px 600px at 10% -10%, rgba(16, 185, 129, 0.22), transparent 55%), linear-gradient(180deg, #f2fffa 0%, #e6f7ef 100%)',
        surface: '#f6fffb',
        text: '#052018',
        muted: '#4c6b5f',
        border: 'rgba(16, 185, 129, 0.22)',
        shadow: '0 18px 50px rgba(16, 185, 129, 0.16)',
      },
      dark: {
        bodyBg: 'radial-gradient(1200px 600px at 10% -10%, rgba(34, 197, 94, 0.22), transparent 55%), linear-gradient(180deg, #071a14 0%, #0b221a 100%)',
        surface: '#0f241c',
        text: '#e6fff5',
        muted: '#9cc8b8',
        border: 'rgba(34, 197, 94, 0.3)',
        shadow: '0 24px 70px rgba(0, 0, 0, 0.55)',
      },
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
    theme: {
      light: {
        bodyBg: 'radial-gradient(1200px 600px at 10% -10%, rgba(245, 158, 11, 0.22), transparent 55%), linear-gradient(180deg, #fff7ed 0%, #fde7c7 100%)',
        surface: '#fff9f0',
        text: '#2b1700',
        muted: '#86623a',
        border: 'rgba(234, 179, 8, 0.26)',
        shadow: '0 18px 50px rgba(234, 179, 8, 0.18)',
      },
      dark: {
        bodyBg: 'radial-gradient(1200px 600px at 10% -10%, rgba(251, 191, 36, 0.22), transparent 55%), linear-gradient(180deg, #1a1106 0%, #2a1a00 100%)',
        surface: '#2a1a00',
        text: '#fff1dc',
        muted: '#d3b48b',
        border: 'rgba(251, 191, 36, 0.3)',
        shadow: '0 24px 70px rgba(0, 0, 0, 0.55)',
      },
    },
  },

  healthcare: {
    label: 'Healthcare intake',
    title: 'Secure patient document upload',
    introText:
      'Upload referrals, intake forms, insurance cards, and supporting documents here. ' +
      'Please avoid emailing sensitive files.',
    footerText:
      'If you uploaded something in error, contact our office. Please do not share this link.',
    brandColor: '#0f766e',
    requireForm: true,
    formVisible: {
      name: true,
      email: true,
      reference: true,
      notes: true,
    },
    formLabels: {
      name: 'Patient name',
      email: 'Contact email',
      reference: 'Patient ID / DOB',
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
    theme: {
      light: {
        bodyBg: 'radial-gradient(1200px 600px at 12% -10%, rgba(13, 148, 136, 0.22), transparent 55%), linear-gradient(180deg, #ecfdfb 0%, #d9f7f1 100%)',
        surface: '#f4fffd',
        text: '#053330',
        muted: '#3a6b66',
        border: 'rgba(13, 148, 136, 0.22)',
        shadow: '0 18px 50px rgba(13, 148, 136, 0.16)',
      },
      dark: {
        bodyBg: 'radial-gradient(1200px 600px at 10% -10%, rgba(20, 184, 166, 0.22), transparent 55%), linear-gradient(180deg, #061a18 0%, #0b2a27 100%)',
        surface: '#0f2d2a',
        text: '#e6fffb',
        muted: '#9acfc9',
        border: 'rgba(20, 184, 166, 0.3)',
        shadow: '0 24px 70px rgba(0, 0, 0, 0.55)',
      },
    },
  },

  realestate: {
    label: 'Real estate',
    title: 'Property document upload',
    introText:
      'Upload disclosures, contracts, inspections, and related property documents here.',
    footerText:
      'If you have questions about required files, contact your agent before uploading.',
    brandColor: '#1e3a8a',
    requireForm: true,
    formVisible: {
      name: true,
      email: true,
      reference: true,
      notes: true,
    },
    formLabels: {
      name: 'Client name',
      email: 'Contact email',
      reference: 'Property / Listing #',
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
    theme: {
      light: {
        bodyBg: 'radial-gradient(1200px 600px at 10% -10%, rgba(30, 64, 175, 0.2), transparent 55%), linear-gradient(180deg, #f6f8ff 0%, #eef1f9 100%)',
        surface: '#f9f6ef',
        text: '#1f2937',
        muted: '#6b7280',
        border: 'rgba(30, 64, 175, 0.18)',
        shadow: '0 18px 50px rgba(30, 64, 175, 0.16)',
      },
      dark: {
        bodyBg: 'radial-gradient(1200px 600px at 10% -10%, rgba(59, 130, 246, 0.2), transparent 55%), linear-gradient(180deg, #0b1220 0%, #10192c 100%)',
        surface: '#1a2337',
        text: '#f5f2e8',
        muted: '#c9c1b4',
        border: 'rgba(148, 163, 184, 0.35)',
        shadow: '0 24px 70px rgba(0, 0, 0, 0.55)',
      },
    },
  },

  construction: {
    label: 'Construction / field',
    title: 'Site report upload',
    introText:
      'Upload site photos, safety reports, invoices, and daily logs from the field.',
    footerText:
      'Please include the project ID so we can route the files quickly.',
    brandColor: '#f97316',
    requireForm: true,
    formVisible: {
      name: true,
      email: true,
      reference: true,
      notes: true,
    },
    formLabels: {
      name: 'Contact name',
      email: 'Contact email',
      reference: 'Project / Site #',
      notes: 'Notes / issue summary',
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
      notes: true,
    },
    theme: {
      light: {
        bodyBg: 'radial-gradient(1200px 600px at 12% -10%, rgba(249, 115, 22, 0.22), transparent 55%), linear-gradient(180deg, #fff7ed 0%, #ffe3c7 100%)',
        surface: '#fff4e6',
        text: '#2b1400',
        muted: '#7a4f2a',
        border: 'rgba(249, 115, 22, 0.28)',
        shadow: '0 18px 50px rgba(249, 115, 22, 0.2)',
      },
      dark: {
        bodyBg: 'radial-gradient(1200px 600px at 10% -10%, rgba(249, 115, 22, 0.22), transparent 55%), linear-gradient(180deg, #1c1206 0%, #2a1a0b 100%)',
        surface: '#2a1a0b',
        text: '#ffe9d4',
        muted: '#d4b08e',
        border: 'rgba(249, 115, 22, 0.3)',
        shadow: '0 24px 70px rgba(0, 0, 0, 0.6)',
      },
    },
  },

  creative: {
    label: 'Creative studio',
    title: 'Creative assets upload',
    introText:
      'Upload briefs, mood boards, drafts, and final assets for your project.',
    footerText:
      'For large deliveries, split into multiple uploads or contact us for a transfer link.',
    brandColor: '#f973a7',
    requireForm: true,
    formVisible: {
      name: true,
      email: true,
      reference: true,
      notes: true,
    },
    formLabels: {
      name: 'Client / brand name',
      email: 'Contact email',
      reference: 'Project name',
      notes: 'Notes / creative direction',
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
    theme: {
      light: {
        bodyBg: 'radial-gradient(1200px 600px at 12% -10%, rgba(244, 63, 94, 0.22), transparent 55%), linear-gradient(180deg, #fff1f5 0%, #ffe3ec 100%)',
        surface: '#fff7fb',
        text: '#2b0f1d',
        muted: '#7a4a5c',
        border: 'rgba(244, 63, 94, 0.24)',
        shadow: '0 18px 50px rgba(244, 63, 94, 0.18)',
      },
      dark: {
        bodyBg: 'radial-gradient(1200px 600px at 10% -10%, rgba(244, 63, 94, 0.22), transparent 55%), linear-gradient(180deg, #1a0b12 0%, #2a0f1c 100%)',
        surface: '#2a1424',
        text: '#ffe5f2',
        muted: '#d3a5ba',
        border: 'rgba(244, 63, 94, 0.3)',
        shadow: '0 24px 70px rgba(0, 0, 0, 0.6)',
      },
    },
  },

  finance: {
    label: 'Finance / mortgage',
    title: 'Secure financial document upload',
    introText:
      'Upload statements, pay stubs, and required documents for your application.',
    footerText:
      'If you have questions about required documents, contact your advisor.',
    brandColor: '#1d4ed8',
    requireForm: true,
    formVisible: {
      name: true,
      email: true,
      reference: true,
      notes: true,
    },
    formLabels: {
      name: 'Applicant name',
      email: 'Contact email',
      reference: 'Application / Loan #',
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
    theme: {
      light: {
        bodyBg: 'radial-gradient(1200px 600px at 10% -10%, rgba(37, 99, 235, 0.2), transparent 55%), linear-gradient(180deg, #f8fafc 0%, #e7eef8 100%)',
        surface: '#fdf6ef',
        text: '#1f2937',
        muted: '#6b7280',
        border: 'rgba(29, 78, 216, 0.2)',
        shadow: '0 18px 50px rgba(29, 78, 216, 0.16)',
      },
      dark: {
        bodyBg: 'radial-gradient(1200px 600px at 10% -10%, rgba(37, 99, 235, 0.22), transparent 55%), linear-gradient(180deg, #0b1220 0%, #121a2d 100%)',
        surface: '#1c2336',
        text: '#f8e9d7',
        muted: '#d6b894',
        border: 'rgba(180, 83, 9, 0.35)',
        shadow: '0 24px 70px rgba(0, 0, 0, 0.55)',
      },
    },
  },
};

// Tiny JSON helper (same behavior as in adminPanel.js)
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
let __portalFolderListLoaded = {};
let __portalFolderOptions = {};
let __portalSourcesLoaded = false;
let __portalSources = [];
let __portalSourcesById = {};

// Remember a newly-created portal to focus its folder field
let __portalSlugToFocus = null;

// Cache portal submissions per slug for CSV export
const __portalSubmissionsCache = {};

function normalizePortalSourceId(id) {
  return String(id || '').trim();
}

function getPortalSourceFallbackId() {
  if (__portalSourcesById.local) return 'local';
  return __portalSources.length ? __portalSources[0].id : '';
}

function getDefaultPortalSourceId() {
  try {
    const stored = localStorage.getItem('fr_active_source') || '';
    if (stored && __portalSourcesById[stored]) return stored;
  } catch (e) { /* ignore */ }
  return getPortalSourceFallbackId();
}

function buildPortalUsernamePreview(slug) {
  const raw = String(slug || '').trim();
  let clean = raw.replace(/[^A-Za-z0-9_-]+/g, '-');
  clean = clean.replace(/^[-_]+|[-_]+$/g, '');
  let lower = clean.toLowerCase();
  if (lower.startsWith('portal-')) {
    lower = lower.slice(7);
  } else if (lower === 'portal') {
    lower = '';
  }
  if (!lower) {
    return 'portal_user';
  }
  return 'portal_' + lower;
}

function isPortalExpiredDate(expiresAt) {
  const raw = String(expiresAt || '').trim();
  if (!raw) return false;
  const date = new Date(raw + 'T23:59:59');
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < Date.now();
}

async function loadPortalSources() {
  if (__portalSourcesLoaded) return __portalSources;
  __portalSourcesLoaded = true;

  let sources = [];
  try {
    const res = await fetch('/api/pro/sources/list.php', {
      credentials: 'include'
    });
    const data = await safeJson(res);
    if (data && data.ok && Array.isArray(data.sources)) {
      sources = data.sources;
    }
  } catch (e) {
    sources = [];
  }

  if (!Array.isArray(sources) || !sources.length) {
    sources = [{ id: 'local', name: 'Local', type: 'local', enabled: true }];
  }

  const normalized = [];
  sources.forEach(src => {
    if (!src || !src.id) return;
    const id = String(src.id || '').trim();
    if (!id) return;
    normalized.push({
      id,
      name: String(src.name || src.id || '').trim() || id,
      type: String(src.type || '').trim(),
      enabled: src.enabled !== false
    });
  });

  if (!normalized.find(s => s.id === 'local')) {
    normalized.unshift({ id: 'local', name: 'Local', type: 'local', enabled: true });
  }

  __portalSources = normalized;
  __portalSourcesById = {};
  normalized.forEach(src => { __portalSourcesById[src.id] = src; });

  return __portalSources;
}

function renderPortalSourceOptions(selectedId) {
  const active = normalizePortalSourceId(selectedId) || getPortalSourceFallbackId();
  return __portalSources.map(src => {
    const label = src.name || src.id;
    const disabledTag = src.enabled ? '' : ' (disabled)';
    return `<option value="${src.id}"${src.id === active ? ' selected' : ''}>${label}${disabledTag}</option>`;
  }).join('');
}

async function loadPortalFolderList(sourceId = '') {
  const sourceKey = normalizePortalSourceId(sourceId) || getPortalSourceFallbackId();
  if (__portalFolderListLoaded[sourceKey]) return __portalFolderOptions[sourceKey] || [];
  try {
    const sourceParam = sourceKey ? `&sourceId=${encodeURIComponent(sourceKey)}` : '';
    const res = await fetch(`/api/folder/getFolderList.php?counts=0${sourceParam}`, { credentials: 'include' });
    const data = await res.json();
    let list = data;

    // Support both shapes: ["A/B", "C/D"] or [{ folder: "A/B" }, ...]
    if (Array.isArray(list) && list.length && typeof list[0] === 'object' && list[0].folder) {
      list = list.map(it => it.folder);
    }

    __portalFolderOptions[sourceKey] = (list || [])
      .filter(Boolean)
      .filter(f => f !== 'trash' && f !== 'profile_pics');

    __portalFolderListLoaded[sourceKey] = true;
  } catch (e) {
    console.error('Error loading portal folder list', e);
    __portalFolderOptions[sourceKey] = [];
    __portalFolderListLoaded[sourceKey] = true;
  }
  return __portalFolderOptions[sourceKey];
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
          Create client portals for specific folders and configure access, users, branding, and intake details per portal.
        </p>

<div class="d-flex justify-content-between align-items-center" style="margin:8px 0 10px;">
  <div>
    <button type="button" id="addPortalBtn" class="btn btn-sm btn-success">
      <i class="material-icons" style="font-size:16px;">cloud_upload</i>
      <span style="margin-left:4px;">Add portal</span>
    </button>

    <button type="button"
            id="clientPortalsQuickAddUser"
            class="btn btn-sm btn-primary ms-1">
      <i class="material-icons" style="font-size:16px; vertical-align:middle;">people</i>
      <span style="margin-left:4px;">Manage users…</span>
    </button>

    <button
      type="button"
      id="clientPortalsOpenUserPerms"
      class="btn btn-sm btn-secondary ms-1">
      <i class="material-icons" style="font-size:16px; vertical-align:middle;">folder_shared</i>
      <span style="margin-left:4px;">Folder access…</span>
    </button>

    <button
      type="button"
      id="clientPortalsOpenUserGroups"
      class="btn btn-sm btn-secondary ms-1">
      <i class="material-icons" style="font-size:16px; vertical-align:middle;">groups</i>
      <span style="margin-left:4px;">User groups…</span>
    </button>
  </div>
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
    const quickAddUserBtn = document.getElementById('clientPortalsQuickAddUser');
    if (quickAddUserBtn) {
      quickAddUserBtn.onclick = () => {
        // Reuse existing admin add-user button / modal
        const globalBtn = document.getElementById('adminOpenUserHub');
        if (globalBtn) {
          globalBtn.click();
        } else {
          showToast(t('admin_portals_users_add'));
        }
      };
    }
    const openPermsBtn = document.getElementById('clientPortalsOpenUserPerms');
    if (openPermsBtn) {
      openPermsBtn.onclick = () => {
        const btn = document.getElementById('adminOpenFolderAccess');
        if (btn) {
          btn.click();
        } else {
          showToast(t('admin_portals_users_access'));
        }
      };
    }

    const openGroupsBtn = document.getElementById('clientPortalsOpenUserGroups');
    if (openGroupsBtn) {
      openGroupsBtn.onclick = () => {
        const btn = document.getElementById('adminOpenUserGroups');
        if (btn) {
          btn.click();
        } else {
          showToast(t('admin_portals_users_groups'));
        }
      };
    }
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
    await loadPortalSources();
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
      const portalPath = withBase('/portal/' + encodeURIComponent(slug));
      const portalUrl = origin ? origin + portalPath : portalPath;

      const p = __portalsCache[slug] || {};
      const label = p.label || slug;
      const folder = p.folder || '';
      const sourceId = normalizePortalSourceId(p.sourceId) || getPortalSourceFallbackId();
      const sourceOptions = renderPortalSourceOptions(sourceId);
      const clientEmail = p.clientEmail || '';
      const uploadOnly = !!p.uploadOnly;
      const allowSubfolders = !!p.allowSubfolders;

      // Backwards compat:
      //  - Old portals only had "uploadOnly":
      //      uploadOnly = true  => upload yes, download no
      //      uploadOnly = false => upload yes, download yes
      //  - New portals have explicit allowDownload.
      let allowDownload;
      if (Object.prototype.hasOwnProperty.call(p, 'allowDownload')) {
        allowDownload = p.allowDownload !== false;
      } else {
        // Legacy: "upload only" meant no download
        allowDownload = !uploadOnly;
      }



      const expiresAt = p.expiresAt ? String(p.expiresAt).slice(0, 10) : '';
      const brandColor = p.brandColor || '';
      const footerText = p.footerText || '';
      const theme = p.theme || {};
      const themeLight = theme.light || {};
      const themeDark = theme.dark || {};
      const themeLightBodyBg = themeLight.bodyBg || '';
      const themeLightSurface = themeLight.surface || '';
      const themeLightText = themeLight.text || '';
      const themeLightMuted = themeLight.muted || '';
      const themeLightBorder = themeLight.border || '';
      const themeLightShadow = themeLight.shadow || '';
      const themeDarkBodyBg = themeDark.bodyBg || '';
      const themeDarkSurface = themeDark.surface || '';
      const themeDarkText = themeDark.text || '';
      const themeDarkMuted = themeDark.muted || '';
      const themeDarkBorder = themeDark.border || '';
      const themeDarkShadow = themeDark.shadow || '';
      const portalUser = (p.portalUser && typeof p.portalUser === 'object') ? p.portalUser : {};
      const portalUserCreate = portalUser.create !== false;
      const portalUserPreset = portalUser.preset || 'match';
      const portalUserName = portalUser.username || '';
      const portalUserPlaceholder = buildPortalUsernamePreview(slug);
      const isNewPortal = !!p._isNewPortal;
      const portalExpired = isPortalExpiredDate(expiresAt);
      const portalUserPasswordSet = portalUserCreate
        && !portalExpired
        && (portalUser.passwordSet === true
          || (portalUser.passwordSet !== false && !isNewPortal));
      const portalUserPasswordNote = portalExpired
        ? 'Portal is expired; its portal user is removed on save.'
        : (isNewPortal
          ? 'Required for new portal users.'
          : 'Leave blank to keep the current password.');
      const portalUserPasswordPlaceholder = isNewPortal
        ? 'Set a password (required)'
        : 'Leave blank to keep current';
      const portalUserPasswordStatus = portalUserPasswordSet
        ? '<span class="text-success" style="font-size:0.75rem;">Password saved</span>'
        : '';
      const portalSectionStyle = 'margin-top:10px; padding:10px; border:1px dashed rgba(100, 116, 139, 0.35); border-radius:8px;';
      const portalSectionTitleStyle = 'font-weight:600; font-size:0.8rem; margin-bottom:6px;';

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
    const thankYouShowRef = !!p.thankYouShowRef;
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
        <div class="card portal-card" data-portal-slug="${slug}" data-portal-new="${isNewPortal ? '1' : '0'}">
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
            <div class="portal-section" style="${portalSectionStyle}">
              <div style="${portalSectionTitleStyle}">Portal access</div>
              <div class="portal-meta-row">
<label style="font-weight:600;">
  Portal slug<span class="text-danger">*</span>:
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

              <div class="portal-meta-row portal-source-row">
              <label>
                Source:
                <select class="form-control form-control-sm portal-source-select"
                        data-portal-field="sourceId"
                        style="display:inline-block; width:180px; margin-left:4px;">
                  ${sourceOptions}
                </select>
              </label>
              <div class="portal-folder-row">
<label>
  Folder<span class="text-danger">*</span>:
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
            </div>

              <div class="portal-meta-row portal-access-row">
                <label style="display:flex; align-items:center; gap:4px;">
                  <input type="checkbox"
                         data-portal-field="uploadOnly"
                         ${uploadOnly ? 'checked' : ''} />
                  <span>Allow upload</span>
                </label>

                <label style="display:flex; align-items:center; gap:4px;">
                  <input type="checkbox"
                         data-portal-field="allowDownload"
                         ${allowDownload ? 'checked' : ''} />
                  <span>Allow download</span>
                </label>
                <label style="display:flex; align-items:center; gap:4px;">
                  <input type="checkbox"
                         data-portal-field="allowSubfolders"
                         ${allowSubfolders ? 'checked' : ''} />
                  <span>Allow subfolders</span>
                </label>
              </div>

              <div class="text-muted" style="font-size:0.75rem; margin-top:4px;">
                Any user with access to the portal folder can sign in to the portal view.
              </div>
            </div>

            <div class="portal-section portal-user-block" style="${portalSectionStyle}">
              <div style="${portalSectionTitleStyle}">Portal user</div>
              <div class="text-muted" style="font-size:0.75rem; margin-top:-2px; margin-bottom:6px;">
                Optional: create a dedicated portal user for this portal and set its password here.
              </div>
              <div class="portal-user-row" style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
                <label style="display:flex; align-items:center; gap:4px; margin:0; font-size:0.8rem;">
                  <input type="checkbox"
                         data-portal-field="portalUserCreate"
                         ${portalUserCreate ? 'checked' : ''} />
                  <span>Create portal user</span>
                </label>
                <label style="margin:0; font-size:0.8rem;">
                  User preset:
                  <select class="form-control form-control-sm"
                          data-portal-field="portalUserPreset"
                          style="display:inline-block; width:190px; margin-left:4px;">
                    <option value="match"${portalUserPreset === 'match' ? ' selected' : ''}>Match portal access</option>
                    <option value="view_download"${portalUserPreset === 'view_download' ? ' selected' : ''}>View &amp; download</option>
                    <option value="view_upload"${portalUserPreset === 'view_upload' ? ' selected' : ''}>View &amp; upload</option>
                    <option value="upload_only"${portalUserPreset === 'upload_only' ? ' selected' : ''}>Upload only</option>
                  </select>
                </label>
                <label style="margin:0; font-size:0.8rem;">
                  Username:
                  <input type="text"
                         class="form-control form-control-sm"
                         data-portal-field="portalUsername"
                         value="${portalUserName}"
                         placeholder="${portalUserPlaceholder}"
                         style="display:inline-block; width:200px; margin-left:4px;">
                </label>
              </div>
              <div class="portal-user-pass-row" style="margin-top:6px;">
                <label style="margin:0; font-size:0.8rem;">
                  Password:
                  <input type="text"
                         class="form-control form-control-sm"
                         data-portal-field="portalUserPassword"
                         value=""
                         placeholder="${portalUserPasswordPlaceholder}"
                         style="width:220px; margin-left:4px;">
                </label>
                <div style="margin-top:4px; display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
                  ${portalUserPasswordStatus}
                  <small class="text-muted" style="font-size:0.75rem;">
                    ${portalUserPasswordNote}
                  </small>
                </div>
              </div>
              <div class="text-muted" style="font-size:0.75rem; margin-top:4px;">
                Deleting or expiring a portal removes its portal user on save.
              </div>
            </div>

            <div class="portal-section" style="${portalSectionStyle}">
              <div style="${portalSectionTitleStyle}">Portal content</div>
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
            </div>

            <div class="portal-section" style="${portalSectionStyle}">
              <div style="${portalSectionTitleStyle}">Branding &amp; theme</div>
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
                <strong style="font-size:0.85rem;">Theme overrides</strong>
                <div class="text-muted" style="font-size:0.75rem; margin-top:2px;">
                  Optional CSS values for light/dark themes (colors, gradients, shadows).
                </div>
              </div>
              <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:8px;">
                <div style="min-width:220px; flex:1 1 260px;">
                  <div class="text-muted" style="font-size:0.75rem; margin-bottom:4px;">Light mode</div>
                  <div class="form-group" style="margin-bottom:6px;">
                    <label style="margin:0; font-size:0.78rem;">Background</label>
                    <input type="text"
                           class="form-control form-control-sm"
                           data-portal-field="themeLightBodyBg"
                           value="${themeLightBodyBg}"
                           placeholder="e.g. #f8fafc or linear-gradient(...)">
                  </div>
                  <div class="form-group" style="margin-bottom:6px;">
                    <label style="margin:0; font-size:0.78rem;">Card surface</label>
                    <input type="text"
                           class="form-control form-control-sm"
                           data-portal-field="themeLightSurface"
                           value="${themeLightSurface}"
                           placeholder="e.g. #ffffff">
                  </div>
                  <div class="form-group" style="margin-bottom:6px;">
                    <label style="margin:0; font-size:0.78rem;">Text</label>
                    <input type="text"
                           class="form-control form-control-sm"
                           data-portal-field="themeLightText"
                           value="${themeLightText}"
                           placeholder="e.g. #0f172a">
                  </div>
                  <div class="form-group" style="margin-bottom:6px;">
                    <label style="margin:0; font-size:0.78rem;">Muted text</label>
                    <input type="text"
                           class="form-control form-control-sm"
                           data-portal-field="themeLightMuted"
                           value="${themeLightMuted}"
                           placeholder="e.g. #64748b">
                  </div>
                  <div class="form-group" style="margin-bottom:6px;">
                    <label style="margin:0; font-size:0.78rem;">Border</label>
                    <input type="text"
                           class="form-control form-control-sm"
                           data-portal-field="themeLightBorder"
                           value="${themeLightBorder}"
                           placeholder="e.g. rgba(15,23,42,0.12)">
                  </div>
                  <div class="form-group" style="margin-bottom:6px;">
                    <label style="margin:0; font-size:0.78rem;">Shadow</label>
                    <input type="text"
                           class="form-control form-control-sm"
                           data-portal-field="themeLightShadow"
                           value="${themeLightShadow}"
                           placeholder="e.g. 0 18px 50px rgba(15,23,42,0.12)">
                  </div>
                </div>
                <div style="min-width:220px; flex:1 1 260px;">
                  <div class="text-muted" style="font-size:0.75rem; margin-bottom:4px;">Dark mode</div>
                  <div class="form-group" style="margin-bottom:6px;">
                    <label style="margin:0; font-size:0.78rem;">Background</label>
                    <input type="text"
                           class="form-control form-control-sm"
                           data-portal-field="themeDarkBodyBg"
                           value="${themeDarkBodyBg}"
                           placeholder="e.g. #0f172a or linear-gradient(...)">
                  </div>
                  <div class="form-group" style="margin-bottom:6px;">
                    <label style="margin:0; font-size:0.78rem;">Card surface</label>
                    <input type="text"
                           class="form-control form-control-sm"
                           data-portal-field="themeDarkSurface"
                           value="${themeDarkSurface}"
                           placeholder="e.g. #111827">
                  </div>
                  <div class="form-group" style="margin-bottom:6px;">
                    <label style="margin:0; font-size:0.78rem;">Text</label>
                    <input type="text"
                           class="form-control form-control-sm"
                           data-portal-field="themeDarkText"
                           value="${themeDarkText}"
                           placeholder="e.g. #e2e8f0">
                  </div>
                  <div class="form-group" style="margin-bottom:6px;">
                    <label style="margin:0; font-size:0.78rem;">Muted text</label>
                    <input type="text"
                           class="form-control form-control-sm"
                           data-portal-field="themeDarkMuted"
                           value="${themeDarkMuted}"
                           placeholder="e.g. #94a3b8">
                  </div>
                  <div class="form-group" style="margin-bottom:6px;">
                    <label style="margin:0; font-size:0.78rem;">Border</label>
                    <input type="text"
                           class="form-control form-control-sm"
                           data-portal-field="themeDarkBorder"
                           value="${themeDarkBorder}"
                           placeholder="e.g. rgba(148,163,184,0.2)">
                  </div>
                  <div class="form-group" style="margin-bottom:6px;">
                    <label style="margin:0; font-size:0.78rem;">Shadow</label>
                    <input type="text"
                           class="form-control form-control-sm"
                           data-portal-field="themeDarkShadow"
                           value="${themeDarkShadow}"
                           placeholder="e.g. 0 20px 60px rgba(0,0,0,0.4)">
                  </div>
                </div>
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
                          style="min-width:120px;">
                    Upload logo…
                  </button>
                  <small class="text-muted" style="font-size:0.75rem;">
                    File is stored under <code>profile_pics</code>. Leave blank to use the default FileRise logo.
                  </small>
                </div>
              </div>
            </div>

            <div class="portal-section" style="${portalSectionStyle}">
              <div style="${portalSectionTitleStyle}">Upload behavior</div>
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

                <label style="margin:4px 0 0; display:flex; align-items:center; gap:6px; font-size:0.8rem;">
                  <input type="checkbox"
                         data-portal-field="thankYouShowRef"
                         ${thankYouShowRef ? 'checked' : ''}>
                  <span>Include submission ID in thank-you message</span>
                </label>

                <textarea class="form-control form-control-sm"
                          data-portal-field="thankYouText"
                          rows="2"
                          placeholder="e.g. Your files have been uploaded successfully. Our team will review them shortly.">${thankYouText}</textarea>
              </div>
            </div>

            <div class="portal-section" style="${portalSectionStyle}">
              <div style="${portalSectionTitleStyle}">Intake form</div>
              <div class="text-muted" style="font-size:0.75rem; margin-top:2px;">
                Customize field labels shown on the portal, plus optional defaults &amp; required flags.
              </div>

              <label style="margin:4px 0 6px; display:flex; align-items:center; gap:6px; font-size:0.8rem;">
                <input type="checkbox"
                       data-portal-field="requireForm"
                       ${requireForm ? 'checked' : ''} />
                <span>Require info form before upload</span>
              </label>

                            <div style="margin-top:4px;">
                <label style="font-size:0.75rem; margin:0;">
                  Preset:
                  <select class="form-control form-control-sm portal-intake-preset"
                          style="display:inline-block; width:200px; margin-left:4px;">
                    <option value="">Choose preset…</option>
                    <option value="legal">Legal intake</option>
                    <option value="tax">Tax client</option>
                    <option value="order">Order / RMA</option>
                    <option value="healthcare">Healthcare intake</option>
                    <option value="realestate">Real estate listing</option>
                    <option value="construction">Construction project</option>
                    <option value="creative">Creative brief</option>
                    <option value="finance">Finance onboarding</option>
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
          const portalUserInput = card.querySelector('[data-portal-field="portalUsername"]');
          if (portalUserInput && !portalUserInput.value.trim()) {
            portalUserInput.placeholder = buildPortalUsernamePreview(raw);
          }
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
        `Existing links for this portal will stop working once you click “Save settings”.\n` +
        `The portal user will be deleted on save.`
      );
      if (!ok) return;
  
      if (slug && __portalsCache[slug]) {
        delete __portalsCache[slug];
      }
      card.remove();
    });
  });
      // After rendering, if we have a "new" portal to focus, expand it and focus Folder
      if (__portalSlugToFocus) {
        const focusSlug = __portalSlugToFocus;
        __portalSlugToFocus = null;
  
        const focusCard = body.querySelector(`.portal-card[data-portal-slug="${focusSlug}"]`);
        if (focusCard) {
          const header = focusCard.querySelector('.portal-card-header');
          const bodyEl = focusCard.querySelector('.portal-card-body');
          const caret  = focusCard.querySelector('.portal-card-caret');
  
          if (header && bodyEl) {
            header.setAttribute('aria-expanded', 'true');
            bodyEl.style.display = 'block';
            if (caret) caret.textContent = '▾';
          }
  
          const folderInput = focusCard.querySelector('[data-portal-field="folder"]');
          if (folderInput) {
            folderInput.focus();
            folderInput.select();
          }
  
          focusCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
        // Keep submissions viewer working
        attachPortalSubmissionsUI();
        // Intake presets dropdowns
        attachPortalPresetSelectors();
        // Attach folder pickers (browse button / optional integration with global picker)
        attachPortalFolderPickers();
        // Portal logo uploaders
        attachPortalLogoUploaders();
        // Portal user controls (preset/username/password)
        attachPortalUserControls();


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
      sourceId: getDefaultPortalSourceId(),
      clientEmail: '',
      uploadOnly: true,
      allowDownload: false,
      allowSubfolders: false,
      expiresAt: '',
      portalUser: {
        create: true,
        preset: 'match',
        username: ''
      },
      _isNewPortal: true
    };

  // After re-render, auto-focus this portal's folder field
  __portalSlugToFocus = slug;
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
      const sourceSelect = card.querySelector('[data-portal-field="sourceId"]');
      if (!input) return;
  
      if (input.dataset._portalFolderPickerBound === '1') return;
      input.dataset._portalFolderPickerBound = '1';
  
      // Preferred path: if you ever add a central folder picker, use it:
      const useNativePicker = typeof window.FileRiseFolderPicker === 'function';
  
      const getSourceId = () => normalizePortalSourceId(sourceSelect ? sourceSelect.value : '') || getPortalSourceFallbackId();

      const openPicker = async () => {
        const sourceId = getSourceId();
        if (useNativePicker) {
          try {
            const folder = await window.FileRiseFolderPicker({
              current: input.value || '',
              mode: 'select-folder',
              source: 'client-portals',
              sourceId
            });
            if (folder) input.value = folder;
            return;
          } catch (e) {
            console.error('Folder picker error', e);
            showToast(t('admin_portal_open_folder_picker_failed'));
            return;
          }
        }
  
        // Fallback: datalist built from /api/folder/getFolderList.php
        try {
          const safeSourceId = (sourceId || 'local').replace(/[^A-Za-z0-9_-]/g, '') || 'local';
          const datalistId = 'portalFolderList-' + safeSourceId;
          let datalist = document.getElementById(datalistId);
          if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = datalistId;
            document.body.appendChild(datalist);
  
            const folders = await loadPortalFolderList(sourceId);
            datalist.innerHTML = '';
            folders.forEach(f => {
              const opt = document.createElement('option');
              opt.value = f;
              datalist.appendChild(opt);
            });
          }
  
          input.setAttribute('list', datalistId);
          input.focus();
          input.select();
        } catch (e) {
          console.error('Error preparing folder list', e);
          input.focus();
          input.select();
        }
      };

      if (sourceSelect && !sourceSelect.__frPortalSourceBound) {
        sourceSelect.__frPortalSourceBound = true;
        sourceSelect.addEventListener('change', () => {
          input.removeAttribute('list');
          input.dataset.portalSourceId = sourceSelect.value || '';
        });
      }
  
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
          showToast(t('admin_portal_slug_required'));
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
  
          showToast(t('admin_portal_logo_uploaded'));
        } catch (err) {
          console.error(err);
          const errMsg = (err && err.message) ? err.message : err;
          showToast(t('admin_portal_logo_upload_error', { error: errMsg }));
        } finally {
          fileInput.value = '';
        }
      });
    });
  }

  function attachPortalUserControls() {
    const body = document.getElementById('clientPortalsBody');
    if (!body) return;

    body.querySelectorAll('.portal-card').forEach(card => {
      const createEl = card.querySelector('[data-portal-field="portalUserCreate"]');
      const presetEl = card.querySelector('[data-portal-field="portalUserPreset"]');
      const userEl = card.querySelector('[data-portal-field="portalUsername"]');
      const passRow = card.querySelector('.portal-user-pass-row');
      const passInput = card.querySelector('[data-portal-field="portalUserPassword"]');

      const sync = () => {
        const enabled = !createEl || createEl.checked;
        [presetEl, userEl, passInput].forEach(el => {
          if (el) el.disabled = !enabled;
        });
        if (passRow) {
          passRow.style.display = enabled ? 'block' : 'none';
        }
      };

      if (createEl && !createEl.__portalUserBound) {
        createEl.__portalUserBound = true;
        createEl.addEventListener('change', sync);
      }

      sync();
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

    if (preset.theme) {
      const light = preset.theme.light || {};
      const dark = preset.theme.dark || {};
      setVal('[data-portal-field="themeLightBodyBg"]', light.bodyBg || '');
      setVal('[data-portal-field="themeLightSurface"]', light.surface || '');
      setVal('[data-portal-field="themeLightText"]', light.text || '');
      setVal('[data-portal-field="themeLightMuted"]', light.muted || '');
      setVal('[data-portal-field="themeLightBorder"]', light.border || '');
      setVal('[data-portal-field="themeLightShadow"]', light.shadow || '');
      setVal('[data-portal-field="themeDarkBodyBg"]', dark.bodyBg || '');
      setVal('[data-portal-field="themeDarkSurface"]', dark.surface || '');
      setVal('[data-portal-field="themeDarkText"]', dark.text || '');
      setVal('[data-portal-field="themeDarkMuted"]', dark.muted || '');
      setVal('[data-portal-field="themeDarkBorder"]', dark.border || '');
      setVal('[data-portal-field="themeDarkShadow"]', dark.shadow || '');
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
  
    showToast(t('admin_portal_preset_applied', { label: preset.label }));
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

  const formatTimestamp = (value) => {
    if (!value) return '';
    try {
      const d = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString(undefined, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
      }
    } catch (e) {
      return String(value);
    }
    return String(value);
  };

  submissions.forEach(sub => {
    const item = document.createElement('div');
    item.className = 'portal-submissions-item';

    const header = document.createElement('div');
    header.className = 'portal-submissions-header';

    const headerParts = [];

    const created = sub.createdAt || sub.created_at || sub.timestamp || sub.time;
    if (created) {
      headerParts.push(formatTimestamp(created));
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
    const submissionRef = sub.submissionRef || raw.submissionRef || '';

    if (name) summaryParts.push('Name: ' + name);
    if (email) summaryParts.push('Email: ' + email);
    if (ref) summaryParts.push('Ref: ' + ref);
    if (submissionRef) summaryParts.push('Submission ID: ' + submissionRef);
    if (notes) summaryParts.push('Notes: ' + notes);

    summary.textContent = summaryParts.join(' • ');

    item.appendChild(header);
    if (summaryParts.length) {
      item.appendChild(summary);
    }

    const downloads = Array.isArray(sub.downloads)
      ? sub.downloads
      : (Array.isArray(raw.downloads) ? raw.downloads : []);
    if (downloads.length) {
      const dlEl = document.createElement('div');
      dlEl.className = 'portal-submissions-downloads';
      dlEl.style.fontSize = '0.78rem';
      dlEl.style.color = '#6c757d';
      const parts = downloads.map(dl => {
        const file = dl.file || dl.path || '';
        const when = formatTimestamp(dl.createdAt || dl.created_at || dl.timestamp || dl.time);
        if (file && when) return file + ' (' + when + ')';
        if (file) return file;
        return when;
      }).filter(Boolean);
      dlEl.textContent = parts.length ? ('Downloads: ' + parts.join(' • ')) : 'Downloads:';
      item.appendChild(dlEl);
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
    const submissionRef = sub.submissionRef || raw.submissionRef || '';
    const downloads = Array.isArray(sub.downloads)
      ? sub.downloads
      : (Array.isArray(raw.downloads) ? raw.downloads : []);
    const downloadsSummary = downloads.map(dl => {
      const file = dl.file || dl.path || '';
      const when = dl.createdAt || dl.created_at || dl.timestamp || dl.time || '';
      if (file && when) return file + ' @ ' + when;
      return file || String(when || '');
    }).filter(Boolean).join('; ');
  
    return {
      created,
      folder,
      submittedBy,
      ip,
      submissionRef,
      name,
      email,
      reference,
      notes,
      downloadsSummary
    };
  }
  
  function csvEscape(val) {
    if (val == null) return '';
    const str = String(val);
    const trimmed = str.replace(/^\s+/, '');
    const needsGuard = trimmed !== '' && /^[=+\-@]/.test(trimmed);
    const safe = needsGuard ? ("'" + str) : str;
    if (/[",\n\r]/.test(safe)) {
      return '"' + safe.replace(/"/g, '""') + '"';
    }
    return safe;
  }
  
  function exportSubmissionsToCsv(slug, submissions) {
    if (!Array.isArray(submissions) || !submissions.length) {
      showToast(t('admin_portal_no_submissions_export'));
      return;
    }
  
    const header = [
      'Created',
      'Folder',
      'SubmittedBy',
      'IP',
      'SubmissionRef',
      'Name',
      'Email',
      'Reference',
      'Notes',
      'Downloads'
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
        row.submissionRef,
        row.name,
        row.email,
        row.reference,
        row.notes,
        row.downloadsSummary
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
        const errMsg = (err && err.message) ? err.message : err;
        showToast(t('admin_portal_submissions_load_error', { error: errMsg }));
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
        showToast(t('admin_portal_no_submissions_yet'));
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
  const portalsCache = {};
  const invalid = [];
  const portalUserInvalid = [];
  let firstInvalidField = null;

  // Clear previous visual errors
  cards.forEach(card => {
    card.style.boxShadow = '';
    card.style.borderColor = '';
    card.classList.remove('portal-card-has-error');

    const hint = card.querySelector('.portal-card-error-hint');
    if (hint) hint.remove();
  });

  const markCardMissingRequired = (card, message) => {
    // Mark visually
    card.classList.add('portal-card-has-error');
    card.style.borderColor = '#dc3545';
    card.style.boxShadow = '0 0 0 2px rgba(220,53,69,0.6)';

    // Expand the card so the error is visible even if it was collapsed
    const header = card.querySelector('.portal-card-header');
    const bodyEl = card.querySelector('.portal-card-body') || card;
    const caret = card.querySelector('.portal-card-caret');

    if (header && bodyEl) {
      header.setAttribute('aria-expanded', 'true');
      bodyEl.style.display = 'block';
      if (caret) caret.textContent = '▾';
    }

    // Small inline hint at top of the card body
    let hint = bodyEl.querySelector('.portal-card-error-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'portal-card-error-hint text-danger small';
      hint.style.marginBottom = '6px';
      hint.textContent = message || 'Slug and folder are required. This portal will not be saved until both are filled.';
      bodyEl.insertBefore(hint, bodyEl.firstChild);
    } else {
      hint.textContent = message || hint.textContent;
    }
  };

  cards.forEach(card => {
    const origSlug = card.getAttribute('data-portal-slug') || '';
    const isNewPortal = card.getAttribute('data-portal-new') === '1';
    let slug = origSlug.trim();
    const existingPortal = __portalsCache[origSlug] || {};
    const existingPortalUser = (existingPortal.portalUser && typeof existingPortal.portalUser === 'object')
      ? existingPortal.portalUser
      : {};

    const getVal = (selector) => {
      const el = card.querySelector(selector);
      return el ? el.value || '' : '';
    };

    const label = getVal('[data-portal-field="label"]').trim();
    const folder = getVal('[data-portal-field="folder"]').trim();
    const sourceId = normalizePortalSourceId(getVal('[data-portal-field="sourceId"]')) || getPortalSourceFallbackId();
    const clientEmail = getVal('[data-portal-field="clientEmail"]').trim();
    const expiresAt = getVal('[data-portal-field="expiresAt"]').trim();
    const title = getVal('[data-portal-field="title"]').trim();
    const introText = getVal('[data-portal-field="introText"]').trim();

    const brandColor = getVal('[data-portal-field="brandColor"]').trim();
    const footerText = getVal('[data-portal-field="footerText"]').trim();
    const logoFile   = getVal('[data-portal-field="logoFile"]').trim();
    const logoUrl    = getVal('[data-portal-field="logoUrl"]').trim(); // (optional, not exposed in UI yet)
    const themeLightBodyBg = getVal('[data-portal-field="themeLightBodyBg"]').trim();
    const themeLightSurface = getVal('[data-portal-field="themeLightSurface"]').trim();
    const themeLightText = getVal('[data-portal-field="themeLightText"]').trim();
    const themeLightMuted = getVal('[data-portal-field="themeLightMuted"]').trim();
    const themeLightBorder = getVal('[data-portal-field="themeLightBorder"]').trim();
    const themeLightShadow = getVal('[data-portal-field="themeLightShadow"]').trim();
    const themeDarkBodyBg = getVal('[data-portal-field="themeDarkBodyBg"]').trim();
    const themeDarkSurface = getVal('[data-portal-field="themeDarkSurface"]').trim();
    const themeDarkText = getVal('[data-portal-field="themeDarkText"]').trim();
    const themeDarkMuted = getVal('[data-portal-field="themeDarkMuted"]').trim();
    const themeDarkBorder = getVal('[data-portal-field="themeDarkBorder"]').trim();
    const themeDarkShadow = getVal('[data-portal-field="themeDarkShadow"]').trim();
    const theme = {
      light: {
        bodyBg: themeLightBodyBg,
        surface: themeLightSurface,
        text: themeLightText,
        muted: themeLightMuted,
        border: themeLightBorder,
        shadow: themeLightShadow,
      },
      dark: {
        bodyBg: themeDarkBodyBg,
        surface: themeDarkSurface,
        text: themeDarkText,
        muted: themeDarkMuted,
        border: themeDarkBorder,
        shadow: themeDarkShadow,
      },
    };
    const themeHasValue = Object.values(theme.light).some((v) => v !== '')
      || Object.values(theme.dark).some((v) => v !== '');

    const defName  = getVal('[data-portal-field="defName"]').trim();
    const defEmail = getVal('[data-portal-field="defEmail"]').trim();
    const defRef   = getVal('[data-portal-field="defRef"]').trim();
    const defNotes = getVal('[data-portal-field="defNotes"]').trim();

    const lblName  = getVal('[data-portal-field="lblName"]').trim();
    const lblEmail = getVal('[data-portal-field="lblEmail"]').trim();
    const lblRef   = getVal('[data-portal-field="lblRef"]').trim();
    const lblNotes = getVal('[data-portal-field="lblNotes"]').trim();

    const uploadOnlyEl    = card.querySelector('[data-portal-field="uploadOnly"]');
    const allowDownloadEl = card.querySelector('[data-portal-field="allowDownload"]');
    const allowSubfoldersEl = card.querySelector('[data-portal-field="allowSubfolders"]');
    const requireFormEl   = card.querySelector('[data-portal-field="requireForm"]');

    const uploadOnly    = uploadOnlyEl ? !!uploadOnlyEl.checked : true;
    const allowDownload = allowDownloadEl ? !!allowDownloadEl.checked : false;
    const allowSubfolders = allowSubfoldersEl ? !!allowSubfoldersEl.checked : false;
    const requireForm   = requireFormEl ? !!requireFormEl.checked : false;

    const portalUserCreateEl = card.querySelector('[data-portal-field="portalUserCreate"]');
    const portalUserPresetRaw = getVal('[data-portal-field="portalUserPreset"]').trim();
    const portalUserPreset = portalUserPresetRaw || 'match';
    const portalUserName = getVal('[data-portal-field="portalUsername"]').trim();
    const portalUserPassword = getVal('[data-portal-field="portalUserPassword"]').trim();
    const portalUserCreate = portalUserCreateEl ? !!portalUserCreateEl.checked : true;

    const reqNameEl  = card.querySelector('[data-portal-field="reqName"]');
    const reqEmailEl = card.querySelector('[data-portal-field="reqEmail"]');
    const reqRefEl   = card.querySelector('[data-portal-field="reqRef"]');
    const reqNotesEl = card.querySelector('[data-portal-field="reqNotes"]');

    const reqName  = reqNameEl ? !!reqNameEl.checked : false;
    const reqEmail = reqEmailEl ? !!reqEmailEl.checked : false;
    const reqRef   = reqRefEl ? !!reqRefEl.checked : false;
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
    const thankYouShowRefEl = card.querySelector('[data-portal-field="thankYouShowRef"]');
    const thankYouShowRef   = thankYouShowRefEl ? !!thankYouShowRefEl.checked : false;
    const folderInput = card.querySelector('[data-portal-field="folder"]');
    const slugInput = card.querySelector('[data-portal-field="slug"]');
    if (slugInput) {
      const rawSlug = slugInput.value.trim();
      if (rawSlug) slug = rawSlug;
    }

    const labelForError = label || slug || origSlug || '(unnamed portal)';

    // Validation: slug + folder required
    if (!slug || !folder) {
      invalid.push(labelForError);

      // Remember the first problematic field so we can scroll exactly to it
      if (!firstInvalidField) {
        if (!folder && folderInput) {
          firstInvalidField = folderInput;
        } else if (!slug && slugInput) {
          firstInvalidField = slugInput;
        } else {
          firstInvalidField = card;
        }
      }

      markCardMissingRequired(
        card,
        'Slug and folder are required. This portal will not be saved until both are filled.'
      );
      return;
    }

    if (portalUserCreate && portalUserPassword && portalUserPassword.length < 6) {
      portalUserInvalid.push(labelForError);
      const passwordInput = card.querySelector('[data-portal-field="portalUserPassword"]');
      if (!firstInvalidField) {
        firstInvalidField = passwordInput || card;
      }
      markCardMissingRequired(
        card,
        'Portal user password must be at least 6 characters.'
      );
      return;
    }

    if (isNewPortal && portalUserCreate && !portalUserPassword) {
      portalUserInvalid.push(labelForError);
      const passwordInput = card.querySelector('[data-portal-field="portalUserPassword"]');
      if (!firstInvalidField) {
        firstInvalidField = passwordInput || card;
      }
      markCardMissingRequired(
        card,
        'Portal user password is required when creating a new portal.'
      );
      return;
    }

    const portalExpired = isPortalExpiredDate(expiresAt);
    let portalUserPasswordSet = false;
    if (portalUserCreate && !portalExpired) {
      if (portalUserPassword) {
        portalUserPasswordSet = true;
      } else if (!isNewPortal) {
        portalUserPasswordSet = true;
      }
      if (!portalUserPassword && existingPortalUser.passwordSet === false) {
        portalUserPasswordSet = false;
      }
    }

    const portalUserPayload = {
      create: portalUserCreate,
      preset: portalUserPreset,
      username: portalUserName
    };
    if (portalUserCreate && portalUserPassword) {
      portalUserPayload.password = portalUserPassword;
    }
    const portalUserStored = {
      create: portalUserCreate,
      preset: portalUserPreset,
      username: portalUserName,
      passwordSet: portalUserPasswordSet
    };

    const portalData = {
      label,
      folder,
      sourceId,
      clientEmail,
      uploadOnly,
      allowDownload,
      allowSubfolders,
      expiresAt,
      title,
      introText,
      requireForm,
      brandColor,
      footerText,
      logoFile,
      logoUrl,
      portalUser: portalUserPayload,
      formDefaults: {
        name:      defName,
        email:     defEmail,
        reference: defRef,
        notes:     defNotes
      },
      formRequired: {
        name:      reqName,
        email:     reqEmail,
        reference: reqRef,
        notes:     reqNotes
      },
      formLabels: {
        name:      lblName,
        email:     lblEmail,
        reference: lblRef,
        notes:     lblNotes
      },
      formVisible: {
        name:      visName,
        email:     visEmail,
        reference: visRef,
        notes:     visNotes
      },
      uploadMaxSizeMb:   uploadMaxSizeMb ? parseInt(uploadMaxSizeMb, 10) || 0 : 0,
      uploadExtWhitelist,
      uploadMaxPerDay:   uploadMaxPerDay ? parseInt(uploadMaxPerDay, 10) || 0 : 0,
      showThankYou,
      thankYouShowRef,
      thankYouText,
      ...(themeHasValue ? { theme } : {}),
    };
    const portalDataCache = {
      ...portalData,
      portalUser: portalUserStored
    };
    portals[slug] = portalData;
    portalsCache[slug] = portalDataCache;
  });

  if (invalid.length) {
    if (status) {
      status.textContent = 'Please fill slug and folder for highlighted portals.';
      status.className = 'small text-danger';
    }

    // Scroll the *first missing field* into view so the admin sees exactly where to fix
    const targetEl = firstInvalidField || body.querySelector('.portal-card-has-error');
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // If it's an input, focus + select to make typing instant
      if (typeof targetEl.focus === 'function') {
        targetEl.focus();
        if (typeof targetEl.select === 'function') {
          targetEl.select();
        }
      }
    }

    showToast(t('admin_portal_slug_folder_required', { list: invalid.join(', ') }));
    return; // Don’t hit the API if local validation failed
  }

  if (portalUserInvalid.length) {
    if (status) {
      status.textContent = 'Please fix portal user passwords for highlighted portals.';
      status.className = 'small text-danger';
    }
    const targetEl = firstInvalidField || body.querySelector('.portal-card-has-error');
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (typeof targetEl.focus === 'function') {
        targetEl.focus();
        if (typeof targetEl.select === 'function') {
          targetEl.select();
        }
      }
    }
    showToast('Portal user password issue: ' + portalUserInvalid.join(', '));
    return;
  }

  if (status) {
    status.textContent = 'Saving…';
    status.className = 'small text-muted';
  }

  try {
    const res = await saveAllPortals(portals);
    if (!res || res.success !== true) {
      throw new Error(res && res.error ? res.error : 'Unknown error saving client portals');
    }
    __portalsCache = portalsCache;
    if (status) {
      status.textContent = 'Saved.';
      status.className = 'small text-success';
    }
    showToast(t('admin_portal_saved'));

    // Re-render from cache so headers / slugs / etc. all reflect the saved state
    await loadClientPortalsList(true);
  } catch (e) {
    console.error(e);
    if (status) {
      status.textContent = 'Error saving.';
      status.className = 'small text-danger';
    }
    showToast(t('admin_portal_save_error', { error: (e.message || e) }));
  }
}
