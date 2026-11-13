// transferProgress.js
import { t } from './i18n.js?v={{APP_QVER}}';

const TRANSFER_UI_DELAY_MS = 300;
const TRANSFER_TICK_MS = 200;
const FINAL_VISIBLE_MS = 900;
const STALE_PROGRESS_ESTIMATE_DELAY_MS = 1400;
const MAX_ESTIMATED_PCT_BEFORE_DONE = 97;

const SPEED_STORAGE_KEY = 'frTransferSpeedBps';
const MIN_SPEED_BPS = 256 * 1024;
const MAX_SPEED_BPS = 200 * 1024 * 1024;
const DEFAULT_SPEED_BPS = 8 * 1024 * 1024;
const MIN_ESTIMATE_MS = 1200;
const MINIMIZED_STORAGE_KEY = 'frTransferCenterMin';

let _seq = 0;
let _jobs = new Map();
let _tickTimer = null;
let _ui = null;
let _minimized = false;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatSpeed(bps) {
  return `${formatBytes(bps)}/s`;
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function readStoredSpeed() {
  try {
    const raw = parseFloat(localStorage.getItem(SPEED_STORAGE_KEY));
    if (Number.isFinite(raw) && raw > 0) {
      return clamp(raw, MIN_SPEED_BPS, MAX_SPEED_BPS);
    }
  } catch (e) { /* ignore */ }
  return DEFAULT_SPEED_BPS;
}

function storeSpeed(bps) {
  try {
    localStorage.setItem(SPEED_STORAGE_KEY, String(Math.round(bps)));
  } catch (e) { /* ignore */ }
}

function readMinimized() {
  try {
    return localStorage.getItem(MINIMIZED_STORAGE_KEY) === 'true';
  } catch (e) {
    return false;
  }
}

function storeMinimized(min) {
  try {
    localStorage.setItem(MINIMIZED_STORAGE_KEY, min ? 'true' : 'false');
  } catch (e) { /* ignore */ }
}

function ensureStyles() {
  if (document.getElementById('frTransferProgressStyles')) return;
  const style = document.createElement('style');
  style.id = 'frTransferProgressStyles';
  style.textContent = `
    #frTransferCenter {
      position: fixed;
      right: 12px;
      bottom: 12px;
      width: min(420px, calc(100vw - 20px));
      max-height: min(72vh, 640px);
      z-index: 14070;
      border: 1px solid rgba(0,0,0,0.12);
      border-radius: 12px;
      background: #fff;
      color: #111;
      box-shadow: 0 16px 38px rgba(0,0,0,0.22);
      overflow: hidden;
      display: none;
    }
    body.dark-mode #frTransferCenter {
      background: rgb(20, 20, 20);
      color: #e0e0e0;
      border: 1px solid rgba(255,255,255,0.16);
    }
    #frTransferCenter .fr-transfer-center-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 12px;
      border-bottom: 1px solid rgba(0,0,0,0.08);
      font-size: 13px;
      font-weight: 600;
      background: rgba(0,0,0,0.02);
    }
    body.dark-mode #frTransferCenter .fr-transfer-center-head {
      border-bottom-color: rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.03);
    }
    #frTransferCenter .fr-transfer-center-head button {
      border: none;
      background: transparent;
      color: inherit;
      cursor: pointer;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    #frTransferCenter .fr-transfer-center-head button:hover,
    #frTransferCenter .fr-transfer-center-head button:focus-visible {
      outline: none;
      background: rgba(0,0,0,0.08);
    }
    body.dark-mode #frTransferCenter .fr-transfer-center-head button:hover,
    body.dark-mode #frTransferCenter .fr-transfer-center-head button:focus-visible {
      background: rgba(255,255,255,0.08);
    }
    #frTransferCenterList {
      overflow: auto;
      max-height: min(62vh, 560px);
      padding: 8px;
      display: grid;
      gap: 8px;
    }
    #frTransferCenter .fr-transfer-item {
      border: 1px solid rgba(0,0,0,0.1);
      border-radius: 10px;
      padding: 9px 10px;
      background: rgba(0,0,0,0.02);
    }
    body.dark-mode #frTransferCenter .fr-transfer-item {
      border-color: rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.04);
    }
    #frTransferCenter .fr-transfer-item-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 4px;
    }
    #frTransferCenter .fr-transfer-item-right {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    #frTransferCenter .fr-transfer-item-title {
      font-size: 13px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #frTransferCenter .fr-transfer-item-state {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 999px;
      background: rgba(0,0,0,0.08);
      text-transform: none;
      letter-spacing: 0.02em;
      flex-shrink: 0;
    }
    #frTransferCenter .fr-transfer-item-state.state-running {
      background: rgba(37, 99, 235, 0.14);
      color: #1d4ed8;
    }
    #frTransferCenter .fr-transfer-item-state.state-queued {
      background: rgba(249, 115, 22, 0.16);
      color: #c2410c;
    }
    #frTransferCenter .fr-transfer-item-state.state-cancelling {
      background: rgba(245, 158, 11, 0.2);
      color: #b45309;
    }
    #frTransferCenter .fr-transfer-item-state.state-done {
      background: rgba(16, 185, 129, 0.18);
      color: #047857;
    }
    #frTransferCenter .fr-transfer-item-state.state-error {
      background: rgba(239, 68, 68, 0.2);
      color: #b91c1c;
    }
    #frTransferCenter .fr-transfer-item-cancel {
      border: 1px solid rgba(0,0,0,0.18);
      border-radius: 999px;
      background: rgba(255,255,255,0.9);
      color: inherit;
      font-size: 11px;
      line-height: 1;
      padding: 5px 8px;
      cursor: pointer;
      display: none;
    }
    #frTransferCenter .fr-transfer-item-cancel:hover,
    #frTransferCenter .fr-transfer-item-cancel:focus-visible {
      outline: none;
      background: rgba(0,0,0,0.08);
    }
    #frTransferCenter .fr-transfer-item-cancel[disabled] {
      cursor: default;
      opacity: 0.66;
    }
    body.dark-mode #frTransferCenter .fr-transfer-item-cancel {
      border-color: rgba(255,255,255,0.24);
      background: rgba(255,255,255,0.08);
      color: #f1f3f4;
    }
    body.dark-mode #frTransferCenter .fr-transfer-item-cancel:hover,
    body.dark-mode #frTransferCenter .fr-transfer-item-cancel:focus-visible {
      background: rgba(255,255,255,0.14);
    }
    #frTransferCenter .fr-transfer-item-sub {
      font-size: 12px;
      opacity: 0.85;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-bottom: 6px;
    }
    #frTransferCenter .fr-transfer-bar {
      position: relative;
      height: 8px;
      border-radius: 999px;
      background: linear-gradient(180deg, rgba(0,0,0,0.10), rgba(0,0,0,0.02));
      overflow: hidden;
    }
    body.dark-mode #frTransferCenter .fr-transfer-bar {
      background: linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.04));
    }
    #frTransferCenter .fr-transfer-bar-fill {
      height: 100%;
      width: 0%;
      background: linear-gradient(180deg, #7bc0ff 0%, #2f7fd8 55%, #2567b5 100%);
      transition: width 180ms ease;
    }
    #frTransferCenter .fr-transfer-bar-fill.is-error {
      background: linear-gradient(180deg, #fca5a5 0%, #dc2626 55%, #b91c1c 100%);
    }
    #frTransferCenter .fr-transfer-bar-fill.is-done {
      background: linear-gradient(180deg, #86efac 0%, #22c55e 55%, #16a34a 100%);
    }
    #frTransferCenter .fr-transfer-bar-indet {
      position: absolute;
      top: 0;
      left: -40%;
      width: 40%;
      height: 100%;
      background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.6) 50%, rgba(255,255,255,0) 100%);
      opacity: 0;
      animation: fr-transfer-indet 1.2s ease-in-out infinite;
    }
    #frTransferCenter .fr-transfer-bar.indeterminate .fr-transfer-bar-fill {
      width: 100%;
      opacity: 0.2;
    }
    #frTransferCenter .fr-transfer-bar.indeterminate .fr-transfer-bar-indet {
      opacity: 1;
    }
    #frTransferCenter .fr-transfer-item-metrics {
      margin-top: 6px;
      font-size: 12px;
      opacity: 0.86;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #frTransferCenterPill {
      position: fixed;
      right: 12px;
      bottom: 12px;
      z-index: 14080;
      display: none;
    }
    #frTransferCenterPill .fr-transfer-pill-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(255,255,255,0.96);
      border: 1px solid rgba(0,0,0,0.12);
      box-shadow: 0 8px 22px rgba(0,0,0,0.22);
      color: #111;
      cursor: pointer;
      font-size: 12px;
    }
    body.dark-mode #frTransferCenterPill .fr-transfer-pill-btn {
      background: rgba(32,33,36,0.96);
      border: 1px solid rgba(255,255,255,0.16);
      color: #f1f3f4;
    }
    @keyframes fr-transfer-indet {
      0% { left: -40%; }
      60% { left: 100%; }
      100% { left: 100%; }
    }
    @media (prefers-reduced-motion: reduce) {
      #frTransferCenter .fr-transfer-bar-indet {
        animation: none;
      }
    }
  `;
  document.head.appendChild(style);
}

function ensureUi() {
  if (_ui) return _ui;
  ensureStyles();

  const center = document.createElement('div');
  center.id = 'frTransferCenter';
  center.innerHTML = `
    <div class="fr-transfer-center-head">
      <div id="frTransferCenterTitle">Transfers</div>
      <button type="button" id="frTransferCenterMinBtn" aria-label="Minimize">
        <span class="material-icons">minimize</span>
      </button>
    </div>
    <div id="frTransferCenterList"></div>
  `;

  const pill = document.createElement('div');
  pill.id = 'frTransferCenterPill';
  pill.innerHTML = `
    <button type="button" class="fr-transfer-pill-btn" id="frTransferCenterPillBtn">
      <span class="material-icons" aria-hidden="true">swap_horiz</span>
      <span id="frTransferCenterPillText">Transfers</span>
    </button>
  `;

  document.body.appendChild(center);
  document.body.appendChild(pill);

  const minBtn = center.querySelector('#frTransferCenterMinBtn');
  const pillBtn = pill.querySelector('#frTransferCenterPillBtn');
  minBtn?.addEventListener('click', () => setMinimized(true));
  pillBtn?.addEventListener('click', () => setMinimized(false));

  _ui = {
    center,
    list: center.querySelector('#frTransferCenterList'),
    title: center.querySelector('#frTransferCenterTitle'),
    pill,
    pillText: pill.querySelector('#frTransferCenterPillText')
  };

  _minimized = readMinimized();
  return _ui;
}

function getJobStateClass(job) {
  const state = String(job.state || '').toLowerCase();
  if (state === 'running' || state === 'finishing') return 'state-running';
  if (state === 'queued') return 'state-queued';
  if (state === 'cancel_requested' || state === 'cancelling') return 'state-cancelling';
  if (state === 'done') return 'state-done';
  if (state === 'error' || state === 'failed') return 'state-error';
  if (state === 'cancelled') return 'state-error';
  return 'state-running';
}

function getJobStateLabel(job) {
  const state = String(job.state || '').toLowerCase();
  if (state === 'reconnecting') return t('transfer_reconnecting');
  if (state === 'unknown') return t('transfer_status_unknown');
  if (state === 'queued') return 'Queued';
  if (state === 'cancel_requested' || state === 'cancelling') return 'Cancelling';
  if (state === 'finishing') return 'Finalizing';
  if (state === 'done') return 'Done';
  if (state === 'error' || state === 'failed') return 'Failed';
  if (state === 'cancelled') return 'Cancelled';
  return 'Running';
}

function buildTitle(job) {
  if (job.title) return job.title;
  const action = job.action || 'Transferring';
  const count = Number(job.itemCount || 0);
  const label = job.itemLabel || 'items';
  return count ? `${action} ${count} ${label}` : action;
}

function formatLocationLabel(path) {
  const raw = String(path || '').trim();
  if (!raw || raw.toLowerCase() === 'root') return 'Root';
  return raw;
}

function buildSub(job) {
  if (job.subText) return job.subText;
  const hasSource = typeof job.source === 'string' && job.source.trim() !== '';
  const hasDestination = typeof job.destination === 'string' && job.destination.trim() !== '';
  if (!hasSource && !hasDestination) return '';

  const source = formatLocationLabel(job.source);
  const destination = formatLocationLabel(job.destination);
  if (hasSource && hasDestination) {
    if (source === destination) return '';
    return `${source} -> ${destination}`;
  }
  if (hasDestination) return `To ${destination}`;
  return `From ${source}`;
}

function setMinimized(min) {
  _minimized = !!min;
  storeMinimized(_minimized);
  renderAll();
}

function ensureJobDom(job) {
  const ui = ensureUi();
  if (job.ui && job.ui.row && job.ui.row.isConnected) return job.ui;

  const row = document.createElement('div');
  row.className = 'fr-transfer-item';
  row.dataset.jobId = String(job.id);
  row.innerHTML = `
    <div class="fr-transfer-item-head">
      <div class="fr-transfer-item-title"></div>
      <div class="fr-transfer-item-right">
        <button type="button" class="fr-transfer-item-cancel">Cancel</button>
        <div class="fr-transfer-item-state"></div>
      </div>
    </div>
    <div class="fr-transfer-item-sub"></div>
    <div class="fr-transfer-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100">
      <div class="fr-transfer-bar-fill"></div>
      <div class="fr-transfer-bar-indet"></div>
    </div>
    <div class="fr-transfer-item-metrics"></div>
  `;

  ui.list?.appendChild(row);
  const cancelBtn = row.querySelector('.fr-transfer-item-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (!job.cancelable || typeof job.onCancel !== 'function') return;
      if (job.cancelInFlight || job.cancelRequested) return;

      job.cancelInFlight = true;
      job.cancelRequested = true;
      if (job.state === 'queued' || job.state === 'running') {
        job.state = 'cancel_requested';
      }
      renderAll();

      Promise.resolve(job.onCancel(job))
        .then(() => {
          job.cancelInFlight = false;
          renderAll();
        })
        .catch((err) => {
          job.cancelInFlight = false;
          job.cancelRequested = false;
          if (job.state === 'cancel_requested') {
            job.state = 'running';
          }
          console.warn('Transfer cancel failed', err);
          renderAll();
        });
    });
  }

  job.ui = {
    row,
    title: row.querySelector('.fr-transfer-item-title'),
    state: row.querySelector('.fr-transfer-item-state'),
    cancelBtn,
    sub: row.querySelector('.fr-transfer-item-sub'),
    bar: row.querySelector('.fr-transfer-bar'),
    fill: row.querySelector('.fr-transfer-bar-fill'),
    metrics: row.querySelector('.fr-transfer-item-metrics')
  };
  return job.ui;
}

