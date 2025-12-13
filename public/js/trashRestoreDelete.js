// trashRestoreDelete.js
import { toggleVisibility, showToast } from './domUtils.js?v={{APP_QVER}}';
import { loadFileList } from './fileListView.js?v={{APP_QVER}}';
import { loadFolderTree, refreshFolderIcon, updateRecycleBinState, recycleBinSVG } from './folderManager.js?v={{APP_QVER}}';
import { t } from './i18n.js?v={{APP_QVER}}';

const ENDPOINTS = {
  list: '/api/file/getTrashItems.php',
  restore: '/api/file/restoreFiles.php',
  delete: '/api/file/deleteTrashFiles.php',
};

function showConfirm(message, onConfirm) {
    const modal = document.getElementById("customConfirmModal");
    const messageElem = document.getElementById("confirmMessage");
    const yesBtn = document.getElementById("confirmYesBtn");
    const noBtn = document.getElementById("confirmNoBtn");

    if (!modal || !messageElem || !yesBtn || !noBtn) {
        if (confirm(message)) {
            onConfirm();
        }
        return;
    }

    messageElem.textContent = message;
    modal.style.display = "block";

    // Clear any previous event listeners by cloning the node.
    const yesBtnClone = yesBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(yesBtnClone, yesBtn);
    const noBtnClone = noBtn.cloneNode(true);
    noBtn.parentNode.replaceChild(noBtnClone, noBtn);

    yesBtnClone.addEventListener("click", () => {
        modal.style.display = "none";
        onConfirm();
    });
    noBtnClone.addEventListener("click", () => {
        modal.style.display = "none";
    });
}

function tr(key, fallback) {
    const translated = t(key);
    if (!translated || translated === key) return fallback;
    return translated;
}

function getModalElements() {
    return {
        modal: document.getElementById("restoreFilesModal"),
        list: document.getElementById("restoreFilesList"),
        headerIcon: document.getElementById("restoreModalIcon"),
        restoreSelectedBtn: document.getElementById("restoreSelectedBtn"),
        restoreAllBtn: document.getElementById("restoreAllBtn"),
        deleteSelectedBtn: document.getElementById("deleteTrashSelectedBtn"),
        deleteAllBtn: document.getElementById("deleteAllBtn"),
        closeBtn: document.getElementById("closeRestoreModal"),
    };
}

function setHeaderIcon(hasItems) {
    const { headerIcon } = getModalElements();
    if (!headerIcon) return;
    headerIcon.innerHTML = recycleBinSVG(hasItems, 32);
}

