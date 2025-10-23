// dragAndDrop.js
// Enhances the dashboard with drag-and-drop functionality for cards:
// - injects a tiny floating toggle btn
// - remembers collapsed state in localStorage
// - keeps the original card DnD + order logic intact

// ---- responsive defaults ----
const MEDIUM_MIN = 1205;      // matches your small-screen cutoff
const MEDIUM_MAX = 1600;      // tweak as you like

const TOGGLE_TOP_PX = 10;  
const TOGGLE_LEFT_PX = 100;

const TOGGLE_ICON_OPEN   = 'view_sidebar';
const TOGGLE_ICON_CLOSED = 'menu';  

function updateSidebarToggleUI() {
  const btn = document.getElementById('sidebarToggleFloating');
  const sidebar = getSidebar();
  if (!btn || !sidebar) return;

  if (!hasSidebarCards()) { btn.remove(); return; }

  const collapsed = isSidebarCollapsed();
  btn.innerHTML = `<i class="material-icons" aria-hidden="true">${
    collapsed ? TOGGLE_ICON_CLOSED : TOGGLE_ICON_OPEN
  }</i>`;
  btn.title = collapsed ? 'Show sidebar' : 'Hide sidebar';
  btn.style.display = 'block';
  btn.classList.toggle('toggle-ping', collapsed);
}


function hasSidebarCards() {
  const sb = getSidebar();
  return !!sb && sb.querySelectorAll('#uploadCard, #folderManagementCard').length > 0;
}

function hasTopZoneCards() {
  const tz = getTopZone();
  return !!tz && tz.querySelectorAll('#uploadCard, #folderManagementCard').length > 0;
}

// Both cards are in the top zone (upload + folder)
function allCardsInTopZone() {
    const tz = getTopZone();
    if (!tz) return false;
    const hasUpload  = !!tz.querySelector('#uploadCard');
    const hasFolder  = !!tz.querySelector('#folderManagementCard');
    return hasUpload && hasFolder;
  }

function isZonesCollapsed() {
  return localStorage.getItem('zonesCollapsed') === '1';
}
function setZonesCollapsed(collapsed) {
  localStorage.setItem('zonesCollapsed', collapsed ? '1' : '0');
  applyZonesCollapsed();
  updateZonesToggleUI();
}
function applyZonesCollapsed() {
  const collapsed = isZonesCollapsed();
  const sidebar = getSidebar();
  const topZone = getTopZone();

  if (sidebar) sidebar.style.display = collapsed ? 'none' : (hasSidebarCards() ? 'block' : 'none');
  if (topZone)  topZone.style.display  = collapsed ? 'none' : (hasTopZoneCards()  ? ''      : '');
}

function isMediumScreen() {
  const w = window.innerWidth;
  return w >= MEDIUM_MIN && w < MEDIUM_MAX;
}

// ----- Sidebar collapse state helpers -----
function getSidebar() {
  return document.getElementById('sidebarDropArea');
}
function getTopZone() {
  return document.getElementById('uploadFolderRow');
}

function isSidebarCollapsed() {
  return localStorage.getItem('sidebarCollapsed') === '1';
}

function setSidebarCollapsed(collapsed) {
  localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0');
  applySidebarCollapsed();
  updateSidebarToggleUI();
}

function applySidebarCollapsed() {
  const sidebar = getSidebar();
  if (!sidebar) return;

  // We avoid hard-coding layout assumptions: simply hide/show the sidebar area.
  // If you want a sliding effect, add CSS later; JS will just toggle display.
  const collapsed = isSidebarCollapsed();
  sidebar.style.display = collapsed ? 'none' : 'block';
}

