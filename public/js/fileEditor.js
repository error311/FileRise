// fileEditor.js
import { escapeHTML, showToast } from './domUtils.js';
import { loadFileList } from './fileListView.js';
import { t } from './i18n.js';

// thresholds for editor behavior
const EDITOR_PLAIN_THRESHOLD = 5 * 1024 * 1024;  // >5 MiB => force plain text, lighter settings
const EDITOR_BLOCK_THRESHOLD = 10 * 1024 * 1024; // >10 MiB => block editing

// Lazy-load CodeMirror modes on demand
const CM_CDN = "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.5/";

// Which mode file to load for a given name/mime
const MODE_URL = {
  // core/common
  "xml":        "mode/xml/xml.min.js",
  "css":        "mode/css/css.min.js",
  "javascript": "mode/javascript/javascript.min.js",

  // meta / combos
  "htmlmixed":  "mode/htmlmixed/htmlmixed.min.js",
  "application/x-httpd-php": "mode/php/php.min.js",

  // docs / data
  "markdown":   "mode/markdown/markdown.min.js",
  "yaml":       "mode/yaml/yaml.min.js",
  "properties": "mode/properties/properties.min.js",
  "sql":        "mode/sql/sql.min.js",

  // shells
  "shell":      "mode/shell/shell.min.js",

  // languages
  "python":     "mode/python/python.min.js",
  "text/x-csrc":    "mode/clike/clike.min.js",
  "text/x-c++src":  "mode/clike/clike.min.js",
  "text/x-java":    "mode/clike/clike.min.js",
  "text/x-csharp":  "mode/clike/clike.min.js",
  "text/x-kotlin":  "mode/clike/clike.min.js"
};

// Map any mime/alias to the key we use in MODE_URL
function normalizeModeName(modeOption) {
  const name = typeof modeOption === "string" ? modeOption : (modeOption && modeOption.name);
  if (!name) return null;
  if (name === "text/html") return "htmlmixed";          // CodeMirror uses htmlmixed for HTML
  if (name === "php") return "application/x-httpd-php";  // prefer the full mime
  return name;
}

const MODE_SRI = {
  "mode/xml/xml.min.js": "sha512-LarNmzVokUmcA7aUDtqZ6oTS+YXmUKzpGdm8DxC46A6AHu+PQiYCUlwEGWidjVYMo/QXZMFMIadZtrkfApYp/g==",
  "mode/css/css.min.js": "sha512-oikhYLgIKf0zWtVTOXh101BWoSacgv4UTJHQOHU+iUQ1Dol3Xjz/o9Jh0U33MPoT/d4aQruvjNvcYxvkTQd0nA==",
  "mode/javascript/javascript.min.js": "sha512-I6CdJdruzGtvDyvdO4YsiAq+pkWf2efgd1ZUSK2FnM/u2VuRASPC7GowWQrWyjxCZn6CT89s3ddGI+be0Ak9Fg==",
  "mode/htmlmixed/htmlmixed.min.js": "sha512-HN6cn6mIWeFJFwRN9yetDAMSh+AK9myHF1X9GlSlKmThaat65342Yw8wL7ITuaJnPioG0SYG09gy0qd5+s777w==",
  "mode/php/php.min.js": "sha512-jZGz5n9AVTuQGhKTL0QzOm6bxxIQjaSbins+vD3OIdI7mtnmYE6h/L+UBGIp/SssLggbkxRzp9XkQNA4AyjFBw==",
  "mode/markdown/markdown.min.js": "sha512-DmMao0nRIbyDjbaHc8fNd3kxGsZj9PCU6Iu/CeidLQT9Py8nYVA5n0PqXYmvqNdU+lCiTHOM/4E7bM/G8BttJg==",
  "mode/python/python.min.js": "sha512-2M0GdbU5OxkGYMhakED69bw0c1pW3Nb0PeF3+9d+SnwN1ryPx3wiDdNqK3gSM7KAU/pEV+2tFJFbMKjKAahOkQ==",
  "mode/sql/sql.min.js": "sha512-u8r8NUnG9B9L2dDmsfvs9ohQ0SO/Z7MB8bkdLxV7fE0Q8bOeP7/qft1D4KyE8HhVrpH3ihSrRoDiMbYR1VQBWQ==",
  "mode/shell/shell.min.js": "sha512-HoC6JXgjHHevWAYqww37Gfu2c1G7SxAOv42wOakjR8csbTUfTB7OhVzSJ95LL62nII0RCyImp+7nR9zGmJ1wRQ==",
  "mode/yaml/yaml.min.js": "sha512-+aXDZ93WyextRiAZpsRuJyiAZ38ztttUyO/H3FZx4gOAOv4/k9C6Um1CvHVtaowHZ2h7kH0d+orWvdBLPVwb4g==",
  "mode/properties/properties.min.js": "sha512-P4OaO+QWj1wPRsdkEHlrgkx+a7qp6nUC8rI6dS/0/HPjHtlEmYfiambxowYa/UfqTxyNUnwTyPt5U6l1GO76yw==",
  "mode/clike/clike.min.js": "sha512-l8ZIWnQ3XHPRG3MQ8+hT1OffRSTrFwrph1j1oc1Fzc9UKVGef5XN9fdO0vm3nW0PRgQ9LJgck6ciG59m69rvfg=="
};

