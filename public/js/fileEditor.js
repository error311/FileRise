// fileEditor.js
import { escapeHTML, showToast } from './domUtils.js';
import { loadFileList } from './fileListView.js';
import { t } from './i18n.js';

function getModeForFile(fileName) {
  const ext = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
  switch (ext) {
    case "css":
      return "css";
    case "json":
      return { name: "javascript", json: true };
    case "js":
      return "javascript";
    case "html":
    case "htm":
      return "text/html";
    case "xml":
      return "xml";
    default:
      return "text/plain";
  }
}
export { getModeForFile };

function adjustEditorSize() {
  const modal = document.querySelector(".editor-modal");
  if (modal && window.currentEditor) {
    const headerHeight = 60; // adjust as needed
    const availableHeight = modal.clientHeight - headerHeight;
    window.currentEditor.setSize("100%", availableHeight + "px");
  }
}
export { adjustEditorSize };

function observeModalResize(modal) {
  if (!modal) return;
  const resizeObserver = new ResizeObserver(() => {
    adjustEditorSize();
  });
  resizeObserver.observe(modal);
}
export { observeModalResize };

export function editFile(fileName, folder) {
  let existingEditor = document.getElementById("editorContainer");
  if (existingEditor) {
    existingEditor.remove();
  }
  const folderUsed = folder || window.currentFolder || "root";
  const folderPath = folderUsed === "root"
    ? "uploads/"
    : "uploads/" + folderUsed.split("/").map(encodeURIComponent).join("/") + "/";
  const fileUrl = folderPath + encodeURIComponent(fileName) + "?t=" + new Date().getTime();

  fetch(fileUrl, { method: "HEAD" })
    .then(response => {
      const contentLength = response.headers.get("Content-Length");
      if (contentLength !== null && parseInt(contentLength) > 10485760) {
        showToast("This file is larger than 10 MB and cannot be edited in the browser.");
        throw new Error("File too large.");
      }
      return fetch(fileUrl);
    })
    .then(response => {
      if (!response.ok) {
        throw new Error("HTTP error! Status: " + response.status);
      }
      return response.text();
    })
    .then(content => {
      const modal = document.createElement("div");
      modal.id = "editorContainer";
      modal.classList.add("modal", "editor-modal");
      modal.innerHTML = `
      <div class="editor-header">
        <h3 class="editor-title">${t("editing")}: ${escapeHTML(fileName)}</h3>
        <div class="editor-controls">
           <button id="decreaseFont" class="btn btn-sm btn-secondary">${t("decrease_font")}</button>
           <button id="increaseFont" class="btn btn-sm btn-secondary">${t("increase_font")}</button>
        </div>
        <button id="closeEditorX" class="editor-close-btn">&times;</button>
      </div>
      <textarea id="fileEditor" class="editor-textarea">${escapeHTML(content)}</textarea>
      <div class="editor-footer">
        <button id="saveBtn" class="btn btn-primary">${t("save")}</button>
        <button id="closeBtn" class="btn btn-secondary">${t("close")}</button>
      </div>
    `;
      document.body.appendChild(modal);
      modal.style.display = "block";

      const mode = getModeForFile(fileName);
      const isDarkMode = document.body.classList.contains("dark-mode");
      const theme = isDarkMode ? "material-darker" : "default";

      const editor = CodeMirror.fromTextArea(document.getElementById("fileEditor"), {
        lineNumbers: true,
        mode: mode,
        theme: theme,
        viewportMargin: Infinity
      });

      window.currentEditor = editor;

      setTimeout(() => {
        adjustEditorSize();
      }, 50);

      observeModalResize(modal);

      let currentFontSize = 14;
      editor.getWrapperElement().style.fontSize = currentFontSize + "px";
      editor.refresh();

      document.getElementById("closeEditorX").addEventListener("click", function () {
        modal.remove();
      });

      document.getElementById("decreaseFont").addEventListener("click", function () {
        currentFontSize = Math.max(8, currentFontSize - 2);
        editor.getWrapperElement().style.fontSize = currentFontSize + "px";
        editor.refresh();
      });

      document.getElementById("increaseFont").addEventListener("click", function () {
        currentFontSize = Math.min(32, currentFontSize + 2);
        editor.getWrapperElement().style.fontSize = currentFontSize + "px";
        editor.refresh();
      });

      document.getElementById("saveBtn").addEventListener("click", function () {
        saveFile(fileName, folderUsed);
      });

      document.getElementById("closeBtn").addEventListener("click", function () {
        modal.remove();
      });

      function updateEditorTheme() {
        const isDarkMode = document.body.classList.contains("dark-mode");
        editor.setOption("theme", isDarkMode ? "material-darker" : "default");
      }

      document.getElementById("darkModeToggle").addEventListener("click", updateEditorTheme);
    })
    .catch(error => console.error("Error loading file:", error));
}


export function saveFile(fileName, folder) {
  const editor = window.currentEditor;
  if (!editor) {
    console.error("Editor not found!");
    return;
  }
  const folderUsed = folder || window.currentFolder || "root";
  const fileDataObj = {
    fileName: fileName,
    content: editor.getValue(),
    folder: folderUsed
  };
  fetch("api/file/saveFile.php", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": window.csrfToken
    },
    body: JSON.stringify(fileDataObj)
  })
    .then(response => response.json())
    .then(result => {
      showToast(result.success || result.error);
      document.getElementById("editorContainer")?.remove();
      loadFileList(folderUsed);
    })
    .catch(error => console.error("Error saving file:", error));
}