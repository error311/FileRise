import { t } from './i18n.js?v={{APP_QVER}}';
import { withBase } from './basePath.js?v={{APP_QVER}}';
import { showToast, escapeHTML } from './domUtils.js?v={{APP_QVER}}';

const EVENT_OPTIONS = [
  'file.uploaded',
  'file.deleted',
  'file.moved',
  'folder.created',
  'folder.deleted',
  'share.created',
  'share.revoked',
  'portal.uploaded',
  'portal.downloaded',
  'job.succeeded',
  'job.failed'
];

const tf = (key, fallback) => {
  const val = t(key);
  return (val && val !== key) ? val : fallback;
};

function csrfToken() {
  return (
    document.querySelector('meta[name="csrf-token"]')?.content ||
    window.csrfToken ||
    ''
  );
}

async function safeJson(resp) {
  try {
    return await resp.json();
  } catch (e) {
    return null;
  }
}

async function apiGet(path) {
  const resp = await fetch(withBase(path), {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json'
    }
  });
  const body = await safeJson(resp);
  if (!resp.ok || !body || body.ok === false) {
    throw new Error((body && (body.error || body.message)) || `HTTP ${resp.status}`);
  }
  return body;
}

async function apiPost(path, payload) {
  const resp = await fetch(withBase(path), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken(),
      Accept: 'application/json'
    },
    body: JSON.stringify(payload || {})
  });

  const body = await safeJson(resp);
  if (!resp.ok || !body || body.ok === false) {
    throw new Error((body && (body.error || body.message)) || `HTTP ${resp.status}`);
  }
  return body;
}

