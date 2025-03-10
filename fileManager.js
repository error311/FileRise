// fileManager.js
import { escapeHTML, updateFileActionButtons, showToast } from './domUtils.js';
import { formatFolderName } from './folderManager.js';

export let fileData = [];
export let sortOrder = { column: "uploaded", ascending: true };

// Global pagination defaults
window.itemsPerPage = window.itemsPerPage || 10;
window.currentPage = window.currentPage || 1;

// -------------------------------
// Helper Functions
// -------------------------------

// Parse date strings in "m/d/y h:iA" format into a timestamp.
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

// Determines if a file is editable based on its extension.
export function canEditFile(fileName) {
  const allowedExtensions = [
    "txt", "html", "htm", "php", "css", "js", "json", "xml",
    "md", "py", "ini", "csv", "log", "conf", "config", "bat",
    "rtf", "doc", "docx"
  ];
  const ext = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
  return allowedExtensions.includes(ext);
}

// -------------------------------
// Global Functions (attached to window)
// -------------------------------

window.toggleRowSelection = function (event, fileName) {
  const targetTag = event.target.tagName.toLowerCase();
  if (targetTag === 'a' || targetTag === 'button' || targetTag === 'input') {
    return;
  }
  const row = event.currentTarget;
  const checkbox = row.querySelector('.file-checkbox');
  if (!checkbox) return;
  checkbox.checked = !checkbox.checked;
  window.updateRowHighlight(checkbox);
  updateFileActionButtons();
};

window.updateRowHighlight = function (checkbox) {
  const row = checkbox.closest('tr');
  if (!row) return;
  if (checkbox.checked) {
    row.classList.add('row-selected');
  } else {
    row.classList.remove('row-selected');
  }
};

// -------------------------------
// File List Rendering
// -------------------------------

