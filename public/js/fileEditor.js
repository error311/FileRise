// fileEditor.js
import { escapeHTML, showToast } from './domUtils.js?v={{APP_QVER}}';
import { loadFileList } from './fileListView.js?v={{APP_QVER}}';
import { t } from './i18n.js?v={{APP_QVER}}';
import { buildPreviewUrl } from './filePreview.js?v={{APP_QVER}}';

// thresholds for editor behavior
const EDITOR_PLAIN_THRESHOLD = 5 * 1024 * 1024;  // >5 MiB => force plain text, lighter settings
const EDITOR_BLOCK_THRESHOLD = 10 * 1024 * 1024; // >10 MiB => block editing

// ==== CodeMirror lazy loader ===============================================
const CM_BASE = "/vendor/codemirror/5.65.5/";

// Stamp-friendly helpers (the stamper will replace {{APP_QVER}})
const coreUrl = (p) => `${CM_BASE}${p}?v={{APP_QVER}}`;

const CORE = {
  js: coreUrl("codemirror.min.js"),
  css: coreUrl("codemirror.min.css"),
  themeCss: coreUrl("theme/material-darker.min.css"),
};

// Which mode file to load for a given name/mime
const MODE_URL = {
  // core/common
  "xml": "mode/xml/xml.min.js?v={{APP_QVER}}",
  "css": "mode/css/css.min.js?v={{APP_QVER}}",
  "javascript": "mode/javascript/javascript.min.js?v={{APP_QVER}}",

  // meta / combos
  "htmlmixed": "mode/htmlmixed/htmlmixed.min.js?v={{APP_QVER}}",
  "application/x-httpd-php": "mode/php/php.min.js?v={{APP_QVER}}",

  // docs / data
  "markdown": "mode/markdown/markdown.min.js?v={{APP_QVER}}",
  "yaml": "mode/yaml/yaml.min.js?v={{APP_QVER}}",
  "properties": "mode/properties/properties.min.js?v={{APP_QVER}}",
  "sql": "mode/sql/sql.min.js?v={{APP_QVER}}",

  // shells
  "shell": "mode/shell/shell.min.js?v={{APP_QVER}}",

  // languages
  "python": "mode/python/python.min.js?v={{APP_QVER}}",
  "text/x-csrc": "mode/clike/clike.min.js?v={{APP_QVER}}",
  "text/x-c++src": "mode/clike/clike.min.js?v={{APP_QVER}}",
  "text/x-java": "mode/clike/clike.min.js?v={{APP_QVER}}",
  "text/x-csharp": "mode/clike/clike.min.js?v={{APP_QVER}}",
  "text/x-kotlin": "mode/clike/clike.min.js?v={{APP_QVER}}"
};

// Mode dependency graph
const MODE_DEPS = {
  "htmlmixed": ["xml", "javascript", "css"],
  "application/x-httpd-php": ["htmlmixed", "text/x-csrc"], // php overlays + clike bits
  "markdown": ["xml"]
};

// Map any mime/alias to the key we use in MODE_URL
function normalizeModeName(modeOption) {
  const name = typeof modeOption === "string" ? modeOption : (modeOption && modeOption.name);
  if (!name) return null;
  if (name === "text/html") return "htmlmixed";          // CodeMirror uses htmlmixed for HTML
  if (name === "php") return "application/x-httpd-php";  // prefer the full mime
  return name;
}

const _loadedScripts = new Set();
const _loadedCss = new Set();
let _corePromise = null;

function loadScriptOnce(url) {
  return new Promise((resolve, reject) => {
    if (_loadedScripts.has(url)) return resolve();
    const s = document.createElement("script");
    s.src = url;
    s.async = true;
    s.onload = () => { _loadedScripts.add(url); resolve(); };
    s.onerror = () => reject(new Error(`Load failed: ${url}`));
    document.head.appendChild(s);
  });
}

