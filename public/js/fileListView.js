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
import {
    getParentFolder,
    updateBreadcrumbTitle,
    setupBreadcrumbDelegation,
    showFolderManagerContextMenu,
    hideFolderManagerContextMenu,
    openRenameFolderModal,
    openDeleteFolderModal
} from './folderManager.js';
import { openFolderShareModal } from './folderShareModal.js';
import {
    folderDragOverHandler,
    folderDragLeaveHandler,
    folderDropHandler
} from './fileDragDrop.js';

export let fileData = [];
export let sortOrder = { column: "uploaded", ascending: true };

// Hide "Edit" for files >10 MiB
const MAX_EDIT_BYTES = 10 * 1024 * 1024;

// Latest-response-wins guard (prevents double render/flicker if loadFileList gets called twice)
let __fileListReqSeq = 0;

window.itemsPerPage = parseInt(
    localStorage.getItem('itemsPerPage') || window.itemsPerPage || '10',
    10
);
window.currentPage = window.currentPage || 1;
window.viewMode = localStorage.getItem("viewMode") || "table";

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

export async function loadFileList(folderParam) {
    const reqId = ++__fileListReqSeq; // latest call wins
    const folder = folderParam || "root";
    const fileListContainer = document.getElementById("fileList");
    const actionsContainer = document.getElementById("fileListActions");

    // 1) show loader (only this request is allowed to render)
    fileListContainer.style.visibility = "hidden";
    fileListContainer.innerHTML = "<div class='loader'>Loading files...</div>";

    try {
        // Kick off both in parallel, but we'll render as soon as FILES are ready
        const filesPromise = fetch(`/api/file/getFileList.php?folder=${encodeURIComponent(folder)}&recursive=1&t=${Date.now()}`);
        const foldersPromise = fetch(`/api/folder/getFolderList.php?folder=${encodeURIComponent(folder)}`);

        // ----- FILES FIRST -----
        const filesRes = await filesPromise;

        if (filesRes.status === 401) {
            window.location.href = "/api/auth/logout.php";
            throw new Error("Unauthorized");
        }

        const data = await filesRes.json();

        // If another loadFileList ran after this one, bail before touching the DOM
        if (reqId !== __fileListReqSeq) return [];

        // 3) clear loader (still only if this request is the latest)
        fileListContainer.innerHTML = "";

        // 4) handle “no files” case
        if (!data.files || Object.keys(data.files).length === 0) {
            if (reqId !== __fileListReqSeq) return [];
            fileListContainer.textContent = t("no_files_found");

            // hide summary + slider
            const summaryElem = document.getElementById("fileSummary");
            if (summaryElem) summaryElem.style.display = "none";
            const sliderContainer = document.getElementById("viewSliderContainer");
            if (sliderContainer) sliderContainer.style.display = "none";

            // hide folder strip for now; we’ll re-show it after folders load (below)
            const strip = document.getElementById("folderStripContainer");
            if (strip) strip.style.display = "none";

            updateFileActionButtons();
            fileListContainer.style.visibility = "visible";
            return [];
        }

        // 5) normalize files array
        if (!Array.isArray(data.files)) {
            data.files = Object.entries(data.files).map(([name, meta]) => {
                meta.name = name;
                return meta;
            });
        }

        data.files = data.files.map(f => {
            f.fullName = (f.path || f.name).trim().toLowerCase();

            // Prefer numeric size if your API provides it; otherwise parse the "1.2 MB" string
            let bytes = Number.isFinite(f.sizeBytes)
                ? f.sizeBytes
                : parseSizeToBytes(String(f.size || ""));

            if (!Number.isFinite(bytes)) bytes = Infinity;

            // extension policy + size policy
            f.editable = canEditFile(f.name) && (bytes <= MAX_EDIT_BYTES);

            f.folder = folder;
            return f;
        });
        fileData = data.files;

        // Decide editability BEFORE render to avoid any post-render “blink”
        data.files = data.files.map(f => {
            f.fullName = (f.path || f.name).trim().toLowerCase();

            // extension policy
            const extOk = canEditFile(f.name);

            // prefer numeric byte size if API provides it; otherwise parse "12.3 MB" strings
            let bytes = Infinity;
            if (Number.isFinite(f.sizeBytes)) {
                bytes = f.sizeBytes;
            } else if (f.size != null && String(f.size).trim() !== "") {
                bytes = parseSizeToBytes(String(f.size));
            }

            f.editable = extOk && (bytes <= MAX_EDIT_BYTES);
            f.folder = folder;
            return f;
        });
        fileData = data.files;

        // If stale, stop before any DOM updates
        if (reqId !== __fileListReqSeq) return [];

        // 6) inject summary + slider
        if (actionsContainer) {
            // a) summary
            let summaryElem = document.getElementById("fileSummary");
            if (!summaryElem) {
                summaryElem = document.createElement("div");
                summaryElem.id = "fileSummary";
                summaryElem.style.cssText = "float:right; margin:0 60px 0 auto; font-size:0.9em;";
                actionsContainer.appendChild(summaryElem);
            }
            summaryElem.style.display = "block";
            summaryElem.innerHTML = buildFolderSummary(fileData);

            // b) slider
            const viewMode = window.viewMode || "table";
            let sliderContainer = document.getElementById("viewSliderContainer");
            if (!sliderContainer) {
                sliderContainer = document.createElement("div");
                sliderContainer.id = "viewSliderContainer";
                sliderContainer.style.cssText = "display:inline-flex; align-items:center; margin-right:auto; font-size:0.9em;";
                actionsContainer.insertBefore(sliderContainer, summaryElem);
            } else {
                sliderContainer.style.display = "inline-flex";
            }

            if (viewMode === "gallery") {
                const w = window.innerWidth;
                let maxCols;
                if (w < 600) maxCols = 1;
                else if (w < 900) maxCols = 2;
                else if (w < 1200) maxCols = 4;
                else maxCols = 6;

                const currentCols = Math.min(
                    parseInt(localStorage.getItem("galleryColumns") || "3", 10),
                    maxCols
                );

                sliderContainer.innerHTML = `
                  <label for="galleryColumnsSlider" style="margin-right:8px;line-height:1;">
                    ${t("columns")}:
                  </label>
                  <input
                    type="range"
                    id="galleryColumnsSlider"
                    min="1"
                    max="${maxCols}"
                    value="${currentCols}"
                    style="vertical-align:middle;"
                  >
                  <span id="galleryColumnsValue" style="margin-left:6px;line-height:1;">${currentCols}</span>
                `;
                const gallerySlider = document.getElementById("galleryColumnsSlider");
                const galleryValue = document.getElementById("galleryColumnsValue");
                gallerySlider.oninput = e => {
                    const v = +e.target.value;
                    localStorage.setItem("galleryColumns", v);
                    galleryValue.textContent = v;
                    document.querySelector(".gallery-container")
                        ?.style.setProperty("grid-template-columns", `repeat(${v},1fr)`);
                };
            } else {
                const currentHeight = parseInt(localStorage.getItem("rowHeight") || "48", 10);
                sliderContainer.innerHTML = `
                  <label for="rowHeightSlider" style="margin-right:8px;line-height:1;">
                    ${t("row_height")}:
                  </label>
                  <input type="range" id="rowHeightSlider" min="30" max="60" value="${currentHeight}" style="vertical-align:middle;">
                  <span id="rowHeightValue" style="margin-left:6px;line-height:1;">${currentHeight}px</span>
                `;
                const rowSlider = document.getElementById("rowHeightSlider");
                const rowValue = document.getElementById("rowHeightValue");
                rowSlider.oninput = e => {
                    const v = e.target.value;
                    document.documentElement.style.setProperty("--file-row-height", v + "px");
                    localStorage.setItem("rowHeight", v);
                    rowValue.textContent = v + "px";
                };
            }
        }

        // 7) render files (only if still latest)
        if (reqId !== __fileListReqSeq) return [];

        if (window.viewMode === "gallery") {
            renderGalleryView(folder);
        } else {
            renderFileTable(folder);
        }
        updateFileActionButtons();
        fileListContainer.style.visibility = "visible";

        // ----- FOLDERS NEXT (populate strip when ready; doesn't block rows) -----
        try {
            const foldersRes = await foldersPromise;
            const folderRaw = await foldersRes.json();
            if (reqId !== __fileListReqSeq) return data.files;

            // --- build ONLY the *direct* children of current folder ---
            let subfolders = [];
            const hidden = new Set(["profile_pics", "trash"]);
            if (Array.isArray(folderRaw)) {
                const allPaths = folderRaw.map(item => item.folder ?? item);
                const depth = folder === "root" ? 1 : folder.split("/").length + 1;
                subfolders = allPaths
                    .filter(p => {
                        if (folder === "root") return p.indexOf("/") === -1;
                        if (!p.startsWith(folder + "/")) return false;
                        return p.split("/").length === depth;
                    })
                    .map(p => ({ name: p.split("/").pop(), full: p }));
            }
            subfolders = subfolders.filter(sf => !hidden.has(sf.name));

            // inject folder strip below actions, above file list
            let strip = document.getElementById("folderStripContainer");
            if (!strip) {
                strip = document.createElement("div");
                strip.id = "folderStripContainer";
                strip.className = "folder-strip-container";
                actionsContainer.parentNode.insertBefore(strip, actionsContainer);
            }

            if (window.showFoldersInList && subfolders.length) {
                strip.innerHTML = subfolders.map(sf => `
                  <div class="folder-item" data-folder="${sf.full}" draggable="true">
                    <i class="material-icons">folder</i>
                    <div class="folder-name">${escapeHTML(sf.name)}</div>
                  </div>
                `).join("");
                strip.style.display = "flex";

                // wire up each folder‐tile
                strip.querySelectorAll(".folder-item").forEach(el => {
                    // 1) click to navigate
                    el.addEventListener("click", () => {
                        const dest = el.dataset.folder;
                        window.currentFolder = dest;
                        localStorage.setItem("lastOpenedFolder", dest);
                        updateBreadcrumbTitle(dest);
                        document.querySelectorAll(".folder-option.selected").forEach(o => o.classList.remove("selected"));
                        document.querySelector(`.folder-option[data-folder="${dest}"]`)?.classList.add("selected");
                        loadFileList(dest);
                    });

                    // 2) drag & drop
                    el.addEventListener("dragover", folderDragOverHandler);
                    el.addEventListener("dragleave", folderDragLeaveHandler);
                    el.addEventListener("drop", folderDropHandler);

                    // 3) right-click context menu
                    el.addEventListener("contextmenu", e => {
                        e.preventDefault();
                        e.stopPropagation();

                        const dest = el.dataset.folder;
                        window.currentFolder = dest;
                        localStorage.setItem("lastOpenedFolder", dest);

                        // highlight the strip tile
                        strip.querySelectorAll(".folder-item.selected").forEach(i => i.classList.remove("selected"));
                        el.classList.add("selected");

                        // reuse folderManager menu
                        const menuItems = [
                            {
                                label: t("create_folder"),
                                action: () => document.getElementById("createFolderModal").style.display = "block"
                            },
                            {
                                label: t("rename_folder"),
                                action: () => openRenameFolderModal()
                            },
                            {
                                label: t("folder_share"),
                                action: () => openFolderShareModal(dest)
                            },
                            {
                                label: t("delete_folder"),
                                action: () => openDeleteFolderModal()
                            }
                        ];
                        showFolderManagerContextMenu(e.pageX, e.pageY, menuItems);
                    });
                });

                // one global click to hide any open context menu
                document.addEventListener("click", hideFolderManagerContextMenu);

            } else {
                strip.style.display = "none";
            }
        } catch {
            // ignore folder errors; rows already rendered
        }

        return data.files;

    } catch (err) {
        console.error("Error loading file list:", err);
        if (err.message !== "Unauthorized") {
            fileListContainer.textContent = "Error loading files.";
        }
        return [];
    } finally {
        // Only the latest call should restore visibility
        if (reqId === __fileListReqSeq) {
            fileListContainer.style.visibility = "visible";
        }
    }
}

