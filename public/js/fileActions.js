// fileActions.js
import { showToast, attachEnterKeyListener, escapeHTML } from './domUtils.js?v={{APP_QVER}}';
import {
  loadFileList,
  formatFolderName,
  fileData,
  downloadSelectedFilesIndividually,
  startInlineRenameFromContext,
  MAX_NONZIP_MULTI_DOWNLOAD
} from './fileListView.js?v={{APP_QVER}}';
import { refreshFolderIcon, updateRecycleBinState } from './folderManager.js?v={{APP_QVER}}';
import { t } from './i18n.js?v={{APP_QVER}}';
import { withBase } from './basePath.js?v={{APP_QVER}}';

function getActiveFileListRoot() {
  return document.getElementById("fileList") || document;
}

function getActiveSelectedFileCheckboxes() {
  const root = getActiveFileListRoot();
  return Array.from(root.querySelectorAll(".file-checkbox:checked"));
}

function getOtherPaneFolder() {
  if (!window.dualPaneEnabled || !window.__frPaneState) return "";
  const active = window.activePane === "secondary" ? "secondary" : "primary";
  const other = active === "secondary" ? "primary" : "secondary";
  const otherFolder = window.__frPaneState?.[other]?.currentFolder || "";
  if (!otherFolder || otherFolder === (window.currentFolder || "")) return "";
  return otherFolder;
}

function selectPreferredFolderOption(folderSelect, preferredFolder) {
  if (!folderSelect || !preferredFolder) return;
  const options = Array.from(folderSelect.options || []);
  const match = options.find(opt => opt.value === preferredFolder);
  if (match) folderSelect.value = preferredFolder;
}

function markPaneNeedsReloadForFolder(folder) {
  if (!window.dualPaneEnabled || !window.__frPaneState || !folder) return;
  const active = window.activePane === "secondary" ? "secondary" : "primary";
  ["primary", "secondary"].forEach(pane => {
    if (pane === active) return;
    const state = window.__frPaneState[pane];
    if (state && state.currentFolder === folder) {
      state.needsReload = true;
    }
  });
}

export function handleDeleteSelected(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  const checkboxes = getActiveSelectedFileCheckboxes();
  if (checkboxes.length === 0) {
    showToast("no_files_selected");
    return;
  }
  window.filesToDelete = Array.from(checkboxes).map(chk => chk.value);
  const count = window.filesToDelete.length;
  document.getElementById("deleteFilesMessage").textContent = t("confirm_delete_files", { count: count });
  document.getElementById("deleteFilesModal").style.display = "block";
  attachEnterKeyListener("deleteFilesModal", "confirmDeleteFiles");
}

const FILE_MODAL_IDS = [
  'deleteFilesModal',
  'downloadZipModal',
  'downloadProgressModal',
  'createFileModal',
  'downloadFileModal',
  'copyFilesModal',
  'moveFilesModal',
  'renameFileModal',
  'createFolderModal', // if this exists in your HTML
];

function portalFileModalsToBody() {
  FILE_MODAL_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.parentNode !== document.body) {
      document.body.appendChild(el);
    }
  });
}

function getSelectedFileObjects() {
  const selected = getActiveSelectedFileCheckboxes().map(cb => cb.value);
  if (!selected.length) return [];
  const selectedSet = new Set(selected);
  return fileData.filter(f => selectedSet.has(escapeHTML(f.name)));
}

function getDownloadLimit() {
  const limit = window.maxNonZipDownloads || MAX_NONZIP_MULTI_DOWNLOAD;
  return Number.isFinite(limit) ? limit : MAX_NONZIP_MULTI_DOWNLOAD;
}


  // --- Upload modal "portal" support ---
  let _uploadCardSentinel = null;

  export function openUploadModal() {
    const modal = document.getElementById('uploadModal');
    const body  = document.getElementById('uploadModalBody');
    const card  = document.getElementById('uploadCard'); // <-- your existing card
    window.openUploadModal = openUploadModal;
    window.__pendingDropData = null;
    if (!modal || !body || !card) {
      console.warn('Upload modal or upload card not found');
      return;
    }
  
    // Create a hidden sentinel so we can put the card back in place later
    if (!_uploadCardSentinel) {
      _uploadCardSentinel = document.createElement('div');
      _uploadCardSentinel.id = 'uploadCardSentinel';
      _uploadCardSentinel.style.display = 'none';
      card.parentNode.insertBefore(_uploadCardSentinel, card);
    }
  
    // Move the actual card node into the modal (keeps all existing listeners)
    body.appendChild(card);
  
    // Show modal
    modal.style.display = 'block';
  
    // Focus the chooser for quick keyboard flow
    setTimeout(() => {
      const chooseBtn = document.getElementById('customChooseBtn');
      if (chooseBtn) chooseBtn.focus();
    }, 50);
  }
  
  export function closeUploadModal() {
    const modal = document.getElementById('uploadModal');
    const card  = document.getElementById('uploadCard');
  
    if (_uploadCardSentinel && _uploadCardSentinel.parentNode && card) {
      _uploadCardSentinel.parentNode.insertBefore(card, _uploadCardSentinel);
    }
    if (modal) modal.style.display = 'none';
  }

