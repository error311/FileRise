// fileDragDrop.js
import { showToast } from './domUtils.js?v={{APP_QVER}}';
import { loadFileList, cancelHoverPreview } from './fileListView.js?v={{APP_QVER}}';
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

function invalidateFolderStats(folders) {
  try {
    const list = Array.isArray(folders) ? folders : [folders];
    window.dispatchEvent(
      new CustomEvent('folderStatsInvalidated', {
        detail: { folders: list }
      })
    );
  } catch (e) {
    // best-effort only; never break the move on this
    console.warn('folderStatsInvalidated failed', e);
  }
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
function getSelectedFileNames() {
  const boxes = Array.from(document.querySelectorAll('#fileList .file-checkbox:checked'));
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

/* ---------------- drag start (rows/cards) ---------------- */
export function fileDragStartHandler(event) {
  try { cancelHoverPreview(); } catch (e) {}
  const row = getRowEl(event.currentTarget);
  if (!row) return;

  // Use current selection if present; otherwise drag just this row’s file
  let names = getSelectedFileNames();
  if (names.length === 0) {
    const single = getNameFromAny(row);
    if (single) names = [single];
  }
  if (names.length === 0) return;

  const sourceFolder = window.currentFolder || 'root';
  const payload = { files: names, sourceFolder };

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

    // quick no-op: same parent as before
    const oldParent = parentFolderOf(source);
    if (destination === oldParent) {
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
      dstNorm !== '' &&
      (
        dstNorm.toLowerCase() === srcNorm.toLowerCase() ||
        (dstNorm + '/').toLowerCase().startsWith((srcNorm + '/').toLowerCase())
      )
    ) {
      showToast('Destination cannot be the source or its descendant');
      return;
    }

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
          destination    // parent or "root"
        })
      });

      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch (e) { /* ignore double-echo edge cases */ }

      if (!res.ok || (data && data.error)) {
        const msg = (data && data.error) || text || `HTTP ${res.status}`;
        showToast('Error moving folder: ' + msg);
        return;
      }

      const oldParent = getParentFolder(source);
      const dstParent = destination || 'root';

      // keep inline folder stats in sync for both parents
      invalidateFolderStats([oldParent, dstParent]);

      showToast(`Moved folder to "${dstParent || 'root'}".`);

      // Let folderManager handle tree refresh + selection + file list reload
      await syncTreeAfterFolderMove(source, dstParent);

    } catch (e) {
      console.error('Error moving folder:', e);
      showToast('Error moving folder.');
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
  if (dropFolder === sourceFolder) {
    showToast('Source and destination are the same.');
    return;
  }

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
        destination: dropFolder
      })
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data && data.success) {
      const msg =
        names.length === 1
          ? `Moved "${names[0]}" to ${dropFolder}.`
          : `Moved ${names.length} files to ${dropFolder}.`;
      showToast(msg);

      // keep stats fresh for source + dest
      invalidateFolderStats([sourceFolder, dropFolder]);

      loadFileList(window.currentFolder || sourceFolder);
    } else {
      const err = (data && (data.error || data.message)) || `HTTP ${res.status}`;
      showToast('Error moving file(s): ' + err);
    }
  } catch (e) {
    console.error('Error moving file(s):', e);
    showToast('Error moving file(s).');
  }
}