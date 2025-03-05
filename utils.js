// =======================
// Utility Functions
// =======================
let fileData = []; // will store the fetched file data
let sortOrder = { column: "uploaded", ascending: true };

/**
 * Sends an AJAX request using the Fetch API.
 * @param {string} url - The endpoint URL.
 * @param {string} [method="GET"] - The HTTP method.
 * @param {object|null} [data=null] - The payload to send (for POST/PUT).
 * @returns {Promise} Resolves with JSON (or text) response or rejects with an error.
 */
export function sendRequest(url, method = "GET", data = null) {
  console.log("Sending request to:", url, "with method:", method);
  const options = { method, headers: { "Content-Type": "application/json" } };
  if (data) {
    options.body = JSON.stringify(data);
  }
  return fetch(url, options)
    .then(response => {
      console.log("Response status:", response.status);
      if (!response.ok) {
        return response.text().then(text => {
          throw new Error(`HTTP error ${response.status}: ${text}`);
        });
      }
      return response.json().catch(() => {
        console.warn("Response is not JSON, returning as text");
        return response.text();
      });
    });
}

/**
 * Toggles the display of an element by its ID.
 * @param {string} elementId - The element’s ID.
 * @param {boolean} shouldShow - True to display the element, false to hide.
 */
export function toggleVisibility(elementId, shouldShow) {
  const element = document.getElementById(elementId);
  if (element) {
    element.style.display = shouldShow ? "block" : "none";
  } else {
    console.error(`Element with id "${elementId}" not found.`);
  }
}

// Expose utilities to the global scope.
window.sendRequest = sendRequest;
window.toggleVisibility = toggleVisibility;

// =======================
// Application Code
// =======================

// Global variables
let currentFolder = "root";
let setupMode = false;

/**
 * Determines if a file is editable based on its extension.
 * @param {string} fileName 
 * @returns {boolean}
 */

function canEditFile(fileName) {
  const allowedExtensions = ["txt", "html", "htm", "php", "css", "js", "json", "xml", "md", "py", "ini", "csv", "log", "conf", "config", "bat", "rtf", "doc", "docx"];
  const parts = fileName.split('.');
  if (parts.length < 2) return false;
  const ext = parts.pop().toLowerCase();
  return allowedExtensions.includes(ext);
}

/**
 * Displays a file preview (either an image or an icon) in a container.
 * @param {File} file - The file to preview.
 * @param {HTMLElement} container - The container to append the preview.
 */
