// public/js/redoc-init.js
if (!customElements.get('redoc')) {
    const basePath = (() => {
      try {
        const p = String(window.location.pathname || '');
        return p.replace(/\/api\.php$/i, '');
      } catch (e) {
        return '';
      }
    })();
    Redoc.init(window.location.origin + basePath + '/api.php?spec=1',
               {},
               document.getElementById('redoc-container'));
  }
