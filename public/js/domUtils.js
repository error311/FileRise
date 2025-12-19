// domUtils.js
import { t } from './i18n.js?v={{APP_QVER}}';
import { openDownloadModal } from './fileActions.js?v={{APP_QVER}}';

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
    updateRowHighlight(chk);
  });
  updateFileActionButtons();
}

export function updateFileActionButtons() {
  const fileCheckboxes = document.querySelectorAll("#fileList .file-checkbox");
  const selectedCheckboxes = document.querySelectorAll("#fileList .file-checkbox:checked");
  const folderCheckboxes = document.querySelectorAll("#fileList .folder-checkbox");
  const selectedFolders = document.querySelectorAll("#fileList .folder-checkbox:checked");

  const deleteBtn = document.getElementById("deleteSelectedBtn");
  const copyBtn = document.getElementById("copySelectedBtn");
  const moveBtn = document.getElementById("moveSelectedBtn");
  const zipBtn = document.getElementById("downloadZipBtn");
  const extractZipBtn = document.getElementById("extractZipBtn");
  const createBtn = document.getElementById("createBtn");
  const renameBtn = document.getElementById("renameSelectedBtn");
  const shareBtn = document.getElementById("shareSelectedBtn");
  const folderActionsInline = document.getElementById("folderActionsInline");
  const folderMoveBtn = document.getElementById("folderMoveInlineBtn");
  const folderRenameBtn = document.getElementById("folderRenameInlineBtn");
  const folderColorBtn = document.getElementById("folderColorInlineBtn");
  const folderEncryptBtn = document.getElementById("folderEncryptInlineBtn");
  const folderDecryptBtn = document.getElementById("folderDecryptInlineBtn");
  const folderShareBtn = document.getElementById("folderShareInlineBtn");
  const folderDeleteBtn = document.getElementById("folderDeleteInlineBtn");
  const secondaryActions = document.querySelector("#fileActionsBar .secondary-actions");
  const actionSeparator = document.querySelector("#fileActionsBar .action-separator");
  const bar = document.getElementById("fileActionsBar");

  const anyFiles = fileCheckboxes.length > 0;
  const anySelected = selectedCheckboxes.length > 0;
  const anyFolderSelected = selectedFolders.length > 0;
  const anyZip = Array.from(selectedCheckboxes)
    .some(cb => cb.value.toLowerCase().endsWith(".zip"));
  const singleSelected = selectedCheckboxes.length === 1;
  const currentFolderCaps = window.currentFolderCaps || null;
  const selectedFolderCaps = window.selectedFolderCaps || null;

  // ACL-driven switches (default to true so we don’t regress if caps are unavailable)
  const allowCreate   = currentFolderCaps ? !!(currentFolderCaps.canCreate || currentFolderCaps.canUpload) : true;
  const allowDownload = currentFolderCaps ? !!(currentFolderCaps.canView || currentFolderCaps.canViewOwn) : true;
  const allowCopy     = currentFolderCaps ? !!currentFolderCaps.canCopy : true;
  const allowMove     = currentFolderCaps ? !!(currentFolderCaps.canMoveIn || currentFolderCaps.canMove) : true;
  const allowRename   = currentFolderCaps ? !!(currentFolderCaps.canRename || currentFolderCaps.isAdmin) : true;
  const allowDelete   = currentFolderCaps ? !!currentFolderCaps.canDelete : true;
  const allowShare    = currentFolderCaps ? !!(currentFolderCaps.canShareFile || currentFolderCaps.canShare) : true;
  const allowExtract  = currentFolderCaps ? !!currentFolderCaps.canExtract : true;
  const inEncryptedFolder = !!(currentFolderCaps && currentFolderCaps.encryption && currentFolderCaps.encryption.encrypted);

  const folderCaps    = selectedFolderCaps || currentFolderCaps || {};
  const allowFolderMove   = !!(folderCaps.canMoveFolder   ?? true);
  const allowFolderRename = !!(folderCaps.canRename       ?? true);
  const allowFolderColor  = !!(folderCaps.canEdit         ?? true);
  const allowFolderShare  = !!(folderCaps.canShareFolder  ?? true);
  const allowFolderDelete = !!(folderCaps.canDeleteFolder ?? true);
  const folderEnc = (folderCaps && folderCaps.encryption) ? folderCaps.encryption : {};
  const allowFolderEncrypt = !!(folderEnc && folderEnc.canEncrypt);
  const allowFolderDecrypt = !!(folderEnc && folderEnc.canDecrypt);
  const folderIsEncrypted = !!(folderEnc && folderEnc.encrypted);

  const setEnabled = (el, enabled) => {
    if (!el) return;
    el.disabled = !enabled;
    el.classList.toggle("disabled", !enabled);
    el.setAttribute("aria-disabled", String(!enabled));
    el.style.pointerEvents = enabled ? "" : "none";
    el.style.opacity = enabled ? "" : "0.6";
  };

  // — Select All checkbox sync (unchanged) —
  const master = document.getElementById("selectAll");
  if (master) {
    if (anyFolderSelected) {
      master.disabled = false;
      master.checked = false;
      master.indeterminate = true;
    } else if (selectedCheckboxes.length === fileCheckboxes.length && fileCheckboxes.length) {
      master.checked = true;
      master.indeterminate = false;
      master.disabled = false;
    } else if (selectedCheckboxes.length === 0) {
      master.checked = false;
      master.indeterminate = false;
      master.disabled = false;
    } else {
      master.checked = false;
      master.indeterminate = true;
      master.disabled = false;
    }
  }

  // Toggle mode class for animated swap
  if (bar) bar.classList.toggle("folder-mode", anyFolderSelected);

  // Folder buttons only enabled when a folder is selected
  setEnabled(folderMoveBtn,   anyFolderSelected && allowFolderMove);
  setEnabled(folderRenameBtn, anyFolderSelected && allowFolderRename);
  setEnabled(folderColorBtn,  anyFolderSelected && allowFolderColor);
  // Show only the valid action (encrypt OR decrypt), not both.
  const showFolderEncrypt = anyFolderSelected && !folderIsEncrypted && allowFolderEncrypt;
  const showFolderDecrypt = anyFolderSelected && folderIsEncrypted && allowFolderDecrypt;
  if (folderEncryptBtn) folderEncryptBtn.style.display = showFolderEncrypt ? "" : "none";
  if (folderDecryptBtn) folderDecryptBtn.style.display = showFolderDecrypt ? "" : "none";
  setEnabled(folderEncryptBtn, showFolderEncrypt);
  setEnabled(folderDecryptBtn, showFolderDecrypt);
  setEnabled(folderShareBtn,  anyFolderSelected && allowFolderShare);
  setEnabled(folderDeleteBtn, anyFolderSelected && allowFolderDelete);

  // Keep the bar layout stable; just disable when unavailable
  const showFileActions = !anyFolderSelected;
  const showFolderActions = anyFolderSelected;

  const setGroupVisible = (el, visible) => {
    if (!el) return;
    el.classList.toggle("is-visible", !!visible);
  };

  setGroupVisible(secondaryActions, showFileActions);
  setGroupVisible(folderActionsInline, showFolderActions);
  if (actionSeparator) {
    actionSeparator.style.display = (showFileActions || showFolderActions) ? "" : "none";
  }

  if (deleteBtn) deleteBtn.style.display = showFileActions ? "" : "none";
  if (copyBtn) copyBtn.style.display = showFileActions ? "" : "none";
  if (moveBtn) moveBtn.style.display = showFileActions ? "" : "none";
  if (zipBtn) zipBtn.style.display = showFileActions ? "" : "none";
  if (renameBtn) renameBtn.style.display = showFileActions ? "" : "none";
  if (shareBtn) shareBtn.style.display = (showFileActions && !inEncryptedFolder) ? "" : "none";
  if (createBtn) createBtn.style.display = "";

  // Extract ZIP still appears only when a .zip is selected (and file mode)
  if (extractZipBtn) extractZipBtn.style.display = (showFileActions && anyZip && !inEncryptedFolder) ? "" : "none";

  // Finally disable the ones that are shown but shouldn’t be clickable
  setEnabled(createBtn, allowCreate);
  setEnabled(deleteBtn, showFileActions && anySelected && allowDelete);
  setEnabled(copyBtn,   showFileActions && anySelected && allowCopy);
  setEnabled(moveBtn,   showFileActions && anySelected && allowMove);
  setEnabled(zipBtn,    showFileActions && anySelected && allowDownload);
  setEnabled(renameBtn, showFileActions && singleSelected && allowRename);
  setEnabled(shareBtn,  showFileActions && singleSelected && allowShare && !inEncryptedFolder);
  setEnabled(extractZipBtn, showFileActions && anyZip && allowExtract && !inEncryptedFolder);

  // Collapse/expand the toolbar for a slimmer default view
  if (bar) {
    const expanded = anySelected || anyFolderSelected;
    bar.classList.toggle("expanded", expanded);
    bar.classList.toggle("collapsed", !expanded);
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
    <table class="table filr-table table-hover table-striped">
      <thead>
        <tr>
          <th class="checkbox-col"><input type="checkbox" id="selectAll"></th>
          <th data-column="name" class="sortable-col">${t("name")} ${sortOrder.column === "name" ? (sortOrder.ascending ? "▲" : "▼") : ""}</th>
          <th data-column="modified" class="hide-small sortable-col">${t("modified")} ${sortOrder.column === "modified" ? (sortOrder.ascending ? "▲" : "▼") : ""}</th>
          <th data-column="uploaded" class="hide-small hide-medium sortable-col">${t("created")} ${sortOrder.column === "uploaded" ? (sortOrder.ascending ? "▲" : "▼") : ""}</th>
          <th data-column="size" class="sortable-col"> ${t("size")} ${sortOrder.column === "size" ? (sortOrder.ascending ? "▲" : "▼") : ""} </th>
          <th data-column="uploader" class="hide-small hide-medium sortable-col">${t("owner")} ${sortOrder.column === "uploader" ? (sortOrder.ascending ? "▲" : "▼") : ""}</th>
          <th data-column="actions" class="actions-col">${t("actions")}</th>
        </tr>
      </thead>
  `;
}

export function buildFileTableRow(file, folderPath) {
  const safeFileName = escapeHTML(file.name);
  const safeModified = escapeHTML(file.modified);
  const safeUploaded = escapeHTML(file.uploaded);
  const safeSize     = escapeHTML(file.size);
  const safeUploader = escapeHTML(file.uploader || "Unknown");

  return `
    <tr class="clickable-row" data-file-name="${safeFileName}">
      <td>
        <input type="checkbox" class="file-checkbox" value="${safeFileName}">
      </td>
      <td class="file-name-cell name-cell">
        ${safeFileName}
      </td>
      <td class="hide-small nowrap">${safeModified}</td>
      <td class="hide-small hide-medium nowrap">${safeUploaded}</td>
      <td class="hide-small nowrap size-cell">${safeSize}</td>
      <td class="hide-small hide-medium nowrap">${safeUploader}</td>
      <td class="actions-cell">
        <button
          type="button"
          class="btn btn-link btn-actions-ellipsis"
          title="${t("more_actions")}"
        >
          <span class="material-icons">more_vert</span>
        </button>
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
    row.classList.add('row-selected', 'selected');
  } else {
    row.classList.remove('row-selected', 'selected');
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
