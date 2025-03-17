// fileManager.js

import {
  escapeHTML,
  debounce,
  buildSearchAndPaginationControls,
  buildFileTableHeader,
  buildFileTableRow,
  buildBottomControls,
  updateFileActionButtons,
  showToast,
  updateRowHighlight,
  toggleRowSelection,
  previewFile
} from './domUtils.js';

export let fileData = [];
export let sortOrder = { column: "uploaded", ascending: true };

window.itemsPerPage = window.itemsPerPage || 10;
window.currentPage = window.currentPage || 1;

// --- Define formatFolderName ---
// This helper formats folder names for display. Adjust as needed.
function formatFolderName(folder) {
  // Example: If folder is "root", return "(Root)"
  if (folder === "root") return "(Root)";
  // Replace underscores/dashes with spaces and capitalize each word.
  return folder
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}

// Expose DOM helper functions for inline handlers.
window.toggleRowSelection = toggleRowSelection;
window.updateRowHighlight = updateRowHighlight;
window.previewFile = previewFile;

export function loadFileList(folderParam) {
  const folder = folderParam || "root";
  const fileListContainer = document.getElementById("fileList");

  fileListContainer.style.visibility = "hidden";
  fileListContainer.innerHTML = "<div class='loader'>Loading files...</div>";

  return fetch("getFileList.php?folder=" + encodeURIComponent(folder) + "&recursive=1&t=" + new Date().getTime())
    .then(response => response.json())
    .then(data => {
      fileListContainer.innerHTML = "";
      if (data.files && data.files.length > 0) {
        data.files = data.files.map(file => {
          file.fullName = (file.path || file.name).trim().toLowerCase();
          file.editable = canEditFile(file.name);
          file.folder = folder;
          return file;
        });
        fileData = data.files;
        renderFileTable(folder);
      } else {
        fileListContainer.textContent = "No files found.";
        updateFileActionButtons();
      }
      return data.files || [];
    })
    .catch(error => {
      console.error("Error loading file list:", error);
      fileListContainer.textContent = "Error loading files.";
      return [];
    })
    .finally(() => {
      fileListContainer.style.visibility = "visible";
    });
}

export function renderFileTable(folder) {
  const fileListContainer = document.getElementById("fileList");
  const searchTerm = window.currentSearchTerm || "";
  const itemsPerPageSetting = parseInt(localStorage.getItem('itemsPerPage') || '10', 10);
  let currentPage = window.currentPage || 1;

  const filteredFiles = fileData.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalFiles = filteredFiles.length;
  const totalPages = Math.ceil(totalFiles / itemsPerPageSetting);

  if (currentPage > totalPages) {
    currentPage = totalPages > 0 ? totalPages : 1;
    window.currentPage = currentPage;
  }

  const folderPath = (folder === "root")
    ? "uploads/"
    : "uploads/" + folder.split("/").map(encodeURIComponent).join("/") + "/";

  const topControlsHTML = buildSearchAndPaginationControls({
    currentPage,
    totalPages,
    searchTerm
  });

  const headerHTML = buildFileTableHeader(sortOrder);

  const startIndex = (currentPage - 1) * itemsPerPageSetting;
  const endIndex = Math.min(startIndex + itemsPerPageSetting, totalFiles);

  let rowsHTML = "<tbody>";
  if (totalFiles > 0) {
    filteredFiles.slice(startIndex, endIndex).forEach(file => {
      rowsHTML += buildFileTableRow(file, folderPath);
    });
  } else {
    rowsHTML += `<tr><td colspan="7">No files found.</td></tr>`;
  }
  rowsHTML += "</tbody></table>";

  const bottomControlsHTML = buildBottomControls(itemsPerPageSetting);

  fileListContainer.innerHTML = topControlsHTML + headerHTML + rowsHTML + bottomControlsHTML;

  const newSearchInput = document.getElementById("searchInput");
  if (newSearchInput) {
    newSearchInput.addEventListener("input", debounce(function () {
      window.currentSearchTerm = newSearchInput.value;
      window.currentPage = 1;
      renderFileTable(folder);
      setTimeout(() => {
        newSearchInput.focus();
        newSearchInput.setSelectionRange(newSearchInput.value.length, newSearchInput.value.length);
      }, 0);
    }, 300));
  }

  document.querySelectorAll("table.table thead th[data-column]").forEach(cell => {
    cell.addEventListener("click", function () {
      const column = this.getAttribute("data-column");
      sortFiles(column, folder);
    });
  });

  document.querySelectorAll('#fileList .file-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', function (e) {
      updateRowHighlight(e.target);
      updateFileActionButtons();
    });
  });

  updateFileActionButtons();
}

export function sortFiles(column, folder) {
  if (sortOrder.column === column) {
    sortOrder.ascending = !sortOrder.ascending;
  } else {
    sortOrder.column = column;
    sortOrder.ascending = true;
  }
  fileData.sort((a, b) => {
    let valA = a[column] || "";
    let valB = b[column] || "";
    if (column === "modified" || column === "uploaded") {
      const parsedA = parseCustomDate(valA);
      const parsedB = parseCustomDate(valB);
      valA = parsedA;
      valB = parsedB;
    } else if (typeof valA === "string") {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }
    if (valA < valB) return sortOrder.ascending ? -1 : 1;
    if (valA > valB) return sortOrder.ascending ? 1 : -1;
    return 0;
  });
  renderFileTable(folder);
}

