// fileActions.js
import { showToast, attachEnterKeyListener } from './domUtils.js';
import { loadFileList } from './fileListView.js';
import { formatFolderName } from './fileListView.js';
import { t } from './i18n.js';

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
    confirmDelete.addEventListener("click", function () {
      fetch("api/file/deleteFiles.php", {
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
  // Get the file name from the modal. Users can change it if desired.
  let fileName = document.getElementById("downloadFileNameInput").value.trim();
  if (!fileName) {
    showToast("Please enter a name for the file.");
    return;
  }
  
  // Hide the download modal.
  document.getElementById("downloadFileModal").style.display = "none";
  // Show the progress modal (same as in your ZIP download flow).
  document.getElementById("downloadProgressModal").style.display = "block";
  
  // Build the URL for download.php using GET parameters.
  const folder = window.currentFolder || "root";
  const downloadURL = "/api/file/download.php?folder=" + encodeURIComponent(folder) +
                      "&file=" + encodeURIComponent(window.singleFileToDownload);
  
  fetch(downloadURL, {
    method: "GET",
    credentials: "include"
  })
    .then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          throw new Error("Failed to download file: " + text);
        });
      }
      return response.blob();
    })
    .then(blob => {
      if (!blob || blob.size === 0) {
        throw new Error("Received empty file.");
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      // Hide the progress modal.
      document.getElementById("downloadProgressModal").style.display = "none";
      showToast("Download started.");
    })
    .catch(error => {
      // Hide progress modal and show error.
      document.getElementById("downloadProgressModal").style.display = "none";
      console.error("Error downloading file:", error);
      showToast("Error downloading file: " + error.message);
    });
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
  
  // Change progress modal text to "Extracting files..."
  const progressText = document.querySelector("#downloadProgressModal p");
  if (progressText) {
    progressText.textContent = "Extracting files...";
  }
  
  // Show the progress modal.
  document.getElementById("downloadProgressModal").style.display = "block";
  
  fetch("api/file/extractZip.php", {
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
      // Hide the progress modal once the request has completed.
      document.getElementById("downloadProgressModal").style.display = "none";
      if (data.success) {
        let toastMessage = "Zip file(s) extracted successfully!";
        if (data.extractedFiles && Array.isArray(data.extractedFiles) && data.extractedFiles.length) {
          toastMessage = "Extracted: " + data.extractedFiles.join(", ");
        }
        showToast(toastMessage);
        loadFileList(window.currentFolder);
      } else {
        showToast("Error extracting zip: " + (data.error || "Unknown error"));
      }
    })
    .catch(error => {
      // Hide the progress modal on error.
      document.getElementById("downloadProgressModal").style.display = "none";
      console.error("Error extracting zip files:", error);
      showToast("Error extracting zip files.");
    });
}

const extractZipBtn = document.getElementById("extractZipBtn");
if (extractZipBtn) {
  extractZipBtn.replaceWith(extractZipBtn.cloneNode(true));
  document.getElementById("extractZipBtn").addEventListener("click", handleExtractZipSelected);
}

document.addEventListener("DOMContentLoaded", function () {
  const cancelDownloadZip = document.getElementById("cancelDownloadZip");
  if (cancelDownloadZip) {
    cancelDownloadZip.addEventListener("click", function () {
      document.getElementById("downloadZipModal").style.display = "none";
    });
  }

  // This part remains in your confirmDownloadZip event handler:
  const confirmDownloadZip = document.getElementById("confirmDownloadZip");
  if (confirmDownloadZip) {
    confirmDownloadZip.addEventListener("click", function () {
      let zipName = document.getElementById("zipFileNameInput").value.trim();
      if (!zipName) {
        showToast("Please enter a name for the zip file.");
        return;
      }
      if (!zipName.toLowerCase().endsWith(".zip")) {
        zipName += ".zip";
      }
      // Hide the ZIP name input modal
      document.getElementById("downloadZipModal").style.display = "none";
      // Show the progress modal here only on confirm
      console.log("Download confirmed. Showing progress modal.");
      document.getElementById("downloadProgressModal").style.display = "block";
      const folder = window.currentFolder || "root";
      fetch("api/file/downloadZip.php", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": window.csrfToken
        },
        body: JSON.stringify({ folder: folder, files: window.filesToDownload })
      })
        .then(response => {
          if (!response.ok) {
            return response.text().then(text => {
              throw new Error("Failed to create zip file: " + text);
            });
          }
          return response.blob();
        })
        .then(blob => {
          if (!blob || blob.size === 0) {
            throw new Error("Received empty zip file.");
          }
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.style.display = "none";
          a.href = url;
          a.download = zipName;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          a.remove();
          // Hide the progress modal after download starts
          document.getElementById("downloadProgressModal").style.display = "none";
          showToast("Download started.");
        })
        .catch(error => {
          // Hide the progress modal on error
          document.getElementById("downloadProgressModal").style.display = "none";
          console.error("Error downloading zip:", error);
          showToast("Error downloading selected files as zip: " + error.message);
        });
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
      const response = await fetch("api/folder/getFolderList.php?restricted=1");
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
    const response = await fetch("api/folder/getFolderList.php");
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
      fetch("api/file/copyFiles.php", {
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
      fetch("api/file/moveFiles.php", {
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
    submitBtn.addEventListener("click", function () {
      const newName = document.getElementById("newFileName").value.trim();
      if (!newName || newName === window.fileToRename) {
        document.getElementById("renameFileModal").style.display = "none";
        return;
      }
      const folderUsed = window.fileFolder;
      fetch("api/file/renameFile.php", {
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
}

window.renameFile = renameFile;