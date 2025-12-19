// sharedFolderView.js
document.addEventListener('DOMContentLoaded', function() {
  function getBasePathFromLocation() {
    try {
      let p = String(window.location.pathname || '');
      p = p.replace(/\/api\/folder\/shareFolder\.php$/i, '');
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

  let viewMode = 'list';
  const payload = JSON.parse(
    document.getElementById('shared-data').textContent
  );
  const token     = payload.token;
  const filesData = payload.files;
  const downloadBase = `${window.location.origin}${withBasePath(`/api/folder/downloadSharedFile.php?token=${encodeURIComponent(token)}&file=`)}`;
  const btn = document.getElementById('toggleBtn');
  if (btn) btn.classList.add('toggle-btn');

  function toggleViewMode() {
    const listEl    = document.getElementById('listViewContainer');
    const galleryEl = document.getElementById('galleryViewContainer');

    if (viewMode === 'list') {
      viewMode = 'gallery';
      listEl.style.display    = 'none';
      renderGalleryView();
      galleryEl.style.display = 'block';
      btn.textContent         = 'Switch to List View';
    } else {
      viewMode = 'list';
      galleryEl.style.display = 'none';
      listEl.style.display    = 'block';
      btn.textContent         = 'Switch to Gallery View';
    }
  }

  btn.addEventListener('click', toggleViewMode);

  function renderGalleryView() {
    const container = document.getElementById('galleryViewContainer');
    // clear previous
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    const grid = document.createElement('div');
    grid.className = 'shared-gallery-container';

    filesData.forEach(file => {
      const url = downloadBase + encodeURIComponent(file);
      const ext = file.split('.').pop().toLowerCase();
      const isImg = /^(jpg|jpeg|png|gif|bmp|webp|ico)$/.test(ext);

      // card
      const card = document.createElement('div');
      card.className = 'shared-gallery-card';

      // preview
      const preview = document.createElement('div');
      preview.className = 'gallery-preview';
      preview.style.cursor = 'pointer';
      preview.dataset.url = url;

      if (isImg) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = file;            // safe, file is not HTML
        preview.appendChild(img);
      } else {
        const icon = document.createElement('span');
        icon.className = 'material-icons';
        icon.textContent = 'insert_drive_file';
        preview.appendChild(icon);
      }
      card.appendChild(preview);

      // info
      const info = document.createElement('div');
      info.className = 'gallery-info';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'gallery-file-name';
      nameSpan.textContent = file; // textContent escapes any HTML
      info.appendChild(nameSpan);
      card.appendChild(info);

      grid.appendChild(card);

      preview.addEventListener('click', () => {
        window.location.href = preview.dataset.url;
      });
    });

    container.appendChild(grid);
  }

  window.renderGalleryView = renderGalleryView;
});
