// public/js/shareBranding.js

(function () {
  function getBasePathFromLocation() {
    try {
      let p = String(window.location.pathname || '');
      p = p.replace(/\/api\/folder\/shareFolder\.php$/i, '');
      p = p.replace(/\/api\/file\/share\.php$/i, '');
      p = p.replace(/\/+$/, '');
      if (!p || p === '/') return '';
      if (!p.startsWith('/')) p = '/' + p;
      return p;
    } catch (e) {
      return '';
    }
  }

  function withBasePath(path) {
    const base = getBasePathFromLocation();
    const s = String(path || '');
    if (!base || !s.startsWith('/')) return s;
    if (s === base || s.startsWith(base + '/')) return s;
    return base + s;
  }

  function withBaseIfRelative(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    if (raw[0] === '/') return withBasePath(raw);
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
    return withBasePath('/' + raw.replace(/^\.?\//, ''));
  }

  function upsertLink(selector, builder, href) {
    if (!href) return;
    let el = document.querySelector(selector);
    if (!el) {
      el = builder();
      document.head.appendChild(el);
    }
    el.setAttribute('href', href);
  }

  function updateIconLinks(branding) {
    if (!branding || typeof branding !== 'object') return;

    const svg = withBaseIfRelative(branding.faviconSvg || '');
    const png = withBaseIfRelative(branding.faviconPng || '');
    const ico = withBaseIfRelative(branding.faviconIco || '');
    const apple = withBaseIfRelative(branding.appleTouchIcon || '');
    const mask = withBaseIfRelative(branding.maskIcon || '');

    if (svg) {
      upsertLink('link[rel="icon"][type="image/svg+xml"]', () => {
        const link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/svg+xml';
        link.sizes = 'any';
        return link;
      }, svg);
    }

    if (png) {
      const pngLinks = document.querySelectorAll('link[rel="icon"][type="image/png"]');
      if (pngLinks.length) {
        pngLinks.forEach((link) => link.setAttribute('href', png));
      } else {
        upsertLink('link[rel="icon"][type="image/png"]', () => {
          const link = document.createElement('link');
          link.rel = 'icon';
          link.type = 'image/png';
          return link;
        }, png);
      }
    }

    if (ico) {
      upsertLink('link[rel="shortcut icon"]', () => {
        const link = document.createElement('link');
        link.rel = 'shortcut icon';
        return link;
      }, ico);
    }

    if (apple) {
      upsertLink('link[rel="apple-touch-icon"]', () => {
        const link = document.createElement('link');
        link.rel = 'apple-touch-icon';
        return link;
      }, apple);
    }

    if (mask) {
      upsertLink('link[rel="mask-icon"]', () => {
        const link = document.createElement('link');
        link.rel = 'mask-icon';
        return link;
      }, mask);
      const maskLink = document.querySelector('link[rel="mask-icon"]');
      if (maskLink) {
        const color = String(branding.maskIconColor || '').trim();
        if (color) {
          maskLink.setAttribute('color', color);
        } else {
          maskLink.removeAttribute('color');
        }
      }
    }
  }

  function getStoredTheme() {
    try {
      const t = localStorage.getItem('fr_share_theme');
      return (t === 'light' || t === 'dark') ? t : 'auto';
    } catch (e) {
      return 'auto';
    }
  }

  function getActiveTheme(storedTheme) {
    if (storedTheme === 'light' || storedTheme === 'dark') {
      return storedTheme;
    }
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
      ? 'dark'
      : 'light';
  }

  function applyThemeColor(branding) {
    if (!branding || typeof branding !== 'object') return;
    const stored = getStoredTheme();
    const active = getActiveTheme(stored);
    const color = active === 'dark'
      ? String(branding.themeColorDark || '').trim()
      : String(branding.themeColorLight || '').trim();
    if (!color) return;
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = color;
  }

  let themeWatcherBound = false;
  function bindThemeWatcher(branding) {
    if (themeWatcherBound) return;
    themeWatcherBound = true;

    const root = document.documentElement;
    const observer = new MutationObserver(() => applyThemeColor(branding));
    observer.observe(root, { attributes: true, attributeFilter: ['data-share-theme'] });

    const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if (mq) {
      const handler = () => applyThemeColor(branding);
      try { mq.addEventListener('change', handler); } catch (e) { mq.addListener(handler); }
    }
  }

  function isSafeHref(href) {
    if (!href) return false;
    const trimmed = String(href).trim();
    if (trimmed.startsWith('#')) return true;
    try {
      const u = new URL(trimmed, window.location.origin);
      return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:';
    } catch (e) {
      return false;
    }
  }

  function sanitizeFooterHtml(raw) {
    if (!raw) return '';
    const wrapper = document.createElement('div');
    wrapper.innerHTML = String(raw);

    const allowedTags = new Set(['A', 'B', 'STRONG', 'EM', 'I', 'SPAN', 'SMALL', 'BR']);

    const walk = (node) => {
      const children = Array.from(node.childNodes || []);
      children.forEach((child) => {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const tag = child.tagName.toUpperCase();
          if (!allowedTags.has(tag)) {
            const text = document.createTextNode(child.textContent || '');
            child.parentNode.replaceChild(text, child);
            return;
          }

          const attrs = Array.from(child.attributes || []);
          attrs.forEach((attr) => {
            const name = attr.name.toLowerCase();
            if (tag === 'A' && name === 'href') {
              if (!isSafeHref(attr.value)) {
                child.removeAttribute(attr.name);
              }
              return;
            }
            if (tag === 'A' && (name === 'target' || name === 'rel')) {
              return;
            }
            child.removeAttribute(attr.name);
          });

          if (tag === 'A') {
            const target = (child.getAttribute('target') || '').toLowerCase();
            if (target === '_blank') {
              child.setAttribute('rel', 'noopener noreferrer');
            } else if (target && target !== '_self') {
              child.setAttribute('target', '_self');
            }
          }

          walk(child);
        } else if (child.nodeType === Node.COMMENT_NODE) {
          child.parentNode.removeChild(child);
        }
      });
    };

    walk(wrapper);
    return wrapper.innerHTML.trim();
  }

  function applyBranding(cfg) {
    if (!cfg || !cfg.pro || !cfg.pro.active) return;
    const branding = cfg.branding || {};
    const logoUrl = withBaseIfRelative(branding.customLogoUrl || '');
    const accent = (branding.headerBgLight || '').trim();
    const accentDark = (branding.headerBgDark || '').trim();
    const footerHtml = (branding.footerHtml || '').trim();

    updateIconLinks(branding);
    applyThemeColor(branding);
    bindThemeWatcher(branding);

    if (accent) {
      document.documentElement.style.setProperty('--share-accent', accent);
    }
    if (accentDark) {
      document.documentElement.style.setProperty('--share-accent-dark', accentDark);
    }
    if (logoUrl) {
      const logo = document.getElementById('shareLogo');
      if (logo) logo.src = logoUrl;
    }

    const footerEl = document.getElementById('shareFooter');
    if (footerEl) {
      if (footerHtml) {
        const safe = sanitizeFooterHtml(footerHtml);
        if (safe) {
          footerEl.innerHTML = safe;
        }
      }
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    const url = withBasePath('/api/siteConfig.php');
    fetch(url, { credentials: 'include' })
      .then((res) => res.json())
      .then((cfg) => applyBranding(cfg))
      .catch(() => {
        // non-fatal
      });
  });
})();
