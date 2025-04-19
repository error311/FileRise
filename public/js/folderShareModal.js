// folderShareModal.js
import { escapeHTML, showToast } from './domUtils.js';
import { t } from './i18n.js';

export function openFolderShareModal(folder) {
  // Remove any existing folder share modal
  const existing = document.getElementById("folderShareModal");
  if (existing) existing.remove();

  // Create the modal container
  const modal = document.createElement("div");
  modal.id = "folderShareModal";
  modal.classList.add("modal");
  modal.innerHTML = `
    <div class="modal-content share-modal-content" style="width: 600px; max-width: 90vw;">
      <div class="modal-header">
        <h3>${t("share_folder")}: ${escapeHTML(folder)}</h3>
        <span class="close-image-modal" id="closeFolderShareModal" title="Close">&times;</span>
      </div>
      <div class="modal-body">
        <p>${t("set_expiration")}</p>
        <select id="folderShareExpiration">
          <option value="30">30 ${t("minutes")}</option>
          <option value="60" selected>60 ${t("minutes")}</option>
          <option value="120">120 ${t("minutes")}</option>
          <option value="180">180 ${t("minutes")}</option>
          <option value="240">240 ${t("minutes")}</option>
          <option value="1440">1 ${t("day")}</option>
        </select>
        <p>${t("password_optional")}</p>
        <input type="text" id="folderSharePassword" placeholder="${t("enter_password")}" style="width: 100%;"/>
        <br>
        <label>
          <input type="checkbox" id="folderShareAllowUpload"> ${t("allow_uploads")}
        </label>
        <br><br>
        <button id="generateFolderShareLinkBtn" class="btn btn-primary" style="margin-top: 10px;">${t("generate_share_link")}</button>
        <div id="folderShareLinkDisplay" style="margin-top: 10px; display: none;">
          <p>${t("shareable_link")}</p>
          <input type="text" id="folderShareLinkInput" readonly style="width: 100%;"/>
          <button id="copyFolderShareLinkBtn" class="btn btn-primary" style="margin-top: 5px;">${t("copy_link")}</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.style.display = "block";

  // Close button handler
  document.getElementById("closeFolderShareModal").addEventListener("click", () => {
    modal.remove();
  });

  // Handler for generating the share link
  document.getElementById("generateFolderShareLinkBtn").addEventListener("click", () => {
    const expiration = document.getElementById("folderShareExpiration").value;
    const password = document.getElementById("folderSharePassword").value;
    const allowUpload = document.getElementById("folderShareAllowUpload").checked ? 1 : 0;
    
    // Retrieve the CSRF token from the meta tag.
    const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute("content");
    if (!csrfToken) {
      showToast(t("csrf_error"));
      return;
    }
    // Post to the createFolderShareLink endpoint.
    fetch("/api/folder/createShareFolderLink.php", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken
      },
      body: JSON.stringify({
        folder: folder,
        expirationMinutes: parseInt(expiration, 10),
        password: password,
        allowUpload: allowUpload
      })
    })
      .then(response => response.json())
      .then(data => {
        if (data.token && data.link) {
          const shareUrl = data.link;
          const displayDiv = document.getElementById("folderShareLinkDisplay");
          const inputField = document.getElementById("folderShareLinkInput");
          inputField.value = shareUrl;
          displayDiv.style.display = "block";
          showToast(t("share_link_generated"));
        } else {
          showToast(t("error_generating_share_link") + ": " + (data.error || t("unknown_error")));
        }
      })
      .catch(err => {
        console.error("Error generating folder share link:", err);
        showToast(t("error_generating_share_link") + ": " + (err.error || t("unknown_error")));
      });
  });

  // Copy share link button handler
  document.getElementById("copyFolderShareLinkBtn").addEventListener("click", () => {
    const input = document.getElementById("folderShareLinkInput");
    input.select();
    document.execCommand("copy");
    showToast(t("link_copied"));
  });
}