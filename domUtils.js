// domUtils.js

export function toggleVisibility(elementId, shouldShow) {
  const element = document.getElementById(elementId);
  if (element) {
    element.style.display = shouldShow ? "block" : "none";
  } else {
    console.error(`Element with id "${elementId}" not found.`);
  }
}

export function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Toggle all checkboxes (assumes checkboxes have class 'file-checkbox')
export function toggleAllCheckboxes(masterCheckbox) {
  const checkboxes = document.querySelectorAll(".file-checkbox");
  checkboxes.forEach(chk => {
    chk.checked = masterCheckbox.checked;
  });
  updateFileActionButtons();  // call the updated function
}

// This updateFileActionButtons function checks for checkboxes inside the file list container.
export function updateFileActionButtons() {
  const fileListContainer = document.getElementById("fileList");
  const fileCheckboxes = document.querySelectorAll("#fileList .file-checkbox");
  const selectedCheckboxes = document.querySelectorAll("#fileList .file-checkbox:checked");
  const copyBtn = document.getElementById("copySelectedBtn");
  const moveBtn = document.getElementById("moveSelectedBtn");
  const deleteBtn = document.getElementById("deleteSelectedBtn");
  const zipBtn = document.getElementById("downloadZipBtn");
  
  // Hide the buttons and dropdown if no files exist.
  if (fileCheckboxes.length === 0) {
    copyBtn.style.display = "none";
    moveBtn.style.display = "none";
    deleteBtn.style.display = "none";
    zipBtn.style.display = "none";
  } else {
    // Otherwise, show the buttons and dropdown.
    copyBtn.style.display = "inline-block";
    moveBtn.style.display = "inline-block";
    deleteBtn.style.display = "inline-block";
    zipBtn.style.display = "inline-block";
    
    // Enable the buttons if at least one file is selected; otherwise disable.
    if (selectedCheckboxes.length > 0) {
      copyBtn.disabled = false;
      moveBtn.disabled = false;
      deleteBtn.disabled = false;
      zipBtn.disabled = false;
    } else {
      copyBtn.disabled = true;
      moveBtn.disabled = true;
      deleteBtn.disabled = true;
      zipBtn.disabled = true;
    }
  }
}

export function showToast(message, duration = 3000) {
  const toast = document.getElementById("customToast");
  if (!toast) {
    console.error("Toast element not found");
    return;
  }
  toast.textContent = message;
  toast.style.display = "block";
  // Force reflow so the transition works.
  void toast.offsetWidth;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      toast.style.display = "none";
    }, 500); // Wait for the opacity transition to finish.
  }, duration);
}