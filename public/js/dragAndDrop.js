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

const TOGGLE_ICON_OPEN = 'view_sidebar';
const TOGGLE_ICON_CLOSED = 'menu';

// Cards we manage
const KNOWN_CARD_IDS = ['uploadCard', 'folderManagementCard'];

const CARD_IDS = ['uploadCard', 'folderManagementCard'];

function getKnownCards() {
  return CARD_IDS
    .map(id => document.getElementById(id))
    .filter(Boolean);
}

// Save current container for each card so we can restore after refresh.
function snapshotZoneLocations() {
  const snap = {};
  getKnownCards().forEach(card => {
    const p = card.parentNode;
    snap[card.id] = p && p.id ? p.id : '';
  });
  localStorage.setItem('zonesSnapshot', JSON.stringify(snap));
}

// Move a card to default expanded spot (your request: sidebar is default).
function moveCardToSidebarDefault(card) {
  const sidebar = getSidebar();
  if (sidebar) {
    sidebar.appendChild(card);
    card.style.width = '100%';
    animateVerticalSlide(card);
  }
}

// Remove any header icon/modal for a card (so it truly leaves header mode).
function stripHeaderArtifacts(card) {
  if (card.headerIconButton) {
    if (card.headerIconButton.modalInstance) {
      try { card.headerIconButton.modalInstance.remove(); } catch { }
    }
    try { card.headerIconButton.remove(); } catch { }
    card.headerIconButton = null;
  }
}

// Restore cards after “expand” (toggle off) or after refresh.
// - If we have a snapshot, use it.
// - If not, put all cards in the sidebar (your default).
function restoreCardsFromSnapshot() {
  const sidebar = getSidebar();
  const leftCol = document.getElementById('leftCol');
  const rightCol = document.getElementById('rightCol');

  let snap = {};
  try { snap = JSON.parse(localStorage.getItem('zonesSnapshot') || '{}'); } catch { }

  getKnownCards().forEach(card => {
    stripHeaderArtifacts(card);
    const destId = snap[card.id] || 'sidebarDropArea'; // fallback to sidebar
    const dest =
      destId === 'leftCol' ? leftCol :
        destId === 'rightCol' ? rightCol :
          destId === 'sidebarDropArea' ? sidebar :
            sidebar; // final fallback
    card.style.width = '';
    card.style.minWidth = '';
    if (dest) dest.appendChild(card);
  });

  // Clear header icons storage because we’re expanded.
  localStorage.removeItem('headerOrder');
  const headerDropArea = document.getElementById('headerDropArea');
  if (headerDropArea) headerDropArea.innerHTML = '';

  updateTopZoneLayout();
  updateSidebarVisibility();
  ensureZonesToggle();
  updateZonesToggleUI();
}

// Read the saved snapshot (or {} if none)
function readZonesSnapshot() {
  try {
    return JSON.parse(localStorage.getItem('zonesSnapshot') || '{}');
  } catch {
    return {};
  }
}

// Move a card into the header zone as an icon (uses your existing helper)
function moveCardToHeader(card) {
  // If it's already in header icon form, skip
  if (card.headerIconButton && card.headerIconButton.parentNode) return;
  insertCardInHeader(card, null);
}

// Collapse behavior: snapshot locations, then move all known cards to header as icons
function collapseCardsToHeader() {
  const headerDropArea = document.getElementById('headerDropArea');
  if (headerDropArea) headerDropArea.style.display = 'inline-flex'; // NEW

  getKnownCards().forEach(card => {
    if (!card.headerIconButton) insertCardInHeader(card, null);
  });

  updateTopZoneLayout();
  updateSidebarVisibility();
  ensureZonesToggle();
  updateZonesToggleUI();
}

// Clean up any header icon (button + modal) attached to a card
function removeHeaderIconForCard(card) {
  if (card.headerIconButton) {
    const btn = card.headerIconButton;
    const modal = btn.modalInstance;
    if (btn.parentNode) btn.parentNode.removeChild(btn);
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
    card.headerIconButton = null;
  }
}

