// fileTags.js
// This module provides functions for opening the tag modal,
// adding tags to files (with a global tag store for reuse),
// updating the file row display with tag badges,
// filtering the file list by tag, and persisting tag data.
import { escapeHTML } from './domUtils.js';
import { t } from './i18n.js';

export function openTagModal(file) {
  // Create the modal element.
  let modal = document.createElement('div');
  modal.id = 'tagModal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content" style="width: 400px; max-width:90vw;">
      <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center;">
        <h3 style="margin:0;">${t("tag_file")}: ${file.name}</h3>
        <span id="closeTagModal" style="cursor:pointer; font-size:24px;">&times;</span>
      </div>
      <div class="modal-body" style="margin-top:10px;">
        <label for="tagNameInput">${t("tag_name")}</label>
        <input type="text" id="tagNameInput" placeholder="Enter tag name" style="width:100%; padding:5px;"/>
        <br><br>
        <label for="tagColorInput">${t("tag_name")}</label>
        <input type="color" id="tagColorInput" value="#ff0000" style="width:100%; padding:5px;"/>
        <br><br>
        <div id="customTagDropdown" style="max-height:150px; overflow-y:auto; border:1px solid #ccc; margin-top:5px; padding:5px;">
          <!-- Custom tag options will be populated here -->
        </div>
        <br>
        <div style="text-align:right;">
          <button id="saveTagBtn" class="btn btn-primary">${t("save_tag")}</button>
        </div>
        <div id="currentTags" style="margin-top:10px; font-size:0.9em;">
          <!-- Existing tags will be listed here -->
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.style.display = 'block';

  updateCustomTagDropdown();

  document.getElementById('closeTagModal').addEventListener('click', () => {
    modal.remove();
  });

  updateTagModalDisplay(file);

  document.getElementById('tagNameInput').addEventListener('input', (e) => {
    updateCustomTagDropdown(e.target.value);
  });

  document.getElementById('saveTagBtn').addEventListener('click', () => {
    const tagName = document.getElementById('tagNameInput').value.trim();
    const tagColor = document.getElementById('tagColorInput').value;
    if (!tagName) {
      alert('Please enter a tag name.');
      return;
    }
    addTagToFile(file, { name: tagName, color: tagColor });
    updateTagModalDisplay(file);
    updateFileRowTagDisplay(file);
    saveFileTags(file);
    document.getElementById('tagNameInput').value = '';
    updateCustomTagDropdown();
  });
}

/**
 * Open a modal to tag multiple files.
 * @param {Array} files - Array of file objects to tag.
 */
export function openMultiTagModal(files) {
  let modal = document.createElement('div');
  modal.id = 'multiTagModal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content" style="width: 400px; max-width:90vw;">
      <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center;">
        <h3 style="margin:0;">Tag Selected Files (${files.length})</h3>
        <span id="closeMultiTagModal" style="cursor:pointer; font-size:24px;">&times;</span>
      </div>
      <div class="modal-body" style="margin-top:10px;">
        <label for="multiTagNameInput">Tag Name:</label>
        <input type="text" id="multiTagNameInput" placeholder="Enter tag name" style="width:100%; padding:5px;"/>
        <br><br>
        <label for="multiTagColorInput">Tag Color:</label>
        <input type="color" id="multiTagColorInput" value="#ff0000" style="width:100%; padding:5px;"/>
        <br><br>
        <div id="multiCustomTagDropdown" style="max-height:150px; overflow-y:auto; border:1px solid #ccc; margin-top:5px; padding:5px;">
          <!-- Custom tag options will be populated here -->
        </div>
        <br>
        <div style="text-align:right;">
          <button id="saveMultiTagBtn" class="btn btn-primary">Save Tag to Selected</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.style.display = 'block';

  updateMultiCustomTagDropdown();

  document.getElementById('closeMultiTagModal').addEventListener('click', () => {
    modal.remove();
  });

  document.getElementById('multiTagNameInput').addEventListener('input', (e) => {
    updateMultiCustomTagDropdown(e.target.value);
  });

  document.getElementById('saveMultiTagBtn').addEventListener('click', () => {
    const tagName = document.getElementById('multiTagNameInput').value.trim();
    const tagColor = document.getElementById('multiTagColorInput').value;
    if (!tagName) {
      alert('Please enter a tag name.');
      return;
    }
    files.forEach(file => {
      addTagToFile(file, { name: tagName, color: tagColor });
      updateFileRowTagDisplay(file);
      saveFileTags(file);
    });
    modal.remove();
  });
}

