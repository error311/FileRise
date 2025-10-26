import { sendRequest } from './networkUtils.js';
import { toggleVisibility, toggleAllCheckboxes, updateFileActionButtons, showToast } from './domUtils.js';
import { initUpload } from './upload.js';
import { initAuth, fetchWithCsrf, checkAuthentication, loadAdminConfigFunc } from './auth.js';
import { loadFolderTree } from './folderManager.js';
import { setupTrashRestoreDelete } from './trashRestoreDelete.js';
import { initDragAndDrop, loadSidebarOrder, loadHeaderOrder } from './dragAndDrop.js';
import { initTagSearch, openTagModal, filterFilesByTag } from './fileTags.js';
import { displayFilePreview } from './filePreview.js';
import { loadFileList } from './fileListView.js';
import { initFileActions, renameFile, openDownloadModal, confirmSingleDownload } from './fileActions.js';
import { editFile, saveFile } from './fileEditor.js';
import { t, applyTranslations, setLocale } from './i18n.js';

/* =========================
   CSRF HOTFIX UTILITIES
   ========================= */
const _nativeFetch = window.fetch; // keep the real fetch

function setCsrfToken(token) {
  if (!token) return;
  window.csrfToken = token;
  localStorage.setItem('csrf', token);

  // meta tag for easy access in other places
  let meta = document.querySelector('meta[name="csrf-token"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'csrf-token';
    document.head.appendChild(meta);
  }
  meta.content = token;
}
function getCsrfToken() {
  return window.csrfToken || localStorage.getItem('csrf') || '';
}

// Seed CSRF from storage ASAP (before any requests)
setCsrfToken(getCsrfToken());

// Wrap the existing fetchWithCsrf so we also capture rotated tokens from headers.
async function fetchWithCsrfAndRefresh(input, init = {}) {
  const res = await fetchWithCsrf(input, init);
  try {
    const rotated = res.headers?.get('X-CSRF-Token');
    if (rotated) setCsrfToken(rotated);
  } catch { /* ignore */ }
  return res;
}

// Replace global fetch with the wrapped version so *all* callers benefit.
window.fetch = fetchWithCsrfAndRefresh;

/* =========================
   SAFE API HELPERS
   ========================= */
export async function apiGETJSON(url, opts = {}) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (res.status === 401) throw new Error("auth");
  if (res.status === 403) throw new Error("forbidden");
  if (!res.ok) throw new Error(`http ${res.status}`);
  try { return await res.json(); } catch { return {}; }
}

export async function apiPOSTJSON(url, body, opts = {}) {
  const headers = {
    "Content-Type": "application/json",
    "X-CSRF-Token": getCsrfToken(),
    ...(opts.headers || {})
  };
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(body ?? {}),
    ...opts
  });
  if (res.status === 401) throw new Error("auth");
  if (res.status === 403) throw new Error("forbidden");
  if (!res.ok) throw new Error(`http ${res.status}`);
  try { return await res.json(); } catch { return {}; }
}

// Optional: expose on window for legacy callers
window.apiGETJSON = apiGETJSON;
window.apiPOSTJSON = apiPOSTJSON;

// Global handler to keep UX friendly if something forgets to catch
window.addEventListener("unhandledrejection", (ev) => {
  const msg = (ev?.reason && ev.reason.message) || "";
  if (msg === "auth") {
    showToast(t("please_sign_in_again") || "Please sign in again.", "error");
    ev.preventDefault();
  } else if (msg === "forbidden") {
    showToast(t("no_access_to_resource") || "You don’t have access to that.", "error");
    ev.preventDefault();
  }
});

/* =========================
   APP INIT
   ========================= */

export function initializeApp() {
  const saved = parseInt(localStorage.getItem('rowHeight') || '48', 10);
  document.documentElement.style.setProperty('--file-row-height', saved + 'px');

  //window.currentFolder = "root";
  const last = localStorage.getItem('lastOpenedFolder');
  window.currentFolder = last ? last : "root";
  const stored = localStorage.getItem('showFoldersInList');
  window.showFoldersInList = stored === null ? true : stored === 'true';
  loadAdminConfigFunc();
  initTagSearch();
  //loadFileList(window.currentFolder);

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
  // Only run trash/restore for admins
 const isAdmin =
   localStorage.getItem('isAdmin') === '1' ||  localStorage.getItem('isAdmin') === 'true';
 if (isAdmin) {
   setupTrashRestoreDelete();
 }

  const helpBtn = document.getElementById("folderHelpBtn");
  const helpTooltip = document.getElementById("folderHelpTooltip");
  if (helpBtn && helpTooltip) {
    helpBtn.addEventListener("click", () => {
      helpTooltip.style.display =
        helpTooltip.style.display === "block" ? "none" : "block";
    });
  }
}

