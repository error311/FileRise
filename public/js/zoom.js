// /js/zoom.js
(function () {
    const MIN_PERCENT  = 60;   // 60%
    const MAX_PERCENT  = 140;  // 140%
    const STEP_PERCENT = 5;    // 5%
    const STORAGE_KEY  = 'filerise.appZoomPercent';
  
    function clampPercent(p) {
      return Math.max(MIN_PERCENT, Math.min(MAX_PERCENT, p));
    }
  
    function updateDisplay(p) {
      const el = document.getElementById('zoomDisplay');
      if (el) el.textContent = `${p}%`;
    }
  
    function applyZoomPercent(p) {
      const clamped = clampPercent(p);
      const scale   = clamped / 100;
  
      document.documentElement.style.setProperty('--app-zoom', String(scale));
      try { localStorage.setItem(STORAGE_KEY, String(clamped)); } catch {}
  
      updateDisplay(clamped);
      return clamped;
    }
  
    function getCurrentPercent() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const n = parseInt(raw, 10);
          if (Number.isFinite(n) && n > 0) return clampPercent(n);
        }
      } catch {}
  
      const v = getComputedStyle(document.documentElement)
        .getPropertyValue('--app-zoom')
        .trim();
      const n = parseFloat(v);
      if (Number.isFinite(n) && n > 0) {
        return clampPercent(Math.round(n * 100));
      }
      return 100;
    }
  
    // Public-ish API (percent-based)
    window.fileriseZoom = {
      in() {
        const next = getCurrentPercent() + STEP_PERCENT;
        return applyZoomPercent(next);
      },
      out() {
        const next = getCurrentPercent() - STEP_PERCENT;
        return applyZoomPercent(next);
      },
      reset() {
        return applyZoomPercent(100);
      },
      setPercent(p) {
        return applyZoomPercent(p);
      },
      currentPercent: getCurrentPercent
    };
  
    function initZoomUI() {
      // bind buttons
      const btns = document.querySelectorAll('.zoom-btn[data-zoom]');
      btns.forEach(btn => {
        if (btn.__zoomBound) return;
        btn.__zoomBound = true;
  
        btn.addEventListener('click', () => {
          const mode = btn.dataset.zoom;
          if (mode === 'in')      window.fileriseZoom.in();
          else if (mode === 'out')   window.fileriseZoom.out();
          else if (mode === 'reset') window.fileriseZoom.reset();
        });
      });
  
      // apply initial zoom + update display
      const initial = getCurrentPercent();
      applyZoomPercent(initial);
    }
  
    // Run immediately if DOM is ready, otherwise wait
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initZoomUI, { once: true });
    } else {
      initZoomUI();
    }
  })();