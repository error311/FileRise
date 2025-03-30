import { sendRequest } from './networkUtils.js';
import { toggleVisibility, showToast, attachEnterKeyListener, showCustomConfirmModal } from './domUtils.js';
import { loadFileList, renderFileTable, displayFilePreview, initFileActions } from './fileManager.js';
import { loadFolderTree } from './folderManager.js';

// Default OIDC configuration (can be overridden via API in production)
const currentOIDCConfig = {
  providerUrl: "https://your-oidc-provider.com",
  clientId: "YOUR_CLIENT_ID",
  clientSecret: "YOUR_CLIENT_SECRET",
  redirectUri: "https://yourdomain.com/auth.php?oidc=callback",
  // Global OTPAuth URL; default applied if not set.
  globalOtpauthUrl: ""
};

/* ----------------- Utility Functions ----------------- */
function updateItemsPerPageSelect() {
  const selectElem = document.querySelector(".form-control.bottom-select");
  if (selectElem) {
    selectElem.value = localStorage.getItem("itemsPerPage") || "10";
  }
}

function updateLoginOptionsUI({ disableFormLogin, disableBasicAuth, disableOIDCLogin }) {
  const authForm = document.getElementById("authForm");
  if (authForm) authForm.style.display = disableFormLogin ? "none" : "block";
  const basicAuthLink = document.querySelector("a[href='login_basic.php']");
  if (basicAuthLink) basicAuthLink.style.display = disableBasicAuth ? "none" : "inline-block";
  const oidcLoginBtn = document.getElementById("oidcLoginBtn");
  if (oidcLoginBtn) oidcLoginBtn.style.display = disableOIDCLogin ? "none" : "inline-block";
}

function updateLoginOptionsUIFromStorage() {
  updateLoginOptionsUI({
    disableFormLogin: localStorage.getItem("disableFormLogin") === "true",
    disableBasicAuth: localStorage.getItem("disableBasicAuth") === "true",
    disableOIDCLogin: localStorage.getItem("disableOIDCLogin") === "true"
  });
}

function loadAdminConfigFunc() {
  return fetch("getConfig.php", { credentials: "include" })
    .then(response => response.json())
    .then(config => {
      localStorage.setItem("disableFormLogin", config.loginOptions.disableFormLogin);
      localStorage.setItem("disableBasicAuth", config.loginOptions.disableBasicAuth);
      localStorage.setItem("disableOIDCLogin", config.loginOptions.disableOIDCLogin);
      localStorage.setItem("globalOtpauthUrl", config.globalOtpauthUrl || "otpauth://totp/FileRise?issuer=FileRise");
      updateLoginOptionsUIFromStorage();
    })
    .catch(() => {
      localStorage.setItem("disableFormLogin", "false");
      localStorage.setItem("disableBasicAuth", "false");
      localStorage.setItem("disableOIDCLogin", "false");
      localStorage.setItem("globalOtpauthUrl", "otpauth://totp/FileRise?issuer=FileRise");
      updateLoginOptionsUIFromStorage();
    });
}

function insertAfter(newNode, referenceNode) {
  referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}

