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
  attachEnterKeyListener
} from './domUtils.js';

export let fileData = [];
export let sortOrder = { column: "uploaded", ascending: true };

window.itemsPerPage = window.itemsPerPage || 10;
window.currentPage = window.currentPage || 1;
window.viewMode = localStorage.getItem("viewMode") || "table"; // "table" or "gallery"

// ==============================
// VIEW MODE TOGGLE BUTTON
// ==============================
function createViewToggleButton() {
  let toggleBtn = document.getElementById("toggleViewBtn");
  if (!toggleBtn) {
    toggleBtn = document.createElement("button");
    toggleBtn.id = "toggleViewBtn";
    toggleBtn.classList.add("btn", "btn-secondary");
    const titleElem = document.getElementById("fileListTitle");
    if (titleElem) {
      titleElem.parentNode.insertBefore(toggleBtn, titleElem.nextSibling);
    }
  }
  toggleBtn.textContent = window.viewMode === "gallery" ? "Switch to Table View" : "Switch to Gallery View";
  toggleBtn.onclick = () => {
    window.viewMode = window.viewMode === "gallery" ? "table" : "gallery";
    localStorage.setItem("viewMode", window.viewMode);
    loadFileList(window.currentFolder);
    toggleBtn.textContent = window.viewMode === "gallery" ? "Switch to Table View" : "Switch to Gallery View";
  };
  return toggleBtn;
}
window.createViewToggleButton = createViewToggleButton;

// -----------------------------
// Helper: formatFolderName
// -----------------------------
function formatFolderName(folder) {
  if (folder === "root") return "(Root)";
  return folder
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}

// Expose inline DOM helpers.
window.toggleRowSelection = toggleRowSelection;
window.updateRowHighlight = updateRowHighlight;

