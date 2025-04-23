import { sendRequest } from './networkUtils.js';
import { toggleVisibility, toggleAllCheckboxes, updateFileActionButtons, showToast } from './domUtils.js';
import { initUpload } from './upload.js';
import { initAuth, fetchWithCsrf, checkAuthentication, loadAdminConfigFunc } from './auth.js';
const _originalFetch = window.fetch;
window.fetch = fetchWithCsrf;
import { loadFolderTree } from './folderManager.js';
import { setupTrashRestoreDelete } from './trashRestoreDelete.js';
import { initDragAndDrop, loadSidebarOrder, loadHeaderOrder } from './dragAndDrop.js';
import { initTagSearch, openTagModal, filterFilesByTag } from './fileTags.js';
import { displayFilePreview } from './filePreview.js';
import { loadFileList } from './fileListView.js';
import { initFileActions, renameFile, openDownloadModal, confirmSingleDownload } from './fileActions.js';
import { editFile, saveFile } from './fileEditor.js';
import { t, applyTranslations, setLocale } from './i18n.js';

// Remove the retry logic version and just use loadCsrfToken directly:
/**
 * Fetches the current CSRF token (and share URL), updates window globals
 * and <meta> tags, and returns the data.
 *
 * @returns {Promise<{csrf_token: string, share_url: string}>}
 */
export function loadCsrfToken() {
  return fetch('/api/auth/token.php', {
    method: 'GET',
    credentials: 'include'
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Token fetch failed with status: ${response.status}`);
      }
      // Prefer header if set, otherwise fall back to body
      const headerToken = response.headers.get('X-CSRF-Token');
      return response.json()
        .then(body => ({
          csrf_token: headerToken || body.csrf_token,
          share_url: body.share_url
        }));
    })
    .then(({ csrf_token, share_url }) => {
      // Update globals
      window.csrfToken = csrf_token;
      window.SHARE_URL = share_url;

      // Sync <meta name="csrf-token">
      let meta = document.querySelector('meta[name="csrf-token"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'csrf-token';
        document.head.appendChild(meta);
      }
      meta.content = csrf_token;

      // Sync <meta name="share-url">
      let shareMeta = document.querySelector('meta[name="share-url"]');
      if (!shareMeta) {
        shareMeta = document.createElement('meta');
        shareMeta.name = 'share-url';
        document.head.appendChild(shareMeta);
      }
      shareMeta.content = share_url;

      return { csrf_token, share_url };
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

  loadAdminConfigFunc(); // Then fetch the latest config and update.
  // Retrieve the saved language from localStorage; default to "en"
  const savedLanguage = localStorage.getItem("language") || "en";
  // Set the locale based on the saved language
  setLocale(savedLanguage);
  // Apply the translations to update the UI
  applyTranslations();
  // First, load the CSRF token (with retry).
  loadCsrfToken().then(() => {
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
        loadAdminConfigFunc();

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
        ? t("light_mode")
        : t("dark_mode");

      darkModeToggle.addEventListener("click", function () {
        if (document.body.classList.contains("dark-mode")) {
          document.body.classList.remove("dark-mode");
          localStorage.setItem("darkMode", "false");
          darkModeToggle.textContent = t("dark_mode");
        } else {
          document.body.classList.add("dark-mode");
          localStorage.setItem("darkMode", "true");
          darkModeToggle.textContent = t("light_mode");
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