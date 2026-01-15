// Folder Access / ACL helpers extracted from adminPanel.js
import { t } from './i18n.js?v={{APP_QVER}}';
import { showToast } from './domUtils.js?v={{APP_QVER}}';
import { sendRequest } from './networkUtils.js?v={{APP_QVER}}';

const tf = (key, fallback) => {
  const v = t(key);
  return (v && v !== key) ? v : fallback;
};

function qs(scope, sel) { return (scope || document).querySelector(sel); }
function qsa(scope, sel) { return Array.from((scope || document).querySelectorAll(sel)); }

let __aclSourcesCache = null;
let __aclSourceId = '';

function getFolderAccessSourceId() {
  const sel = document.getElementById('folderAccessSourceSelect');
  const id = sel && sel.value ? String(sel.value) : '';
  return id || __aclSourceId || '';
}

async function loadFolderAccessSources() {
  if (__aclSourcesCache) return __aclSourcesCache;
  if (typeof window !== 'undefined' && window.__FR_IS_PRO === false) {
    return null;
  }
  try {
    const res = await fetch('/api/pro/sources/list.php', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || data.ok !== true || !data.enabled) return null;
    __aclSourcesCache = data;
    return data;
  } catch (e) {
    return null;
  }
}

function populateFolderAccessSourceSelect(selectEl, sources, activeId) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  sources.forEach(src => {
    if (!src || typeof src !== 'object') return;
    const id = String(src.id || '');
    if (!id) return;
    const name = String(src.name || id);
    const type = String(src.type || '');
    const disabled = src.enabled === false;
    const ro = src.readOnly ? ` (${tf('read_only', 'Read-only')})` : '';
    const dis = disabled ? ' (disabled)' : '';
    const label = type ? `${name} (${type})${ro}${dis}` : `${name}${ro}${dis}`;
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = label;
    selectEl.appendChild(opt);
  });
  if (!selectEl.options.length) return;
  const hasActive = Array.from(selectEl.options).some(opt => opt.value === activeId);
  selectEl.value = hasActive ? activeId : selectEl.options[0].value;
}

async function initFolderAccessSourceSelector() {
  const row = document.getElementById('folderAccessSourceRow');
  const selectEl = document.getElementById('folderAccessSourceSelect');
  if (!row || !selectEl) return;

  const data = await loadFolderAccessSources();
  if (!data || !Array.isArray(data.sources) || data.sources.length <= 1) {
    row.style.display = 'none';
    __aclSourceId = (data && data.activeId) ? String(data.activeId) : '';
    return;
  }

  row.style.display = '';
  populateFolderAccessSourceSelect(selectEl, data.sources, data.activeId || '');
  __aclSourceId = selectEl.value || '';

  if (!selectEl.__wired) {
    selectEl.__wired = true;
    selectEl.addEventListener('change', () => {
      __aclSourceId = selectEl.value || '';
      __allFoldersCache = new Map();
      loadUserPermissionsList();
    });
  }
}