document.addEventListener("DOMContentLoaded", function () {
  const cancelDelete = document.getElementById("cancelDeleteFiles");
  if (cancelDelete) {
    cancelDelete.addEventListener("click", function () {
      document.getElementById("deleteFilesModal").style.display = "none";
      window.filesToDelete = [];
    });
  }

  const confirmDelete = document.getElementById("confirmDeleteFiles");
  if (confirmDelete) {
    confirmDelete.setAttribute("data-default", "");
    confirmDelete.addEventListener("click", function () {
      fetch("/api/file/deleteFiles.php", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": window.csrfToken
        },
        body: JSON.stringify({ folder: window.currentFolder, files: window.filesToDelete })
      })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            showToast("Selected files deleted successfully!");
            // deleteFiles.php moves items into Trash; update the recycle bin indicator immediately.
            updateRecycleBinState(true);
            loadFileList(window.currentFolder);
            refreshFolderIcon(window.currentFolder);
          } else {
            showToast("Error: " + (data.error || "Could not delete files"));
          }
        })
        .catch(error => console.error("Error deleting files:", error))
        .finally(() => {
          document.getElementById("deleteFilesModal").style.display = "none";
          window.filesToDelete = [];
        });
    });
  }
});

export function handleDownloadMultiSelected(e) {
  if (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  const files = getSelectedFileObjects();
  if (!files.length) {
    showToast(t("no_files_selected") || "No files selected for download.");
    return;
  }

  const limit = getDownloadLimit();
  const caps = window.currentFolderCaps || null;
  const inEncryptedFolder = !!(caps && caps.encryption && caps.encryption.encrypted);

  // In encrypted folders, ZIP create is disabled. Allow plain downloads up to the limit only.
  if (inEncryptedFolder) {
    if (files.length > limit) {
      showToast(`In encrypted folders, downloads are limited to ${limit} file(s) at a time.`);
      return;
    }
    downloadSelectedFilesIndividually(files);
    return;
  }

  // Normal behavior: download individually up to the limit; ZIP for more than the limit.
  if (files.length > limit) {
    handleDownloadZipSelected(e || new Event("click"));
    return;
  }

  downloadSelectedFilesIndividually(files);
}

attachEnterKeyListener("downloadZipModal", "confirmDownloadZip");
export function handleDownloadZipSelected(e) {
  if (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  const caps = window.currentFolderCaps || null;
  const inEncryptedFolder = !!(caps && caps.encryption && caps.encryption.encrypted);
  if (inEncryptedFolder) {
    const files = getSelectedFileObjects();
    const limit = getDownloadLimit();
    if (files.length > limit) {
      showToast(`In encrypted folders, downloads are limited to ${limit} file(s) at a time.`);
      return;
    }
    // If we got here via an old/hidden ZIP action, fall back to plain download.
    downloadSelectedFilesIndividually(files);
    return;
  }

  const checkboxes = getActiveSelectedFileCheckboxes();
  if (checkboxes.length === 0) {
    showToast("No files selected for download.");
    return;
  }
  window.filesToDownload = Array.from(checkboxes).map(chk => chk.value);
  document.getElementById("downloadZipModal").style.display = "block";
  setTimeout(() => {
    const input = document.getElementById("zipFileNameInput");
    input.focus();
  }, 100);
};

export function handleCreateFileSelected(e) {
  e.preventDefault(); e.stopImmediatePropagation();
  const modal = document.getElementById('createFileModal');
  modal.style.display = 'block';
  setTimeout(() => {
    const inp = document.getElementById('newFileCreateName');
    if (inp) inp.focus();
  }, 100);
}

/**
 * Open the “New File” modal
 */
export function openCreateFileModal() {
  const modal = document.getElementById('createFileModal');
  const input = document.getElementById('createFileNameInput');
  if (!modal || !input) {
    console.error('Create-file modal or input not found');
    return;
  }
  input.value = '';
  modal.style.display = 'block';
  setTimeout(() => input.focus(), 0);
}


export async function handleCreateFile(e) {
  e.preventDefault();
  const input = document.getElementById('createFileNameInput');
  if (!input) return console.error('Create-file input missing');
  const name = input.value.trim();
  if (!name) {
    showToast(t('newfile_placeholder'));  // or a more explicit error
    return;
  }

  const folder = window.currentFolder || 'root';
  try {
    const res = await fetch('/api/file/createFile.php', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': window.csrfToken
      },
      // ⚠️ must send `name`, not `filename`
      body: JSON.stringify({ folder, name })
    });
    const js = await res.json();
    if (!js.success) throw new Error(js.error);
    showToast(t('file_created'));
    loadFileList(folder);
    refreshFolderIcon(folder);
  } catch (err) {
    showToast(err.message || t('error_creating_file'));
  } finally {
    document.getElementById('createFileModal').style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const cancel = document.getElementById('cancelCreateFile');
  const confirm = document.getElementById('confirmCreateFile');
  if (cancel) cancel.addEventListener('click', () => document.getElementById('createFileModal').style.display = 'none');
  if (confirm) confirm.addEventListener('click', handleCreateFile);
});

