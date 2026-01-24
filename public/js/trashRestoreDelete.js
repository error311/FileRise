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
let trashFetchPromise = null;

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
        sourceHint: document.getElementById("restoreModalSourceHint"),
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

function getActiveSourceLabel() {
    let id = "";
    try {
        if (typeof window.__frGetActiveSourceId === "function") {
            id = String(window.__frGetActiveSourceId() || "").trim();
        }
    } catch (e) { /* ignore */ }

    if (!id) {
        const sel = document.getElementById("sourceSelector");
        if (sel && sel.value) id = String(sel.value || "").trim();
    }

    if (!id) return "";

    let label = "";
    try {
        if (typeof window.__frGetSourceMetaById === "function") {
            const meta = window.__frGetSourceMetaById(id);
            if (meta && typeof meta === "object") {
                const name = String(meta.name || "").trim();
                const type = String(meta.type || "").trim();
                if (name && type) label = `${name} (${type})`;
                else label = name || type;
            }
        }
    } catch (e) { /* ignore */ }

    if (!label) {
        try {
            if (typeof window.__frGetSourceNameById === "function") {
                label = String(window.__frGetSourceNameById(id) || "").trim();
            }
        } catch (e) { /* ignore */ }
    }

    if (!label) {
        const sel = document.getElementById("sourceSelector");
        if (sel) {
            const opt = Array.from(sel.options).find(o => o.value === id);
            if (opt) label = String(opt.textContent || "").trim();
        }
    }

    return label || id;
}

function updateTrashSourceHint() {
    const { sourceHint } = getModalElements();
    if (!sourceHint) return;
    const label = getActiveSourceLabel();
    if (!label) {
        sourceHint.textContent = "";
        sourceHint.hidden = true;
        return;
    }
    const prefix = tr("storage_source", "Source");
    sourceHint.textContent = `${prefix}: ${label}`;
    sourceHint.hidden = false;
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
    if (trashFetchPromise) return trashFetchPromise;
    trashFetchPromise = fetch(ENDPOINTS.list, { credentials: "include" })
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .finally(() => {
            trashFetchPromise = null;
        });
    return trashFetchPromise;
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

function setTrashActionBusy(isBusy, activeBtn) {
    const {
        restoreSelectedBtn,
        restoreAllBtn,
        deleteSelectedBtn,
        deleteAllBtn
    } = getModalElements();

    [restoreSelectedBtn, restoreAllBtn, deleteSelectedBtn, deleteAllBtn].forEach((btn) => {
        if (!btn) return;
        if (isBusy) {
            btn.disabled = true;
            if (btn === activeBtn) {
                btn.setAttribute("aria-busy", "true");
            } else {
                btn.removeAttribute("aria-busy");
            }
        } else {
            btn.disabled = false;
            btn.removeAttribute("aria-busy");
        }
    });
}

function afterTrashMutation(message, closeModal = false) {
    if (message) showToast(message, 'success');
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
        showToast(data.error || tr("error_deleting_trash", "Error deleting trash files."), 'error');
    }
}

export function confirmEmptyRecycleBin(activeBtn = null) {
    showConfirm(tr("confirm_delete_all_trash", "Permanently delete all trash items? This cannot be undone."), async () => {
        setTrashActionBusy(true, activeBtn);
        try {
            await deleteAllTrashItems();
        } catch (err) {
            console.error("Error deleting all trash files:", err);
            showToast(tr("error_deleting_trash", "Error deleting trash files."), 'error');
        } finally {
            setTrashActionBusy(false);
        }
    });
}
try { window.confirmEmptyRecycleBin = confirmEmptyRecycleBin; } catch (e) {}

