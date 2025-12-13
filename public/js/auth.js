import { sendRequest } from './networkUtils.js?v={{APP_QVER}}';
import { t, applyTranslations } from './i18n.js?v={{APP_QVER}}';
import {
  toggleVisibility,
  showToast as originalShowToast,
  attachEnterKeyListener,
  showCustomConfirmModal
} from './domUtils.js?v={{APP_QVER}}';
import { loadFileList } from './fileListView.js?v={{APP_QVER}}';
import { initFileActions } from './fileActions.js?v={{APP_QVER}}';
import { renderFileTable } from './fileListView.js?v={{APP_QVER}}';
import { loadFolderTree } from './folderManager.js?v={{APP_QVER}}';
import {
  openTOTPLoginModal as originalOpenTOTPLoginModal,
  openUserPanel,
  openTOTPModal,
  closeTOTPModal,
  setLastLoginData,
  openApiModal
} from './authModals.js?v={{APP_QVER}}';
import { openAdminPanel } from './adminPanel.js?v={{APP_QVER}}';
import { initializeApp, triggerLogout } from './appCore.js?v={{APP_QVER}}';

// Production OIDC configuration (override via API as needed)
const currentOIDCConfig = {
  providerUrl: "https://your-oidc-provider.com",
  clientId: "",
  clientSecret: "",
  redirectUri: "https://yourdomain.com/api/auth/auth.php?oidc=callback",
  globalOtpauthUrl: ""
};
window.currentOIDCConfig = currentOIDCConfig;



(function installToastFilter() {
  window.__FR_TOAST_FILTER__ = function (msgKeyOrText) {
    const isDemoMode = !!window.__FR_DEMO__;

    // Suppress the nag while doing TOTP step-up
    if (window.pendingTOTP && (msgKeyOrText === 'please_log_in_to_continue' ||
      /please log in/i.test(String(msgKeyOrText)))) {
      return null; // suppress
    }

    // Demo mode: swap login prompt for demo creds
    if (isDemoMode &&
        (msgKeyOrText === 'please_log_in_to_continue' ||
         /please log in/i.test(String(msgKeyOrText)))) {
      return "Demo site — use:\nUsername: demo\nPassword: demo";
    }

    // Try to translate keys; pass through plain text
    try {
      const maybe = t(msgKeyOrText);
      if (typeof maybe === 'string' && maybe !== msgKeyOrText) return maybe;
    } catch { }
    return msgKeyOrText;
  };
})();

function queueWelcomeToast(name) {
  const uname = String(name || '').trim().slice(0, 80);
  if (!uname) return;
  // show immediately (if we don’t reload instantly)
  try {
    window.dispatchEvent(new CustomEvent('filerise:toast', {
      detail: { message: `Welcome back, ${uname}!`, duration: 2000 }
    }));
  } catch { }

  // and persist for after-reload (flushed by main.js on boot)
  try {
    sessionStorage.setItem('welcomeMessage', `Welcome back, ${uname}!`);
  } catch { }
}

/* ----------------- TOTP & Toast Overrides ----------------- */
// detect if we’re in a pending‑TOTP state
window.pendingTOTP = new URLSearchParams(window.location.search).get('totp_required') === '1';

// override showToast to suppress the "Please log in to continue." toast during TOTP

function showToast(msgKeyOrText, type) {
  const isDemoMode = !!window.__FR_DEMO__;

  // For the pre-login prompt in demo mode, show demo creds instead
  if (isDemoMode &&
      (msgKeyOrText === "please_log_in_to_continue" ||
       /please log in/i.test(String(msgKeyOrText)))) {
    return originalShowToast("Demo site — use: \nUsername: demo\nPassword: demo", 12000);
  }

  // Don’t nag during pending TOTP
  if (window.pendingTOTP && msgKeyOrText === "please_log_in_to_continue") {
    return;
  }

  // Translate if a key; otherwise pass through the raw text
  let msg = msgKeyOrText;
  try {
    const translated = t(msgKeyOrText);
    if (typeof translated === "string" && translated !== msgKeyOrText) {
      msg = translated;
    }
  } catch { }

  return originalShowToast(msg);
}

window.showToast = showToast;

const originalFetch = window.fetch;

/*
 * @param {string} url
 * @param {object} options
 * @returns {Promise<Response>}
 */

