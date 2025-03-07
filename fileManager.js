// fileManager.js
import { escapeHTML, updateFileActionButtons } from './domUtils.js';

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

// Render the file table with pagination controls.
export function renderFileTable(folder) {
  const fileListContainer = document.getElementById("fileList");
  const folderPath = (folder === "root")
    ? "uploads/"
    : "uploads/" + encodeURIComponent(folder) + "/";

  // Pagination variables:
  const itemsPerPage = window.itemsPerPage || 10;
  const currentPage = window.currentPage || 1;
  const totalFiles = fileData.length;
  const totalPages = Math.ceil(totalFiles / itemsPerPage);

  // Build table header.
  let tableHTML = `<table class="table">
    <thead>
      <tr>
        <th><input type="checkbox" id="selectAll" onclick="toggleAllCheckboxes(this)"></th>
        <th data-column="name" style="cursor:pointer; text-decoration: underline; white-space: nowrap;">
          File Name ${sortOrder.column === "name" ? (sortOrder.ascending ? "▲" : "▼") : ""}
        </th>
        <th data-column="modified" class="hide-small" style="cursor:pointer; text-decoration: underline; white-space: nowrap;">
          Date Modified ${sortOrder.column === "modified" ? (sortOrder.ascending ? "▲" : "▼") : ""}
        </th>
        <th data-column="uploaded" class="hide-small" style="cursor:pointer; text-decoration: underline; white-space: nowrap;">
          Upload Date ${sortOrder.column === "uploaded" ? (sortOrder.ascending ? "▲" : "▼") : ""}
        </th>
        <th data-column="size" class="hide-small" style="cursor:pointer; text-decoration: underline; white-space: nowrap;">
          File Size ${sortOrder.column === "size" ? (sortOrder.ascending ? "▲" : "▼") : ""}
        </th>
        <th data-column="uploader" class="hide-small" style="cursor:pointer; text-decoration: underline; white-space: nowrap;">
          Uploader ${sortOrder.column === "uploader" ? (sortOrder.ascending ? "▲" : "▼") : ""}
        </th>
        <th>Actions</th>
      </tr>
    </thead>`;

  // Calculate slice for current page.
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalFiles);
  let tableBody = `<tbody>`;

  fileData.slice(startIndex, endIndex).forEach(file => {
    const isEditable = canEditFile(file.name);
    const safeFileName = escapeHTML(file.name);
    const safeModified = escapeHTML(file.modified);
    const safeUploaded = escapeHTML(file.uploaded);
    const safeSize = escapeHTML(file.size);
    const safeUploader = escapeHTML(file.uploader || "Unknown");

    tableBody += `<tr>
      <td><input type="checkbox" class="file-checkbox" value="${safeFileName}" onclick="updateFileActionButtons()"></td>
      <td>${safeFileName}</td>
      <td class="hide-small" style="white-space: nowrap;">${safeModified}</td>
      <td class="hide-small" style="white-space: nowrap;">${safeUploaded}</td>
      <td class="hide-small" style="white-space: nowrap;">${safeSize}</td>
      <td class="hide-small" style="white-space: nowrap;">${safeUploader}</td>
      <td>
        <div style="display: inline-flex; align-items: center; gap: 5px; flex-wrap: nowrap;">
          <a class="btn btn-sm btn-success" href="${folderPath + encodeURIComponent(file.name)}" download>Download</a>
          ${isEditable ? `<button class="btn btn-sm btn-primary ml-2" onclick='editFile(${JSON.stringify(file.name)}, ${JSON.stringify(folder)})'>Edit</button>` : ""}
          <button class="btn btn-sm btn-warning ml-2" onclick='renameFile(${JSON.stringify(file.name)}, ${JSON.stringify(folder)})'>Rename</button>
        </div>
      </td>
    </tr>`;
  });

  tableBody += `</tbody></table>`;

  // Build pagination controls.
  let paginationHTML = `<div class="pagination-controls" style="margin-top:10px; display:flex; align-items:center; justify-content:space-between;">`;
  paginationHTML += `<div>`;
  paginationHTML += `<button ${currentPage === 1 ? "disabled" : ""} onclick="changePage(${currentPage - 1})">Prev</button> `;
  paginationHTML += `<span>Page ${currentPage} of ${totalPages}</span> `;
  paginationHTML += `<button ${currentPage === totalPages ? "disabled" : ""} onclick="changePage(${currentPage + 1})">Next</button>`;
  paginationHTML += `</div>`;
  paginationHTML += `<div>Show <select onchange="changeItemsPerPage(this.value)">`;
  [10, 20, 50, 100].forEach(num => {
    paginationHTML += `<option value="${num}" ${num === itemsPerPage ? "selected" : ""}>${num}</option>`;
  });
  paginationHTML += `</select> items per page</div>`;
  paginationHTML += `</div>`;

  fileListContainer.innerHTML = tableHTML + tableBody + paginationHTML;

  // Attach sorting event listeners on header cells.
  const headerCells = document.querySelectorAll("table.table thead th[data-column]");
  headerCells.forEach(cell => {
    cell.addEventListener("click", function () {
      const column = this.getAttribute("data-column");
      sortFiles(column, folder);
    });
  });

  // After rendering the table, reattach the file checkbox event listener.
  document.querySelectorAll('#fileList .file-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', updateFileActionButtons);
  });

  // Finally, call updateFileActionButtons so the buttons show (or are disabled) correctly.
  updateFileActionButtons();
}

