// adminPanel.js
import { t } from './i18n.js?v={{APP_QVER}}';
import { loadAdminConfigFunc } from './auth.js?v={{APP_QVER}}';
import { showToast, toggleVisibility, attachEnterKeyListener, escapeHTML } from './domUtils.js?v={{APP_QVER}}';
import { sendRequest } from './networkUtils.js?v={{APP_QVER}}';
import { withBase } from './basePath.js?v={{APP_QVER}}';
import { startTransferProgress, finishTransferProgress } from './transferProgress.js?v={{APP_QVER}}';
import { initAdminStorageSection } from './adminStorage.js?v={{APP_QVER}}';
import { initAdminSponsorSection } from './adminSponsor.js?v={{APP_QVER}}';
import { initOnlyOfficeUI, collectOnlyOfficeSettingsForSave } from './adminOnlyOffice.js?v={{APP_QVER}}';
import { openClientPortalsModal } from './adminPortals.js?v={{APP_QVER}}';
import {
  openUserPermissionsModal,
  openUserGroupsModal,
  populateAdminUserHubSelect,
  fetchAllUsers,
  isAdminUser,
  computeGroupGrantMaskForUser,
  applyGroupLocksForUser
} from './adminFolderAccess.js?v={{APP_QVER}}';
export {
  openUserPermissionsModal,
  openUserGroupsModal
} from './adminFolderAccess.js?v={{APP_QVER}}';

const version = window.APP_VERSION || "dev";
// Hard-coded *FOR NOW* latest FileRise Pro bundle version for UI hints only.
// Update this when I cut a new Pro ZIP.
const PRO_LATEST_BUNDLE_VERSION = 'v1.6.0';
const PRO_API_LEVELS = {
  diskUsage: 2,
  search: 3,
  audit: 4,
  sources: 5
};
const PRO_API_MIN_VERSION_LABELS = {
  diskUsage: '1.2.0',
  search: '1.3.0',
  audit: '1.4.0',
  sources: '1.5.0'
};
const CORE_REQUIRED_PRO_API_LEVEL = Math.max(...Object.values(PRO_API_LEVELS));
const DEFAULT_HEADER_TITLE = 'FileRise';
const PRO_DEFAULT_HEADER_TITLE = 'FileRise Pro';

function resolveHeaderTitle(rawTitle, isPro) {
  const cleaned = String(rawTitle || '').trim();
  if (!cleaned || cleaned === DEFAULT_HEADER_TITLE) {
    return isPro ? PRO_DEFAULT_HEADER_TITLE : DEFAULT_HEADER_TITLE;
  }
  return cleaned;
}

function compareSemver(a, b) {
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

function startProBundleProgress({ action = 'Updating Pro', title, subText } = {}) {
  return startTransferProgress({
    action,
    title: title || action,
    subText: subText || 'Please keep this tab open.',
    itemCount: 0,
    bytesKnown: false
  });
}

function finishProBundleProgress(job, ok, error = '') {
  if (!job) return;
  finishTransferProgress(job, { ok, error });
}

// Ensure OIDC config object always exists
if (!window.currentOIDCConfig || typeof window.currentOIDCConfig !== 'object') {
  window.currentOIDCConfig = {};
}

async function loadVirusDetectionLog() {
  const tableBody = document.getElementById('virusLogTableBody');
  const emptyEl = document.getElementById('virusLogEmpty');
  const wrapper = document.getElementById('virusLogWrapper');

  if (!wrapper || !tableBody || !emptyEl) return;

  // If Pro is not active, we just leave the static "Pro" notice alone.
  if (!window.__FR_IS_PRO) {
    return;
  }

  emptyEl.textContent = 'Loading recent detections…';
  tableBody.innerHTML = '';

  try {
    const res = await fetch('/api/admin/virusLog.php?limit=50', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'X-CSRF-Token': window.csrfToken || '',
        'Accept': 'application/json',
      },
    });

    const data = await safeJson(res);

    if (!data || data.ok !== true) {
      const msg = (data && (data.error || data.message)) || 'Failed to load detection log.';
      emptyEl.textContent = msg;
      return;
    }

    const entries = Array.isArray(data.entries) ? data.entries : [];
    if (!entries.length) {
      emptyEl.textContent = 'No virus detections have been logged yet.';
      return;
    }

    emptyEl.textContent = 'Tip: hover or click a row to see full ClamAV details.';
    tableBody.innerHTML = '';

    entries.forEach(row => {
      const tr = document.createElement('tr');

      // Build a compact ClamAV info summary for tooltip / click
      const infoParts = [];
      if (row.engine) {
        infoParts.push(`Engine: ${row.engine}`);
      }
      if (
        typeof row.exitCode === 'number' ||
        (typeof row.exitCode === 'string' && row.exitCode !== '')
      ) {
        infoParts.push(`Exit: ${row.exitCode}`);
      }
      if (row.source) {
        infoParts.push(`Source: ${row.source}`);
      }
      if (row.message) {
        // keep it single-line-ish for tooltip/toast
        const msg = String(row.message).replace(/\s+/g, ' ').trim();
        if (msg) infoParts.push(`Message: ${msg}`);
      }
      const infoText = infoParts.join(' • ');

      tr.innerHTML = `
        <td>${escapeHTML(row.ts || '')}</td>
        <td>${escapeHTML(row.user || '')}</td>
        <td>${escapeHTML(row.ip || '')}</td>
        <td>${escapeHTML(row.file || '')}</td>
        <td>${escapeHTML(row.folder || '')}</td>
      `;

      if (infoText) {
        // Native browser tooltip on hover
        tr.title = infoText;
        // Visual hint that row is interactive
        tr.style.cursor = 'pointer';

        // Click to show toast with same info
        tr.addEventListener('click', () => {
          showToast(infoText);
        });
      }

      tableBody.appendChild(tr);
    });
  } catch (e) {
    console.error('Failed to load virus detection log', e);
    emptyEl.textContent = 'Failed to load detection log.';
  }
}

async function downloadVirusLogCsv() {
  const emptyEl = document.getElementById('virusLogEmpty');
  if (emptyEl) {
    emptyEl.textContent = 'Preparing CSV…';
  }

  try {
    const res = await fetch('/api/admin/virusLog.php?limit=2000&format=csv', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'X-CSRF-Token': window.csrfToken || '',
        'Accept': 'text/csv,text/plain;q=0.9,*/*;q=0.8',
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'filerise-virus-log.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    if (emptyEl && emptyEl.textContent === 'Preparing CSV…') {
      emptyEl.textContent = '';
    }
  } catch (e) {
    console.error('Failed to download virus log CSV', e);
    if (emptyEl) {
      emptyEl.textContent = 'Failed to download CSV.';
    }
    showToast(t('admin_csv_download_failed'), 'error');
  }
}

function initVirusLogUI({ isPro }) {
  const uploadScope = document.getElementById('uploadContent');
  if (!uploadScope) return;

  const wrapper = uploadScope.querySelector('#virusLogWrapper');
  if (!wrapper) return;

  // global hint for loadVirusDetectionLog
  window.__FR_IS_PRO = !!isPro;

  if (!isPro) {
    // Free/core: we just show the static Pro alert text, nothing to wire
    return;
  }

  const refreshBtn = uploadScope.querySelector('#virusLogRefreshBtn');
  const downloadBtn = uploadScope.querySelector('#virusLogDownloadCsvBtn');

  if (refreshBtn && !refreshBtn.__wired) {
    refreshBtn.__wired = true;
    refreshBtn.addEventListener('click', (e) => {
      e.preventDefault();
      loadVirusDetectionLog();
    });
  }

  if (downloadBtn && !downloadBtn.__wired) {
    downloadBtn.__wired = true;
    downloadBtn.addEventListener('click', (e) => {
      e.preventDefault();
      downloadVirusLogCsv();
    });
  }

  // Initial load
  loadVirusDetectionLog();
}

function normalizeLogoPath(raw) {
  if (!raw) return '';
  const parts = String(raw).split(':');
  let pic = parts[parts.length - 1];
  pic = pic.replace(/^:+/, '');
  if (pic && !pic.startsWith('/')) pic = '/' + pic;
  return pic;
}

function getAdminTitle(isPro, proVersion, updatesExpired = false) {
  const corePill = `
    <span class="badge badge-pill badge-secondary admin-core-badge">
      Core ${version}
    </span>
  `;

  // Normalize versions so "v1.0.1" and "1.0.1" compare cleanly
  const norm = (v) => String(v || '').trim().replace(/^v/i, '');

  const latestRaw = (typeof PRO_LATEST_BUNDLE_VERSION !== 'undefined'
    ? PRO_LATEST_BUNDLE_VERSION
    : ''
  );

  const currentRaw = (proVersion && proVersion !== 'not installed')
    ? String(proVersion)
    : '';

  const hasCurrent = !!norm(currentRaw);
  const hasLatest = !!norm(latestRaw);
  const hasUpdate = isPro && hasCurrent && hasLatest &&
    norm(currentRaw) !== norm(latestRaw);

  if (!isPro) {
    // Free/core only
    return `
      ${t("admin_panel")}
      ${corePill}
    `;
  }

  const pvLabel = hasCurrent ? `Pro v${norm(currentRaw)}` : 'Pro';

  const proPill = `
    <span class="badge badge-pill badge-warning admin-pro-badge">
      ${pvLabel}
    </span>
  `;

  const updateHint = hasUpdate
    ? (updatesExpired
        ? `
      <a
        href="https://filerise.net/pro/renew.php"
        target="_blank"
        rel="noopener noreferrer"
        id="proUpdatePill"
        class="badge badge-pill badge-warning admin-pro-badge"
        style="cursor:pointer; text-decoration:none; margin-left:4px;">
        Renew to unlock new Pro features
      </a>
    `
        : `
      <a
        href="https://filerise.net/pro/update.php"
        target="_blank"
        rel="noopener noreferrer"
        id="proUpdatePill"
        class="badge badge-pill badge-warning admin-pro-badge"
        style="cursor:pointer; text-decoration:none; margin-left:4px;">
        Pro update available
      </a>
    `)
    : '';

  return `
    ${t("admin_panel")}
    ${corePill}
    ${proPill}
    ${updateHint}
  `;
}


function buildFullGrantsForAllFolders(folders) {
  const allTrue = {
    view: true, viewOwn: false, manage: true, create: true, upload: true, edit: true,
    rename: true, copy: true, move: true, delete: true, extract: true,
    shareFile: true, shareFolder: true, share: true
  };
  return folders.reduce((acc, f) => { acc[f] = { ...allTrue }; return acc; }, {});
}
function applyHeaderColorsFromAdmin() {
  try {
    const lightInput = document.getElementById('brandingHeaderBgLight');
    const darkInput = document.getElementById('brandingHeaderBgDark');
    const root = document.documentElement;

    const light = lightInput ? lightInput.value.trim() : '';
    const dark = darkInput ? darkInput.value.trim() : '';

    if (light) root.style.setProperty('--header-bg-light', light);
    else root.style.removeProperty('--header-bg-light');

    if (dark) root.style.setProperty('--header-bg-dark', dark);
    else root.style.removeProperty('--header-bg-dark');
  } catch (e) {
    console.warn('Failed to live-update header colors from admin panel', e);
  }
}
function applyFooterFromAdmin() {
  try {
    const footerEl = document.getElementById('siteFooter');
    if (!footerEl) return;

    const val = (document.getElementById('brandingFooterHtml')?.value || '').trim();
    if (val) {
      // Show raw text in the live preview; HTML will be rendered on real page load
      footerEl.textContent = val;
    } else {
      const year = new Date().getFullYear();
      footerEl.innerHTML =
        `&copy; ${year}&nbsp;<a href="https://filerise.net" target="_blank" rel="noopener noreferrer">FileRise</a>`;
    }
  } catch (e) {
    console.warn('Failed to live-update footer from admin panel', e);
  }
}

function updateHeaderLogoFromAdmin() {
  try {
    const input = document.getElementById('brandingCustomLogoUrl');
    const logoImg = document.querySelector('.header-logo img');
    if (!logoImg) return;

    const sanitizeLogoUrl = (raw) => {
      let url = (raw || '').trim();
      if (!url) return '';

      // If they used a bare "uploads/..." path, normalize to "/uploads/..."
      if (!url.startsWith('/') && url.startsWith('uploads/')) {
        url = '/' + url;
      }

      // Strip any CR/LF just in case
      url = url.replace(/[\r\n]+/g, '');

      if (url.startsWith('/')) {
        if (url.includes('://')) return '';
        return withBase(url);
      }

      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
        return parsed.toString();
      } catch (e) {
        return '';
      }
    };

    const safeUrl = sanitizeLogoUrl((input && input.value) || '');

    if (safeUrl) {
      logoImg.setAttribute('src', safeUrl);
      logoImg.setAttribute('alt', 'Site logo');
    } else {
      // fall back to default FileRise logo
      logoImg.setAttribute('src', withBase('/assets/logo.svg?v={{APP_QVER}}'));
      logoImg.setAttribute('alt', 'FileRise');
    }
  } catch (e) {
    console.warn('Failed to live-update header logo from admin panel', e);
  }
}

/* === BEGIN: Folder Access helpers (merged + improved) === */
function qs(scope, sel) { return (scope || document).querySelector(sel); }
function qsa(scope, sel) { return Array.from((scope || document).querySelectorAll(sel)); }

function enforceShareFolderRule(row) {
  const manage = qs(row, 'input[data-cap="manage"]');
  const viewAll = qs(row, 'input[data-cap="view"]');
  const shareFolder = qs(row, 'input[data-cap="shareFolder"]');
  if (!shareFolder) return;
  const ok = !!(manage && manage.checked) && !!(viewAll && viewAll.checked);
  if (!ok) {
    shareFolder.checked = false;
    shareFolder.disabled = true;
    shareFolder.setAttribute('data-disabled-reason', 'Requires Manage + View (all)');
  } else {
    shareFolder.disabled = false;
    shareFolder.removeAttribute('data-disabled-reason');
  }
}

function wireHeaderTitleLive() {
  const input = document.getElementById('headerTitle');
  if (!input || input.__live) return;
  input.__live = true;

  const apply = (val) => {
    const title = resolveHeaderTitle(val, window.__FR_IS_PRO === true);
    const h1 = document.querySelector('.header-title h1');
    if (h1) h1.textContent = title;
    document.title = title;
    window.headerTitle = val || ''; // preserve raw value user typed
    try { localStorage.setItem('headerTitle', title); } catch (e) { }
  };

  // apply current value immediately + on each keystroke
  apply(input.value);
  input.addEventListener('input', (e) => apply(e.target.value));
}

function renderMaskedInput({ id, label, hasValue, isSecret = false }) {
  const type = isSecret ? 'password' : 'text';
  const disabled = hasValue ? 'disabled data-replace="0" placeholder="•••••• (saved)"' : 'data-replace="1"';
  const replaceBtn = hasValue
    ? `<button type="button" class="btn btn-sm btn-outline-secondary" data-replace-for="${id}">Replace</button>`
    : '';
  const note = hasValue
    ? `<small class="text-success" style="margin-left:4px;">Saved — leave blank to keep</small>`
    : '';

  return `
    <div class="form-group">
      <label for="${id}">${label}:</label>
      <div style="display:flex; gap:8px; align-items:center;">
        <input type="${type}" id="${id}" class="form-control" ${disabled} />
        ${replaceBtn}
      </div>
      ${note}
    </div>
  `;
}

function wireReplaceButtons(scope = document) {
  scope.querySelectorAll('[data-replace-for]').forEach(btn => {
    if (btn.__wired) return;
    btn.__wired = true;
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-replace-for');
      const inp = scope.querySelector('#' + id);
      if (!inp) return;
      inp.disabled = false;
      inp.dataset.replace = '1';
      inp.placeholder = '';
      inp.value = '';
      btn.textContent = 'Keep saved value';
      btn.removeAttribute('data-replace-for');
      btn.addEventListener('click', () => { /* no-op after first toggle */ }, { once: true });
    }, { once: true });
  });
}

function wireOidcTestButton(scope = document) {
  const btn = scope.querySelector('#oidcTestBtn');
  const statusEl = scope.querySelector('#oidcTestStatus');
  if (!btn || !statusEl || btn.__wired) return;

  btn.__wired = true;

  btn.addEventListener('click', async () => {
    const urlInput = scope.querySelector('#oidcProviderUrl');
    const redirectInput = scope.querySelector('#oidcRedirectUri');

    const providerUrl = (urlInput && urlInput.value.trim()) || '';
    const redirectUri = (redirectInput && redirectInput.value.trim()) || '';

    statusEl.textContent = providerUrl
      ? `Testing discovery for ${providerUrl}…`
      : 'Testing saved OIDC configuration…';
    statusEl.className = 'small text-muted';

    try {
      const res = await fetch('/api/admin/oidcTest.php', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': window.csrfToken || ''
        },
        body: JSON.stringify({
          providerUrl: providerUrl || null,
          redirectUri: redirectUri || null
        })
      });

      const data = await safeJson(res);

      if (!data || data.success !== true) {
        const msg = (data && (data.error || data.message)) || 'OIDC test failed.';
        statusEl.textContent = msg;
        statusEl.className = 'small text-danger';
        showToast(t('admin_oidc_test_failed_detail', { error: msg }), 'error');
        return;
      }

      const parts = [];
      const authEndpoint = data.authorization_endpoint || data.authorizationUrl;
      const userinfoEndpoint = data.userinfo_endpoint || data.userinfoUrl;

      if (data.issuer) parts.push('issuer: ' + data.issuer);
      if (authEndpoint) parts.push('auth: ' + authEndpoint);
      if (userinfoEndpoint) parts.push('userinfo: ' + userinfoEndpoint);

      const summary = parts.length
        ? 'OK – ' + parts.join(' • ')
        : 'OK – provider discovery succeeded.';

      statusEl.textContent = summary;
      statusEl.className = 'small text-success';
      showToast(t('admin_oidc_discovery_reachable'));

      if (Array.isArray(data.warnings) && data.warnings.length) {
        console.warn('OIDC test warnings:', data.warnings);
      }
    } catch (e) {
      console.error('OIDC test error', e);
      statusEl.textContent = 'Error: ' + (e && e.message ? e.message : String(e));
      statusEl.className = 'small text-danger';
      showToast(t('admin_oidc_test_failed_console'), 'error');
    }
  });
}

function wireClamavTestButton(scope = document) {
  const btn = scope.querySelector('#clamavTestBtn');
  const statusEl = scope.querySelector('#clamavTestStatus');
  if (!btn || !statusEl || btn.__wired) return;

  btn.__wired = true;

  btn.addEventListener('click', async () => {
    statusEl.textContent = 'Running ClamAV self-test…';
    statusEl.className = 'small text-muted';

    try {
      const res = await fetch('/api/admin/clamavTest.php', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': window.csrfToken || ''
        },
        body: JSON.stringify({})
      });

      const data = await safeJson(res).catch(err => {
        // safeJson throws on !res.ok, so catch to show a nicer message
        console.error('ClamAV test HTTP error', err);
        return null;
      });

      if (!data || data.success !== true) {
        const msg = (data && (data.error || data.message)) || 'ClamAV test failed.';
        statusEl.textContent = msg;
        statusEl.className = 'small text-danger';
        showToast(msg, 'error');
        return;
      }

      const cmd = data.command || 'clamscan';
      const engine = data.engine || '';
      const details = data.details || '';

      const parts = [];
      parts.push(`OK – ${cmd} is reachable`);
      if (engine) parts.push(engine);
      if (details) parts.push(details);

      statusEl.textContent = parts.join(' • ');
      statusEl.className = 'small text-success';
      showToast(t('admin_clamav_selftest_ok'));
    } catch (e) {
      console.error('ClamAV test error', e);
      statusEl.textContent =
        'ClamAV test error: ' + (e && e.message ? e.message : String(e));
      statusEl.className = 'small text-danger';
      showToast(t('admin_clamav_test_failed_console'), 'error');
    }
  });
}

function wireResumableCleanupButton(scope = document) {
  const btn = scope.querySelector('#resumableCleanupNowBtn');
  const statusEl = scope.querySelector('#resumableCleanupStatus');
  if (!btn || !statusEl || btn.__wired) return;

  btn.__wired = true;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    statusEl.textContent = t('resumable_cleanup_running') || 'Running cleanup...';
    statusEl.className = 'small text-muted';

    try {
      const res = await fetch('/api/admin/resumableCleanup.php', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': window.csrfToken || ''
        },
        body: JSON.stringify({ all: true, purgeAll: true })
      });

      const data = await safeJson(res);

      if (!data || data.success !== true) {
        const msg =
          (data && (data.error || data.message)) ||
          t('resumable_cleanup_failed') ||
          'Resumable cleanup failed.';
        statusEl.textContent = msg;
        statusEl.className = 'small text-danger';
        showToast(msg, 'error');
        return;
      }

      const checked = parseInt(data.checked || 0, 10) || 0;
      const removed = parseInt(data.removed || 0, 10) || 0;
      const remaining = parseInt(data.remaining || 0, 10) || 0;
      const sources = parseInt(data.sources || 1, 10) || 1;

      const msg = sources > 1
        ? (t('resumable_cleanup_done_sources', { removed, remaining, checked, sources })
          || `Cleanup complete: removed ${removed}, remaining ${remaining}, checked ${checked} across ${sources} sources.`)
        : (t('resumable_cleanup_done', { removed, remaining, checked })
          || `Cleanup complete: removed ${removed}, remaining ${remaining}, checked ${checked}.`);

      statusEl.textContent = msg;
      statusEl.className = 'small text-success';
      showToast(msg, 'success');
    } catch (e) {
      console.error('Resumable cleanup error', e);
      const msg =
        (e && e.message ? e.message : '') ||
        t('resumable_cleanup_failed') ||
        'Resumable cleanup failed.';
      statusEl.textContent = msg;
      statusEl.className = 'small text-danger';
      showToast(msg, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

function wireIgnoreRegexPresetButton(scope = document) {
  const btn = scope.querySelector('#ignoreRegexSnapshotsPreset');
  const input = scope.querySelector('#ignoreRegex');
  if (!btn || !input || btn.__wired) return;

  btn.__wired = true;

  const preset = '(^|/)(@?snapshots?)(/|$)';

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    if (input.disabled) return;

    const current = String(input.value || '');
    const hasPreset = current
      .replace(/\r\n/g, '\n')
      .split('\n')
      .some(line => line.trim() === preset);
    if (hasPreset) {
      input.focus();
      return;
    }

    if (current.trim() === '') {
      input.value = preset;
    } else {
      const suffix = current.endsWith('\n') ? '' : '\n';
      input.value = current + suffix + preset;
    }

    input.focus();
  });
}

function renderAdminEncryptionSection({ config, dark }) {
  const host = document.getElementById("encryptionContent");
  if (!host) return;

  const enc = (config && config.encryption && typeof config.encryption === 'object') ? config.encryption : {};
  const supported = !!enc.supported;
  const hasMasterKey = !!enc.hasMasterKey;
  const source = String(enc.source || 'missing');
  const lockedByEnv = !!enc.lockedByEnv;
  const envPresent = !!enc.envPresent;
  const filePresent = !!enc.filePresent;
  const canGenerateKey = !lockedByEnv && !filePresent;

  const statusPill = (ok, label) => `
    <span class="badge badge-pill ${ok ? 'badge-success' : 'badge-secondary'}" style="margin-left:6px;">
      ${label}
    </span>
  `;

  const sourceLabel = (() => {
    if (source === 'env') return 'Env (FR_ENCRYPTION_MASTER_KEY)';
    if (source === 'env_invalid') return 'Env present but invalid';
    if (source === 'file') return 'Key file (META_DIR/encryption_master.key)';
    if (source === 'file_invalid') return 'Key file present but invalid';
    return 'Missing';
  })();

  host.innerHTML = `
    <div class="card" style="border:1px solid ${dark ? '#3a3a3a' : '#eaeaea'}; border-radius:10px; padding:12px; background:${dark ? '#1f1f1f' : '#fdfdfd'};">
      <div class="d-flex align-items-center" style="gap:10px; margin-bottom:6px;">
        <i class="material-icons" aria-hidden="true">enhanced_encryption</i>
        <div style="font-weight:600;">
          ${tf("encryption_at_rest", "Encryption at rest")}
          ${statusPill(supported, supported ? tf("supported", "Supported") : tf("not_supported", "Not supported"))}
          ${statusPill(hasMasterKey, hasMasterKey ? tf("configured", "Configured") : tf("missing", "Missing"))}
        </div>
      </div>

      <div class="small text-muted" style="margin-bottom:8px;">
        ${tf("encryption_help_short", "Folder encryption requires a server master key. Env overrides the key file.")}
      </div>

      <div class="small" style="line-height:1.5;">
        <div><strong>${tf("master_key_source", "Master key source")}:</strong> ${escapeHTML(sourceLabel)}</div>
        <div><strong>${tf("env_present", "Env present")}:</strong> ${envPresent ? 'Yes' : 'No'}${lockedByEnv ? ' (locked)' : ''}</div>
        <div><strong>${tf("key_file_present", "Key file present")}:</strong> ${filePresent ? 'Yes' : 'No'}</div>
      </div>

      <hr class="admin-divider" style="margin:10px 0;">

      <div class="d-flex flex-wrap" style="gap:8px; align-items:center;">
        <button type="button" class="btn btn-sm btn-secondary" id="frEncGenerateKeyBtn" ${canGenerateKey ? '' : 'disabled'}>
          ${tf("generate_key_file", "Generate key file")}
        </button>
        <button type="button" class="btn btn-sm btn-outline-danger" id="frEncClearKeyBtn" ${lockedByEnv ? 'disabled' : ''}>
          ${tf("clear_key_file", "Clear key file")}
        </button>
        ${lockedByEnv ? `<div class="small text-warning">${tf("locked_by_env", "Locked by FR_ENCRYPTION_MASTER_KEY env override.")}</div>` : ''}
      </div>

      <div class="small text-muted" style="margin-top:8px;">
        ${tf("encryption_v1_note", "Admin notes:<ul style=\"margin:6px 0 0 18px; padding:0;\"><li>Master key can be set via <code>FR_ENCRYPTION_MASTER_KEY</code> (env overrides the key file) or via <code>META_DIR/encryption_master.key</code> (32 raw bytes).</li><li>Encrypted folders are recursive; shares, shared-folder uploads, WebDAV, and archive create/extract are blocked under encrypted folders.</li><li>Video/audio previews are disabled (no HTTP Range) but users can still download files normally.</li></ul>")}
      </div>
    </div>
  `;

  const post = async (action, key, extra = {}) => {
    const res = await fetch(withBase('/api/admin/setEncryptionKey.php'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': window.csrfToken || ''
      },
      body: JSON.stringify({ action, ...(key ? { key } : {}), ...extra })
    });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (e) { /* ignore */ }
    return {
      ok: res.ok,
      status: res.status,
      body: body || {},
      raw: text || ''
    };
  };

  const refresh = async () => {
    const r = await fetch(withBase('/api/admin/getConfig.php?ts=' + Date.now()), {
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-store' }
    });
    const next = await safeJson(r);
    renderAdminEncryptionSection({ config: next, dark });
  };

  const genBtn = document.getElementById('frEncGenerateKeyBtn');
  if (genBtn && !genBtn.__wired) {
    genBtn.__wired = true;
    genBtn.addEventListener('click', async () => {
      try {
        genBtn.disabled = true;
        const res = await post('generate');
        if (!res.ok) {
          throw new Error(res.body?.message || res.body?.error || `HTTP ${res.status}`);
        }
        showToast(tf("key_file_created", "Key file created."));
        await refresh();
    } catch (e) {
      console.error(e);
      showToast((e && e.message) ? e.message : tf("error", "Error"), 'error');
    } finally {
      genBtn.disabled = !canGenerateKey;
    }
  });
  }

  const clearBtn = document.getElementById('frEncClearKeyBtn');
  if (clearBtn && !clearBtn.__wired) {
    clearBtn.__wired = true;
    clearBtn.addEventListener('click', async () => {
      try {
        clearBtn.disabled = true;
        const ok = await showCustomConfirmModal(
          "Removing the encryption key file can make encrypted files permanently unreadable. Continue?"
        );
        if (!ok) {
          clearBtn.disabled = lockedByEnv;
          return;
        }

        let res = await post('clear');
        if (!res.ok && res.status === 409) {
          const errCode = res.body?.error || '';
          if (errCode === 'locked_by_env') {
            showToast(res.body?.message || t('admin_key_file_locked_env'), 'error');
            clearBtn.disabled = lockedByEnv;
            return;
          }
          if (errCode === 'not_supported') {
            showToast(res.body?.message || t('admin_encryption_not_supported'), 'error');
            clearBtn.disabled = lockedByEnv;
            return;
          }

          const summary = res.body?.summary || {};
          const encCount = Number(summary.encryptedCount || 0);
          const jobCount = Number(summary.activeJobs || 0);
          const scan = summary.scan || null;
          const details = [];
          if (encCount > 0) details.push(`${encCount} encrypted folder(s).`);
          if (jobCount > 0) details.push(`${jobCount} active crypto job(s).`);
          if (scan && scan.scanned) {
            const scanned = Number(scan.scanned || 0);
            if (errCode === 'encrypted_files_detected') {
              details.push(`Scan found an encrypted file after checking ${scanned} file(s).`);
            } else {
              details.push(`Scan checked ${scanned} file(s) for encrypted headers${scan.truncated ? ' (truncated)' : ''}.`);
            }
          }
          const extra = details.length ? details.join('\n') : '';
          const reasonLine = (() => {
            if (errCode === 'encrypted_files_detected') return 'Encrypted files detected on disk.';
            if (errCode === 'encrypted_files_scan_truncated') return 'Encrypted file scan was truncated.';
            if (errCode === 'encrypted_files_scan_failed') return 'Encrypted file scan failed.';
            if (errCode === 'encrypted_folders_exist') return 'Encrypted folders still exist.';
            if (errCode === 'crypto_job_active') return 'An encryption job is still running.';
            return '';
          })();

          const forceOk = await showTypedConfirmModal({
            title: "Force remove key file",
            message:
              "This will permanently break access to encrypted files.\n\n" +
              (reasonLine ? reasonLine + "\n\n" : "") +
              (extra ? extra + "\n\n" : "") +
              (errCode === '' ? "\n\nServer returned 409 without details; assume encrypted data exists." : '') +
              "\n\nType REMOVE to confirm.",
            confirmText: "REMOVE",
            placeholder: "Type REMOVE to continue"
          });
          if (!forceOk) {
            clearBtn.disabled = lockedByEnv;
            return;
          }

          res = await post('clear', null, { force: true });
        }

        if (!res.ok) {
          throw new Error(res.body?.message || res.body?.error || `HTTP ${res.status}`);
        }

        showToast(tf("key_file_cleared", "Key file cleared."));
        await refresh();
      } catch (e) {
        console.error(e);
        showToast((e && e.message) ? e.message : tf("error", "Error"), 'error');
      } finally {
        clearBtn.disabled = lockedByEnv;
      }
    });
  }
}

function initVirusLogSection({ isPro }) {
  const uploadScope = document.getElementById('uploadContent');
  if (!uploadScope) return;

  const wrapper = uploadScope.querySelector('#virusLogWrapper');
  const shell = uploadScope.querySelector('#virusLogTableShell');
  if (!wrapper || !shell) return;

  // Let us overlay a Pro banner on top of the table
  if (!wrapper.style.position) {
    wrapper.style.position = 'relative';
  }

  // Remove any previous overlays
  wrapper.querySelectorAll('.virus-pro-overlay').forEach(el => el.remove());

  // --- Free/core: show blurred preview + Pro banner ---
  if (!isPro) {
    shell.innerHTML = `
      <table class="table table-sm mb-1"
             style="width:100%; filter: blur(2px); opacity:0.65; pointer-events:none;">
        <thead>
          <tr>
            <th style="white-space:nowrap;">Timestamp (UTC)</th>
            <th>User</th>
            <th>IP</th>
            <th>File</th>
            <th>Folder</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colspan="5" class="text-muted small">
              Virus detections from the last 30 days would appear here.
            </td>
          </tr>
        </tbody>
      </table>
    `;

    const overlay = document.createElement('div');
    overlay.className = 'virus-pro-overlay';
    overlay.style.cssText = `
      position:absolute;
      inset:0;
      display:flex;
      align-items:center;
      justify-content:center;
      pointer-events:none;
    `;
    overlay.innerHTML = `
      <div style="
        background:rgba(0,0,0,0.78);
        color:#fff;
        padding:8px 14px;
        border-radius:999px;
        display:flex;
        align-items:center;
        gap:8px;
        font-size:0.85rem;
      ">
        <span class="badge badge-pill badge-warning">Pro</span>
        <span>Virus detection log is available in FileRise Pro.</span>
        <a href="https://filerise.net"
           target="_blank"
           rel="noopener noreferrer"
           class="btn btn-sm btn-light"
           style="pointer-events:auto;">
          Learn more
        </a>
      </div>
    `;
    wrapper.appendChild(overlay);
    return;
  }

  // --- Pro: load real data from /api/admin/virusLog.php ---
  shell.innerHTML = `<div class="small text-muted">Loading virus detection log…</div>`;

  (async () => {
    try {
      const res = await fetch('/api/admin/virusLog.php?limit=200', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'X-CSRF-Token': window.csrfToken || ''
        }
      });

      const data = await safeJson(res).catch(err => {
        console.error('virusLog HTTP error', err);
        return null;
      });

      if (!data || data.ok === false) {
        const msg =
          (data && (data.error || data.message)) ||
          'Failed to load detection log.';
        shell.innerHTML = `<div class="text-danger small">${msg}</div>`;
        return;
      }

      const rows = Array.isArray(data.rows || data.entries || data.data)
        ? (data.rows || data.entries || data.data)
        : [];

      if (!rows.length) {
        shell.innerHTML = `<div class="small text-muted">No virus detections have been logged yet.</div>`;
        return;
      }

      const escapeCell = (v) => {
        if (v === null || v === undefined) return '';
        return String(v)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      };

      const normEntry = (e) => {
        const tsRaw = e.ts ?? e.timestamp ?? e.time ?? e.when ?? '';
        let tsLabel = '';
        if (typeof tsRaw === 'number') {
          const d = new Date(tsRaw * 1000);
          tsLabel = isNaN(d.getTime())
            ? String(tsRaw)
            : d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
        } else if (tsRaw) {
          const d = new Date(tsRaw);
          tsLabel = isNaN(d.getTime())
            ? String(tsRaw)
            : d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
        }

        return {
          ts: tsLabel || '',
          user: e.user ?? e.username ?? '',
          ip: e.ip ?? e.remote_ip ?? e.remoteIp ?? '',
          file: e.file ?? e.filename ?? e.name ?? '',
          folder: e.folder ?? e.path ?? e.dir ?? ''
        };
      };

      const normalized = rows.map(normEntry);

      let html = `
        <div class="table-responsive">
          <table class="table table-sm mb-0">
            <thead class="thead-light">
              <tr>
                <th style="white-space:nowrap;">Timestamp (UTC)</th>
                <th>User</th>
                <th>IP</th>
                <th>File</th>
                <th>Folder</th>
              </tr>
            </thead>
            <tbody>
      `;

      normalized.forEach(entry => {
        html += `
          <tr>
            <td style="white-space:nowrap;">${escapeCell(entry.ts)}</td>
            <td>${escapeCell(entry.user)}</td>
            <td>${escapeCell(entry.ip)}</td>
            <td>${escapeCell(entry.file)}</td>
            <td>${escapeCell(entry.folder)}</td>
          </tr>
        `;
      });

      html += `
            </tbody>
          </table>
        </div>
      `;

      shell.innerHTML = html;
    } catch (e) {
      console.error('virusLog error', e);
      shell.innerHTML = `<div class="text-danger small">Error loading detection log. See console for details.</div>`;
    }
  })();
}