function ensureZonesToggle() {
  // show only if at least one zone *can* show a card
  const shouldShow = hasSidebarCards() || hasTopZoneCards();

  let btn = document.getElementById('sidebarToggleFloating');
  if (!shouldShow) {
    if (btn) btn.remove();
    return;
  }
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'sidebarToggleFloating';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Toggle panels');
    Object.assign(btn.style, {
      position: 'fixed',
      left: `${TOGGLE_LEFT_PX}px`,
      top: `${TOGGLE_TOP_PX}px`,
      zIndex: '1000',
      width: '38px',
      height: '38px',
      borderRadius: '19px',
      border: '1px solid #ccc',
      background: '#fff',
      cursor: 'pointer',
      boxShadow: '0 2px 6px rgba(0,0,0,.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0',
        lineHeight: '0',
    });
    btn.addEventListener('click', () => {
      setZonesCollapsed(!isZonesCollapsed());
    });
    document.body.appendChild(btn);
  }
  updateZonesToggleUI();
}
function updateZonesToggleUI() {
  const btn = document.getElementById('sidebarToggleFloating');
  if (!btn) return;

  // if neither zone has cards, remove the toggle
  if (!hasSidebarCards() && !hasTopZoneCards()) {
    btn.remove();
    return;
  }

  const collapsed = isZonesCollapsed();
  const iconName = collapsed ? TOGGLE_ICON_CLOSED : TOGGLE_ICON_OPEN;
  btn.innerHTML = `<i class="material-icons toggle-icon" aria-hidden="true">${iconName}</i>`;
  btn.title = collapsed ? 'Show panels' : 'Hide panels';
  btn.style.display = 'block';

  // Rotate the icon 90° when BOTH cards are in the top zone and panels are open
  const iconEl = btn.querySelector('.toggle-icon');
  if (iconEl) {
    iconEl.style.transition = 'transform 0.2s ease';
    iconEl.style.display = 'inline-flex';
    iconEl.style.alignItems = 'center';
    if (!collapsed && allCardsInTopZone()) {
      iconEl.style.transform = 'rotate(90deg)';
    } else {
      iconEl.style.transform = 'rotate(0deg)';
    }
  }
}

// create a small floating toggle button (no HTML edits needed)
function ensureSidebarToggle() {
  const sidebar = getSidebar();
  if (!sidebar) return;

  // Only show if there are cards
  if (!hasSidebarCards()) {
    const existing = document.getElementById('sidebarToggleFloating');
    if (existing) existing.remove();
    return;
  }

  let btn = document.getElementById('sidebarToggleFloating');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'sidebarToggleFloating';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Toggle sidebar');

    Object.assign(btn.style, {
      position: 'fixed',
      left: `${TOGGLE_LEFT_PX}px`,
      top: `${TOGGLE_TOP_PX}px`,
      zIndex: '10010',
      width: '38px',
      height: '38px',
      borderRadius: '19px',
      border: '1px solid #ccc',
      background: '#fff',
      cursor: 'pointer',
      boxShadow: '0 2px 6px rgba(0,0,0,.15)',
      display: 'block',
    });

    btn.addEventListener('click', () => {
      setSidebarCollapsed(!isSidebarCollapsed());
      // icon/title/animation update after state change
      updateSidebarToggleUI();
    });

    document.body.appendChild(btn);
  }

  // set correct icon/title right away
  //updateSidebarToggleUI();
  //applySidebarCollapsed();
  updateZonesToggleUI();
  applyZonesCollapsed();
}

