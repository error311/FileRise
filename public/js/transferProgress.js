// transferProgress.js

const TRANSFER_UI_DELAY_MS = 300;
const TRANSFER_TICK_MS = 200;
const FINAL_VISIBLE_MS = 700;

const SPEED_STORAGE_KEY = 'frTransferSpeedBps';
const MIN_SPEED_BPS = 256 * 1024;
const MAX_SPEED_BPS = 200 * 1024 * 1024;
const DEFAULT_SPEED_BPS = 8 * 1024 * 1024;
const MIN_ESTIMATE_MS = 1200;
const MINIMIZED_STORAGE_KEY = 'frTransferProgressMin';
const GRAPH_SAMPLE_MS = 240;
const GRAPH_MAX_SAMPLES = 101;
const GRAPH_VIEW_W = 100;
const GRAPH_VIEW_H = 40;
const GRAPH_SUB_STEP = 0.5;
const GRAPH_SMOOTH_WINDOW = 3;

let _activeJob = null;
let _showTimer = null;
let _tickTimer = null;
let _hideTimer = null;
let _seq = 0;
let _ui = null;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
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

// Transfer UI doesn't receive live byte counts; use a smoothed estimate for the speed graph.
// TODO: replace estimate with real byte telemetry when transfer jobs expose progress updates.
function sampleGraphSpeed(job, elapsedMs) {
  const base = Number.isFinite(job?.estimateBps) ? job.estimateBps : DEFAULT_SPEED_BPS;
  const wave = 0.08 * Math.sin(elapsedMs / 700) + 0.04 * Math.sin(elapsedMs / 2200 + 1.2);
  const factor = clamp(1 + wave, 0.75, 1.2);
  return clamp(base * factor, MIN_SPEED_BPS * 0.5, MAX_SPEED_BPS * 1.1);
}

function pushGraphSample(job, elapsedMs, pct) {
  if (!job || !Number.isFinite(pct)) return;
  const now = Date.now();
  if (job.lastSampleAt && (now - job.lastSampleAt) < GRAPH_SAMPLE_MS) return;
  job.lastSampleAt = now;
  const clampedPct = clamp(pct, 0, 100);
  const bucket = Math.round(clampedPct);
  const speed = sampleGraphSpeed(job, elapsedMs);
  if (!Array.isArray(job.speedHistory) || job.speedHistory.length !== GRAPH_MAX_SAMPLES) {
    job.speedHistory = new Array(GRAPH_MAX_SAMPLES).fill(null);
  }
  job.speedHistory[bucket] = speed;
  job.graphLastPct = Math.max(job.graphLastPct || 0, bucket);
  if (!job.graphMax || speed > job.graphMax) job.graphMax = speed;
}

function buildInterpolatedSeries(samples, maxPct) {
  const series = new Array(maxPct + 1).fill(null);
  for (let i = 0; i <= maxPct; i += 1) {
    const val = samples[i];
    if (Number.isFinite(val)) series[i] = val;
  }

  let prevIdx = null;
  for (let i = 0; i <= maxPct; i += 1) {
    if (!Number.isFinite(series[i])) continue;
    if (prevIdx === null) {
      for (let j = 0; j < i; j += 1) series[j] = series[i];
    } else if (i > prevIdx + 1) {
      const start = series[prevIdx];
      const end = series[i];
      for (let j = prevIdx + 1; j < i; j += 1) {
        const t = (j - prevIdx) / (i - prevIdx);
        series[j] = start + (end - start) * t;
      }
    }
    prevIdx = i;
  }

  if (prevIdx === null) return series.fill(0);
  for (let j = prevIdx + 1; j <= maxPct; j += 1) series[j] = series[prevIdx];
  return series;
}

function smoothSeries(series, windowSize) {
  const size = Math.max(1, Math.floor(windowSize || 1));
  if (size <= 1) return series.slice();
  const half = Math.floor(size / 2);
  const out = new Array(series.length);
  for (let i = 0; i < series.length; i += 1) {
    let sum = 0;
    let count = 0;
    for (let j = i - half; j <= i + half; j += 1) {
      if (j < 0 || j >= series.length) continue;
      sum += series[j];
      count += 1;
    }
    out[i] = count ? (sum / count) : series[i];
  }
  return out;
}

