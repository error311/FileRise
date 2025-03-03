document.addEventListener("DOMContentLoaded", function() {
  const fileInput = document.getElementById("file");
  const progressContainer = document.getElementById("uploadProgressContainer");
  const uploadForm = document.getElementById("uploadFileForm");

  // When files are selected, display a list with preview, file name, and a progress bar.
  fileInput.addEventListener("change", function() {
    progressContainer.innerHTML = ""; // Clear previous entries
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
        
        // Create preview container (32x32)
        const previewContainer = document.createElement("div");
        previewContainer.className = "file-preview";
        if (file.type.startsWith("image/")) {
          const img = document.createElement("img");
          img.style.width = "32px";
          img.style.height = "32px";
          img.style.objectFit = "cover";
          const reader = new FileReader();
          reader.onload = function(e) {
            img.src = e.target.result;
          };
          reader.readAsDataURL(file);
          previewContainer.appendChild(img);
        } else {
          const icon = document.createElement("i");
          icon.className = "material-icons";
          icon.textContent = "insert_drive_file";
          icon.style.fontSize = "32px";
          previewContainer.appendChild(icon);
        }
        
        // File name container – allow wrapping
        const fileNameDiv = document.createElement("div");
        fileNameDiv.textContent = file.name;
        fileNameDiv.style.flexGrow = "1";
        fileNameDiv.style.marginLeft = "10px";
        fileNameDiv.style.wordBreak = "break-word";
        
        // Progress bar container (fixed width)
        const progressDiv = document.createElement("div");
        progressDiv.classList.add("progress");
        progressDiv.style.flex = "0 0 250px";
        progressDiv.style.marginLeft = "5px";
        
        const progressBar = document.createElement("div");
        progressBar.classList.add("progress-bar");
        progressBar.style.width = "0%";
        progressBar.innerText = "0%";
        
        progressDiv.appendChild(progressBar);
        
        // Assemble the list item
        listItem.appendChild(previewContainer);
        listItem.appendChild(fileNameDiv);
        listItem.appendChild(progressDiv);
        
        // Save reference for updates and record start time for speed calculation.
        listItem.progressBar = progressBar;
        listItem.startTime = Date.now();
        
        list.appendChild(listItem);
      });
      
      progressContainer.appendChild(list);
    }
  });

  // On form submit, upload each file individually and update its corresponding progress bar.
  uploadForm.addEventListener("submit", function(e) {
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
      // Append the file
      formData.append("file[]", file);
      // Append the current folder value from the hidden input
      formData.append("folder", document.getElementById("uploadFolder").value);
      
      const xhr = new XMLHttpRequest();
      let currentPercent = 0;
      
      // Update progress events.
      xhr.upload.addEventListener("progress", function(e) {
        if (e.lengthComputable) {
          currentPercent = Math.round((e.loaded / e.total) * 100);
          const elapsedTime = (Date.now() - listItems[index].startTime) / 1000; // seconds
          let speedText = "";
          if (elapsedTime > 0) {
            const speed = e.loaded / elapsedTime; // bytes per second
            if (speed < 1024) {
              speedText = speed.toFixed(0) + " B/s";
            } else if (speed < 1048576) {
              speedText = (speed / 1024).toFixed(1) + " KB/s";
            } else {
              speedText = (speed / 1048576).toFixed(1) + " MB/s";
            }
          }
          listItems[index].progressBar.style.width = currentPercent + "%";
          listItems[index].progressBar.innerText = currentPercent + "% (" + speedText + ")";
        }
      });
      
      // Use the load event for final update.
      xhr.addEventListener("load", function() {
        if (currentPercent >= 100) {
          listItems[index].progressBar.innerText = "Done";
        }
        finishedCount++;
        console.log("Upload response for file", file.name, xhr.responseText);
        if (finishedCount === files.length) {
          if (typeof loadFileList === "function") {
            loadFileList();
          }
          // Reset file input so "No files selected" appears
          fileInput.value = "";
          setTimeout(() => {
            progressContainer.innerHTML = "";
          }, 5000);
        }
      });
      
      xhr.addEventListener("error", function() {
        listItems[index].progressBar.innerText = "Error";
      });
      
      xhr.open("POST", "upload.php", true);
      xhr.send(formData);
    });
  });
});
