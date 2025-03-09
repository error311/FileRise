// fileManager.js
import { escapeHTML, updateFileActionButtons, showToast } from './domUtils.js';
import { formatFolderName } from './folderManager.js';

export let fileData = [];
export let sortOrder = { column: "uploaded", ascending: true };

// Global pagination defaults
window.itemsPerPage = window.itemsPerPage || 10;
window.currentPage = window.currentPage || 1;

// Helper to parse date strings in the "m/d/y h:iA" format into a timestamp.
// Custom date parser (expected format: "MM/DD/YY hh:mma", e.g., "03/07/25 01:01AM")
function parseCustomDate(dateStr) {
  // Normalize whitespace (replace one or more whitespace characters with a single space)
  dateStr = dateStr.replace(/\s+/g, " ").trim();

  // Expected format: "MM/DD/YY hh:mma" (e.g., "03/07/25 01:01AM")
  const parts = dateStr.split(" ");
  if (parts.length !== 2) {
    return new Date(dateStr).getTime();
  }
  const datePart = parts[0]; // e.g., "03/07/25"
  const timePart = parts[1]; // e.g., "01:01AM"

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

  // Expect timePart in format hh:mma, e.g., "01:01AM"
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
  const allowedExtensions = ["txt", "html", "htm", "php", "css", "js", "json", "xml", "md", "py", "ini", "csv", "log", "conf", "config", "bat", "rtf", "doc", "docx"];
  const ext = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
  return allowedExtensions.includes(ext);
}