function clearRemovedRows() {
  const ui = ensureUi();
  if (!ui.list) return;
  const keep = new Set(Array.from(_jobs.keys()).map((id) => String(id)));
  ui.list.querySelectorAll('.fr-transfer-item').forEach((row) => {
    const id = row.dataset.jobId || '';
    if (!keep.has(id)) {
      row.remove();
    }
  });
}

function estimateProgress(job, elapsedMs) {
  const totalBytes = Number(job.totalBytes || 0);
  const estimateMs = Math.max(MIN_ESTIMATE_MS, (totalBytes / job.estimateBps) * 1000);
  const ratio = Math.min(0.95, elapsedMs / estimateMs);
  const doneBytes = Math.min(totalBytes, Math.floor(totalBytes * ratio));
  return { ratio, doneBytes };
}

function estimateElapsedProgress(job, elapsedMs, totalBytes, doneBytes = 0) {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) return null;

  let bps = Number.isFinite(job.estimateBps) ? job.estimateBps : readStoredSpeed();
  bps = clamp(bps, MIN_SPEED_BPS, MAX_SPEED_BPS);

  if (Number.isFinite(doneBytes) && doneBytes > 0 && elapsedMs > 1000) {
    const observed = (doneBytes * 1000) / Math.max(1, elapsedMs);
    if (Number.isFinite(observed) && observed > 0) {
      bps = clamp((bps * 0.4) + (observed * 0.6), MIN_SPEED_BPS, MAX_SPEED_BPS);
    }
  }

  const estimatedDone = clamp(
    Math.max(Number.isFinite(doneBytes) ? doneBytes : 0, Math.round((elapsedMs / 1000) * bps)),
    0,
    totalBytes
  );
  const pct = clamp(Math.round((estimatedDone / Math.max(1, totalBytes)) * 100), 0, MAX_ESTIMATED_PCT_BEFORE_DONE);
  const etaMs = Math.max(0, Math.round(((totalBytes - estimatedDone) / Math.max(1, bps)) * 1000));

  return { pct, estimatedDone, bps, etaMs };
}

