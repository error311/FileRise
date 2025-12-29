// public/js/adminSponsor.js
import { t } from './i18n.js?v={{APP_QVER}}';
import { showToast, escapeHTML } from './domUtils.js?v={{APP_QVER}}';

// Tiny "translate with fallback" helper, same as in adminPanel.js
const tfWith = (translateFn, key, fallback) => {
  const v = translateFn ? translateFn(key) : '';
  return (v && v !== key) ? v : fallback;
};
const tf = (key, fallback) => tfWith(t, key, fallback);

const SPONSOR_GH  = 'https://github.com/sponsors/error311';
const SPONSOR_KOFI = 'https://ko-fi.com/error311';
const DEFAULT_SUPPORTERS = [
  'Steve L',
  'Lean',
  'Phil D | AhNoobus',
  'Dmitri',
  'Stephan Nestler | DJKenzo',
  'David R',
  'Flip',
  'Andreas',
  'Noah Maceri',
  'Matthias S',
  'Emerson Beltrán',
  'shucking',
  'Sascha A.',
  'JBR0XN',
  'Blaž Pivk',
  'Rob Parker',
  'Aaron W.',
  'C-Fu',
  'peterchia'
];

/**
 * Initialize the Sponsor / Donations section inside the Admin Panel.
 * Safe to call multiple times; it no-ops after the first run.
 */