function formatTs(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (Number.isFinite(n) && n > 0 && String(v).trim().match(/^\d+$/)) {
    return new Date(n * 1000).toLocaleString();
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

function statusBadge(status) {
  const s = String(status || '').toLowerCase();
  let cls = 'badge-secondary';
  if (s === 'queued') cls = 'badge-info';
  if (s === 'running') cls = 'badge-warning';
  if (s === 'succeeded') cls = 'badge-success';
  if (s === 'dead' || s === 'failed') cls = 'badge-danger';
  if (s === 'canceled') cls = 'badge-dark';
  return `<span class="badge ${cls}">${escapeHTML(status || '')}</span>`;
}

function checkedAttr(v) {
  return v ? 'checked' : '';
}

function jobSummary(job) {
  const type = String(job?.type || '');
  const payload = (job && typeof job === 'object' && job.payload && typeof job.payload === 'object')
    ? job.payload
    : {};

  if (type === 'clamav.scan_folder') {
    const sourceId = String(payload.sourceId || 'local');
    const folder = String(payload.folder || 'root');
    const summary = `scan ${sourceId}:${folder}`;
    const scanResult = (payload.scanResult && typeof payload.scanResult === 'object')
      ? payload.scanResult
      : null;
    if (!scanResult) {
      return summary;
    }
    const clean = Number(scanResult.cleanCount || 0);
    const infected = Number(scanResult.infectedCount || 0);
    const errors = Number(scanResult.errorCount || 0);
    return `${summary} | clean:${clean} infected:${infected} errors:${errors}`;
  }

  return String(payload.event || '');
}

function endpointEventsHtml(selectedEvents) {
  const set = new Set(Array.isArray(selectedEvents) ? selectedEvents : []);
  return EVENT_OPTIONS.map((eventName) => {
    const id = `automationEvent_${eventName.replace(/[^a-z0-9]+/ig, '_')}`;
    return `
      <label for="${id}" style="display:inline-flex; align-items:center; gap:6px; margin:0 12px 6px 0;">
        <input type="checkbox" id="${id}" class="automation-event-checkbox" value="${escapeHTML(eventName)}" ${checkedAttr(set.has(eventName))} />
        <span>${escapeHTML(eventName)}</span>
      </label>
    `;
  }).join('');
}

function selectedEventsFromDom(host) {
  const out = [];
  host.querySelectorAll('.automation-event-checkbox').forEach((el) => {
    if (el instanceof HTMLInputElement && el.checked) {
      out.push(el.value);
    }
  });
  return out;
}

export function initAdminAutomationSection(opts = {}) {
  const container = opts.container || document.getElementById('proAutomationContent');
  const isPro = !!opts.isPro;
  if (!container) return;

  const isDark = !!document.body?.classList?.contains('dark-mode');
  const cardBg = isDark ? '#1f1f1f' : '#fdfdfd';
  const cardBorder = isDark ? '#3a3a3a' : '#eaeaea';

  if (!isPro) {
    container.innerHTML = `
      <div class="card" style="border:1px solid ${cardBorder}; border-radius:10px; padding:12px; background:${cardBg}; margin-top:10px;">
        <div class="d-flex align-items-center" style="gap:8px; margin-bottom:4px;">
          <i class="material-icons" aria-hidden="true">bolt</i>
          <div style="font-weight:600;">Automation</div>
        </div>
        <div class="text-muted" style="font-size:12px;">${escapeHTML(tf('admin_pro_feature_automation', 'Automation (Webhooks + Jobs) is available in FileRise Pro.'))}</div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="card" style="border:1px solid ${cardBorder}; border-radius:10px; padding:12px; background:${cardBg}; margin-top:10px;">
      <div class="d-flex align-items-center" style="gap:8px; margin-bottom:8px;">
        <i class="material-icons" aria-hidden="true">bolt</i>
        <div>
          <div style="font-weight:600;">Automation</div>
          <div class="text-muted" style="font-size:12px;">Webhooks + async job queue with retries and delivery logs.</div>
        </div>
      </div>

      <div style="display:flex; gap:8px; margin-bottom:10px;">
        <button type="button" class="btn btn-sm btn-primary" id="automationTabWebhooks">Webhooks</button>
        <button type="button" class="btn btn-sm btn-light" id="automationTabJobs">Jobs</button>
      </div>

      <div id="automationWebhooksPane"></div>
      <div id="automationJobsPane" style="display:none;"></div>
    </div>
  `;

  const tabWebhooks = container.querySelector('#automationTabWebhooks');
  const tabJobs = container.querySelector('#automationTabJobs');
  const paneWebhooks = container.querySelector('#automationWebhooksPane');
  const paneJobs = container.querySelector('#automationJobsPane');

  const state = {
    endpoints: [],
    selectedEndpointId: 0,
    jobs: [],
    metrics: null,
    activeTab: 'webhooks',
    statusFilter: ''
  };

  function renderTabs() {
    const webhooksActive = state.activeTab === 'webhooks';
    if (tabWebhooks) {
      tabWebhooks.className = `btn btn-sm ${webhooksActive ? 'btn-primary' : 'btn-light'}`;
    }
    if (tabJobs) {
      tabJobs.className = `btn btn-sm ${!webhooksActive ? 'btn-primary' : 'btn-light'}`;
    }
    if (paneWebhooks) {
      paneWebhooks.style.display = webhooksActive ? '' : 'none';
    }
    if (paneJobs) {
      paneJobs.style.display = webhooksActive ? 'none' : '';
    }
  }

  function endpointById(id) {
    return state.endpoints.find((ep) => Number(ep.id) === Number(id)) || null;
  }

  function renderWebhooksPane() {
    const endpoint = endpointById(state.selectedEndpointId);
    const selectedEvents = endpoint ? endpoint.events : EVENT_OPTIONS;
    const security = (state.metrics?.security && typeof state.metrics.security === 'object')
      ? state.metrics.security
      : {};
    const webhooksEnabledGlobal = Object.prototype.hasOwnProperty.call(security, 'webhooksEnabled')
      ? !!security.webhooksEnabled
      : true;
    const allowlistEnabled = !!security.allowlistEnabled;
    const allowedHosts = Array.isArray(security.allowedHosts) ? security.allowedHosts : [];
    const allowedHostsText = allowedHosts.join('\n');
    const forcePublicTargets = !!security.forcePublicTargets;

    paneWebhooks.innerHTML = `
      <div style="border:1px solid ${cardBorder}; border-radius:8px; padding:8px; margin-bottom:10px; background:${isDark ? '#202020' : '#fcfcfc'};">
        <div style="font-weight:600; margin-bottom:4px;">Webhook security</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:4px;">
          <label style="display:inline-flex; align-items:center; gap:6px; margin:0;">
            <input id="automationWebhooksGlobalEnabled" type="checkbox" ${checkedAttr(webhooksEnabledGlobal)} />
            <span>Enable all webhook deliveries</span>
          </label>
          <button type="button" class="btn btn-sm btn-secondary" id="automationSaveSecurity">Save security</button>
          <span class="badge ${webhooksEnabledGlobal ? 'badge-success' : 'badge-danger'}">${webhooksEnabledGlobal ? 'Enabled' : 'Disabled'}</span>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:6px;">
          <label style="display:inline-flex; align-items:center; gap:6px; margin:0;">
            <input id="automationWebhookAllowlistEnabled" type="checkbox" ${checkedAttr(allowlistEnabled)} />
            <span>Enforce host allowlist</span>
          </label>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:6px;">
          <label style="display:inline-flex; align-items:center; gap:6px; margin:0;">
            <input id="automationWebhookForcePublicTargets" type="checkbox" ${checkedAttr(forcePublicTargets)} />
            <span>Always block private/local targets (override endpoint setting)</span>
          </label>
        </div>
        <div style="margin-bottom:4px;">
          <label for="automationWebhookAllowedHosts" style="margin:0 0 4px 0;">Allowed hosts (one per line or comma-separated)</label>
          <textarea id="automationWebhookAllowedHosts" class="form-control form-control-sm" rows="3" placeholder="api.example.com&#10;*.hooks.example.org">${escapeHTML(allowedHostsText)}</textarea>
        </div>
        <div class="text-muted" style="font-size:12px;">When disabled, webhook events are not queued or delivered (including test sends). Allowlist supports exact hosts and <code>*.example.com</code> wildcards.</div>
      </div>

      <div class="form-row" style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:8px;">
        <div class="form-group" style="flex:1; min-width:180px;">
          <label for="automationEndpointName">Name</label>
          <input id="automationEndpointName" class="form-control" value="${escapeHTML(endpoint?.name || '')}" />
        </div>
        <div class="form-group" style="flex:2; min-width:240px;">
          <label for="automationEndpointUrl">URL</label>
          <input id="automationEndpointUrl" class="form-control" placeholder="https://example.com/webhook" value="${escapeHTML(endpoint?.url || '')}" />
        </div>
      </div>

      <div class="form-row" style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:8px;">
        <div class="form-group" style="flex:1; min-width:180px;">
          <label for="automationEndpointSecret">Secret (HMAC)</label>
          <input id="automationEndpointSecret" type="password" class="form-control" placeholder="Leave blank to keep existing" value="" autocomplete="new-password" />
        </div>
        <div class="form-group" style="flex:0 0 140px;">
          <label for="automationEndpointTimeout">Timeout (ms)</label>
          <input id="automationEndpointTimeout" type="number" class="form-control" min="500" max="30000" value="${escapeHTML(String(endpoint?.timeoutMs || 5000))}" />
        </div>
        <div class="form-group" style="flex:0 0 140px;">
          <label for="automationEndpointAttempts">Max attempts</label>
          <input id="automationEndpointAttempts" type="number" class="form-control" min="1" max="20" value="${escapeHTML(String(endpoint?.maxAttempts || 5))}" />
        </div>
      </div>

      <div style="margin-bottom:8px;">
        <div style="font-weight:600; margin-bottom:4px;">Event filters</div>
        <div id="automationEventsWrap" style="display:flex; flex-wrap:wrap;">
          ${endpointEventsHtml(selectedEvents)}
        </div>
      </div>

      <div style="display:flex; gap:16px; flex-wrap:wrap; align-items:center; margin-bottom:10px;">
        <label style="display:inline-flex; align-items:center; gap:6px; margin:0;">
          <input id="automationEndpointEnabled" type="checkbox" ${checkedAttr(endpoint ? !!endpoint.enabled : true)} />
          <span>Enabled</span>
        </label>
        <label style="display:inline-flex; align-items:center; gap:6px; margin:0;">
          <input id="automationEndpointAllowPrivate" type="checkbox" ${checkedAttr(endpoint ? !!endpoint.allowPrivate : false)} />
          <span>Allow private/local targets</span>
        </label>
        <small class="text-muted">Default is blocked for SSRF safety.${forcePublicTargets ? ' Global hard mode currently overrides this.' : ''}</small>
      </div>

      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
        <button type="button" class="btn btn-sm btn-primary" id="automationSaveEndpoint">Save endpoint</button>
        <button type="button" class="btn btn-sm btn-secondary" id="automationClearEndpoint">New endpoint</button>
        ${endpoint ? `<button type="button" class="btn btn-sm btn-outline-primary" id="automationTestEndpoint" ${webhooksEnabledGlobal ? '' : 'disabled'}>Test send</button>` : ''}
      </div>

      <div class="table-responsive" style="max-height:220px; overflow:auto; margin-bottom:10px;">
        <table class="table table-sm" style="margin-bottom:0;">
          <thead>
            <tr>
              <th>Name</th>
              <th>URL</th>
              <th>Events</th>
              <th>Status</th>
              <th>Secret</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${state.endpoints.length ? state.endpoints.map((ep) => `
              <tr data-endpoint-id="${escapeHTML(String(ep.id))}">
                <td>${escapeHTML(ep.name || '')}</td>
                <td style="max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHTML(ep.url || '')}</td>
                <td style="max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHTML((ep.events || []).join(', '))}</td>
                <td>${ep.enabled ? 'Enabled' : 'Disabled'}</td>
                <td>${ep.hasSecret ? 'Masked' : 'None'}</td>
                <td>${escapeHTML(formatTs(ep.updatedAt || ep.createdAt))}</td>
                <td>
                  <button type="button" class="btn btn-sm btn-light automation-edit-endpoint">Edit</button>
                  <button type="button" class="btn btn-sm btn-light automation-test-endpoint" ${webhooksEnabledGlobal ? '' : 'disabled'}>Test</button>
                  <button type="button" class="btn btn-sm btn-danger automation-delete-endpoint">Delete</button>
                </td>
              </tr>
            `).join('') : `
              <tr><td colspan="7" class="text-muted">No webhook endpoints configured.</td></tr>
            `}
          </tbody>
        </table>
      </div>

      <div>
        <div style="font-weight:600; margin-bottom:4px;">Recent deliveries</div>
        <div class="table-responsive" style="max-height:220px; overflow:auto;">
          <table class="table table-sm" style="margin-bottom:0;">
            <thead>
              <tr>
                <th>Time</th>
                <th>Endpoint</th>
                <th>Event</th>
                <th>Attempt</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              ${(state.metrics?.recentDeliveries || []).slice(0, 40).map((d) => `
                <tr>
                  <td>${escapeHTML(formatTs(d.created_at))}</td>
                  <td>${escapeHTML(d.endpoint_name || `#${d.endpoint_id || ''}`)}</td>
                  <td>${escapeHTML(d.event || '')}</td>
                  <td>${escapeHTML(String(d.attempt || ''))}</td>
                  <td>${escapeHTML(String(d.status_code || ''))}</td>
                  <td>${escapeHTML(String(d.duration_ms || 0))}ms</td>
                  <td title="${escapeHTML(String(d.error || ''))}">${escapeHTML(String(d.error || '').slice(0, 120))}</td>
                </tr>
              `).join('') || '<tr><td colspan="7" class="text-muted">No deliveries yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const saveSecurityBtn = paneWebhooks.querySelector('#automationSaveSecurity');
    const saveBtn = paneWebhooks.querySelector('#automationSaveEndpoint');
    const clearBtn = paneWebhooks.querySelector('#automationClearEndpoint');
    const testTopBtn = paneWebhooks.querySelector('#automationTestEndpoint');

    if (saveSecurityBtn) {
      saveSecurityBtn.addEventListener('click', async () => {
        const webhooksEnabled = !!paneWebhooks.querySelector('#automationWebhooksGlobalEnabled')?.checked;
        const allowlistEnabledVal = !!paneWebhooks.querySelector('#automationWebhookAllowlistEnabled')?.checked;
        const forcePublicTargetsVal = !!paneWebhooks.querySelector('#automationWebhookForcePublicTargets')?.checked;
        const allowedHostsRaw = String(paneWebhooks.querySelector('#automationWebhookAllowedHosts')?.value || '');
        const allowedHostsVal = allowedHostsRaw
          .split(/[\n,]+/)
          .map((v) => String(v || '').trim())
          .filter((v) => v.length > 0);
        try {
          await apiPost('/api/pro/automation/security/save.php', {
            webhooksEnabled,
            allowlistEnabled: allowlistEnabledVal,
            allowedHosts: allowedHostsVal,
            forcePublicTargets: forcePublicTargetsVal
          });
          showToast(`Webhook security updated (${webhooksEnabled ? 'enabled' : 'disabled'}; allowlist ${allowlistEnabledVal ? 'on' : 'off'}; hard mode ${forcePublicTargetsVal ? 'on' : 'off'})`);
          await refreshMetrics();
          renderWebhooksPane();
        } catch (err) {
          showToast(err?.message || 'Failed to save webhook security settings', 'error');
        }
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const name = paneWebhooks.querySelector('#automationEndpointName')?.value || '';
        const url = paneWebhooks.querySelector('#automationEndpointUrl')?.value || '';
        const secret = paneWebhooks.querySelector('#automationEndpointSecret')?.value || '';
        const timeoutMs = parseInt(paneWebhooks.querySelector('#automationEndpointTimeout')?.value || '5000', 10);
        const maxAttempts = parseInt(paneWebhooks.querySelector('#automationEndpointAttempts')?.value || '5', 10);
        const enabled = !!paneWebhooks.querySelector('#automationEndpointEnabled')?.checked;
        const allowPrivate = !!paneWebhooks.querySelector('#automationEndpointAllowPrivate')?.checked;
        const events = selectedEventsFromDom(paneWebhooks);

        try {
          await apiPost('/api/pro/automation/webhooks/save.php', {
            endpoint: {
              id: state.selectedEndpointId || undefined,
              name,
              url,
              secret,
              timeoutMs,
              maxAttempts,
              enabled,
              allowPrivate,
              events
            }
          });
          showToast(tf('saved', 'Saved'));
          state.selectedEndpointId = 0;
          await refreshAll();
        } catch (err) {
          showToast(err?.message || 'Failed to save endpoint', 'error');
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        state.selectedEndpointId = 0;
        renderWebhooksPane();
      });
    }

    if (testTopBtn && endpoint) {
      testTopBtn.addEventListener('click', async () => {
        try {
          const res = await apiPost('/api/pro/automation/webhooks/test.php', { id: endpoint.id });
          showToast(`Test job queued (#${res.jobId || 'n/a'})`);
          await refreshMetrics();
        } catch (err) {
          showToast(err?.message || 'Failed to queue test send', 'error');
        }
      });
    }

    paneWebhooks.querySelectorAll('tr[data-endpoint-id]').forEach((row) => {
      const endpointId = Number(row.getAttribute('data-endpoint-id') || '0');
      const editBtn = row.querySelector('.automation-edit-endpoint');
      const testBtn = row.querySelector('.automation-test-endpoint');
      const delBtn = row.querySelector('.automation-delete-endpoint');

      editBtn?.addEventListener('click', () => {
        state.selectedEndpointId = endpointId;
        renderWebhooksPane();
      });

      testBtn?.addEventListener('click', async () => {
        try {
          const res = await apiPost('/api/pro/automation/webhooks/test.php', { id: endpointId });
          showToast(`Test job queued (#${res.jobId || 'n/a'})`);
          await refreshMetrics();
        } catch (err) {
          showToast(err?.message || 'Failed to queue test send', 'error');
        }
      });

      delBtn?.addEventListener('click', async () => {
        if (!window.confirm('Delete this webhook endpoint?')) return;
        try {
          await apiPost('/api/pro/automation/webhooks/delete.php', { id: endpointId });
          showToast('Endpoint deleted');
          if (state.selectedEndpointId === endpointId) {
            state.selectedEndpointId = 0;
          }
          await refreshAll();
        } catch (err) {
          showToast(err?.message || 'Failed to delete endpoint', 'error');
        }
      });
    });
  }

  function renderJobsPane() {
    const counts = state.metrics?.counts || {};
    const scanSchedule = (state.metrics?.scanSchedule && typeof state.metrics.scanSchedule === 'object')
      ? state.metrics.scanSchedule
      : {};
    const intervalOverride = Object.prototype.hasOwnProperty.call(scanSchedule, 'intervalMinutesOverride')
      ? scanSchedule.intervalMinutesOverride
      : null;
    const intervalInputValue = intervalOverride == null ? '' : String(intervalOverride);
    const envIntervalMinutes = Number(scanSchedule.envIntervalMinutes || 0);
    const effectiveIntervalMinutes = Number(scanSchedule.effectiveIntervalMinutes || 0);
    const scheduleSource = String(scanSchedule.source || 'none');
    const customSchedulesEnv = !!scanSchedule.customSchedulesEnv;
    let scheduleSourceText = 'none';
    if (scheduleSource === 'override') scheduleSourceText = 'admin override';
    if (scheduleSource === 'env') scheduleSourceText = 'environment variable';
    if (scheduleSource === 'json_env') scheduleSourceText = 'FR_PRO_CLAMAV_SCHEDULES';
    const effectiveIntervalText = scheduleSource === 'json_env'
      ? 'managed by FR_PRO_CLAMAV_SCHEDULES'
      : (effectiveIntervalMinutes > 0 ? `${effectiveIntervalMinutes} minute(s)` : 'disabled');

    paneJobs.innerHTML = `
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
        <span class="badge badge-info">Queued: ${escapeHTML(String(counts.queued || 0))}</span>
        <span class="badge badge-warning">Running: ${escapeHTML(String(counts.running || 0))}</span>
        <span class="badge badge-success">Succeeded: ${escapeHTML(String(counts.succeeded || 0))}</span>
        <span class="badge badge-danger">Dead: ${escapeHTML(String(counts.dead || 0))}</span>
        <span class="badge badge-dark">Canceled: ${escapeHTML(String(counts.canceled || 0))}</span>
      </div>

      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px; align-items:end;">
        <div style="min-width:120px;">
          <label for="automationScanSource" style="margin:0;">Scan source</label>
          <input id="automationScanSource" class="form-control form-control-sm" value="local" />
        </div>
        <div style="min-width:180px;">
          <label for="automationScanFolder" style="margin:0;">Scan folder</label>
          <input id="automationScanFolder" class="form-control form-control-sm" value="root" />
        </div>
        <div style="min-width:120px;">
          <label for="automationScanMaxFiles" style="margin:0;">Max files</label>
          <input id="automationScanMaxFiles" type="number" min="1" max="50000" class="form-control form-control-sm" value="2000" />
        </div>
        <button type="button" class="btn btn-sm btn-primary" id="automationQueueScan">Queue ClamAV scan</button>
        <button type="button" class="btn btn-sm btn-light" id="automationStartWorker">Start worker</button>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:6px; align-items:end;">
        <div style="min-width:220px;">
          <label for="automationScanIntervalMinutes" style="margin:0;">Recurring scan interval (minutes)</label>
          <input id="automationScanIntervalMinutes" type="number" min="0" max="1440" class="form-control form-control-sm" value="${escapeHTML(intervalInputValue)}" placeholder="${escapeHTML(String(envIntervalMinutes || 0))}" />
        </div>
        <div style="min-width:160px;">
          <label for="automationRetentionDays" style="margin:0;">Retention (days)</label>
          <input id="automationRetentionDays" type="number" min="1" max="3650" class="form-control form-control-sm" value="30" />
        </div>
        <button type="button" class="btn btn-sm btn-secondary" id="automationSaveScanInterval">Set interval</button>
        <button type="button" class="btn btn-sm btn-light" id="automationUnsetScanInterval">Unset override</button>
        <button type="button" class="btn btn-sm btn-light" id="automationCleanupHistory">Cleanup history</button>
        <button type="button" class="btn btn-sm btn-light" id="automationCleanupWorkers">Cleanup stale workers</button>
      </div>
      <div class="text-muted" style="font-size:12px; margin-bottom:10px;">
        Effective interval: <code>${escapeHTML(effectiveIntervalText)}</code> (source: ${escapeHTML(scheduleSourceText)}). Override applies when <code>FR_PRO_CLAMAV_SCHEDULES</code> is not set; use <code>Unset override</code> to fall back to <code>FR_PRO_CLAMAV_SCAN_INTERVAL_MINUTES</code>.
        ${customSchedulesEnv ? '<br /><span>Detected <code>FR_PRO_CLAMAV_SCHEDULES</code>; interval override is saved but not used until JSON schedules are removed.</span>' : ''}
        <br /><span>Cleanup history removes finished jobs (<code>succeeded/failed/dead/canceled</code>) and old/orphan logs + delivery records older than the retention window.</span>
      </div>

      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px; align-items:center;">
        <label for="automationJobsStatus" style="margin:0;">Status</label>
        <select id="automationJobsStatus" class="form-control" style="width:auto; min-width:160px;">
          <option value="" ${state.statusFilter === '' ? 'selected' : ''}>All</option>
          <option value="queued" ${state.statusFilter === 'queued' ? 'selected' : ''}>queued</option>
          <option value="running" ${state.statusFilter === 'running' ? 'selected' : ''}>running</option>
          <option value="succeeded" ${state.statusFilter === 'succeeded' ? 'selected' : ''}>succeeded</option>
          <option value="dead" ${state.statusFilter === 'dead' ? 'selected' : ''}>dead</option>
          <option value="canceled" ${state.statusFilter === 'canceled' ? 'selected' : ''}>canceled</option>
        </select>
        <button type="button" class="btn btn-sm btn-secondary" id="automationJobsRefresh">Refresh</button>
      </div>

      <div class="table-responsive" style="max-height:280px; overflow:auto; margin-bottom:10px;">
        <table class="table table-sm" style="margin-bottom:0;">
          <thead>
            <tr>
              <th>ID</th>
              <th>Type</th>
              <th>Event</th>
              <th>Status</th>
              <th>Attempts</th>
              <th>Run at</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${state.jobs.length ? state.jobs.map((job) => `
              <tr data-job-id="${escapeHTML(String(job.id))}">
                <td>${escapeHTML(String(job.id || ''))}</td>
                <td>${escapeHTML(job.type || '')}</td>
                <td>${escapeHTML(jobSummary(job))}</td>
                <td>${statusBadge(job.status)}</td>
                <td>${escapeHTML(String(job.attempts || 0))}/${escapeHTML(String(job.maxAttempts || 0))}</td>
                <td>${escapeHTML(formatTs(job.runAt))}</td>
                <td>${escapeHTML(formatTs(job.updatedAt))}</td>
                <td>
                  <button type="button" class="btn btn-sm btn-light automation-job-view">View</button>
                  <button type="button" class="btn btn-sm btn-secondary automation-job-retry">Retry</button>
                  <button type="button" class="btn btn-sm btn-danger automation-job-cancel">Cancel</button>
                </td>
              </tr>
            `).join('') : '<tr><td colspan="8" class="text-muted">No jobs found.</td></tr>'}
          </tbody>
        </table>
      </div>

      <div style="margin-bottom:10px;">
        <div style="font-weight:600; margin-bottom:4px;">Worker heartbeat</div>
        <div class="table-responsive" style="max-height:160px; overflow:auto;">
          <table class="table table-sm" style="margin-bottom:0;">
            <thead>
              <tr>
                <th>Worker</th>
                <th>Mode</th>
                <th>Last seen</th>
                <th>Processed</th>
                <th>Last job</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${(state.metrics?.workers || []).map((w) => `
                <tr>
                  <td>${escapeHTML(w.worker_id || '')}</td>
                  <td>${escapeHTML(w.mode || '')}</td>
                  <td>${escapeHTML(formatTs(w.last_seen))}</td>
                  <td>${escapeHTML(String(w.processed_total || 0))}</td>
                  <td>${escapeHTML(String(w.last_job_id || ''))}</td>
                  <td>${escapeHTML(w.last_status || '')}</td>
                </tr>
              `).join('') || '<tr><td colspan="6" class="text-muted">No worker heartbeat yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div id="automationJobDetailWrap" style="display:none;">
        <div style="font-weight:600; margin-bottom:4px;">Job detail</div>
        <pre id="automationJobDetailPre" style="white-space:pre-wrap; max-height:220px; overflow:auto; border:1px solid ${cardBorder}; border-radius:8px; padding:8px; background:${isDark ? '#171717' : '#fafafa'};"></pre>
      </div>
    `;

    const statusSel = paneJobs.querySelector('#automationJobsStatus');
    const refreshBtn = paneJobs.querySelector('#automationJobsRefresh');
    const queueScanBtn = paneJobs.querySelector('#automationQueueScan');
    const startWorkerBtn = paneJobs.querySelector('#automationStartWorker');
    const saveScanIntervalBtn = paneJobs.querySelector('#automationSaveScanInterval');
    const unsetScanIntervalBtn = paneJobs.querySelector('#automationUnsetScanInterval');
    const cleanupHistoryBtn = paneJobs.querySelector('#automationCleanupHistory');
    const cleanupWorkersBtn = paneJobs.querySelector('#automationCleanupWorkers');

    statusSel?.addEventListener('change', async () => {
      state.statusFilter = String(statusSel.value || '');
      await refreshJobs();
    });

    refreshBtn?.addEventListener('click', async () => {
      await refreshJobs();
      await refreshMetrics();
      renderJobsPane();
    });

    startWorkerBtn?.addEventListener('click', async () => {
      try {
        const res = await apiPost('/api/pro/automation/worker/start.php', {});
        if (res.started) {
          showToast('Automation worker started');
        } else if (res.alreadyRunning) {
          showToast('Automation worker is already running');
        } else if (res.cooldown) {
          showToast('Worker start is cooling down; try again in a moment');
        } else {
          showToast('Worker start requested');
        }
        await refreshMetrics();
        renderJobsPane();
      } catch (err) {
        showToast(err?.message || 'Failed to start worker', 'error');
      }
    });

    saveScanIntervalBtn?.addEventListener('click', async () => {
      const raw = String(paneJobs.querySelector('#automationScanIntervalMinutes')?.value || '').trim();
      const minutes = parseInt(raw, 10);
      if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) {
        showToast('Interval must be between 0 and 1440 minutes', 'error');
        return;
      }

      try {
        await apiPost('/api/pro/automation/scans/settings.php', { intervalMinutes: minutes });
        showToast(`Recurring scan interval override saved (${minutes} minute${minutes === 1 ? '' : 's'})`);
        await refreshMetrics();
        renderJobsPane();
      } catch (err) {
        showToast(err?.message || 'Failed to save recurring scan interval', 'error');
      }
    });

    unsetScanIntervalBtn?.addEventListener('click', async () => {
      try {
        await apiPost('/api/pro/automation/scans/settings.php', { unsetInterval: true });
        showToast('Recurring scan interval override removed');
        await refreshMetrics();
        renderJobsPane();
      } catch (err) {
        showToast(err?.message || 'Failed to unset recurring scan interval override', 'error');
      }
    });

    cleanupHistoryBtn?.addEventListener('click', async () => {
      const daysRaw = String(paneJobs.querySelector('#automationRetentionDays')?.value || '30').trim();
      const days = parseInt(daysRaw, 10);
      if (!Number.isFinite(days) || days < 1 || days > 3650) {
        showToast('Retention must be between 1 and 3650 days', 'error');
        return;
      }
      if (!window.confirm(`Cleanup automation history older than ${days} day${days === 1 ? '' : 's'}?`)) return;
      try {
        const res = await apiPost('/api/pro/automation/jobs/cleanup.php', { maxAgeDays: days });
        const removed = (res && typeof res === 'object' && res.removed && typeof res.removed === 'object') ? res.removed : {};
        showToast(`History cleanup removed jobs:${removed.jobs || 0}, logs:${removed.jobLogs || 0}, deliveries:${removed.deliveries || 0}`);
        await refreshJobs();
        await refreshMetrics();
        renderJobsPane();
      } catch (err) {
        showToast(err?.message || 'Failed to clean up automation history', 'error');
      }
    });

    cleanupWorkersBtn?.addEventListener('click', async () => {
      if (!window.confirm('Remove worker heartbeat entries older than 24 hours?')) return;
      try {
        const res = await apiPost('/api/pro/automation/worker/cleanup.php', { maxAgeSeconds: 86400 });
        showToast(`Removed ${res.removed || 0} stale worker heartbeat entr${Number(res.removed || 0) === 1 ? 'y' : 'ies'}`);
        await refreshMetrics();
        renderJobsPane();
      } catch (err) {
        showToast(err?.message || 'Failed to clean up worker heartbeat entries', 'error');
      }
    });

    queueScanBtn?.addEventListener('click', async () => {
      const sourceId = String(paneJobs.querySelector('#automationScanSource')?.value || 'local').trim() || 'local';
      const folder = String(paneJobs.querySelector('#automationScanFolder')?.value || 'root').trim() || 'root';
      const maxFiles = parseInt(String(paneJobs.querySelector('#automationScanMaxFiles')?.value || '2000'), 10);
      try {
        const res = await apiPost('/api/pro/automation/scans/queue.php', {
          sourceId,
          folder,
          maxFiles: Number.isFinite(maxFiles) ? maxFiles : 2000
        });
        let message = `Scan job queued (#${res.jobId || 'n/a'})`;
        if (res.worker && res.worker.started) {
          message += ' and worker started';
        } else if (res.worker && res.worker.alreadyRunning) {
          message += '; worker already running';
        } else if (res.worker && res.worker.cooldown) {
          message += '; worker start cooldown active';
        }
        showToast(message);
        await refreshJobs();
        await refreshMetrics();
        renderJobsPane();
      } catch (err) {
        showToast(err?.message || 'Failed to queue scan job', 'error');
      }
    });

    paneJobs.querySelectorAll('tr[data-job-id]').forEach((row) => {
      const jobId = Number(row.getAttribute('data-job-id') || '0');
      const viewBtn = row.querySelector('.automation-job-view');
      const retryBtn = row.querySelector('.automation-job-retry');
      const cancelBtn = row.querySelector('.automation-job-cancel');

      viewBtn?.addEventListener('click', async () => {
        try {
          const detail = await apiGet(`/api/pro/automation/jobs/get.php?id=${encodeURIComponent(jobId)}`);
          const box = paneJobs.querySelector('#automationJobDetailWrap');
          const pre = paneJobs.querySelector('#automationJobDetailPre');
          if (box) box.style.display = '';
          if (pre) {
            pre.textContent = JSON.stringify({
              job: detail.job,
              logs: detail.logs,
              deliveries: detail.deliveries
            }, null, 2);
          }
        } catch (err) {
          showToast(err?.message || 'Failed to load job detail', 'error');
        }
      });

      retryBtn?.addEventListener('click', async () => {
        try {
          await apiPost('/api/pro/automation/jobs/retry.php', { id: jobId });
          showToast('Job retried');
          await refreshJobs();
          renderJobsPane();
        } catch (err) {
          showToast(err?.message || 'Failed to retry job', 'error');
        }
      });

      cancelBtn?.addEventListener('click', async () => {
        try {
          await apiPost('/api/pro/automation/jobs/cancel.php', { id: jobId });
          showToast('Job canceled');
          await refreshJobs();
          renderJobsPane();
        } catch (err) {
          showToast(err?.message || 'Failed to cancel job', 'error');
        }
      });
    });
  }

  async function refreshEndpoints() {
    const res = await apiGet('/api/pro/automation/webhooks/list.php');
    state.endpoints = Array.isArray(res.endpoints) ? res.endpoints : [];
    if (state.selectedEndpointId && !endpointById(state.selectedEndpointId)) {
      state.selectedEndpointId = 0;
    }
  }

  async function refreshJobs() {
    const params = new URLSearchParams();
    params.set('limit', '150');
    if (state.statusFilter) params.set('status', state.statusFilter);
    const res = await apiGet(`/api/pro/automation/jobs/list.php?${params.toString()}`);
    state.jobs = Array.isArray(res.jobs) ? res.jobs : [];
  }

  async function refreshMetrics() {
    const res = await apiGet('/api/pro/automation/metrics.php');
    state.metrics = res;
  }

  async function refreshAll() {
    try {
      await Promise.all([refreshEndpoints(), refreshJobs(), refreshMetrics()]);
      renderWebhooksPane();
      renderJobsPane();
    } catch (err) {
      showToast(err?.message || 'Failed to load automation data', 'error');
      if (paneWebhooks) {
        paneWebhooks.innerHTML = `<div class="text-danger">${escapeHTML(err?.message || 'Failed to load automation data')}</div>`;
      }
    }
  }

  tabWebhooks?.addEventListener('click', () => {
    state.activeTab = 'webhooks';
    renderTabs();
  });
  tabJobs?.addEventListener('click', () => {
    state.activeTab = 'jobs';
    renderTabs();
  });

  renderTabs();
  refreshAll();
}