/**
 * Update the custom dropdown for multi-tag modal.
 * Similar to updateCustomTagDropdown but includes a remove icon.
 */
function updateMultiCustomTagDropdown(filterText = "") {
  const dropdown = document.getElementById("multiCustomTagDropdown");
  if (!dropdown) return;
  dropdown.innerHTML = "";
  let tags = window.globalTags || [];
  if (filterText) {
    tags = tags.filter(tag => tag.name.toLowerCase().includes(filterText.toLowerCase()));
  }
  if (tags.length > 0) {
    tags.forEach(tag => {
      const item = document.createElement("div");
      item.style.cursor = "pointer";
      item.style.padding = "5px";
      item.style.borderBottom = "1px solid #eee";
      // Display colored square and tag name with remove icon.
      item.innerHTML = `
        <span style="display:inline-block; width:16px; height:16px; background-color:${tag.color}; border:1px solid #ccc; margin-right:5px; vertical-align:middle;"></span>
        ${escapeHTML(tag.name)}
        <span class="global-remove" style="color:red; font-weight:bold; margin-left:5px; cursor:pointer;">×</span>
      `;
      item.addEventListener("click", function(e) {
        if (e.target.classList.contains("global-remove")) return;
        document.getElementById("multiTagNameInput").value = tag.name;
        document.getElementById("multiTagColorInput").value = tag.color;
      });
      item.querySelector('.global-remove').addEventListener("click", function(e){
        e.stopPropagation();
        removeGlobalTag(tag.name);
      });
      dropdown.appendChild(item);
    });
  } else {
    dropdown.innerHTML = "<div style='padding:5px;'>No tags available</div>";
  }
}

function updateCustomTagDropdown(filterText = "") {
  const dropdown = document.getElementById("customTagDropdown");
  if (!dropdown) return;
  dropdown.innerHTML = "";
  let tags = window.globalTags || [];
  if (filterText) {
    tags = tags.filter(tag => tag.name.toLowerCase().includes(filterText.toLowerCase()));
  }
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
        document.getElementById("tagNameInput").value = tag.name;
        document.getElementById("tagColorInput").value = tag.color;
      });
      item.querySelector('.global-remove').addEventListener("click", function(e){
        e.stopPropagation();
        removeGlobalTag(tag.name);
      });
      dropdown.appendChild(item);
    });
  } else {
    dropdown.innerHTML = "<div style='padding:5px;'>No tags available</div>";
  }
}
    
// Update the modal display to show current tags on the file.
function updateTagModalDisplay(file) {
  const container = document.getElementById('currentTags');
  if (!container) return;
  container.innerHTML = '<strong>Current Tags:</strong> ';
  if (file.tags && file.tags.length > 0) {
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
    container.innerHTML += 'None';
  }
}

function removeTagFromFile(file, tagName) {
  file.tags = file.tags.filter(t => t.name.toLowerCase() !== tagName.toLowerCase());
  updateTagModalDisplay(file);
  updateFileRowTagDisplay(file);
  saveFileTags(file);
}

/**
 * Remove a tag from the global tag store.
 * This function updates window.globalTags and calls the backend endpoint
 * to remove the tag from the persistent store.
 */
function removeGlobalTag(tagName) {
  window.globalTags = window.globalTags.filter(t => t.name.toLowerCase() !== tagName.toLowerCase());
  localStorage.setItem('globalTags', JSON.stringify(window.globalTags));
  updateCustomTagDropdown();
  updateMultiCustomTagDropdown();
  saveGlobalTagRemoval(tagName);
}

// NEW: Save global tag removal to the server.
function saveGlobalTagRemoval(tagName) {
  fetch("saveFileTag.php", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": window.csrfToken
    },
    body: JSON.stringify({
      folder: "root",
      file: "global",
      deleteGlobal: true,
      tagToDelete: tagName,
      tags: []
    })
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        console.log("Global tag removed:", tagName);
        if (data.globalTags) {
          window.globalTags = data.globalTags;
          localStorage.setItem('globalTags', JSON.stringify(window.globalTags));
          updateCustomTagDropdown();
          updateMultiCustomTagDropdown();
        }
      } else {
        console.error("Error removing global tag:", data.error);
      }
    })
    .catch(err => {
      console.error("Error removing global tag:", err);
    });
}
  
