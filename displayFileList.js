// displayFileList.js
import { sendRequest, toggleVisibility } from './utils.js';

let fileData = [];
let sortOrder = { column: "uploaded", ascending: false };

export function loadFileList() {
  sendRequest("checkAuth.php")
    .then(authData => {
      if (!authData.authenticated) {
        console.warn("User not authenticated, hiding file list.");
        toggleVisibility("fileListContainer", false);
        return;
      }
      toggleVisibility("fileListContainer", true);
      return sendRequest("getFileList.php");
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
      sortFiles("uploaded", false);
    })
    .catch(error => console.error("Error loading file list:", error));
}

export function sortFiles(column, forceAscending = null) {
  if (sortOrder.column === column) {
    sortOrder.ascending = forceAscending !== null ? forceAscending : !sortOrder.ascending;
  } else {
    sortOrder.column = column;
    sortOrder.ascending = forceAscending !== null ? forceAscending : true;
  }
  fileData.sort((a, b) => {
    let valA = a[column] || "";
    let valB = b[column] || "";
    if (column === "modified" || column === "uploaded") {
      const dateA = new Date(valA);
      const dateB = new Date(valB);
      if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
        valA = dateA.getTime();
        valB = dateB.getTime();
      } else {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }
    } else if (typeof valA === "string") {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }
    if (valA < valB) return sortOrder.ascending ? -1 : 1;
    if (valA > valB) return sortOrder.ascending ? 1 : -1;
    return 0;
  });
  renderFileTable();
}

export function renderFileTable() {
  const fileListContainer = document.getElementById("fileList");
  let tableHTML = `<table class="table">
        <thead>
            <tr>
                <th><input type="checkbox" id="selectAll" onclick="toggleAllCheckboxes(this)"></th>
                <th onclick="sortFiles('name')" style="cursor:pointer; text-decoration: underline; white-space: nowrap;">
                    <span>File Name</span> <span>${sortOrder.column === "name" ? (sortOrder.ascending ? "▲" : "▼") : ""}</span>
                </th>
                <th onclick="sortFiles('modified')" style="cursor:pointer; text-decoration: underline; white-space: nowrap;">
                    <span>Date Modified</span> <span>${sortOrder.column === "modified" ? (sortOrder.ascending ? "▲" : "▼") : ""}</span>
                </th>
                <th onclick="sortFiles('uploaded')" style="cursor:pointer; text-decoration: underline; white-space: nowrap;">
                    <span>Upload Date</span> <span>${sortOrder.column === "uploaded" ? (sortOrder.ascending ? "▲" : "▼") : ""}</span>
                </th>
                <th onclick="sortFiles('size')" style="cursor:pointer; text-decoration: underline; white-space: nowrap;">
                    <span>File Size</span> <span>${sortOrder.column === "size" ? (sortOrder.ascending ? "▲" : "▼") : ""}</span>
                </th>
                <th onclick="sortFiles('uploader')" style="cursor:pointer; text-decoration: underline; white-space: nowrap;">
                    <span>Uploader</span> <span>${sortOrder.column === "uploader" ? (sortOrder.ascending ? "▲" : "▼") : ""}</span>
                </th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>`;
  
  fileData.forEach(file => {
    const isEditable = file.name.endsWith(".txt") || file.name.endsWith(".json") ||
                       file.name.endsWith(".ini") || file.name.endsWith(".css") || 
                       file.name.endsWith(".js") || file.name.endsWith(".csv") || 
                       file.name.endsWith(".md") || file.name.endsWith(".xml") || 
                       file.name.endsWith(".html") || file.name.endsWith(".py") ||
                       file.name.endsWith(".log") || file.name.endsWith(".conf") || 
                       file.name.endsWith(".config") || file.name.endsWith(".bat") || 
                       file.name.endsWith(".rtf") || file.name.endsWith(".doc") || 
                       file.name.endsWith(".docx");
    tableHTML += `<tr>
            <td><input type="checkbox" class="file-checkbox" value="${file.name}" onclick="toggleDeleteButton()"></td>
            <td>${file.name}</td>
            <td style="white-space: nowrap;">${file.modified}</td>
            <td style="white-space: nowrap;">${file.uploaded}</td>
            <td style="white-space: nowrap;">${file.size}</td>
            <td style="white-space: nowrap;">${file.uploader || "Unknown"}</td>
            <td>
                <div style="display: inline-flex; align-items: center; gap: 5px; flex-wrap: nowrap;">
                    <a href="uploads/${file.name}" download>Download</a>
                    ${isEditable ? `<button onclick="editFile('${file.name}')">Edit</button>` : ""}
                </div>
            </td>
        </tr>`;
  });
  
  tableHTML += `</tbody></table>`;
  fileListContainer.innerHTML = tableHTML;
  
  const deleteBtn = document.getElementById("deleteSelectedBtn");
  if (fileData.length > 0) {
    deleteBtn.style.display = "block";
    const selectedFiles = document.querySelectorAll(".file-checkbox:checked");
    deleteBtn.disabled = selectedFiles.length === 0;
  } else {
    deleteBtn.style.display = "none";
  }
}

