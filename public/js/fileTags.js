// fileTags.js (drop-in fix: single-instance modals, idempotent bindings)
import { escapeHTML } from './domUtils.js?v={{APP_QVER}}';
import { t } from './i18n.js?v={{APP_QVER}}';
import { renderFileTable, renderGalleryView } from './fileListView.js?v={{APP_QVER}}';

// -------------------- state --------------------
let __singleInit = false;
let __multiInit  = false;
let currentFile = null;

// Global store (preserve existing behavior)
window.globalTags = window.globalTags || [];
if (localStorage.getItem('globalTags')) {
  try { window.globalTags = JSON.parse(localStorage.getItem('globalTags')); } catch (e) {}
}

// -------------------- ensure DOM (create-once-if-missing) --------------------
function ensureSingleTagModal() {
  // de-dupe if something already injected multiples
  const all = document.querySelectorAll('#tagModal');
  if (all.length > 1) [...all].slice(0, -1).forEach(n => n.remove());

  let modal = document.getElementById('tagModal');
  if (!modal) {
    document.body.insertAdjacentHTML('beforeend', `
      <div id="tagModal" class="modal" style="display:none">
        <div class="modal-content" style="width:450px; max-width:90vw;">
          <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center;">
            <h3 id="tagModalTitle" style="margin:0; max-width:calc(100% - 40px); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              ${t('tag_file')}
            </h3>
            <span id="closeTagModal" class="editor-close-btn">×</span>
          </div>
          <div class="modal-body" style="margin-top:10px;">
            <label for="tagNameInput">${t('tag_name')}</label>
            <input type="text" id="tagNameInput" placeholder="${t('tag_name')}" style="width:100%; padding:5px;"/>
            <br><br>
            <label for="tagColorInput">${t('tag_color') || 'Tag Color'}</label>
            <input type="color" id="tagColorInput" value="#ff0000" style="width:100%; padding:5px;"/>
            <br><br>
            <div id="customTagDropdown" style="max-height:150px; overflow-y:auto; border:1px solid #ccc; margin-top:5px; padding:5px;"></div>
            <br>
            <div style="text-align:right;">
              <button id="saveTagBtn" class="btn btn-primary" type="button">${t('save_tag')}</button>
            </div>
            <div id="currentTags" style="margin-top:10px; font-size:.9em;"></div>
          </div>
        </div>
      </div>
    `);
    modal = document.getElementById('tagModal');
  }
  return modal;
}

function ensureMultiTagModal() {
  const all = document.querySelectorAll('#multiTagModal');
  if (all.length > 1) [...all].slice(0, -1).forEach(n => n.remove());

  let modal = document.getElementById('multiTagModal');
  if (!modal) {
    document.body.insertAdjacentHTML('beforeend', `
      <div id="multiTagModal" class="modal" style="display:none">
        <div class="modal-content" style="width:450px; max-width:90vw;">
          <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center;">
            <h3 id="multiTagTitle" style="margin:0;"></h3>
            <span id="closeMultiTagModal" class="editor-close-btn">×</span>
          </div>
          <div class="modal-body" style="margin-top:10px;">
            <label for="multiTagNameInput">${t('tag_name')}</label>
            <input type="text" id="multiTagNameInput" placeholder="${t('tag_name')}" style="width:100%; padding:5px;"/>
            <br><br>
            <label for="multiTagColorInput">${t('tag_color') || 'Tag Color'}</label>
            <input type="color" id="multiTagColorInput" value="#ff0000" style="width:100%; padding:5px;"/>
            <br><br>
            <div id="multiCustomTagDropdown" style="max-height:150px; overflow-y:auto; border:1px solid #ccc; margin-top:5px; padding:5px;"></div>
            <br>
            <div style="text-align:right;">
              <button id="saveMultiTagBtn" class="btn btn-primary" type="button">${t('save_tag') || 'Save Tag'}</button>
            </div>
          </div>
        </div>
      </div>
    `);
    modal = document.getElementById('multiTagModal');
  }
  return modal;
}