// Global store for reusable tags.
window.globalTags = window.globalTags || [];
if (localStorage.getItem('globalTags')) {
  try {
    window.globalTags = JSON.parse(localStorage.getItem('globalTags'));
  } catch (e) { }
}
  
// New function to load global tags from the server's persistent JSON.
export function loadGlobalTags() {
  fetch("getFileTag.php", { credentials: "include" })
    .then(response => {
      if (!response.ok) {
        // If the file doesn't exist, assume there are no global tags.
        return [];
      }
      return response.json();
    })
    .then(data => {
      window.globalTags = data;
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
  
// Add (or update) a tag in the file object.
export function addTagToFile(file, tag) {
  if (!file.tags) {
    file.tags = [];
  }
  const exists = file.tags.find(t => t.name.toLowerCase() === tag.name.toLowerCase());
  if (exists) {
    exists.color = tag.color;
  } else {
    file.tags.push(tag);
  }
  const globalExists = window.globalTags.find(t => t.name.toLowerCase() === tag.name.toLowerCase());
  if (!globalExists) {
    window.globalTags.push(tag);
    localStorage.setItem('globalTags', JSON.stringify(window.globalTags));
  }
}
  
// Update the file row (in table view) to show tag badges.
export function updateFileRowTagDisplay(file) {
  const rows = document.querySelectorAll(`[id^="file-row-${encodeURIComponent(file.name)}"]`);
  console.log('Updating tags for rows:', rows);
  rows.forEach(row => {
    let cell = row.querySelector('.file-name-cell');
    if (cell) {
      let badgeContainer = cell.querySelector('.tag-badges');
      if (!badgeContainer) {
        badgeContainer = document.createElement('div');
        badgeContainer.className = 'tag-badges';
        badgeContainer.style.display = 'inline-block';
        badgeContainer.style.marginLeft = '5px';
        cell.appendChild(badgeContainer);
      }
      badgeContainer.innerHTML = '';
      if (file.tags && file.tags.length > 0) {
        file.tags.forEach(tag => {
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
      }
    }
  });
}
  
export function initTagSearch() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    let tagSearchInput = document.getElementById('tagSearchInput');
    if (!tagSearchInput) {
      tagSearchInput = document.createElement('input');
      tagSearchInput.id = 'tagSearchInput';
      tagSearchInput.placeholder = 'Filter by tag';
      tagSearchInput.style.marginLeft = '10px';
      tagSearchInput.style.padding = '5px';
      searchInput.parentNode.insertBefore(tagSearchInput, searchInput.nextSibling);
      tagSearchInput.addEventListener('input', () => {
        window.currentTagFilter = tagSearchInput.value.trim().toLowerCase();
        if (window.currentFolder) {
          renderFileTable(window.currentFolder);
        }
      });
    }
  }
}
  
export function filterFilesByTag(files) {
  if (window.currentTagFilter && window.currentTagFilter !== '') {
    return files.filter(file => {
      if (file.tags && file.tags.length > 0) {
        return file.tags.some(tag => tag.name.toLowerCase().includes(window.currentTagFilter));
      }
      return false;
    });
  }
  return files;
}
  
function updateGlobalTagList() {
  const dataList = document.getElementById("globalTagList");
  if (dataList) {
    dataList.innerHTML = "";
    window.globalTags.forEach(tag => {
      const option = document.createElement("option");
      option.value = tag.name;
      dataList.appendChild(option);
    });
  }
}
  
export function saveFileTags(file, deleteGlobal = false, tagToDelete = null) {
  const folder = file.folder || "root";
  const payload = {
    folder: folder,
    file: file.name,
    tags: file.tags
  };
  if (deleteGlobal && tagToDelete) {
    payload.file = "global";
    payload.deleteGlobal = true;
    payload.tagToDelete = tagToDelete;
  }
  fetch("saveFileTag.php", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": window.csrfToken
    },
    body: JSON.stringify(payload)
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        console.log("Tags saved:", data);
        if (data.globalTags) {
          window.globalTags = data.globalTags;
          localStorage.setItem('globalTags', JSON.stringify(window.globalTags));
          updateCustomTagDropdown();
          updateMultiCustomTagDropdown();
        }
      } else {
        console.error("Error saving tags:", data.error);
      }
    })
    .catch(err => {
      console.error("Error saving tags:", err);
    });
}