function applyProgressBar(job, ui, pct, { indeterminate = false, finalError = false, finalDone = false } = {}) {
  if (!ui?.bar || !ui?.fill) return;
  if (indeterminate) {
    ui.bar.classList.add('indeterminate');
    ui.fill.style.width = '100%';
    ui.bar.setAttribute('aria-valuenow', '0');
  } else {
    ui.bar.classList.remove('indeterminate');
    const clamped = clamp(Number.isFinite(pct) ? pct : 0, 0, 100);
    ui.fill.style.width = `${clamped}%`;
    ui.bar.setAttribute('aria-valuenow', String(clamped));
    job.renderedPct = clamped;
  }
  ui.fill.classList.toggle('is-error', !!finalError);
  ui.fill.classList.toggle('is-done', !!finalDone);
}

function renderJob(job) {
  if (!job) return;
  const ui = ensureJobDom(job);
  const now = Date.now();
  const state = String(job.state || '').toLowerCase();
  const cancelling = state === 'cancel_requested' || state === 'cancelling';
  const running = state === 'running' || state === 'finishing' || cancelling;
  const queued = state === 'queued';
  const done = state === 'done';
  const finishing = state === 'finishing';
  const failed = ['error', 'failed', 'cancelled'].includes(state);
  const elapsedMs = (done || failed) && job.endedAt ? (job.endedAt - job.startedAt) : (now - job.startedAt);

  const title = buildTitle(job);
  const sub = buildSub(job);
  if (ui.title) ui.title.textContent = title;
  if (ui.sub) {
    ui.sub.textContent = sub || '';
    ui.sub.style.display = sub ? '' : 'none';
  }

  if (ui.state) {
    ui.state.className = `fr-transfer-item-state ${getJobStateClass(job)}`;
    ui.state.textContent = getJobStateLabel(job);
  }

  if (ui.cancelBtn) {
    const cancellableState = queued || state === 'running' || cancelling;
    const canCancel = !!job.cancelable && cancellableState && !done && !failed && !finishing;
    const cancellingUi = !!job.cancelInFlight || !!job.cancelRequested || cancelling;
    ui.cancelBtn.style.display = canCancel ? 'inline-flex' : 'none';
    ui.cancelBtn.disabled = !canCancel || cancellingUi;
    ui.cancelBtn.textContent = cancellingUi ? 'Cancelling...' : 'Cancel';
    ui.cancelBtn.title = cancellingUi ? 'Cancellation requested' : 'Cancel transfer';
  }

  const hasActual = job.mode === 'actual';
  const totalBytes = Number.isFinite(job.bytesTotal) ? job.bytesTotal : Number(job.totalBytes || 0);

  if (state === 'reconnecting' || state === 'unknown') {
    applyProgressBar(job, ui, Number.isFinite(job.pct) ? job.pct : 0, { indeterminate: state === 'reconnecting' });
    if (ui.metrics) ui.metrics.textContent = state === 'reconnecting' ? t('transfer_reconnecting') : job.error;
    return;
  }

  if (queued) {
    applyProgressBar(job, ui, 0, { indeterminate: true });
    if (ui.metrics) ui.metrics.textContent = 'Waiting for worker...';
    return;
  }

  if (running && hasActual) {
    const totalFiles = Number.isFinite(job.filesTotal) ? job.filesTotal : Number(job.itemCount || 0);
    const doneFiles = Number.isFinite(job.filesDone) ? job.filesDone : null;
    const doneBytes = Number.isFinite(job.bytesDone) ? job.bytesDone : null;

    if (finishing) {
      const startAt = Number(job.finalizeStartAt || now);
      const durationMs = Math.max(220, Number(job.finalizeDurationMs || 650));
      const fromPct = clamp(Number(job.finalizeFromPct || 0), 0, 99);
      const ratio = clamp((now - startAt) / durationMs, 0, 1);
      const displayPct = clamp(Math.round(fromPct + ((100 - fromPct) * ratio)), 0, 100);

      applyProgressBar(job, ui, displayPct, { indeterminate: false });

      const parts = [`${displayPct}%`];
      if (Number.isFinite(doneBytes) && totalBytes > 0) {
        parts.push(`${formatBytes(doneBytes)} / ${formatBytes(totalBytes)}`);
      } else if (Number.isFinite(doneFiles) && totalFiles > 0) {
        parts.push(`${doneFiles}/${totalFiles} items`);
      }
      parts.push('Finalizing...');
      parts.push(formatDuration(Math.max(0, now - job.startedAt)));
      if (ui.metrics) ui.metrics.textContent = parts.join(' - ');

      if (ratio >= 1) {
        job.state = 'done';
        job.pct = 100;
        job.endedAt = now;
        if (!job.removeAt) job.removeAt = now + FINAL_VISIBLE_MS;
        delete job.finalizeStartAt;
        delete job.finalizeDurationMs;
        delete job.finalizeFromPct;
      }
      return;
    }

    let actualPct = Number.isFinite(job.pct) ? clamp(job.pct, 0, 100) : null;
    if (!Number.isFinite(actualPct)) {
      if (Number.isFinite(doneBytes) && totalBytes > 0) {
        actualPct = clamp(Math.round((doneBytes / totalBytes) * 100), 0, 100);
      } else if (Number.isFinite(doneFiles) && totalFiles > 0) {
        actualPct = clamp(Math.round((doneFiles / totalFiles) * 100), 0, 100);
      }
    }

    const lastServerProgressAt = Number(job.lastProgressAt || job.startedAt || now);
    const staleMs = Math.max(0, now - lastServerProgressAt);
    const canEstimateCatchup =
      totalBytes > 0 &&
      staleMs >= STALE_PROGRESS_ESTIMATE_DELAY_MS &&
      (!Number.isFinite(actualPct) || actualPct < 99);

    const est = canEstimateCatchup
      ? estimateElapsedProgress(job, elapsedMs, totalBytes, Number.isFinite(doneBytes) ? doneBytes : 0)
      : null;

    let displayPct = Number.isFinite(actualPct) ? actualPct : null;
    let usingEstimate = false;
    if (est && Number.isFinite(est.pct) && (!Number.isFinite(displayPct) || est.pct > displayPct + 1)) {
      displayPct = est.pct;
      usingEstimate = true;
    }

    const indeterminate = !Number.isFinite(displayPct);
    applyProgressBar(job, ui, Number.isFinite(displayPct) ? displayPct : 0, { indeterminate });

    const base = [];
    if (Number.isFinite(displayPct)) {
      base.push(usingEstimate ? `~${displayPct}%` : `${displayPct}%`);
    }
    if (totalBytes > 0) {
      const shownDoneBytes = usingEstimate && est
        ? Math.max(Number.isFinite(doneBytes) ? doneBytes : 0, Number(est.estimatedDone || 0))
        : (Number.isFinite(doneBytes) ? doneBytes : null);
      if (Number.isFinite(shownDoneBytes)) {
        base.push(`${formatBytes(shownDoneBytes)} / ${formatBytes(totalBytes)}`);
      }
    } else if (Number.isFinite(doneFiles) && totalFiles > 0) {
      base.push(`${doneFiles}/${totalFiles} items`);
    }
    if (usingEstimate && est && Number.isFinite(est.bps)) {
      base.push(`~${formatSpeed(est.bps)}`);
      base.push(`ETA ${formatDuration(est.etaMs)}`);
    }
    if (cancelling) {
      base.push('Cancelling...');
    }
    if (job.current) {
      base.push(String(job.current));
    }
    base.push(formatDuration(elapsedMs));

    if (ui.metrics) ui.metrics.textContent = base.join(' - ');
    return;
  }

  if (running) {
    if (job.indeterminate || totalBytes <= 0) {
      applyProgressBar(job, ui, 0, { indeterminate: true });
      const count = Number(job.itemCount || 0);
      const countLabel = count ? `${count} item${count === 1 ? '' : 's'}` : 'Working';
      if (ui.metrics) {
        ui.metrics.textContent = cancelling
          ? `${countLabel} - Cancelling... - ${formatDuration(elapsedMs)}`
          : `${countLabel} - ${formatDuration(elapsedMs)}`;
      }
      return;
    }

    const est = estimateProgress(job, elapsedMs);
    const pct = clamp(Math.round(est.ratio * 100), 0, 95);
    applyProgressBar(job, ui, pct);

    const doneLabel = formatBytes(est.doneBytes);
    const totalLabel = formatBytes(totalBytes);
    const speedLabel = formatSpeed(job.estimateBps);
    if (ui.metrics) {
      const tail = cancelling ? ' - Cancelling...' : '';
      ui.metrics.textContent = `${pct}% - ${doneLabel} / ${totalLabel} - ${speedLabel} - ${formatDuration(elapsedMs)}${tail}`;
    }
    return;
  }

  if (done) {
    applyProgressBar(job, ui, 100, { finalDone: true });
    const totalFiles = Number.isFinite(job.filesTotal) ? job.filesTotal : Number(job.itemCount || 0);
    const totalBytes = Number.isFinite(job.bytesTotal) ? job.bytesTotal : Number(job.totalBytes || 0);
    const doneBits = [];
    if (totalFiles > 0) doneBits.push(`${totalFiles} item${totalFiles === 1 ? '' : 's'}`);
    if (totalBytes > 0) doneBits.push(formatBytes(totalBytes));
    doneBits.push(formatDuration(elapsedMs));
    if (ui.metrics) ui.metrics.textContent = `Done - ${doneBits.join(' - ')}`;
    return;
  }

  applyProgressBar(job, ui, 100, { finalError: true });
  const msg = job.error ? `Failed: ${job.error}` : 'Failed';
  if (ui.metrics) ui.metrics.textContent = `${msg} - ${formatDuration(elapsedMs)}`;
}