export async function fetchWithCsrf(url, options = {}) {
  const original = window.fetch.bind(window);
  const wantJson = (options.headers && /json/i.test(options.headers['Content-Type'] || '')) || typeof options.body === 'string' && options.body.trim().startsWith('{');

  options = { credentials: 'include', ...options };
  options.headers = {
    'Accept': 'application/json',
    ...(options.headers || {})
  };
  if (window.csrfToken) {
    options.headers['X-CSRF-Token'] = window.csrfToken;
  }

  async function retryWithFreshCsrf(asFormFallback = false) {
    const tokRes = await original('/api/auth/token.php', { credentials: 'include' });
    if (tokRes.ok) {
      const body = await tokRes.json().catch(() => ({}));
      if (body?.csrf_token) {
        window.csrfToken = body.csrf_token;
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) meta.content = body.csrf_token;
        options.headers['X-CSRF-Token'] = body.csrf_token;
      }
    }
    if (asFormFallback && wantJson) {
      // convert JSON body into x-www-form-urlencoded
      const orig = options.body && typeof options.body === 'string' ? JSON.parse(options.body) : {};
      options.body = toFormBody(orig);
      options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    return original(url, options);
  }

  let res = await original(url, options);

  // If API doesn’t like JSON or token is stale
  if (res.status === 400 || res.status === 403 || res.status === 415) {
    // 1) retry with fresh CSRF keeping same encoding
    res = await retryWithFreshCsrf(false);
    if (!res.ok && wantJson) {
      // 2) retry again as form-encoded
      res = await retryWithFreshCsrf(true);
    }
  }
  return res;
}

// wrap the TOTP modal opener to disable other login buttons only for Basic/OIDC flows
function openTOTPLoginModal() {
  originalOpenTOTPLoginModal();

  const isFormLogin = Boolean(window.__lastLoginData);
  if (!isFormLogin) {
    // disable Basic‑Auth link
    const basicLink = document.querySelector("a[href='/api/auth/login_basic.php']");
    if (basicLink) {
      basicLink.style.pointerEvents = 'none';
      basicLink.style.opacity = '0.5';
    }
    // disable OIDC button
    const oidcBtn = document.getElementById("oidcLoginBtn");
    if (oidcBtn) {
      oidcBtn.disabled = true;
      oidcBtn.style.opacity = '0.5';
    }
    // hide the form login
    const authForm = document.getElementById("authForm");
    if (authForm) authForm.style.display = 'none';
  }
}

/* ----------------- Utility Functions ----------------- */
function updateItemsPerPageSelect() {
  const selectElem = document.querySelector(".form-control.bottom-select");
  if (selectElem) {
    selectElem.value = localStorage.getItem("itemsPerPage") || "10";
  }
}

function applyProxyBypassUI() {
  const bypass = localStorage.getItem("authBypass") === "true";
  const loginContainer = document.getElementById("loginForm");
  if (loginContainer) {
    loginContainer.style.display = bypass ? "none" : "";
  }
}

function updateLoginOptionsUI({ disableFormLogin, disableBasicAuth, disableOIDCLogin }) {
  const authForm = document.getElementById("authForm");
  if
    (authForm) {
    authForm.style.display = disableFormLogin ? "none" : "block";
    setTimeout(() => {
      const loginInput = document.getElementById('loginUsername');
      if (loginInput) loginInput.focus();
    }, 0);
  }
  const basicAuthLink = document.querySelector("a[href='/api/auth/login_basic.php']");
  if (basicAuthLink) basicAuthLink.style.display = disableBasicAuth ? "none" : "inline-block";
  const oidcLoginBtn = document.getElementById("oidcLoginBtn");
  if (oidcLoginBtn) oidcLoginBtn.style.display = disableOIDCLogin ? "none" : "inline-block";
}

function updateLoginOptionsUIFromStorage() {
  updateLoginOptionsUI({
    disableFormLogin: localStorage.getItem("disableFormLogin") === "true",
    disableBasicAuth: localStorage.getItem("disableBasicAuth") === "true",
    disableOIDCLogin: localStorage.getItem("disableOIDCLogin") === "true",
    authBypass: localStorage.getItem("authBypass") === "true"
  });
}

