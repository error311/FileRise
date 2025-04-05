// fileManager.js
import './fileListView.js';
import './filePreview.js';
import './fileEditor.js';
import './fileDragDrop.js';
import './fileMenu.js';
import { initFileActions } from './fileActions.js';

// Initialize file action buttons.
document.addEventListener("DOMContentLoaded", function () {
  initFileActions();
});

// Attach folder drag-and-drop support for folder tree nodes.
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".folder-option").forEach(el => {
    import('./fileDragDrop.js').then(module => {
      el.addEventListener("dragover", module.folderDragOverHandler);
      el.addEventListener("dragleave", module.folderDragLeaveHandler);
      el.addEventListener("drop", module.folderDropHandler);
    });
  });
});

// Global keydown listener for file deletion via Delete/Backspace.
document.addEventListener("keydown", function(e) {
  const tag = e.target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || e.target.isContentEditable) {
    return;
  }
  if (e.key === "Delete" || e.key === "Backspace" || e.keyCode === 46 || e.keyCode === 8) {
    const selectedCheckboxes = document.querySelectorAll("#fileList .file-checkbox:checked");
    if (selectedCheckboxes.length > 0) {
      e.preventDefault();
      import('./fileActions.js').then(module => {
        module.handleDeleteSelected(new Event("click"));
      });
    }
  }
});