// ==============================================
// FEATURE: Public File Sharing Modal
// ==============================================
function openShareModal(file, folder) {
  const existing = document.getElementById("shareModal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "shareModal";
  modal.classList.add("modal");
  modal.innerHTML = `
    <div class="modal-content share-modal-content" style="width: 600px; max-width:90vw;">
      <div class="modal-header">
        <h3>Share File: ${escapeHTML(file.name)}</h3>
        <span class="close-image-modal" id="closeShareModal" title="Close">&times;</span>
      </div>
      <div class="modal-body">
        <p>Set Expiration:</p>
        <select id="shareExpiration">
          <option value="30">30 minutes</option>
          <option value="60" selected>60 minutes</option>
          <option value="120">120 minutes</option>
          <option value="180">180 minutes</option>
          <option value="240">240 minutes</option>
          <option value="1440">1 Day</option>
        </select>
        <p>Password (optional):</p>
        <input type="text" id="sharePassword" placeholder="No password by default" style="width: 100%;"/>
        <br>
        <button id="generateShareLinkBtn" class="btn btn-primary" style="margin-top:10px;">Generate Share Link</button>
        <div id="shareLinkDisplay" style="margin-top: 10px; display:none;">
          <p>Shareable Link:</p>
          <input type="text" id="shareLinkInput" readonly style="width:100%;"/>
          <button id="copyShareLinkBtn" class="btn btn-primary" style="margin-top:5px;">Copy Link</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.style.display = "block";

  document.getElementById("closeShareModal").addEventListener("click", () => {
    modal.remove();
  });

  document.getElementById("generateShareLinkBtn").addEventListener("click", () => {
    const expiration = document.getElementById("shareExpiration").value;
    const password = document.getElementById("sharePassword").value;
    fetch("createShareLink.php", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": window.csrfToken
      },
      body: JSON.stringify({
        folder: folder,
        file: file.name,
        expirationMinutes: parseInt(expiration),
        password: password
      })
    })
      .then(response => response.json())
      .then(data => {
        if (data.token) {
          let shareEndpoint = document.querySelector('meta[name="share-url"]')
            ? document.querySelector('meta[name="share-url"]').getAttribute('content')
            : (window.SHARE_URL || "share.php");
          const shareUrl = `${shareEndpoint}?token=${encodeURIComponent(data.token)}`;
          const displayDiv = document.getElementById("shareLinkDisplay");
          const inputField = document.getElementById("shareLinkInput");
          inputField.value = shareUrl;
          displayDiv.style.display = "block";
        } else {
          showToast("Error generating share link: " + (data.error || "Unknown error"));
        }
      })
      .catch(err => {
        console.error("Error generating share link:", err);
        showToast("Error generating share link.");
      });
  });

  document.getElementById("copyShareLinkBtn").addEventListener("click", () => {
    const input = document.getElementById("shareLinkInput");
    input.select();
    document.execCommand("copy");
    showToast("Link copied to clipboard!");
  });
}

// ==============================================
// FEATURE: Enhanced Preview Modal with Navigation
// ==============================================
function previewFile(fileUrl, fileName) {
  let modal = document.getElementById("filePreviewModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "filePreviewModal";
    Object.assign(modal.style, {
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
      <div class="modal-content image-preview-modal-content" style="position: relative; max-width: 90vw; max-height: 90vh;">
        <span id="closeFileModal" class="close-image-modal" style="position: absolute; top: 10px; right: 10px; font-size: 24px; cursor: pointer;">&times;</span>
        <h4 class="image-modal-header"></h4>
        <div class="file-preview-container" style="position: relative; text-align: center;"></div>
      </div>`;
    document.body.appendChild(modal);

    function closeModal() {
      // Pause and reset any video or audio elements within the modal
      const mediaElements = modal.querySelectorAll("video, audio");
      mediaElements.forEach(media => {
        media.pause();
        try {
          media.currentTime = 0;
        } catch(e) {
          // Some media types might not support setting currentTime.
        }
      });
      modal.style.display = "none";
    }

    document.getElementById("closeFileModal").addEventListener("click", closeModal);
    modal.addEventListener("click", function (e) {
      if (e.target === modal) {
        closeModal();
      }
    });
  }
  modal.querySelector("h4").textContent = fileName;
  const container = modal.querySelector(".file-preview-container");
  container.innerHTML = "";

  const extension = fileName.split('.').pop().toLowerCase();
  const isImage = /\.(jpg|jpeg|png|gif|bmp|webp|svg|ico)$/i.test(fileName);
  if (isImage) {
    const img = document.createElement("img");
    img.src = fileUrl;
    img.className = "image-modal-img";
    img.style.maxWidth = "80vw";
    img.style.maxHeight = "80vh";
    container.appendChild(img);

    const images = fileData.filter(file => /\.(jpg|jpeg|png|gif|bmp|webp|svg|ico)$/i.test(file.name));
    if (images.length > 1) {
      modal.galleryImages = images;
      modal.galleryCurrentIndex = images.findIndex(f => f.name === fileName);

      const prevBtn = document.createElement("button");
      prevBtn.textContent = "‹";
      prevBtn.className = "gallery-nav-btn";
      prevBtn.style.cssText = "position: absolute; top: 50%; left: 10px; transform: translateY(-50%); background: transparent; border: none; color: white; font-size: 48px; cursor: pointer;";
      prevBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        modal.galleryCurrentIndex = (modal.galleryCurrentIndex - 1 + modal.galleryImages.length) % modal.galleryImages.length;
        let newFile = modal.galleryImages[modal.galleryCurrentIndex];
        modal.querySelector("h4").textContent = newFile.name;
        img.src = ((window.currentFolder === "root")
          ? "uploads/"
          : "uploads/" + window.currentFolder.split("/").map(encodeURIComponent).join("/") + "/")
          + encodeURIComponent(newFile.name) + "?t=" + new Date().getTime();
      });
      const nextBtn = document.createElement("button");
      nextBtn.textContent = "›";
      nextBtn.className = "gallery-nav-btn";
      nextBtn.style.cssText = "position: absolute; top: 50%; right: 10px; transform: translateY(-50%); background: transparent; border: none; color: white; font-size: 48px; cursor: pointer;";
      nextBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        modal.galleryCurrentIndex = (modal.galleryCurrentIndex + 1) % modal.galleryImages.length;
        let newFile = modal.galleryImages[modal.galleryCurrentIndex];
        modal.querySelector("h4").textContent = newFile.name;
        img.src = ((window.currentFolder === "root")
          ? "uploads/"
          : "uploads/" + window.currentFolder.split("/").map(encodeURIComponent).join("/") + "/")
          + encodeURIComponent(newFile.name) + "?t=" + new Date().getTime();
      });
      container.appendChild(prevBtn);
      container.appendChild(nextBtn);
    }
  } else {
    if (extension === "pdf") {
      const embed = document.createElement("embed");
      const separator = fileUrl.indexOf('?') === -1 ? '?' : '&';
      embed.src = fileUrl + separator + 't=' + new Date().getTime();
      embed.type = "application/pdf";
      embed.style.width = "80vw";
      embed.style.height = "80vh";
      embed.style.border = "none";
      container.appendChild(embed);
    } else if (/\.(mp4|webm|mov)$/i.test(fileName)) {
      const video = document.createElement("video");
      video.src = fileUrl;
      video.controls = true;
      video.className = "image-modal-img";
      container.appendChild(video);
    } else if (/\.(mp3|wav|m4a|ogg|flac|aac|wma|opus)$/i.test(fileName)) {
      const audio = document.createElement("audio");
      audio.src = fileUrl;
      audio.controls = true;
      audio.className = "audio-modal";
      audio.style.maxWidth = "80vw";
      container.appendChild(audio);
    } else {
      container.textContent = "Preview not available for this file type.";
    }
  }
  modal.style.display = "flex";
}

