// public/js/portal-login.js

// -------- URL helpers --------
function getRedirectTarget() {
    try {
      const url = new URL(window.location.href);
      const r = url.searchParams.get('redirect');
      return r && r.trim() ? r.trim() : '/';
    } catch {
      return '/';
    }
  }
  
  function getPortalSlugFromUrl() {
    try {
      const url = new URL(window.location.href);
  
      // 1) Direct ?slug=portal-xxxxx on login page (if ever used)
      let slug = url.searchParams.get('slug');
      if (slug && slug.trim()) {
        console.log('portal-login: slug from top-level param =', slug.trim());
        return slug.trim();
      }
  
      // 2) From redirect param: may be portal.html?slug=... or /portal/<slug>
      const redirect = url.searchParams.get('redirect');
      if (redirect) {
        console.log('portal-login: raw redirect param =', redirect);
  
        try {
          const redirectUrl = new URL(redirect, window.location.origin);
  
          // 2a) ?slug=... in redirect
          const innerSlug = redirectUrl.searchParams.get('slug');
          if (innerSlug && innerSlug.trim()) {
            console.log('portal-login: slug from redirect URL =', innerSlug.trim());
            return innerSlug.trim();
          }
  
          // 2b) Pretty path /portal/<slug> in redirect
          const pathMatch = redirectUrl.pathname.match(/\/portal\/([^\/?#]+)/i);
          if (pathMatch && pathMatch[1]) {
            const fromPath = pathMatch[1].trim();
            console.log('portal-login: slug from redirect path =', fromPath);
            return fromPath;
          }
        } catch (err) {
          console.warn('portal-login: failed to parse redirect URL', err);
        }
  
        // 2c) Fallback regex on redirect string
        const m = redirect.match(/[?&]slug=([^&]+)/);
        if (m && m[1]) {
          const decoded = decodeURIComponent(m[1]).trim();
          console.log('portal-login: slug from redirect regex =', decoded);
          return decoded;
        }
      }
  
      // 3) Legacy fallback on current query string
      const qs = window.location.search || '';
      const m2 = qs.match(/[?&]slug=([^&]+)/);
      if (m2 && m2[1]) {
        const decoded2 = decodeURIComponent(m2[1]).trim();
        console.log('portal-login: slug from own query regex =', decoded2);
        return decoded2;
      }
  
      console.log('portal-login: no slug found');
      return '';
    } catch (err) {
      console.warn('portal-login: getPortalSlugFromUrl error', err);
      const qs = window.location.search || '';
      const m = qs.match(/[?&]slug=([^&]+)/);
      return m && m[1] ? decodeURIComponent(m[1]).trim() : '';
    }
  }
  
  // --- CSRF helpers (same pattern as portal.js) ---
  function setCsrfToken(token) {
    if (!token) return;
    window.csrfToken = token;
    try {
      localStorage.setItem('csrf', token);
    } catch { /* ignore */ }
  
    let meta = document.querySelector('meta[name="csrf-token"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'csrf-token';
      document.head.appendChild(meta);
    }
    meta.content = token;
  }
  
  function getCsrfToken() {
    return (
      window.csrfToken ||
      (document.querySelector('meta[name="csrf-token"]')?.content) ||
      ''
    );
  }
  
  async function loadCsrfToken() {
    try {
      const res = await fetch('/api/auth/token.php', {
        method: 'GET',
        credentials: 'include'
      });
  
      const hdr = res.headers.get('X-CSRF-Token');
      if (hdr) setCsrfToken(hdr);
  
      let body = {};
      try {
        body = await res.json();
      } catch {
        body = {};
      }
  
      const token = body.csrf_token || getCsrfToken();
      setCsrfToken(token);
    } catch (e) {
      console.warn('portal-login: failed to load CSRF token', e);
    }
  }
  
  // --- UI helpers ---
  function showError(msg) {
    const box = document.getElementById('portalLoginError');
    if (!box) return;
    box.textContent = msg || 'Login failed.';
    box.classList.add('show');
  }
  
  function clearError() {
    const box = document.getElementById('portalLoginError');
    if (!box) return;
    box.textContent = '';
    box.classList.remove('show');
  }
  
  // -------- Portal meta (title + accent) --------
  async function fetchPortalMeta(slug) {
    if (!slug) return null;
    console.log('portal-login: calling publicMeta.php for slug', slug);
    try {
      const res = await fetch(
        '/api/pro/portals/publicMeta.php?slug=' + encodeURIComponent(slug),
        { method: 'GET', credentials: 'include' }
      );
      const text = await res.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = {};
      }
      if (!res.ok || !data || !data.success || !data.portal) {
        console.warn('portal-login: publicMeta not ok', res.status, data);
        return null;
      }
      return data.portal;
    } catch (e) {
      console.warn('portal-login: failed to load portal meta', e);
      return null;
    }
  }
  
  function applyPortalBranding(portal) {
    if (!portal) return;
  
    const title =
      (portal.title && portal.title.trim()) ||
      portal.label ||
      portal.slug ||
      'Client portal';
  
    const headingEl  = document.getElementById('portalLoginTitle');
    const subtitleEl = document.getElementById('portalLoginSubtitle');
    const footerEl   = document.getElementById('portalLoginFooter');
  
    if (headingEl) {
      headingEl.textContent = 'Sign in to ' + title;
    }
    if (subtitleEl) {
      subtitleEl.textContent = 'to access this client portal';
    }
  
    // Footer text from portal metadata, if provided
    if (footerEl) {
      const ft = (portal.footerText && portal.footerText.trim()) || '';
      if (ft) {
        footerEl.textContent = ft;
        footerEl.style.display = 'block';
      } else {
        footerEl.textContent = '';
        footerEl.style.display = 'none';
      }
    }
  
    // Document title
    try {
      document.title = 'Sign in – ' + title;
    } catch { /* ignore */ }
  
    // Accent: portal brandColor -> CSS var
    const brand = portal.brandColor && portal.brandColor.trim();
    if (brand) {
      document.documentElement.style.setProperty('--portal-accent', brand);
    }
  
    // Reapply card/button accent after we know portal color
    applyAccentFromTheme();
  }
  
  // --- Accent (card + button) ---
  function applyAccentFromTheme() {
    const card = document.querySelector('.portal-login-card');
    const btn  = document.getElementById('portalLoginSubmit');
    const rootStyles = getComputedStyle(document.documentElement);
  
    // Prefer per-portal accent if present
    let accent = rootStyles.getPropertyValue('--portal-accent').trim();
    if (!accent) {
      accent = rootStyles.getPropertyValue('--filr-accent-500').trim() || '#0b5ed7';
    }
  
    if (card) {
      card.style.borderTop = `3px solid ${accent}`;
    }
    if (btn) {
      btn.style.backgroundColor = accent;
      btn.style.borderColor = accent;
    }
  
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', accent);
    }
  }
  
  // --- Login call (JSON -> auth.php) ---
  async function doLogin(username, password) {
    const csrf = getCsrfToken() || '';
  
    const payload = {
      username,
      password
    };
    if (csrf) {
      payload.csrf_token = csrf;
    }
  
    const res = await fetch('/api/auth/auth.php', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'X-CSRF-Token': csrf,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  
    const text = await res.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = {};
    }
  
    if (!res.ok) {
      const msg = body.error || body.message || text || 'Login failed.';
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
  
    if (body.success === false || body.error || body.logged_in === false) {
      throw new Error(body.error || 'Invalid username or password.');
    }
  
    return body;
  }
  
  // --- Init ---
  document.addEventListener('DOMContentLoaded', async () => {
    const form   = document.getElementById('portalLoginForm');
    const userEl = document.getElementById('portalLoginUser');
    const passEl = document.getElementById('portalLoginPass');
    const btn    = document.getElementById('portalLoginSubmit');
  
    // Accent first (fallback to global accent)
    applyAccentFromTheme();
  
    // Try to load portal meta (title + brand color) using slug
    const slug = getPortalSlugFromUrl();
    console.log('portal-login: computed slug =', slug);
    if (slug) {
      fetchPortalMeta(slug).then(portal => {
        if (portal) {
          console.log('portal-login: got portal meta for', slug, portal);
          applyPortalBranding(portal);
        }
      });
    }
  
    // Pre-load CSRF (for auth.php)
    loadCsrfToken().catch(() => {});
  
    if (!form || !userEl || !passEl || !btn) return;
  
    // Focus username
    userEl.focus();
  
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError();
  
      const username = userEl.value.trim();
      const password = passEl.value;
  
      if (!username || !password) {
        showError('Username and password are required');
        return;
      }
  
      btn.disabled = true;
      btn.textContent = 'Signing in…';
  
      try {
        await doLogin(username, password);
        const target = getRedirectTarget();
        window.location.href = target;
      } catch (err) {
        console.error('portal-login: auth failed', err);
        showError(err.message || 'Login failed. Please try again.');
        btn.disabled = false;
        btn.textContent = 'Sign in';
      }
    });
  });