export function toggleDeleteButton() {
  const selectedFiles = document.querySelectorAll(".file-checkbox:checked");
  const deleteBtn = document.getElementById("deleteSelectedBtn");
  deleteBtn.disabled = selectedFiles.length === 0;
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
  const deleteBtn = document.getElementById("deleteSelectedBtn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", deleteSelectedFiles);
  }
});

export function editFile(fileName) {
  const threshold = 10 * 1024 * 1024; // 10 MB threshold
  fetch(`uploads/${encodeURIComponent(fileName)}`, { method: 'HEAD' })
    .then(response => {
      const fileSize = parseInt(response.headers.get('Content-Length') || "0", 10);
      if (fileSize > threshold) {
        alert("This file is too large to edit in the browser.");
        return;
      }
      return fetch(`uploads/${encodeURIComponent(fileName)}?t=${new Date().getTime()}`);
    })
    .then(response => {
      if (!response) return;
      if (!response.ok) throw new Error("HTTP error! Status: " + response.status);
      return response.text();
    })
    .then(content => {
      if (!content) return;
      const modal = document.createElement("div");
      modal.id = "editorContainer";
      modal.classList.add("modal", "editor-modal");
      modal.innerHTML = `
          <h3>Editing: ${fileName}</h3>
          <textarea id="fileEditor" style="width:100%; height:60%; resize:none;">${content}</textarea>
          <div style="margin-top:10px; text-align:right;">
            <button onclick="saveFile('${fileName}')" class="btn btn-primary">Save</button>
            <button onclick="document.getElementById('editorContainer').remove()" class="btn btn-secondary">Close</button>
          </div>
      `;
      document.body.appendChild(modal);
      modal.style.display = "block";
    })
    .catch(error => console.error("Error in editFile:", error));
}

export function saveFile(fileName) {
  const editor = document.getElementById("fileEditor");
  if (!editor) {
    console.error("Editor not found!");
    return;
  }
  const fileData = {
    fileName: fileName,
    content: editor.value
  };
  sendRequest("saveFile.php", "POST", fileData)
    .then(result => {
      alert(result.success || result.error);
      document.getElementById("editorContainer")?.remove();
      loadFileList();
    })
    .catch(error => console.error("Error saving file:", error));
}

// To support inline onclick attributes in the generated HTML, attach these functions to window.
window.sortFiles = sortFiles;
window.toggleDeleteButton = toggleDeleteButton;
window.toggleAllCheckboxes = toggleAllCheckboxes;
window.deleteSelectedFiles = deleteSelectedFiles;
window.editFile = editFile;
window.saveFile = saveFile;
window.loadFileList = loadFileList;