function initSourcesSection({ modalEl, sourcesEnabled, sourcesCfg, isPro, proSourcesApiOk }) {
  const container = document.getElementById('sourcesContent');
  if (!container || container.__initialized) return;
  container.__initialized = true;

  if (!isPro) {
    const isDark = document.body.classList.contains('dark-mode');
    const overlayBg = isDark ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.92)';
    const overlayText = isDark ? '#f8fafc' : '#111827';
    const overlaySubtext = isDark ? 'rgba(226, 232, 240, 0.9)' : '#4b5563';
    const overlayBorder = isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)';
    const overlayShadow = isDark ? '0 10px 28px rgba(0,0,0,0.5)' : '0 10px 24px rgba(0,0,0,0.18)';
    const title = tf('sources_pro_locked_title', 'Sources are a Pro feature');
    const body = tf(
      'sources_pro_locked_body',
      'Connect remote storage and manage it like local — switch sources, move/copy between them, and keep separate trash per source. Upgrade to FileRise Pro to add S3, SFTP, FTP, WebDAV, SMB, additional Local, Google Drive, Dropbox and OneDrive sources.'
    );
    const help = tf('sources_help', 'Sources are separate roots; users only see sources they can access.');
    const adapterHint = tf(
      'sources_adapter_hint',
      'Adapters: local, S3, SFTP, FTP, WebDAV, SMB, Google Drive, Dropbox, OneDrive.'
    );

    container.innerHTML = `
      <div class="card" style="border-radius: var(--menu-radius); overflow:hidden; position:relative;">
        <div class="card-header py-2">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <strong>
                ${escapeHTML(tf('sources', 'Sources'))}
                <span class="badge bg-warning text-dark ms-1 align-middle">Pro</span>
              </strong>
              <div class="small text-muted">${escapeHTML(help)}</div>
            </div>
          </div>
        </div>
        <div class="card-body p-2">
          <div style="filter:blur(3px);opacity:0.5;pointer-events:none;">
            <div class="sources-admin">
              <div class="form-group" style="margin-bottom:8px;">
                <div class="form-check fr-toggle">
                  <input type="checkbox" class="form-check-input fr-toggle-input" />
                  <label class="form-check-label">${escapeHTML(tf('sources_enabled', 'Enable sources'))}</label>
                </div>
                <small class="text-muted d-block mt-1">${escapeHTML(help)}</small>
              </div>

              <div class="sources-toolbar">
                <button type="button" class="btn btn-sm btn-primary">
                  ${escapeHTML(tf('source_add', 'Add Source'))}
                </button>
                <button type="button" class="btn btn-sm btn-secondary">
                  ${escapeHTML(tf('refresh', 'Refresh'))}
                </button>
              </div>

              <div class="table-responsive" style="margin-top:6px;">
                <table class="table table-sm mb-0">
                  <thead class="thead-light">
                    <tr>
                      <th>${escapeHTML(tf('source_name', 'Source Name'))}</th>
                      <th>${escapeHTML(tf('source_type', 'Type'))}</th>
                      <th>${escapeHTML(tf('status', 'Status'))}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>Local</td><td>local</td><td>${escapeHTML(tf('enabled', 'Enabled'))}</td></tr>
                    <tr><td>Archive</td><td>s3</td><td>${escapeHTML(tf('disabled', 'Disabled'))}</td></tr>
                    <tr><td>Media</td><td>smb</td><td>${escapeHTML(tf('enabled', 'Enabled'))}</td></tr>
                  </tbody>
                </table>
              </div>

              <div class="text-muted small" style="margin-top:6px;">
                ${escapeHTML(adapterHint)}
              </div>
            </div>
          </div>

          <div
            class="d-flex flex-column align-items-center justify-content-center text-center"
            style="position:absolute; inset:0; padding:16px;">
            <div style="background:${overlayBg}; color:${overlayText}; border:${overlayBorder}; box-shadow:${overlayShadow}; padding:10px 12px; border-radius:10px; max-width:520px;">
              <div class="mb-1">
                <span class="badge bg-warning text-dark me-1">Pro</span>
                <span class="fw-semibold">${escapeHTML(title)}</span>
              </div>
              <div class="small mb-2" style="color:${overlaySubtext};">
                ${escapeHTML(body)}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    return;
  }
  if (!proSourcesApiOk) {
    const msg = tf(
      'sources_pro_bundle_outdated',
      `Please upgrade to FileRise Pro v${PRO_API_MIN_VERSION_LABELS.sources}+ to use Sources.`
    );
    container.innerHTML = `<div class="text-muted">${escapeHTML(msg)}</div>`;
    return;
  }

  container.innerHTML = `
    <div class="sources-admin">
      <div class="form-group" style="margin-bottom:8px;">
        <div class="form-check fr-toggle">
          <input type="checkbox" class="form-check-input fr-toggle-input" id="sourcesEnabledToggle" />
          <label class="form-check-label" for="sourcesEnabledToggle">
            ${tf('sources_enabled', 'Enable sources')}
          </label>
        </div>
        <small class="text-muted d-block mt-1">
          ${tf('sources_help', 'Sources are separate roots; users only see sources they can access.')}
        </small>
      </div>

      <div class="sources-toolbar">
        <button type="button" id="sourceAddBtn" class="btn btn-sm btn-primary">
          ${tf('source_add', 'Add Source')}
        </button>
        <button type="button" id="sourceRefreshBtn" class="btn btn-sm btn-secondary">
          ${tf('refresh', 'Refresh')}
        </button>
      </div>

      <div id="sourcesStatus" class="text-muted small" style="margin-bottom:6px;"></div>
      <div id="sourcesList" class="sources-list"></div>

      <hr class="admin-divider">

      <div id="sourcesForm" class="sources-form">
        <div class="admin-subsection-title" id="sourceFormTitle">${tf('source_add', 'Add Source')}</div>
        <div class="sources-form-grid">
          <div class="form-group">
            <label for="sourceId">${tf('source_id', 'Source ID')}:</label>
            <input type="text" id="sourceId" class="form-control" placeholder="local-main" />
          </div>
          <div class="form-group">
            <label for="sourceName">${tf('source_name', 'Source Name')}:</label>
            <input type="text" id="sourceName" class="form-control" placeholder="Local" />
          </div>
          <div class="form-group">
            <label for="sourceType">${tf('source_type', 'Type')}:</label>
            <select id="sourceType" class="form-control">
              <option value="local">local</option>
              <option value="s3">s3</option>
              <option value="sftp">sftp</option>
              <option value="ftp">ftp</option>
              <option value="webdav">webdav</option>
              <option value="smb">smb</option>
              <option value="gdrive">gdrive</option>
              <option value="onedrive">onedrive</option>
              <option value="dropbox">dropbox</option>
            </select>
          </div>
          <div class="form-group sources-form-inline">
            <div class="form-check fr-toggle">
              <input type="checkbox" class="form-check-input fr-toggle-input" id="sourceEnabled" />
              <label class="form-check-label" for="sourceEnabled">
                ${tf('source_enabled', 'Enabled')}
              </label>
            </div>
            <div class="form-check fr-toggle">
              <input type="checkbox" class="form-check-input fr-toggle-input" id="sourceReadOnly" />
              <label class="form-check-label" for="sourceReadOnly">
                ${t('read_only')}
              </label>
            </div>
          </div>
        </div>

        <div class="sources-type-block" data-type="local">
          <div class="sources-hint-row">
            <button type="button" class="sources-hint-btn" aria-label="${tf('source_hint_button', 'Show setup hints')}" data-tooltip="${tf('source_hint_local', 'Use an absolute server path. Leave blank to use the default uploads root. Ensure the web user can read/write this path; FileRise does not chown extra mounts.')}">!</button>
          </div>
          <div class="form-group">
            <label for="sourceLocalPath">${tf('source_local_path', 'Local path')}:</label>
            <input type="text" id="sourceLocalPath" class="form-control" placeholder="/var/www/uploads/" />
          </div>
        </div>

        <div class="sources-type-block" data-type="s3" hidden>
          <div class="sources-hint-row">
            <button type="button" class="sources-hint-btn" aria-label="${tf('source_hint_button', 'Show setup hints')}" data-tooltip="${tf('source_hint_s3', 'Bucket is required. Region is optional (defaults to us-east-1). Endpoint and path-style are for S3-compatible providers like Wasabi, MinIO, Backblaze B2 (S3 API), DigitalOcean Spaces, or Cloudflare R2. Prefix is optional.')}">!</button>
          </div>
          <div class="sources-form-grid">
            <div class="form-group">
              <label for="sourceS3Bucket">${tf('source_s3_bucket', 'S3 bucket')}:</label>
              <input type="text" id="sourceS3Bucket" class="form-control" placeholder="my-bucket" />
            </div>
            <div class="form-group">
              <label for="sourceS3Region">${tf('source_s3_region', 'S3 region (optional)')}:</label>
              <input type="text" id="sourceS3Region" class="form-control" placeholder="us-east-1" />
            </div>
            <div class="form-group">
              <label for="sourceS3Endpoint">${tf('source_s3_endpoint', 'S3 endpoint')}:</label>
              <input type="text" id="sourceS3Endpoint" class="form-control" placeholder="https://s3.amazonaws.com" />
            </div>
            <div class="form-group">
              <label for="sourceS3Prefix">${tf('source_s3_prefix', 'S3 prefix')}:</label>
              <input type="text" id="sourceS3Prefix" class="form-control" placeholder="optional/prefix" />
            </div>
            <div class="form-group">
              <label for="sourceS3AccessKey">${tf('source_s3_access_key', 'S3 access key')}:</label>
              <input type="text" id="sourceS3AccessKey" class="form-control" autocomplete="off" />
            </div>
            <div class="form-group">
              <label for="sourceS3SecretKey">${tf('source_s3_secret_key', 'S3 secret key')}:</label>
              <input type="password" id="sourceS3SecretKey" class="form-control" autocomplete="new-password" />
            </div>
            <div class="form-group">
              <label for="sourceS3SessionToken">${tf('source_s3_session_token', 'S3 session token')}:</label>
              <input type="text" id="sourceS3SessionToken" class="form-control" autocomplete="off" />
            </div>
          </div>
          <div class="form-group" style="margin-top:6px;">
            <div class="form-check fr-toggle">
              <input type="checkbox" class="form-check-input fr-toggle-input" id="sourceS3PathStyle" />
              <label class="form-check-label" for="sourceS3PathStyle">
                ${tf('source_s3_path_style', 'Force path-style addressing')}
              </label>
            </div>
          </div>
        </div>

        <div class="sources-type-block" data-type="sftp" hidden>
          <div class="sources-hint-row">
            <button type="button" class="sources-hint-btn" aria-label="${tf('source_hint_button', 'Show setup hints')}" data-tooltip="${tf('source_hint_sftp', 'Host and username are required. Use a password or private key. Root is optional; blank uses the login directory.')}">!</button>
          </div>
          <div class="sources-form-grid">
            <div class="form-group">
              <label for="sourceSftpHost">${tf('source_sftp_host', 'SFTP host')}:</label>
              <input type="text" id="sourceSftpHost" class="form-control" placeholder="sftp.example.com" />
            </div>
            <div class="form-group">
              <label for="sourceSftpPort">${tf('source_sftp_port', 'SFTP port')}:</label>
              <input type="number" id="sourceSftpPort" class="form-control" placeholder="22" />
            </div>
            <div class="form-group">
              <label for="sourceSftpUsername">${tf('source_sftp_username', 'SFTP username')}:</label>
              <input type="text" id="sourceSftpUsername" class="form-control" placeholder="username" />
            </div>
            <div class="form-group">
              <label for="sourceSftpPassword">${tf('source_sftp_password', 'SFTP password')}:</label>
              <input type="password" id="sourceSftpPassword" class="form-control" autocomplete="new-password" />
            </div>
          </div>
          <div class="form-group">
            <label for="sourceSftpPrivateKey">${tf('source_sftp_private_key', 'SFTP private key')}:</label>
            <textarea id="sourceSftpPrivateKey" class="form-control" rows="3" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"></textarea>
          </div>
          <div class="form-group">
            <label for="sourceSftpPrivateKeyPassphrase">${tf('source_sftp_private_key_passphrase', 'SFTP key passphrase')}:</label>
            <input type="password" id="sourceSftpPrivateKeyPassphrase" class="form-control" autocomplete="new-password" />
          </div>
          <div class="form-group">
            <label for="sourceSftpRoot">${tf('source_sftp_root', 'SFTP root path')}:</label>
            <input type="text" id="sourceSftpRoot" class="form-control" placeholder="/home/user/files" />
          </div>
        </div>

        <div class="sources-type-block" data-type="ftp" hidden>
          <div class="sources-hint-row">
            <button type="button" class="sources-hint-btn" aria-label="${tf('source_hint_button', 'Show setup hints')}" data-tooltip="${tf('source_hint_ftp', 'Host and username are required. Passive mode is recommended. Root is optional; blank uses the login directory.')}">!</button>
          </div>
          <div class="sources-form-grid">
            <div class="form-group">
              <label for="sourceFtpHost">${tf('source_ftp_host', 'FTP host')}:</label>
              <input type="text" id="sourceFtpHost" class="form-control" placeholder="ftp.example.com" />
            </div>
            <div class="form-group">
              <label for="sourceFtpPort">${tf('source_ftp_port', 'FTP port')}:</label>
              <input type="number" id="sourceFtpPort" class="form-control" placeholder="21" />
            </div>
            <div class="form-group">
              <label for="sourceFtpUsername">${tf('source_ftp_username', 'FTP username')}:</label>
              <input type="text" id="sourceFtpUsername" class="form-control" placeholder="username" />
            </div>
            <div class="form-group">
              <label for="sourceFtpPassword">${tf('source_ftp_password', 'FTP password')}:</label>
              <input type="password" id="sourceFtpPassword" class="form-control" autocomplete="new-password" />
            </div>
          </div>
          <div class="form-group" style="margin-top:6px;">
            <div class="form-check fr-toggle">
              <input type="checkbox" class="form-check-input fr-toggle-input" id="sourceFtpSsl" />
              <label class="form-check-label" for="sourceFtpSsl">
                ${tf('source_ftp_ssl', 'Use FTPS (SSL)')}
              </label>
            </div>
            <div class="form-check fr-toggle">
              <input type="checkbox" class="form-check-input fr-toggle-input" id="sourceFtpPassive" />
              <label class="form-check-label" for="sourceFtpPassive">
                ${tf('source_ftp_passive', 'Passive mode')}
              </label>
            </div>
          </div>
          <div class="form-group">
            <label for="sourceFtpRoot">${tf('source_ftp_root', 'FTP root path')}:</label>
            <input type="text" id="sourceFtpRoot" class="form-control" placeholder="/uploads" />
          </div>
        </div>

        <div class="sources-type-block" data-type="webdav" hidden>
          <div class="sources-hint-row">
            <button type="button" class="sources-hint-btn" aria-label="${tf('source_hint_button', 'Show setup hints')}" data-tooltip="${tf('source_hint_webdav', 'Base URL and username are required. Root is optional; blank uses the server root. Do not embed credentials in the URL. Disable TLS verification only for self-signed certs.')}">!</button>
          </div>
          <div class="sources-form-grid">
            <div class="form-group">
              <label for="sourceWebdavUrl">${tf('source_webdav_url', 'WebDAV base URL')}:</label>
              <input type="text" id="sourceWebdavUrl" class="form-control" placeholder="https://example.com/remote.php/dav/files/user" />
            </div>
            <div class="form-group">
              <label for="sourceWebdavUsername">${tf('source_webdav_username', 'WebDAV username')}:</label>
              <input type="text" id="sourceWebdavUsername" class="form-control" placeholder="username" />
            </div>
            <div class="form-group">
              <label for="sourceWebdavPassword">${tf('source_webdav_password', 'WebDAV password')}:</label>
              <input type="password" id="sourceWebdavPassword" class="form-control" autocomplete="new-password" />
            </div>
            <div class="form-group">
              <label for="sourceWebdavRoot">${tf('source_webdav_root', 'WebDAV root path')}:</label>
              <input type="text" id="sourceWebdavRoot" class="form-control" placeholder="optional/path" />
            </div>
          </div>
          <div class="form-group" style="margin-top:6px;">
            <div class="form-check fr-toggle">
              <input type="checkbox" class="form-check-input fr-toggle-input" id="sourceWebdavVerifyTls" />
              <label class="form-check-label" for="sourceWebdavVerifyTls">
                ${tf('source_webdav_verify_tls', 'Verify TLS certificate')}
              </label>
            </div>
          </div>
        </div>

        <div class="sources-type-block" data-type="smb" hidden>
          <div class="sources-hint-row">
            <button type="button" class="sources-hint-btn" aria-label="${tf('source_hint_button', 'Show setup hints')}" data-tooltip="${tf('source_hint_smb', 'Host, share, and username are required. Domain and root are optional. Leave SMB version on Auto unless your server requires a specific version.')}">!</button>
          </div>
          <div class="sources-form-grid">
            <div class="form-group">
              <label for="sourceSmbHost">${tf('source_smb_host', 'SMB host')}:</label>
              <input type="text" id="sourceSmbHost" class="form-control" placeholder="server.local" />
            </div>
            <div class="form-group">
              <label for="sourceSmbShare">${tf('source_smb_share', 'SMB share')}:</label>
              <input type="text" id="sourceSmbShare" class="form-control" placeholder="share" />
            </div>
            <div class="form-group">
              <label for="sourceSmbUsername">${tf('source_smb_username', 'SMB username')}:</label>
              <input type="text" id="sourceSmbUsername" class="form-control" placeholder="username" />
            </div>
            <div class="form-group">
              <label for="sourceSmbPassword">${tf('source_smb_password', 'SMB password')}:</label>
              <input type="password" id="sourceSmbPassword" class="form-control" autocomplete="new-password" />
            </div>
            <div class="form-group">
              <label for="sourceSmbDomain">${tf('source_smb_domain', 'SMB domain (optional)')}:</label>
              <input type="text" id="sourceSmbDomain" class="form-control" placeholder="WORKGROUP" />
            </div>
            <div class="form-group">
              <label for="sourceSmbVersion">${tf('source_smb_version', 'SMB version')}:</label>
              <select id="sourceSmbVersion" class="form-control">
                <option value="">Auto</option>
                <option value="SMB3">SMB3</option>
                <option value="SMB2">SMB2</option>
                <option value="SMB1">SMB1</option>
              </select>
            </div>
            <div class="form-group">
              <label for="sourceSmbRoot">${tf('source_smb_root', 'SMB root path')}:</label>
              <input type="text" id="sourceSmbRoot" class="form-control" placeholder="optional/path" />
            </div>
          </div>
        </div>

        <div class="sources-type-block" data-type="gdrive" hidden>
          <div class="sources-hint-row">
            <button type="button" class="sources-hint-btn" aria-label="${tf('source_hint_button', 'Show setup hints')}" data-tooltip="${tf('source_hint_gdrive', 'Create an OAuth client in Google Cloud. Get a refresh token with scope https://www.googleapis.com/auth/drive. RootId: drive.google.com/drive/folders/ID or blank for root. DriveId: set for shared drives. Native Docs/Sheets exports not supported yet.')}">!</button>
          </div>
          <div class="sources-form-grid">
            <div class="form-group">
              <label for="sourceGDriveClientId">${tf('source_gdrive_client_id', 'Google client ID')}:</label>
              <input type="text" id="sourceGDriveClientId" class="form-control" placeholder="...apps.googleusercontent.com" />
            </div>
            <div class="form-group">
              <label for="sourceGDriveClientSecret">${tf('source_gdrive_client_secret', 'Google client secret')}:</label>
              <input type="password" id="sourceGDriveClientSecret" class="form-control" autocomplete="new-password" />
            </div>
            <div class="form-group">
              <label for="sourceGDriveRefreshToken">${tf('source_gdrive_refresh_token', 'Google refresh token')}:</label>
              <input type="password" id="sourceGDriveRefreshToken" class="form-control" autocomplete="new-password" />
            </div>
            <div class="form-group">
              <label for="sourceGDriveRootId">${tf('source_gdrive_root_id', 'Root folder ID')}:</label>
              <input type="text" id="sourceGDriveRootId" class="form-control" placeholder="root" />
            </div>
            <div class="form-group">
              <label for="sourceGDriveDriveId">${tf('source_gdrive_drive_id', 'Shared drive ID (optional)')}:</label>
              <input type="text" id="sourceGDriveDriveId" class="form-control" placeholder="" />
            </div>
          </div>
          <div class="text-muted small" style="margin-top:6px;">
            ${tf('source_gdrive_trash_note', 'Trash is not supported on Google Drive sources; deletes are permanent.')}
          </div>
        </div>

        <div class="sources-type-block" data-type="onedrive" hidden>
          <div class="sources-hint-row">
            <button type="button" class="sources-hint-btn" aria-label="${tf('source_hint_button', 'Show setup hints')}" data-tooltip="${tf('source_hint_onedrive', 'Create a Microsoft Entra app with delegated Files.ReadWrite.All + offline_access. Tenant: use common/organizations/consumers or a tenant ID. For SharePoint/Business, supply siteId or driveId. Root path is optional and scopes the source to a subfolder.')}">!</button>
          </div>
          <div class="sources-form-grid">
            <div class="form-group">
              <label for="sourceOneDriveClientId">${tf('source_onedrive_client_id', 'OneDrive client ID')}:</label>
              <input type="text" id="sourceOneDriveClientId" class="form-control" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            </div>
            <div class="form-group">
              <label for="sourceOneDriveClientSecret">${tf('source_onedrive_client_secret', 'OneDrive client secret')}:</label>
              <input type="password" id="sourceOneDriveClientSecret" class="form-control" autocomplete="new-password" />
            </div>
            <div class="form-group">
              <label for="sourceOneDriveRefreshToken">${tf('source_onedrive_refresh_token', 'OneDrive refresh token')}:</label>
              <input type="password" id="sourceOneDriveRefreshToken" class="form-control" autocomplete="new-password" />
            </div>
            <div class="form-group">
              <label for="sourceOneDriveTenant">${tf('source_onedrive_tenant', 'Tenant (optional)')}:</label>
              <input type="text" id="sourceOneDriveTenant" class="form-control" placeholder="common" />
            </div>
            <div class="form-group">
              <label for="sourceOneDriveDriveId">${tf('source_onedrive_drive_id', 'Drive ID (optional)')}:</label>
              <input type="text" id="sourceOneDriveDriveId" class="form-control" placeholder="" />
            </div>
            <div class="form-group">
              <label for="sourceOneDriveSiteId">${tf('source_onedrive_site_id', 'Site ID (optional)')}:</label>
              <input type="text" id="sourceOneDriveSiteId" class="form-control" placeholder="" />
            </div>
            <div class="form-group">
              <label for="sourceOneDriveRootPath">${tf('source_onedrive_root_path', 'Root path (optional)')}:</label>
              <input type="text" id="sourceOneDriveRootPath" class="form-control" placeholder="optional/path" />
            </div>
          </div>
        </div>

        <div class="sources-type-block" data-type="dropbox" hidden>
          <div class="sources-hint-row">
            <button type="button" class="sources-hint-btn" aria-label="${tf('source_hint_button', 'Show setup hints')}" data-tooltip="${tf('source_hint_dropbox', 'Create a Dropbox app with files.content.write, files.content.read, and files.metadata.read. Generate a refresh token. TeamMemberId and RootNamespaceId are optional for Dropbox Business team spaces. Root path scopes the source to a subfolder.')}">!</button>
          </div>
          <div class="sources-form-grid">
            <div class="form-group">
              <label for="sourceDropboxAppKey">${tf('source_dropbox_app_key', 'Dropbox app key')}:</label>
              <input type="text" id="sourceDropboxAppKey" class="form-control" placeholder="app-key" />
            </div>
            <div class="form-group">
              <label for="sourceDropboxAppSecret">${tf('source_dropbox_app_secret', 'Dropbox app secret')}:</label>
              <input type="password" id="sourceDropboxAppSecret" class="form-control" autocomplete="new-password" />
            </div>
            <div class="form-group">
              <label for="sourceDropboxRefreshToken">${tf('source_dropbox_refresh_token', 'Dropbox refresh token')}:</label>
              <input type="password" id="sourceDropboxRefreshToken" class="form-control" autocomplete="new-password" />
            </div>
            <div class="form-group">
              <label for="sourceDropboxRootPath">${tf('source_dropbox_root_path', 'Root path (optional)')}:</label>
              <input type="text" id="sourceDropboxRootPath" class="form-control" placeholder="optional/path" />
            </div>
            <div class="form-group">
              <label for="sourceDropboxTeamMemberId">${tf('source_dropbox_team_member_id', 'Team member ID (optional)')}:</label>
              <input type="text" id="sourceDropboxTeamMemberId" class="form-control" placeholder="" />
            </div>
            <div class="form-group">
              <label for="sourceDropboxRootNamespaceId">${tf('source_dropbox_root_namespace_id', 'Root namespace ID (optional)')}:</label>
              <input type="text" id="sourceDropboxRootNamespaceId" class="form-control" placeholder="" />
            </div>
          </div>
        </div>

        <div class="sources-form-actions">
          <button type="button" id="sourceSaveBtn" class="btn btn-sm btn-primary">
            ${tf('source_save', 'Save Source')}
          </button>
          <button type="button" id="sourceResetBtn" class="btn btn-sm btn-secondary">
            ${t('cancel')}
          </button>
        </div>
        <div class="text-muted small" style="margin-top:6px;">
          ${tf('source_secret_note', 'Secrets are never shown after saving. Leave blank to keep existing values.')}
        </div>
      </div>
    </div>
  `;

  const statusEl = container.querySelector('#sourcesStatus');
  const listEl = container.querySelector('#sourcesList');
  const enabledToggle = container.querySelector('#sourcesEnabledToggle');
  const addBtn = container.querySelector('#sourceAddBtn');
  const refreshBtn = container.querySelector('#sourceRefreshBtn');
  const formTitleEl = container.querySelector('#sourceFormTitle');
  const saveBtn = container.querySelector('#sourceSaveBtn');
  const resetBtn = container.querySelector('#sourceResetBtn');
  const sourceIdEl = container.querySelector('#sourceId');
  const sourceNameEl = container.querySelector('#sourceName');
  const sourceTypeEl = container.querySelector('#sourceType');
  const sourceEnabledEl = container.querySelector('#sourceEnabled');
  const sourceReadOnlyEl = container.querySelector('#sourceReadOnly');
  const localPathEl = container.querySelector('#sourceLocalPath');
  const s3BucketEl = container.querySelector('#sourceS3Bucket');
  const s3RegionEl = container.querySelector('#sourceS3Region');
  const s3EndpointEl = container.querySelector('#sourceS3Endpoint');
  const s3PrefixEl = container.querySelector('#sourceS3Prefix');
  const s3AccessKeyEl = container.querySelector('#sourceS3AccessKey');
  const s3SecretKeyEl = container.querySelector('#sourceS3SecretKey');
  const s3SessionTokenEl = container.querySelector('#sourceS3SessionToken');
  const s3PathStyleEl = container.querySelector('#sourceS3PathStyle');
  const sftpHostEl = container.querySelector('#sourceSftpHost');
  const sftpPortEl = container.querySelector('#sourceSftpPort');
  const sftpUsernameEl = container.querySelector('#sourceSftpUsername');
  const sftpPasswordEl = container.querySelector('#sourceSftpPassword');
  const sftpPrivateKeyEl = container.querySelector('#sourceSftpPrivateKey');
  const sftpPrivateKeyPassEl = container.querySelector('#sourceSftpPrivateKeyPassphrase');
  const sftpRootEl = container.querySelector('#sourceSftpRoot');
  const ftpHostEl = container.querySelector('#sourceFtpHost');
  const ftpPortEl = container.querySelector('#sourceFtpPort');
  const ftpUsernameEl = container.querySelector('#sourceFtpUsername');
  const ftpPasswordEl = container.querySelector('#sourceFtpPassword');
  const ftpSslEl = container.querySelector('#sourceFtpSsl');
  const ftpPassiveEl = container.querySelector('#sourceFtpPassive');
  const ftpRootEl = container.querySelector('#sourceFtpRoot');
  const webdavUrlEl = container.querySelector('#sourceWebdavUrl');
  const webdavUsernameEl = container.querySelector('#sourceWebdavUsername');
  const webdavPasswordEl = container.querySelector('#sourceWebdavPassword');
  const webdavRootEl = container.querySelector('#sourceWebdavRoot');
  const webdavVerifyTlsEl = container.querySelector('#sourceWebdavVerifyTls');
  const smbHostEl = container.querySelector('#sourceSmbHost');
  const smbShareEl = container.querySelector('#sourceSmbShare');
  const smbUsernameEl = container.querySelector('#sourceSmbUsername');
  const smbPasswordEl = container.querySelector('#sourceSmbPassword');
  const smbDomainEl = container.querySelector('#sourceSmbDomain');
  const smbVersionEl = container.querySelector('#sourceSmbVersion');
  const smbRootEl = container.querySelector('#sourceSmbRoot');
  const gdriveClientIdEl = container.querySelector('#sourceGDriveClientId');
  const gdriveClientSecretEl = container.querySelector('#sourceGDriveClientSecret');
  const gdriveRefreshTokenEl = container.querySelector('#sourceGDriveRefreshToken');
  const gdriveRootIdEl = container.querySelector('#sourceGDriveRootId');
  const gdriveDriveIdEl = container.querySelector('#sourceGDriveDriveId');
  const onedriveClientIdEl = container.querySelector('#sourceOneDriveClientId');
  const onedriveClientSecretEl = container.querySelector('#sourceOneDriveClientSecret');
  const onedriveRefreshTokenEl = container.querySelector('#sourceOneDriveRefreshToken');
  const onedriveTenantEl = container.querySelector('#sourceOneDriveTenant');
  const onedriveDriveIdEl = container.querySelector('#sourceOneDriveDriveId');
  const onedriveSiteIdEl = container.querySelector('#sourceOneDriveSiteId');
  const onedriveRootPathEl = container.querySelector('#sourceOneDriveRootPath');
  const dropboxAppKeyEl = container.querySelector('#sourceDropboxAppKey');
  const dropboxAppSecretEl = container.querySelector('#sourceDropboxAppSecret');
  const dropboxRefreshTokenEl = container.querySelector('#sourceDropboxRefreshToken');
  const dropboxRootPathEl = container.querySelector('#sourceDropboxRootPath');
  const dropboxTeamMemberIdEl = container.querySelector('#sourceDropboxTeamMemberId');
  const dropboxRootNamespaceIdEl = container.querySelector('#sourceDropboxRootNamespaceId');
  const typeBlocks = Array.from(container.querySelectorAll('.sources-type-block'));

  let editingId = '';
  let state = {
    enabled: !!sourcesEnabled,
    sources: Array.isArray(sourcesCfg.sources) ? sourcesCfg.sources : [],
    activeId: sourcesCfg.activeId || sourcesCfg.active || sourcesCfg.selected || sourcesCfg.current || '',
    testStatus: {}
  };

  const esc = (val) => escapeHTML(val == null ? '' : String(val));
  const getCsrf = () =>
    document.querySelector('meta[name="csrf-token"]')?.content ||
    window.csrfToken ||
    '';

  const setStatus = (msg, tone = 'muted') => {
    if (!statusEl) return;
    statusEl.className = `text-${tone} small`;
    statusEl.textContent = msg || '';
  };

  const setSavingState = (saving, message) => {
    if (saveBtn) {
      saveBtn.disabled = !!saving;
    }
    if (saving && message) {
      setStatus(message);
    }
  };

  const refreshSourceSelectorSafe = async (origin) => {
    try {
      if (typeof window.__frRefreshSourceSelector === 'function') {
        await window.__frRefreshSourceSelector({ origin });
      }
    } catch (e) { /* ignore */ }
  };

  const normalizeTestState = (value) =>
    (value === 'testing' || value === 'ok' || value === 'error') ? value : 'idle';

  const truncateTestMessage = (msg, max = 80) => {
    const clean = String(msg || '').replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    return clean.slice(0, max) + '...';
  };

  const testStatusLabel = (state, message) => {
    if (state === 'testing') return tf('source_test_running', 'Testing...');
    if (state === 'ok') return tf('source_test_ok', 'Connected');
    if (state === 'error') {
      const base = tf('source_test_failed', 'Failed');
      const detail = message ? truncateTestMessage(message, 60) : '';
      return detail ? `${base}: ${detail}` : base;
    }
    return tf('source_test_idle', 'Not tested');
  };

  const getTestStatus = (id) => {
    const entry = (state.testStatus && state.testStatus[id]) ? state.testStatus[id] : {};
    return {
      state: normalizeTestState(entry.state),
      message: entry.message ? String(entry.message) : ''
    };
  };

  const setTestStatus = (id, next) => {
    if (!id) return;
    const current = (state.testStatus && state.testStatus[id]) ? state.testStatus[id] : {};
    state.testStatus[id] = { ...current, ...next };
    renderList();
  };

  const pruneTestStatus = () => {
    if (!state.testStatus) return;
    const ids = new Set((state.sources || []).map(src => String(src.id || '')));
    Object.keys(state.testStatus).forEach(id => {
      if (!ids.has(id)) {
        delete state.testStatus[id];
      }
    });
  };

  const setType = (type) => {
    const t = (type || 'local').toLowerCase();
    sourceTypeEl.value = t;
    typeBlocks.forEach(block => {
      block.hidden = block.getAttribute('data-type') !== t;
    });
  };

  const resetSecrets = () => {
    [
      s3AccessKeyEl,
      s3SecretKeyEl,
      s3SessionTokenEl,
      sftpPasswordEl,
      sftpPrivateKeyEl,
      sftpPrivateKeyPassEl,
      ftpPasswordEl,
      webdavPasswordEl,
      smbPasswordEl,
      gdriveClientSecretEl,
      gdriveRefreshTokenEl,
      onedriveClientSecretEl,
      onedriveRefreshTokenEl,
      dropboxAppSecretEl,
      dropboxRefreshTokenEl,
    ].forEach(el => {
      if (!el) return;
      el.value = '';
      el.placeholder = '';
    });
  };

  const resetForm = () => {
    editingId = '';
    formTitleEl.textContent = tf('source_add', 'Add Source');
    if (sourceIdEl) {
      sourceIdEl.disabled = false;
      sourceIdEl.value = '';
    }
    if (sourceNameEl) sourceNameEl.value = '';
    if (sourceEnabledEl) sourceEnabledEl.checked = true;
    if (sourceReadOnlyEl) sourceReadOnlyEl.checked = false;
    if (localPathEl) localPathEl.value = '';
    if (s3BucketEl) s3BucketEl.value = '';
    if (s3RegionEl) s3RegionEl.value = '';
    if (s3EndpointEl) s3EndpointEl.value = '';
    if (s3PrefixEl) s3PrefixEl.value = '';
    if (s3PathStyleEl) s3PathStyleEl.checked = false;
    if (sftpHostEl) sftpHostEl.value = '';
    if (sftpPortEl) sftpPortEl.value = '';
    if (sftpUsernameEl) sftpUsernameEl.value = '';
    if (sftpRootEl) sftpRootEl.value = '';
    if (ftpHostEl) ftpHostEl.value = '';
    if (ftpPortEl) ftpPortEl.value = '';
    if (ftpUsernameEl) ftpUsernameEl.value = '';
    if (ftpSslEl) ftpSslEl.checked = false;
    if (ftpPassiveEl) ftpPassiveEl.checked = true;
    if (ftpRootEl) ftpRootEl.value = '';
    if (webdavUrlEl) webdavUrlEl.value = '';
    if (webdavUsernameEl) webdavUsernameEl.value = '';
    if (webdavRootEl) webdavRootEl.value = '';
    if (webdavVerifyTlsEl) webdavVerifyTlsEl.checked = true;
    if (smbHostEl) smbHostEl.value = '';
    if (smbShareEl) smbShareEl.value = '';
    if (smbUsernameEl) smbUsernameEl.value = '';
    if (smbDomainEl) smbDomainEl.value = '';
    if (smbVersionEl) smbVersionEl.value = '';
    if (smbRootEl) smbRootEl.value = '';
    if (gdriveClientIdEl) gdriveClientIdEl.value = '';
    if (gdriveRootIdEl) gdriveRootIdEl.value = '';
    if (gdriveDriveIdEl) gdriveDriveIdEl.value = '';
    if (onedriveClientIdEl) onedriveClientIdEl.value = '';
    if (onedriveTenantEl) onedriveTenantEl.value = '';
    if (onedriveDriveIdEl) onedriveDriveIdEl.value = '';
    if (onedriveSiteIdEl) onedriveSiteIdEl.value = '';
    if (onedriveRootPathEl) onedriveRootPathEl.value = '';
    if (dropboxAppKeyEl) dropboxAppKeyEl.value = '';
    if (dropboxRootPathEl) dropboxRootPathEl.value = '';
    if (dropboxTeamMemberIdEl) dropboxTeamMemberIdEl.value = '';
    if (dropboxRootNamespaceIdEl) dropboxRootNamespaceIdEl.value = '';
    resetSecrets();
    setType('local');
    if (listEl) renderList();
  };

  const applySecretPlaceholders = (src) => {
    const cfg = (src && src.config) ? src.config : {};
    const setSaved = (el, has) => {
      if (!el) return;
      el.value = '';
      el.placeholder = has ? '•••••• (saved)' : '';
    };
    setSaved(s3AccessKeyEl, !!cfg.hasAccessKey);
    setSaved(s3SecretKeyEl, !!cfg.hasSecretKey);
    setSaved(s3SessionTokenEl, !!cfg.hasSessionToken);
    setSaved(sftpPasswordEl, !!cfg.hasPassword);
    setSaved(sftpPrivateKeyEl, !!cfg.hasPrivateKey);
    setSaved(sftpPrivateKeyPassEl, !!cfg.hasPrivateKeyPassphrase);
    setSaved(ftpPasswordEl, !!cfg.hasPassword);
    setSaved(webdavPasswordEl, !!cfg.hasPassword);
    setSaved(smbPasswordEl, !!cfg.hasPassword);
    setSaved(gdriveClientSecretEl, !!cfg.hasClientSecret);
    setSaved(gdriveRefreshTokenEl, !!cfg.hasRefreshToken);
    setSaved(onedriveClientSecretEl, !!cfg.hasClientSecret);
    setSaved(onedriveRefreshTokenEl, !!cfg.hasRefreshToken);
    setSaved(dropboxAppSecretEl, !!cfg.hasAppSecret);
    setSaved(dropboxRefreshTokenEl, !!cfg.hasRefreshToken);
  };

  const fillForm = (src) => {
    if (!src || typeof src !== 'object') return;
    editingId = String(src.id || '');
    formTitleEl.textContent = tf('source_edit', 'Edit Source');
    if (sourceIdEl) {
      sourceIdEl.value = src.id || '';
      sourceIdEl.disabled = true;
    }
    if (sourceNameEl) sourceNameEl.value = src.name || '';
    if (sourceEnabledEl) sourceEnabledEl.checked = src.enabled !== false;
    if (sourceReadOnlyEl) sourceReadOnlyEl.checked = !!src.readOnly;
    const type = (src.type || 'local').toLowerCase();
    setType(type);
    const cfg = src.config || {};
    if (localPathEl) localPathEl.value = cfg.path || cfg.root || '';
    if (s3BucketEl) s3BucketEl.value = cfg.bucket || '';
    if (s3RegionEl) s3RegionEl.value = cfg.region || '';
    if (s3EndpointEl) s3EndpointEl.value = cfg.endpoint || '';
    if (s3PrefixEl) s3PrefixEl.value = cfg.prefix || '';
    if (s3PathStyleEl) s3PathStyleEl.checked = !!cfg.pathStyle;
    if (sftpHostEl) sftpHostEl.value = cfg.host || '';
    if (sftpPortEl) sftpPortEl.value = cfg.port || '';
    if (sftpUsernameEl) sftpUsernameEl.value = cfg.username || '';
    if (sftpRootEl) sftpRootEl.value = cfg.root || cfg.path || '';
    if (ftpHostEl) ftpHostEl.value = cfg.host || '';
    if (ftpPortEl) ftpPortEl.value = cfg.port || '';
    if (ftpUsernameEl) ftpUsernameEl.value = cfg.username || '';
    if (ftpSslEl) ftpSslEl.checked = !!cfg.ssl;
    if (ftpPassiveEl) {
      const passive = (typeof cfg.passive === 'undefined') ? true : !!cfg.passive;
      ftpPassiveEl.checked = passive;
    }
    if (ftpRootEl) ftpRootEl.value = cfg.root || cfg.path || '';
    if (webdavUrlEl) webdavUrlEl.value = cfg.baseUrl || cfg.url || '';
    if (webdavUsernameEl) webdavUsernameEl.value = cfg.username || '';
    if (webdavRootEl) webdavRootEl.value = cfg.root || cfg.path || '';
    if (webdavVerifyTlsEl) {
      webdavVerifyTlsEl.checked = (typeof cfg.verifyTls === 'undefined') ? true : !!cfg.verifyTls;
    }
    if (smbHostEl) smbHostEl.value = cfg.host || '';
    if (smbShareEl) smbShareEl.value = cfg.share || '';
    if (smbUsernameEl) smbUsernameEl.value = cfg.username || '';
    if (smbDomainEl) smbDomainEl.value = cfg.domain || '';
    if (smbVersionEl) smbVersionEl.value = cfg.version || '';
    if (smbRootEl) smbRootEl.value = cfg.root || cfg.path || '';
    if (gdriveClientIdEl) gdriveClientIdEl.value = cfg.clientId || '';
    if (gdriveRootIdEl) gdriveRootIdEl.value = cfg.rootId || '';
    if (gdriveDriveIdEl) gdriveDriveIdEl.value = cfg.driveId || '';
    if (onedriveClientIdEl) onedriveClientIdEl.value = cfg.clientId || '';
    if (onedriveTenantEl) onedriveTenantEl.value = cfg.tenant || '';
    if (onedriveDriveIdEl) onedriveDriveIdEl.value = cfg.driveId || '';
    if (onedriveSiteIdEl) onedriveSiteIdEl.value = cfg.siteId || '';
    if (onedriveRootPathEl) onedriveRootPathEl.value = cfg.rootPath || '';
    if (dropboxAppKeyEl) dropboxAppKeyEl.value = cfg.appKey || '';
    if (dropboxRootPathEl) dropboxRootPathEl.value = cfg.rootPath || '';
    if (dropboxTeamMemberIdEl) dropboxTeamMemberIdEl.value = cfg.teamMemberId || '';
    if (dropboxRootNamespaceIdEl) dropboxRootNamespaceIdEl.value = cfg.rootNamespaceId || '';
    applySecretPlaceholders(src);
    if (listEl) renderList();
  };

  const renderList = () => {
    const rows = Array.isArray(state.sources) ? state.sources : [];
    if (!rows.length) {
      listEl.innerHTML = `<div class="text-muted">${tf('source_list_empty', 'No sources configured yet.')}</div>`;
      return;
    }
    const selectedId = editingId ? String(editingId) : '';
    const activeRowId = (selectedId && rows.some(src => String(src.id || '') === selectedId))
      ? selectedId
      : '';

    const header = `
      <div class="sources-row sources-header">
        <div>${tf('source_name', 'Source Name')}</div>
        <div>${tf('source_type', 'Type')}</div>
        <div>${tf('source_id', 'Source ID')}</div>
        <div class="sources-header-actions">${tf('actions', 'Actions')}</div>
      </div>
    `;

    const body = rows.map((src, idx) => {
      const id = String(src.id || '');
      const name = String(src.name || id || '');
      const type = String(src.type || '');
      const enabledText = (src.enabled === false) ? tf('disabled', 'Disabled') : tf('enabled', 'Enabled');
      const flags = [
        enabledText,
        (src.readOnly ? t('read_only') : '')
      ].filter(Boolean);
      const badges = flags.map(flag => `<span class="sources-badge">${esc(flag)}</span>`).join('');
      const badgeWrap = badges ? `<span class="sources-badges">${badges}</span>` : '';
      const testState = getTestStatus(id);
      const statusText = testStatusLabel(testState.state, testState.message);
      const statusClass = `sources-test-status status-${testState.state}`;
      const statusTitle = testState.message ? ` title="${esc(testState.message)}"` : '';
      const testDisabled = (testState.state === 'testing') ? 'disabled' : '';
      const rowClass = [
        'sources-row',
        'sources-row-data',
        (idx % 2 === 1) ? 'is-alt' : '',
        (activeRowId && id === activeRowId) ? 'is-active' : ''
      ].filter(Boolean).join(' ');
      const readOnlyLabel = tf('read_only', 'Read-only');
      const lockIcon = src.readOnly
        ? `<span class="material-icons sources-lock-icon" title="${esc(readOnlyLabel)}" aria-hidden="true">lock</span>`
        : '';
      const testLabel = tf('source_test', 'Test');

      return `
        <div class="${rowClass}" data-id="${esc(id)}">
          <div class="sources-cell sources-name"><span class="sources-name-text">${esc(name)}</span>${lockIcon}${badgeWrap}</div>
          <div class="sources-cell">${esc(type)}</div>
          <div class="sources-cell"><code>${esc(id)}</code></div>
          <div class="sources-actions">
            <span class="${statusClass}"${statusTitle}>${esc(statusText)}</span>
            <button type="button" class="btn btn-sm btn-secondary sources-icon-btn" data-action="test" data-id="${esc(id)}" ${testDisabled} title="${esc(testLabel)}" aria-label="${esc(testLabel)}">
              <span class="material-icons" aria-hidden="true">science</span>
            </button>
            <button type="button" class="btn btn-sm btn-secondary" data-action="edit" data-id="${esc(id)}">
              ${tf('source_edit', 'Edit')}
            </button>
            <button type="button" class="btn btn-sm btn-danger" data-action="delete" data-id="${esc(id)}">
              ${tf('source_delete', 'Delete')}
            </button>
          </div>
        </div>
      `;
    }).join('');

    listEl.innerHTML = `<div class="sources-grid">${header}${body}</div>`;
  };

  const loadSources = async () => {
    if (!isPro || !proSourcesApiOk || window.__FR_IS_PRO === false) {
      return;
    }
    setStatus(tf('loading', 'Loading...'));
    listEl.innerHTML = `<div class="text-muted">${tf('loading', 'Loading...')}</div>`;
    let data = null;
    try {
      const res = await fetch(withBase('/api/pro/sources/list.php'), {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      data = await safeJson(res);
    } catch (e) {
      console.warn('Sources list failed', e);
      setStatus(e?.message || tf('error', 'Error'), 'danger');
    }

    if (data && data.ok === true) {
      state.enabled = !!data.enabled;
      state.sources = Array.isArray(data.sources) ? data.sources : [];
      state.activeId = data.activeId || '';
      setStatus('');
    } else if (!state.sources.length) {
      state.sources = Array.isArray(sourcesCfg.sources) ? sourcesCfg.sources : [];
    }

    if (enabledToggle) enabledToggle.checked = !!state.enabled;
    pruneTestStatus();
    renderList();
  };

  const runSourceTest = async (src) => {
    const id = String(src.id || '');
    if (!id) return null;
    const current = getTestStatus(id);
    if (current.state === 'testing') {
      return null;
    }
    setTestStatus(id, { state: 'testing', message: '' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch(withBase('/api/pro/sources/test.php'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrf(),
          'Accept': 'application/json',
        },
        body: JSON.stringify({ id }),
        signal: controller.signal,
      });
      const data = await safeJson(res);
      const msg = data && data.message ? String(data.message) : '';
      setTestStatus(id, { state: 'ok', message: msg });
      return true;
    } catch (err) {
      const timedOut = err && err.name === 'AbortError';
      const msg = timedOut
        ? tf('source_test_timeout', 'Test timed out.')
        : (err?.message || tf('source_test_error', 'Test failed'));
      setTestStatus(id, { state: 'error', message: msg });
      showToast(msg, 5000);
      return false;
    } finally {
      clearTimeout(timer);
    }
  };

  if (enabledToggle) {
    enabledToggle.checked = !!state.enabled;
    enabledToggle.addEventListener('change', async () => {
      const next = !!enabledToggle.checked;
      try {
        const res = await fetch(withBase('/api/pro/sources/save.php'), {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCsrf(),
            'Accept': 'application/json',
          },
          body: JSON.stringify({ enabled: next }),
        });
        const data = await safeJson(res);
        if (!data || data.ok !== true) {
          throw new Error(data?.error || 'Failed to save sources setting.');
        }
        state.enabled = next;
        setStatus(tf('settings_updated_successfully', 'Settings updated successfully.'));
        await refreshSourceSelectorSafe('admin-sources-toggle');
      } catch (e) {
        console.warn('Sources enabled save failed', e);
        enabledToggle.checked = !next;
        setStatus(e?.message || tf('error_updating_settings', 'Error updating settings'), 'danger');
      }
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadSources);
  }

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      resetForm();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => resetForm());
  }

  if (sourceTypeEl) {
    sourceTypeEl.addEventListener('change', () => setType(sourceTypeEl.value));
  }

  if (listEl) {
    listEl.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = btn.getAttribute('data-id') || '';
      const action = btn.getAttribute('data-action') || '';
      const src = (state.sources || []).find(s => String(s.id || '') === id);
      if (!src) return;

      if (action === 'edit') {
        fillForm(src);
        return;
      }

      if (action === 'test') {
        runSourceTest(src);
        return;
      }

      if (action === 'delete') {
        const ok = window.confirm(
          `Delete source "${src.name || src.id}"? This does not remove any stored files.`
        );
        if (!ok) return;
        (async () => {
          try {
            const res = await fetch(withBase('/api/pro/sources/delete.php'), {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': getCsrf(),
                'Accept': 'application/json',
              },
              body: JSON.stringify({ id: src.id }),
            });
            const data = await safeJson(res);
            if (!data || data.ok !== true) {
              throw new Error(data?.error || 'Failed to delete source.');
            }
            resetForm();
            await loadSources();
            await refreshSourceSelectorSafe('admin-sources-delete');
          } catch (err) {
            showToast(err?.message || tf('error', 'Error'), 'error');
          }
        })();
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const id = (sourceIdEl?.value || '').trim();
      const name = (sourceNameEl?.value || '').trim();
      const type = (sourceTypeEl?.value || '').trim().toLowerCase();
      const enabled = !!sourceEnabledEl?.checked;
      const readOnly = !!sourceReadOnlyEl?.checked;

      if (!id || !name || !type) {
        showToast(t('admin_source_required_fields'), 'error');
        return;
      }

      const config = {};
        if (type === 'local') {
          const path = (localPathEl?.value || '').trim();
          if (path) {
            config.path = path;
          }
        } else if (type === 's3') {
        const bucket = (s3BucketEl?.value || '').trim();
        if (!bucket) {
          showToast(t('admin_source_s3_bucket_required'), 'error');
          return;
        }
        config.bucket = bucket;
        const region = (s3RegionEl?.value || '').trim();
        const endpoint = (s3EndpointEl?.value || '').trim();
        const prefix = (s3PrefixEl?.value || '').trim();
        const accessKey = (s3AccessKeyEl?.value || '').trim();
        const secretKey = (s3SecretKeyEl?.value || '').trim();
        const sessionToken = (s3SessionTokenEl?.value || '').trim();
        if (region) config.region = region;
        if (endpoint) config.endpoint = endpoint;
        if (prefix) config.prefix = prefix;
        if (accessKey) config.accessKey = accessKey;
        if (secretKey) config.secretKey = secretKey;
        if (sessionToken) config.sessionToken = sessionToken;
        config.pathStyle = !!s3PathStyleEl?.checked;
      } else if (type === 'sftp') {
        const host = (sftpHostEl?.value || '').trim();
        const username = (sftpUsernameEl?.value || '').trim();
        const password = (sftpPasswordEl?.value || '').trim();
        const privateKey = (sftpPrivateKeyEl?.value || '').trim();
        const privateKeyPassphrase = (sftpPrivateKeyPassEl?.value || '').trim();
        if (!host || !username) {
          showToast(t('admin_source_sftp_host_required'), 'error');
          return;
        }
        if (!password && !privateKey && !editingId) {
          showToast(t('admin_source_sftp_auth_required'), 'error');
          return;
        }
        config.host = host;
        config.username = username;
        const port = parseInt(sftpPortEl?.value || '', 10);
        if (Number.isFinite(port) && port > 0) {
          config.port = port;
        }
        const root = (sftpRootEl?.value || '').trim();
        if (root) config.root = root;
        if (password) config.password = password;
        if (privateKey) config.privateKey = privateKey;
        if (privateKeyPassphrase) config.privateKeyPassphrase = privateKeyPassphrase;
      } else if (type === 'ftp') {
        const host = (ftpHostEl?.value || '').trim();
        const username = (ftpUsernameEl?.value || '').trim();
        const password = (ftpPasswordEl?.value || '').trim();
        if (!host || !username) {
          showToast(t('admin_source_ftp_host_required'), 'error');
          return;
        }
        config.host = host;
        config.username = username;
        const port = parseInt(ftpPortEl?.value || '', 10);
        if (Number.isFinite(port) && port > 0) {
          config.port = port;
        }
        const root = (ftpRootEl?.value || '').trim();
        if (root) config.root = root;
        if (password) config.password = password;
        config.ssl = !!ftpSslEl?.checked;
        config.passive = (ftpPassiveEl?.checked !== false);
      } else if (type === 'webdav') {
        const baseUrl = (webdavUrlEl?.value || '').trim();
        const username = (webdavUsernameEl?.value || '').trim();
        const password = (webdavPasswordEl?.value || '').trim();
        const root = (webdavRootEl?.value || '').trim();
        const verifyTls = (webdavVerifyTlsEl?.checked !== false);
        if (!baseUrl || !username) {
          showToast(t('admin_source_webdav_base_required'), 'error');
          return;
        }
        if (!password && !editingId) {
          showToast(t('admin_source_webdav_password_required'), 'error');
          return;
        }
        config.baseUrl = baseUrl;
        config.username = username;
        if (password) config.password = password;
        if (root) config.root = root;
        config.verifyTls = !!verifyTls;
      } else if (type === 'smb') {
        const host = (smbHostEl?.value || '').trim();
        const share = (smbShareEl?.value || '').trim();
        const username = (smbUsernameEl?.value || '').trim();
        const password = (smbPasswordEl?.value || '').trim();
        const domain = (smbDomainEl?.value || '').trim();
        const version = (smbVersionEl?.value || '').trim();
        const root = (smbRootEl?.value || '').trim();
        if (!host || !share || !username) {
          showToast(t('admin_source_smb_host_required'), 'error');
          return;
        }
        if (!password && !editingId) {
          showToast(t('admin_source_smb_password_required'), 'error');
          return;
        }
        config.host = host;
        config.share = share;
        config.username = username;
        if (password) config.password = password;
        if (domain) config.domain = domain;
        if (version) config.version = version;
        if (root) config.root = root;
      } else if (type === 'gdrive') {
        const clientId = (gdriveClientIdEl?.value || '').trim();
        const clientSecret = (gdriveClientSecretEl?.value || '').trim();
        const refreshToken = (gdriveRefreshTokenEl?.value || '').trim();
        const rootId = (gdriveRootIdEl?.value || '').trim();
        const driveId = (gdriveDriveIdEl?.value || '').trim();
        if (!clientId) {
          showToast(t('admin_source_gdrive_client_required'), 'error');
          return;
        }
        if ((!clientSecret || !refreshToken) && !editingId) {
          showToast(t('admin_source_gdrive_secret_required'), 'error');
          return;
        }
        config.clientId = clientId;
        if (clientSecret) config.clientSecret = clientSecret;
        if (refreshToken) config.refreshToken = refreshToken;
        if (rootId) config.rootId = rootId;
        if (driveId) config.driveId = driveId;
      } else if (type === 'onedrive') {
        const clientId = (onedriveClientIdEl?.value || '').trim();
        const clientSecret = (onedriveClientSecretEl?.value || '').trim();
        const refreshToken = (onedriveRefreshTokenEl?.value || '').trim();
        const tenant = (onedriveTenantEl?.value || '').trim();
        const driveId = (onedriveDriveIdEl?.value || '').trim();
        const siteId = (onedriveSiteIdEl?.value || '').trim();
        const rootPath = (onedriveRootPathEl?.value || '').trim();
        if (!clientId) {
          showToast(tf('admin_source_onedrive_client_required', 'OneDrive client ID is required.'), 'error');
          return;
        }
        if ((!clientSecret || !refreshToken) && !editingId) {
          showToast(tf('admin_source_onedrive_secret_required', 'OneDrive client secret and refresh token are required.'), 'error');
          return;
        }
        config.clientId = clientId;
        if (clientSecret) config.clientSecret = clientSecret;
        if (refreshToken) config.refreshToken = refreshToken;
        if (tenant) config.tenant = tenant;
        if (driveId) config.driveId = driveId;
        if (siteId) config.siteId = siteId;
        if (rootPath) config.rootPath = rootPath;
      } else if (type === 'dropbox') {
        const appKey = (dropboxAppKeyEl?.value || '').trim();
        const appSecret = (dropboxAppSecretEl?.value || '').trim();
        const refreshToken = (dropboxRefreshTokenEl?.value || '').trim();
        const rootPath = (dropboxRootPathEl?.value || '').trim();
        const teamMemberId = (dropboxTeamMemberIdEl?.value || '').trim();
        const rootNamespaceId = (dropboxRootNamespaceIdEl?.value || '').trim();
        if (!appKey) {
          showToast(tf('admin_source_dropbox_app_required', 'Dropbox app key is required.'), 'error');
          return;
        }
        if ((!appSecret || !refreshToken) && !editingId) {
          showToast(tf('admin_source_dropbox_secret_required', 'Dropbox app secret and refresh token are required.'), 'error');
          return;
        }
        config.appKey = appKey;
        if (appSecret) config.appSecret = appSecret;
        if (refreshToken) config.refreshToken = refreshToken;
        if (rootPath) config.rootPath = rootPath;
        if (teamMemberId) config.teamMemberId = teamMemberId;
        if (rootNamespaceId) config.rootNamespaceId = rootNamespaceId;
      }

      const payload = {
        source: { id, name, type, enabled, readOnly, config }
      };

      const existingIdx = (state.sources || []).findIndex(s => String(s.id || '') === id);
      const isNewSource = existingIdx === -1;
      const optimisticEnabled = isNewSource
        ? false
        : ((state.sources[existingIdx]?.enabled) !== false);
      const optimisticSource = { id, name, type, enabled: optimisticEnabled, readOnly };

      if (isNewSource) {
        state.sources = [...(state.sources || []), optimisticSource];
      } else if (existingIdx >= 0) {
        state.sources[existingIdx] = { ...state.sources[existingIdx], ...optimisticSource };
      }
      if (isNewSource || existingIdx >= 0) {
        setTestStatus(id, { state: 'testing', message: tf('saving_source_short', 'Saving...') });
      }

      setSavingState(true, tf('saving_source', 'Saving source... this may take a moment.'));
      showToast(tf('saving_source_toast', 'Saving source...'), 2000);

      try {
        const res = await fetch(withBase('/api/pro/sources/save.php'), {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCsrf(),
            'Accept': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        const data = await safeJson(res);
        if (!data || data.ok !== true) {
          throw new Error(data?.error || 'Failed to save source.');
        }
        await loadSources();

        if (data?.autoTested) {
          if (data.autoTestOk) {
            setTestStatus(id, { state: 'ok', message: '' });
          } else {
            const errMsg = data.autoTestError || tf('source_test_error', 'Test failed');
            setTestStatus(id, { state: 'error', message: errMsg });
            const disabledNote = data.autoDisabled ? t('admin_source_test_left_disabled_note') : '';
            showToast(t('admin_source_test_failed_detail', { error: errMsg, note: disabledNote }), 5000);
          }
        } else if (enabled) {
          const testOk = await runSourceTest({ id });
          if (testOk === false) {
            const disablePayload = { source: { id, name, type, enabled: false, readOnly, config } };
            try {
              const disableRes = await fetch(withBase('/api/pro/sources/save.php'), {
                method: 'POST',
                credentials: 'include',
                headers: {
                  'Content-Type': 'application/json',
                  'X-CSRF-Token': getCsrf(),
                  'Accept': 'application/json',
                },
                body: JSON.stringify(disablePayload),
              });
              const disableData = await safeJson(disableRes);
              if (!disableData || disableData.ok !== true) {
                throw new Error(disableData?.error || 'Failed to disable source after test failure.');
              }
              showToast(t('admin_source_test_failed_left_disabled'), 'error');
              await loadSources();
            } catch (disableErr) {
              showToast(disableErr?.message || t('admin_source_test_failed_disable_error'), 'error');
            }
          }
        } else {
          setTestStatus(id, { state: 'idle', message: '' });
        }

        await refreshSourceSelectorSafe('admin-sources-save');
        resetForm();
      } catch (err) {
        if (isNewSource) {
          state.sources = (state.sources || []).filter(s => String(s.id || '') !== id);
          if (state.testStatus) {
            delete state.testStatus[id];
          }
          renderList();
        } else {
          setTestStatus(id, { state: 'error', message: err?.message || tf('error', 'Error') });
        }
        setStatus(err?.message || tf('error', 'Error'), 'danger');
        showToast(err?.message || tf('error', 'Error'), 'error');
      } finally {
        setSavingState(false);
      }
    });
  }

  resetForm();
  loadSources();
}

function onShareFolderToggle(row, checked) {
  const manage = qs(row, 'input[data-cap="manage"]');
  const viewAll = qs(row, 'input[data-cap="view"]');
  if (checked) {
    if (manage && !manage.checked) manage.checked = true;
    if (viewAll && !viewAll.checked) viewAll.checked = true;
  }
  enforceShareFolderRule(row);
}

function onShareFileToggle(row, checked) {
  if (!checked) return;
  const viewAll = qs(row, 'input[data-cap="view"]');
  const viewOwn = qs(row, 'input[data-cap="viewOwn"]');
  const hasView = !!(viewAll && viewAll.checked);
  const hasOwn = !!(viewOwn && viewOwn.checked);
  if (!hasView && !hasOwn && viewOwn) {
    viewOwn.checked = true;
  }
}

function onWriteToggle(row, checked) {
  const caps = ["create", "upload", "edit", "rename", "copy", "delete", "extract"];
  caps.forEach(c => {
    const box = qs(row, `input[data-cap="${c}"]`);
    if (box) box.checked = checked;
  });
}
/* === END: Folder Access helpers (merged + improved) === */

// Translate with fallback
const tf = (key, fallback) => {
  const v = t(key);
  return (v && v !== key) ? v : fallback;
};
function wireOidcDebugSnapshotButton(scope = document) {
  const btn = scope.querySelector('#oidcDebugSnapshotBtn');
  const box = scope.querySelector('#oidcDebugSnapshot');
  if (!btn || !box || btn.__wired) return;
  btn.__wired = true;

  btn.addEventListener('click', async () => {
    box.textContent = 'Loading snapshot…';

    try {
      const res = await fetch('/api/admin/oidcDebugInfo.php', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'X-CSRF-Token': window.csrfToken || ''
        }
      });

      const data = await safeJson(res).catch(err => {
        console.error('oidcDebugInfo HTTP error', err);
        return null;
      });

      if (!data || data.success !== true) {
        const msg = (data && (data.error || data.message)) || t('admin_oidc_snapshot_failed');
        box.textContent = msg;
        showToast(msg, 'error');
        return;
      }

      box.textContent = JSON.stringify(data.info || data.data || data, null, 2);
    } catch (e) {
      console.error('oidcDebugInfo error', e);
      box.textContent = 'Error: ' + (e && e.message ? e.message : String(e));
      showToast(t('admin_oidc_snapshot_failed'), 'error');
    }
  });
}

// --- tiny robust JSON helper ---
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

let originalAdminConfig = {};
function captureInitialAdminConfig() {
  const ht = document.getElementById("headerTitle");
  originalAdminConfig = {
    headerTitle: ht ? ht.value.trim() : "",
    publishedUrl: (document.getElementById("publishedUrl")?.value || "").trim(),

    oidcProviderUrl: (document.getElementById("oidcProviderUrl")?.value || "").trim(),
    oidcClientId: (document.getElementById("oidcClientId")?.value || "").trim(),
    oidcClientSecret: (document.getElementById("oidcClientSecret")?.value || "").trim(),
    oidcDebugLogging: !!document.getElementById("oidcDebugLogging")?.checked,
    oidcRedirectUri: (document.getElementById("oidcRedirectUri")?.value || "").trim(),
    oidcAllowDemote: !!document.getElementById("oidcAllowDemote")?.checked,

    // UI is now “enable” toggles
    enableFormLogin: !!document.getElementById("enableFormLogin")?.checked,
    enableBasicAuth: !!document.getElementById("enableBasicAuth")?.checked,
    enableOIDCLogin: !!document.getElementById("enableOIDCLogin")?.checked,
    authBypass: !!document.getElementById("authBypass")?.checked,

    enableWebDAV: !!document.getElementById("enableWebDAV")?.checked,
    sharedMaxUploadSize: (document.getElementById("sharedMaxUploadSize")?.value || "").trim(),
    resumableChunkMb: (document.getElementById("resumableChunkMb")?.value || "").trim(),
    resumableTtlHours: (document.getElementById("resumableTtlHours")?.value || "").trim(),
    globalOtpauthUrl: (document.getElementById("globalOtpauthUrl")?.value || "").trim(),
    brandingCustomLogoUrl: (document.getElementById("brandingCustomLogoUrl")?.value || "").trim(),
    brandingHeaderBgLight: (document.getElementById("brandingHeaderBgLight")?.value || "").trim(),
    brandingHeaderBgDark: (document.getElementById("brandingHeaderBgDark")?.value || "").trim(),
    brandingMetaDescription: (document.getElementById("brandingMetaDescription")?.value || "").trim(),
    brandingFaviconSvg: (document.getElementById("brandingFaviconSvg")?.value || "").trim(),
    brandingFaviconPng: (document.getElementById("brandingFaviconPng")?.value || "").trim(),
    brandingFaviconIco: (document.getElementById("brandingFaviconIco")?.value || "").trim(),
    brandingAppleTouchIcon: (document.getElementById("brandingAppleTouchIcon")?.value || "").trim(),
    brandingMaskIcon: (document.getElementById("brandingMaskIcon")?.value || "").trim(),
    brandingMaskIconColor: (document.getElementById("brandingMaskIconColor")?.value || "").trim(),
    brandingThemeColorLight: (document.getElementById("brandingThemeColorLight")?.value || "").trim(),
    brandingThemeColorDark: (document.getElementById("brandingThemeColorDark")?.value || "").trim(),
    brandingLoginBgLight: (document.getElementById("brandingLoginBgLight")?.value || "").trim(),
    brandingLoginBgDark: (document.getElementById("brandingLoginBgDark")?.value || "").trim(),
    brandingAppBgLight: (document.getElementById("brandingAppBgLight")?.value || "").trim(),
    brandingAppBgDark: (document.getElementById("brandingAppBgDark")?.value || "").trim(),
    brandingLoginTagline: (document.getElementById("brandingLoginTagline")?.value || "").trim(),
    brandingFooterHtml: (document.getElementById("brandingFooterHtml")?.value || "").trim(),
    defaultLanguage: (document.getElementById("defaultLanguage")?.value || "").trim(),
    hoverPreviewMaxImageMb: (document.getElementById("hoverPreviewMaxImageMb")?.value || "").trim(),
    hoverPreviewMaxVideoMb: (document.getElementById("hoverPreviewMaxVideoMb")?.value || "").trim(),
    ffmpegPath: (document.getElementById("ffmpegPath")?.value || "").trim(),
    fileListSummaryDepth: (document.getElementById("fileListSummaryDepth")?.value || "").trim(),
    ignoreRegex: (document.getElementById("ignoreRegex")?.value || "").trim(),

    clamavScanUploads: !!document.getElementById("clamavScanUploads")?.checked,
    clamavExcludeDirs: (document.getElementById("clamavExcludeDirs")?.value || "").trim(),
    proSearchEnabled: !!document.getElementById("proSearchEnabled")?.checked,
    proSearchLimit: (document.getElementById("proSearchLimit")?.value || "").trim(),
    proAuditEnabled: !!document.getElementById("proAuditEnabled")?.checked,
    proAuditLevel: (document.getElementById("proAuditLevel")?.value || "").trim(),
    proAuditMaxFileMb: (document.getElementById("proAuditMaxFileMb")?.value || "").trim(),
    proAuditMaxFiles: (document.getElementById("proAuditMaxFiles")?.value || "").trim(),
  };
}
function hasUnsavedChanges() {
  const o = originalAdminConfig;
  const getVal = id => (document.getElementById(id)?.value || "").trim();
  const getChk = id => !!document.getElementById(id)?.checked;

  return (
    getVal("headerTitle") !== o.headerTitle ||
    getVal("publishedUrl") !== (o.publishedUrl || "") ||

    getVal("oidcProviderUrl") !== o.oidcProviderUrl ||
    getVal("oidcClientId") !== o.oidcClientId ||
    getVal("oidcClientSecret") !== o.oidcClientSecret ||
    getVal("oidcRedirectUri") !== o.oidcRedirectUri ||
    getChk("oidcAllowDemote") !== o.oidcAllowDemote ||
    getChk("oidcDebugLogging") !== o.oidcDebugLogging ||

    // new enable-toggles
    getChk("enableFormLogin") !== o.enableFormLogin ||
    getChk("enableBasicAuth") !== o.enableBasicAuth ||
    getChk("enableOIDCLogin") !== o.enableOIDCLogin ||
    getChk("authBypass") !== o.authBypass ||

    getChk("enableWebDAV") !== o.enableWebDAV ||
    getVal("sharedMaxUploadSize") !== o.sharedMaxUploadSize ||
    getVal("resumableChunkMb") !== o.resumableChunkMb ||
    getVal("resumableTtlHours") !== o.resumableTtlHours ||
    getVal("globalOtpauthUrl") !== o.globalOtpauthUrl ||
    getVal("brandingCustomLogoUrl") !== (o.brandingCustomLogoUrl || "") ||
    getVal("brandingHeaderBgLight") !== (o.brandingHeaderBgLight || "") ||
    getVal("brandingHeaderBgDark") !== (o.brandingHeaderBgDark || "") ||
    getVal("brandingMetaDescription") !== (o.brandingMetaDescription || "") ||
    getVal("brandingFaviconSvg") !== (o.brandingFaviconSvg || "") ||
    getVal("brandingFaviconPng") !== (o.brandingFaviconPng || "") ||
    getVal("brandingFaviconIco") !== (o.brandingFaviconIco || "") ||
    getVal("brandingAppleTouchIcon") !== (o.brandingAppleTouchIcon || "") ||
    getVal("brandingMaskIcon") !== (o.brandingMaskIcon || "") ||
    getVal("brandingMaskIconColor") !== (o.brandingMaskIconColor || "") ||
    getVal("brandingThemeColorLight") !== (o.brandingThemeColorLight || "") ||
    getVal("brandingThemeColorDark") !== (o.brandingThemeColorDark || "") ||
    getVal("brandingLoginBgLight") !== (o.brandingLoginBgLight || "") ||
    getVal("brandingLoginBgDark") !== (o.brandingLoginBgDark || "") ||
    getVal("brandingAppBgLight") !== (o.brandingAppBgLight || "") ||
    getVal("brandingAppBgDark") !== (o.brandingAppBgDark || "") ||
    getVal("brandingLoginTagline") !== (o.brandingLoginTagline || "") ||
    getVal("brandingFooterHtml") !== (o.brandingFooterHtml || "") ||
    getVal("defaultLanguage") !== (o.defaultLanguage || "") ||
    getVal("hoverPreviewMaxImageMb") !== (o.hoverPreviewMaxImageMb || "") ||
    getVal("hoverPreviewMaxVideoMb") !== (o.hoverPreviewMaxVideoMb || "") ||
    getVal("ffmpegPath") !== (o.ffmpegPath || "") ||
    getVal("fileListSummaryDepth") !== (o.fileListSummaryDepth || "") ||
    getVal("ignoreRegex") !== (o.ignoreRegex || "") ||
    getChk("clamavScanUploads") !== o.clamavScanUploads ||
    getVal("clamavExcludeDirs") !== (o.clamavExcludeDirs || "") ||
    getChk("proSearchEnabled") !== o.proSearchEnabled ||
    getVal("proSearchLimit") !== o.proSearchLimit ||
    getChk("proAuditEnabled") !== o.proAuditEnabled ||
    getVal("proAuditLevel") !== o.proAuditLevel ||
    getVal("proAuditMaxFileMb") !== o.proAuditMaxFileMb ||
    getVal("proAuditMaxFiles") !== o.proAuditMaxFiles
  );
}

function showCustomConfirmModal(message) {
  return new Promise(resolve => {
    const modal = document.getElementById("customConfirmModal");
    const msg = document.getElementById("confirmMessage");
    const yes = document.getElementById("confirmYesBtn");
    const no = document.getElementById("confirmNoBtn");
    if (!modal || !msg || !yes || !no) { resolve(true); return; }
    msg.textContent = message;
    modal.style.display = "block";
    function clean() {
      modal.style.display = "none";
      yes.removeEventListener("click", onYes);
      no.removeEventListener("click", onNo);
    }
    function onYes() { clean(); resolve(true); }
    function onNo() { clean(); resolve(false); }
    yes.addEventListener("click", onYes);
    no.addEventListener("click", onNo);
  });
}

function showProUpdateChoiceModal({ hasAuto }) {
  return new Promise(resolve => {
    let modal = document.getElementById("proUpdateChoiceModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "proUpdateChoiceModal";
      modal.className = "modal";
      modal.style.zIndex = "4000";
      modal.style.display = "none";
      modal.innerHTML = `
        <div class="modal-content" style="max-width:520px;">
          <div id="proUpdateChoiceTitle" style="font-weight:600; margin-bottom:6px;"></div>
          <div id="proUpdateChoiceMessage" style="white-space:pre-wrap; margin-bottom:10px;"></div>
          <div class="modal-actions" style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
            <button id="proUpdateChoiceAutoBtn" class="btn btn-primary">Download + install</button>
            <button id="proUpdateChoiceManualBtn" class="btn btn-secondary">Manual download</button>
            <button id="proUpdateChoiceCancelBtn" class="btn btn-outline-secondary">Cancel</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    const titleEl = document.getElementById("proUpdateChoiceTitle");
    const msgEl = document.getElementById("proUpdateChoiceMessage");
    const autoBtn = document.getElementById("proUpdateChoiceAutoBtn");
    const manualBtn = document.getElementById("proUpdateChoiceManualBtn");
    const cancelBtn = document.getElementById("proUpdateChoiceCancelBtn");

    if (!titleEl || !msgEl || !autoBtn || !manualBtn || !cancelBtn) {
      resolve(null);
      return;
    }

    titleEl.textContent = "Pro update available";
    msgEl.textContent = hasAuto
      ? "Choose how you'd like to get the latest Pro bundle."
      : "Save a license key to enable one-click download. You can still download manually.";

    autoBtn.disabled = !hasAuto;
    modal.style.display = "block";

    const cleanup = () => {
      modal.style.display = "none";
      autoBtn.removeEventListener("click", onAuto);
      manualBtn.removeEventListener("click", onManual);
      cancelBtn.removeEventListener("click", onCancel);
    };
    const onAuto = () => { cleanup(); resolve("auto"); };
    const onManual = () => { cleanup(); resolve("manual"); };
    const onCancel = () => { cleanup(); resolve(null); };

    autoBtn.addEventListener("click", onAuto);
    manualBtn.addEventListener("click", onManual);
    cancelBtn.addEventListener("click", onCancel);
  });
}

