// public/js/adminStorage.js
import { t } from './i18n.js?v={{APP_QVER}}';
import { showToast } from './domUtils.js?v={{APP_QVER}}';
import { sendRequest } from './networkUtils.js?v={{APP_QVER}}';

// tiny helper like tf in adminPanel
const tf = (key, fallback) => {
  const v = t(key);
  return (v && v !== key) ? v : fallback;
};

function formatBytes(bytes) {
  bytes = Number(bytes) || 0;
  if (bytes <= 0) return '0 B';
  const units = ['B','KB','MB','GB','TB','PB'];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(val >= 100 ? 0 : val >= 10 ? 1 : 2)} ${units[i]}`;
}

function formatDate(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts * 1000);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString();
  } catch {
    return '';
  }
}

function getCsrfToken() {
  return (document.querySelector('meta[name="csrf-token"]')?.content || '');
}

let confirmModalEl = null;
let showAllTopFolders = false;

function ensureConfirmModal() {
  if (confirmModalEl) return confirmModalEl;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div class="modal fade" id="adminStorageConfirmModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content" style="border-radius: var(--menu-radius);">
          <div class="modal-header">
            <h5 class="modal-title" id="adminStorageConfirmTitle">${tf('confirm','Confirm')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${tf('close','Close')}"></button>
          </div>
          <div class="modal-body">
            <p id="adminStorageConfirmMessage" class="mb-0"></p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
              ${tf('cancel','Cancel')}
            </button>
            <button type="button" class="btn btn-danger" id="adminStorageConfirmOk">
              ${tf('delete','Delete')}
            </button>
          </div>
        </div>
      </div>
    </div>
  `.trim();

  confirmModalEl = wrapper.firstChild;
  document.body.appendChild(confirmModalEl);
  return confirmModalEl;
}

function showConfirmDialog({ title, message, confirmLabel }) {
  // Fallback to window.confirm if Bootstrap is not available
  if (!window.bootstrap || !window.bootstrap.Modal) {
    return Promise.resolve(window.confirm(message));
  }

  return new Promise(resolve => {
    const el = ensureConfirmModal();
    const titleEl = el.querySelector('#adminStorageConfirmTitle');
    const msgEl   = el.querySelector('#adminStorageConfirmMessage');
    const okBtn   = el.querySelector('#adminStorageConfirmOk');

    if (titleEl) titleEl.textContent = title || tf('confirm','Confirm');
    if (msgEl) msgEl.textContent = message || '';
    if (okBtn) okBtn.textContent = confirmLabel || tf('delete','Delete');

    const modal = window.bootstrap.Modal.getOrCreateInstance(el);

    const handleOk = () => {
      cleanup();
      resolve(true);
    };

    const handleHidden = () => {
      cleanup();
      resolve(false);
    };

    function cleanup() {
      if (!el) return;
      el.removeEventListener('hidden.bs.modal', handleHidden);
      if (okBtn) okBtn.removeEventListener('click', handleOk);
    }

    if (okBtn) okBtn.addEventListener('click', handleOk, { once: true });
    el.addEventListener('hidden.bs.modal', handleHidden, { once: true });

    modal.show();
  });
}

// --- module-level tracking ---

// snapshot / scanning
let lastGeneratedAt = 0;
let scanPollTimer = null;

// Pro-only dangerous mode: deep delete for folders
let deepDeleteEnabled = false;

// pro explorer
let isProGlobal = false;
let currentFolderKey = 'root';
let currentExplorerTab = 'folders'; // "folders" | "topFiles"
let folderMinSizeBytes = 0;
let topFilesMinSizeBytes = 0;

// ---------- Scan status ----------

function setScanStatus(isScanning) {
  const statusEl = document.getElementById('adminStorageScanStatus');
  if (!statusEl) return;

  if (!isScanning) {
    statusEl.innerHTML = '';
    return;
  }

  statusEl.innerHTML = `
    <div class="mb-1">
      <div class="progress" style="height: 6px;">
        <div
          class="progress-bar progress-bar-striped progress-bar-animated"
          role="progressbar"
          style="width: 100%;"
        ></div>
      </div>
    </div>
    <div class="small text-muted">
      ${tf('storage_scan_in_progress', 'Disk usage scan in progress...')}
    </div>
  `;
}

// Make sure delete buttons visually reflect whether deep delete is enabled
function updateDeleteButtonsForDeepDelete() {
    const host = document.getElementById('adminStorageProTeaser');
    if (!host) return;
  
    host.querySelectorAll('.admin-storage-delete-folder').forEach(btn => {
      const icon = btn.querySelector('.material-icons');
  
      if (deepDeleteEnabled) {
        btn.classList.remove('btn-outline-danger');
        btn.classList.add('btn-outline-warning');
        // let the icon inherit currentColor so it goes white on hover
        if (icon) icon.classList.remove('text-warning');
        btn.title = tf('storage_deep_delete_folder_title', 'Deep delete folder (no Trash)');
      } else {
        btn.classList.remove('btn-outline-warning');
        btn.classList.add('btn-outline-danger');
        if (icon) icon.classList.remove('text-warning');
        btn.title = tf('delete_folder', 'Delete folder');
      }
    });
  }
  
  // Wire the toggle switch in the explorer header
  function wireDeepDeleteToggle() {
    const toggle = document.getElementById('adminStorageDeepDeleteToggle');
    if (!toggle) return;
    if (toggle.dataset.wired === '1') return;
    toggle.dataset.wired = '1';
  
    toggle.addEventListener('change', () => {
      deepDeleteEnabled = !!toggle.checked;
      updateDeleteButtonsForDeepDelete();
    });
  }

// ---------- Layout ----------

/**
 * Render the basic layout (header, summary area, tabs placeholder) into storageContent.
 * Pro explorer UI gets injected into #adminStorageProTeaser later.
 */
