// upload.js

import { loadFileList, displayFilePreview, initFileActions } from './fileManager.js';
import { showToast, escapeHTML } from './domUtils.js';

export function initUpload() {
  const fileInput = document.getElementById("file");
  const progressContainer = document.getElementById("uploadProgressContainer");
  const uploadForm = document.getElementById("uploadFileForm");
  const dropArea = document.getElementById("uploadDropArea");

  // Helper function: set the drop area's default layout.
  function setDropAreaDefault() {
    if (dropArea) {
      dropArea.innerHTML = `
        <div id="uploadInstruction" style="margin-bottom:10px; font-size:16px;">
          Drop files here or click 'Choose files'
        </div>
        <div id="uploadFileRow" style="display:flex; align-items:center; justify-content:center;">
          <button id="customChooseBtn" type="button">
           Choose files
          </button>
          <div id="fileInfoContainer" style="margin-left:10px; font-size:16px; display:flex; align-items:center;">
            <span id="fileInfoDefault">No files selected</span>
          </div>
        </div>
      `;
      // Wire up the custom button.
      /* const customChooseBtn = document.getElementById("customChooseBtn");
      if (customChooseBtn) {
        customChooseBtn.addEventListener("click", function () {
          fileInput.click();
        });
      } */
    }
  }

  // Initialize drop area.
  if (dropArea) {
    dropArea.style.border = "2px dashed #ccc";
    dropArea.style.padding = "20px";
    dropArea.style.textAlign = "center";
    dropArea.style.marginBottom = "15px";
    dropArea.style.cursor = "pointer";
    // Set default content once.
    setDropAreaDefault();

    // Prevent default behavior for drag events.
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

    // Clicking the drop area triggers file selection.
    dropArea.addEventListener("click", function () {
      fileInput.click();
    });
  }

  // When files are selected, update only the file info container.
  if (fileInput) {
    fileInput.addEventListener("change", function () {
      const files = fileInput.files;
      // Update the file info container without replacing the entire drop area.
      const fileInfoContainer = document.getElementById("fileInfoContainer");
      if (fileInfoContainer) {
        if (files.length > 0) {
          if (files.length === 1) {
            fileInfoContainer.innerHTML = `
              <div id="filePreviewContainer" style="display:inline-block; vertical-align:middle;"></div>
              <span id="fileNameDisplay" style="vertical-align:middle; margin-left:5px;">${escapeHTML(files[0].name)}</span>
            `;
          } else {
            fileInfoContainer.innerHTML = `
              <div id="filePreviewContainer" style="display:inline-block; vertical-align:middle;"></div>
              <span id="fileCountDisplay" style="vertical-align:middle; margin-left:5px;">${files.length} files selected</span>
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
      
      // Build progress list as before.
      progressContainer.innerHTML = "";
      if (files.length > 0) {
        const allFiles = Array.from(files);
        const maxDisplay = 10;
        const list = document.createElement("ul");
        list.style.listStyle = "none";
        list.style.padding = "0";
        allFiles.forEach((file, index) => {
          const li = document.createElement("li");
          li.style.paddingTop = "10px";
          li.style.marginBottom = "10px";
          li.style.display = (index < maxDisplay) ? "flex" : "none";
          li.style.alignItems = "center";
          li.style.flexWrap = "wrap";
          
          const preview = document.createElement("div");
          preview.className = "file-preview";
          displayFilePreview(file, preview);
          
          const nameDiv = document.createElement("div");
          // Using textContent here is safe, so no need to escape
          nameDiv.textContent = file.name;
          nameDiv.style.flexGrow = "1";
          nameDiv.style.marginLeft = "5px";
          nameDiv.style.wordBreak = "break-word";
          
          const progDiv = document.createElement("div");
          progDiv.classList.add("progress");
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
          extra.style.paddingTop = "10px";
          extra.style.marginBottom = "10px";
          extra.textContent = `Uploading additional ${allFiles.length - maxDisplay} file(s)...`;
          extra.style.display = "flex";
          list.appendChild(extra);
        }
        progressContainer.appendChild(list);
      }
    });
  }

  // Submit handler remains unchanged.
  if (uploadForm) {
    uploadForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const files = fileInput.files;
      if (files.length === 0) {
        showToast("No files selected.");
        return;
      }
      const allFiles = Array.from(files);
      const maxDisplay = 10;
      const folderToUse = window.currentFolder || "root";
      const listItems = progressContainer.querySelectorAll("li");
      let finishedCount = 0;
      let allSucceeded = true;
      const uploadResults = new Array(allFiles.length).fill(false);

      allFiles.forEach((file, index) => {
        const formData = new FormData();
        formData.append("file[]", file);
        formData.append("folder", folderToUse);

        const xhr = new XMLHttpRequest();
        let currentPercent = 0;

        xhr.upload.addEventListener("progress", function (e) {
          if (e.lengthComputable) {
            currentPercent = Math.round((e.loaded / e.total) * 100);
            if (index < maxDisplay && listItems[index]) {
              const elapsed = (Date.now() - listItems[index].startTime) / 1000;
              let speed = "";
              if (elapsed > 0) {
                const spd = e.loaded / elapsed;
                if (spd < 1024) speed = spd.toFixed(0) + " B/s";
                else if (spd < 1048576) speed = (spd / 1024).toFixed(1) + " KB/s";
                else speed = (spd / 1048576).toFixed(1) + " MB/s";
              }
              listItems[index].progressBar.style.width = currentPercent + "%";
              listItems[index].progressBar.innerText = currentPercent + "% (" + speed + ")";
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
          if (xhr.status >= 200 && xhr.status < 300 && (!jsonResponse || !jsonResponse.error)) {
            if (index < maxDisplay && listItems[index]) {
              listItems[index].progressBar.style.width = "100%";
              listItems[index].progressBar.innerText = "Done";
            }
            uploadResults[index] = true;
          } else {
            if (index < maxDisplay && listItems[index]) {
              listItems[index].progressBar.innerText = "Error";
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
          if (index < maxDisplay && listItems[index]) {
            listItems[index].progressBar.innerText = "Error";
          }
          uploadResults[index] = false;
          allSucceeded = false;
          finishedCount++;
          console.error("Error uploading file:", file.name);
          if (finishedCount === allFiles.length) {
            refreshFileList();
          }
        });

        xhr.addEventListener("abort", function () {
          if (index < maxDisplay && listItems[index]) {
            listItems[index].progressBar.innerText = "Aborted";
          }
          uploadResults[index] = false;
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
              const fileName = file.name.trim().toLowerCase();
              if (index < maxDisplay && listItems[index]) {
                if (!uploadResults[index] || !serverFiles.includes(fileName)) {
                  listItems[index].progressBar.innerText = "Error";
                  allSucceeded = false;
                }
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
          });
      }
    });
  }
}