function showTypedConfirmModal({ title, message, confirmText, placeholder }) {
  return new Promise(resolve => {
    let modal = document.getElementById("typedConfirmModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "typedConfirmModal";
      modal.className = "modal";
      modal.style.zIndex = "4000";
      modal.style.display = "none";
      modal.innerHTML = `
        <div class="modal-content" style="max-width:520px;">
          <div id="typedConfirmTitle" style="font-weight:600; margin-bottom:6px;"></div>
          <div id="typedConfirmMessage" style="white-space:pre-wrap; margin-bottom:10px;"></div>
          <input id="typedConfirmInput" class="form-control" type="text" autocomplete="off" />
          <div class="modal-actions" style="margin-top:12px;">
            <button id="typedConfirmYesBtn" class="btn btn-danger" disabled>Confirm</button>
            <button id="typedConfirmNoBtn" class="btn btn-secondary">Cancel</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    const titleEl = document.getElementById("typedConfirmTitle");
    const msgEl = document.getElementById("typedConfirmMessage");
    const input = document.getElementById("typedConfirmInput");
    const yes = document.getElementById("typedConfirmYesBtn");
    const no = document.getElementById("typedConfirmNoBtn");

    if (!titleEl || !msgEl || !input || !yes || !no) {
      resolve(false);
      return;
    }

    titleEl.textContent = title || "Confirm";
    msgEl.textContent = message || "";
    input.value = "";
    input.placeholder = placeholder || "";
    yes.disabled = true;
    modal.style.display = "block";
    input.focus();

    const onInput = () => {
      yes.disabled = (input.value !== confirmText);
    };
    const cleanup = () => {
      modal.style.display = "none";
      input.removeEventListener("input", onInput);
      yes.removeEventListener("click", onYes);
      no.removeEventListener("click", onNo);
    };
    const onYes = () => { cleanup(); resolve(true); };
    const onNo = () => { cleanup(); resolve(false); };

    input.addEventListener("input", onInput);
    yes.addEventListener("click", onYes);
    no.addEventListener("click", onNo);
  });
}

const SECTION_ANIM_MS = 160;

function clearSectionTimer(cnt) {
  if (cnt && cnt.__closeTimer) {
    clearTimeout(cnt.__closeTimer);
    cnt.__closeTimer = null;
  }
  if (cnt && cnt.__focusTimer) {
    clearTimeout(cnt.__focusTimer);
    cnt.__focusTimer = null;
  }
}

function openSectionContent(cnt) {
  if (!cnt) return;
  clearSectionTimer(cnt);
  cnt.style.display = "block";
  cnt.classList.remove("is-closing");
  requestAnimationFrame(() => {
    cnt.classList.add("is-open");
  });
}

function closeSectionContent(cnt) {
  if (!cnt) return;
  clearSectionTimer(cnt);
  cnt.classList.remove("is-open");
  cnt.classList.add("is-closing");
  cnt.__closeTimer = setTimeout(() => {
    if (cnt.classList.contains("is-closing")) {
      cnt.style.display = "none";
      cnt.classList.remove("is-closing");
    }
    cnt.__closeTimer = null;
  }, SECTION_ANIM_MS);
}

function setSectionContentImmediate(cnt, open) {
  if (!cnt) return;
  clearSectionTimer(cnt);
  if (open) {
    cnt.style.display = "block";
    cnt.classList.add("is-open");
    cnt.classList.remove("is-closing");
  } else {
    cnt.style.display = "none";
    cnt.classList.remove("is-open", "is-closing");
  }
}

function focusSectionIntoView(hdr, cnt) {
  if (!hdr || !cnt) return;
  const scroller = hdr.closest(".modal-content") || document.scrollingElement || document.documentElement;
  if (!scroller) {
    try {
      hdr.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    } catch (e) {
      hdr.scrollIntoView();
    }
    return;
  }

  const padding = 12;
  const scrollerRect = scroller.getBoundingClientRect();
  const headerRect = hdr.getBoundingClientRect();
  const targetTop = scroller.scrollTop + (headerRect.top - scrollerRect.top) - padding;
  const nextTop = Math.max(0, targetTop);
  if (Math.abs(nextTop - scroller.scrollTop) < 1) return;
  try {
    if (typeof scroller.scrollTo === "function") {
      scroller.scrollTo({ top: nextTop, behavior: "smooth" });
      setTimeout(() => {
        if (Math.abs(scroller.scrollTop - nextTop) > 1) {
          scroller.scrollTop = nextTop;
        }
      }, 40);
      return;
    }
  } catch (e) {
    // Fallback for browsers that don't accept scroll options.
  }
  scroller.scrollTop = nextTop;
}

function scheduleSectionFocus(hdr, cnt) {
  if (!hdr || !cnt) return;
  clearSectionTimer(cnt);
  const focusNow = () => {
    if (cnt.style.display === "none") return;
    focusSectionIntoView(hdr, cnt);
  };
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      focusNow();
      cnt.__focusTimer = setTimeout(() => {
        if (cnt.classList.contains("is-open") && cnt.style.display !== "none") {
          focusSectionIntoView(hdr, cnt);
        }
        cnt.__focusTimer = null;
      }, SECTION_ANIM_MS + 40);
    });
  });
}

function toggleSection(id) {
  const hdr = document.getElementById(id + "Header");
  const cnt = document.getElementById(id + "Content");
  if (!hdr || !cnt) return;
  const isCollapsedNow = hdr.classList.toggle("collapsed");
  if (isCollapsedNow) {
    closeSectionContent(cnt);
  } else {
    openSectionContent(cnt);
    scheduleSectionFocus(hdr, cnt);
  }
  if (!isCollapsedNow && id === "shareLinks") {
    loadShareLinksSection();
    cnt.dataset.loaded = "1";
  }
}

function normalizeAdminSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function wireAdminPanelSearch(sectionIds) {
  const input = document.getElementById("adminSettingsSearch");
  const emptyState = document.getElementById("adminSettingsSearchEmpty");
  const wrap = document.getElementById("adminSettingsSearchWrap");
  const toggleBtn = document.getElementById("adminSearchToggle");
  const clearBtn = document.getElementById("adminSearchClear");
  if (!input || !Array.isArray(sectionIds)) return;

  const ids = sectionIds.filter(Boolean);

  const setOpen = (open, opts = {}) => {
    if (!wrap || !toggleBtn) return;
    wrap.classList.toggle("is-collapsed", !open);
    toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open && opts.focus) {
      input.focus();
    }
  };

  const updateToggleState = () => {
    const hasQuery = !!normalizeAdminSearchText(input.value);
    if (toggleBtn) {
      toggleBtn.classList.toggle("is-active", hasQuery);
    }
    if (clearBtn) {
      clearBtn.hidden = !hasQuery;
      clearBtn.disabled = !hasQuery;
    }
  };

  const restoreState = () => {
    ids.forEach(id => {
      const hdr = document.getElementById(id + "Header");
      const cnt = document.getElementById(id + "Content");
      if (!hdr || !cnt) return;
      const saved = hdr.dataset.prevCollapsed;
      hdr.style.display = "";
      cnt.style.display = "";
      if (saved !== undefined) {
        const wasCollapsed = saved === "1";
        hdr.classList.toggle("collapsed", wasCollapsed);
        setSectionContentImmediate(cnt, !wasCollapsed);
        delete hdr.dataset.prevCollapsed;
      }
    });
    if (emptyState) emptyState.style.display = "none";
  };

  const applyFilter = () => {
    const query = normalizeAdminSearchText(input.value);
    if (!query) {
      restoreState();
      updateToggleState();
      return;
    }

    let matches = 0;
    ids.forEach(id => {
      const hdr = document.getElementById(id + "Header");
      const cnt = document.getElementById(id + "Content");
      if (!hdr || !cnt) return;
      if (hdr.dataset.prevCollapsed === undefined) {
        hdr.dataset.prevCollapsed = hdr.classList.contains("collapsed") ? "1" : "0";
      }

      const haystack = normalizeAdminSearchText(hdr.textContent + " " + cnt.textContent);
      const match = haystack.includes(query);
      hdr.style.display = match ? "" : "none";
      setSectionContentImmediate(cnt, match);
      if (match) {
        hdr.classList.remove("collapsed");
        matches += 1;
        if (id === "shareLinks" && !cnt.dataset.loaded) {
          loadShareLinksSection();
          cnt.dataset.loaded = "1";
        }
      }
    });

    if (emptyState) emptyState.style.display = matches ? "none" : "block";
    updateToggleState();
  };

  const clearSearch = (opts = {}) => {
    input.value = "";
    applyFilter();
    if (opts.collapse) {
      setOpen(false);
    }
    if (opts.focus) {
      input.focus();
    }
  };

  if (clearBtn && !clearBtn.__wired) {
    clearBtn.__wired = true;
    clearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      clearSearch({ focus: true });
    });
  }

  if (toggleBtn && wrap && !toggleBtn.__wired) {
    toggleBtn.__wired = true;
    toggleBtn.addEventListener("click", () => {
      const isCollapsed = wrap.classList.contains("is-collapsed");
      if (isCollapsed) {
        setOpen(true, { focus: true });
        return;
      }
      const hasQuery = !!normalizeAdminSearchText(input.value);
      if (hasQuery) {
        clearSearch({ collapse: true });
        return;
      }
      setOpen(false);
    });
  }

  input.addEventListener("input", applyFilter);

  const initialQuery = normalizeAdminSearchText(input.value);
  if (initialQuery) {
    setOpen(true);
    applyFilter();
  } else {
    setOpen(false);
    updateToggleState();
  }
}

export function initProBundleInstaller(options = {}) {
  try {
    const fileInput = document.getElementById('proBundleFile');
    const btn = document.getElementById('btnInstallProBundle');
    const dlBtn = document.getElementById('btnDownloadProBundle');
    const statusEl = document.getElementById('proBundleStatus');
    const updatesExpired = !!options.updatesExpired;
    const updatesUntilLabel = options.updatesUntil ? String(options.updatesUntil) : '';

    if (!fileInput || !btn || !statusEl) return;

    // Allow names like: FileRisePro_v1.0.0.zip or FileRisePro-1.0.0.zip
    const PRO_ZIP_NAME_RE = /^FileRisePro[_-]v?[0-9]+\.[0-9]+\.[0-9]+\.zip$/i;

    btn.addEventListener('click', async () => {
      const file = fileInput.files && fileInput.files[0];

      if (!file) {
        statusEl.textContent = 'Choose a FileRise Pro .zip bundle first.';
        statusEl.className = 'small text-danger';
        return;
      }

      const name = file.name || '';
      if (!PRO_ZIP_NAME_RE.test(name)) {
        statusEl.textContent = 'Bundle must be named like "FileRisePro_v1.0.0.zip".';
        statusEl.className = 'small text-danger';
        return;
      }

      if (updatesExpired) {
        const when = updatesUntilLabel ? ` on ${updatesUntilLabel}` : '';
        const ok = await showCustomConfirmModal(
          `Updates expired${when}. Installing a newer Pro bundle will deactivate Pro. Continue only if this bundle is eligible for your license.`
        );
        if (!ok) {
          return;
        }
      }

      const formData = new FormData();
      formData.append('bundle', file);

      statusEl.textContent = 'Uploading and installing Pro bundle...';
      statusEl.className = 'small text-muted';
      const progress = startProBundleProgress({
        action: 'Installing Pro',
        title: 'Installing FileRise Pro bundle'
      });

      try {
        const resp = await fetch('/api/admin/installProBundle.php', {
          method: 'POST',
          headers: {
            'X-CSRF-Token': window.csrfToken || ''
          },
          body: formData
        });

        let data = null;
        try {
          data = await resp.json();
        } catch (_) {
          // ignore JSON parse errors; handled below
        }

        if (!resp.ok || !data || !data.success) {
          const msg = data && data.error
            ? data.error
            : `HTTP ${resp.status}`;
          statusEl.textContent = 'Install failed: ' + msg;
          statusEl.className = 'small text-danger';
          finishProBundleProgress(progress, false, msg);
          return;
        }

        // --- NEW: ask the server what version is now active via getConfig.php ---
        let finalVersion = '';
        try {
          const cfgRes = await fetch('/api/admin/getConfig.php?ts=' + Date.now(), {
            credentials: 'include',
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-store' }
          });
          const cfg = await safeJson(cfgRes).catch(() => null);
          const cfgVersion = cfg && cfg.pro && cfg.pro.version;
          if (cfgVersion) {
            finalVersion = String(cfgVersion);
          }
        } catch (e) {
          // If this fails, just fall back to whatever installProBundle gave us.
          console.warn('Failed to refresh config after Pro bundle install', e);
        }

        if (!finalVersion && data.proVersion) {
          finalVersion = String(data.proVersion);
        }

        const versionText = finalVersion ? ` (version ${finalVersion})` : '';
        statusEl.textContent = 'Pro bundle installed' + versionText + '. Reload the page to apply changes.';
        statusEl.className = 'small text-success';
        finishProBundleProgress(progress, true);

        // Clear file input so repeat installs feel "fresh"
        try { fileInput.value = ''; } catch (_) { }

        // Keep existing behavior: refresh any admin config in the header, etc.
        if (typeof loadAdminConfigFunc === 'function') {
          loadAdminConfigFunc();
        }
        setTimeout(() => {
          window.location.reload();
        }, 800);
      } catch (e) {
        const errMsg = e && e.message ? e.message : String(e);
        statusEl.textContent = 'Install failed: ' + errMsg;
        statusEl.className = 'small text-danger';
        finishProBundleProgress(progress, false, errMsg);
      }
    });

    if (dlBtn && !dlBtn.__wired) {
      dlBtn.__wired = true;
      dlBtn.addEventListener('click', async () => {
        if (updatesExpired) {
          const when = updatesUntilLabel ? ` on ${updatesUntilLabel}` : '';
          statusEl.textContent = `Updates expired${when}. Renew to download newer Pro bundles.`;
          statusEl.className = 'small text-warning';
          return;
        }
        const ok = await showCustomConfirmModal(
          "Download and install the latest Pro bundle from filerise.net? This will overwrite the current Pro files."
        );
        if (!ok) return;

        dlBtn.disabled = true;
        statusEl.textContent = 'Downloading and installing latest Pro bundle...';
        statusEl.className = 'small text-muted';
        const progress = startProBundleProgress({
          action: 'Updating Pro',
          title: 'Downloading and installing FileRise Pro bundle'
        });

        try {
          const resp = await fetch('/api/admin/downloadProBundle.php', {
            method: 'POST',
            headers: {
              'X-CSRF-Token': window.csrfToken || ''
            },
            credentials: 'include'
          });

          let data = null;
          try {
            data = await resp.json();
          } catch (_) {
            data = null;
          }

          if (!resp.ok || !data || !data.success) {
            const msg = data && (data.error || data.message)
              ? (data.error || data.message)
              : `HTTP ${resp.status}`;
            statusEl.textContent = 'Download/install failed: ' + msg;
            statusEl.className = 'small text-danger';
            finishProBundleProgress(progress, false, msg);
            return;
          }

          const finalVersion = data.proVersion ? String(data.proVersion) : '';
          const versionText = finalVersion ? ` (version ${finalVersion})` : '';
          statusEl.textContent = 'Pro bundle installed' + versionText + '. Reloading...';
          statusEl.className = 'small text-success';
          finishProBundleProgress(progress, true);

          if (typeof loadAdminConfigFunc === 'function') {
            loadAdminConfigFunc();
          }
          setTimeout(() => {
          window.location.reload();
        }, 800);
      } catch (e) {
        const errMsg = e && e.message ? e.message : String(e);
        statusEl.textContent = 'Download/install failed: ' + errMsg;
        statusEl.className = 'small text-danger';
        finishProBundleProgress(progress, false, errMsg);
      } finally {
        dlBtn.disabled = false;
      }
    });
    }
  } catch (e) {
    console.warn('Failed to init Pro bundle installer', e);
  }
}

let __userFlagsCacheHub = null;
let __userMetaCache = {}; // username -> { isAdmin }

async function getUserFlagsCacheForHub() {
  if (!__userFlagsCacheHub) {
    __userFlagsCacheHub = await fetchAllUserFlags();
  }
  return __userFlagsCacheHub;
}

function updateUserMetaCache(list) {
  __userMetaCache = {};
  (list || []).forEach(u => {
    if (!u || !u.username) return;
    __userMetaCache[u.username] = {
      isAdmin: isAdminUser(u)
    };
  });
}

async function renderUserHubFlagsForSelected(modal) {
  const flagsHost = modal.querySelector('#adminUserHubFlagsRow');
  const selectEl = modal.querySelector('#adminUserHubSelect');
  if (!flagsHost || !selectEl) return;

  const username = (selectEl.value || "").trim();
  if (!username) {
    flagsHost.innerHTML = `
      <div class="small text-muted">
        ${tf("select_user_for_flags", "Select a user above to view account-level switches.")}
      </div>
    `;
    return;
  }

  const flagsCache = await getUserFlagsCacheForHub();
  const flags = flagsCache[username] || {};
  const meta = __userMetaCache[username] || {};
  const isAdmin = !!meta.isAdmin;

  const disabledAttr = isAdmin ? 'disabled data-admin="1" title="Admin: full access"' : '';
  const adminNote = isAdmin
    ? `<span class="muted" style="margin-left:4px;">(${tf("admin_full_access", "Admin: full access")})</span>`
    : '';

  flagsHost.innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm mb-0" style="width:100%;">
        <thead>
          <tr>
            <th style="width:24%;">${t("user")}</th>
            <th class="text-center">${t("read_only")}</th>
            <th class="text-center">${t("disable_upload")}</th>
            <th class="text-center">${t("can_share")}</th>
            <th class="text-center">${t("bypass_ownership")}</th>
          </tr>
        </thead>
        <tbody>
          <tr data-username="${escapeHTML(username)}">
            <td><strong>${escapeHTML(username)}</strong>${adminNote}</td>
            <td class="text-center">
              <div class="form-check fr-toggle d-inline-block">
                <input type="checkbox"
                       class="form-check-input fr-toggle-input"
                       id="hubFlagReadOnly"
                       data-flag="readOnly"
                       ${flags.readOnly ? "checked" : ""}
                       ${disabledAttr}>
                <label class="form-check-label" for="hubFlagReadOnly"></label>
              </div>
            </td>
            <td class="text-center">
              <div class="form-check fr-toggle d-inline-block">
                <input type="checkbox"
                       class="form-check-input fr-toggle-input"
                       id="hubFlagDisableUpload"
                       data-flag="disableUpload"
                       ${flags.disableUpload ? "checked" : ""}
                       ${disabledAttr}>
                <label class="form-check-label" for="hubFlagDisableUpload"></label>
              </div>
            </td>
            <td class="text-center">
              <div class="form-check fr-toggle d-inline-block">
                <input type="checkbox"
                       class="form-check-input fr-toggle-input"
                       id="hubFlagCanShare"
                       data-flag="canShare"
                       ${flags.canShare ? "checked" : ""}
                       ${disabledAttr}>
                <label class="form-check-label" for="hubFlagCanShare"></label>
              </div>
            </td>
            <td class="text-center">
              <div class="form-check fr-toggle d-inline-block">
                <input type="checkbox"
                       class="form-check-input fr-toggle-input"
                       id="hubFlagBypassOwnership"
                       data-flag="bypassOwnership"
                       ${flags.bypassOwnership ? "checked" : ""}
                       ${disabledAttr}>
                <label class="form-check-label" for="hubFlagBypassOwnership"></label>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <small class="text-muted d-block mt-1">
      ${isAdmin
      ? tf("admin_flags_info", "Admins already have full access. These switches are disabled.")
      : tf("user_flags_inline_help", "Changes here are saved immediately for this user.")}
    </small>
  `;

  // Admin row is read-only
  if (isAdmin) return;

  const row = flagsHost.querySelector('tr[data-username]');
  if (!row) return;
  const checkboxes = row.querySelectorAll('input[type="checkbox"][data-flag]');

  const getFlagsFromRow = () => {
    const get = (k) => {
      const el = row.querySelector(`input[data-flag="${k}"]`);
      return !!(el && el.checked);
    };
    return {
      username,
      readOnly: get("readOnly"),
      disableUpload: get("disableUpload"),
      canShare: get("canShare"),
      bypassOwnership: get("bypassOwnership")
    };
  };

  const saveFlags = async () => {
    const permissions = [getFlagsFromRow()];
    try {
      const res = await sendRequest(
        "/api/updateUserPermissions.php",
        "PUT",
        { permissions },
        { "X-CSRF-Token": window.csrfToken }
      );

      if (!res || res.success === false) {
        const msg = (res && (res.error || res.message)) || tf("error_updating_permissions", "Error updating permissions");
        showToast(msg, "error");
        return;
      }

      // keep local cache in sync
      const flagsCache = await getUserFlagsCacheForHub();
      flagsCache[username] = permissions[0];
      showToast(tf("user_permissions_updated_successfully", "User permissions updated successfully"));
    } catch (err) {
      console.error("save inline flags error", err);
      showToast(tf("error_updating_permissions", "Error updating permissions"), "error");
    }
  };

  checkboxes.forEach(cb => {
    cb.addEventListener("change", () => {
      saveFlags();
    });
  });
}

export function openAdminUserHubModal() {
  const isDark = document.body.classList.contains("dark-mode");
  const overlayBg = isDark ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.3)";
  const contentBg = isDark ? "var(--fr-surface-dark)" : "#fff";
  const contentFg = isDark ? "#e0e0e0" : "#000";
  const borderCol = isDark ? "var(--fr-border-dark)" : "#ccc";

  // Local helper so we ALWAYS see something (toast or alert)
  const safeToast = (msg, type) => {
    try {
      if (typeof showToast === "function") {
        showToast(msg, 7000);
      } else {
        alert(msg);
      }
    } catch (e) {
      console.error("showToast failed, falling back to alert", e);
      alert(msg);
    }
  };

  let modal = document.getElementById("adminUserHubModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "adminUserHubModal";
    modal.style.cssText = `
      position:fixed; inset:0;
      background:${overlayBg};
      display:flex; align-items:center; justify-content:center;
      z-index:9999;
    `;

    modal.innerHTML = `
      <div class="modal-content"
           style="
             background:${contentBg};
             color:${contentFg};
             padding:16px 18px;
             max-width:980px;
             width:95%;
             position:relative;
             border:1px solid ${borderCol};
             max-height:90vh;
             overflow:auto;
           ">
        <span id="closeAdminUserHub"
              class="editor-close-btn"
              style="top:8px; right:10px;">&times;</span>

        <h3 style="margin-top:0;">
          ${tf("manage_users", "Manage users")}
        </h3>
        <p class="muted" style="margin-top:-4px; margin-bottom:10px; font-size:0.9rem;">
          ${tf(
      "manage_users_help",
      "Select a user from the list to change their password, delete them, or update account-level flags. Use Add User to create a brand new account."
    )}
        </p>

        <!-- Top row: user select + inline actions -->
        <div class="d-flex flex-wrap align-items-center"
             style="gap:8px; margin-bottom:12px; position:relative;">
          <label for="adminUserHubSelect" style="margin:0; font-weight:500;">
            ${t("username")}
          </label>

          <select id="adminUserHubSelect"
                  class="form-control"
                  style="min-width:220px; max-width:260px;"></select>

          <!-- Add user button + dropdown card anchored right under it -->
          <div id="adminUserHubAddWrapper"
               style="position:relative; display:inline-block;">
            <button type="button"
                    id="adminUserHubAddBtn"
                    class="btn btn-success btn-sm">
              <i class="material-icons"
                 style="font-size:16px; vertical-align:middle;">person_add</i>
              <span style="vertical-align:middle; margin-left:2px;">
                ${t("add_user")}
              </span>
            </button>

            <div class="card"
                 id="adminUserHubAddCard"
                 style="
                   position:absolute;
                   top:110%;
                   left:0;
                   min-width:260px;
                   max-width:320px;
                   padding:10px;
                   border-radius:8px;
                   display:none;
                   z-index:3700;
                   box-shadow:0 4px 10px rgba(0,0,0,0.25);
                 ">
              <h5 style="font-size:0.95rem; margin-bottom:8px;">
                ${tf("create_new_user_title", "Create New User")}
              </h5>
              <form id="adminUserHubAddForm">
                <div class="form-group mb-1">
                  <label for="adminUserHubNewUsername" style="margin-bottom:2px;">
                    ${t("username")}
                  </label>
                  <input type="text"
                         id="adminUserHubNewUsername"
                         name="username"
                         class="form-control"
                         autocomplete="off" />
                </div>

                <div class="form-group mb-1">
                  <label for="adminUserHubAddPassword" style="margin-bottom:2px;">
                    ${t("password")}
                  </label>
                  <input type="password"
                         id="adminUserHubAddPassword"
                         name="password"
                         class="form-control" />
                </div>

                <div class="form-group mb-2">
                  <input type="checkbox"
                         id="adminUserHubIsAdmin"
                         name="is_admin" />
                  <label for="adminUserHubIsAdmin" style="margin-left:4px;">
                    ${t("grant_admin")}
                  </label>
                </div>

                <button type="submit"
                        class="btn btn-primary btn-sm">
                  ${t("save_user")}
                </button>
              </form>
              <small class="text-muted d-block"
                     style="margin-top:4px; font-size:0.8rem;">
                ${tf(
      "create_user_help",
      "New users are created immediately and appear in the dropdown at the top."
    )}
              </small>
            </div>
          </div>

          <button type="button"
                  id="adminUserHubDeleteBtn"
                  class="btn btn-danger btn-sm">
            <i class="material-icons"
               style="font-size:16px; vertical-align:middle;">person_remove</i>
            <span style="vertical-align:middle; margin-left:2px;">
              ${t("remove_user")}
            </span>
          </button>

          <button type="button"
                  id="adminUserHubRefresh"
                  class="btn btn-sm btn-outline-secondary ms-auto">
            ${tf("refresh", "Refresh")}
          </button>
        </div>

        <small class="text-muted d-block"
               style="font-size:0.8rem; margin-bottom:8px;">
          ${tf(
      "user_actions_help_inline",
      "Delete, change password, and flags apply to the selected user in the dropdown above."
    )}
        </small>

        <!-- Layout -->
        <div id="adminUserHubLayout">
          <!-- Change password (selected user) -->
          <div class="card" style="padding:10px; border-radius:8px; margin-top:4px;">
            <h5 style="font-size:0.95rem; margin-bottom:8px;">
              ${tf("change_user_password", "Change user password")}
            </h5>

            <div class="form-group mb-1">
              <input type="password"
                     id="adminUserHubNewPassword"
                     class="form-control"
                     data-i18n-placeholder="new_password"
                     placeholder="${t("new_password") || "New Password"}" />
            </div>
            <div class="form-group mb-2">
              <input type="password"
                     id="adminUserHubConfirmPassword"
                     class="form-control"
                     data-i18n-placeholder="confirm_new_password"
                     placeholder="${t("confirm_new_password") || "Confirm New Password"}" />
            </div>
            <button type="button"
                    id="adminUserHubSavePassword"
                    class="btn btn-primary btn-sm">
              ${t("save")}
            </button>
            <small class="text-muted d-block"
                   style="margin-top:4px; font-size:0.8rem;">
              ${tf(
      "change_user_password_help",
      "Resets the selected user’s password. Does not require their old password (admin-only)."
    )}
            </small>
          </div>

          <!-- User permissions / flags -->
          <div class="card" style="padding:10px; border-radius:8px; margin-top:10px;">
            <h5 style="font-size:0.95rem; margin-bottom:4px;">
              ${tf("user_permissions", "User Permissions")}
            </h5>
            <p class="muted"
               style="margin-top:-2px; margin-bottom:6px; font-size:0.85rem;">
              ${tf(
      "user_flags_inline_help_long",
      "Account-level switches (read-only, disable upload, can share, bypass ownership) for the selected user. For per-folder ACLs, use Folder Access."
    )}
            </p>
            <div id="adminUserHubFlagsRow"></div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector("#closeAdminUserHub");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        modal.style.display = "none";
      });
    }

    // ESC closes modal
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.style.display === "flex") {
        modal.style.display = "none";
      }
    });

    const selectEl = modal.querySelector("#adminUserHubSelect");
    const refreshBtn = modal.querySelector("#adminUserHubRefresh");
    const addForm = modal.querySelector("#adminUserHubAddForm");
    const addBtn = modal.querySelector("#adminUserHubAddBtn");
    const addCard = modal.querySelector("#adminUserHubAddCard");
    const delBtn = modal.querySelector("#adminUserHubDeleteBtn");
    const pwBtn = modal.querySelector("#adminUserHubSavePassword");

    const newUserInput = modal.querySelector("#adminUserHubNewUsername");
    const newPassInput = modal.querySelector("#adminUserHubAddPassword");
    const newAdminInput = modal.querySelector("#adminUserHubIsAdmin");

    const resetNewPwInput = modal.querySelector("#adminUserHubNewPassword");
    const resetConfPwInput = modal.querySelector("#adminUserHubConfirmPassword");

    const getSelectedUser = () => {
      return (selectEl && selectEl.value) ? selectEl.value.trim() : "";
    };

    if (refreshBtn && selectEl) {
      refreshBtn.addEventListener("click", async () => {
        await populateAdminUserHubSelect(selectEl, updateUserMetaCache);
        await renderUserHubFlagsForSelected(modal);
      });
    }

    // "Add user" button toggles the dropdown card under the button
    if (addBtn && addCard && newUserInput) {
      addCard.style.display = "none";

      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isHidden =
          addCard.style.display === "none" || addCard.style.display === "";
        addCard.style.display = isHidden ? "block" : "none";
        if (isHidden) {
          newUserInput.focus();
        }
      });

      // Clicking outside of the addCard closes it
      document.addEventListener("click", (e) => {
        if (!modal.contains(e.target)) return;
        if (
          addCard.style.display === "block" &&
          !addCard.contains(e.target) &&
          !addBtn.contains(e.target)
        ) {
          addCard.style.display = "none";
        }
      });
    }

    // Inline "Add user" form WITH backend error -> toast (handles 422)
    if (addForm && newUserInput && newPassInput && newAdminInput && selectEl) {
      addForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const username = newUserInput.value.trim();
        const password = newPassInput.value.trim();
        const isAdmin = !!newAdminInput.checked;

        if (!username || !password) {
          safeToast("Username and password are required!", "error");
          return;
        }

        try {
          const resp = await fetch("/api/addUser.php", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": window.csrfToken || ""
            },
            body: JSON.stringify({ username, password, isAdmin })
          });

          let data = null;
          try {
            data = await resp.json();
          } catch (e) {
            // non-JSON or empty; leave as null
          }

          const isError =
            !resp.ok ||
            !data ||
            (data.ok === false) ||
            (data.success === false);

          if (isError) {
            const msg =
              (data && (data.error || data.message)) ||
              (resp.status === 422
                ? "Could not create user. Please check username/password."
                : "Error: Could not add user");

            console.error("Add user failed –", resp.status, data);
            safeToast(msg, "error");
            return;
          }

          // success
          safeToast("User added successfully!");
          newUserInput.value = "";
          newPassInput.value = "";
          newAdminInput.checked = false;

          // hide dropdown after successful create
          if (addCard) {
            addCard.style.display = "none";
          }

          await populateAdminUserHubSelect(selectEl, updateUserMetaCache);
          selectEl.value = username;

          if (typeof __userFlagsCacheHub !== "undefined") {
            __userFlagsCacheHub = null;
          }
          await renderUserHubFlagsForSelected(modal);
        } catch (err) {
          console.error("Add user error", err);
          const msg =
            err && err.message
              ? err.message
              : "Network error while creating user.";
          safeToast(msg, "error");
        }
      });
    }

    // Delete user
    if (delBtn && selectEl) {
      delBtn.addEventListener("click", async () => {
        const username = getSelectedUser();
        if (!username) {
          safeToast("Please select a user first.", "error");
          return;
        }

        const current = (localStorage.getItem("username") || "").trim();
        if (current && current === username) {
          safeToast(
            "You cannot delete the account you are currently logged in as.",
            "error"
          );
          return;
        }

        const ok = await showCustomConfirmModal(
          `Are you sure you want to delete user "${username}"?`
        );
        if (!ok) return;

        try {
          const res = await sendRequest(
            "/api/removeUser.php",
            "POST",
            { username },
            { "X-CSRF-Token": window.csrfToken || "" }
          );

          if (!res || res.success === false) {
            const msg =
              (res && (res.error || res.message)) ||
              "Error: Could not remove user";
            safeToast(msg, "error");
            return;
          }

          safeToast("User removed successfully!");
          if (typeof __userFlagsCacheHub !== "undefined") {
            __userFlagsCacheHub = null;
          }
          await populateAdminUserHubSelect(selectEl, updateUserMetaCache);
          await renderUserHubFlagsForSelected(modal);
        } catch (err) {
          console.error(err);
          const msg =
            err && err.message
              ? err.message
              : "Error: Could not remove user";
          safeToast(msg, "error");
        }
      });
    }

    // Reset password for selected user (admin)
    if (pwBtn && resetNewPwInput && resetConfPwInput && selectEl) {
      pwBtn.addEventListener("click", async () => {
        if (window.__FR_DEMO__) {
          safeToast("Password changes are disabled on the public demo.");
          return;
        }

        const username = getSelectedUser();
        if (!username) {
          safeToast("Please select a user first.", "error");
          return;
        }

        const newPw = resetNewPwInput.value.trim();
        const conf = resetConfPwInput.value.trim();

        if (!newPw || !conf) {
          safeToast("Please fill in both password fields.", "error");
          return;
        }
        if (newPw !== conf) {
          safeToast("New passwords do not match.", "error");
          return;
        }

        try {
          const res = await sendRequest(
            "/api/admin/changeUserPassword.php",
            "POST",
            { username, newPassword: newPw },
            { "X-CSRF-Token": window.csrfToken || "" }
          );

          // Handle both legacy {success:false} and new {ok:false,error:...}
          if (!res || res.success === false || res.ok === false) {
            const msg =
              (res && (res.error || res.message)) ||
              "Error changing password. Password must be at least 6 characters.";
            safeToast(msg, "error");
            return;
          }

          safeToast("Password updated successfully.");
          resetNewPwInput.value = "";
          resetConfPwInput.value = "";
        } catch (err) {
          // If sendRequest throws on non-2xx, e.g. 422, surface backend JSON error
          console.error("Change password failed –", err.status, err.data || err);

          const msg =
            (err &&
              err.data &&
              (err.data.error || err.data.message)) ||
            (err && err.message) ||
            "Error changing password. Password must be at least 6 characters.";

          safeToast(msg, "error");
        }
      });
    }

    // When user selection changes, refresh inline flags row
    if (selectEl) {
      selectEl.addEventListener("change", () => {
        renderUserHubFlagsForSelected(modal);
      });
    }

    // Expose for later calls to re-populate
    modal.__populate = async () => {
      const sel = modal.querySelector("#adminUserHubSelect");
      if (sel) {
        await populateAdminUserHubSelect(sel, updateUserMetaCache);
        if (typeof __userFlagsCacheHub !== "undefined") {
          __userFlagsCacheHub = null;
        }
        await renderUserHubFlagsForSelected(modal);
      }
    };
  } else {
    // Update colors/theme if already exists
    modal.style.background = overlayBg;
    const content = modal.querySelector(".modal-content");
    if (content) {
      content.style.background = contentBg;
      content.style.color = contentFg;
      content.style.border = `1px solid ${borderCol}`;
    }
  }

  modal.style.display = "flex";
  if (modal.__populate) {
    modal.__populate();
  }
}

function loadShareLinksSection() {
  const container =
    document.getElementById("shareLinksList") ||
    document.getElementById("shareLinksContent");
  if (!container) return;

  container.textContent = t("loading") + "...";

  function fetchMeta(fileName) {
    return fetch(`/api/admin/readMetadata.php?file=${encodeURIComponent(fileName)}`, {
      credentials: "include"
    })
      .then(resp => (resp.ok ? resp.json() : {}))
      .catch(() => ({}));
  }

  Promise.all([
    fetchMeta("share_folder_links.json"),
    fetchMeta("share_links.json")
  ])
    .then(([folders, files]) => {
      const esc = (val) => escapeHTML(val == null ? "" : String(val));
      const hasAny = Object.keys(folders).length || Object.keys(files).length;
      if (!hasAny) {
        container.innerHTML = `<p>${t("no_shared_links_available")}</p>`;
        return;
      }

      let html = `<h5>${t("folder_shares")}</h5><ul>`;
      Object.entries(folders).forEach(([token, o]) => {
        const lock = o.password ? "🔒 " : "";
        const tokenValue = o.token || token;
        const sourceLabel = o.sourceName || o.sourceId || "";
        const sourceHtml = sourceLabel && sourceLabel.toLowerCase() !== "local"
          ? ` <small class="text-muted">[${esc(sourceLabel)}]</small>`
          : "";
        const folderLabel = esc(o.folder || "root");
        html += `
          <li>
            ${lock}<strong>${folderLabel}</strong>${sourceHtml}
            <small>(${new Date(o.expires * 1000).toLocaleString()})</small>
            <button type="button"
                    data-key="${esc(tokenValue)}"
                    data-source-id="${esc(o.sourceId || "")}"
                    data-type="folder"
                    class="btn btn-sm btn-link delete-share">🗑️</button>
          </li>`;
      });

      html += `</ul><h5 style="margin-top:1em;">${t("file_shares")}</h5><ul>`;
      Object.entries(files).forEach(([token, o]) => {
        const lock = o.password ? "🔒 " : "";
        const tokenValue = o.token || token;
        const sourceLabel = o.sourceName || o.sourceId || "";
        const sourceHtml = sourceLabel && sourceLabel.toLowerCase() !== "local"
          ? ` <small class="text-muted">[${esc(sourceLabel)}]</small>`
          : "";
        const folderLabel = esc(o.folder || "root");
        const fileLabel = esc(o.file || "");
        const pathLabel = fileLabel ? `${folderLabel}/${fileLabel}` : folderLabel;
        html += `
          <li>
            ${lock}<strong>${pathLabel}</strong>${sourceHtml}
            <small>(${new Date(o.expires * 1000).toLocaleString()})</small>
            <button type="button"
                    data-key="${esc(tokenValue)}"
                    data-source-id="${esc(o.sourceId || "")}"
                    data-type="file"
                    class="btn btn-sm btn-link delete-share">🗑️</button>
          </li>`;
      });
      html += `</ul>`;

      container.innerHTML = html;

      container.querySelectorAll(".delete-share").forEach(btn => {
        btn.addEventListener("click", evt => {
          evt.preventDefault();
          const token = btn.dataset.key;
          const sourceId = btn.dataset.sourceId || "";
          const isFolder = btn.dataset.type === "folder";
          const endpoint = isFolder
            ? "/api/folder/deleteShareFolderLink.php"
            : "/api/file/deleteShareLink.php";

          const csrfToken =
            (document.querySelector('meta[name="csrf-token"]')?.content || window.csrfToken || "");

          const body = new URLSearchParams({ token });
          if (sourceId) {
            body.set("sourceId", sourceId);
          }

          fetch(endpoint, {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "X-CSRF-Token": csrfToken
            },
            body
          })
            .then(res => {
              if (!res.ok) {
                if (res.status === 403) {
                  // Optional: nicer message when CSRF/session is bad
                  showToast(t('admin_share_delete_forbidden'), 'error');
                }
                return Promise.reject(res);
              }
              return res.json();
            })
            .then(json => {
              if (json.success) {
                showToast(t("share_deleted_successfully"));
                loadShareLinksSection();
              } else {
                showToast(t("error_deleting_share") + ": " + (json.error || ""), "error");
              }
            })
            .catch(err => {
              console.error("Delete error:", err);
              showToast(t("error_deleting_share"), "error");
            });
        });
      });
    })
    .catch(err => {
      console.error("loadShareLinksSection error:", err);
      container.textContent = t("error_loading_share_links");
    });
}

export function openAdminPanel() {
  fetch("/api/admin/getConfig.php", { credentials: "include" })
    .then(r => r.json())
    .then(config => {
      const rawHeaderTitle = (typeof config.header_title === 'string') ? config.header_title : '';
      window.headerTitle = rawHeaderTitle;
      window.currentOIDCConfig = window.currentOIDCConfig || {};

      if (config.oidc && typeof config.oidc === 'object') {
        Object.assign(window.currentOIDCConfig, config.oidc);
      }

      if (config.globalOtpauthUrl) {
        window.currentOIDCConfig.globalOtpauthUrl = config.globalOtpauthUrl;
      }

      const dark = document.body.classList.contains("dark-mode");
      const proInfo = config.pro || {};
      const isPro = !!proInfo.active;
      window.__FR_IS_PRO = isPro;
      const headerDisplayTitle = resolveHeaderTitle(rawHeaderTitle, isPro);
      const h = document.querySelector(".header-title h1");
      if (h) h.textContent = headerDisplayTitle;
      document.title = headerDisplayTitle;
      const proType = proInfo.type || '';
      const proEmail = proInfo.email || '';
      const proVersion = proInfo.version || 'not installed';
      const proApiLevel = Number(proInfo.apiLevel || 0);
      const proBuildEpoch = Number(proInfo.buildEpoch || 0);
      const proSearchApiOk = isPro && proApiLevel >= PRO_API_LEVELS.search;
      const proAuditApiOk = isPro && proApiLevel >= PRO_API_LEVELS.audit;
      const proSourcesApiOk = isPro && proApiLevel >= PRO_API_LEVELS.sources;
      const proSearchOptOut = !!(config.proSearch && config.proSearch.optOut);
      const proLicense = proInfo.license || '';
      // New: richer license metadata from FR_PRO_INFO / backend
      const proPlan = proInfo.plan || '';            // e.g. "early_supporter_1x", "personal_yearly"
      const proUpdatesUntil = proInfo.updatesUntil || proInfo.expiresAt || '';  // ISO timestamp string or ""
      const proInstanceId = proInfo.instanceId || '';
      const proPrimaryAdmin = Object.prototype.hasOwnProperty.call(proInfo, 'primaryAdmin')
        ? !!proInfo.primaryAdmin
        : true;
      const proMaxMajor = (
        typeof proInfo.maxMajor === 'number'
          ? proInfo.maxMajor
          : (proInfo.maxMajor ? Number(proInfo.maxMajor) : null)
      );
      const proSearchCfg = (config.proSearch && typeof config.proSearch === 'object')
        ? config.proSearch
        : {};
      const updatesExpired = (() => {
        if (proPlan === 'early_supporter_1x' || (!proPlan && isPro)) {
          return false;
        }
        if (!proUpdatesUntil) {
          return false;
        }
        const ts = Date.parse(proUpdatesUntil);
        return Number.isFinite(ts) && ts < Date.now();
      })();
      const proSearchExplicitDisabled = Object.prototype.hasOwnProperty.call(proSearchCfg, 'enabled') && !proSearchCfg.enabled;
      const proSearchOptOutEffective = proSearchOptOut || proSearchExplicitDisabled;
      let proSearchEnabled = proSearchApiOk && !!proSearchCfg.enabled;
      // Auto-enable when Pro API level supports Search Everywhere unless explicitly opted out/disabled or env locked
      if (proSearchApiOk && !proSearchOptOutEffective) {
        proSearchEnabled = true;
      }
      const proSearchDefaultLimit = Math.max(
        1,
        Math.min(200, parseInt(proSearchCfg.defaultLimit || 50, 10) || 50)
      );
      const proSearchLocked = !!proSearchCfg.lockedByEnv;
      const proAuditCfg = (config.proAudit && typeof config.proAudit === 'object')
        ? config.proAudit
        : {};
      const proAuditAvailable = !!proAuditCfg.available && proAuditApiOk;
      const proAuditEnabled = (isPro && proAuditAvailable) ? !!proAuditCfg.enabled : false;
      const proAuditLevelRaw = (typeof proAuditCfg.level === 'string') ? proAuditCfg.level : 'verbose';
      const proAuditLevel = (proAuditLevelRaw === 'standard' || proAuditLevelRaw === 'verbose')
        ? proAuditLevelRaw
        : 'verbose';
      const proAuditMaxFileMb = Math.max(10, parseInt(proAuditCfg.maxFileMb || 200, 10) || 200);
      const proAuditMaxFiles = Math.max(1, Math.min(10, parseInt(proAuditCfg.maxFiles || 10, 10) || 10));
      const sourcesCfg = (config.storageSources && typeof config.storageSources === 'object')
        ? config.storageSources
        : {};
      const sourcesEnabled = !!sourcesCfg.enabled;
      const showSourcesSection = true;
      const brandingCfg = config.branding || {};
      const brandingCustomLogoUrl = brandingCfg.customLogoUrl || "";
      const brandingHeaderBgLight = brandingCfg.headerBgLight || "";
      const brandingHeaderBgDark = brandingCfg.headerBgDark || "";
      const brandingMetaDescription = brandingCfg.metaDescription || "";
      const brandingFaviconSvg = brandingCfg.faviconSvg || "";
      const brandingFaviconPng = brandingCfg.faviconPng || "";
      const brandingFaviconIco = brandingCfg.faviconIco || "";
      const brandingAppleTouchIcon = brandingCfg.appleTouchIcon || "";
      const brandingMaskIcon = brandingCfg.maskIcon || "";
      const brandingMaskIconColor = brandingCfg.maskIconColor || "";
      const brandingThemeColorLight = brandingCfg.themeColorLight || "";
      const brandingThemeColorDark = brandingCfg.themeColorDark || "";
      const brandingLoginBgLight = brandingCfg.loginBgLight || "";
      const brandingLoginBgDark = brandingCfg.loginBgDark || "";
      const brandingAppBgLight = brandingCfg.appBgLight || "";
      const brandingAppBgDark = brandingCfg.appBgDark || "";
      const brandingLoginTagline = brandingCfg.loginTagline || "";
      const brandingFooterHtml = brandingCfg.footerHtml || "";
      const displayCfg = (config.display && typeof config.display === 'object') ? config.display : {};
      const ffmpegPathCfg = (typeof config.ffmpegPath === 'string') ? config.ffmpegPath : '';
      const ffmpegPathEffective = (typeof config.ffmpegPathEffective === 'string') ? config.ffmpegPathEffective : '';
      const ffmpegPathLockedByEnv = !!config.ffmpegPathLockedByEnv;
      const ffmpegPathValue = ffmpegPathLockedByEnv ? ffmpegPathEffective : ffmpegPathCfg;
      const ffmpegHelpDefault = 'Used for video thumbnail generation. Leave blank to use ffmpeg from PATH.';
      const ffmpegHelpLocked = 'Controlled by container env FR_FFMPEG_PATH. Change it in your Docker/host env.';
      const ignoreRegexCfg = (typeof config.ignoreRegex === 'string') ? config.ignoreRegex : '';
      const ignoreRegexEffective = (typeof config.ignoreRegexEffective === 'string') ? config.ignoreRegexEffective : '';
      const ignoreRegexLockedByEnv = !!config.ignoreRegexLockedByEnv;
      const ignoreRegexValue = ignoreRegexLockedByEnv ? ignoreRegexEffective : ignoreRegexCfg;
      const supportedLanguages = [
        { code: 'en',    labelKey: 'english',             fallback: 'English' },
        { code: 'es',    labelKey: 'spanish',             fallback: 'Español' },
        { code: 'fr',    labelKey: 'french',              fallback: 'Français' },
        { code: 'de',    labelKey: 'german',              fallback: 'Deutsch' },
        { code: 'pl',    labelKey: 'polish',              fallback: 'Polski' },
        { code: 'ru',    labelKey: 'russian',             fallback: 'Русский' },
        { code: 'ja',    labelKey: 'japanese',            fallback: '日本語' },
        { code: 'zh-CN', labelKey: 'chinese_simplified',  fallback: '简体中文' },
      ];
      const defaultLanguage = supportedLanguages.some(lang => lang.code === displayCfg.defaultLanguage)
        ? displayCfg.defaultLanguage
        : 'en';
      const defaultLanguageOptions = supportedLanguages.map(({ code, labelKey, fallback }) => {
        const label = ((typeof t === 'function' ? t(labelKey) : '') || fallback).replace(/\"/g, '&quot;');
        const selected = code === defaultLanguage ? ' selected' : '';
        return `<option value="${code}" data-i18n-key="${labelKey}"${selected}>${label}</option>`;
      }).join('');
      const hoverPreviewMaxImageMb = Math.max(
        1,
        Math.min(50, parseInt(displayCfg.hoverPreviewMaxImageMb || 8, 10) || 8)
      );
      const hoverPreviewMaxVideoMb = Math.max(
        1,
        Math.min(2048, parseInt(displayCfg.hoverPreviewMaxVideoMb || 200, 10) || 200)
      );
      const rawSummaryDepth = parseInt(displayCfg.fileListSummaryDepth, 10);
      const fileListSummaryDepth = Math.max(
        0,
        Math.min(10, Number.isFinite(rawSummaryDepth) ? rawSummaryDepth : 2)
      );
      const bg = dark ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.3)";
      const inner = `
        background:${dark ? "#2c2c2c" : "#fff"};
        color:${dark ? "#e0e0e0" : "#000"};
        padding:20px; max-width:1100px; width:50%;
        position:relative;
        max-height:90vh; overflow:auto;
        border:1px solid ${dark ? "#555" : "#ccc"};
      `;

      let mdl = document.getElementById("adminPanelModal");
      if (!mdl) {
        mdl = document.createElement("div");
        mdl.id = "adminPanelModal";
        mdl.style.cssText = `
          position:fixed; top:0; left:0;
          width:100vw; height:100vh;
          background:${bg};
          display:flex; justify-content:center; align-items:center;
          z-index:3000;
        `;
        const sections = [
          { id: "userManagement", label: tf("users_access", "Users & Access") },
          { id: "headerSettings", label: tf("appearance_ui", "Appearance, UI & Indexing") },
          { id: "loginOptions", label: tf("auth_webdav", "Auth & WebDAV (OIDC/TOTP)") },
          { id: "upload", label: tf("uploads_antivirus", "Uploads & Antivirus") },
          { id: "shareLinks", label: tf("sharing_links", "Sharing & Links") },
          { id: "network", label: tf("network_proxy", "Network & Proxy") },
          { id: "encryption", label: tf("encryption_at_rest", "Encryption at rest") },
          { id: "onlyoffice", label: "ONLYOFFICE" },
          { id: "storage", label: tf("storage_usage", "Storage / Disk Usage") }
        ];
        if (showSourcesSection) {
          const sourcesLabel = !isPro
            ? `<span style="display:inline-flex; align-items:center; gap:6px;">${tf("sources", "Sources")}<span class="btn-pro-pill" style="position:static; display:inline-flex; align-items:center; margin:0;">Pro</span></span>`
            : tf("sources", "Sources");
          sections.push({ id: "sources", label: sourcesLabel });
        }
        sections.push(
          { id: "proFeatures", label: "Pro Features" },
          { id: "pro", label: "FileRise Pro" },
          { id: "sponsor", label: (typeof tf === 'function' ? tf("sponsor_donations", "Thanks / Sponsor / Donations") : "Thanks / Sponsor / Donations") }
        );
        const sectionIds = sections.map(sec => sec.id);
        mdl.innerHTML = `
          <div class="modal-content" style="${inner}">
            <div class="editor-close-btn" id="closeAdminPanel">&times;</div>
            <div class="admin-panel-header">
              <h3>${getAdminTitle(isPro, proVersion, updatesExpired)}</h3>
              <div class="admin-panel-actions">
                <button
                  type="button"
                  id="adminSearchToggle"
                  class="btn btn-sm btn-light admin-search-toggle"
                  title="${tf("settings_search_toggle", "Search settings")}"
                  aria-expanded="false"
                >
                  <i class="material-icons">search</i>
                  <span class="admin-search-toggle-label">${tf("search", "Search")}</span>
                </button>
              </div>
            </div>
            <form id="adminPanelForm">
            <div id="adminSettingsSearchWrap" class="form-group admin-search-wrap is-collapsed">
              <div class="admin-search-input">
                <input
                  type="text"
                  id="adminSettingsSearch"
                  class="form-control"
                  autocomplete="off"
                  placeholder="${tf("settings_search_placeholder", "Search settings...")}"
                />
                <button
                  type="button"
                  id="adminSearchClear"
                  class="admin-search-clear"
                  aria-label="${tf("clear_search", "Clear search")}"
                  title="${tf("clear_search", "Clear search")}"
                  hidden
                >
                  <i class="material-icons" aria-hidden="true">close</i>
                </button>
              </div>
              <small class="text-muted d-block mt-1">
                ${tf("settings_search_help", "Type to filter sections and settings.")}
              </small>
              <div id="adminSettingsSearchEmpty" class="small text-muted" style="display:none; margin-top:6px;">
                ${tf("settings_search_empty", "No matching settings found.")}
              </div>
            </div>
            ${sections.map(sec => `
              <div id="${sec.id}Header" class="section-header collapsed">
                <div class="section-header-inner">
                  ${sec.label} <i class="material-icons">expand_more</i>
                </div>
              </div>
              <div id="${sec.id}Content" class="section-content"></div>
            `).join("")}

              <div class="action-row">
                <button type="button" id="cancelAdminSettings" class="btn btn-secondary">${t("cancel")}</button>
                <button type="button" id="saveAdminSettings"   class="btn btn-primary">${t("save_settings")}</button>
              </div>
            </form>
          </div>
        `;
        document.body.appendChild(mdl);

        document.getElementById("closeAdminPanel").addEventListener("click", closeAdminPanel);
        document.getElementById("cancelAdminSettings").addEventListener("click", closeAdminPanel);
        wireAdminPanelSearch(sectionIds);

        sectionIds.filter(Boolean).forEach(id => {
          const headerEl = document.getElementById(id + "Header");
          if (!headerEl || headerEl.__wired) return;
          headerEl.__wired = true;
          headerEl.addEventListener("click", () => toggleSection(id));
        });

        document.getElementById("userManagementContent").innerHTML = `
  <div class="admin-user-actions d-flex flex-wrap" style="gap:8px; margin-bottom:6px;">
    <!-- Core: Manage users -->
    <button type="button" id="adminOpenUserHub" class="btn btn-primary btn-sm">
      <i class="material-icons">people</i>
      <span>${tf("manage_users", "Manage users")}</span>
    </button>

    <!-- Core: Folder Access (per-folder ACLs) -->
    <button type="button" id="adminOpenFolderAccess" class="btn btn-secondary btn-sm">
      <i class="material-icons">folder_shared</i>
      <span>${tf("folder_access", "Folder Access")}</span>
    </button>

    <!-- Pro: User groups -->
    <div class="btn-pro-wrapper">
      <button
        type="button"
        id="adminOpenUserGroups"
        class="btn btn-sm btn-pro-admin"
        ${!isPro ? "data-pro-locked='1'" : ""}
      >
        <i class="material-icons">groups</i>
        <span>User Groups</span>
      </button>
      ${!isPro ? '<span class="btn-pro-pill">Pro</span>' : ''}
    </div>

    <!-- Pro: Client Portals -->
    <div class="btn-pro-wrapper">
      <button
        type="button"
        id="adminOpenClientPortal"
        class="btn btn-sm btn-pro-admin"
        ${!isPro ? "data-pro-locked='1'" : ""}
        title="Client portals are part of FileRise Pro.">
        <i class="material-icons">cloud_upload</i>
        <span>Client Portals</span>
      </button>
      ${!isPro ? '<span class="btn-pro-pill">Pro</span>' : ''}
    </div>
  </div>

  <small class="text-muted d-block" style="margin-top:4px;">
    Manage users, passwords and account-level flags from “Manage users”.
    Use “Folder Access” for per-folder ACLs. User Groups and Client Portals are available in FileRise Pro.
  </small>
`;

        if (showSourcesSection) {
          initSourcesSection({
            modalEl: mdl,
            sourcesEnabled,
            sourcesCfg,
            isPro,
            proSourcesApiOk
          });
        }

        // Wiring for the 4 buttons
        const userHubBtn = document.getElementById("adminOpenUserHub");
        if (userHubBtn) {
          userHubBtn.addEventListener("click", () => {
            openAdminUserHubModal();
          });
        }

        const folderAccessBtn = document.getElementById("adminOpenFolderAccess");
        if (folderAccessBtn) {
          folderAccessBtn.addEventListener("click", () => {
            openUserPermissionsModal();
          });
        }

        const groupsBtn = document.getElementById("adminOpenUserGroups");
        if (groupsBtn) {
          groupsBtn.addEventListener("click", () => {
            if (!isPro) {
              showToast(t('admin_pro_feature_user_groups'));
              window.open("https://filerise.net", "_blank", "noopener");
              return;
            }
            openUserGroupsModal();
          });
        }

        const clientBtn = document.getElementById("adminOpenClientPortal");
        if (clientBtn) {
          clientBtn.addEventListener("click", () => {
            if (!isPro) {
              showToast(t('admin_pro_feature_portals'));
              window.open("https://filerise.net", "_blank", "noopener");
              return;
            }
            openClientPortalsModal();
          });
        }

        document.getElementById("headerSettingsContent").innerHTML = `
  <div class="form-group">
      <div class="admin-subsection-title" style="margin-top:2px;">
      ${t("header_title_text")}
  </div>
    <input type="text" id="headerTitle" class="form-control" value="${window.headerTitle || ""}" />
  </div>

  <div class="form-group" style="margin-top:16px;">
    <label for="defaultLanguage">
      <div class="admin-subsection-title" style="margin-top:2px;">
        ${tf("default_language", "Default language")}
      </div>
    </label>
    <small class="text-muted d-block mb-1">
      ${tf("default_language_help", "Used when a user has not chosen a language yet.")}
    </small>
    <select id="defaultLanguage" class="form-control">
      ${defaultLanguageOptions}
    </select>
  </div>

    <hr class="admin-divider">

  <!-- Pro: Logo -->
  <div class="form-group" style="margin-top:16px;">
    <label for="brandingCustomLogoUrl">
     <div class="admin-subsection-title" style="margin-top:2px;">
      ${t("header_logo")}
  </div>
      ${!isPro ? '<span class="badge badge-pill badge-warning admin-pro-badge" style="margin-left:6px;">Pro</span>' : ''}
    </label>
    <small class="text-muted d-block mb-1">
      ${isPro
            ? 'Upload a logo image or paste a local path.'
            : 'Requires FileRise Pro to enable custom header branding.'}
    </small>

    <div class="input-group mb-2">
      <input
        type="text"
        id="brandingCustomLogoUrl"
        class="form-control"
        placeholder="/assets/logo.png"
        value="${isPro ? (brandingCustomLogoUrl.replace(/"/g, '&quot;')) : ''}"
        ${!isPro ? 'disabled data-disabled-reason="pro"' : ''}
      />
    </div>

    <div class="input-group">
      <input
        type="file"
        id="brandingLogoFile"
        class="form-control"
        accept="image/*"
        ${!isPro ? 'disabled' : ''}
      />
      <button
        type="button"
        class="btn btn-sm btn-secondary"
        id="brandingUploadBtn"
        ${!isPro ? 'disabled' : ''}>
        Upload logo
      </button>
    </div>
  </div>

    <hr class="admin-divider">

  <!-- Pro: Header colors -->
  <div class="form-group" style="margin-top:16px;">
    <label>
     <div class="admin-subsection-title" style="margin-top:2px;">
      ${t("header_colors")}
  </div>
      ${!isPro ? '<span class="badge badge-pill badge-warning admin-pro-badge" style="margin-left:6px;">Pro</span>' : ''}
    </label>
    <div class="d-flex align-items-center" style="gap: 12px; flex-wrap: wrap;">
      <div>
        <label for="brandingHeaderBgLight" class="d-block" style="font-size: 12px; margin-bottom: 4px;">Light mode</label>
        <input
          type="color"
          id="brandingHeaderBgLight"
          value="${brandingHeaderBgLight || '#2196F3'}"
          ${!isPro ? 'disabled' : ''}
        />
      </div>
      <div>
        <label for="brandingHeaderBgDark" class="d-block" style="font-size: 12px; margin-bottom: 4px;">Dark mode</label>
        <input
          type="color"
          id="brandingHeaderBgDark"
          value="${brandingHeaderBgDark || '#1f1f1f'}"
          ${!isPro ? 'disabled' : ''}
        />
      </div>
    </div>
    <small class="text-muted d-block mt-1">
      ${isPro
            ? 'If left empty, FileRise uses its default blue and dark header colors.'
            : 'Requires FileRise Pro to enable custom color branding.'}
    </small>
  </div>

    <hr class="admin-divider">

  <!-- Pro: Meta description -->
  <div class="form-group" style="margin-top:16px;">
    <label for="brandingMetaDescription">
     <div class="admin-subsection-title" style="margin-top:2px;">
      Meta description
  </div>
      ${!isPro ? '<span class="badge badge-pill badge-warning admin-pro-badge" style="margin-left:6px;">Pro</span>' : ''}
    </label>
    <small class="text-muted d-block mb-1">
      ${isPro
            ? 'Shown in the <meta name="description"> tag on index.html. Recommended 50-160 characters.'
            : 'Requires FileRise Pro to customize the site description.'}
    </small>
    <textarea
      id="brandingMetaDescription"
      class="form-control"
      rows="2"
      placeholder="FileRise is a fast, self-hosted file manager for your team."
      ${!isPro ? 'disabled data-disabled-reason="pro"' : ''}>${isPro ? (brandingMetaDescription || '') : ''}</textarea>
  </div>

    <hr class="admin-divider">

  <!-- Pro: Favicons + theme color -->
  <div class="form-group" style="margin-top:16px;">
    <label>
     <div class="admin-subsection-title" style="margin-top:2px;">
      Favicons & browser theme color
  </div>
      ${!isPro ? '<span class="badge badge-pill badge-warning admin-pro-badge" style="margin-left:6px;">Pro</span>' : ''}
    </label>
    <small class="text-muted d-block mb-2">
      ${isPro
            ? 'Use site-relative paths or full URLs. PNG replaces all PNG favicon sizes. Theme colors tint the browser UI on mobile/PWA. Mask icon color applies to Safari pinned tabs (requires the mask icon SVG).'
            : 'Requires FileRise Pro to customize favicons and theme colors.'}
    </small>
    <div class="form-group">
      <label for="brandingFaviconSvg" class="d-block" style="font-size:12px;">Favicon (SVG)</label>
      <input
        type="text"
        id="brandingFaviconSvg"
        class="form-control"
        placeholder="/assets/logo.svg"
        value="${isPro ? (brandingFaviconSvg.replace(/\"/g, '&quot;')) : ''}"
        ${!isPro ? 'disabled data-disabled-reason="pro"' : ''}
      />
    </div>
    <div class="form-group">
      <label for="brandingFaviconPng" class="d-block" style="font-size:12px;">Favicon (PNG)</label>
      <input
        type="text"
        id="brandingFaviconPng"
        class="form-control"
        placeholder="/assets/logo-32.png"
        value="${isPro ? (brandingFaviconPng.replace(/\"/g, '&quot;')) : ''}"
        ${!isPro ? 'disabled data-disabled-reason="pro"' : ''}
      />
    </div>
    <div class="form-group">
      <label for="brandingFaviconIco" class="d-block" style="font-size:12px;">Favicon (ICO)</label>
      <input
        type="text"
        id="brandingFaviconIco"
        class="form-control"
        placeholder="/assets/favicon.ico"
        value="${isPro ? (brandingFaviconIco.replace(/\"/g, '&quot;')) : ''}"
        ${!isPro ? 'disabled data-disabled-reason="pro"' : ''}
      />
    </div>
    <div class="form-group">
      <label for="brandingAppleTouchIcon" class="d-block" style="font-size:12px;">Apple touch icon</label>
      <input
        type="text"
        id="brandingAppleTouchIcon"
        class="form-control"
        placeholder="/assets/icons/icon-192.png"
        value="${isPro ? (brandingAppleTouchIcon.replace(/\"/g, '&quot;')) : ''}"
        ${!isPro ? 'disabled data-disabled-reason="pro"' : ''}
      />
    </div>
    <div class="form-group">
      <label for="brandingMaskIcon" class="d-block" style="font-size:12px;">Pinned tab mask icon (SVG)</label>
      <input
        type="text"
        id="brandingMaskIcon"
        class="form-control"
        placeholder="/assets/icons/safari-pinned-tab.svg"
        value="${isPro ? (brandingMaskIcon.replace(/\"/g, '&quot;')) : ''}"
        ${!isPro ? 'disabled data-disabled-reason="pro"' : ''}
      />
    </div>
    <div class="d-flex align-items-center" style="gap:12px; flex-wrap:wrap;">
      <div style="min-width:180px;">
        <label for="brandingMaskIconColor" class="d-block" style="font-size:12px;">Mask icon color</label>
        <input
          type="text"
          id="brandingMaskIconColor"
          class="form-control"
          placeholder="#0b5ed7"
          value="${isPro ? (brandingMaskIconColor.replace(/\"/g, '&quot;')) : ''}"
          ${!isPro ? 'disabled data-disabled-reason="pro"' : ''}
        />
      </div>
      <div style="min-width:180px;">
        <label for="brandingThemeColorLight" class="d-block" style="font-size:12px;">Theme color (light)</label>
        <input
          type="text"
          id="brandingThemeColorLight"
          class="form-control"
          placeholder="#0b5ed7"
          value="${isPro ? (brandingThemeColorLight.replace(/\"/g, '&quot;')) : ''}"
          ${!isPro ? 'disabled data-disabled-reason="pro"' : ''}
        />
      </div>
      <div style="min-width:180px;">
        <label for="brandingThemeColorDark" class="d-block" style="font-size:12px;">Theme color (dark)</label>
        <input
          type="text"
          id="brandingThemeColorDark"
          class="form-control"
          placeholder="#121212"
          value="${isPro ? (brandingThemeColorDark.replace(/\"/g, '&quot;')) : ''}"
          ${!isPro ? 'disabled data-disabled-reason="pro"' : ''}
        />
      </div>
    </div>
    <small class="text-muted d-block mt-2">
      Mask icon color is visible in Safari pinned tabs only. Theme colors change the browser chrome, not the page background.
    </small>
  </div>

    <hr class="admin-divider">

  <!-- Pro: Login page background -->
  <div class="form-group" style="margin-top:16px;">
    <label>
     <div class="admin-subsection-title" style="margin-top:2px;">
      Login page background
  </div>
      ${!isPro ? '<span class="badge badge-pill badge-warning admin-pro-badge" style="margin-left:6px;">Pro</span>' : ''}
    </label>
    <small class="text-muted d-block mb-2">
      ${isPro
            ? 'Accepts any CSS background value (color, gradient, or url(...)).'
            : 'Requires FileRise Pro to customize the login background.'}
    </small>
    <div class="form-group">
      <label for="brandingLoginBgLight" class="d-block" style="font-size:12px;">Light mode background</label>
      <textarea
        id="brandingLoginBgLight"
        class="form-control"
        rows="2"
        placeholder="radial-gradient(circle at 20% 20%, rgba(11,94,215,0.15), transparent 55%)"
        ${!isPro ? 'disabled data-disabled-reason="pro"' : ''}>${isPro ? (brandingLoginBgLight || '') : ''}</textarea>
    </div>
    <div class="form-group">
      <label for="brandingLoginBgDark" class="d-block" style="font-size:12px;">Dark mode background</label>
      <textarea
        id="brandingLoginBgDark"
        class="form-control"
        rows="2"
        placeholder="linear-gradient(180deg, #0b1220 0%, #0f172a 100%)"
        ${!isPro ? 'disabled data-disabled-reason="pro"' : ''}>${isPro ? (brandingLoginBgDark || '') : ''}</textarea>
    </div>
    <div class="form-group">
      <label for="brandingLoginTagline" class="d-block" style="font-size:12px;">Login tagline (optional)</label>
      <input
        type="text"
        id="brandingLoginTagline"
        class="form-control"
        placeholder="Secure files. Simple workflow."
        value="${isPro ? (brandingLoginTagline.replace(/\"/g, '&quot;')) : ''}"
        ${!isPro ? 'disabled data-disabled-reason="pro"' : ''}
      />
    </div>
  </div>

    <hr class="admin-divider">

  <!-- Pro: App background -->
  <div class="form-group" style="margin-top:16px;">
    <label>
     <div class="admin-subsection-title" style="margin-top:2px;">
      App background (after login)
  </div>
      ${!isPro ? '<span class="badge badge-pill badge-warning admin-pro-badge" style="margin-left:6px;">Pro</span>' : ''}
    </label>
    <small class="text-muted d-block mb-2">
      ${isPro
            ? 'Accepts any CSS background value (color, gradient, or url(...)). Leave blank to use FileRise defaults.'
            : 'Requires FileRise Pro to customize the app background.'}
    </small>
    <div class="form-group">
      <label for="brandingAppBgLight" class="d-block" style="font-size:12px;">Light mode background</label>
      <input
        type="text"
        id="brandingAppBgLight"
        class="form-control"
        placeholder="linear-gradient(135deg,#0ea5e9,#22c55e)"
        value="${isPro ? (brandingAppBgLight.replace(/\"/g, '&quot;')) : ''}"
        ${!isPro ? 'disabled data-disabled-reason="pro"' : ''}
      />
    </div>
    <div class="form-group">
      <label for="brandingAppBgDark" class="d-block" style="font-size:12px;">Dark mode background</label>
      <input
        type="text"
        id="brandingAppBgDark"
        class="form-control"
        placeholder="linear-gradient(180deg,#0b1220,#0f172a)"
        value="${isPro ? (brandingAppBgDark.replace(/\"/g, '&quot;')) : ''}"
        ${!isPro ? 'disabled data-disabled-reason="pro"' : ''}
      />
    </div>
    <small class="text-muted d-block mt-1">
      ${tf("app_bg_color_help", "Tip: use the same CSS background format as the login screen. This affects the main app, not the login screen.")}
    </small>
  </div>

    <hr class="admin-divider">

  <!-- Display: Hover preview max image size -->
  <div class="form-group" style="margin-top:16px;">
    <label for="hoverPreviewMaxImageMb">
     <div class="admin-subsection-title" style="margin-top:2px;">
      ${tf("hover_preview_max_image_mb", "Hover preview max image size (MB)")}
  </div>
    </label>
    <small class="text-muted d-block mb-1">
      ${tf("hover_preview_max_image_help", "Applies to hover previews and gallery thumbnails. Default 8 MB; higher values increase bandwidth and memory use.")}
    </small>
    <input
      type="number"
      id="hoverPreviewMaxImageMb"
      class="form-control"
      min="1"
      max="50"
      step="1"
      value="${hoverPreviewMaxImageMb}"
    />
  </div>

  <!-- Display: Hover preview max video size -->
  <div class="form-group" style="margin-top:16px;">
    <label for="hoverPreviewMaxVideoMb">
     <div class="admin-subsection-title" style="margin-top:2px;">
      ${tf("hover_preview_max_video_mb", "Hover preview max video size (MB)")}
  </div>
    </label>
    <small class="text-muted d-block mb-1">
      ${tf("hover_preview_max_video_help", "Applies to hover previews and gallery thumbnails. Default 200 MB; higher values can increase bandwidth on large videos.")}
    </small>
    <input
      type="number"
      id="hoverPreviewMaxVideoMb"
      class="form-control"
      min="1"
      max="2048"
      step="1"
      value="${hoverPreviewMaxVideoMb}"
    />
  </div>

  <!-- Display: FFmpeg path -->
  <div class="form-group" style="margin-top:16px;">
    <label for="ffmpegPath">
     <div class="admin-subsection-title" style="margin-top:2px;">
      FFmpeg binary path (optional)
  </div>
    </label>
    <small id="ffmpegPathHelp" class="text-muted d-block mb-1">
      ${ffmpegPathLockedByEnv ? ffmpegHelpLocked : ffmpegHelpDefault}
    </small>
    <input
      type="text"
      id="ffmpegPath"
      class="form-control"
      placeholder="/usr/local/bin/ffmpeg"
      value="${(ffmpegPathValue || '').replace(/\"/g, '&quot;')}"
      ${ffmpegPathLockedByEnv ? "disabled data-locked='1'" : ""}
    />
  </div>

  <!-- Display: File list summary depth -->
  <div class="form-group" style="margin-top:16px;">
    <label for="fileListSummaryDepth">
     <div class="admin-subsection-title" style="margin-top:2px;">
      ${tf("file_list_summary_depth", "File list summary depth")}
  </div>
    </label>
    <small class="text-muted d-block mb-1">
      ${tf("file_list_summary_depth_help", "Caps recursive folder totals. 0 = unlimited, 1 = children only, 2 = grandchildren, etc.")}
    </small>
    <input
      type="number"
      id="fileListSummaryDepth"
      class="form-control"
      min="0"
      max="10"
      step="1"
      value="${fileListSummaryDepth}"
    />
  </div>

  <div class="admin-subsection-title" style="margin-top:2px;">
    ${tf("indexing_ignore_rules", "Indexing ignore rules")}
  </div>
  <div class="form-group" style="margin-top:8px;">
    <label for="ignoreRegex">${tf("ignore_regex_label", "Ignore paths (regex)")}</label>
    <textarea
      id="ignoreRegex"
      class="form-control"
      rows="3"
      placeholder="(^|/)(@?snapshots?)(/|$)"
      ${ignoreRegexLockedByEnv ? "disabled data-locked='1'" : ""}>${escapeHTML(ignoreRegexValue || "")}</textarea>
    <small class="text-muted d-block mt-1">
      ${tf("ignore_regex_help", "One pattern per line. Matches entry name or relative path from root (no leading slash; e.g. \"projects/snapshot/2024\").")}
    </small>
    <small class="text-muted d-block mt-1">
      ${tf("ignore_regex_scope_note", "Affects folder tree, counts, and indexing. Dot-prefixed entries (like .snapshots) are already hidden; use this for non-dot snapshot folders (snapshot, @snapshots).")}
    </small>
    <small class="text-muted d-block mt-1">
      Built-in ignores: dot-prefixed entries (including .snapshots), <code>@eaDir</code>, <code>#recycle</code>,
      <code>.DS_Store</code>, <code>Thumbs.db</code>, <code>trash</code>, <code>profile_pics</code>.
    </small>
    <div class="d-flex flex-wrap align-items-center" style="gap:8px; margin-top:6px;">
      <span class="text-muted small">Quick add:</span>
      <button
        type="button"
        id="ignoreRegexSnapshotsPreset"
        class="btn btn-sm btn-outline-secondary"
        ${ignoreRegexLockedByEnv ? "disabled" : ""}>
        Add snapshot preset
      </button>
    </div>
    <small class="text-muted d-block mt-1">
      ${ignoreRegexLockedByEnv
            ? `Env <code>FR_IGNORE_REGEX</code> overrides and locks this field.`
            : `Env <code>FR_IGNORE_REGEX</code> overrides this field when set.`}
    </small>
  </div>

    <hr class="admin-divider">

  <!-- Pro: Footer text -->
  <div class="form-group" style="margin-top:16px;">
    <label for="brandingFooterHtml">
     <div class="admin-subsection-title" style="margin-top:2px;">
      ${t("footer_text")}
  </div>
      ${!isPro ? '<span class="badge badge-pill badge-warning admin-pro-badge" style="margin-left:6px;">Pro</span>' : ''}
    </label>
    <small class="text-muted d-block mb-1">
      ${isPro
            ? 'Shown at the bottom of every page. You can include simple HTML like links.'
            : 'Requires FileRise Pro to customize footer text.'}
    </small>
    <textarea
      id="brandingFooterHtml"
      class="form-control"
      rows="2"
      placeholder="&copy; 2025 Your Company. Powered by FileRise."
      ${!isPro ? 'disabled data-disabled-reason="pro"' : ''}>${isPro ? (brandingFooterHtml || '') : ''}</textarea>
  </div>
`;
        wireHeaderTitleLive();

        // Upload logo -> reuse profile picture endpoint, then fill the logo path
        if (isPro) {
          const fileInput = document.getElementById('brandingLogoFile');
          const uploadBtn = document.getElementById('brandingUploadBtn');
          const urlInput = document.getElementById('brandingCustomLogoUrl');

          if (fileInput && uploadBtn && urlInput) {
            uploadBtn.addEventListener('click', async () => {
              const f = fileInput.files && fileInput.files[0];
              if (!f) {
                showToast(t('admin_logo_choose_image'));
                return;
              }

              const fd = new FormData();
              fd.append('brand_logo', f); // <- must match PHP field

              try {
                const res = await fetch('/api/pro/uploadBrandLogo.php', {
                  method: 'POST',
                  credentials: 'include',
                  headers: { 'X-CSRF-Token': window.csrfToken },
                  body: fd
                });

                const text = await res.text();
                let js = {};
                try { js = JSON.parse(text || '{}'); } catch (e) { js = {}; }

                if (!res.ok || !js.url) {
                  showToast(js.error || t('admin_logo_upload_error'));
                  return;
                }

                const normalized = normalizeLogoPath(js.url); // your helper
                urlInput.value = normalized;
                showToast(t('admin_logo_uploaded_reminder'));
              } catch (e) {
                console.error(e);
                showToast(t('admin_logo_upload_error'));
              }
            });
          }
        }

        document.getElementById("loginOptionsContent").innerHTML = `
  <div class="admin-subsection-title">
    ${tf("login_options", "Login options")}
  </div>

  <div class="form-group">
    <div class="form-check fr-toggle">
      <input
        type="checkbox"
        class="form-check-input fr-toggle-input"
        id="enableFormLogin"
      />
      <label class="form-check-label" for="enableFormLogin">
        ${tf("enable_login_form", "Enable login form")}
      </label>
    </div>
  </div>

  <div class="form-group">
    <div class="form-check fr-toggle">
      <input
        type="checkbox"
        class="form-check-input fr-toggle-input"
        id="enableBasicAuth"
      />
      <label class="form-check-label" for="enableBasicAuth">
        ${tf("enable_basic_http_auth", "Enable HTTP Basic auth")}
      </label>
    </div>
  </div>

  <div class="form-group">
    <div class="form-check fr-toggle">
      <input
        type="checkbox"
        class="form-check-input fr-toggle-input"
        id="enableOIDCLogin"
      />
      <label class="form-check-label" for="enableOIDCLogin">
        ${tf("enable_oidc_login", "Enable OIDC login (OIDC config required)")}
      </label>
    </div>
  </div>

  <div class="form-group">
    <div class="form-check fr-toggle">
      <input
        type="checkbox"
        class="form-check-input fr-toggle-input"
        id="authBypass"
      />
      <label class="form-check-label" for="authBypass">
        ${tf(
          "proxy_only_login_label",
          "Use proxy header only (disable built-in logins)"
        )}
      </label>
    </div>
    <small class="text-muted d-block mt-1">
      ${tf(
          "proxy_only_login_help",
          "When enabled, FileRise trusts the reverse proxy header and disables the login form, HTTP Basic and OIDC."
        )}
    </small>
  </div>

  <div class="form-group">
    <label for="authHeaderName">Auth header name:</label>
    <input
      type="text"
      id="authHeaderName"
      class="form-control"
      placeholder="e.g. X-Remote-User"
    />
  </div>

    <hr class="admin-divider">

  <div class="admin-subsection-title" style="margin-top:2px;">
    WebDAV access
  </div>

  <div class="form-group">
    <div class="form-check fr-toggle">
      <input
        type="checkbox"
        class="form-check-input fr-toggle-input"
        id="enableWebDAV"
      />
      <label class="form-check-label" for="enableWebDAV">
        Enable WebDAV
      </label>
    </div>
  </div>
`;

        // --- Firewall / Proxy Settings (Published URL) ---
        const deployInfo = (config && typeof config === 'object' && config.deployment && typeof config.deployment === 'object')
          ? config.deployment
          : {};
        const publishedLocked = !!deployInfo.publishedUrlLockedByEnv;
        const publishedEffective = (deployInfo.publishedUrlEffective || '').toString();
        const publishedCfg = (deployInfo.publishedUrl || '').toString();
        const basePathEff = (deployInfo.basePath || '').toString();
        const shareUrlEff = (deployInfo.shareUrl || '').toString();

        document.getElementById("networkContent").innerHTML = `
  <div class="admin-subsection-title">
    ${tf("published_server_uris", "Published server URIs")}
  </div>

  <div class="form-group">
    <label for="publishedUrl">${tf("published_url_label", "Published URL (optional)")}</label>
    <input
      type="url"
      id="publishedUrl"
      class="form-control"
      placeholder="https://example.com/fr"
      ${publishedLocked ? "disabled data-locked='1'" : ""}
    />
    <small class="text-muted d-block mt-1">
      ${tf(
        "published_url_help",
        "Overrides the base URL FileRise uses when generating share links and redirects (useful behind reverse proxies and subpath installs). Leave blank to use auto-detection."
      )}
    </small>
    ${publishedLocked ? `
      <small class="text-muted d-block mt-1">
        Controlled by env <code>FR_PUBLISHED_URL</code>.
      </small>` : ``}
  </div>

  <hr class="admin-divider">

  <div class="form-group">
    <label>${tf("effective_base_path", "Effective base path")}</label>
    <input type="text" class="form-control" value="${escapeHTML(basePathEff || (window.__FR_BASE_PATH__ || ""))}" disabled />
  </div>

  <div class="form-group">
    <label>${tf("effective_share_url", "Effective share URL")}</label>
    <input type="text" class="form-control" value="${escapeHTML(shareUrlEff || "")}" disabled />
  </div>

  <div class="form-group">
    <label>${tf("effective_published_url", "Effective published URL")}</label>
    <input type="text" class="form-control" value="${escapeHTML(publishedEffective || "")}" disabled />
  </div>
`;

        renderAdminEncryptionSection({ config, dark });

        document.getElementById("uploadContent").innerHTML = `
  <div class="admin-subsection-title" style="margin-top:2px;">
    ${tf("upload_settings", "Upload settings")}
  </div>

  <div class="form-group" style="margin-top:10px;">
    <label for="resumableChunkMb">
      ${tf("resumable_chunk_size_label", "Resumable chunk size (MB)")}
    </label>
    <input
      type="number"
      id="resumableChunkMb"
      class="form-control"
      min="0.5"
      max="100"
      step="0.1"
    />
    <small class="text-muted d-block mt-1">
      ${tf(
          "resumable_chunk_size_help",
          "Applies to file picker uploads (Resumable.js). Use smaller chunks if your proxy limits request size (e.g., Cloudflare Tunnels 100 MB)."
        )}
    </small>
  </div>

  <div class="form-group" style="margin-top:10px;">
    <label for="resumableTtlHours">
      ${tf("resumable_cleanup_hours_label", "Resumable cleanup age (hours)")}
    </label>
    <input
      type="number"
      id="resumableTtlHours"
      class="form-control"
      min="0.5"
      max="168"
      step="0.5"
    />
    <small class="text-muted d-block mt-1">
      ${tf(
          "resumable_cleanup_hours_help",
          "Deletes unfinished resumable uploads after this age. Applies to background sweeps and manual cleanup."
        )}
    </small>
  </div>

  <div class="mt-2">
    <button
      type="button"
      id="resumableCleanupNowBtn"
      class="btn btn-sm btn-secondary">
      ${tf("resumable_cleanup_run_now", "Run cleanup now")}
    </button>
    <small class="text-muted d-block" style="margin-top:4px;">
      ${tf(
          "resumable_cleanup_run_now_help",
          "Immediately sweeps expired resumable temp folders using the age above."
        )}
    </small>
    <div id="resumableCleanupStatus" class="small text-muted" style="margin-top:4px;"></div>
    <div class="small text-muted" style="margin-top:6px;">
      <div style="font-weight:600;">
        ${tf("resumable_cleanup_cron_title", "Cron example")}
      </div>
      <div>
        ${tf(
          "resumable_cleanup_cron_help",
          "Example hourly job: <code>0 * * * * /usr/bin/php /path/to/FileRise/src/cli/resumable_cleanup.php --all --respect-interval</code>"
        )}
      </div>
      <div>
        ${tf(
          "resumable_cleanup_cron_note",
          "Replace /path/to/FileRise with your install path."
        )}
      </div>
    </div>
  </div>

  <hr class="admin-divider">

  <div class="admin-subsection-title" style="margin-top:2px;">
    ${tf("antivirus_upload_scanning", "Antivirus upload scanning")}
  </div>

  <div class="form-group" style="margin-top:10px;">
    <div class="form-check fr-toggle">
      <input
        type="checkbox"
        class="form-check-input fr-toggle-input"
        id="clamavScanUploads"
      />
      <label class="form-check-label" for="clamavScanUploads">
        ${tf("clamav_enable_label", "Enable ClamAV scanning for uploads")}
      </label>
    </div>
    <small
      id="clamavScanUploadsHelp"
      class="d-block text-muted"
      style="margin-top:2px;"
    >
      ${tf(
          "clamav_help_text_short",
          "Files are scanned with ClamAV before being accepted. This may impact upload speed."
        )}
    </small>
  </div>

  <div class="form-group" style="margin-top:10px;">
    <label for="clamavExcludeDirs">
      ${tf("clamav_exclude_dirs_label", "Exclude upload paths")}
    </label>
    <textarea
      id="clamavExcludeDirs"
      class="form-control"
      rows="2"
      placeholder="${escapeHTML(tf("clamav_exclude_dirs_placeholder", "snapshot, tmp"))}"
    ></textarea>
    <small
      id="clamavExcludeDirsHelp"
      class="d-block text-muted"
      style="margin-top:2px;"
    >
      ${tf(
          "clamav_exclude_dirs_help",
          "Comma or newline separated paths relative to the source root (example: snapshot, tmp). For Pro sources you can prefix with source id (example: s3:/snapshot)."
        )}
    </small>
  </div>

  <div class="mt-2">
    <button
      type="button"
      id="clamavTestBtn"
      class="btn btn-sm btn-secondary">
      ${tf("clamav_test_button", "Run ClamAV self-test")}
    </button>
    <small class="text-muted d-block" style="margin-top:4px;">
      ${tf(
          "clamav_test_help",
          "Runs a quick scan against a tiny test file using your configured ClamAV command (VIRUS_SCAN_CMD or clamscan). Safe to run anytime."
        )}
    </small>
    <div id="clamavTestStatus" class="small text-muted" style="margin-top:4px;"></div>
  </div>

  <hr class="mt-3 mb-2">

  ${isPro
            ? `
      <!-- Real Pro virus log -->
      <div id="virusLogWrapper"
           class="card"
           style="border-radius: var(--menu-radius); overflow:hidden;">
        <div class="card-header py-2">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <strong>Virus detection log</strong>
              <div class="small text-muted">
                Recent uploads that were blocked by ClamAV (username, IP and filename).
              </div>
            </div>
            <div class="btn-group" role="group">
              <button
                type="button"
                class="btn btn-sm btn-secondary"
                id="virusLogRefreshBtn">
                ${tf("refresh", "Refresh")}
              </button>
              <button
                type="button"
                class="btn btn-sm btn-warning"
                id="virusLogDownloadCsvBtn">
                ${tf("download_csv", "Download CSV")}
              </button>
            </div>
          </div>
        </div>
        <div class="card-body p-2">
          <div class="table-responsive"
               style="max-height:220px; overflow:auto;">
            <table class="table table-sm table-striped mb-0">
              <thead>
                <tr>
                  <th style="width:26%;">Timestamp (UTC)</th>
                  <th style="width:18%;">User</th>
                  <th style="width:18%;">IP</th>
                  <th style="width:24%;">File</th>
                  <th style="width:14%;">Folder</th>
                </tr>
              </thead>
              <tbody id="virusLogTableBody"></tbody>
            </table>
          </div>
          <div id="virusLogEmpty" class="small text-muted mt-1">
            No virus detections have been logged yet.
          </div>
        </div>
      </div>
      `
            : `
      <!-- Pro-style blurred teaser, like Storage explorer -->
      <div id="virusLogWrapper"
           class="card"
           style="border-radius: var(--menu-radius); overflow:hidden; position:relative;">
        <div class="card-header py-2">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <strong>
                Virus detection log
                <span class="badge bg-warning text-dark ms-1 align-middle">Pro</span>
              </strong>
              <div class="small text-muted">
                Recent uploads that were blocked by ClamAV (username, IP and filename).
              </div>
            </div>
          </div>
        </div>
        <div class="card-body p-2">
          <!-- Blurred fake table teaser -->
          <div class="table-responsive"
               style="max-height:220px;overflow:hidden;filter:blur(3px);opacity:0.5;pointer-events:none;">
            <table class="table table-sm mb-0">
              <thead>
                <tr>
                  <th>Timestamp (UTC)</th>
                  <th>User</th>
                  <th>IP</th>
                  <th>File</th>
                  <th>Folder</th>
                </tr>
              </thead>
              <tbody>
                <tr><td colspan="5">&nbsp;</td></tr>
                <tr><td colspan="5">&nbsp;</td></tr>
                <tr><td colspan="5">&nbsp;</td></tr>
                <tr><td colspan="5">&nbsp;</td></tr>
              </tbody>
            </table>
          </div>

          <!-- Centered overlay copy -->
          <div
            class="d-flex flex-column align-items-center justify-content-center text-center"
            style="position:absolute; inset:0; padding:16px;">
            <div class="mb-1">
              <span class="badge bg-warning text-dark me-1">Pro</span>
              <span class="fw-semibold">
                Virus detection log is a Pro feature
              </span>
            </div>
            <div class="small text-muted mb-2">
              Upgrade to FileRise Pro to view detailed ClamAV detection history
              and download it as CSV from the admin panel.
            </div>
          </div>
        </div>
      </div>
      `
          }

`;

        const uploadScope = document.getElementById("uploadContent");
        const headerSettingsScope = document.getElementById("headerSettingsContent");
        wireIgnoreRegexPresetButton(headerSettingsScope);
        wireClamavTestButton(uploadScope);
        wireResumableCleanupButton(uploadScope);
        initVirusLogUI({ isPro });
        // ONLYOFFICE section (moved into adminOnlyOffice.js)
        initOnlyOfficeUI({ config });

        const hasId = !!(config.oidc && config.oidc.hasClientId);
        const hasSecret = !!(config.oidc && config.oidc.hasClientSecret);
        const oidcDebugEnabled = !!(config.oidc && config.oidc.debugLogging);
        const oidcAllowDemote = !!(config.oidc && config.oidc.allowDemote);
        const oidcPublicClient = !!(config.oidc && config.oidc.publicClient);

        const oidcHtml = `
  <hr class="admin-divider">

 <div class="admin-subsection-title" style="margin-top:2px;">
    OIDC Configuration
  </div>
  <div class="form-text text-muted" style="margin-top:8px;">
    <small>
      Client ID/Secret are never shown after saving. A green note indicates a value is saved.
      Click “Replace” to overwrite. For OIDC:
      1) create an app in your IdP (Authentik, Keycloak, etc),
      2) paste its issuer/base URL below,
      3) configure the redirect URI in your IdP,
      4) then run the test.
      <br><br>
      <strong>Security note:</strong>
      In production, always configure your IdP and FileRise over
      <code>https://</code>. Plain <code>http://</code> should only be used
      for local testing or lab environments.
    </small>
  </div>

  <hr class="admin-divider">

  <div class="form-group" style="margin-top:8px;">
    <label for="oidcProviderUrl">${t("oidc_provider_url")}:</label>
    <input type="text" id="oidcProviderUrl" class="form-control"
           placeholder="https://idp.example.com/application/o/filerise/"
           value="${(window.currentOIDCConfig?.providerUrl || "")}" />
    <small class="text-muted">
      Use the issuer / base URL from your provider (without the
      <code>/.well-known/openid-configuration</code> suffix).
      <br>
      Avoid <code>http://</code> in production – many IdPs and browsers will
      block insecure OIDC redirects or set cookies incorrectly.
    </small>
  </div>

  ${renderMaskedInput({ id: "oidcClientId", label: t("oidc_client_id"), hasValue: hasId })}
  ${renderMaskedInput({ id: "oidcClientSecret", label: t("oidc_client_secret"), hasValue: hasSecret, isSecret: true })}

  <div class="form-group" style="margin-top:6px;">
    <div class="form-check fr-toggle">
      <input type="checkbox"
             class="form-check-input fr-toggle-input"
             id="oidcPublicClient"
             ${oidcPublicClient ? 'checked' : ''} />
      <label class="form-check-label" for="oidcPublicClient">
        ${tf("oidc_public_client_label", "This is a public OIDC client (no client secret)")}
      </label>
    </div>
    <small class="text-muted d-block mt-1">
      ${tf("oidc_public_client_help", "Uses PKCE (S256) with token auth method \"none\". Leave unchecked for confidential clients that send a client secret.")}
    </small>
  </div>

  <div class="form-group">
    <label for="oidcRedirectUri">${t("oidc_redirect_uri")}:</label>
    <input type="text" id="oidcRedirectUri" class="form-control"
           placeholder="https://your-filerise-host/auth/oidc/callback"
           value="${(window.currentOIDCConfig?.redirectUri || "")}" />
    <small class="text-muted">
      This must exactly match the redirect/callback URL configured in your IdP application.
    </small>
  </div>

  <hr class="admin-divider">

  <div class="form-group" style="margin-top:4px;">
  <div class="form-check fr-toggle">
    <input type="checkbox"
           class="form-check-input fr-toggle-input"
           id="oidcAllowDemote"
           ${oidcAllowDemote ? 'checked' : ''} />
    <label class="form-check-label" for="oidcAllowDemote">
      Allow OIDC to downgrade FileRise admins
    </label>
  </div>
    <small class="text-muted d-block mt-1">
      When enabled, if a user loses admin privileges in your IdP, FileRise will also
      demote them from admin to regular user on next OIDC login.
      <br>
      When disabled (default), once a user is an admin in FileRise, role changes in
      the IdP will not demote them automatically.
      <br>
      Container env <code>FR_OIDC_ALLOW_DEMOTE</code> overrides this setting.
    </small>
  </div>

  <hr class="admin-divider">

  <div class="form-group">
    <label>${tf("oidc_quick_test_label", "Quick OIDC connectivity test")}</label>
    <p class="text-muted small mb-1">
      This checks that FileRise can reach your provider’s
      <code>/.well-known/openid-configuration</code> endpoint using the URL above.
      Save settings first if you changed the URL.
    </p>
    <button type="button"
            class="btn btn-sm btn-secondary"
            id="oidcTestBtn">
      ${tf("oidc_test_button", "Test OIDC discovery")}
    </button>
    <div id="oidcTestStatus"
         class="small text-muted"
         style="margin-top:4px;"></div>
  </div>

  <hr class="admin-divider">

