// /js/main.js
import { sendRequest } from './networkUtils.js?v={{APP_QVER}}';
import { toggleVisibility, toggleAllCheckboxes, updateFileActionButtons, showToast } from './domUtils.js?v={{APP_QVER}}';
import { initUpload } from './upload.js?v={{APP_QVER}}';
import { initAuth, fetchWithCsrf, checkAuthentication, loadAdminConfigFunc } from './auth.js?v={{APP_QVER}}';
import { loadFolderTree } from './folderManager.js?v={{APP_QVER}}';
import { setupTrashRestoreDelete } from './trashRestoreDelete.js?v={{APP_QVER}}';
import { initDragAndDrop, loadSidebarOrder, loadHeaderOrder } from './dragAndDrop.js?v={{APP_QVER}}';
import { initTagSearch, openTagModal, filterFilesByTag } from './fileTags.js?v={{APP_QVER}}';
import { displayFilePreview } from './filePreview.js?v={{APP_QVER}}';
import { loadFileList } from './fileListView.js?v={{APP_QVER}}';
import { initFileActions, renameFile, openDownloadModal, confirmSingleDownload } from './fileActions.js?v={{APP_QVER}}';
import { editFile, saveFile } from './fileEditor.js?v={{APP_QVER}}';
import { t, applyTranslations, setLocale } from './i18n.js?v={{APP_QVER}}';

// NEW: import shared helpers from appCore (moved out of main.js)
import {
  initializeApp,
  loadCsrfToken,
  triggerLogout,
  setCsrfToken,
  getCsrfToken
} from './appCore.js?v={{APP_QVER}}';

/* =========================
   CSRF HOTFIX UTILITIES
   ========================= */
// Keep a handle to the native fetch so wrappers never recurse
const _nativeFetch = window.fetch.bind(window);

// Seed CSRF from storage ASAP (before any requests)
setCsrfToken(getCsrfToken());

// Wrap fetch so *all* callers get CSRF header + token rotation, without recursion
async function fetchWithCsrfAndRefresh(input, init = {}) {
  const headers = new Headers(init?.headers || {});
  const token = getCsrfToken();

  if (token && !headers.has('X-CSRF-Token')) {
    headers.set('X-CSRF-Token', token);
  }

  const res = await _nativeFetch(input, {
    credentials: 'include',
    ...init,
    headers,
  });

  try {
    const rotated = res.headers?.get('X-CSRF-Token');
    if (rotated) setCsrfToken(rotated);
  } catch { /* ignore */ }

  return res;
}

// Avoid double-wrapping if this module re-evaluates for any reason
if (!window.fetch || !window.fetch._frWrapped) {
  const wrapped = fetchWithCsrfAndRefresh;
  Object.defineProperty(wrapped, '_frWrapped', { value: true });
  window.fetch = wrapped;
}

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
window.triggerLogout = triggerLogout; // expose the moved helper

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
   BOOTSTRAP
   ========================= */
const params = new URLSearchParams(window.location.search);
if (params.get('logout') === '1') {
  localStorage.removeItem("username");
  localStorage.removeItem("userTOTPEnabled");
}

document.addEventListener("DOMContentLoaded", function () {
  // Load site config early (safe subset)
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

// Expose functions for inline handlers 
window.sendRequest = sendRequest;
window.toggleVisibility = toggleVisibility;
window.toggleAllCheckboxes = toggleAllCheckboxes;
window.editFile = editFile;
window.saveFile = saveFile;
window.renameFile = renameFile;
window.confirmSingleDownload = confirmSingleDownload;
window.openDownloadModal = openDownloadModal;

// Global variable for the current folder (initial default; initializeApp will update)
window.currentFolder = "root";