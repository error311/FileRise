// public/js/adminOnlyOffice.js
import { t } from './i18n.js?v={{APP_QVER}}';
import { showToast } from './domUtils.js?v={{APP_QVER}}';

/**
 * Translate with fallback
 */
const tf = (key, fallback) => {
  const v = t(key);
  return (v && v !== key) ? v : fallback;
};

/**
 * Local masked-input renderer (copied from adminPanel.js style)
 */
function renderMaskedInput({ id, label, hasValue, isSecret = false }) {
  const type = isSecret ? 'password' : 'text';
  const disabled = hasValue
    ? 'disabled data-replace="0" placeholder="•••••• (saved)"'
    : 'data-replace="1"';
  const replaceBtn = hasValue
    ? `<button type="button" class="btn btn-sm btn-outline-secondary" data-replace-for="${id}">Replace</button>`
    : '';
  const note = hasValue
    ? `<small class="text-success" style="margin-left:4px;">Saved — leave blank to keep</small>`
    : '';

  return `
    <div class="form-group">
      <label for="${id}">${label}:</label>
      <div style="display:flex; gap:8px; align-items:center;">
        <input type="${type}" id="${id}" class="form-control" ${disabled} />
        ${replaceBtn}
      </div>
      ${note}
    </div>
  `;
}

/**
 * Local "Replace" wiring (copied from adminPanel.js style, but scoped)
 */
function wireReplaceButtons(scope = document) {
  scope.querySelectorAll('[data-replace-for]').forEach(btn => {
    if (btn.__wired) return;
    btn.__wired = true;
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-replace-for');
      const inp = scope.querySelector('#' + id);
      if (!inp) return;
      inp.disabled = false;
      inp.dataset.replace = '1';
      inp.placeholder = '';
      inp.value = '';
      btn.textContent = 'Keep saved value';
      btn.removeAttribute('data-replace-for');
      btn.addEventListener('click', () => { /* no-op after first toggle */ }, { once: true });
    }, { once: true });
  });
}

/**
 * Trusted origin helper (mirror of your inline logic)
 */
function getTrustedDocsOrigin(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    if (!/^https?:$/.test(u.protocol)) return null; // only http/https
    if (u.username || u.password) return null;      // no creds in URL
    return u.origin;
  } catch (e) {
    return null;
  }
}

function buildOnlyOfficeApiUrl(origin) {
  const u = new URL('/web-apps/apps/api/documents/api.js', origin);
  u.searchParams.set('probe', String(Date.now()));
  return u.toString();
}

/**
 * Lightweight JSON helper for this module
 */