<div class="form-group" style="margin-top:10px;">
  <div class="form-check fr-toggle">
    <input type="checkbox"
           class="form-check-input fr-toggle-input"
           id="oidcDebugLogging"
           ${oidcDebugEnabled ? 'checked' : ''} />
    <label class="form-check-label" for="oidcDebugLogging">
      Enable OIDC debug logging
    </label>
  </div>
    <small class="text-muted d-block mt-1">
      When enabled, FileRise logs extra non-sensitive OIDC info to the PHP error log
      (issuer, redirect URI, auth method, group counts, etc). Turn this on only while
      troubleshooting, then disable it.
    </small>
  </div>

  <hr class="admin-divider">

  <div class="form-group" style="margin-top:10px;">
    <label>${tf("oidc_debug_snapshot_label", "Effective OIDC configuration snapshot")}</label>
    <p class="text-muted small mb-1">
      Generates a redacted JSON snapshot (no secrets) of how FileRise sees your OIDC
      configuration and environment. Useful to copy/paste into a support ticket.
    </p>
    <button type="button"
            class="btn btn-sm btn-secondary"
            id="oidcDebugSnapshotBtn">
      ${tf("oidc_debug_snapshot_button", "Show snapshot")}
    </button>
    <pre id="oidcDebugSnapshot"
     class="small oidc-debug-snapshot"
     style="margin-top:4px; max-height:200px; overflow:auto; padding:6px; border-radius:4px;"></pre>
  </div>

    <hr class="admin-divider">

     <div class="admin-subsection-title" style="margin-top:2px;">
    TOTP Configuration
  </div>

    <div class="form-group">
    <label for="globalOtpauthUrl">${t("global_otpauth_url")}:</label>
    <input type="text" id="globalOtpauthUrl" class="form-control"
           value="${window.currentOIDCConfig?.globalOtpauthUrl || 'otpauth://totp/{label}?secret={secret}&issuer=FileRise'}" />
  </div>
