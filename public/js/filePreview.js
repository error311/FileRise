// filePreview.js
import { escapeHTML, showToast } from './domUtils.js?v={{APP_QVER}}';
import { t } from './i18n.js?v={{APP_QVER}}';
import { fileData, setFileProgressBadge, setFileWatchedBadge } from './fileListView.js?v={{APP_QVER}}';

// Build a preview URL that always goes through the API layer (respects ACLs/UPLOAD_DIR)
export function buildPreviewUrl(folder, name) {
  const f = (!folder || folder === '') ? 'root' : String(folder);
  return `/api/file/download.php?folder=${encodeURIComponent(f)}&file=${encodeURIComponent(name)}&inline=1&t=${Date.now()}`;
}

/* -------------------------------- Share modal (existing) -------------------------------- */
export function openShareModal(file, folder) {
  const existing = document.getElementById("shareModal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "shareModal";
  modal.classList.add("modal");
  modal.innerHTML = `
    <div class="modal-content share-modal-content" style="width:600px;max-width:90vw;">
      <div class="modal-header">
        <h3>${t("share_file")}: ${escapeHTML(file.name)}</h3>
        <span id="closeShareModal" title="${t("close")}" class="close-image-modal">&times;</span>
      </div>
      <div class="modal-body">
        <p>${t("set_expiration")}</p>
        <select id="shareExpiration" style="width:100%;padding:5px;">
          <option value="30">30 ${t("minutes")}</option>
          <option value="60" selected>60 ${t("minutes")}</option>
          <option value="120">120 ${t("minutes")}</option>
          <option value="180">180 ${t("minutes")}</option>
          <option value="240">240 ${t("minutes")}</option>
          <option value="1440">1 ${t("day")}</option>
          <option value="custom">${t("custom")}&hellip;</option>
        </select>

        <div id="customExpirationContainer" style="display:none;margin-top:10px;">
          <label for="customExpirationValue">${t("duration")}:</label>
          <input type="number" id="customExpirationValue" min="1" value="1" style="width:60px;margin:0 8px;"/>
          <select id="customExpirationUnit">
            <option value="seconds">${t("seconds")}</option>
            <option value="minutes" selected>${t("minutes")}</option>
            <option value="hours">${t("hours")}</option>
            <option value="days">${t("days")}</option>
          </select>
          <p class="share-warning" style="color:#a33;font-size:0.9em;margin-top:5px;">
            ${t("custom_duration_warning")}
          </p>
        </div>

        <p style="margin-top:15px;">${t("password_optional")}</p>
        <input type="text" id="sharePassword" placeholder="${t("password_optional")}" style="width:100%;padding:5px;"/>

        <button id="generateShareLinkBtn" class="btn btn-primary" style="margin-top:15px;">
          ${t("generate_share_link")}
        </button>

        <div id="shareLinkDisplay" style="margin-top:15px;display:none;">
          <p>${t("shareable_link")}</p>
          <input type="text" id="shareLinkInput" readonly style="width:100%;padding:5px;"/>
          <button id="copyShareLinkBtn" class="btn btn-secondary" style="margin-top:5px;">
            ${t("copy_link")}
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.style.display = "block";

  document.getElementById("closeShareModal").addEventListener("click", () => modal.remove());
  document.getElementById("shareExpiration").addEventListener("change", e => {
    const container = document.getElementById("customExpirationContainer");
    container.style.display = e.target.value === "custom" ? "block" : "none";
  });

  document.getElementById("generateShareLinkBtn").addEventListener("click", () => {
    const sel = document.getElementById("shareExpiration");
    let value, unit;

    if (sel.value === "custom") {
      value = parseInt(document.getElementById("customExpirationValue").value, 10);
      unit = document.getElementById("customExpirationUnit").value;
    } else {
      value = parseInt(sel.value, 10);
      unit = "minutes";
    }

    const password = document.getElementById("sharePassword").value;

    fetch("/api/file/createShareLink.php", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": window.csrfToken },
      body: JSON.stringify({ folder, file: file.name, expirationValue: value, expirationUnit: unit, password })
    })
      .then(res => res.json())
      .then(data => {
        if (data.token) {
          const url = `${window.location.origin}/api/file/share.php?token=${encodeURIComponent(data.token)}`;
          document.getElementById("shareLinkInput").value = url;
          document.getElementById("shareLinkDisplay").style.display = "block";
        } else {
          showToast(t("error_generating_share") + ": " + (data.error || "Unknown"));
        }
      })
      .catch(err => {
        console.error(err);
        showToast(t("error_generating_share"));
      });
  });

  document.getElementById("copyShareLinkBtn").addEventListener("click", () => {
    const input = document.getElementById("shareLinkInput");
    input.select();
    document.execCommand("copy");
    showToast(t("link_copied"));
  });
}

/* -------------------------------- Media modal viewer -------------------------------- */
const IMG_RE = /\.(jpg|jpeg|png|gif|bmp|webp|svg|ico)$/i;
const VID_RE = /\.(mp4|mkv|webm|mov|ogv)$/i;
const AUD_RE = /\.(mp3|wav|m4a|ogg|flac|aac|wma|opus)$/i;
const ARCH_RE = /\.(zip|rar|7z|gz|bz2|xz|tar)$/i;
const CODE_RE = /\.(js|mjs|ts|tsx|json|yml|yaml|xml|html?|css|scss|less|php|py|rb|go|rs|c|cpp|h|hpp|java|cs|sh|bat|ps1)$/i;
const TXT_RE  = /\.(txt|rtf|md|log)$/i;

function getIconForFile(name) {
  const lower = (name || '').toLowerCase();
  if (IMG_RE.test(lower)) return 'image';
  if (VID_RE.test(lower)) return 'ondemand_video';
  if (AUD_RE.test(lower)) return 'audiotrack';
  if (lower.endsWith('.pdf')) return 'picture_as_pdf';
  if (ARCH_RE.test(lower)) return 'archive';
  if (CODE_RE.test(lower)) return 'code';
  if (TXT_RE.test(lower)) return 'description';
  return 'insert_drive_file';
}

function ensureMediaModal() {
  let overlay = document.getElementById("filePreviewModal");
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = "filePreviewModal";
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    backgroundColor: "rgba(0,0,0,0.7)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: "1000"
  });

  const root   = document.documentElement;
  const styles = getComputedStyle(root);
  const isDark = root.classList.contains('dark-mode');
  const panelBg = styles.getPropertyValue('--panel-bg').trim() || styles.getPropertyValue('--bg-color').trim() || (isDark ? '#2c2c2c' : '#ffffff');
  const textCol = styles.getPropertyValue('--text-color').trim() || (isDark ? '#eaeaea' : '#111111');

  const navBg     = isDark ? 'rgba(255,255,255,.28)' : 'rgba(0,0,0,.45)';
  const navFg     = '#fff';
  const navBorder = isDark ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.25)';

  // fixed top bar; pad-right to avoid overlap with absolute close “×”
  overlay.innerHTML = `
    <div class="modal-content media-modal" style="
      position: relative;
      max-width: 92vw;
      width: 92vw;
      max-height: 92vh;
      height: 92vh;
      box-sizing: border-box;
      background: ${panelBg};
      color: ${textCol};
      overflow: hidden;
      border-radius: 10px;
      display:flex; flex-direction:column;
    ">
      <!-- Top bar -->
      <div class="media-topbar" style="
        flex:0 0 auto; display:flex; align-items:center; justify-content:space-between;
        height:44px; padding:6px 12px; padding-right:56px; gap:10px;
        border-bottom:1px solid ${isDark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.08)'};
        background:${panelBg};
      ">
        <div class="media-title" style="display:flex; align-items:center; gap:8px; min-width:0;">
          <span class="material-icons title-icon" style="
            width:22px; height:22px; display:inline-flex; align-items:center; justify-content:center;
            font-size:22px; line-height:1; opacity:${isDark ? '0.96' : '0.9'};">
            insert_drive_file
          </span>
          <div class="title-text" style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
        </div>
        <div class="media-right" style="display:flex; align-items:center; gap:8px;">
          <span class="status-chip" style="
   display:none; padding:4px 8px; border-radius:999px; font-size:12px; line-height:1;
   border:1px solid transparent; background:transparent; color:inherit;"></span>
          <div class="action-group" style="display:flex; gap:8px; align-items:center;"></div>
        </div>
      </div>

      <!-- Stage -->
      <div class="media-stage" style="position:relative; flex:1 1 auto; display:flex; align-items:center; justify-content:center; overflow:hidden;">
        <div class="file-preview-container" style="position:relative; text-align:center; flex:1; min-width:0;"></div>

        <!-- prev/next = rounded rectangles with centered glyphs -->
        <button class="nav-left"  aria-label="${t('previous')||'Previous'}" style="
          position:absolute; left:8px; top:50%; transform:translateY(-50%);
          height:56px; min-width:48px; padding:0 14px;
          display:flex; align-items:center; justify-content:center;
          font-size:38px; line-height:0;
          background:${navBg}; color:${navFg}; border:1px solid ${navBorder};
          text-shadow: 0 1px 2px rgba(0,0,0,.6);
          border-radius:12px; cursor:pointer; display:none; z-index:1001; backdrop-filter: blur(2px);
          box-shadow: 0 2px 8px rgba(0,0,0,.35);">‹</button>
        <button class="nav-right" aria-label="${t('next')||'Next'}" style="
          position:absolute; right:8px; top:50%; transform:translateY(-50%);
          height:56px; min-width:48px; padding:0 14px;
          display:flex; align-items:center; justify-content:center;
          font-size:38px; line-height:0;
          background:${navBg}; color:${navFg}; border:1px solid ${navBorder};
          text-shadow: 0 1px 2px rgba(0,0,0,.6);
          border-radius:12px; cursor:pointer; display:none; z-index:1001; backdrop-filter: blur(2px);
          box-shadow: 0 2px 8px rgba(0,0,0,.35);">›</button>
      </div>

      <!-- Absolute close “×” (like original), themed + hover behavior -->
      <span id="closeFileModal" class="close-image-modal" title="${t('close')}" style="
        position:absolute; top:8px; right:10px; z-index:1002;
        width:32px; height:32px; display:inline-flex; align-items:center; justify-content:center;
        font-size:22px; cursor:pointer; user-select:none; border-radius:50%; transition:all .15s ease;
      ">&times;</span>
    </div>`;

  document.body.appendChild(overlay);

  // theme the close “×” for visibility + hover rules that match your site:
  const closeBtn = overlay.querySelector("#closeFileModal");
  function paintCloseBase() {
    closeBtn.style.backgroundColor = 'transparent';
    closeBtn.style.color = '#e11d48'; // base red X
    closeBtn.style.boxShadow = 'none';
  }
  function onCloseHoverEnter() {
    const dark = document.documentElement.classList.contains('dark-mode');
    closeBtn.style.backgroundColor = '#ef4444'; // red fill
    closeBtn.style.color = dark ? '#000' : '#fff'; // X: black in dark / white in light
    closeBtn.style.boxShadow = '0 0 6px rgba(239,68,68,.6)';
  }
  function onCloseHoverLeave() { paintCloseBase(); }
  paintCloseBase();
  closeBtn.addEventListener('mouseenter', onCloseHoverEnter);
  closeBtn.addEventListener('mouseleave', onCloseHoverLeave);

  function closeModal() {
    try { overlay.querySelectorAll("video,audio").forEach(m => { try{m.pause()}catch(_){}}); } catch {}
    if (overlay._onKey) window.removeEventListener('keydown', overlay._onKey);
    overlay.remove();
  }
  closeBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

  return overlay;
}

function setTitle(overlay, name) {
  const textEl = overlay.querySelector('.title-text');
  const iconEl = overlay.querySelector('.title-icon');
  if (textEl) {
    textEl.textContent = name || '';
    textEl.setAttribute('title', name || '');
  }
  if (iconEl) {
    iconEl.textContent = getIconForFile(name);
    // keep the icon legible in both themes
    const dark = document.documentElement.classList.contains('dark-mode');
    iconEl.style.color = dark ? '#f5f5f5' : '#111111';
    iconEl.style.opacity = dark ? '0.96' : '0.9';
  }
}

// Topbar icon (theme-aware) used for image tools + video actions
function makeTopIcon(name, title) {
  const b = document.createElement('button');
  b.className = 'material-icons';
  b.textContent = name;
  b.title = title;

  const dark = document.documentElement.classList.contains('dark-mode');

  Object.assign(b.style, {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: dark ? '1px solid rgba(255,255,255,.25)' : '1px solid rgba(0,0,0,.15)',
    background: dark ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.08)',
    cursor: 'pointer',
    fontSize: '20px',
    lineHeight: '1',
    color: dark ? '#f5f5f5' : '#111',
    boxShadow: dark ? '0 1px 2px rgba(0,0,0,.6)' : '0 1px 1px rgba(0,0,0,.08)'
  });

  b.addEventListener('mouseenter', () => {
    const darkNow = document.documentElement.classList.contains('dark-mode');
    b.style.background = darkNow ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.14)';
  });
  b.addEventListener('mouseleave', () => {
    const darkNow = document.documentElement.classList.contains('dark-mode');
    b.style.background = darkNow ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.08)';
  });

  return b;
}

function setNavVisibility(overlay, showPrev, showNext) {
  const prev = overlay.querySelector('.nav-left');
  const next = overlay.querySelector('.nav-right');
  prev.style.display = showPrev ? 'flex' : 'none';
  next.style.display = showNext ? 'flex' : 'none';
}

function setRowWatchedBadge(name, watched) {
  try {
    const cell = document.querySelector(`tr[data-file-name="${CSS.escape(name)}"] .name-cell`);
    if (!cell) return;
    const old = cell.querySelector('.status-badge.watched');
    if (watched) {
      if (!old) {
        const b = document.createElement('span');
        b.className = 'status-badge watched';
        b.textContent = t("watched") || t("viewed") || "Watched";
        b.style.marginLeft = "6px";
        cell.appendChild(b);
      }
    } else if (old) {
      old.remove();
    }
  } catch {}
}

/* -------------------------------- Entry -------------------------------- */
export function previewFile(fileUrl, fileName) {
  const overlay    = ensureMediaModal();
  const container  = overlay.querySelector(".file-preview-container");
  const actionWrap = overlay.querySelector(".media-right .action-group");
  const statusChip = overlay.querySelector(".media-right .status-chip");

  // replace nav buttons to clear old listeners
  let prevBtn = overlay.querySelector('.nav-left');
  let nextBtn = overlay.querySelector('.nav-right');
  const newPrev = prevBtn.cloneNode(true);
  const newNext = nextBtn.cloneNode(true);
  prevBtn.replaceWith(newPrev);
  nextBtn.replaceWith(newNext);
  prevBtn = newPrev; nextBtn = newNext;

  // reset
  container.innerHTML = "";
  actionWrap.innerHTML = "";
  if (statusChip) statusChip.style.display = 'none';
  if (overlay._onKey) window.removeEventListener('keydown', overlay._onKey);
  overlay._onKey = null;

  const folder = window.currentFolder || 'root';
  const name   = fileName;
  const lower  = (name || '').toLowerCase();
  const isImage = IMG_RE.test(lower);
  const isVideo = VID_RE.test(lower);
  const isAudio = AUD_RE.test(lower);

  setTitle(overlay, name);

  /* -------------------- IMAGES -------------------- */
  if (isImage) {
    const img = document.createElement("img");
    img.src = fileUrl;
    img.className = "image-modal-img";
    img.style.maxWidth  = "88vw";
    img.style.maxHeight = "88vh";
    img.style.transition = "transform 0.3s ease";
    img.dataset.scale = 1;
    img.dataset.rotate = 0;
    container.appendChild(img);

    // topbar-aligned, theme-aware icons
    const zoomInBtn   = makeTopIcon('zoom_in',      t('zoom_in')       || 'Zoom In');
    const zoomOutBtn  = makeTopIcon('zoom_out',     t('zoom_out')      || 'Zoom Out');
    const rotateLeft  = makeTopIcon('rotate_left',  t('rotate_left')   || 'Rotate Left');
    const rotateRight = makeTopIcon('rotate_right', t('rotate_right')  || 'Rotate Right');
    actionWrap.appendChild(zoomInBtn);
    actionWrap.appendChild(zoomOutBtn);
    actionWrap.appendChild(rotateLeft);
    actionWrap.appendChild(rotateRight);

    zoomInBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      let s = parseFloat(img.dataset.scale) || 1; s += 0.1;
      img.dataset.scale = s;
      img.style.transform = `scale(${s}) rotate(${img.dataset.rotate}deg)`;
    });
    zoomOutBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      let s = parseFloat(img.dataset.scale) || 1; s = Math.max(0.1, s - 0.1);
      img.dataset.scale = s;
      img.style.transform = `scale(${s}) rotate(${img.dataset.rotate}deg)`;
    });
    rotateLeft.addEventListener('click', (e) => {
      e.stopPropagation();
      let r = parseFloat(img.dataset.rotate) || 0; r = (r - 90 + 360) % 360;
      img.dataset.rotate = r;
      img.style.transform = `scale(${img.dataset.scale}) rotate(${r}deg)`;
    });
    rotateRight.addEventListener('click', (e) => {
      e.stopPropagation();
      let r = parseFloat(img.dataset.rotate) || 0; r = (r + 90) % 360;
      img.dataset.rotate = r;
      img.style.transform = `scale(${img.dataset.scale}) rotate(${r}deg)`;
    });

    const images = (Array.isArray(fileData) ? fileData : []).filter(f => IMG_RE.test(f.name));
    overlay.mediaType  = 'image';
    overlay.mediaList  = images;
    overlay.mediaIndex = Math.max(0, images.findIndex(f => f.name === name));
    setNavVisibility(overlay, images.length > 1, images.length > 1);

    const navigate = (dir) => {
      if (!overlay.mediaList || overlay.mediaList.length < 2) return;
      overlay.mediaIndex = (overlay.mediaIndex + dir + overlay.mediaList.length) % overlay.mediaList.length;
      const newFile = overlay.mediaList[overlay.mediaIndex].name;
      setTitle(overlay, newFile);
      img.dataset.scale = 1;
      img.dataset.rotate = 0;
      img.style.transform = 'scale(1) rotate(0deg)';
      img.src = buildPreviewUrl(folder, newFile);
    };

    if (images.length > 1) {
      prevBtn.addEventListener('click', (e) => { e.stopPropagation(); navigate(-1); });
      nextBtn.addEventListener('click', (e) => { e.stopPropagation(); navigate(+1); });
      const onKey = (e) => {
        if (!document.body.contains(overlay)) { window.removeEventListener("keydown", onKey); return; }
        if (e.key === "ArrowLeft")  navigate(-1);
        if (e.key === "ArrowRight") navigate(+1);
      };
      window.addEventListener("keydown", onKey);
      overlay._onKey = onKey;
    }

    overlay.style.display = "flex";
    return;
  }

  /* -------------------- PDF => new tab -------------------- */
  if (lower.endsWith('.pdf')) {
    const separator = fileUrl.includes('?') ? '&' : '?';
    const urlWithTs = fileUrl + separator + 't=' + Date.now();
    window.open(urlWithTs, "_blank");
    overlay.remove();
    return;
  }

    /* -------------------- VIDEOS -------------------- */
    if (isVideo) {
      let video = document.createElement("video");
      video.controls = true;
      video.preload  = 'auto'; // hint browser to start fetching quickly
      video.style.maxWidth  = "88vw";
      video.style.maxHeight = "88vh";
      video.style.objectFit = "contain";
      container.appendChild(video);
  
      // Top-right action icons (Material icons, theme-aware)
      const markBtnIcon  = makeTopIcon('check_circle', t("mark_as_viewed") || "Mark as viewed");
      const clearBtnIcon = makeTopIcon('restart_alt',  t("clear_progress") || "Clear progress");
      actionWrap.appendChild(markBtnIcon);
      actionWrap.appendChild(clearBtnIcon);
  
      const videos = (Array.isArray(fileData) ? fileData : []).filter(f => VID_RE.test(f.name));
      overlay.mediaType  = 'video';
      overlay.mediaList  = videos;
      overlay.mediaIndex = Math.max(0, videos.findIndex(f => f.name === name));
      setNavVisibility(overlay, videos.length > 1, videos.length > 1);
  
      // Track which file is currently active
      let currentName = name;
  
      const setVideoSrc = (nm) => {
        currentName = nm;
        video.src = buildPreviewUrl(folder, nm);
        setTitle(overlay, nm);
      };
  
      const SAVE_INTERVAL_MS = 5000;
      let lastSaveAt = 0;
      let pending = false;
  
      async function getProgress(nm) {
        try {
          const res = await fetch(`/api/media/getProgress.php?folder=${encodeURIComponent(folder)}&file=${encodeURIComponent(nm)}&t=${Date.now()}`, { credentials: "include" });
          const data = await res.json();
          return data && data.state ? data.state : null;
        } catch { return null; }
      }
  
      async function sendProgress({nm, seconds, duration, completed, clear}) {
        try {
          pending = true;
          const res = await fetch("/api/media/updateProgress.php", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", "X-CSRF-Token": window.csrfToken },
            body: JSON.stringify({ folder, file: nm, seconds, duration, completed, clear })
          });
          const data = await res.json();
          pending = false;
          return data;
        } catch (e) {
          pending = false;
          console.error(e);
          return null;
        }
      }
  
      const lsKey = (nm) => `videoProgress-${folder}/${nm}`;
  
      function renderStatus(state) {
        if (!statusChip) return;
  
        // Completed
        if (state && state.completed) {
          statusChip.textContent = (t('viewed') || 'Viewed') + ' ✓';
          statusChip.style.display = 'inline-block';
          statusChip.style.borderColor = 'rgba(34,197,94,.45)';
          statusChip.style.background  = 'rgba(34,197,94,.15)';
          statusChip.style.color       = '#22c55e';
          markBtnIcon.style.display  = 'none';
          clearBtnIcon.style.display = '';
          clearBtnIcon.title = t('reset_progress') || t('clear_progress') || 'Reset';
          return;
        }
  
        // In progress
        if (state && Number.isFinite(state.seconds) && Number.isFinite(state.duration) && state.duration > 0) {
          const pct = Math.max(1, Math.min(99, Math.round((state.seconds / state.duration) * 100)));
          statusChip.textContent = `${pct}%`;
          statusChip.style.display = 'inline-block';
  
          const dark = document.documentElement.classList.contains('dark-mode');
          const ORANGE_HEX = '#ea580c';
          statusChip.style.color       = ORANGE_HEX;
          statusChip.style.borderColor = dark ? 'rgba(234,88,12,.55)' : 'rgba(234,88,12,.45)';
          statusChip.style.background  = dark ? 'rgba(234,88,12,.18)' : 'rgba(234,88,12,.12)';
  
          markBtnIcon.style.display  = '';
          clearBtnIcon.style.display = '';
          clearBtnIcon.title = t('reset_progress') || t('clear_progress') || 'Reset';
          return;
        }
  
        // No progress
        statusChip.style.display = 'none';
        markBtnIcon.style.display  = '';
        clearBtnIcon.style.display = 'none';
      }
  
      // ---- Event handlers (use currentName instead of rebinding per file) ----
      video.addEventListener("loadedmetadata", async () => {
        const nm = currentName;
        try {
          const state = await getProgress(nm);
          if (state && Number.isFinite(state.seconds) && state.seconds > 0 && state.seconds < (video.duration || Infinity)) {
            video.currentTime = state.seconds;
            const seconds  = Math.floor(video.currentTime || 0);
            const duration = Math.floor(video.duration || 0);
            setFileProgressBadge(nm, seconds, duration);
            showToast((t("resumed_from") || "Resumed from") + " " + Math.floor(state.seconds) + "s");
          } else {
            const ls = localStorage.getItem(lsKey(nm));
            if (ls) video.currentTime = parseFloat(ls);
          }
          renderStatus(state || null);
        } catch {
          renderStatus(null);
        }
      });
  
      video.addEventListener("timeupdate", async () => {
        const now = Date.now();
        if ((now - lastSaveAt) < SAVE_INTERVAL_MS || pending) return;
        lastSaveAt = now;
  
        const nm = currentName;
        const seconds  = Math.floor(video.currentTime || 0);
        const duration = Math.floor(video.duration || 0);
  
        sendProgress({ nm, seconds, duration });
        setFileProgressBadge(nm, seconds, duration);
        try { localStorage.setItem(lsKey(nm), String(seconds)); } catch {}
        renderStatus({ seconds, duration, completed: false });
      });
  
      video.addEventListener("ended", async () => {
        const nm = currentName;
        const duration = Math.floor(video.duration || 0);
        await sendProgress({ nm, seconds: duration, duration, completed: true });
        try { localStorage.removeItem(lsKey(nm)); } catch {}
        showToast(t("marked_viewed") || "Marked as viewed");
        setFileWatchedBadge(nm, true);
        renderStatus({ seconds: duration, duration, completed: true });
      });
  
      markBtnIcon.onclick = async () => {
        const nm = currentName;
        const duration = Math.floor(video.duration || 0);
        await sendProgress({ nm, seconds: duration, duration, completed: true });
        showToast(t("marked_viewed") || "Marked as viewed");
        setFileWatchedBadge(nm, true);
        renderStatus({ seconds: duration, duration, completed: true });
      };
  
      clearBtnIcon.onclick = async () => {
        const nm = currentName;
        await sendProgress({ nm, seconds: 0, duration: null, completed: false, clear: true });
        try { localStorage.removeItem(lsKey(nm)); } catch {}
        showToast(t("progress_cleared") || "Progress cleared");
        setFileWatchedBadge(nm, false);
        renderStatus(null);
      };
  
      const navigate = (dir) => {
        if (!overlay.mediaList || overlay.mediaList.length < 2) return;
        overlay.mediaIndex = (overlay.mediaIndex + dir + overlay.mediaList.length) % overlay.mediaList.length;
        const nm = overlay.mediaList[overlay.mediaIndex].name;
        setVideoSrc(nm);
        renderStatus(null);
      };
  
      if (videos.length > 1) {
        prevBtn.addEventListener('click', (e) => { e.stopPropagation(); navigate(-1); });
        nextBtn.addEventListener('click', (e) => { e.stopPropagation(); navigate(+1); });
        const onKey = (e) => {
          if (!document.body.contains(overlay)) {
            window.removeEventListener("keydown", onKey);
            return;
          }
          if (e.key === "ArrowLeft")  navigate(-1);
          if (e.key === "ArrowRight") navigate(+1);
        };
        window.addEventListener("keydown", onKey);
        overlay._onKey = onKey;
      }
  
      setVideoSrc(name);
      renderStatus(null);
      overlay.style.display = "flex";
      return;
    }

  /* -------------------- AUDIO / OTHER -------------------- */
  if (isAudio) {
    const audio = document.createElement("audio");
    audio.src = fileUrl;
    audio.controls = true;
    audio.className = "audio-modal";
    audio.style.maxWidth = "88vw";
    container.appendChild(audio);
    overlay.style.display = "flex";
  } else {
    container.textContent = t("preview_not_available") || "Preview not available for this file type.";
    overlay.style.display = "flex";
  }
}

/* -------------------------------- Small display helper -------------------------------- */
export function displayFilePreview(file, container) {
  const actualFile = file.file || file;
  if (!(actualFile instanceof File)) {
    console.error("displayFilePreview called with an invalid file object");
    return;
  }
  container.style.display = "inline-block";
  while (container.firstChild) container.removeChild(container.firstChild);

  if (IMG_RE.test(actualFile.name)) {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(actualFile);
    img.classList.add("file-preview-img");
    container.appendChild(img);
  } else {
    const iconSpan = document.createElement("span");
    iconSpan.classList.add("material-icons", "file-icon");
    iconSpan.textContent = "insert_drive_file";
    container.appendChild(iconSpan);
  }
}

// expose for HTML onclick usage
window.previewFile = previewFile;
window.openShareModal = openShareModal;