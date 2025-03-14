import { loadFileList, displayFilePreview, initFileActions } from './fileManager.js';
import { showToast, escapeHTML } from './domUtils.js';
import { loadFolderTree } from './folderManager.js';

export function initUpload() {
  const fileInput = document.getElementById("file");

  // Enhancement: Allow folder upload with subfolders by setting directory attributes.
  if (fileInput) {
    fileInput.setAttribute("webkitdirectory", "");
    fileInput.setAttribute("mozdirectory", "");
    fileInput.setAttribute("directory", "");
  }

  const progressContainer = document.getElementById("uploadProgressContainer");
  const uploadForm = document.getElementById("uploadFileForm");
  const dropArea = document.getElementById("uploadDropArea");

  // Helper function: set the drop area's default layout using CSS classes.
  function setDropAreaDefault() {
    if (dropArea) {
      dropArea.innerHTML = `
          <div id="uploadInstruction" class="upload-instruction">
            Drop files here or click 'Choose files'
          </div>
          
          <div id="uploadFileRow" class="upload-file-row">
            <button id="customChooseBtn" type="button">
              Choose files
            </button>
          </div>

          <!-- New wrapper below the upload row -->
          <div id="fileInfoWrapper" class="file-info-wrapper">
            <div id="fileInfoContainer" class="file-info-container">
              <span id="fileInfoDefault">No files selected</span>
            </div>
          </div>
        `;
    }
  }

  // Initialize drop area.
  if (dropArea) {
    dropArea.classList.add("upload-drop-area");
    setDropAreaDefault();

    dropArea.addEventListener("dragover", function (e) {
      e.preventDefault();
      dropArea.style.backgroundColor = "#f8f8f8";
    });
    dropArea.addEventListener("dragleave", function (e) {
      e.preventDefault();
      dropArea.style.backgroundColor = "";
    });
    dropArea.addEventListener("drop", function (e) {
      e.preventDefault();
      dropArea.style.backgroundColor = "";
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length > 0) {
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event("change"));
      }
    });
    dropArea.addEventListener("click", function () {
      fileInput.click();
    });
  }

  // When files are selected, update file info container and build progress list.
  if (fileInput) {
    fileInput.addEventListener("change", function () {
      const files = fileInput.files;
      const fileInfoContainer = document.getElementById("fileInfoContainer");
      if (fileInfoContainer) {
        if (files.length > 0) {
          if (files.length === 1) {
            fileInfoContainer.innerHTML = `
              <div id="filePreviewContainer" class="file-preview-container"></div>
              <span id="fileNameDisplay" class="file-name-display">${escapeHTML(files[0].name)}</span>
            `;
          } else {
            fileInfoContainer.innerHTML = `
              <div id="filePreviewContainer" class="file-preview-container"></div>
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

      // Convert FileList to an array and assign a unique uploadIndex to each file.
      const allFiles = Array.from(files);
      allFiles.forEach((file, index) => {
        file.uploadIndex = index;
      });

      progressContainer.innerHTML = "";
      if (allFiles.length > 0) {
        const maxDisplay = 10;
        const list = document.createElement("ul");
        list.classList.add("upload-progress-list");

        // Check if any file has a relative path (i.e. folder upload).
        const hasRelativePaths = allFiles.some(file => file.webkitRelativePath && file.webkitRelativePath.trim() !== "");

        if (hasRelativePaths) {
          // Group files by folder.
          const fileGroups = {};
          allFiles.forEach(file => {
            let folderName = "Root";
            if (file.webkitRelativePath && file.webkitRelativePath.trim() !== "") {
              const parts = file.webkitRelativePath.split("/");
              if (parts.length > 1) {
                folderName = parts.slice(0, parts.length - 1).join("/");
              }
            }
            if (!fileGroups[folderName]) {
              fileGroups[folderName] = [];
            }
            fileGroups[folderName].push(file);
          });

          // Create a list element for each folder group.
          Object.keys(fileGroups).forEach(folderName => {
            // Folder header with Material Icon.
            const folderLi = document.createElement("li");
            folderLi.classList.add("upload-folder-group");
            folderLi.innerHTML = `<i class="material-icons folder-icon" style="vertical-align:middle;">folder</i> ${folderName}:`;
            list.appendChild(folderLi);

            // Nested list for files in this folder.
            const nestedUl = document.createElement("ul");
            nestedUl.classList.add("upload-folder-group-list");
            fileGroups[folderName]
              .sort((a, b) => a.uploadIndex - b.uploadIndex)
              .forEach(file => {
                const li = document.createElement("li");
                li.classList.add("upload-progress-item");
                li.style.display = "flex";
                li.dataset.uploadIndex = file.uploadIndex;

                const preview = document.createElement("div");
                preview.className = "file-preview";
                displayFilePreview(file, preview);

                const nameDiv = document.createElement("div");
                nameDiv.classList.add("upload-file-name");
                // Only show the file's basename.
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
                li.appendChild(preview);
                li.appendChild(nameDiv);
                li.appendChild(progDiv);
                li.progressBar = progBar;
                li.startTime = Date.now();
                nestedUl.appendChild(li);
              });
            list.appendChild(nestedUl);
          });
        } else {
          // Normal flat list (no grouping)
          allFiles.forEach((file, index) => {
            const li = document.createElement("li");
            li.classList.add("upload-progress-item");
            li.style.display = (index < maxDisplay) ? "flex" : "none";
            li.dataset.uploadIndex = index;

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
            li.appendChild(preview);
            li.appendChild(nameDiv);
            li.appendChild(progDiv);
            li.progressBar = progBar;
            li.startTime = Date.now();
            list.appendChild(li);
          });
          if (allFiles.length > maxDisplay) {
            const extra = document.createElement("li");
            extra.classList.add("upload-progress-extra");
            extra.textContent = `Uploading additional ${allFiles.length - maxDisplay} file(s)...`;
            extra.style.display = "flex";
            list.appendChild(extra);
          }
        }
        progressContainer.appendChild(list);
      }
    });
  }

  // Submit handler.
  if (uploadForm) {
    uploadForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const files = fileInput.files;
      if (files.length === 0) {
        showToast("No files selected.");
        return;
      }
      const allFiles = Array.from(files);
      // Make sure each file has an uploadIndex (if not already assigned).
      allFiles.forEach((file, index) => {
        if (typeof file.uploadIndex === "undefined") file.uploadIndex = index;
      });
      const maxDisplay = 10;
      const folderToUse = window.currentFolder || "root";
      // Build a mapping of uploadIndex => progress element.
      const progressElements = {};
      // Query all file list items (they have the class "upload-progress-item")
      const listItems = progressContainer.querySelectorAll("li.upload-progress-item");
      listItems.forEach(item => {
        progressElements[item.dataset.uploadIndex] = item;
      });
      let finishedCount = 0;
      let allSucceeded = true;
      const uploadResults = new Array(allFiles.length).fill(false);

      allFiles.forEach((file, index) => {
        const formData = new FormData();
        formData.append("file[]", file);
        formData.append("folder", folderToUse);
        // If a relative path is available, send it.
        if (file.webkitRelativePath && file.webkitRelativePath !== "") {
          formData.append("relativePath", file.webkitRelativePath);
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
            }
            uploadResults[file.uploadIndex] = true;
          } else {
            if (li) {
              li.progressBar.innerText = "Error";
            }
            allSucceeded = false;
          }
          finishedCount++;
          console.log("Upload response for file", file.name, xhr.responseText);
          if (finishedCount === allFiles.length) {
            refreshFileList();
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
          console.error("Error uploading file:", file.name);
          if (finishedCount === allFiles.length) {
            refreshFileList();
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
          console.error("Upload aborted for file:", file.name);
          if (finishedCount === allFiles.length) {
            refreshFileList();
          }
        });

        xhr.open("POST", "upload.php", true);
        xhr.send(formData);
      });

      function refreshFileList() {
        loadFileList(folderToUse)
          .then(serverFiles => {
            initFileActions();
            serverFiles = (serverFiles || []).map(item => item.name.trim().toLowerCase());
            allFiles.forEach((file, index) => {
              // Skip verification for folder-uploaded files.
              if (file.webkitRelativePath && file.webkitRelativePath.trim() !== "") {
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
              progressContainer.innerHTML = "";
              fileInput.value = "";
              if (dropArea) setDropAreaDefault();
            }, 10000);
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
    });
  }
}