// adminPanel.js
import { t } from './i18n.js?v={{APP_QVER}}';
import { loadAdminConfigFunc } from './auth.js?v={{APP_QVER}}';
import { showToast, toggleVisibility, attachEnterKeyListener } from './domUtils.js?v={{APP_QVER}}';
import { sendRequest } from './networkUtils.js?v={{APP_QVER}}';
import { initAdminStorageSection } from './adminStorage.js?v={{APP_QVER}}';
import { initAdminSponsorSection } from './adminSponsor.js?v={{APP_QVER}}';
import { initOnlyOfficeUI, collectOnlyOfficeSettingsForSave } from './adminOnlyOffice.js?v={{APP_QVER}}';
import { openClientPortalsModal } from './adminPortals.js?v={{APP_QVER}}';

function normalizeLogoPath(raw) {
  if (!raw) return '';
  const parts = String(raw).split(':');
  let pic = parts[parts.length - 1];
  pic = pic.replace(/^:+/, '');
  if (pic && !pic.startsWith('/')) pic = '/' + pic;
  return pic;
}

const version = window.APP_VERSION || "dev";
// Hard-coded *FOR NOW* latest FileRise Pro bundle version for UI hints only.
// Update this when I cut a new Pro ZIP.
const PRO_LATEST_BUNDLE_VERSION = 'v1.2.1';

