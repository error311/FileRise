// folderManager.js

import { loadFileList } from './fileManager.js';
import { showToast, escapeHTML, attachEnterKeyListener } from './domUtils.js';

/* ----------------------
   Helper Functions (Data/State)
----------------------*/

// Formats a folder name for display (e.g. adding indentations).
export function formatFolderName(folder) {
  if (typeof folder !== "string") return "";
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
    if (typeof folderPath !== "string") return;
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

/* ----------------------
   Folder Tree State (Save/Load)
----------------------*/
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

/* ----------------------
   Breadcrumb Functions
----------------------*/
function renderBreadcrumb(normalizedFolder) {
  if (!normalizedFolder || normalizedFolder === "") return "";
  const parts = normalizedFolder.split("/");
  let breadcrumbItems = [];
  // Use the first segment as the root.
  breadcrumbItems.push(`<span class="breadcrumb-link" data-folder="${parts[0]}">${escapeHTML(parts[0])}</span>`);
  let cumulative = parts[0];
  parts.slice(1).forEach(part => {
    cumulative += "/" + part;
    breadcrumbItems.push(`<span class="breadcrumb-separator"> / </span>`);
    breadcrumbItems.push(`<span class="breadcrumb-link" data-folder="${cumulative}">${escapeHTML(part)}</span>`);
  });
  return breadcrumbItems.join('');
}

function bindBreadcrumbEvents() {
  const breadcrumbLinks = document.querySelectorAll(".breadcrumb-link");
  breadcrumbLinks.forEach(link => {
    link.addEventListener("click", function (e) {
      e.stopPropagation();
      let folder = this.getAttribute("data-folder");
      window.currentFolder = folder;
      localStorage.setItem("lastOpenedFolder", folder);
      const titleEl = document.getElementById("fileListTitle");
      titleEl.innerHTML = "Files in (" + renderBreadcrumb(folder) + ")";
      expandTreePath(folder);
      document.querySelectorAll(".folder-option").forEach(item => item.classList.remove("selected"));
      const targetOption = document.querySelector(`.folder-option[data-folder="${folder}"]`);
      if (targetOption) targetOption.classList.add("selected");
      loadFileList(folder);
      bindBreadcrumbEvents();
    });
    link.addEventListener("dragover", function (e) {
      e.preventDefault();
      this.classList.add("drop-hover");
    });
    link.addEventListener("dragleave", function (e) {
      this.classList.remove("drop-hover");
    });
    link.addEventListener("drop", function (e) {
      e.preventDefault();
      this.classList.remove("drop-hover");
      const dropFolder = this.getAttribute("data-folder");
      let dragData;
      try {
        dragData = JSON.parse(e.dataTransfer.getData("application/json"));
      } catch (err) {
        console.error("Invalid drag data on breadcrumb:", err);
        return;
      }
      const filesToMove = dragData.files ? dragData.files : (dragData.fileName ? [dragData.fileName] : []);
      if (filesToMove.length === 0) return;
      fetch("moveFiles.php", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').getAttribute("content")
        },
        body: JSON.stringify({
          source: dragData.sourceFolder,
          files: filesToMove,
          destination: dropFolder
        })
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          showToast(`File(s) moved successfully to ${dropFolder}!`);
          loadFileList(dragData.sourceFolder);
        } else {
          showToast("Error moving files: " + (data.error || "Unknown error"));
        }
      })
      .catch(error => {
        console.error("Error moving files via drop on breadcrumb:", error);
        showToast("Error moving files.");
      });
    });
  });
}

/* ----------------------
   Check Current User's Folder-Only Permission
----------------------*/
// This function uses localStorage values (set during login) to determine if the current user is restricted.
// If folderOnly is "true", then the personal folder (i.e. username) is forced as the effective root.
function checkUserFolderPermission() {
  const username = localStorage.getItem("username");
  console.log("checkUserFolderPermission: username =", username);
  if (!username) {
    console.warn("No username in localStorage; skipping getUserPermissions fetch.");
    return Promise.resolve(false);
  }
  if (localStorage.getItem("folderOnly") === "true") {
    window.userFolderOnly = true;
    console.log("checkUserFolderPermission: using localStorage.folderOnly = true");
    localStorage.setItem("lastOpenedFolder", username);
    window.currentFolder = username;
    return Promise.resolve(true);
  }
  return fetch("getUserPermissions.php", { credentials: "include" })
    .then(response => response.json())
    .then(permissionsData => {
      console.log("checkUserFolderPermission: permissionsData =", permissionsData);
      if (permissionsData && permissionsData[username] && permissionsData[username].folderOnly) {
        window.userFolderOnly = true;
        localStorage.setItem("folderOnly", "true");
        localStorage.setItem("lastOpenedFolder", username);
        window.currentFolder = username;
        return true;
      } else {
        window.userFolderOnly = false;
        localStorage.setItem("folderOnly", "false");
        return false;
      }
    })
    .catch(err => {
      console.error("Error fetching user permissions:", err);
      window.userFolderOnly = false;
      return false;
    });
}

