import { sendRequest } from './networkUtils.js';
import {
  toggleVisibility,
  toggleAllCheckboxes,
  updateFileActionButtons,
  showToast
} from './domUtils.js';
import {
  loadFileList,
  initFileActions,
  editFile,
  saveFile,
  displayFilePreview,
  renameFile
} from './fileManager.js';
import { loadFolderTree } from './folderManager.js';
import { initUpload } from './upload.js';
import { initAuth, checkAuthentication } from './auth.js';

// Expose functions for inline handlers.
window.sendRequest = sendRequest;
window.toggleVisibility = toggleVisibility;
window.toggleAllCheckboxes = toggleAllCheckboxes;
window.editFile = editFile;
window.saveFile = saveFile;
window.renameFile = renameFile;

// Global variable for the current folder.
window.currentFolder = "root";

document.addEventListener("DOMContentLoaded", function () {
  // Call initAuth synchronously.
  initAuth();

  // --- Dark Mode Persistence ---
  // Get the dark mode toggle button.
  const darkModeToggle = document.getElementById("darkModeToggle");
  // Retrieve stored user preference (if any).
  const storedDarkMode = localStorage.getItem("darkMode");

  // Apply stored preference; if none, fall back to OS setting.
  if (storedDarkMode === "true") {
    document.body.classList.add("dark-mode");
  } else if (storedDarkMode === "false") {
    document.body.classList.remove("dark-mode");
  } else {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.body.classList.add("dark-mode");
    } else {
      document.body.classList.remove("dark-mode");
    }
  }

  // Set the initial button label.
  if (darkModeToggle) {
    darkModeToggle.textContent = document.body.classList.contains("dark-mode")
      ? "Light Mode"
      : "Dark Mode";

    // When clicked, toggle dark mode and store preference.
    darkModeToggle.addEventListener("click", function () {
      if (document.body.classList.contains("dark-mode")) {
        document.body.classList.remove("dark-mode");
        localStorage.setItem("darkMode", "false");
        darkModeToggle.textContent = "Dark Mode";
      } else {
        document.body.classList.add("dark-mode");
        localStorage.setItem("darkMode", "true");
        darkModeToggle.textContent = "Light Mode";
      }
    });
  }

  // Listen for OS theme changes if no user preference is set.
  if (localStorage.getItem("darkMode") === null && window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
      if (event.matches) {
        document.body.classList.add("dark-mode");
        if (darkModeToggle) darkModeToggle.textContent = "Light Mode";
      } else {
        document.body.classList.remove("dark-mode");
        if (darkModeToggle) darkModeToggle.textContent = "Dark Mode";
      }
    });
  }
  // --- End Dark Mode Persistence ---

  const message = sessionStorage.getItem("welcomeMessage");
  if (message) {
    showToast(message);
    sessionStorage.removeItem("welcomeMessage");
  }

  checkAuthentication().then(authenticated => {
    if (authenticated) {
      window.currentFolder = "root";
      loadFileList(window.currentFolder);
      initFileActions();
      initUpload();
      loadFolderTree();
    } else {
      console.warn("User not authenticated. Data loading deferred.");
    }
  });
});