export function openDownloadModal(fileName, folder) {
  // Store file details globally for the download confirmation function.
  window.singleFileToDownload = fileName;
  window.currentFolder = folder || "root";

  // Optionally pre-fill the file name input in the modal.
  const input = document.getElementById("downloadFileNameInput");
  if (input) {
    input.value = fileName; // Use file name as-is (or modify if desired)
  }

  // Show the single file download modal (a new modal element).
  document.getElementById("downloadFileModal").style.display = "block";

  // Optionally focus the input after a short delay.
  setTimeout(() => {
    if (input) input.focus();
  }, 100);
}

export function confirmSingleDownload() {
  // 1) Get and validate the filename
  const input = document.getElementById("downloadFileNameInput");
  const fileName = input.value.trim();
  if (!fileName) {
    showToast("Please enter a name for the file.");
    return;
  }

  // 2) Hide the download-name modal
  document.getElementById("downloadFileModal").style.display = "none";

  // 3) Build the direct download URL
  const folder = window.currentFolder || "root";
  const downloadURL = withBase("/api/file/download.php")
    + "?folder=" + encodeURIComponent(folder)
    + "&file=" + encodeURIComponent(window.singleFileToDownload);

  // 4) Trigger native browser download
  const a = document.createElement("a");
  a.href = downloadURL;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // 5) Notify the user
  showToast("Download started. Check your browser’s download manager.");
}

export function handleExtractZipSelected(e) {
  if (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  const checkboxes = getActiveSelectedFileCheckboxes();
  if (!checkboxes.length) {
    showToast("No files selected.");
    return;
  }
  const zipFiles = Array.from(checkboxes)
    .map(chk => chk.value)
    .filter(name => name.toLowerCase().endsWith(".zip"));
  if (!zipFiles.length) {
    showToast("No zip files selected.");
    return;
  }

  // Prepare and show the spinner-only modal
  const modal = document.getElementById("downloadProgressModal");
  const titleEl = document.getElementById("downloadProgressTitle");
  const spinner = modal.querySelector(".download-spinner");
  const progressBar = document.getElementById("downloadProgressBar");
  const progressPct = document.getElementById("downloadProgressPercent");

  if (titleEl) titleEl.textContent = "Extracting files…";
  if (spinner) spinner.style.display = "inline-block";
  if (progressBar) progressBar.style.display = "none";
  if (progressPct) progressPct.style.display = "none";

  modal.style.display = "block";

  fetch("/api/file/extractZip.php", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": window.csrfToken
    },
    body: JSON.stringify({
      folder: window.currentFolder || "root",
      files: zipFiles
    })
  })
    .then(response => response.json())
    .then(data => {
      modal.style.display = "none";
      if (data.success) {
        let msg = "Zip file(s) extracted successfully!";
        if (Array.isArray(data.extractedFiles) && data.extractedFiles.length) {
          msg = "Extracted: " + data.extractedFiles.join(", ");
        }
        showToast(msg);
        loadFileList(window.currentFolder);
      } else {
        showToast("Error extracting zip: " + (data.error || "Unknown error"));
      }
    })
    .catch(error => {
      modal.style.display = "none";
      console.error("Error extracting zip files:", error);
      showToast("Error extracting zip files.");
    });
}