export function setupTrashRestoreDelete() {

    // Delegated binding: folder tree re-renders (and replaces #recycleBinBtn), so
    // we attach a single capture-phase handler that survives DOM rebuilds.
    if (!window.__frRecycleBinDelegated) {
        window.__frRecycleBinDelegated = true;
        document.addEventListener("click", (e) => {
            const btn = e.target?.closest?.("#recycleBinBtn");
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            toggleVisibility("restoreFilesModal", true);
            loadTrashItems();
        }, true);
    }

    // Sync recycle bin icon once on load (no repeating polling).
    try {
        if (window.__frRecyclePoll) {
            clearInterval(window.__frRecyclePoll);
            window.__frRecyclePoll = null;
        }
    } catch (e) {}

    if (document.visibilityState !== "hidden") {
        refreshRecycleBinIndicator();
    }

    // Expose for any explicit callers (e.g., after delete-to-trash)
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
                showToast(tr("no_trash_selected", "No trash items selected."), 'warning');
                return;
            }
            setTrashActionBusy(true, restoreSelectedBtn);
            try {
                await fetchJson(ENDPOINTS.restore, { files });
                const restoredLabel = tr("restored", "Restored");
                const msg = files.length === 1
                    ? `${restoredLabel}: ${files[0]}`
                    : `${restoredLabel}: ${files.join(", ")}`;
                afterTrashMutation(msg, true);
            } catch (err) {
                console.error("Error restoring files:", err);
                showToast(tr("error_restoring_files", "Error restoring files."), 'error');
            } finally {
                setTrashActionBusy(false);
            }
        });
    }

    if (restoreAllBtn) {
        restoreAllBtn.addEventListener("click", async () => {
            const checkboxes = document.querySelectorAll("#restoreFilesList input[type='checkbox']");
            const files = Array.from(checkboxes).map(chk => chk.value);
            if (files.length === 0) {
                showToast(tr("trash_empty", "Trash is empty."), 'info');
                return;
            }
            setTrashActionBusy(true, restoreAllBtn);
            try {
                await fetchJson(ENDPOINTS.restore, { files });
                const restoredLabel = tr("restored", "Restored");
                const msg = files.length === 1
                    ? `${restoredLabel}: ${files[0]}`
                    : `${restoredLabel}: ${files.join(", ")}`;
                afterTrashMutation(msg, true);
            } catch (err) {
                console.error("Error restoring files:", err);
                showToast(tr("error_restoring_files", "Error restoring files."), 'error');
            } finally {
                setTrashActionBusy(false);
            }
        });
    }

    if (deleteSelectedBtn) {
        deleteSelectedBtn.addEventListener("click", () => {
            const files = getSelectedFiles();
            if (files.length === 0) {
                showToast(tr("no_trash_selected", "No trash items selected for deletion."), 'warning');
                return;
            }
            showConfirm(tr("confirm_delete_selected", "Permanently delete the selected items?"), async () => {
                setTrashActionBusy(true, deleteSelectedBtn);
                try {
                    const data = await fetchJson(ENDPOINTS.delete, { files });
                    if (data.success) {
                        afterTrashMutation(data.success, true);
                    } else {
                        showToast(data.error || tr("error_deleting_trash", "Error deleting trash files."), 'error');
                    }
                } catch (err) {
                    console.error("Error deleting trash files:", err);
                    showToast(tr("error_deleting_trash", "Error deleting trash files."), 'error');
                } finally {
                    setTrashActionBusy(false);
                }
            });
        });
    }

    if (deleteAllBtn) {
        deleteAllBtn.addEventListener("click", () => {
            confirmEmptyRecycleBin(deleteAllBtn);
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
        updateTrashSourceHint();
        const trashItems = await fetchTrash();
        renderTrashList(trashItems);
        const hasItems = Array.isArray(trashItems) && trashItems.length > 0;
        updateRecycleBinState(hasItems);
        setHeaderIcon(hasItems);
    } catch (err) {
        console.error("Error loading trash items:", err);
        showToast(tr("error_loading_trash", "Error loading trash items."), 'error');
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
    } catch (e) {
        updateRecycleBinState(false);
        setHeaderIcon(false);
    }
}

/**
 * Automatically purges (permanently deletes) trash items older than 3 days.
 */
function autoPurgeOldTrash() {
    fetchTrash()
        .then(trashItems => {
            const items = Array.isArray(trashItems)
                ? trashItems
                : (Array.isArray(trashItems?.items) ? trashItems.items : []);
            if (items.length === 0) {
                return;
            }
            const now = Date.now();
            const threeDays = 3 * 24 * 60 * 60 * 1000;
            const oldItems = items.filter(item => (now - (item.trashedAt * 1000)) > threeDays);
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