function renderShell(jobs) {
  const ui = ensureUi();
  const count = jobs.length;
  const active = jobs.filter((j) => ['queued', 'running', 'reconnecting', 'finishing', 'cancel_requested', 'cancelling'].includes(String(j.state || '').toLowerCase())).length;

  if (!count) {
    ui.center.style.display = 'none';
    ui.pill.style.display = 'none';
    return;
  }

  if (ui.title) {
    const queued = jobs.filter((j) => String(j.state || '').toLowerCase() === 'queued').length;
    ui.title.textContent = queued > 0
      ? `Transfers (${active} active, ${queued} queued)`
      : `Transfers (${active} active)`;
  }

  if (ui.pillText) {
    const done = jobs.filter((j) => String(j.state || '').toLowerCase() === 'done').length;
    const errors = jobs.filter((j) => ['error', 'failed', 'cancelled'].includes(String(j.state || '').toLowerCase())).length;
    ui.pillText.textContent = `${active} active • ${done} done${errors ? ` • ${errors} failed` : ''}`;
  }

  if (_minimized) {
    ui.center.style.display = 'none';
    ui.pill.style.display = 'block';
  } else {
    ui.center.style.display = 'block';
    ui.pill.style.display = 'none';
  }
}

function cleanupFinishedJobs(now = Date.now()) {
  for (const [id, job] of _jobs.entries()) {
    if (!job) continue;
    if (job.dismissed) {
      _jobs.delete(id);
      continue;
    }
    if (job.removeAt > 0 && now >= job.removeAt) {
      _jobs.delete(id);
    }
  }
}