// -------------------- init (bind once) --------------------
function initSingleModalOnce() {
  if (__singleInit) return;
  const modal = ensureSingleTagModal();
  const closeBtn = document.getElementById('closeTagModal');
  const saveBtn  = document.getElementById('saveTagBtn');
  const nameInp  = document.getElementById('tagNameInput');

  // Close handlers
  closeBtn?.addEventListener('click', hideTagModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTagModal(); });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) hideTagModal(); // click backdrop
  });

  // Input filter for dropdown
  nameInp?.addEventListener('input', (e) => updateCustomTagDropdown(e.target.value));

  // Save handler
  saveBtn?.addEventListener('click', () => {
    const tagName = (document.getElementById('tagNameInput')?.value || '').trim();
    const tagColor = document.getElementById('tagColorInput')?.value || '#ff0000';
    if (!tagName) { alert(t('enter_tag_name') || 'Please enter a tag name.'); return; }
    if (!currentFile) return;

    addTagToFile(currentFile, { name: tagName, color: tagColor });
    updateTagModalDisplay(currentFile);
    updateFileRowTagDisplay(currentFile);
    saveFileTags(currentFile);

    if (window.viewMode === 'gallery') renderGalleryView(window.currentFolder);
    else renderFileTable(window.currentFolder);

    const inp = document.getElementById('tagNameInput');
    if (inp) inp.value = '';
    updateCustomTagDropdown('');
  });

  __singleInit = true;
}

function initMultiModalOnce() {
  if (__multiInit) return;
  const modal   = ensureMultiTagModal();
  const closeBtn = document.getElementById('closeMultiTagModal');
  const saveBtn  = document.getElementById('saveMultiTagBtn');
  const nameInp  = document.getElementById('multiTagNameInput');

  closeBtn?.addEventListener('click', hideMultiTagModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideMultiTagModal(); });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) hideMultiTagModal();
  });

  nameInp?.addEventListener('input', (e) => updateMultiCustomTagDropdown(e.target.value));

  saveBtn?.addEventListener('click', () => {
    const tagName  = (document.getElementById('multiTagNameInput')?.value || '').trim();
    const tagColor = document.getElementById('multiTagColorInput')?.value || '#ff0000';
    if (!tagName) { alert(t('enter_tag_name') || 'Please enter a tag name.'); return; }

    const files = (window.__multiTagFiles || []);
    files.forEach(file => {
      addTagToFile(file, { name: tagName, color: tagColor });
      updateFileRowTagDisplay(file);
      saveFileTags(file);
    });

    hideMultiTagModal();
    if (window.viewMode === 'gallery') renderGalleryView(window.currentFolder);
    else renderFileTable(window.currentFolder);
  });

  __multiInit = true;
}

// -------------------- open/close APIs --------------------
export function openTagModal(file) {
  initSingleModalOnce();
  const modal = document.getElementById('tagModal');
  const title = document.getElementById('tagModalTitle');

  currentFile = file || null;
  if (title) title.textContent = `${t('tag_file')}: ${file ? escapeHTML(file.name) : ''}`;
  updateCustomTagDropdown('');
  updateTagModalDisplay(file);
  modal.style.display = 'block';
}

export function hideTagModal() {
  const modal = document.getElementById('tagModal');
  if (modal) modal.style.display = 'none';
}

export function openMultiTagModal(files) {
  initMultiModalOnce();
  const modal = document.getElementById('multiTagModal');
  const title = document.getElementById('multiTagTitle');
  window.__multiTagFiles = Array.isArray(files) ? files : [];
  if (title) title.textContent = `${t('tag_selected') || 'Tag Selected'} (${window.__multiTagFiles.length})`;
  updateMultiCustomTagDropdown('');
  modal.style.display = 'block';
}

export function hideMultiTagModal() {
  const modal = document.getElementById('multiTagModal');
  if (modal) modal.style.display = 'none';
}

// -------------------- dropdown + UI helpers --------------------
function updateMultiCustomTagDropdown(filterText = "") {
  const dropdown = document.getElementById("multiCustomTagDropdown");
  if (!dropdown) return;
  dropdown.innerHTML = "";
  let tags = window.globalTags || [];
  if (filterText) tags = tags.filter(tag => tag.name.toLowerCase().includes(filterText.toLowerCase()));
  if (tags.length > 0) {
    tags.forEach(tag => {
      const item = document.createElement("div");
      item.style.cursor = "pointer";
      item.style.padding = "5px";
      item.style.borderBottom = "1px solid #eee";
      item.innerHTML = `
        <span style="display:inline-block; width:16px; height:16px; background-color:${tag.color}; border:1px solid #ccc; margin-right:5px; vertical-align:middle;"></span>
        ${escapeHTML(tag.name)}
        <span class="global-remove" style="color:red; font-weight:bold; margin-left:5px; cursor:pointer;">×</span>
      `;
      item.addEventListener("click", function(e) {
        if (e.target.classList.contains("global-remove")) return;
        const n = document.getElementById("multiTagNameInput");
        const c = document.getElementById("multiTagColorInput");
        if (n) n.value = tag.name;
        if (c) c.value = tag.color;
      });
      item.querySelector('.global-remove').addEventListener("click", function(e){
        e.stopPropagation();
        removeGlobalTag(tag.name);
      });
      dropdown.appendChild(item);
    });
  } else {
    dropdown.innerHTML = `<div style="padding:5px;">${t('no_tags_available') || 'No tags available'}</div>`;
  }
}