/**
 * Update renderFileTable so it writes its content into the provided container.
 */
export function renderFileTable(folder, container, subfolders) {
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
            rowsHTML += rowHTML;
        });
    } else {
        rowsHTML += `<tr><td colspan="8">No files found.</td></tr>`;
    }
    rowsHTML += "</tbody></table>";
    const bottomControlsHTML = buildBottomControls(itemsPerPageSetting);

    fileListContent.innerHTML = combinedTopHTML + headerHTML + rowsHTML + bottomControlsHTML;

    fileListContent.querySelectorAll('.folder-item').forEach(el => {
        el.addEventListener('click', () => loadFileList(el.dataset.folder));
    });

    // pagination clicks
    const prevBtn = document.getElementById("prevPageBtn");
    if (prevBtn) prevBtn.addEventListener("click", () => {
        if (window.currentPage > 1) {
            window.currentPage--;
            renderFileTable(folder, container);
        }
    });
    const nextBtn = document.getElementById("nextPageBtn");
    if (nextBtn) nextBtn.addEventListener("click", () => {
        // totalPages is computed above in this scope
        if (window.currentPage < totalPages) {
            window.currentPage++;
            renderFileTable(folder, container);
        }
    });

    // ADD: advanced search toggle
    const advToggle = document.getElementById("advancedSearchToggle");
    if (advToggle) advToggle.addEventListener("click", () => {
        toggleAdvancedSearch();
    });

    // items-per-page selector
    const itemsSelect = document.getElementById("itemsPerPageSelect");
    if (itemsSelect) itemsSelect.addEventListener("change", e => {
        window.itemsPerPage = parseInt(e.target.value, 10);
        localStorage.setItem("itemsPerPage", window.itemsPerPage);
        window.currentPage = 1;
        renderFileTable(folder, container);
    });

    // hook up the master checkbox
    const selectAll = document.getElementById("selectAll");
    if (selectAll) {
        selectAll.addEventListener("change", () => {
            toggleAllCheckboxes(selectAll);
        });
    }

    // 1) Row-click selects the row
    fileListContent.querySelectorAll("tbody tr").forEach(row => {
        row.addEventListener("click", e => {
            // grab the underlying checkbox value
            const cb = row.querySelector(".file-checkbox");
            if (!cb) return;
            toggleRowSelection(e, cb.value);
        });
    });

    // 2) Download buttons
    fileListContent.querySelectorAll(".download-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            openDownloadModal(btn.dataset.downloadName, btn.dataset.downloadFolder);
        });
    });

    // 3) Edit buttons
    fileListContent.querySelectorAll(".edit-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            editFile(btn.dataset.editName, btn.dataset.editFolder);
        });
    });

    // 4) Rename buttons
    fileListContent.querySelectorAll(".rename-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            renameFile(btn.dataset.renameName, btn.dataset.renameFolder);
        });
    });

    // 5) Preview buttons 
    fileListContent.querySelectorAll(".preview-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            previewFile(btn.dataset.previewUrl, btn.dataset.previewName);
        });
    });

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
    const slider = document.getElementById('rowHeightSlider');
    const valueDisplay = document.getElementById('rowHeightValue');
    if (slider) {
        slider.addEventListener('input', e => {
            const v = +e.target.value;  // slider value in px
            document.documentElement.style.setProperty('--file-row-height', v + 'px');
            localStorage.setItem('rowHeight', v);
            valueDisplay.textContent = v + 'px';
        });
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

    // pagination settings
    const itemsPerPage = window.itemsPerPage;
    let currentPage = window.currentPage || 1;
    const totalFiles = filteredFiles.length;
    const totalPages = Math.ceil(totalFiles / itemsPerPage);
    if (currentPage > totalPages) {
        currentPage = totalPages || 1;
        window.currentPage = currentPage;
    }

    // --- Top controls: search + pagination + items-per-page ---
    let galleryHTML = buildSearchAndPaginationControls({
        currentPage,
        totalPages,
        searchTerm: window.currentSearchTerm || ""
    });

    // wire up search input just like table view
    setTimeout(() => {
        const searchInput = document.getElementById("searchInput");
        if (searchInput) {
            searchInput.addEventListener("input", debounce(() => {
                window.currentSearchTerm = searchInput.value;
                window.currentPage = 1;
                renderGalleryView(folder);
                // keep caret at end
                setTimeout(() => {
                    const f = document.getElementById("searchInput");
                    if (f) {
                        f.focus();
                        const len = f.value.length;
                        f.setSelectionRange(len, len);
                    }
                }, 0);
            }, 300));
        }
    }, 0);

    // --- Column slider with responsive max ---
    const numColumns = window.galleryColumns || 3;
    // clamp slider max to 1 on small (<600px), 2 on medium (<900px), else up to 6
    const w = window.innerWidth;
    let maxCols = 6;
    if (w < 600) maxCols = 1;
    else if (w < 900) maxCols = 2;

    // ensure current value doesn’t exceed the new max
    const startCols = Math.min(numColumns, maxCols);
    window.galleryColumns = startCols;

    // --- Start gallery grid ---
    galleryHTML += `
      <div class="gallery-container"
           style="display:grid;
                  grid-template-columns:repeat(${numColumns},1fr);
                  gap:10px;
                  padding:10px;">
    `;

    // slice current page
    const startIdx = (currentPage - 1) * itemsPerPage;
    const pageFiles = filteredFiles.slice(startIdx, startIdx + itemsPerPage);

    pageFiles.forEach((file, idx) => {
        const idSafe = encodeURIComponent(file.name) + "-" + (startIdx + idx);
        const cacheKey = folderPath + encodeURIComponent(file.name);

        // thumbnail
        let thumbnail;
        if (/\.(jpe?g|png|gif|bmp|webp|svg|ico)$/i.test(file.name)) {
            if (window.imageCache && window.imageCache[cacheKey]) {
                thumbnail = `<img
                    src="${window.imageCache[cacheKey]}"
                    class="gallery-thumbnail"
                    data-cache-key="${cacheKey}"
                    alt="${escapeHTML(file.name)}"
                    style="max-width:100%; max-height:${getMaxImageHeight()}px; display:block; margin:0 auto;">`;
            } else {
                const imageUrl = folderPath + encodeURIComponent(file.name) + "?t=" + Date.now();
                thumbnail = `<img
                    src="${imageUrl}"
                    class="gallery-thumbnail"
                    data-cache-key="${cacheKey}"
                    alt="${escapeHTML(file.name)}"
                    style="max-width:100%; max-height:${getMaxImageHeight()}px; display:block; margin:0 auto;">`;
            }
        } else if (/\.(mp3|wav|m4a|ogg|flac|aac|wma|opus)$/i.test(file.name)) {
            thumbnail = `<span class="material-icons gallery-icon">audiotrack</span>`;
        } else {
            thumbnail = `<span class="material-icons gallery-icon">insert_drive_file</span>`;
        }

        // tag badges
        let tagBadgesHTML = "";
        if (file.tags && file.tags.length) {
            tagBadgesHTML = `<div class="tag-badges" style="margin-top:4px;">`;
            file.tags.forEach(tag => {
                tagBadgesHTML += `<span style="background-color:${tag.color};
                                           color:#fff;
                                           padding:2px 4px;
                                           border-radius:3px;
                                           margin-right:2px;
                                           font-size:0.8em;">
                              ${escapeHTML(tag.name)}
                           </span>`;
            });
            tagBadgesHTML += `</div>`;
        }

        // card with checkbox, preview, info, buttons
        galleryHTML += `
        <div class="gallery-card"
             style="position:relative; border:1px solid #ccc; padding:5px; text-align:center;">
          <input type="checkbox"
                 class="file-checkbox"
                 id="cb-${idSafe}"
                 value="${escapeHTML(file.name)}"
                 style="position:absolute; top:5px; left:5px; z-index:10;">
          <label for="cb-${idSafe}"
                 style="position:absolute; top:5px; left:5px; width:16px; height:16px;"></label>
  
          <div class="gallery-preview" style="cursor:pointer;"
               data-preview-url="${folderPath + encodeURIComponent(file.name)}?t=${Date.now()}"
               data-preview-name="${file.name}">
            ${thumbnail}
          </div>
  
          <div class="gallery-info" style="margin-top:5px;">
            <span class="gallery-file-name"
                  style="display:block; white-space:normal; overflow-wrap:break-word;">
              ${escapeHTML(file.name)}
            </span>
            ${tagBadgesHTML}
  
            <div 
  class="btn-group btn-group-sm btn-group-hover" 
  role="group" 
  aria-label="File actions" 
  style="margin-top:5px;"
>
  <button 
    type="button" 
    class="btn btn-success py-1 download-btn" 
    data-download-name="${escapeHTML(file.name)}" 
    data-download-folder="${file.folder || "root"}" 
    title="${t('download')}"
  >
    <i class="material-icons">file_download</i>
  </button>

  ${file.editable ? `
  <button 
    type="button" 
    class="btn btn-secondary py-1 edit-btn" 
    data-edit-name="${escapeHTML(file.name)}" 
    data-edit-folder="${file.folder || "root"}" 
    title="${t('edit')}"
  >
    <i class="material-icons">edit</i>
  </button>` : ""}

  <button 
    type="button" 
    class="btn btn-warning py-1 rename-btn" 
    data-rename-name="${escapeHTML(file.name)}" 
    data-rename-folder="${file.folder || "root"}" 
    title="${t('rename')}"
  >
    <i class="material-icons">drive_file_rename_outline</i>
  </button>

  <button 
    type="button" 
    class="btn btn-secondary py-1 share-btn" 
    data-file="${escapeHTML(file.name)}" 
    title="${t('share')}"
  >
    <i class="material-icons">share</i>
  </button>
</div>
  
          </div>
        </div>
      `;
    });

    galleryHTML += `</div>`; // end gallery-container

    // bottom controls
    galleryHTML += buildBottomControls(itemsPerPage);

    // render
    fileListContent.innerHTML = galleryHTML;

    // --- Now wire up all behaviors without inline handlers ---

    //  ADD: pagination buttons for gallery
    const prevBtn = document.getElementById("prevPageBtn");
    if (prevBtn) prevBtn.addEventListener("click", () => {
        if (window.currentPage > 1) {
            window.currentPage--;
            renderGalleryView(folder, container);
        }
    });
    const nextBtn = document.getElementById("nextPageBtn");
    if (nextBtn) nextBtn.addEventListener("click", () => {
        if (window.currentPage < totalPages) {
            window.currentPage++;
            renderGalleryView(folder, container);
        }
    });

    // ←— ADD: advanced search toggle
    const advToggle = document.getElementById("advancedSearchToggle");
    if (advToggle) advToggle.addEventListener("click", () => {
        toggleAdvancedSearch();
    });

    // ←— ADD: wire up context-menu in gallery
    bindFileListContextMenu();

    // ADD: items-per-page selector for gallery
    const itemsSelect = document.getElementById("itemsPerPageSelect");
    if (itemsSelect) itemsSelect.addEventListener("change", e => {
        window.itemsPerPage = parseInt(e.target.value, 10);
        localStorage.setItem("itemsPerPage", window.itemsPerPage);
        window.currentPage = 1;
        renderGalleryView(folder, container);
    });

    // cache images on load
    fileListContent.querySelectorAll('.gallery-thumbnail').forEach(img => {
        const key = img.dataset.cacheKey;
        img.addEventListener('load', () => cacheImage(img, key));
    });

    // preview clicks
    fileListContent.querySelectorAll(".gallery-preview").forEach(el => {
        el.addEventListener("click", () => {
            previewFile(el.dataset.previewUrl, el.dataset.previewName);
        });
    });

    // download clicks
    fileListContent.querySelectorAll(".download-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            openDownloadModal(btn.dataset.downloadName, btn.dataset.downloadFolder);
        });
    });

    // edit clicks
    fileListContent.querySelectorAll(".edit-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            editFile(btn.dataset.editName, btn.dataset.editFolder);
        });
    });

    // rename clicks
    fileListContent.querySelectorAll(".rename-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            renameFile(btn.dataset.renameName, btn.dataset.renameFolder);
        });
    });

    // share clicks
    fileListContent.querySelectorAll(".share-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            const fileName = btn.dataset.file;
            const fileObj = fileData.find(f => f.name === fileName);
            if (fileObj) {
                import('./filePreview.js').then(m => m.openShareModal(fileObj, folder));
            }
        });
    });

    // checkboxes
    fileListContent.querySelectorAll(".file-checkbox").forEach(cb => {
        cb.addEventListener("change", () => updateFileActionButtons());
    });

    // slider
    const slider = document.getElementById("galleryColumnsSlider");
    if (slider) {
        slider.addEventListener("input", () => {
            const v = +slider.value;
            document.getElementById("galleryColumnsValue").textContent = v;
            window.galleryColumns = v;
            document.querySelector(".gallery-container")
                .style.gridTemplateColumns = `repeat(${v},1fr)`;
            document.querySelectorAll(".gallery-thumbnail")
                .forEach(img => img.style.maxHeight = getMaxImageHeight() + "px");
        });
    }

    // pagination functions
    window.changePage = newPage => {
        window.currentPage = newPage;
        if (window.viewMode === "gallery") renderGalleryView(folder);
        else renderFileTable(folder);
    };

    window.changeItemsPerPage = cnt => {
        window.itemsPerPage = +cnt;
        localStorage.setItem("itemsPerPage", cnt);
        window.currentPage = 1;
        if (window.viewMode === "gallery") renderGalleryView(folder);
        else renderFileTable(folder);
    };

    // update toolbar and toggle button
    updateFileActionButtons();
    createViewToggleButton();
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
        max = 1;
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
    if (!fileName || typeof fileName !== "string") return false;
    const dot = fileName.lastIndexOf(".");
    if (dot < 0) return false;

    const ext = fileName.slice(dot + 1).toLowerCase();

    // Text/code-only. Intentionally exclude php/phtml/phar/etc.
    const allowedExtensions = [
        // Plain text & docs (text)
        "txt", "text", "md", "markdown", "rst",

        // Web
        "html", "htm", "xhtml", "shtml",
        "css", "scss", "sass", "less",

        // JS/TS
        "js", "mjs", "cjs", "jsx",
        "ts", "tsx",

        // Data & config formats
        "json", "jsonc", "ndjson",
        "yml", "yaml", "toml", "xml", "plist",
        "ini", "conf", "config", "cfg", "cnf", "properties", "props", "rc",
        "env", "dotenv",
        "csv", "tsv", "tab",
        "log",

        // Shell / scripts
        "sh", "bash", "zsh", "ksh", "fish",
        "bat", "cmd",
        "ps1", "psm1", "psd1",

        // Languages
        "py", "pyw",        // Python
        "rb",              // Ruby
        "pl", "pm",         // Perl
        "go",              // Go
        "rs",              // Rust
        "java",            // Java
        "kt", "kts",        // Kotlin
        "scala", "sc",      // Scala
        "groovy", "gradle", // Groovy/Gradle
        "c", "h", "cpp", "cxx", "cc", "hpp", "hh", "hxx", // C/C++
        "m", "mm",          // Obj-C / Obj-C++
        "swift",           // Swift
        "cs", "fs", "fsx",   // C#, F#
        "dart",
        "lua",
        "r", "rmd",

        // SQL
        "sql",

        // Front-end SFC/templates
        "vue", "svelte",
        "twig", "mustache", "hbs", "handlebars", "ejs", "pug", "jade"
    ];

    return allowedExtensions.includes(ext);
}

// Expose global functions for pagination and preview.
window.changePage = function (newPage) {
    window.currentPage = newPage;
    if (window.viewMode === 'gallery') {
        renderGalleryView(window.currentFolder);
    } else {
        renderFileTable(window.currentFolder);
    }
};

window.changeItemsPerPage = function (newCount) {
    window.itemsPerPage = parseInt(newCount, 10);
    localStorage.setItem('itemsPerPage', newCount);
    window.currentPage = 1;
    if (window.viewMode === 'gallery') {
        renderGalleryView(window.currentFolder);
    } else {
        renderFileTable(window.currentFolder);
    }
};

// fileListView.js (bottom)
window.loadFileList = loadFileList;
window.renderFileTable = renderFileTable;
window.renderGalleryView = renderGalleryView;
window.sortFiles = sortFiles;
window.toggleAdvancedSearch = toggleAdvancedSearch;