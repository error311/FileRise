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

export function initializeApp() {
  const saved = parseInt(localStorage.getItem('rowHeight') || '48', 10);
  document.documentElement.style.setProperty('--file-row-height', saved + 'px');
  window.currentFolder = "root";
  initTagSearch();
  loadFileList(window.currentFolder);
  const stored = localStorage.getItem('showFoldersInList');
  window.showFoldersInList = stored === null ? true : stored === 'true';
  const fileListArea = document.getElementById('fileListContainer');
  const uploadArea = document.getElementById('uploadDropArea');
  if (fileListArea && uploadArea) {
    fileListArea.addEventListener('dragover', e => {
      e.preventDefault();
      fileListArea.classList.add('drop-hover');
    });
    fileListArea.addEventListener('dragleave', () => {
      fileListArea.classList.remove('drop-hover');
    });
    fileListArea.addEventListener('drop', e => {
      e.preventDefault();
      fileListArea.classList.remove('drop-hover');
      // re-dispatch the same drop into the real upload card
      uploadArea.dispatchEvent(new DragEvent('drop', {
        dataTransfer: e.dataTransfer,
        bubbles: true,
        cancelable: true
      }));
    });
  }

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
  if (helpBtn && helpTooltip) {
    helpBtn.addEventListener("click", () => {
      helpTooltip.style.display =
        helpTooltip.style.display === "block" ? "none" : "block";
    });
  }
}

export function loadCsrfToken() {
  return fetchWithCsrf('/api/auth/token.php', { method: 'GET' })
    .then(res => {
      if (!res.ok) throw new Error(`Token fetch failed with status ${res.status}`);
      return res.json();
    })
    .then(({ csrf_token, share_url }) => {
      window.csrfToken = csrf_token;

      // update CSRF meta
      let meta = document.querySelector('meta[name="csrf-token"]') ||
        Object.assign(document.head.appendChild(document.createElement('meta')), { name: 'csrf-token' });
      meta.content = csrf_token;

      // force share_url to match wherever we're browsing
      const actualShare = window.location.origin;
      let shareMeta = document.querySelector('meta[name="share-url"]') ||
        Object.assign(document.head.appendChild(document.createElement('meta')), { name: 'share-url' });
      shareMeta.content = actualShare;

      return { csrf_token, share_url: actualShare };
    });
}

// 1) Immediately clear “?logout=1” flag
const params = new URLSearchParams(window.location.search);
if (params.get('logout') === '1') {
  localStorage.removeItem("username");
  localStorage.removeItem("userTOTPEnabled");
}

export function triggerLogout() {
  fetch("/api/auth/logout.php", {
    method: "POST",
    credentials: "include",
    headers: { "X-CSRF-Token": window.csrfToken }
  })
    .then(() => window.location.reload(true))
    .catch(() => { });
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
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.remove();
        initializeApp();
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
    const darkModeIcon = document.getElementById("darkModeIcon");

    if (darkModeToggle && darkModeIcon) {
      // 1) Load stored preference (or null)
      let stored = localStorage.getItem("darkMode");
      const hasStored = stored !== null;

      // 2) Determine initial mode
      const isDark = hasStored
        ? (stored === "true")
        : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);

      document.body.classList.toggle("dark-mode", isDark);
      darkModeToggle.classList.toggle("active", isDark);

      // 3) Helper to update icon & aria-label
      function updateIcon() {
        const dark = document.body.classList.contains("dark-mode");
        darkModeIcon.textContent = dark ? "light_mode" : "dark_mode";
        darkModeToggle.setAttribute(
          "aria-label",
          dark ? t("light_mode") : t("dark_mode")
        );
        darkModeToggle.setAttribute(
          "title",
          dark
            ? t("switch_to_light_mode")
            : t("switch_to_dark_mode")
        );
      }

      updateIcon();

      // 4) Click handler: always override and store preference
      darkModeToggle.addEventListener("click", () => {
        const nowDark = document.body.classList.toggle("dark-mode");
        localStorage.setItem("darkMode", nowDark ? "true" : "false");
        updateIcon();
      });

      // 5) OS‐level change: only if no stored pref at load
      if (!hasStored && window.matchMedia) {
        window
          .matchMedia("(prefers-color-scheme: dark)")
          .addEventListener("change", e => {
            document.body.classList.toggle("dark-mode", e.matches);
            updateIcon();
          });
      }
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