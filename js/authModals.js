import { showToast, toggleVisibility, attachEnterKeyListener } from './domUtils.js';
import { sendRequest } from './networkUtils.js';

const version = "v1.0.9";
const adminTitle = `Admin Panel <small style="font-size: 12px; color: gray;">${version}</small>`;

let lastLoginData = null;
export function setLastLoginData(data) {
  lastLoginData = data;
  // expose to auth.js so it can tell form-login vs basic/oidc
  //window.__lastLoginData = data;
}

export function openTOTPLoginModal() {
  let totpLoginModal = document.getElementById("totpLoginModal");
  const isDarkMode = document.body.classList.contains("dark-mode");
  const modalBg = isDarkMode ? "#2c2c2c" : "#fff";
  const textColor = isDarkMode ? "#e0e0e0" : "#000";

  if (!totpLoginModal) {
    totpLoginModal = document.createElement("div");
    totpLoginModal.id = "totpLoginModal";
    totpLoginModal.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 100vw; height: 100vh;
      background-color: rgba(0,0,0,0.5);
      display: flex; justify-content: center; align-items: center;
      z-index: 3200;
    `;
    totpLoginModal.innerHTML = `
      <div style="background: ${modalBg}; padding:20px; border-radius:8px; text-align:center; position:relative; color:${textColor};">
        <span id="closeTOTPLoginModal" style="position:absolute; top:10px; right:10px; cursor:pointer; font-size:24px;">&times;</span>
        <div id="totpSection">
          <h3>Enter TOTP Code</h3>
          <input type="text" id="totpLoginInput" maxlength="6"
                 style="font-size:24px; text-align:center; width:100%; padding:10px;"
                 placeholder="6-digit code" />
        </div>
        <a href="#" id="toggleRecovery" style="display:block; margin-top:10px; font-size:14px;">Use Recovery Code instead</a>
        <div id="recoverySection" style="display:none; margin-top:10px;">
          <h3>Enter Recovery Code</h3>
          <input type="text" id="recoveryInput"
                 style="font-size:24px; text-align:center; width:100%; padding:10px;"
                 placeholder="Recovery code" />
          <button type="button" id="submitRecovery" class="btn btn-secondary" style="margin-top:10px;">Submit Recovery Code</button>
        </div>
      </div>
    `;
    document.body.appendChild(totpLoginModal);

    // Close button
    document.getElementById("closeTOTPLoginModal").addEventListener("click", () => {
      totpLoginModal.style.display = "none";
    });

    // Toggle between TOTP and Recovery
    document.getElementById("toggleRecovery").addEventListener("click", function (e) {
      e.preventDefault();
      const totpSection = document.getElementById("totpSection");
      const recoverySection = document.getElementById("recoverySection");
      const toggleLink = this;

      if (recoverySection.style.display === "none") {
        // Switch to recovery
        totpSection.style.display = "none";
        recoverySection.style.display = "block";
        toggleLink.textContent = "Use TOTP Code instead";
      } else {
        // Switch back to TOTP
        recoverySection.style.display = "none";
        totpSection.style.display = "block";
        toggleLink.textContent = "Use Recovery Code instead";
      }
    });

    // Recovery submission
    document.getElementById("submitRecovery").addEventListener("click", () => {
      const recoveryCode = document.getElementById("recoveryInput").value.trim();
      if (!recoveryCode) {
        showToast("Please enter your recovery code.");
        return;
      }
      fetch("totp_recover.php", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": window.csrfToken
        },
        body: JSON.stringify({ recovery_code: recoveryCode })
      })
        .then(res => res.json())
        .then(json => {
          if (json.status === "ok") {
            // recovery succeeded → finalize login
            window.location.href = "index.html";
          } else {
            showToast(json.message || "Recovery code verification failed");
          }
        })
        .catch(() => {
          showToast("Error verifying recovery code.");
        });
    });

    // TOTP submission
    const totpInput = document.getElementById("totpLoginInput");
    totpInput.focus();
    totpInput.addEventListener("input", function () {
      const code = this.value.trim();
      if (code.length === 6) {
        fetch("totp_verify.php", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": window.csrfToken
          },
          body: JSON.stringify({ totp_code: code })
        })
          .then(res => res.json())
          .then(json => {
            if (json.status === "ok") {
              window.location.href = "index.html";
            } else {
              showToast(json.message || "TOTP verification failed");
              this.value = "";
              totpLoginModal.style.display = "flex";
              totpInput.focus();
            }
          })
          .catch(() => {
            showToast("TOTP verification failed");
            this.value = "";
            totpLoginModal.style.display = "flex";
            totpInput.focus();
          });
      }
    });
  } else {
    // Re-open existing modal
    totpLoginModal.style.display = "flex";
    const totpInput = document.getElementById("totpLoginInput");
    totpInput.value = "";
    totpInput.style.display = "block";
    totpInput.focus();
    document.getElementById("recoverySection").style.display = "none";
  }
}

export function openUserPanel() {
  const username = localStorage.getItem("username") || "User";
  let userPanelModal = document.getElementById("userPanelModal");
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
          <h3>User Panel (${username})</h3>
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
    document.getElementById("openChangePasswordModalBtn").addEventListener("click", () => {
      document.getElementById("changePasswordModal").style.display = "block";
    });
    const totpCheckbox = document.getElementById("userTOTPEnabled");
    totpCheckbox.checked = localStorage.getItem("userTOTPEnabled") === "true";
    totpCheckbox.addEventListener("change", function () {
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
            openTOTPModal();
          }
        })
        .catch(() => { showToast("Error updating TOTP setting."); });
    });
  } else {
    userPanelModal.style.backgroundColor = overlayBackground;
    const modalContent = userPanelModal.querySelector(".modal-content");
    modalContent.style.background = isDarkMode ? "#2c2c2c" : "#fff";
    modalContent.style.color = isDarkMode ? "#e0e0e0" : "#000";
    modalContent.style.border = isDarkMode ? "1px solid #444" : "1px solid #ccc";
  }
  userPanelModal.style.display = "flex";
}

function showRecoveryCodeModal(recoveryCode) {
  const recoveryModal = document.createElement("div");
  recoveryModal.id = "recoveryModal";
  recoveryModal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: rgba(0,0,0,0.3);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 3200;
  `;
  recoveryModal.innerHTML = `
    <div style="background: #fff; color: #000; padding: 20px; max-width: 400px; width: 90%; border-radius: 8px; text-align: center;">
      <h3>Your Recovery Code</h3>
      <p>Please save this code securely. It will not be shown again and can only be used once.</p>
      <code style="display: block; margin: 10px 0; font-size: 20px;">${recoveryCode}</code>
      <button type="button" id="closeRecoveryModal" class="btn btn-primary">OK</button>
    </div>
  `;
  document.body.appendChild(recoveryModal);

  document.getElementById("closeRecoveryModal").addEventListener("click", () => {
    recoveryModal.remove();
  });
}

export function openTOTPModal() {
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
        <p>Enter the 6-digit code from your app to confirm setup:</p>
        <input type="text" id="totpConfirmInput" maxlength="6" style="font-size:24px; text-align:center; width:100%; padding:10px;" placeholder="6-digit code" />
        <br/><br/>
        <button type="button" id="confirmTOTPBtn" class="btn btn-primary">Confirm</button>
      </div>
    `;
    document.body.appendChild(totpModal);

    document.getElementById("closeTOTPModal").addEventListener("click", () => {
      closeTOTPModal(true);
    });

    document.getElementById("confirmTOTPBtn").addEventListener("click", function () {
      const code = document.getElementById("totpConfirmInput").value.trim();
      if (code.length !== 6) {
        showToast("Please enter a valid 6-digit code.");
        return;
      }
      fetch("totp_verify.php", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": window.csrfToken
        },
        body: JSON.stringify({ totp_code: code })
      })
        .then(r => r.json())
        .then(result => {
          if (result.status === 'ok') {
            showToast("TOTP successfully enabled.");
            // After successful TOTP verification, fetch the recovery code
            fetch("totp_saveCode.php", {
              method: "POST",
              credentials: "include",
              headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": window.csrfToken
              }
            })
              .then(r => r.json())
              .then(data => {
                if (data.status === 'ok' && data.recoveryCode) {
                  // Show the recovery code in a secure modal
                  showRecoveryCodeModal(data.recoveryCode);
                } else {
                  showToast("Error generating recovery code: " + (data.message || "Unknown error."));
                }
              })
              .catch(() => { showToast("Error generating recovery code."); });
            closeTOTPModal(false);
          } else {
            showToast("TOTP verification failed: " + (result.message || "Invalid code."));
          }
        })
        .catch(() => { showToast("Error verifying TOTP code."); });
    });

    // Focus the input and attach enter key listener
    const totpConfirmInput = document.getElementById("totpConfirmInput");
    if (totpConfirmInput) {
      setTimeout(() => {
        const totpConfirmInput = document.getElementById("totpConfirmInput");
        if (totpConfirmInput) totpConfirmInput.focus();
      }, 100);
    }
    attachEnterKeyListener("totpModal", "confirmTOTPBtn");

  } else {
    totpModal.style.display = "flex";
    totpModal.style.backgroundColor = overlayBackground;
    const modalContent = totpModal.querySelector(".modal-content");
    modalContent.style.background = isDarkMode ? "#2c2c2c" : "#fff";
    modalContent.style.color = isDarkMode ? "#e0e0e0" : "#000";

    // Focus the input and attach enter key listener
    const totpConfirmInput = document.getElementById("totpConfirmInput");
    if (totpConfirmInput) {
      totpConfirmInput.value = "";
      setTimeout(() => {
        const totpConfirmInput = document.getElementById("totpConfirmInput");
        if (totpConfirmInput) totpConfirmInput.focus();
      }, 100);
    }
    attachEnterKeyListener("totpModal", "confirmTOTPBtn");
  }
}

// Updated closeTOTPModal function with a disable parameter
export function closeTOTPModal(disable = true) {
  const totpModal = document.getElementById("totpModal");
  if (totpModal) totpModal.style.display = "none";

  if (disable) {
    // Uncheck the Enable TOTP checkbox
    const totpCheckbox = document.getElementById("userTOTPEnabled");
    if (totpCheckbox) {
      totpCheckbox.checked = false;
      localStorage.setItem("userTOTPEnabled", "false");
    }
    // Call endpoint to remove the TOTP secret from the user's record
    fetch("totp_disable.php", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": window.csrfToken
      }
    })
      .then(r => r.json())
      .then(result => {
        if (!result.success) {
          showToast("Error disabling TOTP setting: " + result.error);
        }
      })
      .catch(() => { showToast("Error disabling TOTP setting."); });
  }
}

export function openAdminPanel() {
  fetch("getConfig.php", { credentials: "include" })
    .then(response => response.json())
    .then(config => {
      if (config.oidc) Object.assign(window.currentOIDCConfig, config.oidc);
      if (config.globalOtpauthUrl) window.currentOIDCConfig.globalOtpauthUrl = config.globalOtpauthUrl;
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
        // Added a version number next to "Admin Panel"
        adminModal.innerHTML = `
          <div class="modal-content" style="${modalContentStyles}">
            <span id="closeAdminPanel" style="position: absolute; top: 10px; right: 10px; cursor: pointer; font-size: 24px;">&times;</span>
            <h3>
              <h3>${adminTitle}</h3>
            </h3>
            <form id="adminPanelForm">
              <fieldset style="margin-bottom: 15px;">
                <legend>User Management</legend>
                <div style="display: flex; gap: 10px;">
                  <button type="button" id="adminOpenAddUser" class="btn btn-success">Add User</button>
                  <button type="button" id="adminOpenRemoveUser" class="btn btn-danger">Remove User</button>
                  <button type="button" id="adminOpenUserPermissions" class="btn btn-secondary">User Permissions</button>
                </div>
              </fieldset>
              <fieldset style="margin-bottom: 15px;">
                <legend>OIDC Configuration</legend>
                <div class="form-group">
                  <label for="oidcProviderUrl">OIDC Provider URL:</label>
                  <input type="text" id="oidcProviderUrl" class="form-control" value="${window.currentOIDCConfig.providerUrl}" />
                </div>
                <div class="form-group">
                  <label for="oidcClientId">OIDC Client ID:</label>
                  <input type="text" id="oidcClientId" class="form-control" value="${window.currentOIDCConfig.clientId}" />
                </div>
                <div class="form-group">
                  <label for="oidcClientSecret">OIDC Client Secret:</label>
                  <input type="text" id="oidcClientSecret" class="form-control" value="${window.currentOIDCConfig.clientSecret}" />
                </div>
                <div class="form-group">
                  <label for="oidcRedirectUri">OIDC Redirect URI:</label>
                  <input type="text" id="oidcRedirectUri" class="form-control" value="${window.currentOIDCConfig.redirectUri}" />
                </div>
              </fieldset>
              <fieldset style="margin-bottom: 15px;">
                <legend>Global TOTP Settings</legend>
                <div class="form-group">
                  <label for="globalOtpauthUrl">Global OTPAuth URL:</label>
                  <input type="text" id="globalOtpauthUrl" class="form-control" value="${window.currentOIDCConfig.globalOtpauthUrl || 'otpauth://totp/{label}?secret={secret}&issuer=FileRise'}" />
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
          if (typeof window.loadUserList === "function") {
            window.loadUserList();
          }
          toggleVisibility("removeUserModal", true);
        });
        // New event binding for the User Permissions button:
        document.getElementById("adminOpenUserPermissions").addEventListener("click", () => {
          openUserPermissionsModal();
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
            if (typeof window.updateLoginOptionsUI === "function") {
              window.updateLoginOptionsUI({
                disableFormLogin: disableFormLoginCheckbox.checked,
                disableBasicAuth: disableBasicAuthCheckbox.checked,
                disableOIDCLogin: disableOIDCLoginCheckbox.checked
              });
            }
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
                if (typeof window.updateLoginOptionsUI === "function") {
                  window.updateLoginOptionsUI({ disableFormLogin, disableBasicAuth, disableOIDCLogin });
                }
                closeAdminPanel();
              } else {
                showToast("Error updating settings: " + (response.error || "Unknown error"));
              }
            })
            .catch(() => { });
        });
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

        document.getElementById("disableFormLogin").checked = config.loginOptions.disableFormLogin === true;
        document.getElementById("disableBasicAuth").checked = config.loginOptions.disableBasicAuth === true;
        document.getElementById("disableOIDCLogin").checked = config.loginOptions.disableOIDCLogin === true;
      } else {
        adminModal.style.backgroundColor = overlayBackground;
        const modalContent = adminModal.querySelector(".modal-content");
        if (modalContent) {
          modalContent.style.background = isDarkMode ? "#2c2c2c" : "#fff";
          modalContent.style.color = isDarkMode ? "#e0e0e0" : "#000";
          modalContent.style.border = isDarkMode ? "1px solid #444" : "1px solid #ccc";
        }
        document.getElementById("oidcProviderUrl").value = window.currentOIDCConfig.providerUrl;
        document.getElementById("oidcClientId").value = window.currentOIDCConfig.clientId;
        document.getElementById("oidcClientSecret").value = window.currentOIDCConfig.clientSecret;
        document.getElementById("oidcRedirectUri").value = window.currentOIDCConfig.redirectUri;
        document.getElementById("globalOtpauthUrl").value = window.currentOIDCConfig.globalOtpauthUrl || 'otpauth://totp/{label}?secret={secret}&issuer=FileRise';
        document.getElementById("disableFormLogin").checked = config.loginOptions.disableFormLogin === true;
        document.getElementById("disableBasicAuth").checked = config.loginOptions.disableBasicAuth === true;
        document.getElementById("disableOIDCLogin").checked = config.loginOptions.disableOIDCLogin === true;
        adminModal.style.display = "flex";
      }
    })
    .catch(() => {
      let adminModal = document.getElementById("adminPanelModal");
      if (adminModal) {
        adminModal.style.backgroundColor = "rgba(0,0,0,0.5)";
        const modalContent = adminModal.querySelector(".modal-content");
        if (modalContent) {
          modalContent.style.background = "#fff";
          modalContent.style.color = "#000";
          modalContent.style.border = "1px solid #ccc";
        }
        document.getElementById("oidcProviderUrl").value = window.currentOIDCConfig.providerUrl;
        document.getElementById("oidcClientId").value = window.currentOIDCConfig.clientId;
        document.getElementById("oidcClientSecret").value = window.currentOIDCConfig.clientSecret;
        document.getElementById("oidcRedirectUri").value = window.currentOIDCConfig.redirectUri;
        document.getElementById("globalOtpauthUrl").value = window.currentOIDCConfig.globalOtpauthUrl || 'otpauth://totp/{label}?secret={secret}&issuer=FileRise';
        document.getElementById("disableFormLogin").checked = localStorage.getItem("disableFormLogin") === "true";
        document.getElementById("disableBasicAuth").checked = localStorage.getItem("disableBasicAuth") === "true";
        document.getElementById("disableOIDCLogin").checked = localStorage.getItem("disableOIDCLogin") === "true";
        adminModal.style.display = "flex";
      } else {
        openAdminPanel();
      }
    });
}

