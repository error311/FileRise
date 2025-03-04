// upload.js
import { displayFilePreview } from './utils.js';

document.addEventListener("DOMContentLoaded", function () {
  const fileInput = document.getElementById("file");
  const progressContainer = document.getElementById("uploadProgressContainer");
  const uploadForm = document.getElementById("uploadFileForm");

  function updateUploadProgress(e, listItem) {
    if (e.lengthComputable) {
      const currentPercent = Math.round((e.loaded / e.total) * 100);
      const elapsedTime = (Date.now() - listItem.startTime) / 1000;
      let speedText = "";
      if (elapsedTime > 0) {
        const speed = e.loaded / elapsedTime;
        if (speed < 1024) {
          speedText = speed.toFixed(0) + " B/s";
        } else if (speed < 1048576) {
          speedText = (speed / 1024).toFixed(1) + " KB/s";
        } else {
          speedText = (speed / 1048576).toFixed(1) + " MB/s";
        }
      }
      listItem.progressBar.style.width = currentPercent + "%";
      listItem.progressBar.innerText = currentPercent + "% (" + speedText + ")";
      return currentPercent;
    }
    return 0;
  }

  fileInput.addEventListener("change", function () {
    progressContainer.innerHTML = "";
    const files = fileInput.files;
    if (files.length > 0) {
      const list = document.createElement("ul");
      list.style.listStyle = "none";
      list.style.padding = "0";
      Array.from(files).forEach((file) => {
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

    const listItems = progressContainer.querySelectorAll("li");
    let finishedCount = 0;

    Array.from(files).forEach((file, index) => {
      const formData = new FormData();
      formData.append("file[]", file);
      const folderElem = document.getElementById("folderSelect");
      if (folderElem) {
        formData.append("folder", folderElem.value);
      } else {
        console.error("Folder selection element not found!");
      }
      const xhr = new XMLHttpRequest();
      let currentPercent = 0;
      xhr.upload.addEventListener("progress", function (e) {
        currentPercent = updateUploadProgress(e, listItems[index]);
      });
      xhr.addEventListener("load", function () {
        if (currentPercent >= 100) {
          listItems[index].progressBar.innerText = "Done";
        }
        finishedCount++;
        console.log("Upload response for file", file.name, xhr.responseText);
        if (finishedCount === files.length) {
          if (typeof loadFileList === "function") {
            loadFileList();
          }
          fileInput.value = "";
          setTimeout(() => {
            progressContainer.innerHTML = "";
          }, 5000);
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
