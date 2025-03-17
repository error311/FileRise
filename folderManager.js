// folderManager.js

import { loadFileList } from './fileManager.js';
import { showToast, escapeHTML } from './domUtils.js';

// ----------------------
// Helper Functions (Data/State)
// ----------------------

// Formats a folder name for display (e.g. adding indentations).
export function formatFolderName(folder) {
  if (folder.indexOf("/") !== -1) {
    let parts = folder.split("/");
    let indent = "";
    for (let i = 1; i < parts.length; i++) {
      indent += "\u00A0\u00A0\u00A0\u00A0"; // 4 non-breaking spaces per level
    }
    return indent + parts[parts.length - 1];
  } else {
    return folder;
  }
}

// Build a tree structure from a flat array of folder paths.
function buildFolderTree(folders) {
  const tree = {};
  folders.forEach(folderPath => {
    const parts = folderPath.split('/');
    let current = tree;
    parts.forEach(part => {
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    });
  });
  return tree;
}

// ----------------------
// Folder Tree State (Save/Load)
// ----------------------
function loadFolderTreeState() {
  const state = localStorage.getItem("folderTreeState");
  return state ? JSON.parse(state) : {};
}

function saveFolderTreeState(state) {
  localStorage.setItem("folderTreeState", JSON.stringify(state));
}

// Helper for getting the parent folder.
function getParentFolder(folder) {
  if (folder === "root") return "root";
  const lastSlash = folder.lastIndexOf("/");
  return lastSlash === -1 ? "root" : folder.substring(0, lastSlash);
}

// ----------------------
// DOM Building Functions
// ----------------------

// Recursively builds HTML for the folder tree as nested <ul> elements.
function renderFolderTree(tree, parentPath = "", defaultDisplay = "block") {
  const state = loadFolderTreeState();
  let html = `<ul class="folder-tree ${defaultDisplay === 'none' ? 'collapsed' : 'expanded'}">`;
  for (const folder in tree) {
    const fullPath = parentPath ? parentPath + "/" + folder : folder;
    const hasChildren = Object.keys(tree[folder]).length > 0;
    const displayState = state[fullPath] !== undefined ? state[fullPath] : defaultDisplay;
    html += `<li class="folder-item">`;
    if (hasChildren) {
      const toggleSymbol = (displayState === "none") ? "[+]" : "[-]";
      html += `<span class="folder-toggle" data-folder="${fullPath}">${toggleSymbol}</span>`;
    } else {
      html += `<span class="folder-indent-placeholder"></span>`;
    }
    // Use escapeHTML to safely render the folder name.
    html += `<span class="folder-option" data-folder="${fullPath}">${escapeHTML(folder)}</span>`;
    if (hasChildren) {
      html += renderFolderTree(tree[folder], fullPath, displayState);
    }
    html += `</li>`;
  }
  html += `</ul>`;
  return html;
}

// Expands the folder tree along a given path.
function expandTreePath(path) {
  const parts = path.split("/");
  let cumulative = "";
  parts.forEach((part, index) => {
    cumulative = index === 0 ? part : cumulative + "/" + part;
    const option = document.querySelector(`.folder-option[data-folder="${cumulative}"]`);
    if (option) {
      const li = option.parentNode;
      const nestedUl = li.querySelector("ul");
      if (nestedUl && (nestedUl.classList.contains("collapsed") || !nestedUl.classList.contains("expanded"))) {
        nestedUl.classList.remove("collapsed");
        nestedUl.classList.add("expanded");
        const toggle = li.querySelector(".folder-toggle");
        if (toggle) {
          toggle.textContent = "[-]";
          let state = loadFolderTreeState();
          state[cumulative] = "block";
          saveFolderTreeState(state);
        }
      }
    }
  });
}