function buildSmoothPath(coords) {
  if (!coords.length) return '';
  if (coords.length === 1) {
    return `M ${coords[0][0].toFixed(2)} ${coords[0][1].toFixed(2)}`;
  }
  if (coords.length === 2) {
    return `M ${coords[0][0].toFixed(2)} ${coords[0][1].toFixed(2)} L ${coords[1][0].toFixed(2)} ${coords[1][1].toFixed(2)}`;
  }
  let d = `M ${coords[0][0].toFixed(2)} ${coords[0][1].toFixed(2)}`;
  for (let i = 1; i < coords.length - 1; i += 1) {
    const [x1, y1] = coords[i];
    const [x2, y2] = coords[i + 1];
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    d += ` Q ${x1.toFixed(2)} ${y1.toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`;
  }
  const last = coords[coords.length - 1];
  d += ` T ${last[0].toFixed(2)} ${last[1].toFixed(2)}`;
  return d;
}

function renderGraph(job, ui, currentPct) {
  if (!ui?.graphLine || !ui?.graphFill) return;
  const samples = Array.isArray(job?.speedHistory) ? job.speedHistory : [];
  const maxPct = Number.isFinite(currentPct)
    ? clamp(Math.round(currentPct), 0, 100)
    : clamp(job?.graphLastPct || 0, 0, 100);
  if (!samples.length || maxPct <= 0) {
    ui.graphLine.setAttribute('d', '');
    ui.graphFill.setAttribute('d', '');
    return;
  }

  const interpolated = buildInterpolatedSeries(samples, maxPct);
  const smoothed = smoothSeries(interpolated, GRAPH_SMOOTH_WINDOW);
  const maxVal = Math.max(...smoothed, 1);
  const height = GRAPH_VIEW_H;
  const width = GRAPH_VIEW_W;
  const usable = height - 2;
  const coords = [];
  for (let t = 0; t <= maxPct + 1e-6; t += GRAPH_SUB_STEP) {
    const idx = Math.min(Math.floor(t), maxPct);
    const frac = Math.min(1, t - idx);
    const v1 = smoothed[idx] ?? 0;
    const v2 = smoothed[Math.min(idx + 1, maxPct)] ?? v1;
    const speed = v1 + (v2 - v1) * frac;
    const x = (t / 100) * width;
    const y = height - 1 - (speed / maxVal) * usable;
    coords.push([x, y]);
  }

  const lineD = buildSmoothPath(coords);

  let fillD = `M 0 ${height}`;
  for (let i = 0; i < coords.length; i += 1) {
    fillD += ` L ${coords[i][0].toFixed(2)} ${coords[i][1].toFixed(2)}`;
  }
  fillD += ` L ${coords[coords.length - 1][0].toFixed(2)} ${height} Z`;

  ui.graphLine.setAttribute('d', lineD);
  ui.graphFill.setAttribute('d', fillD);
}