// ==============================================
// ORIGINAL FILE MANAGER FUNCTIONS
// ==============================================
export function loadFileList(folderParam) {
  const folder = folderParam || "root";
  const fileListContainer = document.getElementById("fileList");

  fileListContainer.style.visibility = "hidden";
  fileListContainer.innerHTML = "<div class='loader'>Loading files...</div>";

  return fetch("getFileList.php?folder=" + encodeURIComponent(folder) + "&recursive=1&t=" + new Date().getTime())
    .then(response => {
      if (response.status === 401) {
        showToast("Session expired. Please log in again.");
        window.location.href = "logout.php";
        throw new Error("Unauthorized");
      }
      return response.json();
    })
    .then(data => {
      fileListContainer.innerHTML = "";
      if (data.files && data.files.length > 0) {
        data.files = data.files.map(file => {
          file.fullName = (file.path || file.name).trim().toLowerCase();
          file.editable = canEditFile(file.name);
          file.folder = folder;
          if (!file.type && /\.(jpg|jpeg|png|gif|bmp|webp|svg|ico)$/i.test(file.name)) {
            file.type = "image";
          }
          return file;
        });
        fileData = data.files;
        if (window.viewMode === "gallery") {
          renderGalleryView(folder);
        } else {
          renderFileTable(folder);
        }
      } else {
        fileListContainer.textContent = "No files found.";
        updateFileActionButtons();
      }
      return data.files || [];
    })
    .catch(error => {
      console.error("Error loading file list:", error);
      if (error.message !== "Unauthorized") {
        fileListContainer.textContent = "Error loading files.";
      }
      return [];
    })
    .finally(() => {
      fileListContainer.style.visibility = "visible";
    });
}

