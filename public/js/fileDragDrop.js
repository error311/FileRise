// fileDragDrop.js
import { showToast } from './domUtils.js?v={{APP_QVER}}';
import { loadFileList } from './fileListView.js?v={{APP_QVER}}';

export function fileDragStartHandler(event) {
  const row = event.currentTarget;
  let fileNames = [];

  const selectedCheckboxes = document.querySelectorAll("#fileList .file-checkbox:checked");
  if (selectedCheckboxes.length > 1) {
    selectedCheckboxes.forEach(chk => {
      const parentRow = chk.closest("tr");
      if (parentRow) {
        const cell = parentRow.querySelector("td:nth-child(2)");
        if (cell) {
          let rawName = cell.textContent.trim();
          const tagContainer = cell.querySelector(".tag-badges");
          if (tagContainer) {
            const tagText = tagContainer.innerText.trim();
            if (rawName.endsWith(tagText)) {
              rawName = rawName.slice(0, -tagText.length).trim();
            }
          }
          fileNames.push(rawName);
        }
      }
    });
  } else {
    const fileNameCell = row.querySelector("td:nth-child(2)");
    if (fileNameCell) {
      let rawName = fileNameCell.textContent.trim();
      const tagContainer = fileNameCell.querySelector(".tag-badges");
      if (tagContainer) {
        const tagText = tagContainer.innerText.trim();
        if (rawName.endsWith(tagText)) {
          rawName = rawName.slice(0, -tagText.length).trim();
        }
      }
      fileNames.push(rawName);
    }
  }

  if (fileNames.length === 0) return;

  const dragData = fileNames.length === 1 
    ? { fileName: fileNames[0], sourceFolder: window.currentFolder || "root" }
    : { files: fileNames, sourceFolder: window.currentFolder || "root" };

  event.dataTransfer.setData("application/json", JSON.stringify(dragData));

  let dragImage = document.createElement("div");
  dragImage.style.display = "inline-flex";
  dragImage.style.width = "auto";
  dragImage.style.maxWidth = "fit-content";
  dragImage.style.padding = "6px 10px";
  dragImage.style.backgroundColor = "#333";
  dragImage.style.color = "#fff";
  dragImage.style.border = "1px solid #555";
  dragImage.style.borderRadius = "4px";
  dragImage.style.alignItems = "center";
  dragImage.style.boxShadow = "2px 2px 6px rgba(0,0,0,0.3)";
  const icon = document.createElement("span");
  icon.className = "material-icons";
  icon.textContent = "insert_drive_file";
  icon.style.marginRight = "4px";
  const label = document.createElement("span");
  label.textContent = fileNames.length === 1 ? fileNames[0] : fileNames.length + " files";
  dragImage.appendChild(icon);
  dragImage.appendChild(label);
  
  document.body.appendChild(dragImage);
  event.dataTransfer.setDragImage(dragImage, 5, 5);
  setTimeout(() => {
    document.body.removeChild(dragImage);
  }, 0);
}

export function folderDragOverHandler(event) {
  event.preventDefault();
  event.currentTarget.classList.add("drop-hover");
}

export function folderDragLeaveHandler(event) {
  event.currentTarget.classList.remove("drop-hover");
}

export function folderDropHandler(event) {
  event.preventDefault();
  event.currentTarget.classList.remove("drop-hover");
  const dropFolder = event.currentTarget.getAttribute("data-folder");
  let dragData;
  try {
    dragData = JSON.parse(event.dataTransfer.getData("application/json"));
  } catch (e) {
    console.error("Invalid drag data");
    return;
  }
  if (!dragData || !dragData.fileName) return;
  fetch("/api/file/moveFiles.php", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').getAttribute("content")
    },
    body: JSON.stringify({
      source: dragData.sourceFolder,
      files: [dragData.fileName],
      destination: dropFolder
    })
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        showToast(`File "${dragData.fileName}" moved successfully to ${dropFolder}!`);
        loadFileList(dragData.sourceFolder);
      } else {
        showToast("Error moving file: " + (data.error || "Unknown error"));
      }
    })
    .catch(error => {
      console.error("Error moving file via drop:", error);
      showToast("Error moving file.");
    });
}