export function loadAdminConfigFunc() {
  return fetch("/api/siteConfig.php", { credentials: "include" })
    .then(async (response) => {
      // If a proxy or some edge returns 204/empty, handle gracefully
      let config = {};
      try { config = await response.json(); } catch { config = {}; }

      const headerTitle = config.header_title || "FileRise";
      localStorage.setItem("headerTitle", headerTitle);

      document.title = headerTitle;
      const lo = config.loginOptions || {};
      localStorage.setItem("disableFormLogin", String(!!lo.disableFormLogin));
      localStorage.setItem("disableBasicAuth", String(!!lo.disableBasicAuth));
      localStorage.setItem("disableOIDCLogin", String(!!lo.disableOIDCLogin));
      localStorage.setItem("globalOtpauthUrl", config.globalOtpauthUrl || "otpauth://totp/{label}?secret={secret}&issuer=FileRise");
      // These may be absent for non-admins; default them
      localStorage.setItem("authBypass", String(!!lo.authBypass));
      localStorage.setItem("authHeaderName", lo.authHeaderName || "X-Remote-User");

      updateLoginOptionsUIFromStorage();

      const headerTitleElem = document.querySelector(".header-title h1");
      if (headerTitleElem) headerTitleElem.textContent = headerTitle;
    })
    .catch(() => {
      // Fallback defaults if request truly fails
      localStorage.setItem("headerTitle", "FileRise");
      localStorage.setItem("disableFormLogin", "false");
      localStorage.setItem("disableBasicAuth", "false");
      localStorage.setItem("disableOIDCLogin", "false");
      localStorage.setItem("globalOtpauthUrl", "otpauth://totp/{label}?secret={secret}&issuer=FileRise");
      updateLoginOptionsUIFromStorage();

      const headerTitleElem = document.querySelector(".header-title h1");
      if (headerTitleElem) headerTitleElem.textContent = "FileRise";
    });
}

function insertAfter(newNode, referenceNode) {
  referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}