function getAdminTitle(isPro, proVersion) {
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
    ? `
      <a
        href="https://filerise.net/pro/update.php"
        target="_blank"
        rel="noopener noreferrer"
        class="badge badge-pill badge-warning admin-pro-badge"
        style="cursor:pointer; text-decoration:none; margin-left:4px;">
        Pro update available
      </a>
    `
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

    let url = (input && input.value.trim()) || '';

    // If they used a bare "uploads/..." path, normalize to "/uploads/..."
    if (url && !url.startsWith('/') && url.startsWith('uploads/')) {
      url = '/' + url;
    }

    // ---- Sanitize URL (mirror AdminModel::sanitizeLogoUrl) ----
    const isHttp = /^https?:\/\//i.test(url);
    const isSiteRelative = url.startsWith('/') && !url.includes('://');

    // Strip any CR/LF just in case
    url = url.replace(/[\r\n]+/g, '');

    if (url && (isHttp || isSiteRelative)) {
      // safe enough for <img src="...">
      logoImg.setAttribute('src', url);
      logoImg.setAttribute('alt', 'Site logo');
    } else {
      // fall back to default FileRise logo
      logoImg.setAttribute('src', '/assets/logo.svg?v={{APP_QVER}}');
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
    const title = (val || '').trim() || 'FileRise';
    const h1 = document.querySelector('.header-title h1');
    if (h1) h1.textContent = title;
    document.title = title;
    window.headerTitle = val || ''; // preserve raw value user typed
    try { localStorage.setItem('headerTitle', title); } catch { }
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

// --- tiny robust JSON helper ---
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

let originalAdminConfig = {};
function captureInitialAdminConfig() {
  const ht = document.getElementById("headerTitle");
  originalAdminConfig = {
    headerTitle: ht ? ht.value.trim() : "",
    oidcProviderUrl: (document.getElementById("oidcProviderUrl")?.value || "").trim(),
    oidcClientId: (document.getElementById("oidcClientId")?.value || "").trim(),
    oidcClientSecret: (document.getElementById("oidcClientSecret")?.value || "").trim(),
    oidcRedirectUri: (document.getElementById("oidcRedirectUri")?.value || "").trim(),
    disableFormLogin: !!document.getElementById("disableFormLogin")?.checked,
    disableBasicAuth: !!document.getElementById("disableBasicAuth")?.checked,
    disableOIDCLogin: !!document.getElementById("disableOIDCLogin")?.checked,
    enableWebDAV: !!document.getElementById("enableWebDAV")?.checked,
    sharedMaxUploadSize: (document.getElementById("sharedMaxUploadSize")?.value || "").trim(),
    globalOtpauthUrl: (document.getElementById("globalOtpauthUrl")?.value || "").trim(),
    brandingCustomLogoUrl: (document.getElementById("brandingCustomLogoUrl")?.value || "").trim(),
    brandingHeaderBgLight: (document.getElementById("brandingHeaderBgLight")?.value || "").trim(),
    brandingHeaderBgDark: (document.getElementById("brandingHeaderBgDark")?.value || "").trim(),
    brandingFooterHtml: (document.getElementById("brandingFooterHtml")?.value || "").trim(),
  };
}
function hasUnsavedChanges() {
  const o = originalAdminConfig;
  const getVal = id => (document.getElementById(id)?.value || "").trim();
  const getChk = id => !!document.getElementById(id)?.checked;
  return (
    getVal("headerTitle") !== o.headerTitle ||
    getVal("oidcProviderUrl") !== o.oidcProviderUrl ||
    getVal("oidcClientId") !== o.oidcClientId ||
    getVal("oidcClientSecret") !== o.oidcClientSecret ||
    getVal("oidcRedirectUri") !== o.oidcRedirectUri ||
    getChk("disableFormLogin") !== o.disableFormLogin ||
    getChk("disableBasicAuth") !== o.disableBasicAuth ||
    getChk("disableOIDCLogin") !== o.disableOIDCLogin ||
    getChk("enableWebDAV") !== o.enableWebDAV ||
    getVal("sharedMaxUploadSize") !== o.sharedMaxUploadSize ||
    getVal("globalOtpauthUrl") !== o.globalOtpauthUrl ||
    getVal("brandingCustomLogoUrl") !== (o.brandingCustomLogoUrl || "") ||
    getVal("brandingHeaderBgLight") !== (o.brandingHeaderBgLight || "") ||
    getVal("brandingHeaderBgDark") !== (o.brandingHeaderBgDark || "") ||
    getVal("brandingFooterHtml") !== (o.brandingFooterHtml || "")
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

function toggleSection(id) {
  const hdr = document.getElementById(id + "Header");
  const cnt = document.getElementById(id + "Content");
  if (!hdr || !cnt) return;
  const isCollapsedNow = hdr.classList.toggle("collapsed");
  cnt.style.display = isCollapsedNow ? "none" : "block";
  if (!isCollapsedNow && id === "shareLinks") {
    loadShareLinksSection();
  }
}

export function initProBundleInstaller() {
  try {
    const fileInput = document.getElementById('proBundleFile');
    const btn = document.getElementById('btnInstallProBundle');
    const statusEl = document.getElementById('proBundleStatus');

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

      const formData = new FormData();
      formData.append('bundle', file);

      statusEl.textContent = 'Uploading and installing Pro bundle...';
      statusEl.className = 'small text-muted';

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

        // Clear file input so repeat installs feel "fresh"
        try { fileInput.value = ''; } catch (_) {}

        // Keep existing behavior: refresh any admin config in the header, etc.
        if (typeof loadAdminConfigFunc === 'function') {
          loadAdminConfigFunc();
        }
        setTimeout(() => {
          window.location.reload();
        }, 800);
      } catch (e) {
        statusEl.textContent = 'Install failed: ' + (e && e.message ? e.message : String(e));
        statusEl.className = 'small text-danger';
      }
    });
  } catch (e) {
    console.warn('Failed to init Pro bundle installer', e);
  }
}

function loadShareLinksSection() {
  const container = document.getElementById("shareLinksContent");
  if (!container) return;
  container.textContent = t("loading") + "...";

  function fetchMeta(fileName) {
    return fetch(`/api/admin/readMetadata.php?file=${encodeURIComponent(fileName)}`, {
      credentials: "include"
    })
      .then(resp => resp.ok ? resp.json() : {})
      .catch(() => ({}));
  }

  Promise.all([
    fetchMeta("share_folder_links.json"),
    fetchMeta("share_links.json")
  ])
    .then(([folders, files]) => {
      const hasAny = Object.keys(folders).length || Object.keys(files).length;
      if (!hasAny) {
        container.innerHTML = `<p>${t("no_shared_links_available")}</p>`;
        return;
      }

      let html = `<h5>${t("folder_shares")}</h5><ul>`;
      Object.entries(folders).forEach(([token, o]) => {
        const lock = o.password ? "🔒 " : "";
        html += `
          <li>
            ${lock}<strong>${o.folder}</strong>
            <small>(${new Date(o.expires * 1000).toLocaleString()})</small>
            <button type="button"
                    data-key="${token}"
                    data-type="folder"
                    class="btn btn-sm btn-link delete-share">🗑️</button>
          </li>`;
      });

      html += `</ul><h5 style="margin-top:1em;">${t("file_shares")}</h5><ul>`;
      Object.entries(files).forEach(([token, o]) => {
        const lock = o.password ? "🔒 " : "";
        html += `
          <li>
            ${lock}<strong>${o.folder}/${o.file}</strong>
            <small>(${new Date(o.expires * 1000).toLocaleString()})</small>
            <button type="button"
                    data-key="${token}"
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
          const isFolder = btn.dataset.type === "folder";
          const endpoint = isFolder
            ? "/api/folder/deleteShareFolderLink.php"
            : "/api/file/deleteShareLink.php";

          fetch(endpoint, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ token })
          })
            .then(res => res.ok ? res.json() : Promise.reject(res))
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
      if (config.header_title) {
        const h = document.querySelector(".header-title h1");
        if (h) h.textContent = config.header_title;
        window.headerTitle = config.header_title;
      }
      if (config.oidc) Object.assign(window.currentOIDCConfig, config.oidc);
      if (config.globalOtpauthUrl) window.currentOIDCConfig.globalOtpauthUrl = config.globalOtpauthUrl;

      const dark = document.body.classList.contains("dark-mode");
      const proInfo = config.pro || {};
      const isPro = !!proInfo.active;
      const proType = proInfo.type || '';
      const proEmail = proInfo.email || '';
      const proVersion = proInfo.version || 'not installed';
      const proLicense = proInfo.license || '';
            // New: richer license metadata from FR_PRO_INFO / backend
            const proPlan = proInfo.plan || '';            // e.g. "early_supporter_1x", "personal_yearly"
            const proExpiresAt = proInfo.expiresAt || '';  // ISO timestamp string or ""
            const proMaxMajor = (
              typeof proInfo.maxMajor === 'number'
                ? proInfo.maxMajor
                : (proInfo.maxMajor ? Number(proInfo.maxMajor) : null)
            );
      const brandingCfg = config.branding || {};
      const brandingCustomLogoUrl = brandingCfg.customLogoUrl || "";
      const brandingHeaderBgLight = brandingCfg.headerBgLight || "";
      const brandingHeaderBgDark = brandingCfg.headerBgDark || "";
      const brandingFooterHtml = brandingCfg.footerHtml || "";
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
        mdl.innerHTML = `
          <div class="modal-content" style="${inner}">
            <div class="editor-close-btn" id="closeAdminPanel">&times;</div>
            <h3>${getAdminTitle(isPro, proVersion)}</h3>
            <form id="adminPanelForm">
            ${[
            { id: "userManagement", label: t("user_management") },
            { id: "headerSettings", label: tf("header_footer_settings", "Header & Footer settings") },
            { id: "loginOptions", label: t("login_options") },
            { id: "webdav", label: "WebDAV Access" },
            { id: "onlyoffice", label: "ONLYOFFICE" },
            { id: "upload", label: t("shared_max_upload_size_bytes_title") },
            { id: "oidc", label: t("oidc_configuration") + " & TOTP" },
            { id: "shareLinks", label: t("manage_shared_links") },
            { id: "storage", label: "Storage / Disk Usage" },
            { id: "pro", label: "FileRise Pro" },
            { id: "sponsor", label: (typeof tf === 'function' ? tf("sponsor_donations", "Sponsor / Donations") : "Sponsor / Donations") }
          ].map(sec => `
              <div id="${sec.id}Header" class="section-header collapsed">
                ${sec.label} <i class="material-icons">expand_more</i>
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

        ["userManagement", "headerSettings", "loginOptions", "webdav", "onlyoffice", "upload", "oidc", "shareLinks", "storage", "pro", "sponsor"]
          .forEach(id => {
            document.getElementById(id + "Header")
              .addEventListener("click", () => toggleSection(id));
          });

        document.getElementById("userManagementContent").innerHTML = `
  <div class="admin-user-actions">
    <!-- Core buttons -->
    <button type="button" id="adminOpenAddUser" class="btn btn-success btn-sm">
      <i class="material-icons">person_add</i>
      <span>${t("add_user")}</span>
    </button>

    <button type="button" id="adminOpenRemoveUser" class="btn btn-danger btn-sm">
      <i class="material-icons">person_remove</i>
      <span>${t("remove_user")}</span>
    </button>

    <button type="button" id="adminOpenUserPermissions" class="btn btn-secondary btn-sm">
      <i class="material-icons">folder_shared</i>
      <span>${tf("folder_access", "Folder Access")}</span>
    </button>

    <button type="button" id="adminOpenUserFlags" class="btn btn-secondary btn-sm">
      <i class="material-icons">tune</i>
      <span>${tf("user_permissions", "User Permissions")}</span>
    </button>

    <!-- Pro-only: User groups -->
    ${isPro
            ? `
    <div class="btn-pro-wrapper">
      <button
        type="button"
        id="adminOpenUserGroups"
        class="btn btn-sm btn-pro-admin">
        <i class="material-icons">groups</i>
        <span>User Groups</span>
      </button>
    </div>
    `
            : `
    <div class="btn-pro-wrapper">
      <button
        type="button"
        id="adminOpenUserGroups"
        class="btn btn-sm btn-pro-admin">
        <i class="material-icons">groups</i>
        <span>User Groups</span>
      </button>
      <span class="btn-pro-pill">Pro</span>
    </div>
    `
          }

    <!-- Pro roadmap: Client portal -->
    ${isPro
            ? `
    <div class="btn-pro-wrapper">
      <button
        type="button"
        id="adminOpenClientPortal"
        class="btn btn-sm btn-pro-admin"
        title="Client portals are part of FileRise Pro.">
        <i class="material-icons">cloud_upload</i>
        <span>Client Portals</span>
      </button>
    </div>
    `
            : `
    <div class="btn-pro-wrapper">
      <button
        type="button"
        id="adminOpenClientPortal"
        class="btn btn-sm btn-pro-admin"
        disabled
        title="Client portals are part of FileRise Pro.">
        <i class="material-icons">cloud_upload</i>
        <span>Client Portals</span>
      </button>
      <span class="btn-pro-pill">Pro</span>
    </div>
    `
          }
  </div>

  <small class="text-muted d-block" style="margin-top:6px;">
    Use the core tools to manage users, permissions and per-folder access.
    User Groups and Client Portals are only available in FileRise Pro.
  </small>
`;

        document.getElementById("adminOpenAddUser")
          .addEventListener("click", () => {
            toggleVisibility("addUserModal", true);
            document.getElementById("newUsername")?.focus();
          });
        document.getElementById("adminOpenRemoveUser")
          .addEventListener("click", () => {
            if (typeof window.loadUserList === "function") window.loadUserList();
            toggleVisibility("removeUserModal", true);
          });
        document.getElementById("adminOpenUserPermissions")
          .addEventListener("click", openUserPermissionsModal);

        // Pro-only stubs for future features
        const regBtn = document.getElementById("adminOpenUserRegistration");
        const groupsBtn = document.getElementById("adminOpenUserGroups");
        const clientBtn = document.getElementById("adminOpenClientPortal");

        if (regBtn) {
          regBtn.addEventListener("click", () => {
            if (!isPro) {
              showToast("User registration is a FileRise Pro feature. Visit filerise.net to purchase a license.");
              window.open("https://filerise.net", "_blank", "noopener");
              return;
            }
            // Placeholder for future Pro UI:
            showToast("User registration management is coming soon in FileRise Pro.");
          });
        }

        if (groupsBtn) {
          groupsBtn.addEventListener("click", () => {
            if (!isPro) {
              showToast("User Groups are a FileRise Pro feature. Visit filerise.net to purchase a license.");
              window.open("https://filerise.net", "_blank", "noopener");
              return;
            }
            openUserGroupsModal();
          });
        }

        if (clientBtn) {
          clientBtn.addEventListener("click", () => {
            if (!isPro) {
              showToast("Client Portals are a FileRise Pro feature. Visit filerise.net to purchase a license.");
              window.open("https://filerise.net", "_blank", "noopener");
              return;
            }

            openClientPortalsModal();
          });
        }

        document.getElementById("headerSettingsContent").innerHTML = `
  <div class="form-group">
    <label for="headerTitle">${t("header_title_text")}:</label>
    <input type="text" id="headerTitle" class="form-control" value="${window.headerTitle || ""}" />
  </div>

  <!-- Pro: Logo -->
  <div class="form-group" style="margin-top:16px;">
    <label for="brandingCustomLogoUrl">
      Header Logo
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
        placeholder="/uploads/profile_pics/logo.png"
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

  <!-- Pro: Header colors -->
  <div class="form-group" style="margin-top:16px;">
    <label>
      Header Colors
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

  <!-- Pro: Footer text -->
  <div class="form-group" style="margin-top:16px;">
    <label for="brandingFooterHtml">
      Footer text
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
                showToast('Please choose an image first.');
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
                  showToast(js.error || 'Error uploading logo');
                  return;
                }

                const normalized = normalizeLogoPath(js.url); // your helper
                urlInput.value = normalized;
                showToast('Logo uploaded. Don\'t forget to Save settings.');
              } catch (e) {
                console.error(e);
                showToast('Error uploading logo');
              }
            });
          }
        }

        document.getElementById("loginOptionsContent").innerHTML = `
          <div class="form-group"><input type="checkbox" id="disableFormLogin" /> <label for="disableFormLogin">${t("disable_login_form")}</label></div>
          <div class="form-group"><input type="checkbox" id="disableBasicAuth" /> <label for="disableBasicAuth">${t("disable_basic_http_auth")}</label></div>
          <div class="form-group"><input type="checkbox" id="disableOIDCLogin" /> <label for="disableOIDCLogin">${t("disable_oidc_login")}</label></div>
          <div class="form-group">
            <input type="checkbox" id="authBypass" />
            <label for="authBypass">Disable all built-in logins (proxy only)</label>
          </div>
          <div class="form-group">
            <label for="authHeaderName">Auth header name:</label>
            <input type="text" id="authHeaderName" class="form-control" placeholder="e.g. X-Remote-User" />
          </div>
        `;

        document.getElementById("webdavContent").innerHTML = `
          <div class="form-group"><input type="checkbox" id="enableWebDAV" /> <label for="enableWebDAV">Enable WebDAV</label></div>
        `;

        document.getElementById("uploadContent").innerHTML = `
          <div class="form-group">
            <label for="sharedMaxUploadSize">${t("shared_max_upload_size_bytes")}:</label>
            <input type="number" id="sharedMaxUploadSize" class="form-control" placeholder="e.g. 52428800" />
            <small>${t("max_bytes_shared_uploads_note")}</small>
          </div>
        `;

        // ONLYOFFICE section (moved into adminOnlyOffice.js)
        initOnlyOfficeUI({ config });

        const hasId = !!(config.oidc && config.oidc.hasClientId);
        const hasSecret = !!(config.oidc && config.oidc.hasClientSecret);

        document.getElementById("oidcContent").innerHTML = `
  <div class="form-text text-muted" style="margin-top:8px;">
    <small>Client ID/Secret are never shown after saving. A green note indicates a value is saved. Click “Replace” to overwrite.</small>
  </div>

  <div class="form-group">
    <label for="oidcProviderUrl">${t("oidc_provider_url")}:</label>
    <input type="text" id="oidcProviderUrl" class="form-control" value="${(window.currentOIDCConfig?.providerUrl || "")}" />
  </div>

  ${renderMaskedInput({ id: "oidcClientId", label: t("oidc_client_id"), hasValue: hasId })}
  ${renderMaskedInput({ id: "oidcClientSecret", label: t("oidc_client_secret"), hasValue: hasSecret, isSecret: true })}

  <div class="form-group">
    <label for="oidcRedirectUri">${t("oidc_redirect_uri")}:</label>
    <input type="text" id="oidcRedirectUri" class="form-control" value="${(window.currentOIDCConfig?.redirectUri || "")}" />
  </div>

  <div class="form-group">
    <label for="globalOtpauthUrl">${t("global_otpauth_url")}:</label>
    <input type="text" id="globalOtpauthUrl" class="form-control" value="${window.currentOIDCConfig?.globalOtpauthUrl || 'otpauth://totp/{label}?secret={secret}&issuer=FileRise'}" />
  </div>
`;

        wireReplaceButtons(document.getElementById("oidcContent"));

        document.getElementById("shareLinksContent").textContent = t("loading") + "…";

        document.getElementById("shareLinksContent").textContent = t("loading") + "…";

        // --- FileRise Pro / License section ---
        const proContent = document.getElementById("proContent");
        if (proContent) {
          // Normalize versions so "v1.0.1" and "1.0.1" compare cleanly
          const norm = (v) => (String(v || '').trim().replace(/^v/i, ''));

          const currentVersionRaw = (proVersion && proVersion !== 'not installed') ? String(proVersion) : '';
          const latestVersionRaw = PRO_LATEST_BUNDLE_VERSION || '';
          const hasCurrent = !!norm(currentVersionRaw);
          const hasLatest = !!norm(latestVersionRaw);
          const hasUpdate = hasCurrent && hasLatest && norm(currentVersionRaw) !== norm(latestVersionRaw);

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
         
                   let expiryLabel = '';
                   if (proPlan === 'early_supporter_1x' || (!proPlan && isPro)) {
                     // Early supporters: we treat as lifetime for that major – do NOT show an expiry date
                     expiryLabel = 'Lifetime license (no expiry)';
                   } else if (proExpiresAt) {
                     expiryLabel = `Valid until ${proExpiresAt}`;
                   }
         
                   const proMetaHtml =
                     isPro && (proType || proEmail || proVersion || planLabel || expiryLabel)
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
                   ${expiryLabel ? `
                   <div>
                     ${expiryLabel}
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
      </div>

      ${isPro ? `
        <div style="margin-top:8px;">
          <a
            href="https://filerise.net/pro/update.php"
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-sm btn-pro-admin d-inline-flex align-items-center"
          >
            <span>Download latest Pro bundle</span>
            ${hasUpdate ? `
              <span class="badge badge-light" style="margin-left:6px;">
                Update available
              </span>` : ''}
          </a>
          <small class="text-muted d-block" style="margin-top:4px;">
            Opens filerise.net in a new tab where you can enter your Pro license
            to download the latest FileRise Pro ZIP.
          </small>
        </div>
      ` : `
        <div style="margin-top:8px;">
          <a
            href="https://filerise.net/pro/checkout.php"
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-sm btn-pro-admin"
          >
            Buy FileRise Pro
          </a>
          <small class="text-muted d-block" style="margin-top:4px;">
            Opens filerise.net in a new tab so you can purchase a FileRise Pro license.
          </small>
        </div>
      `}

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

      <div class="mt-3 border-top pt-3" style="margin-top:14px;">
        <h6 class="mb-1">Install / update Pro bundle</h6>
        <p class="text-muted small mb-2">
          Upload the <code>.zip</code> bundle you downloaded from <a href="https://filerise.net" target="_blank" rel="noopener noreferrer">filerise.net</a>.
          This runs locally on your server and never contacts an external update service.
        </p>
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
        <div id="proBundleStatus" class="small mt-2"></div>
      </div>
    </div>
  `;

          // Wire up local Pro bundle installer (upload .zip into core)
          initProBundleInstaller();

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
                  showToast('Could not find a valid FRP1 license in that file.');
                  return;
                }

                licenseTextarea.value = license;
                showToast('License loaded from file. Click "Save license" to apply.');
              };

              reader.onerror = () => {
                showToast('Error reading license file.');
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
                showToast('License copied to clipboard.');
              } catch {
                showToast('Could not copy license. Please copy it manually.');
              }
            });
          }

          // Save license handler (unchanged)
          const proSaveBtn = document.getElementById('proSaveLicenseBtn');
          if (proSaveBtn) {
            proSaveBtn.addEventListener('click', async () => {
              const ta = document.getElementById('proLicenseInput');
              const license = (ta && ta.value.trim()) || '';

              try {
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
                  showToast(data.error || 'Error saving license');
                  return;
                }

                showToast('License saved. Reloading…');
                window.location.reload();
              } catch (e) {
                console.error(e);
                showToast('Error saving license');
              }
            });
          }
        }
        // --- end FileRise Pro section ---

        document.getElementById("saveAdminSettings")
          .addEventListener("click", handleSave);
        ["disableFormLogin", "disableBasicAuth", "disableOIDCLogin"].forEach(id => {
          document.getElementById(id)
            .addEventListener("change", e => {
              const chk = ["disableFormLogin", "disableBasicAuth", "disableOIDCLogin"]
                .filter(i => document.getElementById(i).checked).length;
              if (chk === 3) {
                showToast(t("at_least_one_login_method"));
                e.target.checked = false;
              }
            });
        });
        document.getElementById("authBypass").addEventListener("change", e => {
          if (e.target.checked) {
            ["disableFormLogin", "disableBasicAuth", "disableOIDCLogin"]
              .forEach(i => document.getElementById(i).checked = false);
          }
        });

       

        const userMgmt = document.getElementById("userManagementContent");
        userMgmt?.removeEventListener("click", window.__userMgmtDelegatedClick);
        window.__userMgmtDelegatedClick = (e) => {
          const flagsBtn = e.target.closest("#adminOpenUserFlags");
          if (flagsBtn) { e.preventDefault(); openUserFlagsModal(); }
          const folderBtn = e.target.closest("#adminOpenUserPermissions");
          if (folderBtn) { e.preventDefault(); openUserPermissionsModal(); }
        };
        userMgmt?.addEventListener("click", window.__userMgmtDelegatedClick);

        document.getElementById("disableFormLogin").checked = config.loginOptions.disableFormLogin === true;
        document.getElementById("disableBasicAuth").checked = config.loginOptions.disableBasicAuth === true;
        document.getElementById("disableOIDCLogin").checked = config.loginOptions.disableOIDCLogin === true;
        document.getElementById("authBypass").checked = !!config.loginOptions.authBypass;
        document.getElementById("authHeaderName").value = config.loginOptions.authHeaderName || "X-Remote-User";
        document.getElementById("enableWebDAV").checked = config.enableWebDAV === true;
        document.getElementById("sharedMaxUploadSize").value = config.sharedMaxUploadSize || "";
        // Rebuild ONLYOFFICE section from fresh config
        initOnlyOfficeUI({ config });

        captureInitialAdminConfig();

      } else {
        mdl.style.display = "flex";
        const hasId = !!(config.oidc && config.oidc.hasClientId);
        const hasSecret = !!(config.oidc && config.oidc.hasClientSecret);

        document.getElementById("disableFormLogin").checked = config.loginOptions.disableFormLogin === true;
        document.getElementById("disableBasicAuth").checked = config.loginOptions.disableBasicAuth === true;
        document.getElementById("disableOIDCLogin").checked = config.loginOptions.disableOIDCLogin === true;
        document.getElementById("authBypass").checked = !!config.loginOptions.authBypass;
        document.getElementById("authHeaderName").value = config.loginOptions.authHeaderName || "X-Remote-User";
        document.getElementById("enableWebDAV").checked = config.enableWebDAV === true;
        document.getElementById("sharedMaxUploadSize").value = config.sharedMaxUploadSize || "";
        document.getElementById("oidcProviderUrl").value = window.currentOIDCConfig?.providerUrl || "";
        const idEl = document.getElementById("oidcClientId");
        const secEl = document.getElementById("oidcClientSecret");
        if (!hasId) idEl.value = window.currentOIDCConfig?.clientId || "";
        if (!hasSecret) secEl.value = window.currentOIDCConfig?.clientSecret || "";
        wireReplaceButtons(document.getElementById("oidcContent"));
        document.getElementById("ooEnabled").checked = !!(config.onlyoffice && config.onlyoffice.enabled);
        document.getElementById("ooDocsOrigin").value = (config.onlyoffice && config.onlyoffice.docsOrigin) ? config.onlyoffice.docsOrigin : "";
        const ooCont = document.getElementById("onlyofficeContent");
        if (ooCont) wireReplaceButtons(ooCont);
        document.getElementById("oidcClientSecret").value = window.currentOIDCConfig?.clientSecret || "";
        document.getElementById("oidcRedirectUri").value = window.currentOIDCConfig?.redirectUri || "";
        document.getElementById("globalOtpauthUrl").value = window.currentOIDCConfig?.globalOtpauthUrl || '';
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
              console.error('Failed to init Sponsor / Donations section', e);
            }
    })
    .catch(() => {/* if even fetching fails, open empty panel */ });
}