document.addEventListener("DOMContentLoaded", () => {
  const zipNameModal = document.getElementById("downloadZipModal");
  const progressModal = document.getElementById("downloadProgressModal");
  const cancelZipBtn = document.getElementById("cancelDownloadZip");
  const confirmZipBtn = document.getElementById("confirmDownloadZip");
  const cancelCreate = document.getElementById('cancelCreateFile');

  if (cancelCreate) {
    cancelCreate.addEventListener('click', () => {
      document.getElementById('createFileModal').style.display = 'none';
    });
  }

  const confirmCreate = document.getElementById('confirmCreateFile');
  if (confirmCreate) {
    confirmCreate.addEventListener('click', async () => {
      const name = document.getElementById('newFileCreateName').value.trim();
      if (!name) {
        showToast(t('please_enter_filename'));
        return;
      }
      document.getElementById('createFileModal').style.display = 'none';
      try {
        const res = await fetch('/api/file/createFile.php', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': window.csrfToken
          },
          body: JSON.stringify({
            folder: window.currentFolder || 'root',
            filename: name
          })
        });
        const js = await res.json();
        if (!res.ok || !js.success) {
          throw new Error(js.error || t('error_creating_file'));
        }
        showToast(t('file_created_successfully'));
        loadFileList(window.currentFolder);
        refreshFolderIcon(folder);
      } catch (err) {
        console.error(err);
        showToast(err.message || t('error_creating_file'));
      }
    });
    attachEnterKeyListener('createFileModal', 'confirmCreateFile');
  }

  // 1) Cancel button hides the name modal
  if (cancelZipBtn) {
    cancelZipBtn.addEventListener("click", () => {
      zipNameModal.style.display = "none";
    });
  }

  // 2) Confirm button kicks off the zip+download
  if (confirmZipBtn) {
    confirmZipBtn.setAttribute("data-default", "");
    confirmZipBtn.addEventListener("click", async () => {
      // a) Validate ZIP filename
      let zipName = document.getElementById("zipFileNameInput").value.trim();
      if (!zipName) { showToast("Please enter a name for the zip file."); return; }
      if (!zipName.toLowerCase().endsWith(".zip")) zipName += ".zip";

      // b) Hide the name‐input modal, show the progress modal
      zipNameModal.style.display = "none";
      progressModal.style.display = "block";

      // c) Title text (optional)
      const titleEl = document.getElementById("downloadProgressTitle");
      if (titleEl) titleEl.textContent = `Preparing ${zipName}…`;

      // d) Queue the job
      const res = await fetch("/api/file/downloadZip.php", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": window.csrfToken },
        body: JSON.stringify({ folder: window.currentFolder || "root", files: window.filesToDownload })
      });
      const jsr = await res.json().catch(() => ({}));
      if (!res.ok || !jsr.ok) {
        const msg = (jsr && jsr.error) ? jsr.error : `Status ${res.status}`;
        throw new Error(msg);
      }
      const token = jsr.token;
      const statusUrl = jsr.statusUrl;
      const downloadUrl = jsr.downloadUrl + "&name=" + encodeURIComponent(zipName);

      // Ensure a progress UI exists in the modal
      function ensureZipProgressUI() {
        const modalEl = document.getElementById("downloadProgressModal");
        if (!modalEl) {
          // really shouldn't happen, but fall back to body
          console.warn("downloadProgressModal not found; falling back to document.body");
        }
        // Prefer a dedicated content node inside the modal
        let host =
          (modalEl && modalEl.querySelector("#downloadProgressContent")) ||
          (modalEl && modalEl.querySelector(".modal-body")) ||
          (modalEl && modalEl.querySelector(".rise-modal-body")) ||
          (modalEl && modalEl.querySelector(".modal-content")) ||
          (modalEl && modalEl.querySelector(".content")) ||
          null;

        // If no suitable container, create one inside the modal
        if (!host) {
          host = document.createElement("div");
          host.id = "downloadProgressContent";
          (modalEl || document.body).appendChild(host);
        }

        // Helper: ensure/move an element with given id into host
        function ensureInHost(id, tag, init) {
          let el = document.getElementById(id);
          if (el && el.parentElement !== host) host.appendChild(el); // move if it exists elsewhere
          if (!el) {
            el = document.createElement(tag);
            el.id = id;
            if (typeof init === "function") init(el);
            host.appendChild(el);
          }
          return el;
        }

        // Title
        const title = ensureInHost("downloadProgressTitle", "div", (el) => {
          el.style.marginBottom = "8px";
          el.textContent = "Preparing…";
        });

        // Progress bar (native <progress>)
        const bar = (function () {
          let el = document.getElementById("downloadProgressBar");
          if (el && el.parentElement !== host) host.appendChild(el); // move into modal
          if (!el) {
            el = document.createElement("progress");
            el.id = "downloadProgressBar";
            host.appendChild(el);
          }
          el.max = 100;
          el.value = 0;
          el.style.display = "";     // override any inline display:none
          el.style.width = "100%";
          el.style.height = "1.1em";
          return el;
        })();

        // Text line
        const text = ensureInHost("downloadProgressText", "div", (el) => {
          el.style.marginTop = "8px";
          el.style.fontSize = "0.9rem";
          el.style.whiteSpace = "nowrap";
          el.style.overflow = "hidden";
          el.style.textOverflow = "ellipsis";
        });

        // Optional spinner hider
        const hideSpinner = () => {
          const sp = document.getElementById("downloadSpinner");
          if (sp) sp.style.display = "none";
        };

        return { bar, text, title, hideSpinner };
      }

      function humanBytes(n) {
        if (!Number.isFinite(n) || n < 0) return "";
        const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0, x = n;
        while (x >= 1024 && i < u.length - 1) { x /= 1024; i++; }
        return x.toFixed(x >= 10 || i === 0 ? 0 : 1) + " " + u[i];
      }
      function mmss(sec) {
        sec = Math.max(0, sec | 0);
        const m = (sec / 60) | 0, s = sec % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
      }

      const ui = ensureZipProgressUI();
      const t0 = Date.now();

      // e) Poll until ready
      while (true) {
        await new Promise(r => setTimeout(r, 1200));
        const s = await fetch(`${statusUrl}&_=${Date.now()}`, {
          credentials: "include", cache: "no-store",
        }).then(r => r.json());

        if (s.error) throw new Error(s.error);
        if (ui.title) ui.title.textContent = `Preparing ${zipName}…`;

        // --- RENDER PROGRESS ---
        if (typeof s.pct === "number" && ui.bar && ui.text) {
          if ((s.phase !== 'finalizing') && (s.pct < 99)) {
            ui.hideSpinner && ui.hideSpinner();
            const filesDone = s.filesDone ?? 0;
            const filesTotal = s.filesTotal ?? 0;
            const bytesDone = s.bytesDone ?? 0;
            const bytesTotal = s.bytesTotal ?? 0;

            // Determinate 0–98% while enumerating
            const pct = Math.max(0, Math.min(98, s.pct | 0));
            if (!ui.bar.hasAttribute("value")) ui.bar.value = 0;
            ui.bar.value = pct;
            ui.text.textContent =
              `${pct}% — ${filesDone}/${filesTotal} files, ${humanBytes(bytesDone)} / ${humanBytes(bytesTotal)}`;
          } else {
            // FINALIZING: keep progress at 100% and show timer + selected totals
            if (!ui.bar.hasAttribute("value")) ui.bar.value = 100;
            ui.bar.value = 100; // lock at 100 during finalizing
            const since = s.finalizeAt ? Math.max(0, (Date.now() / 1000 | 0) - (s.finalizeAt | 0)) : 0;
            const selF = s.selectedFiles ?? s.filesTotal ?? 0;
            const selB = s.selectedBytes ?? s.bytesTotal ?? 0;
            ui.text.textContent = `Finalizing… ${mmss(since)} — ${selF} file${selF === 1 ? '' : 's'}, ~${humanBytes(selB)}`;
          }
        } else if (ui.text) {
          ui.text.textContent = "Still preparing…";
        }
        // --- /RENDER ---

        if (s.ready) {
          // Snap to 100 and close modal just before download
          if (ui.bar) { ui.bar.max = 100; ui.bar.value = 100; }
          progressModal.style.display = "none";
          await new Promise(r => setTimeout(r, 0));
          break;
        }
        if (Date.now() - t0 > 15 * 60 * 1000) throw new Error("Timed out preparing ZIP");
      }

      // f) Trigger download
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = zipName;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();

      // g) Reset for next time
      if (ui.bar) ui.bar.value = 0;
      if (ui.text) ui.text.textContent = "";
      if (Array.isArray(window.filesToDownload)) window.filesToDownload = [];
    });
  }
});

