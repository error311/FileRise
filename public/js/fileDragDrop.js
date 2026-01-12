// fileDragDrop.js
import { showToast, escapeHTML } from './domUtils.js?v={{APP_QVER}}';
import { loadFileList, cancelHoverPreview, repairBlankFolderIcons } from './fileListView.js?v={{APP_QVER}}';
import { startTransferProgress, finishTransferProgress } from './transferProgress.js?v={{APP_QVER}}';
import {
  getParentFolder,
  syncTreeAfterFolderMove,
} from './folderManager.js?v={{APP_QVER}}';

/* ---------------- helpers ---------------- */
function getRowEl(el) {
  return el?.closest('tr[data-file-name], .gallery-card[data-file-name]') || null;
}
function parentFolderOf(path) {
  if (!path || path === 'root') return 'root';
  const parts = String(path).split('/').filter(Boolean);
  if (parts.length <= 1) return 'root';
  parts.pop();
  return parts.join('/');
}

function invalidateFolderStats(folders, sourceId = '') {
  try {
    const list = Array.isArray(folders) ? folders : [folders];
    window.dispatchEvent(
      new CustomEvent('folderStatsInvalidated', {
        detail: { folders: list, sourceId }
      })
    );
  } catch (e) {
    // best-effort only; never break the move on this
    console.warn('folderStatsInvalidated failed', e);
  }
}
function scheduleBlankFolderIconRepair() {
  try {
    const kick = () => { try { repairBlankFolderIcons({ force: true }); } catch (e) {} };
    if (typeof queueMicrotask === 'function') queueMicrotask(kick);
    setTimeout(kick, 80);
    setTimeout(kick, 250);
  } catch (e) { /* ignore */ }
}
function getNameFromAny(el) {
  const row = getRowEl(el);
  if (!row) return null;
  // 1) canonical
  const n = row.getAttribute('data-file-name');
  if (n) return n;
  // 2) filename-only span
  const span = row.querySelector('.filename-text');
  if (span) return span.textContent.trim();
  return null;
}
function getSelectedFileNames(rootEl) {
  const scope = rootEl?.closest?.('#fileList, #fileListSecondary') || document.getElementById('fileList') || document;
  const boxes = Array.from(scope.querySelectorAll('.file-checkbox:checked'));
  const names = boxes.map(cb => getNameFromAny(cb)).filter(Boolean);
  // de-dup just in case
  return Array.from(new Set(names));
}
function makeDragImage(labelText, iconName = 'insert_drive_file') {
  const isDark = document.body.classList.contains('dark-mode');

  const textColor = isDark
    ? '#f1f3f4'
    : 'var(--filr-text, #111827)';

  const bgColor = isDark
    ? 'rgba(32,33,36,0.96)'
    : 'var(--filr-bg-elevated, #ffffff)';

  const borderColor = isDark
    ? 'rgba(255,255,255,0.14)'
    : 'rgba(15,23,42,0.12)';

  const wrap = document.createElement('div');
  Object.assign(wrap.style, {
    position: 'fixed',
    top: '-9999px',
    left: '-9999px',
    zIndex: '99999',

    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',

    padding: '7px 16px',
    minHeight: '32px',
    maxWidth: '420px',
    whiteSpace: 'nowrap',

    borderRadius: '999px',
    overflow: 'hidden',
    backgroundClip: 'padding-box',

    background: bgColor,
    color: textColor,
    border: `1px solid ${borderColor}`,
    boxShadow: '0 4px 18px rgba(0,0,0,0.18)',
    fontSize: '14px',
    lineHeight: '1.4',
    fontWeight: '500',

    pointerEvents: 'none'
  });

  const icon = document.createElement('span');
  icon.className = 'material-icons';
  icon.textContent = iconName;
  Object.assign(icon.style, {
    fontSize: '20px',
    lineHeight: '1',
    flexShrink: '0',
    color: textColor
  });

  const label = document.createElement('span');
  const txt = String(labelText || '');
  label.textContent = txt.length > 60 ? (txt.slice(0, 57) + '…') : txt;
  Object.assign(label.style, {
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  });

  wrap.appendChild(icon);
  wrap.appendChild(label);
  document.body.appendChild(wrap);

  return wrap;
}

function getActiveSourceId() {
  const paneKey = window.activePane === 'secondary' ? 'secondary' : 'primary';
  const paneSource = window.__frPaneState?.[paneKey]?.sourceId || '';
  if (paneSource) return paneSource;
  const sel = document.getElementById('sourceSelector');
  if (sel && sel.value) return sel.value;
  try {
    const stored = localStorage.getItem('fr_active_source');
    if (stored) return stored;
  } catch (e) {}
  return '';
}

function getPaneSourceIdForElement(el) {
  const pane = el?.closest?.('.file-list-pane');
  if (!pane) return '';
  const paneKey = pane.classList.contains('secondary-pane') ? 'secondary' : 'primary';
  return window.__frPaneState?.[paneKey]?.sourceId || '';
}

