import { sendRequest } from './networkUtils.js';
import { toggleVisibility, showToast, attachEnterKeyListener, showCustomConfirmModal } from './domUtils.js';
import { loadFileList, renderFileTable, displayFilePreview, initFileActions } from './fileManager.js';
import { loadFolderTree } from './folderManager.js';

// Default OIDC configuration (can be overridden via API in production)
const currentOIDCConfig = {
  providerUrl: "https://your-oidc-provider.com",
  clientId: "YOUR_CLIENT_ID",
  clientSecret: "YOUR_CLIENT_SECRET",
  redirectUri: "https://yourdomain.com/auth.php?oidc=callback"
};

function updateItemsPerPageSelect() {
  const selectElem = document.querySelector(".form-control.bottom-select");
  if (selectElem) {
    const stored = localStorage.getItem("itemsPerPage") || "10";
    selectElem.value = stored;
  }
}

function updateLoginOptionsUI({ disableFormLogin, disableBasicAuth, disableOIDCLogin }) {
  const authForm = document.getElementById("authForm");
  if (authForm) {
    authForm.style.display = disableFormLogin ? "none" : "block";
  }
  const basicAuthLink = document.querySelector("a[href='login_basic.php']");
  if (basicAuthLink) {
    basicAuthLink.style.display = disableBasicAuth ? "none" : "inline-block";
  }
  const oidcLoginBtn = document.getElementById("oidcLoginBtn");
  if (oidcLoginBtn) {
    oidcLoginBtn.style.display = disableOIDCLogin ? "none" : "inline-block";
  }
}

function updateLoginOptionsUIFromStorage() {
  const disableFormLogin = localStorage.getItem("disableFormLogin") === "true";
  const disableBasicAuth = localStorage.getItem("disableBasicAuth") === "true";
  const disableOIDCLogin = localStorage.getItem("disableOIDCLogin") === "true";
  updateLoginOptionsUI({ disableFormLogin, disableBasicAuth, disableOIDCLogin });
}

function loadAdminConfigFunc() {
  return fetch("getConfig.php", { credentials: "include" })
    .then(response => response.json())
    .then(config => {
      localStorage.setItem("disableFormLogin", config.loginOptions.disableFormLogin);
      localStorage.setItem("disableBasicAuth", config.loginOptions.disableBasicAuth);
      localStorage.setItem("disableOIDCLogin", config.loginOptions.disableOIDCLogin);
      updateLoginOptionsUIFromStorage();
    })
    .catch(() => {
      localStorage.setItem("disableFormLogin", "false");
      localStorage.setItem("disableBasicAuth", "false");
      localStorage.setItem("disableOIDCLogin", "false");
      updateLoginOptionsUIFromStorage();
    });
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

  if (data.isAdmin) {
    let restoreBtn = document.getElementById("restoreFilesBtn");
    if (!restoreBtn) {
      restoreBtn = document.createElement("button");
      restoreBtn.id = "restoreFilesBtn";
      restoreBtn.classList.add("btn", "btn-warning");
      restoreBtn.innerHTML = '<i class="material-icons" title="Restore/Delete Trash">restore_from_trash</i>';
      const headerButtons = document.querySelector(".header-buttons");
      if (headerButtons) {
        if (headerButtons.children.length >= 3) {
          headerButtons.insertBefore(restoreBtn, headerButtons.children[3]);
        } else {
          headerButtons.appendChild(restoreBtn);
        }
      }
    }
    restoreBtn.style.display = "block";
  
    let adminPanelBtn = document.getElementById("adminPanelBtn");
    if (!adminPanelBtn) {
      adminPanelBtn = document.createElement("button");
      adminPanelBtn.id = "adminPanelBtn";
      adminPanelBtn.classList.add("btn", "btn-info");
      // Use material icon for the admin panel button.
      adminPanelBtn.innerHTML = '<i class="material-icons" title="Admin Panel">admin_panel_settings</i>';
      const headerButtons = document.querySelector(".header-buttons");
      if (headerButtons) {
        // Insert the adminPanelBtn immediately after the restoreBtn.
        if (restoreBtn.nextSibling) {
          headerButtons.insertBefore(adminPanelBtn, restoreBtn.nextSibling);
        } else {
          headerButtons.appendChild(adminPanelBtn);
        }
      }
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
      sendRequest("auth.php", "POST", formData, { "X-CSRF-Token": window.csrfToken })
        .then(data => {
          if (data.success) {
            sessionStorage.setItem("welcomeMessage", "Welcome back, " + formData.username + "!");
            window.location.reload();
          } else {
            if (data.error && data.error.includes("Too many failed login attempts")) {
              showToast(data.error);
              const loginButton = authForm.querySelector("button[type='submit']");
              if (loginButton) {
                loginButton.disabled = true;
                setTimeout(() => {
                  loginButton.disabled = false;
                  showToast("You can now try logging in again.");
                }, 30 * 60 * 1000);
              }
            } else {
              showToast("Login failed: " + (data.error || "Unknown error"));
            }
          }
        })
        .catch(() => {});
    });
  }

  document.getElementById("logoutBtn").addEventListener("click", function () {
    fetch("logout.php", {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRF-Token": window.csrfToken }
    })
      .then(() => window.location.reload(true))
      .catch(() => {});
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
    if (window.setupMode) {
      url += "?setup=1";
    }
    fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": window.csrfToken
      },
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
      .catch(() => {});
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
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": window.csrfToken
      },
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
      .catch(() => {});
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
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": window.csrfToken
      },
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
      .catch(() => {
        showToast("Error changing password.");
      });
  });
}

