// fileDragDrop.js
import { showToast } from './domUtils.js?v={{APP_QVER}}';
import { loadFileList, cancelHoverPreview } from './fileListView.js?v={{APP_QVER}}';

/* ---------------- helpers ---------------- */
function getRowEl(el) {
  return el?.closest('tr[data-file-name], .gallery-card[data-file-name]') || null;
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
  const wrap = document.createElement('div');
  Object.assign(wrap.style, {
    display: 'inline-flex',
    maxWidth: '420px',
    padding: '6px 10px',
    backgroundColor: '#333',
    color: '#fff',
    border: '1px solid #555',
    borderRadius: '6px',
    alignItems: 'center',
    gap: '6px',
    boxShadow: '2px 2px 6px rgba(0,0,0,0.3)',
    fontSize: '12px',
    pointerEvents: 'none'
  });
  const icon = document.createElement('span');
  icon.className = 'material-icons';
  icon.textContent = iconName;
  const label = document.createElement('span');
  // trim long single-name labels
  const txt = String(labelText || '');
  label.textContent = txt.length > 60 ? (txt.slice(0, 57) + '…') : txt;
  wrap.appendChild(icon);
  wrap.appendChild(label);
  document.body.appendChild(wrap);
  return wrap;
}

/* ---------------- drag start (rows/cards) ---------------- */
export function fileDragStartHandler(event) {
  try { cancelHoverPreview(); } catch {}
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
  setTimeout(() => { try { document.body.removeChild(ghost); } catch { } }, 0);
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

  const dropFolder = event.currentTarget.getAttribute('data-folder')
    || event.currentTarget.getAttribute('data-dest-folder')
    || 'root';

  // parse drag payload
  let dragData = null;
  try {
    const raw = event.dataTransfer.getData('application/json') || '{}';
    dragData = JSON.parse(raw);
  } catch {
    // ignore
  }
  if (!dragData) {
    showToast('Invalid drag data.');
    return;
  }

  // normalize names
  let names = Array.isArray(dragData.files) ? dragData.files.slice()
    : dragData.fileName ? [dragData.fileName]
      : [];
  names = names.filter(v => typeof v === 'string' && v.length > 0);

  if (names.length === 0) {
    showToast('No files to move.');
    return;
  }

  const sourceFolder = dragData.sourceFolder || (window.currentFolder || 'root');
  if (dropFolder === sourceFolder) {
    showToast('Source and destination are the same.');
    return;
  }

  // POST move
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
      const msg = (names.length === 1)
        ? `Moved "${names[0]}" to ${dropFolder}.`
        : `Moved ${names.length} files to ${dropFolder}.`;
      showToast(msg);
      // Refresh whatever view the user is currently looking at
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