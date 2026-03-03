import { t } from './i18n.js?v={{APP_QVER}}';
import { showToast, escapeHTML } from './domUtils.js?v={{APP_QVER}}';

export function loadShareLinksSection() {
  const container =
    document.getElementById('shareLinksList') ||
    document.getElementById('shareLinksContent');
  if (!container) return;

  container.textContent = t('loading') + '...';

  function fetchMeta(fileName) {
    return fetch(`/api/admin/readMetadata.php?file=${encodeURIComponent(fileName)}`, {
      credentials: 'include'
    })
      .then((resp) => (resp.ok ? resp.json() : {}))
      .catch(() => ({}));
  }

  Promise.all([
    fetchMeta('share_folder_links.json'),
    fetchMeta('share_links.json')
  ])
    .then(([folders, files]) => {
      const esc = (val) => escapeHTML(val == null ? '' : String(val));
      const asMap = (obj) => (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
      const folderMap = asMap(folders);
      const fileMap = asMap(files);

      const truthy = (v) => {
        if (v === true || v === 1) return true;
        const s = String(v ?? '').trim().toLowerCase();
        return s === '1' || s === 'true' || s === 'yes' || s === 'on';
      };
      const isFileRequest = (record) => {
        if (!record || typeof record !== 'object') return false;
        const mode = String(record.mode || '').toLowerCase();
        return mode === 'drop' || truthy(record.fileDrop) || truthy(record.fileDropMode) || truthy(record.hideListing);
      };
      const creatorOf = (record) => {
        if (!record || typeof record !== 'object') return '';
        const candidates = [record.createdBy, record.created_by, record.startedBy, record.user, record.username];
        for (const val of candidates) {
          if (typeof val === 'string' && val.trim() !== '') {
            return val.trim();
          }
        }
        return '';
      };
      const sourceHtmlFor = (record) => {
        const sourceLabel = record?.sourceName || record?.sourceId || '';
        if (!sourceLabel || sourceLabel.toLowerCase() === 'local') {
          return '';
        }
        return ` <small class="text-muted">[${esc(sourceLabel)}]</small>`;
      };
      const creatorHtmlFor = (record) => {
        const creator = creatorOf(record);
        if (!creator) {
          return '';
        }
        return ` <small class="text-muted">${esc(t('shared_created_by', { user: creator }))}</small>`;
      };
      const expiryHtmlFor = (record) => {
        const expires = Number(record?.expires || 0);
        if (!Number.isFinite(expires) || expires <= 0) {
          return '';
        }
        return ` <small>(${esc(new Date(expires * 1000).toLocaleString())})</small>`;
      };

      const folderEntries = Object.entries(folderMap).filter(([, o]) => o && typeof o === 'object');
      const fileEntries = Object.entries(fileMap).filter(([, o]) => o && typeof o === 'object');
      const folderShareEntries = [];
      const fileRequestEntries = [];
      folderEntries.forEach((entry) => {
        if (isFileRequest(entry[1])) {
          fileRequestEntries.push(entry);
        } else {
          folderShareEntries.push(entry);
        }
      });

      const hasAny = folderShareEntries.length || fileRequestEntries.length || fileEntries.length;
      if (!hasAny) {
        container.innerHTML = `<p>${t('no_shared_links_available')}</p>`;
        return;
      }

      const emptyItem = `<li><small class="text-muted">${esc(t('none'))}</small></li>`;
      let html = `<h5>${esc(t('folder_shares'))}</h5><ul>`;
      if (folderShareEntries.length === 0) {
        html += emptyItem;
      }
      folderShareEntries.forEach(([token, o]) => {
        const lock = o.password ? '🔒 ' : '';
        const tokenValue = o.token || token;
        const folderLabel = esc(o.folder || 'root');
        html += `
          <li>
            ${lock}<strong>${folderLabel}</strong>${sourceHtmlFor(o)}${creatorHtmlFor(o)}${expiryHtmlFor(o)}
            <button type="button"
                    data-key="${esc(tokenValue)}"
                    data-source-id="${esc(o.sourceId || '')}"
                    data-type="folder"
                    class="btn btn-sm btn-link delete-share">🗑️</button>
          </li>`;
      });

      html += `</ul><h5 style="margin-top:1em;">${esc(t('file_requests'))}</h5><ul>`;
      if (fileRequestEntries.length === 0) {
        html += emptyItem;
      }
      fileRequestEntries.forEach(([token, o]) => {
        const lock = o.password ? '🔒 ' : '';
        const tokenValue = o.token || token;
        const folderLabel = esc(o.folder || 'root');
        html += `
          <li>
            ${lock}<strong>${folderLabel}</strong>${sourceHtmlFor(o)}${creatorHtmlFor(o)}${expiryHtmlFor(o)}
            <button type="button"
                    data-key="${esc(tokenValue)}"
                    data-source-id="${esc(o.sourceId || '')}"
                    data-type="folder"
                    class="btn btn-sm btn-link delete-share">🗑️</button>
          </li>`;
      });

      html += `</ul><h5 style="margin-top:1em;">${esc(t('file_shares'))}</h5><ul>`;
      if (fileEntries.length === 0) {
        html += emptyItem;
      }
      fileEntries.forEach(([token, o]) => {
        const lock = o.password ? '🔒 ' : '';
        const tokenValue = o.token || token;
        const folderLabel = esc(o.folder || 'root');
        const fileLabel = esc(o.file || '');
        const pathLabel = fileLabel ? `${folderLabel}/${fileLabel}` : folderLabel;
        html += `
          <li>
            ${lock}<strong>${pathLabel}</strong>${sourceHtmlFor(o)}${creatorHtmlFor(o)}${expiryHtmlFor(o)}
            <button type="button"
                    data-key="${esc(tokenValue)}"
                    data-source-id="${esc(o.sourceId || '')}"
                    data-type="file"
                    class="btn btn-sm btn-link delete-share">🗑️</button>
          </li>`;
      });
      html += '</ul>';

      container.innerHTML = html;

      container.querySelectorAll('.delete-share').forEach((btn) => {
        btn.addEventListener('click', (evt) => {
          evt.preventDefault();
          const token = btn.dataset.key;
          const sourceId = btn.dataset.sourceId || '';
          const isFolder = btn.dataset.type === 'folder';
          const endpoint = isFolder
            ? '/api/folder/deleteShareFolderLink.php'
            : '/api/file/deleteShareLink.php';

          const csrfToken =
            (document.querySelector('meta[name="csrf-token"]')?.content || window.csrfToken || '');

          const body = new URLSearchParams({ token });
          if (sourceId) {
            body.set('sourceId', sourceId);
          }

          fetch(endpoint, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-CSRF-Token': csrfToken
            },
            body
          })
            .then((res) => {
              if (!res.ok) {
                if (res.status === 403) {
                  // Optional: nicer message when CSRF/session is bad
                  showToast(t('admin_share_delete_forbidden'), 'error');
                }
                return Promise.reject(res);
              }
              return res.json();
            })
            .then((json) => {
              if (json.success) {
                showToast(t('share_deleted_successfully'));
                loadShareLinksSection();
              } else {
                showToast(t('error_deleting_share') + ': ' + (json.error || ''), 'error');
              }
            })
            .catch((err) => {
              console.error('Delete error:', err);
              showToast(t('error_deleting_share'), 'error');
            });
        });
      });
    })
    .catch((err) => {
      console.error('loadShareLinksSection error:', err);
      container.textContent = t('error_loading_share_links');
    });
}