function escapeFolderSelectorValue(folder) {
  const value = String(folder ?? '');
  if (window.CSS && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

function enforceShareFolderRule(row) {
  const manage = qs(row, 'input[data-cap="manage"]');
  const viewAll = qs(row, 'input[data-cap="view"]');
  const shareFolder = qs(row, 'input[data-cap="shareFolder"]');
  if (!shareFolder) return;
  const ok = !!(manage && manage.checked) && !!(viewAll && viewAll.checked);
  if (!ok) {
    shareFolder.checked = false;
    shareFolder.disabled = true;
    shareFolder.setAttribute('data-disabled-reason', 'Requires Manage + View (all)');
  } else {
    shareFolder.disabled = false;
    shareFolder.removeAttribute('data-disabled-reason');
  }
}

function onShareFileToggle(row, checked) {
  if (!checked) return;
  const viewAll = qs(row, 'input[data-cap="view"]');
  const viewOwn = qs(row, 'input[data-cap="viewOwn"]');
  const hasView = !!(viewAll && viewAll.checked);
  const hasOwn = !!(viewOwn && viewOwn.checked);
  if (!hasView && !hasOwn && viewOwn) {
    viewOwn.checked = true;
  }
}

function onShareFolderToggle(row, checked) {
  if (checked) {
    const manage = qs(row, 'input[data-cap="manage"]');
    const viewAll = qs(row, 'input[data-cap="view"]');
    const viewOwn = qs(row, 'input[data-cap="viewOwn"]');
    if (!viewAll && viewOwn && !viewOwn.checked) {
      viewOwn.checked = true;
    }
    if (manage && !manage.checked) {
      manage.checked = true;
    }
    if (viewAll && !viewAll.checked) {
      viewAll.checked = true;
    }
  }
}

function onWriteToggle(row, checked) {
  const caps = ["create", "upload", "edit", "rename", "copy", "delete", "extract"];
  caps.forEach(c => {
    const box = qs(row, `input[data-cap="${c}"]`);
    if (box) box.checked = checked;
  });
}

async function safeJson(res) {
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (e) { /* ignore */ }
  if (!res.ok) {
    const msg =
      (body && (body.error || body.message)) ||
      (text && text.trim()) ||
      `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return body ?? {};
}

function isAdminUser(u) {
  if (!u) return false;
  const username = String(u.username || u.user || '').trim().toLowerCase();
  const role = u.role ?? u.isAdmin ?? u.admin ?? u.is_admin ?? u.isAdminUser;
  const roleStr = String(role || '').trim().toLowerCase();
  return (
    username === 'admin' ||
    role === true ||
    role === 1 ||
    roleStr === '1' ||
    roleStr === 'true' ||
    roleStr === 'admin' ||
    roleStr === 'superuser'
  );
}

function buildFullGrantsForAllFolders(folders) {
  const allTrue = {
    view: true, viewOwn: false, manage: true, create: true, upload: true, edit: true,
    rename: true, copy: true, move: true, delete: true, extract: true,
    shareFile: true, shareFolder: true, share: true
  };
  return folders.reduce((acc, f) => { acc[f] = { ...allTrue }; return acc; }, {});
}

let __allFoldersCache = new Map();

async function getAllFolders(force = false, sourceId = "") {
  const key = sourceId || getFolderAccessSourceId() || '';
  if (!force && __allFoldersCache.has(key)) return __allFoldersCache.get(key).slice();

  const url = '/api/folder/getFolderList.php?counts=0&ts=' + Date.now()
    + (key ? `&sourceId=${encodeURIComponent(key)}` : '');
  const res = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-store' }
  });
  const data = await safeJson(res).catch(() => []);
  const list = Array.isArray(data)
    ? data.map(x => (typeof x === 'string' ? x : x.folder)).filter(Boolean)
    : [];

  const hidden = new Set(['profile_pics', 'trash']);
  const cleaned = list
    .filter(f => f && !hidden.has(f.toLowerCase()))
    .sort((a, b) => (a === 'root' ? -1 : b === 'root' ? 1 : a.localeCompare(b)));

  __allFoldersCache.set(key, cleaned);
  return cleaned.slice();
}

async function getUserGrants(username, sourceId = "") {
  const key = sourceId || getFolderAccessSourceId() || '';
  const url = `/api/admin/acl/getGrants.php?user=${encodeURIComponent(username)}`
    + (key ? `&sourceId=${encodeURIComponent(key)}` : '');
  const res = await fetch(url, {
    credentials: 'include'
  });
  const data = await safeJson(res).catch(() => ({}));
  const grants = (data && data.grants) ? data.grants : {};
  return (grants && typeof grants === 'object' && !Array.isArray(grants)) ? grants : {};
}

function renderFolderGrantsUI(principal, container, folders, grants) {
  if (!Array.isArray(folders) || !container) return;

  const grantsMap = (grants && typeof grants === 'object' && !Array.isArray(grants)) ? grants : {};

  // Preserve original grants map for save, including entries we may not render
  container.__grantsFallback = grantsMap;

  const isAdmin =
    principal === "admin" ||
    String(principal).toLowerCase() === "admin" ||
    (grantsMap && grantsMap.__isAdmin);

  const toolbar = document.createElement('div');
  toolbar.className = 'folder-access-toolbar';
  toolbar.innerHTML = `
    <strong>${t("folder_access")}</strong>
    <input type="text" class="form-control form-control-sm" placeholder="${t("filter_folders")}" style="max-width:220px;">
    <div class="form-check form-check-inline">
      <label class="form-check-label">
        <input type="checkbox" class="form-check-input" data-bulk="view" ${isAdmin ? 'disabled data-hard-disabled="1"' : ''}>
        ${t("view_all")}
      </label>
    </div>
    <div class="form-check form-check-inline">
      <label class="form-check-label">
        <input type="checkbox" class="form-check-input" data-bulk="viewOwn" ${isAdmin ? 'disabled data-hard-disabled="1"' : ''}>
        ${t("view_own")}
      </label>
    </div>
    <div class="form-check form-check-inline">
      <label class="form-check-label">
        <input type="checkbox" class="form-check-input" data-bulk="write" ${isAdmin ? 'disabled data-hard-disabled="1"' : ''}>
        ${t("write")}
      </label>
    </div>
    <div class="form-check form-check-inline">
      <label class="form-check-label">
        <input type="checkbox" class="form-check-input" data-bulk="share" ${isAdmin ? 'disabled data-hard-disabled="1"' : ''}>
        ${t("share")}
      </label>
    </div>
    <div class="form-check form-check-inline">
      <label class="form-check-label">
        <input type="checkbox" class="form-check-input" data-bulk="manage" ${isAdmin ? 'disabled data-hard-disabled="1"' : ''}>
        ${t("manage")}
      </label>
    </div>
  `;

  const list = document.createElement('div');
  list.className = 'folder-access-list';

  const headerHtml = `
    <div class="folder-access-header row text-muted" style="font-size:12px; font-weight:600; margin-bottom:4px; display:none;">
      <div class="col-sm-3">${t("folder")}</div>
      <div class="col-sm-9">${t("permissions")}</div>
    </div>
  `;

  container.innerHTML = '';
  container.appendChild(toolbar);
  container.appendChild(list);

  const rowHtml = (folder, idx) => {
    const g = grantsMap[folder] ? { ...grantsMap[folder] } : {};
    const inheritChecked = g.__inherit === true || g.inherit === true;
    const explicitFlag =
      g.__explicit === true ||
      g.explicit === true ||
      (g.explicit && typeof g.explicit === 'object');
    const hasExplicit = explicitFlag || !!(
      g.view || g.viewOwn || g.manage || g.create || g.upload || g.edit || g.rename ||
      g.copy || g.move || g.delete || g.extract || g.shareFile || g.shareFolder || g.share || g.write
    );
    const writeMetaChecked = !!(
      g.write ||
      g.create ||
      g.upload ||
      g.edit ||
      g.rename ||
      g.copy ||
      g.delete ||
      g.extract
    );

    if (g.share) {
      g.shareFile = g.shareFile !== false;
      g.shareFolder = g.shareFolder !== false;
    }

    const name = folder === "root" ? `${t("root_folder")} /` : folder;
    const shareFolderDisabled = isAdmin ? true : undefined;

    const toggle = (cap, label, checked, disabled, title = "") => `
      <label class="form-check fr-toggle perm-toggle" title="${title.replace(/"/g, '&quot;')}">
        <input type="checkbox" class="fr-toggle-input" data-cap="${cap}"
               ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} aria-label="${label}">
        <span>${label}</span>
      </label>
    `;

    const group = (title, content, bodyClass = '', groupClass = '') => `
      <div class="perm-group${groupClass ? ` ${groupClass}` : ''}">
        <div class="perm-group-title">${title}</div>
        <div class="perm-group-body${bodyClass ? ` ${bodyClass}` : ''}">${content}</div>
      </div>
    `;

    const parity = (idx % 2 === 0) ? 'row-even' : 'row-odd';

    return `
      <div class="folder-access-row ${parity}" data-folder="${folder}" data-inherit="${inheritChecked ? '1' : '0'}" data-explicit="${hasExplicit ? '1' : '0'}" data-admin="${isAdmin ? '1' : '0'}">
        <div class="folder-cell">
      <div class="folder-badge">
        <i class="material-icons" style="font-size:18px;">folder</i>
        <span class="folder-name-text">${name}</span>
        <span class="inherited-tag" style="display:none;"></span>
        <span class="inherit-flag-note pill-note" style="display:none;"></span>
        <span class="group-flag-note pill-note" style="display:none;"></span>
        <label class="form-check fr-toggle perm-toggle inherit-inline">
          <input type="checkbox"
                 class="fr-toggle-input"
                 data-inherit="1"
                 ${inheritChecked ? 'checked' : ''}
                 ${isAdmin ? 'disabled' : ''}>
          <span>${tf('inherit_to_subfolders', 'Inherit to subfolders')}</span>
        </label>
      </div>
    </div>
    <div class="perm-grid">
      ${group(
        tf('view_all', 'View'),
        `
              ${toggle('view', tf('view_all', 'View (all)'), g.view, false, tf('view_all_help', 'See all contents in this folder (all owners). Required for folder share; Manage/Ownership implies this.'))}
              ${toggle('viewOwn', tf('view_own', 'View (own)'), g.viewOwn, false, tf('view_own_help', 'See only files you uploaded in this folder. Disabled when View (all) is on.'))}
            `
          )}
          ${group(
            tf('create', 'Create'),
            `
              ${toggle('create', tf('create', 'Create File'), g.create, false, tf('create_help', 'Create an empty file in this folder (not subfolders). Subfolders require Manage/Ownership.'))}
              ${toggle('upload', tf('upload', 'Upload File'), g.upload, false, tf('upload_help', 'Upload a file into this folder'))}
            `
          )}
          ${group(
            tf('write_full', 'Write/Modify'),
            `
              ${toggle('write', tf('write_full', 'Write (file ops)'), writeMetaChecked, false, tf('write_help', 'File-level: upload, edit, rename, copy, delete, extract archives (no folder creation).'))}
              ${toggle('edit', tf('edit', 'Edit File'), g.edit, false, tf('edit_help', 'Edit file contents'))}
              ${toggle('extract', tf('extract', 'Extract Archive'), g.extract, false, tf('extract_help', 'Extract archive files'))}
              ${toggle('rename', tf('rename', 'Rename File'), g.rename, false, tf('rename_help', 'Rename a file'))}
              ${toggle('copy', tf('copy', 'Copy File'), g.copy, false, tf('copy_help', 'Copy a file'))}
            `,
            'perm-write-grid',
            'perm-group-wide'
          )}
          ${group(
            tf('share', 'Share'),
            `
              ${toggle('shareFile', tf('share_file', 'Share File'), g.shareFile, false, tf('share_file_help', 'Create share links for files (requires View own/all; auto-enables View (own)).'))}
              ${toggle('shareFolder', tf('share_folder', 'Share Folder'), g.shareFolder, shareFolderDisabled, tf('share_folder_help', 'Create share links for folders (requires Manage + View (all); Manage implies View (all)).'))}
            `
          )}
          ${group(
            tf('manage', 'Admin / Delete'),
            `
              ${toggle('manage', tf('manage', 'Manage'), g.manage, false, tf('manage_help', 'Folder owner/manager: can create subfolders, rename/move folders, and grant access; implies View (all), Write, and Share.'))}
              ${toggle('delete', tf('delete', 'Delete File'), g.delete, false, tf('delete_help', 'Delete a file'))}
            `,
            'perm-stack'
          )}
        </div>
      </div>
    `;
  };

  function setRowDisabled(row, disabled) {
    if (row.dataset.admin === '1') return; // admin rows stay locked
    qsa(row, 'input[type="checkbox"]').forEach(cb => {
      cb.disabled = disabled || cb.hasAttribute('data-hard-disabled');
    });
    row.classList.toggle('inherited-row', !!disabled);
    const tag = row.querySelector('.inherited-tag');
    if (tag) tag.style.display = disabled ? 'inline-block' : 'none';
  }

  function resetRowIfInheritedOnly(row) {
    if (row.dataset.admin === '1') return;
    if (row.dataset.explicit === '1') return;
    qsa(row, 'input[type="checkbox"]').forEach(cb => {
      if (cb.hasAttribute('data-inherit')) return;
      if (cb.hasAttribute('data-group-lock')) return;
      if (cb.hasAttribute('data-hard-disabled')) return;
      cb.checked = false;
      if (cb.dataset.cap === 'viewOwn') {
        cb.disabled = false;
        cb.removeAttribute('title');
      }
    });
  }

  function refreshInheritance() {
    const rows = qsa(list, '.folder-access-row').sort((a, b) => (a.dataset.folder || '').length - (b.dataset.folder || '').length);
    const managedPrefixes = new Set();
    const inheritPrefixes = new Set();
    const safeFolderSelector = (folder) => {
      return `.folder-access-row[data-folder="${escapeFolderSelectorValue(folder)}"]`;
    };
    rows.forEach(row => {
      if (row.dataset.admin === '1') {
        row.classList.add('admin-locked-row');
        qsa(row, 'input[type="checkbox"]').forEach(cb => cb.disabled = true);
        const note = row.querySelector('.inherit-flag-note');
        if (note) {
          note.style.display = 'inline-flex';
          note.textContent = tf('admin_full_access', 'Admin: full access (not editable)');
          note.classList.add('pill-note-strong');
        }
        return;
      }
      resetRowIfInheritedOnly(row);
      const folder = row.dataset.folder || "";
      const hasExplicit = row.dataset.explicit === '1';
      const manage = qs(row, 'input[data-cap="manage"]');
      if (manage && manage.checked) managedPrefixes.add(folder);
      if (row.dataset.inherit === '1') inheritPrefixes.add(folder);
      let inheritedFrom = null;
      for (const p of managedPrefixes) {
        if (p && folder !== p && folder.startsWith(p + '/')) { inheritedFrom = p; break; }
      }
      if (inheritedFrom && !hasExplicit) {
        const v = qs(row, 'input[data-cap="view"]');
        const w = qs(row, 'input[data-cap="write"]');
        const vo = qs(row, 'input[data-cap="viewOwn"]');
        if (v) v.checked = true;
        if (w) w.checked = true;
        ['create', 'upload', 'edit', 'rename', 'copy', 'delete', 'extract', 'shareFile', 'shareFolder']
          .forEach(c => { const cb = qs(row, `input[data-cap="${c}"]`); if (cb) cb.checked = true; });
        const tag = row.querySelector('.inherited-tag');
        if (tag) tag.textContent = `(${tf('inherited', 'inherited')} ${tf('from', 'from')} ${inheritedFrom})`;
      } else {
        setRowDisabled(row, false);
      }
      // Show “inherit flag” hint when an ancestor has inherit enabled
      let inheritFrom = null;
      for (const p of inheritPrefixes) {
        if (p && folder !== p && folder.startsWith(p + '/')) { inheritFrom = p; break; }
      }
      if (inheritFrom && !hasExplicit) {
        const parentRow = list.querySelector(safeFolderSelector(inheritFrom));
        if (parentRow) {
          ['view','viewOwn','manage','create','upload','edit','rename','copy','move','delete','extract','shareFile','shareFolder','write','share'].forEach(cap => {
            const src = parentRow.querySelector(`input[data-cap="${cap}"]`);
            const dest = row.querySelector(`input[data-cap="${cap}"]`);
            if (src && dest) {
              dest.checked = src.checked;
            }
          });
        }
      }
      const inheritNote = row.querySelector('.inherit-flag-note');
      if (inheritNote) {
        if (inheritFrom && !row.classList.contains('inherited-row')) {
          inheritNote.style.display = 'inline-flex';
          inheritNote.textContent = `(${tf('inherit_to_subfolders', 'Inherit to subfolders')}: ${inheritFrom})`;
        } else {
          inheritNote.style.display = 'none';
          inheritNote.textContent = '';
        }
      }
      enforceShareFolderRule(row);
      const cbView = qs(row, 'input[data-cap="view"]');
      const cbViewOwn = qs(row, 'input[data-cap="viewOwn"]');
      if (cbView && cbViewOwn) {
        if (cbView.checked) {
          cbViewOwn.checked = false;
          cbViewOwn.disabled = true;
          cbViewOwn.title = tf('full_view_supersedes_own', 'Full view supersedes own-only');
        } else {
          cbViewOwn.disabled = false;
          cbViewOwn.removeAttribute('title');
        }
      }
    });
  }

  function setFromViewChange(row, which, checked) {
    if (!checked && (which === 'view' || which === 'viewOwn')) {
      qsa(row, 'input[type="checkbox"]').forEach(cb => cb.checked = false);
    }
    const cbView = qs(row, 'input[data-cap="view"]');
    const cbVO = qs(row, 'input[data-cap="viewOwn"]');
    if (cbView && cbVO) {
      if (cbView.checked) {
        cbVO.checked = false;
        cbVO.disabled = true;
        cbVO.title = tf('full_view_supersedes_own', 'Full view supersedes own-only');
      } else {
        cbVO.disabled = false;
        cbVO.removeAttribute('title');
      }
    }
    enforceShareFolderRule(row);
  }

  function wireRow(row) {
    const isAdminRow = row.dataset.admin === '1';
    const cbView = row.querySelector('input[data-cap="view"]');
    const cbViewOwn = row.querySelector('input[data-cap="viewOwn"]');
    const cbWrite = row.querySelector('input[data-cap="write"]');
    const cbManage = row.querySelector('input[data-cap="manage"]');
    const cbCreate = row.querySelector('input[data-cap="create"]');
    const cbUpload = row.querySelector('input[data-cap="upload"]');
    const cbEdit = row.querySelector('input[data-cap="edit"]');
    const cbRename = row.querySelector('input[data-cap="rename"]');
    const cbCopy = row.querySelector('input[data-cap="copy"]');
    const cbMove = row.querySelector('input[data-cap="move"]');
    const cbDelete = row.querySelector('input[data-cap="delete"]');
    const cbExtract = row.querySelector('input[data-cap="extract"]');
    const cbShareF = row.querySelector('input[data-cap="shareFile"]');
    const cbShareFo = row.querySelector('input[data-cap="shareFolder"]');
    const cbInherit = row.querySelector('input[data-inherit]');
    const markExplicit = () => { row.dataset.explicit = '1'; };
    if (isAdminRow) {
      qsa(row, 'input[type="checkbox"]').forEach(cb => cb.disabled = true);
      const note = row.querySelector('.inherit-flag-note');
      if (note) {
        note.style.display = 'inline-flex';
        note.textContent = tf('admin_full_access', 'Admin: full access (not editable)');
        note.classList.add('pill-note-strong');
      }
      row.classList.add('admin-locked-row');
      return;
    }

    const granular = [cbCreate, cbUpload, cbEdit, cbRename, cbCopy, cbMove, cbDelete, cbExtract];

    const applyManage = () => {
      if (cbManage && cbManage.checked) {
        if (cbView) cbView.checked = true;
        if (cbWrite) cbWrite.checked = true;
        granular.forEach(cb => { if (cb) cb.checked = true; });
        if (cbShareF) cbShareF.checked = true;
        if (cbShareFo && !cbShareFo.disabled) cbShareFo.checked = true;
      }
    };

    const syncWriteFromGranular = () => {
      if (!cbWrite) return;
      cbWrite.checked = granular.some(cb => cb && cb.checked);
    };
    const applyWrite = () => {
      if (!cbWrite) return;
      granular.forEach(cb => { if (cb) cb.checked = cbWrite.checked; });
      const any = granular.some(cb => cb && cb.checked);
      if (any && cbView && !cbView.checked && cbViewOwn && !cbViewOwn.checked) cbViewOwn.checked = true;
    };

    const onShareFile = () => {
      if (cbShareF && cbShareF.checked && cbView && !cbView.checked && cbViewOwn && !cbViewOwn.checked) {
        cbViewOwn.checked = true;
      }
    };

    const cascadeManage = (checked) => {
      const base = row.dataset.folder || "";
      if (!base) return;
      qsa(container, '.folder-access-row').forEach(r => {
        const f = r.dataset.folder || "";
        if (!f || f === base) return;
        if (!f.startsWith(base + '/')) return;
        const m = r.querySelector('input[data-cap="manage"]');
        const v = r.querySelector('input[data-cap="view"]');
        const w = r.querySelector('input[data-cap="write"]');
        const vo = r.querySelector('input[data-cap="viewOwn"]');
        const boxes = [
          'create', 'upload', 'edit', 'rename', 'copy', 'delete', 'extract', 'shareFile', 'shareFolder'
        ].map(c => r.querySelector(`input[data-cap="${c}"]`));
        if (m) m.checked = checked;
        if (v) v.checked = checked;
        if (w) w.checked = checked;
        if (vo) { vo.checked = false; vo.disabled = checked; }
        boxes.forEach(b => { if (b) b.checked = checked; });
        enforceShareFolderRule(r);
        if (checked) {
          r.dataset.explicit = '1';
        }
      });
      refreshInheritance();
    };

    if (cbManage) cbManage.addEventListener('change', () => { applyManage(); onShareFile(); cascadeManage(cbManage.checked); markExplicit(); });
    if (cbWrite) cbWrite.addEventListener('change', () => { applyWrite(); markExplicit(); refreshInheritance(); });
    granular.forEach(cb => { if (cb) cb.addEventListener('change', () => { syncWriteFromGranular(); markExplicit(); refreshInheritance(); }); });
    if (cbView) cbView.addEventListener('change', () => { setFromViewChange(row, 'view', cbView.checked); markExplicit(); refreshInheritance(); });
    if (cbViewOwn) cbViewOwn.addEventListener('change', () => { setFromViewChange(row, 'viewOwn', cbViewOwn.checked); markExplicit(); refreshInheritance(); });
    if (cbShareF) cbShareF.addEventListener('change', () => { onShareFile(); markExplicit(); refreshInheritance(); });
    if (cbShareFo) cbShareFo.addEventListener('change', () => { onShareFolderToggle(row, cbShareFo.checked); markExplicit(); refreshInheritance(); });
    if (cbInherit) {
      cbInherit.addEventListener('change', () => {
        row.dataset.inherit = cbInherit.checked ? '1' : '0';
        markExplicit();
        refreshInheritance();
      });
    }

    const markActive = () => {
      qsa(list, '.folder-access-row.is-active').forEach(r => r.classList.remove('is-active'));
      row.classList.add('is-active');
    };
    row.addEventListener('click', markActive);
    row.addEventListener('focusin', markActive);

    applyManage();
    enforceShareFolderRule(row);
    syncWriteFromGranular();
  }

  const filteredFolders = () => {
    const f = (filterInput.value || "").trim().toLowerCase();
    return folders.filter(x => !f || x.toLowerCase().includes(f));
  };

  const PAGE_SIZE = 150;
  let renderIndex = 0;
  let currentFiltered = [];
  const loadMoreBtn = document.createElement('button');
  loadMoreBtn.type = 'button';
  loadMoreBtn.className = 'btn btn-sm btn-outline-secondary';
  loadMoreBtn.style.margin = '8px auto';
  loadMoreBtn.textContent = tf('load_more_folders', 'Load more folders');
  loadMoreBtn.addEventListener('click', () => appendChunk());

  function appendChunk() {
    const slice = currentFiltered.slice(renderIndex, renderIndex + PAGE_SIZE);
    if (!slice.length) return;
    const html = slice.map((folder, idx) => rowHtml(folder, renderIndex + idx)).join("");
    list.insertAdjacentHTML('beforeend', html);
    list.querySelectorAll('.folder-access-row').forEach(wireRow);
    renderIndex += slice.length;
    updateLoadMoreVisibility();
    refreshInheritance();
  }

  function updateLoadMoreVisibility() {
    const remaining = currentFiltered.length - renderIndex;
    if (remaining > 0) {
      if (!loadMoreBtn.isConnected) list.appendChild(loadMoreBtn);
      loadMoreBtn.textContent = tf('load_more_folders', 'Load more folders') + ` (${remaining})`;
    } else if (loadMoreBtn.isConnected) {
      loadMoreBtn.remove();
    }
  }

  function render(filter = "") {
    renderIndex = 0;
    currentFiltered = filteredFolders();
    list.innerHTML = headerHtml;
    appendChunk();
  }

  const filterInput = toolbar.querySelector('input[type="text"]');
  filterInput.addEventListener('input', () => render(filterInput.value));
  render();

  toolbar.querySelectorAll('input[type="checkbox"][data-bulk]').forEach(bulk => {
    bulk.addEventListener('change', () => {
      const which = bulk.dataset.bulk;
      const f = (filterInput.value || "").trim().toLowerCase();

      list.querySelectorAll('.folder-access-row').forEach(row => {
        const folder = row.dataset.folder || "";
        if (f && !folder.toLowerCase().includes(f)) return;

        const target = row.querySelector(`input[data-cap="${which}"]`);
        if (!target) return;

        target.checked = bulk.checked;

        if (which === 'manage') {
          target.dispatchEvent(new Event('change'));
        } else if (which === 'share') {
          if (bulk.checked) {
            const v = row.querySelector('input[data-cap="view"]');
            if (v) v.checked = true;
          }
        } else if (which === 'write') {
          onWriteToggle(row, bulk.checked);
        } else if (which === 'view' || which === 'viewOwn') {
          setFromViewChange(row, which, bulk.checked);
        }

        enforceShareFolderRule(row);
        row.dataset.explicit = '1';
      });
      refreshInheritance();
    });
  });
}

function collectGrantsFrom(container, fallback = {}) {
  const base = (fallback && typeof fallback === 'object' && !Array.isArray(fallback)) ? fallback : {};
  const out = JSON.parse(JSON.stringify(base));
  const get = (row, sel) => {
    const el = row.querySelector(sel);
    return el ? !!el.checked : false;
  };
  container.querySelectorAll('.folder-access-row').forEach(row => {
    const folder = row.dataset.folder || row.getAttribute('data-folder');
    if (!folder) return;
    const g = {
      view: get(row, 'input[data-cap="view"]'),
      viewOwn: get(row, 'input[data-cap="viewOwn"]'),
      manage: get(row, 'input[data-cap="manage"]'),
      create: get(row, 'input[data-cap="create"]'),
      upload: get(row, 'input[data-cap="upload"]'),
      edit: get(row, 'input[data-cap="edit"]'),
      rename: get(row, 'input[data-cap="rename"]'),
      copy: get(row, 'input[data-cap="copy"]'),
      move: get(row, 'input[data-cap="move"]'),
      delete: get(row, 'input[data-cap="delete"]'),
      extract: get(row, 'input[data-cap="extract"]'),
      shareFile: get(row, 'input[data-cap="shareFile"]'),
      shareFolder: get(row, 'input[data-cap="shareFolder"]'),
      inherit: (row.dataset.inherit || '') === '1',
      explicit: (row.dataset.explicit || '') === '1'
    };
    g.share = !!(g.shareFile || g.shareFolder);
    out[folder] = g;
  });
  return out;
}

export async function fetchAllUsers() {
  const r = await fetch("/api/getUsers.php", { credentials: "include" });
  return await r.json();
}

async function fetchAllGroups() {
  if (window.__FR_IS_PRO !== true) return {};
  const res = await fetch('/api/pro/groups/list.php', {
    credentials: 'include',
    headers: { 'X-CSRF-Token': window.csrfToken || '' }
  });
  const data = await safeJson(res);
  return data && typeof data === 'object' && data.groups && typeof data.groups === 'object'
    ? data.groups
    : {};
}

async function saveAllGroups(groups) {
  const res = await fetch('/api/pro/groups/save.php', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': window.csrfToken || ''
    },
    body: JSON.stringify({ groups })
  });
  return await safeJson(res);
}

let __groupsCache = {};

function computeGroupGrantMaskForUser(username, folders = []) {
  const mask = {};
  if (!username || !__groupsCache) return mask;
  const uname = String(username).toLowerCase();

  const userGroups = Object.keys(__groupsCache || {}).map(groupName => {
    const g = __groupsCache[groupName] || {};
    const members = Array.isArray(g.members) ? g.members : [];
    const inGroup = members.some(m => String(m || "").toLowerCase() === uname);
    if (!inGroup) return null;
    return { name: groupName, grants: g.grants || {} };
  }).filter(Boolean);

  if (!userGroups.length) return mask;

  const folderList = Array.isArray(folders) && folders.length
    ? folders.slice()
    : Array.from(new Set(
      userGroups.flatMap(g => Object.keys(g.grants || {}))
    ));

  const hasExplicit = (grants = {}) => {
    if (grants.__explicit || grants.explicit) return true;
    const caps = [
      'view', 'viewOwn', 'manage', 'create', 'upload', 'edit', 'rename',
      'copy', 'move', 'delete', 'extract', 'shareFile', 'shareFolder',
      'write', 'share', 'share_file', 'share_folder', 'owners', 'read', 'read_own'
    ];
    return caps.some(k => !!grants[k]);
  };

  const expandCaps = (grants = {}) => {
    const caps = {};
    const shareFile = !!(grants.shareFile || grants.share_file || grants.share);
    const shareFolder = !!(grants.shareFolder || grants.share_folder || grants.share);
    const writeMeta = !!grants.write;

    [
      'view', 'viewOwn', 'manage', 'create', 'upload', 'edit',
      'rename', 'copy', 'move', 'delete', 'extract'
    ].forEach(k => { if (grants[k]) caps[k] = true; });

    if (shareFile) caps.shareFile = true;
    if (shareFolder) caps.shareFolder = true;
    if (writeMeta) caps.write = true;
    if (grants.share) caps.share = true;
    if (grants.owners) caps.owners = true;
    if (grants.read) caps.read = true;
    if (grants.read_own) caps.read_own = true;

    return caps;
  };

  const ancestors = (folder) => {
    if (!folder || folder === 'root') return [];
    const parts = folder.split('/').filter(Boolean);
    const out = [];
    while (parts.length) {
      parts.pop();
      if (!parts.length) {
        out.push('root');
      } else {
        out.push(parts.join('/'));
      }
    }
    return out;
  };

  userGroups.forEach(g => {
    folderList.forEach(folder => {
      const direct = g.grants[folder] || null;
      const caps = expandCaps(direct || {});
      if (Object.keys(caps).length) {
        if (!mask[folder]) mask[folder] = {};
        Object.assign(mask[folder], caps);
      }

      const explicit = direct && hasExplicit(direct);
      if (explicit) return;

      const ancList = ancestors(folder);
      for (const anc of ancList) {
        const ancGrant = g.grants[anc];
        if (!ancGrant || typeof ancGrant !== 'object') continue;
        const inheritFlag = !!(ancGrant.__inherit || ancGrant.inherit);
        if (!inheritFlag) continue;
        const inheritedCaps = expandCaps(ancGrant);
        if (!Object.keys(inheritedCaps).length) continue;
        if (!mask[folder]) mask[folder] = {};
        Object.assign(mask[folder], inheritedCaps);
        break;
      }
    });
  });

  return mask;
}

function applyGroupLocksForUser(username, grantsBox, groupMask, groupsForUser = []) {
  if (!grantsBox || !groupMask) return;

  const groupLabel = groupsForUser.length
    ? `${tf("granted_via_groups", "Granted via groups")}: ${groupsForUser.join(", ")}`
    : tf("granted_via_groups", "Granted via groups");

  const safeSelect = (folder) => {
    return `.folder-access-row[data-folder="${escapeFolderSelectorValue(folder)}"]`;
  };

  Object.keys(groupMask).forEach(folder => {
    const row = grantsBox.querySelector(safeSelect(folder));
    const caps = groupMask[folder] || {};
    if (!row) return;

    const groupNote = row.querySelector('.group-flag-note');
    if (groupNote) {
      groupNote.style.display = 'inline-flex';
      groupNote.classList.add('pill-note-strong');
      groupNote.textContent = tf('granted_via_groups', 'Granted via groups');
      if (groupsForUser.length) {
        groupNote.textContent += `: ${groupsForUser.join(', ')}`;
      }
    }

    Object.keys(caps).forEach(cap => {
      if (!caps[cap]) return;
      const input = row.querySelector(`input[data-cap="${cap}"]`);
      if (!input) return;
      input.checked = true;
      input.disabled = true;
      input.setAttribute("data-group-lock", "1");
      input.title = groupLabel;

      const permGroup = input.closest(".perm-group");
      if (permGroup) {
        permGroup.classList.add("group-locked");
      }
    });

    // Keep the synthetic Write meta toggle aligned with locked granular caps
    const lockedGranular = ['create','upload','edit','rename','copy','delete','extract']
      .some(cap => caps[cap]);
    const writeInput = row.querySelector('input[data-cap="write"]');
    if (writeInput && lockedGranular) {
      writeInput.checked = true;
      writeInput.disabled = true;
      writeInput.setAttribute("data-group-lock", "1");
      writeInput.title = groupLabel;
    }
  });
}

export async function populateAdminUserHubSelect(selectEl, onMetaUpdate) {
  if (!selectEl) return;

  selectEl.innerHTML = `<option value="">${tf("loading", "Loading…")}</option>`;

  try {
    const usersRaw = await fetchAllUsers();
    const list = Array.isArray(usersRaw)
      ? usersRaw
      : (usersRaw && Array.isArray(usersRaw.users) ? usersRaw.users : []);

    const current = (localStorage.getItem("username") || "").trim();

    selectEl.innerHTML = "";
    const normalized = list
      .map(u => {
        if (typeof u === "string") return { username: u, isAdmin: false };
        return {
          username: u.username || u.user || "",
          isAdmin: isAdminUser(u)
        };
      })
      .filter(u => u.username);

    if (typeof onMetaUpdate === 'function') {
      onMetaUpdate(normalized);
    }

    normalized.forEach(u => {
      const opt = document.createElement("option");
      opt.value = u.username;
      opt.textContent = u.isAdmin ? `${u.username} (admin)` : u.username;
      if (current && u.username === current) {
        opt.dataset.currentUser = "1";
      }
      selectEl.appendChild(opt);
    });

    if (!selectEl.value && selectEl.options.length > 0) {
      selectEl.selectedIndex = 0;
    }
  } catch (e) {
    console.error("populateAdminUserHubSelect error", e);
    selectEl.innerHTML = `<option value="">${tf("error_loading_users", "Error loading users")}</option>`;
  }
}

export function openUserPermissionsModal(initialUser = null) {
  let userPermissionsModal = document.getElementById("userPermissionsModal");
  const isDarkMode = document.body.classList.contains("dark-mode");
  const overlayBackground = isDarkMode ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.3)";
  const modalContentStyles = `
  background: ${isDarkMode ? "#2c2c2c" : "#fff"};
  color: ${isDarkMode ? "#e0e0e0" : "#000"};
  padding: 20px;
  width: clamp(980px, 92vw, 1280px);
  max-width: none;
  position: relative;
  max-height: 90vh;
  overflow: auto;
`;

  if (!userPermissionsModal) {
    userPermissionsModal = document.createElement("div");
    userPermissionsModal.id = "userPermissionsModal";
    userPermissionsModal.style.cssText = `
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background-color: ${overlayBackground};
      display: flex; justify-content: center; align-items: center;
      z-index: 10000;
    `;
    userPermissionsModal.innerHTML = `
      <div class="modal-content" style="${modalContentStyles}">
        <span id="closeUserPermissionsModal" class="editor-close-btn">&times;</span>
        <h3>${tf("folder_access", "Folder Access")}</h3>
        <div class="modal-source-row" id="folderAccessSourceRow" style="display:none;">
          <label for="folderAccessSourceSelect">${tf("storage_source", "Source")}</label>
          <select id="folderAccessSourceSelect" class="form-control form-control-sm"></select>
        </div>
        <div class="muted" style="margin:-4px 0 10px;">
          <span class="grant-help-short">${tf("grant_folders_help_short", "Per-folder access. Create is file-only; subfolders need Manage/Ownership. Share Folder needs Manage + View (all).")}</span>
          <button type="button" class="btn btn-link btn-sm p-0 grant-help-toggle" aria-expanded="false" style="margin-left:6px;">
            ${tf("help_more", "More")}
          </button>
          <span class="grant-help-full" style="display:none;">
            ${tf("grant_folders_help", "Grant per-folder capabilities to each user. View (all) shows all contents; View (own) shows only the user's uploads. Write is file-level ops (upload/edit/rename/copy/delete/extract). Create is file-only; subfolders require Manage/Ownership. Manage/Ownership enables folder actions (create/rename/move/delete, grant access) and implies View (all), Write, and Share. Share File auto-enables View (own); Share Folder requires Manage/Ownership + View (all).")}
          </span>
        </div>
        <div id="userPermissionsList" style="max-height: 82vh; min-height: 420px; overflow-y: auto; margin-bottom: 15px;">
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" id="cancelUserPermissionsBtn" class="btn btn-secondary">${t("cancel")}</button>
          <button type="button" id="saveUserPermissionsBtn" class="btn btn-primary">${t("save_permissions")}</button>
        </div>
      </div>
    `;
    document.body.appendChild(userPermissionsModal);
    document.getElementById("closeUserPermissionsModal").addEventListener("click", () => {
      userPermissionsModal.style.display = "none";
    });
    document.getElementById("cancelUserPermissionsBtn").addEventListener("click", () => {
      userPermissionsModal.style.display = "none";
    });
    document.getElementById("saveUserPermissionsBtn").addEventListener("click", async () => {
      const rows = userPermissionsModal.querySelectorAll(".user-permission-row");
      const changes = [];
      rows.forEach(row => {
        if (row.getAttribute("data-admin") === "1") return;
        const username = String(row.getAttribute("data-username") || "").trim();
        if (!username) return;
        const grantsBox = row.querySelector(".folder-grants-box");
        if (!grantsBox || grantsBox.getAttribute('data-loaded') !== '1') return;
        const grants = collectGrantsFrom(grantsBox, grantsBox.__grantsFallback || {});
        changes.push({ user: username, grants });
      });
      try {
        if (changes.length === 0) { showToast(tf("nothing_to_save", "Nothing to save")); return; }
        const sourceId = getFolderAccessSourceId();
        await sendRequest("/api/admin/acl/saveGrants.php", "POST",
          { changes, sourceId },
          { "X-CSRF-Token": window.csrfToken || "" }
        );
        showToast(tf("user_permissions_updated_successfully", "User permissions updated successfully"));
        userPermissionsModal.style.display = "none";
      } catch (err) {
        console.error(err);
        showToast(tf("error_updating_permissions", "Error updating permissions"), "error");
      }
    });
    const helpToggle = userPermissionsModal.querySelector('.grant-help-toggle');
    if (helpToggle) {
      helpToggle.addEventListener('click', () => {
        const expanded = helpToggle.getAttribute('aria-expanded') === 'true';
        const next = !expanded;
        const shortText = userPermissionsModal.querySelector('.grant-help-short');
        const fullText = userPermissionsModal.querySelector('.grant-help-full');
        if (shortText) shortText.style.display = next ? 'none' : 'inline';
        if (fullText) fullText.style.display = next ? 'inline' : 'none';
        helpToggle.setAttribute('aria-expanded', next ? 'true' : 'false');
        helpToggle.textContent = next ? tf('help_less', 'Less') : tf('help_more', 'More');
      });
    }
  } else {
    userPermissionsModal.style.display = "flex";
  }

  initFolderAccessSourceSelector().finally(() => {
    loadUserPermissionsList();
  });
}

export async function openUserGroupsModal() {
  const isDark = document.body.classList.contains('dark-mode');
  const overlayBg = isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.3)';
  const contentBg = isDark ? '#2c2c2c' : '#fff';
  const contentFg = isDark ? '#e0e0e0' : '#000';
  const borderCol = isDark ? '#555' : '#ccc';

  let modal = document.getElementById('userGroupsModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'userGroupsModal';
    modal.style.cssText = `
      position:fixed; inset:0; background:${overlayBg};
      display:flex; align-items:center; justify-content:center; z-index:3650;
    `;
    modal.innerHTML = `
      <div class="modal-content"
           style="background:${contentBg}; color:${contentFg};
                  padding:16px; max-width:980px; width:95%;
                  position:relative;
                  border:1px solid ${borderCol}; max-height:90vh; overflow:auto;">
        <span id="closeUserGroupsModal"
              class="editor-close-btn"
              style="right:8px; top:8px;">&times;</span>

        <h3>User Groups</h3>
        <p class="muted" style="margin-top:-6px;">
          Define named groups, assign users to them, and attach folder access
          just like per-user ACL. Group access is additive to user access.
        </p>

        <div class="d-flex justify-content-between align-items-center" style="margin:8px 0 10px;">
          <button type="button" id="addGroupBtn" class="btn btn-sm btn-success">
            <i class="material-icons" style="font-size:16px;">group_add</i>
            <span style="margin-left:4px;">Add group</span>
          </button>
          <span id="userGroupsStatus" class="small text-muted"></span>
        </div>

        <div id="userGroupsBody" style="max-height:60vh; overflow:auto; margin-bottom:12px;">
          ${t('loading')}…
        </div>

        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button type="button" id="cancelUserGroups" class="btn btn-secondary">${t('cancel')}</button>
          <button type="button" id="saveUserGroups"   class="btn btn-primary">${t('save_settings')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('closeUserGroupsModal').onclick = () => (modal.style.display = 'none');
    document.getElementById('cancelUserGroups').onclick = () => (modal.style.display = 'none');
    document.getElementById('saveUserGroups').onclick = saveUserGroupsFromUI;
    document.getElementById('addGroupBtn').onclick = addEmptyGroupRow;
  } else {
    modal.style.background = overlayBg;
    const content = modal.querySelector('.modal-content');
    if (content) {
      content.style.background = contentBg;
      content.style.color = contentFg;
      content.style.border = `1px solid ${borderCol}`;
    }
  }

  modal.style.display = 'flex';
  await loadUserGroupsList();
}

