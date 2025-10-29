// adminPanel.js
import { t } from './i18n.js?v={{APP_QVER}}';
import { loadAdminConfigFunc } from './auth.js?v={{APP_QVER}}';
import { showToast, toggleVisibility, attachEnterKeyListener } from './domUtils.js?v={{APP_QVER}}';
import { sendRequest } from './networkUtils.js?v={{APP_QVER}}';

const version = window.APP_VERSION || "dev";
const adminTitle = `${t("admin_panel")} <small style="font-size:12px;color:gray;">${version}</small>`;


function buildFullGrantsForAllFolders(folders) {
  const allTrue = {
    view:true, viewOwn:false, manage:true, create:true, upload:true, edit:true,
    rename:true, copy:true, move:true, delete:true, extract:true,
    shareFile:true, shareFolder:true, share:true
  };
  return folders.reduce((acc, f) => { acc[f] = { ...allTrue }; return acc; }, {});
}

/* === BEGIN: Folder Access helpers (merged + improved) === */
function qs(scope, sel){ return (scope||document).querySelector(sel); }
function qsa(scope, sel){ return Array.from((scope||document).querySelectorAll(sel)); }

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
  const hasOwn  = !!(viewOwn && viewOwn.checked);
  if (!hasView && !hasOwn && viewOwn) {
    viewOwn.checked = true;
  }
}