//
// --- DRAG & DROP SUPPORT FOR FILE ROWS ---
//
function fileDragStartHandler(event) {
  const row = event.currentTarget;
  // Check if multiple file checkboxes are selected.
  const selectedCheckboxes = document.querySelectorAll("#fileList .file-checkbox:checked");
  let fileNames = [];
  if (selectedCheckboxes.length > 1) {
    // Gather file names from all selected rows.
    selectedCheckboxes.forEach(chk => {
      const parentRow = chk.closest("tr");
      if (parentRow) {
        const cell = parentRow.querySelector("td:nth-child(2)");
        if (cell) fileNames.push(cell.textContent.trim());
      }
    });
  } else {
    // Only one file is selected (or none), so get file name from the current row.
    const fileNameCell = row.querySelector("td:nth-child(2)");
    if (fileNameCell) {
      fileNames.push(fileNameCell.textContent.trim());
    }
  }
  if (fileNames.length === 0) return;
  const dragData = {
    files: fileNames, // use an array of file names
    sourceFolder: window.currentFolder || "root"
  };
  event.dataTransfer.setData("application/json", JSON.stringify(dragData));

  // (Keep your custom drag image code here.)
  let dragImage;
  if (fileNames.length > 1) {
    dragImage = document.createElement("div");
    dragImage.style.display = "inline-flex";
    dragImage.style.width = "auto";
    dragImage.style.maxWidth = "fit-content";
    dragImage.style.padding = "6px 10px";
    dragImage.style.backgroundColor = "#333";
    dragImage.style.color = "#fff";
    dragImage.style.border = "1px solid #555";
    dragImage.style.borderRadius = "4px";
    dragImage.style.alignItems = "center";
    dragImage.style.boxShadow = "2px 2px 6px rgba(0,0,0,0.3)";
    const icon = document.createElement("span");
    icon.className = "material-icons";
    icon.textContent = "insert_drive_file";
    icon.style.marginRight = "4px";
    const countSpan = document.createElement("span");
    countSpan.textContent = fileNames.length + " files";
    dragImage.appendChild(icon);
    dragImage.appendChild(countSpan);
  } else {
    dragImage = document.createElement("div");
    dragImage.style.display = "inline-flex";
    dragImage.style.width = "auto";
    dragImage.style.maxWidth = "fit-content";
    dragImage.style.padding = "6px 10px";
    dragImage.style.backgroundColor = "#333";
    dragImage.style.color = "#fff";
    dragImage.style.border = "1px solid #555";
    dragImage.style.borderRadius = "4px";
    dragImage.style.alignItems = "center";
    dragImage.style.boxShadow = "2px 2px 6px rgba(0,0,0,0.3)";
    const icon = document.createElement("span");
    icon.className = "material-icons";
    icon.textContent = "insert_drive_file";
    icon.style.marginRight = "4px";
    const nameSpan = document.createElement("span");
    nameSpan.textContent = fileNames[0];
    dragImage.appendChild(icon);
    dragImage.appendChild(nameSpan);
  }
  document.body.appendChild(dragImage);
  event.dataTransfer.setDragImage(dragImage, 5, 5);
  setTimeout(() => {
    document.body.removeChild(dragImage);
  }, 0);
}

//
// --- RENDER FILE TABLE (TABLE VIEW) ---
//
export function renderFileTable(folder) {
  const fileListContainer = document.getElementById("fileList");
  const searchTerm = window.currentSearchTerm || "";
  const itemsPerPageSetting = parseInt(localStorage.getItem("itemsPerPage") || "10", 10);
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

  const folderPath = folder === "root"
    ? "uploads/"
    : "uploads/" + folder.split("/").map(encodeURIComponent).join("/") + "/";

  const topControlsHTML = buildSearchAndPaginationControls({
    currentPage,
    totalPages,
    searchTerm
  });
  let headerHTML = buildFileTableHeader(sortOrder);
  const startIndex = (currentPage - 1) * itemsPerPageSetting;
  const endIndex = Math.min(startIndex + itemsPerPageSetting, totalFiles);
  let rowsHTML = "<tbody>";
  if (totalFiles > 0) {
    filteredFiles.slice(startIndex, endIndex).forEach(file => {
      let rowHTML = buildFileTableRow(file, folderPath);
      // Insert share button into the actions cell.
      rowHTML = rowHTML.replace(/(<\/div>\s*<\/td>\s*<\/tr>)/, `<button class="share-btn btn btn-sm btn-secondary" data-file="${escapeHTML(file.name)}" title="Share">
            <i class="material-icons">share</i>
          </button>$1`);
      rowsHTML += rowHTML;
    });
  } else {
    rowsHTML += `<tr><td colspan="8">No files found.</td></tr>`;
  }
  rowsHTML += "</tbody></table>";
  const bottomControlsHTML = buildBottomControls(itemsPerPageSetting);
  fileListContainer.innerHTML = topControlsHTML + headerHTML + rowsHTML + bottomControlsHTML;

  createViewToggleButton();

  const newSearchInput = document.getElementById("searchInput");
  if (newSearchInput) {
    newSearchInput.addEventListener("input", debounce(function () {
      window.currentSearchTerm = newSearchInput.value;
      window.currentPage = 1;
      renderFileTable(folder);
      // After re‑render, re-select the input element and set focus.
      setTimeout(() => {
        const freshInput = document.getElementById("searchInput");
        if (freshInput) {
          freshInput.focus();
          // Place the caret at the end of the text.
          const len = freshInput.value.length;
          freshInput.setSelectionRange(len, len);
        }
      }, 0);
    }, 300));
  }

  document.querySelectorAll("table.table thead th[data-column]").forEach(cell => {
    cell.addEventListener("click", function () {
      const column = this.getAttribute("data-column");
      sortFiles(column, folder);
    });
  });

  document.querySelectorAll("#fileList .file-checkbox").forEach(checkbox => {
    checkbox.addEventListener("change", function (e) {
      updateRowHighlight(e.target);
      updateFileActionButtons();
    });
  });

  document.querySelectorAll(".share-btn").forEach(btn => {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      const fileName = this.getAttribute("data-file");
      const file = fileData.find(f => f.name === fileName);
      if (file) {
        openShareModal(file, folder);
      }
    });
  });

  updateFileActionButtons();

  // Add drag-and-drop support for each table row.
  document.querySelectorAll("#fileList tbody tr").forEach(row => {
    row.setAttribute("draggable", "true");
    row.addEventListener("dragstart", fileDragStartHandler);
  });
}

