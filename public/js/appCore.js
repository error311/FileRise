// /js/appCore.js
import { showToast } from './domUtils.js?v={{APP_QVER}}';
import { t } from './i18n.js?v={{APP_QVER}}';
import { loadFolderTree } from './folderManager.js?v={{APP_QVER}}';
import { setupTrashRestoreDelete } from './trashRestoreDelete.js?v={{APP_QVER}}';
import { initDragAndDrop, loadSidebarOrder, loadHeaderOrder } from './dragAndDrop.js?v={{APP_QVER}}';
import { initTagSearch } from './fileTags.js?v={{APP_QVER}}';
import { initFileActions } from './fileActions.js?v={{APP_QVER}}';
import { initUpload } from './upload.js?v={{APP_QVER}}';
import { loadAdminConfigFunc } from './auth.js?v={{APP_QVER}}';

// Keep a bound handle to the native fetch so wrappers elsewhere never recurse
const _nativeFetch = window.fetch.bind(window);

/* =========================
   CSRF UTILITIES (shared)
   ========================= */
export function setCsrfToken(token) {
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

export function getCsrfToken() {
  return window.csrfToken || localStorage.getItem('csrf') || '';
}

/**
 * Bootstrap/refresh CSRF from the server.
 * Uses the native fetch to avoid wrapper loops and accepts rotated tokens via header.
 */
export async function loadCsrfToken() {
  const res = await _nativeFetch('/api/auth/token.php', { method: 'GET', credentials: 'include' });

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
}

/* =========================
   APP INIT (shared)
   ========================= */
export function initializeApp() {
  const saved = parseInt(localStorage.getItem('rowHeight') || '48', 10);
  document.documentElement.style.setProperty('--file-row-height', saved + 'px');

  const last = localStorage.getItem('lastOpenedFolder');
  window.currentFolder = last ? last : "root";

  const stored = localStorage.getItem('showFoldersInList');
  window.showFoldersInList = stored === null ? true : stored === 'true';

  // Load public site config early (safe subset)
  loadAdminConfigFunc();

  // Enable tag search UI; initial file list load is controlled elsewhere
  initTagSearch();

  // Hook DnD relay from fileList area into upload area
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

  // App subsystems
  initDragAndDrop();
  loadSidebarOrder();
  loadHeaderOrder();
  initFileActions();
  initUpload();
  loadFolderTree();

  // Only run trash/restore for admins
  const isAdmin =
    localStorage.getItem('isAdmin') === '1' || localStorage.getItem('isAdmin') === 'true';
  if (isAdmin) {
    setupTrashRestoreDelete();
  }

  // Small help tooltip toggle
  const helpBtn = document.getElementById("folderHelpBtn");
  const helpTooltip = document.getElementById("folderHelpTooltip");
  if (helpBtn && helpTooltip) {
    helpBtn.addEventListener("click", () => {
      helpTooltip.style.display =
        helpTooltip.style.display === "block" ? "none" : "block";
    });
  }
}

/* =========================
   LOGOUT (shared)
   ========================= */
export function triggerLogout() {
  const clearWelcomeFlags = () => {
    try {
      // one-per-tab toast guard
      sessionStorage.removeItem('__fr_welcomed');
      // if you also used the per-user (all-tabs) guard, clear that too:
      const u = localStorage.getItem('username') || '';
      if (u) localStorage.removeItem(`__fr_welcomed_${u}`);
    } catch { }
  };

  _nativeFetch("/api/auth/logout.php", {
    method: "POST",
    credentials: "include",
    headers: { "X-CSRF-Token": getCsrfToken() }
  })
    .then(() => {
      clearWelcomeFlags();
      window.location.reload(true);
    })
    .catch(() => {
      // even if the request fails, clear the flags so the next login can toast
      clearWelcomeFlags();
      window.location.reload(true);
    });
}

/* =========================
   Global UX guard (unchanged)
   ========================= */
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