// Load the file list for a given folder.
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
    : "uploads/" + encodeURIComponent(folder) + "/";

  // Get current search term from the search input, if it exists.
  let searchInputElement = document.getElementById("searchInput");
  const searchHadFocus = searchInputElement && (document.activeElement === searchInputElement);
  let searchTerm = searchInputElement ? searchInputElement.value : "";

  // Filter fileData using the search term (case-insensitive).
  const filteredFiles = fileData.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination variables.
  const itemsPerPage = window.itemsPerPage || 10;
  const currentPage = window.currentPage || 1;
  const totalFiles = filteredFiles.length;
  const totalPages = Math.ceil(totalFiles / itemsPerPage);

  // 1. Top controls: Responsive row with search box on the left and Prev/Next on the right.
  const topControlsHTML = `
<div class="row align-items-center mb-3">
  <!-- Search box: occupies 8 columns on medium+ screens -->
  <div class="col-12 col-md-5">
    <div class="input-group" style="max-width: 500px;">
      <div class="input-group-prepend">
        <span class="input-group-text" id="searchIcon">
          <i class="material-icons">search</i>
        </span>
      </div>
      <input
        type="text"
        id="searchInput"
        class="form-control"
        placeholder="Search files..."
        value="${searchTerm}"
        aria-describedby="searchIcon"
      >
    </div>
  </div>
  <!-- Prev/Next buttons: occupies 4 columns on medium+ screens, left-aligned -->
  <div class="col-12 col-md-4 text-left mt-2 mt-md-0">
    <button class="custom-prev-next-btn" ${currentPage === 1 ? "disabled" : ""} onclick="changePage(${currentPage - 1})">
      Prev
    </button>
    <span style="margin: 0 8px;">Page ${currentPage} of ${totalPages || 1}</span>
    <button class="custom-prev-next-btn" ${currentPage === totalPages || totalFiles === 0 ? "disabled" : ""} onclick="changePage(${currentPage + 1})">
      Next
    </button>
  </div>
</div>
  `;

  // 2. Build the File Table with Bootstrap styling.
  let tableHTML = `
    <table class="table">
      <thead>
        <tr>
          <th style="width: 40px;">
            <input type="checkbox" id="selectAll" onclick="toggleAllCheckboxes(this)">
          </th>
          <th data-column="name" style="cursor:pointer; white-space: nowrap;">
            File Name ${sortOrder.column === "name" ? (sortOrder.ascending ? "▲" : "▼") : ""}
          </th>
          <th data-column="modified" class="hide-small" style="cursor:pointer; white-space: nowrap;">
            Date Modified ${sortOrder.column === "modified" ? (sortOrder.ascending ? "▲" : "▼") : ""}
          </th>
          <th data-column="uploaded" class="hide-small" style="cursor:pointer; white-space: nowrap;">
            Upload Date ${sortOrder.column === "uploaded" ? (sortOrder.ascending ? "▲" : "▼") : ""}
          </th>
          <th data-column="size" class="hide-small" style="cursor:pointer; white-space: nowrap;">
            File Size ${sortOrder.column === "size" ? (sortOrder.ascending ? "▲" : "▼") : ""}
          </th>
          <th data-column="uploader" class="hide-small" style="cursor:pointer; white-space: nowrap;">
            Uploader ${sortOrder.column === "uploader" ? (sortOrder.ascending ? "▲" : "▼") : ""}
          </th>
          <th>Actions</th>
        </tr>
      </thead>
  `;

  // Calculate slice for current page.
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

      tableBody += `
        <tr onclick="toggleRowSelection(event, '${safeFileName}')" style="cursor:pointer;">
          <td>
            <input type="checkbox" class="file-checkbox" value="${safeFileName}" onclick="event.stopPropagation(); updateRowHighlight(this);">
          </td>
          <td>${safeFileName}</td>
          <td class="hide-small" style="white-space: nowrap;">${safeModified}</td>
          <td class="hide-small" style="white-space: nowrap;">${safeUploaded}</td>
          <td class="hide-small" style="white-space: nowrap;">${safeSize}</td>
          <td class="hide-small" style="white-space: nowrap;">${safeUploader}</td>
          <td>
            <div style="display: inline-flex; align-items: center; gap: 5px;">
              <a class="btn btn-sm btn-success" href="${folderPath + encodeURIComponent(file.name)}" download>Download</a>
              ${isEditable ? `
                <button class="btn btn-sm btn-primary ml-2" onclick='editFile(${JSON.stringify(file.name)}, ${JSON.stringify(folder)})'>
                  Edit
                </button>
              ` : ""}
              <button class="btn btn-sm btn-warning ml-2" onclick='renameFile(${JSON.stringify(file.name)}, ${JSON.stringify(folder)})'>
                Rename
              </button>
            </div>
          </td>
        </tr>
      `;
    });
  } else {
    tableBody += `<tr><td colspan="7">No files found.</td></tr>`;
  }
  tableBody += `</tbody></table>`;

  // 3. Bottom controls: "Show [dropdown] items per page" with consistent 16px font.
  const bottomControlsHTML = `
    <div class="d-flex align-items-center mt-3" style="font-size:16px; line-height:1.5;">
      <label class="mr-2 mb-0" style="font-size:16px; line-height:1.5;">Show</label>
      <select class="form-control" style="width:auto; font-size:16px; height:auto;" onchange="changeItemsPerPage(this.value)">
        ${[10, 20, 50, 100].map(num => `<option value="${num}" ${num === itemsPerPage ? "selected" : ""}>${num}</option>`).join("")}
      </select>
      <span class="ml-2 mb-0" style="font-size:16px; line-height:1.5;">items per page</span>
    </div>
  `;

  // Combine top controls, table, and bottom controls.
  fileListContainer.innerHTML = topControlsHTML + tableHTML + tableBody + bottomControlsHTML;

  // Re-focus the search input if it was previously focused.
  const newSearchInput = document.getElementById("searchInput");
  if (searchHadFocus && newSearchInput) {
    newSearchInput.focus();
    newSearchInput.setSelectionRange(newSearchInput.value.length, newSearchInput.value.length);
  }

  // Attach event listener for search input.
  newSearchInput.addEventListener("input", function () {
    window.currentPage = 1;
    renderFileTable(folder);
  });

  // Attach sorting event listeners on header cells.
  const headerCells = document.querySelectorAll("table.table thead th[data-column]");
  headerCells.forEach(cell => {
    cell.addEventListener("click", function () {
      const column = this.getAttribute("data-column");
      sortFiles(column, folder);
    });
  });

  // Reattach event listeners for file checkboxes.
  document.querySelectorAll('#fileList .file-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', function (e) {
      updateRowHighlight(e.target);
      updateFileActionButtons();
    });
  });

  updateFileActionButtons();
}

/**
 * Toggles row selection when the user clicks any part of the row (except buttons/links).
 */
window.toggleRowSelection = function (event, fileName) {
  const targetTag = event.target.tagName.toLowerCase();
  if (targetTag === 'a' || targetTag === 'button' || targetTag === 'input') {
    return;
  }
  const row = event.currentTarget;
  const checkbox = row.querySelector('.file-checkbox');
  if (!checkbox) return;
  checkbox.checked = !checkbox.checked;
  updateRowHighlight(checkbox);
  updateFileActionButtons();
};

