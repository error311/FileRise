import { loadFileList } from './fileManager.js';
import { showToast } from './domUtils.js';
// ----------------------
// Helper functions
// ----------------------

// Format folder name for display (for copy/move dropdown).
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

/**
 * Render the folder tree as nested <ul> elements with toggle icons.
 * @param {object} tree - The tree object.
 * @param {string} parentPath - The path prefix.
 * @param {string} defaultDisplay - "block" (open) or "none" (collapsed)
 */
function renderFolderTree(tree, parentPath = "", defaultDisplay = "none") {
  let html = `<ul style="list-style-type:none; padding-left:20px; margin:0; display:${defaultDisplay};">`;
  for (const folder in tree) {
    const fullPath = parentPath ? parentPath + "/" + folder : folder;
    const hasChildren = Object.keys(tree[folder]).length > 0;
    html += `<li style="margin:4px 0; display:block;">`;
    if (hasChildren) {
      // For nested levels (below root) default to collapsed: toggle label "[+]"
      html += `<span class="folder-toggle" style="cursor:pointer; margin-right:5px;">[+]</span>`;
    } else {
      html += `<span style="display:inline-block; width:18px;"></span>`;
    }
    html += `<span class="folder-option" data-folder="${fullPath}" style="cursor:pointer;">${folder}</span>`;
    if (hasChildren) {
      // Nested children always collapse by default.
      html += renderFolderTree(tree[folder], fullPath, "none");
    }
    html += `</li>`;
  }
  html += `</ul>`;
  return html;
}

/**
 * Expand the tree path for the given folder.
 * This function splits the folder path and, for each level, finds the parent li and forces its nested ul to be open.
 */
function expandTreePath(path) {
  const parts = path.split("/");
  let cumulative = "";
  parts.forEach((part, index) => {
    cumulative = index === 0 ? part : cumulative + "/" + part;
    const option = document.querySelector(`.folder-option[data-folder="${cumulative}"]`);
    if (option) {
      const li = option.parentNode;
      const nestedUl = li.querySelector("ul");
      if (nestedUl && (nestedUl.style.display === "none" || nestedUl.style.display === "")) {
        nestedUl.style.display = "block";
        const toggle = li.querySelector(".folder-toggle");
        if (toggle) {
          toggle.textContent = "[-]";
        }
      }
    }
  });
}

// ----------------------
// Main Interactive Tree
// ----------------------

