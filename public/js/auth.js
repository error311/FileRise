import { sendRequest } from './networkUtils.js';
import { t, applyTranslations } from './i18n.js';
import {
  toggleVisibility,
  showToast as originalShowToast,
  attachEnterKeyListener,
  showCustomConfirmModal
} from './domUtils.js';
import { loadFileList } from './fileListView.js';
import { initFileActions } from './fileActions.js';
import { renderFileTable } from './fileListView.js';
import { loadFolderTree } from './folderManager.js';
import {
  openTOTPLoginModal as originalOpenTOTPLoginModal,
  openUserPanel,
  openTOTPModal,
  closeTOTPModal,
  openAdminPanel,
  closeAdminPanel,
  setLastLoginData
} from './authModals.js';

// Production OIDC configuration (override via API as needed)
const currentOIDCConfig = {
  providerUrl: "https://your-oidc-provider.com",
  clientId: "YOUR_CLIENT_ID",
  clientSecret: "YOUR_CLIENT_SECRET",
  redirectUri: "https://yourdomain.com/api/auth/auth.php?oidc=callback",
  globalOtpauthUrl: ""
};
window.currentOIDCConfig = currentOIDCConfig;

/* ----------------- TOTP & Toast Overrides ----------------- */
// detect if we’re in a pending‑TOTP state
window.pendingTOTP = new URLSearchParams(window.location.search).get('totp_required') === '1';

// override showToast to suppress the "Please log in to continue." toast during TOTP
function showToast(msgKey) {
  const msg = t(msgKey);
  if (window.pendingTOTP && msgKey === "please_log_in_to_continue") {
    return;
  }
  originalShowToast(msg);
}
window.showToast = showToast;

// wrap the TOTP modal opener to disable other login buttons only for Basic/OIDC flows
function openTOTPLoginModal() {
  originalOpenTOTPLoginModal();

  const isFormLogin = Boolean(window.__lastLoginData);
  if (!isFormLogin) {
    // disable Basic‑Auth link
    const basicLink = document.querySelector("a[href='/api/auth/login_basic.php']");
    if (basicLink) {
      basicLink.style.pointerEvents = 'none';
      basicLink.style.opacity = '0.5';
    }
    // disable OIDC button
    const oidcBtn = document.getElementById("oidcLoginBtn");
    if (oidcBtn) {
      oidcBtn.disabled = true;
      oidcBtn.style.opacity = '0.5';
    }
    // hide the form login
    const authForm = document.getElementById("authForm");
    if (authForm) authForm.style.display = 'none';
  }
}

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
  const basicAuthLink = document.querySelector("a[href='/api/auth/login_basic.php']");
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

