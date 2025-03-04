// displayFileList.js

import { sendRequest, toggleVisibility } from './utils.js';

let fileData = [];
let sortOrder = { column: "uploaded", ascending: false };
export let currentFolder = "root"; // Global current folder

export function loadFileList() {
  sendRequest("checkAuth.php")
    .then(authData => {
      if (!authData.authenticated) {
        console.warn("User not authenticated, hiding file list.");
        toggleVisibility("fileListContainer", false);
        return;
      }
      toggleVisibility("fileListContainer", true);
      return sendRequest("getFileList.php?folder=" + encodeURIComponent(currentFolder));
    })
    .then(data => {
      if (!data) return;
      if (data.error) {
        document.getElementById("fileList").innerHTML = `<p style="color:red;">Error: ${data.error}</p>`;
        return;
      }
      if (!Array.isArray(data.files)) {
        console.error("Unexpected response format:", data);
        return;
      }
      fileData = data.files;
      //sortFiles("uploaded", false);
    })
    .catch(error => console.error("Error loading file list:", error));
}

export function toggleDeleteButton() {
  const selectedFiles = document.querySelectorAll(".file-checkbox:checked");
  const deleteBtn = document.getElementById("deleteSelectedBtn");
  const copyBtn = document.getElementById("copySelectedBtn");
  const moveBtn = document.getElementById("moveSelectedBtn");
  const disabled = selectedFiles.length === 0;
  deleteBtn.disabled = disabled;
  if (copyBtn) copyBtn.disabled = disabled;
  if (moveBtn) moveBtn.disabled = disabled;
}

export function toggleAllCheckboxes(source) {
  const checkboxes = document.querySelectorAll(".file-checkbox");
  checkboxes.forEach(checkbox => checkbox.checked = source.checked);
  toggleDeleteButton();
}

export function deleteSelectedFiles() {
  const selectedFiles = Array.from(document.querySelectorAll(".file-checkbox:checked"))
    .map(checkbox => checkbox.value);
  if (selectedFiles.length === 0) {
    alert("No files selected for deletion.");
    return;
  }
  if (!confirm("Are you sure you want to delete the selected files?")) {
    return;
  }
  sendRequest("deleteFiles.php", "POST", { files: selectedFiles })
    .then(result => {
      alert(result.success || result.error);
      loadFileList();
    })
    .catch(error => console.error("Error deleting files:", error));
}

document.addEventListener("DOMContentLoaded", function () {
  loadFileList();
  loadCopyMoveFolderList();

  const deleteBtn = document.getElementById("deleteSelectedBtn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", deleteSelectedFiles);
  }

  const copyBtn = document.getElementById("copySelectedBtn");
  const moveBtn = document.getElementById("moveSelectedBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", copySelectedFiles);
  }
  if (moveBtn) {
    moveBtn.addEventListener("click", moveSelectedFiles);
  }
});


// ===== NEW CODE: Copy & Move Functions =====

// Copy selected files to a target folder
export function copySelectedFiles() {
  const selectedFiles = Array.from(document.querySelectorAll(".file-checkbox:checked"))
    .map(checkbox => checkbox.value);
  const targetFolder = document.getElementById("copyMoveFolderSelect").value;
  if (selectedFiles.length === 0) {
    alert("Please select at least one file to copy.");
    return;
  }
  if (!targetFolder) {
    alert("Please select a target folder.");
    return;
  }
  if (currentFolder === targetFolder) {
    alert("Cannot copy files to the same folder.");
    return;
  }
  // Send the correct keys
  sendRequest("copyFiles.php", "POST", {
    source: currentFolder,
    destination: targetFolder,
    files: selectedFiles
  })
    .then(result => {
      alert(result.success || result.error);
      loadFileList();
    })
    .catch(error => console.error("Error copying files:", error));
}

export function moveSelectedFiles() {
  const selectedFiles = Array.from(document.querySelectorAll(".file-checkbox:checked"))
    .map(checkbox => checkbox.value);
  const targetFolder = document.getElementById("copyMoveFolderSelect").value;
  if (selectedFiles.length === 0) {
    alert("Please select at least one file to move.");
    return;
  }
  if (!targetFolder) {
    alert("Please select a target folder.");
    return;
  }
  if (currentFolder === targetFolder) {
    alert("Cannot move files to the same folder.");
    return;
  }
  console.log("Payload:", {
    source: currentFolder,
    destination: targetFolder,
    files: selectedFiles
  });
  sendRequest("moveFiles.php", "POST", {
    source: currentFolder,
    destination: targetFolder,
    files: selectedFiles
  })
    .then(result => {
      alert(result.success || result.error);
      loadFileList();
    })
    .catch(error => console.error("Error moving files:", error));
}


// Populate the Copy/Move folder dropdown
export function loadCopyMoveFolderList() {
  $.get('getFolderList.php', function (response) {
    const folderSelect = $('#copyMoveFolderSelect');
    folderSelect.empty();
    // Always add a "Root" option as the default.
    folderSelect.append($('<option>', { value: "root", text: "(Root)" }));
    if (Array.isArray(response) && response.length > 0) {
      response.forEach(function (folder) {
        folderSelect.append($('<option>', {
          value: folder,
          text: folder
        }));
      });
    }
  }, 'json');
}

// Attach functions to window for inline onclick support
window.toggleDeleteButton = toggleDeleteButton;
window.toggleAllCheckboxes = toggleAllCheckboxes;
window.deleteSelectedFiles = deleteSelectedFiles;
window.loadFileList = loadFileList;
window.copySelectedFiles = copySelectedFiles;
window.moveSelectedFiles = moveSelectedFiles;