export async function loadFolderTree(selectedFolder) {
  try {
    const response = await fetch('getFolderList.php');

    // Check for Unauthorized status
    if (response.status === 401) {
      console.error("Unauthorized: Please log in to view folders.");
      // Optionally, redirect to the login page:
       // window.location.href = "/login.html";
      return;
    }

    const folders = await response.json();
    if (!Array.isArray(folders)) {
      console.error("Folder list response is not an array:", folders);
      return;
    }
    
    const container = document.getElementById("folderTreeContainer");
    if (!container) return;
    
    const tree = buildFolderTree(folders);
    
    // Build the root row.
    let html = `<div id="rootRow" style="margin-bottom:10px; display:flex; align-items:center;">`;
    html += `<span class="folder-toggle" style="cursor:pointer; margin-right:5px;">[-]</span>`;
    html += `<span class="folder-option" data-folder="root" style="cursor:pointer; font-weight:bold;">(Root)</span>`;
    html += `</div>`;
    // Append the nested tree for root. Force its display to "block".
    html += renderFolderTree(tree, "", "block");
    
    container.innerHTML = html;
    
    if (selectedFolder) {
      window.currentFolder = selectedFolder;
    } else if (!window.currentFolder) {
      window.currentFolder = "root";
    }
    
    document.getElementById("fileListTitle").textContent =
      window.currentFolder === "root" ? "Files in (Root)" : "Files in (" + window.currentFolder + ")";
    loadFileList(window.currentFolder);
    
    if (window.currentFolder !== "root") {
      expandTreePath(window.currentFolder);
    }
    
    // --- Attach events ---
    container.querySelectorAll(".folder-option").forEach(el => {
      el.addEventListener("click", function(e) {
        e.stopPropagation();
        container.querySelectorAll(".folder-option").forEach(item => item.classList.remove("selected"));
        this.classList.add("selected");
        const selected = this.getAttribute("data-folder");
        window.currentFolder = selected;
        document.getElementById("fileListTitle").textContent =
          selected === "root" ? "Files in (Root)" : "Files in (" + selected + ")";
        loadFileList(selected);
      });
    });
    
    const rootToggle = container.querySelector("#rootRow .folder-toggle");
    if (rootToggle) {
      rootToggle.addEventListener("click", function(e) {
        e.stopPropagation();
        const nestedUl = container.querySelector("#rootRow + ul");
        if (nestedUl) {
          if (nestedUl.style.display === "none" || nestedUl.style.display === "") {
            nestedUl.style.display = "block";
            this.textContent = "[-]";
          } else {
            nestedUl.style.display = "none";
            this.textContent = "[+]";
          }
        }
      });
    }
    
    container.querySelectorAll(".folder-toggle").forEach(toggle => {
      toggle.addEventListener("click", function(e) {
        e.stopPropagation();
        const siblingUl = this.parentNode.querySelector("ul");
        if (siblingUl) {
          if (siblingUl.style.display === "none" || siblingUl.style.display === "") {
            siblingUl.style.display = "block";
            this.textContent = "[-]";
          } else {
            siblingUl.style.display = "none";
            this.textContent = "[+]";
          }
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
// Folder Management Functions
// ----------------------

// Attach event listeners for Rename and Delete buttons.
document.getElementById("renameFolderBtn").addEventListener("click", openRenameFolderModal);
document.getElementById("deleteFolderBtn").addEventListener("click", openDeleteFolderModal);

function openRenameFolderModal() {
  const selectedFolder = window.currentFolder || "root";
  if (!selectedFolder || selectedFolder === "root") {
    showToast("Please select a valid folder to rename.");
    return;
  }
  // Pre-fill the input with the current folder name (optional)
  document.getElementById("newRenameFolderName").value = selectedFolder;
  // Show the modal
  document.getElementById("renameFolderModal").style.display = "block";
}

// Attach event listener for Cancel button in the rename modal
document.getElementById("cancelRenameFolder").addEventListener("click", function () {
  document.getElementById("renameFolderModal").style.display = "none";
  document.getElementById("newRenameFolderName").value = "";
});

// Attach event listener for the Rename (Submit) button in the rename modal
document.getElementById("submitRenameFolder").addEventListener("click", function () {
  const selectedFolder = window.currentFolder || "root";
  const newFolderName = document.getElementById("newRenameFolderName").value.trim();
  if (!newFolderName || newFolderName === selectedFolder) {
    showToast("Please enter a valid new folder name.");
    return;
  }
  fetch("renameFolder.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ oldFolder: selectedFolder, newFolder: newFolderName })
  })
    .then(response => response.json())
    .then(data => {
      console.log("Rename response:", data);
      if (data.success) {
        showToast("Folder renamed successfully!");
        window.currentFolder = newFolderName;
        loadFolderList(newFolderName);
        loadCopyMoveFolderList();
      } else {
        showToast("Error: " + (data.error || "Could not rename folder"));
      }
    })
    .catch(error => console.error("Error renaming folder:", error))
    .finally(() => {
      // Hide the modal and clear the input
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
  // Update the modal message to include the folder name.
  document.getElementById("deleteFolderMessage").textContent =
    "Are you sure you want to delete folder " + selectedFolder + "?";
  // Show the modal.
  document.getElementById("deleteFolderModal").style.display = "block";
}

// Attach event for Cancel button in the delete modal.
document.getElementById("cancelDeleteFolder").addEventListener("click", function () {
  document.getElementById("deleteFolderModal").style.display = "none";
});

// Attach event for Confirm/Delete button.
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
        if (window.currentFolder === selectedFolder) {
          window.currentFolder = "root";
        }
        loadFolderList("root");
        loadCopyMoveFolderList();
      } else {
        showToast("Error: " + (data.error || "Could not delete folder"));
      }
    })
    .catch(error => console.error("Error deleting folder:", error))
    .finally(() => {
      // Hide the modal after the request completes.
      document.getElementById("deleteFolderModal").style.display = "none";
    });
});

// Instead of using prompt, show the modal.
document.getElementById("createFolderBtn").addEventListener("click", function () {
  document.getElementById("createFolderModal").style.display = "block";
});

// Attach event for the Cancel button.
document.getElementById("cancelCreateFolder").addEventListener("click", function () {
  document.getElementById("createFolderModal").style.display = "none";
  document.getElementById("newFolderName").value = "";
});

// Attach event for the Submit (Create) button.
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
  console.log("Create folder payload:", { folderName: folderInput, parent: selectedFolder === "root" ? "" : selectedFolder });
  fetch("createFolder.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderName: folderInput, parent: selectedFolder === "root" ? "" : selectedFolder })
  })
    .then(response => response.json())
    .then(data => {
      console.log("Create folder response:", data);
      if (data.success) {
        showToast("Folder created successfully!");
        window.currentFolder = fullFolderName;
        loadFolderList(fullFolderName);
        loadCopyMoveFolderList();
      } else {
        showToast("Error: " + (data.error || "Could not create folder"));
      }
      // Hide modal and clear input.
      document.getElementById("createFolderModal").style.display = "none";
      document.getElementById("newFolderName").value = "";
    })
    .catch(error => {
      console.error("Error creating folder:", error);
      document.getElementById("createFolderModal").style.display = "none";
    });
});

// For copy/move folder dropdown.
export async function loadCopyMoveFolderList() {
  try {
    const response = await fetch('getFolderList.php');
    const folders = await response.json();
    if (!Array.isArray(folders)) {
      console.error("Folder list response is not an array:", folders);
      return;
    }
    const folderSelect = document.getElementById('copyMoveFolderSelect').style.display = "none";
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
    console.error('Error loading folder list:', error);
  }
}