function parseCustomDate(dateStr) {
  dateStr = dateStr.replace(/\s+/g, " ").trim();
  const parts = dateStr.split(" ");
  if (parts.length !== 2) {
    return new Date(dateStr).getTime();
  }
  const datePart = parts[0];
  const timePart = parts[1];
  const dateComponents = datePart.split("/");
  if (dateComponents.length !== 3) {
    return new Date(dateStr).getTime();
  }
  let month = parseInt(dateComponents[0], 10);
  let day = parseInt(dateComponents[1], 10);
  let year = parseInt(dateComponents[2], 10);
  if (year < 100) {
    year += 2000;
  }
  const timeRegex = /^(\d{1,2}):(\d{2})(AM|PM)$/i;
  const match = timePart.match(timeRegex);
  if (!match) {
    return new Date(dateStr).getTime();
  }
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === "PM" && hour !== 12) {
    hour += 12;
  }
  if (period === "AM" && hour === 12) {
    hour = 0;
  }
  return new Date(year, month - 1, day, hour, minute).getTime();
}

export function canEditFile(fileName) {
  const allowedExtensions = [
    "txt", "html", "htm", "css", "js", "json", "xml",
    "md", "py", "ini", "csv", "log", "conf", "config", "bat",
    "rtf", "doc", "docx"
  ];
  const ext = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
  return allowedExtensions.includes(ext);
}

