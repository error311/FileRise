import { loadFileList, displayFilePreview, initFileActions } from './fileManager.js';
import { showToast, escapeHTML } from './domUtils.js';
import { loadFolderTree } from './folderManager.js';

// Helper: Recursively traverse a dropped folder.
function traverseFileTreePromise(item, path = "") {
  return new Promise((resolve, reject) => {
    if (item.isFile) {
      item.file(file => {
        // Instead of modifying file.webkitRelativePath (read-only),
        // define a new property called "customRelativePath"
        Object.defineProperty(file, 'customRelativePath', {
          value: path + file.name,
          writable: true,
          configurable: true
        });
        resolve([file]);
      });
    } else if (item.isDirectory) {
      const dirReader = item.createReader();
      dirReader.readEntries(entries => {
        const promises = [];
        for (let i = 0; i < entries.length; i++) {
          promises.push(traverseFileTreePromise(entries[i], path + item.name + "/"));
        }
        Promise.all(promises).then(results => {
          resolve(results.flat());
        });
      });
    } else {
      resolve([]);
    }
  });
}

// Helper: Given DataTransfer items, recursively retrieve files.
function getFilesFromDataTransferItems(items) {
  const promises = [];
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry();
    if (entry) {
      promises.push(traverseFileTreePromise(entry));
    }
  }
  return Promise.all(promises).then(results => results.flat());
}

// Helper: Set default drop area content.
// Moved to module scope so it is available globally in this module.
function setDropAreaDefault() {
  const dropArea = document.getElementById("uploadDropArea");
  if (dropArea) {
    dropArea.innerHTML = `
          <div id="uploadInstruction" class="upload-instruction">
            Drop files/folders here or click 'Choose files'
          </div>
          <div id="uploadFileRow" class="upload-file-row">
            <button id="customChooseBtn" type="button">
              Choose files
            </button>
          </div>
          <div id="fileInfoWrapper" class="file-info-wrapper">
            <div id="fileInfoContainer" class="file-info-container">
              <span id="fileInfoDefault">No files selected</span>
            </div>
          </div>
        `;
  }
}

function adjustFolderHelpExpansion() {
  const uploadCard = document.getElementById("uploadCard");
  const folderHelpDetails = document.querySelector(".folder-help-details");
  if (uploadCard && folderHelpDetails) {
    if (uploadCard.offsetHeight > 400) {
      folderHelpDetails.setAttribute("open", "");
    } else {
      folderHelpDetails.removeAttribute("open");
    }
  }
}

function adjustFolderHelpExpansionClosed() {
  const folderHelpDetails = document.querySelector(".folder-help-details");
  if (folderHelpDetails) {
    folderHelpDetails.removeAttribute("open");
  }
}

// Helper: Update file info container count/preview.
function updateFileInfoCount() {
  const fileInfoContainer = document.getElementById("fileInfoContainer");
  if (fileInfoContainer && window.selectedFiles) {
    if (window.selectedFiles.length === 0) {
      fileInfoContainer.innerHTML = `<span id="fileInfoDefault">No files selected</span>`;
    } else if (window.selectedFiles.length === 1) {
      fileInfoContainer.innerHTML = `
        <div id="filePreviewContainer" class="file-preview-container" style="display:inline-block;"></div>
        <span id="fileNameDisplay" class="file-name-display">${escapeHTML(window.selectedFiles[0].name)}</span>
      `;
    } else {
      fileInfoContainer.innerHTML = `
        <div id="filePreviewContainer" class="file-preview-container" style="display:inline-block;"></div>
        <span id="fileCountDisplay" class="file-name-display">${window.selectedFiles.length} files selected</span>
      `;
    }
    // Show preview of first file.
    const previewContainer = document.getElementById("filePreviewContainer");
    if (previewContainer && window.selectedFiles.length > 0) {
      previewContainer.innerHTML = "";
      displayFilePreview(window.selectedFiles[0], previewContainer);
    }
  }
}

