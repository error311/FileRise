import { showToast, toggleVisibility, attachEnterKeyListener } from './domUtils.js?v={{APP_QVER}}';
import { sendRequest } from './networkUtils.js?v={{APP_QVER}}';
import { t, applyTranslations, setLocale } from './i18n.js?v={{APP_QVER}}';
import { loadAdminConfigFunc, updateAuthenticatedUI } from './auth.js?v={{APP_QVER}}';

let lastLoginData = null;
export function setLastLoginData(data) {
  lastLoginData = data;
  // expose to auth.js so it can tell form-login vs basic/oidc
  //window.__lastLoginData = data;
}

export function openTOTPLoginModal() {
  let totpLoginModal = document.getElementById("totpLoginModal");
  const isDarkMode = document.body.classList.contains("dark-mode");
  const modalBg = isDarkMode ? "#2c2c2c" : "#fff";
  const textColor = isDarkMode ? "#e0e0e0" : "#000";

  if (!totpLoginModal) {
    totpLoginModal = document.createElement("div");
    totpLoginModal.id = "totpLoginModal";
    totpLoginModal.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 100vw; height: 100vh;
      background-color: rgba(0,0,0,0.5);
      display: flex; justify-content: center; align-items: center;
      z-index: 3200;
    `;
    totpLoginModal.innerHTML = `
      <div style="background: ${modalBg}; padding:20px; border-radius:8px; text-align:center; position:relative; color:${textColor};">
        <span id="closeTOTPLoginModal" class="editor-close-btn">&times;</span>
        <div id="totpSection">
          <h3>${t("enter_totp_code")}</h3>
          <input type="text" id="totpLoginInput" maxlength="6"
                 style="font-size:24px; text-align:center; width:100%; padding:10px;"
                 placeholder="6-digit code" />
        </div>
        <a href="#" id="toggleRecovery" style="display:block; margin-top:10px; font-size:14px;">${t("use_recovery_code_instead")}</a>
        <div id="recoverySection" style="display:none; margin-top:10px;">
          <h3>${t("enter_recovery_code")}</h3>
          <input type="text" id="recoveryInput"
                 style="font-size:24px; text-align:center; width:100%; padding:10px;"
                 placeholder="Recovery code" />
          <button type="button" id="submitRecovery" class="btn btn-secondary" style="margin-top:10px;">${t("submit_recovery_code")}</button>
        </div>
      </div>
    `;
    document.body.appendChild(totpLoginModal);

    // Close button
    document.getElementById("closeTOTPLoginModal").addEventListener("click", () => {
      totpLoginModal.style.display = "none";
    });

    // Toggle between TOTP and Recovery
    document.getElementById("toggleRecovery").addEventListener("click", function (e) {
      e.preventDefault();
      const totpSection = document.getElementById("totpSection");
      const recoverySection = document.getElementById("recoverySection");
      const toggleLink = this;
      if (recoverySection.style.display === "none") {
        totpSection.style.display = "none";
        recoverySection.style.display = "block";
        toggleLink.textContent = t("use_totp_code_instead");
      } else {
        recoverySection.style.display = "none";
        totpSection.style.display = "block";
        toggleLink.textContent = t("use_recovery_code_instead");
      }
    });

    // Recovery submission
    document.getElementById("submitRecovery").addEventListener("click", () => {
      const recoveryCode = document.getElementById("recoveryInput").value.trim();
      if (!recoveryCode) {
        showToast(t("please_enter_recovery_code"));
        return;
      }
      fetch("/api/totp_recover.php", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": window.csrfToken
        },
        body: JSON.stringify({ recovery_code: recoveryCode })
      })
        .then(res => res.json())
        .then(json => {
          if (json.status === "ok") {
            window.location.href = "/index.html";
          } else {
            showToast(json.message || t("recovery_code_verification_failed"));
          }
        })
        .catch(() => {
          showToast(t("error_verifying_recovery_code"));
        });
    });

    // TOTP submission
    const totpInput = document.getElementById("totpLoginInput");
    totpInput.focus();
    totpInput.addEventListener("input", async function () {
      const code = this.value.trim();
      if (code.length !== 6) return;

      const tokenRes = await fetch("/api/auth/token.php", { credentials: "include" });
      if (!tokenRes.ok) {
        showToast(t("totp_verification_failed"));
        return;
      }
      window.csrfToken = (await tokenRes.json()).csrf_token;

      const res = await fetch("/api/totp_verify.php", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": window.csrfToken
        },
        body: JSON.stringify({ totp_code: code })
      });

      if (res.ok) {
        const json = await res.json();
        if (json.status === "ok") {
          window.location.href = "/index.html";
          return;
        }
        showToast(json.message || t("totp_verification_failed"));
      } else {
        showToast(t("totp_verification_failed"));
      }
      this.value = "";
      totpLoginModal.style.display = "flex";
      this.focus();
    });
  } else {
    // Re-open existing modal
    totpLoginModal.style.display = "flex";
    const totpInput = document.getElementById("totpLoginInput");
    totpInput.value = "";
    totpInput.style.display = "block";
    totpInput.focus();
    document.getElementById("recoverySection").style.display = "none";
  }
}

/**
 * Fetch current user info (username, profile_picture, totp_enabled)
 */
async function fetchCurrentUser() {
  try {
    const res = await fetch('/api/profile/getCurrentUser.php', {
      credentials: 'include'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn('fetchCurrentUser failed:', e);
    return {};
  }
}

/**
 * Normalize any profile‐picture URL:
 *  - strip leading colons
 *  - ensure exactly one leading slash
 */
function normalizePicUrl(raw) {
  if (!raw) return '';
  // take only what's after the last colon
  const parts = raw.split(':');
  let pic = parts[parts.length - 1];
  // strip any stray colons
  pic = pic.replace(/^:+/, '');
  // ensure leading slash
  if (pic && !pic.startsWith('/')) pic = '/' + pic;
  return pic;
}

export async function openUserPanel() {
  // 1) load data
  const { username = 'User', profile_picture = '', totp_enabled = false } = await fetchCurrentUser();
  const raw = profile_picture;
  const picUrl = normalizePicUrl(raw) || '/assets/default-avatar.png';

  // 2) dark‐mode helpers
  const isDark = document.body.classList.contains('dark-mode');
  const overlayBg = isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.3)';
  const contentStyle = `
    background: ${isDark ? '#2c2c2c' : '#fff'};
    color:      ${isDark ? '#e0e0e0' : '#000'};
    padding: 20px;
    max-width: 600px; width:90%;
    overflow-y: auto; max-height: 600px;
    border: ${isDark ? '1px solid #444' : '1px solid #ccc'};
    box-sizing: border-box;
    scrollbar-width: none;
    -ms-overflow-style: none;
  `;

  // 3) create or reuse modal
  let modal = document.getElementById('userPanelModal');
  if (!modal) {
    // overlay
    modal = document.createElement('div');
    modal.id = 'userPanelModal';
    Object.assign(modal.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      background: overlayBg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '1000',
    });

    // content container
    const content = document.createElement('div');
    content.className = 'modal-content';
    content.style.cssText = contentStyle;

    // close button
    const closeBtn = document.createElement('span');
    closeBtn.id = 'closeUserPanel';
    closeBtn.className = 'editor-close-btn';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => modal.style.display = 'none');
    content.appendChild(closeBtn);

    // avatar + picker
    const avatarWrapper = document.createElement('div');
    avatarWrapper.style.cssText = 'text-align:center; margin-bottom:20px;';
    const avatarInner = document.createElement('div');
    avatarInner.style.cssText = 'position:relative; width:80px; height:80px; margin:0 auto;';
    const img = document.createElement('img');
    img.id = 'profilePicPreview';
    img.src = picUrl;
    img.alt = 'Profile Picture';
    img.style.cssText = 'width:100%; height:100%; border-radius:50%; object-fit:cover;';
    avatarInner.appendChild(img);
    const label = document.createElement('label');
    label.htmlFor = 'profilePicInput';
    label.style.cssText = `
      position:absolute; bottom:0; right:0;
      width:24px; height:24px;
      background:rgba(0,0,0,0.6);
      border-radius:50%; display:flex;
      align-items:center; justify-content:center;
      cursor:pointer;
    `;
    const editIcon = document.createElement('i');
    editIcon.className = 'material-icons';
    editIcon.style.cssText = 'color:#fff; font-size:16px;';
    editIcon.textContent = 'edit';
    label.appendChild(editIcon);
    avatarInner.appendChild(label);
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'profilePicInput';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    avatarInner.appendChild(fileInput);
    avatarWrapper.appendChild(avatarInner);
    content.appendChild(avatarWrapper);

    // title
    const title = document.createElement('h3');
    title.style.cssText = 'text-align:center; margin-bottom:20px;';
    title.textContent = `${t('user_panel')} (${username})`;
    content.appendChild(title);

    // change password btn
    const pwdBtn = document.createElement('button');
    pwdBtn.id = 'openChangePasswordModalBtn';
    pwdBtn.className = 'btn btn-primary';
    pwdBtn.style.marginBottom = '15px';
    pwdBtn.textContent = t('change_password');
    pwdBtn.addEventListener('click', () => {
      document.getElementById('changePasswordModal').style.display = 'block';
    });
    content.appendChild(pwdBtn);

    // TOTP fieldset
    const totpFs = document.createElement('fieldset');
    totpFs.style.marginBottom = '15px';
    const totpLegend = document.createElement('legend');
    totpLegend.textContent = t('totp_settings');
    totpFs.appendChild(totpLegend);
    const totpLabel = document.createElement('label');
    totpLabel.style.cursor = 'pointer';
    const totpCb = document.createElement('input');
    totpCb.type = 'checkbox';
    totpCb.id = 'userTOTPEnabled';
    totpCb.style.verticalAlign = 'middle';
    totpCb.checked = totp_enabled;
    totpCb.addEventListener('change', async function () {
      const resp = await fetch('/api/updateUserPanel.php', {
        method: 'POST', credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': window.csrfToken
        },
        body: JSON.stringify({ totp_enabled: this.checked })
      });
      const js = await resp.json();
      if (!js.success) showToast(js.error || t('error_updating_totp_setting'));
      else if (this.checked) openTOTPModal();
    });
    totpLabel.appendChild(totpCb);
    totpLabel.append(` ${t('enable_totp')}`);
    totpFs.appendChild(totpLabel);
    content.appendChild(totpFs);

    // language fieldset
    const langFs = document.createElement('fieldset');
    langFs.style.marginBottom = '15px';
    const langLegend = document.createElement('legend');
    langLegend.textContent = t('language');
    langFs.appendChild(langLegend);
    const langSel = document.createElement('select');
    langSel.id = 'languageSelector';
    langSel.className = 'form-select';
    const languages = [
      { code: 'en',    labelKey: 'english',             fallback: 'English' },
      { code: 'es',    labelKey: 'spanish',             fallback: 'Español' },
      { code: 'fr',    labelKey: 'french',              fallback: 'Français' },
      { code: 'de',    labelKey: 'german',              fallback: 'Deutsch' },
      { code: 'zh-CN', labelKey: 'chinese_simplified',  fallback: '简体中文' },
    ];
    
    languages.forEach(({ code, labelKey, fallback }) => {
      const opt = document.createElement('option');
      opt.value = code;
      // use i18n if available, otherwise fallback
      opt.textContent = (typeof t === 'function' ? t(labelKey) : '') || fallback;
      langSel.appendChild(opt);
    });
    langSel.value = localStorage.getItem('language') || 'en';
    langSel.addEventListener('change', function () {
      localStorage.setItem('language', this.value);
      setLocale(this.value);
      applyTranslations();
    });
    langFs.appendChild(langSel);
    content.appendChild(langFs);

        // --- Display fieldset: strip + inline folder rows ---
        const dispFs = document.createElement('fieldset');
        dispFs.style.marginBottom = '15px';
    
        const dispLegend = document.createElement('legend');
        dispLegend.textContent = t('display');
        dispFs.appendChild(dispLegend);
    
        // 1) Show folder strip above list
        const stripLabel = document.createElement('label');
        stripLabel.style.cursor = 'pointer';
        stripLabel.style.display = 'block';
        stripLabel.style.marginBottom = '4px';
    
        const stripCb = document.createElement('input');
        stripCb.type = 'checkbox';
        stripCb.id = 'showFoldersInList';
        stripCb.style.verticalAlign = 'middle';
    
        {
          const storedStrip = localStorage.getItem('showFoldersInList');
          stripCb.checked = storedStrip === null ? false : storedStrip === 'true';
        }
    
        stripLabel.appendChild(stripCb);
        stripLabel.append(` ${t('show_folders_above_files')}`);
        dispFs.appendChild(stripLabel);
    
        // 2) Show inline folder rows above files in table view
        const inlineLabel = document.createElement('label');
        inlineLabel.style.cursor = 'pointer';
        inlineLabel.style.display = 'block';
    
        const inlineCb = document.createElement('input');
        inlineCb.type = 'checkbox';
        inlineCb.id = 'showInlineFolders';
        inlineCb.style.verticalAlign = 'middle';
    
        {
          const storedInline = localStorage.getItem('showInlineFolders');
          inlineCb.checked = storedInline === null ? true : storedInline === 'true';
        }
    
        inlineLabel.appendChild(inlineCb);
        inlineLabel.append(` ${t('show_inline_folders') || 'Show folders inline (above files)'}`);
        dispFs.appendChild(inlineLabel);
    
        // 3) Hide header zoom controls
        const zoomLabel = document.createElement('label');
        zoomLabel.style.cursor = 'pointer';
        zoomLabel.style.display = 'block';
        zoomLabel.style.marginTop = '4px';
    
        const zoomCb = document.createElement('input');
        zoomCb.type = 'checkbox';
        zoomCb.id = 'hideHeaderZoomControls';
        zoomCb.style.verticalAlign = 'middle';
    
        {
          const storedZoom = localStorage.getItem('hideZoomControls');
          zoomCb.checked = storedZoom === 'true';
        }
    
        zoomLabel.appendChild(zoomCb);
        zoomLabel.append(` ${t('hide_header_zoom_controls') || 'Hide zoom controls in header'}`);
        dispFs.appendChild(zoomLabel);
    
        content.appendChild(dispFs);
    
        // Handlers: toggle + refresh list
        stripCb.addEventListener('change', () => {
          window.showFoldersInList = stripCb.checked;
          localStorage.setItem('showFoldersInList', stripCb.checked);
          if (typeof window.loadFileList === 'function') {
            window.loadFileList(window.currentFolder || 'root');
          }
        });
    
        inlineCb.addEventListener('change', () => {
          window.showInlineFolders = inlineCb.checked;
          localStorage.setItem('showInlineFolders', inlineCb.checked);
          if (typeof window.loadFileList === 'function') {
            window.loadFileList(window.currentFolder || 'root');
          }
        });
    
        // NEW: zoom hide/show handler
        zoomCb.addEventListener('change', () => {
          const hideZoom = zoomCb.checked;
          localStorage.setItem('hideZoomControls', hideZoom ? 'true' : 'false');
    
          const zoomWrap = document.querySelector('.header-zoom-controls');
          if (!zoomWrap) return;
    
          if (hideZoom) {
            zoomWrap.style.display = 'none';
            zoomWrap.setAttribute('aria-hidden', 'true');
          } else {
            zoomWrap.style.display = 'flex';
            zoomWrap.removeAttribute('aria-hidden');
          }
        });

    inlineCb.addEventListener('change', () => {
      window.showInlineFolders = inlineCb.checked;
      localStorage.setItem('showInlineFolders', inlineCb.checked);
      if (typeof window.loadFileList === 'function') {
        window.loadFileList(window.currentFolder || 'root');
      }
    });

    // wire up image‐input change
    fileInput.addEventListener('change', async function () {
      const f = this.files[0];
      if (!f) return;
      // preview immediately
      // #nosec
      img.src = URL.createObjectURL(f);
      const blobUrl = URL.createObjectURL(f);
      // use setAttribute + encodeURI to avoid “DOM text reinterpreted as HTML” alerts
      img.setAttribute('src', encodeURI(blobUrl));
      // upload
      const fd = new FormData();
      fd.append('profile_picture', f);
      try {
        const res = await fetch('/api/profile/uploadPicture.php', {
          method: 'POST', credentials: 'include',
          headers: { 'X-CSRF-Token': window.csrfToken },
          body: fd
        });
        const text = await res.text();
        const js = JSON.parse(text || '{}');
        if (!res.ok) {
          showToast(js.error || t('error_updating_picture'));
          return;
        }
        const newUrl = normalizePicUrl(js.url);
        img.src = newUrl;
        localStorage.setItem('profilePicUrl', newUrl);
        updateAuthenticatedUI(window.__lastAuthData || {});
        showToast(t('profile_picture_updated'));
      } catch (e) {
        console.error(e);
        showToast(t('error_updating_picture'));
      }
    });

    // finalize
    modal.appendChild(content);
    document.body.appendChild(modal);
  } else {
    // reuse on reopen
    Object.assign(modal.style, { background: overlayBg });
    const content = modal.querySelector('.modal-content');
    content.style.cssText = contentStyle;
    modal.querySelector('#profilePicPreview').src = picUrl || '/assets/default-avatar.png';
    modal.querySelector('#userTOTPEnabled').checked = totp_enabled;
    modal.querySelector('#languageSelector').value = localStorage.getItem('language') || 'en';
    modal.querySelector('h3').textContent = `${t('user_panel')} (${username})`;

    // sync display toggles from localStorage
    const stripCb = modal.querySelector('#showFoldersInList');
    const inlineCb = modal.querySelector('#showInlineFolders');
    if (stripCb) {
      const storedStrip = localStorage.getItem('showFoldersInList');
      stripCb.checked = storedStrip === null ? false : storedStrip === 'true';
    }
    if (inlineCb) {
      const storedInline = localStorage.getItem('showInlineFolders');
      inlineCb.checked = storedInline === null ? true : storedInline === 'true';
    }
  }

  // show
  modal.style.display = 'flex';
}

function showRecoveryCodeModal(recoveryCode) {
  const recoveryModal = document.createElement("div");
  recoveryModal.id = "recoveryModal";
  recoveryModal.style.cssText = `
    position: fixed;
    top: 0; left: 0;
    width: 100vw; height: 100vh;
    background-color: rgba(0,0,0,0.3);
    display: flex; justify-content: center; align-items: center;
    z-index: 3200;
  `;
  recoveryModal.innerHTML = `
    <div style="background:#fff; color:#000; padding:20px; max-width:400px; width:90%; border-radius:8px; text-align:center;">
      <h3>${t("your_recovery_code")}</h3>
      <p>${t("please_save_recovery_code")}</p>
      <code style="display:block; margin:10px 0; font-size:20px;">${recoveryCode}</code>
      <button type="button" id="closeRecoveryModal" class="btn btn-primary">${t("ok")}</button>
    </div>
  `;
  document.body.appendChild(recoveryModal);
  document.getElementById("closeRecoveryModal").addEventListener("click", () => {
    recoveryModal.remove();
  });
}

export function openTOTPModal() {
  let totpModal = document.getElementById("totpModal");
  const isDarkMode = document.body.classList.contains("dark-mode");
  const overlayBackground = isDarkMode ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.3)";
  const modalContentStyles = `
    background: ${isDarkMode ? "#2c2c2c" : "#fff"};
    color: ${isDarkMode ? "#e0e0e0" : "#000"};
    padding: 20px; max-width:400px; width:90%; border-radius:8px; position:relative;
  `;
  if (!totpModal) {
    totpModal = document.createElement("div");
    totpModal.id = "totpModal";
    totpModal.style.cssText = `
      position: fixed; top:0; left:0; width:100vw; height:100vh;
      background-color:${overlayBackground}; display:flex; justify-content:center; align-items:center;
      z-index:3100;
    `;
    totpModal.innerHTML = `
      <div class="modal-content" style="${modalContentStyles}">
        <span id="closeTOTPModal" class="editor-close-btn">&times;</span>
        <h3>${t("totp_setup")}</h3>
        <p>${t("scan_qr_code")}</p>
        <img id="totpQRCodeImage" src="" alt="TOTP QR Code" style="max-width:100%; height:auto; display:block; margin:0 auto;" />
        <br/>
        <p>${t("enter_totp_confirmation")}</p>
        <input type="text" id="totpConfirmInput" maxlength="6" style="font-size:24px; text-align:center; width:100%; padding:10px;" placeholder="6-digit code" />
        <br/><br/>
        <button type="button" id="confirmTOTPBtn" class="btn btn-primary">${t("confirm")}</button>
      </div>
    `;
    document.body.appendChild(totpModal);
    loadTOTPQRCode();
    document.getElementById("closeTOTPModal").addEventListener("click", () => closeTOTPModal(true));
    document.getElementById("confirmTOTPBtn").addEventListener("click", async function () {
      const code = document.getElementById("totpConfirmInput").value.trim();
      if (code.length !== 6) { showToast(t("please_enter_valid_code")); return; }
      const tokenRes = await fetch("/api/auth/token.php", { credentials: "include" });
      if (!tokenRes.ok) { showToast(t("error_verifying_totp_code")); return; }
      window.csrfToken = (await tokenRes.json()).csrf_token;
      const verifyRes = await fetch("/api/totp_verify.php", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": window.csrfToken },
        body: JSON.stringify({ totp_code: code })
      });
      if (!verifyRes.ok) { showToast(t("totp_verification_failed")); return; }
      const result = await verifyRes.json();
      if (result.status !== "ok") { showToast(result.message || t("totp_verification_failed")); return; }
      showToast(t("totp_enabled_successfully"));
      const saveRes = await fetch("/api/totp_saveCode.php", {
        method: "POST", credentials: "include", headers: { "X-CSRF-Token": window.csrfToken }
      });
      if (!saveRes.ok) { showToast(t("error_generating_recovery_code")); closeTOTPModal(false); return; }
      const data = await saveRes.json();
      if (data.status === "ok" && data.recoveryCode) showRecoveryCodeModal(data.recoveryCode);
      else showToast(t("error_generating_recovery_code") + ": " + (data.message || t("unknown_error")));
      closeTOTPModal(false);
    });

    // Focus the input and attach enter key listener
    const totpConfirmInput = document.getElementById("totpConfirmInput");
    if (totpConfirmInput) {
      setTimeout(() => {
        const totpConfirmInput = document.getElementById("totpConfirmInput");
        if (totpConfirmInput) totpConfirmInput.focus();
      }, 100);
    }
    attachEnterKeyListener("totpModal", "confirmTOTPBtn");
  } else {
    totpModal.style.display = "flex";
    totpModal.style.backgroundColor = overlayBackground;
    const modalContent = totpModal.querySelector(".modal-content");
    modalContent.style.background = isDarkMode ? "#2c2c2c" : "#fff";
    modalContent.style.color = isDarkMode ? "#e0e0e0" : "#000";
    modalContent.style.border = isDarkMode ? "1px solid #444" : "1px solid #ccc";
    loadTOTPQRCode();
    const totpInput = document.getElementById("totpConfirmInput");
    if (totpInput) {
      totpInput.value = "";
      setTimeout(() => totpInput.focus(), 100);
    }
    attachEnterKeyListener("totpModal", "confirmTOTPBtn");
  }
}

function loadTOTPQRCode() {
  fetch("/api/totp_setup.php", {
    method: "GET",
    credentials: "include",
    headers: { "X-CSRF-Token": window.csrfToken }
  })
    .then(res => {
      if (!res.ok) throw new Error("Failed to fetch QR code: " + res.status);
      return res.blob();
    })
    .then(blob => {
      const url = URL.createObjectURL(blob);
      document.getElementById("totpQRCodeImage").src = url;
    })
    .catch(err => {
      console.error(err);
      showToast(t("error_loading_qr_code"));
    });
}

export function closeTOTPModal(disable = true) {
  const totpModal = document.getElementById("totpModal");
  if (totpModal) totpModal.style.display = "none";
  if (disable) {
    const totpCheckbox = document.getElementById("userTOTPEnabled");
    if (totpCheckbox) {
      totpCheckbox.checked = false;
      localStorage.setItem("userTOTPEnabled", "false");
    }
    fetch("/api/totp_disable.php", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": window.csrfToken
      }
    })
      .then(r => r.json())
      .then(result => {
        if (!result.success) showToast(t("error_disabling_totp_setting") + ": " + result.error);
      })
      .catch(() => showToast(t("error_disabling_totp_setting")));
  }
}

export function openApiModal() {
  let apiModal = document.getElementById("apiModal");
  if (!apiModal) {
    // create the container exactly as you do now inside openUserPanel
    apiModal = document.createElement("div");
    apiModal.id = "apiModal";
    apiModal.style.cssText = `
      position: fixed; top:0; left:0; width:100vw; height:100vh;
      background: rgba(0,0,0,0.8); z-index: 4000; display:none;
      align-items: center; justify-content: center;
    `;
    apiModal.innerHTML = `
      <div style="position:relative; width:90vw; height:90vh; background:#fff; border-radius:8px; overflow:hidden;">
        <div class="editor-close-btn" id="closeApiModal">&times;</div>
        <iframe src="api.php" style="width:100%;height:100%;border:none;"></iframe>
      </div>
    `;
    document.body.appendChild(apiModal);

    // wire up its close button
    document.getElementById("closeApiModal").addEventListener("click", () => {
      apiModal.style.display = "none";
    });
  }
  // finally, show it
  apiModal.style.display = "flex";
}