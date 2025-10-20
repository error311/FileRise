// adminPanel.js
import { t } from './i18n.js';
import { loadAdminConfigFunc } from './auth.js';
import { showToast, toggleVisibility, attachEnterKeyListener } from './domUtils.js';
import { sendRequest } from './networkUtils.js';

const version = "v1.5.3";
const adminTitle = `${t("admin_panel")} <small style="font-size:12px;color:gray;">${version}</small>`;

// Translate with fallback: if t(key) just echos the key, use a readable string.
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

// ————— Inject updated styles —————
(function () {
  if (document.getElementById('adminPanelStyles')) return;
  const style = document.createElement('style');
  style.id = 'adminPanelStyles';
  style.textContent = `
    /* Modal sizing */
    #adminPanelModal .modal-content {
      max-width: 1100px;
      width: 50%;
      background: #fff !important;
      color: #000 !important;
      border: 1px solid #ccc !important;
    }
    /* Small phones: 90% width */
    @media (max-width: 900px) {
      #adminPanelModal .modal-content {
        width: 90% !important;
        max-width: none !important;
      }
    }
    /* Dark-mode fixes */
    body.dark-mode #adminPanelModal .modal-content { background:#2c2c2c !important; color:#e0e0e0 !important; border-color:#555 !important; }
    body.dark-mode .form-control { background-color:#333; border-color:#555; color:#eee; }
    body.dark-mode .form-control::placeholder { color:#888; }

    /* Section headers */
    .section-header {
      background:#f5f5f5; padding:10px 15px; cursor:pointer; border-radius:4px; font-weight:bold;
      display:flex; align-items:center; justify-content:space-between; margin-top:16px;
    }
    .section-header:first-of-type { margin-top:0; }
    .section-header.collapsed .material-icons { transform:rotate(-90deg); }
    .section-header .material-icons { transition:transform .3s; color:#444; }
    body.dark-mode .section-header { background:#3a3a3a; color:#eee; }
    body.dark-mode .section-header .material-icons { color:#ccc; }

    /* Hidden by default */
    .section-content { display:none; margin-left:20px; margin-top:8px; margin-bottom:8px; }

    /* Close button */
    #adminPanelModal .editor-close-btn {
      position:absolute; top:10px; right:10px; display:flex; align-items:center; justify-content:center;
      font-size:20px; font-weight:bold; cursor:pointer; z-index:1000; width:32px; height:32px; border-radius:50%;
      text-align:center; line-height:30px; color:#ff4d4d; background:rgba(255,255,255,0.9);
      border:2px solid transparent; transition:all .3s;
    }
    #adminPanelModal .editor-close-btn:hover { color:#fff; background:#ff4d4d; box-shadow:0 0 6px rgba(255,77,77,.8); transform:scale(1.05); }
    body.dark-mode #adminPanelModal .editor-close-btn { background:rgba(0,0,0,0.6); color:#ff4d4d; }

    /* Action-row */
    .action-row { display:flex; justify-content:space-between; margin-top:15px; }

    /* ---------- Folder access editor ---------- */
    .folder-access-toolbar {
      display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:8px 0 6px;
    }

    /* Scroll area (header lives inside, sticky) */
    .folder-access-list {
      --col-perm: 84px;         /* width of each permission column */
      --col-folder-min: 340px;  /* min width for folder names */
      max-height: 320px;
      overflow: auto;
      border: 1px solid #ccc;
      border-radius: 6px;
      padding: 0;               /* no inner padding to keep grid aligned */
    }
    body.dark-mode .folder-access-list { border-color:#555; }

    /* Shared grid for header + rows (MUST match) */
    .folder-access-header,
    .folder-access-row {
      display: grid;
      grid-template-columns: minmax(var(--col-folder-min), 1fr) repeat(5, var(--col-perm));
      gap: 8px;
      align-items: center;
      padding: 8px 10px;
    }

    /* Sticky header so it always aligns with the rows under the same scrollbar */
    .folder-access-header {
      position: sticky;
      top: 0;
      z-index: 2;
      background: #fff;
      font-weight: 700;
      border-bottom: 1px solid rgba(0,0,0,0.12);
    }
    body.dark-mode .folder-access-header { background:#2c2c2c; }

    /* Rows */
    .folder-access-row { border-bottom: 1px solid rgba(0,0,0,0.06); }
    .folder-access-row:last-child { border-bottom: none; }

    /* Columns */
    .perm-col { text-align:center; white-space:nowrap; }
    .folder-access-header > div { white-space: nowrap; }

    /* Folder label: show more of the path, ellipsis if needed */
    .folder-badge {
      display:inline-flex; align-items:center; gap:6px;
      font-weight:600; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;
      min-width: 0; /* allow ellipsis in grid */
    }

    .muted { opacity:.65; font-size:.9em; }

    /* Tighter on small screens */
    @media (max-width: 900px) {
      .folder-access-list { --col-perm: 72px; --col-folder-min: 240px; }
    }
  `;
  document.head.appendChild(style);
})();
// ————————————————————————————————————