async function safeJsonLocal(res) {
  const txt = await res.text();
  let body = null;
  try { body = txt ? JSON.parse(txt) : null; } catch (e) { /* ignore */ }
  if (!res.ok) {
    const msg =
      (body && (body.error || body.message)) ||
      (txt && txt.trim()) ||
      `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return body ?? {};
}

/**
 * Script probe for api.js (mirrors old ooProbeScript)
 */
async function ooProbeScript(docsOrigin) {
  return new Promise(resolve => {
    const base = getTrustedDocsOrigin(docsOrigin);
    if (!base) { resolve({ ok: false }); return; }

    const src = buildOnlyOfficeApiUrl(base);
    const s = document.createElement('script');
    s.id = 'ooProbeScript';
    s.async = true;
    s.src = src;

    const nonce = document.querySelector('meta[name="csp-nonce"]')?.content;
    if (nonce) s.setAttribute('nonce', nonce);

    const cleanup = () => { try { s.remove(); } catch (e) { /* ignore */ } };

    s.onload = () => { cleanup(); resolve({ ok: true }); };
    s.onerror = () => { cleanup(); resolve({ ok: false }); };

    // origin is validated, path is fixed => safe
    document.head.appendChild(s);
  });
}

/**
 * Iframe probe for DS (mirrors old ooProbeFrame)
 */
async function ooProbeFrame(docsOrigin, timeoutMs = 4000) {
  return new Promise(resolve => {
    const base = getTrustedDocsOrigin(docsOrigin);
    if (!base) { resolve({ ok: false }); return; }

    const f = document.createElement('iframe');
    f.id = 'ooProbeFrame';
    f.src = base;
    f.style.display = 'none';

    const cleanup = () => { try { f.remove(); } catch (e) { /* ignore */ } };
    const t = setTimeout(() => {
      cleanup();
      resolve({ ok: false, timeout: true });
    }, timeoutMs);

    f.onload = () => {
      clearTimeout(t);
      cleanup();
      resolve({ ok: true });
    };
    f.onerror = () => {
      clearTimeout(t);
      cleanup();
      resolve({ ok: false });
    };

    // src constrained to validated http/https origin
    document.body.appendChild(f);
  });
}

/**
 * Copy helpers (same behavior you had before)
 */
async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // fall through
    }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

function selectElementContents(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Builds the ONLYOFFICE test card and wires Run tests button
 */
function attachOnlyOfficeTests(container) {
  const testBox = document.createElement('div');
  testBox.className = 'card';
  testBox.style.marginTop = '12px';
  testBox.innerHTML = `
    <div class="card-body">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
        <strong>Test ONLYOFFICE connection</strong>
        <button type="button" id="ooTestBtn" class="btn btn-sm btn-primary">Run tests</button>
        <span id="ooTestSpinner" style="display:none;">⏳</span>
      </div>
      <ul id="ooTestResults" class="list-unstyled" style="margin:0;"></ul>
      <small class="text-muted">
        These tests check FileRise config, callback reachability, CSP/script loading, and iframe embedding.
      </small>
    </div>
  `;
  container.appendChild(testBox);

  const spinner = testBox.querySelector('#ooTestSpinner');
  const out = testBox.querySelector('#ooTestResults');

  function ooRow(label, status, detail = '') {
    const li = document.createElement('li');
    li.style.margin = '6px 0';
    const icon = status === 'ok' ? '✅' : status === 'warn' ? '⚠️' : '❌';
    li.innerHTML =
      `<span style="min-width:1.2em;display:inline-block">${icon}</span>` +
      ` <strong>${label}</strong>` +
      (detail ? ` — <span>${detail}</span>` : '');
    return li;
  }

  function ooClear() {
    while (out.firstChild) out.removeChild(out.firstChild);
  }

  async function runOnlyOfficeTests() {
    const docsOrigin = (document.getElementById('ooDocsOrigin')?.value || '').trim();

    spinner.style.display = 'inline';
    ooClear();

    // 1) FileRise status
    let statusOk = false;
    try {
      const r = await fetch('/api/onlyoffice/status.php', { credentials: 'include' });
      const statusJson = await r.json().catch(() => ({}));
      if (r.ok) {
        if (statusJson.enabled) {
          out.appendChild(ooRow('FileRise status', 'ok', 'Enabled and ready'));
          statusOk = true;
        } else {
          out.appendChild(ooRow('FileRise status', 'warn', 'Disabled — check JWT Secret and Document Server Origin'));
        }
      } else {
        out.appendChild(ooRow('FileRise status', 'fail', `HTTP ${r.status}`));
      }
    } catch (e) {
      out.appendChild(ooRow('FileRise status', 'fail', (e && e.message) || 'Network error'));
    }

    // 2) Secret presence (fresh read)
    try {
      const cfg = await fetch('/api/admin/getConfig.php', {
        credentials: 'include',
        cache: 'no-store'
      }).then(r => r.json());
      const hasSecret = !!(cfg.onlyoffice && cfg.onlyoffice.hasJwtSecret);
      out.appendChild(
        ooRow(
          'JWT secret saved',
          hasSecret ? 'ok' : 'fail',
          hasSecret ? 'Present' : 'Missing'
        )
      );
    } catch (e) {
      out.appendChild(ooRow('JWT secret saved', 'warn', 'Could not verify'));
    }

    // 3) Callback reachable
    try {
      const r = await fetch('/api/onlyoffice/callback.php?ping=1', {
        credentials: 'include',
        cache: 'no-store'
      });
      if (r.ok) out.appendChild(ooRow('Callback endpoint', 'ok', 'Reachable'));
      else out.appendChild(ooRow('Callback endpoint', 'fail', `HTTP ${r.status}`));
    } catch (e) {
      out.appendChild(ooRow('Callback endpoint', 'fail', 'Network error'));
    }

    // Basic sanity on origin
    if (!/^https?:\/\//i.test(docsOrigin)) {
      out.appendChild(
        ooRow(
          'Document Server Origin',
          'fail',
          'Enter a valid http(s) origin (e.g., https://docs.example.com)'
        )
      );
      spinner.style.display = 'none';
      return;
    }

    // 4a) api.js
    const sRes = await ooProbeScript(docsOrigin);
    out.appendChild(
      ooRow(
        'Load api.js',
        sRes.ok ? 'ok' : 'fail',
        sRes.ok ? 'Loaded' : 'Blocked (check CSP script-src and origin)'
      )
    );

    // 4b) iframe
    const fRes = await ooProbeFrame(docsOrigin);
    out.appendChild(
      ooRow(
        'Embed DS iframe',
        fRes.ok ? 'ok' : 'fail',
        fRes.ok ? 'Allowed' : 'Blocked (check CSP frame-src)'
      )
    );

    if (!statusOk || !sRes.ok || !fRes.ok) {
      const tip = document.createElement('li');
      tip.style.marginTop = '8px';
      tip.innerHTML =
        '💡 <em>Tip:</em> Use the CSP helper below to include your Document Server in ' +
        '<code>script-src</code>, <code>connect-src</code>, and <code>frame-src</code>.';
      out.appendChild(tip);
    }

    spinner.style.display = 'none';
  }

  testBox.querySelector('#ooTestBtn')?.addEventListener('click', runOnlyOfficeTests);
}

/**
 * CSP helper card (Apache + Nginx snippets)
 */
function attachOnlyOfficeCspHelper(container) {
  const cspHelp = document.createElement('div');
  cspHelp.className = 'alert alert-info';
  cspHelp.style.marginTop = '12px';
  cspHelp.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      <strong>Content-Security-Policy help</strong>
      <button type="button" id="copyOoCsp" class="btn btn-sm btn-outline-secondary">Copy</button>
      <button type="button" id="selectOoCsp" class="btn btn-sm btn-outline-secondary">Select</button>
    </div>
    <div class="form-text" style="margin-bottom:8px;">
      Add/replace this line in <code>public/.htaccess</code> (Apache). It allows loading ONLYOFFICE's <code>api.js</code>,
      embedding the editor iframe, and letting the script make XHR to your Document Server.
    </div>
    <pre id="ooCspSnippet" style="white-space:pre-wrap;user-select:text;padding:8px;border:1px solid #ccc;border-radius:6px;background:#f7f7f7;"></pre>
    <div class="form-text" style="margin-top:8px;">
      If you terminate SSL or set CSP at a reverse proxy (e.g. Nginx), update it there instead.
      Also note: if your site is <code>https://</code>, your ONLYOFFICE server must be <code>https://</code> too,
      otherwise the browser will block it as mixed content.
    </div>
    <details style="margin-top:8px;">
      <summary>Nginx equivalent</summary>
      <pre id="ooCspSnippetNginx" style="white-space:pre-wrap;user-select:text;padding:8px;border:1px solid #ccc;border-radius:6px;background:#f7f7f7; margin-top:6px;"></pre>
    </details>
  `;
  container.appendChild(cspHelp);

  const INLINE_SHA = "sha256-ajmGY+5VJOY6+8JHgzCqsqI8w9dCQfAmqIkFesOKItM=";

  function buildCspApache(originRaw) {
    const o = (originRaw || 'https://your-onlyoffice-server.example.com').replace(/\/+$/, '');
    const api = `${o}/web-apps/apps/api/documents/api.js`;
    return `Header always set Content-Security-Policy "default-src 'self'; base-uri 'self'; frame-ancestors 'self'; object-src 'none'; script-src 'self' '${INLINE_SHA}' ${o} ${api}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ${o}; media-src 'self' blob:; worker-src 'self' blob:; form-action 'self'; frame-src 'self' ${o}"`;
  }

  function buildCspNginx(originRaw) {
    const o = (originRaw || 'https://your-onlyoffice-server.example.com').replace(/\/+$/, '');
    const api = `${o}/web-apps/apps/api/documents/api.js`;

    const cspValue =
      `default-src 'self'; ` +
      `base-uri 'self'; ` +
      `frame-ancestors 'self'; ` +
      `object-src 'none'; ` +
      `script-src 'self' '${INLINE_SHA}' ${o} ${api}; ` +
      `style-src 'self' 'unsafe-inline'; ` +
      `img-src 'self' data: blob:; ` +
      `font-src 'self'; ` +
      `connect-src 'self' ${o}; ` +
      `media-src 'self' blob:; ` +
      `worker-src 'self' blob:; ` +
      `form-action 'self'; ` +
      `frame-src 'self' ${o}`;

    return [
      '# Drop upstream (Apache/.htaccess) headers that conflict with ONLYOFFICE',
      'proxy_hide_header X-Frame-Options;',
      'proxy_hide_header Content-Security-Policy;',
      '',
      '# Replace with an ONLYOFFICE-aware CSP at the proxy',
      `add_header Content-Security-Policy "${cspValue}" always;`,
    ].join('\n');
  }

  const ooDocsInput = document.getElementById('ooDocsOrigin');
  const cspPre = document.getElementById('ooCspSnippet');
  const cspPreNgx = document.getElementById('ooCspSnippetNginx');

  function refreshCsp() {
    const raw = (ooDocsInput?.value || '').trim();
    const base = getTrustedDocsOrigin(raw) || raw;
    cspPre.textContent = buildCspApache(base);
    cspPreNgx.textContent = buildCspNginx(base);
  }

  ooDocsInput?.addEventListener('input', refreshCsp);
  refreshCsp();

  document.getElementById('copyOoCsp')?.addEventListener('click', async () => {
    const txt = (cspPre.textContent || '').trim();
    const ok = await copyToClipboard(txt);
    if (ok) {
      showToast('CSP line copied.');
    } else {
      try { selectElementContents(cspPre); } catch (e) { /* ignore */ }
      const reason = window.isSecureContext ? '' : ' (page is not HTTPS or localhost)';
      showToast('Copy failed' + reason + '. Press Ctrl/Cmd+C to copy.');
    }
  });

  document.getElementById('selectOoCsp')?.addEventListener('click', () => {
    try {
      selectElementContents(cspPre);
      showToast('Selected — press Ctrl/Cmd+C');
    } catch (e) {
      /* ignore */
    }
  });
}

/**
 * Public: build + wire ONLYOFFICE admin section
 */
export function initOnlyOfficeUI({ config }) {
  const sec = document.getElementById('onlyofficeContent');
  if (!sec) return;

  const onlyCfg = config.onlyoffice || {};
  const hasOOSecret = !!onlyCfg.hasJwtSecret;
  window.__HAS_OO_SECRET = hasOOSecret;

  // Base content
  sec.innerHTML = `
    <div class="form-check fr-toggle">
  <input type="checkbox"
         class="form-check-input fr-toggle-input"
         id="ooEnabled" />
  <label class="form-check-label" for="ooEnabled">
    Enable ONLYOFFICE integration
  </label>
</div>

    <div class="form-group">
      <label for="ooDocsOrigin">Document Server Origin:</label>
      <input type="url" id="ooDocsOrigin" class="form-control" placeholder="e.g. https://docs.example.com" />
      <small class="text-muted">
        Must be reachable by your browser (for api.js) and by FileRise (for callbacks). Avoid “localhost”.
      </small>
    </div>

    ${renderMaskedInput({
    id: 'ooJwtSecret',
    label: 'JWT Secret',
    hasValue: hasOOSecret,
    isSecret: true
  })}
  `;

  wireReplaceButtons(sec);

  // Tests + CSP helper
  attachOnlyOfficeTests(sec);
  attachOnlyOfficeCspHelper(sec);

  // Initial values
  const enabled = !!onlyCfg.enabled;
  const docsOrigin = onlyCfg.docsOrigin || '';

  const enabledEl = document.getElementById('ooEnabled');
  const originEl = document.getElementById('ooDocsOrigin');

  if (enabledEl) enabledEl.checked = enabled;
  if (originEl) originEl.value = docsOrigin;

  // Locking (managed in config.php)
  const locked = !!onlyCfg.lockedByPhp;
  window.__OO_LOCKED = locked;
  if (locked) {
    sec.querySelectorAll('input,button').forEach(el => {
      el.disabled = true;
    });
    const note = document.createElement('div');
    note.className = 'form-text';
    note.style.marginTop = '6px';
    note.textContent = 'Managed by config.php — edit ONLYOFFICE_* constants there.';
    sec.appendChild(note);
  }
}

/**
 * Public: inject ONLYOFFICE settings into payload (used in handleSave)
 */
export function collectOnlyOfficeSettingsForSave(payload) {
  const ooEnabledEl = document.getElementById('ooEnabled');
  const ooDocsOriginEl = document.getElementById('ooDocsOrigin');
  const ooSecretEl = document.getElementById('ooJwtSecret');

  const onlyoffice = {
    enabled: !!(ooEnabledEl && ooEnabledEl.checked),
    docsOrigin: (ooDocsOriginEl && ooDocsOriginEl.value.trim()) || ''
  };

  if (!window.__OO_LOCKED && ooSecretEl) {
    const val = ooSecretEl.value.trim();
    const hasSaved = !!window.__HAS_OO_SECRET;
    const shouldReplace = ooSecretEl.dataset.replace === '1' || !hasSaved;
    if (shouldReplace && val !== '') {
      onlyoffice.jwtSecret = val;
    }
  }

  payload.onlyoffice = onlyoffice;
  return payload;
}