export function handleCopySelected(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  const checkboxes = getActiveSelectedFileCheckboxes();
  if (checkboxes.length === 0) {
    showToast("No files selected for copying.", 5000);
    return;
  }
  window.filesToCopy = Array.from(checkboxes).map(chk => chk.value);
  document.getElementById("copyFilesModal").style.display = "block";
  loadCopyMoveFolderListForModal("copyTargetFolder", getOtherPaneFolder());
}

export async function loadCopyMoveFolderListForModal(dropdownId, preferredFolder = "") {
  const folderSelect = document.getElementById(dropdownId);
  if (!folderSelect) return;
  folderSelect.innerHTML = "";

  if (window.userFolderOnly) {
    const username = localStorage.getItem("username") || "root";
    try {
      const response = await fetch("/api/folder/getFolderList.php?restricted=1&counts=0");
      let folders = await response.json();
      if (Array.isArray(folders) && folders.length && typeof folders[0] === "object" && folders[0].folder) {
        folders = folders.map(item => item.folder);
      }
      folders = folders.filter(folder =>
        folder.toLowerCase() !== "trash" &&
        (folder === username || folder.indexOf(username + "/") === 0)
      );

      const rootOption = document.createElement("option");
      rootOption.value = username;
      rootOption.textContent = formatFolderName(username);
      folderSelect.appendChild(rootOption);

      folders.forEach(folder => {
        if (folder !== username) {
          const option = document.createElement("option");
          option.value = folder;
          option.textContent = formatFolderName(folder);
          folderSelect.appendChild(option);
        }
      });
      selectPreferredFolderOption(folderSelect, preferredFolder);
    } catch (error) {
      console.error("Error loading folder list for modal:", error);
    }
    return;
  }

  try {
    const response = await fetch("/api/folder/getFolderList.php?counts=0");
    let folders = await response.json();
    if (Array.isArray(folders) && folders.length && typeof folders[0] === "object" && folders[0].folder) {
      folders = folders.map(item => item.folder);
    }
    folders = folders.filter(folder => folder !== "root" && folder.toLowerCase() !== "trash");

    const rootOption = document.createElement("option");
    rootOption.value = "root";
    rootOption.textContent = "(Root)";
    folderSelect.appendChild(rootOption);

    if (Array.isArray(folders) && folders.length > 0) {
      folders.forEach(folder => {
        const option = document.createElement("option");
        option.value = folder;
        option.textContent = folder;
        folderSelect.appendChild(option);
      });
    }
    selectPreferredFolderOption(folderSelect, preferredFolder);
  } catch (error) {
    console.error("Error loading folder list for modal:", error);
  }
}