async function fetchProfilePicture() {
  try {
    const res = await fetch('/api/profile/getCurrentUser.php', {
      credentials: 'include'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const info = await res.json();
    let pic = info.profile_picture || '';
    // --- take only what's after the *last* colon ---
    const parts = pic.split(':');
    pic = parts[parts.length - 1] || '';
    // strip any stray leading colons
    pic = pic.replace(/^:+/, '');
    // ensure exactly one leading slash
    if (pic && !pic.startsWith('/')) pic = '/' + pic;
    return pic;
  } catch (e) {
    console.warn('fetchProfilePicture failed:', e);
    return '';
  }
}

export async function updateAuthenticatedUI(data) {
  // Save latest auth data for later reuse
  window.__lastAuthData = data;

  // 1) Remove loading overlay safely
  const loading = document.getElementById('loadingOverlay');
  if (loading) loading.remove();

  // 2) Show main UI
  document.querySelector('.main-wrapper').style.display = '';
  document.getElementById('loginForm').style.display = 'none';
  toggleVisibility("loginForm", false);
  toggleVisibility("mainOperations", true);
  toggleVisibility("uploadFileForm", true);
  toggleVisibility("fileListContainer", true);
  attachEnterKeyListener("removeUserModal", "deleteUserBtn");
  attachEnterKeyListener("changePasswordModal", "saveNewPasswordBtn");
  document.querySelector(".header-buttons").style.visibility = "visible";

  // 3) Persist auth flags (unchanged)
  if (typeof data.totp_enabled !== "undefined") {
    localStorage.setItem("userTOTPEnabled", data.totp_enabled ? "true" : "false");
  }
  if (data.username) {
    localStorage.setItem("username", data.username);
  }
  if (typeof data.folderOnly !== "undefined") {
    localStorage.setItem("folderOnly", data.folderOnly ? "true" : "false");
    localStorage.setItem("readOnly", data.readOnly ? "true" : "false");
    localStorage.setItem("disableUpload", data.disableUpload ? "true" : "false");
  }

  // 4) Fetch up-to-date profile picture — ALWAYS overwrite localStorage
  const profilePicUrl = await fetchProfilePicture();
  localStorage.setItem("profilePicUrl", profilePicUrl);

  // 5) Build / update header buttons
  const headerButtons = document.querySelector(".header-buttons");
  const firstButton = headerButtons ? headerButtons.firstElementChild : null;

  // c) user dropdown on non-demo
{
    let dd = document.getElementById("userDropdown");

    // choose icon *or* img
    const avatarHTML = profilePicUrl
      ? `<img src="${profilePicUrl}" style="width:24px;height:24px;border-radius:50%;vertical-align:middle;">`
      : `<i class="material-icons">account_circle</i>`;

    // fallback username if missing
    const usernameText = data.username
      || localStorage.getItem("username")
      || "";

    if (!dd) {
      dd = document.createElement("div");
      dd.id = "userDropdown";
      dd.classList.add("user-dropdown");

      // toggle button
      const toggle = document.createElement("button");
      toggle.id = "userDropdownToggle";
      toggle.classList.add("btn", "btn-user");
      toggle.setAttribute("title", t("user_settings"));
      toggle.innerHTML = `
        ${avatarHTML}
        <span class="dropdown-username">${usernameText}</span>
        <span class="dropdown-caret"></span>
      `;
      dd.append(toggle);

      // menu
      const menu = document.createElement("div");
      menu.classList.add("user-menu");
      menu.innerHTML = `
        <div class="item" id="menuUserPanel">
          <i class="material-icons folder-icon">person</i> ${t("user_panel")}
        </div>
        ${data.isAdmin ? `
        <div class="item" id="menuAdminPanel">
          <i class="material-icons folder-icon">admin_panel_settings</i> ${t("admin_panel")}
        </div>` : ''}
        <div class="item" id="menuApiDocs">
          <i class="material-icons folder-icon">description</i> ${t("api_docs")}
        </div>
        <div class="item" id="menuLogout">
          <i class="material-icons folder-icon">logout</i> ${t("logout")}
        </div>
      `;
      dd.append(menu);

      // insert
      const dm = document.getElementById("darkModeToggle");
      if (dm) insertAfter(dd, dm);
      else if (firstButton) insertAfter(dd, firstButton);
      else headerButtons.appendChild(dd);

      // open/close
      toggle.addEventListener("click", e => {
        e.stopPropagation();
        menu.classList.toggle("show");
      });
      document.addEventListener("click", () => menu.classList.remove("show"));

      // actions
      document.getElementById("menuUserPanel")
        .addEventListener("click", () => {
          menu.classList.remove("show");
          openUserPanel();
        });
      if (data.isAdmin) {
        document.getElementById("menuAdminPanel")
          .addEventListener("click", () => {
            menu.classList.remove("show");
            openAdminPanel();
          });
      }
      document.getElementById("menuApiDocs")
        .addEventListener("click", () => {
          menu.classList.remove("show");
          openApiModal();
        });
      document.getElementById("menuLogout")
        .addEventListener("click", () => {
          menu.classList.remove("show");
          triggerLogout();
        });

    } else {
      // update avatar & username only
      const tog = dd.querySelector("#userDropdownToggle");
      tog.innerHTML = `
        ${avatarHTML}
        <span class="dropdown-username">${usernameText}</span>
        <span class="dropdown-caret"></span>
      `;
      dd.style.display = "inline-block";
    }
  }

  // 6) Finalize
  initializeApp();
  applyTranslations();
  updateItemsPerPageSelect();
  updateLoginOptionsUIFromStorage();
}

function checkAuthentication(showLoginToast = true) {
  return sendRequest("/api/auth/checkAuth.php")
    .then(data => {
      if (data.setup) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.remove();

        // show the wrapper (so the login form can be visible)
        document.querySelector('.main-wrapper').style.display = '';
        document.getElementById('loginForm').style.display = 'none';
        window.setupMode = true;
        if (showLoginToast) showToast("Setup mode: No users found. Please add an admin user.");
        toggleVisibility("loginForm", false);
        toggleVisibility("mainOperations", false);
        document.querySelector(".header-buttons").style.visibility = "hidden";
        toggleVisibility("addUserModal", true);
        document.getElementById("newUsername").focus();
        return false;
      }
      window.setupMode = false;
      if (data.authenticated) {

        localStorage.setItem('isAdmin', data.isAdmin ? 'true' : 'false');
        localStorage.setItem("folderOnly", data.folderOnly);
        localStorage.setItem("readOnly", data.readOnly);
        localStorage.setItem("disableUpload", data.disableUpload);
        updateLoginOptionsUIFromStorage();
        applyProxyBypassUI();
        if (typeof data.totp_enabled !== "undefined") {
          localStorage.setItem("userTOTPEnabled", data.totp_enabled ? "true" : "false");
        }
        if (data.csrf_token) {
          window.csrfToken = data.csrf_token;
          document.querySelector('meta[name="csrf-token"]').content = data.csrf_token;
        }
        updateAuthenticatedUI(data);
        return data;

        // at the end of updateAuthenticatedUI(data)
        if (!window.__FR_FLAGS?.initialized && typeof initializeApp === 'function') {
          initializeApp();
          window.__FR_FLAGS.initialized = true;
        }
        if (typeof applyTranslations === 'function') applyTranslations();
        if (typeof updateLoginOptionsUIFromStorage === 'function') updateLoginOptionsUIFromStorage();
      } else {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.remove();

        // show the wrapper (so the login form can be visible)
        document.querySelector('.main-wrapper').style.display = '';
        document.getElementById('loginForm').style.display = '';
        if (showLoginToast) showToast("Please log in to continue.");
        toggleVisibility("loginForm", !(localStorage.getItem("authBypass") === "true"));
        toggleVisibility("mainOperations", false);
        toggleVisibility("uploadFileForm", false);
        toggleVisibility("fileListContainer", false);
        document.querySelector(".header-buttons").style.visibility = "hidden";
        return false;
      }
    })
    .catch(() => false);
}

/* ----------------- Authentication Submission ----------------- */
async function primeCsrfStrict() {
  const r = await fetch('/api/auth/token.php', { credentials: 'include' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.csrf_token) throw new Error('CSRF missing');
  window.csrfToken = j.csrf_token;
  const m = document.querySelector('meta[name="csrf-token"]');
  if (m) m.content = j.csrf_token;
}

function toFormBody(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj || {})) p.set(k, v == null ? '' : String(v));
  return p.toString();
}

