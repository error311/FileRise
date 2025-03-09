// main.js

import { sendRequest } from './networkUtils.js';
import { 
  toggleVisibility, 
  toggleAllCheckboxes, 
  updateFileActionButtons,
  showToast
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
  loadFolderTree, 
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
    // Call initAuth synchronously.
    initAuth();
    const message = sessionStorage.getItem("welcomeMessage");
    if (message) {
      showToast(message);
      sessionStorage.removeItem("welcomeMessage");
    }
    window.currentFolder = "root";
    window.updateFileActionButtons = updateFileActionButtons;
    loadFileList(window.currentFolder);
    initFileActions();
    initUpload();
    loadFolderTree();    
  });
