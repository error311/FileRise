// domUtils.js

// Basic DOM Helpers
export function toggleVisibility(elementId, shouldShow) {
  const element = document.getElementById(elementId);
  if (element) {
    element.style.display = shouldShow ? "block" : "none";
  } else {
    console.error(`Element with id "${elementId}" not found.`);
  }
}

export function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function toggleAllCheckboxes(masterCheckbox) {
  const checkboxes = document.querySelectorAll(".file-checkbox");
  checkboxes.forEach(chk => {
    chk.checked = masterCheckbox.checked;
  });
  updateFileActionButtons(); // update buttons based on current selection
}

export function updateFileActionButtons() {
  const fileListContainer = document.getElementById("fileList");
  const fileCheckboxes = document.querySelectorAll("#fileList .file-checkbox");
  const selectedCheckboxes = document.querySelectorAll("#fileList .file-checkbox:checked");
  const copyBtn = document.getElementById("copySelectedBtn");
  const moveBtn = document.getElementById("moveSelectedBtn");
  const deleteBtn = document.getElementById("deleteSelectedBtn");
  const zipBtn = document.getElementById("downloadZipBtn");

  if (fileCheckboxes.length === 0) {
    if (copyBtn) copyBtn.style.display = "none";
    if (moveBtn) moveBtn.style.display = "none";
    if (deleteBtn) deleteBtn.style.display = "none";
    if (zipBtn) zipBtn.style.display = "none";
  } else {
    if (copyBtn) copyBtn.style.display = "inline-block";
    if (moveBtn) moveBtn.style.display = "inline-block";
    if (deleteBtn) deleteBtn.style.display = "inline-block";
    if (zipBtn) zipBtn.style.display = "inline-block";

    if (selectedCheckboxes.length > 0) {
      if (copyBtn) copyBtn.disabled = false;
      if (moveBtn) moveBtn.disabled = false;
      if (deleteBtn) deleteBtn.disabled = false;
      if (zipBtn) zipBtn.disabled = false;
    } else {
      if (copyBtn) copyBtn.disabled = true;
      if (moveBtn) moveBtn.disabled = true;
      if (deleteBtn) deleteBtn.disabled = true;
      if (zipBtn) zipBtn.disabled = true;
    }
  }
}

export function showToast(message, duration = 3000) {
  const toast = document.getElementById("customToast");
  if (!toast) {
    console.error("Toast element not found");
    return;
  }
  toast.textContent = message;
  toast.style.display = "block";
  // Force reflow for transition effect.
  void toast.offsetWidth;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      toast.style.display = "none";
    }, 500);
  }, duration);
}

// --- DOM Building Functions for File Table ---

export function buildSearchAndPaginationControls({ currentPage, totalPages, searchTerm }) {
  const safeSearchTerm = escapeHTML(searchTerm);
  return `
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
          <button class="custom-prev-next-btn" ${currentPage === totalPages ? "disabled" : ""} onclick="changePage(${currentPage + 1})">Next</button>
        </div>
      </div>
    </div>
  `;
}

export function buildFileTableHeader(sortOrder) {
  return `
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
}

export function buildFileTableRow(file, folderPath) {
  const safeFileName = escapeHTML(file.name);
  const safeModified = escapeHTML(file.modified);
  const safeUploaded = escapeHTML(file.uploaded);
  const safeSize = escapeHTML(file.size);
  const safeUploader = escapeHTML(file.uploader || "Unknown");

  let previewButton = "";
  if (/\.(jpg|jpeg|png|gif|bmp|webp|svg|ico|tif|tiff|eps|heic|pdf|mp4|webm|mov|ogg)$/i.test(file.name)) {
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

  return `
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
          ${file.editable ? `<button class="btn btn-sm btn-primary ml-2" onclick='editFile(${JSON.stringify(file.name)}, ${JSON.stringify(file.folder || "root")})'>Edit</button>` : ""}
          ${previewButton}
          <button class="btn btn-sm btn-warning ml-2" onclick='renameFile(${JSON.stringify(file.name)}, ${JSON.stringify(file.folder || "root")})'>Rename</button>
        </div>
      </td>
    </tr>
  `;
}

export function buildBottomControls(itemsPerPageSetting) {
  return `
    <div class="d-flex align-items-center mt-3 bottom-controls">
      <label class="label-inline mr-2 mb-0">Show</label>
      <select class="form-control bottom-select" onchange="changeItemsPerPage(this.value)">
        ${[10, 20, 50, 100].map(num => `<option value="${num}" ${num === itemsPerPageSetting ? "selected" : ""}>${num}</option>`).join("")}
      </select>
      <span class="items-per-page-text ml-2 mb-0">items per page</span>
    </div>
  `;
}

// --- Global Helper Functions ---

export function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

export function updateRowHighlight(checkbox) {
  const row = checkbox.closest('tr');
  if (!row) return;
  if (checkbox.checked) {
    row.classList.add('row-selected');
  } else {
    row.classList.remove('row-selected');
  }
}

export function toggleRowSelection(event, fileName) {
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
}

export function previewFile(fileUrl, fileName) {
  let modal = document.getElementById("filePreviewModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "filePreviewModal";
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
      const video = modal.querySelector("video");
      if (video) {
        video.pause();
        video.currentTime = 0;
      }
      modal.style.display = "none";
    });

    modal.addEventListener("click", function (e) {
      if (e.target === modal) {
        const video = modal.querySelector("video");
        if (video) {
          video.pause();
          video.currentTime = 0;
        }
        modal.style.display = "none";
      }
    });
  }

  modal.querySelector("h4").textContent = fileName;
  const container = modal.querySelector(".file-preview-container");
  container.innerHTML = "";

  const extension = fileName.split('.').pop().toLowerCase();

  if (/\.(jpg|jpeg|png|gif|bmp|webp|svg|ico|tif|tiff|eps|heic)$/i.test(fileName)) {
    const img = document.createElement("img");
    img.src = fileUrl;
    img.className = "image-modal-img";
    container.appendChild(img);
  } else if (extension === "pdf") {
    const embed = document.createElement("embed");
    const separator = fileUrl.indexOf('?') === -1 ? '?' : '&';
    embed.src = fileUrl + separator + 't=' + new Date().getTime();
    embed.type = "application/pdf";
    embed.style.width = "80vw";
    embed.style.height = "80vh";
    embed.style.border = "none";
    container.appendChild(embed);
  } else if (/\.(mp4|webm|mov|ogg)$/i.test(fileName)) {
    const video = document.createElement("video");
    video.src = fileUrl;
    video.controls = true;
    video.className = "image-modal-img";
    container.appendChild(video);
  } else {
    container.textContent = "Preview not available for this file type.";
  }

  modal.style.display = "flex";
}