//
// --- RENDER GALLERY VIEW ---
//
export function renderGalleryView(folder) {
  const fileListContainer = document.getElementById("fileList");
  const folderPath = folder === "root"
    ? "uploads/"
    : "uploads/" + folder.split("/").map(encodeURIComponent).join("/") + "/";
  const gridStyle = "display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; padding: 10px;";
  let galleryHTML = `<div class="gallery-container" style="${gridStyle}">`;
  fileData.forEach((file) => {
    let thumbnail;
    if (/\.(jpg|jpeg|png|gif|bmp|webp|svg|ico)$/i.test(file.name)) {
      thumbnail = `<img src="${folderPath + encodeURIComponent(file.name)}?t=${new Date().getTime()}" class="gallery-thumbnail" alt="${escapeHTML(file.name)}" style="max-width: 100%; max-height: 150px; display: block; margin: 0 auto;">`;
    } else if (/\.(mp3|wav|m4a|ogg|flac|aac|wma|opus)$/i.test(file.name)) {
      thumbnail = `<span class="material-icons gallery-icon">audiotrack</span>`;
    } else {
      thumbnail = `<span class="material-icons gallery-icon">insert_drive_file</span>`;
    }
    galleryHTML += `<div class="gallery-card" style="border: 1px solid #ccc; padding: 5px; text-align: center;">
      <div class="gallery-preview" style="cursor: pointer;" onclick="previewFile('${folderPath + encodeURIComponent(file.name)}?t=' + new Date().getTime(), '${file.name}')">
        ${thumbnail}
      </div>
      <div class="gallery-info" style="margin-top: 5px;">
        <span class="gallery-file-name" style="display: block;">${escapeHTML(file.name)}</span>
        <div class="button-wrap" style="display: flex; justify-content: center; gap: 5px;">
          <a class="btn btn-sm btn-success download-btn" 
             href="download.php?folder=${encodeURIComponent(file.folder || 'root')}&file=${encodeURIComponent(file.name)}" 
             title="Download">
            <i class="material-icons">file_download</i>
          </a>
          ${file.editable ? `
            <button class="btn btn-sm edit-btn"  onclick='editFile(${JSON.stringify(file.name)}, ${JSON.stringify(file.folder || "root")})' title="Edit">
              <i class="material-icons">edit</i>
            </button>
          ` : ""}
          <button class="btn btn-sm btn-warning rename-btn" onclick='renameFile(${JSON.stringify(file.name)}, ${JSON.stringify(file.folder || "root")})' title="Rename">
             <i class="material-icons">drive_file_rename_outline</i>
          </button>
          <button class="btn btn-sm btn-secondary share-btn" onclick='openShareModal(${JSON.stringify(file)}, ${JSON.stringify(folder)})' title="Share">
             <i class="material-icons">share</i>
          </button>
        </div>
      </div>
    </div>`;
  });
  galleryHTML += "</div>";
  fileListContainer.innerHTML = galleryHTML;

  // Re-bind share button events if necessary.
  document.querySelectorAll(".gallery-share-btn").forEach(btn => {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      const fileName = this.getAttribute("data-file");
      const folder = this.getAttribute("data-folder");
      const file = fileData.find(f => f.name === fileName);
      if (file) {
        openShareModal(file, folder);
      }
    });
  });

  createViewToggleButton();
  updateFileActionButtons();
}

//
// --- SORT FILES & PARSE DATE ---
//
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
  if (window.viewMode === "gallery") {
    renderGalleryView(folder);
  } else {
    renderFileTable(folder);
  }
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

