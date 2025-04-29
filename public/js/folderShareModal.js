// js/folderShareModal.js
import { escapeHTML, showToast } from './domUtils.js';
import { t } from './i18n.js';

export function openFolderShareModal(folder) {
  // Remove any existing modal
  const existing = document.getElementById("folderShareModal");
  if (existing) existing.remove();

  // Build modal
  const modal = document.createElement("div");
  modal.id = "folderShareModal";
  modal.classList.add("modal");
  modal.innerHTML = `
    <div class="modal-content share-modal-content" style="width:600px;max-width:90vw;">
      <div class="modal-header">
        <h3>${t("share_folder")}: ${escapeHTML(folder)}</h3>
        <span id="closeFolderShareModal" title="${t("close")}" class="close-image-modal">&times;</span>
      </div>
      <div class="modal-body">
        <p>${t("set_expiration")}</p>
        <select id="folderShareExpiration" style="width:100%;padding:5px;">
          <option value="30">30 ${t("minutes")}</option>
          <option value="60" selected>60 ${t("minutes")}</option>
          <option value="120">120 ${t("minutes")}</option>
          <option value="180">180 ${t("minutes")}</option>
          <option value="240">240 ${t("minutes")}</option>
          <option value="1440">1 ${t("day")}</option>
          <option value="custom">${t("custom")}&hellip;</option>
        </select>

        <div id="customFolderExpirationContainer" style="display:none;margin-top:10px;">
          <label for="customFolderExpirationValue">${t("duration")}:</label>
          <input type="number" id="customFolderExpirationValue" min="1" value="1" style="width:60px;margin:0 8px;"/>
          <select id="customFolderExpirationUnit">
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
          id="folderSharePassword"
          placeholder="${t("enter_password")}"
          style="width:100%;padding:5px;"
        />

        <label style="margin-top:10px;display:block;">
          <input type="checkbox" id="folderShareAllowUpload" />
          ${t("allow_uploads")}
        </label>

        <button
          id="generateFolderShareLinkBtn"
          class="btn btn-primary"
          style="margin-top:15px;"
        >
          ${t("generate_share_link")}
        </button>

        <div id="folderShareLinkDisplay" style="margin-top:15px;display:none;">
          <p>${t("shareable_link")}</p>
          <input type="text" id="folderShareLinkInput" readonly style="width:100%;padding:5px;"/>
          <button id="copyFolderShareLinkBtn" class="btn btn-secondary" style="margin-top:5px;">
            ${t("copy_link")}
          </button>
        </div>
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
      const csrfToken   = document.querySelector('meta[name="csrf-token"]').getAttribute("content");
      if (!csrfToken) {
        showToast(t("csrf_error"));
        return;
      }

      fetch("/api/folder/createShareFolderLink.php", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken
        },
        body: JSON.stringify({
          folder,
          expirationValue: value,
          expirationUnit: unit,
          password,
          allowUpload
        })
      })
      .then(r => r.json())
      .then(data => {
        if (data.token && data.link) {
          document.getElementById("folderShareLinkInput").value = data.link;
          document.getElementById("folderShareLinkDisplay").style.display = "block";
          showToast(t("share_link_generated"));
        } else {
          showToast(t("error_generating_share_link") + ": " + (data.error||t("unknown_error")));
        }
      })
      .catch(err => {
        console.error(err);
        showToast(t("error_generating_share_link") + ": " + t("unknown_error"));
      });
    });

  // Copy
  document.getElementById("copyFolderShareLinkBtn")
    .addEventListener("click", () => {
      const inp = document.getElementById("folderShareLinkInput");
      inp.select();
      document.execCommand("copy");
      showToast(t("link_copied"));
    });
}