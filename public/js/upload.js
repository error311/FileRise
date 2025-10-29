import { initFileActions } from './fileActions.js?v={{APP_QVER}}';
import { displayFilePreview } from './filePreview.js?v={{APP_QVER}}';
import { showToast, escapeHTML } from './domUtils.js?v={{APP_QVER}}';
import { loadFolderTree } from './folderManager.js?v={{APP_QVER}}';
import { loadFileList } from './fileListView.js?v={{APP_QVER}}';
import { t } from './i18n.js?v={{APP_QVER}}';

/* -----------------------------------------------------
   Helpers for Drag–and–Drop Folder Uploads (Original Code)
----------------------------------------------------- */
// Recursively traverse a dropped folder.
function traverseFileTreePromise(item, path = "") {
  return new Promise((resolve) => {
    if (item.isFile) {
      item.file(file => {
        // Store relative path for folder uploads.
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
        Promise.all(promises).then(results => resolve(results.flat()));
      });
    } else {
      resolve([]);
    }
  });
}

// Recursively retrieve files from DataTransfer items.
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

function setDropAreaDefault() {
  const dropArea = document.getElementById("uploadDropArea");
  if (dropArea) {
    dropArea.innerHTML = `
      <div id="uploadInstruction" class="upload-instruction">
       ${t("upload_instruction")}
      </div>
      <div id="uploadFileRow" class="upload-file-row">
        <button id="customChooseBtn" type="button">${t("choose_files")}</button>
      </div>
      <div id="fileInfoWrapper" class="file-info-wrapper">
        <div id="fileInfoContainer" class="file-info-container">
          <span id="fileInfoDefault"> ${t("no_files_selected_default")}</span>
        </div>
      </div>
      <!-- File input for file picker (files only) -->
      <input type="file" id="file" name="file[]" class="form-control-file" multiple style="opacity:0; position:absolute; width:1px; height:1px;" />
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

function updateFileInfoCount() {
  const fileInfoContainer = document.getElementById("fileInfoContainer");
  if (fileInfoContainer && window.selectedFiles) {
    if (window.selectedFiles.length === 0) {
      fileInfoContainer.innerHTML = `<span id="fileInfoDefault">No files selected</span>`;
    } else if (window.selectedFiles.length === 1) {
      fileInfoContainer.innerHTML = `
        <div id="filePreviewContainer" class="file-preview-container" style="display:inline-block;">
          <span class="material-icons file-icon">insert_drive_file</span>
        </div>
        <span id="fileNameDisplay" class="file-name-display">${escapeHTML(window.selectedFiles[0].name || window.selectedFiles[0].fileName || "Unnamed File")}</span>
      `;
    } else {
      fileInfoContainer.innerHTML = `
        <div id="filePreviewContainer" class="file-preview-container" style="display:inline-block;">
          <span class="material-icons file-icon">insert_drive_file</span>
        </div>
        <span id="fileCountDisplay" class="file-name-display">${window.selectedFiles.length} files selected</span>
      `;
    }
    const previewContainer = document.getElementById("filePreviewContainer");
    if (previewContainer && window.selectedFiles.length > 0) {
      previewContainer.innerHTML = "";
      // For image files, try to show a preview (if available from the file object).
      displayFilePreview(window.selectedFiles[0].file || window.selectedFiles[0], previewContainer);
    }
  }
}

// Helper function to repeatedly call removeChunks.php
function removeChunkFolderRepeatedly(identifier, csrfToken, maxAttempts = 3, interval = 1000) {
  let attempt = 0;
  const removalInterval = setInterval(() => {
    attempt++;
    const params = new URLSearchParams();
    // Prefix with "resumable_" to match your PHP regex.
    params.append('folder', 'resumable_' + identifier);
    params.append('csrf_token', csrfToken);
    fetch('/api/upload/removeChunks.php', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    })
      .then(response => response.json())
      .then(data => {
        console.log(`Chunk folder removal attempt ${attempt}:`, data);
      })
      .catch(err => {
        console.error(`Error on removal attempt ${attempt}:`, err);
      });
    if (attempt >= maxAttempts) {
      clearInterval(removalInterval);
    }
  }, interval);
}

/* -----------------------------------------------------
   File Entry Creation (with Pause/Resume and Restart)
----------------------------------------------------- */
// Create a file entry element with a remove button and a pause/resume button.
function createFileEntry(file) {
  const li = document.createElement("li");
  li.classList.add("upload-progress-item");
  li.style.display = "flex";
  li.dataset.uploadIndex = file.uploadIndex;

  // Remove button (always added)
  const removeBtn = document.createElement("button");
  removeBtn.classList.add("remove-file-btn");
  removeBtn.textContent = "×";
  // In your remove button event listener, replace the fetch call with:
  removeBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    const uploadIndex = file.uploadIndex;
    window.selectedFiles = window.selectedFiles.filter(f => f.uploadIndex !== uploadIndex);

    // Cancel the file upload if possible.
    if (typeof file.cancel === "function") {
      file.cancel();
      console.log("Canceled file upload:", file.fileName);
    }

    // Remove file from the resumable queue.
    if (resumableInstance && typeof resumableInstance.removeFile === "function") {
      resumableInstance.removeFile(file);
    }

    // Call our helper repeatedly to remove the chunk folder.
    if (file.uniqueIdentifier) {
      removeChunkFolderRepeatedly(file.uniqueIdentifier, window.csrfToken, 3, 1000);
    }

    li.remove();
    updateFileInfoCount();
  });
  li.removeBtn = removeBtn;
  li.appendChild(removeBtn);

  // Add pause/resume/restart button if the file supports pause/resume.
  // Conditionally add the pause/resume button only if file.pause is available
  // Pause/Resume button (for resumable file–picker uploads)
  if (typeof file.pause === "function") {
    const pauseResumeBtn = document.createElement("button");
    pauseResumeBtn.setAttribute("type", "button"); // not a submit button
    pauseResumeBtn.classList.add("pause-resume-btn");
    // Start with pause icon and disable button until upload starts
    pauseResumeBtn.innerHTML = '<span class="material-icons pauseResumeBtn">pause_circle_outline</span>';
    pauseResumeBtn.disabled = true;
    pauseResumeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (file.isError) {
        // If the file previously failed, try restarting upload.
        if (typeof file.retry === "function") {
          file.retry();
          file.isError = false;
          pauseResumeBtn.innerHTML = '<span class="material-icons pauseResumeBtn">pause_circle_outline</span>';
        }
      } else if (!file.paused) {
        // Pause the upload (if possible)
        if (typeof file.pause === "function") {
          file.pause();
          file.paused = true;
          pauseResumeBtn.innerHTML = '<span class="material-icons pauseResumeBtn">play_circle_outline</span>';
        } else {
        }
      } else if (file.paused) {
        // Resume sequence: first call to resume (or upload() fallback)
        if (typeof file.resume === "function") {
          file.resume();
        } else {
          resumableInstance.upload();
        }
        // After a short delay, pause again then resume
        setTimeout(() => {
          if (typeof file.pause === "function") {
            file.pause();
          } else {
            resumableInstance.upload();
          }
          setTimeout(() => {
            if (typeof file.resume === "function") {
              file.resume();
            } else {
              resumableInstance.upload();
            }
          }, 100);
        }, 100);
        file.paused = false;
        pauseResumeBtn.innerHTML = '<span class="material-icons pauseResumeBtn">pause_circle_outline</span>';
      } else {
        console.error("Pause/resume function not available for file", file);
      }
    });
    li.appendChild(pauseResumeBtn);
  }

  // Preview element
  const preview = document.createElement("div");
  preview.className = "file-preview";
  displayFilePreview(file, preview);
  li.appendChild(preview);

  // File name display
  const nameDiv = document.createElement("div");
  nameDiv.classList.add("upload-file-name");
  nameDiv.textContent = file.name || file.fileName || "Unnamed File";
  li.appendChild(nameDiv);

  // Progress bar container
  const progDiv = document.createElement("div");
  progDiv.classList.add("progress", "upload-progress-div");
  progDiv.style.flex = "0 0 250px";
  progDiv.style.marginLeft = "5px";
  const progBar = document.createElement("div");
  progBar.classList.add("progress-bar");
  progBar.style.width = "0%";
  progBar.innerText = "0%";
  progDiv.appendChild(progBar);
  li.appendChild(progDiv);

  li.progressBar = progBar;
  li.startTime = Date.now();
  return li;
}

/* -----------------------------------------------------
   Processing Files
   - For drag–and–drop, use original processing (supports folders).
   - For file picker, if using Resumable, those files use resumable.
----------------------------------------------------- */
function processFiles(filesInput) {
  const fileInfoContainer = document.getElementById("fileInfoContainer");
  const files = Array.from(filesInput);

  if (fileInfoContainer) {
    if (files.length > 0) {
      if (files.length === 1) {
        fileInfoContainer.innerHTML = `
          <div id="filePreviewContainer" class="file-preview-container" style="display:inline-block;">
            <span class="material-icons file-icon">insert_drive_file</span>
          </div>
          <span id="fileNameDisplay" class="file-name-display">${escapeHTML(files[0].name || files[0].fileName || "Unnamed File")}</span>
        `;
      } else {
        fileInfoContainer.innerHTML = `
          <div id="filePreviewContainer" class="file-preview-container" style="display:inline-block;">
            <span class="material-icons file-icon">insert_drive_file</span>
          </div>
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

  files.forEach((file, index) => {
    file.uploadIndex = index;
  });

  const progressContainer = document.getElementById("uploadProgressContainer");
  progressContainer.innerHTML = "";

  if (files.length > 0) {
    const maxDisplay = 10;
    const list = document.createElement("ul");
    list.classList.add("upload-progress-list");

    // Check for relative paths (for folder uploads).
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

      Object.keys(fileGroups).forEach(folderName => {
        // Only show folder grouping if folderName is not "Root"
        if (folderName !== "Root") {
          const folderLi = document.createElement("li");
          folderLi.classList.add("upload-folder-group");
          folderLi.innerHTML = `<i class="material-icons folder-icon" style="vertical-align:middle; margin-right:8px;">folder</i> ${folderName}:`;
          list.appendChild(folderLi);
        }
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
      // No relative paths – list files directly.
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
    listWrapper.style.maxHeight = "300px";
    listWrapper.style.overflowY = "auto";
    listWrapper.appendChild(list);
    progressContainer.appendChild(listWrapper);
  }

  adjustFolderHelpExpansion();
  window.addEventListener("resize", adjustFolderHelpExpansion);

  window.selectedFiles = files;
  updateFileInfoCount();
}

/* -----------------------------------------------------
   Resumable.js Integration for File Picker Uploads
   (Only files chosen via file input use Resumable; folder uploads use original code.)
----------------------------------------------------- */
const useResumable = true; // Enable resumable for file picker uploads
let resumableInstance;
function initResumableUpload() {
  resumableInstance = new Resumable({
    target: "/api/upload/upload.php",
    chunkSize: 1.5 * 1024 * 1024,
    simultaneousUploads: 3,
    forceChunkSize: true,
    testChunks: false,
    withCredentials: true,
    headers: { 'X-CSRF-Token': window.csrfToken },
    query: () => ({
      folder: window.currentFolder || "root",
      upload_token: window.csrfToken
    })
  });

  // keep query fresh when folder changes (call this from your folder nav code)
  function updateResumableQuery() {
    if (!resumableInstance) return;
    resumableInstance.opts.headers['X-CSRF-Token'] = window.csrfToken;
    // if you're not using a function for query, do:
    resumableInstance.opts.query.folder = window.currentFolder || 'root';
    resumableInstance.opts.query.upload_token = window.csrfToken;
  }

  const fileInput = document.getElementById("file");
  if (fileInput) {
    // Assign Resumable to file input for file picker uploads.
    resumableInstance.assignBrowse(fileInput);
    fileInput.addEventListener("change", function () {
      for (let i = 0; i < fileInput.files.length; i++) {
        resumableInstance.addFile(fileInput.files[i]);
      }
    });
  }

  resumableInstance.on("fileAdded", function (file) {

    // Initialize custom paused flag
    file.paused = false;
    file.uploadIndex = file.uniqueIdentifier;
    if (!window.selectedFiles) {
      window.selectedFiles = [];
    }
    window.selectedFiles.push(file);
    const progressContainer = document.getElementById("uploadProgressContainer");

    // Check if a wrapper already exists; if not, create one with a UL inside.
    let listWrapper = progressContainer.querySelector(".upload-progress-wrapper");
    let list;
    if (!listWrapper) {
      listWrapper = document.createElement("div");
      listWrapper.classList.add("upload-progress-wrapper");
      listWrapper.style.maxHeight = "300px";
      listWrapper.style.overflowY = "auto";
      list = document.createElement("ul");
      list.classList.add("upload-progress-list");
      listWrapper.appendChild(list);
      progressContainer.appendChild(listWrapper);
    } else {
      list = listWrapper.querySelector("ul.upload-progress-list");
    }

    const li = createFileEntry(file);
    li.dataset.uploadIndex = file.uniqueIdentifier;
    list.appendChild(li);
    updateFileInfoCount();
    updateResumableQuery();
  });

  resumableInstance.on("fileProgress", function (file) {
    const progress = file.progress(); // value between 0 and 1
    const percent = Math.floor(progress * 100);
    const li = document.querySelector(`li.upload-progress-item[data-upload-index="${file.uniqueIdentifier}"]`);
    if (li && li.progressBar) {
      if (percent < 99) {
        li.progressBar.style.width = percent + "%";

        // Calculate elapsed time and speed.
        const elapsed = (Date.now() - li.startTime) / 1000;
        let speed = "";
        if (elapsed > 0) {
          const bytesUploaded = progress * file.size;
          const spd = bytesUploaded / elapsed;
          if (spd < 1024) {
            speed = spd.toFixed(0) + " B/s";
          } else if (spd < 1048576) {
            speed = (spd / 1024).toFixed(1) + " KB/s";
          } else {
            speed = (spd / 1048576).toFixed(1) + " MB/s";
          }
        }
        li.progressBar.innerText = percent + "% (" + speed + ")";
      } else {
        // When progress reaches 99% or higher, show only a spinner icon.
        li.progressBar.style.width = "100%";
        li.progressBar.innerHTML = '<i class="material-icons spinning" style="vertical-align: middle;">autorenew</i>';
      }

      // Enable the pause/resume button once progress starts.
      const pauseResumeBtn = li.querySelector(".pause-resume-btn");
      if (pauseResumeBtn) {
        pauseResumeBtn.disabled = false;
      }
    }
  });

  resumableInstance.on("fileSuccess", function (file, message) {
    // Try to parse JSON response
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      data = null;
    }

    // 1) Soft‐fail CSRF? then update token & retry this file
    if (data && data.csrf_expired) {
      // Update global and Resumable headers
      window.csrfToken = data.csrf_token;
      resumableInstance.opts.headers['X-CSRF-Token'] = data.csrf_token;
      resumableInstance.opts.query.upload_token = data.csrf_token;
      // Retry this chunk/file
      file.retry();
      return;
    }

    // 2) Otherwise treat as real success:
    const li = document.querySelector(
      `li.upload-progress-item[data-upload-index="${file.uniqueIdentifier}"]`
    );
    if (li && li.progressBar) {
      li.progressBar.style.width = "100%";
      li.progressBar.innerText = "Done";
      // remove action buttons
      const pauseResumeBtn = li.querySelector(".pause-resume-btn");
      if (pauseResumeBtn) pauseResumeBtn.style.display = "none";
      const removeBtn = li.querySelector(".remove-file-btn");
      if (removeBtn) removeBtn.style.display = "none";
      setTimeout(() => li.remove(), 5000);
    }

    loadFileList(window.currentFolder);
  });



  resumableInstance.on("fileError", function (file, message) {
    const li = document.querySelector(`li.upload-progress-item[data-upload-index="${file.uniqueIdentifier}"]`);
    if (li && li.progressBar) {
      li.progressBar.innerText = "Error";
    }
    // Mark file as errored so that the pause/resume button acts as a restart button.
    file.isError = true;
    const pauseResumeBtn = li ? li.querySelector(".pause-resume-btn") : null;
    if (pauseResumeBtn) {
      pauseResumeBtn.innerHTML = '<span class="material-icons pauseResumeBtn">replay</span>';
      pauseResumeBtn.disabled = false;
    }
    showToast("Error uploading file: " + file.fileName);
  });

  resumableInstance.on("complete", function () {
    // If any file is marked with an error, leave the list intact.
    const hasError = window.selectedFiles.some(f => f.isError);
    if (!hasError) {
      // All files succeeded—clear the file input and progress container after 5 seconds.
      setTimeout(() => {
        const fileInput = document.getElementById("file");
        if (fileInput) fileInput.value = "";
        const progressContainer = document.getElementById("uploadProgressContainer");
        progressContainer.innerHTML = "";
        window.selectedFiles = [];
        adjustFolderHelpExpansionClosed();
        const fileInfoContainer = document.getElementById("fileInfoContainer");
        if (fileInfoContainer) {
          fileInfoContainer.innerHTML = `<span id="fileInfoDefault">No files selected</span>`;
        }
        const dropArea = document.getElementById("uploadDropArea");
        if (dropArea) setDropAreaDefault();
      }, 5000);
    } else {
      showToast("Some files failed to upload. Please check the list.");
    }
  });
}

/* -----------------------------------------------------
   XHR-based submitFiles for Drag–and–Drop (Folder) Uploads
----------------------------------------------------- */
function submitFiles(allFiles) {
  const folderToUse = window.currentFolder || "root";
  const progressContainer = document.getElementById("uploadProgressContainer");
  const fileInput = document.getElementById("file");

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
    // Append CSRF token as "upload_token"
    formData.append("upload_token", window.csrfToken);
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

      // ─── Soft-fail CSRF: retry this upload ───────────────────────
      if (jsonResponse && jsonResponse.csrf_expired) {
        console.warn("CSRF expired during upload, retrying chunk", file.uploadIndex);
        // 1) update global token + header
        window.csrfToken = jsonResponse.csrf_token;
        xhr.open("POST", "/api/upload/upload.php", true);
        xhr.withCredentials = true;
        xhr.setRequestHeader("X-CSRF-Token", window.csrfToken);
        // 2) re-send the same formData
        xhr.send(formData);
        return;  // skip the "finishedCount++" and error/success logic for now
      }

      // ─── Normal success/error handling ────────────────────────────  
      const li = progressElements[file.uploadIndex];

      if (xhr.status >= 200 && xhr.status < 300 && (!jsonResponse || !jsonResponse.error)) {
        // real success
        if (li) {
          li.progressBar.style.width = "100%";
          li.progressBar.innerText = "Done";
          if (li.removeBtn) li.removeBtn.style.display = "none";
        }
        uploadResults[file.uploadIndex] = true;

      } else {
        // real failure
        if (li) {
          li.progressBar.innerText = "Error";
        }
        allSucceeded = false;
      }
      if (file.isClipboard) {
        setTimeout(() => {
          window.selectedFiles = [];
          updateFileInfoCount();
          const progressContainer = document.getElementById("uploadProgressContainer");
          if (progressContainer) progressContainer.innerHTML = "";
          const fileInfoContainer = document.getElementById("fileInfoContainer");
          if (fileInfoContainer) {
            fileInfoContainer.innerHTML = `<span id="fileInfoDefault">No files selected</span>`;
          }
        }, 5000);
      }

      // ─── Only now count this chunk as finished ───────────────────
      finishedCount++;
if (finishedCount === allFiles.length) {
  const succeededCount = uploadResults.filter(Boolean).length;
  const failedCount = allFiles.length - succeededCount;

  setTimeout(() => {
    refreshFileList(allFiles, uploadResults, progressElements);
  }, 250);
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
        // Immediate summary toast based on actual XHR outcomes
        const succeededCount = uploadResults.filter(Boolean).length;
        const failedCount = allFiles.length - succeededCount;
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

    xhr.open("POST", "/api/upload/upload.php", true);
    xhr.withCredentials = true;
    xhr.setRequestHeader("X-CSRF-Token", window.csrfToken);
    xhr.send(formData);
  });

  function refreshFileList(allFiles, uploadResults, progressElements) {
    loadFileList(folderToUse)
      .then(serverFiles => {
        initFileActions();
        // Be tolerant to API shapes: string or object with name/fileName/filename
        serverFiles = (serverFiles || [])
          .map(item => {
            if (typeof item === 'string') return item;
            const n = item?.name ?? item?.fileName ?? item?.filename ?? '';
            return String(n);
          })
          .map(s => s.trim().toLowerCase())
          .filter(Boolean);
        let overallSuccess = true;
        let succeeded = 0;
        allFiles.forEach(file => {
          const clientFileName = file.name.trim().toLowerCase();
          const li = progressElements[file.uploadIndex];
          const hadRelative = !!(file.webkitRelativePath || file.customRelativePath);
          if (!uploadResults[file.uploadIndex] || (!hadRelative && !serverFiles.includes(clientFileName))) {
            if (li) {
              li.progressBar.innerText = "Error";
            }
            overallSuccess = false;
            
          } else if (li) {
            succeeded++;
            
            // Schedule removal of successful file entry after 5 seconds.
            setTimeout(() => {
              li.remove();
              delete progressElements[file.uploadIndex];
              updateFileInfoCount();
              const progressContainer = document.getElementById("uploadProgressContainer");
              if (progressContainer && progressContainer.querySelectorAll("li.upload-progress-item").length === 0) {
                const fileInput = document.getElementById("file");
                if (fileInput) fileInput.value = "";
                progressContainer.innerHTML = "";
                adjustFolderHelpExpansionClosed();
                const fileInfoContainer = document.getElementById("fileInfoContainer");
                if (fileInfoContainer) {
                  fileInfoContainer.innerHTML = `<span id="fileInfoDefault">No files selected</span>`;
                }
                const dropArea = document.getElementById("uploadDropArea");
                if (dropArea) setDropAreaDefault();
              }
            }, 5000);
          }
        });

        if (!overallSuccess) {
          const failed = allFiles.length - succeeded;
          showToast(`${failed} file(s) failed, ${succeeded} succeeded. Please check the list.`);
        } else {
          showToast(`${succeeded} file succeeded. Please check the list.`);
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

/* -----------------------------------------------------
   Main initUpload: Sets up file input, drop area, and form submission.
----------------------------------------------------- */
function initUpload() {
  const fileInput = document.getElementById("file");
  const dropArea = document.getElementById("uploadDropArea");
  const uploadForm = document.getElementById("uploadFileForm");

  // For file picker, remove directory attributes so only files can be chosen.
  if (fileInput) {
    fileInput.removeAttribute("webkitdirectory");
    fileInput.removeAttribute("mozdirectory");
    fileInput.removeAttribute("directory");
    fileInput.setAttribute("multiple", "");
  }

  setDropAreaDefault();

  // Drag–and–drop events (for folder uploads) use original processing.
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
    // Clicking drop area triggers file input.
    dropArea.addEventListener("click", function () {
      if (fileInput) fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", function () {
      if (useResumable) {
        // For file picker, if resumable is enabled, let it handle the files.
        for (let i = 0; i < fileInput.files.length; i++) {
          resumableInstance.addFile(fileInput.files[i]);
        }
      } else {
        processFiles(fileInput.files);
      }
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
      // If files come from file picker (no relative path), use Resumable.
      if (useResumable && (!files[0].customRelativePath || files[0].customRelativePath === "")) {
        // Ensure current folder is updated.
        resumableInstance.opts.query.folder = window.currentFolder || "root";
        resumableInstance.upload();
        showToast("Resumable upload started...");
      } else {
        submitFiles(files);
      }
    });
  }

  if (useResumable) {
    initResumableUpload();
  }
}

export { initUpload };

// -------------------------
// Clipboard Paste Handler (Mimics Drag-and-Drop)
// -------------------------
document.addEventListener('paste', function handlePasteUpload(e) {
  const items = e.clipboardData?.items;
  if (!items) return;

  const files = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) {
        const ext = file.name.split('.').pop() || 'png';
        const renamedFile = new File([file], `image${Date.now()}.${ext}`, { type: file.type });
        renamedFile.isClipboard = true;

        Object.defineProperty(renamedFile, 'customRelativePath', {
          value: renamedFile.name,
          writable: true,
          configurable: true
        });

        files.push(renamedFile);
      }
    }
  }

  if (files.length > 0) {
    processFiles(files);
    showToast('Pasted file added to upload list.', 'success');
  }
});