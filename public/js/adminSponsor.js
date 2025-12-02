// public/js/adminSponsor.js
import { t } from './i18n.js?v={{APP_QVER}}';
import { showToast } from './domUtils.js?v={{APP_QVER}}';

// Tiny "translate with fallback" helper, same as in adminPanel.js
const tf = (key, fallback) => {
  const v = t(key);
  return (v && v !== key) ? v : fallback;
};

const SPONSOR_GH  = 'https://github.com/sponsors/error311';
const SPONSOR_KOFI = 'https://ko-fi.com/error311';

/**
 * Initialize the Sponsor / Donations section inside the Admin Panel.
 * Safe to call multiple times; it no-ops after the first run.
 */
export function initAdminSponsorSection() {
  const container = document.getElementById('sponsorContent');
  if (!container) return;

  // Avoid double-wiring if initAdminSponsorSection gets called again
  if (container.__sponsorInited) return;
  container.__sponsorInited = true;

  container.innerHTML = `
    <div class="form-group" style="margin-bottom:12px;">
      <label for="sponsorGitHub">${tf("github_sponsors_url", "GitHub Sponsors URL")}:</label>
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
          ${tf("copy", "Copy")}
        </button>
        <a
          class="btn btn-outline-secondary"
          id="openSponsorGitHub"
          target="_blank"
          rel="noopener"
        >
          ${tf("open", "Open")}
        </a>
      </div>
    </div>

    <div class="form-group" style="margin-bottom:12px;">
      <label for="sponsorKoFi">${tf("ko_fi_url", "Ko-fi URL")}:</label>
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
          ${tf("copy", "Copy")}
        </button>
        <a
          class="btn btn-outline-secondary"
          id="openSponsorKoFi"
          target="_blank"
          rel="noopener"
        >
          ${tf("open", "Open")}
        </a>
      </div>
    </div>

    <small class="text-muted">
      ${tf("sponsor_note_fixed", "Please consider supporting ongoing development.")}
    </small>
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
      showToast(tf("copied", "Copied!"));
    } catch {
      showToast(tf("copy_failed", "Could not copy. Please copy manually."));
    }
  }

  if (copyGhBtn && ghInput) {
    copyGhBtn.addEventListener('click', () => copyToClipboardSafe(ghInput.value));
  }
  if (copyKfBtn && kfInput) {
    copyKfBtn.addEventListener('click', () => copyToClipboardSafe(kfInput.value));
  }
}