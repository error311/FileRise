import { t } from './i18n.js';
import { loadAdminConfigFunc } from './auth.js';
import { showToast, toggleVisibility, attachEnterKeyListener } from './domUtils.js';
import { sendRequest } from './networkUtils.js';

const version = "v1.4.0";
const adminTitle = `${t("admin_panel")} <small style="font-size:12px;color:gray;">${version}</small>`;

// Translate with fallback: if t(key) just echos the key, use a readable string.
const tf = (key, fallback) => {
  const v = t(key);
  return (v && v !== key) ? v : fallback;
};

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
    }

    /* Small phones: 90% width */
    @media (max-width: 900px) {
      #adminPanelModal .modal-content {
        width: 90% !important;
        max-width: none !important;
      }
    }

    /* Dark-mode fixes */
    body.dark-mode #adminPanelModal .modal-content {
      border-color: #555 !important;
    }

      /* enforce light‐mode styling */
      #adminPanelModal .modal-content {
        max-width: 1100px;
        width: 50%;
        background: #fff !important;
        color: #000 !important;
        border: 1px solid #ccc !important;
      }
  
      /* enforce dark‐mode styling */
      body.dark-mode #adminPanelModal .modal-content {
        background: #2c2c2c !important;
        color: #e0e0e0 !important;
        border-color: #555 !important;
      }
  
      /* form controls in dark */
      body.dark-mode .form-control {
        background-color: #333;
        border-color: #555;
        color: #eee;
      }
      body.dark-mode .form-control::placeholder { color: #888; }
  
      /* Section headers */
      .section-header {
        background: #f5f5f5;
        padding: 10px 15px;
        cursor: pointer;
        border-radius: 4px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 16px;
      }
      .section-header:first-of-type { margin-top: 0; }
      .section-header.collapsed .material-icons { transform: rotate(-90deg); }
      .section-header .material-icons { transition: transform .3s; color: #444; }
  
      body.dark-mode .section-header {
        background: #3a3a3a;
        color: #eee;
      }
      body.dark-mode .section-header .material-icons { color: #ccc; }
  
      /* Hidden by default */
      .section-content {
        display: none;
        margin-left: 20px;
        margin-top: 8px;
        margin-bottom: 8px;
      }
  
      /* Close button */
      #adminPanelModal .editor-close-btn {
        position: absolute; top:10px; right:10px;
        display:flex; align-items:center; justify-content:center;
        font-size:20px; font-weight:bold; cursor:pointer;
        z-index:1000; width:32px; height:32px; border-radius:50%;
        text-align:center; line-height:30px;
        color:#ff4d4d; background:rgba(255,255,255,0.9);
        border:2px solid transparent; transition:all .3s;
      }
      #adminPanelModal .editor-close-btn:hover {
        color:white; background:#ff4d4d;
        box-shadow:0 0 6px rgba(255,77,77,.8);
        transform:scale(1.05);
      }
      body.dark-mode #adminPanelModal .editor-close-btn {
        background:rgba(0,0,0,0.6);
        color:#ff4d4d;
      }
  
      /* Action-row */
      .action-row {
        display:flex;
        justify-content:space-between;
        margin-top:15px;
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
  // collapsed class present => hide; absent => show
  cnt.style.display = isCollapsedNow ? "none" : "block";
  if (!isCollapsedNow && id === "shareLinks") {
    loadShareLinksSection();
  }
}