//
// --- FILE ACTIONS: DELETE, DOWNLOAD, COPY, MOVE ---
//
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
  attachEnterKeyListener("deleteFilesModal", "confirmDeleteFiles");
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
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": window.csrfToken
        },
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
attachEnterKeyListener("downloadZipModal", "confirmDownloadZip");
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
  setTimeout(() => {
    const input = document.getElementById("zipFileNameInput");
    input.focus();
  }, 100);
  
}

export function handleExtractZipSelected(e) {
  if (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  // Get selected file names
  const checkboxes = document.querySelectorAll(".file-checkbox:checked");
  if (!checkboxes.length) {
    showToast("No files selected.");
    return;
  }
  // Filter for zip files only
  const zipFiles = Array.from(checkboxes)
    .map(chk => chk.value)
    .filter(name => name.toLowerCase().endsWith(".zip"));
  if (!zipFiles.length) {
    showToast("No zip files selected.");
    return;
  }
  // Call the extract endpoint with the selected zip files
  fetch("extractZip.php", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": window.csrfToken
    },
    body: JSON.stringify({
      folder: window.currentFolder || "root",
      files: zipFiles
    })
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        // If the server returned a list of extracted files, join them into a string.
        let toastMessage = "Zip file(s) extracted successfully!";
        if (data.extractedFiles && Array.isArray(data.extractedFiles) && data.extractedFiles.length) {
          toastMessage = "Extracted: " + data.extractedFiles.join(", ");
        }
        showToast(toastMessage);
        loadFileList(window.currentFolder);
      } else {
        showToast("Error extracting zip: " + (data.error || "Unknown error"));
      }
    })
    .catch(error => {
      console.error("Error extracting zip files:", error);
      showToast("Error extracting zip files.");
    });
}

const extractZipBtn = document.getElementById("extractZipBtn");
if (extractZipBtn) {
  extractZipBtn.replaceWith(extractZipBtn.cloneNode(true));
  document.getElementById("extractZipBtn").addEventListener("click", handleExtractZipSelected);
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
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": window.csrfToken
        },
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
    const response = await fetch("getFolderList.php");
    let folders = await response.json();
    if (Array.isArray(folders) && folders.length && typeof folders[0] === "object" && folders[0].folder) {
      folders = folders.map(item => item.folder);
    }
    folders = folders.filter(folder => folder !== "root");
    const folderSelect = document.getElementById(dropdownId);
    folderSelect.innerHTML = "";
    const rootOption = document.createElement("option");
    rootOption.value = "root";
    rootOption.textContent = "(Root)";
    folderSelect.appendChild(rootOption);
    if (Array.isArray(folders) && folders.length > 0) {
      folders.forEach(folder => {
        const option = document.createElement("option");
        option.value = folder;
        option.textContent = formatFolderName(folder);
        folderSelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error("Error loading folder list for modal:", error);
  }
}

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
        showToast("Please select a target folder for copying.", 5000);
        return;
      }
      if (targetFolder === window.currentFolder) {
        showToast("Error: Cannot copy files to the same folder.");
        return;
      }
      fetch("copyFiles.php", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": window.csrfToken
        },
        body: JSON.stringify({
          source: window.currentFolder,
          files: window.filesToCopy,
          destination: targetFolder
        })
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
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": window.csrfToken
        },
        body: JSON.stringify({
          source: window.currentFolder,
          files: window.filesToMove,
          destination: targetFolder
        })
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

//
// --- FOLDER TREE DRAG & DROP SUPPORT ---
// When a draggable file is dragged over a folder node, allow the drop and highlight it.
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
    console.error("Invalid drag data");
    return;
  }
  if (!dragData || !dragData.fileName) return;
  fetch("moveFiles.php", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').getAttribute("content")
    },
    body: JSON.stringify({
      source: dragData.sourceFolder,
      files: [dragData.fileName],
      destination: dropFolder
    })
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        showToast(`File "${dragData.fileName}" moved successfully to ${dropFolder}!`);
        loadFileList(dragData.sourceFolder);
      } else {
        showToast("Error moving file: " + (data.error || "Unknown error"));
      }
    })
    .catch(error => {
      console.error("Error moving file via drop:", error);
      showToast("Error moving file.");
    });
}