function updateAuthenticatedUI(data) {
  toggleVisibility("loginForm", false);
  toggleVisibility("mainOperations", true);
  toggleVisibility("uploadFileForm", true);
  toggleVisibility("fileListContainer", true);
  attachEnterKeyListener("addUserModal", "saveUserBtn");
  attachEnterKeyListener("removeUserModal", "deleteUserBtn");
  attachEnterKeyListener("changePasswordModal", "saveNewPasswordBtn");
  document.querySelector(".header-buttons").style.visibility = "visible";

  // Update TOTP state from the server response.
  if (typeof data.totp_enabled !== "undefined") {
    localStorage.setItem("userTOTPEnabled", data.totp_enabled ? "true" : "false");
  }

  const headerButtons = document.querySelector(".header-buttons");
  const firstButton = headerButtons.firstElementChild; // first button in container

  // Admin controls: restore and admin panel buttons are shown only for admins.
  if (data.isAdmin) {
    // Create restore button.
    let restoreBtn = document.getElementById("restoreFilesBtn");
    if (!restoreBtn) {
      restoreBtn = document.createElement("button");
      restoreBtn.id = "restoreFilesBtn";
      restoreBtn.classList.add("btn", "btn-warning");
      restoreBtn.innerHTML = '<i class="material-icons" title="Restore/Delete Trash">restore_from_trash</i>';
      // Insert restoreBtn right after the first button.
      if (firstButton) {
        insertAfter(restoreBtn, firstButton);
      } else {
        headerButtons.appendChild(restoreBtn);
      }
    }
    restoreBtn.style.display = "block";

    // Create admin panel button.
    let adminPanelBtn = document.getElementById("adminPanelBtn");
    if (!adminPanelBtn) {
      adminPanelBtn = document.createElement("button");
      adminPanelBtn.id = "adminPanelBtn";
      adminPanelBtn.classList.add("btn", "btn-info");
      adminPanelBtn.innerHTML = '<i class="material-icons" title="Admin Panel">admin_panel_settings</i>';
      // Insert adminPanelBtn right after the restore button.
      insertAfter(adminPanelBtn, restoreBtn);
      adminPanelBtn.addEventListener("click", openAdminPanel);
    } else {
      adminPanelBtn.style.display = "block";
    }
  } else {
    const restoreBtn = document.getElementById("restoreFilesBtn");
    if (restoreBtn) restoreBtn.style.display = "none";
    const adminPanelBtn = document.getElementById("adminPanelBtn");
    if (adminPanelBtn) adminPanelBtn.style.display = "none";
  }

  // User panel button: Always visible for authenticated users.
  let userPanelBtn = document.getElementById("userPanelBtn");
  if (!userPanelBtn) {
    userPanelBtn = document.createElement("button");
    userPanelBtn.id = "userPanelBtn";
    userPanelBtn.classList.add("btn", "btn-user");
    userPanelBtn.innerHTML = '<i class="material-icons" title="User Panel">account_circle</i>';

    // Try to insert the user panel button right after the admin panel button if it exists.
    let adminPanelBtn = document.getElementById("adminPanelBtn");
    if (adminPanelBtn) {
      insertAfter(userPanelBtn, adminPanelBtn);
    } else {
      // If no admin panel button exists, insert right after the first button in headerButtons.
      const firstButton = headerButtons.firstElementChild;
      if (firstButton) {
        insertAfter(userPanelBtn, firstButton);
      } else {
        headerButtons.appendChild(userPanelBtn);
      }
    }
    userPanelBtn.addEventListener("click", openUserPanel);
  } else {
    userPanelBtn.style.display = "block";
  }

  updateItemsPerPageSelect();
  updateLoginOptionsUIFromStorage();
}

function checkAuthentication(showLoginToast = true) {
  return sendRequest("checkAuth.php")
    .then(data => {
      if (data.setup) {
        window.setupMode = true;
        if (showLoginToast) showToast("Setup mode: No users found. Please add an admin user.");
        toggleVisibility("loginForm", false);
        toggleVisibility("mainOperations", false);
        document.querySelector(".header-buttons").style.visibility = "hidden";
        toggleVisibility("addUserModal", true);
        document.getElementById("newUsername").focus();
        return false;
      }
      window.setupMode = false;
      if (data.authenticated) {
        // Update localStorage for TOTP state if provided by the server.
        if (typeof data.totp_enabled !== "undefined") {
          localStorage.setItem("userTOTPEnabled", data.totp_enabled ? "true" : "false");
        }
        updateAuthenticatedUI(data);
        return data;
      } else {
        if (showLoginToast) showToast("Please log in to continue.");
        toggleVisibility("loginForm", true);
        toggleVisibility("mainOperations", false);
        toggleVisibility("uploadFileForm", false);
        toggleVisibility("fileListContainer", false);
        document.querySelector(".header-buttons").style.visibility = "hidden";
        return false;
      }
    })
    .catch(() => false);
}

/* ----------------- TOTP Login Modal ----------------- */
let lastLoginData = null; // For auto-submission
function submitLogin(data) {
  lastLoginData = data;
  sendRequest("auth.php", "POST", data, { "X-CSRF-Token": window.csrfToken })
    .then(response => {
      if (response.success) {
        sessionStorage.setItem("welcomeMessage", "Welcome back, " + data.username + "!");
        window.location.reload();
      } else if (response.totp_required) {
        openTOTPLoginModal();
      } else if (response.error && response.error.includes("Too many failed login attempts")) {
        showToast(response.error);
        const loginButton = document.getElementById("authForm").querySelector("button[type='submit']");
        if (loginButton) {
          loginButton.disabled = true;
          setTimeout(() => {
            loginButton.disabled = false;
            showToast("You can now try logging in again.");
          }, 30 * 60 * 1000);
        }
      } else {
        showToast("Login failed: " + (response.error || "Unknown error"));
      }
    })
    .catch(() => {
      showToast("Login failed: Unknown error");
    });
}

