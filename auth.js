import { sendRequest } from './networkUtils.js';
import { toggleVisibility, showToast, attachEnterKeyListener, showCustomConfirmModal } from './domUtils.js';
import { loadFileList, renderFileTable, displayFilePreview, initFileActions } from './fileManager.js';
import { loadFolderTree } from './folderManager.js';
import {
  openTOTPLoginModal,
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
  redirectUri: "https://yourdomain.com/auth.php?oidc=callback",
  globalOtpauthUrl: ""
};
window.currentOIDCConfig = currentOIDCConfig;

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

  if (typeof data.totp_enabled !== "undefined") {
    localStorage.setItem("userTOTPEnabled", data.totp_enabled ? "true" : "false");
  }

  if (data.username) {
    localStorage.setItem("username", data.username);
  }
  if (typeof data.folderOnly !== "undefined") {
    localStorage.setItem("folderOnly", data.folderOnly ? "true" : "false");
  }

  const headerButtons = document.querySelector(".header-buttons");
  const firstButton = headerButtons.firstElementChild;

  if (data.isAdmin) {
    let restoreBtn = document.getElementById("restoreFilesBtn");
    if (!restoreBtn) {
      restoreBtn = document.createElement("button");
      restoreBtn.id = "restoreFilesBtn";
      restoreBtn.classList.add("btn", "btn-warning");
      restoreBtn.innerHTML = '<i class="material-icons" title="Restore/Delete Trash">restore_from_trash</i>';
      if (firstButton) {
        insertAfter(restoreBtn, firstButton);
      } else {
        headerButtons.appendChild(restoreBtn);
      }
    }
    restoreBtn.style.display = "block";

    let adminPanelBtn = document.getElementById("adminPanelBtn");
    if (!adminPanelBtn) {
      adminPanelBtn = document.createElement("button");
      adminPanelBtn.id = "adminPanelBtn";
      adminPanelBtn.classList.add("btn", "btn-info");
      adminPanelBtn.innerHTML = '<i class="material-icons" title="Admin Panel">admin_panel_settings</i>';
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
      userPanelBtn.innerHTML = '<i class="material-icons" title="User Panel">account_circle</i>';
      let adminPanelBtn = document.getElementById("adminPanelBtn");
      if (adminPanelBtn) {
        insertAfter(userPanelBtn, adminPanelBtn);
      } else {
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
window.submitLogin = submitLogin;

/* ----------------- Other Helpers and Initialization ----------------- */
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
    fetch("logout.php", {
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
  const oidcLoginBtn = document.getElementById("oidcLoginBtn");
  if (oidcLoginBtn) {
    oidcLoginBtn.addEventListener("click", () => {
      // Redirect to the OIDC auth endpoint. The endpoint can be adjusted if needed.
      window.location.href = "auth.php?oidc=initiate";
    });
  }
});

export { initAuth, checkAuthentication };