async function safeJson(res) {
  const ct = res.headers.get('content-type') || '';
  if (!/application\/json/i.test(ct)) return null;
  try { return await res.clone().json(); } catch { return null; }
}

async function sniffTOTP(res, bodyMaybe) {
  if (res.headers.get('X-TOTP-Required') === '1') return true;
  if (res.redirected && /[?&]totp_required=1\b/.test(res.url)) return true;
  const body = bodyMaybe ?? await safeJson(res);
  if (body && (body.totp_required || body.error === 'TOTP_REQUIRED')) return true;
  try {
    const txt = await res.clone().text();
    if (/\btotp_required\s*=\s*1\b/i.test(txt)) return true;
  } catch { }
  return false;
}

async function isAuthedNow() {
  try {
    const r = await fetch('/api/auth/checkAuth.php', { credentials: 'include' });
    const j = await r.json().catch(() => ({}));
    return !!j.authenticated;
  } catch { return false; }
}

function rafTick(times = 2) {
  return new Promise(res => {
    const step = () => { if (--times <= 0) res(); else requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}

async function fetchAuthSnapshot() {
  try {
    const r = await fetch('/api/auth/checkAuth.php', { credentials: 'include' });
    return await r.json();
  } catch { return {}; }
}

async function syncPermissionsToLocalStorage() {
  try {
    const r = await fetch('/api/getUserPermissions.php', { credentials: 'include' });
    const perm = await r.json();
    if (perm && typeof perm === 'object') {
      localStorage.setItem('folderOnly', perm.folderOnly ? 'true' : 'false');
      localStorage.setItem('readOnly', perm.readOnly ? 'true' : 'false');
      localStorage.setItem('disableUpload', perm.disableUpload ? 'true' : 'false');
    }
  } catch { /* non-fatal */ }
}

// ——— main ———
let __loginInFlight = false;

async function submitLogin(data) {
  if (__loginInFlight) return;
  __loginInFlight = true;

  const payload = {
    username: String(data.username || '').trim(),
    password: String(data.password || '').trim(),
    remember_me: data.remember_me ? 1 : 0
  };

  setLastLoginData(payload);
  window.__lastLoginData = payload;

  try {
    await primeCsrfStrict();

    // Attempt #1 — JSON
    let res = await fetchWithCsrf('/api/auth/auth.php', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    });
    let body = await safeJson(res);

    // TOTP requested?
    if (await sniffTOTP(res, body)) {
      try { await primeCsrfStrict(); } catch { }
      window.pendingTOTP = true;
      try {
        const auth = await import('/js/auth.js?v={{APP_QVER}}');
        if (typeof auth.openTOTPLoginModal === 'function') auth.openTOTPLoginModal();
      } catch { }
      return;
    }

    // Full success (no TOTP)
    if (body && (body.success || body.status === 'ok' || body.authenticated)) {

      await syncPermissionsToLocalStorage();
      return afterLogin();
    }

    // Cookie set but non-JSON body — double check session
    if (!body && await isAuthedNow()) {

      await syncPermissionsToLocalStorage();

      return afterLogin();
    }

    // Attempt #2 — form fallback
    res = await fetchWithCsrf('/api/auth/auth.php', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: toFormBody(payload)
    });
    body = await safeJson(res);

    if (await sniffTOTP(res, body)) {
      try { await primeCsrfStrict(); } catch { }
      window.pendingTOTP = true;
      try {
        const auth = await import('/js/auth.js?v={{APP_QVER}}');
        if (typeof auth.openTOTPLoginModal === 'function') auth.openTOTPLoginModal();
      } catch { }
      return;
    }

    if (body && (body.success || body.status === 'ok' || body.authenticated)) {
      await syncPermissionsToLocalStorage();

      return afterLogin();
    }

    if (!body && await isAuthedNow()) {

      await syncPermissionsToLocalStorage();

      return afterLogin();
    }

    // Rate limit still respected
    if (body?.error && /Too many failed login attempts/i.test(body.error)) {
      showToast(body.error);
      const btn = document.querySelector("#authForm button[type='submit']");
      if (btn) {
        btn.disabled = true;
        setTimeout(() => {
          btn.disabled = false;
          showToast("You can now try logging in again.");
        }, 30 * 60 * 1000);
      }
      return;
    }

    showToast('Login failed' + (body?.error ? `: ${body.error}` : ''));

  } catch (e) {
    showToast('Login failed: ' + (e.message || 'Unknown error'));
  } finally {
    __loginInFlight = false;
  }
}

window.submitLogin = submitLogin;

/* ----------------- Other Helpers ----------------- */
window.changeItemsPerPage = function (value) {
  localStorage.setItem("itemsPerPage", value);
  if (typeof renderFileTable === "function") renderFileTable(window.currentFolder || "root");
};

function resetUserForm() {
  document.getElementById("newUsername").value = "";
  document.getElementById("addUserPassword").value = "";
}

function closeAddUserModal() {
  toggleVisibility("addUserModal", false);
  resetUserForm();
}

function closeRemoveUserModal() {
  toggleVisibility("removeUserModal", false);
  document.getElementById("removeUsernameSelect").innerHTML = "";
}

function loadUserList() {
  // Updated path: from "getUsers.php" to "api/getUsers.php"
  fetch("/api/getUsers.php", { credentials: "include" })
    .then(response => response.json())
    .then(data => {
      // Assuming the endpoint returns an array of users.
      const users = Array.isArray(data) ? data : (data.users || []);
      const selectElem = document.getElementById("removeUsernameSelect");
      selectElem.innerHTML = "";
      users.forEach(user => {
        const option = document.createElement("option");
        option.value = user.username;
        option.textContent = user.username;
        selectElem.appendChild(option);
      });
      if (selectElem.options.length === 0) {
        showToast("No other users found to remove.");
        closeRemoveUserModal();
      }
    })
    .catch(() => { /* handle errors if needed */ });
}
window.loadUserList = loadUserList;

function initAuth() {
  checkAuthentication(false);
  loadAdminConfigFunc();
  const authForm = document.getElementById("authForm");
  if (authForm) {
    authForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const rememberMe = document.getElementById("rememberMeCheckbox")
        ? document.getElementById("rememberMeCheckbox").checked
        : false;
      const formData = {
        username: document.getElementById("loginUsername").value.trim(),
        password: document.getElementById("loginPassword").value.trim(),
        remember_me: rememberMe
      };
      submitLogin(formData);
    });
  }

  document.getElementById("addUserBtn").addEventListener("click", function () {
    resetUserForm();
    toggleVisibility("addUserModal", true);
    document.getElementById("newUsername").focus();
  });

  // remove your old saveUserBtn click-handler…

  // instead:
  const addUserForm = document.getElementById("addUserForm");
  addUserForm.addEventListener("submit", function (e) {
    e.preventDefault();   // stop the browser from reloading the page

    const newUsername = document.getElementById("newUsername").value.trim();
    const newPassword = document.getElementById("addUserPassword").value.trim();
    const isAdmin = document.getElementById("isAdmin").checked;

    if (!newUsername || !newPassword) {
      showToast("Username and password are required!");
      return;
    }

    let url = "/api/addUser.php";
    if (window.setupMode) url += "?setup=1";

    fetchWithCsrf(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: newUsername, password: newPassword, isAdmin })
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          showToast("User added successfully!");
          closeAddUserModal();
          checkAuthentication(false);
          if (window.setupMode) {
            toggleVisibility("loginForm", true);
          }
        } else {
          showToast("Error: " + (data.error || "Could not add user"));
        }
      })
      .catch(() => {
        showToast("Error: Could not add user");
      });
  });
  document.getElementById("cancelUserBtn").addEventListener("click", closeAddUserModal);

  document.getElementById("removeUserBtn").addEventListener("click", function () {
    loadUserList();
    toggleVisibility("removeUserModal", true);
  });
  document.getElementById("deleteUserBtn").addEventListener("click", async function () {
    const selectElem = document.getElementById("removeUsernameSelect");
    const usernameToRemove = selectElem.value;
    if (!usernameToRemove) {
      showToast("Please select a user to remove.");
      return;
    }
    const confirmed = await showCustomConfirmModal("Are you sure you want to delete user " + usernameToRemove + "?");
    if (!confirmed) return;
    fetchWithCsrf("/api/removeUser.php", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: usernameToRemove })
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          showToast("User removed successfully!");
          closeRemoveUserModal();
          loadUserList();
        } else {
          showToast("Error: " + (data.error || "Could not remove user"));
        }
      })
      .catch(() => { });
  });
  document.getElementById("cancelRemoveUserBtn").addEventListener("click", closeRemoveUserModal);
  document.getElementById("changePasswordBtn").addEventListener("click", function () {
    if (window.__FR_DEMO__) {
      showToast("Password changes are disabled on the public demo.");
      return;
    }
    document.getElementById("changePasswordModal").style.display = "block";
    document.getElementById("oldPassword").focus();
  });
  document.getElementById("closeChangePasswordModal").addEventListener("click", function () {
    document.getElementById("changePasswordModal").style.display = "none";
  });
  document.getElementById("saveNewPasswordBtn").addEventListener("click", function () {
    if (window.__FR_DEMO__) {
      showToast("Password changes are disabled on the public demo.");
      return;
    }
    const oldPassword = document.getElementById("oldPassword").value.trim();
    const newPassword = document.getElementById("newPassword").value.trim();
    const confirmPassword = document.getElementById("confirmPassword").value.trim();
    if (!oldPassword || !newPassword || !confirmPassword) {
      showToast("Please fill in all fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("New passwords do not match.");
      return;
    }
    const data = { oldPassword, newPassword, confirmPassword };
    fetchWithCsrf("/api/changePassword.php", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    })
      .then(response => response.json())
      .then(result => {
        if (result.success) {
          showToast(result.success);
          document.getElementById("oldPassword").value = "";
          document.getElementById("newPassword").value = "";
          document.getElementById("confirmPassword").value = "";
          document.getElementById("changePasswordModal").style.display = "none";
        } else {
          showToast("Error: " + (result.error || "Could not change password."));
        }
      })
      .catch(() => { showToast("Error changing password."); });
  });
}

document.addEventListener("DOMContentLoaded", function () {
  updateItemsPerPageSelect();
  updateLoginOptionsUI({
    disableFormLogin: localStorage.getItem("disableFormLogin") === "true",
    disableBasicAuth: localStorage.getItem("disableBasicAuth") === "true",
    disableOIDCLogin: localStorage.getItem("disableOIDCLogin") === "true"
  });

  const oidcLoginBtn = document.getElementById("oidcLoginBtn");
  if (oidcLoginBtn) {
    oidcLoginBtn.addEventListener("click", () => {
      window.location.href = "/api/auth/auth.php?oidc=initiate";
    });
  }

  // If TOTP is pending, show modal and skip normal auth init
  if (window.pendingTOTP) {
    openTOTPLoginModal();
    return;
  }
});

export { initAuth, checkAuthentication, openTOTPLoginModal };