function updateCustomTagDropdown(filterText = "") {
  const dropdown = document.getElementById("customTagDropdown");
  if (!dropdown) return;
  dropdown.innerHTML = "";
  let tags = window.globalTags || [];
  if (filterText) tags = tags.filter(tag => tag.name.toLowerCase().includes(filterText.toLowerCase()));
  if (tags.length > 0) {
    tags.forEach(tag => {
      const item = document.createElement("div");
      item.style.cursor = "pointer";
      item.style.padding = "5px";
      item.style.borderBottom = "1px solid #eee";
      item.innerHTML = `
        <span style="display:inline-block; width:16px; height:16px; background-color:${tag.color}; border:1px solid #ccc; margin-right:5px; vertical-align:middle;"></span>
        ${escapeHTML(tag.name)}
        <span class="global-remove" style="color:red; font-weight:bold; margin-left:5px; cursor:pointer;">×</span>
      `;
      item.addEventListener("click", function(e){
        if (e.target.classList.contains('global-remove')) return;
        const n = document.getElementById("tagNameInput");
        const c = document.getElementById("tagColorInput");
        if (n) n.value = tag.name;
        if (c) c.value = tag.color;
      });
      item.querySelector('.global-remove').addEventListener("click", function(e){
        e.stopPropagation();
        removeGlobalTag(tag.name);
      });
      dropdown.appendChild(item);
    });
  } else {
    dropdown.innerHTML = `<div style="padding:5px;">${t('no_tags_available') || 'No tags available'}</div>`;
  }
}

// Update the modal display to show current tags on the file.
function updateTagModalDisplay(file) {
  const container = document.getElementById('currentTags');
  if (!container) return;
  container.innerHTML = `<strong>${t('current_tags') || 'Current Tags'}:</strong> `;
  if (file?.tags?.length) {
    file.tags.forEach(tag => {
      const tagElem = document.createElement('span');
      tagElem.textContent = tag.name;
      tagElem.style.backgroundColor = tag.color;
      tagElem.style.color = '#fff';
      tagElem.style.padding = '2px 6px';
      tagElem.style.marginRight = '5px';
      tagElem.style.borderRadius = '3px';
      tagElem.style.display = 'inline-block';
      tagElem.style.position = 'relative';
      const removeIcon = document.createElement('span');
      removeIcon.textContent = ' ✕';
      removeIcon.style.fontWeight = 'bold';
      removeIcon.style.marginLeft = '3px';
      removeIcon.style.cursor = 'pointer';
      removeIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        removeTagFromFile(file, tag.name);
      });
      tagElem.appendChild(removeIcon);
      container.appendChild(tagElem);
    });
  } else {
    container.innerHTML += (t('none') || 'None');
  }
}

function removeTagFromFile(file, tagName) {
  file.tags = (file.tags || []).filter(tg => tg.name.toLowerCase() !== tagName.toLowerCase());
  updateTagModalDisplay(file);
  updateFileRowTagDisplay(file);
  saveFileTags(file);
}

function removeGlobalTag(tagName) {
  window.globalTags = (window.globalTags || []).filter(t => t.name.toLowerCase() !== tagName.toLowerCase());
  localStorage.setItem('globalTags', JSON.stringify(window.globalTags));
  updateCustomTagDropdown();
  updateMultiCustomTagDropdown();
  saveGlobalTagRemoval(tagName);
}

function saveGlobalTagRemoval(tagName) {
  fetch("/api/file/saveFileTag.php", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": window.csrfToken },
    body: JSON.stringify({ folder: "root", file: "global", deleteGlobal: true, tagToDelete: tagName, tags: [] })
  })
  .then(r => r.json())
  .then(data => {
    if (data.success && data.globalTags) {
      window.globalTags = data.globalTags;
      localStorage.setItem('globalTags', JSON.stringify(window.globalTags));
      updateCustomTagDropdown();
      updateMultiCustomTagDropdown();
    } else if (!data.success) {
      console.error("Error removing global tag:", data.error);
    }
  })
  .catch(err => console.error("Error removing global tag:", err));
}

