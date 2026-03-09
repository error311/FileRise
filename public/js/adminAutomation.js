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

function approvalStatusBadge(status) {
  const s = String(status || '').toLowerCase();
  let cls = 'badge-secondary';
  if (s === 'pending') cls = 'badge-warning';
  if (s === 'approved') cls = 'badge-success';
  if (s === 'queued') cls = 'badge-info';
  if (s === 'rejected') cls = 'badge-danger';
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

  if (type === 'ai.invoices.to_sheet' || type === 'ai.bulk.process') {
    const sourceId = String(payload.sourceId || 'local');
    const folder = String(payload.folder || payload.rootPath || 'root');
    const progress = (payload.aiProgress && typeof payload.aiProgress === 'object') ? payload.aiProgress : null;
    const result = (payload.aiResult && typeof payload.aiResult === 'object') ? payload.aiResult : null;
    if (result) {
      return `ai ${sourceId}:${folder} | processed:${Number(result.processedCount || 0)} filtered:${Number(result.filteredOutCount || 0)} failed:${Number(result.failedCount || 0)}`;
    }
    if (progress) {
      return `ai ${sourceId}:${folder} | processed:${Number(progress.processedCount || 0)} filtered:${Number(progress.filteredOutCount || 0)} failed:${Number(progress.failedCount || 0)}`;
    }
    return `ai ${sourceId}:${folder}`;
  }

  if (type === 'ai.agent.message') {
    const agentId = String(payload.agentId || '');
    return agentId ? `agent ${agentId}` : 'agent message';
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
        <button type="button" class="btn btn-sm btn-light" id="automationTabAi">AI</button>
      </div>

      <div id="automationWebhooksPane"></div>
      <div id="automationJobsPane" style="display:none;"></div>
      <div id="automationAiPane" style="display:none;"></div>
    </div>
  `;

  const tabWebhooks = container.querySelector('#automationTabWebhooks');
  const tabJobs = container.querySelector('#automationTabJobs');
  const tabAi = container.querySelector('#automationTabAi');
  const paneWebhooks = container.querySelector('#automationWebhooksPane');
  const paneJobs = container.querySelector('#automationJobsPane');
  const paneAi = container.querySelector('#automationAiPane');

  const state = {
    endpoints: [],
    selectedEndpointId: 0,
    jobs: [],
    metrics: null,
    aiSettings: null,
    aiPublicUsage: null,
    aiPublicAuditStatus: null,
    aiPublicActivityRows: [],
    aiPublicAuditRows: [],
    aiAgents: [],
    aiJobs: [],
    aiFailureJobs: [],
    aiBlockedApprovals: [],
    aiRuleHistoryJobs: [],
    aiWatchRules: [],
    aiApprovals: [],
    aiRuntimeWarning: '',
    lastIssuedAgentToken: '',
    selectedAgentId: '',
    selectedWatchRuleId: 0,
    selectedRuleHistoryId: 0,
    aiHistoryLimit: 250,
    aiSubtab: 'dashboard',
    approvalSearchQuery: '',
    approvalStatusFilter: 'all',
    approvalLimit: 100,
    approvalActionIds: new Set(),
    activeTab: 'webhooks',
    statusFilter: ''
  };
  const automationActionButtonStyle = 'padding:1px 6px; font-size:11px; line-height:1.15; white-space:nowrap;';
  const automationPrimaryButtonStyle = 'padding:6px 12px; font-size:13px; line-height:1.25; font-weight:600; white-space:nowrap;';
  const automationActionButtonGroupStyle = 'display:inline-flex; gap:4px; flex-wrap:nowrap; align-items:center; white-space:nowrap;';

  function renderTabs() {
    const tab = String(state.activeTab || 'webhooks');
    const webhooksActive = tab === 'webhooks';
    const jobsActive = tab === 'jobs';
    const aiActive = tab === 'ai';
    if (tabWebhooks) {
      tabWebhooks.className = `btn btn-sm ${webhooksActive ? 'btn-primary' : 'btn-light'}`;
    }
    if (tabJobs) {
      tabJobs.className = `btn btn-sm ${jobsActive ? 'btn-primary' : 'btn-light'}`;
    }
    if (tabAi) {
      tabAi.className = `btn btn-sm ${aiActive ? 'btn-primary' : 'btn-light'}`;
    }
    if (paneWebhooks) {
      paneWebhooks.style.display = webhooksActive ? '' : 'none';
    }
    if (paneJobs) {
      paneJobs.style.display = jobsActive ? '' : 'none';
    }
    if (paneAi) {
      paneAi.style.display = aiActive ? '' : 'none';
    }
  }

  function endpointById(id) {
    return state.endpoints.find((ep) => Number(ep.id) === Number(id)) || null;
  }

  function agentById(id) {
    const key = String(id || '');
    return state.aiAgents.find((agent) => String(agent.id || '') === key) || null;
  }

  function watchRuleById(id) {
    const key = Number(id || 0);
    return state.aiWatchRules.find((rule) => Number(rule.id || 0) === key) || null;
  }

  function isApprovalActionPending(id) {
    return state.approvalActionIds instanceof Set && state.approvalActionIds.has(Number(id || 0));
  }

  function setApprovalActionPending(id, pending) {
    const key = Number(id || 0);
    if (!Number.isFinite(key) || key <= 0) return;
    if (!(state.approvalActionIds instanceof Set)) {
      state.approvalActionIds = new Set();
    }
    if (pending) {
      state.approvalActionIds.add(key);
    } else {
      state.approvalActionIds.delete(key);
    }
  }

  function aiJobTypeLabel(job) {
    const type = String(job?.type || '');
    const mode = String(job?.payload?.mode || '');
    if (type === 'ai.invoices.to_sheet') return 'Invoices';
    if (type === 'ai.agent.message') return 'Agent message';
    if (mode === 'extract_structured_data' || mode === 'structured_extract') return 'Structured extract';
    if (mode === 'extract_invoices_csv' || mode === 'invoices_to_sheet' || mode === 'invoices') return 'Invoice extract';
    if (mode === 'tag_images' || mode === 'images_tag' || mode === 'image_tagging') return 'Image tagging';
    if (mode === 'transcribe_audio_tag' || mode === 'audio_transcribe_tag' || mode === 'transcribe_audio') return 'Audio transcription';
    return type === 'ai.bulk.process' ? 'Bulk AI' : (type || 'AI job');
  }

  function aiJobScope(job) {
    const payload = (job && typeof job === 'object' && job.payload && typeof job.payload === 'object')
      ? job.payload
      : {};
    const sourceId = String(payload.sourceId || 'local');
    const folder = String(payload.folder || payload.rootPath || 'root');
    return `${sourceId}:${folder}`;
  }

  function aiJobProviderInfo(job) {
    const payload = (job && typeof job === 'object' && job.payload && typeof job.payload === 'object')
      ? job.payload
      : {};
    const provider = String(payload.provider || state.aiSettings?.defaultProvider || '').trim();
    const model = String(payload.model || '').trim();
    return {
      provider: provider || '(default)',
      model
    };
  }

  function aiDashboardUsageRows(limit = 8) {
    const metricRows = Array.isArray(state.metrics?.aiProviderUsage) ? state.metrics.aiProviderUsage : [];
    if (metricRows.length) {
      return metricRows.slice(0, limit).map((row) => {
        const provider = String(row?.provider || '(default)');
        const model = String(row?.model || '');
        return {
          label: model ? `${provider} / ${model}` : provider,
          count: Number(row?.total || 0)
        };
      });
    }
    const counts = new Map();
    (Array.isArray(state.aiJobs) ? state.aiJobs : []).forEach((job) => {
      const info = aiJobProviderInfo(job);
      const key = `${info.provider}\u0000${info.model}`;
      const label = info.model ? `${info.provider} / ${info.model}` : info.provider;
      const current = counts.get(key) || { label, count: 0 };
      current.count += 1;
      counts.set(key, current);
    });
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, limit);
  }

  function aiProviderUsageRows() {
    const rows = Array.isArray(state.metrics?.aiProviderUsage) ? state.metrics.aiProviderUsage : [];
    if (rows.length) {
      return rows;
    }

    const usage = new Map();
    (Array.isArray(state.aiJobs) ? state.aiJobs : []).forEach((job) => {
      const info = aiJobProviderInfo(job);
      const key = `${info.provider}\u0000${info.model}`;
      if (!usage.has(key)) {
        usage.set(key, {
          provider: info.provider,
          model: info.model,
          total: 0,
          queued: 0,
          running: 0,
          succeeded: 0,
          failed: 0,
          dead: 0,
          canceled: 0,
          lastSeenAt: String(job?.updatedAt || job?.createdAt || '')
        });
      }
      const row = usage.get(key);
      row.total += 1;
      const status = String(job?.status || '');
      if (Object.prototype.hasOwnProperty.call(row, status)) {
        row[status] += 1;
      }
      const seenAt = String(job?.updatedAt || job?.createdAt || '');
      if (seenAt && (!row.lastSeenAt || new Date(seenAt).getTime() >= new Date(row.lastSeenAt).getTime())) {
        row.lastSeenAt = seenAt;
      }
    });
    return Array.from(usage.values()).sort((a, b) => Number(b.total || 0) - Number(a.total || 0));
  }

  function blockedActionSummaryRows() {
    const metricRows = Array.isArray(state.metrics?.blockedActionCounts) ? state.metrics.blockedActionCounts : [];
    if (metricRows.length) {
      return metricRows.filter((row) => Number(row?.totalBlocked || 0) > 0);
    }

    const counts = new Map();
    (Array.isArray(state.aiBlockedApprovals) ? state.aiBlockedApprovals : []).forEach((approval) => {
      const workflow = String(approval?.workflow || 'unknown');
      if (!counts.has(workflow)) {
        counts.set(workflow, { workflow, pending: 0, rejected: 0, totalBlocked: 0 });
      }
      const row = counts.get(workflow);
      const status = String(approval?.status || '');
      if (status === 'pending' || status === 'rejected') {
        row[status] += 1;
        row.totalBlocked += 1;
      }
    });
    return Array.from(counts.values()).sort((a, b) => Number(b.totalBlocked || 0) - Number(a.totalBlocked || 0));
  }

  function shortAuditSubject(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (text.length <= 14) return text;
    return `${text.slice(0, 8)}...${text.slice(-4)}`;
  }

  function publicAuditRows() {
    const runtimeRows = Array.isArray(state.aiPublicActivityRows) ? state.aiPublicActivityRows : [];
    const auditRows = Array.isArray(state.aiPublicAuditRows) ? state.aiPublicAuditRows : [];
    const rows = runtimeRows.length ? runtimeRows : auditRows;
    return rows.map((row) => {
      const meta = (row && typeof row.meta === 'object') ? row.meta : {};
      const action = String(row?.action || '');
      const surface = String(meta.surface || '').toLowerCase();
      let event = action;
      if (action === 'ai.chat.public.message') event = 'Chat request';
      if (action === 'ai.tool.public.call') event = 'Tool call';
      if (action === 'ai.chat.public.rate_limited') event = 'Rate limited';
      if (action === 'ai.chat.public.reply') event = 'Assistant reply';
      const status = Number(meta.status || (action === 'ai.chat.public.rate_limited' ? 429 : 200));
      const ok = action === 'ai.tool.public.call'
        ? !!meta.ok
        : action !== 'ai.chat.public.rate_limited' && meta.ok !== false;
      const sourceId = String(meta.sourceId || 'local');
      const rootPath = String(meta.rootPath || 'root');
      const operation = String(meta.operation || '');
      const detailParts = [];
      if (action === 'ai.chat.public.message') {
        detailParts.push(`${Number(meta.messageChars || 0)} chars`);
      }
      if (String(meta.replyKind || '').trim()) {
        detailParts.push(String(meta.replyKind));
      }
      if (operation) {
        detailParts.push(operation);
      }
      if (Number(meta.durationMs || 0) > 0) {
        detailParts.push(`${Number(meta.durationMs || 0)} ms`);
      }
      if (Number(meta.retryAfter || 0) > 0) {
        detailParts.push(`retry ${Number(meta.retryAfter || 0)}s`);
      }
      if (meta.scopeViolation) {
        detailParts.push('scope blocked');
      }
      const subjectKey = String(meta.subjectKey || '');
      const clientIp = String(meta.clientIp || '');
      return {
        ts: String(row?.ts || ''),
        action,
        event,
        surface: surface || 'unknown',
        scope: `${sourceId}:${rootPath}`,
        operation,
        status: Number.isFinite(status) ? status : 0,
        ok,
        detail: detailParts.join(' | '),
        subjectKey,
        subjectLabel: shortAuditSubject(subjectKey),
        clientIp
      };
    });
  }

  function publicAuditSummary(rows) {
    const summary = {
      total: 0,
      messages: 0,
      toolCalls: 0,
      rateLimited: 0,
      failures: 0,
      share: 0,
      portal: 0,
      uniqueSubjects: 0
    };
    const subjects = new Set();
    rows.forEach((row) => {
      summary.total += 1;
      if (row.surface === 'share') summary.share += 1;
      if (row.surface === 'portal') summary.portal += 1;
      if (row.action === 'ai.chat.public.message') summary.messages += 1;
      if (row.action === 'ai.tool.public.call') summary.toolCalls += 1;
      if (row.action === 'ai.chat.public.rate_limited') summary.rateLimited += 1;
      if (
        (row.action === 'ai.tool.public.call' && (!row.ok || Number(row.status || 0) >= 400))
        || (row.action === 'ai.chat.public.reply' && (!row.ok || Number(row.status || 0) >= 400))
        || row.action === 'ai.chat.public.rate_limited'
      ) {
        summary.failures += 1;
      }
      if (row.subjectKey) {
        subjects.add(row.subjectKey);
      }
    });
    summary.uniqueSubjects = subjects.size;
    return summary;
  }

  function publicAuditOutcomeBadge(row) {
    const status = Number(row?.status || 0);
    const event = String(row?.action || '');
    if (event === 'ai.chat.public.rate_limited') {
      return '<span class="badge badge-danger">429 limited</span>';
    }
    if (event === 'ai.chat.public.reply' && status >= 400) {
      return `<span class="badge badge-danger">${escapeHTML(String(status || 'error'))}</span>`;
    }
    if (event === 'ai.chat.public.reply') {
      return '<span class="badge badge-info">reply</span>';
    }
    if (event === 'ai.tool.public.call' && status >= 400) {
      return `<span class="badge badge-danger">${escapeHTML(String(status || 'error'))}</span>`;
    }
    if (event === 'ai.tool.public.call') {
      return '<span class="badge badge-success">ok</span>';
    }
    return '<span class="badge badge-info">logged</span>';
  }

  function aiJobErrorSummary(job) {
    const payload = (job && typeof job === 'object' && job.payload && typeof job.payload === 'object')
      ? job.payload
      : {};
    const result = (payload.aiResult && typeof payload.aiResult === 'object') ? payload.aiResult : null;
    if (result && result.error) {
      return String(result.error);
    }
    if (result && result.status && result.status !== 'succeeded') {
      return String(result.status);
    }
    const progress = (payload.aiProgress && typeof payload.aiProgress === 'object') ? payload.aiProgress : null;
    if (progress && progress.lastFile) {
      return `last file: ${String(progress.lastFile)}`;
    }
    return String(job?.status || '');
  }

  function aiJobOutputUrl(jobId) {
    return withBase(`/api/pro/automation/jobs/output.php?id=${encodeURIComponent(jobId)}`);
  }

  function downloadAiJobOutput(jobId) {
    window.location.href = aiJobOutputUrl(jobId);
  }

  function csvEscape(value) {
    const text = String(value == null ? '' : value);
    return `"${text.replace(/"/g, '""')}"`;
  }

  function downloadCsv(filename, headers, rows) {
    const csv = [
      headers.map(csvEscape).join(','),
      ...rows.map((row) => row.map(csvEscape).join(','))
    ].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function populateJobDetail(detail) {
    if (!paneJobs) return;
    const box = paneJobs.querySelector('#automationJobDetailWrap');
    const actions = paneJobs.querySelector('#automationJobDetailActions');
    const pre = paneJobs.querySelector('#automationJobDetailPre');
    if (box) box.style.display = '';
    if (actions) {
      actions.innerHTML = '';
      const job = (detail?.job && typeof detail.job === 'object') ? detail.job : {};
      const payload = (job.payload && typeof job.payload === 'object') ? job.payload : {};
      const result = (payload.aiResult && typeof payload.aiResult === 'object') ? payload.aiResult : null;
      if (result) {
        const stats = `processed:${Number(result.processedCount || 0)} filtered:${Number(result.filteredOutCount || 0)} failed:${Number(result.failedCount || 0)}`;
        const parts = [`<span class="text-muted small">${escapeHTML(stats)}</span>`];
        const saved = (result.savedOutputFile && typeof result.savedOutputFile === 'object') ? result.savedOutputFile : null;
        if (saved && saved.fileName) {
          parts.push(`<span class="text-muted small">saved:${escapeHTML(String(saved.folder || 'root'))}/${escapeHTML(String(saved.fileName || ''))}</span>`);
        }
        actions.innerHTML = parts.join('');
      }
    }
    if (pre) {
      pre.textContent = JSON.stringify({
        job: detail?.job,
        logs: detail?.logs,
        deliveries: detail?.deliveries
      }, null, 2);
    }
  }

  async function openJobDetail(jobId, switchToJobs = false) {
    if (switchToJobs) {
      state.activeTab = 'jobs';
      renderTabs();
      renderJobsPane();
    }
    const detail = await apiGet(`/api/pro/automation/jobs/get.php?id=${encodeURIComponent(jobId)}`);
    populateJobDetail(detail);
    return detail;
  }

  function hasUsableAiProvider() {
    const settings = (state.aiSettings && typeof state.aiSettings === 'object') ? state.aiSettings : {};
    const providers = (settings.providers && typeof settings.providers === 'object') ? settings.providers : {};
    return ['openai', 'openai_compatible', 'claude', 'gemini'].some((name) => {
      const row = (providers[name] && typeof providers[name] === 'object') ? providers[name] : {};
      if (!row.enabled) return false;
      if (row.hasApiKey) return true;
      return name === 'openai_compatible' && String(row.baseUrl || '').trim() !== '';
    });
  }

  function shouldOpenAiSettingsByDefault() {
    const settings = (state.aiSettings && typeof state.aiSettings === 'object') ? state.aiSettings : {};
    if (!settings.chatEnabled) return true;
    return !hasUsableAiProvider();
  }

  function aiDataEgressInfo(settings) {
    const row = (settings && settings.dataEgress && typeof settings.dataEgress === 'object')
      ? settings.dataEgress
      : {};
    return {
      enabled: !!row.enabled,
      message: String(row.message || '').trim(),
      providers: Array.isArray(row.providers) ? row.providers : []
    };
  }

  function renderAiPane() {
    if (!paneAi) return;
    const settings = (state.aiSettings && typeof state.aiSettings === 'object') ? state.aiSettings : {};
    const publicUsage = (state.aiPublicUsage && typeof state.aiPublicUsage === 'object') ? state.aiPublicUsage : {};
    const publicAuditStatus = (state.aiPublicAuditStatus && typeof state.aiPublicAuditStatus === 'object') ? state.aiPublicAuditStatus : {};
    const providers = (settings.providers && typeof settings.providers === 'object') ? settings.providers : {};
    const selectedAgent = agentById(state.selectedAgentId);
    const selectedRule = watchRuleById(state.selectedWatchRuleId);
    const approvalCounts = (state.metrics?.approvalCounts && typeof state.metrics.approvalCounts === 'object')
      ? state.metrics.approvalCounts
      : {};
    const aiCounts = (state.metrics?.aiCounts && typeof state.metrics.aiCounts === 'object')
      ? state.metrics.aiCounts
      : {};
    const aiRuleCounts = (state.metrics?.aiRuleCounts && typeof state.metrics.aiRuleCounts === 'object')
      ? state.metrics.aiRuleCounts
      : {};
    const approvalStatusFilter = String(state.approvalStatusFilter || 'all');
    const approvalSearchQuery = String(state.approvalSearchQuery || '');
    const approvalLimit = Number(state.approvalLimit || 100);
    const runtimeWarning = String(state.aiRuntimeWarning || '');
    const issuedToken = String(state.lastIssuedAgentToken || '');
    const providerDefs = [
      { id: 'openai', label: 'OpenAI' },
      {
        id: 'openai_compatible',
        label: 'OpenAI-compatible (custom endpoint)',
        supportsBaseUrl: true,
        apiKeyOptional: true
      },
      { id: 'claude', label: 'Claude' },
      { id: 'gemini', label: 'Gemini' }
    ];
    const providerNames = providerDefs.map((def) => def.id);
    const providerLabel = (name) => {
      const match = providerDefs.find((def) => def.id === name);
      return match ? match.label : name;
    };
    const defaultProvider = String(settings.defaultProvider || 'openai');
    const agentProvider = String(selectedAgent?.provider || defaultProvider || 'openai');
    const aiJobs = Array.isArray(state.aiJobs) ? state.aiJobs : [];
    const aiActiveCount = Number(aiCounts.queued || 0) + Number(aiCounts.running || 0);
    const aiFailureCount = Number(aiCounts.failed || 0) + Number(aiCounts.dead || 0) + Number(aiCounts.canceled || 0);
    const approvalCompletedCount = Number(approvalCounts.approved || 0) + Number(approvalCounts.queued || 0) + Number(approvalCounts.rejected || 0);
    const enabledAgentCount = state.aiAgents.filter((agent) => !!agent?.enabled).length;
    const enabledProviderCount = providerNames.filter((name) => !!providers?.[name]?.enabled).length;
    const usableProviderCount = providerNames.filter((name) => {
      const row = (providers?.[name] && typeof providers[name] === 'object') ? providers[name] : {};
      if (!row.enabled) return false;
      if (row.hasApiKey) return true;
      return name === 'openai_compatible' && String(row.baseUrl || '').trim() !== '';
    }).length;
    const usageRows = aiDashboardUsageRows();
    const providerUsage = aiProviderUsageRows();
    const dataEgress = aiDataEgressInfo(settings);
    const blockedSummaryRows = blockedActionSummaryRows();
    const blockedApprovals = Array.isArray(state.aiBlockedApprovals) ? state.aiBlockedApprovals : [];
    const failureJobs = Array.isArray(state.aiFailureJobs) ? state.aiFailureJobs : [];
    const ruleHistoryJobs = Array.isArray(state.aiRuleHistoryJobs) ? state.aiRuleHistoryJobs : [];
    const publicAudit = publicAuditRows();
    const publicAuditSummaryRows = publicAuditSummary(publicAudit);
    const publicAuditEnabled = !!publicAuditStatus.enabled;
    const publicAuditAvailable = publicAuditStatus.available !== false;
    const publicAuditNote = String(publicAuditStatus.note || '');
    const publicActivitySourceLabel = publicAuditEnabled ? 'runtime log + Pro Audit' : 'runtime activity log';
    const historyLimit = Number(state.aiHistoryLimit || 250);
    const selectedRuleHistoryId = Number(state.selectedRuleHistoryId || 0);
    const publicWindowSeconds = Number(publicUsage.windowSeconds || 60);
    const aiNeedsSetup = shouldOpenAiSettingsByDefault();
    const aiSetupTitle = !settings.chatEnabled
      ? 'AI chat is disabled'
      : 'AI provider setup is incomplete';
    const aiSetupMessage = !settings.chatEnabled
      ? 'Enable AI chat first, then configure at least one provider before using the dashboard.'
      : 'No enabled provider has a usable saved key or endpoint yet, so Settings is the right starting point.';
    const requestedAiSubtab = ['dashboard', 'operations', 'reporting', 'settings'].includes(String(state.aiSubtab || ''))
      ? String(state.aiSubtab || 'dashboard')
      : 'dashboard';
    const aiSubtab = aiNeedsSetup && requestedAiSubtab === 'dashboard'
      ? 'settings'
      : requestedAiSubtab;
    state.aiSubtab = aiSubtab;
    const aiSubtabClass = (tab) => (aiSubtab === tab ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-light');
    const aiActionButtonStyle = automationActionButtonStyle;
    const aiActionButtonGroupStyle = automationActionButtonGroupStyle;
    const showDashboard = aiSubtab === 'dashboard';
    const showOperations = aiSubtab === 'operations';
    const showReporting = aiSubtab === 'reporting';
    const showSettings = aiSubtab === 'settings';

    paneAi.innerHTML = `
      ${runtimeWarning ? `
        <div class="alert alert-warning" style="margin-bottom:10px;">
          ${escapeHTML(runtimeWarning)}
        </div>
      ` : ''}
      ${issuedToken ? `
        <div style="border:1px solid ${cardBorder}; border-radius:8px; padding:10px; margin-bottom:10px; background:${isDark ? '#202020' : '#fcfcfc'};">
          <div style="font-weight:600; margin-bottom:6px;">New agent token (copy now)</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            <input id="automationAiIssuedToken" class="form-control form-control-sm" readonly value="${escapeHTML(issuedToken)}" style="min-width:280px; flex:1;" />
            <button type="button" class="btn btn-sm btn-secondary" id="automationAiCopyIssuedToken">Copy token</button>
            <button type="button" class="btn btn-sm btn-light" id="automationAiDismissIssuedToken">Dismiss</button>
          </div>
        </div>
      ` : ''}
      <div style="border:1px solid ${cardBorder}; border-radius:8px; padding:10px; margin-bottom:10px; background:${isDark ? '#202020' : '#fcfcfc'};">
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:end; justify-content:space-between;">
          <div>
            <div style="font-weight:600; margin-bottom:4px;">AI workspace</div>
            <div class="text-muted" style="font-size:12px;">Configure providers, monitor AI workflows, review approvals, and export reporting.</div>
            ${aiNeedsSetup ? `
              <div style="margin-top:6px;">
                <span class="badge badge-warning">${escapeHTML(aiSetupTitle)}</span>
                <span class="text-muted" style="font-size:12px; margin-left:6px;">${escapeHTML(aiSetupMessage)}</span>
              </div>
            ` : `
              <div style="margin-top:6px;">
                <span class="badge badge-success">AI ready</span>
                <span class="text-muted" style="font-size:12px; margin-left:6px;">${escapeHTML(String(usableProviderCount))} usable provider${usableProviderCount === 1 ? '' : 's'} configured.</span>
              </div>
            `}
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" class="${aiSubtabClass('dashboard')}" data-ai-subtab="dashboard">Dashboard</button>
            <button type="button" class="${aiSubtabClass('operations')}" data-ai-subtab="operations">Operations</button>
            <button type="button" class="${aiSubtabClass('reporting')}" data-ai-subtab="reporting">Reporting</button>
            <button type="button" class="${aiSubtabClass('settings')}" data-ai-subtab="settings">Settings</button>
          </div>
        </div>
      </div>
      ${showDashboard ? `
      <div style="border:1px solid ${cardBorder}; border-radius:8px; padding:10px; margin-bottom:10px; background:${isDark ? '#202020' : '#fcfcfc'};">
        <div style="font-weight:600; margin-bottom:6px;">AI dashboard</div>
        <div class="text-muted" style="font-size:12px; margin-bottom:8px;">Summary of workflow runs, approval pressure, watched-rule coverage, and recent provider/model activity.</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:8px; margin-bottom:10px;">
          <div style="border:1px solid ${cardBorder}; border-radius:8px; padding:8px;">
            <div class="text-muted" style="font-size:11px;">Active workflows</div>
            <div style="font-size:20px; font-weight:600;">${escapeHTML(String(aiActiveCount))}</div>
            <div class="text-muted" style="font-size:11px;">queued + running</div>
          </div>
          <div style="border:1px solid ${cardBorder}; border-radius:8px; padding:8px;">
            <div class="text-muted" style="font-size:11px;">Workflow failures</div>
            <div style="font-size:20px; font-weight:600;">${escapeHTML(String(aiFailureCount))}</div>
            <div class="text-muted" style="font-size:11px;">failed, dead, canceled</div>
          </div>
          <div style="border:1px solid ${cardBorder}; border-radius:8px; padding:8px;">
            <div class="text-muted" style="font-size:11px;">Approvals pending</div>
            <div style="font-size:20px; font-weight:600;">${escapeHTML(String(approvalCounts.pending || 0))}</div>
            <div class="text-muted" style="font-size:11px;">blocked risky actions</div>
          </div>
          <div style="border:1px solid ${cardBorder}; border-radius:8px; padding:8px;">
            <div class="text-muted" style="font-size:11px;">Approvals completed</div>
            <div style="font-size:20px; font-weight:600;">${escapeHTML(String(approvalCompletedCount))}</div>
            <div class="text-muted" style="font-size:11px;">queued, approved, rejected</div>
          </div>
          <div style="border:1px solid ${cardBorder}; border-radius:8px; padding:8px;">
            <div class="text-muted" style="font-size:11px;">Watched rules</div>
            <div style="font-size:20px; font-weight:600;">${escapeHTML(String(aiRuleCounts.enabled || 0))}/${escapeHTML(String(aiRuleCounts.total || 0))}</div>
            <div class="text-muted" style="font-size:11px;">enabled / total</div>
          </div>
          <div style="border:1px solid ${cardBorder}; border-radius:8px; padding:8px;">
            <div class="text-muted" style="font-size:11px;">Approval-gated rules</div>
            <div style="font-size:20px; font-weight:600;">${escapeHTML(String(aiRuleCounts.approvalRequiredEnabled || 0))}</div>
            <div class="text-muted" style="font-size:11px;">enabled rules requiring approval</div>
          </div>
          <div style="border:1px solid ${cardBorder}; border-radius:8px; padding:8px;">
            <div class="text-muted" style="font-size:11px;">AI agents</div>
            <div style="font-size:20px; font-weight:600;">${escapeHTML(String(enabledAgentCount))}/${escapeHTML(String(state.aiAgents.length || 0))}</div>
            <div class="text-muted" style="font-size:11px;">enabled / total</div>
          </div>
          <div style="border:1px solid ${cardBorder}; border-radius:8px; padding:8px;">
            <div class="text-muted" style="font-size:11px;">Providers enabled</div>
            <div style="font-size:20px; font-weight:600;">${escapeHTML(String(enabledProviderCount))}/${escapeHTML(String(providerNames.length))}</div>
            <div class="text-muted" style="font-size:11px;">configured provider endpoints</div>
          </div>
        </div>
        <div style="font-weight:600; margin-bottom:4px;">Recent provider/model usage</div>
        ${usageRows.length ? `
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${usageRows.map((row) => `
              <span class="badge badge-light" style="padding:6px 8px;">
                ${escapeHTML(row.label)} <span class="text-muted">x${escapeHTML(String(row.count))}</span>
              </span>
            `).join('')}
          </div>
        ` : '<div class="text-muted" style="font-size:12px;">No recent AI workflow runs yet.</div>'}
      </div>
      ` : ''}
      ${showReporting ? `
      <div style="border:1px solid ${cardBorder}; border-radius:8px; padding:10px; margin-bottom:10px; background:${isDark ? '#202020' : '#fcfcfc'};">
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:end; margin-bottom:8px;">
          <div style="font-weight:600;">Reporting controls</div>
          <div style="min-width:120px;">
            <label for="automationAiHistoryLimit" style="margin:0;">History rows</label>
            <select id="automationAiHistoryLimit" class="form-control form-control-sm">
              ${[100, 250, 500].map((size) => `<option value="${size}" ${historyLimit === size ? 'selected' : ''}>${size}</option>`).join('')}
            </select>
          </div>
          <div class="text-muted" style="font-size:12px;">Used for failures, blocked actions, recent runs, and watched-rule execution history.</div>
        </div>
        <div style="font-weight:600; margin-bottom:4px;">Provider / model usage summary</div>
        <div class="table-responsive" style="max-height:220px; overflow:auto; margin-bottom:8px;">
          <table class="table table-sm" style="margin-bottom:0;">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Model</th>
                <th>Total</th>
                <th>Active</th>
                <th>Succeeded</th>
                <th>Failures</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              ${providerUsage.length ? providerUsage.map((row) => `
                <tr>
                  <td>${escapeHTML(String(row.provider || '(default)'))}</td>
                  <td>${escapeHTML(String(row.model || ''))}</td>
                  <td>${escapeHTML(String(row.total || 0))}</td>
                  <td>${escapeHTML(String(Number(row.queued || 0) + Number(row.running || 0)))}</td>
                  <td>${escapeHTML(String(row.succeeded || 0))}</td>
                  <td>${escapeHTML(String(Number(row.failed || 0) + Number(row.dead || 0) + Number(row.canceled || 0)))}</td>
                  <td>${escapeHTML(formatTs(row.lastSeenAt))}</td>
                </tr>
              `).join('') : '<tr><td colspan="7" class="text-muted">No provider/model usage yet.</td></tr>'}
            </tbody>
          </table>
      </div>
      <button type="button" class="btn btn-sm btn-light" id="automationAiExportUsage" style="${aiActionButtonStyle}">Export usage CSV</button>
      </div>
      <div style="border:1px solid ${cardBorder}; border-radius:8px; padding:10px; margin-bottom:10px; background:${isDark ? '#202020' : '#fcfcfc'};">
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:end; margin-bottom:8px;">
          <div style="font-weight:600;">Public AI activity</div>
          <span class="badge badge-light">events: ${escapeHTML(String(publicAuditSummaryRows.total || 0))}</span>
          <span class="badge badge-light">subjects: ${escapeHTML(String(publicAuditSummaryRows.uniqueSubjects || 0))}</span>
          <span class="badge badge-light">source: ${escapeHTML(publicActivitySourceLabel)}</span>
          <button type="button" class="btn btn-sm btn-light" id="automationAiExportPublicAudit" style="${aiActionButtonStyle}">Export public activity CSV</button>
        </div>
        <div class="text-muted" style="font-size:12px; margin-bottom:8px;">Recent public share/portal AI requests, replies, tool calls, and rate-limit blocks. The table stays useful even when Pro Audit is off because the AI runtime keeps its own bounded recent activity log.</div>
        <div class="alert ${publicAuditEnabled ? 'alert-info' : 'alert-warning'}" style="margin-bottom:8px; padding:8px 10px;">
          <div style="font-weight:600; margin-bottom:2px;">Pro Audit ${publicAuditEnabled ? 'enabled' : (publicAuditAvailable ? 'disabled' : 'unavailable')}</div>
          <div style="font-size:12px;">${escapeHTML(publicAuditNote || 'Public AI activity is using the AI runtime log.')}</div>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:8px; margin-bottom:8px;">
          <div style="border:1px solid ${cardBorder}; border-radius:6px; padding:6px;">
            <div class="text-muted" style="font-size:11px;">Chat requests</div>
            <div style="font-size:18px; font-weight:600;">${escapeHTML(String(publicAuditSummaryRows.messages || 0))}</div>
          </div>
          <div style="border:1px solid ${cardBorder}; border-radius:6px; padding:6px;">
            <div class="text-muted" style="font-size:11px;">Tool calls</div>
            <div style="font-size:18px; font-weight:600;">${escapeHTML(String(publicAuditSummaryRows.toolCalls || 0))}</div>
          </div>
          <div style="border:1px solid ${cardBorder}; border-radius:6px; padding:6px;">
            <div class="text-muted" style="font-size:11px;">Rate limited</div>
            <div style="font-size:18px; font-weight:600;">${escapeHTML(String(publicAuditSummaryRows.rateLimited || 0))}</div>
          </div>
          <div style="border:1px solid ${cardBorder}; border-radius:6px; padding:6px;">
            <div class="text-muted" style="font-size:11px;">Failed / blocked</div>
            <div style="font-size:18px; font-weight:600;">${escapeHTML(String(publicAuditSummaryRows.failures || 0))}</div>
          </div>
          <div style="border:1px solid ${cardBorder}; border-radius:6px; padding:6px;">
            <div class="text-muted" style="font-size:11px;">Share events</div>
            <div style="font-size:18px; font-weight:600;">${escapeHTML(String(publicAuditSummaryRows.share || 0))}</div>
          </div>
          <div style="border:1px solid ${cardBorder}; border-radius:6px; padding:6px;">
            <div class="text-muted" style="font-size:11px;">Portal events</div>
            <div style="font-size:18px; font-weight:600;">${escapeHTML(String(publicAuditSummaryRows.portal || 0))}</div>
          </div>
        </div>
        <div class="table-responsive" style="max-height:240px; overflow:auto;">
          <table class="table table-sm" style="margin-bottom:0;">
            <thead>
              <tr>
                <th>Time</th>
                <th>Surface</th>
                <th>Event</th>
                <th>Scope</th>
                <th>Outcome</th>
                <th>Details</th>
                <th>Subject</th>
              </tr>
            </thead>
            <tbody>
              ${publicAudit.length ? publicAudit.map((row) => `
                <tr>
                  <td>${escapeHTML(formatTs(row.ts))}</td>
                  <td>${escapeHTML(row.surface)}</td>
                  <td>
                    <div>${escapeHTML(row.event)}</div>
                    ${row.operation ? `<div class="text-muted" style="font-size:11px;">${escapeHTML(row.operation)}</div>` : ''}
                  </td>
                  <td>${escapeHTML(row.scope)}</td>
                  <td>${publicAuditOutcomeBadge(row)}</td>
                  <td title="${escapeHTML(row.detail || row.clientIp || '')}">
                    ${escapeHTML(row.detail || row.clientIp || '')}
                  </td>
                  <td title="${escapeHTML(row.subjectKey || '')}">
                    <div>${escapeHTML(row.subjectLabel || '')}</div>
                    ${row.clientIp ? `<div class="text-muted" style="font-size:11px;">${escapeHTML(row.clientIp)}</div>` : ''}
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="7" class="text-muted">No recent public AI activity yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <div style="border:1px solid ${cardBorder}; border-radius:8px; padding:10px; margin-bottom:10px; background:${isDark ? '#202020' : '#fcfcfc'};">
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:end; margin-bottom:8px;">
          <div style="font-weight:600;">Failure drill-down</div>
          <span class="badge badge-danger">Failures: ${escapeHTML(String(aiFailureCount))}</span>
          <button type="button" class="btn btn-sm btn-light" id="automationAiExportFailures" style="${aiActionButtonStyle}">Export failures CSV</button>
        </div>
        <div class="table-responsive" style="max-height:240px; overflow:auto;">
          <table class="table table-sm" style="margin-bottom:0;">
            <thead>
              <tr>
                <th>Created</th>
                <th>Type</th>
                <th>Scope</th>
                <th>Provider / model</th>
                <th>Status</th>
                <th>Error</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${failureJobs.length ? failureJobs.map((job) => {
                const providerInfo = aiJobProviderInfo(job);
                return `
                  <tr data-ai-failure-job-id="${escapeHTML(String(job.id || ''))}">
                    <td>${escapeHTML(formatTs(job.createdAt || job.updatedAt || job.runAt))}</td>
                    <td>${escapeHTML(aiJobTypeLabel(job))}</td>
                    <td>${escapeHTML(aiJobScope(job))}</td>
                    <td>${escapeHTML(providerInfo.model ? `${providerInfo.provider} / ${providerInfo.model}` : providerInfo.provider)}</td>
                    <td>${statusBadge(job.status)}</td>
                    <td title="${escapeHTML(aiJobErrorSummary(job))}">${escapeHTML(aiJobErrorSummary(job))}</td>
                    <td>
                      <div style="${aiActionButtonGroupStyle}">
                        <button type="button" class="btn btn-sm btn-light automation-ai-failure-view" style="${aiActionButtonStyle}">View</button>
                        <button type="button" class="btn btn-sm btn-secondary automation-ai-failure-retry" style="${aiActionButtonStyle}">Retry</button>
                        ${job?.payload?.aiResult?.outputCsv ? `<button type="button" class="btn btn-sm btn-light automation-ai-failure-output" style="${aiActionButtonStyle}">Output</button>` : ''}
                      </div>
                    </td>
                  </tr>
                `;
              }).join('') : '<tr><td colspan="7" class="text-muted">No AI failures in the current history window.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      ` : ''}
      ${showOperations ? `
      <div style="border:1px solid ${cardBorder}; border-radius:8px; padding:10px; margin-bottom:10px; background:${isDark ? '#202020' : '#fcfcfc'};">
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:end; margin-bottom:8px;">
          <div style="font-weight:600;">Blocked risky actions</div>
          <span class="badge badge-warning">Pending: ${escapeHTML(String(approvalCounts.pending || 0))}</span>
          <span class="badge badge-danger">Rejected: ${escapeHTML(String(approvalCounts.rejected || 0))}</span>
          <button type="button" class="btn btn-sm btn-light" id="automationAiExportBlocked" style="${aiActionButtonStyle}">Export blocked CSV</button>
        </div>
        ${blockedSummaryRows.length ? `
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
            ${blockedSummaryRows.map((row) => `
              <span class="badge badge-light" style="padding:6px 8px;">
                ${escapeHTML(String(row.workflow || 'unknown'))}: ${escapeHTML(String(row.totalBlocked || 0))}
              </span>
            `).join('')}
          </div>
        ` : '<div class="text-muted" style="font-size:12px; margin-bottom:8px;">No blocked risky actions in the current history window.</div>'}
        <div class="table-responsive" style="max-height:220px; overflow:auto;">
          <table class="table table-sm" style="margin-bottom:0;">
            <thead>
              <tr>
                <th>Created</th>
                <th>Rule</th>
                <th>File</th>
                <th>Workflow</th>
                <th>Status</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              ${blockedApprovals.length ? blockedApprovals.map((approval) => `
                <tr>
                  <td>${escapeHTML(formatTs(approval.createdAt))}</td>
                  <td>${escapeHTML(String(approval.ruleName || ''))}</td>
                  <td title="${escapeHTML(String(approval.path || ''))}">
                    <div>${escapeHTML(String(approval.fileName || approval.path || ''))}</div>
                    ${approval.reason ? `<div class="text-muted" style="font-size:11px;">${escapeHTML(String(approval.reason || ''))}</div>` : ''}
                  </td>
                  <td>${escapeHTML(String(approval.workflow || ''))}</td>
                  <td>${approvalStatusBadge(approval.status)}</td>
                  <td>
                    ${approval.decidedAt ? escapeHTML(formatTs(approval.decidedAt)) : ''}
                    ${approval.decidedBy ? `<div class="text-muted" style="font-size:11px;">${escapeHTML(String(approval.decidedBy || ''))}</div>` : ''}
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="6" class="text-muted">No blocked actions to report.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      ` : ''}
      ${showDashboard ? `
      <div style="border:1px solid ${cardBorder}; border-radius:8px; padding:10px; margin-bottom:10px; background:${isDark ? '#202020' : '#fcfcfc'};">
        <div style="font-weight:600; margin-bottom:6px;">Recent AI workflow runs</div>
        <div class="text-muted" style="font-size:12px; margin-bottom:8px;">Latest AI jobs across invoice extraction, structured extract, tagging, and agent message workflows.</div>
        <div class="table-responsive" style="max-height:240px; overflow:auto;">
          <table class="table table-sm" style="margin-bottom:0;">
            <thead>
              <tr>
                <th>Created</th>
                <th>Type</th>
                <th>Scope</th>
                <th>Provider / model</th>
                <th>Status</th>
                <th>Summary</th>
                <th>Job</th>
              </tr>
            </thead>
            <tbody>
              ${aiJobs.length ? aiJobs.slice(0, 25).map((job) => {
                const providerInfo = aiJobProviderInfo(job);
                return `
                  <tr data-ai-job-id="${escapeHTML(String(job.id || ''))}">
                    <td>${escapeHTML(formatTs(job.createdAt || job.updatedAt || job.runAt))}</td>
                    <td>${escapeHTML(aiJobTypeLabel(job))}</td>
                    <td>${escapeHTML(aiJobScope(job))}</td>
                    <td>
                      <div>${escapeHTML(providerInfo.provider)}</div>
                      ${providerInfo.model ? `<div class="text-muted" style="font-size:11px;">${escapeHTML(providerInfo.model)}</div>` : ''}
                    </td>
                    <td>${statusBadge(job.status)}</td>
                    <td title="${escapeHTML(jobSummary(job))}">${escapeHTML(jobSummary(job))}</td>
                    <td><button type="button" class="btn btn-sm btn-light automation-ai-job-view" style="${aiActionButtonStyle}">#${escapeHTML(String(job.id || ''))}</button></td>
                  </tr>
                `;
              }).join('') : '<tr><td colspan="7" class="text-muted">No AI workflow runs yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      ` : ''}
      ${showOperations ? `
      <div style="border:1px solid ${cardBorder}; border-radius:8px; padding:10px; margin-bottom:10px; background:${isDark ? '#202020' : '#fcfcfc'};">
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:end; margin-bottom:8px;">
          <div style="font-weight:600;">Watched-rule execution history</div>
          <div style="min-width:220px;">
            <label for="automationAiRuleHistoryFilter" style="margin:0;">Rule</label>
            <select id="automationAiRuleHistoryFilter" class="form-control form-control-sm">
              <option value="0" ${selectedRuleHistoryId === 0 ? 'selected' : ''}>All watched rules</option>
              ${state.aiWatchRules.map((rule) => `<option value="${escapeHTML(String(rule.id || 0))}" ${selectedRuleHistoryId === Number(rule.id || 0) ? 'selected' : ''}>${escapeHTML(String(rule.name || `Rule #${rule.id || ''}`))}</option>`).join('')}
            </select>
          </div>
          <button type="button" class="btn btn-sm btn-light" id="automationAiExportRuleHistory" style="${aiActionButtonStyle}">Export rule history CSV</button>
        </div>
        <div class="table-responsive" style="max-height:240px; overflow:auto;">
          <table class="table table-sm" style="margin-bottom:0;">
            <thead>
              <tr>
                <th>Created</th>
                <th>Rule</th>
                <th>File</th>
                <th>Workflow</th>
                <th>Status</th>
                <th>Provider / model</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${ruleHistoryJobs.length ? ruleHistoryJobs.map((job) => {
                const payload = (job && typeof job === 'object' && job.payload && typeof job.payload === 'object') ? job.payload : {};
                const providerInfo = aiJobProviderInfo(job);
                return `
                  <tr data-ai-rule-job-id="${escapeHTML(String(job.id || ''))}">
                    <td>${escapeHTML(formatTs(job.createdAt || job.updatedAt || job.runAt))}</td>
                    <td>${escapeHTML(String(payload.triggerRuleName || `Rule #${payload.triggerRuleId || ''}`))}</td>
                    <td title="${escapeHTML(String(payload.triggerPath || ''))}">${escapeHTML(String(payload.triggerFileName || payload.triggerPath || ''))}</td>
                    <td>${escapeHTML(String(payload.mode || ''))}</td>
                    <td>${statusBadge(job.status)}</td>
                    <td>${escapeHTML(providerInfo.model ? `${providerInfo.provider} / ${providerInfo.model}` : providerInfo.provider)}</td>
                    <td>
                      <div style="${aiActionButtonGroupStyle}">
                        <button type="button" class="btn btn-sm btn-light automation-ai-rule-job-view" style="${aiActionButtonStyle}">View</button>
                        ${payload?.aiResult?.outputCsv || job?.payload?.aiResult?.outputCsv ? `<button type="button" class="btn btn-sm btn-light automation-ai-rule-job-output" style="${aiActionButtonStyle}">Output</button>` : ''}
                      </div>
                    </td>
                  </tr>
                `;
              }).join('') : '<tr><td colspan="7" class="text-muted">No watched-rule executions in the current history window.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      ` : ''}
      ${showSettings ? `
      <div style="border:1px solid ${cardBorder}; border-radius:8px; padding:10px; margin-bottom:10px; background:${isDark ? '#202020' : '#fcfcfc'};">
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:end; justify-content:space-between; margin-bottom:8px;">
          <div>
            <div style="font-weight:600; margin-bottom:4px;">AI setup + providers</div>
            <div class="text-muted" style="font-size:12px;">Core setup stays visible here. Runtime tuning and schema config are collapsed below.</div>
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <span class="badge badge-light">chat: ${!!settings.chatEnabled ? 'on' : 'off'}</span>
            <span class="badge badge-light">usable providers: ${escapeHTML(String(usableProviderCount))}</span>
            <span class="badge badge-light">agents: ${escapeHTML(String(enabledAgentCount))}/${escapeHTML(String(state.aiAgents.length || 0))}</span>
          </div>
        </div>
        ${aiNeedsSetup ? `
          <div class="alert alert-warning" style="margin-bottom:10px;">
            <div style="font-weight:600; margin-bottom:4px;">${escapeHTML(aiSetupTitle)}</div>
            <div>${escapeHTML(aiSetupMessage)}</div>
          </div>
        ` : ''}
        ${dataEgress.enabled ? `
          <div class="alert alert-warning" style="margin-bottom:10px;">
            <div style="font-weight:600; margin-bottom:4px;">External AI data egress</div>
            <div>${escapeHTML(dataEgress.message || 'Enabled external AI providers may send prompts and visible file excerpts to third-party services.')}</div>
          </div>
        ` : ''}
        <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:8px;">
          <label style="display:inline-flex; align-items:center; gap:6px; margin:0;">
            <input id="automationAiChatEnabled" type="checkbox" ${checkedAttr(!!settings.chatEnabled)} />
            <span>Enable AI chat</span>
          </label>
          <label style="display:inline-flex; align-items:center; gap:6px; margin:0;">
            <input id="automationAiReadOnlyMode" type="checkbox" ${checkedAttr(!!settings.readOnlyMode)} />
            <span>Read-only AI mode</span>
          </label>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
          <div style="min-width:160px;">
            <label for="automationAiDefaultProvider" style="margin:0;">Default provider</label>
            <select id="automationAiDefaultProvider" class="form-control form-control-sm">
              ${providerNames.map((name) => `<option value="${name}" ${defaultProvider === name ? 'selected' : ''}>${escapeHTML(providerLabel(name))}</option>`).join('')}
            </select>
          </div>
          <div style="min-width:220px; flex:1;">
            <label for="automationAiDefaultModel" style="margin:0;">Default model override</label>
            <input id="automationAiDefaultModel" class="form-control form-control-sm" value="${escapeHTML(String(settings.defaultModel || ''))}" />
          </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:8px;">
          ${providerDefs.map((def) => {
            const name = def.id;
            const row = (providers && typeof providers[name] === 'object') ? providers[name] : {};
            const hasApiKey = !!row.hasApiKey;
            const keyLabel = def.apiKeyOptional ? 'API key (optional)' : 'API key';
            const keyPlaceholder = hasApiKey
              ? (def.apiKeyOptional ? 'Leave blank to keep current key (optional)' : 'Leave blank to keep current key')
              : (def.apiKeyOptional ? 'Optional bearer key (if endpoint requires auth)' : 'Paste provider key');
            return `
              <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:end; border:1px solid rgba(0,0,0,.08); border-radius:8px; padding:8px;">
                <label style="display:inline-flex; align-items:center; gap:6px; margin:0; min-width:120px;">
                  <input id="automationAiProviderEnabled_${name}" type="checkbox" ${checkedAttr(!!row.enabled)} />
                  <span>${escapeHTML(def.label)}</span>
                </label>
                <div style="min-width:220px; flex:1;">
                  <label for="automationAiProviderModel_${name}" style="margin:0;">Model</label>
                  <input id="automationAiProviderModel_${name}" class="form-control form-control-sm" value="${escapeHTML(String(row.model || ''))}" />
                </div>
                ${def.supportsBaseUrl ? `
                  <div style="min-width:320px; flex:2;">
                    <label for="automationAiProviderBaseUrl_${name}" style="margin:0;">Base URL (OpenAI-compatible endpoint)</label>
                    <input id="automationAiProviderBaseUrl_${name}" class="form-control form-control-sm" value="${escapeHTML(String(row.baseUrl || ''))}" placeholder="http://127.0.0.1:11434/v1 or https://host/v1/chat/completions" />
                    <div class="text-muted" style="font-size:11px; margin-top:3px;">Supports local/self-hosted services that expose OpenAI Chat Completions API.</div>
                  </div>
                ` : ''}
                <div style="min-width:260px; flex:1;">
                  <label for="automationAiProviderKey_${name}" style="margin:0;">${keyLabel} ${hasApiKey ? '(saved/masked)' : ''}</label>
                  <input id="automationAiProviderKey_${name}" type="password" class="form-control form-control-sm" value="" placeholder="${keyPlaceholder}" autocomplete="new-password" />
                </div>
                <label style="display:inline-flex; align-items:center; gap:6px; margin:0; min-width:120px;">
                  <input id="automationAiProviderClear_${name}" type="checkbox" />
                  <span>Clear key</span>
                </label>
              </div>
            `;
          }).join('')}
        </div>
        <details style="border:1px solid ${cardBorder}; border-radius:8px; padding:8px; margin-bottom:8px; background:${isDark ? '#1a1a1a' : '#fff'};">
          <summary style="cursor:pointer; font-weight:600;">Advanced limits + public quotas</summary>
          <div class="text-muted" style="font-size:12px; margin:6px 0 8px 0;">Runtime limits, provider throttles, and public share/portal rate caps.</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
            <div style="min-width:130px;">
              <label for="automationAiMaxToolCalls" style="margin:0;">Max tool calls</label>
              <input id="automationAiMaxToolCalls" type="number" min="1" max="6" class="form-control form-control-sm" value="${escapeHTML(String(settings.maxToolCallsPerTurn || 1))}" />
            </div>
            <div style="min-width:130px;">
              <label for="automationAiMaxFilesPerTool" style="margin:0;">Max files/tool</label>
              <input id="automationAiMaxFilesPerTool" type="number" min="10" max="500" class="form-control form-control-sm" value="${escapeHTML(String(settings.maxFilesPerToolCall || 100))}" />
            </div>
            <div style="min-width:130px;">
              <label for="automationAiPerUserConcurrent" style="margin:0;">User concurrency</label>
              <input id="automationAiPerUserConcurrent" type="number" min="1" max="5" class="form-control form-control-sm" value="${escapeHTML(String(settings.perUserConcurrentJobs || 1))}" />
            </div>
            <div style="min-width:130px;">
              <label for="automationAiPerUserRate" style="margin:0;">User jobs/min</label>
              <input id="automationAiPerUserRate" type="number" min="1" max="120" class="form-control form-control-sm" value="${escapeHTML(String(settings.perUserJobsPerMinute || 4))}" />
            </div>
            <div style="min-width:130px;">
              <label for="automationAiInstanceConcurrent" style="margin:0;">Instance concurrency</label>
              <input id="automationAiInstanceConcurrent" type="number" min="1" max="20" class="form-control form-control-sm" value="${escapeHTML(String(settings.instanceConcurrentJobs || 2))}" />
            </div>
            <div style="min-width:130px;">
              <label for="automationAiProviderRate" style="margin:0;">Provider req/min</label>
              <input id="automationAiProviderRate" type="number" min="1" max="240" class="form-control form-control-sm" value="${escapeHTML(String(settings.providerRequestsPerMinute || 60))}" />
            </div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
            <div style="min-width:150px;">
              <label for="automationAiPublicShareRate" style="margin:0;">Public share req/min</label>
              <input id="automationAiPublicShareRate" type="number" min="1" max="600" class="form-control form-control-sm" value="${escapeHTML(String(settings.publicShareRequestsPerMinute || 30))}" />
            </div>
            <div style="min-width:150px;">
              <label for="automationAiPublicPortalRate" style="margin:0;">Public portal req/min</label>
              <input id="automationAiPublicPortalRate" type="number" min="1" max="600" class="form-control form-control-sm" value="${escapeHTML(String(settings.publicPortalRequestsPerMinute || 30))}" />
            </div>
            <div style="min-width:150px;">
              <label for="automationAiPublicIpRate" style="margin:0;">Public IP req/min</label>
              <input id="automationAiPublicIpRate" type="number" min="1" max="600" class="form-control form-control-sm" value="${escapeHTML(String(settings.publicIpRequestsPerMinute || 90))}" />
            </div>
          </div>
          <div style="border:1px solid ${cardBorder}; border-radius:8px; padding:8px; background:${isDark ? '#202020' : '#fcfcfc'};">
            <div style="font-weight:600; font-size:12px; margin-bottom:4px;">Public AI quota activity</div>
            <div class="text-muted" style="font-size:11px; margin-bottom:6px;">Live counter snapshot for the last ${escapeHTML(String(publicWindowSeconds))} seconds.</div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:8px;">
              <div style="border:1px solid ${cardBorder}; border-radius:6px; padding:6px;">
                <div class="text-muted" style="font-size:11px;">Share windows</div>
                <div style="font-size:18px; font-weight:600;">${escapeHTML(String(publicUsage.shareActiveSubjects || 0))}</div>
                <div class="text-muted" style="font-size:11px;">${escapeHTML(String(publicUsage.shareRequestsInWindow || 0))} requests, ${escapeHTML(String(publicUsage.shareSubjectsAtLimit || 0))} at limit</div>
              </div>
              <div style="border:1px solid ${cardBorder}; border-radius:6px; padding:6px;">
                <div class="text-muted" style="font-size:11px;">Portal windows</div>
                <div style="font-size:18px; font-weight:600;">${escapeHTML(String(publicUsage.portalActiveSubjects || 0))}</div>
                <div class="text-muted" style="font-size:11px;">${escapeHTML(String(publicUsage.portalRequestsInWindow || 0))} requests, ${escapeHTML(String(publicUsage.portalSubjectsAtLimit || 0))} at limit</div>
              </div>
              <div style="border:1px solid ${cardBorder}; border-radius:6px; padding:6px;">
                <div class="text-muted" style="font-size:11px;">Public IP windows</div>
                <div style="font-size:18px; font-weight:600;">${escapeHTML(String(publicUsage.publicIpActiveSubjects || 0))}</div>
                <div class="text-muted" style="font-size:11px;">${escapeHTML(String(publicUsage.publicIpRequestsInWindow || 0))} requests, ${escapeHTML(String(publicUsage.publicIpSubjectsAtLimit || 0))} at limit</div>
              </div>
            </div>
          </div>
        </details>
        <details style="border:1px solid ${cardBorder}; border-radius:8px; padding:8px; margin-bottom:8px; background:${isDark ? '#1a1a1a' : '#fff'};">
          <summary style="cursor:pointer; font-weight:600;">Local adapters + extraction schemas</summary>
          <div class="text-muted" style="font-size:12px; margin:6px 0 8px 0;">Optional local OCR/audio binaries and reusable extraction schema JSON.</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
            <div style="min-width:320px; flex:1;">
              <label for="automationAiOcrBinaryPath" style="margin:0;">OCR binary path (manual)</label>
              <input id="automationAiOcrBinaryPath" class="form-control form-control-sm" value="${escapeHTML(String(settings.ocrBinaryPath || ''))}" placeholder="/usr/local/bin/tesseract" />
              <div class="text-muted" style="font-size:11px; margin-top:3px;">Optional. Used by AI bulk workflows for local OCR.</div>
            </div>
            <div style="min-width:320px; flex:1;">
              <label for="automationAiAudioBinaryPath" style="margin:0;">Audio transcription binary path (manual)</label>
              <input id="automationAiAudioBinaryPath" class="form-control form-control-sm" value="${escapeHTML(String(settings.audioBinaryPath || ''))}" placeholder="/usr/local/bin/whisper" />
              <div class="text-muted" style="font-size:11px; margin-top:3px;">Optional. Used for audio transcription/tagging workflows.</div>
            </div>
            <label style="display:inline-flex; align-items:center; gap:6px; margin:0; min-width:260px;">
              <input id="automationAiVisionDefault" type="checkbox" ${checkedAttr(!!settings.visionEnabledByDefault)} />
              <span>Enable provider vision fallback by default</span>
            </label>
          </div>
          <div>
            <label for="automationAiExtractionSchemas" style="margin:0;">Structured extraction schemas (JSON)</label>
            <textarea id="automationAiExtractionSchemas" class="form-control form-control-sm" rows="10" spellcheck="false">${escapeHTML(JSON.stringify(Array.isArray(settings.extractionSchemas) ? settings.extractionSchemas : [], null, 2))}</textarea>
            <div class="text-muted" style="font-size:11px; margin-top:3px;">Define reusable extraction schemas with ids, fields, outputFormats, matchTerms, and confidenceThreshold.</div>
          </div>
        </details>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <button type="button" class="btn btn-sm btn-primary" id="automationAiSaveSettings">Save AI settings</button>
          <button type="button" class="btn btn-sm btn-light" id="automationAiRefreshSettings">Refresh</button>
          <span class="text-muted" style="font-size:12px;">Keys are encrypted at rest and never re-displayed.</span>
        </div>
      </div>
      ` : ''}

      ${showOperations ? `
      <div style="border:1px solid ${cardBorder}; border-radius:8px; padding:10px; margin-bottom:10px; background:${isDark ? '#202020' : '#fcfcfc'};">
        <div style="font-weight:600; margin-bottom:6px;">Watched folders + approvals</div>
        <div class="text-muted" style="font-size:12px; margin-bottom:8px;">Trigger a bounded AI workflow when a file upload lands in a folder. Rules can queue immediately or hold for admin approval first.</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
          <div style="min-width:180px; flex:1;">
            <label for="automationAiRuleName" style="margin:0;">Rule name</label>
            <input id="automationAiRuleName" class="form-control form-control-sm" value="${escapeHTML(String(selectedRule?.name || ''))}" />
          </div>
          <div style="min-width:170px;">
            <label for="automationAiRuleUser" style="margin:0;">Run as FileRise user</label>
            <input id="automationAiRuleUser" class="form-control form-control-sm" value="${escapeHTML(String(selectedRule?.fileRiseUser || ''))}" />
          </div>
          <div style="min-width:120px;">
            <label for="automationAiRuleSource" style="margin:0;">Source</label>
            <input id="automationAiRuleSource" class="form-control form-control-sm" value="${escapeHTML(String(selectedRule?.sourceId || 'local'))}" />
          </div>
          <div style="min-width:180px; flex:1;">
            <label for="automationAiRuleRoot" style="margin:0;">Root scope</label>
            <input id="automationAiRuleRoot" class="form-control form-control-sm" value="${escapeHTML(String(selectedRule?.rootPath || 'root'))}" />
          </div>
          <div style="min-width:220px; flex:1;">
            <label for="automationAiRuleFolder" style="margin:0;">Watched folder</label>
            <input id="automationAiRuleFolder" class="form-control form-control-sm" value="${escapeHTML(String(selectedRule?.folder || 'root'))}" />
          </div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
          <div style="min-width:160px;">
            <label for="automationAiRuleEvent" style="margin:0;">Trigger event</label>
            <select id="automationAiRuleEvent" class="form-control form-control-sm">
              <option value="file.uploaded" ${String(selectedRule?.event || 'file.uploaded') === 'file.uploaded' ? 'selected' : ''}>file.uploaded</option>
              <option value="portal.uploaded" ${String(selectedRule?.event || '') === 'portal.uploaded' ? 'selected' : ''}>portal.uploaded</option>
            </select>
          </div>
          <div style="min-width:190px;">
            <label for="automationAiRuleWorkflow" style="margin:0;">Workflow</label>
            <select id="automationAiRuleWorkflow" class="form-control form-control-sm">
              <option value="extract_invoices_csv" ${String(selectedRule?.workflow || '') === 'extract_invoices_csv' ? 'selected' : ''}>Extract invoices</option>
              <option value="extract_structured_data" ${String(selectedRule?.workflow || '') === 'extract_structured_data' ? 'selected' : ''}>Extract structured data</option>
              <option value="tag_images" ${String(selectedRule?.workflow || '') === 'tag_images' ? 'selected' : ''}>Tag images</option>
              <option value="transcribe_audio_tag" ${String(selectedRule?.workflow || '') === 'transcribe_audio_tag' ? 'selected' : ''}>Transcribe audio</option>
            </select>
          </div>
          <div style="min-width:220px; flex:1;">
            <label for="automationAiRuleSchemaId" style="margin:0;">Schema id (structured extract)</label>
            <input id="automationAiRuleSchemaId" class="form-control form-control-sm" value="${escapeHTML(String(selectedRule?.schemaId || ''))}" placeholder="invoice_default" />
          </div>
          <div style="min-width:180px; flex:1;">
            <label for="automationAiRuleOutputs" style="margin:0;">Outputs</label>
            <input id="automationAiRuleOutputs" class="form-control form-control-sm" value="${escapeHTML((Array.isArray(selectedRule?.outputFormats) ? selectedRule.outputFormats : ['csv']).join(', '))}" placeholder="csv, json" />
          </div>
          <div style="min-width:180px; flex:1;">
            <label for="automationAiRuleExtensions" style="margin:0;">Extensions filter</label>
            <input id="automationAiRuleExtensions" class="form-control form-control-sm" value="${escapeHTML((Array.isArray(selectedRule?.extensions) ? selectedRule.extensions : []).join(', '))}" placeholder="pdf, jpg, png" />
          </div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px; align-items:end;">
          <div style="min-width:280px; flex:2;">
            <label for="automationAiRuleTagPrompt" style="margin:0;">Tag/analysis prompt override</label>
            <input id="automationAiRuleTagPrompt" class="form-control form-control-sm" value="${escapeHTML(String(selectedRule?.tagPrompt || ''))}" placeholder="Optional prompt for image/audio workflows" />
          </div>
          <label style="display:inline-flex; align-items:center; gap:6px; margin:0; min-width:110px;">
            <input id="automationAiRuleVisionEnabled" type="checkbox" ${checkedAttr(!!selectedRule?.visionEnabled)} />
            <span>Vision</span>
          </label>
          <label style="display:inline-flex; align-items:center; gap:6px; margin:0; min-width:90px;">
            <input id="automationAiRuleOcrEnabled" type="checkbox" ${checkedAttr(!!selectedRule?.ocrEnabled)} />
            <span>OCR</span>
          </label>
          <label style="display:inline-flex; align-items:center; gap:6px; margin:0; min-width:120px;">
            <input id="automationAiRuleRequireApproval" type="checkbox" ${checkedAttr(!!selectedRule?.requireApproval)} />
            <span>Require approval</span>
          </label>
          <label style="display:inline-flex; align-items:center; gap:6px; margin:0; min-width:90px;">
            <input id="automationAiRuleEnabled" type="checkbox" ${checkedAttr(selectedRule ? !!selectedRule.enabled : true)} />
            <span>Enabled</span>
          </label>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
          <button type="button" class="btn btn-sm btn-primary" id="automationAiSaveRule">Save watched rule</button>
          <button type="button" class="btn btn-sm btn-light" id="automationAiNewRule">New rule</button>
          ${selectedRule ? '<button type="button" class="btn btn-sm btn-danger" id="automationAiDeleteRule">Delete</button>' : ''}
        </div>

        <div class="table-responsive" style="max-height:220px; overflow:auto; margin-bottom:10px;">
          <table class="table table-sm" style="margin-bottom:0;">
            <thead>
              <tr>
                <th>Name</th>
                <th>Scope</th>
                <th>Trigger</th>
                <th>Workflow</th>
                <th>Mode</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${state.aiWatchRules.length ? state.aiWatchRules.map((rule) => `
                <tr data-ai-watch-rule-id="${escapeHTML(String(rule.id || ''))}">
                  <td>${escapeHTML(String(rule.name || ''))}</td>
                  <td>${escapeHTML(String(rule.sourceId || 'local'))}:${escapeHTML(String(rule.folder || 'root'))}</td>
                  <td>${escapeHTML(String(rule.event || ''))}</td>
                  <td>${escapeHTML(String(rule.workflow || ''))}</td>
                  <td>${rule.requireApproval ? 'Approval' : 'Auto queue'}${rule.enabled ? '' : ' | disabled'}</td>
                  <td>${escapeHTML(formatTs(rule.updatedAt || rule.createdAt))}</td>
                  <td>
                    <div style="${aiActionButtonGroupStyle}">
                      <button type="button" class="btn btn-sm btn-light automation-ai-rule-edit" style="${aiActionButtonStyle}">Edit</button>
                      <button type="button" class="btn btn-sm btn-danger automation-ai-rule-delete" style="${aiActionButtonStyle}">Delete</button>
                    </div>
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="7" class="text-muted">No watched AI rules configured.</td></tr>'}
            </tbody>
          </table>
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:end; margin-bottom:6px;">
          <div style="font-weight:600;">Approval queue + history</div>
          <span class="badge badge-warning">Pending: ${escapeHTML(String(approvalCounts.pending || 0))}</span>
          <span class="badge badge-info">Queued: ${escapeHTML(String(approvalCounts.queued || 0))}</span>
          <span class="badge badge-danger">Rejected: ${escapeHTML(String(approvalCounts.rejected || 0))}</span>
          <div style="min-width:220px; flex:1;">
            <label for="automationAiApprovalSearch" style="margin:0;">Search</label>
            <input id="automationAiApprovalSearch" class="form-control form-control-sm" value="${escapeHTML(approvalSearchQuery)}" placeholder="rule, file, path, workflow, admin" />
          </div>
          <div style="min-width:140px;">
            <label for="automationAiApprovalStatus" style="margin:0;">Status</label>
            <select id="automationAiApprovalStatus" class="form-control form-control-sm">
              <option value="all" ${approvalStatusFilter === 'all' ? 'selected' : ''}>All</option>
              <option value="pending" ${approvalStatusFilter === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="queued" ${approvalStatusFilter === 'queued' ? 'selected' : ''}>Queued</option>
              <option value="rejected" ${approvalStatusFilter === 'rejected' ? 'selected' : ''}>Rejected</option>
              <option value="approved" ${approvalStatusFilter === 'approved' ? 'selected' : ''}>Approved</option>
            </select>
          </div>
          <div style="min-width:110px;">
            <label for="automationAiApprovalLimit" style="margin:0;">Rows</label>
            <select id="automationAiApprovalLimit" class="form-control form-control-sm">
              ${[25, 50, 100, 200, 500].map((size) => `<option value="${size}" ${approvalLimit === size ? 'selected' : ''}>${size}</option>`).join('')}
            </select>
          </div>
          <button type="button" class="btn btn-sm btn-secondary" id="automationAiSearchApprovals" style="${aiActionButtonStyle}">Search</button>
          <button type="button" class="btn btn-sm btn-light" id="automationAiClearApprovalSearch" style="${aiActionButtonStyle}">Clear</button>
          <button type="button" class="btn btn-sm btn-light" id="automationAiRefreshApprovals" style="${aiActionButtonStyle}">Refresh approvals</button>
        </div>
        <div class="table-responsive" style="max-height:220px; overflow:auto;">
          <table class="table table-sm" style="margin-bottom:0;">
            <thead>
              <tr>
                <th>Created</th>
                <th>Rule</th>
                <th>File</th>
                <th>Workflow</th>
                <th>Status</th>
                <th>Decision</th>
                <th>Job</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${state.aiApprovals.length ? state.aiApprovals.map((approval) => `
                <tr data-ai-approval-id="${escapeHTML(String(approval.id || ''))}">
                  <td>${escapeHTML(formatTs(approval.createdAt))}</td>
                  <td>${escapeHTML(String(approval.ruleName || ''))}</td>
                  <td title="${escapeHTML(String(approval.path || ''))}">
                    <div>${escapeHTML(String(approval.fileName || approval.path || ''))}</div>
                    ${approval.reason ? `<div class="text-muted" style="font-size:11px;">${escapeHTML(String(approval.reason || ''))}</div>` : ''}
                  </td>
                  <td>${escapeHTML(String(approval.workflow || ''))}</td>
                  <td>${approvalStatusBadge(approval.status)}</td>
                  <td>
                    ${approval.decidedAt ? escapeHTML(formatTs(approval.decidedAt)) : ''}
                    ${approval.decidedBy ? `<div class="text-muted" style="font-size:11px;">${escapeHTML(String(approval.decidedBy || ''))}</div>` : ''}
                  </td>
                  <td>${approval.jobId ? `#${escapeHTML(String(approval.jobId))}` : ''}</td>
                  <td>
                    ${String(approval.status || '') === 'pending' ? `
                      <div style="${aiActionButtonGroupStyle}">
                        <button type="button" class="btn btn-sm btn-primary automation-ai-approval-approve" style="${aiActionButtonStyle}" ${isApprovalActionPending(approval.id) ? 'disabled' : ''}>Approve</button>
                        <button type="button" class="btn btn-sm btn-danger automation-ai-approval-reject" style="${aiActionButtonStyle}" ${isApprovalActionPending(approval.id) ? 'disabled' : ''}>Reject</button>
                      </div>
                    ` : ''}
                  </td>
                </tr>
              `).join('') : `<tr><td colspan="8" class="text-muted">${escapeHTML(approvalStatusFilter === 'all' ? 'No AI approvals yet.' : `No AI approvals with status ${approvalStatusFilter}.`)}</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
      ` : ''}

      ${showSettings ? `
      <details style="border:1px solid ${cardBorder}; border-radius:8px; padding:10px; background:${isDark ? '#202020' : '#fcfcfc'};">
        <summary style="cursor:pointer; font-weight:600;">AI agent endpoints (advanced)</summary>
        <div class="text-muted" style="font-size:12px; margin:6px 0 8px 0;">Token-based inbound agents that queue work and can optionally notify an outbound webhook.</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
          <div style="min-width:180px; flex:1;">
            <label for="automationAiAgentName" style="margin:0;">Agent name</label>
            <input id="automationAiAgentName" class="form-control form-control-sm" value="${escapeHTML(String(selectedAgent?.name || ''))}" />
          </div>
          <div style="min-width:170px;">
            <label for="automationAiAgentUser" style="margin:0;">Mapped FileRise user</label>
            <input id="automationAiAgentUser" class="form-control form-control-sm" value="${escapeHTML(String(selectedAgent?.fileRiseUser || ''))}" />
          </div>
          <div style="min-width:120px;">
            <label for="automationAiAgentSource" style="margin:0;">Source</label>
            <input id="automationAiAgentSource" class="form-control form-control-sm" value="${escapeHTML(String(selectedAgent?.sourceId || 'local'))}" />
          </div>
          <div style="min-width:180px; flex:1;">
            <label for="automationAiAgentRoot" style="margin:0;">Root scope</label>
            <input id="automationAiAgentRoot" class="form-control form-control-sm" value="${escapeHTML(String(selectedAgent?.rootPath || 'root'))}" />
          </div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
          <div style="min-width:140px;">
            <label for="automationAiAgentProvider" style="margin:0;">Provider override</label>
            <select id="automationAiAgentProvider" class="form-control form-control-sm">
              <option value="">(default)</option>
              ${providerNames.map((name) => `<option value="${name}" ${agentProvider === name ? 'selected' : ''}>${escapeHTML(providerLabel(name))}</option>`).join('')}
            </select>
          </div>
          <div style="min-width:220px; flex:1;">
            <label for="automationAiAgentModel" style="margin:0;">Model override</label>
            <input id="automationAiAgentModel" class="form-control form-control-sm" value="${escapeHTML(String(selectedAgent?.model || ''))}" />
          </div>
          <div style="min-width:260px; flex:1;">
            <label for="automationAiAgentOutboundUrl" style="margin:0;">Outbound webhook URL (optional)</label>
            <input id="automationAiAgentOutboundUrl" class="form-control form-control-sm" value="${escapeHTML(String(selectedAgent?.outboundUrl || ''))}" />
          </div>
          <div style="min-width:240px; flex:1;">
            <label for="automationAiAgentOutboundSecret" style="margin:0;">Outbound secret ${selectedAgent?.hasOutboundSecret ? '(saved/masked)' : ''}</label>
            <input id="automationAiAgentOutboundSecret" type="password" class="form-control form-control-sm" value="" placeholder="${selectedAgent?.hasOutboundSecret ? 'Leave blank to keep existing secret' : 'Optional HMAC secret'}" autocomplete="new-password" />
          </div>
          <label style="display:inline-flex;align-items:center;gap:6px;margin:0;min-width:120px;">
            <input id="automationAiAgentClearOutboundSecret" type="checkbox" />
            <span>Clear secret</span>
          </label>
          <label style="display:inline-flex;align-items:center;gap:6px;margin:0;min-width:100px;">
            <input id="automationAiAgentEnabled" type="checkbox" ${checkedAttr(selectedAgent ? !!selectedAgent.enabled : true)} />
            <span>Enabled</span>
          </label>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
          <button type="button" class="btn btn-sm btn-primary" id="automationAiSaveAgent">Save agent</button>
          <button type="button" class="btn btn-sm btn-secondary" id="automationAiRotateAgentToken">Save + rotate token</button>
          <button type="button" class="btn btn-sm btn-light" id="automationAiNewAgent">New</button>
          ${selectedAgent ? '<button type=\"button\" class=\"btn btn-sm btn-danger\" id=\"automationAiDeleteAgent\">Delete</button>' : ''}
        </div>
        <div class="table-responsive" style="max-height:220px; overflow:auto;">
          <table class="table table-sm" style="margin-bottom:0;">
            <thead>
              <tr>
                <th>Name</th>
                <th>User</th>
                <th>Scope</th>
                <th>Token</th>
                <th>Outbound</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${state.aiAgents.length ? state.aiAgents.map((agent) => `
                <tr data-ai-agent-id=\"${escapeHTML(String(agent.id || ''))}\">
                  <td>${escapeHTML(String(agent.name || ''))}</td>
                  <td>${escapeHTML(String(agent.fileRiseUser || ''))}</td>
                  <td>${escapeHTML(String(agent.sourceId || 'local'))}:${escapeHTML(String(agent.rootPath || 'root'))}</td>
                  <td>${escapeHTML(String(agent.tokenPreview || ''))}</td>
                  <td>${agent.outboundUrl ? 'Yes' : 'No'}</td>
                  <td>${escapeHTML(formatTs(agent.updatedAt || agent.createdAt))}</td>
                  <td>
                    <div style="${aiActionButtonGroupStyle}">
                      <button type=\"button\" class=\"btn btn-sm btn-light automation-ai-agent-edit\" style=\"${aiActionButtonStyle}\">Edit</button>
                      <button type=\"button\" class=\"btn btn-sm btn-danger automation-ai-agent-delete\" style=\"${aiActionButtonStyle}\">Delete</button>
                    </div>
                  </td>
                </tr>
              `).join('') : '<tr><td colspan=\"7\" class=\"text-muted\">No AI agents configured.</td></tr>'}
            </tbody>
          </table>
        </div>
      </details>
      ` : ''}
    `;

    const collectSettingsPayload = () => {
      const out = {
        chatEnabled: !!paneAi.querySelector('#automationAiChatEnabled')?.checked,
        readOnlyMode: !!paneAi.querySelector('#automationAiReadOnlyMode')?.checked,
        defaultProvider: String(paneAi.querySelector('#automationAiDefaultProvider')?.value || 'openai'),
        defaultModel: String(paneAi.querySelector('#automationAiDefaultModel')?.value || '').trim(),
        maxToolCallsPerTurn: parseInt(String(paneAi.querySelector('#automationAiMaxToolCalls')?.value || '1'), 10),
        maxFilesPerToolCall: parseInt(String(paneAi.querySelector('#automationAiMaxFilesPerTool')?.value || '100'), 10),
        perUserConcurrentJobs: parseInt(String(paneAi.querySelector('#automationAiPerUserConcurrent')?.value || '1'), 10),
        perUserJobsPerMinute: parseInt(String(paneAi.querySelector('#automationAiPerUserRate')?.value || '4'), 10),
        instanceConcurrentJobs: parseInt(String(paneAi.querySelector('#automationAiInstanceConcurrent')?.value || '2'), 10),
        providerRequestsPerMinute: parseInt(String(paneAi.querySelector('#automationAiProviderRate')?.value || '60'), 10),
        publicShareRequestsPerMinute: parseInt(String(paneAi.querySelector('#automationAiPublicShareRate')?.value || '30'), 10),
        publicPortalRequestsPerMinute: parseInt(String(paneAi.querySelector('#automationAiPublicPortalRate')?.value || '30'), 10),
        publicIpRequestsPerMinute: parseInt(String(paneAi.querySelector('#automationAiPublicIpRate')?.value || '90'), 10),
        ocrBinaryPath: String(paneAi.querySelector('#automationAiOcrBinaryPath')?.value || '').trim(),
        audioBinaryPath: String(paneAi.querySelector('#automationAiAudioBinaryPath')?.value || '').trim(),
        visionEnabledByDefault: !!paneAi.querySelector('#automationAiVisionDefault')?.checked,
        providers: {}
      };
      providerNames.forEach((name) => {
        const apiKey = String(paneAi.querySelector(`#automationAiProviderKey_${name}`)?.value || '');
        const clearApiKey = !!paneAi.querySelector(`#automationAiProviderClear_${name}`)?.checked;
        const baseUrl = String(paneAi.querySelector(`#automationAiProviderBaseUrl_${name}`)?.value || '').trim();
        let enabled = !!paneAi.querySelector(`#automationAiProviderEnabled_${name}`)?.checked;
        if (apiKey.trim() !== '' && !clearApiKey) {
          enabled = true;
        }
        if (name === 'openai_compatible' && baseUrl !== '') {
          enabled = true;
        }
        out.providers[name] = {
          enabled,
          model: String(paneAi.querySelector(`#automationAiProviderModel_${name}`)?.value || '').trim(),
          apiKey,
          clearApiKey,
          baseUrl
        };
      });
      out.extractionSchemas = String(paneAi.querySelector('#automationAiExtractionSchemas')?.value || '[]');
      return out;
    };

    paneAi.querySelector('#automationAiCopyIssuedToken')?.addEventListener('click', async () => {
      const tokenEl = paneAi.querySelector('#automationAiIssuedToken');
      const token = String(tokenEl?.value || '');
      if (!token) return;
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(token);
          showToast('Token copied');
          return;
        }
      } catch (err) {
        // Fallback below.
      }
      if (tokenEl && typeof tokenEl.select === 'function') {
        tokenEl.select();
        document.execCommand('copy');
        showToast('Token copied');
      }
    });

    paneAi.querySelector('#automationAiDismissIssuedToken')?.addEventListener('click', () => {
      state.lastIssuedAgentToken = '';
      renderAiPane();
    });

    paneAi.querySelectorAll('[data-ai-subtab]').forEach((button) => {
      button.addEventListener('click', () => {
        const nextTab = String(button.getAttribute('data-ai-subtab') || 'dashboard');
        if (!['dashboard', 'operations', 'reporting', 'settings'].includes(nextTab)) return;
        state.aiSubtab = nextTab;
        renderAiPane();
      });
    });

    paneAi.querySelector('#automationAiSaveSettings')?.addEventListener('click', async () => {
      try {
        await apiPost('/api/pro/ai/config/save.php', collectSettingsPayload());
        showToast('AI settings saved');
        await refreshAi();
        renderAiPane();
      } catch (err) {
        showToast(err?.message || 'Failed to save AI settings', 'error');
      }
    });

    paneAi.querySelector('#automationAiRefreshSettings')?.addEventListener('click', async () => {
      await refreshAi();
      renderAiPane();
    });

    const saveWatchRule = async () => {
      const payload = {
        id: selectedRule ? selectedRule.id : undefined,
        name: String(paneAi.querySelector('#automationAiRuleName')?.value || '').trim(),
        fileRiseUser: String(paneAi.querySelector('#automationAiRuleUser')?.value || '').trim(),
        sourceId: String(paneAi.querySelector('#automationAiRuleSource')?.value || 'local').trim() || 'local',
        rootPath: String(paneAi.querySelector('#automationAiRuleRoot')?.value || 'root').trim() || 'root',
        folder: String(paneAi.querySelector('#automationAiRuleFolder')?.value || 'root').trim() || 'root',
        event: String(paneAi.querySelector('#automationAiRuleEvent')?.value || 'file.uploaded').trim(),
        workflow: String(paneAi.querySelector('#automationAiRuleWorkflow')?.value || '').trim(),
        schemaId: String(paneAi.querySelector('#automationAiRuleSchemaId')?.value || '').trim(),
        outputFormats: String(paneAi.querySelector('#automationAiRuleOutputs')?.value || '').trim(),
        extensions: String(paneAi.querySelector('#automationAiRuleExtensions')?.value || '').trim(),
        tagPrompt: String(paneAi.querySelector('#automationAiRuleTagPrompt')?.value || ''),
        visionEnabled: !!paneAi.querySelector('#automationAiRuleVisionEnabled')?.checked,
        ocrEnabled: !!paneAi.querySelector('#automationAiRuleOcrEnabled')?.checked,
        requireApproval: !!paneAi.querySelector('#automationAiRuleRequireApproval')?.checked,
        enabled: !!paneAi.querySelector('#automationAiRuleEnabled')?.checked
      };

      const res = await apiPost('/api/pro/automation/ai-rules/save.php', { rule: payload });
      showToast('Watched AI rule saved');
      state.selectedWatchRuleId = Number(res?.rule?.id || 0);
      await refreshAiAutomation();
      await refreshMetrics();
      renderAiPane();
    };

    paneAi.querySelector('#automationAiSaveRule')?.addEventListener('click', async () => {
      try {
        await saveWatchRule();
      } catch (err) {
        showToast(err?.message || 'Failed to save watched AI rule', 'error');
      }
    });

    paneAi.querySelector('#automationAiNewRule')?.addEventListener('click', () => {
      state.selectedWatchRuleId = 0;
      renderAiPane();
    });

    paneAi.querySelector('#automationAiDeleteRule')?.addEventListener('click', async () => {
      if (!selectedRule) return;
      if (!window.confirm('Delete this watched AI rule?')) return;
      try {
        await apiPost('/api/pro/automation/ai-rules/delete.php', { id: selectedRule.id });
        showToast('Watched AI rule deleted');
        state.selectedWatchRuleId = 0;
        await refreshAiAutomation();
        renderAiPane();
      } catch (err) {
        showToast(err?.message || 'Failed to delete watched AI rule', 'error');
      }
    });

    paneAi.querySelector('#automationAiRefreshApprovals')?.addEventListener('click', async () => {
      await refreshAiAutomation();
      await refreshMetrics();
      renderAiPane();
    });

    const runApprovalSearch = async () => {
      state.approvalSearchQuery = String(paneAi.querySelector('#automationAiApprovalSearch')?.value || '').trim();
      await refreshAiAutomation();
      renderAiPane();
    };

    paneAi.querySelector('#automationAiApprovalSearch')?.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      await runApprovalSearch();
    });

    paneAi.querySelector('#automationAiSearchApprovals')?.addEventListener('click', async () => {
      await runApprovalSearch();
    });

    paneAi.querySelector('#automationAiClearApprovalSearch')?.addEventListener('click', async () => {
      state.approvalSearchQuery = '';
      await refreshAiAutomation();
      renderAiPane();
    });

    paneAi.querySelector('#automationAiApprovalStatus')?.addEventListener('change', async (event) => {
      state.approvalStatusFilter = String(event?.target?.value || 'all');
      await refreshAiAutomation();
      renderAiPane();
    });

    paneAi.querySelector('#automationAiApprovalLimit')?.addEventListener('change', async (event) => {
      const nextLimit = Number(event?.target?.value || 100);
      state.approvalLimit = [25, 50, 100, 200, 500].includes(nextLimit) ? nextLimit : 100;
      await refreshAiAutomation();
      renderAiPane();
    });

    paneAi.querySelector('#automationAiHistoryLimit')?.addEventListener('change', async (event) => {
      const nextLimit = Number(event?.target?.value || 250);
      state.aiHistoryLimit = [100, 250, 500].includes(nextLimit) ? nextLimit : 250;
      await refreshAiAutomation();
      renderAiPane();
    });

    paneAi.querySelector('#automationAiRuleHistoryFilter')?.addEventListener('change', async (event) => {
      state.selectedRuleHistoryId = Number(event?.target?.value || 0);
      await refreshAiAutomation();
      renderAiPane();
    });

    paneAi.querySelector('#automationAiExportUsage')?.addEventListener('click', () => {
      downloadCsv(
        'ai_provider_usage.csv',
        ['provider', 'model', 'total', 'queued', 'running', 'succeeded', 'failed', 'dead', 'canceled', 'lastSeenAt'],
        providerUsage.map((row) => [
          row.provider || '(default)',
          row.model || '',
          row.total || 0,
          row.queued || 0,
          row.running || 0,
          row.succeeded || 0,
          row.failed || 0,
          row.dead || 0,
          row.canceled || 0,
          row.lastSeenAt || ''
        ])
      );
    });

    paneAi.querySelector('#automationAiExportPublicAudit')?.addEventListener('click', () => {
      downloadCsv(
        'public_ai_audit.csv',
        ['ts', 'surface', 'event', 'operation', 'scope', 'status', 'detail', 'subjectKey', 'clientIp'],
        publicAudit.map((row) => [
          row.ts || '',
          row.surface || '',
          row.event || '',
          row.operation || '',
          row.scope || '',
          row.status || '',
          row.detail || '',
          row.subjectKey || '',
          row.clientIp || ''
        ])
      );
    });

    paneAi.querySelector('#automationAiExportFailures')?.addEventListener('click', () => {
      downloadCsv(
        'ai_failures.csv',
        ['jobId', 'createdAt', 'type', 'scope', 'provider', 'model', 'status', 'error'],
        failureJobs.map((job) => {
          const info = aiJobProviderInfo(job);
          return [
            job.id || '',
            job.createdAt || job.updatedAt || '',
            aiJobTypeLabel(job),
            aiJobScope(job),
            info.provider,
            info.model,
            job.status || '',
            aiJobErrorSummary(job)
          ];
        })
      );
    });

    paneAi.querySelector('#automationAiExportBlocked')?.addEventListener('click', () => {
      downloadCsv(
        'ai_blocked_actions.csv',
        ['approvalId', 'createdAt', 'ruleName', 'fileName', 'path', 'workflow', 'status', 'reason', 'decidedAt', 'decidedBy'],
        blockedApprovals.map((approval) => [
          approval.id || '',
          approval.createdAt || '',
          approval.ruleName || '',
          approval.fileName || '',
          approval.path || '',
          approval.workflow || '',
          approval.status || '',
          approval.reason || '',
          approval.decidedAt || '',
          approval.decidedBy || ''
        ])
      );
    });

    paneAi.querySelector('#automationAiExportRuleHistory')?.addEventListener('click', () => {
      downloadCsv(
        'ai_rule_history.csv',
        ['jobId', 'createdAt', 'ruleId', 'ruleName', 'fileName', 'path', 'workflow', 'provider', 'model', 'status'],
        ruleHistoryJobs.map((job) => {
          const payload = (job && typeof job === 'object' && job.payload && typeof job.payload === 'object') ? job.payload : {};
          const info = aiJobProviderInfo(job);
          return [
            job.id || '',
            job.createdAt || job.updatedAt || '',
            payload.triggerRuleId || '',
            payload.triggerRuleName || '',
            payload.triggerFileName || '',
            payload.triggerPath || '',
            payload.mode || '',
            info.provider,
            info.model,
            job.status || ''
          ];
        })
      );
    });

    paneAi.querySelectorAll('tr[data-ai-job-id]').forEach((row) => {
      const jobId = Number(row.getAttribute('data-ai-job-id') || '0');
      row.querySelector('.automation-ai-job-view')?.addEventListener('click', async () => {
        try {
          await refreshJobs();
          renderJobsPane();
          await openJobDetail(jobId, true);
        } catch (err) {
          showToast(err?.message || 'Failed to load AI workflow job detail', 'error');
        }
      });
    });

    paneAi.querySelectorAll('tr[data-ai-failure-job-id]').forEach((row) => {
      const jobId = Number(row.getAttribute('data-ai-failure-job-id') || '0');
      row.querySelector('.automation-ai-failure-view')?.addEventListener('click', async () => {
        try {
          await refreshJobs();
          renderJobsPane();
          await openJobDetail(jobId, true);
        } catch (err) {
          showToast(err?.message || 'Failed to load failed AI job detail', 'error');
        }
      });
      row.querySelector('.automation-ai-failure-retry')?.addEventListener('click', async () => {
        try {
          await apiPost('/api/pro/automation/jobs/retry.php', { id: jobId });
          showToast('AI job retried');
          await refreshJobs();
          await refreshAiAutomation();
          await refreshMetrics();
          renderJobsPane();
          renderAiPane();
        } catch (err) {
          showToast(err?.message || 'Failed to retry AI job', 'error');
        }
      });
      row.querySelector('.automation-ai-failure-output')?.addEventListener('click', () => {
        downloadAiJobOutput(jobId);
      });
    });

    paneAi.querySelectorAll('tr[data-ai-rule-job-id]').forEach((row) => {
      const jobId = Number(row.getAttribute('data-ai-rule-job-id') || '0');
      row.querySelector('.automation-ai-rule-job-view')?.addEventListener('click', async () => {
        try {
          await refreshJobs();
          renderJobsPane();
          await openJobDetail(jobId, true);
        } catch (err) {
          showToast(err?.message || 'Failed to load watched-rule job detail', 'error');
        }
      });
      row.querySelector('.automation-ai-rule-job-output')?.addEventListener('click', () => {
        downloadAiJobOutput(jobId);
      });
    });

    paneAi.querySelectorAll('tr[data-ai-watch-rule-id]').forEach((row) => {
      const id = Number(row.getAttribute('data-ai-watch-rule-id') || '0');
      row.querySelector('.automation-ai-rule-edit')?.addEventListener('click', () => {
        state.selectedWatchRuleId = id;
        renderAiPane();
      });
      row.querySelector('.automation-ai-rule-delete')?.addEventListener('click', async () => {
        if (!window.confirm('Delete this watched AI rule?')) return;
        try {
          await apiPost('/api/pro/automation/ai-rules/delete.php', { id });
          showToast('Watched AI rule deleted');
          if (state.selectedWatchRuleId === id) state.selectedWatchRuleId = 0;
          await refreshAiAutomation();
          renderAiPane();
        } catch (err) {
          showToast(err?.message || 'Failed to delete watched AI rule', 'error');
        }
      });
    });

    paneAi.querySelectorAll('tr[data-ai-approval-id]').forEach((row) => {
      const id = Number(row.getAttribute('data-ai-approval-id') || '0');
      row.querySelector('.automation-ai-approval-approve')?.addEventListener('click', async () => {
        if (isApprovalActionPending(id)) return;
        setApprovalActionPending(id, true);
        renderAiPane();
        try {
          const res = await apiPost('/api/pro/automation/approvals/decide.php', { id, decision: 'approve' });
          showToast(`Approval queued job #${res.jobId || 'n/a'}`);
          setApprovalActionPending(id, false);
          await refreshAiAutomation();
          await refreshJobs();
          await refreshMetrics();
          renderAiPane();
          renderJobsPane();
        } catch (err) {
          setApprovalActionPending(id, false);
          renderAiPane();
          showToast(err?.message || 'Failed to approve AI workflow', 'error');
        }
      });
      row.querySelector('.automation-ai-approval-reject')?.addEventListener('click', async () => {
        if (isApprovalActionPending(id)) return;
        setApprovalActionPending(id, true);
        renderAiPane();
        try {
          await apiPost('/api/pro/automation/approvals/decide.php', { id, decision: 'reject' });
          showToast('Approval rejected');
          setApprovalActionPending(id, false);
          await refreshAiAutomation();
          await refreshMetrics();
          renderAiPane();
        } catch (err) {
          setApprovalActionPending(id, false);
          renderAiPane();
          showToast(err?.message || 'Failed to reject AI workflow', 'error');
        }
      });
    });

    const saveAgent = async (rotateToken) => {
      const payload = {
        id: selectedAgent ? selectedAgent.id : undefined,
        name: String(paneAi.querySelector('#automationAiAgentName')?.value || '').trim(),
        fileRiseUser: String(paneAi.querySelector('#automationAiAgentUser')?.value || '').trim(),
        sourceId: String(paneAi.querySelector('#automationAiAgentSource')?.value || 'local').trim() || 'local',
        rootPath: String(paneAi.querySelector('#automationAiAgentRoot')?.value || 'root').trim() || 'root',
        provider: String(paneAi.querySelector('#automationAiAgentProvider')?.value || '').trim(),
        model: String(paneAi.querySelector('#automationAiAgentModel')?.value || '').trim(),
        outboundUrl: String(paneAi.querySelector('#automationAiAgentOutboundUrl')?.value || '').trim(),
        outboundSecret: String(paneAi.querySelector('#automationAiAgentOutboundSecret')?.value || ''),
        clearOutboundSecret: !!paneAi.querySelector('#automationAiAgentClearOutboundSecret')?.checked,
        enabled: !!paneAi.querySelector('#automationAiAgentEnabled')?.checked,
        rotateToken: !!rotateToken
      };

      const res = await apiPost('/api/pro/ai/agents/save.php', { agent: payload });
      if (res?.token) {
        state.lastIssuedAgentToken = String(res.token);
        showToast('Agent token rotated');
      } else {
        state.lastIssuedAgentToken = '';
        showToast('AI agent saved');
      }
      state.selectedAgentId = String(res?.agent?.id || state.selectedAgentId || '');
      await refreshAi();
      renderAiPane();
    };

    paneAi.querySelector('#automationAiSaveAgent')?.addEventListener('click', async () => {
      try {
        await saveAgent(false);
      } catch (err) {
        showToast(err?.message || 'Failed to save AI agent', 'error');
      }
    });

    paneAi.querySelector('#automationAiRotateAgentToken')?.addEventListener('click', async () => {
      try {
        await saveAgent(true);
      } catch (err) {
        showToast(err?.message || 'Failed to rotate agent token', 'error');
      }
    });

    paneAi.querySelector('#automationAiNewAgent')?.addEventListener('click', () => {
      state.selectedAgentId = '';
      renderAiPane();
    });

    paneAi.querySelector('#automationAiDeleteAgent')?.addEventListener('click', async () => {
      if (!selectedAgent) return;
      if (!window.confirm('Delete this AI agent?')) return;
      try {
        await apiPost('/api/pro/ai/agents/delete.php', { id: selectedAgent.id });
        showToast('AI agent deleted');
        state.selectedAgentId = '';
        await refreshAi();
        renderAiPane();
      } catch (err) {
        showToast(err?.message || 'Failed to delete AI agent', 'error');
      }
    });

    paneAi.querySelectorAll('tr[data-ai-agent-id]').forEach((row) => {
      const id = String(row.getAttribute('data-ai-agent-id') || '');
      row.querySelector('.automation-ai-agent-edit')?.addEventListener('click', () => {
        state.selectedAgentId = id;
        renderAiPane();
      });
      row.querySelector('.automation-ai-agent-delete')?.addEventListener('click', async () => {
        if (!window.confirm('Delete this AI agent?')) return;
        try {
          await apiPost('/api/pro/ai/agents/delete.php', { id });
          showToast('AI agent deleted');
          if (state.selectedAgentId === id) state.selectedAgentId = '';
          await refreshAi();
          renderAiPane();
        } catch (err) {
          showToast(err?.message || 'Failed to delete AI agent', 'error');
        }
      });
    });
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
          <button type="button" class="btn btn-sm btn-secondary" id="automationSaveSecurity" style="${automationActionButtonStyle}">Save security</button>
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
        <button type="button" class="btn btn-primary" id="automationSaveEndpoint" style="${automationPrimaryButtonStyle}">Save endpoint</button>
        <button type="button" class="btn btn-secondary" id="automationClearEndpoint" style="${automationPrimaryButtonStyle}">New endpoint</button>
        ${endpoint ? `<button type="button" class="btn btn-sm btn-outline-primary" id="automationTestEndpoint" style="${automationActionButtonStyle}" ${webhooksEnabledGlobal ? '' : 'disabled'}>Test send</button>` : ''}
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
                  <div style="${automationActionButtonGroupStyle}">
                    <button type="button" class="btn btn-sm btn-light automation-edit-endpoint" style="${automationActionButtonStyle}">Edit</button>
                    <button type="button" class="btn btn-sm btn-light automation-test-endpoint" style="${automationActionButtonStyle}" ${webhooksEnabledGlobal ? '' : 'disabled'}>Test</button>
                    <button type="button" class="btn btn-sm btn-danger automation-delete-endpoint" style="${automationActionButtonStyle}">Delete</button>
                  </div>
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
        <button type="button" class="btn btn-sm btn-primary" id="automationQueueScan" style="${automationActionButtonStyle}">Queue ClamAV scan</button>
        <button type="button" class="btn btn-sm btn-light" id="automationStartWorker" style="${automationActionButtonStyle}">Start worker</button>
        <button type="button" class="btn btn-sm btn-light" id="automationRestartWorker" style="${automationActionButtonStyle}">Restart worker</button>
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
        <button type="button" class="btn btn-sm btn-secondary" id="automationSaveScanInterval" style="${automationActionButtonStyle}">Set interval</button>
        <button type="button" class="btn btn-sm btn-light" id="automationUnsetScanInterval" style="${automationActionButtonStyle}">Unset override</button>
        <button type="button" class="btn btn-sm btn-light" id="automationCleanupHistory" style="${automationActionButtonStyle}">Cleanup history</button>
        <button type="button" class="btn btn-sm btn-light" id="automationCleanupWorkers" style="${automationActionButtonStyle}">Cleanup stale workers</button>
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
        <button type="button" class="btn btn-sm btn-secondary" id="automationJobsRefresh" style="${automationActionButtonStyle}">Refresh</button>
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
                  <div style="${automationActionButtonGroupStyle}">
                    <button type="button" class="btn btn-sm btn-light automation-job-view" style="${automationActionButtonStyle}">View</button>
                    <button type="button" class="btn btn-sm btn-secondary automation-job-retry" style="${automationActionButtonStyle}">Retry</button>
                    <button type="button" class="btn btn-sm btn-danger automation-job-cancel" style="${automationActionButtonStyle}">Cancel</button>
                  </div>
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
        <div id="automationJobDetailActions" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:8px;"></div>
        <pre id="automationJobDetailPre" style="white-space:pre-wrap; max-height:220px; overflow:auto; border:1px solid ${cardBorder}; border-radius:8px; padding:8px; background:${isDark ? '#171717' : '#fafafa'};"></pre>
      </div>
    `;

    const statusSel = paneJobs.querySelector('#automationJobsStatus');
    const refreshBtn = paneJobs.querySelector('#automationJobsRefresh');
    const queueScanBtn = paneJobs.querySelector('#automationQueueScan');
    const startWorkerBtn = paneJobs.querySelector('#automationStartWorker');
    const restartWorkerBtn = paneJobs.querySelector('#automationRestartWorker');
    const saveScanIntervalBtn = paneJobs.querySelector('#automationSaveScanInterval');
    const unsetScanIntervalBtn = paneJobs.querySelector('#automationUnsetScanInterval');
    const cleanupHistoryBtn = paneJobs.querySelector('#automationCleanupHistory');
    const cleanupWorkersBtn = paneJobs.querySelector('#automationCleanupWorkers');

    statusSel?.addEventListener('change', async () => {
      state.statusFilter = String(statusSel.value || '');
      await refreshJobs();
      renderJobsPane();
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

    restartWorkerBtn?.addEventListener('click', async () => {
      if (!window.confirm('Restart the automation worker? Use this after replacing Pro files so the loop reloads the new code.')) return;
      try {
        const res = await apiPost('/api/pro/automation/worker/start.php', { force: true });
        if (res.started) {
          showToast('Automation worker restarted');
        } else if (res.alreadyRunning) {
          showToast('Automation worker is already running');
        } else {
          showToast('Automation worker restart requested');
        }
        await refreshMetrics();
        renderJobsPane();
      } catch (err) {
        showToast(err?.message || 'Failed to restart worker', 'error');
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
          await openJobDetail(jobId);
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

  async function refreshAi() {
    const res = await apiGet('/api/pro/ai/config/get.php');
    state.aiSettings = (res && res.settings && typeof res.settings === 'object') ? res.settings : null;
    state.aiPublicUsage = (res && res.publicUsage && typeof res.publicUsage === 'object') ? res.publicUsage : null;
    state.aiPublicAuditStatus = (res && res.publicAuditStatus && typeof res.publicAuditStatus === 'object') ? res.publicAuditStatus : null;
    state.aiPublicActivityRows = Array.isArray(res?.publicActivity) ? res.publicActivity : [];
    state.aiAgents = Array.isArray(res?.agents) ? res.agents : [];
    state.aiRuntimeWarning = String(res?.runtimeWarning || '');
    if (state.selectedAgentId && !agentById(state.selectedAgentId)) {
      state.selectedAgentId = '';
    }
  }

  async function refreshAiAutomation() {
    const approvalParams = new URLSearchParams();
    approvalParams.set('limit', String(state.approvalLimit || 100));
    if (state.approvalStatusFilter && state.approvalStatusFilter !== 'all') {
      approvalParams.set('status', String(state.approvalStatusFilter));
    }
    if (state.approvalSearchQuery) {
      approvalParams.set('search', String(state.approvalSearchQuery));
    }
    const blockedParams = new URLSearchParams();
    blockedParams.set('limit', String(state.aiHistoryLimit || 250));

    const aiJobsParams = new URLSearchParams();
    aiJobsParams.set('type', 'ai');
    aiJobsParams.set('limit', String(state.aiHistoryLimit || 250));

    const aiFailureParams = new URLSearchParams();
    aiFailureParams.set('type', 'ai');
    aiFailureParams.set('limit', String(state.aiHistoryLimit || 250));
    aiFailureParams.set('status', 'failed,dead,canceled');

    const ruleHistoryParams = new URLSearchParams();
    ruleHistoryParams.set('type', 'ai');
    ruleHistoryParams.set('limit', String(state.aiHistoryLimit || 250));
    ruleHistoryParams.set('watchedRuleOnly', '1');
    if (state.selectedRuleHistoryId) {
      ruleHistoryParams.set('triggerRuleId', String(state.selectedRuleHistoryId));
    }

    const publicAuditParams = new URLSearchParams();
    publicAuditParams.set('action', '.public.');
    publicAuditParams.set('limit', String(state.aiHistoryLimit || 250));

    const [rulesRes, approvalsRes, aiJobsRes, blockedRes, failureRes, ruleHistoryRes, publicAuditRes] = await Promise.all([
      apiGet('/api/pro/automation/ai-rules/list.php'),
      apiGet(`/api/pro/automation/approvals/list.php?${approvalParams.toString()}`),
      apiGet(`/api/pro/automation/jobs/list.php?${aiJobsParams.toString()}`),
      apiGet(`/api/pro/automation/approvals/list.php?${blockedParams.toString()}`),
      apiGet(`/api/pro/automation/jobs/list.php?${aiFailureParams.toString()}`),
      apiGet(`/api/pro/automation/jobs/list.php?${ruleHistoryParams.toString()}`),
      apiGet(`/api/pro/audit/list.php?${publicAuditParams.toString()}`).catch(() => ({ rows: [] }))
    ]);
    state.aiWatchRules = Array.isArray(rulesRes?.rules) ? rulesRes.rules : [];
    state.aiApprovals = Array.isArray(approvalsRes?.approvals) ? approvalsRes.approvals : [];
    state.aiJobs = Array.isArray(aiJobsRes?.jobs) ? aiJobsRes.jobs : [];
    state.aiBlockedApprovals = (Array.isArray(blockedRes?.approvals) ? blockedRes.approvals : []).filter((approval) => {
      const status = String(approval?.status || '');
      return status === 'pending' || status === 'rejected';
    });
    state.aiFailureJobs = Array.isArray(failureRes?.jobs) ? failureRes.jobs : [];
    state.aiRuleHistoryJobs = Array.isArray(ruleHistoryRes?.jobs) ? ruleHistoryRes.jobs : [];
    state.aiPublicAuditRows = Array.isArray(publicAuditRes?.rows) ? publicAuditRes.rows : [];
    if (state.selectedWatchRuleId && !watchRuleById(state.selectedWatchRuleId)) {
      state.selectedWatchRuleId = 0;
    }
    if (state.selectedRuleHistoryId && !watchRuleById(state.selectedRuleHistoryId)) {
      state.selectedRuleHistoryId = 0;
    }
  }

  async function refreshAll() {
    try {
      await Promise.all([refreshEndpoints(), refreshJobs(), refreshMetrics(), refreshAi(), refreshAiAutomation()]);
      renderWebhooksPane();
      renderJobsPane();
      renderAiPane();
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
  tabAi?.addEventListener('click', () => {
    state.activeTab = 'ai';
    if (shouldOpenAiSettingsByDefault()) {
      state.aiSubtab = 'settings';
    }
    renderTabs();
  });

  renderTabs();
  refreshAll();
}
