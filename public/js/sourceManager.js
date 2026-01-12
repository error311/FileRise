// /js/sourceManager.js
import { withBase } from './basePath.js?v={{APP_QVER}}';
import { t } from './i18n.js?v={{APP_QVER}}';

async function loadSiteConfig() {
  if (window.__FR_SITE_CFG__) return window.__FR_SITE_CFG__;
  if (window.__FR_SITE_CFG_PROMISE) {
    try { return await window.__FR_SITE_CFG_PROMISE; } catch (e) { return {}; }
  }

  try {
    const res = await fetch(withBase('/api/siteConfig.php'), { credentials: 'include' });
    const cfg = await res.json().catch(() => ({}));
    window.__FR_SITE_CFG__ = cfg || {};
    return window.__FR_SITE_CFG__;
  } catch (e) {
    return {};
  }
}

function getSourcesConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return {};
  if (cfg.storageSources && typeof cfg.storageSources === 'object') return cfg.storageSources;
  if (cfg.sources && typeof cfg.sources === 'object') return cfg.sources;
  return {};
}

function pickActiveId(sourcesCfg, sources) {
  const active =
    sourcesCfg.activeId ||
    sourcesCfg.active ||
    sourcesCfg.selected ||
    sourcesCfg.current ||
    '';
  if (active) return active;
  try {
    const stored = localStorage.getItem('fr_active_source') || '';
    if (stored) return stored;
  } catch (e) { /* ignore */ }
  return sources[0]?.id || sources[0]?.key || sources[0]?.name || '';
}

function getCsrfToken() {
  return window.csrfToken || localStorage.getItem('csrf') || '';
}

function getActiveSourceId() {
  const select = document.getElementById('sourceSelector');
  if (select && select.value) return select.value;
  try {
    const stored = localStorage.getItem('fr_active_source');
    if (stored) return stored;
  } catch (e) { /* ignore */ }
  return '';
}

function getSourceNameById(id) {
  const key = String(id || '').trim();
  if (!key) return '';
  try {
    const map = window.__FR_SOURCE_NAME_MAP;
    if (map && Object.prototype.hasOwnProperty.call(map, key)) {
      return String(map[key] || '');
    }
  } catch (e) { /* ignore */ }

  const select = document.getElementById('sourceSelector');
  if (select) {
    const opt = Array.from(select.options).find(o => o.value === key);
    if (opt) return String(opt.dataset?.sourceName || '');
  }
  return '';
}

function getSourceTypeById(id) {
  const key = String(id || '').trim();
  if (!key) return '';
  try {
    const meta = window.__FR_SOURCE_META_MAP;
    if (meta && Object.prototype.hasOwnProperty.call(meta, key)) {
      return String(meta[key]?.type || '');
    }
  } catch (e) { /* ignore */ }

  const select = document.getElementById('sourceSelector');
  if (select) {
    const opt = Array.from(select.options).find(o => o.value === key);
    if (opt) return String(opt.dataset?.sourceType || '');
  }
  return '';
}

function getSourceMetaById(id) {
  return {
    name: getSourceNameById(id),
    type: getSourceTypeById(id)
  };
}

function getActiveSourceName() {
  const id = getActiveSourceId();
  return getSourceNameById(id);
}

async function applyActiveSourceId(id, opts = {}) {
  const select = document.getElementById('sourceSelector');
  if (!select) return false;

  const nextId = String(id || '').trim();
  if (!nextId) return false;

  const prevId = select.getAttribute('data-prev') || select.value || '';
  if (nextId === prevId && !opts.force) {
    return true;
  }

  const hasOption = Array.from(select.options).some(opt => opt.value === nextId);
  if (!hasOption) return false;

  select.value = nextId;

  const apiEnabled = window.__FR_SOURCES_API_ENABLED__ === true;
  if (apiEnabled && opts.updateSession !== false) {
    try {
      const res = await fetch(withBase('/api/pro/sources/select.php'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
          'Accept': 'application/json',
        },
        body: JSON.stringify({ id: nextId }),
      });
      if (!res.ok) throw new Error('Select failed');
    } catch (e) {
      if (prevId) select.value = prevId;
      return false;
    }
  }

  select.setAttribute('data-prev', nextId);
  try { localStorage.setItem('fr_active_source', nextId); } catch (e) { /* ignore */ }

  if (!opts.skipEvent) {
    try {
      window.dispatchEvent(new CustomEvent('filerise:source-change', {
        detail: { id: nextId, origin: opts.origin || 'selector' }
      }));
    } catch (e) { /* ignore */ }
  }

  return true;
}

