import { showToast, attachEnterKeyListener } from './domUtils.js?v={{APP_QVER}}';
import { t } from './i18n.js?v={{APP_QVER}}';
import { withBase } from './basePath.js?v={{APP_QVER}}';

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
      fetch("/api/profile/totp_recover.php", {
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
            window.location.href = withBase("/index.html");
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

      const res = await fetch("/api/profile/totp_verify.php", {
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
          window.location.href = withBase("/index.html");
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
      const verifyRes = await fetch("/api/profile/totp_verify.php", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": window.csrfToken },
        body: JSON.stringify({ totp_code: code })
      });
      if (!verifyRes.ok) { showToast(t("totp_verification_failed")); return; }
      const result = await verifyRes.json();
      if (result.status !== "ok") { showToast(result.message || t("totp_verification_failed")); return; }
      showToast(t("totp_enabled_successfully"));
      const saveRes = await fetch("/api/profile/totp_saveCode.php", {
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
  fetch("/api/profile/totp_setup.php", {
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
    fetch("/api/profile/totp_disable.php", {
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