/**
 * Bootstrap/refresh CSRF from the server.
 * Uses the *native* fetch to avoid any wrapper loops and to work even if we don't
 * yet have a token. Also accepts a rotated token from the response header.
 */
export function loadCsrfToken() {
  return _nativeFetch('/api/auth/token.php', { method: 'GET', credentials: 'include' })
    .then(async res => {
      // header-based rotation
      const hdr = res.headers.get('X-CSRF-Token');
      if (hdr) setCsrfToken(hdr);

      // body (if provided)
      let body = {};
      try { body = await res.json(); } catch { /* token endpoint may return empty */ }

      const token = body.csrf_token || getCsrfToken();
      setCsrfToken(token);

      // share-url meta should reflect the actual origin
      const actualShare = window.location.origin;
      let shareMeta = document.querySelector('meta[name="share-url"]');
      if (!shareMeta) {
        shareMeta = document.createElement('meta');
        shareMeta.name = 'share-url';
        document.head.appendChild(shareMeta);
      }
      shareMeta.content = actualShare;

      return { csrf_token: token, share_url: actualShare };
    });
}

// 1) Immediately clear “?logout=1” flag
const params = new URLSearchParams(window.location.search);
if (params.get('logout') === '1') {
  localStorage.removeItem("username");
  localStorage.removeItem("userTOTPEnabled");
}

export function triggerLogout() {
  _nativeFetch("/api/auth/logout.php", {
    method: "POST",
    credentials: "include",
    headers: { "X-CSRF-Token": getCsrfToken() }
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
  // Load admin config early
  loadAdminConfigFunc();

  // i18n
  const savedLanguage = localStorage.getItem("language") || "en";
  setLocale(savedLanguage);
  applyTranslations();

  // 1) Get/refresh CSRF first
  loadCsrfToken()
    .then(() => {
      // 2) Auth boot
      initAuth();

      // 3) If authenticated, start app
      checkAuthentication().then(authenticated => {
        if (authenticated) {
          const overlay = document.getElementById('loadingOverlay');
          if (overlay) overlay.remove();
          initializeApp();
        }
      });

      // --- Dark Mode Persistence ---
      const darkModeToggle = document.getElementById("darkModeToggle");
      const darkModeIcon = document.getElementById("darkModeIcon");

      if (darkModeToggle && darkModeIcon) {
        let stored = localStorage.getItem("darkMode");
        const hasStored = stored !== null;

        const isDark = hasStored
          ? (stored === "true")
          : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);

        document.body.classList.toggle("dark-mode", isDark);
        darkModeToggle.classList.toggle("active", isDark);

        function updateIcon() {
          const dark = document.body.classList.contains("dark-mode");
          darkModeIcon.textContent = dark ? "light_mode" : "dark_mode";
          darkModeToggle.setAttribute("aria-label", dark ? t("light_mode") : t("dark_mode"));
          darkModeToggle.setAttribute("title", dark ? t("switch_to_light_mode") : t("switch_to_dark_mode"));
        }
        updateIcon();

        darkModeToggle.addEventListener("click", () => {
          const nowDark = document.body.classList.toggle("dark-mode");
          localStorage.setItem("darkMode", nowDark ? "true" : "false");
          updateIcon();
        });

        if (!hasStored && window.matchMedia) {
          window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", e => {
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
    })
    .catch(error => {
      console.error("Initialization halted due to CSRF token load failure.", error);
    });

  // --- Auto-scroll During Drag ---
  const SCROLL_THRESHOLD = 50;
  const SCROLL_SPEED = 20;
  document.addEventListener("dragover", function (e) {
    if (e.clientY < SCROLL_THRESHOLD) {
      window.scrollBy(0, -SCROLL_SPEED);
    } else if (e.clientY > window.innerHeight - SCROLL_THRESHOLD) {
      window.scrollBy(0, SCROLL_SPEED);
    }
  });
});