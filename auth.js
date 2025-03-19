import { sendRequest } from './networkUtils.js';
import { toggleVisibility, showToast } from './domUtils.js';
// Import loadFileList and renderFileTable from fileManager.js to refresh the file list upon login.
import { loadFileList, renderFileTable, displayFilePreview, initFileActions } from './fileManager.js';
import { loadFolderTree } from './folderManager.js';

function initAuth() {
  // First, check if the user is already authenticated.
  checkAuthentication();

  // Attach event listener for login.
  document.getElementById("authForm").addEventListener("submit", function (event) {
    event.preventDefault();
    const formData = {
      username: document.getElementById("loginUsername").value.trim(),
      password: document.getElementById("loginPassword").value.trim()
    };
    // Include CSRF token header with login
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

  // Set up the logout button.
  document.getElementById("logoutBtn").addEventListener("click", function () {
    fetch("logout.php", {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRF-Token": window.csrfToken }
    })
      .then(() => window.location.reload(true))
      .catch(error => console.error("Logout error:", error));
  });

  // Set up Add User functionality.
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
          checkAuthentication();
        } else {
          showToast("Error: " + (data.error || "Could not add user"));
        }
      })
      .catch(error => console.error("Error adding user:", error));
  });

  document.getElementById("cancelUserBtn").addEventListener("click", function () {
    closeAddUserModal();
  });

  // Set up Remove User functionality.
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

function checkAuthentication() {
  // Return the promise from sendRequest
  return sendRequest("checkAuth.php")
    .then(data => {
      if (data.setup) {
        window.setupMode = true;
        showToast("Setup mode: No users found. Please add an admin user.");
        toggleVisibility("loginForm", false);
        toggleVisibility("mainOperations", false);
        document.querySelector(".header-buttons").style.visibility = "hidden";
        toggleVisibility("addUserModal", true);
        return false;
      } else {
        window.setupMode = false;
      }
      if (data.authenticated) {
        toggleVisibility("loginForm", false);
        toggleVisibility("mainOperations", true);
        toggleVisibility("uploadFileForm", true);
        toggleVisibility("fileListContainer", true);
        if (data.isAdmin) {
          const addUserBtn = document.getElementById("addUserBtn");
          const removeUserBtn = document.getElementById("removeUserBtn");
          if (addUserBtn) addUserBtn.style.display = "block";
          if (removeUserBtn) removeUserBtn.style.display = "block";
        } else {
          const addUserBtn = document.getElementById("addUserBtn");
          const removeUserBtn = document.getElementById("removeUserBtn");
          if (addUserBtn) addUserBtn.style.display = "none";
          if (removeUserBtn) removeUserBtn.style.display = "none";
        }
        document.querySelector(".header-buttons").style.visibility = "visible";
        const selectElem = document.querySelector(".form-control.bottom-select");
        if (selectElem) {
          const stored = localStorage.getItem("itemsPerPage") || "10";
          selectElem.value = stored;
        }
        return true;
      } else {
        showToast("Please log in to continue.");
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

/* ------------------------------
   Persistent Items-Per-Page Setting
   ------------------------------ */
window.changeItemsPerPage = function (value) {
  console.log("Saving itemsPerPage:", value);
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
    console.log("Loaded itemsPerPage from localStorage:", stored);
    selectElem.value = stored;
  }
});

/* ------------------------------
   Helper functions for modals and user list
   ------------------------------ */
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
      if (!users || !Array.isArray(users)) {
        console.error("Invalid users data:", data);
        return;
      }
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