// Helper: Create a file entry element with a remove button.
function createFileEntry(file) {
  const li = document.createElement("li");
  li.classList.add("upload-progress-item");
  li.style.display = "flex";
  li.dataset.uploadIndex = file.uploadIndex;

  // Create remove button positioned to the left of the preview.
  const removeBtn = document.createElement("button");
  removeBtn.classList.add("remove-file-btn");
  removeBtn.textContent = "×";
  removeBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    // Remove file from global selected files array.
    const uploadIndex = file.uploadIndex;
    window.selectedFiles = window.selectedFiles.filter(f => f.uploadIndex !== uploadIndex);
    li.remove();
    updateFileInfoCount();
  });
  // Store the button so we can hide it later when upload completes.
  li.removeBtn = removeBtn;

  const preview = document.createElement("div");
  preview.className = "file-preview";
  displayFilePreview(file, preview);

  const nameDiv = document.createElement("div");
  nameDiv.classList.add("upload-file-name");
  nameDiv.textContent = file.name;

  const progDiv = document.createElement("div");
  progDiv.classList.add("progress", "upload-progress-div");
  progDiv.style.flex = "0 0 250px";
  progDiv.style.marginLeft = "5px";

  const progBar = document.createElement("div");
  progBar.classList.add("progress-bar");
  progBar.style.width = "0%";
  progBar.innerText = "0%";

  progDiv.appendChild(progBar);

  // Append in order: remove button, preview, name, progress.
  li.appendChild(removeBtn);
  li.appendChild(preview);
  li.appendChild(nameDiv);
  li.appendChild(progDiv);

  li.progressBar = progBar;
  li.startTime = Date.now();
  return li;
}

// Process selected files: Build preview/progress list and store files for later submission.
function processFiles(filesInput) {
  const fileInfoContainer = document.getElementById("fileInfoContainer");
  const files = Array.from(filesInput);

  // Update file info container with preview and file count.
  if (fileInfoContainer) {
    if (files.length > 0) {
      if (files.length === 1) {
        fileInfoContainer.innerHTML = `
          <div id="filePreviewContainer" class="file-preview-container" style="display:inline-block;"></div>
          <span id="fileNameDisplay" class="file-name-display">${escapeHTML(files[0].name)}</span>
        `;
      } else {
        fileInfoContainer.innerHTML = `
          <div id="filePreviewContainer" class="file-preview-container" style="display:inline-block;"></div>
          <span id="fileCountDisplay" class="file-name-display">${files.length} files selected</span>
        `;
      }
      const previewContainer = document.getElementById("filePreviewContainer");
      if (previewContainer) {
        previewContainer.innerHTML = "";
        displayFilePreview(files[0], previewContainer);
      }
    } else {
      fileInfoContainer.innerHTML = `<span id="fileInfoDefault">No files selected</span>`;
    }
  }

  // Assign unique uploadIndex to each file.
  files.forEach((file, index) => {
    file.uploadIndex = index;
  });

  // Build progress list.
  const progressContainer = document.getElementById("uploadProgressContainer");
  progressContainer.innerHTML = "";

  if (files.length > 0) {
    const maxDisplay = 10;
    const list = document.createElement("ul");
    list.classList.add("upload-progress-list");

    // Determine grouping using relative path.
    const hasRelativePaths = files.some(file => {
      const rel = file.webkitRelativePath || file.customRelativePath || "";
      return rel.trim() !== "";
    });

    if (hasRelativePaths) {
      // Group files by folder.
      const fileGroups = {};
      files.forEach(file => {
        let folderName = "Root";
        const relativePath = file.webkitRelativePath || file.customRelativePath || "";
        if (relativePath.trim() !== "") {
          const parts = relativePath.split("/");
          if (parts.length > 1) {
            folderName = parts.slice(0, parts.length - 1).join("/");
          }
        }
        if (!fileGroups[folderName]) {
          fileGroups[folderName] = [];
        }
        fileGroups[folderName].push(file);
      });

      // Create list elements for each folder group.
      Object.keys(fileGroups).forEach(folderName => {
        // Folder header with Material Icon.
        const folderLi = document.createElement("li");
        folderLi.classList.add("upload-folder-group");
        folderLi.innerHTML = `<i class="material-icons folder-icon" style="vertical-align:middle; margin-right:8px;">folder</i> ${folderName}:`;
        list.appendChild(folderLi);

        // Nested list for files.
        const nestedUl = document.createElement("ul");
        nestedUl.classList.add("upload-folder-group-list");
        fileGroups[folderName]
          .sort((a, b) => a.uploadIndex - b.uploadIndex)
          .forEach(file => {
            const li = createFileEntry(file);
            nestedUl.appendChild(li);
          });
        list.appendChild(nestedUl);
      });
    } else {
      // Flat list.
      files.forEach((file, index) => {
        const li = createFileEntry(file);
        li.style.display = (index < maxDisplay) ? "flex" : "none";
        li.dataset.uploadIndex = index;
        list.appendChild(li);
      });
      if (files.length > maxDisplay) {
        const extra = document.createElement("li");
        extra.classList.add("upload-progress-extra");
        extra.textContent = `Uploading additional ${files.length - maxDisplay} file(s)...`;
        extra.style.display = "flex";
        list.appendChild(extra);
      }
    }
    const listWrapper = document.createElement("div");
    listWrapper.classList.add("upload-progress-wrapper");
    // Set a maximum height and enable vertical scrolling.
    listWrapper.style.maxHeight = "300px";
    listWrapper.style.overflowY = "auto";
    listWrapper.appendChild(list);
    progressContainer.appendChild(listWrapper);
  }

  // Call once on page load:
  adjustFolderHelpExpansion();
  // Also call on window resize:
  window.addEventListener("resize", adjustFolderHelpExpansion);

  // Store files globally for submission.
  window.selectedFiles = files;
  updateFileInfoCount();
}

