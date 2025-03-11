// main.js

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

// DOMContentLoaded initialization.

document.addEventListener("DOMContentLoaded", function () {
  // Call initAuth synchronously.
  initAuth();

  // Check OS theme preference & apply dark mode
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.body.classList.add("dark-mode"); // Enable dark mode if OS is set to dark
  }

  // Listen for real-time OS theme changes
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
      if (event.matches) {
          document.body.classList.add("dark-mode"); // Enable dark mode
      } else {
          document.body.classList.remove("dark-mode"); // Disable dark mode
      }
  });

  // ✅ Fix the Button Label on Page Load
  const darkModeToggle = document.getElementById("darkModeToggle");
  if (document.body.classList.contains("dark-mode")) {
      darkModeToggle.textContent = "Light Mode";
  } else {
      darkModeToggle.textContent = "Dark Mode";
  }

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
