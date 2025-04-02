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
  const fileCheckboxes = document.querySelectorAll("#fileList .file-checkbox");
  const selectedCheckboxes = document.querySelectorAll("#fileList .file-checkbox:checked");
  const copyBtn = document.getElementById("copySelectedBtn");
  const moveBtn = document.getElementById("moveSelectedBtn");
  const deleteBtn = document.getElementById("deleteSelectedBtn");
  const zipBtn = document.getElementById("downloadZipBtn");
  const extractZipBtn = document.getElementById("extractZipBtn");

  if (fileCheckboxes.length === 0) {
    if (copyBtn) copyBtn.style.display = "none";
    if (moveBtn) moveBtn.style.display = "none";
    if (deleteBtn) deleteBtn.style.display = "none";
    if (zipBtn) zipBtn.style.display = "none";
    if (extractZipBtn) extractZipBtn.style.display = "none";
  } else {
    if (copyBtn) copyBtn.style.display = "inline-block";
    if (moveBtn) moveBtn.style.display = "inline-block";
    if (deleteBtn) deleteBtn.style.display = "inline-block";
    if (zipBtn) zipBtn.style.display = "inline-block";
    if (extractZipBtn) extractZipBtn.style.display = "inline-block";

    const anySelected = selectedCheckboxes.length > 0;
    if (copyBtn) copyBtn.disabled = !anySelected;
    if (moveBtn) moveBtn.disabled = !anySelected;
    if (deleteBtn) deleteBtn.disabled = !anySelected;
    if (zipBtn) zipBtn.disabled = !anySelected;

    if (extractZipBtn) {
      // Enable only if at least one selected file ends with .zip (case-insensitive).
      const anyZipSelected = Array.from(selectedCheckboxes).some(chk =>
        chk.value.toLowerCase().endsWith(".zip")
      );
      extractZipBtn.disabled = !anyZipSelected;
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
          <input type="text" id="searchInput" class="form-control" placeholder="Search files or tag..." value="${safeSearchTerm}" aria-describedby="searchIcon">
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
  if (/\.(jpg|jpeg|png|gif|bmp|webp|svg|ico|tif|tiff|eps|heic|pdf|mp4|webm|mov|mp3|wav|m4a|ogg|flac|aac|wma|opus|mkv|ogv)$/i.test(file.name)) {
    let previewIcon = "";
    if (/\.(jpg|jpeg|png|gif|bmp|webp|svg|ico|tif|tiff|eps|heic)$/i.test(file.name)) {
      previewIcon = `<i class="material-icons">image</i>`;
    } else if (/\.(mp4|mkv|webm|mov|ogv)$/i.test(file.name)) {
      previewIcon = `<i class="material-icons">videocam</i>`;
    } else if (/\.pdf$/i.test(file.name)) {
      previewIcon = `<i class="material-icons">picture_as_pdf</i>`;
    } else if (/\.(mp3|wav|m4a|ogg|flac|aac|wma|opus)$/i.test(file.name)) {
      previewIcon = `<i class="material-icons">audiotrack</i>`;
    }
    previewButton = `<button class="btn btn-sm btn-info preview-btn" onclick="event.stopPropagation(); previewFile('${folderPath + encodeURIComponent(file.name)}', '${safeFileName}')">
                 ${previewIcon}
               </button>`;
  }

  return `
  <tr onclick="toggleRowSelection(event, '${safeFileName}')" class="clickable-row">
    <td>
      <input type="checkbox" class="file-checkbox" value="${safeFileName}" onclick="event.stopPropagation(); updateRowHighlight(this);">
    </td>
    <td class="file-name-cell">${safeFileName}</td>
    <td class="hide-small nowrap">${safeModified}</td>
    <td class="hide-small hide-medium nowrap">${safeUploaded}</td>
    <td class="hide-small nowrap">${safeSize}</td>
    <td class="hide-small hide-medium nowrap">${safeUploader}</td>
    <td>
      <div class="button-wrap" style="display: flex; justify-content: left; gap: 5px;">
        <a class="btn btn-sm btn-success download-btn" 
           href="download.php?folder=${encodeURIComponent(file.folder || 'root')}&file=${encodeURIComponent(file.name)}" 
           title="Download">
          <i class="material-icons">file_download</i>
        </a>
        ${file.editable ? `
          <button class="btn btn-sm edit-btn" 
                  onclick='editFile(${JSON.stringify(file.name)}, ${JSON.stringify(file.folder || "root")})'
                  title="Edit">
            <i class="material-icons">edit</i>
          </button>
        ` : ""}
        ${previewButton}
        <button class="btn btn-sm btn-warning rename-btn" 
                onclick='renameFile(${JSON.stringify(file.name)}, ${JSON.stringify(file.folder || "root")})'
                title="Rename">
          <i class="material-icons">drive_file_rename_outline</i>
        </button>
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

export function attachEnterKeyListener(modalId, buttonId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    // Make the modal focusable
    modal.setAttribute("tabindex", "-1");
    modal.focus();
    modal.addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        const btn = document.getElementById(buttonId);
        if (btn) {
          btn.click();
        }
      }
    });
  }
}

export function showCustomConfirmModal(message) {
  return new Promise((resolve) => {
    const modal = document.getElementById("customConfirmModal");
    const messageElem = document.getElementById("confirmMessage");
    const yesBtn = document.getElementById("confirmYesBtn");
    const noBtn = document.getElementById("confirmNoBtn");

    messageElem.textContent = message;
    modal.style.display = "block";

    // Cleanup function to hide the modal and remove event listeners.
    function cleanup() {
      modal.style.display = "none";
      yesBtn.removeEventListener("click", onYes);
      noBtn.removeEventListener("click", onNo);
    }

    function onYes() {
      cleanup();
      resolve(true);
    }
    function onNo() {
      cleanup();
      resolve(false);
    }

    yesBtn.addEventListener("click", onYes);
    noBtn.addEventListener("click", onNo);
  });
}