function openTOTPLoginModal() {
  let totpLoginModal = document.getElementById("totpLoginModal");
  const isDarkMode = document.body.classList.contains("dark-mode");
  const modalBg = isDarkMode ? "#2c2c2c" : "#fff";
  const textColor = isDarkMode ? "#e0e0e0" : "#000";

  if (!totpLoginModal) {
    totpLoginModal = document.createElement("div");
    totpLoginModal.id = "totpLoginModal";
    totpLoginModal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-color: rgba(0,0,0,0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 3200;
    `;
    totpLoginModal.innerHTML = `
      <div style="background: ${modalBg}; padding: 20px; border-radius: 8px; text-align: center; position: relative; color: ${textColor};">
        <span id="closeTOTPLoginModal" style="position: absolute; top: 10px; right: 10px; cursor: pointer; font-size: 24px;">&times;</span>
        <h3>Enter TOTP Code</h3>
        <input type="text" id="totpLoginInput" maxlength="6" style="font-size:24px; text-align:center; width:100%; padding:10px;" placeholder="6-digit code" />
      </div>
    `;
    document.body.appendChild(totpLoginModal);
    document.getElementById("closeTOTPLoginModal").addEventListener("click", () => {
      totpLoginModal.style.display = "none";
    });
    const totpInput = document.getElementById("totpLoginInput");
    document.getElementById("totpLoginInput").focus();
    totpInput.addEventListener("input", function () {
      if (this.value.trim().length === 6 && lastLoginData) {
        lastLoginData.totp_code = this.value.trim();
        totpLoginModal.style.display = "none";
        submitLogin(lastLoginData);
      }
    });
  } else {
    totpLoginModal.style.display = "flex";
    // Update colors in case dark mode changed.
    const modalContent = totpLoginModal.firstElementChild;
    modalContent.style.background = modalBg;
    modalContent.style.color = textColor;
  }
}

/* ----------------- User Panel Modal ----------------- */
function openUserPanel() {
  let userPanelModal = document.getElementById("userPanelModal");
  const isDarkMode = document.body.classList.contains("dark-mode");
  const overlayBackground = isDarkMode ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.3)";
  // Added transform and transition none to prevent scaling on click.
  const modalContentStyles = `
    background: ${isDarkMode ? "#2c2c2c" : "#fff"};
    color: ${isDarkMode ? "#e0e0e0" : "#000"};
    padding: 20px;
    max-width: 600px;
    width: 90%;
    border-radius: 8px;
    position: relative;
    overflow-y: auto;
    max-height: 90vh;
    border: ${isDarkMode ? "1px solid #444" : "1px solid #ccc"};
    transform: none;
    transition: none;
  `;
  if (!userPanelModal) {
    userPanelModal = document.createElement("div");
    userPanelModal.id = "userPanelModal";
    userPanelModal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-color: ${overlayBackground};
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 3000;
    `;
    userPanelModal.innerHTML = `
      <div class="modal-content" style="${modalContentStyles}">
        <span id="closeUserPanel" style="position: absolute; top: 10px; right: 10px; cursor: pointer; font-size: 24px;">&times;</span>
        <h3>User Panel</h3>
        <button type="button" id="openChangePasswordModalBtn" class="btn btn-primary" style="margin-bottom: 15px;">Change Password</button>
        <fieldset style="margin-bottom: 15px;">
          <legend>TOTP Settings</legend>
            <div class="form-group">
               <label for="userTOTPEnabled">Enable TOTP:</label>
               <input type="checkbox" id="userTOTPEnabled" style="vertical-align: middle;" />
             </div>
        </fieldset>
      </div>
    `;
    document.body.appendChild(userPanelModal);
    document.getElementById("closeUserPanel").addEventListener("click", () => {
      userPanelModal.style.display = "none";
    });
    // Bind the "Change Password" button to open the changePasswordModal.
    document.getElementById("openChangePasswordModalBtn").addEventListener("click", () => {
      document.getElementById("changePasswordModal").style.display = "block";
    });
    // Initialize TOTP checkbox state and TOTP configuration button.
    const totpCheckbox = document.getElementById("userTOTPEnabled");
    // Initialize checkbox based on stored setting.
    totpCheckbox.checked = localStorage.getItem("userTOTPEnabled") === "true";
    
    totpCheckbox.addEventListener("change", function () {
      // Save the new state.
      localStorage.setItem("userTOTPEnabled", this.checked ? "true" : "false");
   
      const enabled = this.checked;
      fetch("updateUserPanel.php", {
        method: "POST",
        credentials: "include",
        headers: { 
          "Content-Type": "application/json", 
          "X-CSRF-Token": window.csrfToken 
        },
        body: JSON.stringify({ totp_enabled: enabled })
      })
        .then(r => r.json())
        .then(result => {
          if (!result.success) {
            showToast("Error updating TOTP setting: " + result.error);
          } else if (enabled) {
            // Automatically open the TOTP modal when TOTP is enabled.
            openTOTPModal();
          }
        })
        .catch(() => { showToast("Error updating TOTP setting."); });
    });
  } else {
    // Update colors in case dark mode changed.
    userPanelModal.style.backgroundColor = overlayBackground;
    const modalContent = userPanelModal.querySelector(".modal-content");
    modalContent.style.background = isDarkMode ? "#2c2c2c" : "#fff";
    modalContent.style.color = isDarkMode ? "#e0e0e0" : "#000";
    modalContent.style.border = isDarkMode ? "1px solid #444" : "1px solid #ccc";
  }
  userPanelModal.style.display = "flex";
}

/* ----------------- TOTP Setup Modal ----------------- */
function openTOTPModal() {
  let totpModal = document.getElementById("totpModal");
  const isDarkMode = document.body.classList.contains("dark-mode");
  const overlayBackground = isDarkMode ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.3)";
  const modalContentStyles = `
    background: ${isDarkMode ? "#2c2c2c" : "#fff"};
    color: ${isDarkMode ? "#e0e0e0" : "#000"};
    padding: 20px;
    max-width: 400px;
    width: 90%;
    border-radius: 8px;
    position: relative;
  `;
  if (!totpModal) {
    totpModal = document.createElement("div");
    totpModal.id = "totpModal";
    totpModal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-color: ${overlayBackground};
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 3100;
    `;
    totpModal.innerHTML = `
      <div class="modal-content" style="${modalContentStyles}">
        <span id="closeTOTPModal" style="position: absolute; top: 10px; right: 10px; cursor: pointer; font-size: 24px;">&times;</span>
        <h3>TOTP Setup</h3>
        <p>Scan this QR code with your authenticator app:</p>
        <img src="totp_setup.php?csrf=${encodeURIComponent(window.csrfToken)}" alt="TOTP QR Code" style="max-width: 100%; height: auto; display: block; margin: 0 auto;">
        <br/>
      </div>
    `;
    document.body.appendChild(totpModal);
    document.getElementById("closeTOTPModal").addEventListener("click", closeTOTPModal);
    const totpInput = document.getElementById("totpSetupInput");
    totpInput.addEventListener("input", function () {
      if (this.value.trim().length === 6 && lastLoginData) {
        lastLoginData.totp_code = this.value.trim();
        totpModal.style.display = "none";
        submitLogin(lastLoginData);
      }
    });
  } else {
    totpModal.style.display = "flex";
    totpModal.style.backgroundColor = overlayBackground;
    const modalContent = totpModal.querySelector(".modal-content");
    modalContent.style.background = isDarkMode ? "#2c2c2c" : "#fff";
    modalContent.style.color = isDarkMode ? "#e0e0e0" : "#000";
  }
}

function closeTOTPModal() {
  const totpModal = document.getElementById("totpModal");
  if (totpModal) totpModal.style.display = "none";
}

function openAdminPanel() {
  fetch("getConfig.php", { credentials: "include" })
    .then(response => response.json())
    .then(config => {
      if (config.oidc) Object.assign(currentOIDCConfig, config.oidc);
      if (config.globalOtpauthUrl) currentOIDCConfig.globalOtpauthUrl = config.globalOtpauthUrl;
      const isDarkMode = document.body.classList.contains("dark-mode");
      const overlayBackground = isDarkMode ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.3)";
      const modalContentStyles = `
        background: ${isDarkMode ? "#2c2c2c" : "#fff"};
        color: ${isDarkMode ? "#e0e0e0" : "#000"};
        padding: 20px;
        max-width: 600px;
        width: 90%;
        border-radius: 8px;
        position: relative;
        overflow-y: auto;
        max-height: 90vh;
        border: ${isDarkMode ? "1px solid #444" : "1px solid #ccc"};
      `;
      let adminModal = document.getElementById("adminPanelModal");

      if (!adminModal) {
        adminModal = document.createElement("div");
        adminModal.id = "adminPanelModal";
        adminModal.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background-color: ${overlayBackground};
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 3000;
        `;
        adminModal.innerHTML = `
          <div class="modal-content" style="${modalContentStyles}">
            <span id="closeAdminPanel" style="position: absolute; top: 10px; right: 10px; cursor: pointer; font-size: 24px;">&times;</span>
            <h3>Admin Panel</h3>
            <form id="adminPanelForm">
              <fieldset style="margin-bottom: 15px;">
                <legend>OIDC Configuration</legend>
                <div class="form-group">
                  <label for="oidcProviderUrl">OIDC Provider URL:</label>
                  <input type="text" id="oidcProviderUrl" class="form-control" value="${currentOIDCConfig.providerUrl}" />
                </div>
                <div class="form-group">
                  <label for="oidcClientId">OIDC Client ID:</label>
                  <input type="text" id="oidcClientId" class="form-control" value="${currentOIDCConfig.clientId}" />
                </div>
                <div class="form-group">
                  <label for="oidcClientSecret">OIDC Client Secret:</label>
                  <input type="text" id="oidcClientSecret" class="form-control" value="${currentOIDCConfig.clientSecret}" />
                </div>
                <div class="form-group">
                  <label for="oidcRedirectUri">OIDC Redirect URI:</label>
                  <input type="text" id="oidcRedirectUri" class="form-control" value="${currentOIDCConfig.redirectUri}" />
                </div>
              </fieldset>
              <fieldset style="margin-bottom: 15px;">
                <legend>Global TOTP Settings</legend>
                <div class="form-group">
                  <label for="globalOtpauthUrl">Global OTPAuth URL:</label>
                  <input type="text" id="globalOtpauthUrl" class="form-control" value="${currentOIDCConfig.globalOtpauthUrl || 'otpauth://totp/{label}?secret={secret}&issuer=FileRise'}" />
                </div>
              </fieldset>
              <fieldset style="margin-bottom: 15px;">
                <legend>Login Options</legend>
                <div class="form-group">
                  <input type="checkbox" id="disableFormLogin" />
                  <label for="disableFormLogin">Disable Login Form</label>
                </div>
                <div class="form-group">
                  <input type="checkbox" id="disableBasicAuth" />
                  <label for="disableBasicAuth">Disable Basic HTTP Auth</label>
                </div>
                <div class="form-group">
                  <input type="checkbox" id="disableOIDCLogin" />
                  <label for="disableOIDCLogin">Disable OIDC Login</label>
                </div>
              </fieldset>
              <fieldset style="margin-bottom: 15px;">
                <legend>User Management</legend>
                <div style="display: flex; gap: 10px;">
                  <button type="button" id="adminOpenAddUser" class="btn btn-success">Add User</button>
                  <button type="button" id="adminOpenRemoveUser" class="btn btn-danger">Remove User</button>
                </div>
              </fieldset>
              <div style="display: flex; justify-content: space-between;">
                <button type="button" id="cancelAdminSettings" class="btn btn-secondary">Cancel</button>
                <button type="button" id="saveAdminSettings" class="btn btn-primary">Save Settings</button>
              </div>
            </form>
          </div>
        `;
        document.body.appendChild(adminModal);

        document.getElementById("closeAdminPanel").addEventListener("click", closeAdminPanel);
        adminModal.addEventListener("click", (e) => {
          if (e.target === adminModal) closeAdminPanel();
        });
        document.getElementById("cancelAdminSettings").addEventListener("click", closeAdminPanel);
        document.getElementById("adminOpenAddUser").addEventListener("click", () => {
          toggleVisibility("addUserModal", true);
          document.getElementById("newUsername").focus();
        });
        document.getElementById("adminOpenRemoveUser").addEventListener("click", () => {
          loadUserList();
          toggleVisibility("removeUserModal", true);
        });
        document.getElementById("saveAdminSettings").addEventListener("click", () => {
          const disableFormLoginCheckbox = document.getElementById("disableFormLogin");
          const disableBasicAuthCheckbox = document.getElementById("disableBasicAuth");
          const disableOIDCLoginCheckbox = document.getElementById("disableOIDCLogin");
          const totalDisabled = [disableFormLoginCheckbox, disableBasicAuthCheckbox, disableOIDCLoginCheckbox].filter(cb => cb.checked).length;
          if (totalDisabled === 3) {
            showToast("At least one login method must remain enabled.");
            disableOIDCLoginCheckbox.checked = false;
            localStorage.setItem("disableOIDCLogin", "false");
            updateLoginOptionsUI({
              disableFormLogin: disableFormLoginCheckbox.checked,
              disableBasicAuth: disableBasicAuthCheckbox.checked,
              disableOIDCLogin: disableOIDCLoginCheckbox.checked
            });
            return;
          }
          const newOIDCConfig = {
            providerUrl: document.getElementById("oidcProviderUrl").value.trim(),
            clientId: document.getElementById("oidcClientId").value.trim(),
            clientSecret: document.getElementById("oidcClientSecret").value.trim(),
            redirectUri: document.getElementById("oidcRedirectUri").value.trim()
          };
          const disableFormLogin = disableFormLoginCheckbox.checked;
          const disableBasicAuth = disableBasicAuthCheckbox.checked;
          const disableOIDCLogin = disableOIDCLoginCheckbox.checked;
          const globalOtpauthUrl = document.getElementById("globalOtpauthUrl").value.trim();
          sendRequest("updateConfig.php", "POST", {
            oidc: newOIDCConfig,
            disableFormLogin,
            disableBasicAuth,
            disableOIDCLogin,
            globalOtpauthUrl
          }, { "X-CSRF-Token": window.csrfToken })
            .then(response => {
              if (response.success) {
                showToast("Settings updated successfully.");
                localStorage.setItem("disableFormLogin", disableFormLogin);
                localStorage.setItem("disableBasicAuth", disableBasicAuth);
                localStorage.setItem("disableOIDCLogin", disableOIDCLogin);
                updateLoginOptionsUI({ disableFormLogin, disableBasicAuth, disableOIDCLogin });
                closeAdminPanel();
              } else {
                showToast("Error updating settings: " + (response.error || "Unknown error"));
              }
            })
            .catch(() => { });
        });
        // Enforce that at least one login method remains enabled.
        const disableFormLoginCheckbox = document.getElementById("disableFormLogin");
        const disableBasicAuthCheckbox = document.getElementById("disableBasicAuth");
        const disableOIDCLoginCheckbox = document.getElementById("disableOIDCLogin");
        function enforceLoginOptionConstraint(changedCheckbox) {
          const totalDisabled = [disableFormLoginCheckbox, disableBasicAuthCheckbox, disableOIDCLoginCheckbox].filter(cb => cb.checked).length;
          if (changedCheckbox.checked && totalDisabled === 3) {
            showToast("At least one login method must remain enabled.");
            changedCheckbox.checked = false;
          }
        }
        disableFormLoginCheckbox.addEventListener("change", function () { enforceLoginOptionConstraint(this); });
        disableBasicAuthCheckbox.addEventListener("change", function () { enforceLoginOptionConstraint(this); });
        disableOIDCLoginCheckbox.addEventListener("change", function () { enforceLoginOptionConstraint(this); });

        // UPDATE checkboxes using fetched configuration:
        document.getElementById("disableFormLogin").checked = config.loginOptions.disableFormLogin === true;
        document.getElementById("disableBasicAuth").checked = config.loginOptions.disableBasicAuth === true;
        document.getElementById("disableOIDCLogin").checked = config.loginOptions.disableOIDCLogin === true;
      } else {
        // If the modal already exists, update its styles and values.
        adminModal.style.backgroundColor = overlayBackground;
        const modalContent = adminModal.querySelector(".modal-content");
        if (modalContent) {
          modalContent.style.background = isDarkMode ? "#2c2c2c" : "#fff";
          modalContent.style.color = isDarkMode ? "#e0e0e0" : "#000";
          modalContent.style.border = isDarkMode ? "1px solid #444" : "1px solid #ccc";
        }
        document.getElementById("oidcProviderUrl").value = currentOIDCConfig.providerUrl;
        document.getElementById("oidcClientId").value = currentOIDCConfig.clientId;
        document.getElementById("oidcClientSecret").value = currentOIDCConfig.clientSecret;
        document.getElementById("oidcRedirectUri").value = currentOIDCConfig.redirectUri;
        document.getElementById("globalOtpauthUrl").value = currentOIDCConfig.globalOtpauthUrl || 'otpauth://totp/FileRise?issuer=FileRise';

        // UPDATE checkboxes using fetched configuration:
        document.getElementById("disableFormLogin").checked = config.loginOptions.disableFormLogin === true;
        document.getElementById("disableBasicAuth").checked = config.loginOptions.disableBasicAuth === true;
        document.getElementById("disableOIDCLogin").checked = config.loginOptions.disableOIDCLogin === true;

        adminModal.style.display = "flex";
      }
    })
    .catch(() => {
      // In case of error, fallback to localStorage values
      let adminModal = document.getElementById("adminPanelModal");
      if (adminModal) {
        adminModal.style.backgroundColor = "rgba(0,0,0,0.5)";
        const modalContent = adminModal.querySelector(".modal-content");
        if (modalContent) {
          modalContent.style.background = "#fff";
          modalContent.style.color = "#000";
          modalContent.style.border = "1px solid #ccc";
        }
        document.getElementById("oidcProviderUrl").value = currentOIDCConfig.providerUrl;
        document.getElementById("oidcClientId").value = currentOIDCConfig.clientId;
        document.getElementById("oidcClientSecret").value = currentOIDCConfig.clientSecret;
        document.getElementById("oidcRedirectUri").value = currentOIDCConfig.redirectUri;
        document.getElementById("globalOtpauthUrl").value = currentOIDCConfig.globalOtpauthUrl || 'otpauth://totp/FileRise?issuer=FileRise';

        document.getElementById("disableFormLogin").checked = localStorage.getItem("disableFormLogin") === "true";
        document.getElementById("disableBasicAuth").checked = localStorage.getItem("disableBasicAuth") === "true";
        document.getElementById("disableOIDCLogin").checked = localStorage.getItem("disableOIDCLogin") === "true";
        adminModal.style.display = "flex";
      } else {
        openAdminPanel();
      }
    });
}