let originalAdminConfig = {};
function captureInitialAdminConfig() {
  originalAdminConfig = {
    headerTitle: document.getElementById("headerTitle").value.trim(),
    oidcProviderUrl: document.getElementById("oidcProviderUrl").value.trim(),
    oidcClientId: document.getElementById("oidcClientId").value.trim(),
    oidcClientSecret: document.getElementById("oidcClientSecret").value.trim(),
    oidcRedirectUri: document.getElementById("oidcRedirectUri").value.trim(),
    disableFormLogin: document.getElementById("disableFormLogin").checked,
    disableBasicAuth: document.getElementById("disableBasicAuth").checked,
    disableOIDCLogin: document.getElementById("disableOIDCLogin").checked,
    enableWebDAV: document.getElementById("enableWebDAV").checked,
    sharedMaxUploadSize: document.getElementById("sharedMaxUploadSize").value.trim(),
    globalOtpauthUrl: document.getElementById("globalOtpauthUrl").value.trim()
  };
}
function hasUnsavedChanges() {
  const o = originalAdminConfig;
  return (
    document.getElementById("headerTitle").value.trim() !== o.headerTitle ||
    document.getElementById("oidcProviderUrl").value.trim() !== o.oidcProviderUrl ||
    document.getElementById("oidcClientId").value.trim() !== o.oidcClientId ||
    document.getElementById("oidcClientSecret").value.trim() !== o.oidcClientSecret ||
    document.getElementById("oidcRedirectUri").value.trim() !== o.oidcRedirectUri ||
    document.getElementById("disableFormLogin").checked !== o.disableFormLogin ||
    document.getElementById("disableBasicAuth").checked !== o.disableBasicAuth ||
    document.getElementById("disableOIDCLogin").checked !== o.disableOIDCLogin ||
    document.getElementById("enableWebDAV").checked !== o.enableWebDAV ||
    document.getElementById("sharedMaxUploadSize").value.trim() !== o.sharedMaxUploadSize ||
    document.getElementById("globalOtpauthUrl").value.trim() !== o.globalOtpauthUrl
  );
}