try {
  if (typeof window.__FR_SOURCES_API_ENABLED__ === 'undefined') {
    window.__FR_SOURCES_API_ENABLED__ = false;
  }
  window.__frApplyActiveSource = applyActiveSourceId;
  window.__frGetActiveSourceId = getActiveSourceId;
  window.__frGetActiveSourceName = getActiveSourceName;
  window.__frGetSourceNameById = getSourceNameById;
  window.__frGetSourceTypeById = getSourceTypeById;
  window.__frGetSourceMetaById = getSourceMetaById;
} catch (e) { /* ignore */ }

async function loadVisibleSourcesFromApi() {
  try {
    const res = await fetch(withBase('/api/pro/sources/visible.php'), {
      credentials: 'include',
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || data.ok !== true) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export async function initSourceSelector(opts = {}) {
  const wrap = document.getElementById('sourceSelectorWrap');
  const select = document.getElementById('sourceSelector');
  if (!wrap || !select) return;
  if (wrap.__initialized && !opts.force) return;

  if (!wrap.__initialized) {
    wrap.__initialized = true;
    wrap.hidden = true;
  }

  const prevId = select.getAttribute('data-prev') || select.value || '';
  const keepActive = !!opts.keepActive;
  const origin = opts.origin || (opts.force ? 'refresh' : 'init');

  const apiData = await loadVisibleSourcesFromApi();
  let sourcesCfg = {};
  let sources = [];
  let enabled = false;

  if (apiData) {
    sourcesCfg = apiData || {};
    enabled = !!apiData.enabled;
    sources = Array.isArray(apiData.sources) ? apiData.sources : [];
    try { window.__FR_SOURCES_API_ENABLED__ = true; } catch (e) { /* ignore */ }
  } else {
    const cfg = await loadSiteConfig();
    sourcesCfg = getSourcesConfig(cfg);
    enabled = !!sourcesCfg.enabled;
    sources = Array.isArray(sourcesCfg.sources) ? sourcesCfg.sources : [];
    try { window.__FR_SOURCES_API_ENABLED__ = false; } catch (e) { /* ignore */ }
  }

  if (!enabled || !sources.length) {
    select.innerHTML = '';
    wrap.hidden = true;
    try { window.__FR_SOURCE_NAME_MAP = {}; } catch (e) { /* ignore */ }
    try { window.__FR_SOURCE_META_MAP = {}; } catch (e) { /* ignore */ }
    return;
  }

  const nameMap = {};
  const metaMap = {};
  try { window.__FR_SOURCE_NAME_MAP = nameMap; } catch (e) { /* ignore */ }
  try { window.__FR_SOURCE_META_MAP = metaMap; } catch (e) { /* ignore */ }

  select.innerHTML = '';
  sources.forEach(src => {
    if (!src || typeof src !== 'object') return;
    const id = String(src.id || src.key || src.name || '');
    if (!id) return;
    const name = String(src.name || id);
    const type = String(src.type || '');
    const ro = src.readOnly ? ` \uD83D\uDD12 ${t('read_only')}` : '';
    const label = type ? `${name} (${type})${ro}` : `${name}${ro}`;
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = label;
    opt.dataset.sourceName = name;
    opt.dataset.sourceType = type;
    opt.dataset.sourceReadOnly = src.readOnly ? '1' : '0';
    nameMap[id] = name;
    metaMap[id] = { name, type, readOnly: !!src.readOnly };
    select.appendChild(opt);
  });

  if (!select.options.length) {
    wrap.hidden = true;
    return;
  }

  const activeId = pickActiveId(sourcesCfg, sources);
  const hasActive = Array.from(select.options).some(opt => opt.value === activeId);
  const hasPrev = !!prevId && Array.from(select.options).some(opt => opt.value === prevId);
  const nextId = (keepActive && hasPrev)
    ? prevId
    : (hasActive ? activeId : select.options[0].value);
  select.value = nextId;
  select.setAttribute('data-prev', nextId);

  if (apiData && !hasActive && nextId) {
    try {
      await applyActiveSourceId(nextId, { skipEvent: true, force: true, origin });
    } catch (e) { /* ignore */ }
  }

  wrap.hidden = false;

  if (!select.__wired) {
    select.__wired = true;
    select.addEventListener('change', async () => {
      const id = select.value || '';
      await applyActiveSourceId(id, { origin: 'selector' });
    });
  }
}

export async function refreshSourceSelector(opts = {}) {
  const nextOpts = { ...opts, force: true };
  if (typeof nextOpts.keepActive === 'undefined') {
    nextOpts.keepActive = true;
  }
  if (!nextOpts.origin) {
    nextOpts.origin = 'refresh';
  }
  return initSourceSelector(nextOpts);
}

try { window.__frRefreshSourceSelector = refreshSourceSelector; } catch (e) { /* ignore */ }