`;

        const loginOptsHost = document.getElementById("loginOptionsContent");
        if (loginOptsHost) {
          loginOptsHost.insertAdjacentHTML('beforeend', oidcHtml);
          wireReplaceButtons(loginOptsHost);
          wireOidcTestButton(loginOptsHost);
          wireOidcDebugSnapshotButton(loginOptsHost);
        }

        const shareLinksHost = document.getElementById("shareLinksContent");
        if (shareLinksHost) {
          shareLinksHost.innerHTML = `

    <div class="form-group" style="margin-top:8px;">
        <div class="admin-subsection-title" style="margin-top:2px;">
${t("shared_max_upload_size_bytes")}
          </div>
      <input
        type="number"
        id="sharedMaxUploadSize"
        class="form-control"
        placeholder="e.g. 52428800"
      />
      <small class="text-muted d-block">
        ${t("max_bytes_shared_uploads_note")}
      </small>
    </div>

    <hr class="admin-divider">

    <div class="admin-subsection-title" style="margin-top:2px;">
      ${tf("manage_shared_links", "Manage shared links")}
    </div>


    <div id="shareLinksList" class="mt-2">
      ${t("loading")}…
    </div>
  `;
        }

        // --- FileRise Pro / License section ---
        const proContent = document.getElementById("proContent");
        if (proContent) {
          if (!proPrimaryAdmin) {
            proContent.innerHTML = `
              <div class="card" style="padding:12px; border:1px solid #ddd; border-radius:12px; max-width:720px; margin:8px auto;">
                <strong>FileRise Pro</strong>
                <div class="text-muted" style="margin-top:6px;">
                  This is only viewable on the registered administrator.
                </div>
              </div>
            `;
          } else {
          // Normalize versions so "v1.0.1" and "1.0.1" compare cleanly
          const norm = (v) => (String(v || '').trim().replace(/^v/i, ''));

          const currentVersionRaw = (proVersion && proVersion !== 'not installed') ? String(proVersion) : '';
          const latestVersionRaw = PRO_LATEST_BUNDLE_VERSION || '';
          const hasCurrent = !!norm(currentVersionRaw);
          const hasLatest = !!norm(latestVersionRaw);
          const hasUpdate = hasCurrent && hasLatest && norm(currentVersionRaw) !== norm(latestVersionRaw);
          const hasSavedLicense = !!(proLicense && String(proLicense).trim().startsWith('FRP1.'));
          const showRenewLinks = isPro || hasSavedLicense;
          const showInstallOptions = isPro || hasSavedLicense;
          const showUpdateBadge = hasUpdate && !updatesExpired;
          const autoUpdateAllowed = hasSavedLicense && !updatesExpired;
          const autoUpdateBlockedMessage = hasSavedLicense
            ? 'Updates expired. Renew to download newer Pro bundles.'
            : 'Save a license key to enable automatic download.';
          const updatesExpiredNotice = updatesExpired && proUpdatesUntil
            ? `<div class="small text-warning" style="margin-top:6px; margin-bottom:8px;">
                Updates expired on ${escapeHTML(proUpdatesUntil)}. Downloading or installing a newer Pro bundle will deactivate Pro. Renew to update.
              </div>`
            : '';

          // Friendly description of plan + lifetime/expiry
          let planLabel = '';
          if (proPlan === 'early_supporter_1x' || (!proPlan && isPro)) {
            const mj = proMaxMajor || 1;
            planLabel = `Early supporter – lifetime for FileRise Pro ${mj}.x`;
          } else if (proPlan) {
            if (proPlan.startsWith('personal_') || proPlan === 'personal_yearly') {
              planLabel = 'Personal license';
            } else if (proPlan.startsWith('business_') || proPlan === 'business_yearly') {
              planLabel = 'Business license';
            } else {
              planLabel = proPlan;
            }
          }

          let updatesLabel = '';
          if (proPlan === 'early_supporter_1x' || (!proPlan && isPro)) {
            const mj = proMaxMajor || 1;
            updatesLabel = `Updates: lifetime for FileRise Pro ${mj}.x`;
          } else if (proUpdatesUntil) {
            updatesLabel = updatesExpired
              ? `Updates expired on ${proUpdatesUntil} (Pro stays active)`
              : `Updates until ${proUpdatesUntil}`;
          }

          const proMetaHtml =
            isPro && (proType || proEmail || proVersion || planLabel || updatesLabel)
              ? `
                 <div class="pro-license-meta" style="margin-top:8px;font-size:12px;color:#777;">
                   <div>
                     ✅ ${proType ? `License type: ${proType}` : 'License active'}
                     ${proType && proEmail ? ' • ' : ''}
                     ${proEmail ? `Licensed to: ${proEmail}` : ''}
                   </div>
                   ${planLabel ? `
                   <div>
                     Plan: ${planLabel}
                   </div>` : ''}
                   ${updatesLabel ? `
                   <div>
                     ${updatesLabel}
                   </div>` : ''}
                   ${hasCurrent ? `
                   <div>
                     Installed Pro bundle: v${norm(currentVersionRaw)}
                   </div>` : ''}
                   ${hasLatest ? `
                   <div>
                     Latest Pro bundle (UI hint): ${latestVersionRaw}
                   </div>` : ''}
                 </div>
               `
              : '';

          const needsCompatWarning = isPro
            && proApiLevel > 0
            && proApiLevel < CORE_REQUIRED_PRO_API_LEVEL;
          const compatHtml = needsCompatWarning
            ? `
                <div class="pro-license-meta" style="margin-top:8px;font-size:12px;color:#b45309;">
                  <div><strong>Compatibility warning:</strong> Core features require Pro API level ${CORE_REQUIRED_PRO_API_LEVEL} (v${PRO_API_MIN_VERSION_LABELS.sources}+). Installed Pro API level: ${proApiLevel}. Those features will stay disabled until you update the Pro bundle.</div>
                  ${updatesExpired ? `<div>Updates expired on ${escapeHTML(proUpdatesUntil)}. Renew to download newer Pro bundles.</div>` : ''}
                </div>
              `
            : '';

          const instanceHtml = proInstanceId
            ? `
                <div class="pro-license-meta" style="margin-top:8px;font-size:12px;color:#777;">
                  <div class="d-flex align-items-center flex-wrap" style="gap:6px;">
                    <span>Instance ID (required for 12-month updates plans): <code>${proInstanceId}</code></span>
                    <button type="button" class="btn btn-link btn-sm p-0" id="proCopyInstanceIdBtn">Copy</button>
                  </div>
                </div>
              `
            : '';

          proContent.innerHTML = `
    <div class="card pro-card" style="padding:12px; border:1px solid #ddd; border-radius:12px; max-width:720px; margin:8px auto;">
      <div>
        <!-- Title row with pill aligned to "FileRise Pro" -->
        <div class="d-flex align-items-center" style="gap:8px;">
          <strong>FileRise Pro</strong>
          <span class="badge badge-pill ${isPro ? 'badge-success' : 'badge-secondary'} admin-pro-badge">
            ${isPro ? 'Active' : 'Free'}
          </span>
        </div>

        <!-- Subtitle + meta under the title -->
        <div style="font-size:12px; color:#777; margin-top:2px;">
          ${isPro
              ? 'Pro features are currently enabled on this instance.'
              : 'You are running the free edition. Enter a license key to activate FileRise Pro.'}
        </div>
        ${proMetaHtml}
        ${compatHtml}
        ${instanceHtml}
      </div>

      ${!isPro ? `
        <div style="margin-top:8px;">
          <a
            href="https://filerise.net/pro/"
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-sm btn-pro-admin"
          >
            Buy FileRise Pro
          </a>
          <small class="text-muted d-block" style="margin-top:4px;">
            Opens filerise.net in a new tab so you can purchase a FileRise Pro license.
            You will need your Instance ID during checkout.
          </small>
        </div>
      ` : ''}

      <div class="form-group" style="margin-top:10px;">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <label for="proLicenseInput" style="font-size:12px; margin-bottom:0;">License key</label>
          ${isPro && proLicense ? `
            <button type="button"
                    class="btn btn-link btn-sm p-0"
                    id="proCopyLicenseBtn">
              Copy current license
            </button>
          ` : ''}
        </div>
        <textarea
          id="proLicenseInput"
          class="form-control"
          rows="3"
          placeholder="Paste your FileRise Pro license key here..."></textarea>
        <small class="text-muted">
          You can purchase a license at
          <a href="https://filerise.net" target="_blank" rel="noopener noreferrer">filerise.net</a>.
        </small>
      </div>

      <div class="form-group" style="margin-top:6px;">
        <label style="font-size:12px;">Or upload license file</label>
        <input
          type="file"
          id="proLicenseFile"
          class="form-control-file"
          accept=".lic,.json,.txt,.filerise-lic"
        />
        <small class="text-muted">
          Supported: FileRise.lic, plain text with FRP1... or JSON containing a <code>license</code> field.
        </small>
      </div>

      <button type="button" class="btn btn-primary btn-sm" id="proSaveLicenseBtn" style="margin-top:8px;">
        Save license
      </button>

      ${showRenewLinks ? `
      <div style="margin-top:10px;">
        <div class="d-flex flex-wrap align-items-center" style="gap:8px;">
          <a
            href="https://filerise.net/pro/renew.php"
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-sm btn-secondary">
            Renew 12-month updates
          </a>
          <a
            href="https://filerise.net/pro/instances.php"
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-sm btn-secondary">
            Manage instance IDs
          </a>
        </div>
        <small class="text-muted d-block" style="margin-top:4px;">
          Renewals extend updates for 12-month plans. Instance IDs apply to Business 12-month updates.
        </small>
      </div>
      ` : ''}

      ${showInstallOptions ? `
      <div class="mt-3 border-top pt-3" style="margin-top:14px;">
        <h6 class="mb-1">Install / update Pro bundle</h6>
        <div class="text-muted small" style="margin-bottom:8px;">
          Choose a method. Manual uploads never contact external services.
        </div>
        ${updatesExpiredNotice}

        <div class="text-muted small" style="font-weight:600;">Manual upload</div>
        <div class="text-muted small" style="margin-bottom:6px;">
          Download the ZIP from <a href="https://filerise.net/pro/update.php" target="_blank" rel="noopener noreferrer">filerise.net</a> and upload it here.
        </div>
        <div class="d-flex flex-wrap align-items-center gap-2" style="margin-top:4px;">
          <input type="file"
                 id="proBundleFile"
                 accept=".zip"
                 class="form-control-file mb-2 mb-sm-0" />
          <button type="button"
                  id="btnInstallProBundle"
                  class="btn btn-sm btn-pro-admin">
            Install Pro bundle
          </button>
        </div>

        <div class="text-muted small" style="font-weight:600; margin-top:10px;">One-click download</div>
        <div class="text-muted small" style="margin-bottom:6px;">
          Uses your saved license key and requires outbound access to filerise.net.
        </div>
        <div class="d-flex flex-wrap align-items-center gap-2" style="margin-top:4px;">
          <button type="button"
                  id="btnDownloadProBundle"
                  class="btn btn-sm btn-secondary"
                  ${autoUpdateAllowed ? '' : 'disabled'}>
            Download + install latest
          </button>
          ${showUpdateBadge ? `
            <span class="badge badge-light">Update available</span>
          ` : ''}
        </div>
        <div id="proBundleStatus" class="small mt-2"></div>
      </div>
      ` : `
      <div class="mt-3 border-top pt-3" style="margin-top:14px;">
        <h6 class="mb-1">Install / update Pro bundle</h6>
        <div class="text-muted small">
          Save a license key to unlock manual upload and one-click install options.
        </div>
      </div>
      `}
    </div>
  `;

          const updatePill = document.getElementById('proUpdatePill');
          if (updatePill && !updatePill.__wired && !updatesExpired) {
            updatePill.__wired = true;
            updatePill.addEventListener('click', async (e) => {
              e.preventDefault();
              const choice = await showProUpdateChoiceModal({ hasAuto: autoUpdateAllowed });
              if (choice === 'manual') {
                window.open('https://filerise.net/pro/update.php', '_blank', 'noopener');
                return;
              }
              if (choice === 'auto') {
                const dlBtn = document.getElementById('btnDownloadProBundle');
                if (dlBtn && !dlBtn.disabled) {
                  dlBtn.click();
                } else {
                  showToast(autoUpdateBlockedMessage, 'error');
                }
              }
            });
          }

          // Wire up local Pro bundle installer (upload .zip into core)
          initProBundleInstaller({ updatesExpired, updatesUntil: proUpdatesUntil });

          // Pre-fill textarea with saved license if present
          const licenseTextarea = document.getElementById('proLicenseInput');
          if (licenseTextarea && proLicense) {
            licenseTextarea.value = proLicense;
          }

          // Auto-load license when a file is selected
          const fileInput = document.getElementById('proLicenseFile');
          if (fileInput && licenseTextarea) {
            fileInput.addEventListener('change', () => {
              const file = fileInput.files && fileInput.files[0];
              if (!file) return;

              const reader = new FileReader();
              reader.onload = (e) => {
                let raw = String(e.target.result || '').trim();
                let license = raw;

                try {
                  const js = JSON.parse(raw);
                  if (js && typeof js.license === 'string') {
                    license = js.license.trim();
                  }
                } catch (_) {
                  // not JSON, treat as plain text
                }

                if (!license || !license.startsWith('FRP1.')) {
                  showToast(t('admin_license_file_invalid'));
                  return;
                }

                licenseTextarea.value = license;
                showToast(t('admin_license_loaded_prompt'));
              };

              reader.onerror = () => {
                showToast(t('admin_license_read_error'));
              };

              reader.readAsText(file);
            });
          }

          // Copy current license button (now inline next to the label)
          const proCopyBtn = document.getElementById('proCopyLicenseBtn');
          if (proCopyBtn && proLicense) {
            proCopyBtn.addEventListener('click', async () => {
              try {
                if (navigator.clipboard && window.isSecureContext) {
                  await navigator.clipboard.writeText(proLicense);
                } else {
                  const ta = document.createElement('textarea');
                  ta.value = proLicense;
                  ta.style.position = 'fixed';
                  ta.style.left = '-9999px';
                  document.body.appendChild(ta);
                  ta.select();
                  document.execCommand('copy');
                  ta.remove();
                }
                showToast(t('admin_license_copied'));
              } catch (e) {
                showToast(t('admin_license_copy_failed'));
              }
            });
          }

          const proCopyInstanceBtn = document.getElementById('proCopyInstanceIdBtn');
          if (proCopyInstanceBtn && proInstanceId) {
            proCopyInstanceBtn.addEventListener('click', async () => {
              try {
                if (navigator.clipboard && window.isSecureContext) {
                  await navigator.clipboard.writeText(proInstanceId);
                } else {
                  const ta = document.createElement('textarea');
                  ta.value = proInstanceId;
                  ta.style.position = 'fixed';
                  ta.style.left = '-9999px';
                  document.body.appendChild(ta);
                  ta.select();
                  document.execCommand('copy');
                  ta.remove();
                }
                showToast(t('admin_instance_id_copied'));
              } catch (e) {
                showToast(t('admin_instance_id_copy_failed'));
              }
            });
          }

          // Save license handler
          const proSaveBtn = document.getElementById('proSaveLicenseBtn');
          if (proSaveBtn) {
            proSaveBtn.addEventListener('click', async () => {
              const ta = document.getElementById('proLicenseInput');
              const license = (ta && ta.value.trim()) || '';
              const statusEl = document.getElementById('proBundleStatus');
              const setStatus = (msg, tone = 'muted') => {
                if (!statusEl) return;
                statusEl.textContent = msg || '';
                statusEl.className = `small text-${tone}`;
              };

              try {
                proSaveBtn.disabled = true;
                const res = await fetch('/api/admin/setLicense.php', {
                  method: 'POST',
                  credentials: 'include',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': (document.querySelector('meta[name="csrf-token"]')?.content || '')
                  },
                  body: JSON.stringify({ license }),
                });

                const text = await res.text();
                let data = {};
                try { data = JSON.parse(text || '{}'); } catch (e) { data = {}; }

                if (!res.ok || !data.success) {
                  console.error('setLicense error:', res.status, text);
                  showToast(data.error || t('admin_license_save_error'));
                  return;
                }

                showToast(t('admin_license_saved'));

                if (!isPro) {
                  const ok = await showCustomConfirmModal(
                    'Download and install the latest Pro bundle now?'
                  );
                  if (ok) {
                    setStatus('Downloading and installing latest Pro bundle...', 'muted');
                    const progress = startProBundleProgress({
                      action: 'Updating Pro',
                      title: 'Downloading and installing FileRise Pro bundle'
                    });
                    try {
                      const resp = await fetch('/api/admin/downloadProBundle.php', {
                        method: 'POST',
                        headers: {
                          'X-CSRF-Token': (document.querySelector('meta[name="csrf-token"]')?.content || '')
                        },
                        credentials: 'include'
                      });

                      let dlData = null;
                      try {
                        dlData = await resp.json();
                      } catch (_) {
                        dlData = null;
                      }

                      if (!resp.ok || !dlData || !dlData.success) {
                        const msg = dlData && (dlData.error || dlData.message)
                          ? (dlData.error || dlData.message)
                          : `HTTP ${resp.status}`;
                        setStatus('Download/install failed: ' + msg, 'danger');
                        showToast(t('admin_pro_install_failed_detail', { error: msg }), 'error');
                        finishProBundleProgress(progress, false, msg);
                        return;
                      }

                      const finalVersion = dlData.proVersion ? String(dlData.proVersion) : '';
                      const versionText = finalVersion ? ` (${finalVersion})` : '';
                      setStatus('Pro bundle installed' + versionText + '. Reloading...', 'success');
                      showToast(t('admin_pro_installed_reloading', { version: versionText }));
                      finishProBundleProgress(progress, true);
                      if (typeof loadAdminConfigFunc === 'function') {
                        loadAdminConfigFunc();
                      }
                      setTimeout(() => {
                        window.location.reload();
                      }, 800);
                      return;
                    } catch (e) {
                      const errMsg = e && e.message ? e.message : 'Download/install failed.';
                      setStatus('Download/install failed.', 'danger');
                      showToast(t('admin_pro_install_failed'), 'error');
                      finishProBundleProgress(progress, false, errMsg);
                      return;
                    }
                  }
                }

                window.location.reload();
              } catch (e) {
                console.error(e);
                showToast(t('admin_license_save_error'));
              } finally {
                proSaveBtn.disabled = false;
              }
            });
          }

          }
        }
        // --- end FileRise Pro section ---

        // Pro features (Search Everywhere + Audit Logs)
        const proFeaturesContainer = document.getElementById('proFeaturesContent');
        const proFeaturesHeaderEl = document.getElementById('proFeaturesHeader');
        if (proFeaturesHeaderEl) {
          const iconHtml = '<i class="material-icons">expand_more</i>';
          const pill = (!isPro || !proSearchApiOk || !proAuditAvailable)
            ? '<span class="btn-pro-pill" style="position:static; display:inline-flex; align-items:center; margin:0;">Pro</span>'
            : '';
          const labelHtml = `<span style="display:inline-flex;align-items:center;gap:6px;">Pro Features${pill}</span> ${iconHtml}`;
          const inner = proFeaturesHeaderEl.querySelector('.section-header-inner');
          if (inner) {
            inner.innerHTML = labelHtml;
          } else {
            proFeaturesHeaderEl.innerHTML = `<div class="section-header-inner">${labelHtml}</div>`;
          }
        }
        if (proFeaturesContainer) {
          const proSearchBlockedReason = !isPro ? 'pro' : (!proSearchApiOk ? 'api' : null);
          const needsUpgradeText = (!isPro)
            ? 'Requires an active FileRise Pro license.'
            : (!proSearchApiOk ? `Requires FileRise Pro v${PRO_API_MIN_VERSION_LABELS.search}+.` : '');
          const proSearchHtml = `
            <div class="card" style="border:1px solid ${dark ? '#3a3a3a' : '#eaeaea'}; border-radius:10px; padding:12px; background:${dark ? '#1f1f1f' : '#fdfdfd'}; position:relative; margin-bottom:10px;">
              <div class="d-flex align-items-center" style="gap:8px; margin-bottom:6px;">
                <i class="material-icons" aria-hidden="true">travel_explore</i>
                <div>
                  <div style="font-weight:600;">Search Everywhere</div>
                  <div class="text-muted" style="font-size:12px;">Global, ACL-aware search across all folders.</div>
                </div>
              </div>
              <div class="form-check fr-toggle" style="margin-bottom:10px;">
                <input type="checkbox"
                       class="form-check-input fr-toggle-input"
                       id="proSearchEnabled"
                       ${proSearchEnabled ? 'checked' : ''}
                       ${proSearchLocked ? 'data-locked=\"1\"' : ''}
                       ${(proSearchBlockedReason) ? `disabled data-disabled-reason=\"${proSearchBlockedReason}\"` : ''} />
                <label class="form-check-label" for="proSearchEnabled">
                  Enable Search Everywhere
                </label>
                ${proSearchLocked ? `<div class="small text-warning" style="margin-top:4px;">Locked by FR_PRO_SEARCH_ENABLED env override.</div>` : ''}
                ${needsUpgradeText ? `<div class="small text-warning" style="margin-top:4px;">${needsUpgradeText}</div>` : ''}
              </div>
              <div class="form-group" style="margin-bottom:4px;">
                <label for="proSearchLimit">Default result limit (max 200)</label>
                <input type="number"
                       class="form-control"
                       id="proSearchLimit"
                       min="1"
                       max="200"
                       value="${proSearchDefaultLimit}"
                       ${(proSearchBlockedReason || !proSearchEnabled || proSearchLocked) ? 'disabled' : ''} />
                <small class="text-muted">Used when launching Search Everywhere; per-request limit is still capped at 200.</small>
              </div>
              ${(!isPro || !proSearchApiOk) ? `
                <div class="alert alert-warning" style="margin-top:8px; font-size:0.9rem; padding:8px 10px; border-radius:8px;">
                  ${!isPro
                    ? 'This feature is part of FileRise Pro. Purchase or activate a license to enable it.'
                    : ('Please upgrade your FileRise Pro bundle to v' + PRO_API_MIN_VERSION_LABELS.search + ' or newer to use Search Everywhere.')}
                </div>
              ` : ''}
            </div>
          `;

          const auditBlockedReason = !isPro ? 'pro' : (!proAuditAvailable ? 'upgrade' : null);
          const auditHelpText = (!isPro)
            ? 'Requires an active FileRise Pro license.'
            : (!proAuditAvailable ? `Upgrade FileRise Pro to v${PRO_API_MIN_VERSION_LABELS.audit}+ to enable Audit Logs.` : '');
          const auditHtml = `
            <div class="card" style="border:1px solid ${dark ? '#3a3a3a' : '#eaeaea'}; border-radius:10px; padding:12px; background:${dark ? '#1f1f1f' : '#fdfdfd'}; position:relative; margin-bottom:10px;">
              <div class="d-flex align-items-center" style="gap:8px; margin-bottom:6px;">
                <i class="material-icons" aria-hidden="true">fact_check</i>
                <div>
                  <div style="font-weight:600;">Audit logging</div>
                  <div class="text-muted" style="font-size:12px;">Who did what, when, and where. Stored in FR_PRO_BUNDLE_DIR/audit/</div>
                </div>
              </div>
              <div class="form-check fr-toggle" style="margin-bottom:10px;">
                <input type="checkbox"
                       class="form-check-input fr-toggle-input"
                       id="proAuditEnabled"
                       ${proAuditEnabled ? 'checked' : ''}
                       ${(auditBlockedReason) ? `disabled data-disabled-reason="${auditBlockedReason}"` : ''} />
                <label class="form-check-label" for="proAuditEnabled">
                  Enable audit logs
                </label>
                ${auditHelpText ? `<div class="small text-warning" style="margin-top:4px;">${auditHelpText}</div>` : ''}
              </div>
              <div class="form-group" style="margin-bottom:8px;">
                <label for="proAuditLevel">Logging level</label>
                <select id="proAuditLevel" class="form-control" ${(auditBlockedReason || !proAuditEnabled) ? 'disabled' : ''}>
                  <option value="standard" ${proAuditLevel === 'standard' ? 'selected' : ''}>Standard (uploads, edits, renames, deletes)</option>
                  <option value="verbose" ${proAuditLevel === 'verbose' ? 'selected' : ''}>Verbose (includes downloads)</option>
                </select>
              </div>
              <div class="form-row" style="display:flex; gap:10px; flex-wrap:wrap;">
                <div class="form-group" style="flex:1; min-width:140px;">
                  <label for="proAuditMaxFileMb">Rotate at (MB)</label>
                  <input type="number" class="form-control" id="proAuditMaxFileMb" min="10" max="1024"
                         value="${proAuditMaxFileMb}"
                         ${(auditBlockedReason || !proAuditEnabled) ? 'disabled' : ''} />
                </div>
                <div class="form-group" style="flex:1; min-width:140px;">
                  <label for="proAuditMaxFiles">Max log files</label>
                  <input type="number" class="form-control" id="proAuditMaxFiles" min="1" max="10"
                         value="${proAuditMaxFiles}"
                         ${(auditBlockedReason || !proAuditEnabled) ? 'disabled' : ''} />
                </div>
              </div>
              <small class="text-muted">Rotation keeps the newest file plus up to ${proAuditMaxFiles - 1} archives.</small>
            </div>

            <div class="card" style="border:1px solid ${dark ? '#3a3a3a' : '#eaeaea'}; border-radius:10px; padding:12px; background:${dark ? '#1f1f1f' : '#fdfdfd'}; position:relative;">
              <div class="d-flex align-items-center" style="gap:8px; margin-bottom:8px;">
                <i class="material-icons" aria-hidden="true">history</i>
                <div>
                  <div style="font-weight:600;">Activity history</div>
                  <div class="text-muted" style="font-size:12px;">Filter and export audit events.</div>
                </div>
              </div>

              <div style="display:flex; gap:8px; align-items:center; margin:6px 0 8px;">
                <button type="button" id="auditFiltersToggle" class="btn btn-light btn-sm">Show filters</button>
                <div class="text-muted" style="font-size:12px;">User / action / source / storage / folder / dates</div>
              </div>

              <div id="auditFiltersWrap" style="display:none; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
                <input id="auditFilterUser" class="form-control" style="min-width:140px;" placeholder="User" />
                <input id="auditFilterAction" class="form-control" style="min-width:140px;" placeholder="Action" />
                <input id="auditFilterSource" class="form-control" style="min-width:120px;" placeholder="Source" />
                <input id="auditFilterStorage" class="form-control" style="min-width:140px;" placeholder="Storage" />
                <input id="auditFilterFolder" class="form-control" style="min-width:160px;" placeholder="Folder" />
                <input id="auditFilterFrom" class="form-control" style="min-width:140px;" type="date" />
                <input id="auditFilterTo" class="form-control" style="min-width:140px;" type="date" />
                <input id="auditFilterLimit" class="form-control" style="min-width:120px;" type="number" min="10" max="500" value="200" placeholder="Limit" />
              </div>

              <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
                <button type="button" id="auditRefreshBtn" class="btn btn-secondary btn-sm">Refresh</button>
                <button type="button" id="auditExportBtn" class="btn btn-primary btn-sm">Download CSV</button>
              </div>

              <div id="auditStatus" class="text-muted" style="font-size:12px; margin-bottom:8px;"></div>

              <div class="table-responsive audit-table-wrap">
                <table class="table table-sm" style="margin-bottom:0;">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>User</th>
                      <th>Action</th>
                      <th>Source</th>
                      <th>Storage</th>
                      <th>Folder</th>
                      <th>Path</th>
                      <th>From</th>
                      <th>To</th>
                      <th>IP</th>
                      <th>User Agent</th>
                      <th>Meta</th>
                    </tr>
                  </thead>
                  <tbody id="auditTableBody"></tbody>
                </table>
              </div>
            </div>
          `;
          proFeaturesContainer.innerHTML = proSearchHtml + auditHtml;

          const proSearchToggle = document.getElementById('proSearchEnabled');
          const proSearchLimit = document.getElementById('proSearchLimit');
          const syncProSearchLimit = () => {
            if (!proSearchLimit || !proSearchToggle) return;
            const locked = proSearchToggle.dataset.locked === '1' || !isPro || !proSearchApiOk;
            const enabled = !!proSearchToggle.checked;
            proSearchLimit.disabled = locked || !enabled;
          };
          if (proSearchToggle && !proSearchToggle.__wired) {
            proSearchToggle.__wired = true;
            proSearchToggle.addEventListener('change', syncProSearchLimit);
          }
          syncProSearchLimit();

          const auditEnabledEl = document.getElementById('proAuditEnabled');
          const auditLevelEl = document.getElementById('proAuditLevel');
          const auditMaxFileMbEl = document.getElementById('proAuditMaxFileMb');
          const auditMaxFilesEl = document.getElementById('proAuditMaxFiles');

          const syncAuditConfigFields = () => {
            if (!auditEnabledEl) return;
            const locked = auditBlockedReason || !isPro || !proAuditAvailable;
            const enabled = !!auditEnabledEl.checked;
            if (auditLevelEl) auditLevelEl.disabled = !!locked || !enabled;
            if (auditMaxFileMbEl) auditMaxFileMbEl.disabled = !!locked || !enabled;
            if (auditMaxFilesEl) auditMaxFilesEl.disabled = !!locked || !enabled;
          };
          if (auditEnabledEl && !auditEnabledEl.__wired) {
            auditEnabledEl.__wired = true;
            auditEnabledEl.addEventListener('change', syncAuditConfigFields);
          }
          syncAuditConfigFields();

          const auditStatusEl = document.getElementById('auditStatus');
          const auditTableBody = document.getElementById('auditTableBody');

          const auditFiltersWrap = document.getElementById('auditFiltersWrap');
          const auditFiltersToggle = document.getElementById('auditFiltersToggle');
          if (auditFiltersWrap && auditFiltersToggle && !auditFiltersToggle.__wired) {
            auditFiltersToggle.__wired = true;
            let isOpen = false;
            try {
              isOpen = localStorage.getItem('auditFiltersOpen') === '1';
            } catch (e) { }
            const setOpen = (open) => {
              auditFiltersWrap.style.display = open ? 'flex' : 'none';
              auditFiltersToggle.textContent = open ? 'Hide filters' : 'Show filters';
            };
            setOpen(isOpen);
            auditFiltersToggle.addEventListener('click', () => {
              isOpen = !isOpen;
              try { localStorage.setItem('auditFiltersOpen', isOpen ? '1' : '0'); } catch (e) { }
              setOpen(isOpen);
            });
          } else if (auditFiltersWrap) {
            auditFiltersWrap.style.display = 'none';
          }

          const auditFilters = () => {
            const params = new URLSearchParams();
            const add = (k, v) => { if (v) params.set(k, v); };
            add('user', (document.getElementById('auditFilterUser')?.value || '').trim());
            add('action', (document.getElementById('auditFilterAction')?.value || '').trim());
            add('source', (document.getElementById('auditFilterSource')?.value || '').trim());
            add('storage', (document.getElementById('auditFilterStorage')?.value || '').trim());
            add('folder', (document.getElementById('auditFilterFolder')?.value || '').trim());
            add('from', (document.getElementById('auditFilterFrom')?.value || '').trim());
            add('to', (document.getElementById('auditFilterTo')?.value || '').trim());
            const lim = parseInt((document.getElementById('auditFilterLimit')?.value || '200'), 10);
            if (lim > 0) params.set('limit', String(Math.min(500, lim)));
            return params;
          };

          const renderAuditRows = (rows) => {
            if (!auditTableBody) return;
            auditTableBody.textContent = '';
            if (!rows || !rows.length) {
              const tr = document.createElement('tr');
              const td = document.createElement('td');
              td.colSpan = 12;
              td.className = 'text-muted';
              td.textContent = 'No audit entries found for this filter.';
              tr.appendChild(td);
              auditTableBody.appendChild(tr);
              return;
            }

            rows.forEach(row => {
              const tr = document.createElement('tr');
              const storageName = row.storageName || '';
              const storageId = row.storageId || '';
              let storageLabel = storageName || storageId || '';
              if (storageName && storageId && storageName !== storageId) {
                storageLabel = `${storageName} (${storageId})`;
              }
              const cols = [
                row.ts || '',
                row.user || '',
                row.action || '',
                row.source || '',
                storageLabel,
                row.folder || '',
                row.path || '',
                row.from || '',
                row.to || '',
                row.ip || '',
                row.ua || '',
                row.meta || ''
              ];

              cols.forEach((val, idx) => {
                const td = document.createElement('td');
                let text = val;
                if (idx === 11 && val && typeof val === 'object') {
                  try { text = JSON.stringify(val); } catch (e) { text = ''; }
                }
                if (idx === 10 && typeof text === 'string' && text.length > 30) {
                  td.title = text;
                  text = text.slice(0, 30) + '...';
                }
                if (idx === 11 && typeof text === 'string' && text.length > 160) {
                  td.title = text;
                  text = text.slice(0, 160) + '...';
                }
                td.textContent = (text == null ? '' : String(text));
                tr.appendChild(td);
              });
              auditTableBody.appendChild(tr);
            });
          };

          const loadAuditLogs = async () => {
            if (!auditStatusEl) return;
            if (!isPro || !proAuditAvailable) {
              auditStatusEl.textContent = auditHelpText || 'Audit Logs are not available.';
              return;
            }
            auditStatusEl.textContent = 'Loading audit logs...';
            if (auditTableBody) auditTableBody.textContent = '';
            try {
              const params = auditFilters();
              const url = withBase('/api/pro/audit/list.php?' + params.toString());
              const res = await fetch(url, { credentials: 'include' });
              const data = await safeJson(res);
              const rows = data && Array.isArray(data.rows) ? data.rows : [];
              renderAuditRows(rows);
              auditStatusEl.textContent = data && data.truncated
                ? 'Showing latest results (truncated).'
                : 'Loaded ' + rows.length + ' entries.';
            } catch (e) {
              console.error('Audit log load error', e);
              auditStatusEl.textContent = (e && e.message) ? e.message : 'Failed to load audit logs.';
              renderAuditRows([]);
            }
          };

          const refreshBtn = document.getElementById('auditRefreshBtn');
          if (refreshBtn && !refreshBtn.__wired) {
            refreshBtn.__wired = true;
            refreshBtn.addEventListener('click', loadAuditLogs);
          }

          const exportBtn = document.getElementById('auditExportBtn');
          if (exportBtn && !exportBtn.__wired) {
            exportBtn.__wired = true;
            exportBtn.addEventListener('click', () => {
              if (!isPro || !proAuditAvailable) {
                showToast(t('admin_audit_logs_unavailable'));
                return;
              }
              const params = auditFilters();
              const url = withBase('/api/pro/audit/exportCsv.php?' + params.toString());
              window.location.href = url;
            });
          }

          // Initial load for admins if available
          if (isPro && proAuditAvailable) {
            loadAuditLogs();
          }

          // Ensure header toggle works even if the core listener missed it
          const pfHeader = document.getElementById('proFeaturesHeader');
          if (pfHeader && !pfHeader.__wired) {
            pfHeader.__wired = true;
            pfHeader.addEventListener('click', () => toggleSection('proFeatures'));
          }
        }

        document.getElementById("saveAdminSettings")
          .addEventListener("click", handleSave);

        const loginToggleIds = ["enableFormLogin", "enableBasicAuth", "enableOIDCLogin"];

        const ensureAtLeastOneLogin = (changedEl) => {
          const proxyEl = document.getElementById("authBypass");
          const proxyOnly = !!proxyEl && proxyEl.checked;

          const enabledCount = loginToggleIds
            .map(id => document.getElementById(id))
            .filter(el => el && el.checked).length;

          // If proxy-only is OFF, we require at least one login method
          if (!proxyOnly && enabledCount === 0 && changedEl) {
            showToast(t("at_least_one_login_method"));
            changedEl.checked = true;
          }
        };

        loginToggleIds.forEach(id => {
          const el = document.getElementById(id);
          if (!el) return;
          el.addEventListener("change", (e) => {
            ensureAtLeastOneLogin(e.target);
          });
        });

        const authBypassEl = document.getElementById("authBypass");
        if (authBypassEl) {
          authBypassEl.addEventListener("change", (e) => {
            const checked = e.target.checked;

            if (checked) {
              // Proxy-only: switch off all built-in logins
              loginToggleIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.checked = false;
              });
            } else {
              // Leaving proxy-only: if everything is off, enable login form by default
              const enabledCount = loginToggleIds
                .map(id => document.getElementById(id))
                .filter(el => el && el.checked).length;
              if (enabledCount === 0) {
                const fallback = document.getElementById("enableFormLogin");
                if (fallback) fallback.checked = true;
              }
            }
          });
        }



        const userMgmt = document.getElementById("userManagementContent");
        userMgmt?.removeEventListener("click", window.__userMgmtDelegatedClick);
        window.__userMgmtDelegatedClick = (e) => {
          const flagsBtn = e.target.closest("#adminOpenUserFlags");
          if (flagsBtn) { e.preventDefault(); openUserFlagsModal(); }
          const folderBtn = e.target.closest("#adminOpenUserPermissions");
          if (folderBtn) { e.preventDefault(); openUserPermissionsModal(); }
        };
        userMgmt?.addEventListener("click", window.__userMgmtDelegatedClick);

        const loginOpts = config.loginOptions || {};
        const formEnabled = !(loginOpts.disableFormLogin === true);
        const basicEnabled = !(loginOpts.disableBasicAuth === true);
        const oidcEnabled = !(loginOpts.disableOIDCLogin === true);
        const proxyOnly = !!loginOpts.authBypass;

        document.getElementById("enableFormLogin").checked = formEnabled;
        document.getElementById("enableBasicAuth").checked = basicEnabled;
        document.getElementById("enableOIDCLogin").checked = oidcEnabled;
        document.getElementById("authBypass").checked = proxyOnly;
        document.getElementById("authHeaderName").value = loginOpts.authHeaderName || "X-Remote-User";

        // If proxy-only is on, force all built-in login toggles off
        if (proxyOnly) {
          ["enableFormLogin", "enableBasicAuth", "enableOIDCLogin"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.checked = false;
          });
        }

        document.getElementById("enableWebDAV").checked = config.enableWebDAV === true;
        document.getElementById("sharedMaxUploadSize").value = config.sharedMaxUploadSize || "";
        const uploadCfg = (config.uploads && typeof config.uploads === "object") ? config.uploads : {};
        const chunkEl = document.getElementById("resumableChunkMb");
        if (chunkEl) {
          const raw = uploadCfg.resumableChunkMb;
          const num = parseFloat(raw);
          const val = Number.isFinite(num) ? Math.min(100, Math.max(0.5, num)) : 1.5;
          chunkEl.value = val;
        }
        const ttlEl = document.getElementById("resumableTtlHours");
        if (ttlEl) {
          const raw = uploadCfg.resumableTtlHours;
          const num = parseFloat(raw);
          const val = Number.isFinite(num) ? Math.min(168, Math.max(0.5, num)) : 6;
          ttlEl.value = val;
        }

        // Published URL (optional)
        const deploy = (config && config.deployment && typeof config.deployment === 'object') ? config.deployment : {};
        const pubEl = document.getElementById("publishedUrl");
        if (pubEl) {
          pubEl.value = (deploy.publishedUrl || "").toString();
          if (deploy.publishedUrlLockedByEnv) {
            pubEl.disabled = true;
            pubEl.dataset.locked = "1";
            pubEl.value = (deploy.publishedUrlEffective || deploy.publishedUrl || "").toString();
          } else {
            pubEl.disabled = false;
            pubEl.dataset.locked = "0";
          }
        }
        // FFmpeg path (optional)
        const ffmpegEl = document.getElementById("ffmpegPath");
        if (ffmpegEl) {
          const locked = !!config.ffmpegPathLockedByEnv;
          const val = locked
            ? (config.ffmpegPathEffective || config.ffmpegPath || "")
            : (config.ffmpegPath || "");
          ffmpegEl.value = (val || "").toString();
          ffmpegEl.disabled = locked;
          ffmpegEl.dataset.locked = locked ? "1" : "0";
          const help = document.getElementById("ffmpegPathHelp");
          if (help) {
            help.textContent = locked ? ffmpegHelpLocked : ffmpegHelpDefault;
          }
        }
        // --- ClamAV toggle wiring ---
        const cfgClam = config.clamav || {};
        const clamChk = document.getElementById("clamavScanUploads");
        if (clamChk) {
          clamChk.checked = !!cfgClam.scanUploads;

          if (cfgClam.lockedByEnv) {
            // Env var VIRUS_SCAN_ENABLED is controlling this – show as read-only
            clamChk.disabled = true;
            const help = document.getElementById("clamavScanUploadsHelp");
            if (help) {
              help.textContent =
                'Controlled by container env VIRUS_SCAN_ENABLED (' +
                (cfgClam.scanUploads ? 'enabled' : 'disabled') +
                '). Change it in your Docker/host env.';
            }
          }
        }
        const clamExclude = document.getElementById("clamavExcludeDirs");
        if (clamExclude) {
          clamExclude.value = (cfgClam.excludeDirs || "").toString();
          if (cfgClam.excludeLockedByEnv) {
            clamExclude.disabled = true;
            const help = document.getElementById("clamavExcludeDirsHelp");
            if (help) {
              help.textContent =
                'Controlled by container env VIRUS_SCAN_EXCLUDE_DIRS. Change it in your Docker/host env.';
            }
          }
        }
        // Rebuild ONLYOFFICE section from fresh config
        initOnlyOfficeUI({ config });

        captureInitialAdminConfig();

      } else {
        mdl.style.display = "flex";
        const hasId = !!(config.oidc && config.oidc.hasClientId);
        const hasSecret = !!(config.oidc && config.oidc.hasClientSecret);

        const loginOpts = config.loginOptions || {};
        const formEnabled = !(loginOpts.disableFormLogin === true);
        const basicEnabled = !(loginOpts.disableBasicAuth === true);
        const oidcEnabled = !(loginOpts.disableOIDCLogin === true);
        const proxyOnly = !!loginOpts.authBypass;

        document.getElementById("enableFormLogin").checked = formEnabled;
        document.getElementById("enableBasicAuth").checked = basicEnabled;
        document.getElementById("enableOIDCLogin").checked = oidcEnabled;
        document.getElementById("authBypass").checked = proxyOnly;
        document.getElementById("authHeaderName").value = loginOpts.authHeaderName || "X-Remote-User";

        if (proxyOnly) {
          ["enableFormLogin", "enableBasicAuth", "enableOIDCLogin"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.checked = false;
          });
        }

        document.getElementById("enableWebDAV").checked = config.enableWebDAV === true;
        document.getElementById("sharedMaxUploadSize").value = config.sharedMaxUploadSize || "";
        const uploadCfg2 = (config.uploads && typeof config.uploads === "object") ? config.uploads : {};
        const chunkEl2 = document.getElementById("resumableChunkMb");
        if (chunkEl2) {
          const raw = uploadCfg2.resumableChunkMb;
          const num = parseFloat(raw);
          const val = Number.isFinite(num) ? Math.min(100, Math.max(0.5, num)) : 1.5;
          chunkEl2.value = val;
        }
        const ttlEl2 = document.getElementById("resumableTtlHours");
        if (ttlEl2) {
          const raw = uploadCfg2.resumableTtlHours;
          const num = parseFloat(raw);
          const val = Number.isFinite(num) ? Math.min(168, Math.max(0.5, num)) : 6;
          ttlEl2.value = val;
        }

        // Published URL (optional)
        const deploy2 = (config && config.deployment && typeof config.deployment === 'object') ? config.deployment : {};
        const pubEl2 = document.getElementById("publishedUrl");
        if (pubEl2) {
          pubEl2.value = (deploy2.publishedUrl || "").toString();
          if (deploy2.publishedUrlLockedByEnv) {
            pubEl2.disabled = true;
            pubEl2.dataset.locked = "1";
            pubEl2.value = (deploy2.publishedUrlEffective || deploy2.publishedUrl || "").toString();
          } else {
            pubEl2.disabled = false;
            pubEl2.dataset.locked = "0";
          }
        }
        // FFmpeg path (optional)
        const ffmpegEl2 = document.getElementById("ffmpegPath");
        if (ffmpegEl2) {
          const locked = !!config.ffmpegPathLockedByEnv;
          const val = locked
            ? (config.ffmpegPathEffective || config.ffmpegPath || "")
            : (config.ffmpegPath || "");
          ffmpegEl2.value = (val || "").toString();
          ffmpegEl2.disabled = locked;
          ffmpegEl2.dataset.locked = locked ? "1" : "0";
          const help = document.getElementById("ffmpegPathHelp");
          if (help) {
            help.textContent = locked ? ffmpegHelpLocked : ffmpegHelpDefault;
          }
        }
        const ignoreEl = document.getElementById("ignoreRegex");
        if (ignoreEl) {
          const locked = !!config.ignoreRegexLockedByEnv;
          const val = locked
            ? (config.ignoreRegexEffective || "")
            : (config.ignoreRegex || "");
          ignoreEl.value = (val || "").toString();
          ignoreEl.disabled = locked;
          ignoreEl.dataset.locked = locked ? "1" : "0";
        }
        // --- ClamAV toggle wiring (refresh) ---
        const cfgClam = config.clamav || {};
        const clamChk = document.getElementById("clamavScanUploads");
        if (clamChk) {
          clamChk.checked = !!cfgClam.scanUploads;

          // Reset any previous disabled/help, then re-apply
          clamChk.disabled = false;
          const help = document.getElementById("clamavScanUploadsHelp");
          if (help) {
            help.textContent =
              'Files are scanned with ClamAV before being accepted. This may impact upload speed.';
          }

          if (cfgClam.lockedByEnv) {
            clamChk.disabled = true;
            if (help) {
              help.textContent =
                'Controlled by container env VIRUS_SCAN_ENABLED (' +
                (cfgClam.scanUploads ? 'enabled' : 'disabled') +
                '). Change it in your Docker/host env.';
            }
          }
        }
        const clamExclude = document.getElementById("clamavExcludeDirs");
        if (clamExclude) {
          clamExclude.value = (cfgClam.excludeDirs || "").toString();
          clamExclude.disabled = false;
          const help = document.getElementById("clamavExcludeDirsHelp");
          if (help) {
            help.textContent =
              'Comma or newline separated paths relative to the source root (example: snapshot, tmp). For Pro sources you can prefix with source id (example: s3:/snapshot).';
          }
          if (cfgClam.excludeLockedByEnv) {
            clamExclude.disabled = true;
            if (help) {
              help.textContent =
                'Controlled by container env VIRUS_SCAN_EXCLUDE_DIRS. Change it in your Docker/host env.';
            }
          }
        }
        const uploadScope = document.getElementById("uploadContent");
        const headerSettingsScope = document.getElementById("headerSettingsContent");
        wireIgnoreRegexPresetButton(headerSettingsScope);
        wireClamavTestButton(uploadScope);
        wireResumableCleanupButton(uploadScope);
        initVirusLogUI({ isPro });
        renderAdminEncryptionSection({ config, dark });
        document.getElementById("oidcProviderUrl").value = window.currentOIDCConfig?.providerUrl || "";
        const publicClientChk = document.getElementById("oidcPublicClient");
        if (publicClientChk) {
          publicClientChk.checked = !!window.currentOIDCConfig?.publicClient;
        }
        const idEl = document.getElementById("oidcClientId");
        const secEl = document.getElementById("oidcClientSecret");
        if (!hasId) idEl.value = window.currentOIDCConfig?.clientId || "";
        if (!hasSecret) secEl.value = window.currentOIDCConfig?.clientSecret || "";
        const oidcScope = document.getElementById("oidcContent") || document.getElementById("loginOptionsContent");
        if (oidcScope) {
          wireReplaceButtons(oidcScope);
          wireOidcTestButton(oidcScope);
        }
        document.getElementById("ooEnabled").checked = !!(config.onlyoffice && config.onlyoffice.enabled);
        document.getElementById("ooDocsOrigin").value = (config.onlyoffice && config.onlyoffice.docsOrigin) ? config.onlyoffice.docsOrigin : "";
        const ooCont = document.getElementById("onlyofficeContent");
        if (ooCont) wireReplaceButtons(ooCont);
        document.getElementById("oidcClientSecret").value = window.currentOIDCConfig?.clientSecret || "";
        document.getElementById("oidcRedirectUri").value = window.currentOIDCConfig?.redirectUri || "";
        document.getElementById("globalOtpauthUrl").value = window.currentOIDCConfig?.globalOtpauthUrl || '';
        const oidcDebugEl = document.getElementById('oidcDebugLogging');
        if (oidcDebugEl) {
          oidcDebugEl.checked = !!(config.oidc && config.oidc.debugLogging);
        }
        const oidcAllowDemoteEl = document.getElementById('oidcAllowDemote');
        if (oidcAllowDemoteEl) {
          oidcAllowDemoteEl.checked = !!(config.oidc && config.oidc.allowDemote);
        }
        if (oidcScope) {
          wireOidcDebugSnapshotButton(oidcScope);
        }

        // Refresh Pro features section when reopening
        const pfHeader = document.getElementById('proFeaturesHeader');
        if (pfHeader) {
          const iconHtml = '<i class="material-icons">expand_more</i>';
          const pill = (!isPro || !proSearchApiOk || !proAuditAvailable)
            ? '<span class="btn-pro-pill" style="position:static; display:inline-flex; align-items:center; margin:0;">Pro</span>'
            : '';
          const labelHtml = `<span style="display:inline-flex;align-items:center;gap:6px;">Pro Features${pill}</span> ${iconHtml}`;
          const inner = pfHeader.querySelector('.section-header-inner');
          if (inner) {
            inner.innerHTML = labelHtml;
          } else {
            pfHeader.innerHTML = `<div class="section-header-inner">${labelHtml}</div>`;
          }
        }
        const psToggle = document.getElementById("proSearchEnabled");
        const psLimit = document.getElementById("proSearchLimit");
        if (psToggle) {
          psToggle.checked = proSearchEnabled;
          if (proSearchLocked) {
            psToggle.dataset.locked = "1";
          } else {
            psToggle.removeAttribute("data-locked");
          }
        }
        if (psLimit) {
          psLimit.value = proSearchDefaultLimit;
        }
        const syncPs = () => {
          if (!psToggle || !psLimit) return;
          const locked = psToggle.dataset.locked === "1" || !isPro || !proSearchApiOk;
          psLimit.disabled = locked || !psToggle.checked;
        };
        if (psToggle && !psToggle.__wired) {
          psToggle.__wired = true;
          psToggle.addEventListener("change", syncPs);
        }
        syncPs();
        captureInitialAdminConfig();
      }
      try {
        initAdminStorageSection({
          isPro,
          modalEl: mdl
        });
      } catch (e) {
        console.error('Failed to init Storage / Disk Usage section', e);
      }

      try {
        initAdminSponsorSection({
          container: document.getElementById('sponsorContent'),
          t,
          tf,
          showToast
        });
      } catch (e) {
        console.error('Failed to init Thanks / Sponsor / Donations section', e);
      }
    })
    .catch(() => {/* if even fetching fails, open empty panel */ });
}

function handleSave() {
  const enableFormLogin = !!document.getElementById("enableFormLogin")?.checked;
  const enableBasicAuth = !!document.getElementById("enableBasicAuth")?.checked;
  const enableOIDCLogin = !!document.getElementById("enableOIDCLogin")?.checked;
  const proxyOnlyEnabled = !!document.getElementById("authBypass")?.checked;
  const oidcPublicClient = !!document.getElementById("oidcPublicClient")?.checked;

  const authHeaderName =
    (document.getElementById("authHeaderName")?.value || "").trim() ||
    "X-Remote-User";

  const payload = {
    header_title: document.getElementById("headerTitle")?.value || "",
    publishedUrl: (() => {
      const el = document.getElementById("publishedUrl");
      if (!el) return "";
      if (el.dataset.locked === "1") return el.value || "";
      return (el.value || "").trim();
    })(),
    ffmpegPath: (() => {
      const el = document.getElementById("ffmpegPath");
      if (!el) return "";
      if (el.dataset.locked === "1") return el.value || "";
      return (el.value || "").trim();
    })(),
    ignoreRegex: (document.getElementById("ignoreRegex")?.value || "").trim(),
    loginOptions: {
      // Backend still expects “disable*” flags:
      disableFormLogin: !enableFormLogin,
      disableBasicAuth: !enableBasicAuth,
      disableOIDCLogin: !enableOIDCLogin,
      authBypass: proxyOnlyEnabled,
      authHeaderName,
    },
    enableWebDAV: !!document.getElementById("enableWebDAV")?.checked,
    sharedMaxUploadSize: parseInt(
      document.getElementById("sharedMaxUploadSize").value || "0",
      10
    ) || 0,
    oidc: {
      providerUrl: document.getElementById("oidcProviderUrl").value.trim(),
      redirectUri: document
        .getElementById("oidcRedirectUri")
        .value.trim(),
      debugLogging: !!document.getElementById("oidcDebugLogging")?.checked,
      allowDemote: !!document.getElementById("oidcAllowDemote")?.checked,
      publicClient: oidcPublicClient,
      // clientId/clientSecret added conditionally below
    },
    globalOtpauthUrl: document
      .getElementById("globalOtpauthUrl")
      .value.trim(),
    branding: {
      customLogoUrl: (document.getElementById("brandingCustomLogoUrl")?.value || "").trim(),
      headerBgLight: (document.getElementById("brandingHeaderBgLight")?.value || "").trim(),
      headerBgDark: (document.getElementById("brandingHeaderBgDark")?.value || "").trim(),
      metaDescription: (document.getElementById("brandingMetaDescription")?.value || "").trim(),
      faviconSvg: (document.getElementById("brandingFaviconSvg")?.value || "").trim(),
      faviconPng: (document.getElementById("brandingFaviconPng")?.value || "").trim(),
      faviconIco: (document.getElementById("brandingFaviconIco")?.value || "").trim(),
      appleTouchIcon: (document.getElementById("brandingAppleTouchIcon")?.value || "").trim(),
      maskIcon: (document.getElementById("brandingMaskIcon")?.value || "").trim(),
      maskIconColor: (document.getElementById("brandingMaskIconColor")?.value || "").trim(),
      themeColorLight: (document.getElementById("brandingThemeColorLight")?.value || "").trim(),
      themeColorDark: (document.getElementById("brandingThemeColorDark")?.value || "").trim(),
      loginBgLight: (document.getElementById("brandingLoginBgLight")?.value || "").trim(),
      loginBgDark: (document.getElementById("brandingLoginBgDark")?.value || "").trim(),
      appBgLight: (document.getElementById("brandingAppBgLight")?.value || "").trim(),
      appBgDark: (document.getElementById("brandingAppBgDark")?.value || "").trim(),
      loginTagline: (document.getElementById("brandingLoginTagline")?.value || "").trim(),
      footerHtml: (document.getElementById("brandingFooterHtml")?.value || "").trim(),
    },
    display: {
      defaultLanguage: (document.getElementById("defaultLanguage")?.value || "en").trim(),
      hoverPreviewMaxImageMb: Math.max(
        1,
        Math.min(
          50,
          parseInt(document.getElementById("hoverPreviewMaxImageMb")?.value || "8", 10) || 8
        )
      ),
      hoverPreviewMaxVideoMb: Math.max(
        1,
        Math.min(
          2048,
          parseInt(document.getElementById("hoverPreviewMaxVideoMb")?.value || "200", 10) || 200
        )
      ),
      fileListSummaryDepth: Math.max(
        0,
        Math.min(
          10,
          Number.isFinite(parseInt(document.getElementById("fileListSummaryDepth")?.value || "2", 10))
            ? parseInt(document.getElementById("fileListSummaryDepth")?.value || "2", 10)
            : 2
          )
      ),
    },
    uploads: {
      resumableChunkMb: Math.max(
        0.5,
        Math.min(
          100,
          parseFloat(document.getElementById("resumableChunkMb")?.value || "1.5") || 1.5
        )
      ),
      resumableTtlHours: Math.max(
        0.5,
        Math.min(
          168,
          parseFloat(document.getElementById("resumableTtlHours")?.value || "6") || 6
        )
      ),
    },
    clamav: {
      scanUploads: document.getElementById("clamavScanUploads").checked,
      excludeDirs: (document.getElementById("clamavExcludeDirs")?.value || "").trim(),
    },
    proSearch: {
      enabled: !!document.getElementById("proSearchEnabled")?.checked,
      defaultLimit: Math.max(
        1,
        Math.min(
          200,
          parseInt(document.getElementById("proSearchLimit")?.value || "50", 10) || 50
        )
      ),
    },
    proAudit: {
      enabled: !!document.getElementById("proAuditEnabled")?.checked,
      level: (document.getElementById("proAuditLevel")?.value || "verbose").trim(),
      maxFileMb: Math.max(
        10,
        parseInt(document.getElementById("proAuditMaxFileMb")?.value || "200", 10) || 200
      ),
      maxFiles: Math.max(
        1,
        Math.min(
          10,
          parseInt(document.getElementById("proAuditMaxFiles")?.value || "10", 10) || 10
        )
      ),
    },
  };

  // --- OIDC extras (unchanged) ---
  const idEl = document.getElementById("oidcClientId");
  const scEl = document.getElementById("oidcClientSecret");

  const idVal = idEl?.value.trim() || '';
  const secVal = scEl?.value.trim() || '';
  const idFirstTime = idEl && !idEl.hasAttribute('data-replace');
  const secFirstTime = scEl && !scEl.hasAttribute('data-replace');

  if ((idEl?.dataset.replace === '1' || idFirstTime) && idVal !== '') {
    payload.oidc.clientId = idVal;
  }
  if (oidcPublicClient) {
    // Explicitly clear any stored secret when switching to public client mode
    payload.oidc.clientSecret = '';
  } else if ((scEl?.dataset.replace === '1' || secFirstTime) && secVal !== '') {
    payload.oidc.clientSecret = secVal;
  }

  // ONLYOFFICE settings (moved into adminOnlyOffice.js)
  collectOnlyOfficeSettingsForSave(payload);

  // --- save call (unchanged) ---
  fetch('/api/admin/updateConfig.php', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': (document.querySelector('meta[name="csrf-token"]')?.content || '')
    },
    body: JSON.stringify(payload)
  })
    .then(r => r.json())
    .then(j => {
      if (j.error) { showToast(t('error_prefix', { error: j.error })); return; }
      showToast(t('admin_settings_saved'));
      closeAdminPanel();
      applyHeaderColorsFromAdmin();
      updateHeaderLogoFromAdmin();
      applyFooterFromAdmin();
    })
    .catch(() => showToast(t('admin_settings_save_failed')));
}

export async function closeAdminPanel() {
  if (hasUnsavedChanges()) {
    //const ok = await showCustomConfirmModal(t("unsaved_changes_confirm"));
    //if (!ok) return;
  }
  const m = document.getElementById("adminPanelModal");
  if (m) m.style.display = "none";
}

async function fetchAllUserFlags() {
  const r = await fetch("/api/getUserPermissions.php", { credentials: "include" });
  const data = await r.json();
  if (data && typeof data === "object") {
    const map = data.allPermissions || data.permissions || data;
    if (map && typeof map === "object") {
      Object.values(map).forEach(u => { if (u && typeof u === "object") delete u.folderOnly; });
    }
  }
  if (Array.isArray(data)) {
    const out = {}; data.forEach(u => { if (u.username) out[u.username] = u; }); return out;
  }
  if (data && data.allPermissions) return data.allPermissions;
  if (data && data.permissions) return data.permissions;
  return data || {};
}

function flagRow(u, flags) {
  const f = flags[u.username] || {};
  const isAdmin = isAdminUser(u);

  const disabledAttr = isAdmin ? "disabled data-admin='1' title='Admin: full access'" : "";
  const note = isAdmin ? " <span class='muted'>(Admin)</span>" : "";

  return `
    <tr data-username="${u.username}" ${isAdmin ? "data-admin='1'" : ""}>
      <td><strong>${u.username}</strong>${note}</td>
      <td style="text-align:center;"><input type="checkbox" data-flag="readOnly"        ${f.readOnly ? "checked" : ""} ${disabledAttr}></td>
      <td style="text-align:center;"><input type="checkbox" data-flag="disableUpload"   ${f.disableUpload ? "checked" : ""} ${disabledAttr}></td>
      <td style="text-align:center;"><input type="checkbox" data-flag="canShare"        ${f.canShare ? "checked" : ""} ${disabledAttr}></td>
      <td style="text-align:center;"><input type="checkbox" data-flag="bypassOwnership" ${f.bypassOwnership ? "checked" : ""} ${disabledAttr}></td>
    </tr>
  `;
}

export async function openUserFlagsModal() {
  const isDark = document.body.classList.contains("dark-mode");
  const overlayBg = isDark ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.3)";
  const contentBg = isDark ? "#2c2c2c" : "#fff";
  const contentFg = isDark ? "#e0e0e0" : "#000";
  const borderCol = isDark ? "#555" : "#ccc";

  let modal = document.getElementById("userFlagsModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "userFlagsModal";
    modal.style.cssText = `
      position:fixed; inset:0; background:${overlayBg};
      display:flex; align-items:center; justify-content:center; z-index:3600;
    `;
    modal.innerHTML = `
      <div class="modal-content"
           style="background:${contentBg}; color:${contentFg};
                  padding:16px; max-width:900px; width:95%;
                  position:relative;
                  border:1px solid ${borderCol};">
        <span id="closeUserFlagsModal"
              class="editor-close-btn"
              style="right:8px; top:8px;">&times;</span>

        <h3>${tf("user_permissions", "User Permissions")}</h3>
        <p class="muted" style="margin-top:-6px;">
          ${tf("user_flags_help", "Non Admin User Account-level switches. These are NOT per-folder grants.")}
        </p>

        <div id="userFlagsBody"
             style="max-height:60vh; overflow:auto; margin:8px 0;">
          ${t("loading")}…
        </div>

        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button type="button" id="cancelUserFlags" class="btn btn-secondary">${t("cancel")}</button>
          <button type="button" id="saveUserFlags"   class="btn btn-primary">${t("save_permissions")}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById("closeUserFlagsModal").onclick = () => (modal.style.display = "none");
    document.getElementById("cancelUserFlags").onclick = () => (modal.style.display = "none");
    document.getElementById("saveUserFlags").onclick = saveUserFlags;
  } else {
    modal.style.background = overlayBg;
    const content = modal.querySelector(".modal-content");
    if (content) {
      content.style.background = contentBg;
      content.style.color = contentFg;
      content.style.border = `1px solid ${borderCol}`;
    }
  }

  modal.style.display = "flex";
  loadUserFlagsList();
}