//
// --- CODEMIRROR EDITOR & UTILITY FUNCTIONS ---
//
function getModeForFile(fileName) {
  const ext = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
  switch (ext) {
    case "css":
      return "css";
    case "json":
      return { name: "javascript", json: true };
    case "js":
      return "javascript";
    case "html":
    case "htm":
      return "text/html";
    case "xml":
      return "xml";
    default:
      return "text/plain";
  }
}

function adjustEditorSize() {
  const modal = document.querySelector(".editor-modal");
  if (modal && window.currentEditor) {
    // Calculate available height for the editor.
    // If you have a header or footer inside the modal, subtract their heights.
    const headerHeight = 60; // adjust this value as needed
    const availableHeight = modal.clientHeight - headerHeight;
    window.currentEditor.setSize("100%", availableHeight + "px");
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
  let existingEditor = document.getElementById("editorContainer");
  if (existingEditor) {
    existingEditor.remove();
  }
  const folderUsed = folder || window.currentFolder || "root";
  const folderPath = folderUsed === "root"
    ? "uploads/"
    : "uploads/" + folderUsed.split("/").map(encodeURIComponent).join("/") + "/";
  const fileUrl = folderPath + encodeURIComponent(fileName) + "?t=" + new Date().getTime();

  fetch(fileUrl, { method: "HEAD" })
    .then(response => {
      const contentLength = response.headers.get("Content-Length");
      if (contentLength !== null && parseInt(contentLength) > 10485760) {
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
        <div class="editor-controls">
           <button id="decreaseFont" class="btn btn-sm btn-secondary">A-</button>
           <button id="increaseFont" class="btn btn-sm btn-secondary">A+</button>
        </div>
        <button id="closeEditorX" class="editor-close-btn">&times;</button>
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
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": window.csrfToken
    },
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
  // Use the underlying File object if it exists (for resumable files)
  const actualFile = file.file || file;
  container.style.display = "inline-block";
  if (/\.(jpg|jpeg|png|gif|bmp|webp|svg|ico)$/i.test(actualFile.name)) {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(actualFile);
    img.classList.add("file-preview-img");
    container.innerHTML = ""; // Clear previous content
    container.appendChild(img);
  } else {
    container.innerHTML = ""; // Clear previous content
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
  const extractZipBtn = document.getElementById("extractZipBtn");
  if (extractZipBtn) {
    extractZipBtn.replaceWith(extractZipBtn.cloneNode(true));
    document.getElementById("extractZipBtn").addEventListener("click", handleExtractZipSelected);
  }
}
attachEnterKeyListener("renameFileModal", "submitRenameFile");
export function renameFile(oldName, folder) {
  window.fileToRename = oldName;
  window.fileFolder = folder || window.currentFolder || "root";
  document.getElementById("newFileName").value = oldName;
  document.getElementById("renameFileModal").style.display = "block";
  setTimeout(() => {
    const input = document.getElementById("newFileName");
    input.focus();
    const lastDot = oldName.lastIndexOf('.');
    if (lastDot > 0) {
      input.setSelectionRange(0, lastDot);
    } else {
      input.select();
    }
  }, 100);
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
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": window.csrfToken
        },
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
window.previewFile = previewFile;

//
// --- Expose Drag-Drop Support for Folder Tree Nodes ---
// (Attach dragover, dragleave, and drop events to folder tree nodes)
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".folder-option").forEach(el => {
    el.addEventListener("dragover", folderDragOverHandler);
    el.addEventListener("dragleave", folderDragLeaveHandler);
    el.addEventListener("drop", folderDropHandler);
  });
});

document.addEventListener("keydown", function(e) {
  // Skip if focus is on an input, textarea, or any contentEditable element.
  const tag = e.target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || e.target.isContentEditable) {
    return;
  }
  // On Mac, the delete key is often reported as "Backspace" (keyCode 8)
  if (e.key === "Delete" || e.key === "Backspace" || e.keyCode === 46 || e.keyCode === 8) {
    const selectedCheckboxes = document.querySelectorAll("#fileList .file-checkbox:checked");
    if (selectedCheckboxes.length > 0) {
      e.preventDefault(); // Prevent default back navigation in some browsers.
      handleDeleteSelected(new Event("click"));
    }
  }
});

// ---------- CONTEXT MENU SUPPORT FOR FILE LIST ----------

