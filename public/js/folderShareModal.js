// js/folderShareModal.js
import { escapeHTML, showToast } from './domUtils.js?v={{APP_QVER}}';
import { t } from './i18n.js?v={{APP_QVER}}';
import { withBase } from './basePath.js?v={{APP_QVER}}';

let publicAiConfigPromise = null;

function ti(key, fallback) {
  const value = t(key);
  return value === key ? fallback : value;
}

async function loadPublicAiConfig() {
  if (window.__FR_IS_PRO !== true) {
    return { enabled: false };
  }
  if (publicAiConfigPromise) {
    return publicAiConfigPromise;
  }
  publicAiConfigPromise = fetch(withBase('/api/pro/ai/config/public.php'), {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json'
    }
  })
    .then(async (res) => {
      const raw = await res.text();
      let data = {};
      try {
        data = JSON.parse(raw || '{}');
      } catch (e) {
        data = {};
      }
      const settings = (data && data.settings && typeof data.settings === 'object') ? data.settings : {};
      const providers = Array.isArray(settings.providers) ? settings.providers : [];
      return {
        enabled: !!settings.chatEnabled && providers.length > 0
      };
    })
    .catch(() => ({ enabled: false }));
  return publicAiConfigPromise;
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "absolute";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (e) {
    ok = false;
  } finally {
    ta.remove();
  }
  return ok;
}

function openFolderShareResultModal(link) {
  const existing = document.getElementById("folderShareResultModal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "folderShareResultModal";
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-content share-modal-content" style="max-width:560px;">
      <div class="modal-header">
        <h3>${t("share_link_generated")}</h3>
        <span id="closeFolderShareResultModal" title="${t("close")}" class="close-image-modal">&times;</span>
      </div>
      <div class="modal-body">
        <p style="margin-bottom:6px;">${t("shareable_link")}</p>
        <input id="folderShareResultLinkInput" type="text" readonly style="width:100%;padding:6px;" />
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
          <button id="copyFolderShareResultBtn" class="btn btn-primary">${t("copy_link")}</button>
          <button id="closeFolderShareResultBtn" class="btn btn-secondary">${t("close")}</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.style.display = "block";

  const inputEl = document.getElementById("folderShareResultLinkInput");
  if (inputEl) {
    inputEl.value = link;
    inputEl.focus();
    inputEl.select();
  }

  const close = () => modal.remove();
  const closeX = document.getElementById("closeFolderShareResultModal");
  const closeBtn = document.getElementById("closeFolderShareResultBtn");
  const copyBtn = document.getElementById("copyFolderShareResultBtn");

  if (closeX) closeX.addEventListener("click", close);
  if (closeBtn) closeBtn.addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });

  if (copyBtn && inputEl) {
    copyBtn.addEventListener("click", async () => {
      try {
        const ok = await copyTextToClipboard(inputEl.value);
        showToast(ok ? t("link_copied") : t("unknown_error"));
      } catch (e) {
        showToast(t("unknown_error"));
      }
    });
  }
}