function onWriteToggle(row, checked) {
  const caps = ["create","upload","edit","rename","copy","delete","extract"];
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
    @media (max-width: 900px) {
      #adminPanelModal .modal-content {
        width: 90% !important;
        max-width: none !important;
      }
    }
    body.dark-mode #adminPanelModal .modal-content { background:#2c2c2c !important; color:#e0e0e0 !important; border-color:#555 !important; }
    body.dark-mode .form-control { background-color:#333; border-color:#555; color:#eee; }
    body.dark-mode .form-control::placeholder { color:#888; }

    .section-header {
      background:#f5f5f5; padding:10px 15px; cursor:pointer; border-radius:4px; font-weight:bold;
      display:flex; align-items:center; justify-content:space-between; margin-top:16px;
    }
    .section-header:first-of-type { margin-top:0; }
    .section-header.collapsed .material-icons { transform:rotate(-90deg); }
    .section-header .material-icons { transition:transform .3s; color:#444; }
    body.dark-mode .section-header { background:#3a3a3a; color:#eee; }
    body.dark-mode .section-header .material-icons { color:#ccc; }

    .section-content { display:none; margin-left:20px; margin-top:8px; margin-bottom:8px; }

    #adminPanelModal .editor-close-btn {
      position:absolute; top:10px; right:10px; display:flex; align-items:center; justify-content:center;
      font-size:20px; font-weight:bold; cursor:pointer; z-index:1000; width:32px; height:32px; border-radius:50%;
      text-align:center; line-height:30px; color:#ff4d4d; background:rgba(255,255,255,0.9);
      border:2px solid transparent; transition:all .3s;
    }
    #adminPanelModal .editor-close-btn:hover { color:#fff; background:#ff4d4d; box-shadow:0 0 6px rgba(255,77,77,.8); transform:scale(1.05); }
    body.dark-mode #adminPanelModal .editor-close-btn { background:rgba(0,0,0,0.6); color:#ff4d4d; }

    .action-row { display:flex; justify-content:space-between; margin-top:15px; }

    /* ---------- Folder access editor ---------- */
    .folder-access-toolbar {
      display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:8px 0 6px;
    }
    .folder-access-list {
      --col-perm: 84px;
      --col-folder-min: 340px;
      max-height: 320px;
      overflow: auto;
      border: 1px solid #ccc;
      border-radius: 6px;
      padding: 0;
    }
    body.dark-mode .folder-access-list { border-color:#555; }

    .folder-access-header,
    .folder-access-row {
      display: grid;
      grid-template-columns: minmax(var(--col-folder-min), 1fr) repeat(14, var(--col-perm));
      gap: 8px;
      align-items: center;
      padding: 8px 10px;
    }
    .folder-access-header {
      position: sticky;
      top: 0;
      z-index: 2;
      background: #fff;
      font-weight: 700;
      border-bottom: 1px solid rgba(0,0,0,0.12);
    }
    body.dark-mode .folder-access-header { background:#2c2c2c; }

    .folder-access-row { border-bottom: 1px solid rgba(0,0,0,0.06); }
    .folder-access-row:last-child { border-bottom: none; }

    .perm-col { text-align:center; white-space:nowrap; }
    .folder-access-header > div { white-space: nowrap; }

    .folder-badge {
      display:inline-flex; align-items:center; gap:6px;
      font-weight:600; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;
      min-width: 0;
    }

    .muted { opacity:.65; font-size:.9em; }

    /* Inheritance visuals */
    .inherited-row {
      opacity: 0.8;
      background: rgba(32, 132, 255, 0.06);
    }
    .inherited-tag {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 10px;
      background: rgba(32,132,255,0.12);
      color: #2064ff;
      margin-left: 6px;
    }
    body.dark-mode .inherited-row { background: rgba(32,132,255,0.12); }
    body.dark-mode .inherited-tag { background: rgba(32,132,255,0.2); color: #89b3ff; }

    @media (max-width: 900px) {
      .folder-access-list { --col-perm: 72px; --col-folder-min: 240px; }
    }

    /* Folder cell: horizontal-only scroll */
  .folder-cell{
    overflow-x:auto;
    overflow-y:hidden;
    white-space:nowrap;
    -webkit-overflow-scrolling:touch;
  }
  /* nicer thin scrollbar (supported browsers) */
  .folder-cell::-webkit-scrollbar{ height:8px; }
  .folder-cell::-webkit-scrollbar-thumb{ background:rgba(0,0,0,.25); border-radius:4px; }
  body.dark-mode .folder-cell::-webkit-scrollbar-thumb{ background:rgba(255,255,255,.25); }

  /* Badge now doesn't clip; let the wrapper handle scroll */
  .folder-badge{
    display:inline-flex; align-items:center; gap:6px;
    font-weight:600;
    min-width:0; /* allow child to be as wide as needed inside scroller */
  }
  `;
  document.head.appendChild(style);
})();
// ————————————————————————————————————

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
    globalOtpauthUrl: (document.getElementById("globalOtpauthUrl")?.value || "").trim()
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
    getVal("globalOtpauthUrl") !== o.globalOtpauthUrl
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

        document.getElementById("closeAdminPanel").addEventListener("click", closeAdminPanel);
        document.getElementById("cancelAdminSettings").addEventListener("click", closeAdminPanel);

        ["userManagement", "headerSettings", "loginOptions", "webdav", "upload", "oidc", "shareLinks"]
          .forEach(id => {
            document.getElementById(id + "Header")
              .addEventListener("click", () => toggleSection(id));
          });

        document.getElementById("userManagementContent").innerHTML = `
          <button type="button" id="adminOpenAddUser" class="btn btn-success me-2">${t("add_user")}</button>
          <button type="button" id="adminOpenRemoveUser" class="btn btn-danger me-2">${t("remove_user")}</button>
          <button type="button" id="adminOpenUserPermissions" class="btn btn-secondary">${tf("folder_access", "Folder Access")}</button>
          <button type="button" id="adminOpenUserFlags" class="btn btn-secondary">${tf("user_permissions", "User Permissions")}</button>
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

        document.getElementById("headerSettingsContent").innerHTML = `
          <div class="form-group">
            <label for="headerTitle">${t("header_title_text")}:</label>
            <input type="text" id="headerTitle" class="form-control" value="${window.headerTitle || ""}" />
          </div>
        `;

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

        document.getElementById("oidcContent").innerHTML = `
          <div class="form-text text-muted" style="margin-top:8px;">
            <small>Note: OIDC credentials (Client ID/Secret) will show blank here after saving, but remain unchanged until you explicitly edit and save them.</small>
          </div>
          <div class="form-group"><label for="oidcProviderUrl">${t("oidc_provider_url")}:</label><input type="text" id="oidcProviderUrl" class="form-control" value="${window.currentOIDCConfig?.providerUrl || ""}" /></div>
          <div class="form-group"><label for="oidcClientId">${t("oidc_client_id")}:</label><input type="text" id="oidcClientId" class="form-control" value="${window.currentOIDCConfig?.clientId || ""}" /></div>
          <div class="form-group"><label for="oidcClientSecret">${t("oidc_client_secret")}:</label><input type="text" id="oidcClientSecret" class="form-control" value="${window.currentOIDCConfig?.clientSecret || ""}" /></div>
          <div class="form-group"><label for="oidcRedirectUri">${t("oidc_redirect_uri")}:</label><input type="text" id="oidcRedirectUri" class="form-control" value="${window.currentOIDCConfig?.redirectUri || ""}" /></div>
          <div class="form-group"><label for="globalOtpauthUrl">${t("global_otpauth_url")}:</label><input type="text" id="globalOtpauthUrl" class="form-control" value="${window.currentOIDCConfig?.globalOtpauthUrl || 'otpauth://totp/{label}?secret={secret}&issuer=FileRise'}" /></div>
        `;

        document.getElementById("shareLinksContent").textContent = t("loading") + "…";

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
        captureInitialAdminConfig();

      } else {
        mdl.style.display = "flex";
        document.getElementById("disableFormLogin").checked = config.loginOptions.disableFormLogin === true;
        document.getElementById("disableBasicAuth").checked = config.loginOptions.disableBasicAuth === true;
        document.getElementById("disableOIDCLogin").checked = config.loginOptions.disableOIDCLogin === true;
        document.getElementById("authBypass").checked = !!config.loginOptions.authBypass;
        document.getElementById("authHeaderName").value = config.loginOptions.authHeaderName || "X-Remote-User";
        document.getElementById("enableWebDAV").checked = config.enableWebDAV === true;
        document.getElementById("sharedMaxUploadSize").value = config.sharedMaxUploadSize || "";
        document.getElementById("oidcProviderUrl").value = window.currentOIDCConfig?.providerUrl || "";
        document.getElementById("oidcClientId").value = window.currentOIDCConfig?.clientId || "";
        document.getElementById("oidcClientSecret").value = window.currentOIDCConfig?.clientSecret || "";
        document.getElementById("oidcRedirectUri").value = window.currentOIDCConfig?.redirectUri || "";
        document.getElementById("globalOtpauthUrl").value = window.currentOIDCConfig?.globalOtpauthUrl || '';
        captureInitialAdminConfig();
      }
    })
    .catch(() => {/* if even fetching fails, open empty panel */ });
}

function handleSave() {
  const dFL = !!document.getElementById("disableFormLogin")?.checked;
  const dBA = !!document.getElementById("disableBasicAuth")?.checked;
  const dOIDC = !!document.getElementById("disableOIDCLogin")?.checked;
  const aBypass = !!document.getElementById("authBypass")?.checked;
  const aHeader = (document.getElementById("authHeaderName")?.value || "X-Remote-User").trim();
  const eWD = !!document.getElementById("enableWebDAV")?.checked;
  const sMax = parseInt(document.getElementById("sharedMaxUploadSize")?.value || "0", 10) || 0;
  const nHT = (document.getElementById("headerTitle")?.value || "").trim();
  const nOIDC = {
    providerUrl: (document.getElementById("oidcProviderUrl")?.value || "").trim(),
    clientId: (document.getElementById("oidcClientId")?.value || "").trim(),
    clientSecret: (document.getElementById("oidcClientSecret")?.value || "").trim(),
    redirectUri: (document.getElementById("oidcRedirectUri")?.value || "").trim()
  };
  const gURL = (document.getElementById("globalOtpauthUrl")?.value || "").trim();

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
    <div class="folder-cell" title="${tf('folder_help','Folder path within FileRise')}">
      ${tf('folder','Folder')}
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
    const rows = qsa(list, '.folder-access-row').sort((a,b)=> (a.dataset.folder||'').length - (b.dataset.folder||'').length);
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
        const v = qs(row,'input[data-cap="view"]');
        const w = qs(row,'input[data-cap="write"]');
        const vo= qs(row,'input[data-cap="viewOwn"]');
        if (v) v.checked = true;
        if (w) w.checked = true;
        if (vo) { vo.checked = false; vo.disabled = true; }
        ['create','upload','edit','rename','copy','delete','extract','shareFile','shareFolder']
          .forEach(c => { const cb = qs(row, `input[data-cap="${c}"]`); if (cb) cb.checked = true; });
        setRowDisabled(row, true);
        const tag = row.querySelector('.inherited-tag');
        if (tag) tag.textContent = `(${tf('inherited', 'inherited')} ${tf('from', 'from')} ${inheritedFrom})`;
      } else {
        setRowDisabled(row, false);
      }
      enforceShareFolderRule(row);
      const cbView = qs(row,'input[data-cap="view"]');
      const cbViewOwn = qs(row,'input[data-cap="viewOwn"]');
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
    const cbView = qs(row,'input[data-cap="view"]');
    const cbVO = qs(row,'input[data-cap="viewOwn"]');
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
    const cbView    = row.querySelector('input[data-cap="view"]');
    const cbViewOwn = row.querySelector('input[data-cap="viewOwn"]');
    const cbWrite   = row.querySelector('input[data-cap="write"]');
    const cbManage  = row.querySelector('input[data-cap="manage"]');
    const cbCreate  = row.querySelector('input[data-cap="create"]');
    const cbUpload  = row.querySelector('input[data-cap="upload"]');
    const cbEdit    = row.querySelector('input[data-cap="edit"]');
    const cbRename  = row.querySelector('input[data-cap="rename"]');
    const cbCopy    = row.querySelector('input[data-cap="copy"]');
    const cbMove    = row.querySelector('input[data-cap="move"]');
    const cbDelete  = row.querySelector('input[data-cap="delete"]');
    const cbExtract = row.querySelector('input[data-cap="extract"]');
    const cbShareF  = row.querySelector('input[data-cap="shareFile"]');
    const cbShareFo = row.querySelector('input[data-cap="shareFolder"]');

    const granular = [cbCreate, cbUpload, cbEdit, cbRename, cbCopy, cbMove, cbDelete, cbExtract];

    const applyManage = () => {
      if (cbManage && cbManage.checked) {
        if (cbView) cbView.checked = true;
        if (cbWrite) cbWrite.checked = true;
        granular.forEach(cb => { if (cb) cb.checked = true; });
        if (cbShareF)  cbShareF.checked = true;
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
          'create','upload','edit','rename','copy','delete','extract','shareFile','shareFolder'
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
    if (cbWrite)  cbWrite.addEventListener('change', applyWrite);
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
      view:        get(row, 'input[data-cap="view"]'),
      viewOwn:     get(row, 'input[data-cap="viewOwn"]'),
      manage:      get(row, 'input[data-cap="manage"]'),
      create:      get(row, 'input[data-cap="create"]'),
      upload:      get(row, 'input[data-cap="upload"]'),
      edit:        get(row, 'input[data-cap="edit"]'),
      rename:      get(row, 'input[data-cap="rename"]'),
      copy:        get(row, 'input[data-cap="copy"]'),
      move:        get(row, 'input[data-cap="move"]'),
      delete:      get(row, 'input[data-cap="delete"]'),
      extract:     get(row, 'input[data-cap="extract"]'),
      shareFile:   get(row, 'input[data-cap="shareFile"]'),
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
                  border-radius:8px; position:relative;
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
    const usersRes = await fetch("/api/getUsers.php", { credentials: "include" });
    const usersData = await safeJson(usersRes);
    const users = Array.isArray(usersData) ? usersData : (usersData.users || []);
    if (!users.length) {
      listContainer.innerHTML = "<p>" + t("no_users_found") + "</p>";
      return;
    }

    const folders = await getAllFolders(true);

    listContainer.innerHTML = "";
users.forEach(user => {
  const isAdmin = (user.role && String(user.role) === "1") || String(user.username).toLowerCase() === "admin";

  const row = document.createElement("div");
  row.classList.add("user-permission-row");
  row.setAttribute("data-username", user.username);
  if (isAdmin) row.setAttribute("data-admin", "1"); // mark admins
  row.style.padding = "6px 0";

  row.innerHTML = `
    <div class="user-perm-header" tabindex="0" role="button" aria-expanded="false"
         style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 8px;border-radius:6px;">
      <span class="perm-caret" style="display:inline-block; transform: rotate(-90deg); transition: transform 120ms ease;">▸</span>
      <strong>${user.username}</strong>
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
      if (isAdmin) {
        // synthesize full access
        const ordered = ["root", ...folders.filter(f => f !== "root")];
        grants = buildFullGrantsForAllFolders(ordered);
        renderFolderGrantsUI(user.username, grantsBox, ordered, grants);
        // disable all inputs
        grantsBox.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.disabled = true);
      } else {
        const userGrants = await getUserGrants(user.username);
        renderFolderGrantsUI(user.username, grantsBox, ["root", ...folders.filter(f => f !== "root")], userGrants);
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