function handleSave() {
  const payload = {
    header_title: document.getElementById("headerTitle")?.value || "",
    loginOptions: {
      disableFormLogin: document.getElementById("disableFormLogin").checked,
      disableBasicAuth: document.getElementById("disableBasicAuth").checked,
      disableOIDCLogin: document.getElementById("disableOIDCLogin").checked,
      authBypass: document.getElementById("authBypass").checked,
      authHeaderName: document.getElementById("authHeaderName").value.trim() || "X-Remote-User",
    },
    enableWebDAV: document.getElementById("enableWebDAV").checked,
    sharedMaxUploadSize: parseInt(document.getElementById("sharedMaxUploadSize").value || "0", 10) || 0,
    oidc: {
      providerUrl: document.getElementById("oidcProviderUrl").value.trim(),
      redirectUri: document.getElementById("oidcRedirectUri").value.trim(),
      // clientId/clientSecret added conditionally below
    },
    globalOtpauthUrl: document.getElementById("globalOtpauthUrl").value.trim(),
    branding: {
      customLogoUrl: (document.getElementById("brandingCustomLogoUrl")?.value || "").trim(),
      headerBgLight: (document.getElementById("brandingHeaderBgLight")?.value || "").trim(),
      headerBgDark: (document.getElementById("brandingHeaderBgDark")?.value || "").trim(),
      footerHtml: (document.getElementById("brandingFooterHtml")?.value || "").trim(),
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
  if ((scEl?.dataset.replace === '1' || secFirstTime) && secVal !== '') {
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
      if (j.error) { showToast('Error: ' + j.error); return; }
      showToast('Settings saved.');
      closeAdminPanel();
      applyHeaderColorsFromAdmin();
      updateHeaderLogoFromAdmin();
      applyFooterFromAdmin();
    })
    .catch(() => showToast('Save failed.'));
}

export async function closeAdminPanel() {
  if (hasUnsavedChanges()) {
    //const ok = await showCustomConfirmModal(t("unsaved_changes_confirm"));
    //if (!ok) return;
  }
  const m = document.getElementById("adminPanelModal");
  if (m) m.style.display = "none";
}

/* ===========================
   New: Folder Access (ACL) UI
   =========================== */

let __allFoldersCache = null;

async function getAllFolders(force = false) {
  if (!force && __allFoldersCache) return __allFoldersCache.slice();

  const res = await fetch('/api/folder/getFolderList.php?ts=' + Date.now(), {
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-store' }
  });
  const data = await safeJson(res).catch(() => []);
  const list = Array.isArray(data)
    ? data.map(x => (typeof x === 'string' ? x : x.folder)).filter(Boolean)
    : [];

  const hidden = new Set(['profile_pics', 'trash']);
  const cleaned = list
    .filter(f => f && !hidden.has(f.toLowerCase()))
    .sort((a, b) => (a === 'root' ? -1 : b === 'root' ? 1 : a.localeCompare(b)));

  __allFoldersCache = cleaned;
  return cleaned.slice();
}

async function getUserGrants(username) {
  const res = await fetch(`/api/admin/acl/getGrants.php?user=${encodeURIComponent(username)}`, {
    credentials: 'include'
  });
  const data = await safeJson(res).catch(() => ({}));
  return (data && data.grants) ? data.grants : {};
}

function computeGroupGrantMaskForUser(username) {
  const result = {};
  const uname = (username || "").trim().toLowerCase();
  if (!uname) return result;
  if (!__groupsCache || typeof __groupsCache !== "object") return result;

  Object.keys(__groupsCache).forEach(gName => {
    const g = __groupsCache[gName] || {};
    const members = Array.isArray(g.members) ? g.members : [];
    const isMember = members.some(m => String(m || "").trim().toLowerCase() === uname);
    if (!isMember) return;

    const grants = g.grants && typeof g.grants === "object" ? g.grants : {};
    Object.keys(grants).forEach(folder => {
      const fg = grants[folder];
      if (!fg || typeof fg !== "object") return;
      if (!result[folder]) result[folder] = {};
      Object.keys(fg).forEach(capKey => {
        if (fg[capKey]) {
          result[folder][capKey] = true;
        }
      });
    });
  });

  return result;
}

function applyGroupLocksForUser(username, grantsBox, groupMask, groupsForUser) {
  if (!grantsBox || !groupMask) return;

  const groupLabels = (groupsForUser || []).map(name => {
    const g = __groupsCache && __groupsCache[name] || {};
    return g.label || name;
  });
  const labelStr = groupLabels.join(", ");

  const rows = grantsBox.querySelectorAll(".folder-access-row");
  rows.forEach(row => {
    const folder = row.dataset.folder || "";
    const capsForFolder = groupMask[folder];
    if (!capsForFolder) return;

    Object.keys(capsForFolder).forEach(capKey => {
      if (!capsForFolder[capKey]) return;

      // Map caps to actual columns we have in the UI
      let uiCaps = [];
      switch (capKey) {
        case "view":
        case "viewOwn":
        case "manage":
        case "create":
        case "upload":
        case "edit":
        case "rename":
        case "copy":
        case "move":
        case "delete":
        case "extract":
        case "shareFile":
        case "shareFolder":
          uiCaps = [capKey];
          break;
        case "write":
          uiCaps = ["create", "upload", "edit", "rename", "copy", "delete", "extract"];
          break;
        case "share":
          uiCaps = ["shareFile", "shareFolder"];
          break;
        default:
          // unknown / unsupported cap key in UI
          return;
      }

      uiCaps.forEach(c => {
        const cb = row.querySelector(`input[type="checkbox"][data-cap="${c}"]`);
        if (!cb) return;
        cb.checked = true;
        cb.disabled = true;
        cb.setAttribute("data-hard-disabled", "1");

        let baseTitle = "Granted via group";
        if (groupLabels.length > 1) baseTitle += "s";
        if (labelStr) baseTitle += `: ${labelStr}`;
        cb.title = baseTitle + ". Edit group permissions in User groups to change.";
      });
    });
  });
}

function renderFolderGrantsUI(username, container, folders, grants) {
  container.innerHTML = "";

  // toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'folder-access-toolbar';
  toolbar.innerHTML = `
  <input type="text" class="form-control" style="max-width:220px;"
         placeholder="${tf('search_folders', 'Search folders')}" />

  <label class="muted" title="${tf('view_all_help', 'See all files in this folder (everyone’s files)')}">
    <input type="checkbox" data-bulk="view" /> ${tf('view_all', 'View (all)')}
  </label>

  <label class="muted" title="${tf('view_own_help', 'See only files you uploaded in this folder')}">
    <input type="checkbox" data-bulk="viewOwn" /> ${tf('view_own', 'View (own files)')}
  </label>

  <label class="muted" title="${tf('write_help', 'File-level: upload, edit, rename, copy, delete, extract ZIPs')}">
    <input type="checkbox" data-bulk="write" /> ${tf('write_full', 'Write (file ops)')}
  </label>

  <label class="muted" title="${tf('manage_help', 'Folder-level (owner): can create/rename/move folders and grant access; implies View (all)')}">
    <input type="checkbox" data-bulk="manage" /> ${tf('manage', 'Manage (folder owner)')}
  </label>

  <label class="muted" title="${tf('share_help', 'Create/manage share links; implies View (all)')}">
    <input type="checkbox" data-bulk="share" /> ${tf('share', 'Share')}
  </label>

  <span class="muted">(${tf('applies_to_filtered', 'applies to filtered list')})</span>
`;
  container.appendChild(toolbar);

  const list = document.createElement('div');
  list.className = 'folder-access-list';
  container.appendChild(list);

  const headerHtml = `
  <div class="folder-access-header">
    <div class="folder-cell" title="${tf('folder_help', 'Folder path within FileRise')}">
      ${tf('folder', 'Folder')}
    </div>
    <div class="perm-col" title="${tf('view_all_help', 'See all files in this folder (everyone’s files)')}">
      ${tf('view_all', 'View (all)')}
    </div>
    <div class="perm-col" title="${tf('view_own_help', 'See only files you uploaded in this folder')}">
      ${tf('view_own', 'View (own)')}
    </div>
    <div class="perm-col" title="${tf('write_help', 'Meta: toggles all file-level operations below')}">
      ${tf('write_full', 'Write')}
    </div>
    <div class="perm-col" title="${tf('manage_help', 'Folder owner: can create/rename/move folders and grant access; implies View (all)')}">
      ${tf('manage', 'Manage')}
    </div>
    <div class="perm-col" title="${tf('create_help', 'Create empty file')}">
      ${tf('create', 'Create File')}
    </div>
    <div class="perm-col" title="${tf('upload_help', 'Upload a file into this folder')}">
      ${tf('upload', 'Upload File')}
    </div>
    <div class="perm-col" title="${tf('edit_help', 'Edit file contents')}">
      ${tf('edit', 'Edit File')}
    </div>
    <div class="perm-col" title="${tf('rename_help', 'Rename a file')}">
      ${tf('rename', 'Rename File')}
    </div>
    <div class="perm-col" title="${tf('copy_help', 'Copy a file')}">
      ${tf('copy', 'Copy File')}
    </div>
    <div class="perm-col" title="${tf('delete_help', 'Delete a file')}">
      ${tf('delete', 'Delete File')}
    </div>
    <div class="perm-col" title="${tf('extract_help', 'Extract ZIP archives')}">
      ${tf('extract', 'Extract ZIP')}
    </div>
    <div class="perm-col" title="${tf('share_file_help', 'Create share links for files')}">
      ${tf('share_file', 'Share File')}
    </div>
    <div class="perm-col" title="${tf('share_folder_help', 'Create share links for folders (requires Manage + View (all))')}">
      ${tf('share_folder', 'Share Folder')}
    </div>
  </div>`;

  function rowHtml(folder) {
    const g = grants[folder] || {};
    const name = folder === 'root' ? '(Root)' : folder;
    const writeMetaChecked = !!(g.create || g.upload || g.edit || g.rename || g.copy || g.delete || g.extract);
    const shareFolderDisabled = !g.view;
    return `
      <div class="folder-access-row" data-folder="${folder}">
    <div class="folder-cell">
      <div class="folder-badge">
        <i class="material-icons" style="font-size:18px;">folder</i>
        ${name}
        <span class="inherited-tag" style="display:none;"></span>
      </div>
    </div>
        <div class="perm-col"><input type="checkbox" data-cap="view"      ${g.view ? 'checked' : ''}></div>
        <div class="perm-col"><input type="checkbox" data-cap="viewOwn"   ${g.viewOwn ? 'checked' : ''}></div>
        <div class="perm-col"><input type="checkbox" data-cap="write"     ${writeMetaChecked ? 'checked' : ''}></div>
        <div class="perm-col"><input type="checkbox" data-cap="manage"    ${g.manage ? 'checked' : ''}></div>
        <div class="perm-col"><input type="checkbox" data-cap="create"    ${g.create ? 'checked' : ''}></div>
        <div class="perm-col"><input type="checkbox" data-cap="upload"    ${g.upload ? 'checked' : ''}></div>
        <div class="perm-col"><input type="checkbox" data-cap="edit"      ${g.edit ? 'checked' : ''}></div>
        <div class="perm-col"><input type="checkbox" data-cap="rename"    ${g.rename ? 'checked' : ''}></div>
        <div class="perm-col"><input type="checkbox" data-cap="copy"      ${g.copy ? 'checked' : ''}></div>
        <div class="perm-col"><input type="checkbox" data-cap="delete"    ${g.delete ? 'checked' : ''}></div>
        <div class="perm-col"><input type="checkbox" data-cap="extract"   ${g.extract ? 'checked' : ''}></div>
        <div class="perm-col"><input type="checkbox" data-cap="shareFile" ${g.shareFile ? 'checked' : ''}></div>
        <div class="perm-col"><input type="checkbox" data-cap="shareFolder" ${g.shareFolder ? 'checked' : ''} ${shareFolderDisabled ? 'disabled' : ''}></div>
      </div>
    `;
  }

  function setRowDisabled(row, disabled) {
    qsa(row, 'input[type="checkbox"]').forEach(cb => {
      cb.disabled = disabled || cb.hasAttribute('data-hard-disabled');
    });
    row.classList.toggle('inherited-row', !!disabled);
    const tag = row.querySelector('.inherited-tag');
    if (tag) tag.style.display = disabled ? 'inline-block' : 'none';
  }

  function refreshInheritance() {
    const rows = qsa(list, '.folder-access-row').sort((a, b) => (a.dataset.folder || '').length - (b.dataset.folder || '').length);
    const managedPrefixes = new Set();
    rows.forEach(row => {
      const folder = row.dataset.folder || "";
      const manage = qs(row, 'input[data-cap="manage"]');
      if (manage && manage.checked) managedPrefixes.add(folder);
      let inheritedFrom = null;
      for (const p of managedPrefixes) {
        if (p && folder !== p && folder.startsWith(p + '/')) { inheritedFrom = p; break; }
      }
      if (inheritedFrom) {
        const v = qs(row, 'input[data-cap="view"]');
        const w = qs(row, 'input[data-cap="write"]');
        const vo = qs(row, 'input[data-cap="viewOwn"]');
        if (v) v.checked = true;
        if (w) w.checked = true;
        if (vo) { vo.checked = false; vo.disabled = true; }
        ['create', 'upload', 'edit', 'rename', 'copy', 'delete', 'extract', 'shareFile', 'shareFolder']
          .forEach(c => { const cb = qs(row, `input[data-cap="${c}"]`); if (cb) cb.checked = true; });
        setRowDisabled(row, true);
        const tag = row.querySelector('.inherited-tag');
        if (tag) tag.textContent = `(${tf('inherited', 'inherited')} ${tf('from', 'from')} ${inheritedFrom})`;
      } else {
        setRowDisabled(row, false);
      }
      enforceShareFolderRule(row);
      const cbView = qs(row, 'input[data-cap="view"]');
      const cbViewOwn = qs(row, 'input[data-cap="viewOwn"]');
      if (cbView && cbViewOwn) {
        if (cbView.checked) {
          cbViewOwn.checked = false;
          cbViewOwn.disabled = true;
          cbViewOwn.title = tf('full_view_supersedes_own', 'Full view supersedes own-only');
        } else {
          cbViewOwn.disabled = false;
          cbViewOwn.removeAttribute('title');
        }
      }
    });
  }

  function setFromViewChange(row, which, checked) {
    if (!checked && (which === 'view' || which === 'viewOwn')) {
      qsa(row, 'input[type="checkbox"]').forEach(cb => cb.checked = false);
    }
    const cbView = qs(row, 'input[data-cap="view"]');
    const cbVO = qs(row, 'input[data-cap="viewOwn"]');
    if (cbView && cbVO) {
      if (cbView.checked) {
        cbVO.checked = false;
        cbVO.disabled = true;
        cbVO.title = tf('full_view_supersedes_own', 'Full view supersedes own-only');
      } else {
        cbVO.disabled = false;
        cbVO.removeAttribute('title');
      }
    }
    enforceShareFolderRule(row);
  }

  function wireRow(row) {
    const cbView = row.querySelector('input[data-cap="view"]');
    const cbViewOwn = row.querySelector('input[data-cap="viewOwn"]');
    const cbWrite = row.querySelector('input[data-cap="write"]');
    const cbManage = row.querySelector('input[data-cap="manage"]');
    const cbCreate = row.querySelector('input[data-cap="create"]');
    const cbUpload = row.querySelector('input[data-cap="upload"]');
    const cbEdit = row.querySelector('input[data-cap="edit"]');
    const cbRename = row.querySelector('input[data-cap="rename"]');
    const cbCopy = row.querySelector('input[data-cap="copy"]');
    const cbMove = row.querySelector('input[data-cap="move"]');
    const cbDelete = row.querySelector('input[data-cap="delete"]');
    const cbExtract = row.querySelector('input[data-cap="extract"]');
    const cbShareF = row.querySelector('input[data-cap="shareFile"]');
    const cbShareFo = row.querySelector('input[data-cap="shareFolder"]');

    const granular = [cbCreate, cbUpload, cbEdit, cbRename, cbCopy, cbMove, cbDelete, cbExtract];

    const applyManage = () => {
      if (cbManage && cbManage.checked) {
        if (cbView) cbView.checked = true;
        if (cbWrite) cbWrite.checked = true;
        granular.forEach(cb => { if (cb) cb.checked = true; });
        if (cbShareF) cbShareF.checked = true;
        if (cbShareFo && !cbShareFo.disabled) cbShareFo.checked = true;
      }
    };

    const syncWriteFromGranular = () => {
      if (!cbWrite) return;
      cbWrite.checked = granular.some(cb => cb && cb.checked);
    };
    const applyWrite = () => {
      if (!cbWrite) return;
      granular.forEach(cb => { if (cb) cb.checked = cbWrite.checked; });
      const any = granular.some(cb => cb && cb.checked);
      if (any && cbView && !cbView.checked && cbViewOwn && !cbViewOwn.checked) cbViewOwn.checked = true;
    };

    const onShareFile = () => {
      if (cbShareF && cbShareF.checked && cbView && !cbView.checked && cbViewOwn && !cbViewOwn.checked) {
        cbViewOwn.checked = true;
      }
    };

    const cascadeManage = (checked) => {
      const base = row.dataset.folder || "";
      if (!base) return;
      qsa(container, '.folder-access-row').forEach(r => {
        const f = r.dataset.folder || "";
        if (!f || f === base) return;
        if (!f.startsWith(base + '/')) return;
        const m = r.querySelector('input[data-cap="manage"]');
        const v = r.querySelector('input[data-cap="view"]');
        const w = r.querySelector('input[data-cap="write"]');
        const vo = r.querySelector('input[data-cap="viewOwn"]');
        const boxes = [
          'create', 'upload', 'edit', 'rename', 'copy', 'delete', 'extract', 'shareFile', 'shareFolder'
        ].map(c => r.querySelector(`input[data-cap="${c}"]`));
        if (m) m.checked = checked;
        if (v) v.checked = checked;
        if (w) w.checked = checked;
        if (vo) { vo.checked = false; vo.disabled = checked; }
        boxes.forEach(b => { if (b) b.checked = checked; });
        enforceShareFolderRule(r);
      });
      refreshInheritance();
    };

    if (cbManage) cbManage.addEventListener('change', () => { applyManage(); onShareFile(); cascadeManage(cbManage.checked); });
    if (cbWrite) cbWrite.addEventListener('change', applyWrite);
    granular.forEach(cb => { if (cb) cb.addEventListener('change', () => { syncWriteFromGranular(); }); });
    if (cbView) cbView.addEventListener('change', () => { setFromViewChange(row, 'view', cbView.checked); refreshInheritance(); });
    if (cbViewOwn) cbViewOwn.addEventListener('change', () => { setFromViewChange(row, 'viewOwn', cbViewOwn.checked); refreshInheritance(); });
    if (cbShareF) cbShareF.addEventListener('change', onShareFile);
    if (cbShareFo) cbShareFo.addEventListener('change', () => onShareFolderToggle(row, cbShareFo.checked));

    applyManage();
    enforceShareFolderRule(row);
    syncWriteFromGranular();
  }

  function render(filter = "") {
    const f = filter.trim().toLowerCase();
    const rowsHtml = folders
      .filter(x => !f || x.toLowerCase().includes(f))
      .map(rowHtml)
      .join("");

    list.innerHTML = headerHtml + rowsHtml;
    list.querySelectorAll('.folder-access-row').forEach(wireRow);
    refreshInheritance();
  }

  render();
  const filterInput = toolbar.querySelector('input[type="text"]');
  filterInput.addEventListener('input', () => render(filterInput.value));

  toolbar.querySelectorAll('input[type="checkbox"][data-bulk]').forEach(bulk => {
    bulk.addEventListener('change', () => {
      const which = bulk.dataset.bulk;
      const f = (filterInput.value || "").trim().toLowerCase();

      list.querySelectorAll('.folder-access-row').forEach(row => {
        const folder = row.dataset.folder || "";
        if (f && !folder.toLowerCase().includes(f)) return;

        const target = row.querySelector(`input[data-cap="${which}"]`);
        if (!target) return;

        target.checked = bulk.checked;

        if (which === 'manage') {
          target.dispatchEvent(new Event('change'));
        } else if (which === 'share') {
          if (bulk.checked) {
            const v = row.querySelector('input[data-cap="view"]');
            if (v) v.checked = true;
          }
        } else if (which === 'write') {
          onWriteToggle(row, bulk.checked);
        } else if (which === 'view' || which === 'viewOwn') {
          setFromViewChange(row, which, bulk.checked);
        }

        enforceShareFolderRule(row);
      });
      refreshInheritance();
    });
  });
}

function collectGrantsFrom(container) {
  const out = {};
  const get = (row, sel) => {
    const el = row.querySelector(sel);
    return el ? !!el.checked : false;
  };
  container.querySelectorAll('.folder-access-row').forEach(row => {
    const folder = row.dataset.folder || row.getAttribute('data-folder');
    if (!folder) return;
    const g = {
      view: get(row, 'input[data-cap="view"]'),
      viewOwn: get(row, 'input[data-cap="viewOwn"]'),
      manage: get(row, 'input[data-cap="manage"]'),
      create: get(row, 'input[data-cap="create"]'),
      upload: get(row, 'input[data-cap="upload"]'),
      edit: get(row, 'input[data-cap="edit"]'),
      rename: get(row, 'input[data-cap="rename"]'),
      copy: get(row, 'input[data-cap="copy"]'),
      move: get(row, 'input[data-cap="move"]'),
      delete: get(row, 'input[data-cap="delete"]'),
      extract: get(row, 'input[data-cap="extract"]'),
      shareFile: get(row, 'input[data-cap="shareFile"]'),
      shareFolder: get(row, 'input[data-cap="shareFolder"]')
    };
    g.share = !!(g.shareFile || g.shareFolder);
    out[folder] = g;
  });
  return out;
}

export function openUserPermissionsModal() {
  let userPermissionsModal = document.getElementById("userPermissionsModal");
  const isDarkMode = document.body.classList.contains("dark-mode");
  const overlayBackground = isDarkMode ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.3)";
  const modalContentStyles = `
  background: ${isDarkMode ? "#2c2c2c" : "#fff"};
  color: ${isDarkMode ? "#e0e0e0" : "#000"};
  padding: 20px;
  width: clamp(980px, 92vw, 1280px);
  max-width: none;
  position: relative;
  max-height: 90vh;
  overflow: auto;
`;

  if (!userPermissionsModal) {
    userPermissionsModal = document.createElement("div");
    userPermissionsModal.id = "userPermissionsModal";
    userPermissionsModal.style.cssText = `
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background-color: ${overlayBackground};
      display: flex; justify-content: center; align-items: center;
      z-index: 3500;
    `;
    userPermissionsModal.innerHTML = `
      <div class="modal-content" style="${modalContentStyles}">
        <span id="closeUserPermissionsModal" class="editor-close-btn">&times;</span>
        <h3>${tf("folder_access", "Folder Access")}</h3>
        <div class="muted" style="margin:-4px 0 10px;">
          ${tf("grant_folders_help", "Grant per-folder capabilities to each user. 'Write/Manage/Share' imply 'View'.")}
        </div>
        <div id="userPermissionsList" style="max-height: 70vh; overflow-y: auto; margin-bottom: 15px;">
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" id="cancelUserPermissionsBtn" class="btn btn-secondary">${t("cancel")}</button>
          <button type="button" id="saveUserPermissionsBtn" class="btn btn-primary">${t("save_permissions")}</button>
        </div>
      </div>
    `;
    document.body.appendChild(userPermissionsModal);
    document.getElementById("closeUserPermissionsModal").addEventListener("click", () => {
      userPermissionsModal.style.display = "none";
    });
    document.getElementById("cancelUserPermissionsBtn").addEventListener("click", () => {
      userPermissionsModal.style.display = "none";
    });
    document.getElementById("saveUserPermissionsBtn").addEventListener("click", async () => {
      const rows = userPermissionsModal.querySelectorAll(".user-permission-row");
      const changes = [];
      rows.forEach(row => {
        if (row.getAttribute("data-admin") === "1") return; // skip admins
        const username = String(row.getAttribute("data-username") || "").trim();
        if (!username) return;
        const grantsBox = row.querySelector(".folder-grants-box");
        if (!grantsBox || grantsBox.getAttribute('data-loaded') !== '1') return;
        const grants = collectGrantsFrom(grantsBox);
        changes.push({ user: username, grants });
      });
      try {
        if (changes.length === 0) { showToast(tf("nothing_to_save", "Nothing to save")); return; }
        await sendRequest("/api/admin/acl/saveGrants.php", "POST",
          { changes },
          { "X-CSRF-Token": window.csrfToken || "" }
        );
        showToast(tf("user_permissions_updated_successfully", "User permissions updated successfully"));
        userPermissionsModal.style.display = "none";
      } catch (err) {
        console.error(err);
        showToast(tf("error_updating_permissions", "Error updating permissions"), "error");
      }
    });
  } else {
    userPermissionsModal.style.display = "flex";
  }

  loadUserPermissionsList();
}

