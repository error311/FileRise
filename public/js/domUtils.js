// domUtils.js
import { t } from './i18n.js';
import { openDownloadModal } from './fileActions.js';

// Basic DOM Helpers
export function toggleVisibility(elementId, shouldShow) {
  const element = document.getElementById(elementId);
  if (element) {
    element.style.display = shouldShow ? "block" : "none";
  } else {
    console.error(t("element_not_found", { id: elementId }));
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
  // Choose the placeholder text based on advanced search mode
  const placeholderText = window.advancedSearchEnabled
    ? t("search_placeholder_advanced")
    : t("search_placeholder");

  return `
    <div class="row align-items-center mb-3">
      <div class="col-12 col-md-8 mb-2 mb-md-0">
        <div class="input-group">
          <!-- Advanced Search Toggle Button -->
          <div class="input-group-prepend">
            <button id="advancedSearchToggle" class="btn btn-outline-secondary btn-icon" title="${window.advancedSearchEnabled ? t("basic_search_tooltip") : t("advanced_search_tooltip")}">
              <i class="material-icons">${window.advancedSearchEnabled ? "filter_alt_off" : "filter_alt"}</i>
            </button>
          </div>
          <!-- Search Icon -->
          <div class="input-group-prepend">
            <span class="input-group-text" id="searchIcon">
              <i class="material-icons">search</i>
            </span>
          </div>
          <!-- Search Input -->
          <input type="text" id="searchInput" class="form-control" placeholder="${placeholderText}" value="${safeSearchTerm}" aria-describedby="searchIcon">
        </div>
      </div>
      <div class="col-12 col-md-4 text-left">
        <div class="d-flex justify-content-center justify-content-md-start align-items-center">
          <button id="prevPageBtn" class="custom-prev-next-btn" ${currentPage === 1 ? "disabled" : ""}>${t("prev")}</button>
          <span class="page-indicator">${t("page")} ${currentPage} ${t("of")} ${totalPages || 1}</span>
          <button id="nextPageBtn" class="custom-prev-next-btn" ${currentPage === totalPages ? "disabled" : ""}>${t("next")}</button>
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
          <th class="checkbox-col"><input type="checkbox" id="selectAll"></th>
          <th data-column="name" class="sortable-col">${t("file_name")} ${sortOrder.column === "name" ? (sortOrder.ascending ? "▲" : "▼") : ""}</th>
          <th data-column="modified" class="hide-small sortable-col">${t("date_modified")} ${sortOrder.column === "modified" ? (sortOrder.ascending ? "▲" : "▼") : ""}</th>
          <th data-column="uploaded" class="hide-small hide-medium sortable-col">${t("upload_date")} ${sortOrder.column === "uploaded" ? (sortOrder.ascending ? "▲" : "▼") : ""}</th>
          <th data-column="size" class="hide-small sortable-col">${t("file_size")} ${sortOrder.column === "size" ? (sortOrder.ascending ? "▲" : "▼") : ""}</th>
          <th data-column="uploader" class="hide-small hide-medium sortable-col">${t("uploader")} ${sortOrder.column === "uploader" ? (sortOrder.ascending ? "▲" : "▼") : ""}</th>
          <th>${t("actions")}</th>
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
    previewButton = `<button class="btn btn-sm btn-info preview-btn" data-preview-url="${folderPath + encodeURIComponent(file.name)}?t=${Date.now()}" data-preview-name="${safeFileName}">
                 ${previewIcon}
               </button>`;
  }

  return `
  <tr class="clickable-row">
    <td>
      <input type="checkbox" class="file-checkbox" value="${safeFileName}">
    </td>
    <td class="file-name-cell">${safeFileName}</td>
    <td class="hide-small nowrap">${safeModified}</td>
    <td class="hide-small hide-medium nowrap">${safeUploaded}</td>
    <td class="hide-small nowrap">${safeSize}</td>
    <td class="hide-small hide-medium nowrap">${safeUploader}</td>
    <td>
      <div class="button-wrap" style="display: flex; justify-content: left; gap: 5px;">
        <button type="button" class="btn btn-sm btn-success download-btn" data-download-name="${file.name}" data-download-folder="${file.folder || 'root'}" title="${t('download')}">
          <i class="material-icons">file_download</i>
        </button>
        ${file.editable ? `
          <button class="btn btn-sm edit-btn" data-edit-name="${file.name}" data-edit-folder="${file.folder || 'root'}" title="${t('edit')}">
            <i class="material-icons">edit</i>
          </button>
        ` : ""}
        ${previewButton}
        <button class="btn btn-sm btn-warning rename-btn" data-rename-name="${file.name}" data-rename-folder="${file.folder || 'root'}" title="${t('rename')}">
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
      <label class="label-inline mr-2 mb-0">${t("show")}</label>
      <select class="form-control bottom-select" id="itemsPerPageSelect">
        ${[10, 20, 50, 100]
      .map(num => `<option value="${num}" ${num === itemsPerPageSetting ? "selected" : ""}>${num}</option>`)
      .join("")}
      </select>
      <span class="items-per-page-text ml-2 mb-0">${t("items_per_page")}</span>
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
  // Prevent default text selection when shift is held.
  if (event.shiftKey) {
    event.preventDefault();
  }

  // Ignore clicks on interactive elements.
  const targetTag = event.target.tagName.toLowerCase();
  if (["a", "button", "input"].includes(targetTag)) {
    return;
  }

  // Get the clicked row and its checkbox.
  const row = event.currentTarget;
  const checkbox = row.querySelector(".file-checkbox");
  if (!checkbox) return;

  // Get all rows in the current file list view.
  const allRows = Array.from(document.querySelectorAll("#fileList tbody tr"));

  // Helper: clear all selections (not used in this updated version).
  const clearAllSelections = () => {
    allRows.forEach(r => {
      const cb = r.querySelector(".file-checkbox");
      if (cb) {
        cb.checked = false;
        updateRowHighlight(cb);
      }
    });
  };

  // If the user is holding the Shift key, perform range selection.
  if (event.shiftKey) {
    // Use the last clicked row as the anchor.
    const lastRow = window.lastSelectedFileRow || row;
    const currentIndex = allRows.indexOf(row);
    const lastIndex = allRows.indexOf(lastRow);
    const start = Math.min(currentIndex, lastIndex);
    const end = Math.max(currentIndex, lastIndex);

    // If neither CTRL nor Meta is pressed, you might choose
    // to clear existing selections. For this example we leave existing selections intact.
    for (let i = start; i <= end; i++) {
      const cb = allRows[i].querySelector(".file-checkbox");
      if (cb) {
        cb.checked = true;
        updateRowHighlight(cb);
      }
    }
  }
  // Otherwise, for all non-shift clicks simply toggle the selected state.
  else {
    checkbox.checked = !checkbox.checked;
    updateRowHighlight(checkbox);
  }

  // Update the anchor row to the row that was clicked.
  window.lastSelectedFileRow = row;
  updateFileActionButtons();
}

export function attachEnterKeyListener(modalId, buttonId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    // Make the modal focusable
    modal.setAttribute("tabindex", "-1");
    modal.focus();
    modal.addEventListener("keydown", function (e) {
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

window.toggleRowSelection = toggleRowSelection;
window.updateRowHighlight = updateRowHighlight;