// New: small-screen detector
function isSmallScreen() { return window.innerWidth < MEDIUM_MIN; }

// New: remember which cards were in the sidebar right before we go small
const RESPONSIVE_SNAPSHOT_KEY = 'responsiveSidebarSnapshot';

function snapshotSidebarCardsForResponsive() {
  const sb = getSidebar();
  if (!sb) return;
  const ids = Array.from(sb.querySelectorAll('#uploadCard, #folderManagementCard'))
    .map(el => el.id);
  localStorage.setItem(RESPONSIVE_SNAPSHOT_KEY, JSON.stringify(ids));
}

function readResponsiveSnapshot() {
  try { return JSON.parse(localStorage.getItem(RESPONSIVE_SNAPSHOT_KEY) || '[]'); }
  catch { return []; }
}

function clearResponsiveSnapshot() {
  localStorage.removeItem(RESPONSIVE_SNAPSHOT_KEY);
}

// New: deterministic mapping from card -> top column
function moveCardToTopByMapping(card) {
  const leftCol  = document.getElementById('leftCol');
  const rightCol = document.getElementById('rightCol');
  if (!leftCol || !rightCol) return;

  const target = (card.id === 'uploadCard') ? leftCol :
                 (card.id === 'folderManagementCard') ? rightCol : leftCol;

  // clear any sticky widths from sidebar/header
  card.style.width = '';
  card.style.minWidth = '';
  target.appendChild(card);
  card.dataset.originalContainerId = target.id;
  animateVerticalSlide(card);
}

// New: move all sidebar cards to top (used when we cross into small)
function moveAllSidebarCardsToTop() {
  const sb = getSidebar();
  if (!sb) return;
  const cards = Array.from(sb.querySelectorAll('#uploadCard, #folderManagementCard'));
  cards.forEach(moveCardToTopByMapping);
  updateTopZoneLayout();
  updateSidebarVisibility();
}

// New: enforce responsive behavior (sidebar disabled on small screens)
let __lastIsSmall = null;

function enforceResponsiveZones() {
  const isSmall = isSmallScreen();
  const sidebar = getSidebar();
  const topZone = getTopZone();

  if (isSmall && __lastIsSmall !== true) {
    // entering small: remember what was in sidebar, move them up, hide sidebar
    snapshotSidebarCardsForResponsive();
    moveAllSidebarCardsToTop();
    if (sidebar) sidebar.style.display = 'none';
    if (topZone)  topZone.style.display = ''; // ensure visible
    __lastIsSmall = true;
  } else if (!isSmall && __lastIsSmall !== false) {
    // leaving small: restore only what used to be in the sidebar
    const ids = readResponsiveSnapshot();
    const sb = getSidebar();
    ids.forEach(id => {
      const card = document.getElementById(id);
      if (card && sb && !sb.contains(card)) {
        sb.appendChild(card);
        card.style.width = '100%';
      }
    });
    clearResponsiveSnapshot();
    // show sidebar again if panels aren’t collapsed
    if (sidebar) sidebar.style.display = isZonesCollapsed() ? 'none' : 'block';
    updateTopZoneLayout();
    updateSidebarVisibility();
    __lastIsSmall = false;
  }
}