function loadShareLinksSection() {
  const container = document.getElementById("shareLinksContent");
  container.textContent = t("loading") + "...";

  // helper: fetch one metadata file, but never throw —
  // on non-2xx (including 404) or network error, resolve to {}
  function fetchMeta(fileName) {
    return fetch(`/api/admin/readMetadata.php?file=${encodeURIComponent(fileName)}`, {
      credentials: "include"
    })
      .then(resp => {
        if (!resp.ok) {
          // 404 or any other non-OK → treat as empty
          return {};
        }
        return resp.json();
      })
      .catch(() => {
        // network failure, parse error, etc → also empty
        return {};
      });
  }

  Promise.all([
    fetchMeta("share_folder_links.json"),
    fetchMeta("share_links.json")
  ])
    .then(([folders, files]) => {
      // if *both* are empty, show "no shared links"
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

      // wire up delete buttons
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
            .then(res => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      // apply header title + globals
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
              
              <!-- each section: header + content -->
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

        // Populate each section’s CONTENT:
        // — User Mgmt —
        document.getElementById("userManagementContent").innerHTML = `
          <button type="button" id="adminOpenAddUser" class="btn btn-success me-2">${t("add_user")}</button>
          <button type="button" id="adminOpenRemoveUser" class="btn btn-danger me-2">${t("remove_user")}</button>
          <button type="button" id="adminOpenUserPermissions" class="btn btn-secondary">${t("user_permissions")}</button>
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
        // If authBypass is checked, clear the other three
        document.getElementById("authBypass").addEventListener("change", e => {
          if (e.target.checked) {
            ["disableFormLogin", "disableBasicAuth", "disableOIDCLogin"]
              .forEach(i => document.getElementById(i).checked = false);
          }
        });

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
        // update dark/light as above...
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
  }, {
    "X-CSRF-Token": window.csrfToken
  })
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

// --- New: User Permissions Modal ---
export function openUserPermissionsModal() {
  let userPermissionsModal = document.getElementById("userPermissionsModal");
  const isDarkMode = document.body.classList.contains("dark-mode");
  const overlayBackground = isDarkMode ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.3)";
  const modalContentStyles = `
        background: ${isDarkMode ? "#2c2c2c" : "#fff"};
        color: ${isDarkMode ? "#e0e0e0" : "#000"};
        padding: 20px;
        max-width: 500px;
        width: 90%;
        border-radius: 8px;
        position: relative;
      `;

  if (!userPermissionsModal) {
    userPermissionsModal = document.createElement("div");
    userPermissionsModal.id = "userPermissionsModal";
    userPermissionsModal.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background-color: ${overlayBackground};
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 3500;
        `;
    userPermissionsModal.innerHTML = `
          <div class="modal-content" style="${modalContentStyles}">
            <span id="closeUserPermissionsModal" class="editor-close-btn">&times;</span>
            <h3>${t("user_permissions")}</h3>
            <div id="userPermissionsList" style="max-height: 300px; overflow-y: auto; margin-bottom: 15px;">
              <!-- User rows will be loaded here -->
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
    document.getElementById("saveUserPermissionsBtn").addEventListener("click", () => {
      // Collect permissions data from each user row.
      const rows = userPermissionsModal.querySelectorAll(".user-permission-row");
      const permissionsData = [];
      rows.forEach(row => {
        const g = k => row.querySelector(`input[data-permission='${k}']`)?.checked ?? false;
        permissionsData.push({
          username: row.getAttribute("data-username"),
          folderOnly:    g("folderOnly"),
          readOnly:      g("readOnly"),
          disableUpload: g("disableUpload"),
          bypassOwnership: g("bypassOwnership"),
          canShare:        g("canShare"),
          canZip:          g("canZip"),
          viewOwnOnly:     g("viewOwnOnly"),
        });
      });
      // Send the permissionsData to the server.
      sendRequest("/api/updateUserPermissions.php", "POST", { permissions: permissionsData }, { "X-CSRF-Token": window.csrfToken })
        .then(response => {
          if (response.success) {
            showToast(t("user_permissions_updated_successfully"));
            userPermissionsModal.style.display = "none";
          } else {
            showToast(t("error_updating_permissions") + ": " + (response.error || t("unknown_error")));
          }
        })
        .catch(() => {
          showToast(t("error_updating_permissions"));
        });
    });
  } else {
    userPermissionsModal.style.display = "flex";
  }
  // Load the list of users into the modal.
  loadUserPermissionsList();
}

function loadUserPermissionsList() {
  const listContainer = document.getElementById("userPermissionsList");
  if (!listContainer) return;
  listContainer.innerHTML = "";

  // First, fetch the current permissions from the server.
  fetch("/api/getUserPermissions.php", { credentials: "include" })
    .then(response => response.json())
    .then(permissionsData => {
      // Then, fetch the list of users.
      return fetch("/api/getUsers.php", { credentials: "include" })
        .then(response => response.json())
        .then(usersData => {
          const users = Array.isArray(usersData) ? usersData : (usersData.users || []);
          if (users.length === 0) {
            listContainer.innerHTML = "<p>" + t("no_users_found") + "</p>";
            return;
          }
          users.forEach(user => {
            // Skip admin users.
            if ((user.role && user.role === "1") || user.username.toLowerCase() === "admin") return;

            // Use stored permissions if available; otherwise fall back to defaults.
            const defaultPerm = {
              folderOnly: false,
              readOnly: false,
              disableUpload: false,
              bypassOwnership: false,
              canShare: false,
              canZip: false,
              viewOwnOnly: false,
            };

            // Normalize the username key to match server storage (e.g., lowercase)
            const usernameKey = user.username.toLowerCase();


            const toBool = v => v === true || v === 1 || v === "1";
            const userPerm = (permissionsData && typeof permissionsData === "object" && (usernameKey in permissionsData))
              ? permissionsData[usernameKey]
              : defaultPerm;


            // Create a row for the user (collapsed by default)
const row = document.createElement("div");
row.classList.add("user-permission-row");
row.setAttribute("data-username", user.username);
row.style.padding = "6px 0";

// helper for checkbox checked state
const checked = key => (userPerm && userPerm[key]) ? "checked" : "";

// header + caret
row.innerHTML = `
  <div class="user-perm-header"
       role="button"
       tabindex="0"
       aria-expanded="false"
       style="display:flex;align-items:center;justify-content:space-between;
              padding:8px 6px;border-radius:6px;cursor:pointer;
              background:var(--perm-header-bg, rgba(0,0,0,0.04));">
    <span style="font-weight:600;">${user.username}</span>
    <i class="material-icons perm-caret" style="transition:transform .2s; transform:rotate(-90deg);">expand_more</i>
  </div>

  <div class="user-perm-details"
       style="display:none;margin:8px 4px 2px 10px;
              display:none;gap:8px;
              grid-template-columns: 1fr 1fr;">
    <label><input type="checkbox" data-permission="folderOnly" ${checked("folderOnly")}/> ${t("user_folder_only")}</label>
    <label><input type="checkbox" data-permission="readOnly" ${checked("readOnly")}/> ${t("read_only")}</label>
    <label><input type="checkbox" data-permission="disableUpload" ${checked("disableUpload")}/> ${t("disable_upload")}</label>

    <label><input type="checkbox" data-permission="bypassOwnership" ${checked("bypassOwnership")}/> Bypass ownership</label>
    <label><input type="checkbox" data-permission="canShare" ${checked("canShare")}/> Can share</label>
    <label><input type="checkbox" data-permission="canZip" ${checked("canZip")}/> Can zip</label>
    <label><input type="checkbox" data-permission="viewOwnOnly" ${checked("viewOwnOnly")}/> View own files only</label>
  </div>

  <hr style="margin:8px 0 4px;border:0;border-bottom:1px solid #ccc;">
`;

// toggle open/closed on click + Enter/Space
const header  = row.querySelector(".user-perm-header");
const details = row.querySelector(".user-perm-details");
const caret   = row.querySelector(".perm-caret");

function toggleOpen() {
  const willShow = details.style.display === "none";
  details.style.display = willShow ? "grid" : "none";
  header.setAttribute("aria-expanded", willShow ? "true" : "false");
  caret.style.transform = willShow ? "rotate(0deg)" : "rotate(-90deg)";
}

header.addEventListener("click", toggleOpen);
header.addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleOpen(); }
});

listContainer.appendChild(row);
            listContainer.appendChild(row);
          });
        });
    })
    .catch(() => {
      listContainer.innerHTML = "<p>" + t("error_loading_users") + "</p>";
    });
}