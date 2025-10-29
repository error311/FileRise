// trashRestoreDelete.js
import { sendRequest } from './networkUtils.js?v={{APP_QVER}}';
import { toggleVisibility, showToast } from './domUtils.js?v={{APP_QVER}}';
import { loadFileList } from './fileListView.js?v={{APP_QVER}}';
import { loadFolderTree } from './folderManager.js?v={{APP_QVER}}';
import { t } from './i18n.js?v={{APP_QVER}}';

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

export function setupTrashRestoreDelete() {

    // --- Attach listener to the restore button (created in auth.js) to open the modal.
    const restoreBtn = document.getElementById("restoreFilesBtn");
    if (restoreBtn) {
        restoreBtn.addEventListener("click", () => {
            toggleVisibility("restoreFilesModal", true);
            loadTrashItems();
        });
    } else {
        setTimeout(() => {
            const retryBtn = document.getElementById("restoreFilesBtn");
            if (retryBtn) {
                retryBtn.addEventListener("click", () => {
                    toggleVisibility("restoreFilesModal", true);
                    loadTrashItems();
                });
            }
        }, 500);
    }


    // --- Restore Selected: Restore only the selected trash items.
    const restoreSelectedBtn = document.getElementById("restoreSelectedBtn");
    if (restoreSelectedBtn) {
        restoreSelectedBtn.addEventListener("click", () => {
            const selected = document.querySelectorAll("#restoreFilesList input[type='checkbox']:checked");
            const files = Array.from(selected).map(chk => chk.value);
            console.log("Restore Selected clicked, files:", files);
            if (files.length === 0) {
                showToast(t("no_trash_selected"));
                return;
            }
            fetch("/api/file/restoreFiles.php", {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": window.csrfToken
                },
                body: JSON.stringify({ files })
            })
                .then(response => response.json())
                .then(() => {
                    // Always report what we actually restored
                    if (files.length === 1) {
                        showToast(`Restored file: ${files[0]}`);
                    } else {
                        showToast(`Restored files: ${files.join(", ")}`);
                    }
                    toggleVisibility("restoreFilesModal", false);
                    loadFileList(window.currentFolder);
                    loadFolderTree(window.currentFolder);
                })
                .catch(err => {
                    console.error("Error restoring files:", err);
                    showToast("Error restoring files.");
                });
        });
    } else {
        console.error("restoreSelectedBtn not found.");
    }

    // --- Restore All: Restore all trash items.
    const restoreAllBtn = document.getElementById("restoreAllBtn");
    if (restoreAllBtn) {
        restoreAllBtn.addEventListener("click", () => {
            const allChk = document.querySelectorAll("#restoreFilesList input[type='checkbox']");
            const files = Array.from(allChk).map(chk => chk.value);
            console.log("Restore All clicked, files:", files);
            if (files.length === 0) {
                showToast(t("trash_empty"));
                return;
            }
            fetch("/api/file/restoreFiles.php", {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": window.csrfToken
                },
                body: JSON.stringify({ files })
            })
                .then(response => response.json())
                .then(() => {
                    if (files.length === 1) {
                        showToast(`Restored file: ${files[0]}`);
                    } else {
                        showToast(`Restored files: ${files.join(", ")}`);
                    }
                    toggleVisibility("restoreFilesModal", false);
                    loadFileList(window.currentFolder);
                    loadFolderTree(window.currentFolder);
                })
                .catch(err => {
                    console.error("Error restoring files:", err);
                    showToast("Error restoring files.");
                });
        });
    } else {
        console.error("restoreAllBtn not found.");
    }

    // --- Delete Selected: Permanently delete selected trash items with confirmation.
    const deleteTrashSelectedBtn = document.getElementById("deleteTrashSelectedBtn");
    if (deleteTrashSelectedBtn) {
        deleteTrashSelectedBtn.addEventListener("click", () => {
            const selected = document.querySelectorAll("#restoreFilesList input[type='checkbox']:checked");
            const files = Array.from(selected).map(chk => chk.value);
            console.log("Delete Selected clicked, files:", files);
            if (files.length === 0) {
                showToast("No trash items selected for deletion.");
                return;
            }
            showConfirm("Are you sure you want to permanently delete the selected trash items?", () => {
                fetch("/api/file/deleteTrashFiles.php", {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                        "X-CSRF-Token": window.csrfToken
                    },
                    body: JSON.stringify({ files })
                })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            showToast(data.success);
                            loadTrashItems();
                            loadFileList(window.currentFolder);
                            loadFolderTree(window.currentFolder);
                        } else {
                            showToast(data.error);
                        }
                    })
                    .catch(err => {
                        console.error("Error deleting trash files:", err);
                        showToast("Error deleting trash files.");
                    });
            });
        });
    } else {
        console.error("deleteTrashSelectedBtn not found.");
    }

    // --- Delete All: Permanently delete all trash items with confirmation.
    const deleteAllBtn = document.getElementById("deleteAllBtn");
    if (deleteAllBtn) {
        deleteAllBtn.addEventListener("click", () => {
            showConfirm("Are you sure you want to permanently delete all trash items? This action cannot be undone.", () => {
                fetch("/api/file/deleteTrashFiles.php", {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                        "X-CSRF-Token": window.csrfToken
                    },
                    body: JSON.stringify({ deleteAll: true })
                })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            showToast(data.success);
                            toggleVisibility("restoreFilesModal", false);
                            loadFileList(window.currentFolder);
                            loadFolderTree(window.currentFolder);
                        } else {
                            showToast(data.error);
                        }
                    })
                    .catch(err => {
                        console.error("Error deleting all trash files:", err);
                        showToast("Error deleting all trash files.");
                    });
            });
        });
    } else {
        console.error("deleteAllBtn not found.");
    }

    // --- Close the Restore Modal ---
    const closeRestoreModal = document.getElementById("closeRestoreModal");
    if (closeRestoreModal) {
        closeRestoreModal.addEventListener("click", () => {
            toggleVisibility("restoreFilesModal", false);
        });
    } else {
        console.error("closeRestoreModal not found.");
    }

    // --- Auto-purge old trash items (older than 3 days) ---
    autoPurgeOldTrash();
}

