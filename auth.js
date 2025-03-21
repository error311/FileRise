import { sendRequest } from './networkUtils.js';
import { toggleVisibility, showToast } from './domUtils.js';
import { loadFileList, renderFileTable, displayFilePreview, initFileActions } from './fileManager.js';
import { loadFolderTree } from './folderManager.js';

function initAuth() {
  // First, check if the user is already authenticated.
  checkAuthentication(false).then(data => {
    if (data.setup) {
      window.setupMode = true;
      showToast("Setup mode: No users found. Please add an admin user.");
      toggleVisibility("loginForm", false);
      toggleVisibility("mainOperations", false);
      document.querySelector(".header-buttons").style.visibility = "hidden";
      toggleVisibility("addUserModal", true);
      return;
    }
    window.setupMode = false;
    if (data.authenticated) {
      // User is logged in—show the main UI.
      toggleVisibility("loginForm", false);
      toggleVisibility("mainOperations", true);
      toggleVisibility("uploadFileForm", true);
      toggleVisibility("fileListContainer", true);
      document.querySelector(".header-buttons").style.visibility = "visible";
      // If admin, show admin-only buttons.
      if (data.isAdmin) {
        const addUserBtn = document.getElementById("addUserBtn");
        const removeUserBtn = document.getElementById("removeUserBtn");
        if (addUserBtn) addUserBtn.style.display = "block";
        if (removeUserBtn) removeUserBtn.style.display = "block";
        // Create and show the restore button.
        let restoreBtn = document.getElementById("restoreFilesBtn");
        if (!restoreBtn) {
          restoreBtn = document.createElement("button");
          restoreBtn.id = "restoreFilesBtn";
          restoreBtn.classList.add("btn", "btn-warning");
          // Use a material icon.
          restoreBtn.innerHTML = '<i class="material-icons" title="Restore/Delete Trash">restore_from_trash</i>';

          const headerButtons = document.querySelector(".header-buttons");
          if (headerButtons) {
            // Insert after the third child if available.
            if (headerButtons.children.length >= 4) {
              headerButtons.insertBefore(restoreBtn, headerButtons.children[4]);
            } else {
              headerButtons.appendChild(restoreBtn);
            }
          }
        }
        restoreBtn.style.display = "block";
      } else {
        const addUserBtn = document.getElementById("addUserBtn");
        const removeUserBtn = document.getElementById("removeUserBtn");
        if (addUserBtn) addUserBtn.style.display = "none";
        if (removeUserBtn) removeUserBtn.style.display = "none";
        // If not admin, hide the restore button.
        const restoreBtn = document.getElementById("restoreFilesBtn");
        if (restoreBtn) {
          restoreBtn.style.display = "none";
        }
      }
      // Set items-per-page.
      const selectElem = document.querySelector(".form-control.bottom-select");
      if (selectElem) {
        const stored = localStorage.getItem("itemsPerPage") || "10";
        selectElem.value = stored;
      }
    } else {
      // Do not show a toast message repeatedly during initial check.
      toggleVisibility("loginForm", true);
      toggleVisibility("mainOperations", false);
      toggleVisibility("uploadFileForm", false);
      toggleVisibility("fileListContainer", false);
      document.querySelector(".header-buttons").style.visibility = "hidden";
    }
  }).catch(error => {
    console.error("Error checking authentication:", error);
  });

  // Attach login event listener once.
  const authForm = document.getElementById("authForm");
  if (authForm) {
    authForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const formData = {
        username: document.getElementById("loginUsername").value.trim(),
        password: document.getElementById("loginPassword").value.trim()
      };
      sendRequest("auth.php", "POST", formData, { "X-CSRF-Token": window.csrfToken })
        .then(data => {
          if (data.success) {
            console.log("✅ Login successful. Reloading page.");
            sessionStorage.setItem("welcomeMessage", "Welcome back, " + formData.username + "!");
            window.location.reload();
          } else {
            showToast("Login failed: " + (data.error || "Unknown error"));
          }
        })
        .catch(error => console.error("❌ Error logging in:", error));
    });
  }

  // Attach logout event listener.
  document.getElementById("logoutBtn").addEventListener("click", function () {
    fetch("logout.php", {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRF-Token": window.csrfToken }
    })
      .then(() => window.location.reload(true))
      .catch(error => console.error("Logout error:", error));
  });

  // Add User functionality.
  document.getElementById("addUserBtn").addEventListener("click", function () {
    resetUserForm();
    toggleVisibility("addUserModal", true);
  });
  document.getElementById("saveUserBtn").addEventListener("click", function () {
    const newUsername = document.getElementById("newUsername").value.trim();
    const newPassword = document.getElementById("newPassword").value.trim();
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
          checkAuthentication(false); // Re-check without showing toast
        } else {
          showToast("Error: " + (data.error || "Could not add user"));
        }
      })
      .catch(error => console.error("Error adding user:", error));
  });
  document.getElementById("cancelUserBtn").addEventListener("click", function () {
    closeAddUserModal();
  });

  // Remove User functionality.
  document.getElementById("removeUserBtn").addEventListener("click", function () {
    loadUserList();
    toggleVisibility("removeUserModal", true);
  });
  document.getElementById("deleteUserBtn").addEventListener("click", function () {
    const selectElem = document.getElementById("removeUsernameSelect");
    const usernameToRemove = selectElem.value;
    if (!usernameToRemove) {
      showToast("Please select a user to remove.");
      return;
    }
    if (!confirm("Are you sure you want to delete user " + usernameToRemove + "?")) {
      return;
    }
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
      .catch(error => console.error("Error removing user:", error));
  });
  document.getElementById("cancelRemoveUserBtn").addEventListener("click", function () {
    closeRemoveUserModal();
  });
}

function checkAuthentication(showLoginToast = true) {
  // Optionally pass a flag so we don't show a toast every time.
  return sendRequest("checkAuth.php")
    .then(data => {
      if (data.setup) {
        window.setupMode = true;
        if (showLoginToast) showToast("Setup mode: No users found. Please add an admin user.");
        toggleVisibility("loginForm", false);
        toggleVisibility("mainOperations", false);
        document.querySelector(".header-buttons").style.visibility = "hidden";
        toggleVisibility("addUserModal", true);
        return false;
      }
      window.setupMode = false;
      if (data.authenticated) {
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
    .catch(error => {
      console.error("Error checking authentication:", error);
      return false;
    });
}
window.checkAuthentication = checkAuthentication;

window.changeItemsPerPage = function (value) {
  localStorage.setItem("itemsPerPage", value);
  const folder = window.currentFolder || "root";
  if (typeof renderFileTable === "function") {
    renderFileTable(folder);
  }
};

document.addEventListener("DOMContentLoaded", function () {
  const selectElem = document.querySelector(".form-control.bottom-select");
  if (selectElem) {
    const stored = localStorage.getItem("itemsPerPage") || "10";
    selectElem.value = stored;
  }
});

function resetUserForm() {
  document.getElementById("newUsername").value = "";
  document.getElementById("newPassword").value = "";
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
    .catch(error => console.error("Error loading user list:", error));
}

export { initAuth, checkAuthentication };