export function openFolderShareModal(folder) {
  // Remove any existing modal
  const existing = document.getElementById("folderShareModal");
  if (existing) existing.remove();

  // Build modal
  const modal = document.createElement("div");
  modal.id = "folderShareModal";
  modal.classList.add("modal");
  modal.innerHTML = `
    <div class="modal-content share-modal-content">
      <div class="modal-header">
        <h3>${t("share_folder_and_request")}: ${escapeHTML(folder)}</h3>
        <span id="closeFolderShareModal" title="${t("close")}" class="close-image-modal">&times;</span>
      </div>
      <div class="modal-body share-modal-body">
        <p class="share-modal-helper">${t("share_folder_and_request_helper")}</p>

        <div class="share-modal-section">
          <p class="share-section-title">${t("share_mode_heading")}</p>
          <div class="share-mode-toggle" role="group" aria-label="${t("share_mode_heading")}">
            <button type="button" id="folderShareBrowseModeBtn" class="share-mode-btn is-active">
              <span class="share-mode-btn-title">${t("share_mode_browse_label")}</span>
              <span class="share-mode-btn-desc">${t("share_mode_browse_desc")}</span>
            </button>
            <button type="button" id="folderShareRequestModeBtn" class="share-mode-btn">
              <span class="share-mode-btn-title">${t("share_mode_request_label")}</span>
              <span class="share-mode-btn-desc">${t("share_mode_request_desc")}</span>
            </button>
          </div>
          <p id="folderShareModeNotice" class="share-mode-notice"></p>
          <input type="checkbox" id="folderShareDropMode" hidden />
        </div>

        <div class="share-modal-section">
          <p class="share-section-title">${t("share_link_settings")}</p>
          <label class="share-field-label" for="folderShareExpiration">${t("set_expiration")}</label>
          <select id="folderShareExpiration" class="share-field-input">
            <option value="30">30 ${t("minutes")}</option>
            <option value="60" selected>60 ${t("minutes")}</option>
            <option value="120">120 ${t("minutes")}</option>
            <option value="180">180 ${t("minutes")}</option>
            <option value="240">240 ${t("minutes")}</option>
            <option value="1440">1 ${t("day")}</option>
            <option value="custom">${t("custom")}&hellip;</option>
          </select>

          <div id="customFolderExpirationContainer" class="share-custom-expiration" style="display:none;">
            <label for="customFolderExpirationValue">${t("duration")}:</label>
            <input type="number" id="customFolderExpirationValue" min="1" value="1" />
            <select id="customFolderExpirationUnit">
              <option value="seconds">${t("seconds")}</option>
              <option value="minutes" selected>${t("minutes")}</option>
              <option value="hours">${t("hours")}</option>
              <option value="days">${t("days")}</option>
            </select>
            <p class="share-warning">
              ${t("custom_duration_warning")}
            </p>
          </div>

          <label class="share-field-label" for="folderSharePassword">${t("password_optional")}</label>
          <input
            type="text"
            id="folderSharePassword"
            placeholder="${t("enter_password")}"
            class="share-field-input"
          />
        </div>

        <div class="share-modal-section">
          <p class="share-section-title">${t("share_upload_settings")}</p>
          <label class="share-check">
            <input type="checkbox" id="folderShareAllowUpload" />
            <span>${t("allow_uploads")}</span>
          </label>
          <label class="share-check">
            <input type="checkbox" id="folderShareAllowSubfolders" />
            <span>${t("allow_subfolders")}</span>
          </label>
          <div class="share-check-helper">${t("allow_subfolders_helper")}</div>
        </div>

        <div class="share-modal-section" id="folderShareAiSection" hidden>
          <p class="share-section-title">${ti("share_ai_heading", "AI Assistant")}</p>
          <label class="share-check">
            <input type="checkbox" id="folderShareAiEnabled" checked />
            <span>${ti("share_ai_enabled_label", "Enable AI Assistant for this share")}</span>
          </label>
          <div class="share-check-helper">${ti("share_ai_enabled_help", "Allow public share viewers to use the read-only AI assistant for visible files in this share.")}</div>
        </div>

        <button
          id="generateFolderShareLinkBtn"
          class="btn btn-primary"
        >
          ${t("generate_share_link")}
        </button>

      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.style.display = "block";

  // Close
  document.getElementById("closeFolderShareModal")
    .addEventListener("click", () => modal.remove());

  // Toggle custom inputs
  document.getElementById("folderShareExpiration")
    .addEventListener("change", e => {
      document.getElementById("customFolderExpirationContainer")
        .style.display = e.target.value === "custom" ? "block" : "none";
    });

  const allowUploadEl = document.getElementById("folderShareAllowUpload");
  const dropModeEl = document.getElementById("folderShareDropMode");
  const browseModeBtn = document.getElementById("folderShareBrowseModeBtn");
  const requestModeBtn = document.getElementById("folderShareRequestModeBtn");
  const modeNoticeEl = document.getElementById("folderShareModeNotice");
  const aiSectionEl = document.getElementById("folderShareAiSection");
  const aiEnabledEl = document.getElementById("folderShareAiEnabled");

  const syncModeVisuals = () => {
    if (!dropModeEl) return;
    const dropEnabled = !!dropModeEl.checked;
    if (browseModeBtn) browseModeBtn.classList.toggle("is-active", !dropEnabled);
    if (requestModeBtn) requestModeBtn.classList.toggle("is-active", dropEnabled);
    if (modeNoticeEl) {
      modeNoticeEl.textContent = dropEnabled
        ? t("share_mode_notice_request")
        : t("share_mode_notice_browse");
    }
  };

  const syncDropMode = () => {
    if (!allowUploadEl || !dropModeEl) return;
    if (dropModeEl.checked) {
      allowUploadEl.checked = true;
      allowUploadEl.disabled = true;
    } else {
      allowUploadEl.disabled = false;
    }
    syncModeVisuals();
  };

  if (allowUploadEl && dropModeEl) {
    if (browseModeBtn) {
      browseModeBtn.addEventListener("click", () => {
        dropModeEl.checked = false;
        syncDropMode();
      });
    }
    if (requestModeBtn) {
      requestModeBtn.addEventListener("click", () => {
        dropModeEl.checked = true;
        syncDropMode();
      });
    }
    allowUploadEl.addEventListener("change", () => {
      if (!allowUploadEl.checked && dropModeEl.checked) {
        dropModeEl.checked = false;
      }
      syncDropMode();
    });
    syncDropMode();
  }

  loadPublicAiConfig().then((cfg) => {
    if (!aiSectionEl || !aiEnabledEl) return;
    aiSectionEl.hidden = !cfg.enabled;
    aiEnabledEl.checked = !!cfg.enabled;
  });

  // Generate link
  document.getElementById("generateFolderShareLinkBtn")
    .addEventListener("click", () => {
      const sel = document.getElementById("folderShareExpiration");
      let value, unit;
      if (sel.value === "custom") {
        value = parseInt(document.getElementById("customFolderExpirationValue").value, 10);
        unit  = document.getElementById("customFolderExpirationUnit").value;
      } else {
        value = parseInt(sel.value, 10);
        unit  = "minutes";
      }

      const password    = document.getElementById("folderSharePassword").value;
      const allowUpload = document.getElementById("folderShareAllowUpload").checked ? 1 : 0;
      const allowSubfolders = document.getElementById("folderShareAllowSubfolders").checked ? 1 : 0;
      const dropMode = document.getElementById("folderShareDropMode").checked ? 1 : 0;
      const csrfToken   = document.querySelector('meta[name="csrf-token"]').getAttribute("content");
      if (!csrfToken) {
        showToast(t("csrf_error"));
        return;
      }

      const payload = {
        folder,
        expirationValue: value,
        expirationUnit: unit,
        password,
        allowUpload,
        allowSubfolders,
        mode: dropMode ? "drop" : "browse",
        fileDrop: dropMode
      };
      if (aiSectionEl && !aiSectionEl.hidden && aiEnabledEl) {
        payload.aiEnabled = aiEnabledEl.checked ? 1 : 0;
      }

      fetch("/api/folder/createShareFolderLink.php", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken
        },
        body: JSON.stringify(payload)
      })
      .then(r => r.json())
      .then(data => {
        if (data.token && data.link) {
          openFolderShareResultModal(data.link);
        } else {
          showToast(t("error_generating_share_link") + ": " + (data.error||t("unknown_error")));
        }
      })
      .catch(err => {
        console.error(err);
        showToast(t("error_generating_share_link") + ": " + t("unknown_error"));
      });
    });
}
