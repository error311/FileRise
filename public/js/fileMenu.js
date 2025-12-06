// fileMenu.js
import { t } from './i18n.js?v={{APP_QVER}}';
import { updateRowHighlight } from './domUtils.js?v={{APP_QVER}}';
import {
  handleDeleteSelected, handleCopySelected, handleMoveSelected,
  handleDownloadZipSelected, handleExtractZipSelected,
  renameFile, openCreateFileModal
} from './fileActions.js?v={{APP_QVER}}';
import { previewFile, buildPreviewUrl } from './filePreview.js?v={{APP_QVER}}';
import { editFile } from './fileEditor.js?v={{APP_QVER}}';
import { canEditFile, fileData, downloadSelectedFilesIndividually } from './fileListView.js?v={{APP_QVER}}';
import { openTagModal, openMultiTagModal } from './fileTags.js?v={{APP_QVER}}';
import { escapeHTML } from './domUtils.js?v={{APP_QVER}}';


const MENU_ID = 'fileContextMenu';

function qMenu() { return document.getElementById(MENU_ID); }
function setText(btn, key) { btn.querySelector('span').textContent = t(key); }

// One-time: localize labels
function localizeMenu() {
  const m = qMenu(); if (!m) return;
  const map = {
    'create_file': 'create_file',
    'delete_selected': 'delete_selected',
    'copy_selected': 'copy_selected',
    'move_selected': 'move_selected',
    'download_zip': 'download_zip',
    'extract_zip': 'extract_zip',
    'tag_selected': 'tag_selected',
    'preview': 'preview',
    'edit': 'edit',
    'rename': 'rename',
    'tag_file': 'tag_file',
    // NEW:
    'download_plain': 'download_plain'
  };
  Object.entries(map).forEach(([action, key]) => {
    const el = m.querySelector(`.mi[data-action="${action}"]`);
    if (el) setText(el, key);
  });
}

// Show/hide items based on selection state
function configureVisibility({ any, one, many, anyZip, canEdit }) {
  const m = qMenu(); if (!m) return;

  const show = (sel, on) => sel.forEach(el => el.hidden = !on);

  show(m.querySelectorAll('[data-when="always"]'), true);
  show(m.querySelectorAll('[data-when="any"]'),   any);
  show(m.querySelectorAll('[data-when="one"]'),   one);
  show(m.querySelectorAll('[data-when="many"]'),  many);
  show(m.querySelectorAll('[data-when="zip"]'),   anyZip);
  show(m.querySelectorAll('[data-when="can-edit"]'), canEdit);

  // Hide separators at edges or duplicates
  cleanupSeparators(m);
}

function cleanupSeparators(menu) {
  const kids = Array.from(menu.children);
  let lastWasSep = true; // leading seps hidden
  kids.forEach((el, i) => {
    if (el.classList.contains('sep')) {
      const hide = lastWasSep || (i === kids.length - 1);
      el.hidden = hide || el.hidden; // keep hidden if already hidden by state
      lastWasSep = !el.hidden;
    } else if (!el.hidden) {
      lastWasSep = false;
    }
  });
}

// Position menu within viewport
function placeMenu(x, y) {
  const m = qMenu(); if (!m) return;

  // make visible to measure
  m.hidden = false;
  m.style.left = '0px';
  m.style.top  = '0px';

  // force a max-height via CSS fallback if styles didn't load yet
  const pad = 8;
  const vh = window.innerHeight, vw = window.innerWidth;
  const mh = Math.min(vh - pad*2, 600); // JS fallback limit
  m.style.maxHeight = mh + 'px';

  // measure now that it's flow-visible
  const r0 = m.getBoundingClientRect();
  let nx = x, ny = y;

  // If it would overflow right, shift left
  if (nx + r0.width > vw - pad) nx = Math.max(pad, vw - r0.width - pad);
  // If it would overflow bottom, try placing it above the cursor
  if (ny + r0.height > vh - pad) {
    const above = y - r0.height - 4;
    ny = (above >= pad) ? above : Math.max(pad, vh - r0.height - pad);
  }

  // Guard top/left minimums
  nx = Math.max(pad, nx);
  ny = Math.max(pad, ny);

  m.style.left = `${nx}px`;
  m.style.top  = `${ny}px`;
}

