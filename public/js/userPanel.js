import { showToast } from './domUtils.js?v={{APP_QVER}}';
import { t, applyTranslations, setLocale } from './i18n.js?v={{APP_QVER}}';
import { updateAuthenticatedUI } from './auth.js?v={{APP_QVER}}';
import { withBase } from './basePath.js?v={{APP_QVER}}';
import { openTOTPModal } from './authModals.js?v={{APP_QVER}}';

/**
 * Fetch current user info (username, profile_picture, totp_enabled)
 */
async function fetchCurrentUser() {
  try {
    const res = await fetch(withBase('/api/profile/getCurrentUser.php'), {
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
  // ensure exactly one leading slash
  if (pic) pic = '/' + pic.replace(/^\/+/, '');
  return pic ? withBase(pic) : '';
}

export async function openUserPanel() {
  // 1) load data
  const { username = 'User', profile_picture = '', totp_enabled = false } = await fetchCurrentUser();
  const raw = profile_picture;
  const picUrl = normalizePicUrl(raw) || withBase('/assets/default-avatar.png');

  // 2) dark‐mode helpers
  const isDark = document.body.classList.contains('dark-mode');
  const overlayBg = isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.3)';
  const contentStyle = `
    background: ${isDark ? '#2c2c2c' : '#fff'};
    color:      ${isDark ? '#e0e0e0' : '#000'};
    padding: 20px;
    max-width: 600px; width:90%;
    overflow-y: auto; height: 525px; max-height: 525px;
    display: flex; flex-direction: column; gap: 16px;
    margin: 0;
    scrollbar-gutter: stable both-edges;
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
      padding: '16px',
      boxSizing: 'border-box',
      overflow: 'hidden',
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
    avatarWrapper.style.cssText = 'text-align:center; margin:0;';
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
    title.style.cssText = 'text-align:center; margin:0;';
    title.textContent = `${t('user_panel')} (${username})`;
    content.appendChild(title);

    // change password btn
    const pwdBtn = document.createElement('button');
    pwdBtn.id = 'openChangePasswordModalBtn';
    pwdBtn.className = 'btn btn-primary';
    pwdBtn.textContent = t('change_password');
    pwdBtn.addEventListener('click', () => {
      document.getElementById('changePasswordModal').style.display = 'block';
    });
    content.appendChild(pwdBtn);

    // TOTP fieldset
    const totpFs = document.createElement('fieldset');
    totpFs.style.cssText = 'margin:0; border:0; padding:0;';
    const totpLegend = document.createElement('legend');
    totpLegend.style.cssText = 'margin:0 0 6px; padding:0; font-weight:600;';
    totpLegend.textContent = t('totp_settings');
    totpFs.appendChild(totpLegend);
    const totpCb = document.createElement('input');
    totpCb.type = 'checkbox';
    totpCb.id = 'userTOTPEnabled';
    totpCb.className = 'form-check-input fr-toggle-input';
    totpCb.checked = totp_enabled;
    totpCb.addEventListener('change', async function () {
      const resp = await fetch(withBase('/api/updateUserPanel.php'), {
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
    const totpRow = document.createElement('div');
    totpRow.className = 'form-check fr-toggle';
    const totpLabel = document.createElement('label');
    totpLabel.className = 'form-check-label';
    totpLabel.htmlFor = 'userTOTPEnabled';
    totpLabel.textContent = t('enable_totp');
    totpRow.appendChild(totpCb);
    totpRow.appendChild(totpLabel);
    totpFs.appendChild(totpRow);
    content.appendChild(totpFs);

    // language fieldset
    const langFs = document.createElement('fieldset');
    langFs.style.cssText = 'margin:0; border:0; padding:0;';
    const langLegend = document.createElement('legend');
    langLegend.style.cssText = 'margin:0 0 6px; padding:0; font-weight:600;';
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
    dispFs.style.cssText = 'margin:0; border:0; padding:0;';

    const dispLegend = document.createElement('legend');
    dispLegend.style.cssText = 'margin:0 0 6px; padding:0; font-weight:600;';
    dispLegend.textContent = t('display');
    dispFs.appendChild(dispLegend);

    // 1) Show folder strip above list
    const stripCb = document.createElement('input');
    stripCb.type = 'checkbox';
    stripCb.id = 'showFoldersInList';
    stripCb.className = 'form-check-input fr-toggle-input';

    {
      const storedStrip = localStorage.getItem('showFoldersInList');
      stripCb.checked = storedStrip === null ? false : storedStrip === 'true';
    }

    const stripRow = document.createElement('div');
    stripRow.className = 'form-check fr-toggle';
    stripRow.style.marginBottom = '6px';
    const stripLabel = document.createElement('label');
    stripLabel.className = 'form-check-label';
    stripLabel.htmlFor = 'showFoldersInList';
    stripLabel.textContent = t('show_folders_above_files');
    stripRow.appendChild(stripCb);
    stripRow.appendChild(stripLabel);
    dispFs.appendChild(stripRow);

    // 2) Show inline folder rows above files in table view
    const inlineCb = document.createElement('input');
    inlineCb.type = 'checkbox';
    inlineCb.id = 'showInlineFolders';
    inlineCb.className = 'form-check-input fr-toggle-input';

    {
      const storedInline = localStorage.getItem('showInlineFolders');
      inlineCb.checked = storedInline === null ? true : storedInline === 'true';
    }

    const inlineRow = document.createElement('div');
    inlineRow.className = 'form-check fr-toggle';
    inlineRow.style.marginBottom = '6px';
    const inlineLabel = document.createElement('label');
    inlineLabel.className = 'form-check-label';
    inlineLabel.htmlFor = 'showInlineFolders';
    inlineLabel.textContent = t('show_inline_folders') || 'Show folders inline (above files)';
    inlineRow.appendChild(inlineCb);
    inlineRow.appendChild(inlineLabel);
    dispFs.appendChild(inlineRow);

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

    // 4) Disable hover preview
    const hoverCb = document.createElement('input');
    hoverCb.type = 'checkbox';
    hoverCb.id = 'disableHoverPreview';
    hoverCb.className = 'form-check-input fr-toggle-input';

    {
      const storedHover = localStorage.getItem('disableHoverPreview');
      const isDisabled = storedHover === 'true';
      hoverCb.checked = !isDisabled;
      // also mirror into a global flag for runtime checks
      window.disableHoverPreview = isDisabled;
    }

    const hoverRow = document.createElement('div');
    hoverRow.className = 'form-check fr-toggle';
    const hoverLabel = document.createElement('label');
    hoverLabel.className = 'form-check-label';
    hoverLabel.htmlFor = 'disableHoverPreview';
    hoverLabel.textContent = t('show_hover_preview');
    hoverRow.appendChild(hoverCb);
    hoverRow.appendChild(hoverLabel);
    dispFs.appendChild(hoverRow);

    // Handler: toggle hover preview
    hoverCb.addEventListener('change', () => {
      const disabled = !hoverCb.checked;
      localStorage.setItem('disableHoverPreview', disabled ? 'true' : 'false');
      window.disableHoverPreview = disabled;

      // Hide any currently-visible preview right away
      const preview = document.getElementById('hoverPreview');
      if (preview) {
        preview.style.display = 'none';
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
        const res = await fetch(withBase('/api/profile/uploadPicture.php'), {
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
    Object.assign(modal.style, {
      background: overlayBg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      boxSizing: 'border-box',
      overflow: 'hidden'
    });
    const content = modal.querySelector('.modal-content');
    content.style.cssText = contentStyle;
    modal.querySelector('#profilePicPreview').src = picUrl || withBase('/assets/default-avatar.png');
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

  const hoverCb = modal.querySelector('#disableHoverPreview');
  if (hoverCb) {
    const storedHover = localStorage.getItem('disableHoverPreview');
    const isDisabled = storedHover === 'true';
    hoverCb.checked = !isDisabled;
    window.disableHoverPreview = isDisabled;
  }

  // show
  modal.style.display = 'flex';
}