function updateSidebarToggleUI() {
  const btn = document.getElementById('sidebarToggleFloating');
  const sidebar = getSidebar();
  if (!btn || !sidebar) return;

  if (!hasSidebarCards()) { btn.remove(); return; }

  const collapsed = isSidebarCollapsed();
  btn.innerHTML = `<i class="material-icons" aria-hidden="true">${collapsed ? TOGGLE_ICON_CLOSED : TOGGLE_ICON_OPEN
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
  const hasUpload = !!tz.querySelector('#uploadCard');
  const hasFolder = !!tz.querySelector('#folderManagementCard');
  return hasUpload && hasFolder;
}

function isZonesCollapsed() {
  return localStorage.getItem('zonesCollapsed') === '1';
}
function setZonesCollapsed(collapsed) {
  localStorage.setItem('zonesCollapsed', collapsed ? '1' : '0');

  if (collapsed) {
    // Remember where cards were, then show them as header icons
    snapshotZoneLocations();
    collapseCardsToHeader();     // your existing helper that calls insertCardInHeader(...)
  } else {
    // Expand: bring cards back
    restoreCardsFromSnapshot();

    // Ensure zones are visible right away after expand
    const sidebar = getSidebar();
    const topZone = getTopZone();
    if (sidebar) sidebar.style.display = 'block';
    if (topZone) topZone.style.display = '';
  }

  ensureZonesToggle();
  updateZonesToggleUI();
}

function applyZonesCollapsed() {
  const collapsed = isZonesCollapsed();
  const sidebar = getSidebar();
  const topZone = getTopZone();

  if (sidebar) sidebar.style.display = collapsed ? 'none' : (hasSidebarCards() ? 'block' : 'none');
  if (topZone) topZone.style.display = collapsed ? 'none' : (hasTopZoneCards() ? '' : '');
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
  let btn = document.getElementById('sidebarToggleFloating');
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

  // Never remove the button just because cards are in header.
  const collapsed = isZonesCollapsed();
  const iconName = collapsed ? TOGGLE_ICON_CLOSED : TOGGLE_ICON_OPEN;
  btn.innerHTML = `<i class="material-icons toggle-icon" aria-hidden="true">${iconName}</i>`;
  btn.title = collapsed ? 'Show panels' : 'Hide panels';
  btn.style.display = 'block';

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


  // One-time default: if no saved order and no header order,
// put cards into the sidebar on all ≥ MEDIUM_MIN screens.
if ((!orderStr || !JSON.parse(orderStr || '[]').length) &&
(!headerOrderStr || !JSON.parse(headerOrderStr || '[]').length)) {

const isLargeEnough = window.innerWidth >= MEDIUM_MIN;
if (isLargeEnough) {
const mainWrapper = document.querySelector('.main-wrapper');
if (mainWrapper) mainWrapper.style.display = 'flex';

const moved = [];
['uploadCard', 'folderManagementCard'].forEach(id => {
  const card = document.getElementById(id);
  if (card && card.parentNode?.id !== 'sidebarDropArea') {
    // clear any sticky widths from header/top
    card.style.width = '';
    card.style.minWidth = '';
    getSidebar().appendChild(card);
    animateVerticalSlide(card);
    moved.push(id);
  }
});

if (moved.length) {
  localStorage.setItem('sidebarOrder', JSON.stringify(moved));
}
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

  // If panels are expanded, do not re-create header icons.
  if (!isZonesCollapsed()) {
    headerDropArea.innerHTML = '';
    localStorage.removeItem('headerOrder');
    return;
  }

  headerDropArea.innerHTML = '';
  let stored;
  try { stored = JSON.parse(localStorage.getItem('headerOrder') || '[]'); } catch { stored = []; }
  const uniqueIds = Array.from(new Set(stored));
  uniqueIds.forEach(id => {
    const card = document.getElementById(id);
    if (card) insertCardInHeader(card, null);
  });
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
  const topZone = getTopZone();
  const leftCol = document.getElementById('leftCol');
  const rightCol = document.getElementById('rightCol');

  const hasUpload  = !!topZone?.querySelector('#uploadCard');
  const hasFolder  = !!topZone?.querySelector('#folderManagementCard');

  if (leftCol && rightCol) {
    if (hasUpload && !hasFolder) {
      rightCol.style.display = 'none';
      leftCol.style.margin = '0 auto';
      leftCol.style.display = '';
    } else if (!hasUpload && hasFolder) {
      leftCol.style.display = 'none';
      rightCol.style.margin = '0 auto';
      rightCol.style.display = '';
    } else {
      leftCol.style.display = '';
      rightCol.style.display = '';
      leftCol.style.margin = '';
      rightCol.style.margin = '';
    }
  }

  // hide whole top row when empty (kills the gap)
  if (topZone) topZone.style.display = (hasUpload || hasFolder) ? '' : 'none';
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
  if (!inserted) sidebar.appendChild(card);

  // Make it fill the sidebar and clear any sticky width from header/top zone.
  card.style.width = '100%';
  removeHeaderIconForCard(card);           // NEW: remove any header artifacts
  card.dataset.originalContainerId = 'sidebarDropArea';
  animateVerticalSlide(card);

  // SAVE order & refresh minimal UI, but DO NOT collapse/restore here:
  saveSidebarOrder();
  updateSidebarVisibility();
  ensureZonesToggle();
  updateZonesToggleUI();
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
(function () {
  let rAF = null;
  window.addEventListener('resize', () => {
    if (rAF) cancelAnimationFrame(rAF);
    rAF = requestAnimationFrame(() => {
      enforceResponsiveZones();
    });
  });
})();

function showTopZoneWhileDragging() {
  const topZone = getTopZone();
  if (!topZone) return;
  topZone.style.display = '';                 // make it droppable
  // add a temporary placeholder only if empty
  if (topZone.querySelectorAll('#uploadCard, #folderManagementCard').length === 0) {
    let ph = topZone.querySelector('.placeholder');
    if (!ph) {
      ph = document.createElement('div');
      ph.className = 'placeholder';
      ph.style.visibility = 'hidden';
      ph.style.display = 'block';
      ph.style.width = '100%';
      ph.style.height = '375px';
      topZone.appendChild(ph);
    }
  }
}

function cleanupTopZoneAfterDrop() {
  const topZone = getTopZone();
  if (!topZone) return;

  // remove placeholder and highlight/minHeight no matter what
  const ph = topZone.querySelector('.placeholder');
  if (ph) ph.remove();
  topZone.classList.remove('highlight');
  topZone.style.minHeight = '';

  // if no cards left, hide the whole row to remove the gap
  const hasAny = topZone.querySelectorAll('#uploadCard, #folderManagementCard').length > 0;
  topZone.style.display = hasAny ? '' : 'none';
}

// This function ensures the top drop zone (#uploadFolderRow) has a stable width when empty.
function ensureTopZonePlaceholder() {
  const topZone = document.getElementById('uploadFolderRow');
  if (!topZone) return;
  topZone.style.display = '';
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
        maxWidth: '440px',   // NEW: keep card from overflowing center content
        width: 'max-content' // NEW
      });
      document.body.appendChild(modal);
      modal.addEventListener('mouseover', handleMouseOver);
      modal.addEventListener('mouseout', handleMouseOut);
      iconButton.modalInstance = modal;
    }
    if (!modal.contains(card)) {
      const hiddenContainer = document.getElementById('hiddenCardsContainer');
      if (hiddenContainer && hiddenContainer.contains(card)) hiddenContainer.removeChild(card);
      // Clear sticky widths before placing in modal
      card.style.width = '';
      card.style.minWidth = '';
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
    loadSidebarOrder();
    loadHeaderOrder();

    // 2) Then paint visibility/toggle
    applyZonesCollapsed();
    ensureZonesToggle();
    updateZonesToggleUI();

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
            showTopZoneWhileDragging();

            const sidebar = getSidebar();
            if (sidebar) {
              sidebar.classList.add('active');
              sidebar.style.display = isZonesCollapsed() ? 'none' : 'block';
              sidebar.classList.add('highlight');
              sidebar.style.height = '800px';
              sidebar.style.minWidth = '280px';
            }

            showHeaderDropZone();
            const topZone = getTopZone();
            if (topZone) 
              {
                topZone.style.display = '';
                ensureTopZonePlaceholder();
              }

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


          const sidebar = getSidebar();
          if (sidebar) {
            sidebar.classList.remove('highlight');
            sidebar.style.height = '';
            sidebar.style.minWidth = '';
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
              e.clientY <= rect.bottom
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
                card.dataset.originalContainerId = container.id;
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

          cleanupTopZoneAfterDrop();
          const tz = getTopZone();
          if (tz) tz.style.minHeight = '';
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