// Function to display the context menu with provided items at (x, y)
// Function to display the context menu with provided items at (x, y)
function showFileContextMenu(x, y, menuItems) {
  let menu = document.getElementById("fileContextMenu");
  if (!menu) {
    menu = document.createElement("div");
    menu.id = "fileContextMenu";
    // Use fixed positioning so the menu is relative to the viewport
    menu.style.position = "fixed";
    menu.style.backgroundColor = "#fff";
    menu.style.border = "1px solid #ccc";
    menu.style.boxShadow = "2px 2px 6px rgba(0,0,0,0.2)";
    menu.style.zIndex = "9999";
    menu.style.padding = "5px 0";
    menu.style.minWidth = "150px";
    document.body.appendChild(menu);
  }
  // Clear previous items
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
  
  // Use the event's clientX and clientY coordinates (which are viewport-relative)
  menu.style.left = x + "px";
  menu.style.top = y + "px";
  menu.style.display = "block";
  
  // Adjust if the menu would extend past the bottom of the viewport
  const menuRect = menu.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  if (menuRect.bottom > viewportHeight) {
    let newTop = viewportHeight - menuRect.height;
    if (newTop < 0) newTop = 0;
    menu.style.top = newTop + "px";
  }
}

function hideFileContextMenu() {
  const menu = document.getElementById("fileContextMenu");
  if (menu) {
    menu.style.display = "none";
  }
}

// Context menu handler for the file list.
function fileListContextMenuHandler(e) {
  e.preventDefault();
  // If no file is selected, try to select the row that was right-clicked.
  let row = e.target.closest("tr");
  if (row) {
    const checkbox = row.querySelector(".file-checkbox");
    if (checkbox && !checkbox.checked) {
      checkbox.checked = true;
      updateRowHighlight(checkbox);
      updateFileActionButtons();
    }
  }
  
  // Get selected file names.
  const selected = Array.from(document.querySelectorAll("#fileList .file-checkbox:checked")).map(chk => chk.value);
  
  // Build the context menu items.
  let menuItems = [
    { label: "Delete Selected", action: () => { handleDeleteSelected(new Event("click")); } },
    { label: "Copy Selected", action: () => { handleCopySelected(new Event("click")); } },
    { label: "Move Selected", action: () => { handleMoveSelected(new Event("click")); } },
    { label: "Download Zip", action: () => { handleDownloadZipSelected(new Event("click")); } }
  ];
  
  if (selected.some(name => name.toLowerCase().endsWith(".zip"))) {
    menuItems.push({
      label: "Extract Zip",
      action: () => { handleExtractZipSelected(new Event("click")); }
    });
  }
  
  if (selected.length === 1) {
    // Look up the file object.
    const file = fileData.find(f => f.name === selected[0]);
    
    // Add Preview option.
    menuItems.push({
      label: "Preview",
      action: () => {
        const folder = window.currentFolder || "root";
        const folderPath = folder === "root"
          ? "uploads/"
          : "uploads/" + folder.split("/").map(encodeURIComponent).join("/") + "/";
        previewFile(folderPath + encodeURIComponent(file.name) + "?t=" + new Date().getTime(), file.name);
      }
    });
    
    // Only show Edit option if file is editable.
    if (canEditFile(file.name)) {
      menuItems.push({
        label: "Edit",
        action: () => { editFile(selected[0], window.currentFolder); }
      });
    }
    
    // Add Rename option.
    menuItems.push({
      label: "Rename",
      action: () => { renameFile(selected[0], window.currentFolder); }
    });
  }
  
  showFileContextMenu(e.clientX, e.clientY, menuItems);
}

// Bind the context menu to the file list container.
// (This is set every time the file list is rendered.)
function bindFileListContextMenu() {
  const fileListContainer = document.getElementById("fileList");
  if (fileListContainer) {
    fileListContainer.oncontextmenu = fileListContextMenuHandler;
  }
}

// Hide the context menu if clicking anywhere else.
document.addEventListener("click", function(e) {
  const menu = document.getElementById("fileContextMenu");
  if (menu && menu.style.display === "block") {
    hideFileContextMenu();
  }
});

// After rendering the file table, bind the context menu handler.
(function() {
  const originalRenderFileTable = renderFileTable;
  renderFileTable = function(folder) {
    originalRenderFileTable(folder);
    bindFileListContextMenu();
  };
})();