const MODE_LOAD_TIMEOUT_MS = 2500; // allow closing immediately; don't wait forever

function loadScriptOnce(url) {
  return new Promise((resolve, reject) => {
    const key = `cm:${url}`;
    let s = document.querySelector(`script[data-key="${key}"]`);
    if (s) {
      if (s.dataset.loaded === "1") return resolve();
      s.addEventListener("load", () => resolve());
      s.addEventListener("error", () => reject(new Error(`Load failed: ${url}`)));
      return;
    }
    s = document.createElement("script");
    s.src = url;
    s.async = true;
    s.dataset.key = key;

    // 🔒 Add SRI if we have it
    const relPath = url.replace(/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/codemirror\/5\.65\.5\//, "");
    const sri = MODE_SRI[relPath];
    if (sri) {
      s.integrity = sri;
      s.crossOrigin = "anonymous";
      // (Optional) further tighten referrer behavior:
      // s.referrerPolicy = "no-referrer";
    }

    s.addEventListener("load", () => { s.dataset.loaded = "1"; resolve(); });
    s.addEventListener("error", () => reject(new Error(`Load failed: ${url}`)));
    document.head.appendChild(s);
  });
}


async function ensureModeLoaded(modeOption) {
  if (!window.CodeMirror) return;

  const name = normalizeModeName(modeOption);
  if (!name) return;

  const isRegistered = () =>
    (window.CodeMirror?.modes && window.CodeMirror.modes[name]) ||
    (window.CodeMirror?.mimeModes && window.CodeMirror.mimeModes[name]);

  if (isRegistered()) return;

  const url = MODE_URL[name];
  if (!url) return; // unknown -> stay in text/plain

  // Dependencies
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
    case "html":
    case "htm": return "text/html";
    case "xml": return "xml";
    case "md":
    case "markdown": return "markdown";
    case "yml":
    case "yaml": return "yaml";
    case "css": return "css";
    case "js": return "javascript";
    case "json": return { name: "javascript", json: true };
    case "php": return "application/x-httpd-php";
    case "py": return "python";
    case "sql": return "sql";
    case "sh":
    case "bash":
    case "zsh":
    case "bat": return "shell";
    case "ini":
    case "conf":
    case "config":
    case "properties": return "properties";
    case "c":
    case "h": return "text/x-csrc";
    case "cpp":
    case "cxx":
    case "hpp":
    case "hh":
    case "hxx": return "text/x-c++src";
    case "java": return "text/x-java";
    case "cs": return "text/x-csharp";
    case "kt":
    case "kts": return "text/x-kotlin";
    default: return "text/plain";
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
  const resizeObserver = new ResizeObserver(() => adjustEditorSize());
  resizeObserver.observe(modal);
}
export { observeModalResize };

export function editFile(fileName, folder) {
  // destroy any previous editor
  let existingEditor = document.getElementById("editorContainer");
  if (existingEditor) existingEditor.remove();

  const folderUsed = folder || window.currentFolder || "root";
  const folderPath = folderUsed === "root"
    ? "uploads/"
    : "uploads/" + folderUsed.split("/").map(encodeURIComponent).join("/") + "/";
  const fileUrl = folderPath + encodeURIComponent(fileName) + "?t=" + new Date().getTime();

  fetch(fileUrl, { method: "HEAD" })
    .then(response => {
      const lenHeader = response.headers.get("content-length") ?? response.headers.get("Content-Length");
      const sizeBytes = lenHeader ? parseInt(lenHeader, 10) : null;

      if (sizeBytes !== null && sizeBytes > EDITOR_BLOCK_THRESHOLD) {
        showToast("This file is larger than 10 MB and cannot be edited in the browser.");
        throw new Error("File too large.");
      }
      return response;
    })
    .then(() => fetch(fileUrl))
    .then(response => {
      if (!response.ok) throw new Error("HTTP error! Status: " + response.status);
      const lenHeader = response.headers.get("content-length") ?? response.headers.get("Content-Length");
      const sizeBytes = lenHeader ? parseInt(lenHeader, 10) : null;
      return Promise.all([response.text(), sizeBytes]);
    })
    .then(([content, sizeBytes]) => {
      const forcePlainText = sizeBytes !== null && sizeBytes > EDITOR_PLAIN_THRESHOLD;

      // --- Build modal immediately and wire close controls BEFORE any async loads ---
      const modal = document.createElement("div");
      modal.id = "editorContainer";
      modal.classList.add("modal", "editor-modal");
      modal.setAttribute("tabindex", "-1"); // for Escape handling
      modal.innerHTML = `
        <div class="editor-header">
          <h3 class="editor-title">
            ${t("editing")}: ${escapeHTML(fileName)}
            ${forcePlainText ? " <span style='font-size:.8em;opacity:.7'>(plain text mode)</span>" : ""}
          </h3>
          <div class="editor-controls">
            <button id="decreaseFont" class="btn btn-sm btn-secondary">${t("decrease_font")}</button>
            <button id="increaseFont" class="btn btn-sm btn-secondary">${t("increase_font")}</button>
          </div>
          <button id="closeEditorX" class="editor-close-btn" aria-label="${t("close")}">&times;</button>
        </div>
        <textarea id="fileEditor" class="editor-textarea">${escapeHTML(content)}</textarea>
        <div class="editor-footer">
          <button id="saveBtn" class="btn btn-primary" disabled>${t("save")}</button>
          <button id="closeBtn" class="btn btn-secondary">${t("close")}</button>
        </div>
      `;
      document.body.appendChild(modal);
      modal.style.display = "block";
      modal.focus();

      let canceled = false;
      const doClose = () => {
        canceled = true;
        window.currentEditor = null;
        modal.remove();
      };

      // Wire close actions right away
      modal.addEventListener("keydown", (e) => { if (e.key === "Escape") doClose(); });
      document.getElementById("closeEditorX").addEventListener("click", doClose);
      document.getElementById("closeBtn").addEventListener("click", doClose);

      // Keep buttons responsive even before editor exists
      const decBtn = document.getElementById("decreaseFont");
      const incBtn = document.getElementById("increaseFont");
      decBtn.addEventListener("click", () => {});
      incBtn.addEventListener("click", () => {});

      // Theme + mode selection
      const isDarkMode = document.body.classList.contains("dark-mode");
      const theme = isDarkMode ? "material-darker" : "default";
      const desiredMode = forcePlainText ? "text/plain" : getModeForFile(fileName);

      // Helper to check whether a mode is currently registered
      const modeName = typeof desiredMode === "string" ? desiredMode : (desiredMode && desiredMode.name);
      const isModeRegistered = () =>
        (window.CodeMirror?.modes && window.CodeMirror.modes[modeName]) ||
        (window.CodeMirror?.mimeModes && window.CodeMirror.mimeModes[modeName]);

      // Start mode loading (don’t block closing)
      const modePromise = ensureModeLoaded(desiredMode);

      // Wait up to MODE_LOAD_TIMEOUT_MS; then proceed with whatever is available
      const timeout = new Promise((res) => setTimeout(res, MODE_LOAD_TIMEOUT_MS));

      Promise.race([modePromise, timeout]).then(() => {
        if (canceled) return;
        if (!window.CodeMirror) {
          // Core not present: keep plain <textarea>; enable Save and bail gracefully
          document.getElementById("saveBtn").disabled = false;
          observeModalResize(modal);
          return;
        }

        const initialMode = (forcePlainText || !isModeRegistered()) ? "text/plain" : desiredMode;
        const cmOptions = {
          lineNumbers: !forcePlainText,
          mode: initialMode,
          theme,
          viewportMargin: forcePlainText ? 20 : Infinity,
          lineWrapping: false
        };

        const editor = window.CodeMirror.fromTextArea(
          document.getElementById("fileEditor"),
          cmOptions
        );
        window.currentEditor = editor;

        setTimeout(adjustEditorSize, 50);
        observeModalResize(modal);

        // Font controls (now that editor exists)
        let currentFontSize = 14;
        const wrapper = editor.getWrapperElement();
        wrapper.style.fontSize = currentFontSize + "px";
        editor.refresh();

        decBtn.addEventListener("click", function () {
          currentFontSize = Math.max(8, currentFontSize - 2);
          wrapper.style.fontSize = currentFontSize + "px";
          editor.refresh();
        });
        incBtn.addEventListener("click", function () {
          currentFontSize = Math.min(32, currentFontSize + 2);
          wrapper.style.fontSize = currentFontSize + "px";
          editor.refresh();
        });

        // Save
        const saveBtn = document.getElementById("saveBtn");
        saveBtn.disabled = false;
        saveBtn.addEventListener("click", function () {
          saveFile(fileName, folderUsed);
        });

        // Theme switch
        function updateEditorTheme() {
          const isDark = document.body.classList.contains("dark-mode");
          editor.setOption("theme", isDark ? "material-darker" : "default");
        }
        const toggle = document.getElementById("darkModeToggle");
        if (toggle) toggle.addEventListener("click", updateEditorTheme);

        // If we started in plain text due to timeout, flip to the real mode once it arrives
        modePromise.then(() => {
          if (!canceled && !forcePlainText && isModeRegistered()) {
            editor.setOption("mode", desiredMode);
          }
        }).catch(() => {
          // If the mode truly fails to load, we just stay in plain text
        });
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