export function closeAdminPanel() {
  const adminModal = document.getElementById("adminPanelModal");
  if (adminModal) adminModal.style.display = "none";
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
          <span id="closeUserPermissionsModal" style="position: absolute; top: 10px; right: 10px; cursor: pointer; font-size: 24px;">&times;</span>
          <h3>User Permissions</h3>
          <div id="userPermissionsList" style="max-height: 300px; overflow-y: auto; margin-bottom: 15px;">
            <!-- User rows will be loaded here -->
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button type="button" id="cancelUserPermissionsBtn" class="btn btn-secondary">Cancel</button>
            <button type="button" id="saveUserPermissionsBtn" class="btn btn-primary">Save Permissions</button>
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
        const username = row.getAttribute("data-username");
        const folderOnlyCheckbox = row.querySelector("input[data-permission='folderOnly']");
        const readOnlyCheckbox = row.querySelector("input[data-permission='readOnly']");
        const disableUploadCheckbox = row.querySelector("input[data-permission='disableUpload']");
        permissionsData.push({
          username,
          folderOnly: folderOnlyCheckbox.checked,
          readOnly: readOnlyCheckbox.checked,
          disableUpload: disableUploadCheckbox.checked
        });
      });
      // Send the permissionsData to the server.
      sendRequest("updateUserPermissions.php", "POST", { permissions: permissionsData }, { "X-CSRF-Token": window.csrfToken })
        .then(response => {
          if (response.success) {
            showToast("User permissions updated successfully.");
            userPermissionsModal.style.display = "none";
          } else {
            showToast("Error updating permissions: " + (response.error || "Unknown error"));
          }
        })
        .catch(() => {
          showToast("Error updating permissions.");
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
  fetch("getUserPermissions.php", { credentials: "include" })
    .then(response => response.json())
    .then(permissionsData => {
      // Then, fetch the list of users.
      return fetch("getUsers.php", { credentials: "include" })
        .then(response => response.json())
        .then(usersData => {
          const users = Array.isArray(usersData) ? usersData : (usersData.users || []);
          if (users.length === 0) {
            listContainer.innerHTML = "<p>No users found.</p>";
            return;
          }
          users.forEach(user => {
            // Skip admin users.
            if ((user.role && user.role === "1") || user.username.toLowerCase() === "admin") return;

            // Use stored permissions if available; otherwise fall back to localStorage defaults.
            const defaultPerm = {
              folderOnly: localStorage.getItem("folderOnly") === "true",
              readOnly: localStorage.getItem("readOnly") === "true",
              disableUpload: localStorage.getItem("disableUpload") === "true"
            };
            const userPerm = (permissionsData && typeof permissionsData === "object" && permissionsData[user.username]) || defaultPerm;

            // Create a row for the user.
            const row = document.createElement("div");
            row.classList.add("user-permission-row");
            row.setAttribute("data-username", user.username);
            row.style.padding = "10px 0";
            row.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 5px;">${user.username}</div>
                <div style="display: flex; flex-direction: column; gap: 5px;">
                  <label style="display: flex; align-items: center; gap: 5px;">
                    <input type="checkbox" data-permission="folderOnly" ${userPerm.folderOnly ? "checked" : ""} />
                    User Folder Only
                  </label>
                  <label style="display: flex; align-items: center; gap: 5px;">
                    <input type="checkbox" data-permission="readOnly" ${userPerm.readOnly ? "checked" : ""} />
                    Read Only
                  </label>
                  <label style="display: flex; align-items: center; gap: 5px;">
                    <input type="checkbox" data-permission="disableUpload" ${userPerm.disableUpload ? "checked" : ""} />
                    Disable Upload
                  </label>
                </div>
                <hr style="margin-top: 10px; border: 0; border-bottom: 1px solid #ccc;">
              `;
            listContainer.appendChild(row);
          });
        });
    })
    .catch(() => {
      listContainer.innerHTML = "<p>Error loading users.</p>";
    });
}