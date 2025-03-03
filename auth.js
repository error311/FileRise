// auth.js
import { sendRequest, toggleVisibility } from './utils.js';

let setupMode = false; // Declare setupMode here

document.addEventListener("DOMContentLoaded", function () {
  // Hide file list and upload form on load.
  toggleVisibility("fileListContainer", false);
  toggleVisibility("uploadFileForm", false);

  checkAuthentication();

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
          toggleVisibility("loginForm", false);
          toggleVisibility("uploadFileForm", true);
          toggleVisibility("fileListContainer", true);
          checkAuthentication(); // Recheck authentication to update UI.
        } else {
          alert("Login failed: " + (data.error || "Unknown error"));
        }
      })
      .catch(error => console.error("Error logging in:", error));
  });
});

export function checkAuthentication() {
  sendRequest("checkAuth.php")
    .then(data => {
      console.log("Authentication check:", data);
      if (data.setup) {
        setupMode = true;
        // In setup mode, hide all sections except the Add User modal.
        toggleVisibility("loginForm", false);
        toggleVisibility("uploadFileForm", false);
        toggleVisibility("fileListContainer", false);
        document.querySelector(".header-buttons").style.visibility = "hidden";
        toggleVisibility("addUserModal", true);
        return;
      } else {
        setupMode = false;
      }
      if (data.authenticated) {
        toggleVisibility("loginForm", false);
        toggleVisibility("uploadFileForm", true);
        toggleVisibility("fileListContainer", true);
        if (typeof loadFileList === "function") {
          loadFileList();
        }
      } else {
        toggleVisibility("loginForm", true);
        toggleVisibility("uploadFileForm", false);
        toggleVisibility("fileListContainer", false);
      }
    })
    .catch(error => console.error("Error checking authentication:", error));
}
window.checkAuthentication = checkAuthentication;

// Helper functions for the Add User modal.
function closeAddUserModal() {
  toggleVisibility("addUserModal", false);
  resetUserForm();
}

function resetUserForm() {
  document.getElementById("newUsername").value = "";
  document.getElementById("newPassword").value = "";
}