export function initAdminSponsorSection(opts = {}) {
  const container = opts.container || document.getElementById('sponsorContent');
  if (!container) return;

  const translate = typeof opts.t === 'function' ? opts.t : t;
  const tfLocal = typeof opts.tf === 'function'
    ? opts.tf
    : (key, fallback) => tfWith(translate, key, fallback);
  const toast = typeof opts.showToast === 'function' ? opts.showToast : showToast;

  const supporters = Array.isArray(opts.supporters) && opts.supporters.length
    ? opts.supporters
    : DEFAULT_SUPPORTERS;
  const isDark = document.body?.classList?.contains('dark-mode');
  const accent = '#e88a4a';
  const cardBg = isDark
    ? 'linear-gradient(135deg, #1f2028, #171822)'
    : 'linear-gradient(135deg, #fff7ee, #ffffff)';
  const cardBorder = isDark ? '1px solid #2f3240' : '1px solid #f1dec9';
  const chipBg = isDark ? 'rgba(255,255,255,0.08)' : '#f2f4ff';
  const chipBorder = isDark ? 'rgba(255,255,255,0.12)' : '#e1e7ff';

  // Avoid double-wiring if initAdminSponsorSection gets called again
  if (container.__sponsorInited) return;
  container.__sponsorInited = true;

  const chips = supporters.map(name => `
    <span
      class="badge badge-pill"
      style="
        display:inline-flex;
        align-items:center;
        padding:7px 12px;
        background:${chipBg};
        color:${isDark ? '#eef2ff' : '#2a355d'};
        border:${chipBorder};
        font-weight:600;
        letter-spacing:0.01em;
        box-shadow:${isDark ? '0 2px 8px rgba(0,0,0,0.25)' : '0 2px 8px rgba(0,0,0,0.06)'};
      "
    >
      ${escapeHTML(String(name))}
    </span>
  `).join('');

  container.innerHTML = `
    <div
      class="card"
      style="
        background:${cardBg};
        border:${cardBorder};
        padding:16px 18px;
        margin-bottom:16px;
        border-radius:12px;
        box-shadow:${isDark ? '0 12px 30px rgba(0,0,0,0.28)' : '0 12px 30px rgba(0,0,0,0.08)'};
      "
    >
      <div style="display:flex; align-items:flex-start; gap:10px; margin-bottom:12px;">
        <i class="material-icons" aria-hidden="true" style="color:${accent};">volunteer_activism</i>
        <div>
          <div style="font-weight:700; font-size:14px;">
            ${tfLocal("sponsor_thanks_title", "Thanks to our early supporters")}
          </div>
          <div class="text-muted" style="font-size:12px; margin-top:2px;">
            ${tfLocal("sponsor_thanks_subtitle", "Founders, early supporters, and FileRise Pro backers")}
          </div>
        </div>
      </div>
      <div class="d-flex flex-wrap" style="gap:10px; row-gap:10px; align-items:center;">
        ${chips}
      </div>
      <div class="text-muted" style="margin-top:10px; font-size:12px;">
        ${tfLocal("sponsor_thanks_anonymous", "...and the 60+ who wanted to stay anonymous")}
      </div>
    </div>

    <div
      class="card"
      style="
        background:${isDark ? 'linear-gradient(135deg, #1b1c24, #12131a)' : 'linear-gradient(135deg, #f4f7ff, #ffffff)'};
        border:${isDark ? '1px solid #2a2d3a' : '1px solid #dfe6ff'};
        padding:16px 18px;
        border-radius:12px;
        box-shadow:${isDark ? '0 8px 24px rgba(0,0,0,0.25)' : '0 10px 26px rgba(38,70,255,0.06)'};
      "
    >
      <div style="display:flex; align-items:flex-start; gap:10px; margin-bottom:14px;">
        <i class="material-icons" aria-hidden="true" style="color:${accent};">favorite</i>
        <div>
          <div style="font-weight:700; font-size:14px;">
            ${tfLocal("sponsor_support_title", "Support FileRise")}
          </div>
          <div class="text-muted" style="font-size:12px; margin-top:2px;">
            ${tfLocal("sponsor_support_subtitle", "Choose a platform below — every bit helps.")}
          </div>
        </div>
      </div>

      <div class="row" style="margin:0; gap:12px; flex-wrap:wrap;">
        <div class="col" style="min-width:280px; padding:0;">
          <div style="border:1px dashed ${isDark ? '#3a3d4f' : '#c9d5ff'}; border-radius:10px; padding:12px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
              <i class="material-icons" aria-hidden="true" style="color:${accent}; font-size:18px;">emoji_events</i>
              <span style="font-weight:600;">${tfLocal("github_sponsors_url", "GitHub Sponsors")}</span>
            </div>
            <div class="input-group">
              <input
                type="url"
                id="sponsorGitHub"
                class="form-control"
                value="${SPONSOR_GH}"
                readonly
                data-ignore-dirty="1"
              />
              <button type="button" id="copySponsorGitHub" class="btn btn-outline-primary">
                ${tfLocal("copy", "Copy")}
              </button>
              <a
                class="btn btn-outline-secondary"
                id="openSponsorGitHub"
                target="_blank"
                rel="noopener"
              >
                ${tfLocal("open", "Open")}
              </a>
            </div>
          </div>
        </div>

        <div class="col" style="min-width:280px; padding:0;">
          <div style="border:1px dashed ${isDark ? '#3a3d4f' : '#c9d5ff'}; border-radius:10px; padding:12px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
              <i class="material-icons" aria-hidden="true" style="color:${accent}; font-size:18px;">local_cafe</i>
              <span style="font-weight:600;">${tfLocal("ko_fi_url", "Ko-fi")}</span>
            </div>
            <div class="input-group">
              <input
                type="url"
                id="sponsorKoFi"
                class="form-control"
                value="${SPONSOR_KOFI}"
                readonly
                data-ignore-dirty="1"
              />
              <button type="button" id="copySponsorKoFi" class="btn btn-outline-primary">
                ${tfLocal("copy", "Copy")}
              </button>
              <a
                class="btn btn-outline-secondary"
                id="openSponsorKoFi"
                target="_blank"
                rel="noopener"
              >
                ${tfLocal("open", "Open")}
              </a>
            </div>
          </div>
        </div>
      </div>

      <small class="text-muted" style="display:block; margin-top:10px;">
        ${tfLocal("sponsor_note_fixed", "Please consider supporting ongoing development.")}
      </small>
    </div>
  `;

  const ghInput = document.getElementById('sponsorGitHub');
  const kfInput = document.getElementById('sponsorKoFi');
  const copyGhBtn = document.getElementById('copySponsorGitHub');
  const copyKfBtn = document.getElementById('copySponsorKoFi');
  const openGh     = document.getElementById('openSponsorGitHub');
  const openKf     = document.getElementById('openSponsorKoFi');

  if (openGh) openGh.href = SPONSOR_GH;
  if (openKf) openKf.href = SPONSOR_KOFI;

  async function copyToClipboardSafe(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      toast(tfLocal("copied", "Copied!"));
    } catch (e) {
      toast(tfLocal("copy_failed", "Could not copy. Please copy manually."));
    }
  }

  if (copyGhBtn && ghInput) {
    copyGhBtn.addEventListener('click', () => copyToClipboardSafe(ghInput.value));
  }
  if (copyKfBtn && kfInput) {
    copyKfBtn.addEventListener('click', () => copyToClipboardSafe(kfInput.value));
  }
}