// Moves cards into the sidebar based on the saved order in localStorage.
export function loadSidebarOrder() {
  const sidebar = getSidebar();
  if (!sidebar) return;

  const orderStr = localStorage.getItem('sidebarOrder');
  const headerOrderStr = localStorage.getItem('headerOrder');
  const defaultAppliedKey = 'layoutDefaultApplied_v1'; // bump if logic changes

  // If we have a saved order (sidebar), honor it as before
  if (orderStr) {
    const order = JSON.parse(orderStr || '[]');
    if (Array.isArray(order) && order.length > 0) {
      const mainWrapper = document.querySelector('.main-wrapper');
      if (mainWrapper) mainWrapper.style.display = 'flex';
      order.forEach(id => {
        const card = document.getElementById(id);
        if (card && card.parentNode?.id !== 'sidebarDropArea') {
          sidebar.appendChild(card);
          animateVerticalSlide(card);
        }
      });
      updateSidebarVisibility();
      //applySidebarCollapsed();   // NEW: honor collapsed state
      //ensureSidebarToggle();     // NEW: inject toggle
      applyZonesCollapsed();
      ensureZonesToggle();
      
      return;
    }
  }

  // No sidebar order saved yet: if user has header icons saved, do nothing (they've customized)
  const headerOrder = JSON.parse(headerOrderStr || '[]');
  if (Array.isArray(headerOrder) && headerOrder.length > 0) {
    updateSidebarVisibility();
    //applySidebarCollapsed();
    //ensureSidebarToggle();
    applyZonesCollapsed();
      ensureZonesToggle();
    return;
  }

  // One-time default: on medium screens, start cards in the sidebar
  const alreadyApplied = localStorage.getItem(defaultAppliedKey) === '1';
  if (!alreadyApplied && isMediumScreen()) {
    const mainWrapper = document.querySelector('.main-wrapper');
    if (mainWrapper) mainWrapper.style.display = 'flex';

    const candidates = ['uploadCard', 'folderManagementCard'];
    const moved = [];
    candidates.forEach(id => {
      const card = document.getElementById(id);
      if (card && card.parentNode?.id !== 'sidebarDropArea') {
        sidebar.appendChild(card);
        animateVerticalSlide(card);
        moved.push(id);
      }
    });

    if (moved.length) {
      localStorage.setItem('sidebarOrder', JSON.stringify(moved));
      localStorage.setItem(defaultAppliedKey, '1');
    }
  }

  updateSidebarVisibility();
  //applySidebarCollapsed();
  //ensureSidebarToggle();
  applyZonesCollapsed();
      ensureZonesToggle();
}

export function loadHeaderOrder() {
  const headerDropArea = document.getElementById('headerDropArea');
  if (!headerDropArea) return;

  // 1) Clear out any icons that might already be in the drop area
  headerDropArea.innerHTML = '';

  // 2) Read the saved array (or empty array if invalid/missing)
  let stored;
  try {
    stored = JSON.parse(localStorage.getItem('headerOrder') || '[]');
  } catch {
    stored = [];
  }

  // 3) Deduplicate IDs
  const uniqueIds = Array.from(new Set(stored));

  // 4) Re-insert exactly one icon per saved card ID
  uniqueIds.forEach(id => {
    const card = document.getElementById(id);
    if (card) insertCardInHeader(card, null);
  });

  // 5) Persist the cleaned, deduped list back to storage
  localStorage.setItem('headerOrder', JSON.stringify(uniqueIds));
}

// Internal helper: update sidebar visibility based on its content.
// NOTE: do NOT auto-hide if user manually collapsed; that is separate.
function updateSidebarVisibility() {
  const sidebar = getSidebar();
  if (!sidebar) return;

  const anyCards = hasSidebarCards();

  // clear any leftover drag height
  sidebar.style.height = '';

  if (anyCards) {
        sidebar.classList.add('active');
        // respect the unified zones-collapsed switch
        sidebar.style.display = isZonesCollapsed() ? 'none' : 'block';
      } else {
        sidebar.classList.remove('active');
        sidebar.style.display = 'none';
      }

  // Save order and update toggle visibility
  saveSidebarOrder();
  ensureZonesToggle(); // will hide/remove the button if no cards
}

// NEW: Save header order to localStorage.
function saveHeaderOrder() {
  const headerDropArea = document.getElementById('headerDropArea');
  if (headerDropArea) {
    const icons = Array.from(headerDropArea.children);
    // Each header icon stores its associated card in the property cardElement.
    const order = icons.map(icon => icon.cardElement.id);
    localStorage.setItem('headerOrder', JSON.stringify(order));
  }
}