export function loadAdminConfigFunc() {
  return fetch("api/admin/getConfig.php", { credentials: "include" })
    .then(response => response.json())
    .then(config => {
      localStorage.setItem("headerTitle", config.header_title || "FileRise");

      // Update login options using the nested loginOptions object.
      localStorage.setItem("disableFormLogin", config.loginOptions.disableFormLogin);
      localStorage.setItem("disableBasicAuth", config.loginOptions.disableBasicAuth);
      localStorage.setItem("disableOIDCLogin", config.loginOptions.disableOIDCLogin);
      localStorage.setItem("globalOtpauthUrl", config.globalOtpauthUrl || "otpauth://totp/{label}?secret={secret}&issuer=FileRise");
      
      updateLoginOptionsUIFromStorage();

      const headerTitleElem = document.querySelector(".header-title h1");
      if (headerTitleElem) {
        headerTitleElem.textContent = config.header_title || "FileRise";
      }
    })
    .catch(() => {
      // Use defaults.
      localStorage.setItem("headerTitle", "FileRise");
      localStorage.setItem("disableFormLogin", "false");
      localStorage.setItem("disableBasicAuth", "false");
      localStorage.setItem("disableOIDCLogin", "false");
      localStorage.setItem("globalOtpauthUrl", "otpauth://totp/{label}?secret={secret}&issuer=FileRise");
      updateLoginOptionsUIFromStorage();

      const headerTitleElem = document.querySelector(".header-title h1");
      if (headerTitleElem) {
        headerTitleElem.textContent = "FileRise";
      }
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

  if (typeof data.totp_enabled !== "undefined") {
    localStorage.setItem("userTOTPEnabled", data.totp_enabled ? "true" : "false");
  }
  if (data.username) {
    localStorage.setItem("username", data.username);
  }
  if (typeof data.folderOnly    !== "undefined") {
    localStorage.setItem("folderOnly",    data.folderOnly    ? "true" : "false");
    localStorage.setItem("readOnly",      data.readOnly      ? "true" : "false");
    localStorage.setItem("disableUpload", data.disableUpload ? "true" : "false");
  }

  const headerButtons = document.querySelector(".header-buttons");
  const firstButton = headerButtons.firstElementChild;

  if (data.isAdmin) {
    let restoreBtn = document.getElementById("restoreFilesBtn");
    if (!restoreBtn) {
      restoreBtn = document.createElement("button");
      restoreBtn.id = "restoreFilesBtn";
      restoreBtn.classList.add("btn", "btn-warning");
      restoreBtn.setAttribute("data-i18n-title", "trash_restore_delete");
      restoreBtn.innerHTML = '<i class="material-icons">restore_from_trash</i>';
      if (firstButton) insertAfter(restoreBtn, firstButton);
      else headerButtons.appendChild(restoreBtn);
    }
    restoreBtn.style.display = "block";

    let adminPanelBtn = document.getElementById("adminPanelBtn");
    if (!adminPanelBtn) {
      adminPanelBtn = document.createElement("button");
      adminPanelBtn.id = "adminPanelBtn";
      adminPanelBtn.classList.add("btn", "btn-info");
      adminPanelBtn.setAttribute("data-i18n-title", "admin_panel");
      adminPanelBtn.innerHTML = '<i class="material-icons">admin_panel_settings</i>';
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

  if (window.location.hostname !== "demo.filerise.net") {
    let userPanelBtn = document.getElementById("userPanelBtn");
    if (!userPanelBtn) {
      userPanelBtn = document.createElement("button");
      userPanelBtn.id = "userPanelBtn";
      userPanelBtn.classList.add("btn", "btn-user");
      userPanelBtn.setAttribute("data-i18n-title", "user_panel");
      userPanelBtn.innerHTML = '<i class="material-icons">account_circle</i>';
      
      const adminBtn = document.getElementById("adminPanelBtn");
      if (adminBtn) insertAfter(userPanelBtn, adminBtn);
      else if (firstButton) insertAfter(userPanelBtn, firstButton);
      else headerButtons.appendChild(userPanelBtn); 
      userPanelBtn.addEventListener("click", openUserPanel);
    } else {
      userPanelBtn.style.display = "block";
    }
  }
  applyTranslations();
  updateItemsPerPageSelect();
  updateLoginOptionsUIFromStorage();
}

function checkAuthentication(showLoginToast = true) {
  return sendRequest("api/auth/checkAuth.php")
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
        localStorage.setItem("folderOnly",   data.folderOnly   );
        localStorage.setItem("readOnly",     data.readOnly     );
        localStorage.setItem("disableUpload",data.disableUpload);
        updateLoginOptionsUIFromStorage();
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

/* ----------------- Authentication Submission ----------------- */
function submitLogin(data) {
  setLastLoginData(data);
  window.__lastLoginData = data;

  sendRequest("api/auth/auth.php", "POST", data, { "X-CSRF-Token": window.csrfToken })
    .then(response => {
      if (response.success || response.status === "ok") {
        sessionStorage.setItem("welcomeMessage", "Welcome back, " + data.username + "!");
        // Fetch and update permissions, then reload.
        sendRequest("api/getUserPermissions.php", "GET")
          .then(permissionData => {
            if (permissionData && typeof permissionData === "object") {
              localStorage.setItem("folderOnly", permissionData.folderOnly ? "true" : "false");
              localStorage.setItem("readOnly", permissionData.readOnly ? "true" : "false");
              localStorage.setItem("disableUpload", permissionData.disableUpload ? "true" : "false");
            }
          })
          .catch(() => {
            // ignore permission‐fetch errors
          })
          .finally(() => {
            window.location.reload();
          });
      } else if (response.totp_required) {
        openTOTPLoginModal();
      } else if (response.error && response.error.includes("Too many failed login attempts")) {
        showToast(response.error);
        const loginButton = document.querySelector("#authForm button[type='submit']");
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
    .catch(err => {
      // err may be an Error object or a string
      let msg = "Unknown error";
      if (err && typeof err === "object") {
        msg = err.error || err.message || msg;
      } else if (typeof err === "string") {
        msg = err;
      }
      showToast(`Login failed: ${msg}`);
    });
}

window.submitLogin = submitLogin;

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
  // Updated path: from "getUsers.php" to "api/getUsers.php"
  fetch("api/getUsers.php", { credentials: "include" })
    .then(response => response.json())
    .then(data => {
      // Assuming the endpoint returns an array of users.
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
    .catch(() => { /* handle errors if needed */ });
}
window.loadUserList = loadUserList;

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
    fetch("api/auth/logout.php", {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRF-Token": window.csrfToken }
    }).then(() => window.location.reload(true)).catch(() => { });
  });
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
    let url = "api/addUser.php";
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
    fetch("api/removeUser.php", {
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
    fetch("api/changePassword.php", {
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

  const oidcLoginBtn = document.getElementById("oidcLoginBtn");
  if (oidcLoginBtn) {
    oidcLoginBtn.addEventListener("click", () => {
      window.location.href = "/api/auth/auth.php?oidc=initiate";
    });
  }

  // If TOTP is pending, show modal and skip normal auth init
  if (window.pendingTOTP) {
    openTOTPLoginModal();
    return;
  }
});

export { initAuth, checkAuthentication };