export function handleDeleteSelected(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  const checkboxes = document.querySelectorAll(".file-checkbox:checked");
  if (checkboxes.length === 0) {
    showToast("No files selected.");
    return;
  }
  window.filesToDelete = Array.from(checkboxes).map(chk => chk.value);
  document.getElementById("deleteFilesMessage").textContent =
    "Are you sure you want to delete " + window.filesToDelete.length + " selected file(s)?";
  document.getElementById("deleteFilesModal").style.display = "block";
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
      fetch("deleteFiles.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
}

document.addEventListener("DOMContentLoaded", function () {
  const cancelDownloadZip = document.getElementById("cancelDownloadZip");
  if (cancelDownloadZip) {
    cancelDownloadZip.addEventListener("click", function () {
      document.getElementById("downloadZipModal").style.display = "none";
    });
  }
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
      document.getElementById("downloadZipModal").style.display = "none";
      const folder = window.currentFolder || "root";
      fetch("downloadZip.php", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
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
          showToast("Download started.");
        })
        .catch(error => {
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
  try {
    const response = await fetch('getFolderList.php');
    const folders = await response.json();
    console.log('Folders fetched for modal:', folders);
    const folderSelect = document.getElementById(dropdownId);
    folderSelect.innerHTML = '';
    const rootOption = document.createElement('option');
    rootOption.value = 'root';
    rootOption.textContent = '(Root)';
    folderSelect.appendChild(rootOption);
    if (Array.isArray(folders) && folders.length > 0) {
      folders.forEach(folder => {
        const option = document.createElement('option');
        option.value = folder;
        option.textContent = formatFolderName(folder);
        folderSelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Error loading folder list for modal:', error);
  }
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
        showToast("Please select a target folder for copying.!", 5000);
        return;
      }
      if (targetFolder === window.currentFolder) {
        showToast("Error: Cannot move files to the same folder.");
        return;
      }
      fetch("copyFiles.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: window.currentFolder, files: window.filesToCopy, destination: targetFolder })
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
      fetch("moveFiles.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: window.currentFolder, files: window.filesToMove, destination: targetFolder })
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

// Helper for CodeMirror editor mode based on file extension.
function getModeForFile(fileName) {
  const ext = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
  switch (ext) {
    case 'css':
      return "css";
    case 'json':
      return { name: "javascript", json: true };
    case 'js':
      return "javascript";
    case 'html':
    case 'htm':
      return "text/html";
    case 'xml':
      return "xml";
    default:
      return "text/plain";
  }
}

function adjustEditorSize() {
  const modal = document.querySelector(".editor-modal");
  if (modal && window.currentEditor) {
    const modalHeight = modal.getBoundingClientRect().height || 600;
    const newEditorHeight = Math.max(modalHeight * 0.80, 5) + "px";
    console.log("Adjusting editor height to:", newEditorHeight);
    window.currentEditor.setSize("100%", newEditorHeight);
  }
}

function observeModalResize(modal) {
  if (!modal) return;
  const resizeObserver = new ResizeObserver(() => {
    adjustEditorSize();
  });
  resizeObserver.observe(modal);
}

export function editFile(fileName, folder) {
  console.log("Edit button clicked for:", fileName);
  let existingEditor = document.getElementById("editorContainer");
  if (existingEditor) {
    existingEditor.remove();
  }
  const folderUsed = folder || window.currentFolder || "root";
  const folderPath = (folderUsed === "root")
    ? "uploads/"
    : "uploads/" + folderUsed.split("/").map(encodeURIComponent).join("/") + "/";
  const fileUrl = folderPath + encodeURIComponent(fileName) + "?t=" + new Date().getTime();

  fetch(fileUrl, { method: "HEAD" })
    .then(response => {
      const contentLength = response.headers.get("Content-Length");
      console.log("Content-Length:", contentLength);
      if (!contentLength || parseInt(contentLength) > 10485760) {
        showToast("This file is larger than 10 MB and cannot be edited in the browser.");
        throw new Error("File too large.");
      }
      return fetch(fileUrl);
    })
    .then(response => {
      if (!response.ok) {
        throw new Error("HTTP error! Status: " + response.status);
      }
      return response.text();
    })
    .then(content => {
      const modal = document.createElement("div");
      modal.id = "editorContainer";
      modal.classList.add("modal", "editor-modal");
      modal.innerHTML = `
      <div class="editor-header">
        <h3 class="editor-title">Editing: ${fileName}</h3>
        <button id="closeEditorX" class="editor-close-btn">&times;</button>
      </div>
      <div id="editorControls" class="editor-controls">
         <button id="decreaseFont" class="btn btn-sm btn-secondary">A-</button>
         <button id="increaseFont" class="btn btn-sm btn-secondary">A+</button>
      </div>
      <textarea id="fileEditor" class="editor-textarea">${content}</textarea>
      <div class="editor-footer">
        <button id="saveBtn" class="btn btn-primary">Save</button>
        <button id="closeBtn" class="btn btn-secondary">Close</button>
      </div>
    `;
      document.body.appendChild(modal);
      modal.style.display = "block";

      const mode = getModeForFile(fileName);
      const isDarkMode = document.body.classList.contains("dark-mode");
      const theme = isDarkMode ? "material-darker" : "default";

      const editor = CodeMirror.fromTextArea(document.getElementById("fileEditor"), {
        lineNumbers: true,
        mode: mode,
        theme: theme,
        viewportMargin: Infinity
      });

      window.currentEditor = editor;

      setTimeout(() => {
        adjustEditorSize();
      }, 50);

      observeModalResize(modal);

      let currentFontSize = 14;
      editor.getWrapperElement().style.fontSize = currentFontSize + "px";
      editor.refresh();

      document.getElementById("closeEditorX").addEventListener("click", function () {
        modal.remove();
      });

      document.getElementById("decreaseFont").addEventListener("click", function () {
        currentFontSize = Math.max(8, currentFontSize - 2);
        editor.getWrapperElement().style.fontSize = currentFontSize + "px";
        editor.refresh();
      });

      document.getElementById("increaseFont").addEventListener("click", function () {
        currentFontSize = Math.min(32, currentFontSize + 2);
        editor.getWrapperElement().style.fontSize = currentFontSize + "px";
        editor.refresh();
      });

      document.getElementById("saveBtn").addEventListener("click", function () {
        saveFile(fileName, folderUsed);
      });

      document.getElementById("closeBtn").addEventListener("click", function () {
        modal.remove();
      });

      function updateEditorTheme() {
        const isDarkMode = document.body.classList.contains("dark-mode");
        editor.setOption("theme", isDarkMode ? "material-darker" : "default");
      }

      document.getElementById("darkModeToggle").addEventListener("click", updateEditorTheme);
    })
    .catch(error => console.error("Error loading file:", error));
}

export function saveFile(fileName, folder) {
  const editor = window.currentEditor;
  if (!editor) {
    console.error("Editor not found!");
    return;
  }
  const folderUsed = folder || window.currentFolder || "root";
  const fileDataObj = {
    fileName: fileName,
    content: editor.getValue(),
    folder: folderUsed
  };
  fetch("saveFile.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fileDataObj)
  })
    .then(response => response.json())
    .then(result => {
      showToast(result.success || result.error);
      document.getElementById("editorContainer")?.remove();
      loadFileList(folderUsed);
    })
    .catch(error => console.error("Error saving file:", error));
}

export function displayFilePreview(file, container) {
  container.style.display = "inline-block";
  if (file.type.startsWith("image/")) {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.classList.add("file-preview-img");
    container.appendChild(img);
  } else {
    const iconSpan = document.createElement("span");
    iconSpan.classList.add("material-icons", "file-icon");
    iconSpan.textContent = "insert_drive_file";
    container.appendChild(iconSpan);
  }
}

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
}

export function renameFile(oldName, folder) {
  window.fileToRename = oldName;
  window.fileFolder = folder || window.currentFolder || "root";
  document.getElementById("newFileName").value = oldName;
  document.getElementById("renameFileModal").style.display = "block";
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
      fetch("renameFile.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

window.renameFile = renameFile;

window.changePage = function (newPage) {
  window.currentPage = newPage;
  renderFileTable(window.currentFolder);
};

window.changeItemsPerPage = function (newCount) {
  window.itemsPerPage = parseInt(newCount);
  window.currentPage = 1;
  renderFileTable(window.currentFolder);
};