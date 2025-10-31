// fileActions.js
import { showToast, attachEnterKeyListener } from './domUtils.js?v={{APP_QVER}}';
import { loadFileList } from './fileListView.js?v={{APP_QVER}}';
import { formatFolderName } from './fileListView.js?v={{APP_QVER}}';
import { t } from './i18n.js?v={{APP_QVER}}';

export function handleDeleteSelected(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  const checkboxes = document.querySelectorAll(".file-checkbox:checked");
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
            loadFileList(window.currentFolder);
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

attachEnterKeyListener("downloadZipModal", "confirmDownloadZip");
export function handleDownloadZipSelected(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  const checkboxes = document.querySelectorAll(".file-checkbox:checked");
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
        'Content-Type':'application/json',
        'X-CSRF-Token': window.csrfToken
      },
      // ⚠️ must send `name`, not `filename`
      body: JSON.stringify({ folder, name })
    });
    const js = await res.json();
    if (!js.success) throw new Error(js.error);
    showToast(t('file_created'));
    loadFileList(folder);
  } catch (err) {
    showToast(err.message || t('error_creating_file'));
  } finally {
    document.getElementById('createFileModal').style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const cancel = document.getElementById('cancelCreateFile');
  const confirm = document.getElementById('confirmCreateFile');
  if (cancel)  cancel.addEventListener('click', () => document.getElementById('createFileModal').style.display = 'none');
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
  const downloadURL = "/api/file/download.php"
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
  const checkboxes = document.querySelectorAll(".file-checkbox:checked");
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
      } catch (err) {
        console.error(err);
        showToast(err.message || t('error_creating_file'));
      }
    });
    attachEnterKeyListener('createFileModal','confirmCreateFile');
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
      if (!zipName) {
        showToast("Please enter a name for the zip file.");
        return;
      }
      if (!zipName.toLowerCase().endsWith(".zip")) {
        zipName += ".zip";
      }

      // b) Hide the name‐input modal, show the spinner modal
      zipNameModal.style.display = "none";
      progressModal.style.display = "block";

      // c) (Optional) update the “Preparing…” text if you gave it an ID
      const titleEl = document.getElementById("downloadProgressTitle");
      if (titleEl) titleEl.textContent = `Preparing ${zipName}…`;

      try {
        // d) POST and await the ZIP blob
        const res = await fetch("/api/file/downloadZip.php", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": window.csrfToken
          },
          body: JSON.stringify({
            folder: window.currentFolder || "root",
            files: window.filesToDownload
          })
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || `Status ${res.status}`);
        }

        const blob = await res.blob();
        if (!blob || blob.size === 0) {
          throw new Error("Received empty ZIP file.");
        }

        // e) Hand off to the browser’s download manager
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = zipName;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        a.remove();

      } catch (err) {
        console.error("Error downloading ZIP:", err);
        showToast("Error: " + err.message);
      } finally {
        // f) Always hide spinner modal
        progressModal.style.display = "none";
      }
    });
  }
});

export function handleCopySelected(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  const checkboxes = document.querySelectorAll(".file-checkbox:checked");
  if (checkboxes.length === 0) {
    showToast("No files selected for copying.", 5000);
    return;
  }
  window.filesToCopy = Array.from(checkboxes).map(chk => chk.value);
  document.getElementById("copyFilesModal").style.display = "block";
  loadCopyMoveFolderListForModal("copyTargetFolder");
}

export async function loadCopyMoveFolderListForModal(dropdownId) {
  const folderSelect = document.getElementById(dropdownId);
  folderSelect.innerHTML = "";

  if (window.userFolderOnly) {
    const username = localStorage.getItem("username") || "root";
    try {
      const response = await fetch("/api/folder/getFolderList.php?restricted=1");
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
    } catch (error) {
      console.error("Error loading folder list for modal:", error);
    }
    return;
  }

  try {
    const response = await fetch("/api/folder/getFolderList.php");
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
  } catch (error) {
    console.error("Error loading folder list for modal:", error);
  }
}

export function handleMoveSelected(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  const checkboxes = document.querySelectorAll(".file-checkbox:checked");
  if (checkboxes.length === 0) {
    showToast("No files selected for moving.");
    return;
  }
  window.filesToMove = Array.from(checkboxes).map(chk => chk.value);
  document.getElementById("moveFilesModal").style.display = "block";
  loadCopyMoveFolderListForModal("moveTargetFolder");
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
    document.getElementById("downloadZipBtn").addEventListener("click", handleDownloadZipSelected);
  }
  const extractZipBtn = document.getElementById("extractZipBtn");
  if (extractZipBtn) {
    extractZipBtn.replaceWith(extractZipBtn.cloneNode(true));
    document.getElementById("extractZipBtn").addEventListener("click", handleExtractZipSelected);
  }
  const createBtn = document.getElementById('createFileBtn');
  if (createBtn) {
    createBtn.replaceWith(createBtn.cloneNode(true));
    document.getElementById('createFileBtn').addEventListener('click', openCreateFileModal);
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
  const btn      = document.getElementById('createBtn');
  const menu     = document.getElementById('createMenu');
  const fileOpt  = document.getElementById('createFileOption');
  const folderOpt= document.getElementById('createFolderOption');

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
});

window.renameFile = renameFile;