/**
 * Updates row highlight based on whether the checkbox is checked.
 */
window.updateRowHighlight = function (checkbox) {
  const row = checkbox.closest('tr');
  if (!row) return;
  if (checkbox.checked) {
    row.classList.add('row-selected');
  } else {
    row.classList.remove('row-selected');
  }
};

export function sortFiles(column, folder) {
  // Toggle sort order if the column is the same, otherwise set ascending to true.
  if (sortOrder.column === column) {
    sortOrder.ascending = !sortOrder.ascending;
  } else {
    sortOrder.column = column;
    sortOrder.ascending = true;
  }
  
  // Sort fileData based on the column.
  fileData.sort((a, b) => {
    let valA = a[column] || "";
    let valB = b[column] || "";
  
    if (column === "modified" || column === "uploaded") {
      // Log the raw date strings.
      //console.log(`Sorting ${column}: raw values ->`, valA, valB);
  
      const parsedA = parseCustomDate(valA);
      const parsedB = parseCustomDate(valB);
  
      // Log the parsed numeric timestamps.
      //console.log(`Sorting ${column}: parsed values ->`, parsedA, parsedB);
  
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
  
  // Re-render the file table after sorting.
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
  // Save selected file names in a global variable for use in the modal.
  window.filesToDelete = Array.from(checkboxes).map(chk => chk.value);
  // Update modal message (optional)
  document.getElementById("deleteFilesMessage").textContent =
    "Are you sure you want to delete " + window.filesToDelete.length + " selected file(s)?";
  // Show the delete modal.
  document.getElementById("deleteFilesModal").style.display = "block";
}

// Attach event listeners for delete modal buttons (wrap in DOMContentLoaded):
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
      // Proceed with deletion
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
  // Open the Copy modal.
  document.getElementById("copyFilesModal").style.display = "block";
  // Populate target folder dropdown.
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
  // Open the Move modal.
  document.getElementById("moveFilesModal").style.display = "block";
  // Populate target folder dropdown.
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
  // For subfolders, encode each segment separately to preserve slashes.
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
      const modal = document.createElement("div");
      modal.id = "editorContainer";
      modal.classList.add("modal", "editor-modal");
      modal.innerHTML = `
          <h3>Editing: ${fileName}</h3>
          <textarea id="fileEditor" style="width:100%; height:80%; resize:none;">${content}</textarea>
          <div style="margin-top:10px; text-align:right;">
            <button onclick="saveFile('${fileName}', '${folderUsed}')" class="btn btn-primary">Save</button>
            <button onclick="document.getElementById('editorContainer').remove()" class="btn btn-secondary">Close</button>
          </div>
        `;
      document.body.appendChild(modal);
      modal.style.display = "block";
    })
    .catch(error => console.error("Error loading file:", error));
}

export function saveFile(fileName, folder) {
  const editor = document.getElementById("fileEditor");
  if (!editor) {
    console.error("Editor not found!");
    return;
  }
  const folderUsed = folder || window.currentFolder || "root";
  const fileDataObj = {
    fileName: fileName,
    content: editor.value,
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
  // No need to set display styles here; let updateFileActionButtons handle it.
}


// Rename function: always available.
// Expose renameFile to global scope.
export function renameFile(oldName, folder) {
  // Store the file name and folder globally for use in the modal.
  window.fileToRename = oldName;
  window.fileFolder = folder || window.currentFolder || "root";
  
  // Pre-fill the input with the current file name.
  document.getElementById("newFileName").value = oldName;
  
  // Show the rename file modal.
  document.getElementById("renameFileModal").style.display = "block";
}

// Attach event listeners after DOM content is loaded.
document.addEventListener("DOMContentLoaded", () => {
  // Cancel button: hide modal and clear input.
  const cancelBtn = document.getElementById("cancelRenameFile");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", function() {
      document.getElementById("renameFileModal").style.display = "none";
      document.getElementById("newFileName").value = "";
    });
  }
  
  // Submit button: send rename request.
  const submitBtn = document.getElementById("submitRenameFile");
  if (submitBtn) {
    submitBtn.addEventListener("click", function() {
      const newName = document.getElementById("newFileName").value.trim();
      if (!newName || newName === window.fileToRename) {
        // No change; just hide the modal.
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
  window.currentPage = 1; // Reset to first page.
  renderFileTable(window.currentFolder);
};