async function fetchAllUsers() {
  const r = await fetch("/api/getUsers.php", { credentials: "include" });
  return await r.json();
}

async function fetchAllGroups() {
  const res = await fetch('/api/pro/groups/list.php', {
    credentials: 'include',
    headers: { 'X-CSRF-Token': window.csrfToken || '' }
  });
  const data = await safeJson(res);
  // backend returns { success, groups: { name: {...} } }
  return data && typeof data === 'object' && data.groups && typeof data.groups === 'object'
    ? data.groups
    : {};
}

async function saveAllGroups(groups) {
  const res = await fetch('/api/pro/groups/save.php', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': window.csrfToken || ''
    },
    body: JSON.stringify({ groups })
  });
  return await safeJson(res);
}

let __groupsCache = {};

async function openUserGroupsModal() {
  const isDark = document.body.classList.contains('dark-mode');
  const overlayBg = isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.3)';
  const contentBg = isDark ? '#2c2c2c' : '#fff';
  const contentFg = isDark ? '#e0e0e0' : '#000';
  const borderCol = isDark ? '#555' : '#ccc';

  let modal = document.getElementById('userGroupsModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'userGroupsModal';
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
        <span id="closeUserGroupsModal"
              class="editor-close-btn"
              style="right:8px; top:8px;">&times;</span>

        <h3>User Groups</h3>
        <p class="muted" style="margin-top:-6px;">
          Define named groups, assign users to them, and attach folder access
          just like per-user ACL. Group access is additive to user access.
        </p>

        <div class="d-flex justify-content-between align-items-center" style="margin:8px 0 10px;">
          <button type="button" id="addGroupBtn" class="btn btn-sm btn-success">
            <i class="material-icons" style="font-size:16px;">group_add</i>
            <span style="margin-left:4px;">Add group</span>
          </button>
          <span id="userGroupsStatus" class="small text-muted"></span>
        </div>

        <div id="userGroupsBody" style="max-height:60vh; overflow:auto; margin-bottom:12px;">
          ${t('loading')}…
        </div>

        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button type="button" id="cancelUserGroups" class="btn btn-secondary">${t('cancel')}</button>
          <button type="button" id="saveUserGroups"   class="btn btn-primary">${t('save_settings')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('closeUserGroupsModal').onclick = () => (modal.style.display = 'none');
    document.getElementById('cancelUserGroups').onclick = () => (modal.style.display = 'none');
    document.getElementById('saveUserGroups').onclick = saveUserGroupsFromUI;
    document.getElementById('addGroupBtn').onclick = addEmptyGroupRow;
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
  await loadUserGroupsList();
}

async function loadUserGroupsList(useCacheOnly) {
  const body = document.getElementById('userGroupsBody');
  const status = document.getElementById('userGroupsStatus');
  if (!body) return;

  body.textContent = `${t('loading')}…`;
  if (status) {
    status.textContent = '';
    status.className = 'small text-muted';
  }

  try {
    // Users always come fresh (or you could cache if you want)
    const users = await fetchAllUsers();

    let groups;
    if (useCacheOnly && __groupsCache && Object.keys(__groupsCache).length) {
      // When we’re just re-rendering after local edits, don’t clobber cache
      groups = __groupsCache;
    } else {
      // Initial load, or explicit refresh – pull from server
      groups = await fetchAllGroups();
      __groupsCache = groups || {};
    }

    const usernames = users
      .map(u => String(u.username || '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    const groupNames = Object.keys(__groupsCache).sort((a, b) => a.localeCompare(b));
    if (!groupNames.length) {
      body.innerHTML = `<p class="muted">${tf('no_groups_defined', 'No groups defined yet. Click “Add group” to create one.')}</p>`;
      return;
    }

    let html = '';
    groupNames.forEach(name => {
      const g = __groupsCache[name] || {};
      const label = g.label || name;
      const members = Array.isArray(g.members) ? g.members : [];

      const memberOptions = usernames.map(u => {
        const sel = members.includes(u) ? 'selected' : '';
        return `<option value="${u}" ${sel}>${u}</option>`;
      }).join('');

      const memberCountLabel = members.length
        ? `${members.length} member${members.length === 1 ? '' : 's'}`
        : 'No members yet';

      html += `
        <div class="card" data-group-name="${name}" style="margin-bottom:10px; border-radius:8px;">
          <!-- Collapsible header -->
          <div class="group-card-header d-flex align-items-center"
               tabindex="0"
               role="button"
               aria-expanded="false"
               style="gap:6px; padding:6px 10px; cursor:pointer; border-radius:8px;">
            <span class="group-caret"
                  style="display:inline-block; transform:rotate(-90deg); transition:transform 120ms ease;">▸</span>
            <i class="material-icons" style="font-size:18px;">group</i>
            <strong>${(label || name).replace(/"/g, '&quot;')}</strong>
            <span class="muted" style="font-size:0.8rem; margin-left:4px;">
              ${memberCountLabel}
            </span>
            <button type="button"
                    class="btn btn-sm btn-danger group-card-delete"
                    data-group-action="delete">
              <i class="material-icons" style="font-size:22px;">delete</i>
            </button>
          </div>
    
          <!-- Collapsible body -->
          <div class="group-card-body" style="display:none; padding:6px 10px 10px;">
            <div class="d-flex align-items-center"
                 style="gap:6px; flex-wrap:wrap; margin-bottom:6px;">
              <label style="margin:0; font-weight:600;">
                Group name:
                <input type="text"
                       class="form-control form-control-sm"
                       data-group-field="name"
                       value="${name}"
                       style="display:inline-block; width:160px; margin-left:4px;" />
              </label>
              <label style="margin:0;">
                Label:
                <input type="text"
                       class="form-control form-control-sm"
                       data-group-field="label"
                       value="${(g.label || '').replace(/"/g, '&quot;')}"
                       style="display:inline-block; width:200px; margin-left:4px;" />
              </label>
            </div>
    
            <div style="margin-top:4px;">
              <label style="font-size:12px; font-weight:600;">Members:</label>
              <select multiple
                      class="form-control form-control-sm"
                      data-group-field="members"
                      size="${Math.min(Math.max(usernames.length, 3), 8)}">
                ${memberOptions}
              </select>
              <small class="text-muted">
                Hold Ctrl/Cmd to select multiple users.
              </small>
            </div>
    
            <div style="margin-top:8px;">
              <button type="button"
                      class="btn btn-sm btn-secondary"
                      data-group-action="edit-acl">
                Edit folder access
              </button>
            </div>
          </div>
        </div>
      `;
    });

    body.innerHTML = html;

    // Collapse/expand group cards (default: collapsed)
    body.querySelectorAll('.card[data-group-name]').forEach(card => {
      const header = card.querySelector('.group-card-header');
      const bodyEl = card.querySelector('.group-card-body');
      const caret = card.querySelector('.group-caret');
      if (!header || !bodyEl || !caret) return;

      const setExpanded = (expanded) => {
        header.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        bodyEl.style.display = expanded ? 'block' : 'none';
        caret.textContent = expanded ? '▾' : '▸';
      };

      // Start collapsed
      setExpanded(false);

      const toggle = () => {
        const isOpen = header.getAttribute('aria-expanded') === 'true';
        setExpanded(!isOpen);
      };

      header.addEventListener('click', (e) => {
        // Don’t toggle when clicking the delete button
        if (e.target.closest('[data-group-action="delete"]')) return;
        toggle();
      });

      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });
    });

    // Show selected members as chips under each multi-select
    body.querySelectorAll('select[data-group-field="members"]').forEach(sel => {
      const chips = document.createElement('div');
      chips.className = 'group-members-chips';
      chips.style.marginTop = '4px';
      sel.insertAdjacentElement('afterend', chips);

      const renderChips = () => {
        const names = Array.from(sel.selectedOptions).map(o => o.value);
        if (!names.length) {
          chips.innerHTML = `<span class="muted" style="font-size:11px;">No members selected</span>`;
          return;
        }
        chips.innerHTML = names.map(n => `
          <span class="group-member-pill">${n}</span>
        `).join(' ');
      };

      sel.addEventListener('change', renderChips);
      renderChips(); // initial
    });

    body.querySelectorAll('[data-group-action="delete"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('[data-group-name]');
        const name = card && card.getAttribute('data-group-name');
        if (!name) return;
        if (!confirm(`Delete group "${name}"?`)) return;
        delete __groupsCache[name];
        card.remove();
      });
    });

    body.querySelectorAll('[data-group-action="edit-acl"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('[data-group-name]');
        if (!card) return;
        const nameInput = card.querySelector('input[data-group-field="name"]');
        const name = (nameInput && nameInput.value || '').trim();
        if (!name) {
          showToast('Enter a group name first.');
          return;
        }
        await openGroupAclEditor(name);
      });
    });
  } catch (e) {
    console.error(e);
    body.innerHTML = `<p class="muted">${tf('error_loading_groups', 'Error loading groups')}</p>`;
  }
}