function renderAll() {
  const now = Date.now();
  cleanupFinishedJobs(now);

  const displayJobs = [];
  for (const job of _jobs.values()) {
    if (!job) continue;
    if (!job.shown && now < job.showAt) continue;
    if (!job.shown) job.shown = true;
    renderJob(job);
    displayJobs.push(job);
  }

  clearRemovedRows();
  renderShell(displayJobs);

  if (_jobs.size === 0 && _tickTimer) {
    clearInterval(_tickTimer);
    _tickTimer = null;
  }
}

function ensureTicking() {
  if (_tickTimer) return;
  _tickTimer = setInterval(() => {
    renderAll();
  }, TRANSFER_TICK_MS);
}

function resolveJob(ref) {
  if (!ref) return null;
  if (typeof ref === 'number' || typeof ref === 'string') {
    return _jobs.get(Number(ref)) || null;
  }
  if (typeof ref === 'object' && Number.isFinite(ref.id)) {
    return _jobs.get(Number(ref.id)) || ref;
  }
  return null;
}

export function startTransferProgress(opts = {}) {
  ensureUi();

  const job = {
    id: ++_seq,
    action: String(opts.action || 'Transferring'),
    itemCount: Number.isFinite(opts.itemCount) ? opts.itemCount : 0,
    itemLabel: opts.itemLabel ? String(opts.itemLabel) : 'items',
    totalBytes: Number.isFinite(opts.totalBytes) ? opts.totalBytes : 0,
    source: opts.source ? String(opts.source) : '',
    destination: opts.destination ? String(opts.destination) : '',
    title: opts.title ? String(opts.title) : '',
    subText: opts.subText ? String(opts.subText) : '',
    startedAt: Date.now(),
    endedAt: 0,
    showAt: Date.now() + TRANSFER_UI_DELAY_MS,
    shown: false,
    estimateBps: readStoredSpeed(),
    indeterminate: false,
    state: String(opts.state || 'running').toLowerCase(),
    error: '',
    removeAt: 0,
    dismissed: false,
    mode: 'estimate',
    pct: null,
    bytesDone: null,
    bytesTotal: null,
    filesDone: null,
    filesTotal: null,
    current: '',
    lastProgressAt: Date.now(),
    renderedPct: null,
    cancelable: !!opts.cancelable && typeof opts.onCancel === 'function',
    onCancel: (typeof opts.onCancel === 'function') ? opts.onCancel : null,
    cancelInFlight: false,
    cancelRequested: false
  };

  const bytesKnown = opts.bytesKnown !== false;
  job.indeterminate = !!opts.indeterminate || !bytesKnown || job.totalBytes <= 0;

  _jobs.set(job.id, job);
  ensureTicking();
  renderAll();
  return job;
}