export function handleMoveSelected(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  const checkboxes = getActiveSelectedFileCheckboxes();
  if (checkboxes.length === 0) {
    showToast("No files selected for moving.");
    return;
  }
  window.filesToMove = Array.from(checkboxes).map(chk => chk.value);
  document.getElementById("moveFilesModal").style.display = "block";
  loadCopyMoveFolderListForModal("moveTargetFolder", getOtherPaneFolder());
}

document.addEventListener("DOMContentLoaded", function () {
  const cancelCopy = document.getElementById("cancelCopyFiles");
  if (cancelCopy) {
    cancelCopy.addEventListener("click", function () {
      document.getElementById("copyFilesModal").style.display = "none";
      window.filesToCopy = [];
    });
  }
  const confirmCopy = document.getElementById("confirmCopyFiles");
  if (confirmCopy) {
    confirmCopy.setAttribute("data-default", "");
    confirmCopy.addEventListener("click", function () {
      const targetFolder = document.getElementById("copyTargetFolder").value;
      if (!targetFolder) {
        showToast("Please select a target folder for copying.", 5000);
        return;
      }
      if (targetFolder === window.currentFolder) {
        showToast("Error: Cannot copy files to the same folder.");
        return;
      }
      fetch("/api/file/copyFiles.php", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": window.csrfToken
        },
        body: JSON.stringify({
          source: window.currentFolder,
          files: window.filesToCopy,
          destination: targetFolder
        })
      })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            showToast("Selected files copied successfully!", 5000);
            loadFileList(window.currentFolder);
            refreshFolderIcon(targetFolder);
            markPaneNeedsReloadForFolder(targetFolder);
          } else {
            showToast("Error: " + (data.error || "Could not copy files"), 5000);
          }
        })
        .catch(error => console.error("Error copying files:", error))
        .finally(() => {
          document.getElementById("copyFilesModal").style.display = "none";
          window.filesToCopy = [];
        });
    });
  }
});

document.addEventListener("DOMContentLoaded", function () {
  const cancelMove = document.getElementById("cancelMoveFiles");
  if (cancelMove) {
    cancelMove.addEventListener("click", function () {
      document.getElementById("moveFilesModal").style.display = "none";
      window.filesToMove = [];
    });
  }
  const confirmMove = document.getElementById("confirmMoveFiles");
  if (confirmMove) {
    confirmMove.setAttribute("data-default", "");
    confirmMove.addEventListener("click", function () {
      const targetFolder = document.getElementById("moveTargetFolder").value;
      if (!targetFolder) {
        showToast("Please select a target folder for moving.");
        return;
      }
      if (targetFolder === window.currentFolder) {
        showToast("Error: Cannot move files to the same folder.");
        return;
      }
      fetch("/api/file/moveFiles.php", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": window.csrfToken
        },
        body: JSON.stringify({
          source: window.currentFolder,
          files: window.filesToMove,
          destination: targetFolder
        })
      })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            showToast("Selected files moved successfully!");
            loadFileList(window.currentFolder);
            refreshFolderIcon(targetFolder);
            refreshFolderIcon(window.currentFolder);
            markPaneNeedsReloadForFolder(targetFolder);
            markPaneNeedsReloadForFolder(window.currentFolder);
          } else {
            showToast("Error: " + (data.error || "Could not move files"));
          }
        })
        .catch(error => console.error("Error moving files:", error))
        .finally(() => {
          document.getElementById("moveFilesModal").style.display = "none";
          window.filesToMove = [];
        });
    });
  }
});