async function loadUserPermissionsList() {
  const listContainer = document.getElementById("userPermissionsList");
  if (!listContainer) return;
  listContainer.innerHTML = `<p>${t("loading")}…</p>`;
  const sourceId = getFolderAccessSourceId();

  try {
    const [usersRes, groupsMap] = await Promise.all([
      fetch("/api/getUsers.php", { credentials: "include" }).then(safeJson),
      fetchAllGroups().catch(() => ({}))
    ]);

    const users = Array.isArray(usersRes) ? usersRes : (usersRes.users || []);
    const groups = groupsMap && typeof groupsMap === "object" ? groupsMap : {};

    if (!users.length && !Object.keys(groups).length) {
      listContainer.innerHTML = `<p>${t("no_users_found")}</p>`;
      return;
    }

    __groupsCache = groups || {};

    const folders = await getAllFolders(true, sourceId);
    const orderedFolders = ["root", ...folders.filter(f => f !== "root")];

    const userGroupMap = {};
    Object.keys(groups).forEach(gName => {
      const g = groups[gName] || {};
      const members = Array.isArray(g.members) ? g.members : [];
      members.forEach(m => {
        const u = String(m || "").trim();
        if (!u) return;
        if (!userGroupMap[u]) userGroupMap[u] = [];
        userGroupMap[u].push(gName);
      });
    });

    listContainer.innerHTML = "";

    const groupNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));
    if (groupNames.length) {
      const groupHeader = document.createElement("div");
      groupHeader.className = "muted";
      groupHeader.style.margin = "4px 0 6px";
      groupHeader.textContent = tf("groups_header", "Groups");
      listContainer.appendChild(groupHeader);

      groupNames.forEach(name => {
        const g = groups[name] || {};
        const label = g.label || name;
        const members = Array.isArray(g.members) ? g.members : [];
        const membersSummary = members.length
          ? members.join(", ")
          : tf("no_members", "No members yet");

        const row = document.createElement("div");
        row.classList.add("user-permission-row", "group-permission-row");
        row.setAttribute("data-group-name", name);
        row.style.padding = "6px 0";

        row.innerHTML = `
      <div class="user-perm-header" tabindex="0" role="button" aria-expanded="false"
           style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 8px;border-radius:12px;">
        <span class="perm-caret" style="display:inline-block; transform: rotate(-90deg); transition: transform 120ms ease;">▸</span>
        <i class="material-icons" style="font-size:18px;">group</i>
        <strong class="group-label"></strong>
        <span class="muted" style="margin-left:4px;font-size:11px;">
          (${tf("group_label", "group")})
        </span>
        <span class="muted members-summary" style="margin-left:auto;font-size:11px;"></span>
      </div>
      <div class="user-perm-details" style="display:none; margin:8px 0 12px;">
        <div class="folder-grants-box" data-loaded="0"></div>
      </div>
    `;

        const labelEl = row.querySelector('.group-label');
        if (labelEl) {
          labelEl.textContent = label;
        }

        const membersEl = row.querySelector('.members-summary');
        if (membersEl) {
          membersEl.textContent = `${tf("members_label", "Members")}: ${membersSummary}`;
        }

        const header = row.querySelector(".user-perm-header");
        const details = row.querySelector(".user-perm-details");
        const caret = row.querySelector(".perm-caret");
        const grantsBox = row.querySelector(".folder-grants-box");

        async function ensureLoaded() {
          if (grantsBox.dataset.loaded === "1") return;
          try {
            const group = __groupsCache[name] || {};
            const grants = group.grants || {};

            renderFolderGrantsUI(
              name,
              grantsBox,
              orderedFolders,
              grants
            );

            grantsBox.querySelectorAll('input[type="checkbox"]').forEach(cb => {
              cb.disabled = true;
              cb.title = tf(
                "edit_group_acl_in_user_groups",
                "Group ACL is read-only here. Use User groups → Edit folder access to change it."
              );
            });

            grantsBox.__grantsFallback = grants;
            grantsBox.dataset.loaded = "1";
          } catch (e) {
            console.error(e);
            grantsBox.innerHTML = `<div class="muted">${tf("error_loading_group_grants", "Error loading group grants")}</div>`;
          }
        }

        function toggleOpen() {
          const willShow = details.style.display === "none";
          details.style.display = willShow ? "block" : "none";
          header.setAttribute("aria-expanded", willShow ? "true" : "false");
          caret.style.transform = willShow ? "rotate(0deg)" : "rotate(-90deg)";
          if (willShow) ensureLoaded();
        }

        header.addEventListener("click", toggleOpen);
        header.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleOpen();
          }
        });

        listContainer.appendChild(row);
      });
    }

    const userHeader = document.createElement("div");
    userHeader.className = "muted";
    userHeader.style.margin = "4px 0 6px";
    userHeader.textContent = tf("users_header", "Users");
    listContainer.appendChild(userHeader);

    users.forEach(u => {
      const username = typeof u === "string" ? u : (u.username || u.user || "");
      if (!username) return;
      const isAdmin = isAdminUser(u);
      const displayName = isAdmin ? `${username} (admin)` : username;
      const groupNamesForUser = userGroupMap[username] || [];
      const groupSummary = groupNamesForUser.length
        ? `${tf("groups", "Groups")}: ${groupNamesForUser.join(", ")}`
        : tf("no_groups", "No groups");

      const row = document.createElement("div");
      row.classList.add("user-permission-row");
      row.setAttribute("data-username", username);
      if (isAdmin) row.setAttribute("data-admin", "1");

      row.innerHTML = `
      <div class="user-perm-header" tabindex="0" role="button" aria-expanded="false"
           style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 8px;border-radius:12px;">
        <span class="perm-caret" style="display:inline-block; transform: rotate(-90deg); transition: transform 120ms ease;">▸</span>
        <i class="material-icons" style="font-size:18px;">person</i>
        <strong>${displayName}</strong>
        <span class="muted" style="margin-left:4px;font-size:11px;">${groupSummary}</span>
      </div>
      <div class="user-perm-details" style="display:none; margin:8px 0 12px;">
        <div class="folder-grants-box" data-loaded="0"></div>
      </div>
    `;

      const header = row.querySelector(".user-perm-header");
      const details = row.querySelector(".user-perm-details");
      const caret = row.querySelector(".perm-caret");
      const grantsBox = row.querySelector(".folder-grants-box");

      async function ensureLoaded() {
        if (grantsBox.dataset.loaded === "1") return;
        try {
          const baseGrants = await getUserGrants(username, sourceId);
          const grants = isAdmin
            ? { __isAdmin: true, ...buildFullGrantsForAllFolders(orderedFolders), ...(baseGrants || {}) }
            : baseGrants;

          const markInheritFlags = (map, defaultVal) => {
            if (!map || typeof map !== "object") return;
            Object.keys(map).forEach(key => {
              const entry = map[key];
              if (!entry || typeof entry !== "object") return;
              if (typeof entry.__explicit === "undefined") {
                if (typeof entry.explicit !== "undefined") {
                  entry.__explicit = !!entry.explicit;
                } else {
                  entry.__explicit = !!defaultVal;
                }
              } else {
                entry.__explicit = !!entry.__explicit;
              }
              if (typeof entry.__inherit === "undefined") {
                if (typeof entry.inherit !== "undefined") {
                  entry.__inherit = !!entry.inherit;
                } else {
                  entry.__inherit = !!defaultVal;
                }
              } else {
                entry.__inherit = !!entry.__inherit;
              }
            });
          };
          markInheritFlags(grants, isAdmin);
          renderFolderGrantsUI(
            username,
            grantsBox,
            orderedFolders,
            grants
          );

          if (!isAdmin && groupNamesForUser.length) {
            const groupMask = computeGroupGrantMaskForUser(username, orderedFolders);
            applyGroupLocksForUser(username, grantsBox, groupMask, groupNamesForUser);
          }

          grantsBox.__grantsFallback = grants;
          grantsBox.dataset.loaded = "1";
        } catch (e) {
          console.error(e);
          grantsBox.innerHTML = `<div class="muted">${tf("error_loading_user_grants", "Error loading user grants")}</div>`;
        }
      }

      function toggleOpen() {
        const willShow = details.style.display === "none";
        details.style.display = willShow ? "block" : "none";
        header.setAttribute("aria-expanded", willShow ? "true" : "false");
        caret.style.transform = willShow ? "rotate(0deg)" : "rotate(-90deg)";
        if (willShow) ensureLoaded();
      }

      header.addEventListener("click", toggleOpen);
      header.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleOpen();
        }
      });

      listContainer.appendChild(row);
    });
  } catch (e) {
    console.error(e);
    listContainer.innerHTML = `<div class="muted">${t("error_loading_users")}</div>`;
  }
}