function getPaneFolderForElement(el) {
  const pane = el?.closest?.('.file-list-pane');
  if (!pane) return '';
  const paneKey = pane.classList.contains('secondary-pane') ? 'secondary' : 'primary';
  return window.__frPaneState?.[paneKey]?.currentFolder || '';
}

function getPaneFileDataForElement(el) {
  const pane = el?.closest?.('.file-list-pane');
  const paneKey = pane && pane.classList.contains('secondary-pane') ? 'secondary' : 'primary';
  const state = window.__frPaneState?.[paneKey];
  if (state && Array.isArray(state.fileData)) return state.fileData;
  return [];
}

function getTransferTotalsForNames(names, fileList) {
  const list = Array.isArray(names) ? names : [];
  const wanted = new Set(list.map(name => String(name || '')));
  const files = Array.isArray(fileList) ? fileList : [];

  let totalBytes = 0;
  let matched = 0;
  let unknown = 0;

  files.forEach(file => {
    if (!file || !file.name) return;
    const raw = String(file.name);
    const esc = escapeHTML(raw);
    if (!wanted.has(raw) && !wanted.has(esc)) return;
    matched += 1;
    if (Number.isFinite(file.sizeBytes)) {
      totalBytes += file.sizeBytes;
    } else {
      unknown += 1;
    }
  });

  const missing = Math.max(0, list.length - matched);
  if (missing) unknown += missing;

  return {
    totalBytes,
    bytesKnown: unknown === 0 && totalBytes > 0,
    itemCount: list.length
  };
}

/* ---------------- drag start (rows/cards) ---------------- */
export function fileDragStartHandler(event) {
  try { cancelHoverPreview(); } catch (e) {}
  const row = getRowEl(event.currentTarget);
  if (!row) return;

  // Use current selection if present; otherwise drag just this row’s file
  let names = getSelectedFileNames(row);
  if (names.length === 0) {
    const single = getNameFromAny(row);
    if (single) names = [single];
  }
  if (names.length === 0) return;

  const sourceFolder = getPaneFolderForElement(row) || window.currentFolder || 'root';
  const sourceId = getPaneSourceIdForElement(row) || getActiveSourceId();
  const fileList = getPaneFileDataForElement(row);
  const totals = getTransferTotalsForNames(names, fileList);
  const payload = {
    files: names,
    sourceFolder,
    sourceId,
    totalBytes: totals.totalBytes,
    totalItems: totals.itemCount,
    bytesKnown: totals.bytesKnown
  };

  // primary payload
  event.dataTransfer.setData('application/json', JSON.stringify(payload));
  // fallback (lets some environments read something human)
  event.dataTransfer.setData('text/plain', names.join('\n'));

  // nicer drag image
  const dragLabel = (names.length === 1) ? names[0] : `${names.length} files`;
  const ghost = makeDragImage(dragLabel, names.length === 1 ? 'insert_drive_file' : 'folder');
  event.dataTransfer.setDragImage(ghost, 6, 6);
  // clean up the ghost as soon as the browser has captured it
  setTimeout(() => { try { document.body.removeChild(ghost); } catch (e) { } }, 0);
}

/* ---------------- folder targets ---------------- */
export function folderDragOverHandler(event) {
  event.preventDefault();
  event.currentTarget.classList.add('drop-hover');
}
export function folderDragLeaveHandler(event) {
  event.currentTarget.classList.remove('drop-hover');
}