export function displayFilePreview(file, container) {
  if (file.type.startsWith("image/")) {
    const img = document.createElement("img");
    img.style.width = "32px";
    img.style.height = "32px";
    img.style.objectFit = "cover";
    const reader = new FileReader();
    reader.onload = function (e) {
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    container.appendChild(img);
  } else {
    const icon = document.createElement("i");
    icon.className = "material-icons";
    icon.style.fontSize = "32px";
    icon.style.color = "#555";
    icon.textContent = "insert_drive_file";
    container.appendChild(icon);
  }
}

// =======================
// DOMContentLoaded
// =======================
document.addEventListener("DOMContentLoaded", function () {

  checkAuthentication();

  /**
   * Updates the UI based on authentication and setup data.
   * @param {object} data 
   */
  function updateUI(data) {
    console.log("Auth data:", data);
    if (data.setup) {
      setupMode = true;
      toggleVisibility("loginForm", false);
      document.getElementById("mainOperations").style.display = "none";
      document.getElementById("fileListContainer").style.display = "none";
      document.querySelector(".header-buttons").style.visibility = "hidden";
      document.getElementById("addUserModal").style.display = "block";
      return;
    } else {
      setupMode = false;
    }
    if (data.authenticated) {
      toggleVisibility("loginForm", false);
      document.getElementById("mainOperations").style.display = "block";
      document.getElementById("fileListContainer").style.display = "block";
      document.querySelector(".header-buttons").style.visibility = "visible";
      if (data.isAdmin) {
        document.getElementById("logoutBtn").style.display = "block";
        document.getElementById("addUserBtn").style.display = "block";
        document.getElementById("removeUserBtn").style.display = "block";
      } else {
        document.getElementById("logoutBtn").style.display = "block";
        document.getElementById("addUserBtn").style.display = "none";
        document.getElementById("removeUserBtn").style.display = "none";
      }
      loadFolderList();
    } else {
      // Show login form if not authenticated.
      toggleVisibility("loginForm", true);
      document.getElementById("mainOperations").style.display = "none";
      document.getElementById("fileListContainer").style.display = "none";
      document.querySelector(".header-buttons").style.visibility = "hidden";
    }
  }

  /**
   * Checks if the user is authenticated.
   */
  function checkAuthentication() {
    sendRequest("checkAuth.php")
      .then(updateUI)
      .catch(error => console.error("Error checking authentication:", error));
  }
  window.checkAuthentication = checkAuthentication;

  // -----------------------
  // Authentication Form
  // -----------------------
  document.getElementById("authForm").addEventListener("submit", function (event) {
    event.preventDefault();
    const formData = {
      username: document.getElementById("loginUsername").value.trim(),
      password: document.getElementById("loginPassword").value.trim()
    };
    sendRequest("auth.php", "POST", formData)
      .then(data => {
        if (data.success) {
          updateUI({ authenticated: true, isAdmin: data.isAdmin });
        } else {
          alert("Login failed: " + (data.error || "Unknown error"));
        }
      })
      .catch(error => console.error("Error logging in:", error));
  });

  document.getElementById("logoutBtn").addEventListener("click", function () {
    fetch("logout.php", { method: "POST" })
      .then(() => window.location.reload(true))
      .catch(error => console.error("Logout error:", error));
  });

  // -----------------------
  // Add User Functionality
  // -----------------------
  document.getElementById("addUserBtn").addEventListener("click", function () {
    resetUserForm();
    document.getElementById("addUserModal").style.display = "block";
  });
  document.getElementById("saveUserBtn").addEventListener("click", function () {
    const newUsername = document.getElementById("newUsername").value.trim();
    const newPassword = document.getElementById("newPassword").value.trim();
    const isAdmin = document.getElementById("isAdmin").checked;
    if (!newUsername || !newPassword) {
      alert("Username and password are required!");
      return;
    }
    let url = "addUser.php";
    if (setupMode) {
      url += "?setup=1";
    }
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: newUsername, password: newPassword, isAdmin })
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          alert("User added successfully!");
          closeAddUserModal();
          checkAuthentication();
        } else {
          alert("Error: " + (data.error || "Could not add user"));
        }
      })
      .catch(error => console.error("Error adding user:", error));
  });
  document.getElementById("cancelUserBtn").addEventListener("click", function () {
    closeAddUserModal();
  });

  // -----------------------
  // Remove User Functionality
  // -----------------------
  document.getElementById("removeUserBtn").addEventListener("click", function () {
    loadUserList();
    document.getElementById("removeUserModal").style.display = "block";
  });
  document.getElementById("deleteUserBtn").addEventListener("click", function () {
    const selectElem = document.getElementById("removeUsernameSelect");
    const usernameToRemove = selectElem.value;
    if (!usernameToRemove) {
      alert("Please select a user to remove.");
      return;
    }
    if (!confirm("Are you sure you want to delete user " + usernameToRemove + "?")) {
      return;
    }
    fetch("removeUser.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: usernameToRemove })
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          alert("User removed successfully!");
          closeRemoveUserModal();
          loadUserList();
        } else {
          alert("Error: " + (data.error || "Could not remove user"));
        }
      })
      .catch(error => console.error("Error removing user:", error));
  });
  document.getElementById("cancelRemoveUserBtn").addEventListener("click", function () {
    closeRemoveUserModal();
  });

  function closeAddUserModal() {
    document.getElementById("addUserModal").style.display = "none";
    resetUserForm();
  }
  function resetUserForm() {
    document.getElementById("newUsername").value = "";
    document.getElementById("newPassword").value = "";
  }
  function closeRemoveUserModal() {
    document.getElementById("removeUserModal").style.display = "none";
    document.getElementById("removeUsernameSelect").innerHTML = "";
  }
  function loadUserList() {
    fetch("getUsers.php")
      .then(response => response.json())
      .then(data => {
        const users = Array.isArray(data) ? data : (data.users || []);
        if (!users || !Array.isArray(users)) {
          console.error("Invalid users data:", data);
          return;
        }
        const selectElem = document.getElementById("removeUsernameSelect");
        selectElem.innerHTML = "";
        users.forEach(user => {
          const option = document.createElement("option");
          option.value = user.username;
          option.textContent = user.username;
          selectElem.appendChild(option);
        });
        if (selectElem.options.length === 0) {
          alert("No other users found to remove.");
          closeRemoveUserModal();
        }
      })
      .catch(error => console.error("Error loading user list:", error));
  }

  // -----------------------
  // Folder Management
  // -----------------------
  function loadFolderList(selectedFolder) {
    const folderSelect = document.getElementById("folderSelect");
    folderSelect.innerHTML = "";
    const rootOption = document.createElement("option");
    rootOption.value = "root";
    rootOption.textContent = "(Root)";
    folderSelect.appendChild(rootOption);
    fetch("getFolderList.php")
      .then(response => response.json())
      .then(folders => {
        folders.forEach(function (folder) {
          let option = document.createElement("option");
          option.value = folder;
          option.textContent = folder;
          folderSelect.appendChild(option);
        });
        if (selectedFolder && [...folderSelect.options].some(opt => opt.value === selectedFolder)) {
          folderSelect.value = selectedFolder;
        } else {
          folderSelect.value = "root";
        }
        currentFolder = folderSelect.value;
        document.getElementById("fileListTitle").textContent =
          currentFolder === "root" ? "Files in (Root)" : "Files in (" + currentFolder + ")";
        loadFileList(currentFolder);
      })
      .catch(error => console.error("Error loading folder list:", error));
  }
  document.getElementById("folderSelect").addEventListener("change", function () {
    currentFolder = this.value;
    document.getElementById("fileListTitle").textContent =
      currentFolder === "root" ? "Files in (Root)" : "Files in (" + currentFolder + ")";
    loadFileList(currentFolder);
  });
  document.getElementById("createFolderBtn").addEventListener("click", function () {
    let folderName = prompt("Enter folder name:");
    if (folderName) {
      fetch("createFolder.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: folderName })
      })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            alert("Folder created successfully!");
            loadFolderList(folderName);
          } else {
            alert("Error: " + (data.error || "Could not create folder"));
          }
        })
        .catch(error => console.error("Error creating folder:", error));
    }
  });
  document.getElementById("renameFolderBtn").addEventListener("click", function () {
    const folderSelect = document.getElementById("folderSelect");
    const selectedFolder = folderSelect.value;
    if (!selectedFolder || selectedFolder === "root") {
      alert("Please select a valid folder to rename.");
      return;
    }
    let newFolderName = prompt("Enter new folder name for '" + selectedFolder + "':", selectedFolder);
    if (newFolderName && newFolderName !== selectedFolder) {
      fetch("renameFolder.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldFolder: selectedFolder, newFolder: newFolderName })
      })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            alert("Folder renamed successfully!");
            loadFolderList(newFolderName);
          } else {
            alert("Error: " + (data.error || "Could not rename folder"));
          }
        })
        .catch(error => console.error("Error renaming folder:", error));
    }
  });
  document.getElementById("deleteFolderBtn").addEventListener("click", function () {
    const folderSelect = document.getElementById("folderSelect");
    const selectedFolder = folderSelect.value;
    if (!selectedFolder || selectedFolder === "root") {
      alert("Please select a valid folder to delete.");
      return;
    }
    if (confirm("Are you sure you want to delete folder " + selectedFolder + "?")) {
      fetch("deleteFolder.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: selectedFolder })
      })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            alert("Folder deleted successfully!");
            loadFolderList("root");
          } else {
            alert("Error: " + (data.error || "Could not delete folder"));
          }
        })
        .catch(error => console.error("Error deleting folder:", error));
    }
  });

  // -----------------------
  // File List Management
  // -----------------------

  // Load the file list for a given folder (defaults to currentFolder or "root")
  function loadFileList(folderParam) {
    const folder = folderParam || currentFolder || "root";
    fetch("getFileList.php?folder=" + encodeURIComponent(folder))
      .then(response => response.json())
      .then(data => {
        const fileListContainer = document.getElementById("fileList");
        fileListContainer.innerHTML = "";
        if (data.files && data.files.length > 0) {
          // Save the file list globally for sorting
          fileData = data.files;
          // Render the table initially using the current sortOrder
          renderFileTable(folder);
        } else {
          fileListContainer.textContent = "No files found.";
          document.getElementById("deleteSelectedBtn").style.display = "none";
          document.getElementById("copySelectedBtn").style.display = "none";
          document.getElementById("moveSelectedBtn").style.display = "none";
          document.getElementById("copyMoveFolderSelect").style.display = "none";
        }
      })
      .catch(error => console.error("Error loading file list:", error));
  }

  // Helper function to escape special HTML characters
  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderFileTable(folder) {
    const fileListContainer = document.getElementById("fileList");
    // Use encodeURIComponent on folder for the URL part
    const folderPath = (folder === "root") ? "uploads/" : "uploads/" + encodeURIComponent(folder) + "/";
    let tableHTML = `<table class="table">
    <thead>
      <tr>
        <th><input type="checkbox" id="selectAll" onclick="toggleAllCheckboxes(this)"></th>
        <th data-column="name" style="cursor:pointer; text-decoration: underline; white-space: nowrap;">
          File Name ${sortOrder.column === "name" ? (sortOrder.ascending ? "▲" : "▼") : ""}
        </th>
        <th data-column="modified" style="cursor:pointer; text-decoration: underline; white-space: nowrap;">
          Date Modified ${sortOrder.column === "modified" ? (sortOrder.ascending ? "▲" : "▼") : ""}
        </th>
        <th data-column="uploaded" style="cursor:pointer; text-decoration: underline; white-space: nowrap;">
          Upload Date ${sortOrder.column === "uploaded" ? (sortOrder.ascending ? "▲" : "▼") : ""}
        </th>
        <th data-column="size" style="cursor:pointer; text-decoration: underline; white-space: nowrap;">
          File Size ${sortOrder.column === "size" ? (sortOrder.ascending ? "▲" : "▼") : ""}
        </th>
        <th data-column="uploader" style="cursor:pointer; text-decoration: underline; white-space: nowrap;">
          Uploader ${sortOrder.column === "uploader" ? (sortOrder.ascending ? "▲" : "▼") : ""}
        </th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>`;

    fileData.forEach(file => {
      // Determine if file is editable via your canEditFile() helper
      const isEditable = canEditFile(file.name);
      // Escape user-supplied file name and other properties for safe HTML output.
      const safeFileName = escapeHTML(file.name);
      const safeModified = escapeHTML(file.modified);
      const safeUploaded = escapeHTML(file.uploaded);
      const safeSize = escapeHTML(file.size);
      const safeUploader = escapeHTML(file.uploader || "Unknown");

      tableHTML += `<tr>
      <td><input type="checkbox" class="file-checkbox" value="${safeFileName}" onclick="toggleDeleteButton()"></td>
      <td>${safeFileName}</td>
      <td style="white-space: nowrap;">${safeModified}</td>
      <td style="white-space: nowrap;">${safeUploaded}</td>
      <td style="white-space: nowrap;">${safeSize}</td>
      <td style="white-space: nowrap;">${safeUploader}</td>
      <td>
        <div style="display: inline-flex; align-items: center; gap: 5px; flex-wrap: nowrap;">
          <a class="btn btn-sm btn-success" href="${folderPath + encodeURIComponent(file.name)}" download>Download</a>
          ${isEditable
          ? `<button class="btn btn-sm btn-primary ml-2" onclick="editFile(${JSON.stringify(file.name)}, ${JSON.stringify(folder)})">Edit</button>`
          : ""
        }
        </div>
      </td>
    </tr>`;
    });

    tableHTML += `</tbody></table>`;
    fileListContainer.innerHTML = tableHTML;

    // Attach click event listeners to header cells for sorting
    const headerCells = document.querySelectorAll("table.table thead th[data-column]");
    headerCells.forEach(cell => {
      cell.addEventListener("click", function () {
        const column = this.getAttribute("data-column");
        sortFiles(column, folder);
      });
    });



    // Show or hide action buttons based on whether files exist
    const deleteBtn = document.getElementById("deleteSelectedBtn");
    const copyBtn = document.getElementById("copySelectedBtn");
    const moveBtn = document.getElementById("moveSelectedBtn");
    if (fileData.length > 0) {
      deleteBtn.style.display = "block";
      copyBtn.style.display = "block";
      moveBtn.style.display = "block";
      document.getElementById("copyMoveFolderSelect").style.display = "inline-block";
    } else {
      deleteBtn.style.display = "none";
      copyBtn.style.display = "none";
      moveBtn.style.display = "none";
      document.getElementById("copyMoveFolderSelect").style.display = "none";
    }

  }

  function sortFiles(column, folder) {
    // Toggle sort direction if the same column is clicked; otherwise, sort ascending
    if (sortOrder.column === column) {
      sortOrder.ascending = !sortOrder.ascending;
    } else {
      sortOrder.column = column;
      sortOrder.ascending = true;
    }
    fileData.sort((a, b) => {
      let valA = a[column] || "";
      let valB = b[column] || "";
      // If sorting by date, convert to timestamp
      if (column === "modified" || column === "uploaded") {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      } else if (typeof valA === "string") {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }
      if (valA < valB) return sortOrder.ascending ? -1 : 1;
      if (valA > valB) return sortOrder.ascending ? 1 : -1;
      return 0;
    });
    // Re-render the table after sorting
    renderFileTable(folder);
  }




  // Delete Selected Files handler (existing)
  function handleDeleteSelected(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    const checkboxes = document.querySelectorAll(".file-checkbox:checked");
    if (checkboxes.length === 0) {
      alert("No files selected.");
      return;
    }
    if (!confirm("Are you sure you want to delete the selected files?")) {
      return;
    }
    const filesToDelete = Array.from(checkboxes).map(chk => chk.value);
    fetch("deleteFiles.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: currentFolder, files: filesToDelete })
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          alert("Selected files deleted successfully!");
          loadFileList(currentFolder);
        } else {
          alert("Error: " + (data.error || "Could not delete files"));
        }
      })
      .catch(error => console.error("Error deleting files:", error));
  }

  // NEW: Handle Copy Selected Files
  function handleCopySelected(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    const checkboxes = document.querySelectorAll(".file-checkbox:checked");
    if (checkboxes.length === 0) {
      alert("No files selected for copying.");
      return;
    }
    const targetFolder = document.getElementById("copyMoveFolderSelect").value;
    if (!targetFolder) {
      alert("Please select a target folder for copying.");
      return;
    }
    const filesToCopy = Array.from(checkboxes).map(chk => chk.value);
    fetch("copyFiles.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: currentFolder, files: filesToCopy, destination: targetFolder })
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          alert("Selected files copied successfully!");
          loadFileList(currentFolder);
        } else {
          alert("Error: " + (data.error || "Could not copy files"));
        }
      })
      .catch(error => console.error("Error copying files:", error));
  }

  // NEW: Handle Move Selected Files
  function handleMoveSelected(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    const checkboxes = document.querySelectorAll(".file-checkbox:checked");
    if (checkboxes.length === 0) {
      alert("No files selected for moving.");
      return;
    }
    const targetFolder = document.getElementById("copyMoveFolderSelect").value;
    if (!targetFolder) {
      alert("Please select a target folder for moving.");
      return;
    }
    const filesToMove = Array.from(checkboxes).map(chk => chk.value);
    fetch("moveFiles.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: currentFolder, files: filesToMove, destination: targetFolder })
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          alert("Selected files moved successfully!");
          loadFileList(currentFolder);
        } else {
          alert("Error: " + (data.error || "Could not move files"));
        }
      })
      .catch(error => console.error("Error moving files:", error));
  }

  // Attach event listeners to the action buttons.
  // Use cloneNode() to remove any previously attached listeners.
  const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
  deleteSelectedBtn.replaceWith(deleteSelectedBtn.cloneNode(true));
  document.getElementById("deleteSelectedBtn").addEventListener("click", handleDeleteSelected);

  const copySelectedBtn = document.getElementById("copySelectedBtn");
  copySelectedBtn.replaceWith(copySelectedBtn.cloneNode(true));
  document.getElementById("copySelectedBtn").addEventListener("click", handleCopySelected);

  const moveSelectedBtn = document.getElementById("moveSelectedBtn");
  moveSelectedBtn.replaceWith(moveSelectedBtn.cloneNode(true));
  document.getElementById("moveSelectedBtn").addEventListener("click", handleMoveSelected);

  // NEW: Load the folder list into the copy/move dropdown
  function loadCopyMoveFolderList() {
    fetch("getFolderList.php")
      .then(response => response.json())
      .then(data => {
        const folderSelect = document.getElementById("copyMoveFolderSelect");
        folderSelect.innerHTML = "";
        // Optionally, add a default prompt option
        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = "Select folder";
        folderSelect.appendChild(defaultOption);
        if (data && data.length > 0) {
          data.forEach(folder => {
            const option = document.createElement("option");
            option.value = folder;
            option.textContent = folder;
            folderSelect.appendChild(option);
          });
        }
      })
      .catch(error => console.error("Error loading folder list:", error));
  }

  // On DOMContentLoaded, load the file list and the folder dropdown.
  // Ensure currentFolder is defined globally (defaulting to "root" if not).
  document.addEventListener("DOMContentLoaded", function () {
    currentFolder = currentFolder || "root";
    loadFileList(currentFolder);
    loadCopyMoveFolderList();
  });

  // -----------------------
  // File Editing Functions
  // -----------------------
  window.editFile = function (fileName, folder) {
    console.log("Edit button clicked for:", fileName);
    let existingEditor = document.getElementById("editorContainer");
    if (existingEditor) { existingEditor.remove(); }
    const folderUsed = folder || currentFolder || "root";
    const folderPath = (folderUsed === "root") ? "uploads/" : "uploads/" + encodeURIComponent(folderUsed) + "/";
    const fileUrl = folderPath + encodeURIComponent(fileName) + "?t=" + new Date().getTime();

    // First, use a HEAD request to check file size
    fetch(fileUrl, { method: "HEAD" })
      .then(response => {
        const contentLength = response.headers.get("Content-Length");
        if (contentLength && parseInt(contentLength) > 10485760) {
          alert("This file is larger than 10 MB and cannot be edited in the browser.");
          throw new Error("File too large.");
        }
        // File size is acceptable; now fetch the file content
        return fetch(fileUrl);
      })
      .then(response => {
        if (!response.ok) {
          throw new Error("HTTP error! Status: " + response.status);
        }
        return response.text();
      })
      .then(content => {
        const modal = document.createElement("div");
        modal.id = "editorContainer";
        modal.classList.add("modal", "editor-modal");
        modal.innerHTML = `
          <h3>Editing: ${fileName}</h3>
          <textarea id="fileEditor" style="width:100%; height:80%; resize:none;">${content}</textarea>
          <div style="margin-top:10px; text-align:right;">
            <button onclick="saveFile('${fileName}', '${folderUsed}')" class="btn btn-primary">Save</button>
            <button onclick="document.getElementById('editorContainer').remove()" class="btn btn-secondary">Close</button>
          </div>
        `;
        document.body.appendChild(modal);
        modal.style.display = "block";
      })
      .catch(error => console.error("Error loading file:", error));
  };


  window.saveFile = function (fileName, folder) {
    const editor = document.getElementById("fileEditor");
    if (!editor) {
      console.error("Editor not found!");
      return;
    }
    const folderUsed = folder || currentFolder || "root";
    const fileDataObj = {
      fileName: fileName,
      content: editor.value,
      folder: folderUsed
    };
    fetch("saveFile.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fileDataObj)
    })
      .then(response => response.json())
      .then(result => {
        alert(result.success || result.error);
        document.getElementById("editorContainer")?.remove();
        loadFileList(folderUsed);
      })
      .catch(error => console.error("Error saving file:", error));
  };

  // -----------------------
  // Upload Form Handling
  // -----------------------
  const fileInput = document.getElementById("file");
  const progressContainer = document.getElementById("uploadProgressContainer");
  const uploadForm = document.getElementById("uploadFileForm");

  fileInput.addEventListener("change", function () {
    progressContainer.innerHTML = "";
    const files = fileInput.files;
    if (files.length > 0) {
      const list = document.createElement("ul");
      list.style.listStyle = "none";
      list.style.padding = "0";
      Array.from(files).forEach((file, index) => {
        const listItem = document.createElement("li");
        listItem.style.paddingTop = "20px";
        listItem.style.marginBottom = "10px";
        listItem.style.display = "flex";
        listItem.style.alignItems = "center";
        listItem.style.flexWrap = "wrap";
        const previewContainer = document.createElement("div");
        previewContainer.className = "file-preview";
        displayFilePreview(file, previewContainer);
        const fileNameDiv = document.createElement("div");
        fileNameDiv.textContent = file.name;
        fileNameDiv.style.flexGrow = "1";
        fileNameDiv.style.marginLeft = "5px";
        fileNameDiv.style.wordBreak = "break-word";
        const progressDiv = document.createElement("div");
        progressDiv.classList.add("progress");
        progressDiv.style.flex = "0 0 250px";
        progressDiv.style.marginLeft = "5px";
        const progressBar = document.createElement("div");
        progressBar.classList.add("progress-bar");
        progressBar.style.width = "0%";
        progressBar.innerText = "0%";
        progressDiv.appendChild(progressBar);
        listItem.appendChild(previewContainer);
        listItem.appendChild(fileNameDiv);
        listItem.appendChild(progressDiv);
        listItem.progressBar = progressBar;
        listItem.startTime = Date.now();
        list.appendChild(listItem);
      });
      progressContainer.appendChild(list);
    }
  });

  uploadForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const files = fileInput.files;
    if (files.length === 0) {
      alert("No files selected.");
      return;
    }
    const folderToUse = currentFolder || "root";
    const listItems = progressContainer.querySelectorAll("li");
    let finishedCount = 0;
    Array.from(files).forEach((file, index) => {
      const formData = new FormData();
      formData.append("file[]", file);
      formData.append("folder", folderToUse);
      const xhr = new XMLHttpRequest();
      let currentPercent = 0;
      xhr.upload.addEventListener("progress", function (e) {
        if (e.lengthComputable) {
          currentPercent = Math.round((e.loaded / e.total) * 100);
          const elapsedTime = (Date.now() - listItems[index].startTime) / 1000;
          let speedText = "";
          if (elapsedTime > 0) {
            const speed = e.loaded / elapsedTime;
            if (speed < 1024) speedText = speed.toFixed(0) + " B/s";
            else if (speed < 1048576) speedText = (speed / 1024).toFixed(1) + " KB/s";
            else speedText = (speed / 1048576).toFixed(1) + " MB/s";
          }
          listItems[index].progressBar.style.width = currentPercent + "%";
          listItems[index].progressBar.innerText = currentPercent + "% (" + speedText + ")";
        }
      });
      xhr.addEventListener("load", function () {
        if (currentPercent >= 100) {
          listItems[index].progressBar.innerText = "Done";
        }
        finishedCount++;
        console.log("Upload response for file", file.name, xhr.responseText);
        if (finishedCount === files.length) {
          loadFileList(folderToUse);
          fileInput.value = "";
          setTimeout(() => { progressContainer.innerHTML = ""; }, 5000);
        }
      });
      xhr.addEventListener("error", function () {
        listItems[index].progressBar.innerText = "Error";
      });
      xhr.open("POST", "upload.php", true);
      xhr.send(formData);
    });
  });

});