// ----------------------
// Main Folder Tree Rendering and Event Binding
// ----------------------
export async function loadFolderTree(selectedFolder) {
  try {
    const response = await fetch('getFolderList.php');
    if (response.status === 401) {
      console.error("Unauthorized: Please log in to view folders.");
      return;
    }
    const folders = await response.json();
    if (!Array.isArray(folders)) {
      console.error("Folder list response is not an array:", folders);
      return;
    }

    const container = document.getElementById("folderTreeContainer");
    if (!container) {
      console.error("Folder tree container not found.");
      return;
    }

    let html = `<div id="rootRow" class="root-row">
                  <span class="folder-toggle" data-folder="root">[-]</span>
                  <span class="folder-option root-folder-option" data-folder="root">(Root)</span>
                </div>`;
    if (folders.length === 0) {
      html += `<ul class="folder-tree expanded">
                 <li class="folder-item">
                   <span class="folder-option" data-folder="root">(Root)</span>
                 </li>
               </ul>`;
    } else {
      const tree = buildFolderTree(folders);
      html += renderFolderTree(tree, "", "block");
    }
    container.innerHTML = html;

    // Determine current folder.
    if (selectedFolder) {
      window.currentFolder = selectedFolder;
    } else {
      window.currentFolder = localStorage.getItem("lastOpenedFolder") || "root";
    }
    localStorage.setItem("lastOpenedFolder", window.currentFolder);
    document.getElementById("fileListTitle").textContent =
      window.currentFolder === "root" ? "Files in (Root)" : "Files in (" + window.currentFolder + ")";
    loadFileList(window.currentFolder);

    // Expand tree to current folder.
    const folderState = loadFolderTreeState();
    if (window.currentFolder !== "root" && folderState[window.currentFolder] !== "none") {
      expandTreePath(window.currentFolder);
    }

    // Highlight current folder.
    const selectedEl = container.querySelector(`.folder-option[data-folder="${window.currentFolder}"]`);
    if (selectedEl) {
      selectedEl.classList.add("selected");
    }

    // Event binding for folder selection.
    container.querySelectorAll(".folder-option").forEach(el => {
      el.addEventListener("click", function (e) {
        e.stopPropagation();
        container.querySelectorAll(".folder-option").forEach(item => item.classList.remove("selected"));
        this.classList.add("selected");
        const selected = this.getAttribute("data-folder");
        window.currentFolder = selected;
        localStorage.setItem("lastOpenedFolder", selected);
        document.getElementById("fileListTitle").textContent =
          selected === "root" ? "Files in (Root)" : "Files in (" + selected + ")";
        loadFileList(selected);
      });
    });

    // Event binding for toggling folders.
    const rootToggle = container.querySelector("#rootRow .folder-toggle");
    if (rootToggle) {
      rootToggle.addEventListener("click", function (e) {
        e.stopPropagation();
        const nestedUl = container.querySelector("#rootRow + ul");
        if (nestedUl) {
          let state = loadFolderTreeState();
          if (nestedUl.classList.contains("collapsed") || !nestedUl.classList.contains("expanded")) {
            nestedUl.classList.remove("collapsed");
            nestedUl.classList.add("expanded");
            this.textContent = "[-]";
            state["root"] = "block";
          } else {
            nestedUl.classList.remove("expanded");
            nestedUl.classList.add("collapsed");
            this.textContent = "[+]";
            state["root"] = "none";
          }
          saveFolderTreeState(state);
        }
      });
    }

    container.querySelectorAll(".folder-toggle").forEach(toggle => {
      toggle.addEventListener("click", function (e) {
        e.stopPropagation();
        const siblingUl = this.parentNode.querySelector("ul");
        const folderPath = this.getAttribute("data-folder");
        let state = loadFolderTreeState();
        if (siblingUl) {
          if (siblingUl.classList.contains("collapsed") || !siblingUl.classList.contains("expanded")) {
            siblingUl.classList.remove("collapsed");
            siblingUl.classList.add("expanded");
            this.textContent = "[-]";
            state[folderPath] = "block";
          } else {
            siblingUl.classList.remove("expanded");
            siblingUl.classList.add("collapsed");
            this.textContent = "[+]";
            state[folderPath] = "none";
          }
          saveFolderTreeState(state);
        }
      });
    });

  } catch (error) {
    console.error("Error loading folder tree:", error);
  }
}

// For backward compatibility.
export function loadFolderList(selectedFolder) {
  loadFolderTree(selectedFolder);
}

// ----------------------
// Folder Management (Rename, Delete, Create)
// ----------------------

document.getElementById("renameFolderBtn").addEventListener("click", openRenameFolderModal);
document.getElementById("deleteFolderBtn").addEventListener("click", openDeleteFolderModal);

