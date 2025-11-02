// filePreview.js
import { escapeHTML, showToast } from './domUtils.js?v={{APP_QVER}}';
import { fileData } from './fileListView.js?v={{APP_QVER}}';
import { t } from './i18n.js?v={{APP_QVER}}';

// Build a preview URL that always goes through the API layer (respects ACLs/UPLOAD_DIR)
export function buildPreviewUrl(folder, name) {
  const f = (!folder || folder === '') ? 'root' : String(folder);
  return `/api/file/download.php?folder=${encodeURIComponent(f)}&file=${encodeURIComponent(name)}&inline=1&t=${Date.now()}`;
}

export function openShareModal(file, folder) {
  // Remove any existing modal
  const existing = document.getElementById("shareModal");
  if (existing) existing.remove();

  // Build the modal
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
        <input
          type="text"
          id="sharePassword"
          placeholder="${t("password_optional")}"
          style="width:100%;padding:5px;"
        />

        <button
          id="generateShareLinkBtn"
          class="btn btn-primary"
          style="margin-top:15px;"
        >
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

  // Close handler
  document.getElementById("closeShareModal")
    .addEventListener("click", () => modal.remove());

  // Show/hide custom-duration inputs
  document.getElementById("shareExpiration")
    .addEventListener("change", e => {
      const container = document.getElementById("customExpirationContainer");
      container.style.display = e.target.value === "custom" ? "block" : "none";
    });

  // Generate share link
  document.getElementById("generateShareLinkBtn")
    .addEventListener("click", () => {
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
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": window.csrfToken
        },
        body: JSON.stringify({
          folder,
          file: file.name,
          expirationValue: value,
          expirationUnit: unit,
          password
        })
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

  // Copy to clipboard
  document.getElementById("copyShareLinkBtn")
    .addEventListener("click", () => {
      const input = document.getElementById("shareLinkInput");
      input.select();
      document.execCommand("copy");
      showToast(t("link_copied"));
    });
}

export function previewFile(fileUrl, fileName) {
  let modal = document.getElementById("filePreviewModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "filePreviewModal";
    Object.assign(modal.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      backgroundColor: "rgba(0,0,0,0.7)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: "1000"
    });
    modal.innerHTML = `
      <div class="modal-content image-preview-modal-content" style="position: relative; max-width: 90vw; max-height: 90vh;">
        <span id="closeFileModal" class="close-image-modal" style="position: absolute; top: 10px; right: 10px; font-size: 24px; cursor: pointer;">&times;</span>
        <h4 class="image-modal-header"></h4>
        <div class="file-preview-container" style="position: relative; text-align: center;"></div>
      </div>`;
    document.body.appendChild(modal);

    function closeModal() {
      const mediaElements = modal.querySelectorAll("video, audio");
      mediaElements.forEach(media => {
        media.pause();
        if (media.tagName.toLowerCase() !== 'video') {
          try { media.currentTime = 0; } catch (e) { }
        }
      });
      modal.remove();
    }

    document.getElementById("closeFileModal").addEventListener("click", closeModal);
    modal.addEventListener("click", function (e) {
      if (e.target === modal) {
        closeModal();
      }
    });
  }
  modal.querySelector("h4").textContent = fileName;
  const container = modal.querySelector(".file-preview-container");
  container.innerHTML = "";

  const extension = fileName.split('.').pop().toLowerCase();
  const isImage = /\.(jpg|jpeg|png|gif|bmp|webp|svg|ico)$/i.test(fileName);
  if (isImage) {
    // Create the image element with default transform data.
    const img = document.createElement("img");
    img.src = fileUrl;
    img.className = "image-modal-img";
    img.style.maxWidth = "80vw";
    img.style.maxHeight = "80vh";
    img.style.transition = "transform 0.3s ease";
    img.dataset.scale = 1;
    img.dataset.rotate = 0;
    img.style.position = 'relative';
    img.style.zIndex = '1';

    // Filter gallery images for navigation.
    const images = fileData.filter(file => /\.(jpg|jpeg|png|gif|bmp|webp|svg|ico)$/i.test(file.name));

    // Create a flex wrapper to hold left panel, center image, and right panel.
    const wrapper = document.createElement('div');
    wrapper.className = 'image-wrapper';
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.justifyContent = 'center';
    wrapper.style.position = 'relative';

    // --- Left Panel: Contains Zoom controls (top) and Prev button (bottom) ---
    const leftPanel = document.createElement('div');
    leftPanel.className = 'left-panel';
    leftPanel.style.display = 'flex';
    leftPanel.style.flexDirection = 'column';
    leftPanel.style.justifyContent = 'space-between';
    leftPanel.style.alignItems = 'center';
    leftPanel.style.width = '60px';
    leftPanel.style.height = '100%';
    leftPanel.style.zIndex = '10';

    // Top container for zoom buttons.
    const leftTop = document.createElement('div');
    leftTop.style.display = 'flex';
    leftTop.style.flexDirection = 'column';
    leftTop.style.gap = '4px';
    // Zoom In button.
    const zoomInBtn = document.createElement('button');
    zoomInBtn.className = 'material-icons zoom_in';
    zoomInBtn.title = 'Zoom In';
    zoomInBtn.style.background = 'transparent';
    zoomInBtn.style.border = 'none';
    zoomInBtn.style.cursor = 'pointer';
    zoomInBtn.textContent = 'zoom_in';
    // Zoom Out button.
    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.className = 'material-icons zoom_out';
    zoomOutBtn.title = 'Zoom Out';
    zoomOutBtn.style.background = 'transparent';
    zoomOutBtn.style.border = 'none';
    zoomOutBtn.style.cursor = 'pointer';
    zoomOutBtn.textContent = 'zoom_out';
    leftTop.appendChild(zoomInBtn);
    leftTop.appendChild(zoomOutBtn);
    leftPanel.appendChild(leftTop);

    // Bottom container for prev button.
    const leftBottom = document.createElement('div');
    leftBottom.style.display = 'flex';
    leftBottom.style.justifyContent = 'center';
    leftBottom.style.alignItems = 'center';
    leftBottom.style.width = '100%';
    if (images.length > 1) {
      const prevBtn = document.createElement("button");
      prevBtn.textContent = "‹";
      prevBtn.className = "gallery-nav-btn";
      prevBtn.style.background = 'transparent';
      prevBtn.style.border = 'none';
      prevBtn.style.color = 'white';
      prevBtn.style.fontSize = '48px';
      prevBtn.style.cursor = 'pointer';
      prevBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        // Safety check:
        if (!modal.galleryImages || modal.galleryImages.length === 0) return;
        modal.galleryCurrentIndex = (modal.galleryCurrentIndex - 1 + modal.galleryImages.length) % modal.galleryImages.length;
        let newFile = modal.galleryImages[modal.galleryCurrentIndex];
        modal.querySelector("h4").textContent = newFile.name;
        img.src = buildPreviewUrl(window.currentFolder || 'root', newFile.name);
        // Reset transforms.
        img.dataset.scale = 1;
        img.dataset.rotate = 0;
        img.style.transform = 'scale(1) rotate(0deg)';
      });
      leftBottom.appendChild(prevBtn);
    } else {
      // Insert an empty placeholder for consistent layout.
      leftBottom.innerHTML = '&nbsp;';
    }
    leftPanel.appendChild(leftBottom);

    // --- Center Panel: Contains the image ---
    const centerPanel = document.createElement('div');
    centerPanel.className = 'center-image-container';
    centerPanel.style.flexGrow = '1';
    centerPanel.style.textAlign = 'center';
    centerPanel.style.position = 'relative';
    centerPanel.style.zIndex = '1';
    centerPanel.appendChild(img);

    // --- Right Panel: Contains Rotate controls (top) and Next button (bottom) ---
    const rightPanel = document.createElement('div');
    rightPanel.className = 'right-panel';
    rightPanel.style.display = 'flex';
    rightPanel.style.flexDirection = 'column';
    rightPanel.style.justifyContent = 'space-between';
    rightPanel.style.alignItems = 'center';
    rightPanel.style.width = '60px';
    rightPanel.style.height = '100%';
    rightPanel.style.zIndex = '10';

    // Top container for rotate buttons.
    const rightTop = document.createElement('div');
    rightTop.style.display = 'flex';
    rightTop.style.flexDirection = 'column';
    rightTop.style.gap = '4px';
    // Rotate Left button.
    const rotateLeftBtn = document.createElement('button');
    rotateLeftBtn.className = 'material-icons rotate_left';
    rotateLeftBtn.title = 'Rotate Left';
    rotateLeftBtn.style.background = 'transparent';
    rotateLeftBtn.style.border = 'none';
    rotateLeftBtn.style.cursor = 'pointer';
    rotateLeftBtn.textContent = 'rotate_left';
    // Rotate Right button.
    const rotateRightBtn = document.createElement('button');
    rotateRightBtn.className = 'material-icons rotate_right';
    rotateRightBtn.title = 'Rotate Right';
    rotateRightBtn.style.background = 'transparent';
    rotateRightBtn.style.border = 'none';
    rotateRightBtn.style.cursor = 'pointer';
    rotateRightBtn.textContent = 'rotate_right';
    rightTop.appendChild(rotateLeftBtn);
    rightTop.appendChild(rotateRightBtn);
    rightPanel.appendChild(rightTop);

    // Bottom container for next button.
    const rightBottom = document.createElement('div');
    rightBottom.style.display = 'flex';
    rightBottom.style.justifyContent = 'center';
    rightBottom.style.alignItems = 'center';
    rightBottom.style.width = '100%';
    if (images.length > 1) {
      const nextBtn = document.createElement("button");
      nextBtn.textContent = "›";
      nextBtn.className = "gallery-nav-btn";
      nextBtn.style.background = 'transparent';
      nextBtn.style.border = 'none';
      nextBtn.style.color = 'white';
      nextBtn.style.fontSize = '48px';
      nextBtn.style.cursor = 'pointer';
      nextBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        // Safety check:
        if (!modal.galleryImages || modal.galleryImages.length === 0) return;
        modal.galleryCurrentIndex = (modal.galleryCurrentIndex + 1) % modal.galleryImages.length;
        let newFile = modal.galleryImages[modal.galleryCurrentIndex];
        modal.querySelector("h4").textContent = newFile.name;
        img.src = buildPreviewUrl(window.currentFolder || 'root', newFile.name);
        // Reset transforms.
        img.dataset.scale = 1;
        img.dataset.rotate = 0;
        img.style.transform = 'scale(1) rotate(0deg)';
      });
      rightBottom.appendChild(nextBtn);
    } else {
      // Insert a placeholder so that center remains properly aligned.
      rightBottom.innerHTML = '&nbsp;';
    }
    rightPanel.appendChild(rightBottom);

    // Assemble panels into the wrapper.
    wrapper.appendChild(leftPanel);
    wrapper.appendChild(centerPanel);
    wrapper.appendChild(rightPanel);
    container.appendChild(wrapper);

    // --- Set up zoom controls event listeners ---
    zoomInBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      let scale = parseFloat(img.dataset.scale) || 1;
      scale += 0.1;
      img.dataset.scale = scale;
      img.style.transform = 'scale(' + scale + ') rotate(' + img.dataset.rotate + 'deg)';
    });
    zoomOutBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      let scale = parseFloat(img.dataset.scale) || 1;
      scale = Math.max(0.1, scale - 0.1);
      img.dataset.scale = scale;
      img.style.transform = 'scale(' + scale + ') rotate(' + img.dataset.rotate + 'deg)';
    });

    // Attach rotation control listeners (always present now).
    rotateLeftBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      let rotate = parseFloat(img.dataset.rotate) || 0;
      rotate = (rotate - 90 + 360) % 360;
      img.dataset.rotate = rotate;
      img.style.transform = 'scale(' + img.dataset.scale + ') rotate(' + rotate + 'deg)';
    });
    rotateRightBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      let rotate = parseFloat(img.dataset.rotate) || 0;
      rotate = (rotate + 90) % 360;
      img.dataset.rotate = rotate;
      img.style.transform = 'scale(' + img.dataset.scale + ') rotate(' + rotate + 'deg)';
    });

    // Save gallery details if there is more than one image.
    if (images.length > 1) {
      modal.galleryImages = images;
      modal.galleryCurrentIndex = images.findIndex(f => f.name === fileName);
    }
  } else {
    // Handle non-image file previews.
    if (extension === "pdf") {
      // build a cache‐busted URL
      const separator = fileUrl.includes('?') ? '&' : '?';
      const urlWithTs = fileUrl + separator + 't=' + Date.now();

      // open in a new tab (avoids CSP frame-ancestors)
      window.open(urlWithTs, "_blank");

      // tear down the just-created modal
      const modal = document.getElementById("filePreviewModal");
      if (modal) modal.remove();

      // stop further preview logic
      return;
    } else if (/\.(mp4|mkv|webm|mov|ogv)$/i.test(fileName)) {
      const video = document.createElement("video");
      video.src = fileUrl;
      video.controls = true;
      video.className = "image-modal-img";

      const progressKey = 'videoProgress-' + fileUrl;
      video.addEventListener("loadedmetadata", () => {
        const savedTime = localStorage.getItem(progressKey);
        if (savedTime) {
          video.currentTime = parseFloat(savedTime);
        }
      });
      video.addEventListener("timeupdate", () => {
        localStorage.setItem(progressKey, video.currentTime);
      });
      video.addEventListener("ended", () => {
        localStorage.removeItem(progressKey);
      });
      container.appendChild(video);
    } else if (/\.(mp3|wav|m4a|ogg|flac|aac|wma|opus)$/i.test(fileName)) {
      const audio = document.createElement("audio");
      audio.src = fileUrl;
      audio.controls = true;
      audio.className = "audio-modal";
      audio.style.maxWidth = "80vw";
      container.appendChild(audio);
    } else {
      container.textContent = "Preview not available for this file type.";
    }
  }
  modal.style.display = "flex";
}

// Preserve original functionality.
export function displayFilePreview(file, container) {
  const actualFile = file.file || file;
  if (!(actualFile instanceof File)) {
    console.error("displayFilePreview called with an invalid file object");
    return;
  }
  container.style.display = "inline-block";
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  if (/\.(jpg|jpeg|png|gif|bmp|webp|svg|ico)$/i.test(actualFile.name)) {
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

window.previewFile = previewFile;
window.openShareModal = openShareModal;