async function loadUserGroupsList(useCacheOnly) {
  const body = document.getElementById('userGroupsBody');
  const status = document.getElementById('userGroupsStatus');
  if (!body) return;

  body.textContent = `${t('loading')}…`;
  if (status) {
    status.textContent = '';
    status.className = 'small text-muted';
  }

  try {
    const users = await fetchAllUsers();

    let groups;
    if (useCacheOnly && __groupsCache && Object.keys(__groupsCache).length) {
      groups = __groupsCache;
    } else {
      groups = await fetchAllGroups();
      __groupsCache = groups || {};
    }

    const usernames = users
      .map(u => String(u.username || '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    const groupNames = Object.keys(__groupsCache).sort((a, b) => a.localeCompare(b));
    if (!groupNames.length) {
      body.innerHTML = `<p class="muted">${tf('no_groups_defined', 'No groups defined yet. Click “Add group” to create one.')}</p>`;
      return;
    }

    let html = '';
    groupNames.forEach(name => {
      const g = __groupsCache[name] || {};
      const label = g.label || name;
      const members = Array.isArray(g.members) ? g.members : [];

      const memberOptions = usernames.map(u => {
        const sel = members.includes(u) ? 'selected' : '';
        return `<option value="${u}" ${sel}>${u}</option>`;
      }).join('');

      const memberCountLabel = members.length
        ? `${members.length} member${members.length === 1 ? '' : 's'}`
        : 'No members yet';

      html += `
        <div class="card" data-group-name="${name}" style="margin-bottom:10px; border-radius:8px;">
          <div class="group-card-header d-flex align-items-center"
               tabindex="0"
               role="button"
               aria-expanded="false"
               style="gap:6px; padding:6px 10px; cursor:pointer; border-radius:8px;">
            <span class="group-caret"
                  style="display:inline-block; transform:rotate(-90deg); transition:transform 120ms ease;">▸</span>
            <i class="material-icons" style="font-size:18px;">group</i>
            <strong>${(label || name).replace(/"/g, '&quot;')}</strong>
            <span class="muted" style="font-size:0.8rem; margin-left:4px;">
              ${memberCountLabel}
            </span>
            <button type="button"
                    class="btn btn-sm btn-danger group-card-delete"
                    data-group-action="delete">
              <i class="material-icons" style="font-size:22px;">delete</i>
            </button>
          </div>
    
          <div class="group-card-body" style="display:none; padding:6px 10px 10px;">
            <div class="d-flex align-items-center"
                 style="gap:6px; flex-wrap:wrap; margin-bottom:6px;">
              <label style="margin:0; font-weight:600;">
                Group name:
                <input type="text"
                       class="form-control form-control-sm"
                       data-group-field="name"
                       value="${name}"
                       style="display:inline-block; width:160px; margin-left:4px;" />
              </label>
              <label style="margin:0;">
                Label:
                <input type="text"
                       class="form-control form-control-sm"
                       data-group-field="label"
                       value="${(g.label || '').replace(/"/g, '&quot;')}"
                       style="display:inline-block; width:200px; margin-left:4px;" />
              </label>
            </div>
    
            <div style="margin-top:4px;">
              <label style="font-size:12px; font-weight:600;">Members:</label>
              <select multiple
                      class="form-control form-control-sm"
                      data-group-field="members"
                      size="${Math.min(Math.max(usernames.length, 3), 8)}">
                ${memberOptions}
              </select>
              <small class="text-muted">
                Hold Ctrl/Cmd to select multiple users.
              </small>
            </div>
    
            <div style="margin-top:8px;">
              <button type="button"
                      class="btn btn-sm btn-secondary"
                      data-group-action="edit-acl">
                Edit folder access
              </button>
            </div>
          </div>
        </div>
      `;
    });

    body.innerHTML = html;

    body.querySelectorAll('.card[data-group-name]').forEach(card => {
      const header = card.querySelector('.group-card-header');
      const bodyEl = card.querySelector('.group-card-body');
      const caret = card.querySelector('.group-caret');
      if (!header || !bodyEl || !caret) return;

      const setExpanded = (expanded) => {
        header.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        bodyEl.style.display = expanded ? 'block' : 'none';
        caret.textContent = expanded ? '▾' : '▸';
      };

      setExpanded(false);

      const toggle = () => {
        const isOpen = header.getAttribute('aria-expanded') === 'true';
        setExpanded(!isOpen);
      };

      header.addEventListener('click', (e) => {
        if (e.target.closest('[data-group-action="delete"]')) return;
        toggle();
      });

      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });
    });

    body.querySelectorAll('select[data-group-field="members"]').forEach(sel => {
      const chips = document.createElement('div');
      chips.className = 'group-members-chips';
      chips.style.marginTop = '4px';
      sel.insertAdjacentElement('afterend', chips);

      const renderChips = () => {
        const names = Array.from(sel.selectedOptions).map(o => o.value);
        if (!names.length) {
          chips.innerHTML = `<span class="muted" style="font-size:11px;">No members selected</span>`;
          return;
        }
        chips.innerHTML = names.map(n => `
          <span class="group-member-pill">${n}</span>
        `).join(' ');
      };

      sel.addEventListener('change', renderChips);
      renderChips();
    });

    body.querySelectorAll('[data-group-action="delete"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('[data-group-name]');
        const name = card && card.getAttribute('data-group-name');
        if (!name) return;
        if (!confirm(`Delete group "${name}"?`)) return;
        delete __groupsCache[name];
        card.remove();
      });
    });

    body.querySelectorAll('[data-group-action="edit-acl"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('[data-group-name]');
        if (!card) return;
        const nameInput = card.querySelector('input[data-group-field="name"]');
        const name = (nameInput && nameInput.value || '').trim();
        if (!name) {
          showToast('Enter a group name first.');
          return;
        }
        await openGroupAclEditor(name);
      });
    });
  } catch (e) {
    console.error(e);
    body.innerHTML = `<p class="muted">${tf('error_loading_groups', 'Error loading groups')}</p>`;
  }
}