function addEmptyGroupRow() {
  if (!__groupsCache || typeof __groupsCache !== 'object') {
    __groupsCache = {};
  }
  let idx = 1;
  let name = `group${idx}`;
  while (__groupsCache[name]) {
    idx += 1;
    name = `group${idx}`;
  }
  __groupsCache[name] = { name, label: name, members: [], grants: {} };
  // Re-render using local cache only; don't clobber with server (which is still empty)
  loadUserGroupsList(true);
}

async function saveUserGroupsFromUI() {
  const body = document.getElementById('userGroupsBody');
  const status = document.getElementById('userGroupsStatus');
  if (!body) return;

  const cards = body.querySelectorAll('[data-group-name]');
  const groups = {};

  cards.forEach(card => {
    const oldName = card.getAttribute('data-group-name') || '';
    const nameEl = card.querySelector('input[data-group-field="name"]');
    const labelEl = card.querySelector('input[data-group-field="label"]');
    const membersSel = card.querySelector('select[data-group-field="members"]');

    const name = (nameEl && nameEl.value || '').trim();
    if (!name) return;

    const label = (labelEl && labelEl.value || '').trim() || name;
    const members = Array.from(membersSel && membersSel.selectedOptions || []).map(o => o.value);

    const existing = __groupsCache[oldName] || __groupsCache[name] || { grants: {} };
    groups[name] = {
      name,
      label,
      members,
      grants: existing.grants || {}
    };
  });

  if (status) {
    status.textContent = 'Saving groups…';
    status.className = 'small text-muted';
  }

  try {
    const res = await saveAllGroups(groups);
    if (!res.success) {
      showToast(res.error || 'Error saving groups');
      if (status) {
        status.textContent = 'Error saving groups.';
        status.className = 'small text-danger';
      }
      return;
    }

    __groupsCache = groups;
    if (status) {
      status.textContent = 'Groups saved.';
      status.className = 'small text-success';
    }
    showToast('Groups saved.');
  } catch (e) {
    console.error(e);
    if (status) {
      status.textContent = 'Error saving groups.';
      status.className = 'small text-danger';
    }
    showToast('Error saving groups', 'error');
  }
}