function ensureStyles() {
  if (document.getElementById('frTransferProgressStyles')) return;
  const style = document.createElement('style');
  style.id = 'frTransferProgressStyles';
  style.textContent = `
    #frTransferProgressCard {
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 420px;
      max-width: calc(100vw - 24px);
      z-index: 14070;
      background: #ffffff;
      color: #111;
      border: 1px solid rgba(0,0,0,0.12);
      border-radius: 12px;
      box-shadow: 0 12px 30px rgba(0,0,0,0.22);
      padding: 12px 14px;
      display: none;
    }
    body.dark-mode #frTransferProgressCard {
      background: rgb(20, 20, 20);
      color: #e0e0e0;
      border: 1px solid rgba(255,255,255,0.16);
    }
    #frTransferProgressCard .fr-transfer-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }
    #frTransferProgressCard .fr-transfer-title {
      font-weight: 600;
      font-size: 14px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #frTransferProgressCard .fr-transfer-actions {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    #frTransferProgressCard .fr-transfer-actions button {
      border: none;
      background: transparent;
      color: inherit;
      cursor: pointer;
      padding: 0;
      line-height: 1;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
    }
    #frTransferProgressCard .fr-transfer-actions button:hover,
    #frTransferProgressCard .fr-transfer-actions button:focus-visible {
      background: rgba(0,0,0,0.08);
      outline: none;
    }
    body.dark-mode #frTransferProgressCard .fr-transfer-actions button:hover,
    body.dark-mode #frTransferProgressCard .fr-transfer-actions button:focus-visible {
      background: rgba(255,255,255,0.08);
    }
    #frTransferProgressCard #frTransferCloseBtn {
      color: #ff4d4d;
      background: rgba(255, 255, 255, 0.9);
      border: 2px solid transparent;
    }
    #frTransferProgressCard #frTransferCloseBtn:hover,
    #frTransferProgressCard #frTransferCloseBtn:focus-visible {
      color: #fff;
      background: #ff4d4d;
      box-shadow: 0 0 6px rgba(255, 77, 77, 0.8);
      transform: scale(1.05);
    }
    body.dark-mode #frTransferProgressCard #frTransferCloseBtn {
      background: rgba(0, 0, 0, 0.6);
      color: #ff6666;
    }
    body.dark-mode #frTransferProgressCard #frTransferCloseBtn:hover,
    body.dark-mode #frTransferProgressCard #frTransferCloseBtn:focus-visible {
      background: #ff6666;
      color: #000;
    }
    #frTransferProgressCard .fr-transfer-sub {
      font-size: 12px;
      opacity: 0.8;
      margin-bottom: 6px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #frTransferProgressCard .fr-transfer-bar {
      position: relative;
      height: 10px;
      border-radius: 999px;
      background: linear-gradient(180deg, rgba(0,0,0,0.10), rgba(0,0,0,0.02));
      overflow: hidden;
      box-shadow: inset 0 1px 2px rgba(0,0,0,0.12);
    }
    body.dark-mode #frTransferProgressCard .fr-transfer-bar {
      background: linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.04));
      box-shadow: inset 0 1px 2px rgba(0,0,0,0.45);
    }
    #frTransferProgressCard .fr-transfer-bar-fill {
      position: relative;
      height: 100%;
      width: 0%;
      background: linear-gradient(180deg, #7bc0ff 0%, #2f7fd8 55%, #2567b5 100%);
      transition: width 180ms ease;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -1px 0 rgba(0,0,0,0.2);
    }
    #frTransferProgressCard .fr-transfer-bar-fill.is-error {
      background: linear-gradient(180deg, #fca5a5 0%, #dc2626 55%, #b91c1c 100%);
    }
    #frTransferProgressCard .fr-transfer-bar-fill::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(110deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.55) 45%, rgba(255,255,255,0) 70%);
      transform: translateX(-100%);
      animation: fr-transfer-sheen 1.3s linear infinite;
    }
    #frTransferProgressCard .fr-transfer-bar-indet {
      position: absolute;
      top: 0;
      left: -40%;
      width: 40%;
      height: 100%;
      background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.55) 50%, rgba(255,255,255,0) 100%);
      opacity: 0;
      animation: fr-transfer-indet 1.2s ease-in-out infinite;
    }
    #frTransferProgressCard .fr-transfer-bar.indeterminate .fr-transfer-bar-fill {
      width: 100%;
      opacity: 0.2;
    }
    #frTransferProgressCard .fr-transfer-bar.indeterminate .fr-transfer-bar-indet {
      opacity: 1;
    }
    #frTransferProgressCard .fr-transfer-bar.indeterminate .fr-transfer-bar-fill::after {
      animation: none;
      opacity: 0.15;
    }
    #frTransferProgressCard .fr-transfer-graph {
      --fr-graph-bg: #f6f7fb;
      --fr-graph-grid: rgba(15,23,42,0.06);
      --fr-graph-line: #2d7dd6;
      --fr-graph-fill: rgba(45,125,214,0.16);
      margin-top: 6px;
      height: 44px;
      border-radius: 4px;
      border: 1px solid rgba(15,23,42,0.1);
      background-color: var(--fr-graph-bg);
      background-image:
        linear-gradient(to right, var(--fr-graph-grid) 1px, transparent 1px),
        linear-gradient(to bottom, var(--fr-graph-grid) 1px, transparent 1px);
      background-size: 14px 100%, 100% 8px;
      background-position: 0 0, 0 0;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.75);
      padding: 4px 6px;
      overflow: hidden;
    }
    #frTransferProgressCard .fr-transfer-graph svg {
      width: 100%;
      height: 100%;
      display: block;
      shape-rendering: geometricPrecision;
    }
    #frTransferProgressCard .fr-transfer-graph-fill {
      fill: var(--fr-graph-fill);
    }
    #frTransferProgressCard .fr-transfer-graph-line {
      fill: none;
      stroke: var(--fr-graph-line);
      stroke-width: 1.3;
      stroke-linecap: round;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
    }
    body.dark-mode #frTransferProgressCard .fr-transfer-graph {
      --fr-graph-bg: #0f1113;
      --fr-graph-grid: rgba(255,255,255,0.08);
      --fr-graph-line: #5aa2f0;
      --fr-graph-fill: rgba(90,162,240,0.18);
      border-color: rgba(255,255,255,0.1);
      box-shadow: inset 0 0 0 1px rgba(0,0,0,0.7);
    }
    #frTransferProgressCard .fr-transfer-metrics {
      margin-top: 8px;
      font-size: 12px;
      opacity: 0.85;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #frTransferProgressPill {
      position: fixed;
      right: 12px;
      bottom: 12px;
      z-index: 14080;
      display: none;
    }
    #frTransferProgressPill .fr-transfer-pill-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 999px;
      background: rgba(255,255,255,0.96);
      border: 1px solid rgba(0,0,0,0.12);
      box-shadow: 0 8px 22px rgba(0,0,0,0.22);
      color: #111;
      cursor: pointer;
    }
    body.dark-mode #frTransferProgressPill .fr-transfer-pill-btn {
      background: rgba(32,33,36,0.96);
      border: 1px solid rgba(255,255,255,0.16);
      color: #f1f3f4;
    }
    #frTransferProgressPill .fr-transfer-pill-title {
      font-weight: 600;
      font-size: 12px;
    }
    #frTransferProgressPill .fr-transfer-pill-pct {
      font-size: 12px;
      opacity: 0.9;
    }
    @keyframes fr-transfer-indet {
      0% { left: -40%; }
      60% { left: 100%; }
      100% { left: 100%; }
    }
    @keyframes fr-transfer-sheen {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
    @media (prefers-reduced-motion: reduce) {
      #frTransferProgressCard .fr-transfer-bar-fill::after,
      #frTransferProgressCard .fr-transfer-bar-indet {
        animation: none;
      }
    }
  `;
  document.head.appendChild(style);
}