/**
 * Loads trash items from the server and updates the restore modal list.
 */
export function loadTrashItems() {
    fetch("/api/file/getTrashItems.php", { credentials: "include" })
        .then(response => response.json())
        .then(trashItems => {
            const listContainer = document.getElementById("restoreFilesList");
            if (listContainer) {
                listContainer.innerHTML = "";
                trashItems.forEach(item => {
                    const li = document.createElement("li");
                    li.style.listStyle = "none";
                    li.style.marginBottom = "5px";

                    const checkbox = document.createElement("input");
                    checkbox.type = "checkbox";
                    checkbox.value = item.trashName;
                    li.appendChild(checkbox);

                    const label = document.createElement("label");
                    label.style.marginLeft = "8px";
                    // Include the deletedBy username in the label text.
                    const deletedBy = item.deletedBy ? item.deletedBy : "Unknown";
                    label.textContent = `${item.originalName} (${deletedBy} trashed on ${new Date(item.trashedAt * 1000).toLocaleString()})`;
                    li.appendChild(label);

                    listContainer.appendChild(li);
                });
            }
        })
        .catch(err => {
            console.error("Error loading trash items:", err);
            showToast("Error loading trash items.");
        });
}

/**
 * Automatically purges (permanently deletes) trash items older than 3 days.
 */
function autoPurgeOldTrash() {
    fetch("/api/file/getTrashItems.php", { credentials: "include" })
        .then(response => response.json())
        .then(trashItems => {
            const now = Date.now();
            const threeDays = 3 * 24 * 60 * 60 * 1000;
            const oldItems = trashItems.filter(item => (now - (item.trashedAt * 1000)) > threeDays);
            if (oldItems.length > 0) {
                const files = oldItems.map(item => item.trashName);
                fetch("/api/file/deleteTrashFiles.php", {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                        "X-CSRF-Token": window.csrfToken
                    },
                    body: JSON.stringify({ files })
                })
                    .then(response => response.json())
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