// Internal helper: update top zone layout (center a card if one column is empty).
function updateTopZoneLayout() {
  const leftCol = document.getElementById('leftCol');
  const rightCol = document.getElementById('rightCol');

  const leftIsEmpty = !leftCol?.querySelector('#uploadCard');
  const rightIsEmpty = !rightCol?.querySelector('#folderManagementCard');

  if (leftCol && rightCol) {
    if (leftIsEmpty && !rightIsEmpty) {
      leftCol.style.display = 'none';
      rightCol.style.margin = '0 auto';
    } else if (rightIsEmpty && !leftIsEmpty) {
      rightCol.style.display = 'none';
      leftCol.style.margin = '0 auto';
    } else {
      leftCol.style.display = '';
      rightCol.style.display = '';
      leftCol.style.margin = '';
      rightCol.style.margin = '';
    }
  }
}

// When a card is being dragged, if the top drop zone is empty, set its min-height.
function addTopZoneHighlight() {
  const topZone = document.getElementById('uploadFolderRow');
  if (topZone) {
    topZone.classList.add('highlight');
    if (topZone.querySelectorAll('#uploadCard, #folderManagementCard').length === 0) {
      topZone.style.minHeight = '375px';
    }
  }
}

// When the drag ends, remove the extra min-height.
function removeTopZoneHighlight() {
  const topZone = document.getElementById('uploadFolderRow');
  if (topZone) {
    topZone.classList.remove('highlight');
    topZone.style.minHeight = '';
  }
}

// Vertical slide/fade animation helper.
function animateVerticalSlide(card) {
  card.style.transform = 'translateY(30px)';
  card.style.opacity = '0';
  // Force reflow.
  card.offsetWidth;
  requestAnimationFrame(() => {
    card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    card.style.transform = 'translateY(0)';
    card.style.opacity = '1';
  });
  setTimeout(() => {
    card.style.transition = '';
    card.style.transform = '';
    card.style.opacity = '';
  }, 310);
}

// Internal helper: insert card into sidebar at a proper position based on event.clientY.
function insertCardInSidebar(card, event) {
  const sidebar = getSidebar();
  if (!sidebar) return;
  const existingCards = Array.from(sidebar.querySelectorAll('#uploadCard, #folderManagementCard'));
  let inserted = false;
  for (const currentCard of existingCards) {
    const rect = currentCard.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (event.clientY < midY) {
      sidebar.insertBefore(card, currentCard);
      inserted = true;
      break;
    }
  }
  if (!inserted) {
    sidebar.appendChild(card);
  }
  // Ensure card fills the sidebar.
  card.style.width = '100%';
  animateVerticalSlide(card);
  // if user dropped into sidebar, auto-un-collapse if currently collapsed
  if (isZonesCollapsed()) setZonesCollapsed(false);
}

// Internal helper: save the current sidebar card order to localStorage.
function saveSidebarOrder() {
  const sidebar = getSidebar();
  if (sidebar) {
    const cards = sidebar.querySelectorAll('#uploadCard, #folderManagementCard');
    const order = Array.from(cards).map(card => card.id);
    localStorage.setItem('sidebarOrder', JSON.stringify(order));
  }
}

// Helper: move cards from sidebar back to the top drop area when on small screens.
function moveSidebarCardsToTop() {
  if (window.innerWidth < 1205) {
    const sidebar = getSidebar();
    if (!sidebar) return;
    const cards = Array.from(sidebar.querySelectorAll('#uploadCard, #folderManagementCard'));
    cards.forEach(card => {
      const orig = document.getElementById(card.dataset.originalContainerId);
      if (orig) {
        orig.appendChild(card);
        animateVerticalSlide(card);
      }
    });
    updateSidebarVisibility();
    updateTopZoneLayout();
  }
}