function addEmptyGroupRow() {
  if (!__groupsCache || typeof __groupsCache !== 'object') {
    __groupsCache = {};
  }
  let idx = 1;
  let name = `group${idx}`;
  while (__groupsCache[name]) {
    idx += 1;
    name = `group${idx}`;
  }
  __groupsCache[name] = { name, label: name, members: [], grants: {} };
  loadUserGroupsList(true);
}

async function saveUserGroupsFromUI() {
  const body = document.getElementById('userGroupsBody');
  const status = document.getElementById('userGroupsStatus');
  if (!body) return;

  const cards = body.querySelectorAll('[data-group-name]');
  const groups = {};

  cards.forEach(card => {
    const oldName = card.getAttribute('data-group-name') || '';
    const nameEl = card.querySelector('input[data-group-field="name"]');
    const labelEl = card.querySelector('input[data-group-field="label"]');
    const membersSel = card.querySelector('select[data-group-field="members"]');

    const name = (nameEl && nameEl.value || '').trim();
    if (!name) return;

    const label = (labelEl && labelEl.value || '').trim() || name;
    const members = Array.from(membersSel && membersSel.selectedOptions || []).map(o => o.value);

    const existing = __groupsCache[oldName] || __groupsCache[name] || { grants: {} };
    groups[name] = {
      name,
      label,
      members,
      grants: existing.grants || {}
    };
  });

  if (status) {
    status.textContent = 'Saving groups…';
    status.className = 'small text-muted';
  }

  try {
    const res = await saveAllGroups(groups);
    if (!res.success) {
      showToast(res.error || 'Error saving groups');
      if (status) {
        status.textContent = 'Error saving groups.';
        status.className = 'small text-danger';
      }
      return;
    }

    __groupsCache = groups;
    if (status) {
      status.textContent = 'Groups saved.';
      status.className = 'small text-success';
    }
    showToast('Groups saved.');
  } catch (e) {
    console.error(e);
    if (status) {
      status.textContent = 'Error saving groups.';
      status.className = 'small text-danger';
    }
    showToast('Error saving groups', 'error');
  }
}