// Function to handle file uploads; triggered when the user clicks the "Upload" button.
function submitFiles(allFiles) {
  const folderToUse = window.currentFolder || "root";
  const progressContainer = document.getElementById("uploadProgressContainer");
  const fileInput = document.getElementById("file");

  // Map uploadIndex to progress element.
  const progressElements = {};
  const listItems = progressContainer.querySelectorAll("li.upload-progress-item");
  listItems.forEach(item => {
    progressElements[item.dataset.uploadIndex] = item;
  });

  let finishedCount = 0;
  let allSucceeded = true;
  const uploadResults = new Array(allFiles.length).fill(false);

  allFiles.forEach(file => {
    const formData = new FormData();
    formData.append("file[]", file);
    formData.append("folder", folderToUse);
    const relativePath = file.webkitRelativePath || file.customRelativePath || "";
    if (relativePath.trim() !== "") {
      formData.append("relativePath", relativePath);
    }
    const xhr = new XMLHttpRequest();
    let currentPercent = 0;

    xhr.upload.addEventListener("progress", function (e) {
      if (e.lengthComputable) {
        currentPercent = Math.round((e.loaded / e.total) * 100);
        const li = progressElements[file.uploadIndex];
        if (li) {
          const elapsed = (Date.now() - li.startTime) / 1000;
          let speed = "";
          if (elapsed > 0) {
            const spd = e.loaded / elapsed;
            if (spd < 1024) speed = spd.toFixed(0) + " B/s";
            else if (spd < 1048576) speed = (spd / 1024).toFixed(1) + " KB/s";
            else speed = (spd / 1048576).toFixed(1) + " MB/s";
          }
          li.progressBar.style.width = currentPercent + "%";
          li.progressBar.innerText = currentPercent + "% (" + speed + ")";
        }
      }
    });

    xhr.addEventListener("load", function () {
      let jsonResponse;
      try {
        jsonResponse = JSON.parse(xhr.responseText);
      } catch (e) {
        jsonResponse = null;
      }
      const li = progressElements[file.uploadIndex];
      if (xhr.status >= 200 && xhr.status < 300 && (!jsonResponse || !jsonResponse.error)) {
        if (li) {
          li.progressBar.style.width = "100%";
          li.progressBar.innerText = "Done";
          // Hide the remove button now that upload is done.
          if (li.removeBtn) {
            li.removeBtn.style.display = "none";
          }
        }
        uploadResults[file.uploadIndex] = true;
      } else {
        if (li) {
          li.progressBar.innerText = "Error";
        }
        allSucceeded = false;
      }
      finishedCount++;
      if (finishedCount === allFiles.length) {
        refreshFileList(allFiles, uploadResults, progressElements);
      }
    });

    xhr.addEventListener("error", function () {
      const li = progressElements[file.uploadIndex];
      if (li) {
        li.progressBar.innerText = "Error";
      }
      uploadResults[file.uploadIndex] = false;
      allSucceeded = false;
      finishedCount++;
      if (finishedCount === allFiles.length) {
        refreshFileList(allFiles, uploadResults, progressElements);
      }
    });

    xhr.addEventListener("abort", function () {
      const li = progressElements[file.uploadIndex];
      if (li) {
        li.progressBar.innerText = "Aborted";
      }
      uploadResults[file.uploadIndex] = false;
      allSucceeded = false;
      finishedCount++;
      if (finishedCount === allFiles.length) {
        refreshFileList(allFiles, uploadResults, progressElements);
      }
    });

    xhr.open("POST", "upload.php", true);
    xhr.send(formData);
  });

  function refreshFileList(allFiles, uploadResults, progressElements) {
    loadFileList(folderToUse)
      .then(serverFiles => {
        initFileActions();
        serverFiles = (serverFiles || []).map(item => item.name.trim().toLowerCase());
        allFiles.forEach(file => {
          // Skip verification for folder-uploaded files.
          if ((file.webkitRelativePath || file.customRelativePath || "").trim() !== "") {
            return;
          }
          const clientFileName = file.name.trim().toLowerCase();
          if (!uploadResults[file.uploadIndex] || !serverFiles.includes(clientFileName)) {
            const li = progressElements[file.uploadIndex];
            if (li) {
              li.progressBar.innerText = "Error";
            }
            allSucceeded = false;
          }
        });
        setTimeout(() => {
          if (fileInput) fileInput.value = "";
          // Hide remove buttons in progress container.
          const removeBtns = progressContainer.querySelectorAll("button.remove-file-btn");
          removeBtns.forEach(btn => btn.style.display = "none");
          progressContainer.innerHTML = "";
          window.selectedFiles = [];
          adjustFolderHelpExpansionClosed();
          window.addEventListener("resize", adjustFolderHelpExpansionClosed);
          const fileInfoContainer = document.getElementById("fileInfoContainer");
          if (fileInfoContainer) {
            fileInfoContainer.innerHTML = `<span id="fileInfoDefault">No files selected</span>`;
          }
          const dropArea = document.getElementById("uploadDropArea");
          if (dropArea) setDropAreaDefault();
        }, 5000);
        if (!allSucceeded) {
          showToast("Some files failed to upload. Please check the list.");
        }
      })
      .catch(error => {
        console.error("Error fetching file list:", error);
        showToast("Some files may have failed to upload. Please check the list.");
      })
      .finally(() => {
        loadFolderTree(window.currentFolder);
      });
  }
}