function showCustomConfirmModal(message) {
  return new Promise(resolve => {
    const modal = document.getElementById("customConfirmModal");
    const msg = document.getElementById("confirmMessage");
    const yes = document.getElementById("confirmYesBtn");
    const no = document.getElementById("confirmNoBtn");
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
  const isCollapsedNow = hdr.classList.toggle("collapsed");
  cnt.style.display = isCollapsedNow ? "none" : "block";
  if (!isCollapsedNow && id === "shareLinks") {
    loadShareLinksSection();
  }
}

function loadShareLinksSection() {
  const container = document.getElementById("shareLinksContent");
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
        document.querySelector(".header-title h1").textContent = config.header_title;
        window.headerTitle = config.header_title;
      }
      if (config.oidc) Object.assign(window.currentOIDCConfig, config.oidc);
      if (config.globalOtpauthUrl) window.currentOIDCConfig.globalOtpauthUrl = config.globalOtpauthUrl;

      const dark = document.body.classList.contains("dark-mode");
      const bg = dark ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.3)";
      const inner = `
        background:${dark ? "#2c2c2c" : "#fff"};
        color:${dark ? "#e0e0e0" : "#000"};
        padding:20px; max-width:1100px; width:50%;
        border-radius:8px; position:relative;
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
            <h3>${adminTitle}</h3>
            <form id="adminPanelForm">
              ${[
            { id: "userManagement", label: t("user_management") },
            { id: "headerSettings", label: t("header_settings") },
            { id: "loginOptions", label: t("login_options") },
            { id: "webdav", label: "WebDAV Access" },
            { id: "upload", label: t("shared_max_upload_size_bytes_title") },
            { id: "oidc", label: t("oidc_configuration") + " & TOTP" },
            { id: "shareLinks", label: t("manage_shared_links") }
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

        // Bind close & cancel
        document.getElementById("closeAdminPanel")
          .addEventListener("click", closeAdminPanel);
        document.getElementById("cancelAdminSettings")
          .addEventListener("click", closeAdminPanel);

        // Section toggles
        ["userManagement", "headerSettings", "loginOptions", "webdav", "upload", "oidc", "shareLinks"]
          .forEach(id => {
            document.getElementById(id + "Header")
              .addEventListener("click", () => toggleSection(id));
          });

        // — User Mgmt —
        document.getElementById("userManagementContent").innerHTML = `
          <button type="button" id="adminOpenAddUser" class="btn btn-success me-2">${t("add_user")}</button>
          <button type="button" id="adminOpenRemoveUser" class="btn btn-danger me-2">${t("remove_user")}</button>
          <button type="button" id="adminOpenUserPermissions" class="btn btn-secondary">${tf("folder_access", "Folder Access")}</button>
          <button type="button" id="adminOpenUserFlags" class="btn btn-secondary">${tf("user_permissions", "User Permissions")}</button>
        `;


        document.getElementById("adminOpenAddUser")
          .addEventListener("click", () => {
            toggleVisibility("addUserModal", true);
            document.getElementById("newUsername").focus();
          });
        document.getElementById("adminOpenRemoveUser")
          .addEventListener("click", () => {
            if (typeof window.loadUserList === "function") window.loadUserList();
            toggleVisibility("removeUserModal", true);
          });
        document.getElementById("adminOpenUserPermissions")
          .addEventListener("click", openUserPermissionsModal);

        // — Header Settings —
        document.getElementById("headerSettingsContent").innerHTML = `
          <div class="form-group">
            <label for="headerTitle">${t("header_title_text")}:</label>
            <input type="text" id="headerTitle" class="form-control" value="${window.headerTitle}" />
          </div>
        `;

        // — Login Options —
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

        // — WebDAV —
        document.getElementById("webdavContent").innerHTML = `
          <div class="form-group"><input type="checkbox" id="enableWebDAV" /> <label for="enableWebDAV">Enable WebDAV</label></div>
        `;

        // — Upload —
        document.getElementById("uploadContent").innerHTML = `
          <div class="form-group">
            <label for="sharedMaxUploadSize">${t("shared_max_upload_size_bytes")}:</label>
            <input type="number" id="sharedMaxUploadSize" class="form-control" placeholder="e.g. 52428800" />
            <small>${t("max_bytes_shared_uploads_note")}</small>
          </div>
        `;

        // — OIDC & TOTP —
        document.getElementById("oidcContent").innerHTML = `
          <div class="form-text text-muted" style="margin-top:8px;">
            <small>Note: OIDC credentials (Client ID/Secret) will show blank here after saving, but remain unchanged until you explicitly edit and save them.</small>
          </div>
          <div class="form-group"><label for="oidcProviderUrl">${t("oidc_provider_url")}:</label><input type="text" id="oidcProviderUrl" class="form-control" value="${window.currentOIDCConfig.providerUrl}" /></div>
          <div class="form-group"><label for="oidcClientId">${t("oidc_client_id")}:</label><input type="text" id="oidcClientId" class="form-control" value="${window.currentOIDCConfig.clientId}" /></div>
          <div class="form-group"><label for="oidcClientSecret">${t("oidc_client_secret")}:</label><input type="text" id="oidcClientSecret" class="form-control" value="${window.currentOIDCConfig.clientSecret}" /></div>
          <div class="form-group"><label for="oidcRedirectUri">${t("oidc_redirect_uri")}:</label><input type="text" id="oidcRedirectUri" class="form-control" value="${window.currentOIDCConfig.redirectUri}" /></div>
          <div class="form-group"><label for="globalOtpauthUrl">${t("global_otpauth_url")}:</label><input type="text" id="globalOtpauthUrl" class="form-control" value="${window.currentOIDCConfig.globalOtpauthUrl || 'otpauth://totp/{label}?secret={secret}&issuer=FileRise'}" /></div>
        `;

        // — Share Links —
        document.getElementById("shareLinksContent").textContent = t("loading") + "…";

        // — Save handler & constraints —
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

        // after you set #userManagementContent.innerHTML (right after those three buttons are inserted)
        const userMgmt = document.getElementById("userManagementContent");

        // defensive: remove any old listener first
        userMgmt?.removeEventListener("click", window.__userMgmtDelegatedClick);

        window.__userMgmtDelegatedClick = (e) => {
          const flagsBtn = e.target.closest("#adminOpenUserFlags");
          if (flagsBtn) {
            e.preventDefault();
            openUserFlagsModal();
          }
          const folderBtn = e.target.closest("#adminOpenUserPermissions");
          if (folderBtn) {
            e.preventDefault();
            openUserPermissionsModal();
          }
        };

        userMgmt?.addEventListener("click", window.__userMgmtDelegatedClick);

        // Initialize inputs from config + capture
        document.getElementById("disableFormLogin").checked = config.loginOptions.disableFormLogin === true;
        document.getElementById("disableBasicAuth").checked = config.loginOptions.disableBasicAuth === true;
        document.getElementById("disableOIDCLogin").checked = config.loginOptions.disableOIDCLogin === true;
        document.getElementById("authBypass").checked = !!config.loginOptions.authBypass;
        document.getElementById("authHeaderName").value = config.loginOptions.authHeaderName || "X-Remote-User";
        document.getElementById("enableWebDAV").checked = config.enableWebDAV === true;
        document.getElementById("sharedMaxUploadSize").value = config.sharedMaxUploadSize || "";
        captureInitialAdminConfig();

      } else {
        // modal already exists → just refresh values & re-show
        mdl.style.display = "flex";
        document.getElementById("disableFormLogin").checked = config.loginOptions.disableFormLogin === true;
        document.getElementById("disableBasicAuth").checked = config.loginOptions.disableBasicAuth === true;
        document.getElementById("disableOIDCLogin").checked = config.loginOptions.disableOIDCLogin === true;
        document.getElementById("authBypass").checked = !!config.loginOptions.authBypass;
        document.getElementById("authHeaderName").value = config.loginOptions.authHeaderName || "X-Remote-User";
        document.getElementById("enableWebDAV").checked = config.enableWebDAV === true;
        document.getElementById("sharedMaxUploadSize").value = config.sharedMaxUploadSize || "";
        document.getElementById("oidcProviderUrl").value = window.currentOIDCConfig.providerUrl;
        document.getElementById("oidcClientId").value = window.currentOIDCConfig.clientId;
        document.getElementById("oidcClientSecret").value = window.currentOIDCConfig.clientSecret;
        document.getElementById("oidcRedirectUri").value = window.currentOIDCConfig.redirectUri;
        document.getElementById("globalOtpauthUrl").value = window.currentOIDCConfig.globalOtpauthUrl || '';
        captureInitialAdminConfig();
      }
    })
    .catch(() => {/* if even fetching fails, open empty panel */ });
}

function handleSave() {
  const dFL = document.getElementById("disableFormLogin").checked;
  const dBA = document.getElementById("disableBasicAuth").checked;
  const dOIDC = document.getElementById("disableOIDCLogin").checked;
  const aBypass = document.getElementById("authBypass").checked;
  const aHeader = document.getElementById("authHeaderName").value.trim() || "X-Remote-User";
  const eWD = document.getElementById("enableWebDAV").checked;
  const sMax = parseInt(document.getElementById("sharedMaxUploadSize").value, 10) || 0;
  const nHT = document.getElementById("headerTitle").value.trim();
  const nOIDC = {
    providerUrl: document.getElementById("oidcProviderUrl").value.trim(),
    clientId: document.getElementById("oidcClientId").value.trim(),
    clientSecret: document.getElementById("oidcClientSecret").value.trim(),
    redirectUri: document.getElementById("oidcRedirectUri").value.trim()
  };
  const gURL = document.getElementById("globalOtpauthUrl").value.trim();

  if ([dFL, dBA, dOIDC].filter(x => x).length === 3) {
    showToast(t("at_least_one_login_method"));
    return;
  }

  sendRequest("/api/admin/updateConfig.php", "POST", {
    header_title: nHT,
    oidc: nOIDC,
    loginOptions: {
      disableFormLogin: dFL,
      disableBasicAuth: dBA,
      disableOIDCLogin: dOIDC,
      authBypass: aBypass,
      authHeaderName: aHeader
    },
    enableWebDAV: eWD,
    sharedMaxUploadSize: sMax,
    globalOtpauthUrl: gURL
  }, { "X-CSRF-Token": window.csrfToken })
    .then(res => {
      if (res.success) {
        showToast(t("settings_updated_successfully"), "success");
        captureInitialAdminConfig();
        closeAdminPanel();
        loadAdminConfigFunc();
      } else {
        showToast(t("error_updating_settings") + ": " + (res.error || t("unknown_error")), "error");
      }
    }).catch(() => {/*noop*/ });
}

export async function closeAdminPanel() {
  if (hasUnsavedChanges()) {
    const ok = await showCustomConfirmModal(t("unsaved_changes_confirm"));
    if (!ok) return;
  }
  document.getElementById("adminPanelModal").style.display = "none";
}

/* ===========================
   New: Folder Access (ACL) UI
   =========================== */

let __allFoldersCache = null; // array of folder strings
async function getAllFolders() {
  if (__allFoldersCache) return __allFoldersCache.slice();
  const res = await fetch('/api/folder/getFolderList.php', { credentials: 'include' });
  const data = await safeJson(res).catch(() => []);
  const list = Array.isArray(data)
    ? data.map(x => (typeof x === 'string' ? x : x.folder)).filter(Boolean)
    : [];
  // Keep "root" first, hide special internal ones
  const hidden = new Set(["profile_pics", "trash"]);
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
  // expected: { grants: { "folder/name": {view,upload,manage,share}, ... } }
  return (data && data.grants) ? data.grants : {};
}

function renderFolderGrantsUI(username, container, folders, grants) {
  container.innerHTML = "";

  // toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'folder-access-toolbar';
  // Toolbar (bulk toggles with descriptions)
  toolbar.innerHTML = `
  <input type="text" class="form-control" style="max-width:220px;" placeholder="${tf('search_folders', 'Search folders')}" />
  <label class="muted" title="${tf('view_all_help', 'See all files in this folder (everyone’s files)')}">
    <input type="checkbox" data-bulk="view" /> ${tf('view_all', 'View (all)')}
  </label>
  <label class="muted" title="${tf('view_own_help', 'See only files you uploaded in this folder')}">
    <input type="checkbox" data-bulk="viewOwn" /> ${tf('view_own', 'View (own)')}
  </label>
  <label class="muted" title="${tf('write_help', 'Create/upload files and edit/rename/move/delete items in this folder')}">
    <input type="checkbox" data-bulk="upload" /> ${tf('write_full', 'Write (upload/edit/delete)')}
  </label>
  <label class="muted" title="${tf('manage_help', 'Owner-level: can grant access; implies View (all) + Write + Share')}">
    <input type="checkbox" data-bulk="manage" /> ${tf('manage', 'Manage')}
  </label>
  <label class="muted" title="${tf('share_help', 'Create/manage share links; implies View (all)')}">
    <input type="checkbox" data-bulk="share" /> ${tf('share', 'Share')}
  </label>
  <span class="muted">(${tf('applies_to_filtered', 'applies to filtered list')})</span>
`;
  container.appendChild(toolbar);

  // list (will contain sticky header + rows)
  const list = document.createElement('div');
  list.className = 'folder-access-list';
  container.appendChild(list);

  // Header (compact labels, descriptive tooltips so the column width stays the same)
  const headerHtml = `
  <div class="folder-access-header">
    <div title="${tf('folder_help', 'Folder path within FileRise')}">${tf('folder', 'Folder')}</div>
    <div class="perm-col" title="${tf('view_all_help', 'See all files in this folder (everyones files)')}">
      ${tf('view_all', 'View (all)')}
    </div>
    <div class="perm-col" title="${tf('view_own_help', 'See only files you uploaded in this folder')}">
      ${tf('view_own', 'View (own)')}
    </div>
    <div class="perm-col" title="${tf('write_help', 'Create/upload files and edit/rename/move/delete items in this folder')}">
      ${tf('write', 'Write')}
    </div>
    <div class="perm-col" title="${tf('manage_help', 'Owner-level: can grant access; implies View (all) + Write + Share')}">
      ${tf('manage', 'Manage')}
    </div>
    <div class="perm-col" title="${tf('share_help', 'Create/manage share links; implies View (all)')}">
      ${tf('share', 'Share')}
    </div>
  </div>
`;

  function rowHtml(folder) {
    const g = grants[folder] || {};
    const name = folder === 'root' ? '(Root)' : folder;
    return `
      <div class="folder-access-row" data-folder="${folder}">
        <div class="folder-badge"><i class="material-icons" style="font-size:18px;">folder</i>${name}</div>
        <div class="perm-col"><input type="checkbox" data-cap="view"     ${g.view ? 'checked' : ''}></div>
        <div class="perm-col"><input type="checkbox" data-cap="viewOwn"  ${g.viewOwn ? 'checked' : ''}></div>
        <div class="perm-col"><input type="checkbox" data-cap="upload"   ${g.upload ? 'checked' : ''}></div>
        <div class="perm-col"><input type="checkbox" data-cap="manage"   ${g.manage ? 'checked' : ''}></div>
        <div class="perm-col"><input type="checkbox" data-cap="share"    ${g.share ? 'checked' : ''}></div>
      </div>
    `;
  }

  // Dependencies
  function applyDeps(row) {
    const cbView = row.querySelector('input[data-cap="view"]');
    const cbViewOwn = row.querySelector('input[data-cap="viewOwn"]');
    const cbUpload = row.querySelector('input[data-cap="upload"]');
    const cbManage = row.querySelector('input[data-cap="manage"]');
    const cbShare = row.querySelector('input[data-cap="share"]');

    // Manage ⇒ full view + upload + share
    if (cbManage.checked) {
      cbView.checked = true;
      cbUpload.checked = true;
      cbShare.checked = true;
    }

    // Share ⇒ full view
    if (cbShare.checked) cbView.checked = true;

    // Upload ⇒ at least own view
    if (cbUpload.checked && !cbView.checked && !cbViewOwn.checked) {
      cbViewOwn.checked = true;
    }

    // Full view supersedes own-only
    if (cbView.checked || cbManage.checked) {
      cbViewOwn.checked = false;
      cbViewOwn.disabled = true;
      cbViewOwn.title = tf('full_view_supersedes_own', 'Full view supersedes own-only');
    } else {
      cbViewOwn.disabled = false;
      cbViewOwn.removeAttribute('title');
    }

    // Owners can always share (UI hint only)
    if (cbManage.checked) {
      cbShare.disabled = true;
      cbShare.title = tf('owners_can_always_share', 'Owners can always share');
    } else {
      cbShare.disabled = false;
      cbShare.removeAttribute('title');
    }
  }

  function wireRow(row) {
    const cbView = row.querySelector('input[data-cap="view"]');
    const cbViewOwn = row.querySelector('input[data-cap="viewOwn"]');
    const cbUpload = row.querySelector('input[data-cap="upload"]');
    const cbManage = row.querySelector('input[data-cap="manage"]');
    const cbShare = row.querySelector('input[data-cap="share"]');

    cbUpload.addEventListener('change', () => applyDeps(row));
    cbShare.addEventListener('change', () => applyDeps(row));
    cbManage.addEventListener('change', () => applyDeps(row));

    cbView.addEventListener('change', () => {
      if (!cbView.checked) { cbManage.checked = false; cbShare.checked = false; }
      applyDeps(row);
    });
    cbViewOwn.addEventListener('change', () => applyDeps(row));

    applyDeps(row);
  }

  function render(filter = "") {
    const f = filter.trim().toLowerCase();
    const rowsHtml = folders
      .filter(x => !f || x.toLowerCase().includes(f))
      .map(rowHtml)
      .join("");

    list.innerHTML = headerHtml + rowsHtml;

    list.querySelectorAll('.folder-access-row').forEach(wireRow);
  }

  // initial render + filter wire-up
  render();
  const filterInput = toolbar.querySelector('input[type="text"]');
  filterInput.addEventListener('input', () => render(filterInput.value));

  // bulk toggles
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

        // simple implications for bulk; detailed state handled by applyDeps
        if (which === 'manage' && bulk.checked) {
          row.querySelector('input[data-cap="view"]').checked = true;
          row.querySelector('input[data-cap="upload"]').checked = true;
          row.querySelector('input[data-cap="share"]').checked = true;
        }
        if (which === 'share' && bulk.checked) {
          row.querySelector('input[data-cap="view"]').checked = true;
        }
        if (which === 'upload' && bulk.checked) {
          const v = row.querySelector('input[data-cap="view"]');
          const vo = row.querySelector('input[data-cap="viewOwn"]');
          if (!v.checked && !vo.checked) vo.checked = true;
        }
        if (which === 'view' && !bulk.checked) {
          row.querySelector('input[data-cap="manage"]').checked = false;
          row.querySelector('input[data-cap="share"]').checked = false;
        }

        applyDeps(row);
      });
    });
  });
}

// Collect grants from a user's UI
function collectGrantsFrom(container) {
  const out = {};
  container.querySelectorAll('.folder-access-row').forEach(row => {
    const folder = row.dataset.folder;
    if (!folder) return;
    const g = {
      view: row.querySelector('input[data-cap="view"]').checked,
      viewOwn: row.querySelector('input[data-cap="viewOwn"]').checked,
      upload: row.querySelector('input[data-cap="upload"]').checked,
      manage: row.querySelector('input[data-cap="manage"]').checked,
      share: row.querySelector('input[data-cap="share"]').checked
    };
    if (g.view || g.viewOwn || g.upload || g.manage || g.share) out[folder] = g;
  });
  return out;
}

// --- New: User Permissions (Folder Access) Modal ---
export function openUserPermissionsModal() {
  let userPermissionsModal = document.getElementById("userPermissionsModal");
  const isDarkMode = document.body.classList.contains("dark-mode");
  const overlayBackground = isDarkMode ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.3)";
  const modalContentStyles = `
  background: ${isDarkMode ? "#2c2c2c" : "#fff"};
  color: ${isDarkMode ? "#e0e0e0" : "#000"};
  padding: 20px;
  /* Wider, responsive */
  width: clamp(980px, 92vw, 1280px);
  max-width: none;
  border-radius: 8px;
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
          <!-- User rows will load here -->
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
      // Collect grants for every expanded user (or all rows that have a grants list)
      const rows = userPermissionsModal.querySelectorAll(".user-permission-row");
      let saves = [];
      rows.forEach(row => {
        const username = row.getAttribute("data-username");
        const grantsBox = row.querySelector(".folder-grants-box");
        if (!username || !grantsBox) return;
        const grants = collectGrantsFrom(grantsBox);
        saves.push({ user: username, grants });
      });

      try {
        if (saves.length === 0) {
          showToast(tf("nothing_to_save", "Nothing to save"));
          return;
        }
        for (const payload of saves) {
          await sendRequest("/api/admin/acl/saveGrants.php", "POST", payload, { "X-CSRF-Token": window.csrfToken });
        }
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
  return await r.json(); // array of { username, role }
}

// Returns a map of { username: { readOnly, folderOnly, disableUpload, canShare, bypassOwnership } }
async function fetchAllUserFlags() {
  const r = await fetch("/api/getUserPermissions.php", { credentials: "include" });
  const data = await r.json();
  // remove deprecated flag if present, so UI never shows it
  if (data && typeof data === "object") {
    const map = data.allPermissions || data.permissions || data;
    if (map && typeof map === "object") {
      Object.values(map).forEach(u => { if (u && typeof u === "object") delete u.folderOnly; });
    }
  }
  // Accept both shapes: {users:[...]} or a plain object map
  if (Array.isArray(data)) {
    // unlikely, but normalize
    const out = {};
    data.forEach(u => { if (u.username) out[u.username] = u; });
    return out;
  }
  if (data && data.allPermissions) return data.allPermissions;
  if (data && data.permissions) return data.permissions;
  return data || {};
}

function flagRow(u, flags) {
  const f = flags[u.username] || {};
  const isAdmin = String(u.role) === "1" || u.username.toLowerCase() === "admin";
  if (isAdmin) return ""; // skip admins here
  return `
    <tr data-username="${u.username}">
      <td><strong>${u.username}</strong></td>
      <td style="text-align:center;"><input type="checkbox" data-flag="readOnly"        ${f.readOnly ? "checked" : ""}></td>
      <td style="text-align:center;"><input type="checkbox" data-flag="disableUpload"   ${f.disableUpload ? "checked" : ""}></td>
      <td style="text-align:center;"><input type="checkbox" data-flag="canShare"        ${f.canShare ? "checked" : ""}></td>
      <td style="text-align:center;"><input type="checkbox" data-flag="bypassOwnership" ${f.bypassOwnership ? "checked" : ""}></td>
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
                  border-radius:8px; position:relative;
                  border:1px solid ${borderCol};">
        <span id="closeUserFlagsModal"
              class="editor-close-btn"
              style="right:8px; top:8px;">&times;</span>

        <h3>${tf("user_permissions", "User Permissions")}</h3>
        <p class="muted" style="margin-top:-6px;">
          ${tf("user_flags_help", "Account-level switches. These are NOT per-folder grants.")}
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
    // Re-apply theme if user toggled dark mode since last open
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
  body.textContent = `${t("loading")}…`;
  try {
    const users = await fetchAllUsers();                     // [{username, role}]
    const flagsMap = await fetchAllUserFlags();              // { username: {…} }
    const rows = users.map(u => flagRow(u, flagsMap)).filter(Boolean).join("");
    body.innerHTML = `
      <table class="table table-sm" style="width:100%;">
        <thead>
          <tr>
            <th>${t("user")}</th>
            <th>${t("read_only")}</th>
            <th>${t("disable_upload")}</th>
            <th>${t("can_share")}</th>
            <th>bypassOwnership</th>
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
  const rows = body.querySelectorAll("tbody tr[data-username]");
  const permissions = [];
  rows.forEach(tr => {
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
    // reuse your existing endpoint
    const res = await sendRequest("/api/updateUserPermissions.php", "PUT",
      { permissions },
      { "X-CSRF-Token": window.csrfToken }
    );
    if (res && res.success) {
      showToast(tf("user_permissions_updated_successfully", "User permissions updated successfully"));
      document.getElementById("userFlagsModal").style.display = "none";
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
    const usersRes = await fetch("/api/getUsers.php", { credentials: "include" });
    const usersData = await safeJson(usersRes);
    const users = Array.isArray(usersData) ? usersData : (usersData.users || []);
    if (!users.length) {
      listContainer.innerHTML = "<p>" + t("no_users_found") + "</p>";
      return;
    }

    // Preload folders once (admin should see all)
    const folders = await getAllFolders();

    listContainer.innerHTML = ""; // clear
    users.forEach(user => {
      // Skip admins
      if ((user.role && String(user.role) === "1") || String(user.username).toLowerCase() === "admin") return;

      const row = document.createElement("div");
      row.classList.add("user-permission-row");
      row.setAttribute("data-username", user.username);
      row.style.padding = "6px 0";

      row.innerHTML = `
        <div class="user-perm-header"
             role="button"
             tabindex="0"
             aria-expanded="false"
             style="display:flex;align-items:center;justify-content:space-between;
                    padding:8px 6px;border-radius:6px;cursor:pointer;
                    background:var(--perm-header-bg, rgba(0,0,0,0.04));">
          <span style="font-weight:600;">${user.username}</span>
          <i class="material-icons perm-caret"
   style="transition:transform .2s; transform:rotate(-90deg); color: var(--perm-caret, #444);">
  expand_more
</i>
        </div>

        <div class="user-perm-details" style="display:none;margin:8px 4px 2px 10px;">
          <div class="folder-grants-box">
            <div class="muted">${t("loading")}…</div>
          </div>
        </div>

        <hr style="margin:8px 0 4px;border:0;border-bottom:1px solid #ccc;">
      `;

      const header = row.querySelector(".user-perm-header");
      const details = row.querySelector(".user-perm-details");
      const caret = row.querySelector(".perm-caret");
      const grantsBox = row.querySelector(".folder-grants-box");

      async function ensureLoaded() {
        if (grantsBox.dataset.loaded === "1") return;
        try {
          const grants = await getUserGrants(user.username);
          renderFolderGrantsUI(user.username, grantsBox, ["root", ...folders.filter(f => f !== "root")], grants);
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