async function fetchJson(url, body) {
    const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": window.csrfToken
        },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function fetchTrash() {
    const res = await fetch(ENDPOINTS.list, { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

function updateRowSelection(row, checked) {
    row.classList.toggle("selected", checked);
    row.setAttribute("aria-selected", checked ? "true" : "false");
}

function toggleRow(row, checkbox) {
    checkbox.checked = !checkbox.checked;
    updateRowSelection(row, checkbox.checked);
}

function buildTrashRow(item) {
    const row = document.createElement("div");
    row.className = "restore-row";
    row.setAttribute("role", "option");
    row.setAttribute("tabindex", "0");
    row.dataset.trashName = item.trashName;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = item.trashName;
    checkbox.className = "restore-checkbox";

    const textWrap = document.createElement("div");
    textWrap.className = "restore-row-text";

    const primary = document.createElement("div");
    primary.className = "restore-primary";
    primary.textContent = item.originalName || item.trashName;

    const meta = document.createElement("div");
    meta.className = "restore-meta";
    const deletedBy = item.deletedBy || tr("unknown_user", "Unknown");
    const trashedDate = item.trashedAt ? new Date(item.trashedAt * 1000).toLocaleString() : "";
    meta.textContent = trashedDate ? `${deletedBy} • ${trashedDate}` : deletedBy;

    textWrap.append(primary, meta);
    row.append(checkbox, textWrap);

    checkbox.addEventListener("change", () => updateRowSelection(row, checkbox.checked));
    row.addEventListener("click", (e) => {
        if (e.target === checkbox) return;
        toggleRow(row, checkbox);
    });
    row.addEventListener("keydown", (e) => {
        if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            toggleRow(row, checkbox);
        }
    });

    return row;
}

function renderTrashList(trashItems) {
    const { list } = getModalElements();
    if (!list) return;

    list.innerHTML = "";

    if (!Array.isArray(trashItems) || trashItems.length === 0) {
        const emptyState = document.createElement("div");
        emptyState.className = "restore-empty";
        emptyState.textContent = tr("trash_empty", "Trash is empty.");
        list.appendChild(emptyState);
        return;
    }

    const frag = document.createDocumentFragment();
    trashItems.forEach(item => frag.appendChild(buildTrashRow(item)));
    list.appendChild(frag);
}

function getSelectedFiles() {
    const { list } = getModalElements();
    if (!list) return [];
    return Array.from(list.querySelectorAll("input[type='checkbox']:checked")).map(chk => chk.value);
}

function afterTrashMutation(message, closeModal = false) {
    if (message) showToast(message);
    loadTrashItems();
    loadFileList(window.currentFolder);
    loadFolderTree(window.currentFolder);
    refreshFolderIcon(window.currentFolder);
    if (closeModal) toggleVisibility("restoreFilesModal", false);
}

async function deleteAllTrashItems() {
    const data = await fetchJson(ENDPOINTS.delete, { deleteAll: true });
    if (data.success) {
        afterTrashMutation(data.success, true);
    } else {
        showToast(data.error || tr("error_deleting_trash", "Error deleting trash files."));
    }
}

export function confirmEmptyRecycleBin() {
    showConfirm(tr("confirm_delete_all_trash", "Permanently delete all trash items? This cannot be undone."), async () => {
        try {
            await deleteAllTrashItems();
        } catch (err) {
            console.error("Error deleting all trash files:", err);
            showToast(tr("error_deleting_trash", "Error deleting trash files."));
        }
    });
}
try { window.confirmEmptyRecycleBin = confirmEmptyRecycleBin; } catch {}

export function setupTrashRestoreDelete() {

    const wireTrigger = () => {
        const btn = document.getElementById("recycleBinBtn");
        if (!btn) return false;
        btn.addEventListener("click", () => {
            toggleVisibility("restoreFilesModal", true);
            loadTrashItems();
        });
        return true;
    };

    if (!wireTrigger()) {
        setTimeout(wireTrigger, 500);
    }

    // Sync recycle bin icon on load
    refreshRecycleBinIndicator();
    if (!window.__frRecyclePoll) {
        window.__frRecyclePoll = setInterval(refreshRecycleBinIndicator, 15000);
    }
    window.refreshRecycleBinIndicator = refreshRecycleBinIndicator;

    const {
        restoreSelectedBtn,
        restoreAllBtn,
        deleteSelectedBtn,
        deleteAllBtn,
        closeBtn
    } = getModalElements();

    if (restoreSelectedBtn) {
        restoreSelectedBtn.addEventListener("click", async () => {
            const files = getSelectedFiles();
            if (files.length === 0) {
                showToast(tr("no_trash_selected", "No trash items selected."));
                return;
            }
            try {
                await fetchJson(ENDPOINTS.restore, { files });
                const restoredLabel = tr("restored", "Restored");
                const msg = files.length === 1
                    ? `${restoredLabel}: ${files[0]}`
                    : `${restoredLabel}: ${files.join(", ")}`;
                afterTrashMutation(msg, true);
            } catch (err) {
                console.error("Error restoring files:", err);
                showToast(tr("error_restoring_files", "Error restoring files."));
            }
        });
    }

    if (restoreAllBtn) {
        restoreAllBtn.addEventListener("click", async () => {
            const checkboxes = document.querySelectorAll("#restoreFilesList input[type='checkbox']");
            const files = Array.from(checkboxes).map(chk => chk.value);
            if (files.length === 0) {
                showToast(tr("trash_empty", "Trash is empty."));
                return;
            }
            try {
                await fetchJson(ENDPOINTS.restore, { files });
                const restoredLabel = tr("restored", "Restored");
                const msg = files.length === 1
                    ? `${restoredLabel}: ${files[0]}`
                    : `${restoredLabel}: ${files.join(", ")}`;
                afterTrashMutation(msg, true);
            } catch (err) {
                console.error("Error restoring files:", err);
                showToast(tr("error_restoring_files", "Error restoring files."));
            }
        });
    }

    if (deleteSelectedBtn) {
        deleteSelectedBtn.addEventListener("click", () => {
            const files = getSelectedFiles();
            if (files.length === 0) {
                showToast(tr("no_trash_selected", "No trash items selected for deletion."));
                return;
            }
            showConfirm(tr("confirm_delete_selected", "Permanently delete the selected items?"), async () => {
                try {
                    const data = await fetchJson(ENDPOINTS.delete, { files });
                    if (data.success) {
                        afterTrashMutation(data.success, true);
                    } else {
                        showToast(data.error || tr("error_deleting_trash", "Error deleting trash files."));
                    }
                } catch (err) {
                    console.error("Error deleting trash files:", err);
                    showToast(tr("error_deleting_trash", "Error deleting trash files."));
                }
            });
        });
    }

    if (deleteAllBtn) {
        deleteAllBtn.addEventListener("click", () => {
            confirmEmptyRecycleBin();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener("click", () => toggleVisibility("restoreFilesModal", false));
    }

    // --- Auto-purge old trash items (older than 3 days) ---
    autoPurgeOldTrash();
}

/**
 * Loads trash items from the server and updates the restore modal list.
 */
export async function loadTrashItems() {
    try {
        const trashItems = await fetchTrash();
        renderTrashList(trashItems);
        const hasItems = Array.isArray(trashItems) && trashItems.length > 0;
        updateRecycleBinState(hasItems);
        setHeaderIcon(hasItems);
    } catch (err) {
        console.error("Error loading trash items:", err);
        showToast(tr("error_loading_trash", "Error loading trash items."));
        updateRecycleBinState(false);
        setHeaderIcon(false);
    }
}

export async function refreshRecycleBinIndicator() {
    try {
        const trashItems = await fetchTrash();
        const hasItems = Array.isArray(trashItems) && trashItems.length > 0;
        updateRecycleBinState(hasItems);
        setHeaderIcon(hasItems);
    } catch {
        updateRecycleBinState(false);
        setHeaderIcon(false);
    }
}

/**
 * Automatically purges (permanently deletes) trash items older than 3 days.
 */
function autoPurgeOldTrash() {
    fetch(ENDPOINTS.list, { credentials: "include" })
        .then(response => response.json())
        .then(trashItems => {
            const now = Date.now();
            const threeDays = 3 * 24 * 60 * 60 * 1000;
            const oldItems = trashItems.filter(item => (now - (item.trashedAt * 1000)) > threeDays);
            if (oldItems.length > 0) {
                const files = oldItems.map(item => item.trashName);
                fetchJson(ENDPOINTS.delete, { files })
                    .then(data => {
                        if (data.success) {
                            console.log("Auto-purged old trash items:", data.success);
                            loadTrashItems();
                        } else {
                            console.warn("Auto-purge warning:", data.error);
                        }
                    })
                    .catch(err => {
                        console.error("Error auto-purging old trash items:", err);
                    });
            }
        })
        .catch(err => {
            console.error("Error retrieving trash items for auto-purge:", err);
        });
}