/* ----------------------
   DOM Building Functions for Folder Tree
----------------------*/
function renderFolderTree(tree, parentPath = "", defaultDisplay = "block") {
  const state = loadFolderTreeState();
  let html = `<ul class="folder-tree ${defaultDisplay === 'none' ? 'collapsed' : 'expanded'}">`;
  for (const folder in tree) {
    if (folder.toLowerCase() === "trash") continue;
    const fullPath = parentPath ? parentPath + "/" + folder : folder;
    const hasChildren = Object.keys(tree[folder]).length > 0;
    const displayState = state[fullPath] !== undefined ? state[fullPath] : defaultDisplay;
    html += `<li class="folder-item">`;
    if (hasChildren) {
      const toggleSymbol = (displayState === 'none') ? '[+]' : '[' + '<span class="custom-dash">-</span>' + ']';
      html += `<span class="folder-toggle" data-folder="${fullPath}">${toggleSymbol}</span>`;
    } else {
      html += `<span class="folder-indent-placeholder"></span>`;
    }
    html += `<span class="folder-option" data-folder="${fullPath}">${escapeHTML(folder)}</span>`;
    if (hasChildren) {
      html += renderFolderTree(tree[folder], fullPath, displayState);
    }
    html += `</li>`;
  }
  html += `</ul>`;
  return html;
}

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
          toggle.innerHTML = "[" + '<span class="custom-dash">-</span>' + "]";
          let state = loadFolderTreeState();
          state[cumulative] = "block";
          saveFolderTreeState(state);
        }
      }
    }
  });
}

/* ----------------------
   Drag & Drop Support for Folder Tree Nodes
----------------------*/
function folderDragOverHandler(event) {
  event.preventDefault();
  event.currentTarget.classList.add("drop-hover");
}

function folderDragLeaveHandler(event) {
  event.currentTarget.classList.remove("drop-hover");
}

function folderDropHandler(event) {
  event.preventDefault();
  event.currentTarget.classList.remove("drop-hover");
  const dropFolder = event.currentTarget.getAttribute("data-folder");
  let dragData;
  try {
    dragData = JSON.parse(event.dataTransfer.getData("application/json"));
  } catch (e) {
    console.error("Invalid drag data", e);
    return;
  }
  const filesToMove = dragData.files ? dragData.files : (dragData.fileName ? [dragData.fileName] : []);
  if (filesToMove.length === 0) return;
  fetch("moveFiles.php", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').getAttribute("content")
    },
    body: JSON.stringify({
      source: dragData.sourceFolder,
      files: filesToMove,
      destination: dropFolder
    })
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        showToast(`File(s) moved successfully to ${dropFolder}!`);
        loadFileList(dragData.sourceFolder);
      } else {
        showToast("Error moving files: " + (data.error || "Unknown error"));
      }
    })
    .catch(error => {
      console.error("Error moving files via drop:", error);
      showToast("Error moving files.");
    });
}