function ensureUi() {
  if (_ui) return _ui;
  ensureStyles();

  const card = document.createElement('div');
  card.id = 'frTransferProgressCard';
  card.setAttribute('role', 'status');
  card.setAttribute('aria-live', 'polite');
  card.innerHTML = `
    <div class="fr-transfer-head">
      <div class="fr-transfer-title" id="frTransferTitle">Transferring...</div>
      <div class="fr-transfer-actions">
        <button type="button" id="frTransferMinBtn" aria-label="Minimize">
          <span class="material-icons">minimize</span>
        </button>
        <button type="button" id="frTransferCloseBtn" aria-label="Close">
          <span class="material-icons">close</span>
        </button>
      </div>
    </div>
    <div class="fr-transfer-sub" id="frTransferSub"></div>
    <div class="fr-transfer-bar" id="frTransferBar" role="progressbar" aria-valuemin="0" aria-valuemax="100">
      <div class="fr-transfer-bar-fill" id="frTransferBarFill"></div>
      <div class="fr-transfer-bar-indet" id="frTransferBarIndet"></div>
    </div>
    <div class="fr-transfer-graph" aria-hidden="true">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="presentation">
        <path class="fr-transfer-graph-fill" id="frTransferGraphFill"></path>
        <path class="fr-transfer-graph-line" id="frTransferGraphLine"></path>
      </svg>
    </div>
    <div class="fr-transfer-metrics" id="frTransferMetrics"></div>
  `;

  const pill = document.createElement('div');
  pill.id = 'frTransferProgressPill';
  pill.innerHTML = `
    <button type="button" class="fr-transfer-pill-btn" id="frTransferPillBtn">
      <span class="fr-transfer-pill-title" id="frTransferPillTitle">Transfer</span>
      <span class="fr-transfer-pill-pct" id="frTransferPillPct">0%</span>
    </button>
  `;

  document.body.appendChild(card);
  document.body.appendChild(pill);

  const minBtn = card.querySelector('#frTransferMinBtn');
  const closeBtn = card.querySelector('#frTransferCloseBtn');
  const pillBtn = pill.querySelector('#frTransferPillBtn');

  minBtn?.addEventListener('click', () => {
    setMinimized(true);
  });
  closeBtn?.addEventListener('click', () => {
    if (_activeJob) _activeJob.dismissed = true;
    hideUi();
  });
  pillBtn?.addEventListener('click', () => {
    setMinimized(false);
  });

  _ui = {
    card,
    pill,
    title: card.querySelector('#frTransferTitle'),
    sub: card.querySelector('#frTransferSub'),
    bar: card.querySelector('#frTransferBar'),
    fill: card.querySelector('#frTransferBarFill'),
    graphLine: card.querySelector('#frTransferGraphLine'),
    graphFill: card.querySelector('#frTransferGraphFill'),
    metrics: card.querySelector('#frTransferMetrics'),
    pillTitle: pill.querySelector('#frTransferPillTitle'),
    pillPct: pill.querySelector('#frTransferPillPct')
  };

  return _ui;
}

