// sharedFolderView.js
document.addEventListener('DOMContentLoaded', function() {
    let viewMode = 'list';
    const payload = JSON.parse(
        document.getElementById('shared-data').textContent
      );
      const token     = payload.token;
      const filesData = payload.files;
    const downloadBase = `${window.location.origin}/api/folder/downloadSharedFile.php?token=${encodeURIComponent(token)}&file=`;
  
    function toggleViewMode() {
      const listEl    = document.getElementById('listViewContainer');
      const galleryEl = document.getElementById('galleryViewContainer');
      const btn       = document.getElementById('toggleBtn');
      if (btn) {
        btn.classList.add('toggle-btn');
      }
  
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
  
    document.getElementById('toggleBtn').addEventListener('click', toggleViewMode);
  
    function renderGalleryView() {
      const galleryContainer = document.getElementById('galleryViewContainer');
      let html = '<div class="shared-gallery-container">';
      filesData.forEach(file => {
        const url = downloadBase + encodeURIComponent(file);
        const ext = file.split('.').pop().toLowerCase();
        const thumb = /^(jpg|jpeg|png|gif|bmp|webp|svg|ico)$/.test(ext)
          ? `<img src="${url}" alt="${file}">`
          : `<span class="material-icons">insert_drive_file</span>`;
        html += `
          <div class="shared-gallery-card">
            <div class="gallery-preview" data-url="${url}" style="cursor:pointer;">${thumb}</div>
            <div class="gallery-info"><span class="gallery-file-name">${file}</span></div>
          </div>`;
      });
      html += '</div>';
      galleryContainer.innerHTML = html;
  
      galleryContainer.querySelectorAll('.gallery-preview')
        .forEach(el => el.addEventListener('click', () => {
          window.location.href = el.dataset.url;
        }));
    }
  
    window.renderGalleryView = renderGalleryView;
  });