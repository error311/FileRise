// auth.js

import { sendRequest } from './networkUtils.js';
import { toggleVisibility } from './domUtils.js';
// Import loadFileList from fileManager.js to refresh the file list upon login.
import { loadFileList } from './fileManager.js';

export function initAuth() {
  // On initial load, show the login form and hide the main operations.
  toggleVisibility("loginForm", true);
  toggleVisibility("mainOperations", false);
  // Ensure header buttons are hidden.
  document.querySelector(".header-buttons").style.visibility = "hidden";

  // Set up the authentication form listener.
  document.getElementById("authForm").addEventListener("submit", function (event) {
    event.preventDefault();
    const formData = {
      username: document.getElementById("loginUsername").value.trim(),
      password: document.getElementById("loginPassword").value.trim()
    };
    console.log("Sending login data:", formData);
    sendRequest("auth.php", "POST", formData)
      .then(data => {
        console.log("Login response:", data);
        if (data.success) {
          console.log("Login successful.");
          // On successful login, hide the login form and show main operations.
          toggleVisibility("loginForm", false);
          toggleVisibility("mainOperations", true);
          toggleVisibility("uploadFileForm", true);
          toggleVisibility("fileListContainer", true);
          document.querySelector(".header-buttons").style.visibility = "visible";
          // Refresh the file list immediately using the current folder.
          loadFileList(window.currentFolder || "root");
          // Optionally, you can also call checkAuthentication() to update UI further.
          checkAuthentication();
        } else {
          alert("Login failed: " + (data.error || "Unknown error"));
        }
      })
      .catch(error => console.error("Error logging in:", error));
  });

  // Set up the logout button.
  document.getElementById("logoutBtn").addEventListener("click", function () {
    fetch("logout.php", { method: "POST" })
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
      alert("Username and password are required!");
      return;
    }
    let url = "addUser.php";
    if (window.setupMode) {
      url += "?setup=1";
    }
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: newUsername, password: newPassword, isAdmin })
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          alert("User added successfully!");
          closeAddUserModal();
          checkAuthentication();
        } else {
          alert("Error: " + (data.error || "Could not add user"));
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
      alert("Please select a user to remove.");
      return;
    }
    if (!confirm("Are you sure you want to delete user " + usernameToRemove + "?")) {
      return;
    }
    fetch("removeUser.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: usernameToRemove })
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          alert("User removed successfully!");
          closeRemoveUserModal();
          loadUserList();
        } else {
          alert("Error: " + (data.error || "Could not remove user"));
        }
      })
      .catch(error => console.error("Error removing user:", error));
  });

  document.getElementById("cancelRemoveUserBtn").addEventListener("click", function () {
    closeRemoveUserModal();
  });
}

export function checkAuthentication() {
  sendRequest("checkAuth.php")
    .then(data => {
      console.log("Authentication check:", data);
      if (data.setup) {
        window.setupMode = true;
        // In setup mode, hide login and main operations; show Add User modal.
        toggleVisibility("loginForm", false);
        toggleVisibility("mainOperations", false);
        document.querySelector(".header-buttons").style.visibility = "hidden";
        toggleVisibility("addUserModal", true);
        return;
      } else {
        window.setupMode = false;
      }
      if (data.authenticated) {
        toggleVisibility("loginForm", false);
        toggleVisibility("mainOperations", true);
        toggleVisibility("uploadFileForm", true);
        toggleVisibility("fileListContainer", true);
        document.querySelector(".header-buttons").style.visibility = "visible";
      } else {
        toggleVisibility("loginForm", true);
        toggleVisibility("mainOperations", false);
        toggleVisibility("uploadFileForm", false);
        toggleVisibility("fileListContainer", false);
        document.querySelector(".header-buttons").style.visibility = "hidden";
      }
    })
    .catch(error => console.error("Error checking authentication:", error));
}
window.checkAuthentication = checkAuthentication;

// Helper functions for auth modals.
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
  fetch("getUsers.php")
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
        alert("No other users found to remove.");
        closeRemoveUserModal();
      }
    })
    .catch(error => console.error("Error loading user list:", error));
}
