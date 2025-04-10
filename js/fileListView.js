// fileListView.js
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
import { t } from './i18n.js';
import { bindFileListContextMenu } from './fileMenu.js';
import { openDownloadModal } from './fileActions.js';
import { openTagModal, openMultiTagModal } from './fileTags.js';

export let fileData = [];
export let sortOrder = { column: "uploaded", ascending: true };

window.itemsPerPage = window.itemsPerPage || 10;
window.currentPage = window.currentPage || 1;
window.viewMode = localStorage.getItem("viewMode") || "table"; // "table" or "gallery"

/**
 * --- Helper Functions ---
 */

/**
 * Convert a file size string (e.g. "456.9KB", "1.2 MB", "1024") into bytes.
 */
function parseSizeToBytes(sizeStr) {
    if (!sizeStr) return 0;
    // Remove any whitespace
    let s = sizeStr.trim();
    // Extract the numerical part.
    let value = parseFloat(s);
    // Determine if there is a unit. Convert the unit to uppercase for easier matching.
    let upper = s.toUpperCase();
    if (upper.includes("KB")) {
        value *= 1024;
    } else if (upper.includes("MB")) {
        value *= 1024 * 1024;
    } else if (upper.includes("GB")) {
        value *= 1024 * 1024 * 1024;
    }
    return value;
}

/**
 * Format the total bytes as a human-readable string, choosing an appropriate unit.
 */
function formatSize(totalBytes) {
    if (totalBytes < 1024) {
        return totalBytes + " Bytes";
    } else if (totalBytes < 1024 * 1024) {
        return (totalBytes / 1024).toFixed(2) + " KB";
    } else if (totalBytes < 1024 * 1024 * 1024) {
        return (totalBytes / (1024 * 1024)).toFixed(2) + " MB";
    } else {
        return (totalBytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
    }
}

/**
 * Build the folder summary HTML using the filtered file list.
 * This function sums the file sizes in bytes correctly, then formats the total.
 */
function buildFolderSummary(filteredFiles) {
    const totalFiles = filteredFiles.length;
    const totalBytes = filteredFiles.reduce((sum, file) => {
        // file.size might be something like "456.9KB" or just "1024".
        return sum + parseSizeToBytes(file.size);
    }, 0);
    const sizeStr = formatSize(totalBytes);
    return `<strong>Total Files:</strong> ${totalFiles} &nbsp;|&nbsp; <strong>Total Size:</strong> ${sizeStr}`;
}

/**
 * --- VIEW MODE TOGGLE BUTTON & Helpers ---
 */
export function createViewToggleButton() {
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
    toggleBtn.textContent = window.viewMode === "gallery" ? t("switch_to_table_view") : t("switch_to_gallery_view");
    toggleBtn.onclick = () => {
        window.viewMode = window.viewMode === "gallery" ? "table" : "gallery";
        localStorage.setItem("viewMode", window.viewMode);
        loadFileList(window.currentFolder);
        toggleBtn.textContent = window.viewMode === "gallery" ? t("switch_to_table_view") : t("switch_to_gallery_view");
    };
    return toggleBtn;
}

export function formatFolderName(folder) {
    if (folder === "root") return "(Root)";
    return folder
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, char => char.toUpperCase());
}

// Expose inline DOM helpers.
window.toggleRowSelection = toggleRowSelection;
window.updateRowHighlight = updateRowHighlight;

