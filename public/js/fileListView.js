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

// Global flag for advanced search mode.
window.advancedSearchEnabled = false;

/**
 * --- Helper Functions ---
 */

/**
 * Convert a file size string (e.g. "456.9KB", "1.2 MB", "1024") into bytes.
 */
function parseSizeToBytes(sizeStr) {
    if (!sizeStr) return 0;
    let s = sizeStr.trim();
    let value = parseFloat(s);
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
 * Format the total bytes as a human-readable string.
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
 */
function buildFolderSummary(filteredFiles) {
    const totalFiles = filteredFiles.length;
    const totalBytes = filteredFiles.reduce((sum, file) => {
        return sum + parseSizeToBytes(file.size);
    }, 0);
    const sizeStr = formatSize(totalBytes);
    return `<strong>${t('total_files')}:</strong> ${totalFiles} &nbsp;|&nbsp; <strong>${t('total_size')}:</strong> ${sizeStr}`;
}

/**
 * --- Advanced Search Toggle ---
 * Toggles advanced search mode. When enabled, the search will include additional keys (e.g. "content").
 */
function toggleAdvancedSearch() {
    window.advancedSearchEnabled = !window.advancedSearchEnabled;
    const advancedBtn = document.getElementById("advancedSearchToggle");
    if (advancedBtn) {
        advancedBtn.textContent = window.advancedSearchEnabled ? "Basic Search" : "Advanced Search";
    }
    // Re-run the file table rendering with updated search settings.
    renderFileTable(window.currentFolder);
}

window.imageCache = window.imageCache || {};
function cacheImage(imgElem, key) {
    // Save the current src for future renders.
    window.imageCache[key] = imgElem.src;
}
window.cacheImage = cacheImage;

/**
 * --- Fuse.js Search Helper ---
 * Uses Fuse.js to perform a fuzzy search on fileData.
 * By default, searches over file name, uploader, and tag names.
 * When advanced search is enabled, it also includes the 'content' property.
 */
function searchFiles(searchTerm) {
    if (!searchTerm) return fileData;

    // Define search keys.
    let keys = [
        { name: 'name', weight: 0.1 },
        { name: 'uploader', weight: 0.1 },
        { name: 'tags.name', weight: 0.1 }
    ];
    if (window.advancedSearchEnabled) {
        keys.push({ name: 'content', weight: 0.7 });
    }

    const options = {
        keys: keys,
        threshold: 0.4,
        minMatchCharLength: 2,
        ignoreLocation: true
    };

    const fuse = new Fuse(fileData, options);
    let results = fuse.search(searchTerm);
    return results.map(result => result.item);
}

/**
 * --- VIEW MODE TOGGLE BUTTON & Helpers ---
 */
export function createViewToggleButton() {
    let toggleBtn = document.getElementById("toggleViewBtn");
    if (!toggleBtn) {
        toggleBtn = document.createElement("button");
        toggleBtn.id = "toggleViewBtn";
        toggleBtn.classList.add("btn", "btn-toggleview");

        // Set initial icon and tooltip based on current view mode.
        if (window.viewMode === "gallery") {
            toggleBtn.innerHTML = '<i class="material-icons">view_list</i>';
            toggleBtn.title = t("switch_to_table_view");
        } else {
            toggleBtn.innerHTML = '<i class="material-icons">view_module</i>';
            toggleBtn.title = t("switch_to_gallery_view");
        }

        // Insert the button before the last button in the header.
        const headerButtons = document.querySelector(".header-buttons");
        if (headerButtons && headerButtons.lastElementChild) {
            headerButtons.insertBefore(toggleBtn, headerButtons.lastElementChild);
        } else if (headerButtons) {
            headerButtons.appendChild(toggleBtn);
        }
    }

    toggleBtn.onclick = () => {
        window.viewMode = window.viewMode === "gallery" ? "table" : "gallery";
        localStorage.setItem("viewMode", window.viewMode);
        loadFileList(window.currentFolder);
        if (window.viewMode === "gallery") {
            toggleBtn.innerHTML = '<i class="material-icons">view_list</i>';
            toggleBtn.title = t("switch_to_table_view");
        } else {
            toggleBtn.innerHTML = '<i class="material-icons">view_module</i>';
            toggleBtn.title = t("switch_to_gallery_view");
        }
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

    return fetch("api/file/getFileList.php?folder=" + encodeURIComponent(folder) + "&recursive=1&t=" + new Date().getTime())
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
            if (data.files && Object.keys(data.files).length > 0) {
                // If the returned "files" is an object instead of an array, transform it.
                if (!Array.isArray(data.files)) {
                    data.files = Object.entries(data.files).map(([name, meta]) => {
                        meta.name = name;
                        return meta;
                    });
                }
                // Process each file – add computed properties.
                data.files = data.files.map(file => {
                    file.fullName = (file.path || file.name).trim().toLowerCase();
                    file.editable = canEditFile(file.name);
                    file.folder = folder;
                    if (!file.type && /\.(jpg|jpeg|png|gif|bmp|webp|svg|ico)$/i.test(file.name)) {
                        file.type = "image";
                    }
                    // OPTIONAL: For text documents, preload content (if available from backend)
                    // Example: if (/\.txt|html|md|js|css|json|xml$/i.test(file.name)) { file.content = file.content || ""; }
                    return file;
                });
                fileData = data.files;

                // Update file summary.
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

                // Render view based on the view mode.
                if (window.viewMode === "gallery") {
                    renderGalleryView(folder);
                    updateFileActionButtons();
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
 * Update renderFileTable so it writes its content into the provided container.
 */
export function renderFileTable(folder, container) {
    const fileListContent = container || document.getElementById("fileList");
    const searchTerm = (window.currentSearchTerm || "").toLowerCase();
    const itemsPerPageSetting = parseInt(localStorage.getItem("itemsPerPage") || "10", 10);
    let currentPage = window.currentPage || 1;

    // Use Fuse.js search via our helper function.
    const filteredFiles = searchFiles(searchTerm);

    const totalFiles = filteredFiles.length;
    const totalPages = Math.ceil(totalFiles / itemsPerPageSetting);
    if (currentPage > totalPages) {
        currentPage = totalPages > 0 ? totalPages : 1;
        window.currentPage = currentPage;
    }
    const folderPath = folder === "root"
        ? "uploads/"
        : "uploads/" + folder.split("/").map(encodeURIComponent).join("/") + "/";

    // Build the top controls and append the advanced search toggle button.
    const topControlsHTML = buildSearchAndPaginationControls({
        currentPage,
        totalPages,
        searchTerm: window.currentSearchTerm || ""
    });

    const combinedTopHTML = topControlsHTML;

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
            rowHTML = rowHTML.replace(/(<\/div>\s*<\/td>\s*<\/tr>)/, `<button class="share-btn btn btn-sm btn-secondary" data-file="${escapeHTML(file.name)}" title="${t('share')}">
                <i class="material-icons">share</i>
              </button>$1`);
            rowsHTML += rowHTML;
        });
    } else {
        rowsHTML += `<tr><td colspan="8">No files found.</td></tr>`;
    }
    rowsHTML += "</tbody></table>";
    const bottomControlsHTML = buildBottomControls(itemsPerPageSetting);

    fileListContent.innerHTML = combinedTopHTML + headerHTML + rowsHTML + bottomControlsHTML;

    createViewToggleButton();

    // Setup event listeners.
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
    document.querySelectorAll("#fileList tbody tr").forEach(row => {
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

// A helper to compute the max image height based on the current column count.
function getMaxImageHeight() {
    const columns = parseInt(window.galleryColumns || 3, 10);
    return 150 * (7 - columns); // adjust the multiplier as needed.
}

export function renderGalleryView(folder, container) {
    const fileListContent = container || document.getElementById("fileList");
    const searchTerm = (window.currentSearchTerm || "").toLowerCase();
    const filteredFiles = searchFiles(searchTerm);
    const folderPath = folder === "root"
        ? "uploads/"
        : "uploads/" + folder.split("/").map(encodeURIComponent).join("/") + "/";

    // Use the current global column value (default to 3).
    const numColumns = window.galleryColumns || 3;

    // --- Insert slider controls ---
    const sliderHTML = `
      <div class="gallery-slider" style="margin: 10px; text-align: center;">
        <label for="galleryColumnsSlider" style="margin-right: 5px;">${t('columns')}:</label>
        <input type="range" id="galleryColumnsSlider" min="1" max="6" value="${numColumns}" style="vertical-align: middle;">
        <span id="galleryColumnsValue">${numColumns}</span>
      </div>
    `;

    // Set up the grid container using the slider's current value.
    const gridStyle = `display: grid; grid-template-columns: repeat(${numColumns}, 1fr); gap: 10px; padding: 10px;`;

    // Build the gallery container HTML including the slider.
    let galleryHTML = sliderHTML;
    galleryHTML += `<div class="gallery-container" style="${gridStyle}">`;
    filteredFiles.forEach((file) => {
        let thumbnail;
        if (/\.(jpg|jpeg|png|gif|bmp|webp|svg|ico)$/i.test(file.name)) {
            const cacheKey = folderPath + encodeURIComponent(file.name);
            if (window.imageCache && window.imageCache[cacheKey]) {
                thumbnail = `<img src="${window.imageCache[cacheKey]}" class="gallery-thumbnail" alt="${escapeHTML(file.name)}" style="max-width: 100%; max-height: ${getMaxImageHeight()}px; display: block; margin: 0 auto;">`;
            } else {
                const imageUrl = folderPath + encodeURIComponent(file.name) + "?t=" + new Date().getTime();
                thumbnail = `<img src="${imageUrl}" onload="cacheImage(this, '${cacheKey}')" class="gallery-thumbnail" alt="${escapeHTML(file.name)}" style="max-width: 100%; max-height: ${getMaxImageHeight()}px; display: block; margin: 0 auto;">`;
            }
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

        galleryHTML += `
        <div class="gallery-card" style="border: 1px solid #ccc; padding: 5px; text-align: center;">
          <div class="gallery-preview" style="cursor: pointer;" onclick="previewFile('${folderPath + encodeURIComponent(file.name)}?t=' + new Date().getTime(), '${file.name}')">
            ${thumbnail}
          </div>
          <div class="gallery-info" style="margin-top: 5px;">
            <span class="gallery-file-name" style="display: block; white-space: normal; overflow-wrap: break-word; word-wrap: break-word;">${escapeHTML(file.name)}</span>
            ${tagBadgesHTML}
            <div class="button-wrap" style="display: flex; justify-content: center; gap: 5px;">
              <button type="button" class="btn btn-sm btn-success download-btn" 
                  onclick="openDownloadModal('${file.name}', '${file.folder || 'root'}')" 
                  title="${t('download')}">
                  <i class="material-icons">file_download</i>
              </button>
              ${file.editable ? `
                <button class="btn btn-sm edit-btn" onclick='editFile(${JSON.stringify(file.name)}, ${JSON.stringify(file.folder || "root")})' title="${t('Edit')}">
                  <i class="material-icons">edit</i>
                </button>
              ` : ""}
              <button class="btn btn-sm btn-warning rename-btn" onclick='renameFile(${JSON.stringify(file.name)}, ${JSON.stringify(file.folder || "root")})' title="${t('rename')}">
                 <i class="material-icons">drive_file_rename_outline</i>
              </button>
              <button class="btn btn-sm btn-secondary share-btn" data-file="${escapeHTML(file.name)}" title="${t('share')}">
                 <i class="material-icons">share</i>
              </button>
            </div>
          </div>
        </div>`;
    });
    galleryHTML += "</div>"; // End gallery container.

    fileListContent.innerHTML = galleryHTML;

    // Re-apply slider constraints for the newly rendered slider.
    updateSliderConstraints();
    createViewToggleButton();
    // Attach share button event listeners.
    document.querySelectorAll(".share-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            const fileName = btn.getAttribute("data-file");
            const file = fileData.find(f => f.name === fileName);
            if (file) {
                import('./filePreview.js').then(module => {
                    module.openShareModal(file, folder);
                });
            }
        });
    });

    // --- Slider Event Listener ---
    const slider = document.getElementById("galleryColumnsSlider");
    if (slider) {
        slider.addEventListener("input", function () {
            const value = this.value;
            document.getElementById("galleryColumnsValue").textContent = value;
            window.galleryColumns = value;
            const galleryContainer = document.querySelector(".gallery-container");
            if (galleryContainer) {
                galleryContainer.style.gridTemplateColumns = `repeat(${value}, 1fr)`;
            }
            const newMaxHeight = getMaxImageHeight();
            document.querySelectorAll(".gallery-thumbnail").forEach(img => {
                img.style.maxHeight = newMaxHeight + "px";
            });
        });
    }
}

// Responsive slider constraints based on screen size.
function updateSliderConstraints() {
    const slider = document.getElementById("galleryColumnsSlider");
    if (!slider) return;

    const width = window.innerWidth;
    let min = 1;
    let max;

    // Set maximum based on screen size.
    if (width < 600) {           // small devices (phones)
        max = 2;
    } else if (width < 1024) {     // medium devices
        max = 3;
    } else if (width < 1440) {     // between medium and large devices
        max = 4;
    } else {                     // large devices and above
        max = 6;
    }

    // Adjust the slider's current value if needed
    let currentVal = parseInt(slider.value, 10);
    if (currentVal > max) {
        currentVal = max;
        slider.value = max;
    }

    slider.min = min;
    slider.max = max;
    document.getElementById("galleryColumnsValue").textContent = currentVal;

    // Update the grid layout based on the current slider value.
    const galleryContainer = document.querySelector(".gallery-container");
    if (galleryContainer) {
        galleryContainer.style.gridTemplateColumns = `repeat(${currentVal}, 1fr)`;
    }
}

window.addEventListener('load', updateSliderConstraints);
window.addEventListener('resize', updateSliderConstraints);

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
window.toggleAdvancedSearch = toggleAdvancedSearch;