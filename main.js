// main.js

import { sendRequest } from './networkUtils.js';
import { 
  toggleVisibility, 
  toggleAllCheckboxes, 
  updateFileActionButtons
} from './domUtils.js';
import { 
  loadFileList, 
  initFileActions, 
  editFile, 
  saveFile, 
  displayFilePreview,
  renameFile 
} from './fileManager.js';
import { 
  deleteFolder, 
  loadCopyMoveFolderList, 
  loadFolderList 
} from './folderManager.js';
import { initUpload } from './upload.js';
import { initAuth } from './auth.js';

// Expose functions for inline handlers.
window.sendRequest = sendRequest;
window.toggleVisibility = toggleVisibility;
window.toggleAllCheckboxes = toggleAllCheckboxes;
window.editFile = editFile;
window.saveFile = saveFile;
window.renameFile = renameFile;


// Global variable for the current folder.
window.currentFolder = "root";

// DOMContentLoaded initialization.
document.addEventListener("DOMContentLoaded", function () {
  window.currentFolder = window.currentFolder || "root";
  loadFileList(window.currentFolder);
  loadCopyMoveFolderList();
  initFileActions();
  initUpload();
  loadFolderList();
  updateFileActionButtons();
  // Initialize authentication and user management.
  initAuth();
});