/* ----------------------
   Main Folder Tree Rendering and Event Binding
----------------------*/
export async function loadFolderTree(selectedFolder) {
  try {
    // Check if the user has folder-only permission.
    await checkUserFolderPermission();
    
    // Determine effective root folder.
    const username = localStorage.getItem("username") || "root";
    let effectiveRoot = "root";
    let effectiveLabel = "(Root)";
    if (window.userFolderOnly) {
      effectiveRoot = username; // Use the username as the personal root.
      effectiveLabel = `(Root)`;
      // Force override of any saved folder.
      localStorage.setItem("lastOpenedFolder", username);
      window.currentFolder = username;
    } else {
      window.currentFolder = localStorage.getItem("lastOpenedFolder") || "root";
    }
    
    // Build fetch URL.
    let fetchUrl = 'getFolderList.php';
    if (window.userFolderOnly) {
      fetchUrl += '?restricted=1';
    }
    console.log("Fetching folder list from:", fetchUrl);
    
    // Fetch folder list from the server.
    const response = await fetch(fetchUrl);
    if (response.status === 401) {
      console.error("Unauthorized: Please log in to view folders.");
      showToast("Session expired. Please log in again.");
      window.location.href = "logout.php";
      return;
    }
    let folderData = await response.json();
    console.log("Folder data received:", folderData);
    let folders = [];
    if (Array.isArray(folderData) && folderData.length && typeof folderData[0] === "object" && folderData[0].folder) {
      folders = folderData.map(item => item.folder);
    } else if (Array.isArray(folderData)) {
      folders = folderData;
    }
    
    // Remove any global "root" entry.
    folders = folders.filter(folder => folder.toLowerCase() !== "root");
    
    // If restricted, filter folders: keep only those that start with effectiveRoot + "/" (do not include effectiveRoot itself).
    if (window.userFolderOnly && effectiveRoot !== "root") {
      folders = folders.filter(folder => folder.startsWith(effectiveRoot + "/"));
      // Force current folder to be the effective root.
      localStorage.setItem("lastOpenedFolder", effectiveRoot);
      window.currentFolder = effectiveRoot;
    }
    
    localStorage.setItem("lastOpenedFolder", window.currentFolder);
    
    // Render the folder tree.
    const container = document.getElementById("folderTreeContainer");
    if (!container) {
      console.error("Folder tree container not found.");
      return;
    }
    
    let html = `<div id="rootRow" class="root-row">
      <span class="folder-toggle" data-folder="${effectiveRoot}">[<span class="custom-dash">-</span>]</span>
      <span class="folder-option root-folder-option" data-folder="${effectiveRoot}">${effectiveLabel}</span>
    </div>`;
    if (folders.length > 0) {
      const tree = buildFolderTree(folders);
      html += renderFolderTree(tree, "", "block");
    }
    container.innerHTML = html;
    
    // Attach drag/drop event listeners.
    container.querySelectorAll(".folder-option").forEach(el => {
      el.addEventListener("dragover", folderDragOverHandler);
      el.addEventListener("dragleave", folderDragLeaveHandler);
      el.addEventListener("drop", folderDropHandler);
    });
    
    if (selectedFolder) {
      window.currentFolder = selectedFolder;
    }
    localStorage.setItem("lastOpenedFolder", window.currentFolder);
    
    const titleEl = document.getElementById("fileListTitle");
    titleEl.innerHTML = "Files in (" + renderBreadcrumb(window.currentFolder) + ")";
    bindBreadcrumbEvents();
    loadFileList(window.currentFolder);
    
    const folderState = loadFolderTreeState();
    if (window.currentFolder !== effectiveRoot && folderState[window.currentFolder] !== "none") {
      expandTreePath(window.currentFolder);
    }
    
    const selectedEl = container.querySelector(`.folder-option[data-folder="${window.currentFolder}"]`);
    if (selectedEl) {
      container.querySelectorAll(".folder-option").forEach(item => item.classList.remove("selected"));
      selectedEl.classList.add("selected");
    }
    
    container.querySelectorAll(".folder-option").forEach(el => {
      el.addEventListener("click", function (e) {
        e.stopPropagation();
        container.querySelectorAll(".folder-option").forEach(item => item.classList.remove("selected"));
        this.classList.add("selected");
        const selected = this.getAttribute("data-folder");
        window.currentFolder = selected;
        localStorage.setItem("lastOpenedFolder", selected);
        const titleEl = document.getElementById("fileListTitle");
        titleEl.innerHTML = "Files in (" + renderBreadcrumb(selected) + ")";
        bindBreadcrumbEvents();
        loadFileList(selected);
      });
    });
    
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
            this.innerHTML = "[" + '<span class="custom-dash">-</span>' + "]";
            state[effectiveRoot] = "block";
          } else {
            nestedUl.classList.remove("expanded");
            nestedUl.classList.add("collapsed");
            this.textContent = "[+]";
            state[effectiveRoot] = "none";
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
            this.innerHTML = "[" + '<span class="custom-dash">-</span>' + "]";
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

/* ----------------------
   Folder Management (Rename, Delete, Create)
----------------------*/
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
  setTimeout(() => {
    const input = document.getElementById("newRenameFolderName");
    input.focus();
    input.select();
  }, 100);
}

document.getElementById("cancelRenameFolder").addEventListener("click", function () {
  document.getElementById("renameFolderModal").style.display = "none";
  document.getElementById("newRenameFolderName").value = "";
});
attachEnterKeyListener("renameFolderModal", "submitRenameFolder");
document.getElementById("submitRenameFolder").addEventListener("click", function (event) {
  event.preventDefault();
  const selectedFolder = window.currentFolder || "root";
  const newNameBasename = document.getElementById("newRenameFolderName").value.trim();
  if (!newNameBasename || newNameBasename === selectedFolder.split("/").pop()) {
    showToast("Please enter a valid new folder name.");
    return;
  }
  const parentPath = getParentFolder(selectedFolder);
  const newFolderFull = parentPath === "root" ? newNameBasename : parentPath + "/" + newNameBasename;
  const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
  if (!csrfToken) {
    showToast("CSRF token not loaded yet! Please try again.");
    return;
  }
  fetch("renameFolder.php", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken
    },
    body: JSON.stringify({ oldFolder: window.currentFolder, newFolder: newFolderFull })
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
attachEnterKeyListener("deleteFolderModal", "confirmDeleteFolder");
document.getElementById("confirmDeleteFolder").addEventListener("click", function () {
  const selectedFolder = window.currentFolder || "root";
  const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
  fetch("deleteFolder.php", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken
    },
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
  document.getElementById("newFolderName").focus();
});

document.getElementById("cancelCreateFolder").addEventListener("click", function () {
  document.getElementById("createFolderModal").style.display = "none";
  document.getElementById("newFolderName").value = "";
});
attachEnterKeyListener("createFolderModal", "submitCreateFolder");
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
  const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
  fetch("createFolder.php", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken
    },
    body: JSON.stringify({
      folderName: folderInput,
      parent: selectedFolder === "root" ? "" : selectedFolder
    })
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

// ---------- CONTEXT MENU SUPPORT FOR FOLDER MANAGER ----------
function showFolderManagerContextMenu(x, y, menuItems) {
  let menu = document.getElementById("folderManagerContextMenu");
  if (!menu) {
    menu = document.createElement("div");
    menu.id = "folderManagerContextMenu";
    menu.style.position = "absolute";
    menu.style.padding = "5px 0";
    menu.style.minWidth = "150px";
    menu.style.zIndex = "9999";
    document.body.appendChild(menu);
  }
  if (document.body.classList.contains("dark-mode")) {
    menu.style.backgroundColor = "#2c2c2c";
    menu.style.border = "1px solid #555";
    menu.style.color = "#e0e0e0";
  } else {
    menu.style.backgroundColor = "#fff";
    menu.style.border = "1px solid #ccc";
    menu.style.color = "#000";
  }
  menu.innerHTML = "";
  menuItems.forEach(item => {
    const menuItem = document.createElement("div");
    menuItem.textContent = item.label;
    menuItem.style.padding = "5px 15px";
    menuItem.style.cursor = "pointer";
    menuItem.addEventListener("mouseover", () => {
      if (document.body.classList.contains("dark-mode")) {
        menuItem.style.backgroundColor = "#444";
      } else {
        menuItem.style.backgroundColor = "#f0f0f0";
      }
    });
    menuItem.addEventListener("mouseout", () => {
      menuItem.style.backgroundColor = "";
    });
    menuItem.addEventListener("click", () => {
      item.action();
      hideFolderManagerContextMenu();
    });
    menu.appendChild(menuItem);
  });
  menu.style.left = x + "px";
  menu.style.top = y + "px";
  menu.style.display = "block";
}

function hideFolderManagerContextMenu() {
  const menu = document.getElementById("folderManagerContextMenu");
  if (menu) {
    menu.style.display = "none";
  }
}

function folderManagerContextMenuHandler(e) {
  e.preventDefault();
  e.stopPropagation();
  const target = e.target.closest(".folder-option, .breadcrumb-link");
  if (!target) return;
  const folder = target.getAttribute("data-folder");
  if (!folder) return;
  window.currentFolder = folder;
  document.querySelectorAll(".folder-option, .breadcrumb-link").forEach(el => el.classList.remove("selected"));
  target.classList.add("selected");
  const menuItems = [
    {
      label: "Create Folder",
      action: () => {
        document.getElementById("createFolderModal").style.display = "block";
        document.getElementById("newFolderName").focus();
      }
    },
    {
      label: "Rename Folder",
      action: () => { openRenameFolderModal(); }
    },
    {
      label: "Delete Folder",
      action: () => { openDeleteFolderModal(); }
    }
  ];
  showFolderManagerContextMenu(e.pageX, e.pageY, menuItems);
}

function bindFolderManagerContextMenu() {
  const container = document.getElementById("folderTreeContainer");
  if (container) {
    container.removeEventListener("contextmenu", folderManagerContextMenuHandler);
    container.addEventListener("contextmenu", folderManagerContextMenuHandler, false);
  }
  const breadcrumbNodes = document.querySelectorAll(".breadcrumb-link");
  breadcrumbNodes.forEach(node => {
    node.removeEventListener("contextmenu", folderManagerContextMenuHandler);
    node.addEventListener("contextmenu", folderManagerContextMenuHandler, false);
  });
}

document.addEventListener("click", function () {
  hideFolderManagerContextMenu();
});

document.addEventListener("DOMContentLoaded", function () {
  document.addEventListener("keydown", function (e) {
    const tag = e.target.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || e.target.isContentEditable) {
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace" || e.keyCode === 46 || e.keyCode === 8) {
      if (window.currentFolder && window.currentFolder !== "root") {
        e.preventDefault();
        openDeleteFolderModal();
      }
    }
  });
});

bindFolderManagerContextMenu();