export async function folderDropHandler(event) {
  event.preventDefault();
  event.currentTarget.classList.remove('drop-hover');

  const dropFolder =
    event.currentTarget.getAttribute('data-folder') ||
    event.currentTarget.getAttribute('data-dest-folder') ||
    'root';

  let dragData = null;
  try {
    const raw = event.dataTransfer.getData('application/json') || '{}';
    dragData = JSON.parse(raw);
  } catch (e) {
    dragData = null;
  }

  if (!dragData) {
    showToast('Invalid drag data.');
    return;
  }

  // ---------------------------
  // 1) FOLDER → FOLDER MOVE
  // ---------------------------
  if (dragData.dragType === 'folder' && dragData.folder) {
    const source = String(dragData.folder);
    const destination = dropFolder || 'root';
    const sourceId = String(dragData.sourceId || dragData.sourceSourceId || '').trim();
    const destSourceId = getPaneSourceIdForElement(event.currentTarget) || getActiveSourceId();
    const crossSource = sourceId && destSourceId && sourceId !== destSourceId;

    // quick no-op: same parent as before
    const oldParent = parentFolderOf(source);
    if (!crossSource && destination === oldParent) {
      showToast('Source and destination are the same.');
      return;
    }

    // optional: mirror PHP self/descendant guard so we fail fast
    const norm = s => {
      if (!s) return '';
      return s.replace(/^[/\\]+|[/\\]+$/g, '');
    };
    const srcNorm = norm(source);
    const dstNorm = destination === 'root' ? '' : norm(destination);

    if (
      !crossSource &&
      dstNorm !== '' &&
      (
        dstNorm.toLowerCase() === srcNorm.toLowerCase() ||
        (dstNorm + '/').toLowerCase().startsWith((srcNorm + '/').toLowerCase())
      )
    ) {
      showToast('Destination cannot be the source or its descendant');
      return;
    }

    const progress = startTransferProgress({
      action: 'Moving',
      itemCount: 1,
      itemLabel: 'folder',
      bytesKnown: false,
      indeterminate: true,
      source,
      destination
    });
    let ok = false;
    let errMsg = '';

    try {
      const res = await fetch('/api/folder/moveFolder.php', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-CSRF-Token': window.csrfToken
        },
        body: JSON.stringify({
          source,        // full folder path
          destination,   // parent or "root"
          sourceId,
          destSourceId
        })
      });

      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch (e) { /* ignore double-echo edge cases */ }

      if (!res.ok || (data && data.error)) {
        const msg = (data && data.error) || text || `HTTP ${res.status}`;
        ok = false;
        errMsg = msg || 'Could not move folder';
        showToast('Error moving folder: ' + msg);
        return;
      }

      const oldParent = getParentFolder(source);
      const dstParent = destination || 'root';

      // keep inline folder stats in sync for both parents
      if (crossSource) {
        invalidateFolderStats([oldParent], sourceId);
        invalidateFolderStats([dstParent], destSourceId);
      } else {
        const statSourceId = sourceId || destSourceId;
        invalidateFolderStats([oldParent, dstParent], statSourceId);
      }

      showToast(`Moved folder to "${dstParent || 'root'}".`);
      ok = true;

      if (crossSource) {
        loadFileList(dstParent).finally(scheduleBlankFolderIconRepair);
      } else {
        // Let folderManager handle tree refresh + selection + file list reload
        await syncTreeAfterFolderMove(source, dstParent);
        scheduleBlankFolderIconRepair();
      }

    } catch (e) {
      ok = false;
      errMsg = e && e.message ? e.message : 'Could not move folder';
      console.error('Error moving folder:', e);
      showToast('Error moving folder.');
    } finally {
      finishTransferProgress(progress, { ok, error: errMsg });
    }

    return;
  }

  // ---------------------------
  // 2) FILE → FOLDER MOVE (existing logic)
  // ---------------------------

  let names = Array.isArray(dragData.files)
    ? dragData.files.slice()
    : dragData.fileName
      ? [dragData.fileName]
      : [];

  names = names.filter(v => typeof v === 'string' && v.length > 0);

  if (!names.length) {
    showToast('No files to move.');
    return;
  }

  const sourceFolder = dragData.sourceFolder || (window.currentFolder || 'root');
  const sourceId = String(dragData.sourceId || dragData.sourceSourceId || '').trim();
  const destSourceId = getPaneSourceIdForElement(event.currentTarget) || getActiveSourceId();
  const crossSource = sourceId && destSourceId && sourceId !== destSourceId;
  if (!crossSource && dropFolder === sourceFolder) {
    showToast('Source and destination are the same.');
    return;
  }

  const totals = {
    totalBytes: Number.isFinite(dragData.totalBytes) ? dragData.totalBytes : 0,
    bytesKnown: dragData.bytesKnown === true,
    itemCount: names.length
  };
  const progress = startTransferProgress({
    action: 'Moving',
    itemCount: totals.itemCount,
    itemLabel: totals.itemCount === 1 ? 'file' : 'files',
    totalBytes: totals.totalBytes,
    bytesKnown: totals.bytesKnown,
    source: sourceFolder,
    destination: dropFolder
  });
  let ok = false;
  let errMsg = '';

  try {
    const res = await fetch('/api/file/moveFiles.php', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CSRF-Token': window.csrfToken
      },
      body: JSON.stringify({
        source: sourceFolder,
        files: names,
        destination: dropFolder,
        sourceId,
        destSourceId
      })
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data && data.success) {
      ok = true;
      const msg =
        names.length === 1
          ? `Moved "${names[0]}" to ${dropFolder}.`
          : `Moved ${names.length} files to ${dropFolder}.`;
      showToast(msg);

      // keep stats fresh for source + dest
      if (crossSource) {
        invalidateFolderStats([sourceFolder], sourceId);
        invalidateFolderStats([dropFolder], destSourceId);
      } else {
        const statSourceId = sourceId || destSourceId;
        invalidateFolderStats([sourceFolder, dropFolder], statSourceId);
      }

      const reloadFolder = crossSource
        ? (window.currentFolder || dropFolder || sourceFolder)
        : (window.currentFolder || sourceFolder);
      loadFileList(reloadFolder).finally(scheduleBlankFolderIconRepair);
    } else {
      const err = (data && (data.error || data.message)) || `HTTP ${res.status}`;
      ok = false;
      errMsg = err;
      showToast('Error moving file(s): ' + err);
    }
  } catch (e) {
    ok = false;
    errMsg = e && e.message ? e.message : 'Could not move file(s)';
    console.error('Error moving file(s):', e);
    showToast('Error moving file(s).');
  } finally {
    finishTransferProgress(progress, { ok, error: errMsg });
  }
}