export function hideFileContextMenu() {
  const m = qMenu();
  if (m) m.hidden = true;
}

function currentSelection() {
  const checks = Array.from(document.querySelectorAll('#fileList .file-checkbox'));
  // checkbox values are ESCAPED names (because buildFileTableRow used safeFileName)
  const selectedEsc = checks.filter(cb => cb.checked).map(cb => cb.value);
  const escSet = new Set(selectedEsc);

  // map back to real file objects by comparing escaped(f.name)
  const files = fileData.filter(f => escSet.has(escapeHTML(f.name)));

  const any  = files.length > 0;
  const one  = files.length === 1;
  const many = files.length > 1;
  const anyZip = files.some(f => f.name.toLowerCase().endsWith('.zip'));
  const file = one ? files[0] : null;
  const canEditFlag = !!(file && canEditFile(file.name));

  // also return the raw names if any caller needs them
  return {
    files,                   // <— real file objects for modals
    all: files.map(f => f.name),
    any, one, many, anyZip,
    file,
    canEdit: canEditFlag
  };
}

export function fileListContextMenuHandler(e) {
  e.preventDefault();

  // Check row if needed
  const row = e.target.closest('tr');
  if (row) {
    const cb = row.querySelector('.file-checkbox');
    if (cb && !cb.checked) {
      cb.checked = true;
      updateRowHighlight(cb);
    }
  }

  const state = currentSelection();
  configureVisibility(state);
  placeMenu(e.clientX, e.clientY);

  // Stash for click handlers
  window.__filr_ctx_state = state;
}

// --- add near top ---
let __ctxBoundOnce = false;

function docClickClose(ev) {
  const m = qMenu(); if (!m || m.hidden) return;
  if (!m.contains(ev.target)) hideFileContextMenu();
}
function docKeyClose(ev) {
  if (ev.key === 'Escape') hideFileContextMenu();
}

function menuClickDelegate(ev) {
  const btn = ev.target.closest('.mi[data-action]');
  if (!btn) return;
  ev.stopPropagation();

  // CLOSE MENU FIRST so it can’t overlay the modal
  hideFileContextMenu();

  const action = btn.dataset.action;
  const s = window.__filr_ctx_state || currentSelection();
  const folder = window.currentFolder || 'root';

  switch (action) {
    case 'create_file': openCreateFileModal(); break;
    case 'delete_selected': handleDeleteSelected(new Event('click')); break;
    case 'copy_selected':   handleCopySelected(new Event('click'));   break;
    case 'move_selected':   handleMoveSelected(new Event('click'));   break;
    case 'download_zip':    handleDownloadZipSelected(new Event('click')); break;
    case 'extract_zip':     handleExtractZipSelected(new Event('click'));  break;
    case 'download_plain':
      // Uses current checkbox selection; limit enforced in fileListView
      downloadSelectedFilesIndividually(s.files);
      break;

    case 'tag_selected':
      openMultiTagModal(s.files);  // s.files are the real file objects
      break;

    case 'preview':
      if (s.file) previewFile(buildPreviewUrl(folder, s.file.name), s.file.name);
      break;

    case 'edit':
      if (s.file && s.canEdit) editFile(s.file.name, folder);
      break;

    case 'rename':
      if (s.file) renameFile(s.file.name, folder);
      break;

    case 'tag_file':
      if (s.file) openTagModal(s.file);
      break;
  }
}

// keep your renderFileTable wrapper as-is

export function bindFileListContextMenu() {
  const container = document.getElementById('fileList');
  const menu = qMenu();
  if (!container || !menu) return;

  localizeMenu();

  // Open on right click in the table
  container.oncontextmenu = fileListContextMenuHandler;

  // Bind once
  if (!__ctxBoundOnce) {
    document.addEventListener('click', docClickClose);
    document.addEventListener('keydown', docKeyClose);
    menu.addEventListener('click', menuClickDelegate); // handles actions
    __ctxBoundOnce = true;
  }
}

// Rebind after table render (keeps your original behavior)
(function () {
  const orig = window.renderFileTable;
  if (typeof orig === 'function') {
    window.renderFileTable = function (folder) {
      orig(folder);
      bindFileListContextMenu();
    };
  } else {
    // If not present yet, bind once DOM is ready
    document.addEventListener('DOMContentLoaded', bindFileListContextMenu, { once: true });
  }
})();