async function openGroupAclEditor(groupName) {
  const isDark = document.body.classList.contains('dark-mode');
  const overlayBg = isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.3)';
  const contentBg = isDark ? '#2c2c2c' : '#fff';
  const contentFg = isDark ? '#e0e0e0' : '#000';
  const borderCol = isDark ? '#555' : '#ccc';

  let modal = document.getElementById('groupAclModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'groupAclModal';
    modal.style.cssText = `
      position:fixed; inset:0; background:${overlayBg};
      display:flex; align-items:center; justify-content:center; z-index:3700;
    `;
    modal.innerHTML = `
      <div class="modal-content"
           style="background:${contentBg}; color:${contentFg};
                  padding:16px; max-width:1300px; width:99%;
                  position:relative;
                  border:1px solid ${borderCol}; max-height:90vh; overflow:auto;">
        <span id="closeGroupAclModal"
              class="editor-close-btn"
              style="right:8px; top:8px;">&times;</span>

        <h3 id="groupAclTitle">Group folder access</h3>
        <div class="muted" style="margin:-4px 0 10px;">
          Group grants are merged with each member’s own folder access. They never reduce access.
        </div>

        <div id="groupAclBody" style="max-height:70vh; overflow-y:auto; margin-bottom:12px;"></div>

        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button type="button" id="cancelGroupAcl" class="btn btn-secondary">${t('cancel')}</button>
          <button type="button" id="saveGroupAcl"   class="btn btn-primary">${t('save_permissions')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('closeGroupAclModal').onclick = () => (modal.style.display = 'none');
    document.getElementById('cancelGroupAcl').onclick = () => (modal.style.display = 'none');
    document.getElementById('saveGroupAcl').onclick = saveGroupAclFromUI;
  } else {
    modal.style.background = overlayBg;
    const content = modal.querySelector('.modal-content');
    if (content) {
      content.style.background = contentBg;
      content.style.color = contentFg;
      content.style.border = `1px solid ${borderCol}`;
    }
  }

  const title = document.getElementById('groupAclTitle');
  if (title) title.textContent = `Group folder access: ${groupName}`;

  const body = document.getElementById('groupAclBody');
  if (body) body.textContent = `${t('loading')}…`;

  modal.dataset.groupName = groupName;
  modal.style.display = 'flex';

  const folders = await getAllFolders(true);
  const grants = (__groupsCache[groupName] && __groupsCache[groupName].grants) || {};

  if (body) {
    body.textContent = '';
    const box = document.createElement('div');
    box.className = 'folder-grants-box';
    body.appendChild(box);

    renderFolderGrantsUI(groupName, box, ['root', ...folders.filter(f => f !== 'root')], grants);
  }
}

function saveGroupAclFromUI() {
  const modal = document.getElementById('groupAclModal');
  if (!modal) return;
  const groupName = modal.dataset.groupName;
  if (!groupName) return;

  const body = document.getElementById('groupAclBody');
  if (!body) return;
  const box = body.querySelector('.folder-grants-box');
  if (!box) return;

  const grants = collectGrantsFrom(box);
  if (!__groupsCache[groupName]) {
    __groupsCache[groupName] = { name: groupName, label: groupName, members: [], grants: {} };
  }
  __groupsCache[groupName].grants = grants;

  showToast('Group folder access updated. Remember to Save groups.');
  modal.style.display = 'none';
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
  const isAdmin = String(u.role) === "1" || u.username.toLowerCase() === "admin";

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
      const isAdmin =
        (user.role && String(user.role) === "1") ||
        username.toLowerCase() === "admin";

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
            const groupMask = computeGroupGrantMaskForUser(user.username);

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
