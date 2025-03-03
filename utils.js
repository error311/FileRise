// =======================
// Utility Functions
// =======================

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
  const allowedExtensions = ["txt", "html", "htm", "php", "css", "js", "json", "xml", "md", "py"];
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
  function loadFileList(folderParam) {
    const folder = folderParam || currentFolder || "root";
    fetch("getFileList.php?folder=" + encodeURIComponent(folder))
      .then(response => response.json())
      .then(data => {
        const fileListContainer = document.getElementById("fileList");
        fileListContainer.innerHTML = "";
        if (data.files && data.files.length > 0) {
          const table = document.createElement("table");
          table.classList.add("table");
          const thead = document.createElement("thead");
          const headerRow = document.createElement("tr");
          // Add select-all checkbox in header.
          const selectTh = document.createElement("th");
          const selectAll = document.createElement("input");
          selectAll.type = "checkbox";
          selectAll.id = "selectAllFiles";
          selectAll.addEventListener("change", function () {
            const checkboxes = document.querySelectorAll(".file-checkbox");
            checkboxes.forEach(chk => chk.checked = this.checked);
            updateDeleteSelectedVisibility();
          });
          selectTh.appendChild(selectAll);
          headerRow.appendChild(selectTh);
          ["Name", "Modified", "Uploaded", "Size", "Uploader", "Actions"].forEach(headerText => {
            const th = document.createElement("th");
            th.textContent = headerText;
            headerRow.appendChild(th);
          });
          thead.appendChild(headerRow);
          table.appendChild(thead);
          const tbody = document.createElement("tbody");
          const folderPath = (folder === "root") ? "uploads/" : "uploads/" + encodeURIComponent(folder) + "/";
          data.files.forEach(file => {
            const row = document.createElement("tr");
            const checkboxTd = document.createElement("td");
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "file-checkbox";
            checkbox.value = file.name;
            checkbox.addEventListener("change", updateDeleteSelectedVisibility);
            checkboxTd.appendChild(checkbox);
            row.appendChild(checkboxTd);
            const nameTd = document.createElement("td");
            nameTd.textContent = file.name;
            row.appendChild(nameTd);
            const modifiedTd = document.createElement("td");
            modifiedTd.textContent = file.modified;
            row.appendChild(modifiedTd);
            const uploadedTd = document.createElement("td");
            uploadedTd.textContent = file.uploaded;
            row.appendChild(uploadedTd);
            const sizeTd = document.createElement("td");
            sizeTd.textContent = file.size;
            row.appendChild(sizeTd);
            const uploaderTd = document.createElement("td");
            uploaderTd.textContent = file.uploader;
            row.appendChild(uploaderTd);
            const actionsTd = document.createElement("td");
            actionsTd.className = "actions-cell";
            const downloadButton = document.createElement("a");
            downloadButton.className = "btn btn-sm btn-success";
            downloadButton.href = folderPath + encodeURIComponent(file.name);
            downloadButton.download = file.name;
            downloadButton.textContent = "Download";
            actionsTd.appendChild(downloadButton);
            if (canEditFile(file.name)) {
              const editButton = document.createElement("button");
              editButton.className = "btn btn-sm btn-primary ml-2";
              editButton.textContent = "Edit";
              editButton.addEventListener("click", function () {
                editFile(file.name, currentFolder);
              });
              actionsTd.appendChild(editButton);
            }
            row.appendChild(actionsTd);
            tbody.appendChild(row);
          });
          table.appendChild(tbody);
          fileListContainer.appendChild(table);
          updateDeleteSelectedVisibility();
        } else {
          fileListContainer.textContent = "No files found.";
          document.getElementById("deleteSelectedBtn").style.display = "none";
        }
      })
      .catch(error => console.error("Error loading file list:", error));
  }

  function updateDeleteSelectedVisibility() {
    const checkboxes = document.querySelectorAll(".file-checkbox");
    const deleteBtn = document.getElementById("deleteSelectedBtn");
    if (checkboxes.length > 0) {
      deleteBtn.style.display = "inline-block";
      let anyChecked = false;
      checkboxes.forEach(chk => {
        if (chk.checked) anyChecked = true;
      });
      deleteBtn.disabled = !anyChecked;
    } else {
      deleteBtn.style.display = "none";
    }
  }

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

  const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
  deleteSelectedBtn.replaceWith(deleteSelectedBtn.cloneNode(true));
  document.getElementById("deleteSelectedBtn").addEventListener("click", handleDeleteSelected);

  // -----------------------
  // File Editing Functions
  // -----------------------
  window.editFile = function (fileName, folder) {
    console.log("Edit button clicked for:", fileName);
    let existingEditor = document.getElementById("editorContainer");
    if (existingEditor) { existingEditor.remove(); }
    const folderUsed = folder || currentFolder || "root";
    const folderPath = (folderUsed === "root") ? "uploads/" : "uploads/" + encodeURIComponent(folderUsed) + "/";
    fetch(folderPath + encodeURIComponent(fileName) + "?t=" + new Date().getTime())
      .then(response => {
        if (!response.ok) { throw new Error("HTTP error! Status: " + response.status); }
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
        fileNameDiv.style.marginLeft = "10px";
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