function closeAdminPanel() {
  const adminModal = document.getElementById("adminPanelModal");
  if (adminModal) adminModal.style.display = "none";
}

/* ----------------- Other Helpers ----------------- */
window.changeItemsPerPage = function (value) {
  localStorage.setItem("itemsPerPage", value);
  if (typeof renderFileTable === "function") renderFileTable(window.currentFolder || "root");
};

function resetUserForm() {
  document.getElementById("newUsername").value = "";
  document.getElementById("addUserPassword").value = "";
}

function closeAddUserModal() {
  toggleVisibility("addUserModal", false);
  resetUserForm();
}

function closeRemoveUserModal() {
  toggleVisibility("removeUserModal", false);
  document.getElementById("removeUsernameSelect").innerHTML = "";
}

function loadUserList() {
  fetch("getUsers.php", { credentials: "include" })
    .then(response => response.json())
    .then(data => {
      const users = Array.isArray(data) ? data : (data.users || []);
      const selectElem = document.getElementById("removeUsernameSelect");
      selectElem.innerHTML = "";
      users.forEach(user => {
        const option = document.createElement("option");
        option.value = user.username;
        option.textContent = user.username;
        selectElem.appendChild(option);
      });
      if (selectElem.options.length === 0) {
        showToast("No other users found to remove.");
        closeRemoveUserModal();
      }
    })
    .catch(() => { });
}