// Sort files and re-render the table.
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
      // Log the raw date strings.
      console.log(`Sorting ${column}: raw values ->`, valA, valB);

      const parsedA = parseCustomDate(valA);
      const parsedB = parseCustomDate(valB);

      // Log the parsed numeric timestamps.
      console.log(`Sorting ${column}: parsed values ->`, parsedA, parsedB);

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
    alert("No files selected.");
    return;
  }
  if (!confirm("Are you sure you want to delete the selected files?")) {
    return;
  }
  const filesToDelete = Array.from(checkboxes).map(chk => chk.value);
  fetch("deleteFiles.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder: window.currentFolder, files: filesToDelete })
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        alert("Selected files deleted successfully!");
        loadFileList(window.currentFolder);
      } else {
        alert("Error: " + (data.error || "Could not delete files"));
      }
    })
    .catch(error => console.error("Error deleting files:", error));
}

// Copy selected files.
export function handleCopySelected(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  const checkboxes = document.querySelectorAll(".file-checkbox:checked");
  if (checkboxes.length === 0) {
    alert("No files selected for copying.");
    return;
  }
  const targetFolder = document.getElementById("copyMoveFolderSelect").value;
  if (!targetFolder) {
    alert("Please select a target folder for copying.");
    return;
  }
  const filesToCopy = Array.from(checkboxes).map(chk => chk.value);
  fetch("copyFiles.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: window.currentFolder, files: filesToCopy, destination: targetFolder })
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        alert("Selected files copied successfully!");
        loadFileList(window.currentFolder);
      } else {
        alert("Error: " + (data.error || "Could not copy files"));
      }
    })
    .catch(error => console.error("Error copying files:", error));
}

// Move selected files.
export function handleMoveSelected(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  const checkboxes = document.querySelectorAll(".file-checkbox:checked");
  if (checkboxes.length === 0) {
    alert("No files selected for moving.");
    return;
  }
  const targetFolder = document.getElementById("copyMoveFolderSelect").value;
  if (!targetFolder) {
    alert("Please select a target folder for moving.");
    return;
  }
  if (targetFolder === window.currentFolder) {
    alert("Error: Cannot move files to the same folder.");
    return;
  }
  const filesToMove = Array.from(checkboxes).map(chk => chk.value);
  fetch("moveFiles.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: window.currentFolder, files: filesToMove, destination: targetFolder })
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        alert("Selected files moved successfully!");
        loadFileList(window.currentFolder);
      } else {
        alert("Error: " + (data.error || "Could not move files"));
      }
    })
    .catch(error => console.error("Error moving files:", error));
}

// File Editing Functions.
export function editFile(fileName, folder) {
  console.log("Edit button clicked for:", fileName);
  let existingEditor = document.getElementById("editorContainer");
  if (existingEditor) { existingEditor.remove(); }
  const folderUsed = folder || window.currentFolder || "root";
  const folderPath = (folderUsed === "root")
    ? "uploads/"
    : "uploads/" + encodeURIComponent(folderUsed) + "/";
  const fileUrl = folderPath + encodeURIComponent(fileName) + "?t=" + new Date().getTime();

  fetch(fileUrl, { method: "HEAD" })
    .then(response => {
      const contentLength = response.headers.get("Content-Length");
      if (contentLength && parseInt(contentLength) > 10485760) {
        alert("This file is larger than 10 MB and cannot be edited in the browser.");
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
      alert(result.success || result.error);
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
export function renameFile(oldName, folder) {
  const newName = prompt(`Enter new name for file "${oldName}":`, oldName);
  if (!newName || newName === oldName) {
    return; // No change.
  }
  const folderUsed = folder || window.currentFolder || "root";
  fetch("renameFile.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder: folderUsed, oldName: oldName, newName: newName })
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        alert("File renamed successfully!");
        loadFileList(folderUsed);
      } else {
        alert("Error renaming file: " + (data.error || "Unknown error"));
      }
    })
    .catch(error => {
      console.error("Error renaming file:", error);
      alert("Error renaming file");
    });
}

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