function renderBaseLayout(container, { isPro }) {
    container.innerHTML = `
    <div class="storage-section mt-2">
      <div class="d-flex justify-content-between align-items-center mb-2">
          <div>
            <h5 class="mb-1">${tf('storage_disk_usage', 'Storage / Disk Usage')}</h5>
            <small class="text-muted">
              ${tf(
                'storage_disk_usage_help',
                'Analyze which folders and files are consuming space under your FileRise upload root.'
              )}
            </small>
          </div>
          <div class="text-end">
            <div class="btn-group" role="group">
              <button
                type="button"
                id="adminStorageRescan"
                class="btn btn-sm btn-primary">
                <i class="material-icons" style="vertical-align:middle;font-size:18px;color:currentColor;">refresh</i>
                <span style="vertical-align:middle;">${tf('rescan_now', 'Rescan')}</span>
              </button>
            </div>
            <div>
              <small class="text-muted d-block" id="adminStorageScanHint">
                ${
                  isPro
                    ? tf(
                        'storage_rescan_hint_pro',
                        'Run a fresh disk usage snapshot when storage changes.'
                      )
                    : tf(
                        'storage_rescan_cli_hint',
                        'Click Rescan to run a snapshot now, or schedule the CLI scanner via cron.'
                      )
                }
              </small>
            </div>
          </div>
        </div>
  
        <div id="adminStorageScanStatus" class="mb-2"></div>
  
        <div id="adminStorageSummary" class="mb-3">
          <div class="text-muted">${tf('loading', 'Loading...')}</div>
        </div>
  
        <div id="adminStorageProTeaser" class="mb-2">
          ${
            isPro
              ? `
            <!-- Pro explorer injected here at runtime -->
            `
              : `
            <div class="card" style="border-radius: var(--menu-radius); overflow:hidden; position:relative;">
              <div class="card-header py-2">
                <div class="d-flex justify-content-between align-items-center">
                  <div>
                    <strong>
                      ${tf('storage_explorer', 'Storage explorer')}
                      <span class="badge bg-warning text-dark ms-1 align-middle">Pro</span>
                    </strong>
                    <div class="small text-muted">
                      ${tf(
                        'storage_explorer_help',
                        'Drill down into folders or inspect the largest files.'
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div class="card-body p-2">
                <!-- Blurred fake table teaser -->
                <div class="table-responsive"
                     style="max-height:260px;overflow:hidden;filter:blur(3px);opacity:0.5;pointer-events:none;">
                  <table class="table table-sm mb-0">
                    <thead>
                      <tr>
                        <th>${tf('name','Name')}</th>
                        <th>${tf('size','Size')}</th>
                        <th>%</th>
                        <th>${tf('files','Files')}</th>
                        <th>${tf('modified','Modified')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr><td colspan="5">&nbsp;</td></tr>
                      <tr><td colspan="5">&nbsp;</td></tr>
                      <tr><td colspan="5">&nbsp;</td></tr>
                      <tr><td colspan="5">&nbsp;</td></tr>
                    </tbody>
                  </table>
                </div>
  
                <!-- Centered overlay copy -->
                <div
                  class="d-flex flex-column align-items-center justify-content-center text-center"
                  style="position:absolute; inset:0; padding:16px;">
                  <div class="mb-1">
                    <span class="badge bg-warning text-dark me-1">Pro</span>
                    <span class="fw-semibold">
                      ${tf('storage_pro_locked_title','Storage explorer is a Pro feature')}
                    </span>
                  </div>
                  <div class="small text-muted mb-2">
                    ${tf(
                      'storage_pro_locked_body',
                      'Upgrade to FileRise Pro to unlock folder drill-down, top files view, and inline cleanup tools.'
                    )}
                  </div>
                </div>
              </div>
            </div>
            `
          }
        </div>
      </div>
    `;
  }

// ---------- Summary / volumes ----------

/**
 * Fetch summary JSON only (no UI changes) – used for polling after rescan.
 */
async function fetchSummaryRaw() {
  try {
    const res = await fetch('/api/admin/diskUsageSummary.php?topFolders=20&topFiles=0', {
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-store' }
    });
    const text = await res.text();
    return JSON.parse(text || '{}');
  } catch (e) {
    console.error('fetchSummaryRaw error', e);
    return null;
  }
}

async function refreshStorageSummary() {
  const summaryEl = document.getElementById('adminStorageSummary');
  if (!summaryEl) return;

  summaryEl.innerHTML = `<div class="text-muted">${tf('loading', 'Loading...')}</div>`;

  const data = await fetchSummaryRaw();
  if (!data || !data.ok) {
    if (data && data.error === 'no_snapshot') {
      const cmd = 'php src/cli/disk_usage_scan.php';
      summaryEl.innerHTML = `
        <div class="alert alert-warning mb-2" style="border-radius: var(--menu-radius);">
          ${tf(
            'storage_no_snapshot',
            'No disk usage snapshot found. Run the CLI scanner once to generate the first snapshot.'
          )}
        </div>
        <pre class="small bg-light p-2 rounded border" style="user-select:text; white-space:pre-wrap;">
${cmd}
        </pre>
      `;
      return;
    }

    summaryEl.innerHTML = `
      <div class="text-danger">
        ${tf('storage_summary_error', 'Unable to load disk usage summary.')}
      </div>
    `;
    return;
  }

  // remember last snapshot timestamp for polling logic
  if (data.generatedAt) {
    lastGeneratedAt = data.generatedAt;
  }

  const totalBytes   = data.totalBytes || 0;
  const totalFiles   = data.totalFiles || 0;
  const totalFolders = data.totalFolders || 0;
  const generatedAt  = data.generatedAt || 0;
  const scanSeconds  = data.scanSeconds || 0;
  const topFolders   = Array.isArray(data.topFolders) ? data.topFolders : [];

  const totalSizeStr  = formatBytes(totalBytes);
  const scannedAtStr  = generatedAt
    ? formatDate(generatedAt)
    : tf('storage_never_scanned', 'Not available');

  // grouped volumes info from PHP
  const volumes = Array.isArray(data.volumes) ? data.volumes : [];

  // Decide how many top folders to display
const initialLimit = 5;
const displayTopFolders = (isProGlobal && showAllTopFolders)
  ? topFolders
  : topFolders.slice(0, initialLimit);

  const topRows = displayTopFolders.map(f => {
    const pct   = f.percentOfTotal || 0;
    const width = Math.max(3, Math.min(100, Math.round(pct)));
    const label = f.folder === 'root' ? '/' : `/${f.folder}`;
    return `
      <tr>
        <td class="align-middle">
          ${
            isProGlobal
              ? `<button type="button"
                         class="btn btn-link btn-sm p-0 admin-storage-summary-folder-link"
                         data-folder="${f.folder}">
                   <code>${label}</code>
                 </button>`
              : `<code>${label}</code>`
          }
        </td>
        <td class="align-middle text-nowrap">
          ${formatBytes(f.bytes || 0)}
        </td>
        <td class="align-middle text-nowrap">
          ${pct.toFixed(1)}%
        </td>
        <td class="align-middle" style="width:40%;">
          <div class="progress" style="height: 6px; background-color: rgba(0,0,0,0.05);">
            <div
              class="progress-bar"
              role="progressbar"
              style="width:${width}%;"
              aria-valuenow="${pct.toFixed(1)}"
              aria-valuemin="0"
              aria-valuemax="100">
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('') || `
      <tr>
        <td colspan="4" class="text-muted">
          ${tf('storage_no_folders', 'No folders found in snapshot.')}
        </td>
      </tr>
  `;

  // --- Volumes metrics block (Uploads / Users / Metadata) ---
  let rootVolumeHtml = '';

  if (volumes.length) {
    rootVolumeHtml = volumes.map((vol) => {
      const usedBytes   = Number(vol.usedBytes || 0);
      const totalBytesV = Number(vol.totalBytes || 0);
      const usedPercent = Number(vol.usedPercent || 0);
      const pctRounded  = Math.max(0, Math.min(100, Math.round(usedPercent)));

      const usedStr  = formatBytes(usedBytes);
      const totalStr = formatBytes(totalBytesV);

      const roots = Array.isArray(vol.roots) ? vol.roots : [];

      // Build a human label like "Uploads + Users" or "Uploads + Users + Metadata"
      const labelParts = [];
      const mounts = roots.map(r => {
        const kind = (r.kind || '').toLowerCase();
        let label;
        if (kind === 'uploads') label = tf('storage_kind_uploads', 'Uploads');
        else if (kind === 'users') label = tf('storage_kind_users', 'Users');
        else if (kind === 'meta') label = tf('storage_kind_meta', 'Metadata');
        else label = kind || 'Root';

        if (!labelParts.includes(label)) {
          labelParts.push(label);
        }

        return `<span class="me-2">${label}: <code>${r.path || ''}</code></span>`;
      }).join(' ');

      const volumeTitle = labelParts.length
        ? `${tf('storage_volume_label', 'Volume')} ${labelParts.join(' + ')}`
        : tf('storage_volume_generic', 'Volume');

      return `
        <div class="mt-2">
          <div class="small fw-bold mb-1">
            ${volumeTitle}
          </div>
          <div class="d-flex justify-content-between small">
            <span>${usedStr} / ${totalStr}</span>
            <span>${usedPercent.toFixed(1)}% ${tf('full', 'full')}</span>
          </div>
          <div class="progress mt-1" style="height: 6px;">
            <div
              class="progress-bar"
              role="progressbar"
              style="width:${pctRounded}%;"
              aria-valuenow="${usedPercent.toFixed(1)}"
              aria-valuemin="0"
              aria-valuemax="100">
            </div>
          </div>
          ${
            mounts
              ? `<div class="small text-muted mt-1">${mounts}</div>`
              : ''
          }
        </div>
      `;
    }).join('');
  } else {
    // Fallback to single-root view if volumes not present (old style)
    const fsTotalBytes  = data.fsTotalBytes ?? null;
    const fsUsedBytes   = data.fsUsedBytes ?? null;
    const fsUsedPercent = data.fsUsedPercent ?? null;
    const uploadRoot    = data.uploadRoot || '';

    if (fsTotalBytes && fsTotalBytes > 0 && fsUsedBytes != null && fsUsedPercent != null) {
      const usedStr  = formatBytes(fsUsedBytes);
      const totalStr = formatBytes(fsTotalBytes);
      const pct      = Math.max(0, Math.min(100, Math.round(fsUsedPercent)));

      rootVolumeHtml = `
        <div class="mt-2">
          <div class="small fw-bold mb-1">
            ${tf('storage_root_volume', 'Root volume')}
          </div>
          <div class="d-flex justify-content-between small">
            <span>${usedStr} / ${totalStr}</span>
            <span>${fsUsedPercent.toFixed(1)}% ${tf('full', 'full')}</span>
          </div>
          <div class="progress mt-1" style="height: 6px;">
            <div
              class="progress-bar"
              role="progressbar"
              style="width:${pct}%;"
              aria-valuenow="${fsUsedPercent.toFixed(1)}"
              aria-valuemin="0"
              aria-valuemax="100">
            </div>
          </div>
          ${
            uploadRoot
              ? `<div class="small text-muted mt-1">
                   ${tf('storage_root_path', 'Upload root')}: <code>${uploadRoot}</code>
                 </div>`
              : ''
          }
        </div>
      `;
    }
  }

  summaryEl.innerHTML = `
  <div class="card mb-2" style="border-radius: var(--menu-radius); overflow: hidden;">
    <div class="card-body py-2">
      <div class="row">
        <div class="col-12 col-md-4">
          <div class="fw-bold">
            ${tf('storage_total_used', 'Total used (FileRise snapshot)')}
          </div>
          <div>${totalSizeStr}</div>
        </div>
        <div class="col-6 col-md-4">
          <div class="fw-bold">
            ${tf('storage_total_files', 'Total files')}
          </div>
          <div>${totalFiles.toLocaleString()}</div>
        </div>
        <div class="col-6 col-md-4 text-md-end">
          <div class="fw-bold">
            ${tf('storage_total_folders', 'Total folders')}
          </div>
          <div>${totalFolders.toLocaleString()}</div>
        </div>
      </div>
      <div class="mt-2 small text-muted">
        ${tf('storage_last_scan', 'Last scan:')} ${scannedAtStr}
        ${scanSeconds ? ` &middot; ${scanSeconds.toFixed(1)}s` : ''}
      </div>
      ${rootVolumeHtml}
    </div>
  </div>

    <div class="card" style="border-radius: var(--menu-radius); overflow: hidden;">
      <div class="card-header py-2">
        <strong>${tf('storage_top_folders', 'Top folders by size')}</strong>
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table table-sm mb-0">
            <thead>
              <tr>
                <th>${tf('folder', 'Folder')}</th>
                <th>${tf('size', 'Size')}</th>
                <th>%</th>
                <th style="width:40%;">${tf('usage', 'Usage')}</th>
              </tr>
            </thead>
            <tbody>
              ${topRows}
            </tbody>
          </table>
        </div>
      <div class="d-flex justify-content-end px-2 py-1 border-top small" id="adminStorageTopFoldersMoreWrap"></div>
    </div>
  `;
      // Make "Top folders by size" clickable for Pro: jump into explorer
  if (isProGlobal) {
    summaryEl.querySelectorAll('.admin-storage-summary-folder-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const folder = btn.getAttribute('data-folder') || 'root';
        const host = document.getElementById('adminStorageProTeaser');
        if (host && !document.getElementById('adminStorageExplorerInner')) {
          renderProExplorerSkeleton();
        }
        switchExplorerTab('folders');
        currentFolderKey = folder;
        loadFolderChildren(folder);
      });
    });
  }

  // Pro: "Show more / Show less" for Top folders by size
  const moreWrap = summaryEl.querySelector('#adminStorageTopFoldersMoreWrap');
  if (isProGlobal && moreWrap && topFolders.length > 5) {
    const label = showAllTopFolders
      ? tf('storage_top_folders_show_less', 'Show top 5')
      : tf('storage_top_folders_show_more', 'Show more');

      moreWrap.innerHTML = `
      <button type="button" class="btn btn-sm btn-link p-0" id="adminStorageTopFoldersToggle">
        ${label}
        <span class="badge bg-warning text-dark ms-1 align-middle">Pro</span>
      </button>
    `;

    const toggleBtn = moreWrap.querySelector('#adminStorageTopFoldersToggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        showAllTopFolders = !showAllTopFolders;
        refreshStorageSummary();
      });
    }
  }
}

// ---------- Scan polling ----------

/**
 * Poll for a new snapshot after a rescan is triggered.
 * We don't know real progress %, but as soon as generatedAt increases
 * we refresh the summary and stop polling.
 */
function startScanPolling(initialGeneratedAt) {
  if (scanPollTimer) {
    clearInterval(scanPollTimer);
    scanPollTimer = null;
  }

  setScanStatus(true);
  const startTime = Date.now();
  const maxMs = 10 * 60 * 1000; // 10 minutes safety

  scanPollTimer = window.setInterval(async () => {
    if (Date.now() - startTime > maxMs) {
      clearInterval(scanPollTimer);
      scanPollTimer = null;
      setScanStatus(false);
      return;
    }

    const data = await fetchSummaryRaw();
    if (!data || !data.ok) {
      // still no snapshot / error, keep waiting
      return;
    }

    const gen = data.generatedAt || 0;
    if (gen && gen > initialGeneratedAt) {
      clearInterval(scanPollTimer);
      scanPollTimer = null;
      lastGeneratedAt = gen;
      // refresh full UI once
      await refreshStorageSummary();
      setScanStatus(false);
      showToast(tf('storage_scan_complete', 'Disk usage scan completed.'));
    }
  }, 4000);
}

/**
 * Wire the Rescan button (Pro) to /api/pro/diskUsageTriggerScan.php
 */
function wireRescan(/* isPro */) {
  const btn = document.getElementById('adminStorageRescan');
  const hintEl = document.getElementById('adminStorageScanHint');
  if (!btn) return;

  if (btn.dataset.wired === '1') return;
  btn.dataset.wired = '1';

  btn.addEventListener('click', async () => {
    const initialGenerated = lastGeneratedAt || 0;

    btn.disabled = true;
    const oldHtml = btn.innerHTML;
    btn.innerHTML = `
      <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
      <span class="ms-1">${tf('scanning', 'Scanning...')}</span>
    `;

    try {
      const payload = await sendRequest('/api/admin/diskUsageTriggerScan.php', 'POST', null, {
        'X-CSRF-Token': getCsrfToken()
      });

      if (!payload || payload.ok !== true) {
        showToast(
          tf('storage_rescan_failed', 'Failed to start scan (see logs).')
        );
      } else {
        showToast(
          tf('storage_rescan_started', 'Disk usage scan started in the background.')
        );
        if (hintEl) {
          hintEl.textContent = tf(
            'storage_rescan_hint_with_log',
            'Scan is running in the background. The summary will update when it finishes.'
          );
        }
        startScanPolling(initialGenerated);
      }
    } catch (err) {
      console.error('Rescan error', err);
      showToast(
        tf('storage_rescan_failed', 'Failed to start scan (see logs).')
      );
      setScanStatus(false);
    } finally {
      btn.disabled = false;
      btn.innerHTML = oldHtml;
    }
  });
}

// ---------- Pro Explorer (ncdu-style) ----------

function renderProExplorerSkeleton() {
    const host = document.getElementById('adminStorageProTeaser');
    if (!host || host.dataset.inited === '1') return;
    host.dataset.inited = '1';
  
    host.innerHTML = `
      <div class="card" style="border-radius: var(--menu-radius); overflow:hidden;">
        <div class="card-header py-2">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <strong>
  ${tf('storage_explorer', 'Storage explorer')}
  <span class="badge bg-warning text-dark ms-1 align-middle">Pro</span>
</strong>
              <div class="small text-muted">
                ${tf('storage_explorer_help', 'Drill down into folders or inspect the largest files.')}
              </div>
            </div>
            <div class="d-flex align-items-center gap-3">
              <div class="btn-group btn-group-sm" role="group" id="adminStorageExplorerTabs">
                <button
                  type="button"
                  id="adminStorageTabFolders"
                  class="btn btn-outline-secondary active"
                  data-tab="folders">
                  ${tf('storage_tab_folders','Folders')}
                </button>
                <button
                  type="button"
                  id="adminStorageTabTopFiles"
                  class="btn btn-outline-secondary"
                  data-tab="topfiles">
                  ${tf('storage_tab_topfiles','Top files')}
                </button>
              </div>
              <div class="form-check fr-toggle">
                <input
                  class="form-check-input fr-toggle-input"
                  type="checkbox"
                  id="adminStorageDeepDeleteToggle">
                <label class="form-check-label small" for="adminStorageDeepDeleteToggle">
  ${tf('storage_deep_delete_toggle', 'Deep delete')}
  <span class="badge bg-warning text-dark ms-1 align-middle">Pro</span>
</label>
              </div>
            </div>
          </div>
        </div>
        <div class="card-body p-2">
          <div class="row g-2 mb-2">
  <div class="col-12 col-md-6" id="adminStorageFolderFilterWrap">
    <label class="form-label form-label-sm mb-0">
      ${tf('storage_folder_min_size','Min folder/file size')}
    </label>
    <select id="adminStorageFolderMinSize" class="form-select form-select-sm">
      <option value="0">${tf('storage_any_size','Any size')}</option>
      <option value="1048576">≥ 1 MB</option>
      <option value="10485760">≥ 10 MB</option>
      <option value="52428800">≥ 50 MB</option>
      <option value="104857600">≥ 100 MB</option>
      <option value="1073741824">≥ 1 GB</option>
    </select>
  </div>
  <div class="col-12 col-md-6" id="adminStorageTopFilesFilterWrap">
    <label class="form-label form-label-sm mb-0">
      ${tf('storage_topfiles_min_size','Min file size (Top files)')}
    </label>
    <select id="adminStorageTopFilesMinSize" class="form-select form-select-sm">
      <option value="0">${tf('storage_any_size','Any size')}</option>
      <option value="1048576">≥ 1 MB</option>
      <option value="10485760">≥ 10 MB</option>
      <option value="52428800">≥ 50 MB</option>
      <option value="104857600">≥ 100 MB</option>
      <option value="1073741824">≥ 1 GB</option>
    </select>
  </div>
</div>
          </div>
  
          <div class="mb-2 small" id="adminStorageBreadcrumb"></div>
          <div id="adminStorageExplorerInner" class="small"></div>
        </div>
      </div>
    `;
  
    wireDeepDeleteToggle();
    deepDeleteEnabled = false;
    updateDeleteButtonsForDeepDelete();

  const tabFolders = document.getElementById('adminStorageTabFolders');
  const tabTopFiles = document.getElementById('adminStorageTabTopFiles');
  const folderMin = document.getElementById('adminStorageFolderMinSize');
  const topMin = document.getElementById('adminStorageTopFilesMinSize');

  if (tabFolders && tabTopFiles) {
    tabFolders.addEventListener('click', () => {
      switchExplorerTab('folders');
    });
    tabTopFiles.addEventListener('click', () => {
      switchExplorerTab('topFiles');
    });
  }

  if (folderMin) {
    folderMin.addEventListener('change', () => {
      folderMinSizeBytes = Number(folderMin.value || '0') || 0;
      if (currentExplorerTab === 'folders') {
        loadFolderChildren(currentFolderKey);
      }
    });
  }

  if (topMin) {
    topMin.addEventListener('change', () => {
      topFilesMinSizeBytes = Number(topMin.value || '0') || 0;
      if (currentExplorerTab === 'topFiles') {
        loadTopFiles();
      }
    });
  }
}

function setBreadcrumb(folderKey) {
  const el = document.getElementById('adminStorageBreadcrumb');
  if (!el) return;

  // Clear existing content safely
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }

  let parts = [];
  if (folderKey && folderKey !== 'root') {
    const clean = folderKey.replace(/^\/+|\/+$/g, '');
    parts = clean ? clean.split('/') : [];
  }

  // Helper: add a simple separator " / "
  const appendSeparator = () => {
    const sep = document.createElement('span');
    sep.className = 'mx-1';
    sep.textContent = '/';
    el.appendChild(sep);
  };

  // Root crumb
  const rootBtn = document.createElement('button');
  rootBtn.type = 'button';
  rootBtn.className = 'btn btn-link btn-sm p-0 admin-storage-bc';
  rootBtn.dataset.folder = 'root';

  const rootIcon = document.createElement('span');
  rootIcon.className = 'material-icons';
  rootIcon.style.fontSize = '16px';
  rootIcon.style.verticalAlign = 'middle';
  rootIcon.style.color = 'currentColor';
  rootIcon.textContent = 'home';

  const rootText = document.createElement('span');
  rootText.style.verticalAlign = 'middle';
  rootText.textContent = tf('storage_root_label', 'root');

  rootBtn.appendChild(rootIcon);
  rootBtn.appendChild(rootText);
  el.appendChild(rootBtn);

  let accum = '';
  parts.forEach((p, idx) => {
    appendSeparator();
    accum = accum ? (accum + '/' + p) : p;
    const isLast = idx === parts.length - 1;

    if (isLast) {
      const span = document.createElement('span');
      span.className = 'fw-semibold';
      span.textContent = p;
      el.appendChild(span);
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-link btn-sm p-0 admin-storage-bc';
      btn.dataset.folder = accum;
      btn.textContent = p;
      el.appendChild(btn);
    }
  });

  // breadcrumb click handling
  el.querySelectorAll('.admin-storage-bc').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = btn.getAttribute('data-folder') || 'root';
      currentFolderKey = f;
      loadFolderChildren(f);
    });
  });
}

/**
 * Switch between "folders" and "topFiles" tabs.
 */
function switchExplorerTab(tab) {
  currentExplorerTab = tab === 'topFiles' ? 'topFiles' : 'folders';

  const tabFolders = document.getElementById('adminStorageTabFolders');
  const tabTopFiles = document.getElementById('adminStorageTabTopFiles');
  const folderFilterWrap = document.getElementById('adminStorageFolderFilterWrap');
  const topFilterWrap = document.getElementById('adminStorageTopFilesFilterWrap');

  if (tabFolders && tabTopFiles) {
    if (currentExplorerTab === 'folders') {
      tabFolders.classList.add('active');
      tabTopFiles.classList.remove('active');
    } else {
      tabTopFiles.classList.add('active');
      tabFolders.classList.remove('active');
    }
  }

  if (folderFilterWrap && topFilterWrap) {
    folderFilterWrap.style.display = currentExplorerTab === 'folders' ? '' : 'none';
    topFilterWrap.style.display = currentExplorerTab === 'topFiles' ? '' : 'none';
  }

  if (currentExplorerTab === 'folders') {
    loadFolderChildren(currentFolderKey);
  } else {
    setBreadcrumb('root'); // breadcrumb not super meaningful for global top files, but keep root
    loadTopFiles();
  }
}

async function loadFolderChildren(folderKey) {
  currentFolderKey = folderKey || 'root';

  const inner = document.getElementById('adminStorageExplorerInner');
  if (!inner) return;

  inner.innerHTML = `
    <div class="text-muted small">
      ${tf('loading','Loading...')}
    </div>
  `;

  setBreadcrumb(currentFolderKey);

  let data;
  try {
    const url = `/api/pro/diskUsageChildren.php?folder=${encodeURIComponent(currentFolderKey)}`;
    const res = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-store' }
    });
    const text = await res.text();
    data = JSON.parse(text || '{}');
  } catch (e) {
    console.error('loadFolderChildren error', e);
    inner.innerHTML = `<div class="text-danger small">
      ${tf('storage_children_error','Please upgrade to the latest FileRise Pro bundle to use the Storage explorer.')}
    </div>`;
    return;
  }

  if (!data || !data.ok) {
    if (data && data.error === 'no_snapshot') {
      inner.innerHTML = `<div class="text-warning small">
        ${tf('storage_no_snapshot','No disk usage snapshot found. Run the disk usage scan first.')}
      </div>`;
    } else {
      // Special-case: backend missing ProDiskUsage / outdated Pro bundle
      let msgKey = 'storage_children_error';
      let fallback = 'Please upgrade to the latest FileRise Pro bundle to use the Storage explorer.';

      if (
        data &&
        data.error === 'internal_error' &&
        data.message &&
        /ProDiskUsage/i.test(String(data.message))
      ) {
        msgKey = 'storage_pro_bundle_outdated';
        fallback = 'Please upgrade to the latest FileRise Pro bundle to use the Storage explorer.';
      }

      inner.innerHTML = `<div class="text-danger small">
        ${tf(msgKey, fallback)}
      </div>`;
    }
    return;
  }

  const folders = Array.isArray(data.folders) ? data.folders : [];
  const files   = Array.isArray(data.files)   ? data.files   : [];

  const minBytes = folderMinSizeBytes || 0;

  const filteredFolders = folders.filter(f => Number(f.bytes || 0) >= minBytes);
  const filteredFiles   = files.filter(f => Number(f.bytes || 0) >= minBytes);

  // Build a unified list for pagination: { kind: 'folder' | 'file', item }
  const entries = [];
  filteredFolders.forEach(f => entries.push({ kind: 'folder', item: f }));
  filteredFiles.forEach(file => entries.push({ kind: 'file', item: file }));

  const total = entries.length;
  const pageSize = 100;
  let shown = Math.min(pageSize, total);

  function renderPage() {
    const hasRows = total > 0;
    const slice = hasRows ? entries.slice(0, shown) : [];

    // Clear container
    inner.innerHTML = '';

    // Table wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'table-responsive';
    wrapper.style.maxHeight = '340px';
    wrapper.style.overflow = 'auto';

    const table = document.createElement('table');
    table.className = 'table table-sm mb-0';

    // ----- thead -----
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');

    const thName = document.createElement('th');
    thName.textContent = tf('name','Name');
    headRow.appendChild(thName);

    const thSize = document.createElement('th');
    thSize.textContent = tf('size','Size');
    headRow.appendChild(thSize);

    const thPct = document.createElement('th');
    thPct.textContent = '%';
    headRow.appendChild(thPct);

    const thFiles = document.createElement('th');
    thFiles.textContent = tf('files','Files');
    headRow.appendChild(thFiles);

    const thMod = document.createElement('th');
    thMod.textContent = tf('modified','Modified');
    headRow.appendChild(thMod);

    const thActions = document.createElement('th');
    thActions.style.width = '1%';
    headRow.appendChild(thActions);

    thead.appendChild(headRow);
    table.appendChild(thead);

    // ----- tbody -----
    const tbody = document.createElement('tbody');

    if (!hasRows) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 6;
      td.className = 'text-muted small';
      td.textContent = tf(
        'storage_no_children',
        'No matching items in this folder (for current filter).'
      );
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      slice.forEach(entry => {
        const { kind, item } = entry;
        const tr = document.createElement('tr');
        tr.classList.add('admin-storage-row');

        if (kind === 'folder') {
          // ---- Folder row ----
          tr.classList.add('admin-storage-row-folder');
          tr.dataset.type = 'folder';
          tr.dataset.folder = item.folder;

          const label = item.folder === 'root' ? '/' : `/${item.folder}`;
          const pct   = item.percentOfTotal || 0;

          // Name cell
          const tdName = document.createElement('td');
          tdName.className = 'align-middle';

          const icon = document.createElement('i');
          icon.className = 'material-icons';
          icon.style.fontSize = '16px';
          icon.style.verticalAlign = 'middle';
          icon.style.color = 'currentColor';
          icon.textContent = 'folder';

          const span = document.createElement('span');
          span.className = 'ms-1 align-middle';
          span.textContent = label;

          tdName.appendChild(icon);
          tdName.appendChild(span);
          tr.appendChild(tdName);

          // Size
          const tdSize = document.createElement('td');
          tdSize.className = 'align-middle text-nowrap';
          tdSize.textContent = formatBytes(item.bytes || 0);
          tr.appendChild(tdSize);

          // Percent
          const tdPct = document.createElement('td');
          tdPct.className = 'align-middle text-nowrap';
          tdPct.textContent = `${pct.toFixed(1)}%`;
          tr.appendChild(tdPct);

          // Files count
          const tdFiles = document.createElement('td');
          tdFiles.className = 'align-middle text-nowrap';
          tdFiles.textContent = (item.files || 0).toLocaleString();
          tr.appendChild(tdFiles);

          // Modified
          const tdMod = document.createElement('td');
          tdMod.className = 'align-middle text-nowrap';
          tdMod.textContent = item.latest_mtime ? formatDate(item.latest_mtime) : '';
          tr.appendChild(tdMod);

          // Actions
          const tdActions = document.createElement('td');
          tdActions.className = 'align-middle';
          tdActions.style.width = '1%';
          tdActions.style.whiteSpace = 'nowrap';

          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn btn-sm btn-outline-danger admin-storage-delete-folder';
          btn.title = tf('delete_folder','Delete folder');

          const delIcon = document.createElement('i');
          delIcon.className = 'material-icons';
          delIcon.style.fontSize = '16px';
          delIcon.style.color = 'currentColor';
          delIcon.textContent = 'delete';

          btn.appendChild(delIcon);
          tdActions.appendChild(btn);
          tr.appendChild(tdActions);

          // Folder row click: drilldown
          tr.addEventListener('click', e => {
            if (e.target.closest('.admin-storage-delete-folder')) return;
            const folder = tr.getAttribute('data-folder') || 'root';
            currentFolderKey = folder;
            loadFolderChildren(folder);
          });

          // Delete folder click
          btn.addEventListener('click', async e => {
            e.stopPropagation();
            const folder = tr.getAttribute('data-folder') || '';
            if (!folder) return;

            const labelDisp = folder === 'root' ? '/' : `/${folder}`;

            if (deepDeleteEnabled) {
              // SUPER DANGEROUS: deep delete entire subtree
              const ok = await showConfirmDialog({
                title: tf('storage_confirm_deep_delete_folder_title', 'Deep delete folder'),
                message: tf(
                  'storage_confirm_deep_delete_folder_msg',
                  `Permanently delete folder ${labelDisp} and ALL files and subfolders under it? This cannot be undone.`
                ),
                confirmLabel: tf('deep_delete_folder','Deep delete')
              });
              if (!ok) return;

              await deleteFolderFromInspector(folder, tr, { deep: true });
            } else {
              // Safe mode: only empty folders, same as existing UI
              const ok = await showConfirmDialog({
                title: tf('storage_confirm_delete_folder_title', 'Delete folder'),
                message: tf(
                  'storage_confirm_delete_folder_msg',
                  `Delete folder ${labelDisp}? If the folder is not empty, deletion will fail.`
                ),
                confirmLabel: tf('delete_folder','Delete folder')
              });
              if (!ok) return;

              await deleteFolderFromInspector(folder, tr, { deep: false });
            }
          });
        } else {
          // ---- File row ----
          tr.classList.add('admin-storage-row-file');
          tr.dataset.type = 'file';

          const folder = item.folder || currentFolderKey;
          const displayPath = item.path || (folder === 'root'
            ? `/${item.name}`
            : `/${folder}/${item.name}`);
          const pct   = item.percentOfTotal || 0;

          tr.dataset.folder = folder;
          tr.dataset.name = item.name;

          // Name cell
          const tdName = document.createElement('td');
          tdName.className = 'align-middle';

          const icon = document.createElement('i');
          icon.className = 'material-icons';
          icon.style.fontSize = '16px';
          icon.style.verticalAlign = 'middle';
          icon.style.color = 'currentColor';
          icon.textContent = 'insert_drive_file';

          const span = document.createElement('span');
          span.className = 'ms-1 align-middle';

          const code = document.createElement('code');
          code.textContent = displayPath;

          span.appendChild(code);
          tdName.appendChild(icon);
          tdName.appendChild(span);
          tr.appendChild(tdName);

          // Size
          const tdSize = document.createElement('td');
          tdSize.className = 'align-middle text-nowrap';
          tdSize.textContent = formatBytes(item.bytes || 0);
          tr.appendChild(tdSize);

          // Percent
          const tdPct = document.createElement('td');
          tdPct.className = 'align-middle text-nowrap';
          tdPct.textContent = `${pct.toFixed(2)}%`;
          tr.appendChild(tdPct);

          // Files (blank for files)
          const tdFiles = document.createElement('td');
          tdFiles.className = 'align-middle text-nowrap';
          tdFiles.textContent = '';
          tr.appendChild(tdFiles);

          // Modified
          const tdMod = document.createElement('td');
          tdMod.className = 'align-middle text-nowrap';
          tdMod.textContent = item.mtime ? formatDate(item.mtime) : '';
          tr.appendChild(tdMod);

          // Actions
          const tdActions = document.createElement('td');
          tdActions.className = 'align-middle';
          tdActions.style.width = '1%';
          tdActions.style.whiteSpace = 'nowrap';

          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn btn-sm btn-outline-danger admin-storage-delete-file';
          btn.title = tf('delete_file','Delete file');

          const delIcon = document.createElement('i');
          delIcon.className = 'material-icons';
          delIcon.style.fontSize = '16px';
          delIcon.style.color = 'currentColor';
          delIcon.textContent = 'delete';

          btn.appendChild(delIcon);
          tdActions.appendChild(btn);
          tr.appendChild(tdActions);

          btn.addEventListener('click', async e => {
            e.stopPropagation();
            const f = tr.getAttribute('data-folder') || currentFolderKey || 'root';
            const name = tr.getAttribute('data-name') || '';
            if (!name) return;

            const display = f === 'root' ? `/${name}` : `/${f}/${name}`;
            const ok = await showConfirmDialog({
              title: tf('storage_confirm_delete_file_title', 'Permanently delete file'),
              message: tf(
                'storage_confirm_delete_file_msg',
                `Permanently delete file ${display}? This bypasses Trash and cannot be undone.`
              ),
              confirmLabel: tf('delete_file','Delete file')
            });
            if (!ok) return;

            await deleteFileFromInspectorPermanent(f, name, tr);
          });
        }

        tbody.appendChild(tr);
      });
    }

    table.appendChild(tbody);
    wrapper.appendChild(table);
    inner.appendChild(wrapper);

    // ----- Footer: showing X of Y / Load more -----
    if (hasRows) {
      if (shown < total) {
        const footer = document.createElement('div');
        footer.className = 'd-flex justify-content-between align-items-center mt-1 small';

        const span = document.createElement('span');
        span.textContent = `${tf('storage_showing','Showing')} ${shown} ${tf('of','of')} ${total}`;
        footer.appendChild(span);

        const moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'btn btn-sm btn-outline-secondary';
        moreBtn.id = 'adminStorageMoreFolder';
        moreBtn.textContent = tf('storage_load_more','Load more');

        moreBtn.addEventListener('click', () => {
          shown = Math.min(shown + pageSize, total);
          renderPage();
        });

        footer.appendChild(moreBtn);
        inner.appendChild(footer);
      } else {
        const footer = document.createElement('div');
        footer.className = 'mt-1 small text-muted text-end pe-2';
        footer.textContent = `${tf('storage_showing_all','Showing all')} ${total} ${tf('items','items')}.`;
        inner.appendChild(footer);
      }
    }

    // Sync button styles with deep delete toggle
    updateDeleteButtonsForDeepDelete();
  }

  renderPage();
}

  async function loadTopFiles() {
    const inner = document.getElementById('adminStorageExplorerInner');
    if (!inner) return;
  
    inner.innerHTML = `
      <div class="text-muted small">
        ${tf('loading','Loading...')}
      </div>
    `;
  
    let data;
    try {
      const url = `/api/pro/diskUsageTopFiles.php?limit=200`;
      const res = await fetch(url, {
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-store' }
      });
      const text = await res.text();
      data = JSON.parse(text || '{}');
    } catch (e) {
      console.error('loadTopFiles error', e);
      inner.innerHTML = `<div class="text-danger small">
        ${tf('storage_topfiles_error','Unable to load top files.')}
      </div>`;
      return;
    }
  
    if (!data || !data.ok) {
      if (data && data.error === 'no_snapshot') {
        inner.innerHTML = `<div class="text-warning small">
          ${tf('storage_no_snapshot','No disk usage snapshot found. Run the disk usage scan first.')}
        </div>`;
      } else {
        inner.innerHTML = `<div class="text-danger small">
          ${tf('storage_topfiles_error','Unable to load top files.')}
        </div>`;
      }
      return;
    }
  
    const files = Array.isArray(data.files) ? data.files : [];
    const minBytes = topFilesMinSizeBytes || 0;
  
    const filtered = files.filter(f => Number(f.bytes || 0) >= minBytes);
  
    const rowChunks = filtered.map(file => {
      const bytes = Number(file.bytes || 0);
      const pct   = file.percentOfTotal || 0;
      const width = Math.max(3, Math.min(100, Math.round(pct)));
      const folder = file.folder || 'root';
      const path   = file.path || (folder === 'root'
        ? `/${file.name}`
        : `/${folder}/${file.name}`);
  
      return `
        <tr
          class="admin-storage-row admin-storage-row-file"
          data-type="file"
          data-folder="${folder}"
          data-name="${file.name}">
          <td class="align-middle">
            <i class="material-icons" style="font-size:16px;vertical-align:middle;color:currentColor;">insert_drive_file</i>
            <span class="ms-1 align-middle"><code>${path}</code></span>
          </td>
          <td class="align-middle text-nowrap">
            ${formatBytes(bytes)}
          </td>
          <td class="align-middle text-nowrap">
            ${pct.toFixed(2)}%
          </td>
          <td class="align-middle" style="width:40%;">
            <div class="progress" style="height: 6px; background-color: rgba(0,0,0,0.05);">
              <div
                class="progress-bar"
                role="progressbar"
                style="width:${width}%;"
                aria-valuenow="${pct.toFixed(2)}"
                aria-valuemin="0"
                aria-valuemax="100">
              </div>
            </div>
          </td>
          <td class="align-middle text-nowrap">
            ${file.mtime ? formatDate(file.mtime) : ''}
          </td>
          <td class="align-middle" style="width:1%;white-space:nowrap;">
            <button
              type="button"
              class="btn btn-sm btn-outline-danger admin-storage-delete-file"
              title="${tf('delete_file','Delete file')}">
              <i class="material-icons" style="font-size:16px;color:currentColor;">delete</i>
            </button>
          </td>
        </tr>
      `;
    });
  
    const total = rowChunks.length;
    const pageSize = 100;
    let shown = Math.min(pageSize, total);
  
    function renderPage() {
      const hasRows = total > 0;
      const visibleRows = hasRows
        ? rowChunks.slice(0, shown).join('')
        : `<tr><td colspan="6" class="text-muted small">
             ${tf('storage_no_topfiles','No files match the current filter.')}
           </td></tr>`;
  
      const footer = hasRows && shown < total
        ? `<div class="d-flex justify-content-between align-items-center mt-1 small">
             <span>${tf('storage_showing','Showing')} ${shown} ${tf('of','of')} ${total}</span>
             <button type="button" class="btn btn-sm btn-outline-secondary" id="adminStorageMoreTopFiles">
               ${tf('storage_load_more','Load more')}
             </button>
           </div>`
        : hasRows
          ? `<div class="mt-1 small text-muted text-end pe-2">
               ${tf('storage_showing_all','Showing all')} ${total} ${tf('items','items')}.
             </div>`
          : '';
  
      inner.innerHTML = `
        <div class="table-responsive" style="max-height:340px;overflow:auto;">
          <table class="table table-sm mb-0">
            <thead>
              <tr>
                <th>${tf('file','File')}</th>
                <th>${tf('size','Size')}</th>
                <th>%</th>
                <th>${tf('usage','Usage')}</th>
                <th>${tf('modified','Modified')}</th>
                <th style="width:1%;"></th>
              </tr>
            </thead>
            <tbody>
              ${visibleRows}
            </tbody>
          </table>
        </div>
        ${footer}
      `;
  
      inner.querySelectorAll('.admin-storage-delete-file').forEach(btn => {
        btn.addEventListener('click', async e => {
          e.stopPropagation();
          const row = btn.closest('tr');
          if (!row) return;
          const folder = row.getAttribute('data-folder') || currentFolderKey || 'root';
          const name   = row.getAttribute('data-name') || '';
          if (!name) return;
      
          const display = folder === 'root' ? `/${name}` : `/${folder}/${name}`;
          const ok = await showConfirmDialog({
            title: tf('storage_confirm_delete_file_title', 'Permanently delete file'),
            message: tf(
              'storage_confirm_delete_file_msg',
              `Permanently delete file ${display}? This bypasses Trash and cannot be undone.`
            ),
            confirmLabel: tf('delete_file','Delete file')
          });
          if (!ok) return;
      
          await deleteFileFromInspectorPermanent(folder, name, row);
        });
      });
  
      const moreBtn = inner.querySelector('#adminStorageMoreTopFiles');
      if (moreBtn) {
        moreBtn.addEventListener('click', () => {
          shown = Math.min(shown + pageSize, total);
          renderPage();
        });
      }
    }
  
    renderPage();
    updateDeleteButtonsForDeepDelete();
    setBreadcrumb('root');
  }

// ---------- Delete helpers (Pro delete-from-inspector) ----------

async function deleteFileFromInspectorPermanent(folderKey, name, rowEl) {
    const payload = {
      folder: folderKey || 'root',
      name
    };
  
    try {
      const resp = await sendRequest('/api/pro/diskUsageDeleteFilePermanent.php', 'POST', payload, {
        'X-CSRF-Token': getCsrfToken()
      });
  
      const hasError = resp && resp.error;
      const ok = resp && resp.ok !== false && !hasError;
  
      if (!ok) {
        const err = hasError ? String(resp.error) : null;
        if (err) {
          showToast(err);
        } else {
          showToast(tf('storage_delete_file_failed','Failed to delete file. See logs.'));
        }
        return;
      }
  
      if (rowEl && rowEl.parentNode) {
        rowEl.parentNode.removeChild(rowEl);
      }
      showToast(tf('storage_delete_file_perm_ok','File permanently deleted (snapshot will update after next scan).'));
    } catch (e) {
      console.error('deleteFileFromInspectorPermanent error', e);
      showToast(tf('storage_delete_file_failed','Failed to delete file. See logs.'));
    }
  }

  async function deleteFolderFromInspector(folderKey, rowEl, { deep = false } = {}) {
    const payload = { folder: folderKey };
  
    const url = deep
      ? '/api/pro/diskUsageDeleteFolderRecursive.php'
      : '/api/folder/deleteFolder.php';
  
    try {
      const resp = await sendRequest(url, 'POST', payload, {
        'X-CSRF-Token': getCsrfToken()
      });
  
      const hasError = resp && resp.error;
      const ok = resp && resp.ok !== false && !hasError && !resp.error;
  
      if (!ok) {
        const err = hasError ? String(resp.error) : null;
  
        if (err) {
          showToast(err);
        } else {
          showToast(
            deep
              ? tf('storage_deep_delete_folder_failed','Failed to deep delete folder. See logs.')
              : tf('storage_delete_folder_failed','Failed to delete folder. See logs.')
          );
        }
        return;
      }
  
      if (rowEl && rowEl.parentNode) {
        rowEl.parentNode.removeChild(rowEl);
      }
  
      showToast(
        deep
          ? tf('storage_deep_delete_folder_ok','Folder and all contents deleted (snapshot will update after next scan).')
          : tf('storage_delete_folder_ok','Folder deleted (snapshot will update after next scan).')
      );
    } catch (e) {
      console.error('deleteFolderFromInspector error', e);
      showToast(
        deep
          ? tf('storage_deep_delete_folder_failed','Failed to deep delete folder. See logs.')
          : tf('storage_delete_folder_failed','Failed to delete folder. See logs.')
      );
    }
  }

// ---------- Entry point ----------

export function initAdminStorageSection({ isPro, modalEl }) {
  const container = document.getElementById('storageContent');
  if (!container) return;

  isProGlobal = !!isPro;

  // Make it safe to call multiple times
  if (!container.dataset.inited) {
    container.dataset.inited = '1';
    renderBaseLayout(container, { isPro });
    if (isProGlobal) {
      renderProExplorerSkeleton();
      currentFolderKey = 'root';
      currentExplorerTab = 'folders';
      folderMinSizeBytes = 0;
      topFilesMinSizeBytes = 0;
      // initial load of folders view
      switchExplorerTab('folders');
    }
  } else if (isProGlobal) {
    // Re-open admin panel: make sure explorer still has data
    if (!document.getElementById('adminStorageExplorerInner')) {
      renderProExplorerSkeleton();
      switchExplorerTab(currentExplorerTab || 'folders');
    }
  }

  // Always refresh summary when admin panel opens
  refreshStorageSummary();
  wireRescan(isProGlobal);
  setScanStatus(false);
}