function loadCssOnce(href) {
  return new Promise((resolve, reject) => {
    if (_loadedCss.has(href)) return resolve();
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.onload = () => { _loadedCss.add(href); resolve(); };
    l.onerror = () => reject(new Error(`Load failed: ${href}`));
    document.head.appendChild(l);
  });
}

async function ensureCore() {
  if (_corePromise) return _corePromise;
  _corePromise = (async () => {
    // load CSS first to avoid FOUC
    await loadCssOnce(CORE.css);
    await loadCssOnce(CORE.themeCss);
    if (!window.CodeMirror) {
      await loadScriptOnce(CORE.js);
    }
  })();
  return _corePromise;
}

async function loadSingleMode(name) {
  const rel = MODE_URL[name];
  if (!rel) return;
  // prepend base if needed
  const url = rel.startsWith("http") ? rel : (rel.startsWith("/") ? rel : (CM_BASE + rel));
  await loadScriptOnce(url);
}

function isModeRegistered(name) {
  return !!(
    (window.CodeMirror?.modes && window.CodeMirror.modes[name]) ||
    (window.CodeMirror?.mimeModes && window.CodeMirror.mimeModes[name])
  );
}

async function ensureModeLoaded(modeOption) {
  await ensureCore();
  const name = normalizeModeName(modeOption);
  if (!name) return;
  if (isModeRegistered(name)) return;
  const deps = MODE_DEPS[name] || [];
  for (const d of deps) {
    if (!isModeRegistered(d)) await loadSingleMode(d);
  }
  await loadSingleMode(name);
}

// Public helper for callers (we keep your existing function name in use):
const MODE_LOAD_TIMEOUT_MS = 2500; // allow closing immediately; don't wait forever
// ==== /CodeMirror lazy loader ===============================================

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
  const fileUrl = buildPreviewUrl(folderUsed, fileName);

  // Probe size safely via API. Prefer HEAD; if missing Content-Length, fall back to a 1-byte Range GET.
  async function probeSize(url) {
    try {
      const h = await fetch(url, { method: "HEAD", credentials: "include" });
      const len = h.headers.get("content-length") ?? h.headers.get("Content-Length");
      if (len && !Number.isNaN(parseInt(len, 10))) return parseInt(len, 10);
    } catch { }
    try {
      const r = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        credentials: "include"
      });
      // Content-Range: bytes 0-0/12345
      const cr = r.headers.get("content-range") ?? r.headers.get("Content-Range");
      const m = cr && cr.match(/\/(\d+)\s*$/);
      if (m) return parseInt(m[1], 10);
    } catch { }
    return null;
  }

  probeSize(fileUrl)
    .then(sizeBytes => {
      if (sizeBytes !== null && sizeBytes > EDITOR_BLOCK_THRESHOLD) {
        showToast("This file is larger than 10 MB and cannot be edited in the browser.");
        throw new Error("File too large.");
      }
      return fetch(fileUrl, { credentials: "include" });
    })
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
          <button id="saveBtn" class="btn btn-primary" data-default disabled>${t("save")} </button>
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
      decBtn.addEventListener("click", () => { });
      incBtn.addEventListener("click", () => { });

      // Theme + mode selection
      const isDarkMode = document.body.classList.contains("dark-mode");
      const theme = isDarkMode ? "material-darker" : "default";
      const desiredMode = forcePlainText ? "text/plain" : getModeForFile(fileName);

      // Start core+mode loading (don’t block closing)
      const modePromise = (async () => {
        await ensureCore();                 // load CM core + CSS
        if (!forcePlainText) {
          await ensureModeLoaded(desiredMode); // then load the needed mode + deps
        }
      })();

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

        const normName = normalizeModeName(desiredMode) || "text/plain";
        const initialMode = (forcePlainText || !isModeRegistered(normName)) ? "text/plain" : desiredMode;

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
          if (!canceled && !forcePlainText) {
            const nn = normalizeModeName(desiredMode);
            if (nn && isModeRegistered(nn)) {
              editor.setOption("mode", desiredMode);
            }
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