export function loadFileList(folderParam) {
  const folder = folderParam || "root";
  return fetch("getFileList.php?folder=" + encodeURIComponent(folder) + "&t=" + new Date().getTime())
    .then(response => response.json())
    .then(data => {
      const fileListContainer = document.getElementById("fileList");
      fileListContainer.innerHTML = "";
      if (data.files && data.files.length > 0) {
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
      return [];
    });
}

export function renderFileTable(folder) {
  const fileListContainer = document.getElementById("fileList");
  const folderPath = (folder === "root")
    ? "uploads/"
    : "uploads/" + folder.split("/").map(encodeURIComponent).join("/") + "/";
  let searchInputElement = document.getElementById("searchInput");
  const searchHadFocus = searchInputElement && (document.activeElement === searchInputElement);
  let searchTerm = searchInputElement ? searchInputElement.value : "";
  const filteredFiles = fileData.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const itemsPerPage = window.itemsPerPage || 10;
  const currentPage = window.currentPage || 1;
  const totalFiles = filteredFiles.length;
  const totalPages = Math.ceil(totalFiles / itemsPerPage);
  const safeSearchTerm = escapeHTML(searchTerm);

  const topControlsHTML = `
  <div class="row align-items-center mb-3">
    <div class="col-12 col-md-8 mb-2 mb-md-0">
      <div class="input-group" style="max-width: 100%;">
        <div class="input-group-prepend">
          <span class="input-group-text" id="searchIcon">
            <i class="material-icons">search</i>
          </span>
        </div>
        <input type="text" id="searchInput" class="form-control" placeholder="Search files..." value="${safeSearchTerm}" aria-describedby="searchIcon">
      </div>
    </div>
    <div class="col-12 col-md-4 text-left">
      <div class="d-flex justify-content-center justify-content-md-start align-items-center">
        <button class="custom-prev-next-btn" ${currentPage === 1 ? "disabled" : ""} onclick="changePage(${currentPage - 1})">Prev</button>
        <span style="margin: 0 8px; white-space: nowrap;">Page ${currentPage} of ${totalPages || 1}</span>
        <button class="custom-prev-next-btn" ${currentPage === totalPages || totalFiles === 0 ? "disabled" : ""} onclick="changePage(${currentPage + 1})">Next</button>
      </div>
    </div>
  </div>
  `;

  let tableHTML = `
    <table class="table">
      <thead>
        <tr>
          <th style="width: 40px;"><input type="checkbox" id="selectAll" onclick="toggleAllCheckboxes(this)"></th>
          <th data-column="name" style="cursor:pointer; white-space: nowrap;">File Name ${sortOrder.column === "name" ? (sortOrder.ascending ? "▲" : "▼") : ""}</th>
          <th data-column="modified" class="hide-small" style="cursor:pointer; white-space: nowrap;">Date Modified ${sortOrder.column === "modified" ? (sortOrder.ascending ? "▲" : "▼") : ""}</th>
          <th data-column="uploaded" class="hide-small hide-medium" style="cursor:pointer; white-space: nowrap;">Upload Date ${sortOrder.column === "uploaded" ? (sortOrder.ascending ? "▲" : "▼") : ""}</th>
          <th data-column="size" class="hide-small" style="cursor:pointer; white-space: nowrap;">File Size ${sortOrder.column === "size" ? (sortOrder.ascending ? "▲" : "▼") : ""}</th>
          <th data-column="uploader" class="hide-small hide-medium" style="cursor:pointer; white-space: nowrap;">Uploader ${sortOrder.column === "uploader" ? (sortOrder.ascending ? "▲" : "▼") : ""}</th>
          <th>Actions</th>
        </tr>
      </thead>
  `;

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalFiles);
  let tableBody = `<tbody>`;

  if (totalFiles > 0) {
    filteredFiles.slice(startIndex, endIndex).forEach(file => {
      const isEditable = canEditFile(file.name);
      const safeFileName = escapeHTML(file.name);
      const safeModified = escapeHTML(file.modified);
      const safeUploaded = escapeHTML(file.uploaded);
      const safeSize = escapeHTML(file.size);
      const safeUploader = escapeHTML(file.uploader || "Unknown");

      // Check if the file is an image using a regex
      const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file.name);

      // Build the preview button HTML string using the file's properties directly.
      const previewButton = isImage
        ? `<button class="btn btn-sm btn-info ml-2" onclick="previewImage('${folderPath + encodeURIComponent(file.name)}', '${safeFileName}')">
               <i class="material-icons">image</i>
             </button>`
        : "";

      tableBody += `
          <tr onclick="toggleRowSelection(event, '${safeFileName}')" style="cursor:pointer;">
            <td>
              <input type="checkbox" class="file-checkbox" value="${safeFileName}" onclick="event.stopPropagation(); updateRowHighlight(this);">
            </td>
            <td>${safeFileName}</td>
            <td class="hide-small" style="white-space: nowrap;">${safeModified}</td>
            <td class="hide-small hide-medium" style="white-space: nowrap;">${safeUploaded}</td>
            <td class="hide-small" style="white-space: nowrap;">${safeSize}</td>
            <td class="hide-small hide-medium" style="white-space: nowrap;">${safeUploader}</td>
            <td>
              <div class="button-wrap">
                <a class="btn btn-sm btn-success" href="${folderPath + encodeURIComponent(file.name)}" download>Download</a>
                ${isEditable ? `<button class="btn btn-sm btn-primary ml-2" onclick='editFile(${JSON.stringify(file.name)}, ${JSON.stringify(folder)})'>Edit</button>` : ""}
                <button class="btn btn-sm btn-warning ml-2" onclick='renameFile(${JSON.stringify(file.name)}, ${JSON.stringify(folder)})'>Rename</button>
                ${previewButton}
              </div>
            </td>
          </tr>
        `;
    });
  } else {
    tableBody += `<tr><td colspan="7">No files found.</td></tr>`;
  }
  tableBody += `</tbody></table>`;

  const bottomControlsHTML = `
    <div class="d-flex align-items-center mt-3" style="font-size:16px; line-height:1.5;">
      <label class="mr-2 mb-0" style="font-size:16px; line-height:1.5;">Show</label>
      <select class="form-control" style="width:auto; font-size:16px; height:auto;" onchange="changeItemsPerPage(this.value)">
        ${[10, 20, 50, 100].map(num => `<option value="${num}" ${num === itemsPerPage ? "selected" : ""}>${num}</option>`).join("")}
      </select>
      <span class="ml-2 mb-0" style="font-size:16px; line-height:1.5;">items per page</span>
    </div>
  `;

  fileListContainer.innerHTML = topControlsHTML + tableHTML + tableBody + bottomControlsHTML;

  const newSearchInput = document.getElementById("searchInput");
  if (searchHadFocus && newSearchInput) {
    newSearchInput.focus();
    newSearchInput.setSelectionRange(newSearchInput.value.length, newSearchInput.value.length);
  }
  newSearchInput.addEventListener("input", function () {
    window.currentPage = 1;
    renderFileTable(folder);
  });
  const headerCells = document.querySelectorAll("table.table thead th[data-column]");
  headerCells.forEach(cell => {
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

// Global function to show an image preview modal.
window.previewImage = function (imageUrl, fileName) {
  let modal = document.getElementById("imagePreviewModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "imagePreviewModal";
    // Full-screen overlay using flexbox, with no padding.
    Object.assign(modal.style, {
      display: "none",
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      backgroundColor: "rgba(0,0,0,0.7)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: "1000"
    });
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 90vw; max-height: 90vh; background: white; padding: 20px; border-radius: 4px; overflow: auto; margin: auto; position: relative;">
        <span id="closeImageModal" style="position: absolute; top: 10px; right: 20px; font-size: 28px; cursor: pointer;">&times;</span>
        <h4 style="text-align: center; margin: 0 0 10px;"></h4>
        <img src="" style="max-width: 100%; max-height: 80vh; object-fit: contain; display: block; margin: 0 auto;" />
      </div>`;
    document.body.appendChild(modal);
    document.getElementById("closeImageModal").addEventListener("click", function () {
      modal.style.display = "none";
    });
    modal.addEventListener("click", function (e) {
      if (e.target === modal) {
        modal.style.display = "none";
      }
    });
  }
  modal.querySelector("h4").textContent = "Preview: " + fileName;
  modal.querySelector("img").src = imageUrl;
  modal.style.display = "flex";
};

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

// Delete selected files.
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

// Download selected files as Zip.
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

// Attach event listeners for the download zip modal.
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

// Copy selected files.
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

// In your loadCopyMoveFolderListForModal function, target the dropdown by its ID.
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

// Attach event listeners for copy modal buttons.
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

// Move selected files.
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

// File Editing Functions.
export function editFile(fileName, folder) {
  console.log("Edit button clicked for:", fileName);
  let existingEditor = document.getElementById("editorContainer");
  if (existingEditor) { existingEditor.remove(); }
  const folderUsed = folder || window.currentFolder || "root";
  const folderPath = (folderUsed === "root")
    ? "uploads/"
    : "uploads/" + folderUsed.split("/").map(encodeURIComponent).join("/") + "/";
  const fileUrl = folderPath + encodeURIComponent(fileName) + "?t=" + new Date().getTime();

  fetch(fileUrl, { method: "HEAD" })
    .then(response => {
      const contentLength = response.headers.get("Content-Length");
      if (contentLength && parseInt(contentLength) > 10485760) {
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
      // Create the modal with zoom controls in a new controls div.
      const modal = document.createElement("div");
      modal.id = "editorContainer";
      modal.classList.add("modal", "editor-modal");
      modal.innerHTML = `
          <h3>Editing: ${fileName}</h3>
          <div id="editorControls" style="text-align:right; margin-bottom:5px;">
             <button id="decreaseFont" class="btn btn-sm btn-secondary">A-</button>
             <button id="increaseFont" class="btn btn-sm btn-secondary">A+</button>
          </div>
          <textarea id="fileEditor" style="width:100%; height:60%; resize:none;">${content}</textarea>
          <div style="margin-top:10px; text-align:right;">
            <button id="saveBtn" class="btn btn-primary">Save</button>
            <button id="closeBtn" class="btn btn-secondary">Close</button>
          </div>
        `;
      document.body.appendChild(modal);
      modal.style.display = "block";

      // Initialize CodeMirror on the textarea.
      const editor = CodeMirror.fromTextArea(document.getElementById("fileEditor"), {
        lineNumbers: true,
        mode: "text/html", // Adjust mode based on file type if needed.
        theme: "default",
        viewportMargin: Infinity
      });
      // Set editor size to use most of the modal height.
      editor.setSize("100%", "60vh");

      // Store the CodeMirror instance globally for saving.
      window.currentEditor = editor;

      // Set a starting font size and apply it.
      let currentFontSize = 14; // default font size in px
      editor.getWrapperElement().style.fontSize = currentFontSize + "px";
      editor.refresh();

      // Zoom out button: Decrease font size.
      document.getElementById("decreaseFont").addEventListener("click", function () {
        currentFontSize = Math.max(8, currentFontSize - 2);
        editor.getWrapperElement().style.fontSize = currentFontSize + "px";
        editor.refresh();
      });

      // Zoom in button: Increase font size.
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
    })
    .catch(error => console.error("Error loading file:", error));
}

export function saveFile(fileName, folder) {
  // Retrieve updated content from the CodeMirror instance.
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

// File Upload Handling: Display preview for image or file icon.
export function displayFilePreview(file, container) {
  container.style.display = "inline-block";
  if (file.type.startsWith("image/")) {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.style.maxWidth = "100px";
    img.style.maxHeight = "100px";
    img.style.marginRight = "5px";
    img.style.marginLeft = "0px";
    container.appendChild(img);
  } else {
    const iconSpan = document.createElement("span");
    iconSpan.classList.add("material-icons");
    iconSpan.style.color = "#333";
    iconSpan.textContent = "insert_drive_file";
    iconSpan.style.marginRight = "0px";
    iconSpan.style.marginLeft = "0px";
    iconSpan.style.fontSize = "32px";
    container.appendChild(iconSpan);
  }
}

// Initialize file action buttons.
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
  // New: Download Selected as Zip button.
  const downloadZipBtn = document.getElementById("downloadZipBtn");
  if (downloadZipBtn) {
    downloadZipBtn.replaceWith(downloadZipBtn.cloneNode(true));
    document.getElementById("downloadZipBtn").addEventListener("click", handleDownloadZipSelected);
  }
}

// Rename function: always available.
export function renameFile(oldName, folder) {
  window.fileToRename = oldName;
  window.fileFolder = folder || window.currentFolder || "root";
  document.getElementById("newFileName").value = oldName;
  document.getElementById("renameFileModal").style.display = "block";
}

// Attach event listeners after DOM content is loaded.
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

// Expose renameFile to global scope.
window.renameFile = renameFile;

// Global pagination functions.
window.changePage = function (newPage) {
  window.currentPage = newPage;
  renderFileTable(window.currentFolder);
};

window.changeItemsPerPage = function (newCount) {
  window.itemsPerPage = parseInt(newCount);
  window.currentPage = 1;
  renderFileTable(window.currentFolder);
};