export function updateTransferProgress(jobRef, updates = {}) {
  const job = resolveJob(jobRef);
  if (!job) return;

  let progressed = false;

  if (typeof updates.state === 'string') job.state = updates.state.toLowerCase();
  if (typeof updates.status === 'string') job.state = updates.status.toLowerCase();
  if (typeof updates.error === 'string') job.error = updates.error;
  if (typeof updates.current === 'string') {
    if (updates.current !== job.current) progressed = true;
    job.current = updates.current;
  }
  if (typeof updates.cancelRequested === 'boolean') {
    job.cancelRequested = updates.cancelRequested;
    if (updates.cancelRequested && (job.state === 'running' || job.state === 'queued')) {
      job.state = 'cancel_requested';
    }
  }

  if (Number.isFinite(updates.pct)) {
    const next = clamp(Number(updates.pct), 0, 100);
    if (!Number.isFinite(job.pct) || next !== job.pct) progressed = true;
    job.pct = next;
  }
  if (Number.isFinite(updates.bytesDone)) {
    const next = Number(updates.bytesDone);
    if (!Number.isFinite(job.bytesDone) || next !== job.bytesDone) progressed = true;
    job.bytesDone = next;
  }
  if (Number.isFinite(updates.bytesTotal)) job.bytesTotal = Number(updates.bytesTotal);
  if (Number.isFinite(updates.selectedBytes)) job.bytesTotal = Number(updates.selectedBytes);
  if (Number.isFinite(updates.filesDone)) {
    const next = Number(updates.filesDone);
    if (!Number.isFinite(job.filesDone) || next !== job.filesDone) progressed = true;
    job.filesDone = next;
  }
  if (Number.isFinite(updates.filesTotal)) job.filesTotal = Number(updates.filesTotal);
  if (Number.isFinite(updates.selectedFiles)) job.filesTotal = Number(updates.selectedFiles);

  if (progressed) {
    job.lastProgressAt = Date.now();
  }

  job.mode = 'actual';

  const st = String(job.state || '').toLowerCase();
  if (['done', 'error', 'failed', 'cancelled'].includes(st)) {
    job.cancelable = false;
    job.onCancel = null;
    job.cancelInFlight = false;
    if (!job.endedAt) {
      job.endedAt = Date.now();
    }
    if (!job.removeAt) {
      job.removeAt = Date.now() + FINAL_VISIBLE_MS;
    }
  }

  ensureTicking();
  renderAll();
}

