import { sendRequest } from './networkUtils.js';
import { toggleVisibility, toggleAllCheckboxes, updateFileActionButtons, showToast } from './domUtils.js';
import { loadFolderTree } from './folderManager.js';
import { initUpload } from './upload.js';
import { initAuth, checkAuthentication } from './auth.js';
import { setupTrashRestoreDelete } from './trashRestoreDelete.js';
import { initDragAndDrop, loadSidebarOrder, loadHeaderOrder } from './dragAndDrop.js';
import { initTagSearch, openTagModal, filterFilesByTag } from './fileTags.js';
import { displayFilePreview } from './filePreview.js';
import { loadFileList } from './fileListView.js';
import { initFileActions, renameFile, openDownloadModal, confirmSingleDownload } from './fileActions.js';
import { editFile, saveFile } from './fileEditor.js';
import { t, applyTranslations, setLocale } from './i18n.js';

function loadCsrfTokenWithRetry(retries = 3, delay = 1000) {
  return fetch('token.php', { credentials: 'include' })
    .then(response => {
      if (!response.ok) {
        throw new Error("Token fetch failed with status: " + response.status);
      }
      return response.json();
    })
    .then(data => {
      // Set global variables.
      window.csrfToken = data.csrf_token;
      window.SHARE_URL = data.share_url;

      // Update (or create) the CSRF meta tag.
      let metaCSRF = document.querySelector('meta[name="csrf-token"]');
      if (!metaCSRF) {
        metaCSRF = document.createElement('meta');
        metaCSRF.name = 'csrf-token';
        document.head.appendChild(metaCSRF);
      }
      metaCSRF.setAttribute('content', data.csrf_token);

      // Update (or create) the share URL meta tag.
      let metaShare = document.querySelector('meta[name="share-url"]');
      if (!metaShare) {
        metaShare = document.createElement('meta');
        metaShare.name = 'share-url';
        document.head.appendChild(metaShare);
      }
      metaShare.setAttribute('content', data.share_url);

      return data;
    })
    .catch(error => {
      if (retries > 0) {
        console.warn(`CSRF token load failed. Retrying in ${delay}ms... (${retries} retries left)`, error);
        return new Promise(resolve => setTimeout(resolve, delay))
          .then(() => loadCsrfTokenWithRetry(retries - 1, delay * 2));
      }
      console.error("Failed to load CSRF token after retries.", error);
      throw error;
    });
}


// Expose functions for inline handlers.
window.sendRequest = sendRequest;
window.toggleVisibility = toggleVisibility;
window.toggleAllCheckboxes = toggleAllCheckboxes;
window.editFile = editFile;
window.saveFile = saveFile;
window.renameFile = renameFile;
window.confirmSingleDownload = confirmSingleDownload;
window.openDownloadModal = openDownloadModal;

// Global variable for the current folder.
window.currentFolder = "root";

document.addEventListener("DOMContentLoaded", function () {
  // Retrieve the saved language from localStorage; default to "en"
  const savedLanguage = localStorage.getItem("language") || "en";
  // Set the locale based on the saved language
  setLocale(savedLanguage);
  // Apply the translations to update the UI
  applyTranslations();
  // First, load the CSRF token (with retry).
  loadCsrfTokenWithRetry().then(() => {
    // Once CSRF token is loaded, initialize authentication.
    initAuth();

    // Continue with initializations that rely on a valid CSRF token:
    checkAuthentication().then(authenticated => {
      if (authenticated) {
        window.currentFolder = "root";
        initTagSearch();
        loadFileList(window.currentFolder);
        initDragAndDrop();
        loadSidebarOrder();
        loadHeaderOrder();
        initFileActions();
        initUpload();
        loadFolderTree();
        setupTrashRestoreDelete();

        const helpBtn = document.getElementById("folderHelpBtn");
        const helpTooltip = document.getElementById("folderHelpTooltip");
        helpBtn.addEventListener("click", function () {
          // Toggle display of the tooltip.
          if (helpTooltip.style.display === "none" || helpTooltip.style.display === "") {
            helpTooltip.style.display = "block";
          } else {
            helpTooltip.style.display = "none";
          }
        });
      } else {
        console.warn("User not authenticated. Data loading deferred.");
      }
    });

    // Other DOM initialization that can happen after CSRF is ready.
    const newPasswordInput = document.getElementById("newPassword");
    if (newPasswordInput) {
      newPasswordInput.addEventListener("input", function () {
        console.log("newPassword input event:", this.value);
      });
    } else {
      console.error("newPassword input not found!");
    }

    // --- Dark Mode Persistence ---
    const darkModeToggle = document.getElementById("darkModeToggle");
    const storedDarkMode = localStorage.getItem("darkMode");

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

    if (darkModeToggle) {
      darkModeToggle.textContent = document.body.classList.contains("dark-mode")
        ? "Light Mode"
        : "Dark Mode";

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

    if (localStorage.getItem("darkMode") === null && window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
        if (event.matches) {
          document.body.classList.add("dark-mode");
          if (darkModeToggle) darkModeToggle.textContent = t("light_mode");
        } else {
          document.body.classList.remove("dark-mode");
          if (darkModeToggle) darkModeToggle.textContent = t("dark_mode");
        }
      });
    }
    // --- End Dark Mode Persistence ---

    const message = sessionStorage.getItem("welcomeMessage");
    if (message) {
      showToast(message);
      sessionStorage.removeItem("welcomeMessage");
    }
  }).catch(error => {
    console.error("Initialization halted due to CSRF token load failure.", error);
  });

  // --- Auto-scroll During Drag ---
  // Adjust these values as needed:
  const SCROLL_THRESHOLD = 50; // pixels from edge to start scrolling
  const SCROLL_SPEED = 20;     // pixels to scroll per event

  document.addEventListener("dragover", function (e) {
    if (e.clientY < SCROLL_THRESHOLD) {
      window.scrollBy(0, -SCROLL_SPEED);
    } else if (e.clientY > window.innerHeight - SCROLL_THRESHOLD) {
      window.scrollBy(0, SCROLL_SPEED);
    }
  });
});