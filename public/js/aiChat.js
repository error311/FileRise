import { withBase } from './basePath.js?v={{APP_QVER}}';
import { showToast, escapeHTML } from './domUtils.js?v={{APP_QVER}}';
import { refreshFolderChildren } from './folderManager.js?v={{APP_QVER}}';

let initialized = false;

function ensureAiChatStyles() {
  if (document.getElementById('aiChatRuntimeStyles')) return;
  const style = document.createElement('style');
  style.id = 'aiChatRuntimeStyles';
  style.textContent = `
    @keyframes aiChatSpin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

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
    headers: { Accept: 'application/json' }
  });
  const body = await safeJson(resp);
  if (!resp.ok || !body || body.ok === false) {
    throw new Error((body && (body.error || body.message || body.assistant)) || `HTTP ${resp.status}`);
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
    throw new Error((body && (body.error || body.message || body.assistant)) || `HTTP ${resp.status}`);
  }
  return body;
}

function makeEl(tag, attrs = {}, html = '') {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'className') {
      el.className = String(v || '');
      return;
    }
    el.setAttribute(k, String(v || ''));
  });
  if (html) el.innerHTML = html;
  return el;
}

function isDarkModeEnabled() {
  return !!(
    document.documentElement.classList.contains('dark-mode')
    || document.body.classList.contains('dark-mode')
  );
}

function normalizeSourceId(value) {
  const v = String(value || '').trim();
  return v === '' ? 'local' : v;
}

function normalizeCopilotProfile(value) {
  const v = String(value || '').trim().toLowerCase();
  return v || 'app_chat';
}

function cloneContextPacket(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (e) {
    return null;
  }
}

function normalizeFolderPath(value) {
  let v = String(value || '').trim();
  if (v === '' || v.toLowerCase() === 'root') return 'root';
  v = v.replace(/\\/g, '/');
  v = v.replace(/^\/+|\/+$/g, '');
  if (v.toLowerCase() === 'root') return 'root';
  if (v.toLowerCase().startsWith('root/')) {
    v = v.slice(5);
  }
  return v === '' ? 'root' : v;
}

function parentFolderPath(folder) {
  const f = normalizeFolderPath(folder);
  if (f === 'root') return 'root';
  const idx = f.lastIndexOf('/');
  if (idx <= 0) return 'root';
  return f.slice(0, idx);
}

function getActiveFolder() {
  return normalizeFolderPath(window.currentFolder || 'root');
}

function getActiveSourceId() {
  return normalizeSourceId(
    (typeof window.__frGetActiveSourceId === 'function')
      ? window.__frGetActiveSourceId()
      : 'local'
  );
}

function refreshFolderView(folder) {
  const refreshFolder = normalizeFolderPath(folder || 'root');
  const pane = String(window.activePane || 'left');
  try { refreshFolderChildren(refreshFolder); } catch (e) { /* ignore tree refresh errors */ }
  if (typeof window.loadFileList === 'function') {
    window.loadFileList(refreshFolder, { pane, cursor: '' });
    return;
  }
  if (window.viewMode === 'gallery' && typeof window.renderGalleryView === 'function') {
    window.renderGalleryView(refreshFolder);
    return;
  }
  if (typeof window.renderFileTable === 'function') {
    window.renderFileTable(refreshFolder);
  }
}

function inferRecipeTitle(text, fallback = 'Saved recipe') {
  const raw = String(text || '').trim().replace(/\s+/g, ' ');
  if (!raw) return fallback;
  return raw.slice(0, 80);
}

function getBuiltInRecipes() {
  const folder = getActiveFolder();
  const scopeLabel = folder === 'root' ? 'this folder' : folder;
  return [
    {
      id: 'builtin:list_here',
      builtin: true,
      name: 'List here',
      prompt: 'List files and folders here.',
      workflowHint: ''
    },
    {
      id: 'builtin:tag_images',
      builtin: true,
      name: 'Tag images',
      prompt: `Tag all images in ${scopeLabel}.`,
      workflowHint: 'tag_images'
    },
    {
      id: 'builtin:extract_invoices',
      builtin: true,
      name: 'Extract invoices',
      prompt: `Extract all invoices in ${scopeLabel} to csv.`,
      workflowHint: 'extract_invoices_csv'
    },
    {
      id: 'builtin:extract_structured',
      builtin: true,
      name: 'Extract custom schema',
      prompt: `Extract files in ${scopeLabel} to csv with fields vendor:text, effective date:date, renewal date:date, total value:number.`,
      workflowHint: 'extract_structured_data'
    },
    {
      id: 'builtin:transcribe_audio',
      builtin: true,
      name: 'Transcribe audio',
      prompt: `Transcribe all audio files in ${scopeLabel} and tag them.`,
      workflowHint: 'transcribe_audio_tag'
    },
    {
      id: 'builtin:organize_type',
      builtin: true,
      name: 'Organize by type',
      prompt: `Organize all files in ${scopeLabel} by type.`,
      workflowHint: 'bulk_organize_files'
    },
    {
      id: 'builtin:organize_year',
      builtin: true,
      name: 'Organize by year',
      prompt: `Organize all files in ${scopeLabel} by year.`,
      workflowHint: 'bulk_organize_files'
    },
    {
      id: 'builtin:diagnostics',
      builtin: true,
      name: 'Run diagnostics',
      prompt: '/diagnostics',
      workflowHint: ''
    }
  ];
}

function getTipGroups() {
  const folder = getActiveFolder();
  const scopeLabel = folder === 'root' ? 'this folder' : folder;
  return [
    {
      title: 'Explore',
      items: [
        { label: 'List files here', prompt: 'List files and folders here.' },
        { label: 'Show folders', prompt: 'Show folders here.' },
        { label: 'What can you do?', prompt: '/op all' }
      ]
    },
    {
      title: 'Organize',
      items: [
        { label: 'Organize by type', prompt: `Organize all files in ${scopeLabel} by type.` },
        { label: 'Organize by year', prompt: `Organize all pdf and jpg files in ${scopeLabel} by year.` },
        { label: 'Rename matching files', prompt: 'Rename files that have invoice in their name to testing.' }
      ]
    },
    {
      title: 'Cleanup',
      items: [
        { label: 'Tag untagged files', prompt: `Tag all files in ${scopeLabel} without tags with review.` },
        { label: 'Move largest files', prompt: `Move largest 10 files in ${scopeLabel} to archive.` },
        { label: 'Delete old files', prompt: `Delete all files in ${scopeLabel} older than 30 days.` }
      ]
    },
    {
      title: 'AI Workflows',
      items: [
        { label: 'Tag images', prompt: `Tag all images in ${scopeLabel}.` },
        { label: 'Extract invoices', prompt: `Extract all invoices in ${scopeLabel} to csv.` },
        { label: 'Extract custom schema', prompt: `Extract files in ${scopeLabel} to csv with fields vendor:text, effective date:date, renewal date:date, total value:number.` },
        { label: 'Transcribe audio', prompt: `Transcribe all audio files in ${scopeLabel} and tag them.` }
      ]
    },
    {
      title: 'Support',
      items: [
        { label: 'Run diagnostics', prompt: '/diagnostics' },
        { label: 'Explain scope issue', prompt: 'Help me troubleshoot why I got a scope violation in FileRise AI chat.' },
        { label: 'Explain vision disabled', prompt: 'Help me troubleshoot why vision is disabled in FileRise AI chat.' }
      ]
    }
  ];
}

function createChatUi(config) {
  const headerButtons = document.querySelector('.header-buttons');
  if (!headerButtons) return null;
  ensureAiChatStyles();

  const btn = makeEl('button', {
    id: 'aiChatBtn',
    title: 'AI Chat (Pro)'
  }, '<i class="material-icons">smart_toy</i>');

  const overlay = makeEl('div', {
    id: 'aiChatOverlay',
    style: 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:12000;display:none;'
  });

  const card = makeEl('div', {
    id: 'aiChatCard',
    style: 'position:absolute;right:20px;top:60px;width:min(760px,calc(100vw - 24px));height:min(84vh,820px);background:var(--card-bg,#fff);color:var(--text-color,#111);border:1px solid rgba(0,0,0,.12);border-radius:20px;box-shadow:0 22px 60px rgba(15,23,42,.24);display:flex;flex-direction:column;overflow:hidden;'
  });
  const dataEgress = (config?.settings?.dataEgress && typeof config.settings.dataEgress === 'object')
    ? config.settings.dataEgress
    : {};
  const dataEgressEnabled = !!dataEgress.enabled;
  const dataEgressMessage = String(dataEgress.message || '').trim();

  card.innerHTML = `
    <div data-ai-chat-section="head" style="display:flex;justify-content:space-between;align-items:flex-start;padding:10px 14px 8px;border-bottom:1px solid rgba(0,0,0,.08);gap:10px;">
      <div style="display:flex;flex-direction:column;gap:3px;min-width:0;flex:1;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <div style="font-weight:700;font-size:14px;line-height:1.1;">AI Chat</div>
          <div style="font-size:11px;opacity:.66;line-height:1.1;">ACL-scoped, audited</div>
        </div>
        <div id="aiChatMeta" style="font-size:10px;opacity:.68;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
      </div>
      <span id="aiChatClose" class="editor-close-btn" role="button" aria-label="Close" title="Close">&times;</span>
    </div>
    ${dataEgressEnabled ? `
      <div data-ai-chat-section="egress" style="padding:7px 14px;border-bottom:1px solid rgba(0,0,0,.08);font-size:11px;line-height:1.35;background:rgba(245,158,11,.10);color:inherit;">
        <strong>External AI data egress:</strong> ${escapeHTML(dataEgressMessage || 'Enabled external AI providers may send prompts and visible file excerpts to third-party services.')}
      </div>
    ` : ''}
    <div data-ai-chat-section="scope" style="display:flex;gap:8px;padding:7px 14px;border-bottom:1px solid rgba(0,0,0,.08);flex-wrap:wrap;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;min-width:0;">
        <div id="aiChatScopeSummary" style="font-size:11px;opacity:.78;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;"></div>
        <button type="button" id="aiChatToggleScope" class="btn btn-sm btn-light" style="border-radius:999px;padding:3px 8px;font-size:10px;line-height:1.1;flex:0 0 auto;">Show scope</button>
      </div>
      <div id="aiChatScopeFields" style="display:none;gap:10px;flex-wrap:wrap;width:100%;">
        <div style="display:flex;justify-content:flex-end;width:100%;">
          <button type="button" id="aiChatUseCurrent" class="btn btn-sm btn-light" style="border-radius:999px;padding:4px 10px;font-size:11px;line-height:1.2;">Scope chat here</button>
        </div>
        <label style="margin:0;display:flex;flex-direction:column;font-size:11px;gap:4px;min-width:130px;text-transform:uppercase;letter-spacing:.04em;opacity:.82;">
          <span>Work In Source</span>
          <input id="aiChatSource" class="form-control form-control-sm" value="local" />
        </label>
        <label style="margin:0;display:flex;flex-direction:column;font-size:11px;gap:4px;min-width:190px;flex:1;text-transform:uppercase;letter-spacing:.04em;opacity:.82;">
          <span>Folder Scope</span>
          <input id="aiChatRoot" class="form-control form-control-sm" value="root" />
        </label>
      </div>
    </div>
    <div data-ai-chat-section="recipes" style="padding:7px 14px;border-bottom:1px solid rgba(0,0,0,.08);display:flex;flex-direction:column;gap:7px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1;">
          <div style="font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;line-height:1.1;">Recipes</div>
          <div id="aiChatRecipeSummary" style="font-size:11px;opacity:.72;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;">Built-ins + saved prompts</div>
        </div>
        <button type="button" id="aiChatToggleRecipes" class="btn btn-sm btn-light" style="border-radius:999px;padding:3px 8px;font-size:10px;line-height:1.1;flex:0 0 auto;">Show recipes</button>
      </div>
      <div id="aiChatRecipeBody" style="display:none;flex-direction:column;gap:8px;">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button type="button" id="aiChatSaveRecipe" class="btn btn-sm btn-light" style="border-radius:999px;padding:4px 10px;font-size:11px;line-height:1.2;">Save prompt</button>
          <button type="button" id="aiChatRefreshRecipes" class="btn btn-sm btn-light" style="border-radius:999px;padding:4px 10px;font-size:11px;line-height:1.2;">Refresh</button>
        </div>
        <div id="aiChatRecipeRail" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
      </div>
    </div>
    <div data-ai-chat-section="tips" style="padding:7px 14px;border-bottom:1px solid rgba(0,0,0,.08);display:flex;flex-direction:column;gap:7px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1;">
          <div style="font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;line-height:1.1;">Tips</div>
          <div id="aiChatTipsSummary" style="font-size:11px;opacity:.72;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;">Prompt ideas, examples, and troubleshooting help</div>
        </div>
        <button type="button" id="aiChatToggleTips" class="btn btn-sm btn-light" style="border-radius:999px;padding:3px 8px;font-size:10px;line-height:1.1;flex:0 0 auto;">Show tips</button>
      </div>
      <div id="aiChatTipsBody" style="display:none;flex-direction:column;gap:10px;"></div>
    </div>
    <div id="aiChatLog" style="padding:18px 16px 10px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:14px;background:linear-gradient(180deg, rgba(127,127,127,.05), rgba(127,127,127,.02));scroll-behavior:smooth;"></div>
    <div id="aiChatHint" style="padding:5px 14px 0;font-size:11px;opacity:.7;line-height:1.25;">Try: list/read/create file/create folder/delete/rename/copy/move/tag. Use /op all for commands, /diagnostics for support, and Tips for prompt patterns. Bulk plans require /confirm &lt;token&gt;.</div>
    <div data-ai-chat-section="analysis" style="padding:7px 14px 0;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
      <div id="aiChatAnalysisSummary" style="font-size:11px;opacity:.72;">Analysis: auto</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <button type="button" id="aiChatVisionMode" class="btn btn-sm btn-light" style="border-radius:999px;padding:4px 10px;font-size:11px;line-height:1.2;">Vision: Auto</button>
        <button type="button" id="aiChatOcrMode" class="btn btn-sm btn-light" style="border-radius:999px;padding:4px 10px;font-size:11px;line-height:1.2;">OCR: Auto</button>
      </div>
    </div>
    <div data-ai-chat-section="composer" style="padding:8px 14px 10px;border-top:1px solid rgba(0,0,0,.08);display:flex;gap:10px;align-items:flex-end;background:rgba(255,255,255,.72);">
      <textarea id="aiChatInput" rows="2" class="form-control" style="resize:none;min-height:52px;max-height:180px;border-radius:14px;" placeholder="Message AI Chat"></textarea>
      <button type="button" id="aiChatSend" class="btn btn-primary" style="border-radius:14px;padding:10px 16px;min-width:84px;">Send</button>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);
  headerButtons.insertBefore(btn, headerButtons.firstChild || null);

  const logEl = card.querySelector('#aiChatLog');
  const inputEl = card.querySelector('#aiChatInput');
  const sourceEl = card.querySelector('#aiChatSource');
  const rootEl = card.querySelector('#aiChatRoot');
  const closeEl = card.querySelector('#aiChatClose');
  const sendEl = card.querySelector('#aiChatSend');
  const metaEl = card.querySelector('#aiChatMeta');
  const scopeSummaryEl = card.querySelector('#aiChatScopeSummary');
  const useCurrentEl = card.querySelector('#aiChatUseCurrent');
  const toggleScopeEl = card.querySelector('#aiChatToggleScope');
  const scopeFieldsEl = card.querySelector('#aiChatScopeFields');
  const recipeBodyEl = card.querySelector('#aiChatRecipeBody');
  const recipeRailEl = card.querySelector('#aiChatRecipeRail');
  const recipeSummaryEl = card.querySelector('#aiChatRecipeSummary');
  const saveRecipeEl = card.querySelector('#aiChatSaveRecipe');
  const refreshRecipesEl = card.querySelector('#aiChatRefreshRecipes');
  const toggleRecipesEl = card.querySelector('#aiChatToggleRecipes');
  const tipsBodyEl = card.querySelector('#aiChatTipsBody');
  const tipsSummaryEl = card.querySelector('#aiChatTipsSummary');
  const toggleTipsEl = card.querySelector('#aiChatToggleTips');
  const analysisSummaryEl = card.querySelector('#aiChatAnalysisSummary');
  const visionModeEl = card.querySelector('#aiChatVisionMode');
  const ocrModeEl = card.querySelector('#aiChatOcrMode');

  let scopeExpanded = false;
  let recipesExpanded = false;
  let tipsExpanded = false;
  let visionConfigured = false;
  const copilotProfiles = Array.isArray(config?.settings?.copilotProfiles)
    ? config.settings.copilotProfiles
    : [];
  const copilotProfileMap = new Map(
    copilotProfiles
      .filter((row) => row && typeof row === 'object')
      .map((row) => [String(row.id || '').trim(), row])
      .filter(([id]) => id !== '')
  );
  const copilotProfile = normalizeCopilotProfile(
    window.__frAiChatCopilotProfile || config?.settings?.defaultCopilotProfile || 'app_chat'
  );
  const copilotContextPacket = cloneContextPacket(window.__frAiChatContextPacket);
  const analysisOverrides = {
    vision: 'auto',
    ocr: 'auto'
  };

  const nextModeValue = (value) => {
    if (value === 'auto') return 'on';
    if (value === 'on') return 'off';
    return 'auto';
  };

  const modeLabel = (value) => {
    if (value === 'on') return 'On';
    if (value === 'off') return 'Off';
    return 'Auto';
  };

  const syncAnalysisControls = () => {
    if (visionModeEl) {
      visionModeEl.disabled = !visionConfigured;
      visionModeEl.textContent = `Vision: ${visionConfigured ? modeLabel(analysisOverrides.vision) : 'Disabled'}`;
      visionModeEl.title = visionConfigured
        ? 'Cycle Vision between Auto, On, and Off'
        : 'Vision is disabled in AI settings';
    }
    if (ocrModeEl) {
      ocrModeEl.textContent = `OCR: ${modeLabel(analysisOverrides.ocr)}`;
      ocrModeEl.title = 'Cycle OCR between Auto, On, and Off';
    }
    if (analysisSummaryEl) {
      const parts = [];
      parts.push(`Vision ${visionConfigured ? modeLabel(analysisOverrides.vision).toLowerCase() : 'disabled'}`);
      parts.push(`OCR ${modeLabel(analysisOverrides.ocr).toLowerCase()}`);
      analysisSummaryEl.textContent = `Analysis: ${parts.join(' | ')}`;
    }
  };

  const buildAnalysisPayload = () => {
    const payload = {
      visionMode: analysisOverrides.vision,
      ocrMode: analysisOverrides.ocr
    };
    if (analysisOverrides.vision !== 'auto' && visionConfigured) {
      payload.visionEnabled = analysisOverrides.vision === 'on';
    }
    if (analysisOverrides.ocr !== 'auto') {
      payload.ocrEnabled = analysisOverrides.ocr === 'on';
    }
    return payload;
  };

  const syncCollapsedState = () => {
    if (scopeFieldsEl) {
      scopeFieldsEl.style.display = scopeExpanded ? 'flex' : 'none';
    }
    if (toggleScopeEl) {
      toggleScopeEl.textContent = scopeExpanded ? 'Hide scope' : 'Show scope';
    }
    if (recipeBodyEl) {
      recipeBodyEl.style.display = recipesExpanded ? 'flex' : 'none';
    }
    if (toggleRecipesEl) {
      toggleRecipesEl.textContent = recipesExpanded ? 'Hide recipes' : 'Show recipes';
    }
    if (tipsBodyEl) {
      tipsBodyEl.style.display = tipsExpanded ? 'flex' : 'none';
    }
    if (toggleTipsEl) {
      toggleTipsEl.textContent = tipsExpanded ? 'Hide tips' : 'Show tips';
    }
  };

  const scrollLogToBottom = () => {
    if (!logEl) return;
    logEl.scrollTop = logEl.scrollHeight;
  };

  const workspace = () => ({
    sourceId: String(sourceEl?.value || 'local').trim() || 'local',
    rootPath: String(rootEl?.value || 'root').trim() || 'root'
  });

  const currentChatLocation = () => ({
    sourceId: getActiveSourceId(),
    rootPath: getActiveFolder()
  });

  const setWorkspace = (nextWorkspace) => {
    const next = nextWorkspace && typeof nextWorkspace === 'object' ? nextWorkspace : {};
    if (sourceEl && typeof next.sourceId !== 'undefined') {
      sourceEl.value = normalizeSourceId(next.sourceId);
    }
    if (rootEl && typeof next.rootPath !== 'undefined') {
      rootEl.value = normalizeFolderPath(next.rootPath);
    }
    updateScopeSummary();
  };

  let savedRecipes = [];
  let lastRecipeDraft = null;

  const insertTipPrompt = (prompt) => {
    const text = String(prompt || '').trim();
    if (!text || !inputEl) return;
    inputEl.value = text;
    inputEl.focus();
    inputEl.setSelectionRange(text.length, text.length);
    showToast('Prompt inserted');
  };

  const renderTips = () => {
    if (!tipsBodyEl) return;
    tipsBodyEl.innerHTML = '';
    const groups = getTipGroups();
    groups.forEach((group) => {
      const section = document.createElement('div');
      section.style.display = 'flex';
      section.style.flexDirection = 'column';
      section.style.gap = '6px';

      const title = document.createElement('div');
      title.style.fontSize = '11px';
      title.style.fontWeight = '700';
      title.style.letterSpacing = '.05em';
      title.style.textTransform = 'uppercase';
      title.style.opacity = '.74';
      title.textContent = group.title;
      section.appendChild(title);

      const rail = document.createElement('div');
      rail.style.display = 'flex';
      rail.style.gap = '8px';
      rail.style.flexWrap = 'wrap';

      group.items.forEach((item) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-sm btn-light';
        btn.style.borderRadius = '999px';
        btn.style.padding = '4px 10px';
        btn.style.fontSize = '11px';
        btn.style.lineHeight = '1.2';
        btn.textContent = String(item.label || '');
        btn.title = String(item.prompt || '');
        btn.addEventListener('click', () => insertTipPrompt(item.prompt));
        rail.appendChild(btn);
      });

      section.appendChild(rail);
      tipsBodyEl.appendChild(section);
    });

    if (tipsSummaryEl) {
      tipsSummaryEl.textContent = `${groups.length} example groups`;
    }
  };

  const renderRecipeRail = () => {
    if (!recipeRailEl) return;
    recipeRailEl.innerHTML = '';

    const addRecipeButton = (recipe) => {
      const wrap = document.createElement('div');
      wrap.style.display = 'inline-flex';
      wrap.style.alignItems = 'center';
      wrap.style.gap = '4px';
      wrap.style.maxWidth = '100%';

      const runBtn = document.createElement('button');
      runBtn.type = 'button';
      runBtn.className = 'btn btn-sm btn-light';
      runBtn.style.borderRadius = '999px';
      runBtn.style.padding = '4px 10px';
      runBtn.style.fontSize = '11px';
      runBtn.style.lineHeight = '1.2';
      runBtn.style.maxWidth = '260px';
      runBtn.style.overflow = 'hidden';
      runBtn.style.textOverflow = 'ellipsis';
      runBtn.style.whiteSpace = 'nowrap';
      runBtn.textContent = recipe.builtin ? `${recipe.name}` : `${recipe.pinned ? '★ ' : ''}${recipe.name}`;
      runBtn.title = recipe.prompt || recipe.name;
      runBtn.addEventListener('click', () => runRecipe(recipe));
      wrap.appendChild(runBtn);

      if (!recipe.builtin) {
        const pinBtn = document.createElement('button');
        pinBtn.type = 'button';
        pinBtn.className = 'btn btn-sm btn-light';
        pinBtn.style.borderRadius = '999px';
        pinBtn.style.padding = '4px 8px';
        pinBtn.style.fontSize = '11px';
        pinBtn.style.lineHeight = '1.2';
        pinBtn.textContent = recipe.pinned ? 'Unpin' : 'Pin';
        pinBtn.title = recipe.pinned ? 'Unpin recipe' : 'Pin recipe';
        pinBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          toggleRecipePin(recipe);
        });
        wrap.appendChild(pinBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn btn-sm btn-light';
        deleteBtn.style.borderRadius = '999px';
        deleteBtn.style.padding = '4px 8px';
        deleteBtn.style.fontSize = '11px';
        deleteBtn.style.lineHeight = '1.2';
        deleteBtn.textContent = 'Delete';
        deleteBtn.title = 'Delete recipe';
        deleteBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          deleteRecipe(recipe);
        });
        wrap.appendChild(deleteBtn);
      }

      recipeRailEl.appendChild(wrap);
    };

    getBuiltInRecipes().forEach(addRecipeButton);
    savedRecipes.forEach(addRecipeButton);
    if (recipeSummaryEl) {
      recipeSummaryEl.textContent = `${getBuiltInRecipes().length} built-in, ${savedRecipes.length} saved`;
    }
  };

  const loadRecipes = async () => {
    try {
      const res = await apiGet('/api/pro/ai/recipes/list.php');
      savedRecipes = Array.isArray(res?.recipes) ? res.recipes : [];
      renderRecipeRail();
      syncCollapsedState();
    } catch (err) {
      savedRecipes = [];
      renderRecipeRail();
    }
  };

  const saveRecipeDraft = async () => {
    const promptText = String(inputEl?.value || '').trim() || String(lastRecipeDraft?.prompt || '').trim();
    if (!promptText) {
      showToast('Type or send a prompt first');
      inputEl?.focus();
      return;
    }

    const suggestedName = inferRecipeTitle(
      lastRecipeDraft?.meta?.suggestedRecipeName || promptText,
      'Saved recipe'
    );
    const chosenName = window.prompt('Recipe name', suggestedName);
    if (chosenName === null) return;

    const trimmedName = String(chosenName || '').trim();
    if (!trimmedName) {
      showToast('Recipe name is required');
      return;
    }

    const saveToCurrentScope = window.confirm('Bind this recipe to the current source/folder scope? Click Cancel to keep it runnable in the current chat scope only.');
    const recipePayload = {
      name: trimmedName,
      prompt: promptText,
      scopeMode: saveToCurrentScope ? 'saved' : 'current',
      sourceId: workspace().sourceId,
      rootPath: workspace().rootPath,
      workflowHint: String(lastRecipeDraft?.meta?.workflowName || '')
    };

    try {
      await apiPost('/api/pro/ai/recipes/save.php', { recipe: recipePayload });
      showToast('Recipe saved');
      await loadRecipes();
    } catch (err) {
      showToast(err?.message || 'Failed to save recipe');
    }
  };

  const deleteRecipe = async (recipe) => {
    if (!recipe || recipe.builtin) return;
    const confirmed = window.confirm(`Delete recipe "${recipe.name || 'recipe'}"?`);
    if (!confirmed) return;

    try {
      await apiPost('/api/pro/ai/recipes/delete.php', { id: recipe.id });
      showToast('Recipe deleted');
      await loadRecipes();
    } catch (err) {
      showToast(err?.message || 'Failed to delete recipe');
    }
  };

  const toggleRecipePin = async (recipe) => {
    if (!recipe || recipe.builtin) return;

    try {
      await apiPost('/api/pro/ai/recipes/save.php', {
        recipe: {
          id: recipe.id,
          pinned: !recipe.pinned
        }
      });
      await loadRecipes();
    } catch (err) {
      showToast(err?.message || 'Failed to update recipe');
    }
  };

  const runRecipe = async (recipe) => {
    if (!recipe || !recipe.prompt) return;
    if (recipe.scopeMode === 'saved') {
      setWorkspace({
        sourceId: recipe.sourceId || 'local',
        rootPath: recipe.rootPath || 'root'
      });
    }
    await sendMessage({
      message: recipe.prompt,
      recipeId: recipe.builtin ? '' : recipe.id
    });
  };

  const updateScopeSummary = () => {
    const hintSource = normalizeSourceId(currentChatLocation().sourceId);
    const hintFolder = normalizeFolderPath(currentChatLocation().rootPath);
    const currentWorkspace = workspace();
    if (scopeSummaryEl) {
      scopeSummaryEl.textContent = `Here ${hintSource}:${hintFolder} | Scope ${currentWorkspace.sourceId}:${currentWorkspace.rootPath}`;
    }
    if (metaEl) {
      const providerSetting = config?.settings?.providers;
      const providerRows = Array.isArray(providerSetting)
        ? providerSetting
        : ((providerSetting && typeof providerSetting === 'object') ? Object.values(providerSetting) : []);
      const providerNames = providerRows
        .map((row) => (row && typeof row === 'object') ? String(row.name || '').trim() : '')
        .filter((name) => name !== '');
      const providerText = providerNames.length > 0 ? providerNames.join(', ') : 'none';
      const modeText = config?.settings?.readOnlyMode ? 'read-only' : 'write-enabled';
      const profileLabel = String(copilotProfileMap.get(copilotProfile)?.label || copilotProfile).trim();
      metaEl.textContent = `${profileLabel} | ${providerText} | ${modeText} | ${currentWorkspace.sourceId}:${currentWorkspace.rootPath}`;
    }
    renderRecipeRail();
    renderTips();
  };

  const applyTheme = () => {
    const dark = isDarkModeEnabled();
    const border = dark ? 'rgba(255,255,255,.10)' : 'rgba(15,23,42,.08)';
    card.style.background = dark ? '#212121' : '#ffffff';
    card.style.color = dark ? '#f3f5f7' : '#111827';
    card.style.borderColor = dark ? '#303030' : 'rgba(15,23,42,.10)';
    const logBg = dark
      ? 'linear-gradient(180deg, #181818, #212121)'
      : 'linear-gradient(180deg, #f7f8fa, #f1f5f9)';
    if (logEl) {
      logEl.style.background = logBg;
    }
    card.querySelectorAll('[data-ai-chat-section]').forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      if (el.dataset.aiChatSection === 'composer') {
        el.style.borderTopColor = border;
        el.style.background = dark ? '#212121' : 'rgba(255,255,255,.96)';
      } else if (el.dataset.aiChatSection === 'head') {
        el.style.background = dark ? '#181818' : '#ffffff';
        el.style.borderBottomColor = border;
      } else {
        el.style.background = dark ? '#212121' : '#ffffff';
        el.style.borderBottomColor = border;
      }
    });
  };
  applyTheme();

  const themeObserver = new MutationObserver(() => applyTheme());
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  const providerSetting = config?.settings?.providers;
  const providerRows = Array.isArray(providerSetting)
    ? providerSetting
    : ((providerSetting && typeof providerSetting === 'object') ? Object.values(providerSetting) : []);
  const hasProviders = providerRows.some((row) => {
    if (!row || typeof row !== 'object') return false;
    return row.enabled || String(row.name || '').trim() !== '';
  });
  visionConfigured = !!config?.settings?.visionEnabledByDefault && hasProviders;
  if (!hasProviders) {
    const hint = card.querySelector('#aiChatHint');
    if (hint) {
      hint.textContent = 'No enabled AI provider is configured yet. Tool commands still work (e.g. list files / queue jobs).';
    }
  }

  const formatWorkflowLabel = (workflow) => {
    const value = String(workflow || '').trim();
    if (!value) return 'Workflow';
    return value
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (m) => m.toUpperCase());
  };

  const formatWorkflowParams = (workflow) => {
    if (!workflow || typeof workflow !== 'object') return [];
    const params = (workflow.params && typeof workflow.params === 'object') ? workflow.params : {};
    const rows = [];
    const jobId = Number(workflow.jobId || 0);
    if (jobId > 0) rows.push(`Job: #${jobId}`);
    const visionEnabled = !!params.visionEnabled;
    const ocrEnabled = !!params.ocrEnabled;
    if (visionEnabled || ocrEnabled) {
      const analysisMode = visionEnabled && ocrEnabled
        ? 'Vision + OCR'
        : (visionEnabled ? 'Vision only' : 'OCR only');
      rows.push(`Analysis: ${analysisMode}`);
    }
    const adapterStats = (workflow.adapterStats && typeof workflow.adapterStats === 'object') ? workflow.adapterStats : {};
    const adapterPairs = Object.entries(adapterStats)
      .map(([name, count]) => {
        const label = String(name || '').trim();
        const total = Number(count || 0);
        if (!label || total <= 0) return '';
        return `${label} ${total}`;
      })
      .filter((entry) => entry !== '');
    if (adapterPairs.length) {
      rows.push(`Adapters: ${adapterPairs.join(' | ')}`);
    }
    const destination = String(params.destination || '').trim();
    if (destination) rows.push(`Destination: ${destination}`);
    const schemaName = String(params.schemaName || params.schema?.name || '').trim();
    if (schemaName) rows.push(`Schema: ${schemaName}`);
    const outputFormats = Array.isArray(params.outputFormats)
      ? params.outputFormats.map((entry) => String(entry || '').trim()).filter((entry) => entry !== '')
      : [];
    if (outputFormats.length) rows.push(`Outputs: ${outputFormats.join(', ')}`);
    const organizeMode = String(params.mode || '').trim();
    if (organizeMode) {
      rows.push(`Organize by: ${organizeMode === 'by_year' ? 'Year' : 'Type'}`);
    }
    const match = String(params.match || '').trim();
    const replace = String(params.replace || '').trim();
    if (match || replace) {
      rows.push(`Rule: replace "${match}" -> "${replace}"`);
    }
    const nameContains = String(params.nameContains || '').trim();
    if (nameContains) rows.push(`Filename contains: ${nameContains}`);
    const extensions = Array.isArray(params.extensions)
      ? params.extensions.map((entry) => String(entry || '').trim()).filter((entry) => entry !== '')
      : [];
    if (extensions.length) rows.push(`Extensions: ${extensions.join(', ')}`);
    if (params.withoutTags) rows.push('Filter: without tags');
    const olderThanDays = Number(params.olderThanDays || 0);
    if (olderThanDays > 0) rows.push(`Older than: ${olderThanDays} day(s)`);
    const largestN = Number(params.largestN || 0);
    if (largestN > 0) rows.push(`Largest: top ${largestN} file(s)`);
    const tags = Array.isArray(params.tags)
      ? params
          .tags
          .map((tag) => (tag && typeof tag === 'object') ? String(tag.name || '').trim() : '')
          .filter((name) => name !== '')
      : [];
    if (tags.length) rows.push(`Tags: ${tags.join(', ')}`);
    const preview = (params.preview && typeof params.preview === 'object') ? params.preview : null;
    if (preview) {
      const matchedCount = Number(preview.matchedCount || 0);
      const changeCount = Number(preview.changeCount || 0);
      const unchangedCount = Number(preview.unchangedCount || 0);
      const invalidCount = Number(preview.invalidCount || 0);
      const conflictCount = Number(preview.conflictCount || 0);
      if (matchedCount > 0 || changeCount > 0 || invalidCount > 0 || conflictCount > 0) {
        let previewSummary = `Matched: ${matchedCount} | Renames: ${changeCount}`;
        if (unchangedCount > 0) previewSummary += ` | Unchanged: ${unchangedCount}`;
        if (invalidCount > 0) previewSummary += ` | Invalid: ${invalidCount}`;
        if (conflictCount > 0) previewSummary += ` | Conflicts: ${conflictCount}`;
        rows.push(previewSummary);
      }
      const sampleRenames = Array.isArray(preview.sampleRenames) ? preview.sampleRenames : [];
      sampleRenames.slice(0, 3).forEach((entry) => {
        if (!entry || typeof entry !== 'object') return;
        const from = String(entry.from || '').trim();
        const to = String(entry.to || '').trim();
        if (from && to) rows.push(`Preview: ${from} -> ${to}`);
      });
      const sampleConflicts = Array.isArray(preview.sampleConflicts) ? preview.sampleConflicts : [];
      sampleConflicts.slice(0, 3).forEach((entry) => {
        if (!entry || typeof entry !== 'object') return;
        const from = String(entry.from || '').trim();
        const to = String(entry.to || '').trim();
        const reason = String(entry.reason || '').trim();
        if (from && to && reason) rows.push(`Conflict: ${from} -> ${to} (${reason})`);
      });
      const sampleMoves = Array.isArray(preview.sampleMoves) ? preview.sampleMoves : [];
      sampleMoves.slice(0, 3).forEach((entry) => {
        if (!entry || typeof entry !== 'object') return;
        const file = String(entry.file || '').trim();
        const destinationFolder = String(entry.destination || '').trim();
        if (file && destinationFolder) rows.push(`Preview: ${file} -> ${destinationFolder}`);
      });
      const targetFolderCount = Number(preview.targetFolderCount || 0);
      if (targetFolderCount > 0) rows.push(`Target folders: ${targetFolderCount}`);
      const blockingReasons = Array.isArray(preview.blockingReasons) ? preview.blockingReasons : [];
      blockingReasons.slice(0, 2).forEach((reason) => {
        const text = String(reason || '').trim();
        if (text) rows.push(`Blocked: ${text}`);
      });
    }
    const lastFile = String(workflow.lastFile || '').trim();
    if (lastFile && (workflow.running || String(workflow.status || '').trim().toLowerCase() === 'running')) {
      rows.push(`Last file: ${lastFile}`);
    }
    const savedOutputFile = (workflow.savedOutputFile && typeof workflow.savedOutputFile === 'object')
      ? workflow.savedOutputFile
      : null;
    if (savedOutputFile && String(savedOutputFile.fileName || '').trim() !== '') {
      rows.push(`Output: ${savedOutputFile.fileName} in ${savedOutputFile.folder || 'root'}`);
    }
    const savedOutputJsonFile = (workflow.savedOutputJsonFile && typeof workflow.savedOutputJsonFile === 'object')
      ? workflow.savedOutputJsonFile
      : null;
    if (savedOutputJsonFile && String(savedOutputJsonFile.fileName || '').trim() !== '') {
      rows.push(`JSON: ${savedOutputJsonFile.fileName} in ${savedOutputJsonFile.folder || 'root'}`);
    }
    const workflowName = String(workflow.name || '').trim().toLowerCase();
    const outputs = Array.isArray(workflow.outputFormats) ? workflow.outputFormats.map((v) => String(v || '').trim().toLowerCase()).filter((v) => v !== '') : [];
    if (
      (status === 'completed' || status === 'succeeded')
      && (workflowName === 'extract_invoices_csv' || workflowName === 'extract_structured_data')
      && outputs.includes('csv')
      && !savedOutputFile
    ) {
      rows.push('Output file was not reported by the worker. Restart the automation worker if Pro files were updated while it was running.');
    }
    return rows;
  };

  const buildAutomationWorkflowFromDetail = (baseWorkflow, detail) => {
    const job = (detail && typeof detail === 'object' && detail.job && typeof detail.job === 'object') ? detail.job : null;
    const payload = (job && job.payload && typeof job.payload === 'object') ? job.payload : null;
    const progress = (payload && payload.aiProgress && typeof payload.aiProgress === 'object') ? payload.aiProgress : null;
    const result = (payload && payload.aiResult && typeof payload.aiResult === 'object') ? payload.aiResult : null;
    const rawStatus = String(job?.status || '').trim().toLowerCase();
    const workflow = {
      ...(baseWorkflow && typeof baseWorkflow === 'object' ? baseWorkflow : {})
    };
    if (job && Number(job.id || 0) > 0) {
      workflow.jobId = Number(job.id || 0);
    }
    workflow.pending = false;
    workflow.confirmed = rawStatus === 'succeeded';
    workflow.queued = rawStatus === 'queued';
    workflow.running = rawStatus === 'running';
    workflow.status = rawStatus === 'succeeded'
      ? 'completed'
      : (rawStatus || 'queued');

    const progressProcessed = Number(progress?.processedCount || 0);
    const progressFiltered = Number(progress?.filteredOutCount || 0);
    const progressFailed = Number(progress?.failedCount || 0);
    const resultProcessed = Number(result?.processedCount || 0);
    const resultFiltered = Number(result?.filteredOutCount || 0);
    const resultFailed = Number(result?.failedCount || 0);
    workflow.processed = rawStatus === 'succeeded' || rawStatus === 'failed' || rawStatus === 'dead' || rawStatus === 'canceled'
      ? resultProcessed
      : progressProcessed;
    workflow.filtered = rawStatus === 'succeeded' || rawStatus === 'failed' || rawStatus === 'dead' || rawStatus === 'canceled'
      ? resultFiltered
      : progressFiltered;
    workflow.failed = rawStatus === 'succeeded' || rawStatus === 'failed' || rawStatus === 'dead' || rawStatus === 'canceled'
      ? resultFailed
      : progressFailed;
    workflow.lastFile = String(progress?.lastFile || '').trim();
    workflow.savedOutputFile = (result?.savedOutputFile && typeof result.savedOutputFile === 'object')
      ? result.savedOutputFile
      : null;
    workflow.savedOutputJsonFile = (result?.savedOutputJsonFile && typeof result.savedOutputJsonFile === 'object')
      ? result.savedOutputJsonFile
      : null;
    workflow.adapterStats = (result?.adapterStats && typeof result.adapterStats === 'object')
      ? result.adapterStats
      : null;
    return workflow;
  };

  const buildWorkflowCard = (workflow) => {
    if (!workflow || typeof workflow !== 'object') return '';
    const title = String(workflow.title || formatWorkflowLabel(workflow.name)).trim() || 'Workflow';
    const folder = String(workflow.folder || '').trim();
    const summary = String(workflow.summary || '').trim();
    const token = String(workflow.token || '').trim();
    const expiresAt = String(workflow.expiresAt || '').trim();
    const estimatedFiles = Number(workflow.estimatedFiles || 0);
    const estimatedTotal = Number(workflow.estimatedTotalInFolder || 0);
    const maxFiles = Number(workflow.maxFiles || 0);
    const processed = Number(workflow.processed || 0);
    const failed = Number(workflow.failed || 0);
    const filtered = Number(workflow.filtered || 0);
    const status = String(workflow.status || '').trim().toLowerCase();
    const truncated = !!workflow.truncated;
    const sampleErrors = Array.isArray(workflow.sampleErrors) ? workflow.sampleErrors.filter((v) => String(v || '').trim() !== '') : [];
    const isPending = !!workflow.pending;
    const isConfirmed = !!workflow.confirmed;
    const isQueued = status === 'queued' || !!workflow.queued;
    const isRunning = status === 'running' || !!workflow.running;
    const isBlocked = status === 'blocked' || !!workflow.blocked;
    const isFinal = isConfirmed || status === 'completed' || status === 'failed' || status === 'dead' || status === 'canceled';
    const lines = [];

    if (folder) lines.push(`Folder: ${folder}`);
    if (summary && (!isFinal || isBlocked)) lines.push(summary);
    if ((estimatedFiles > 0 || isPending) && !isFinal) {
      let estimateText = `Estimated: ${estimatedFiles}`;
      if (estimatedTotal > 0) estimateText += ` of ${estimatedTotal}`;
      if (maxFiles > 0) estimateText += ` (cap ${maxFiles})`;
      lines.push(estimateText);
    }
    if (processed > 0 || failed > 0 || filtered > 0 || isConfirmed || isRunning) {
      let resultText = `Processed: ${processed}`;
      if (filtered > 0) resultText += ` | Filtered: ${filtered}`;
      resultText += ` | Failed: ${failed}`;
      lines.push(resultText);
    }
    if (truncated && maxFiles > 0) {
      lines.push(`Truncated at plan cap: ${maxFiles}`);
    }
    formatWorkflowParams(workflow).forEach((line) => lines.push(line));
    if (sampleErrors.length) {
      lines.push(`Errors: ${sampleErrors.slice(0, 3).join(' | ')}`);
    }
    if (token) lines.push(`Confirm: /confirm ${token}`);
    if (expiresAt) lines.push(`Expires: ${expiresAt}`);
    if (status && !isPending) {
      lines.push(`Status: ${status}`);
    } else if (isPending) {
      lines.push('Status: awaiting confirmation');
    } else if (isQueued) {
      lines.push('Status: queued');
    } else if (isRunning) {
      lines.push('Status: running');
    } else if (isConfirmed) {
      lines.push('Status: completed');
    }

    const tone = isPending
      ? { bg: '#fff7ed', border: '#fdba74', accent: '#c2410c', badge: 'Plan', spinner: false }
      : isBlocked
        ? { bg: '#fef2f2', border: '#fca5a5', accent: '#b91c1c', badge: 'Preview', spinner: false }
      : (isQueued || isRunning)
        ? { bg: '#eff6ff', border: '#93c5fd', accent: '#1d4ed8', badge: isRunning ? 'Running' : 'Queued', spinner: true }
        : ((String(workflow.name || '').toLowerCase() === 'bulk_delete_files')
          ? { bg: '#fef2f2', border: '#fca5a5', accent: '#b91c1c', badge: 'Done', spinner: false }
          : ((status === 'failed' || status === 'dead' || status === 'canceled')
            ? { bg: '#fef2f2', border: '#fca5a5', accent: '#b91c1c', badge: 'Failed', spinner: false }
            : { bg: '#ecfdf5', border: '#86efac', accent: '#166534', badge: 'Done', spinner: false }));
    const badge = tone.spinner
      ? `<div style="display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${tone.accent};"><span style="width:12px;height:12px;border-radius:999px;border:2px solid ${tone.accent};border-right-color:transparent;display:inline-block;animation:aiChatSpin 1s linear infinite;"></span>${escapeHTML(tone.badge)}</div>`
      : `<div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${tone.accent};">${escapeHTML(tone.badge)}</div>`;

    return `
      <div style="margin-top:10px;padding:12px 13px;border-radius:14px;border:1px solid ${tone.border};background:${tone.bg};color:#111827;display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;">
          <div style="font-weight:700;font-size:12px;line-height:1.3;">${escapeHTML(title)}</div>
          ${badge}
        </div>
        ${lines.map((line) => `<div style="font-size:12px;line-height:1.4;color:#374151;">${escapeHTML(line)}</div>`).join('')}
      </div>
    `;
  };

  const appendMessage = (role, text, options = {}) => {
    if (!logEl) return;
    const dark = isDarkModeEnabled();
    const row = document.createElement('div');
    const mine = role === 'user';
    const myBg = dark ? '#1d4ed8' : '#2563eb';
    const aiBg = dark ? '#181818' : '#e5e7eb';
    const aiBorder = dark ? '1px solid #303030' : '1px solid #d1d5db';
    row.style.alignSelf = 'stretch';
    row.style.display = 'flex';
    row.style.justifyContent = mine ? 'flex-end' : 'flex-start';
    const column = document.createElement('div');
    column.style.maxWidth = 'min(88%, 640px)';
    column.style.display = 'flex';
    column.style.flexDirection = 'column';
    column.style.gap = '4px';
    column.style.alignItems = mine ? 'flex-end' : 'flex-start';

    const label = document.createElement('div');
    label.style.fontSize = '11px';
    label.style.opacity = '.58';
    label.style.padding = '0 2px';
    label.textContent = mine ? 'You' : 'AI';

    const bubble = document.createElement('div');
    bubble.style.padding = '11px 14px';
    bubble.style.borderRadius = mine ? '18px 18px 6px 18px' : '18px 18px 18px 6px';
    bubble.style.background = mine ? myBg : aiBg;
    bubble.style.border = mine ? 'none' : aiBorder;
    bubble.style.color = mine ? '#ffffff' : (dark ? '#f3f5f7' : '#111827');
    bubble.style.whiteSpace = 'pre-wrap';
    bubble.style.wordBreak = 'break-word';
    bubble.style.lineHeight = '1.45';
    bubble.style.boxShadow = mine ? '0 10px 24px rgba(37,99,235,.18)' : '0 1px 2px rgba(15,23,42,.04)';

    const textEl = document.createElement('div');
    textEl.textContent = String(text || '');
    bubble.appendChild(textEl);

    const workflowEl = document.createElement('div');
    if (options.workflow) {
      workflowEl.innerHTML = buildWorkflowCard(options.workflow);
    }
    bubble.appendChild(workflowEl);

    column.appendChild(label);
    column.appendChild(bubble);
    row.appendChild(column);
    logEl.appendChild(row);
    scrollLogToBottom();
    return {
      row,
      setText(nextText) {
        textEl.textContent = String(nextText || '');
      },
      setWorkflow(nextWorkflow) {
        workflowEl.innerHTML = nextWorkflow ? buildWorkflowCard(nextWorkflow) : '';
      }
    };
  };

  const open = () => {
    overlay.style.display = '';
    loadRecipes();
    setTimeout(() => {
      updateScopeSummary();
      scrollLogToBottom();
      inputEl?.focus();
    }, 30);
  };

  const close = () => {
    overlay.style.display = 'none';
  };

  const watchedJobs = new Map();

  const refreshVisibleFolderForOutputFile = (savedFile) => {
    if (!savedFile || typeof savedFile !== 'object') return;
    const fileSourceId = normalizeSourceId(savedFile.sourceId || 'local');
    const fileFolder = normalizeFolderPath(savedFile.folder || 'root');
    if (fileSourceId !== getActiveSourceId()) return;
    if (fileFolder !== getActiveFolder()) return;
    refreshFolderView(fileFolder);
  };

  const refreshVisibleFolderForAutomationDetail = (detail) => {
    const job = (detail && typeof detail === 'object' && detail.job && typeof detail.job === 'object') ? detail.job : null;
    const payload = (job && job.payload && typeof job.payload === 'object') ? job.payload : null;
    const result = (payload && payload.aiResult && typeof payload.aiResult === 'object') ? payload.aiResult : null;
    if (!result) return;

    const mode = String(result.mode || '').trim().toLowerCase();
    if (!['tag_images', 'images_tag', 'image_tagging', 'transcribe_audio_tag', 'audio_transcribe_tag', 'transcribe_audio'].includes(mode)) {
      return;
    }

    const resultSourceId = normalizeSourceId(result.sourceId || 'local');
    const resultFolder = normalizeFolderPath(result.folder || 'root');
    if (resultSourceId !== getActiveSourceId()) return;
    if (resultFolder !== getActiveFolder()) return;
    refreshFolderView(resultFolder);
  };

  const refreshVisibleFolderForToolResult = (tool, ws) => {
    if (!tool || typeof tool !== 'object') return;
    const result = (tool.result && typeof tool.result === 'object') ? tool.result : null;
    if (!result || !result.ok) return;

    const op = String(tool.operation || '').toLowerCase();
    const mutatingOps = new Set([
      'create_file',
      'create_folder',
      'delete_files',
      'copy_files',
      'move_files',
      'rename_file',
      'delete_folder',
      'move_folder',
      'move_folders',
      'save_file_tag'
    ]);
    if (!mutatingOps.has(op)) return;

    const activeFolder = getActiveFolder();
    const activeSourceId = getActiveSourceId();
    const wsSourceId = normalizeSourceId((ws && typeof ws === 'object') ? ws.sourceId : 'local');
    if (activeSourceId !== wsSourceId) return;

    const isCurrentFolder = (folder) => normalizeFolderPath(folder) === activeFolder;
    let refreshFolder = '';

    if (op === 'create_file' || op === 'delete_files' || op === 'rename_file' || op === 'save_file_tag') {
      if (isCurrentFolder(result.folder || 'root')) {
        refreshFolder = activeFolder;
      }
    } else if (op === 'create_folder') {
      const parent = normalizeFolderPath(result.parent || 'root');
      if (activeFolder === parent) {
        refreshFolder = activeFolder;
      }
    } else if (op === 'copy_files' || op === 'move_files') {
      const src = normalizeFolderPath(result.source || 'root');
      const dst = normalizeFolderPath(result.destination || 'root');
      if (activeFolder === src || activeFolder === dst) {
        refreshFolder = activeFolder;
      }
    } else if (op === 'delete_folder') {
      const deleted = normalizeFolderPath(result.folder || '');
      if (deleted !== 'root' && (activeFolder === deleted || activeFolder.startsWith(`${deleted}/`))) {
        refreshFolder = parentFolderPath(deleted);
        window.currentFolder = refreshFolder;
      } else if (activeFolder === parentFolderPath(deleted)) {
        refreshFolder = activeFolder;
      }
    } else if (op === 'move_folder' || op === 'move_folders') {
      const source = normalizeFolderPath(result.source || '');
      const target = normalizeFolderPath(result.target || '');
      if (
        source !== 'root'
        && (activeFolder === source || activeFolder.startsWith(`${source}/`))
      ) {
        refreshFolder = target || parentFolderPath(source);
        window.currentFolder = refreshFolder;
      } else if (activeFolder === parentFolderPath(source) || (target !== '' && activeFolder === parentFolderPath(target))) {
        refreshFolder = activeFolder;
      }
    }

    if (refreshFolder === '') return;
    refreshFolderView(refreshFolder);
  };

  const refreshVisibleFolderForWorkflowResult = (refresh, ws) => {
    if (!refresh || typeof refresh !== 'object') return;
    const wsSourceId = normalizeSourceId((ws && typeof ws === 'object') ? ws.sourceId : 'local');
    if (wsSourceId !== getActiveSourceId()) return;

    const folders = Array.isArray(refresh.folders) ? refresh.folders : [];
    const activeFolder = getActiveFolder();
    const shouldRefresh = folders.some((folder) => normalizeFolderPath(folder) === activeFolder);
    if (!shouldRefresh) return;
    refreshFolderView(activeFolder);
  };

  const describeJobCompletion = (detail) => {
    const job = (detail && typeof detail === 'object' && detail.job && typeof detail.job === 'object') ? detail.job : null;
    const payload = (job && job.payload && typeof job.payload === 'object') ? job.payload : null;
    const result = (payload && payload.aiResult && typeof payload.aiResult === 'object') ? payload.aiResult : null;
    const status = String(job?.status || '').toLowerCase();
    if (!job) return '';

    if (status === 'succeeded') {
      const processed = Number(result?.processedCount || 0);
      const filtered = Number(result?.filteredOutCount || 0);
      const failed = Number(result?.failedCount || 0);
      const saved = (result?.savedOutputFile && typeof result.savedOutputFile === 'object') ? result.savedOutputFile : null;
      if (saved && String(saved.fileName || '').trim() !== '') {
        return `Job #${job.id} finished. Created ${saved.fileName} in ${saved.folder || 'root'} (processed ${processed}, filtered ${filtered}, failed ${failed}).`;
      }
      return `Job #${job.id} finished (processed ${processed}, filtered ${filtered}, failed ${failed}).`;
    }
    if (status === 'failed' || status === 'dead' || status === 'canceled') {
      const error = String(result?.error || '').trim();
      return error !== ''
        ? `Job #${job.id} ${status}. ${error}`
        : `Job #${job.id} ${status}.`;
    }
    return '';
  };

  const watchJob = (jobId, options = {}) => {
    const numericJobId = Number(jobId || 0);
    if (!Number.isFinite(numericJobId) || numericJobId <= 0) return;
    if (watchedJobs.has(numericJobId)) return;

    const state = {
      done: false,
      timer: 0,
      lastProgressKey: '',
      lastStatus: '',
      messageHandle: options.messageHandle || null,
      workflow: (options.workflow && typeof options.workflow === 'object') ? { ...options.workflow } : null
    };
    watchedJobs.set(numericJobId, state);

    const poll = async () => {
      if (state.done) return;
      try {
        const detail = await apiGet(`/api/pro/automation/jobs/get.php?id=${encodeURIComponent(numericJobId)}`);
        const job = (detail && typeof detail === 'object' && detail.job && typeof detail.job === 'object') ? detail.job : null;
        const status = String(job?.status || '').toLowerCase();
        const payload = (job && job.payload && typeof job.payload === 'object') ? job.payload : null;
        const progress = (payload && payload.aiProgress && typeof payload.aiProgress === 'object') ? payload.aiProgress : null;
        const progressKey = progress
          ? `${Number(progress.processedCount || 0)}|${Number(progress.filteredOutCount || 0)}|${Number(progress.failedCount || 0)}|${String(progress.lastFile || '')}`
          : '';
        const workflowDetail = buildAutomationWorkflowFromDetail(state.workflow, detail);

        if ((status === 'queued' || status === 'running') && progress && progressKey !== '' && progressKey !== state.lastProgressKey) {
          state.lastProgressKey = progressKey;
          if (state.messageHandle) {
            state.messageHandle.setWorkflow(workflowDetail);
            state.messageHandle.setText(`Job #${numericJobId} is running.`);
          } else {
            appendMessage(
              'assistant',
              `Job #${numericJobId} running: processed ${Number(progress.processedCount || 0)}, filtered ${Number(progress.filteredOutCount || 0)}, failed ${Number(progress.failedCount || 0)}${progress.lastFile ? `, last file ${String(progress.lastFile)}` : ''}.`,
              { workflow: workflowDetail }
            );
          }
        } else if ((status === 'queued' || status === 'running') && state.lastStatus !== status) {
          state.lastStatus = status;
          if (state.messageHandle) {
            state.messageHandle.setWorkflow(workflowDetail);
            state.messageHandle.setText(`Job #${numericJobId} ${status}.`);
          } else {
            appendMessage('assistant', `Job #${numericJobId} ${status}.`, { workflow: workflowDetail });
          }
        }

        if (status === 'succeeded' || status === 'failed' || status === 'dead' || status === 'canceled') {
          state.done = true;
          watchedJobs.delete(numericJobId);
          const result = (payload && payload.aiResult && typeof payload.aiResult === 'object') ? payload.aiResult : null;
          const saved = (result?.savedOutputFile && typeof result.savedOutputFile === 'object') ? result.savedOutputFile : null;
          const summary = describeJobCompletion(detail);
          if (state.messageHandle) {
            state.messageHandle.setWorkflow(workflowDetail);
            if (summary !== '') {
              state.messageHandle.setText(summary);
            }
          } else if (summary !== '') {
            appendMessage('assistant', summary, { workflow: workflowDetail });
          }
          refreshVisibleFolderForOutputFile(saved);
          refreshVisibleFolderForAutomationDetail(detail);
          return;
        }
      } catch (err) {
        // Ignore transient polling errors; next poll will retry.
      }
      state.timer = window.setTimeout(poll, 2500);
    };

    state.timer = window.setTimeout(poll, 1500);
  };

  const sendMessage = async (options = {}) => {
    const msg = String(options.message || inputEl?.value || '').trim();
    if (!msg) return;
    if (!options.message && inputEl) {
      inputEl.value = '';
    }
    appendMessage('user', msg);

    try {
      const requestPayload = {
        message: msg,
        workspace: workspace(),
        currentSourceId: normalizeSourceId(currentChatLocation().sourceId),
        currentFolderPath: normalizeFolderPath(currentChatLocation().rootPath),
        recipeId: String(options.recipeId || ''),
        copilotProfile,
        ...buildAnalysisPayload()
      };
      if (copilotContextPacket && typeof copilotContextPacket === 'object') {
        requestPayload.contextPacket = copilotContextPacket;
      }
      const res = await apiPost('/api/pro/ai/chat.php', requestPayload);
      lastRecipeDraft = {
        prompt: msg,
        meta: (res && typeof res.meta === 'object') ? res.meta : null
      };
      let assistantHandle = null;
      let assistantWorkflow = (res?.workflow && typeof res.workflow === 'object') ? { ...res.workflow } : null;
      if (assistantWorkflow && res?.job?.id) {
        assistantWorkflow.jobId = Number(res.job.id || 0);
        assistantWorkflow.pending = false;
        assistantWorkflow.confirmed = false;
        assistantWorkflow.queued = true;
        assistantWorkflow.running = false;
        assistantWorkflow.status = 'queued';
      }
      if (res?.assistant) {
        assistantHandle = appendMessage('assistant', String(res.assistant), { workflow: assistantWorkflow });
      } else {
        assistantHandle = appendMessage('assistant', 'No response text returned.', { workflow: assistantWorkflow });
      }
      refreshVisibleFolderForToolResult(res?.tool, res?.workspace);
      refreshVisibleFolderForWorkflowResult(res?.refresh, res?.workspace);
      if (res?.job?.id) {
        showToast(`AI job queued (#${res.job.id})`);
        watchJob(res.job.id, {
          messageHandle: assistantHandle,
          workflow: assistantWorkflow
        });
      }
      if (options.recipeId) {
        loadRecipes();
      }
    } catch (err) {
      appendMessage('assistant', `Error: ${err?.message || 'Request failed'}`);
    }
  };

  btn.addEventListener('click', open);
  closeEl?.addEventListener('click', close);
  useCurrentEl?.addEventListener('click', () => {
    setWorkspace(currentChatLocation());
    updateScopeSummary();
    inputEl?.focus();
  });
  toggleScopeEl?.addEventListener('click', () => {
    scopeExpanded = !scopeExpanded;
    syncCollapsedState();
  });
  saveRecipeEl?.addEventListener('click', saveRecipeDraft);
  refreshRecipesEl?.addEventListener('click', loadRecipes);
  toggleRecipesEl?.addEventListener('click', () => {
    recipesExpanded = !recipesExpanded;
    syncCollapsedState();
  });
  toggleTipsEl?.addEventListener('click', () => {
    tipsExpanded = !tipsExpanded;
    syncCollapsedState();
  });
  visionModeEl?.addEventListener('click', () => {
    if (!visionConfigured) return;
    analysisOverrides.vision = nextModeValue(analysisOverrides.vision);
    syncAnalysisControls();
  });
  ocrModeEl?.addEventListener('click', () => {
    analysisOverrides.ocr = nextModeValue(analysisOverrides.ocr);
    syncAnalysisControls();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', (e) => {
    if (overlay.style.display === 'none') return;
    if (e.key === 'Escape') close();
  });

  sendEl?.addEventListener('click', sendMessage);
  sourceEl?.addEventListener('input', updateScopeSummary);
  rootEl?.addEventListener('input', updateScopeSummary);
  inputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  updateScopeSummary();
  syncAnalysisControls();
  renderTips();
  loadRecipes();
  appendMessage('assistant', 'AI chat ready. Actions are ACL-scoped and audited.');

  return { open, close };
}

export async function initAiChat() {
  if (initialized) return;
  if (window.__FR_IS_PRO !== true) return;
  initialized = true;

  try {
    const cfg = await apiGet('/api/pro/ai/config/public.php');
    const settings = (cfg && cfg.settings && typeof cfg.settings === 'object') ? cfg.settings : {};
    if (!settings.chatEnabled) {
      return;
    }

    createChatUi(cfg);
  } catch (e) {
    // Non-Pro or disabled instances are expected to fail this request.
  }
}
