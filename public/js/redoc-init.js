// public/js/redoc-init.js
if (!customElements.get('redoc')) {
    Redoc.init(window.location.origin + '/api.php?spec=1',
               {},
               document.getElementById('redoc-container'));
  }