function loadOIDCConfig() {
  return fetch("getConfig.php", { credentials: "include" })
    .then(response => response.json())
    .then(config => {
      if (config.oidc) {
        Object.assign(currentOIDCConfig, config.oidc);
      }
      return currentOIDCConfig;
    })
    .catch(() => currentOIDCConfig);
}

function openAdminPanel() {
  fetch("getConfig.php", { credentials: "include" })
    .then(response => response.json())
    .then(config => {
      if (config.oidc) {
        Object.assign(currentOIDCConfig, config.oidc);
      }
      const isDarkMode = document.body.classList.contains("dark-mode");
      const overlayBackground = isDarkMode ? "rgba(0, 0, 0, 0.7)" : "rgba(0, 0, 0, 0.3)";
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
        adminModal.addEventListener("click", function (e) {
          if (e.target === adminModal) {
            closeAdminPanel();
          }
        });
        document.getElementById("cancelAdminSettings").addEventListener("click", closeAdminPanel);
        document.getElementById("adminOpenAddUser").addEventListener("click", function () {
          toggleVisibility("addUserModal", true);
          document.getElementById("newUsername").focus();
        });
        document.getElementById("adminOpenRemoveUser").addEventListener("click", function () {
          loadUserList();
          toggleVisibility("removeUserModal", true);
        });
        document.getElementById("saveAdminSettings").addEventListener("click", function () {
          const disableFormLoginCheckbox = document.getElementById("disableFormLogin");
          const disableBasicAuthCheckbox = document.getElementById("disableBasicAuth");
          const disableOIDCLoginCheckbox = document.getElementById("disableOIDCLogin");
          const totalDisabled = [disableFormLoginCheckbox, disableBasicAuthCheckbox, disableOIDCLoginCheckbox]
            .filter(cb => cb.checked).length;
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
          sendRequest("updateConfig.php", "POST", {
            oidc: newOIDCConfig,
            disableFormLogin,
            disableBasicAuth,
            disableOIDCLogin
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
            .catch(() => {});
        });
        const disableFormLoginCheckbox = document.getElementById("disableFormLogin");
        const disableBasicAuthCheckbox = document.getElementById("disableBasicAuth");
        const disableOIDCLoginCheckbox = document.getElementById("disableOIDCLogin");
        function enforceLoginOptionConstraint(changedCheckbox) {
          const totalDisabled = [disableFormLoginCheckbox, disableBasicAuthCheckbox, disableOIDCLoginCheckbox]
            .filter(cb => cb.checked).length;
          if (changedCheckbox.checked && totalDisabled === 3) {
            showToast("At least one login method must remain enabled.");
            changedCheckbox.checked = false;
          }
        }
        disableFormLoginCheckbox.addEventListener("change", function () {
          enforceLoginOptionConstraint(this);
        });
        disableBasicAuthCheckbox.addEventListener("change", function () {
          enforceLoginOptionConstraint(this);
        });
        disableOIDCLoginCheckbox.addEventListener("change", function () {
          enforceLoginOptionConstraint(this);
        });
        document.getElementById("disableFormLogin").checked = localStorage.getItem("disableFormLogin") === "true";
        document.getElementById("disableBasicAuth").checked = localStorage.getItem("disableBasicAuth") === "true";
        document.getElementById("disableOIDCLogin").checked = localStorage.getItem("disableOIDCLogin") === "true";
      } else {
        const isDarkMode = document.body.classList.contains("dark-mode");
        const overlayBackground = isDarkMode ? "rgba(0, 0, 0, 0.7)" : "rgba(0, 0, 0, 0.3)";
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
        document.getElementById("disableFormLogin").checked = localStorage.getItem("disableFormLogin") === "true";
        document.getElementById("disableBasicAuth").checked = localStorage.getItem("disableBasicAuth") === "true";
        document.getElementById("disableOIDCLogin").checked = localStorage.getItem("disableOIDCLogin") === "true";
        adminModal.style.display = "flex";
      }
    })
    .catch(() => {
      let adminModal = document.getElementById("adminPanelModal");
      if (adminModal) {
        document.getElementById("oidcProviderUrl").value = currentOIDCConfig.providerUrl;
        document.getElementById("oidcClientId").value = currentOIDCConfig.clientId;
        document.getElementById("oidcClientSecret").value = currentOIDCConfig.clientSecret;
        document.getElementById("oidcRedirectUri").value = currentOIDCConfig.redirectUri;
        adminModal.style.display = "flex";
      } else {
        openAdminPanel();
      }
    });
}

function closeAdminPanel() {
  const adminModal = document.getElementById("adminPanelModal");
  if (adminModal) {
    adminModal.style.display = "none";
  }
}

window.changeItemsPerPage = function (value) {
  localStorage.setItem("itemsPerPage", value);
  const folder = window.currentFolder || "root";
  if (typeof renderFileTable === "function") {
    renderFileTable(folder);
  }
};

document.addEventListener("DOMContentLoaded", function () {
  updateItemsPerPageSelect();
  const disableFormLogin = localStorage.getItem("disableFormLogin") === "true";
  const disableBasicAuth = localStorage.getItem("disableBasicAuth") === "true";
  const disableOIDCLogin = localStorage.getItem("disableOIDCLogin") === "true";
  updateLoginOptionsUI({ disableFormLogin, disableBasicAuth, disableOIDCLogin });
});

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
    .catch(() => {});
}

export { initAuth, checkAuthentication };