function hideUi() {
  const ui = ensureUi();
  ui.card.style.display = 'none';
  ui.pill.style.display = 'none';
}

function setMinimized(min) {
  if (_activeJob) _activeJob.minimized = !!min;
  storeMinimized(!!min);
  const ui = ensureUi();
  if (_activeJob && _activeJob.dismissed) {
    hideUi();
    return;
  }
  ui.card.style.display = min ? 'none' : 'block';
  ui.pill.style.display = min ? 'block' : 'none';
}

function clearTimers() {
  if (_showTimer) { clearTimeout(_showTimer); _showTimer = null; }
  if (_tickTimer) { clearInterval(_tickTimer); _tickTimer = null; }
  if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
}

function buildTitle(job) {
  if (job.title) return job.title;
  const action = job.action || 'Transferring';
  const count = Number(job.itemCount || 0);
  const label = job.itemLabel || 'items';
  return count ? `${action} ${count} ${label}` : action;
}

function buildSub(job) {
  if (job.subText) return job.subText;
  const parts = [];
  if (job.source) parts.push(`From ${job.source}`);
  if (job.destination) parts.push(`To ${job.destination}`);
  return parts.join(' ');
}

function estimateProgress(job, elapsedMs) {
  const estimateMs = Math.max(MIN_ESTIMATE_MS, (job.totalBytes / job.estimateBps) * 1000);
  const ratio = Math.min(0.95, elapsedMs / estimateMs);
  const doneBytes = Math.min(job.totalBytes, Math.floor(job.totalBytes * ratio));
  return { ratio, doneBytes, speedBps: job.estimateBps };
}

function render(job, { final = false, ok = true, error = '' } = {}) {
  if (!job || job.dismissed) return;
  const ui = ensureUi();
  const title = buildTitle(job);
  const sub = buildSub(job);
  const elapsedMs = (final && job.endedAt) ? (job.endedAt - job.startedAt) : (Date.now() - job.startedAt);
  const elapsedLabel = formatDuration(elapsedMs);

  if (ui.title) ui.title.textContent = title;
  if (ui.sub) {
    if (sub) {
      ui.sub.textContent = sub;
      ui.sub.style.display = '';
    } else {
      ui.sub.textContent = '';
      ui.sub.style.display = 'none';
    }
  }

  if (ui.pillTitle) ui.pillTitle.textContent = job.action || 'Transfer';

  let graphPct = null;
  if (job.indeterminate) {
    if (final) {
      ui.bar?.classList.remove('indeterminate');
      if (ui.fill) ui.fill.style.width = '100%';
    } else {
      ui.bar?.classList.add('indeterminate');
      if (ui.fill) ui.fill.style.width = '100%';
    }
    const count = Number(job.itemCount || 0);
    const countLabel = count ? `${count} item${count === 1 ? '' : 's'}` : 'Working';
    if (final) {
      const msg = ok ? 'Done' : (error ? `Failed: ${error}` : 'Failed');
      if (ui.metrics) ui.metrics.textContent = `${msg} - ${elapsedLabel}`;
    } else {
      if (ui.metrics) ui.metrics.textContent = `${countLabel} - ${elapsedLabel}`;
    }
    if (ui.pillPct) ui.pillPct.textContent = final && ok ? 'Done' : '...';
  } else {
    ui.bar?.classList.remove('indeterminate');
    const est = estimateProgress(job, elapsedMs);
    const pct = final ? 100 : Math.max(0, Math.min(95, Math.round(est.ratio * 100)));
    if (ui.fill) ui.fill.style.width = `${pct}%`;
    if (ui.bar) ui.bar.setAttribute('aria-valuenow', String(pct));
    const doneLabel = formatBytes(final ? job.totalBytes : est.doneBytes);
    const totalLabel = formatBytes(job.totalBytes);
    const speedLabel = formatSpeed(job.estimateBps);
    if (final) {
      const msg = ok ? 'Done' : (error ? `Failed: ${error}` : 'Failed');
      if (ui.metrics) ui.metrics.textContent = `${msg} - ${elapsedLabel}`;
    } else {
      if (ui.metrics) ui.metrics.textContent = `${pct}% - ${doneLabel} / ${totalLabel} - ${speedLabel} - ${elapsedLabel}`;
    }
    if (ui.pillPct) ui.pillPct.textContent = `${pct}%`;
    graphPct = pct;
  }

  if (Number.isFinite(graphPct)) {
    pushGraphSample(job, elapsedMs, graphPct);
  }
  renderGraph(job, ui, graphPct);

  if (ui.fill) {
    if (final && !ok) {
      ui.fill.classList.add('is-error');
    } else {
      ui.fill.classList.remove('is-error');
    }
  }
}