function openRenameFolderModal() {
  const selectedFolder = window.currentFolder || "root";
  if (!selectedFolder || selectedFolder === "root") {
    showToast("Please select a valid folder to rename.");
    return;
  }
  const parts = selectedFolder.split("/");
  document.getElementById("newRenameFolderName").value = parts[parts.length - 1];
  document.getElementById("renameFolderModal").style.display = "block";
}

document.getElementById("cancelRenameFolder").addEventListener("click", function () {
  document.getElementById("renameFolderModal").style.display = "none";
  document.getElementById("newRenameFolderName").value = "";
});

document.getElementById("submitRenameFolder").addEventListener("click", function () {
  const selectedFolder = window.currentFolder || "root";
  const newNameBasename = document.getElementById("newRenameFolderName").value.trim();
  if (!newNameBasename || newNameBasename === selectedFolder.split("/").pop()) {
    showToast("Please enter a valid new folder name.");
    return;
  }
  const parentPath = getParentFolder(selectedFolder);
  const newFolderFull = parentPath === "root" ? newNameBasename : parentPath + "/" + newNameBasename;
  fetch("renameFolder.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ oldFolder: selectedFolder, newFolder: newFolderFull })
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        showToast("Folder renamed successfully!");
        window.currentFolder = newFolderFull;
        localStorage.setItem("lastOpenedFolder", newFolderFull);
        loadFolderList(newFolderFull);
      } else {
        showToast("Error: " + (data.error || "Could not rename folder"));
      }
    })
    .catch(error => console.error("Error renaming folder:", error))
    .finally(() => {
      document.getElementById("renameFolderModal").style.display = "none";
      document.getElementById("newRenameFolderName").value = "";
    });
});

function openDeleteFolderModal() {
  const selectedFolder = window.currentFolder || "root";
  if (!selectedFolder || selectedFolder === "root") {
    showToast("Please select a valid folder to delete.");
    return;
  }
  document.getElementById("deleteFolderMessage").textContent =
    "Are you sure you want to delete folder " + selectedFolder + "?";
  document.getElementById("deleteFolderModal").style.display = "block";
}

document.getElementById("cancelDeleteFolder").addEventListener("click", function () {
  document.getElementById("deleteFolderModal").style.display = "none";
});

document.getElementById("confirmDeleteFolder").addEventListener("click", function () {
  const selectedFolder = window.currentFolder || "root";
  fetch("deleteFolder.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder: selectedFolder })
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        showToast("Folder deleted successfully!");
        window.currentFolder = getParentFolder(selectedFolder);
        localStorage.setItem("lastOpenedFolder", window.currentFolder);
        loadFolderList(window.currentFolder);
      } else {
        showToast("Error: " + (data.error || "Could not delete folder"));
      }
    })
    .catch(error => console.error("Error deleting folder:", error))
    .finally(() => {
      document.getElementById("deleteFolderModal").style.display = "none";
    });
});

document.getElementById("createFolderBtn").addEventListener("click", function () {
  document.getElementById("createFolderModal").style.display = "block";
});

document.getElementById("cancelCreateFolder").addEventListener("click", function () {
  document.getElementById("createFolderModal").style.display = "none";
  document.getElementById("newFolderName").value = "";
});

document.getElementById("submitCreateFolder").addEventListener("click", function () {
  const folderInput = document.getElementById("newFolderName").value.trim();
  if (!folderInput) {
    showToast("Please enter a folder name.");
    return;
  }
  let selectedFolder = window.currentFolder || "root";
  let fullFolderName = folderInput;
  if (selectedFolder && selectedFolder !== "root") {
    fullFolderName = selectedFolder + "/" + folderInput;
  }
  fetch("createFolder.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderName: folderInput, parent: selectedFolder === "root" ? "" : selectedFolder })
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        showToast("Folder created successfully!");
        window.currentFolder = fullFolderName;
        localStorage.setItem("lastOpenedFolder", fullFolderName);
        loadFolderList(fullFolderName);
      } else {
        showToast("Error: " + (data.error || "Could not create folder"));
      }
      document.getElementById("createFolderModal").style.display = "none";
      document.getElementById("newFolderName").value = "";
    })
    .catch(error => {
      console.error("Error creating folder:", error);
      document.getElementById("createFolderModal").style.display = "none";
    });
});