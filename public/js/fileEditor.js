// fileEditor.js
import { escapeHTML, showToast } from './domUtils.js';
import { loadFileList } from './fileListView.js';
import { t } from './i18n.js';

// thresholds for editor behavior
const EDITOR_PLAIN_THRESHOLD = 5 * 1024 * 1024;  // >5 MiB => force plain text, lighter settings
const EDITOR_BLOCK_THRESHOLD = 10 * 1024 * 1024; // >10 MiB => block editing

// Lazy-load CodeMirror modes on demand
const CM_CDN = "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.5/";
const MODE_URL = {
  // core you've likely already loaded:
  "xml": "mode/xml/xml.min.js",
  "css": "mode/css/css.min.js",
  "javascript": "mode/javascript/javascript.min.js",

  // extras you may want on-demand:
  "htmlmixed": "mode/htmlmixed/htmlmixed.min.js",
  "application/x-httpd-php": "mode/php/php.min.js",
  "php": "mode/php/php.min.js",
  "markdown": "mode/markdown/markdown.min.js",
  "python": "mode/python/python.min.js",
  "sql": "mode/sql/sql.min.js",
  "shell": "mode/shell/shell.min.js",
  "yaml": "mode/yaml/yaml.min.js",
  "properties": "mode/properties/properties.min.js",
  "text/x-csrc": "mode/clike/clike.min.js",
  "text/x-c++src": "mode/clike/clike.min.js",
  "text/x-java": "mode/clike/clike.min.js",
  "text/x-csharp": "mode/clike/clike.min.js",
  "text/x-kotlin": "mode/clike/clike.min.js"
};

function loadScriptOnce(url) {
  return new Promise((resolve, reject) => {
    const key = `cm:${url}`;
    let s = document.querySelector(`script[data-key="${key}"]`);
    if (s) {
      if (s.dataset.loaded === "1") return resolve();
      s.addEventListener("load", () => resolve());
      s.addEventListener("error", reject);
      return;
    }
    s = document.createElement("script");
    s.src = url;
    s.defer = true;
    s.dataset.key = key;
    s.addEventListener("load", () => { s.dataset.loaded = "1"; resolve(); });
    s.addEventListener("error", reject);
    document.head.appendChild(s);
  });
}

async function ensureModeLoaded(modeOption) {
  if (!window.CodeMirror) return; // CM core must be present
  const name = typeof modeOption === "string" ? modeOption : (modeOption && modeOption.name);
  if (!name) return;
  // Already registered?
  if ((CodeMirror.modes && CodeMirror.modes[name]) || (CodeMirror.mimeModes && CodeMirror.mimeModes[name])) {
    return;
  }
  const url = MODE_URL[name];
  if (!url) return; // unknown -> fallback to text/plain
  // Dependencies (htmlmixed needs xml/css/js; php highlighting with HTML also benefits from htmlmixed)
  if (name === "htmlmixed") {
    await Promise.all([
      ensureModeLoaded("xml"),
      ensureModeLoaded("css"),
      ensureModeLoaded("javascript")
    ]);
  }
  if (name === "application/x-httpd-php") {
    await ensureModeLoaded("htmlmixed");
  }
  await loadScriptOnce(CM_CDN + url);
}

function getModeForFile(fileName) {
  const dot = fileName.lastIndexOf(".");
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";

  switch (ext) {
    // markup
    case "html":
    case "htm":
      return "text/html";                 // ensureModeLoaded will map to htmlmixed
    case "xml":
      return "xml";
    case "md":
    case "markdown":
      return "markdown";
    case "yml":
    case "yaml":
      return "yaml";

    // styles & scripts
    case "css":
      return "css";
    case "js":
      return "javascript";
    case "json":
      return { name: "javascript", json: true };

    // server / langs
    case "php":
      return "application/x-httpd-php";
    case "py":
      return "python";
    case "sql":
      return "sql";
    case "sh":
    case "bash":
    case "zsh":
    case "bat":
      return "shell";

    // config-y files
    case "ini":
    case "conf":
    case "config":
    case "properties":
      return "properties";

    // C-family / JVM
    case "c":
    case "h":
      return "text/x-csrc";
    case "cpp":
    case "cxx":
    case "hpp":
    case "hh":
    case "hxx":
      return "text/x-c++src";
    case "java":
      return "text/x-java";
    case "cs":
      return "text/x-csharp";
    case "kt":
    case "kts":
      return "text/x-kotlin";

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
      const lenHeader =
        response.headers.get("content-length") ??
        response.headers.get("Content-Length");
      const sizeBytes = lenHeader ? parseInt(lenHeader, 10) : null;

      if (sizeBytes !== null && sizeBytes > EDITOR_BLOCK_THRESHOLD) {
        showToast("This file is larger than 10 MB and cannot be edited in the browser.");
        throw new Error("File too large.");
      }
      return response;
    })
    .then(() => fetch(fileUrl))
    .then(response => {
      if (!response.ok) {
        throw new Error("HTTP error! Status: " + response.status);
      }
      const lenHeader =
        response.headers.get("content-length") ??
        response.headers.get("Content-Length");
      const sizeBytes = lenHeader ? parseInt(lenHeader, 10) : null;
      return Promise.all([response.text(), sizeBytes]);
    })
    .then(([content, sizeBytes]) => {
      const forcePlainText =
        sizeBytes !== null && sizeBytes > EDITOR_PLAIN_THRESHOLD;

      const modal = document.createElement("div");
      modal.id = "editorContainer";
      modal.classList.add("modal", "editor-modal");
      modal.innerHTML = `
      <div class="editor-header">
        <h3 class="editor-title">${t("editing")}: ${escapeHTML(fileName)}${
          forcePlainText ? " <span style='font-size:.8em;opacity:.7'>(plain text mode)</span>" : ""
        }</h3>
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

      const isDarkMode = document.body.classList.contains("dark-mode");
      const theme = isDarkMode ? "material-darker" : "default";

      // choose mode + lighter settings for large files
      const mode = forcePlainText ? "text/plain" : getModeForFile(fileName);
      const cmOptions = {
        lineNumbers: !forcePlainText,
        mode: mode,
        theme: theme,
        viewportMargin: forcePlainText ? 20 : Infinity,
        lineWrapping: false,
      };

      // ✅ LOAD MODE FIRST, THEN INSTANTIATE CODEMIRROR
      ensureModeLoaded(mode).finally(() => {
        const editor = CodeMirror.fromTextArea(
          document.getElementById("fileEditor"),
          cmOptions
        );

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
          const isDark = document.body.classList.contains("dark-mode");
          editor.setOption("theme", isDark ? "material-darker" : "default");
        }
        const toggle = document.getElementById("darkModeToggle");
        if (toggle) toggle.addEventListener("click", updateEditorTheme);
      });
    })
    .catch(error => {
      if (error && error.name === "AbortError") return;
      console.error("Error loading file:", error);
    });
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
  fetch("/api/file/saveFile.php", {
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