// -------------------- exports kept from your original --------------------
export function loadGlobalTags() {
  fetch("/api/file/getFileTag.php", { credentials: "include" })
    .then(r => r.ok ? r.json() : [])
    .then(data => {
      window.globalTags = data || [];
      localStorage.setItem('globalTags', JSON.stringify(window.globalTags));
      updateCustomTagDropdown();
      updateMultiCustomTagDropdown();
    })
    .catch(err => {
      console.error("Error loading global tags:", err);
      window.globalTags = [];
      updateCustomTagDropdown();
      updateMultiCustomTagDropdown();
    });
}
loadGlobalTags();

export function addTagToFile(file, tag) {
  if (!file.tags) file.tags = [];
  const exists = file.tags.find(tg => tg.name.toLowerCase() === tag.name.toLowerCase());
  if (exists) exists.color = tag.color; else file.tags.push(tag);

  const globalExists = (window.globalTags || []).find(tg => tg.name.toLowerCase() === tag.name.toLowerCase());
  if (!globalExists) {
    window.globalTags.push(tag);
    localStorage.setItem('globalTags', JSON.stringify(window.globalTags));
  }
}

export function updateFileRowTagDisplay(file) {
  const rows = document.querySelectorAll(`[id^="file-row-${encodeURIComponent(file.name)}"]`);
  rows.forEach(row => {
    let cell = row.querySelector('.file-name-cell');
    if (!cell) return;
    let badgeContainer = cell.querySelector('.tag-badges');
    if (!badgeContainer) {
      badgeContainer = document.createElement('div');
      badgeContainer.className = 'tag-badges';
      badgeContainer.style.display = 'inline-block';
      badgeContainer.style.marginLeft = '5px';
      cell.appendChild(badgeContainer);
    }
    badgeContainer.innerHTML = '';
    (file.tags || []).forEach(tag => {
      const badge = document.createElement('span');
      badge.textContent = tag.name;
      badge.style.backgroundColor = tag.color;
      badge.style.color = '#fff';
      badge.style.padding = '2px 4px';
      badge.style.marginRight = '2px';
      badge.style.borderRadius = '3px';
      badge.style.fontSize = '0.8em';
      badge.style.verticalAlign = 'middle';
      badgeContainer.appendChild(badge);
    });
  });
}

export function initTagSearch() {
  const searchInput = document.getElementById('searchInput');
  if (!searchInput) return;
  let tagSearchInput = document.getElementById('tagSearchInput');
  if (!tagSearchInput) {
    tagSearchInput = document.createElement('input');
    tagSearchInput.id = 'tagSearchInput';
    tagSearchInput.placeholder = t('filter_by_tag') || 'Filter by tag';
    tagSearchInput.style.marginLeft = '10px';
    tagSearchInput.style.padding = '5px';
    searchInput.parentNode.insertBefore(tagSearchInput, searchInput.nextSibling);
    tagSearchInput.addEventListener('input', () => {
      window.currentTagFilter = tagSearchInput.value.trim().toLowerCase();
      if (window.currentFolder) renderFileTable(window.currentFolder);
    });
  }
}

export function filterFilesByTag(files) {
  const q = (window.currentTagFilter || '').trim().toLowerCase();
  if (!q) return files;
  return files.filter(file => (file.tags || []).some(tag => tag.name.toLowerCase().includes(q)));
}

function updateGlobalTagList() {
  const dataList = document.getElementById("globalTagList");
  if (!dataList) return;
  dataList.innerHTML = "";
  (window.globalTags || []).forEach(tag => {
    const option = document.createElement("option");
    option.value = tag.name;
    dataList.appendChild(option);
  });
}

export function saveFileTags(file, deleteGlobal = false, tagToDelete = null) {
  const folder = file.folder || "root";
  const payload = deleteGlobal && tagToDelete ? {
    folder: "root",
    file: "global",
    deleteGlobal: true,
    tagToDelete,
    tags: []
  } : { folder, file: file.name, tags: file.tags };

  fetch("/api/file/saveFileTag.php", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": window.csrfToken },
    body: JSON.stringify(payload)
  })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        if (data.globalTags) {
          window.globalTags = data.globalTags;
          localStorage.setItem('globalTags', JSON.stringify(window.globalTags));
          updateCustomTagDropdown();
          updateMultiCustomTagDropdown();
        }
        updateGlobalTagList();
      } else {
        console.error("Error saving tags:", data.error);
      }
    })
    .catch(err => console.error("Error saving tags:", err));
}