async function openGroupAclEditor(groupName) {
  const isDark = document.body.classList.contains('dark-mode');
  const overlayBg = isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.3)';
  const contentBg = isDark ? '#2c2c2c' : '#fff';
  const contentFg = isDark ? '#e0e0e0' : '#000';
  const borderCol = isDark ? '#555' : '#ccc';

  let modal = document.getElementById('groupAclModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'groupAclModal';
    modal.style.cssText = `
      position:fixed; inset:0; background:${overlayBg};
      display:flex; align-items:center; justify-content:center; z-index:3700;
    `;
    modal.innerHTML = `
      <div class="modal-content"
           style="background:${contentBg}; color:${contentFg};
                  padding:16px; max-width:1300px; width:99%;
                  position:relative;
                  border:1px solid ${borderCol}; max-height:90vh; overflow:auto;">
        <span id="closeGroupAclModal"
              class="editor-close-btn"
              style="right:8px; top:8px;">&times;</span>

        <h3 id="groupAclTitle">Group folder access</h3>
        <div class="muted" style="margin:-4px 0 10px;">
          Group grants are merged with each member’s own folder access. They never reduce access.
        </div>

        <div id="groupAclBody" style="max-height:70vh; overflow-y:auto; margin-bottom:12px;"></div>

        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button type="button" id="cancelGroupAcl" class="btn btn-secondary">${t('cancel')}</button>
          <button type="button" id="saveGroupAcl"   class="btn btn-primary">${t('save_permissions')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('closeGroupAclModal').onclick = () => (modal.style.display = 'none');
    document.getElementById('cancelGroupAcl').onclick = () => (modal.style.display = 'none');
    document.getElementById('saveGroupAcl').onclick = saveGroupAclFromUI;
  } else {
    modal.style.background = overlayBg;
    const content = modal.querySelector('.modal-content');
    if (content) {
      content.style.background = contentBg;
      content.style.color = contentFg;
      content.style.border = `1px solid ${borderCol}`;
    }
  }

  const title = document.getElementById('groupAclTitle');
  if (title) title.textContent = `Group folder access: ${groupName}`;

  const body = document.getElementById('groupAclBody');
  if (body) body.textContent = `${t('loading')}…`;

  modal.dataset.groupName = groupName;
  modal.style.display = 'flex';

  const sourceId = getFolderAccessSourceId();
  const folders = await getAllFolders(true, sourceId);
  const grants = (__groupsCache[groupName] && __groupsCache[groupName].grants) || {};

  if (body) {
    body.textContent = '';
    const box = document.createElement('div');
    box.className = 'folder-grants-box';
    body.appendChild(box);

    renderFolderGrantsUI(groupName, box, ['root', ...folders.filter(f => f !== 'root')], grants);
    box.__grantsFallback = grants;
  }
}

function saveGroupAclFromUI() {
  const modal = document.getElementById('groupAclModal');
  if (!modal) return;
  const groupName = modal.dataset.groupName;
  if (!groupName) return;

  const body = document.getElementById('groupAclBody');
  if (!body) return;
  const box = body.querySelector('.folder-grants-box');
  if (!box) return;

  const grants = collectGrantsFrom(box, box.__grantsFallback || {});
  if (!__groupsCache[groupName]) {
    __groupsCache[groupName] = { name: groupName, label: groupName, members: [], grants: {} };
  }
  __groupsCache[groupName].grants = grants;

  showToast('Group folder access updated. Remember to Save groups.');
  modal.style.display = 'none';
}

export { computeGroupGrantMaskForUser, applyGroupLocksForUser, isAdminUser };
