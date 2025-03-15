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
    "txt", "html", "htm", "css", "js", "json", "xml",
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
  // Request a recursive listing from the server.
  return fetch("getFileList.php?folder=" + encodeURIComponent(folder) + "&recursive=1&t=" + new Date().getTime())
    .then(response => response.json())
    .then(data => {
      const fileListContainer = document.getElementById("fileList");
      fileListContainer.innerHTML = "";
      if (data.files && data.files.length > 0) {
        // Map each file so that we have a full name that includes subfolder information.
        // We assume that getFileList.php returns a property 'path' that contains the full relative path (e.g. "subfolder/filename.txt")
        data.files = data.files.map(file => {
          // If file.path exists, use that; otherwise fallback to file.name.
          file.fullName = (file.path || file.name).trim().toLowerCase();
          return file;
        });
        // Save fileData and render file table using your full list.
        fileData = data.files;
        renderFileTable(folder);
      } else {
        fileListContainer.textContent = "No files found.";
        updateFileActionButtons();
      }
      // Return the full file objects.
      return data.files || [];
    })
    .catch(error => {
      console.error("Error loading file list:", error);
      return [];
    });
}

// Debounce helper (if not defined already)
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

export function renderFileTable(folder) {
  const fileListContainer = document.getElementById("fileList");
  const folderPath = (folder === "root")
    ? "uploads/"
    : "uploads/" + folder.split("/").map(encodeURIComponent).join("/") + "/";

  // Use the global search term if available.
  const searchTerm = window.currentSearchTerm || "";

  const filteredFiles = fileData.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get persistent items per page from localStorage.
  const itemsPerPageSetting = parseInt(localStorage.getItem('itemsPerPage') || '10', 10);

  // Use a mutable currentPage variable
  let currentPage = window.currentPage || 1;
  const totalFiles = filteredFiles.length;
  const totalPages = Math.ceil(totalFiles / itemsPerPageSetting);

  // If the current page is greater than totalPages, reset it to a valid page (for example, page 1 or totalPages)
  if (currentPage > totalPages) {
    currentPage = totalPages > 0 ? totalPages : 1;
    window.currentPage = currentPage;
  }

  const safeSearchTerm = escapeHTML(searchTerm);

  const topControlsHTML = `
    <div class="row align-items-center mb-3">
      <div class="col-12 col-md-8 mb-2 mb-md-0">
        <div class="input-group">
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
          <span class="page-indicator">Page ${currentPage} of ${totalPages || 1}</span>
          <button class="custom-prev-next-btn" ${currentPage === totalPages || totalFiles === 0 ? "disabled" : ""} onclick="changePage(${currentPage + 1})">Next</button>
        </div>
      </div>
    </div>
  `;

  let tableHTML = `
    <table class="table">
      <thead>
        <tr>
          <th class="checkbox-col"><input type="checkbox" id="selectAll" onclick="toggleAllCheckboxes(this)"></th>
          <th data-column="name" class="sortable-col">File Name ${sortOrder.column === "name" ? (sortOrder.ascending ? "▲" : "▼") : ""}</th>
          <th data-column="modified" class="hide-small sortable-col">Date Modified ${sortOrder.column === "modified" ? (sortOrder.ascending ? "▲" : "▼") : ""}</th>
          <th data-column="uploaded" class="hide-small hide-medium sortable-col">Upload Date ${sortOrder.column === "uploaded" ? (sortOrder.ascending ? "▲" : "▼") : ""}</th>
          <th data-column="size" class="hide-small sortable-col">File Size ${sortOrder.column === "size" ? (sortOrder.ascending ? "▲" : "▼") : ""}</th>
          <th data-column="uploader" class="hide-small hide-medium sortable-col">Uploader ${sortOrder.column === "uploader" ? (sortOrder.ascending ? "▲" : "▼") : ""}</th>
          <th>Actions</th>
        </tr>
      </thead>
  `;

  const startIndex = (currentPage - 1) * itemsPerPageSetting;
  const endIndex = Math.min(startIndex + itemsPerPageSetting, totalFiles);
  let tableBody = `<tbody>`;

  if (totalFiles > 0) {
    filteredFiles.slice(startIndex, endIndex).forEach(file => {
      const isEditable = canEditFile(file.name);
      const safeFileName = escapeHTML(file.name);
      const safeModified = escapeHTML(file.modified);
      const safeUploaded = escapeHTML(file.uploaded);
      const safeSize = escapeHTML(file.size);
      const safeUploader = escapeHTML(file.uploader || "Unknown");

      const isViewable = /\.(jpg|jpeg|png|gif|bmp|webp|svg|ico|tif|tiff|eps|heic|pdf|mp4|webm|mov|ogg)$/i.test(file.name);
      let previewButton = "";
      if (isViewable) {
        let previewIcon = "";
        if (/\.(jpg|jpeg|png|gif|bmp|webp|svg|ico|tif|tiff|eps|heic)$/i.test(file.name)) {
          previewIcon = `<i class="material-icons">image</i>`;
        } else if (/\.(mp4|webm|mov|ogg)$/i.test(file.name)) {
          previewIcon = `<i class="material-icons">videocam</i>`;
        } else if (/\.pdf$/i.test(file.name)) {
          previewIcon = `<i class="material-icons">picture_as_pdf</i>`;
        }

        previewButton = `<button class="btn btn-sm btn-info ml-2 preview-btn" onclick="event.stopPropagation(); previewFile('${folderPath + encodeURIComponent(file.name)}', '${safeFileName}')">
               ${previewIcon}
             </button>`;
      }

      tableBody += `
          <tr onclick="toggleRowSelection(event, '${safeFileName}')" class="clickable-row">
            <td>
              <input type="checkbox" class="file-checkbox" value="${safeFileName}" onclick="event.stopPropagation(); updateRowHighlight(this);">
            </td>
            <td>${safeFileName}</td>
            <td class="hide-small nowrap">${safeModified}</td>
            <td class="hide-small hide-medium nowrap">${safeUploaded}</td>
            <td class="hide-small nowrap">${safeSize}</td>
            <td class="hide-small hide-medium nowrap">${safeUploader}</td>
            <td>
              <div class="button-wrap">
                <a class="btn btn-sm btn-success ml-2" href="${folderPath + encodeURIComponent(file.name)}" download>Download</a>
                ${isEditable ? `<button class="btn btn-sm btn-primary ml-2" onclick='editFile(${JSON.stringify(file.name)}, ${JSON.stringify(folder)})'>Edit</button>` : ""}
                ${previewButton}
                <button class="btn btn-sm btn-warning ml-2" onclick='renameFile(${JSON.stringify(file.name)}, ${JSON.stringify(folder)})'>Rename</button>
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
    <div class="d-flex align-items-center mt-3 bottom-controls">
      <label class="label-inline mr-2 mb-0">Show</label>
      <select class="form-control bottom-select" onchange="changeItemsPerPage(this.value)">
        ${[10, 20, 50, 100]
      .map(num => `<option value="${num}" ${num === itemsPerPageSetting ? "selected" : ""}>${num}</option>`)
      .join("")}
      </select>
      <span class="items-per-page-text ml-2 mb-0">items per page</span>
    </div>
  `;

  fileListContainer.innerHTML = topControlsHTML + tableHTML + tableBody + bottomControlsHTML;

  // Re-attach event listener for the new search input element.
  const newSearchInput = document.getElementById("searchInput");
  if (newSearchInput) {
    newSearchInput.addEventListener("input", debounce(function () {
      window.currentSearchTerm = newSearchInput.value;
      window.currentPage = 1;
      renderFileTable(folder);
      // After re-rendering, restore focus and caret position.
      setTimeout(() => {
        const freshInput = document.getElementById("searchInput");
        if (freshInput) {
          freshInput.focus();
          freshInput.setSelectionRange(freshInput.value.length, freshInput.value.length);
        }
      }, 0);
    }, 300));
  }

  // Add event listeners for header sorting.
  document.querySelectorAll("table.table thead th[data-column]").forEach(cell => {
    cell.addEventListener("click", function () {
      const column = this.getAttribute("data-column");
      sortFiles(column, folder);
    });
  });

  // Add event listeners for checkboxes.
  document.querySelectorAll('#fileList .file-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', function (e) {
      updateRowHighlight(e.target);
      updateFileActionButtons();
    });
  });

  updateFileActionButtons();
}

// Global function to show an image preview modal.
window.previewFile = function (fileUrl, fileName) {
  let modal = document.getElementById("filePreviewModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "filePreviewModal";
    // Use the same styling as the original image modal.
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
      <div class="modal-content image-preview-modal-content">
        <span id="closeFileModal" class="close-image-modal">&times;</span>
        <h4 class="image-modal-header"></h4>
        <div class="file-preview-container"></div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById("closeFileModal").addEventListener("click", function () {
      modal.style.display = "none";
    });
    modal.addEventListener("click", function (e) {
      if (e.target === modal) {
        modal.style.display = "none";
      }
    });
  }
  modal.querySelector("h4").textContent = "Preview: " + fileName;
  const container = modal.querySelector(".file-preview-container");
  container.innerHTML = ""; // Clear previous content

  const extension = fileName.split('.').pop().toLowerCase();

  if (/\.(jpg|jpeg|png|gif|bmp|webp|svg|ico|tif|tiff|eps|heic)$/i.test(fileName)) {
    // Image preview
    const img = document.createElement("img");
    img.src = fileUrl;
    img.className = "image-modal-img";
    container.appendChild(img);
  } else if (extension === "pdf") {
    // PDF preview using <embed> with explicit sizing
    const embed = document.createElement("embed");
    embed.src = fileUrl;
    embed.type = "application/pdf";
    // Instead of using the image-modal-img class, set larger dimensions
    embed.style.width = "80vw";
    embed.style.height = "80vh";
    embed.style.border = "none";
    container.appendChild(embed);
  } else if (/\.(mp4|webm|mov|ogg)$/i.test(fileName)) {
    // Video preview using <video>
    const video = document.createElement("video");
    video.src = fileUrl;
    video.controls = true;
    video.className = "image-modal-img";
    container.appendChild(video);
  } else {
    container.textContent = "Preview not available for this file type.";
  }

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

// helper function
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
    // Get modal height
    const modalHeight = modal.getBoundingClientRect().height || 600;

    // Keep 70% of modal height for the editor, but allow it to shrink
    const newEditorHeight = Math.max(modalHeight * 0.80, 5) + "px";

    console.log("Adjusting editor height to:", newEditorHeight); // Debugging output

    // Apply new height to the editor
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

  // Remove any existing editor modal before creating a new one
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

      // Block editing if file size exceeds 10MB or Content-Length is missing
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
      // Create the editor modal
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

      // Determine file mode and set CodeMirror editor
      const mode = getModeForFile(fileName);
      const isDarkMode = document.body.classList.contains("dark-mode");
      const theme = isDarkMode ? "material-darker" : "default";

      // Initialize CodeMirror
      const editor = CodeMirror.fromTextArea(document.getElementById("fileEditor"), {
        lineNumbers: true,
        mode: mode,
        theme: theme,
        viewportMargin: Infinity
      });

      // Ensure height adjustment
      window.currentEditor = editor;

      // Adjust height AFTER modal appears
      setTimeout(() => {
        adjustEditorSize(); // Set initial height
      }, 50);

      // Attach modal resize observer
      observeModalResize(modal);

      // Font size control
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

      // Save function
      document.getElementById("saveBtn").addEventListener("click", function () {
        saveFile(fileName, folderUsed);
      });

      // Close function
      document.getElementById("closeBtn").addEventListener("click", function () {
        modal.remove();
      });

      // Function to update the editor theme when dark mode is toggled
      function updateEditorTheme() {
        const isDarkMode = document.body.classList.contains("dark-mode");
        editor.setOption("theme", isDarkMode ? "material-darker" : "default");
      }

      // Listen for dark mode toggle and update the theme dynamically
      document.getElementById("darkModeToggle").addEventListener("click", updateEditorTheme);
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
    img.classList.add("file-preview-img");
    container.appendChild(img);
  } else {
    const iconSpan = document.createElement("span");
    iconSpan.classList.add("material-icons", "file-icon");
    iconSpan.textContent = "insert_drive_file";
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