async function loadUserFlagsList() {
  const body = document.getElementById("userFlagsBody");
  if (!body) return;
  body.textContent = `${t("loading")}…`;
  try {
    const users = await fetchAllUsers();
    const flagsMap = await fetchAllUserFlags();
    const rows = users.map(u => flagRow(u, flagsMap)).filter(Boolean).join("");
    body.innerHTML = `
      <table class="table table-sm" style="width:100%;">
        <thead>
          <tr>
            <th>${t("user")}</th>
            <th>${t("read_only")}</th>
            <th>${t("disable_upload")}</th>
            <th>${t("can_share")}</th>
            <th>${t("bypass_ownership")}</th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="6">${t("no_users_found")}</td></tr>`}</tbody>
      </table>
    `;
  } catch (e) {
    console.error(e);
    body.innerHTML = `<div class="muted">${t("error_loading_users")}</div>`;
  }
}

async function saveUserFlags() {
  const body = document.getElementById("userFlagsBody");
  const rows = body?.querySelectorAll("tbody tr[data-username]") || [];
  const permissions = [];
  rows.forEach(tr => {
    if (tr.getAttribute("data-admin") === "1") return; // don't send admin updates
    const username = tr.getAttribute("data-username");
    const get = k => tr.querySelector(`input[data-flag="${k}"]`).checked;
    permissions.push({
      username,
      readOnly: get("readOnly"),
      disableUpload: get("disableUpload"),
      canShare: get("canShare"),
      bypassOwnership: get("bypassOwnership")
    });
  });

  try {
    const res = await sendRequest("/api/updateUserPermissions.php", "PUT",
      { permissions },
      { "X-CSRF-Token": window.csrfToken }
    );
    if (res && res.success) {
      showToast(tf("user_permissions_updated_successfully", "User permissions updated successfully"));
      const m = document.getElementById("userFlagsModal");
      if (m) m.style.display = "none";
    } else {
      showToast(tf("error_updating_permissions", "Error updating permissions"), "error");
    }
  } catch (e) {
    console.error(e);
    showToast(tf("error_updating_permissions", "Error updating permissions"), "error");
  }
}

async function loadUserPermissionsList() {
  const listContainer = document.getElementById("userPermissionsList");
  if (!listContainer) return;
  listContainer.innerHTML = `<p>${t("loading")}…</p>`;

  try {
    // Load users + groups together (folders separately)
    const [usersRes, groupsMap] = await Promise.all([
      fetch("/api/getUsers.php", { credentials: "include" }).then(safeJson),
      fetchAllGroups().catch(() => ({}))
    ]);

    const users = Array.isArray(usersRes) ? usersRes : (usersRes.users || []);
    const groups = groupsMap && typeof groupsMap === "object" ? groupsMap : {};

    if (!users.length && !Object.keys(groups).length) {
      listContainer.innerHTML = "<p>" + t("no_users_found") + "</p>";
      return;
    }

    // Keep cache in sync with the groups UI
    __groupsCache = groups || {};

    const folders = await getAllFolders(true);
    const orderedFolders = ["root", ...folders.filter(f => f !== "root")];

    // Build map: username -> [groupName, ...]
    const userGroupMap = {};
    Object.keys(groups).forEach(gName => {
      const g = groups[gName] || {};
      const members = Array.isArray(g.members) ? g.members : [];
      members.forEach(m => {
        const u = String(m || "").trim();
        if (!u) return;
        if (!userGroupMap[u]) userGroupMap[u] = [];
        userGroupMap[u].push(gName);
      });
    });

    // Clear the container and render sections
    listContainer.innerHTML = "";

    // ====================
    // Groups section (top)
    // ====================
    const groupNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));
    if (groupNames.length) {
      const groupHeader = document.createElement("div");
      groupHeader.className = "muted";
      groupHeader.style.margin = "4px 0 6px";
      groupHeader.textContent = tf("groups_header", "Groups");
      listContainer.appendChild(groupHeader);

      groupNames.forEach(name => {
        const g = groups[name] || {};
        const label = g.label || name;
        const members = Array.isArray(g.members) ? g.members : [];
        const membersSummary = members.length
          ? members.join(", ")
          : tf("no_members", "No members yet");

        const row = document.createElement("div");
        row.classList.add("user-permission-row", "group-permission-row");
        row.setAttribute("data-group-name", name);
        row.style.padding = "6px 0";

        row.innerHTML = `
      <div class="user-perm-header" tabindex="0" role="button" aria-expanded="false"
           style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 8px;border-radius:12px;">
        <span class="perm-caret" style="display:inline-block; transform: rotate(-90deg); transition: transform 120ms ease;">▸</span>
        <i class="material-icons" style="font-size:18px;">group</i>
        <strong class="group-label"></strong>
        <span class="muted" style="margin-left:4px;font-size:11px;">
          (${tf("group_label", "group")})
        </span>
        <span class="muted members-summary" style="margin-left:auto;font-size:11px;"></span>
      </div>
      <div class="user-perm-details" style="display:none; margin:8px 0 12px;">
        <div class="folder-grants-box" data-loaded="0"></div>
      </div>
    `;

        // Safely inject dynamic text:
        const labelEl = row.querySelector('.group-label');
        if (labelEl) {
          labelEl.textContent = label; // no HTML, just text
        }

        const membersEl = row.querySelector('.members-summary');
        if (membersEl) {
          membersEl.textContent = `${tf("members_label", "Members")}: ${membersSummary}`;
        }

        const header = row.querySelector(".user-perm-header");
        const details = row.querySelector(".user-perm-details");
        const caret = row.querySelector(".perm-caret");
        const grantsBox = row.querySelector(".folder-grants-box");

        // Load this group's folder ACL (from __groupsCache) and show it read-only
        async function ensureLoaded() {
          if (grantsBox.dataset.loaded === "1") return;
          try {
            const group = __groupsCache[name] || {};
            const grants = group.grants || {};

            renderFolderGrantsUI(
              name,
              grantsBox,
              orderedFolders,
              grants
            );

            // Make it clear: edit in User groups → Edit folder access
            grantsBox.querySelectorAll('input[type="checkbox"]').forEach(cb => {
              cb.disabled = true;
              cb.title = tf(
                "edit_group_acl_in_user_groups",
                "Group ACL is read-only here. Use User groups → Edit folder access to change it."
              );
            });

            grantsBox.dataset.loaded = "1";
          } catch (e) {
            console.error(e);
            grantsBox.innerHTML = `<div class="muted">${tf("error_loading_group_grants", "Error loading group grants")}</div>`;
          }
        }

        function toggleOpen() {
          const willShow = details.style.display === "none";
          details.style.display = willShow ? "block" : "none";
          header.setAttribute("aria-expanded", willShow ? "true" : "false");
          caret.style.transform = willShow ? "rotate(0deg)" : "rotate(-90deg)";
          if (willShow) ensureLoaded();
        }

        header.addEventListener("click", toggleOpen);
        header.addEventListener("keydown", e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleOpen();
          }
        });

        listContainer.appendChild(row);
      });

      // divider between groups and users
      const hr = document.createElement("hr");
      hr.style.margin = "6px 0 10px";
      hr.style.border = "0";
      hr.style.borderTop = "1px solid rgba(0,0,0,0.08)";
      listContainer.appendChild(hr);
    }

    // =================
    // Users section
    // =================
    const sortedUsers = users.slice().sort((a, b) => {
      const ua = String(a.username || "").toLowerCase();
      const ub = String(b.username || "").toLowerCase();
      return ua.localeCompare(ub);
    });

    sortedUsers.forEach(user => {
      const username = String(user.username || "").trim();
      const isAdmin = isAdminUser(user);

      const groupsForUser = userGroupMap[username] || [];
      const groupBadges = groupsForUser.length
        ? (() => {
          const labels = groupsForUser.map(gName => {
            const g = groups[gName] || {};
            return g.label || gName;
          });
          return `<span class="muted" style="margin-left:8px;font-size:11px;">${tf("member_of_groups", "Groups")}: ${labels.join(", ")}</span>`;
        })()
        : "";

      const row = document.createElement("div");
      row.classList.add("user-permission-row");
      row.setAttribute("data-username", username);
      if (isAdmin) row.setAttribute("data-admin", "1");
      row.style.padding = "6px 0";

      row.innerHTML = `
    <div class="user-perm-header" tabindex="0" role="button" aria-expanded="false"
         style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 8px;border-radius:12px;">
      <span class="perm-caret" style="display:inline-block; transform: rotate(-90deg); transition: transform 120ms ease;">▸</span>
      <i class="material-icons" style="font-size:18px;">person</i>
      <strong>${username}</strong>
      ${groupBadges}
      ${isAdmin ? `<span class="muted" style="margin-left:auto;">Admin (full access)</span>`
          : `<span class="muted" style="margin-left:auto;">${tf('click_to_edit', 'Click to edit')}</span>`}
    </div>
    <div class="user-perm-details" style="display:none; margin:8px 0 12px;">
      <div class="folder-grants-box" data-loaded="0"></div>
    </div>
  `;

      const header = row.querySelector(".user-perm-header");
      const details = row.querySelector(".user-perm-details");
      const caret = row.querySelector(".perm-caret");
      const grantsBox = row.querySelector(".folder-grants-box");

      async function ensureLoaded() {
        if (grantsBox.dataset.loaded === "1") return;
        try {
          let grants;
          const orderedFolders = ["root", ...folders.filter(f => f !== "root")];

          if (isAdmin) {
            // synthesize full access
            grants = buildFullGrantsForAllFolders(orderedFolders);
            renderFolderGrantsUI(user.username, grantsBox, orderedFolders, grants);
            grantsBox.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.disabled = true);
          } else {
            const userGrants = await getUserGrants(user.username);
            renderFolderGrantsUI(user.username, grantsBox, orderedFolders, userGrants);

            // NEW: overlay group-based grants so you can't uncheck them here
            const groupMask = computeGroupGrantMaskForUser(user.username, orderedFolders);

            // If you already build a userGroupMap somewhere, you can pass the exact groups;
            // otherwise we can recompute the list of group names from __groupsCache:
            const groupsForUser = [];
            if (__groupsCache && typeof __groupsCache === "object") {
              Object.keys(__groupsCache).forEach(gName => {
                const g = __groupsCache[gName] || {};
                const members = Array.isArray(g.members) ? g.members : [];
                if (members.some(m => String(m || "").trim().toLowerCase() === String(user.username || "").trim().toLowerCase())) {
                  groupsForUser.push(gName);
                }
              });
            }

            applyGroupLocksForUser(user.username, grantsBox, groupMask, groupsForUser);
          }

          grantsBox.dataset.loaded = "1";
        } catch (e) {
          console.error(e);
          grantsBox.innerHTML = `<div class="muted">${tf("error_loading_user_grants", "Error loading user grants")}</div>`;
        }
      }

      function toggleOpen() {
        const willShow = details.style.display === "none";
        details.style.display = willShow ? "block" : "none";
        header.setAttribute("aria-expanded", willShow ? "true" : "false");
        caret.style.transform = willShow ? "rotate(0deg)" : "rotate(-90deg)";
        if (willShow) ensureLoaded();
      }

      header.addEventListener("click", toggleOpen);
      header.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleOpen(); }
      });

      listContainer.appendChild(row);
    });
  } catch (err) {
    console.error(err);
    listContainer.innerHTML = "<p>" + t("error_loading_users") + "</p>";
  }
}