// Listen for window resize to automatically move sidebar cards back to top on small screens.
window.addEventListener('resize', function () {
  if (window.innerWidth < 1205) {
    moveSidebarCardsToTop();
  }
});

// This function ensures the top drop zone (#uploadFolderRow) has a stable width when empty.
function ensureTopZonePlaceholder() {
  const topZone = document.getElementById('uploadFolderRow');
  if (!topZone) return;
  if (topZone.querySelectorAll('#uploadCard, #folderManagementCard').length === 0) {
    let placeholder = topZone.querySelector('.placeholder');
    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.className = 'placeholder';
      placeholder.style.visibility = 'hidden';
      placeholder.style.display = 'block';
      placeholder.style.width = '100%';
      placeholder.style.height = '375px';
      topZone.appendChild(placeholder);
    }
  } else {
    const placeholder = topZone.querySelector('.placeholder');
    if (placeholder) placeholder.remove();
  }
}

// --- Header drop zone helpers ---

function showHeaderDropZone() {
  const headerDropArea = document.getElementById('headerDropArea');
  if (headerDropArea) {
    headerDropArea.style.display = 'inline-flex';
    headerDropArea.classList.add('drag-active');
  }
}

function hideHeaderDropZone() {
  const headerDropArea = document.getElementById('headerDropArea');
  if (headerDropArea) {
    headerDropArea.classList.remove('drag-active');
    if (headerDropArea.children.length === 0) {
      headerDropArea.style.display = 'none';
    }
  }
}

// Insert card into header drop zone as a material icon
function insertCardInHeader(card, event) {
  const headerDropArea = document.getElementById('headerDropArea');
  if (!headerDropArea) return;

  // Preserve the original by moving it to a hidden container.
  if (card.id === 'folderManagementCard' || card.id === 'uploadCard') {
    let hiddenContainer = document.getElementById('hiddenCardsContainer');
    if (!hiddenContainer) {
      hiddenContainer = document.createElement('div');
      hiddenContainer.id = 'hiddenCardsContainer';
      hiddenContainer.style.display = 'none';
      document.body.appendChild(hiddenContainer);
    }
    if (card.parentNode?.id !== 'hiddenCardsContainer') {
      hiddenContainer.appendChild(card);
    }
  } else if (card.parentNode) {
    card.parentNode.removeChild(card);
  }

  const iconButton = document.createElement('button');
  iconButton.className = 'header-card-icon';
  iconButton.style.border = 'none';
  iconButton.style.background = 'none';
  iconButton.style.outline = 'none';
  iconButton.style.cursor = 'pointer';

  if (card.id === 'uploadCard') {
    iconButton.innerHTML = '<i class="material-icons" style="font-size:24px;">cloud_upload</i>';
  } else if (card.id === 'folderManagementCard') {
    iconButton.innerHTML = '<i class="material-icons" style="font-size:24px;">folder</i>';
  } else {
    iconButton.innerHTML = '<i class="material-icons" style="font-size:24px;">insert_drive_file</i>';
  }

  iconButton.cardElement = card;
  card.headerIconButton = iconButton;

  let modal = null;
  let isLocked = false;
  let hoverActive = false;

  function showModal() {
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'header-card-modal';
      Object.assign(modal.style, {
        position: 'fixed',
        top: '55px',
        right: '80px',
        zIndex: '11000',
        display: 'block',
        visibility: 'hidden',
        opacity: '0',
        background: 'none',
        border: 'none',
        padding: '0',
        boxShadow: 'none',
      });
      document.body.appendChild(modal);
      modal.addEventListener('mouseover', handleMouseOver);
      modal.addEventListener('mouseout', handleMouseOut);
      iconButton.modalInstance = modal;
    }
    if (!modal.contains(card)) {
      const hiddenContainer = document.getElementById('hiddenCardsContainer');
      if (hiddenContainer && hiddenContainer.contains(card)) {
        hiddenContainer.removeChild(card);
      }
      modal.appendChild(card);
    }
    modal.style.visibility = 'visible';
    modal.style.opacity = '1';
  }

  function hideModal() {
    if (modal && !isLocked && !hoverActive) {
      modal.style.visibility = 'hidden';
      modal.style.opacity = '0';
      const hiddenContainer = document.getElementById('hiddenCardsContainer');
      if (hiddenContainer && modal.contains(card)) {
        hiddenContainer.appendChild(card);
      }
    }
  }

  function handleMouseOver() {
    hoverActive = true;
    showModal();
  }

  function handleMouseOut() {
    hoverActive = false;
    setTimeout(() => {
      if (!hoverActive && !isLocked) {
        hideModal();
      }
    }, 300);
  }

  iconButton.addEventListener('mouseover', handleMouseOver);
  iconButton.addEventListener('mouseout', handleMouseOut);

  iconButton.addEventListener('click', (e) => {
    isLocked = !isLocked;
    if (isLocked) showModal();
    else hideModal();
    e.stopPropagation();
  });

  headerDropArea.appendChild(iconButton);
  saveHeaderOrder();
}

