// filePreview.js
import { escapeHTML, showToast } from './domUtils.js';
import { fileData } from './fileListView.js';
import { t } from './i18n.js';

export function openShareModal(file, folder) {
  const existing = document.getElementById("shareModal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "shareModal";
  modal.classList.add("modal");
  modal.innerHTML = `
    <div class="modal-content share-modal-content" style="width: 600px; max-width:90vw;">
      <div class="modal-header">
        <h3>${t("share_file")}: ${escapeHTML(file.name)}</h3>
        <span class="close-image-modal" id="closeShareModal" title="Close">&times;</span>
      </div>
      <div class="modal-body">
        <p>${t("set_expiration")}</p>
        <select id="shareExpiration">
          <option value="30">30 minutes</option>
          <option value="60" selected>60 minutes</option>
          <option value="120">120 minutes</option>
          <option value="180">180 minutes</option>
          <option value="240">240 minutes</option>
          <option value="1440">1 Day</option>
        </select>
        <p>${t("password_optional")}</p>
        <input type="text" id="sharePassword" placeholder=${t("password_optional")} style="width: 100%;"/>
        <br>
        <button id="generateShareLinkBtn" class="btn btn-primary" style="margin-top:10px;">${t("generate_share_link")}</button>
        <div id="shareLinkDisplay" style="margin-top: 10px; display:none;">
          <p>${t("shareable_link")}</p>
          <input type="text" id="shareLinkInput" readonly style="width:100%;"/>
          <button id="copyShareLinkBtn" class="btn btn-primary" style="margin-top:5px;">${t("copy_link")}</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.style.display = "block";

  document.getElementById("closeShareModal").addEventListener("click", () => {
    modal.remove();
  });

  document.getElementById("generateShareLinkBtn").addEventListener("click", () => {
    const expiration = document.getElementById("shareExpiration").value;
    const password = document.getElementById("sharePassword").value;
    fetch("createShareLink.php", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": window.csrfToken
      },
      body: JSON.stringify({
        folder: folder,
        file: file.name,
        expirationMinutes: parseInt(expiration),
        password: password
      })
    })
      .then(response => response.json())
      .then(data => {
        if (data.token) {
          let shareEndpoint = document.querySelector('meta[name="share-url"]')
            ? document.querySelector('meta[name="share-url"]').getAttribute('content')
            : (window.SHARE_URL || "share.php");
          const shareUrl = `${shareEndpoint}?token=${encodeURIComponent(data.token)}`;
          const displayDiv = document.getElementById("shareLinkDisplay");
          const inputField = document.getElementById("shareLinkInput");
          inputField.value = shareUrl;
          displayDiv.style.display = "block";
        } else {
          showToast("Error generating share link: " + (data.error || "Unknown error"));
        }
      })
      .catch(err => {
        console.error("Error generating share link:", err);
        showToast("Error generating share link.");
      });
  });

  document.getElementById("copyShareLinkBtn").addEventListener("click", () => {
    const input = document.getElementById("shareLinkInput");
    input.select();
    document.execCommand("copy");
    showToast("Link copied to clipboard!");
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
          try {
            media.currentTime = 0;
          } catch(e) { }
        }
      });
      modal.style.display = "none";
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
    const img = document.createElement("img");
    img.src = fileUrl;
    img.className = "image-modal-img";
    img.style.maxWidth = "80vw";
    img.style.maxHeight = "80vh";
    container.appendChild(img);

    const images = fileData.filter(file => /\.(jpg|jpeg|png|gif|bmp|webp|svg|ico)$/i.test(file.name));
    if (images.length > 1) {
      modal.galleryImages = images;
      modal.galleryCurrentIndex = images.findIndex(f => f.name === fileName);

      const prevBtn = document.createElement("button");
      prevBtn.textContent = "‹";
      prevBtn.className = "gallery-nav-btn";
      prevBtn.style.cssText = "position: absolute; top: 50%; left: 10px; transform: translateY(-50%); background: transparent; border: none; color: white; font-size: 48px; cursor: pointer;";
      prevBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        modal.galleryCurrentIndex = (modal.galleryCurrentIndex - 1 + modal.galleryImages.length) % modal.galleryImages.length;
        let newFile = modal.galleryImages[modal.galleryCurrentIndex];
        modal.querySelector("h4").textContent = newFile.name;
        img.src = ((window.currentFolder === "root")
          ? "uploads/"
          : "uploads/" + window.currentFolder.split("/").map(encodeURIComponent).join("/") + "/")
          + encodeURIComponent(newFile.name) + "?t=" + new Date().getTime();
      });
      const nextBtn = document.createElement("button");
      nextBtn.textContent = "›";
      nextBtn.className = "gallery-nav-btn";
      nextBtn.style.cssText = "position: absolute; top: 50%; right: 10px; transform: translateY(-50%); background: transparent; border: none; color: white; font-size: 48px; cursor: pointer;";
      nextBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        modal.galleryCurrentIndex = (modal.galleryCurrentIndex + 1) % modal.galleryImages.length;
        let newFile = modal.galleryImages[modal.galleryCurrentIndex];
        modal.querySelector("h4").textContent = newFile.name;
        img.src = ((window.currentFolder === "root")
          ? "uploads/"
          : "uploads/" + window.currentFolder.split("/").map(encodeURIComponent).join("/") + "/")
          + encodeURIComponent(newFile.name) + "?t=" + new Date().getTime();
      });
      container.appendChild(prevBtn);
      container.appendChild(nextBtn);
    }
  } else {
    if (extension === "pdf") {
      const embed = document.createElement("embed");
      const separator = fileUrl.indexOf('?') === -1 ? '?' : '&';
      embed.src = fileUrl + separator + 't=' + new Date().getTime();
      embed.type = "application/pdf";
      embed.style.width = "80vw";
      embed.style.height = "80vh";
      embed.style.border = "none";
      container.appendChild(embed);
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

// Added to preserve the original functionality.
export function displayFilePreview(file, container) {
  const actualFile = file.file || file;
  
  // Validate that actualFile is indeed a File
  if (!(actualFile instanceof File)) {
    console.error("displayFilePreview called with an invalid file object");
    return;
  }
  
  container.style.display = "inline-block";
  
  // Clear the container safely without using innerHTML
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  
  if (/\.(jpg|jpeg|png|gif|bmp|webp|svg|ico)$/i.test(actualFile.name)) {
    const img = document.createElement("img");
    // Set the image source using a Blob URL (this is considered safe)
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