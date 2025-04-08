// contextMenu.js
import { updateRowHighlight, showToast } from './domUtils.js';
import { handleDeleteSelected, handleCopySelected, handleMoveSelected, handleDownloadZipSelected, handleExtractZipSelected, renameFile } from './fileActions.js';
import { previewFile } from './filePreview.js';
import { editFile } from './fileEditor.js';
import { canEditFile, fileData } from './fileListView.js';
import { openTagModal, openMultiTagModal } from './fileTags.js';
import { t } from './i18n.js';

export function showFileContextMenu(x, y, menuItems) {
  let menu = document.getElementById("fileContextMenu");
  if (!menu) {
    menu = document.createElement("div");
    menu.id = "fileContextMenu";
    menu.style.position = "fixed";
    menu.style.backgroundColor = "#fff";
    menu.style.border = "1px solid #ccc";
    menu.style.boxShadow = "2px 2px 6px rgba(0,0,0,0.2)";
    menu.style.zIndex = "9999";
    menu.style.padding = "5px 0";
    menu.style.minWidth = "150px";
    document.body.appendChild(menu);
  }
  menu.innerHTML = "";
  menuItems.forEach(item => {
    let menuItem = document.createElement("div");
    menuItem.textContent = item.label;
    menuItem.style.padding = "5px 15px";
    menuItem.style.cursor = "pointer";
    menuItem.addEventListener("mouseover", () => {
      menuItem.style.backgroundColor = document.body.classList.contains("dark-mode") ? "#444" : "#f0f0f0";
    });
    menuItem.addEventListener("mouseout", () => {
      menuItem.style.backgroundColor = "";
    });
    menuItem.addEventListener("click", () => {
      item.action();
      hideFileContextMenu();
    });
    menu.appendChild(menuItem);
  });
  
  menu.style.left = x + "px";
  menu.style.top = y + "px";
  menu.style.display = "block";
  
  const menuRect = menu.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  if (menuRect.bottom > viewportHeight) {
    let newTop = viewportHeight - menuRect.height;
    if (newTop < 0) newTop = 0;
    menu.style.top = newTop + "px";
  }
}

export function hideFileContextMenu() {
  const menu = document.getElementById("fileContextMenu");
  if (menu) {
    menu.style.display = "none";
  }
}

export function fileListContextMenuHandler(e) {
  e.preventDefault();
  
  let row = e.target.closest("tr");
  if (row) {
    const checkbox = row.querySelector(".file-checkbox");
    if (checkbox && !checkbox.checked) {
      checkbox.checked = true;
      updateRowHighlight(checkbox);
    }
  }
  
  const selected = Array.from(document.querySelectorAll("#fileList .file-checkbox:checked")).map(chk => chk.value);
  
  let menuItems = [
    { label: t("delete_selected"), action: () => { handleDeleteSelected(new Event("click")); } },
    { label: t("copy_selected"), action: () => { handleCopySelected(new Event("click")); } },
    { label: t("move_selected"), action: () => { handleMoveSelected(new Event("click")); } },
    { label: t("download_zip"), action: () => { handleDownloadZipSelected(new Event("click")); } }
  ];
  
  if (selected.some(name => name.toLowerCase().endsWith(".zip"))) {
    menuItems.push({
      label: t("extract_zip"),
      action: () => { handleExtractZipSelected(new Event("click")); }
    });
  }
  
  if (selected.length > 1) {
    menuItems.push({
      label: t("tag_selected"),
      action: () => {
        const files = fileData.filter(f => selected.includes(f.name));
        openMultiTagModal(files);
      }
    });
  }
  else if (selected.length === 1) {
    const file = fileData.find(f => f.name === selected[0]);
    
    menuItems.push({
      label: t("preview"),
      action: () => {
        const folder = window.currentFolder || "root";
        const folderPath = folder === "root"
          ? "uploads/"
          : "uploads/" + folder.split("/").map(encodeURIComponent).join("/") + "/";
        previewFile(folderPath + encodeURIComponent(file.name) + "?t=" + new Date().getTime(), file.name);
      }
    });
    
    if (canEditFile(file.name)) {
      menuItems.push({
        label: t("edit"),
        action: () => { editFile(selected[0], window.currentFolder); }
      });
    }
    
    menuItems.push({
      label: t("rename"),
      action: () => { renameFile(selected[0], window.currentFolder); }
    });
    
    menuItems.push({
      label: t("tag_file"),
      action: () => { openTagModal(file); }
    });
  }
  
  showFileContextMenu(e.clientX, e.clientY, menuItems);
}

export function bindFileListContextMenu() {
  const fileListContainer = document.getElementById("fileList");
  if (fileListContainer) {
    fileListContainer.oncontextmenu = fileListContextMenuHandler;
  }
}

document.addEventListener("click", function(e) {
  const menu = document.getElementById("fileContextMenu");
  if (menu && menu.style.display === "block") {
    hideFileContextMenu();
  }
});

// Rebind context menu after file table render.
(function() {
  const originalRenderFileTable = window.renderFileTable;
  window.renderFileTable = function(folder) {
    originalRenderFileTable(folder);
    bindFileListContextMenu();
  };
})();