function show(job) {
  if (!job || job.dismissed) return;
  if (_showTimer) {
    clearTimeout(_showTimer);
    _showTimer = null;
  }
  const ui = ensureUi();
  job.visible = true;
  render(job);
  setMinimized(job.minimized);
  if (!job.minimized) ui.card.style.display = 'block';
}

function startTick() {
  if (_tickTimer) clearInterval(_tickTimer);
  _tickTimer = setInterval(() => {
    if (!_activeJob || !_activeJob.visible) return;
    render(_activeJob);
  }, TRANSFER_TICK_MS);
}

function finalize(job, { ok = true, error = '' } = {}) {
  if (!job || !_activeJob || _activeJob.id !== job.id) return;
  job.endedAt = Date.now();

  if (!job.indeterminate && job.totalBytes > 0) {
    const elapsedSec = Math.max(0.5, (job.endedAt - job.startedAt) / 1000);
    const actualBps = job.totalBytes / elapsedSec;
    const clamped = clamp(actualBps, MIN_SPEED_BPS, MAX_SPEED_BPS);
    const blended = Math.round(job.estimateBps * 0.7 + clamped * 0.3);
    storeSpeed(blended);
  }

  if (!job.visible || job.dismissed) {
    clearTimers();
    hideUi();
    _activeJob = null;
    return;
  }

  if (_tickTimer) {
    clearInterval(_tickTimer);
    _tickTimer = null;
  }
  render(job, { final: true, ok, error });

  if (_hideTimer) clearTimeout(_hideTimer);
  _hideTimer = setTimeout(() => {
    clearTimers();
    hideUi();
    _activeJob = null;
  }, FINAL_VISIBLE_MS);
}

export function startTransferProgress(opts = {}) {
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
    estimateBps: readStoredSpeed(),
    indeterminate: false,
    minimized: readMinimized(),
    dismissed: false,
    visible: false,
    speedHistory: new Array(GRAPH_MAX_SAMPLES).fill(null),
    graphLastPct: 0,
    graphMax: 0,
    lastSampleAt: 0
  };

  const bytesKnown = opts.bytesKnown !== false;
  job.indeterminate = !!opts.indeterminate || !bytesKnown || job.totalBytes <= 0;

  clearTimers();
  _activeJob = job;

  if (_ui && ((_ui.card && _ui.card.style.display === 'block') || (_ui.pill && _ui.pill.style.display === 'block'))) {
    show(job);
    startTick();
    return job;
  }

  _showTimer = setTimeout(() => {
    if (_activeJob && _activeJob.id === job.id) {
      show(job);
      startTick();
    }
  }, TRANSFER_UI_DELAY_MS);

  return job;
}

export function finishTransferProgress(job, { ok = true, error = '' } = {}) {
  finalize(job, { ok, error });
}