/* ----------------- Initialization ----------------- */
function initAuth() {
  checkAuthentication(false);
  loadAdminConfigFunc();
  const authForm = document.getElementById("authForm");
  if (authForm) {
    authForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const rememberMe = document.getElementById("rememberMeCheckbox")
        ? document.getElementById("rememberMeCheckbox").checked
        : false;
      const formData = {
        username: document.getElementById("loginUsername").value.trim(),
        password: document.getElementById("loginPassword").value.trim(),
        remember_me: rememberMe
      };
      submitLogin(formData);
    });
  }
  document.getElementById("logoutBtn").addEventListener("click", function () {
    fetch("logout.php", {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRF-Token": window.csrfToken }
    }).then(() => window.location.reload(true)).catch(() => { });
  });
  const oidcLoginBtn = document.getElementById("oidcLoginBtn");
  if (oidcLoginBtn) {
    oidcLoginBtn.addEventListener("click", function () {
      window.location.href = "auth.php?oidc";
    });
  }
  document.getElementById("addUserBtn").addEventListener("click", function () {
    resetUserForm();
    toggleVisibility("addUserModal", true);
    document.getElementById("newUsername").focus();
  });
  document.getElementById("saveUserBtn").addEventListener("click", function () {
    const newUsername = document.getElementById("newUsername").value.trim();
    const newPassword = document.getElementById("addUserPassword").value.trim();
    const isAdmin = document.getElementById("isAdmin").checked;
    if (!newUsername || !newPassword) {
      showToast("Username and password are required!");
      return;
    }
    let url = "addUser.php";
    if (window.setupMode) url += "?setup=1";
    fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": window.csrfToken },
      body: JSON.stringify({ username: newUsername, password: newPassword, isAdmin })
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          showToast("User added successfully!");
          closeAddUserModal();
          checkAuthentication(false);
        } else {
          showToast("Error: " + (data.error || "Could not add user"));
        }
      })
      .catch(() => { });
  });
  document.getElementById("cancelUserBtn").addEventListener("click", closeAddUserModal);

  document.getElementById("removeUserBtn").addEventListener("click", function () {
    loadUserList();
    toggleVisibility("removeUserModal", true);
  });
  document.getElementById("deleteUserBtn").addEventListener("click", async function () {
    const selectElem = document.getElementById("removeUsernameSelect");
    const usernameToRemove = selectElem.value;
    if (!usernameToRemove) {
      showToast("Please select a user to remove.");
      return;
    }
    const confirmed = await showCustomConfirmModal("Are you sure you want to delete user " + usernameToRemove + "?");
    if (!confirmed) return;
    fetch("removeUser.php", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": window.csrfToken },
      body: JSON.stringify({ username: usernameToRemove })
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          showToast("User removed successfully!");
          closeRemoveUserModal();
          loadUserList();
        } else {
          showToast("Error: " + (data.error || "Could not remove user"));
        }
      })
      .catch(() => { });
  });
  document.getElementById("cancelRemoveUserBtn").addEventListener("click", closeRemoveUserModal);
  // Change password bindings.
  document.getElementById("changePasswordBtn").addEventListener("click", function () {
    document.getElementById("changePasswordModal").style.display = "block";
    document.getElementById("oldPassword").focus();
  });
  document.getElementById("closeChangePasswordModal").addEventListener("click", function () {
    document.getElementById("changePasswordModal").style.display = "none";
  });
  document.getElementById("saveNewPasswordBtn").addEventListener("click", function () {
    const oldPassword = document.getElementById("oldPassword").value.trim();
    const newPassword = document.getElementById("newPassword").value.trim();
    const confirmPassword = document.getElementById("confirmPassword").value.trim();
    if (!oldPassword || !newPassword || !confirmPassword) {
      showToast("Please fill in all fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("New passwords do not match.");
      return;
    }
    const data = { oldPassword, newPassword, confirmPassword };
    fetch("changePassword.php", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": window.csrfToken },
      body: JSON.stringify(data)
    })
      .then(response => response.json())
      .then(result => {
        if (result.success) {
          showToast(result.success);
          document.getElementById("oldPassword").value = "";
          document.getElementById("newPassword").value = "";
          document.getElementById("confirmPassword").value = "";
          document.getElementById("changePasswordModal").style.display = "none";
        } else {
          showToast("Error: " + (result.error || "Could not change password."));
        }
      })
      .catch(() => { showToast("Error changing password."); });
  });
}

document.addEventListener("DOMContentLoaded", function () {
  updateItemsPerPageSelect();
  updateLoginOptionsUI({
    disableFormLogin: localStorage.getItem("disableFormLogin") === "true",
    disableBasicAuth: localStorage.getItem("disableBasicAuth") === "true",
    disableOIDCLogin: localStorage.getItem("disableOIDCLogin") === "true"
  });
});

export { initAuth, checkAuthentication };