// === Main Drag and Drop Initialization ===
export function initDragAndDrop() {
  function run() {
    // make sure toggle exists even if user hasn't dragged yet
   // ensureSidebarToggle();
    //applySidebarCollapsed();
    applyZonesCollapsed();
      ensureZonesToggle();

    const draggableCards = document.querySelectorAll('#uploadCard, #folderManagementCard');
    draggableCards.forEach(card => {
      if (!card.dataset.originalContainerId && card.parentNode) {
        card.dataset.originalContainerId = card.parentNode.id;
      }
      const header = card.querySelector('.card-header');
      if (header) {
        header.classList.add('drag-header');
      }

      let isDragging = false;
      let dragTimer = null;
      let offsetX = 0, offsetY = 0;
      let initialLeft, initialTop;

      if (header) {
        header.addEventListener('mousedown', function (e) {
          e.preventDefault();
          const card = this.closest('.card');
          const initialRect = card.getBoundingClientRect();
          const originX = ((e.clientX - initialRect.left) / initialRect.width) * 100;
          const originY = ((e.clientY - initialRect.top) / initialRect.height) * 100;
          card.style.transformOrigin = `${originX}% ${originY}%`;

          dragTimer = setTimeout(() => {
            isDragging = true;
            card.classList.add('dragging');
            card.style.pointerEvents = 'none';
            addTopZoneHighlight();

            const sidebar = getSidebar();
            if (sidebar) {
              sidebar.classList.add('active');
              sidebar.style.display = isSidebarCollapsed() ? 'none' : 'block';
              sidebar.classList.add('highlight');
              sidebar.style.height = '800px';
            }

            showHeaderDropZone();

            initialLeft = initialRect.left + window.pageXOffset;
            initialTop = initialRect.top + window.pageYOffset;
            offsetX = e.pageX - initialLeft;
            offsetY = e.pageY - initialTop;

            if (card.headerIconButton) {
              if (card.headerIconButton.parentNode) {
                card.headerIconButton.parentNode.removeChild(card.headerIconButton);
              }
              if (card.headerIconButton.modalInstance && card.headerIconButton.modalInstance.parentNode) {
                card.headerIconButton.modalInstance.parentNode.removeChild(card.headerIconButton.modalInstance);
              }
              card.headerIconButton = null;
              saveHeaderOrder();
            }

            document.body.appendChild(card);
            card.style.position = 'absolute';
            card.style.left = initialLeft + 'px';
            card.style.top = initialTop + 'px';
            card.style.width = initialRect.width + 'px';
            card.style.height = initialRect.height + 'px';
            card.style.minWidth = initialRect.width + 'px';
            card.style.flexShrink = '0';
            card.style.zIndex = '10000';
          }, 500);
        });

        header.addEventListener('mouseup', function () {
          clearTimeout(dragTimer);
        });
      }

      document.addEventListener('mousemove', function (e) {
        if (isDragging) {
          card.style.left = (e.pageX - offsetX) + 'px';
          card.style.top = (e.pageY - offsetY) + 'px';
        }
      });

      document.addEventListener('mouseup', function (e) {
        if (isDragging) {
          isDragging = false;
          card.style.pointerEvents = '';
          card.classList.remove('dragging');
          removeTopZoneHighlight();

          const sidebar = getSidebar();
          if (sidebar) {
            sidebar.classList.remove('highlight');
            sidebar.style.height = '';
          }

          if (card.headerIconButton) {
            if (card.headerIconButton.parentNode) {
              card.headerIconButton.parentNode.removeChild(card.headerIconButton);
            }
            if (card.headerIconButton.modalInstance && card.headerIconButton.modalInstance.parentNode) {
              card.headerIconButton.modalInstance.parentNode.removeChild(card.headerIconButton.modalInstance);
            }
            card.headerIconButton = null;
            saveHeaderOrder();
          }

          let droppedInSidebar = false;
          let droppedInTop = false;
          let droppedInHeader = false;

          // Check if dropped in sidebar drop zone.
          const sidebarElem = getSidebar();
          if (sidebarElem) {
            const rect = sidebarElem.getBoundingClientRect();
            const dropZoneBottom = rect.top + 800; // Virtual drop zone height.
            if (
              e.clientX >= rect.left &&
              e.clientX <= rect.right &&
              e.clientY >= rect.top &&
              e.clientY <= dropZoneBottom
            ) {
              insertCardInSidebar(card, e);
              droppedInSidebar = true;
            }
          }

          // Check the top drop zone.
          const topRow = document.getElementById('uploadFolderRow');
          if (!droppedInSidebar && topRow) {
            const rect = topRow.getBoundingClientRect();
            if (
              e.clientX >= rect.left &&
              e.clientX <= rect.right &&
              e.clientY >= rect.top &&
              e.clientY <= rect.bottom
            ) {
              let container;
              if (card.id === 'uploadCard') {
                container = document.getElementById('leftCol');
              } else if (card.id === 'folderManagementCard') {
                container = document.getElementById('rightCol');
              }
              if (container) {
                ensureTopZonePlaceholder();
                updateTopZoneLayout();
                container.appendChild(card);
                droppedInTop = true;
                card.style.width = "363px";
                animateVerticalSlide(card);
                setTimeout(() => {
                  card.style.removeProperty('width');
                }, 210);
              }
            }
          }

          // Check the header drop zone.
          const headerDropArea = document.getElementById('headerDropArea');
          if (!droppedInSidebar && !droppedInTop && headerDropArea) {
            const rect = headerDropArea.getBoundingClientRect();
            if (
              e.clientX >= rect.left &&
              e.clientX <= rect.right &&
              e.clientY >= rect.top &&
              e.clientY <= rect.bottom
            ) {
              insertCardInHeader(card, e);
              droppedInHeader = true;
            }
          }

          // If card was not dropped in any zone, return it to its original container.
          if (!droppedInSidebar && !droppedInTop && !droppedInHeader) {
            const orig = document.getElementById(card.dataset.originalContainerId);
            if (orig) {
              orig.appendChild(card);
              card.style.removeProperty('width');
            }
          }

          // Clear inline drag-related styles.
          [
            'position',
            'left',
            'top',
            'z-index',
            'height',
            'min-width',
            'flex-shrink',
            'transition',
            'transform',
            'opacity'
          ].forEach(prop => card.style.removeProperty(prop));

          // For sidebar drops, force width to 100%.
          if (droppedInSidebar) {
            card.style.width = '100%';
          }

          updateTopZoneLayout();
          updateSidebarVisibility();
          hideHeaderDropZone();
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
}