export function handleRenameSelected(e) {
  if (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  const files = getSelectedFileObjects();
  if (files.length !== 1) {
    showToast(t("select_single_file") || "Select a single file to rename.");
    return;
  }
  const file = files[0];
  const folder = file.folder || window.currentFolder || "root";

  // Prefer inline rename in table view when we can resolve a row.
  try {
    if (window.viewMode === "table" && typeof startInlineRenameFromContext === "function") {
      const checked = getActiveSelectedFileCheckboxes();
      const row = checked.length ? checked[0].closest("tr") : null;
      if (row && startInlineRenameFromContext(file, row)) {
        return;
      }
    }
  } catch (err) { /* ignore */ }

  renameFile(file.name, folder);
}

export function handleShareSelected(e) {
  if (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  const files = getSelectedFileObjects();
  if (files.length !== 1) {
    showToast(t("select_single_file") || "Select one file to share.");
    return;
  }
  const fileObj = files[0];
  const folder = fileObj.folder || window.currentFolder || "root";

  import('./filePreview.js?v={{APP_QVER}}')
    .then(mod => mod.openShareModal(fileObj, folder))
    .catch(err => console.error("Failed to open share modal", err));
}

export async function handleToolbarMenuOpen(e) {
  if (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  const btn = e?.currentTarget || document.getElementById("toolbarMenuBtn");
  const rect = btn ? btn.getBoundingClientRect() : null;
  const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const y = rect ? rect.bottom + 6 : 60;
  const target = btn || document.getElementById("fileList") || document.body;

  try {
    const mod = await import('./fileMenu.js?v={{APP_QVER}}');
    const fakeEvent = {
      preventDefault() {},
      target,
      clientX: x,
      clientY: y
    };
    mod.fileListContextMenuHandler(fakeEvent);
  } catch (err) {
    console.error("Could not open toolbar menu", err);
  }
}

// Fallback: wire the overflow menu once DOM is ready in case initFileActions
// has not yet run when the button is rendered.
document.addEventListener("DOMContentLoaded", () => {
  const toolbarBtn = document.getElementById("toolbarMenuBtn");
  if (toolbarBtn) {
    toolbarBtn.addEventListener("click", handleToolbarMenuOpen);
  }
});

export function renameFile(oldName, folder) {
  window.fileToRename = oldName;
  window.fileFolder = folder || window.currentFolder || "root";
  document.getElementById("newFileName").value = oldName;
  document.getElementById("renameFileModal").style.display = "block";
  setTimeout(() => {
    const input = document.getElementById("newFileName");
    input.focus();
    const lastDot = oldName.lastIndexOf('.');
    if (lastDot > 0) {
      input.setSelectionRange(0, lastDot);
    } else {
      input.select();
    }
  }, 100);
}

document.addEventListener("DOMContentLoaded", () => {
  const cancelBtn = document.getElementById("cancelRenameFile");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", function () {
      document.getElementById("renameFileModal").style.display = "none";
      document.getElementById("newFileName").value = "";
    });
  }

  const submitBtn = document.getElementById("submitRenameFile");
  if (submitBtn) {
    submitBtn.setAttribute("data-default", "");
    submitBtn.addEventListener("click", function () {
      const newName = document.getElementById("newFileName").value.trim();
      if (!newName || newName === window.fileToRename) {
        document.getElementById("renameFileModal").style.display = "none";
        return;
      }
      const folderUsed = window.fileFolder;
      fetch("/api/file/renameFile.php", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": window.csrfToken
        },
        body: JSON.stringify({ folder: folderUsed, oldName: window.fileToRename, newName: newName })
      })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            showToast("File renamed successfully!");
            loadFileList(folderUsed);
          } else {
            showToast("Error renaming file: " + (data.error || "Unknown error"));
          }
        })
        .catch(error => {
          console.error("Error renaming file:", error);
          showToast("Error renaming file");
        })
        .finally(() => {
          document.getElementById("renameFileModal").style.display = "none";
          document.getElementById("newFileName").value = "";
        });
    });
  }
});