// Main initUpload: sets up file input, drop area, and form submission.
function initUpload() {
  const fileInput = document.getElementById("file");
  const dropArea = document.getElementById("uploadDropArea");
  const uploadForm = document.getElementById("uploadFileForm");

  if (fileInput) {
    // Remove folder selection attributes so clicking the input shows files:
    fileInput.removeAttribute("webkitdirectory");
    fileInput.removeAttribute("mozdirectory");
    fileInput.removeAttribute("directory");
    // Allow selecting multiple files.
    fileInput.setAttribute("multiple", "");
  }

  // Set default drop area content.
  setDropAreaDefault();

  if (dropArea) {
    dropArea.classList.add("upload-drop-area");
    dropArea.addEventListener("dragover", function (e) {
      e.preventDefault();
      dropArea.style.backgroundColor = document.body.classList.contains("dark-mode") ? "#333" : "#f8f8f8";
    });
    dropArea.addEventListener("dragleave", function (e) {
      e.preventDefault();
      dropArea.style.backgroundColor = "";
    });
    dropArea.addEventListener("drop", function (e) {
      e.preventDefault();
      dropArea.style.backgroundColor = "";
      const dt = e.dataTransfer;
      if (dt.items && dt.items.length > 0) {
        getFilesFromDataTransferItems(dt.items).then(files => {
          if (files.length > 0) {
            processFiles(files);
          }
        });
      } else if (dt.files && dt.files.length > 0) {
        processFiles(dt.files);
      }
    });
    dropArea.addEventListener("click", function () {
      if (fileInput) fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", function () {
      processFiles(fileInput.files);
    });
  }

  if (uploadForm) {
    uploadForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const files = window.selectedFiles || (fileInput ? fileInput.files : []);
      if (!files || files.length === 0) {
        showToast("No files selected.");
        return;
      }
      submitFiles(files);
    });
  }
}

export { initUpload };