export function finishTransferProgress(jobRef, { ok = true, error = '', state = '' } = {}) {
  const job = resolveJob(jobRef);
  if (!job) return;

  const now = Date.now();
  const totalBytes = Number.isFinite(job.bytesTotal) && job.bytesTotal > 0
    ? job.bytesTotal
    : Number(job.totalBytes || 0);

  if (ok && !job.indeterminate && totalBytes > 0) {
    const elapsedSec = Math.max(0.5, (now - job.startedAt) / 1000);
    const bytesForRate = totalBytes;
    const actualBps = bytesForRate / elapsedSec;
    const clamped = clamp(actualBps, MIN_SPEED_BPS, MAX_SPEED_BPS);
    const blended = Math.round(job.estimateBps * 0.7 + clamped * 0.3);
    storeSpeed(blended);
  }

  if (ok) {
    let currentPct = Number.isFinite(job.pct) ? clamp(job.pct, 0, 100) : null;
    if (!Number.isFinite(currentPct)) {
      if (Number.isFinite(job.bytesDone) && totalBytes > 0) {
        currentPct = clamp(Math.round((job.bytesDone / totalBytes) * 100), 0, 100);
      } else if (Number.isFinite(job.filesDone) && Number.isFinite(job.filesTotal) && job.filesTotal > 0) {
        currentPct = clamp(Math.round((job.filesDone / job.filesTotal) * 100), 0, 100);
      }
    }

    const visiblePct = Number.isFinite(job.renderedPct) ? clamp(job.renderedPct, 0, 100) : null;
    const fromPct = Number.isFinite(visiblePct) ? visiblePct : currentPct;
    const shouldSmoothFinish = job.mode === 'actual' && Number.isFinite(fromPct) && fromPct >= 0 && fromPct < 98;
    if (shouldSmoothFinish) {
      job.state = 'finishing';
      job.error = '';
      job.finalizeStartAt = now;
      job.finalizeDurationMs = 650;
      job.finalizeFromPct = clamp(Number(fromPct), 0, 99);
      job.endedAt = now + job.finalizeDurationMs;
      job.removeAt = job.endedAt + FINAL_VISIBLE_MS;
      ensureTicking();
      renderAll();
      return;
    }
  }

  const requestedState = String(state || '').toLowerCase();
  const finalState = requestedState || (ok ? 'done' : 'error');
  job.state = finalState;
  job.error = ok ? '' : String(error || '');
  job.endedAt = now;
  job.removeAt = job.endedAt + (finalState === 'unknown' ? 30000 : FINAL_VISIBLE_MS);
  job.cancelable = false;
  job.onCancel = null;
  job.cancelInFlight = false;

  ensureTicking();
  renderAll();
}

export function setTransferProgressCancel(jobRef, { cancelable = false, onCancel = null } = {}) {
  const job = resolveJob(jobRef);
  if (!job) return;

  const fn = (typeof onCancel === 'function') ? onCancel : null;
  job.cancelable = !!cancelable && !!fn;
  job.onCancel = fn;

  if (!job.cancelable) {
    job.cancelInFlight = false;
    job.cancelRequested = false;
  }

  ensureTicking();
  renderAll();
}