// Expose initFileActions so it can be called from fileManager.js
export function initFileActions() {
  portalFileModalsToBody();
  const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
  if (deleteSelectedBtn) {
    deleteSelectedBtn.replaceWith(deleteSelectedBtn.cloneNode(true));
    document.getElementById("deleteSelectedBtn").addEventListener("click", handleDeleteSelected);
  }
  const copySelectedBtn = document.getElementById("copySelectedBtn");
  if (copySelectedBtn) {
    copySelectedBtn.replaceWith(copySelectedBtn.cloneNode(true));
    document.getElementById("copySelectedBtn").addEventListener("click", handleCopySelected);
  }
  const moveSelectedBtn = document.getElementById("moveSelectedBtn");
  if (moveSelectedBtn) {
    moveSelectedBtn.replaceWith(moveSelectedBtn.cloneNode(true));
    document.getElementById("moveSelectedBtn").addEventListener("click", handleMoveSelected);
  }
  const downloadZipBtn = document.getElementById("downloadZipBtn");
  if (downloadZipBtn) {
    downloadZipBtn.replaceWith(downloadZipBtn.cloneNode(true));
    document.getElementById("downloadZipBtn").addEventListener("click", handleDownloadMultiSelected);
  }
  const extractZipBtn = document.getElementById("extractZipBtn");
  if (extractZipBtn) {
    extractZipBtn.replaceWith(extractZipBtn.cloneNode(true));
    document.getElementById("extractZipBtn").addEventListener("click", handleExtractZipSelected);
  }
  const renameSelectedBtn = document.getElementById("renameSelectedBtn");
  if (renameSelectedBtn) {
    renameSelectedBtn.replaceWith(renameSelectedBtn.cloneNode(true));
    document.getElementById("renameSelectedBtn").addEventListener("click", handleRenameSelected);
  }
  const shareSelectedBtn = document.getElementById("shareSelectedBtn");
  if (shareSelectedBtn) {
    shareSelectedBtn.replaceWith(shareSelectedBtn.cloneNode(true));
    document.getElementById("shareSelectedBtn").addEventListener("click", handleShareSelected);
  }
  const toolbarMenuBtn = document.getElementById("toolbarMenuBtn");
  if (toolbarMenuBtn) {
    toolbarMenuBtn.replaceWith(toolbarMenuBtn.cloneNode(true));
    document.getElementById("toolbarMenuBtn").addEventListener("click", handleToolbarMenuOpen);
  }
}


// Hook up the single‐file download modal buttons
document.addEventListener("DOMContentLoaded", () => {
  const cancelDownloadFileBtn = document.getElementById("cancelDownloadFile");
  if (cancelDownloadFileBtn) {
    cancelDownloadFileBtn.addEventListener("click", () => {
      document.getElementById("downloadFileModal").style.display = "none";
    });
  }

  const confirmSingleDownloadBtn = document.getElementById("confirmSingleDownloadButton");
  if (confirmSingleDownloadBtn) {
    confirmSingleDownloadBtn.addEventListener("click", confirmSingleDownload);
  }

  // Make Enter also confirm the download
  attachEnterKeyListener("downloadFileModal", "confirmSingleDownloadButton");
});

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('createBtn');
  const menu = document.getElementById('createMenu');
  const fileOpt = document.getElementById('createFileOption');
  const folderOpt = document.getElementById('createFolderOption');
  const uploadOpt = document.getElementById('uploadOption'); // NEW

  // Toggle dropdown on click
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
  });

  // Create File
  fileOpt.addEventListener('click', () => {
    menu.style.display = 'none';
    openCreateFileModal();  // your existing function
  });

  // Create Folder
  folderOpt.addEventListener('click', () => {
    menu.style.display = 'none';
    document.getElementById('createFolderModal').style.display = 'block';
    document.getElementById('newFolderName').focus();
  });

  // Close if you click anywhere else
  document.addEventListener('click', () => {
    menu.style.display = 'none';
  });
  if (uploadOpt) {
    uploadOpt.addEventListener('click', () => {
      if (menu) menu.style.display = 'none';
      openUploadModal();
    });
  }

  // Close buttons / backdrop
  const upModal = document.getElementById('uploadModal');
  const closeX  = document.getElementById('closeUploadModal');

  if (closeX) closeX.addEventListener('click', closeUploadModal);

  // click outside content to close
  if (upModal) {
    upModal.addEventListener('click', (e) => {
      if (e.target === upModal) closeUploadModal();
    });
  }

  // ESC to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && upModal && upModal.style.display === 'block') {
      closeUploadModal();
    }
  });
});

window.renameFile = renameFile;