/**
 * --- FILE LIST & VIEW RENDERING ---
 */
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
            fileListContainer.innerHTML = ""; // Clear loading message.
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

                // Update the file list actions area without removing existing buttons.
                const actionsContainer = document.getElementById("fileListActions");
                if (actionsContainer) {
                    let summaryElem = document.getElementById("fileSummary");
                    if (!summaryElem) {
                        summaryElem = document.createElement("div");
                        summaryElem.id = "fileSummary";
                        summaryElem.style.float = "right";
                        summaryElem.style.marginLeft = "auto";
                        summaryElem.style.marginRight = "60px";
                        summaryElem.style.fontSize = "0.9em";
                        actionsContainer.appendChild(summaryElem);
                    } else {
                        summaryElem.style.display = "block";
                    }
                    summaryElem.innerHTML = buildFolderSummary(fileData);
                }

                // Render the view normally.
                if (window.viewMode === "gallery") {
                    renderGalleryView(folder);
                } else {
                    renderFileTable(folder);
                }
            } else {
                fileListContainer.textContent = t("no_files_found");
                const summaryElem = document.getElementById("fileSummary");
                if (summaryElem) {
                    summaryElem.style.display = "none";
                }
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

/**
 * Update renderFileTable so that it writes its content into the provided container.
 * If no container is provided, it defaults to the element with id "fileList".
 */
export function renderFileTable(folder, container) {
    const fileListContent = container || document.getElementById("fileList");
    const searchTerm = (window.currentSearchTerm || "").toLowerCase();
    const itemsPerPageSetting = parseInt(localStorage.getItem("itemsPerPage") || "10", 10);
    let currentPage = window.currentPage || 1;

    const filteredFiles = fileData.filter(file => {
        const nameMatch = file.name.toLowerCase().includes(searchTerm);
        const tagMatch = file.tags && file.tags.some(tag => tag.name.toLowerCase().includes(searchTerm));
        return nameMatch || tagMatch;
    });
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
        searchTerm: window.currentSearchTerm || ""
    });
    let headerHTML = buildFileTableHeader(sortOrder);
    const startIndex = (currentPage - 1) * itemsPerPageSetting;
    const endIndex = Math.min(startIndex + itemsPerPageSetting, totalFiles);
    let rowsHTML = "<tbody>";
    if (totalFiles > 0) {
        filteredFiles.slice(startIndex, endIndex).forEach((file, idx) => {
            let rowHTML = buildFileTableRow(file, folderPath);
            rowHTML = rowHTML.replace("<tr", `<tr id="file-row-${encodeURIComponent(file.name)}-${startIndex + idx}"`);

            let tagBadgesHTML = "";
            if (file.tags && file.tags.length > 0) {
                tagBadgesHTML = '<div class="tag-badges" style="display:inline-block; margin-left:5px;">';
                file.tags.forEach(tag => {
                    tagBadgesHTML += `<span style="background-color: ${tag.color}; color: #fff; padding: 2px 4px; border-radius: 3px; margin-right: 2px; font-size: 0.8em;">${escapeHTML(tag.name)}</span>`;
                });
                tagBadgesHTML += "</div>";
            }
            rowHTML = rowHTML.replace(/(<td class="file-name-cell">)(.*?)(<\/td>)/, (match, p1, p2, p3) => {
                return p1 + p2 + tagBadgesHTML + p3;
            });
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

    fileListContent.innerHTML = topControlsHTML + headerHTML + rowsHTML + bottomControlsHTML;

    createViewToggleButton();

    // Setup event listeners as before...
    const newSearchInput = document.getElementById("searchInput");
    if (newSearchInput) {
        newSearchInput.addEventListener("input", debounce(function () {
            window.currentSearchTerm = newSearchInput.value;
            window.currentPage = 1;
            renderFileTable(folder, container);
            setTimeout(() => {
                const freshInput = document.getElementById("searchInput");
                if (freshInput) {
                    freshInput.focus();
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
                import('./filePreview.js').then(module => {
                    module.openShareModal(file, folder);
                });
            }
        });
    });
    updateFileActionButtons();
    document.querySelectorAll("#fileListContent tbody tr").forEach(row => {
        row.setAttribute("draggable", "true");
        import('./fileDragDrop.js').then(module => {
            row.addEventListener("dragstart", module.fileDragStartHandler);
        });
    });
    document.querySelectorAll(".download-btn, .edit-btn, .rename-btn").forEach(btn => {
        btn.addEventListener("click", e => e.stopPropagation());
    });
    bindFileListContextMenu();
}

/**
 * Similarly, update renderGalleryView to accept an optional container.
 */
export function renderGalleryView(folder, container) {
    const fileListContent = container || document.getElementById("fileList");
    const searchTerm = (window.currentSearchTerm || "").toLowerCase();
    const filteredFiles = fileData.filter(file => {
        return file.name.toLowerCase().includes(searchTerm) ||
            (file.tags && file.tags.some(tag => tag.name.toLowerCase().includes(searchTerm)));
    });
    const folderPath = folder === "root"
        ? "uploads/"
        : "uploads/" + folder.split("/").map(encodeURIComponent).join("/") + "/";
    const gridStyle = "display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; padding: 10px;";
    let galleryHTML = `<div class="gallery-container" style="${gridStyle}">`;
    filteredFiles.forEach((file) => {
        let thumbnail;
        if (/\.(jpg|jpeg|png|gif|bmp|webp|svg|ico)$/i.test(file.name)) {
            thumbnail = `<img src="${folderPath + encodeURIComponent(file.name)}?t=${new Date().getTime()}" class="gallery-thumbnail" alt="${escapeHTML(file.name)}" style="max-width: 100%; max-height: 150px; display: block; margin: 0 auto;">`;
        } else if (/\.(mp3|wav|m4a|ogg|flac|aac|wma|opus)$/i.test(file.name)) {
            thumbnail = `<span class="material-icons gallery-icon">audiotrack</span>`;
        } else {
            thumbnail = `<span class="material-icons gallery-icon">insert_drive_file</span>`;
        }
        let tagBadgesHTML = "";
        if (file.tags && file.tags.length > 0) {
            tagBadgesHTML = `<div class="tag-badges" style="margin-top:4px;">`;
            file.tags.forEach(tag => {
                tagBadgesHTML += `<span style="background-color: ${tag.color}; color: #fff; padding: 2px 4px; border-radius: 3px; margin-right: 2px; font-size: 0.8em;">${escapeHTML(tag.name)}</span>`;
            });
            tagBadgesHTML += `</div>`;
        }
        galleryHTML += `<div class="gallery-card" style="border: 1px solid #ccc; padding: 5px; text-align: center;">
        <div class="gallery-preview" style="cursor: pointer;" onclick="previewFile('${folderPath + encodeURIComponent(file.name)}?t=' + new Date().getTime(), '${file.name}')">
          ${thumbnail}
        </div>
        <div class="gallery-info" style="margin-top: 5px;">
          <span class="gallery-file-name" style="display: block; white-space: normal; overflow-wrap: break-word; word-wrap: break-word;">${escapeHTML(file.name)}</span>
          ${tagBadgesHTML}
          <div class="button-wrap" style="display: flex; justify-content: center; gap: 5px;">
            <button type="button" class="btn btn-sm btn-success download-btn" 
                onclick="openDownloadModal('${file.name}', '${file.folder || 'root'}')" 
                title="Download">
                <i class="material-icons">file_download</i>
            </button>
            ${file.editable ? `
              <button class="btn btn-sm edit-btn" onclick='editFile(${JSON.stringify(file.name)}, ${JSON.stringify(file.folder || "root")})' title="Edit">
                <i class="material-icons">edit</i>
              </button>
            ` : ""}
            <button class="btn btn-sm btn-warning rename-btn" onclick='renameFile(${JSON.stringify(file.name)}, ${JSON.stringify(file.folder || "root")})' title="Rename">
               <i class="material-icons">drive_file_rename_outline</i>
            </button>
            <button class="btn btn-sm btn-secondary share-btn" data-file="${escapeHTML(file.name)}" title="Share">
               <i class="material-icons">share</i>
            </button>
          </div>
        </div>
      </div>`;
    });
    galleryHTML += "</div>";
    fileListContent.innerHTML = galleryHTML;
    createViewToggleButton();
    updateFileActionButtons();
    document.querySelectorAll(".share-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            const fileName = btn.getAttribute("data-file");
            const file = fileData.find(f => f.name === fileName);
            import('./filePreview.js').then(module => {
                module.openShareModal(file, folder);
            });
        });
    });
}

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

// Expose global functions for pagination and preview.
window.changePage = function (newPage) {
    window.currentPage = newPage;
    renderFileTable(window.currentFolder);
};
window.changeItemsPerPage = function (newCount) {
    window.itemsPerPage = parseInt(newCount);
    window.currentPage = 1;
    renderFileTable(window.currentFolder);
};

// fileListView.js (bottom)
window.loadFileList = loadFileList;
window.renderFileTable = renderFileTable;
window.renderGalleryView = renderGalleryView;
window.sortFiles = sortFiles;