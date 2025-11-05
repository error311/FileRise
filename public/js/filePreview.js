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
  const panelBg = styles.getPropertyValue('--panel-bg').trim() || styles.getPropertyValue('--bg-color').trim() || (isDark ? '#121212' : '#ffffff');
  const textCol = styles.getPropertyValue('--text-color').trim() || (isDark ? '#eaeaea' : '#111111');

  const navBg     = isDark ? 'rgba(255,255,255,.28)' : 'rgba(0,0,0,.45)';
  const navFg     = '#fff';
  const navBorder = isDark ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.25)';

  overlay.innerHTML = `
    <div class="modal-content media-modal" style="
      position: relative;
      max-width: 92vw;
      max-height: 92vh;
      width: 92vw;
      box-sizing: border-box;
      padding: 12px;
      background: ${panelBg};
      color: ${textCol};
      overflow: hidden;
      border-radius: 10px;
    ">
      <div class="media-stage" style="position:relative; display:flex; align-items:center; justify-content:center; height: calc(92vh - 8px);">
        <!-- filename badge (top-left) -->
        <div class="media-title-badge" style="
          position:absolute; top:8px; left:12px; max-width:60vw;
          padding:4px 10px; border-radius:10px;
          background: ${isDark ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.65)'};
          color: ${isDark ? '#fff' : '#111'};
          font-weight:600; font-size:13px; line-height:1.3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; z-index:1002;">
        </div>

        <!-- top-right actions row (aligned with your X at top:10px) -->
        <div class="media-actions-bar" style="
          position:absolute; top:10px; right:56px; display:flex; gap:6px; align-items:center; z-index:1002;">
          <span class="status-chip" style="
            display:none; padding:4px 8px; border-radius:999px; font-size:12px; line-height:1;
            border:1px solid rgba(250,204,21,.45); background:rgba(250,204,21,.15); color:#facc15;"></span>
          <div class="action-group" style="display:flex; gap:6px;"></div>
        </div>

        <!-- your absolute close X -->
        <span id="closeFileModal" class="close-image-modal" title="${t('close')}">&times;</span>

        <!-- centered media -->
        <div class="file-preview-container" style="position:relative; text-align:center; flex:1; min-width:0;"></div>

        <!-- high-contrast prev/next -->
        <button class="nav-left"  aria-label="${t('previous')||'Previous'}" style="
          position:absolute; left:8px; top:50%; transform:translateY(-50%);
          height:56px; min-width:44px; padding:0 12px; font-size:42px; line-height:1;
          background:${navBg}; color:${navFg}; border:1px solid ${navBorder};
          text-shadow: 0 1px 2px rgba(0,0,0,.6);
          border-radius:12px; cursor:pointer; display:none; z-index:1001; backdrop-filter: blur(2px);
          box-shadow: 0 2px 8px rgba(0,0,0,.35);">‹</button>
        <button class="nav-right" aria-label="${t('next')||'Next'}" style="
          position:absolute; right:8px; top:50%; transform:translateY(-50%);
          height:56px; min-width:44px; padding:0 12px; font-size:42px; line-height:1;
          background:${navBg}; color:${navFg}; border:1px solid ${navBorder};
          text-shadow: 0 1px 2px rgba(0,0,0,.6);
          border-radius:12px; cursor:pointer; display:none; z-index:1001; backdrop-filter: blur(2px);
          box-shadow: 0 2px 8px rgba(0,0,0,.35);">›</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  function closeModal() {
    try { overlay.querySelectorAll("video,audio").forEach(m => { try{m.pause()}catch(_){}}); } catch {}
    if (overlay._onKey) window.removeEventListener('keydown', overlay._onKey);
    overlay.remove();
  }
  overlay.querySelector("#closeFileModal").addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

  return overlay;
}

function setTitle(overlay, name) {
  const el = overlay.querySelector('.media-title-badge');
  if (el) el.textContent = name || '';
}

function makeMI(name, title) {
  const b = document.createElement('button');
  b.className = `material-icons ${name}`;
  b.textContent = name; // Material Icons font
  b.title = title;
  Object.assign(b.style, {
    width: "32px",
    height: "32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,.25)",
    border: "1px solid rgba(255,255,255,.25)",
    cursor: "pointer",
    userSelect: "none",
    fontSize: "20px",
    padding: "0",
    borderRadius: "8px",
    color: "#fff",
    lineHeight: "1"
  });
  return b;
}

function setNavVisibility(overlay, showPrev, showNext) {
  const prev = overlay.querySelector('.nav-left');
  const next = overlay.querySelector('.nav-right');
  prev.style.display = showPrev ? 'inline-flex' : 'none';
  next.style.display = showNext ? 'inline-flex' : 'none';
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
  const actionWrap = overlay.querySelector(".media-actions-bar .action-group");
  const statusChip = overlay.querySelector(".media-actions-bar .status-chip");

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

    const zoomInBtn   = makeMI('zoom_in',      t('zoom_in')       || 'Zoom In');
    const zoomOutBtn  = makeMI('zoom_out',     t('zoom_out')      || 'Zoom Out');
    const rotateLeft  = makeMI('rotate_left',  t('rotate_left')   || 'Rotate Left');
    const rotateRight = makeMI('rotate_right', t('rotate_right')  || 'Rotate Right');
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
    let video = document.createElement("video"); // let so we can rebind
    video.controls = true;
    video.style.maxWidth  = "88vw";
    video.style.maxHeight = "88vh";
    video.style.objectFit = "contain";
    container.appendChild(video);

    const markBtn  = document.createElement('button');
    const clearBtn = document.createElement('button');
    markBtn.className  = 'btn btn-sm btn-success';
    clearBtn.className = 'btn btn-sm btn-secondary';
    markBtn.textContent  = t("mark_as_viewed") || "Mark as viewed";
    clearBtn.textContent = t("clear_progress") || "Clear progress";
    actionWrap.appendChild(markBtn);
    actionWrap.appendChild(clearBtn);

    const videos = (Array.isArray(fileData) ? fileData : []).filter(f => VID_RE.test(f.name));
    overlay.mediaType  = 'video';
    overlay.mediaList  = videos;
    overlay.mediaIndex = Math.max(0, videos.findIndex(f => f.name === name));
    setNavVisibility(overlay, videos.length > 1, videos.length > 1);

    const setVideoSrc = (nm) => { video.src = buildPreviewUrl(folder, nm); setTitle(overlay, nm); };

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
      } catch (e) { pending = false; console.error(e); return null; }
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
        markBtn.style.display  = 'none';
        clearBtn.style.display = '';
        clearBtn.textContent   = t('reset_progress') || t('clear_progress') || 'Reset';
        return;
      }
      // In progress
      if (state && Number.isFinite(state.seconds) && Number.isFinite(state.duration) && state.duration > 0) {
        const pct = Math.max(1, Math.min(99, Math.round((state.seconds / state.duration) * 100)));
        statusChip.textContent = `${pct}%`;
        statusChip.style.display = 'inline-block';
        statusChip.style.borderColor = 'rgba(250,204,21,.45)';
        statusChip.style.background  = 'rgba(250,204,21,.15)';
        statusChip.style.color       = '#facc15';
        markBtn.style.display  = '';
        clearBtn.style.display = '';
        clearBtn.textContent   = t('reset_progress') || t('clear_progress') || 'Reset';
        return;
      }
      // No progress
      statusChip.style.display = 'none';
      markBtn.style.display  = '';
      clearBtn.style.display = 'none';
    }

    function bindVideoEvents(nm) {
      const nv = video.cloneNode(true);
      video.replaceWith(nv);
      video = nv;

      video.addEventListener("loadedmetadata", async () => {
        try {
          const state = await getProgress(nm);
          if (state && Number.isFinite(state.seconds) && state.seconds > 0 && state.seconds < (video.duration || Infinity)) {
            video.currentTime = state.seconds;
            const seconds = Math.floor(video.currentTime || 0);
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
        const seconds = Math.floor(video.currentTime || 0);
        const duration = Math.floor(video.duration || 0);
        sendProgress({ nm, seconds, duration });
        setFileProgressBadge(nm, seconds, duration);
        try { localStorage.setItem(lsKey(nm), String(seconds)); } catch {}
        renderStatus({ seconds, duration, completed: false });
      });

      video.addEventListener("ended", async () => {
        const duration = Math.floor(video.duration || 0);
        await sendProgress({ nm, seconds: duration, duration, completed: true });
        try { localStorage.removeItem(lsKey(nm)); } catch {}
        showToast(t("marked_viewed") || "Marked as viewed");
        setFileWatchedBadge(nm, true);
        renderStatus({ seconds: duration, duration, completed: true });
      });

      markBtn.onclick = async () => {
        const duration = Math.floor(video.duration || 0);
        await sendProgress({ nm, seconds: duration, duration, completed: true });
        showToast(t("marked_viewed") || "Marked as viewed");
        setFileWatchedBadge(nm, true);
        renderStatus({ seconds: duration, duration, completed: true });
      };
      clearBtn.onclick = async () => {
        await sendProgress({ nm, seconds: 0, duration: null, completed: false, clear: true });
        try { localStorage.removeItem(lsKey(nm)); } catch {}
        showToast(t("progress_cleared") || "Progress cleared");
        setFileWatchedBadge(nm, false);
        renderStatus(null);
      };
    }

    const navigate = (dir) => {
      if (!overlay.mediaList || overlay.mediaList.length < 2) return;
      overlay.mediaIndex = (overlay.mediaIndex + dir + overlay.mediaList.length) % overlay.mediaList.length;
      const nm = overlay.mediaList[overlay.mediaIndex].name;
      setVideoSrc(nm);
      bindVideoEvents(nm);
    };

    if (videos.length > 1) {
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

    setVideoSrc(name);
    renderStatus(null);
    bindVideoEvents(name);
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