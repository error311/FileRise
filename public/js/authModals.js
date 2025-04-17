import { showToast, toggleVisibility, attachEnterKeyListener } from './domUtils.js';
import { sendRequest } from './networkUtils.js';
import { t, applyTranslations, setLocale } from './i18n.js';
import { loadAdminConfigFunc } from './auth.js';

const version = "v1.2.0";
// Use t() for the admin panel title. (Make sure t("admin_panel") returns "Admin Panel" in English.)
const adminTitle = `${t("admin_panel")} <small style="font-size: 12px; color: gray;">${version}</small>`;

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
          <h3>${t("enter_totp_code")}</h3>
          <input type="text" id="totpLoginInput" maxlength="6"
                 style="font-size:24px; text-align:center; width:100%; padding:10px;"
                 placeholder="6-digit code" />
        </div>
        <a href="#" id="toggleRecovery" style="display:block; margin-top:10px; font-size:14px;">${t("use_recovery_code_instead")}</a>
        <div id="recoverySection" style="display:none; margin-top:10px;">
          <h3>${t("enter_recovery_code")}</h3>
          <input type="text" id="recoveryInput"
                 style="font-size:24px; text-align:center; width:100%; padding:10px;"
                 placeholder="Recovery code" />
          <button type="button" id="submitRecovery" class="btn btn-secondary" style="margin-top:10px;">${t("submit_recovery_code")}</button>
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
        toggleLink.textContent = t("use_totp_code_instead");
      } else {
        // Switch back to TOTP
        recoverySection.style.display = "none";
        totpSection.style.display = "block";
        toggleLink.textContent = t("use_recovery_code_instead");
      }
    });

    // Recovery submission
    document.getElementById("submitRecovery").addEventListener("click", () => {
      const recoveryCode = document.getElementById("recoveryInput").value.trim();
      if (!recoveryCode) {
        showToast(t("please_enter_recovery_code"));
        return;
      }
      fetch("api/totp_recover.php", {
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
            window.location.href = "/index.html";
          } else {
            showToast(json.message || t("recovery_code_verification_failed"));
          }
        })
        .catch(() => {
          showToast(t("error_verifying_recovery_code"));
        });
    });

    // TOTP submission
    const totpInput = document.getElementById("totpLoginInput");
    totpInput.focus();
    totpInput.addEventListener("input", function () {
      const code = this.value.trim();
      if (code.length === 6) {
        fetch("api/totp_verify.php", {
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
              window.location.href = "/index.html";
            } else {
              showToast(json.message || t("totp_verification_failed"));
              this.value = "";
              totpLoginModal.style.display = "flex";
              totpInput.focus();
            }
          })
          .catch(() => {
            showToast(t("totp_verification_failed"));
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
    position: fixed;
    overflow-y: auto;
    max-height: 350px !important;
    border: ${isDarkMode ? "1px solid #444" : "1px solid #ccc"};
    transform: none;
    transition: none;
  `;
  // Retrieve the language setting from local storage, default to English ("en")
  const savedLanguage = localStorage.getItem("language") || "en";
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
        <div class="modal-content user-panel-content" style="${modalContentStyles}">
          <span id="closeUserPanel" style="position: absolute; top: 10px; right: 10px; cursor: pointer; font-size: 24px;">&times;</span>
          <h3>${t("user_panel")} (${username})</h3>
          <button type="button" id="openChangePasswordModalBtn" class="btn btn-primary" style="margin-bottom: 15px;">${t("change_password")}</button>
          <fieldset style="margin-bottom: 15px;">
            <legend>${t("totp_settings")}</legend>
            <div class="form-group">
              <label for="userTOTPEnabled">${t("enable_totp")}:</label>
              <input type="checkbox" id="userTOTPEnabled" style="vertical-align: middle;" />
            </div>
          </fieldset>
          <fieldset style="margin-bottom: 15px;">
            <legend>${t("language")}</legend>
            <div class="form-group">
              <label for="languageSelector">${t("select_language")}:</label>
              <select id="languageSelector">
                <option value="en">${t("english")}</option>
                <option value="es">${t("spanish")}</option>
                <option value="fr">${t("french")}</option>
                <option value="de">${t("german")}</option>
              </select>
            </div>
          </fieldset>
        </div>
      `;
    document.body.appendChild(userPanelModal);
    // Close button handler
    document.getElementById("closeUserPanel").addEventListener("click", () => {
      userPanelModal.style.display = "none";
    });
    // Change Password button
    document.getElementById("openChangePasswordModalBtn").addEventListener("click", () => {
      document.getElementById("changePasswordModal").style.display = "block";
    });
    // TOTP checkbox behavior
    const totpCheckbox = document.getElementById("userTOTPEnabled");
    totpCheckbox.checked = localStorage.getItem("userTOTPEnabled") === "true";
    totpCheckbox.addEventListener("change", function () {
      localStorage.setItem("userTOTPEnabled", this.checked ? "true" : "false");
      const enabled = this.checked;
      fetch("api/updateUserPanel.php", {
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
            showToast(t("error_updating_totp_setting") + ": " + result.error);
          } else if (enabled) {
            openTOTPModal();
          }
        })
        .catch(() => { showToast(t("error_updating_totp_setting")); });
    });
    // Language dropdown initialization
    const languageSelector = document.getElementById("languageSelector");
    languageSelector.value = savedLanguage;
    languageSelector.addEventListener("change", function () {
      const selectedLanguage = this.value;
      localStorage.setItem("language", selectedLanguage);
      setLocale(selectedLanguage);
      applyTranslations();
    });
  } else {
    // If the modal already exists, update its colors
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
      <h3>${t("your_recovery_code")}</h3>
      <p>${t("please_save_recovery_code")}</p>
      <code style="display: block; margin: 10px 0; font-size: 20px;">${recoveryCode}</code>
      <button type="button" id="closeRecoveryModal" class="btn btn-primary">${t("ok")}</button>
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
      <h3>${t("totp_setup")}</h3>
      <p>${t("scan_qr_code")}</p>
      <!-- Create an image placeholder without the CSRF token in the src -->
      <img id="totpQRCodeImage" src="" alt="TOTP QR Code" style="max-width: 100%; height: auto; display: block; margin: 0 auto;">
      <br/>
      <p>${t("enter_totp_confirmation")}</p>
      <input type="text" id="totpConfirmInput" maxlength="6" style="font-size:24px; text-align:center; width:100%; padding:10px;" placeholder="6-digit code" />
      <br/><br/>
      <button type="button" id="confirmTOTPBtn" class="btn btn-primary">${t("confirm")}</button>
    </div>
  `;
    document.body.appendChild(totpModal);
    loadTOTPQRCode();

    document.getElementById("closeTOTPModal").addEventListener("click", () => {
      closeTOTPModal(true);
    });

    document.getElementById("confirmTOTPBtn").addEventListener("click", function () {
      const code = document.getElementById("totpConfirmInput").value.trim();
      if (code.length !== 6) {
        showToast(t("please_enter_valid_code"));
        return;
      }
      fetch("api/totp_verify.php", {
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
            showToast(t("totp_enabled_successfully"));
            // After successful TOTP verification, fetch the recovery code
            fetch("api/totp_saveCode.php", {
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
                  showToast(t("error_generating_recovery_code") + ": " + (data.message || t("unknown_error")));
                }
              })
              .catch(() => { showToast(t("error_generating_recovery_code")); });
            closeTOTPModal(false);
          } else {
            showToast(t("totp_verification_failed") + ": " + (result.message || t("invalid_code")));
          }
        })
        .catch(() => { showToast(t("error_verifying_totp_code")); });
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

    // Clear any previous QR code src if needed and then load it:
    const qrImg = document.getElementById("totpQRCodeImage");
    if (qrImg) {
      qrImg.src = "";
    }
    loadTOTPQRCode();

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

function loadTOTPQRCode() {
  fetch("api/totp_setup.php", {
    method: "GET",
    credentials: "include",
    headers: {
      "X-CSRF-Token": window.csrfToken  // Send your CSRF token here
    }
  })
    .then(response => {
      if (!response.ok) {
        throw new Error("Failed to fetch QR code. Status: " + response.status);
      }
      return response.blob();
    })
    .then(blob => {
      const imageURL = URL.createObjectURL(blob);
      const qrImg = document.getElementById("totpQRCodeImage");
      if (qrImg) {
        qrImg.src = imageURL;
      }
    })
    .catch(error => {
      console.error("Error loading TOTP QR code:", error);
      showToast(t("error_loading_qr_code"));
    });
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
    fetch("api/totp_disable.php", {
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
          showToast(t("error_disabling_totp_setting") + ": " + result.error);
        }
      })
      .catch(() => { showToast(t("error_disabling_totp_setting")); });
  }
}

// Global variable to hold the initial state of the admin form.
let originalAdminConfig = {};

// Capture the initial state of the admin form fields.
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
    globalOtpauthUrl: document.getElementById("globalOtpauthUrl").value.trim()
  };
}

// Compare current values to the captured initial state.
function hasUnsavedChanges() {
  return (
    document.getElementById("headerTitle").value.trim() !== originalAdminConfig.headerTitle ||
    document.getElementById("oidcProviderUrl").value.trim() !== originalAdminConfig.oidcProviderUrl ||
    document.getElementById("oidcClientId").value.trim() !== originalAdminConfig.oidcClientId ||
    document.getElementById("oidcClientSecret").value.trim() !== originalAdminConfig.oidcClientSecret ||
    document.getElementById("oidcRedirectUri").value.trim() !== originalAdminConfig.oidcRedirectUri ||
    document.getElementById("disableFormLogin").checked !== originalAdminConfig.disableFormLogin ||
    document.getElementById("disableBasicAuth").checked !== originalAdminConfig.disableBasicAuth ||
    document.getElementById("disableOIDCLogin").checked !== originalAdminConfig.disableOIDCLogin ||
    document.getElementById("globalOtpauthUrl").value.trim() !== originalAdminConfig.globalOtpauthUrl
  );
}

// Use your custom confirmation modal.
function showCustomConfirmModal(message) {
  return new Promise((resolve) => {
    // Get modal elements from DOM.
    const modal = document.getElementById("customConfirmModal");
    const messageElem = document.getElementById("confirmMessage");
    const yesBtn = document.getElementById("confirmYesBtn");
    const noBtn = document.getElementById("confirmNoBtn");

    // Set the message in the modal.
    messageElem.textContent = message;
    modal.style.display = "block";

    // Define event handlers.
    function onYes() {
      cleanup();
      resolve(true);
    }
    function onNo() {
      cleanup();
      resolve(false);
    }
    // Remove event listeners and hide modal after choice.
    function cleanup() {
      yesBtn.removeEventListener("click", onYes);
      noBtn.removeEventListener("click", onNo);
      modal.style.display = "none";
    }
    
    yesBtn.addEventListener("click", onYes);
    noBtn.addEventListener("click", onNo);
  });
}

export function openAdminPanel() {
  fetch("api/admin/getConfig.php", { credentials: "include" })
    .then(response => response.json())
    .then(config => {
      if (config.header_title) {
        document.querySelector(".header-title h1").textContent = config.header_title;
        window.headerTitle = config.header_title || "FileRise";
      }
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
        adminModal.innerHTML = `
          <div class="modal-content" style="${modalContentStyles}">
            <span id="closeAdminPanel" style="position: absolute; top: 10px; right: 10px; cursor: pointer; font-size: 24px;">&times;</span>
            <h3>${adminTitle}</h3>
            <form id="adminPanelForm">
              <fieldset style="margin-bottom: 15px;">
                <legend>${t("user_management")}</legend>
                <div style="display: flex; gap: 10px;">
                  <button type="button" id="adminOpenAddUser" class="btn btn-success">${t("add_user")}</button>
                  <button type="button" id="adminOpenRemoveUser" class="btn btn-danger">${t("remove_user")}</button>
                  <button type="button" id="adminOpenUserPermissions" class="btn btn-secondary">${t("user_permissions")}</button>
                </div>
              </fieldset>
              <fieldset style="margin-bottom: 15px;">
                <legend>Header Settings</legend>
                <div class="form-group">
                  <label for="headerTitle">Header Title:</label>
                  <input type="text" id="headerTitle" class="form-control" value="${window.headerTitle}" />
                </div>
              </fieldset>
              <fieldset style="margin-bottom: 15px;">
                <legend>${t("login_options")}</legend>
                <div class="form-group">
                  <input type="checkbox" id="disableFormLogin" />
                  <label for="disableFormLogin">${t("disable_login_form")}</label>
                </div>
                <div class="form-group">
                  <input type="checkbox" id="disableBasicAuth" />
                  <label for="disableBasicAuth">${t("disable_basic_http_auth")}</label>
                </div>
                <div class="form-group">
                  <input type="checkbox" id="disableOIDCLogin" />
                  <label for="disableOIDCLogin">${t("disable_oidc_login")}</label>
                </div>
              </fieldset>
              <fieldset style="margin-bottom: 15px;">
                <legend>${t("oidc_configuration")}</legend>
                <div class="form-group">
                  <label for="oidcProviderUrl">${t("oidc_provider_url")}:</label>
                  <input type="text" id="oidcProviderUrl" class="form-control" value="${window.currentOIDCConfig.providerUrl}" />
                </div>
                <div class="form-group">
                  <label for="oidcClientId">${t("oidc_client_id")}:</label>
                  <input type="text" id="oidcClientId" class="form-control" value="${window.currentOIDCConfig.clientId}" />
                </div>
                <div class="form-group">
                  <label for="oidcClientSecret">${t("oidc_client_secret")}:</label>
                  <input type="text" id="oidcClientSecret" class="form-control" value="${window.currentOIDCConfig.clientSecret}" />
                </div>
                <div class="form-group">
                  <label for="oidcRedirectUri">${t("oidc_redirect_uri")}:</label>
                  <input type="text" id="oidcRedirectUri" class="form-control" value="${window.currentOIDCConfig.redirectUri}" />
                </div>
              </fieldset>
              <fieldset style="margin-bottom: 15px;">
                <legend>${t("global_totp_settings")}</legend>
                <div class="form-group">
                  <label for="globalOtpauthUrl">${t("global_otpauth_url")}:</label>
                  <input type="text" id="globalOtpauthUrl" class="form-control" value="${window.currentOIDCConfig.globalOtpauthUrl || 'otpauth://totp/{label}?secret={secret}&issuer=FileRise'}" />
                </div>
              </fieldset>
              <div style="display: flex; justify-content: space-between;">
                <button type="button" id="cancelAdminSettings" class="btn btn-secondary">${t("cancel")}</button>
                <button type="button" id="saveAdminSettings" class="btn btn-primary">${t("save_settings")}</button>
              </div>
            </form>
          </div>
        `;
        document.body.appendChild(adminModal);

        // Bind closing events that will use our enhanced close function.
        document.getElementById("closeAdminPanel").addEventListener("click", closeAdminPanel);
        adminModal.addEventListener("click", (e) => {
          if (e.target === adminModal) closeAdminPanel();
        });
        document.getElementById("cancelAdminSettings").addEventListener("click", closeAdminPanel);

        // Bind other buttons.
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
        document.getElementById("adminOpenUserPermissions").addEventListener("click", () => {
          openUserPermissionsModal();
        });
        document.getElementById("saveAdminSettings").addEventListener("click", () => {
          
          const disableFormLoginCheckbox = document.getElementById("disableFormLogin");
          const disableBasicAuthCheckbox = document.getElementById("disableBasicAuth");
          const disableOIDCLoginCheckbox = document.getElementById("disableOIDCLogin");
          const totalDisabled = [disableFormLoginCheckbox, disableBasicAuthCheckbox, disableOIDCLoginCheckbox].filter(cb => cb.checked).length;
          if (totalDisabled === 3) {
            showToast(t("at_least_one_login_method"));
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
          const newHeaderTitle = document.getElementById("headerTitle").value.trim();
          
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
          sendRequest("api/admin/updateConfig.php", "POST", {
            header_title: newHeaderTitle,
            oidc: newOIDCConfig,
            disableFormLogin,
            disableBasicAuth,
            disableOIDCLogin,
            globalOtpauthUrl
          }, { "X-CSRF-Token": window.csrfToken })
            .then(response => {
              if (response.success) {
                showToast(t("settings_updated_successfully"));
                localStorage.setItem("disableFormLogin", disableFormLogin);
                localStorage.setItem("disableBasicAuth", disableBasicAuth);
                localStorage.setItem("disableOIDCLogin", disableOIDCLogin);
                if (typeof window.updateLoginOptionsUI === "function") {
                  window.updateLoginOptionsUI({ disableFormLogin, disableBasicAuth, disableOIDCLogin });
                }
                // Update the captured initial state since the changes have now been saved.
                captureInitialAdminConfig();
                closeAdminPanel();
                loadAdminConfigFunc();
              
              } else {
                showToast(t("error_updating_settings") + ": " + (response.error || t("unknown_error")));
              }
            })
            .catch(() => { });
        });
        // Enforce login option constraints.
        const disableFormLoginCheckbox = document.getElementById("disableFormLogin");
        const disableBasicAuthCheckbox = document.getElementById("disableBasicAuth");
        const disableOIDCLoginCheckbox = document.getElementById("disableOIDCLogin");
        function enforceLoginOptionConstraint(changedCheckbox) {
          const totalDisabled = [disableFormLoginCheckbox, disableBasicAuthCheckbox, disableOIDCLoginCheckbox].filter(cb => cb.checked).length;
          if (changedCheckbox.checked && totalDisabled === 3) {
            showToast(t("at_least_one_login_method"));
            changedCheckbox.checked = false;
          }
        }
        disableFormLoginCheckbox.addEventListener("change", function () { enforceLoginOptionConstraint(this); });
        disableBasicAuthCheckbox.addEventListener("change", function () { enforceLoginOptionConstraint(this); });
        disableOIDCLoginCheckbox.addEventListener("change", function () { enforceLoginOptionConstraint(this); });

        document.getElementById("disableFormLogin").checked = config.loginOptions.disableFormLogin === true;
        document.getElementById("disableBasicAuth").checked = config.loginOptions.disableBasicAuth === true;
        document.getElementById("disableOIDCLogin").checked = config.loginOptions.disableOIDCLogin === true;
        
        // Capture initial state after the modal loads.
        captureInitialAdminConfig();
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
        captureInitialAdminConfig();
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
        captureInitialAdminConfig();
      } else {
        openAdminPanel();
      }
    });
}

export async function closeAdminPanel() {
  if (hasUnsavedChanges()) {
    const userConfirmed = await showCustomConfirmModal(t("unsaved_changes_confirm"));
    if (!userConfirmed) {
      return;
    }
  }
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
      sendRequest("api/updateUserPermissions.php", "POST", { permissions: permissionsData }, { "X-CSRF-Token": window.csrfToken })
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
  fetch("api/getUserPermissions.php", { credentials: "include" })
    .then(response => response.json())
    .then(permissionsData => {
      // Then, fetch the list of users.
      return fetch("api/getUsers.php", { credentials: "include" })
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
            };

            // Normalize the username key to match server storage (e.g., lowercase)
            const usernameKey = user.username.toLowerCase();

            const userPerm = (permissionsData && typeof permissionsData === "object" && (usernameKey in permissionsData))
              ? permissionsData[usernameKey]
              : defaultPerm;

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
                    ${t("user_folder_only")}
                  </label>
                  <label style="display: flex; align-items: center; gap: 5px;">
                    <input type="checkbox" data-permission="readOnly" ${userPerm.readOnly ? "checked" : ""} />
                    ${t("read_only")}
                  </label>
                  <label style="display: flex; align-items: center; gap: 5px;">
                    <input type="checkbox" data-permission="disableUpload" ${userPerm.disableUpload ? "checked" : ""} />
                    ${t("disable_upload")}
                  </label>
                </div>
                <hr style="margin-top: 10px; border: 0; border-bottom: 1px solid #ccc;">
              `;
            listContainer.appendChild(row);
          });
        });
    })
    .catch(() => {
      listContainer.innerHTML = "<p>" + t("error_loading_users") + "</p>";
    });
}