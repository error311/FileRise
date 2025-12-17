// dragAndDrop.js
// Cards can live in 3 places and will persist across refresh:
//  - Sidebar:     #sidebarDropArea
//  - Top zone:    #leftCol or #rightCol
//  - Header zone: #headerDropArea (as icons with modal)
// Responsive rule remains:
//  - Wide screens default to sidebar.
//  - Small screens auto-lift sidebar cards into top zone (ephemeral, does NOT overwrite saved layout).

// -------------------- constants --------------------
const MEDIUM_MIN = 1205;                 // small-screen cutoff
const TOGGLE_TOP_PX = 8;
const TOGGLE_LEFT_PX = 65;
const TOGGLE_ICON_OPEN = 'view_sidebar';
const TOGGLE_ICON_CLOSED = 'menu';

const CARD_IDS = ['uploadCard', 'folderManagementCard'];
const ZONES = {
  SIDEBAR: 'sidebarDropArea',
  TOP_LEFT: 'leftCol',
  TOP_RIGHT: 'rightCol',
  HEADER: 'headerDropArea',
};
const LAYOUT_KEY = 'userZonesSnapshot.v2';          // {cardId: zoneId}
const RESPONSIVE_STASH_KEY = 'responsiveSidebarSnapshot.v2'; // [cardId]
const ORDER_DATA_KEY = '__zoneOrder';
const ORDER_TRACKED_ZONES = [ZONES.SIDEBAR];

// -------------------- small helpers --------------------
function $(id) { return document.getElementById(id); }
function getSidebar() { return $(ZONES.SIDEBAR); }
function getTopZone() { return $('uploadFolderRow'); }
function getLeftCol() { return $(ZONES.TOP_LEFT); }
function getRightCol() { return $(ZONES.TOP_RIGHT); }
function getHeaderDropArea() { return $(ZONES.HEADER); }
function isSmallScreen() { return window.innerWidth < MEDIUM_MIN; }
function getCards() { return CARD_IDS.map(id => $(id)).filter(Boolean); }

function getAppZoomScale() {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--app-zoom')
    .trim();
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(4, Math.max(0.1, n));
}

function readLayout() {
  try { return JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}'); }
  catch (e) { return {}; }
}
function writeLayout(layout) {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout || {}));
}
function setLayoutFor(cardId, zoneId) {
  const layout = readLayout();
  const prevZone = layout[cardId];
  layout[cardId] = zoneId;
  if (ORDER_TRACKED_ZONES.includes(zoneId)) captureZoneOrder(layout, zoneId);
  if (
    prevZone &&
    prevZone !== zoneId &&
    ORDER_TRACKED_ZONES.includes(prevZone)
  ) {
    captureZoneOrder(layout, prevZone);
  }
  writeLayout(layout);
}

function themeToggleButton(btn) {
  if (!btn) return;
  const dark = document.body.classList.contains('dark-mode');
  btn.style.background = dark ? '#2c2c2c' : '#fff';
  btn.style.border = dark ? '1px solid #555' : '1px solid #ccc';
  btn.style.boxShadow = dark ? '0 2px 6px rgba(0,0,0,.35)' : '0 2px 6px rgba(0,0,0,.15)';
  btn.style.color = dark ? '#e0e0e0' : '#222';
}

function animateVerticalSlide(card) {
  card.style.transform = 'translateY(30px)';
  card.style.opacity = '0';
  card.offsetWidth; // reflow
  requestAnimationFrame(() => {
    card.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
    card.style.transform = 'translateY(0)';
    card.style.opacity = '1';
  });
  setTimeout(() => {
    card.style.transition = '';
    card.style.transform = '';
    card.style.opacity = '';
  }, 260);
}

function createCardGhost(card, rect, opts) {
  const options = opts || {};
  const scale   = typeof options.scale === 'number' ? options.scale : 1;
  const opacity = typeof options.opacity === 'number' ? options.opacity : 1;
  const transformOrigin = typeof options.transformOrigin === 'string'
    ? options.transformOrigin
    : 'center center';
  const materialIcon = typeof options.materialIcon === 'string' ? options.materialIcon : '';
  const materialIconOpacity = typeof options.materialIconOpacity === 'number' ? options.materialIconOpacity : 0;
  const materialIconScale = typeof options.materialIconScale === 'number' ? options.materialIconScale : 1.15;
  const bodyOpacity = typeof options.bodyOpacity === 'number' ? options.bodyOpacity : 0.6;
  const appZoomScale = getAppZoomScale();

  const cs = window.getComputedStyle(card);

  const wrap = document.createElement('div');
  wrap.className = 'card-ghost-wrap';

  Object.assign(wrap.style, {
    position: 'fixed',
    left: rect.left + 'px',
    top: rect.top + 'px',
    width: rect.width + 'px',
    height: rect.height + 'px',
    margin: '0',
    zIndex: '12000',
    pointerEvents: 'none',
    transformOrigin,
    transform: 'scale(' + scale + ')',
    opacity: String(opacity),

    backgroundColor: cs.backgroundColor || 'rgba(24,24,24,.96)',
    borderRadius: cs.borderRadius || '',
    boxShadow: cs.boxShadow || '',
    borderColor: cs.borderColor || '',
    borderWidth: cs.borderWidth || '',
    borderStyle: cs.borderStyle || '',
    backdropFilter: cs.backdropFilter || '',

    // ✨ make the ghost crisper
    overflow: 'hidden',
    willChange: 'transform, opacity',
    backfaceVisibility: 'hidden'
  });

  const ghost = card.cloneNode(true);
  Object.assign(ghost.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    zIndex: '1',
    width: (rect.width / appZoomScale) + 'px',
    height: (rect.height / appZoomScale) + 'px',
    margin: '0',
    pointerEvents: 'none',
    transformOrigin: 'top left',
    transform: `scale(${appZoomScale})`,
    backgroundColor: 'transparent',
    borderRadius: '0',
    boxShadow: 'none',
    border: 'none',
    backdropFilter: 'none'
  });

  // Subtle: de-emphasize inner text so it doesn’t look “smeared”
  const ghBody = ghost.querySelector('.card-body');
  if (ghBody) ghBody.style.opacity = String(bodyOpacity);

  if (ghBody) wrap.__ghostBody = ghBody;
  wrap.appendChild(ghost);

  if (materialIcon) {
    const overlay = document.createElement('div');
    overlay.className = 'ghost-material-icon';
    Object.assign(overlay.style, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      zIndex: '2',
      transform: `translate(-50%, -50%) scale(${materialIconScale})`,
      opacity: String(materialIconOpacity),
      pointerEvents: 'none',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '36px',
      height: '36px',
      borderRadius: '18px',
      color: cs.color || '#fff',
      background: 'rgba(0,0,0,0.12)',
      transition: 'opacity 0.22s ease, transform 0.32s ease'
    });
    overlay.innerHTML = `<i class="material-icons" style="font-size:24px;">${materialIcon}</i>`;
    wrap.appendChild(overlay);
    wrap.__ghostIconOverlay = overlay;
  }

  return wrap;
}

// -------------------- header (icon+modal) --------------------
function saveHeaderOrder() {
  const host = getHeaderDropArea();
  if (!host) return;
  const order = Array.from(host.children).map(btn => btn.cardElement?.id).filter(Boolean);
  localStorage.setItem('headerOrder', JSON.stringify(order));
}

function removeHeaderIconForCard(card) {
  if (!card || !card.headerIconButton) return;
  const btn = card.headerIconButton;
  const modal = btn.modalInstance;
  if (btn.parentNode) btn.parentNode.removeChild(btn);
  if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
  card.headerIconButton = null;
}

function insertCardInHeader(card) {
  const host = getHeaderDropArea();
  if (!host) return;

  // Ensure hidden container exists to park real cards while icon-visible.
  let hidden = $('hiddenCardsContainer');
  if (!hidden) {
    hidden = document.createElement('div');
    hidden.id = 'hiddenCardsContainer';

    // Park cards off–screen but keep them rendered so modals/layout still work
    Object.assign(hidden.style, {
      position: 'absolute',
      left: '-9999px',
      top: '0',
      width: '0',
      height: '0',
      overflow: 'visible',
      pointerEvents: 'none'
      // **NO** display:none here
    });

    document.body.appendChild(hidden);
  }
  if (card.parentNode?.id !== 'hiddenCardsContainer') hidden.appendChild(card);

  if (card.headerIconButton && card.headerIconButton.parentNode) return;

  const iconButton = document.createElement('button');
  iconButton.className = 'header-card-icon';
  iconButton.style.border = 'none';
  iconButton.style.background = 'none';
  iconButton.style.cursor = 'pointer';
  iconButton.innerHTML = `<i class="material-icons" style="font-size:24px;">${
    card.id === 'uploadCard' ? 'cloud_upload' :
    card.id === 'folderManagementCard' ? 'folder' : 'insert_drive_file'
  }</i>`;

  iconButton.cardElement = card;
  card.headerIconButton = iconButton;

  let modal = null;
  let isLocked = false;
  let hoverActive = false;

  function ensureModal() {
    if (modal) return;
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
      maxWidth: '440px',
      width: 'max-content'
    });
    document.body.appendChild(modal);
    iconButton.modalInstance = modal;
    modal.addEventListener('mouseover', () => { hoverActive = true; showModal(); });
    modal.addEventListener('mouseout', () => { hoverActive = false; maybeHide(); });
  }

  function showModal() {
    ensureModal();
    if (!modal.contains(card)) {
      const hiddenNow = $('hiddenCardsContainer');
      if (hiddenNow && hiddenNow.contains(card)) hiddenNow.removeChild(card);
      card.style.width = '';
      card.style.minWidth = '';
      modal.appendChild(card);
    }
    modal.style.visibility = 'visible';
    modal.style.opacity = '1';
  }
  function hideModal() {
    if (!modal) return;
    modal.style.visibility = 'hidden';
    modal.style.opacity = '0';
    const hiddenNow = $('hiddenCardsContainer');
    if (hiddenNow && modal.contains(card)) hiddenNow.appendChild(card);
  }
  function maybeHide() {
    setTimeout(() => {
      if (!hoverActive && !isLocked) hideModal();
    }, 200);
  }

  iconButton.addEventListener('mouseover', () => { hoverActive = true; showModal(); });
  iconButton.addEventListener('mouseout', () => { hoverActive = false; maybeHide(); });
  iconButton.addEventListener('click', (e) => {
    e.stopPropagation();
    isLocked = !isLocked;
    iconButton.classList.toggle('is-locked', isLocked);
    if (isLocked) {
      showModal();
    } else {
      hideModal();
    }
  });

  host.appendChild(iconButton);
  // make sure the dock is visible when icons exist
  showHeaderDockPersistent();
  saveHeaderOrder();
}

// -------------------- placement --------------------
function placeCardInZone(card, zoneId, { animate = true } = {}) {
  if (!card) return;

  // If moving out of header, remove header artifacts
  if (zoneId !== ZONES.HEADER) removeHeaderIconForCard(card);

  switch (zoneId) {
    case ZONES.SIDEBAR: {
      const sb = getSidebar();
      if (!sb) return;
      card.style.width = '100%';
      card.style.minWidth = '';
      sb.appendChild(card);
      if (animate) animateVerticalSlide(card);
      card.dataset.originalContainerId = ZONES.SIDEBAR;
      break;
    }
    case ZONES.TOP_LEFT: {
      const col = getLeftCol();
      if (!col) return;
      card.style.width = '';
      card.style.minWidth = '';
      col.appendChild(card);
      if (animate) animateVerticalSlide(card);
      card.dataset.originalContainerId = ZONES.TOP_LEFT;
      break;
    }
    case ZONES.TOP_RIGHT: {
      const col = getRightCol();
      if (!col) return;
      card.style.width = '';
      card.style.minWidth = '';
      col.appendChild(card);
      if (animate) animateVerticalSlide(card);
      card.dataset.originalContainerId = ZONES.TOP_RIGHT;
      break;
    }
    case ZONES.HEADER: {
      insertCardInHeader(card);
      break;
    }
  }

  updateTopZoneLayout();
  updateSidebarVisibility();
  updateZonesToggleUI(); // live update when zones change
}

function currentZoneForCard(card) {
  if (!card || !card.parentNode) return null;
  const pid = card.parentNode.id || '';
  if (pid === 'hiddenCardsContainer' && card.headerIconButton) return ZONES.HEADER;
  if ([ZONES.SIDEBAR, ZONES.TOP_LEFT, ZONES.TOP_RIGHT, ZONES.HEADER].includes(pid)) return pid;
  if (card.headerIconButton && card.headerIconButton.modalInstance?.contains(card)) return ZONES.HEADER;
  return pid || null;
}

function saveCurrentLayout() {
  const layout = {};
  getCards().forEach(card => {
    const zone = currentZoneForCard(card);
    if (zone) layout[card.id] = zone;
  });
  ORDER_TRACKED_ZONES.forEach(zoneId => captureZoneOrder(layout, zoneId));
  writeLayout(layout);
}

function getZoneOrder(layout, zoneId) {
  if (!layout || typeof layout !== 'object') return [];
  const store = layout[ORDER_DATA_KEY];
  if (!store || !Array.isArray(store[zoneId])) return [];
  return store[zoneId];
}

function captureZoneOrder(layout, zoneId) {
  if (!layout || !ORDER_TRACKED_ZONES.includes(zoneId)) return;
  const host = getZoneHost(zoneId);
  if (!host) return;
  const ids = Array.from(
    host.querySelectorAll('#uploadCard, #folderManagementCard')
  ).map(el => el.id).filter(Boolean);

  if (!ids.length) return;

  layout[ORDER_DATA_KEY] = layout[ORDER_DATA_KEY] || {};
  layout[ORDER_DATA_KEY][zoneId] = ids;
}

function applyZoneOrder(layout, zoneId, placedSet) {
  if (!placedSet) return;
  const ids = getZoneOrder(layout, zoneId);
  if (!ids.length) return;
  ids.forEach(cardId => {
    if (placedSet.has(cardId)) return;
    const card = $(cardId);
    if (!card || layout[cardId] !== zoneId) return;
    placeCardInZone(card, zoneId, { animate: false });
    placedSet.add(cardId);
  });
}

// -------------------- responsive stash --------------------
function stashSidebarCardsBeforeSmall() {
  const sb = getSidebar();
  if (!sb) return;
  const ids = Array.from(sb.querySelectorAll('#uploadCard, #folderManagementCard')).map(el => el.id);
  localStorage.setItem(RESPONSIVE_STASH_KEY, JSON.stringify(ids));
}
function readSidebarStash() {
  try { return JSON.parse(localStorage.getItem(RESPONSIVE_STASH_KEY) || '[]'); }
  catch (e) { return []; }
}
function clearSidebarStash() { localStorage.removeItem(RESPONSIVE_STASH_KEY); }

function moveAllSidebarCardsToTopEphemeral() {
  const sb = getSidebar();
  if (!sb) return;
  Array.from(sb.querySelectorAll('#uploadCard, #folderManagementCard')).forEach(card => {
    const target = (card.id === 'uploadCard') ? ZONES.TOP_LEFT : ZONES.TOP_RIGHT;
    placeCardInZone(card, target, { animate: true });
  });
  // do NOT save layout here (ephemeral)
  updateTopZoneLayout();
  updateSidebarVisibility();
}

let __wasSmall = null;
function enforceResponsiveZones() {
  const nowSmall = isSmallScreen();
  if (__wasSmall === null) { __wasSmall = nowSmall; }

  if (nowSmall && __wasSmall === false) {
    // entering small: remember what was in sidebar, then lift them
    stashSidebarCardsBeforeSmall();
    moveAllSidebarCardsToTopEphemeral();
    const sb = getSidebar();
    if (sb) sb.style.display = 'none';
  } else if (!nowSmall && __wasSmall === true) {
    // leaving small: restore only those that used to be in sidebar *if* saved layout says sidebar
    const ids = readSidebarStash();
    const layout = readLayout();
    const sb = getSidebar();
    ids.forEach(id => {
      const card = $(id);
      if (!card) return;
      if (layout[id] === ZONES.SIDEBAR && sb && !sb.contains(card)) {
        placeCardInZone(card, ZONES.SIDEBAR, { animate: true });
      }
    });
    clearSidebarStash();
  }
  __wasSmall = nowSmall;
  updateTopZoneLayout();
  updateSidebarVisibility();
  updateZonesToggleUI(); // keep icon in sync when responsive flips
}

// -------------------- header dock visibility helpers --------------------
function showHeaderDockPersistent() {
  const h = getHeaderDropArea();
  if (h) {
    h.style.display = 'inline-flex';
    h.classList.add('dock-visible');
  }
}
function hideHeaderDockPersistent() {
  const h = getHeaderDropArea();
  if (h) {
    h.classList.remove('dock-visible');
    if (h.children.length === 0) h.style.display = 'none';
  }
}

const COLLAPSE_ANIMATION_MS = 420;
const COLLAPSE_TARGET_SCALE = 0.14;
const COLLAPSE_OPACITY_END = 0.06;
const COLLAPSE_RISE_MS = 120;
const COLLAPSE_RISE_PX = 14;
const COLLAPSE_RISE_SCALE = 1.02;

function animateCardsIntoHeaderAndThen(done) {
  const sb  = getSidebar();
  const top = getTopZone();
  const liveCards = [];

  if (sb)  liveCards.push(...sb.querySelectorAll('#uploadCard, #folderManagementCard'));
  if (top) liveCards.push(...top.querySelectorAll('#uploadCard, #folderManagementCard'));

  if (!liveCards.length) {
    done();
    return;
  }

  // Snapshot their current positions before we move the real DOM
  const snapshots = liveCards.map(card => {
    const rect = card.getBoundingClientRect();
    return { card, rect };
  });

  // Make sure header dock is visible so icons are laid out
  showHeaderDockPersistent();

  // Move real cards into header (hidden container + icons)
  snapshots.forEach(({ card }) => {
    try { insertCardInHeader(card); } catch (e) {}
  });

  const ghosts = [];

  snapshots.forEach(({ card, rect }) => {
    // remember the size and center for the expand animation later
    card.dataset.lastWidth  = String(rect.width);
    card.dataset.lastHeight = String(rect.height);
    card.dataset.lastTargetLeft = String(rect.left);
    card.dataset.lastTargetTop = String(rect.top);
    card.dataset.lastTargetCx = String(rect.left + rect.width / 2);
    card.dataset.lastTargetCy = String(rect.top + rect.height / 2);

    const iconBtn = card.headerIconButton;
    if (!iconBtn) return;

    const iconRect = iconBtn.getBoundingClientRect();

    const iconName = card.id === 'uploadCard'
      ? 'cloud_upload'
      : card.id === 'folderManagementCard'
        ? 'folder'
        : 'insert_drive_file';

    const ghost = createCardGhost(card, rect, {
      scale: 1,
      opacity: 0.95,
      transformOrigin: 'center center',
      materialIcon: iconName,
      materialIconOpacity: 0,
      materialIconScale: 1.25,
      bodyOpacity: 0.55
    });
    ghost.id = card.id + '-ghost-collapse';
    ghost.classList.add('card-collapse-ghost');
    ghost.style.transition = `transform ${COLLAPSE_RISE_MS}ms ease-out, opacity ${COLLAPSE_RISE_MS}ms ease-out`;

    document.body.appendChild(ghost);
    ghosts.push({ ghost, from: rect, to: iconRect });
  });

  if (!ghosts.length) {
    done();
    return;
  }

  // Kick off motion on next frame
  requestAnimationFrame(() => {
    // Stage 1: “rise” a touch (FileRise 😄)
    ghosts.forEach(({ ghost }) => {
      ghost.style.transform = `translate(0px, ${-COLLAPSE_RISE_PX}px) scale(${COLLAPSE_RISE_SCALE})`;
      ghost.style.opacity = '0.92';
    });

    // Stage 2: fly to the header icon + shrink into it
    setTimeout(() => {
      const flightMs = Math.max(180, COLLAPSE_ANIMATION_MS - COLLAPSE_RISE_MS);
      ghosts.forEach(({ ghost, from, to }) => {
        ghost.style.transition = `transform ${flightMs}ms cubic-bezier(.33,.1,.25,1), opacity ${Math.min(320, flightMs)}ms linear`;

        const fromCx = from.left + from.width  / 2;
        const fromCy = from.top  + from.height / 2;
        const toCx   = to.left   + to.width   / 2;
        const toCy   = to.top    + to.height  / 2;
        const dx = toCx - fromCx;
        const dy = toCy - fromCy;
        ghost.style.transform = `translate(${dx}px, ${dy}px) scale(${COLLAPSE_TARGET_SCALE})`;
        ghost.style.opacity = String(COLLAPSE_OPACITY_END);

        const body = ghost.__ghostBody;
        if (body) {
          body.style.transition = 'opacity 0.18s ease';
          body.style.opacity = '0.1';
        }
        const overlay = ghost.__ghostIconOverlay;
        if (overlay) {
          overlay.style.opacity = '1';
          overlay.style.transform = 'translate(-50%, -50%) scale(1)';
        }
      });
    }, COLLAPSE_RISE_MS);
  });

  setTimeout(() => {
    ghosts.forEach(({ ghost }) => { try { ghost.remove(); } catch (e) {} });
    done();
  }, COLLAPSE_ANIMATION_MS + 50);
}

function resolveTargetZoneForExpand(cardId) {
  const layout   = readLayout();
  const saved    = layout[cardId];
  const isUpload = (cardId === 'uploadCard');

  // 🔒 If the user explicitly pinned this card to the HEADER,
  // it should remain a header-only icon and NEVER fly out.
  if (saved === ZONES.HEADER) {
    return null; // caller will skip animation + placement
  }

  let zone = saved || null;

  // No saved zone yet: mirror applyUserLayoutOrDefault defaults
  if (!zone) {
    if (isSmallScreen()) {
      zone = isUpload ? ZONES.TOP_LEFT : ZONES.TOP_RIGHT;
    } else {
      zone = ZONES.SIDEBAR;
    }
  }

  // On small screens, anything targeting SIDEBAR gets lifted into the top cols
  if (isSmallScreen() && zone === ZONES.SIDEBAR) {
    zone = isUpload ? ZONES.TOP_LEFT : ZONES.TOP_RIGHT;
  }

  return zone;
}

function getZoneHost(zoneId) {
  switch (zoneId) {
    case ZONES.SIDEBAR:   return getSidebar();
    case ZONES.TOP_LEFT:  return getLeftCol();
    case ZONES.TOP_RIGHT: return getRightCol();
    default:              return null;
  }
}

const EXPAND_START_SCALE = 0.62;
let __cleanupTopZonePreExpand = null;

// Animate cards "flying out" of header icons back into their zones.
function animateCardsOutOfHeaderThen(done) {
  const header = getHeaderDropArea();
  if (!header) { done(); return; }

  const cards = getCards().filter(c => c && c.headerIconButton);
  if (!cards.length) { done(); return; }

  // Make sure target containers are visible so their rects are non-zero.
  const sb  = getSidebar();
  const top = getTopZone();
  if (sb)  sb.style.display  = '';
  if (top) top.style.display = '';

  const SAFE_TOP       = 16;
  const START_OFFSET_Y = 95;   // a touch closer to header

  const layout = readLayout();
  const plan = [];

  cards.forEach(card => {
    const iconBtn = card.headerIconButton;
    if (!iconBtn) return;
    const zoneId = resolveTargetZoneForExpand(card.id);
    if (!zoneId) return;
    plan.push({ card, iconBtn, zoneId });
  });

  if (!plan.length) {
    done();
    return;
  }

  const savedHeights = {};
  CARD_IDS.forEach(id => {
    const val = parseFloat($(id)?.dataset.lastHeight || '');
    savedHeights[id] = (!Number.isNaN(val) && val > 0) ? val : 190;
  });

  const sidebarOrder = getZoneOrder(layout, ZONES.SIDEBAR);
  const fallbackSidebarOrder = sidebarOrder.length ? sidebarOrder : CARD_IDS;
  const ghosts = [];

  // Reserve top-zone height up front so the file list resizes BEFORE the ghosts land.
  __cleanupTopZonePreExpand = null;
  if (top) {
    const targetsTop = plan.filter(p => p.zoneId === ZONES.TOP_LEFT || p.zoneId === ZONES.TOP_RIGHT);
    if (targetsTop.length) {
      const prevMinHeight = top.style.minHeight;
      const reserved = Math.max(
        220,
        ...targetsTop.map(p => savedHeights[p.card.id] || 190)
      );

      top.style.display = '';
      top.style.minHeight = `${reserved}px`;
      void top.offsetHeight;

      const left = getLeftCol();
      const right = getRightCol();
      if (left) { left.style.display = ''; left.style.margin = ''; }
      if (right) { right.style.display = ''; right.style.margin = ''; }

      __cleanupTopZonePreExpand = () => {
        top.style.minHeight = prevMinHeight;
      };
    }
  }

  plan.forEach(({ card, iconBtn, zoneId }) => {
    const host = getZoneHost(zoneId);
    if (!host) return;
    const zoneRect = host.getBoundingClientRect();
    if (!zoneRect.width) return;

    const iconRect = iconBtn.getBoundingClientRect();
    const fromCx = iconRect.left + iconRect.width / 2;
    const fromCy = iconRect.bottom + START_OFFSET_Y;

    const savedW = parseFloat(card.dataset.lastWidth  || '');
    const savedH = parseFloat(card.dataset.lastHeight || '');
    const targetWidth  = (!Number.isNaN(savedW) && savedW > 0) ? savedW : Math.min(280, Math.max(220, zoneRect.width * 0.85));
    const targetHeight = (!Number.isNaN(savedH) && savedH > 0) ? savedH : 190;

    const startTop = Math.max(SAFE_TOP, fromCy - targetHeight / 2);
    const ghostRect = {
      left:  fromCx - targetWidth / 2,
      top:   startTop,
      width: targetWidth,
      height: targetHeight
    };

    const iconName = card.id === 'uploadCard'
      ? 'cloud_upload'
      : card.id === 'folderManagementCard'
        ? 'folder'
        : 'insert_drive_file';

    const ghost = createCardGhost(card, ghostRect, {
      scale: EXPAND_START_SCALE,
      opacity: 0.5,
      transformOrigin: 'top left',
      materialIcon: iconName,
      materialIconOpacity: 1,
      materialIconScale: 1,
      bodyOpacity: 0
    });
    ghost.id = card.id + '-ghost-expand';
    ghost.classList.add('card-expand-ghost');

    ghost.style.transform  = `translate(0,0) scale(${EXPAND_START_SCALE})`;
    ghost.style.transition = 'transform 0.4s cubic-bezier(.22,.61,.36,1), opacity 0.4s linear';

    document.body.appendChild(ghost);

    const savedLeft = parseFloat(card.dataset.lastTargetLeft || '');
    const savedTop  = parseFloat(card.dataset.lastTargetTop  || '');
    const hasSavedPos = !Number.isNaN(savedLeft) && !Number.isNaN(savedTop);

    const savedIsPlausible = (() => {
      if (!hasSavedPos) return false;
      const pad = 80;
      return (
        savedLeft >= (zoneRect.left - pad) &&
        savedLeft <= (zoneRect.right + pad) &&
        savedTop >= (zoneRect.top - pad) &&
        savedTop <= (zoneRect.bottom + pad)
      );
    })();

    const fallbackPos = (() => {
      const hostStyle = window.getComputedStyle(host);
      const insetLeft =
        (parseFloat(hostStyle.borderLeftWidth) || 0) +
        (parseFloat(hostStyle.paddingLeft) || 0);
      const insetTop =
        (parseFloat(hostStyle.borderTopWidth) || 0) +
        (parseFloat(hostStyle.paddingTop) || 0);

      const baseLeft = zoneRect.left + insetLeft;
      const baseTop = zoneRect.top + insetTop + 10;

      if (zoneId === ZONES.SIDEBAR) {
        const stack = fallbackSidebarOrder;
        const idx = stack.indexOf(card.id);
        const resolvedIndex = idx >= 0 ? idx : ((card.id === 'uploadCard') ? 0 : 1);
        const gap = parseFloat(window.getComputedStyle(card).marginBottom || '') || 10;
        const precedingHeight = stack
          .slice(0, resolvedIndex)
          .reduce((sum, id) => sum + (savedHeights[id] || 190) + gap, 0);
        return { left: baseLeft, top: baseTop + precedingHeight };
      }

      const left = zoneRect.left + Math.max(0, (zoneRect.width - targetWidth) / 2);
      return { left, top: zoneRect.top + 10 };
    })();

    const targetPos = savedIsPlausible
      ? { left: savedLeft, top: savedTop }
      : fallbackPos;

    ghosts.push({ ghost, from: ghostRect, to: targetPos });
  });

  if (!ghosts.length) {
    done();
    return;
  }

  requestAnimationFrame(() => {
    ghosts.forEach(({ ghost, from, to }) => {
      const dx = to.left - from.left;
      const dy = to.top - from.top;
      ghost.style.transform = `translate(${dx}px, ${dy}px) scale(1)`;
      ghost.style.opacity   = '1';

      const body = ghost.__ghostBody;
      if (body) {
        body.style.transition = 'opacity 0.22s ease 0.08s';
        body.style.opacity = '0.65';
      }
      const overlay = ghost.__ghostIconOverlay;
      if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.transform = 'translate(-50%, -50%) scale(0.92)';
      }
    });
  });

  setTimeout(() => {
    ghosts.forEach(({ ghost }) => {
      try { ghost.remove(); } catch (e) {}
    });
    done();
  }, 430);
}

// -------------------- zones toggle (collapse to header) --------------------
function isZonesCollapsed() { return localStorage.getItem('zonesCollapsed') === '1'; }

function applyCollapsedBodyClass() {
  // helps grid/containers expand the file list area when sidebar is hidden
  document.body.classList.toggle('sidebar-hidden', isZonesCollapsed());
  const main = document.querySelector('.main-wrapper') || document.querySelector('#main') || document.querySelector('main');
  if (main) {
    main.style.contain = 'size';
    void main.offsetHeight;
    setTimeout(() => { main.style.removeProperty('contain'); }, 0);
  }
}

function setZonesCollapsed(collapsed) {
  const currently = isZonesCollapsed();
  if (collapsed === currently) return;

  if (collapsed) {
    // ---- COLLAPSE: immediately expand file area, then animate cards up into header ----
    localStorage.setItem('zonesCollapsed', '1');

    // File list area expands right away (no delay)
    applyCollapsedBodyClass();
    ensureZonesToggle();
    updateZonesToggleUI();

    document.dispatchEvent(
      new CustomEvent('zones:collapsed-changed', { detail: { collapsed: true } })
    );

    try {
      animateCardsIntoHeaderAndThen(() => {
        const sb = getSidebar();
        if (sb) sb.style.display = 'none';
        updateSidebarVisibility();
        updateTopZoneLayout();
        showHeaderDockPersistent();
      });
    } catch (e) {
      console.warn('[zones] collapse animation failed, collapsing instantly', e);
      // Fallback: old instant behavior
      getCards().forEach(insertCardInHeader);
      showHeaderDockPersistent();
      updateSidebarVisibility();
      updateTopZoneLayout();
    }
  } else {
    // ---- EXPAND: immediately shrink file area, then animate cards out of header ----
    localStorage.setItem('zonesCollapsed', '0');

    // File list shrinks back right away
    applyCollapsedBodyClass();
    ensureZonesToggle();
    updateZonesToggleUI();

    document.dispatchEvent(
      new CustomEvent('zones:collapsed-changed', { detail: { collapsed: false } })
    );

    try {
      animateCardsOutOfHeaderThen(() => {
        // After ghosts land, put the REAL cards back into their proper zones
        applyUserLayoutOrDefault();
        if (__cleanupTopZonePreExpand) {
          try { __cleanupTopZonePreExpand(); } catch (e) {}
          __cleanupTopZonePreExpand = null;
          updateTopZoneLayout();
        }
        loadHeaderOrder();
        hideHeaderDockPersistent();
        updateSidebarVisibility();
        updateTopZoneLayout();
      });
    } catch (e) {
      console.warn('[zones] expand animation failed, expanding instantly', e);
      // Fallback: just restore layout
      applyUserLayoutOrDefault();
      loadHeaderOrder();
      hideHeaderDockPersistent();
      updateSidebarVisibility();
      updateTopZoneLayout();
    }
  }
}


function getHeaderHost() {
  let host = document.querySelector('.header-container .header-left');
  if (!host) host = document.querySelector('.header-container');
  if (!host) host = document.querySelector('header');
  return host || document.body;
}

function animateZonesCollapseAndThen(done) {
  const sb = getSidebar();
  const top = getTopZone();
  const cards = [];

  if (sb) cards.push(...sb.querySelectorAll('#uploadCard, #folderManagementCard'));
  if (top) cards.push(...top.querySelectorAll('#uploadCard, #folderManagementCard'));

  if (!cards.length) {
    done();
    return;
  }

  // quick "rise away" animation
  cards.forEach(card => {
    card.style.transition = 'transform 0.18s ease-out, opacity 0.18s ease-out';
    card.style.transform = 'translateY(-10px)';
    card.style.opacity = '0';
  });

  setTimeout(() => {
    cards.forEach(card => {
      card.style.transition = '';
      card.style.transform = '';
      card.style.opacity = '';
    });
    done();
  }, 190);
}

function ensureZonesToggle() {
  const host = getHeaderHost();
  if (!host) return;

  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

  let btn = $('sidebarToggleFloating');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'sidebarToggleFloating';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Toggle panels');
    Object.assign(btn.style, {
      position: 'absolute',
      top: `${TOGGLE_TOP_PX}px`,
      left: `${TOGGLE_LEFT_PX}px`,
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
      lineHeight: '0'
    });
    btn.classList.add('zones-toggle');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setZonesCollapsed(!isZonesCollapsed());
    });

    const afterLogo = host.querySelector('.header-logo');
    if (afterLogo && afterLogo.parentNode) {
      afterLogo.parentNode.insertBefore(btn, afterLogo.nextSibling);
    } else {
      host.appendChild(btn);
    }
  }
  themeToggleButton(btn);
  updateZonesToggleUI();
}

function updateZonesToggleUI() {
  const btn = $('sidebarToggleFloating');
  if (!btn) return;
  const collapsed = isZonesCollapsed();
  const iconName = collapsed ? TOGGLE_ICON_CLOSED : TOGGLE_ICON_OPEN;
  btn.innerHTML = `<i class="material-icons toggle-icon" aria-hidden="true">${iconName}</i>`;
  btn.title = collapsed ? 'Show panels' : 'Hide panels';

  const iconEl = btn.querySelector('.toggle-icon');
  if (iconEl) {
    iconEl.style.transition = 'transform 0.2s ease';
    iconEl.style.display = 'inline-flex';
    iconEl.style.alignItems = 'center';
    // rotate if both cards are in top zone (only when not collapsed)
    const tz = getTopZone();
    const allTop = !!tz?.querySelector('#uploadCard') && !!tz?.querySelector('#folderManagementCard');
    iconEl.style.transform = (!collapsed && allTop) ? 'rotate(90deg)' : 'rotate(0deg)';
  }
  themeToggleButton(btn);
}

// Keep the button styled when theme flips
(function watchThemeChanges() {
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'attributes' && m.attributeName === 'class') {
        const btn = $('sidebarToggleFloating');
        if (btn) themeToggleButton(btn);
      }
    }
  });
  obs.observe(document.body, { attributes: true });
})();

// -------------------- layout polish --------------------
function hasSidebarCards() {
  const sb = getSidebar();
  return !!sb && sb.querySelectorAll('#uploadCard, #folderManagementCard').length > 0;
}
function hasTopZoneCards() {
  const tz = getTopZone();
  return !!tz && tz.querySelectorAll('#uploadCard, #folderManagementCard').length > 0;
}
function updateSidebarVisibility() {
  const sb = getSidebar();
  if (!sb) return;
  const any = hasSidebarCards();
  sb.style.display = (isZonesCollapsed() || !any) ? 'none' : 'block';
}
function updateTopZoneLayout() {
  const top = getTopZone();
  const left = getLeftCol();
  const right = getRightCol();
  const hasUpload = !!top?.querySelector('#uploadCard');
  const hasFolder = !!top?.querySelector('#folderManagementCard');

  if (left && right) {
    if (hasUpload && !hasFolder) {
      right.style.display = 'none';
      left.style.display = '';
      left.style.margin = '0 auto';
    } else if (!hasUpload && hasFolder) {
      left.style.display = 'none';
      right.style.display = '';
      right.style.margin = '0 auto';
    } else {
      left.style.display = '';
      right.style.display = '';
      left.style.margin = '';
      right.style.margin = '';
    }
  }
  if (top) top.style.display = (hasUpload || hasFolder) ? '' : 'none';
}

// --- sidebar placeholder while dragging (only when empty) ---
function ensureSidebarPlaceholder() {
  const sb = getSidebar();
  if (!sb) return;
  if (hasSidebarCards()) return; // only when empty
  let ph = sb.querySelector('.sb-dnd-placeholder');
  if (!ph) {
    ph = document.createElement('div');
    ph.className = 'sb-dnd-placeholder';
    Object.assign(ph.style, {
      height: '340px',
      width: '100%',
      visibility: 'hidden'
    });
    sb.appendChild(ph);
  }
}
function removeSidebarPlaceholder() {
  const sb = getSidebar();
  if (!sb) return;
  const ph = sb.querySelector('.sb-dnd-placeholder');
  if (ph) ph.remove();
}

// -------------------- DnD core --------------------
function addTopZoneHighlight() {
  const top = getTopZone();
  if (!top) return;
  top.classList.add('highlight');
  if (top.querySelectorAll('#uploadCard, #folderManagementCard').length === 0) {
    top.style.minHeight = '375px';
  }
}
function removeTopZoneHighlight() {
  const top = getTopZone();
  if (!top) return;
  top.classList.remove('highlight');
  top.style.minHeight = '';
}
function showTopZoneWhileDragging() {
  const top = getTopZone();
  if (!top) return;
  top.style.display = '';
  if (top.querySelectorAll('#uploadCard, #folderManagementCard').length === 0) {
    let ph = top.querySelector('.placeholder');
    if (!ph) {
      ph = document.createElement('div');
      ph.className = 'placeholder';
      ph.style.visibility = 'hidden';
      ph.style.display = 'block';
      ph.style.width = '100%';
      ph.style.height = '375px';
      top.appendChild(ph);
    }
  }
}
function cleanupTopZoneAfterDrop() {
  const top = getTopZone();
  if (!top) return;
  const ph = top.querySelector('.placeholder');
  if (ph) ph.remove();
  top.classList.remove('highlight');
  top.style.minHeight = '';
  // ✅ fixed selector string here
  const hasAny = top.querySelectorAll('#uploadCard, #folderManagementCard').length > 0;
  top.style.display = hasAny ? '' : 'none';
}
function showHeaderDropZone() {
  const h = getHeaderDropArea();
  if (h) {
    h.style.display = 'inline-flex';
    h.classList.add('drag-active');
  }
}
function hideHeaderDropZone() {
  const h = getHeaderDropArea();
  if (h) {
    h.classList.remove('drag-active');
    if (h.children.length === 0 && !isZonesCollapsed()) h.style.display = 'none';
  }
}

function makeCardDraggable(card) {
  if (!card) return;
  const header = card.querySelector('.card-header');
  if (header) header.classList.add('drag-header');

  let isDragging = false;
  let dragTimer = null;
  let offsetX = 0, offsetY = 0;
  let initialLeft, initialTop;

  if (header) {
    header.addEventListener('mousedown', function (e) {
      e.preventDefault();
      const c = this.closest('.card');
      const rect = c.getBoundingClientRect();
      const originX = ((e.clientX - rect.left) / rect.width) * 100;
      const originY = ((e.clientY - rect.top) / rect.height) * 100;
      c.style.transformOrigin = `${originX}% ${originY}%`;

      dragTimer = setTimeout(() => {
        isDragging = true;
        c.classList.add('dragging');
        c.style.pointerEvents = 'none';

        addTopZoneHighlight();
        showTopZoneWhileDragging();

        const sb = getSidebar();
        if (sb) {
          sb.classList.add('active', 'highlight');
          // Always show sidebar as a drop target while dragging
          sb.style.display = 'block';
          ensureSidebarPlaceholder(); // make empty sidebar easy to drop into
        }

        showHeaderDropZone();

        initialLeft = rect.left + window.pageXOffset;
        initialTop = rect.top + window.pageYOffset;
        offsetX = e.pageX - initialLeft;
        offsetY = e.pageY - initialTop;

        // If represented in header, remove its icon so we can move freely
        removeHeaderIconForCard(c);

        document.body.appendChild(c);
        Object.assign(c.style, {
          position: 'absolute',
          left: initialLeft + 'px',
          top: initialTop + 'px',
          width: rect.width + 'px',
          height: rect.height + 'px',
          zIndex: '10000',
          pointerEvents: 'none'
        });
      }, 450);
    });

    header.addEventListener('mouseup', function () { clearTimeout(dragTimer); });
  }

  document.addEventListener('mousemove', function (e) {
    if (isDragging) {
      card.style.left = (e.pageX - offsetX) + 'px';
      card.style.top = (e.pageY - offsetY) + 'px';
    }
  });

  document.addEventListener('mouseup', function (e) {
    if (!isDragging) return;
    isDragging = false;
    card.style.pointerEvents = '';
    card.classList.remove('dragging');

    const sb = getSidebar();
    if (sb) {
      sb.classList.remove('highlight');
      removeSidebarPlaceholder();
    }

    let dropped = null;

    // Sidebar drop?
    if (sb) {
      const r = sb.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        placeCardInZone(card, ZONES.SIDEBAR);
        dropped = ZONES.SIDEBAR;
      }
    }

    // Top zone drop?
    if (!dropped) {
      const top = getTopZone();
      if (top) {
        const r = top.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          const dest = (card.id === 'uploadCard') ? ZONES.TOP_LEFT : ZONES.TOP_RIGHT;
          placeCardInZone(card, dest);
          dropped = dest;
        }
      }
    }

    // Header drop?
    if (!dropped) {
      const h = getHeaderDropArea();
      if (h) {
        const r = h.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          placeCardInZone(card, ZONES.HEADER);
          dropped = ZONES.HEADER;
        }
      }
    }

    if (!dropped) {
      // return to original container
      const orig = $(card.dataset.originalContainerId);
      if (orig) {
        orig.appendChild(card);
        card.style.removeProperty('width');
        animateVerticalSlide(card);
      }
    } else {
      setLayoutFor(card.id, dropped);
    }

    // Clear inline drag styles
    ['position', 'left', 'top', 'z-index', 'height', 'min-width', 'flex-shrink', 'transition', 'transform', 'opacity', 'width', 'pointer-events']
      .forEach(prop => card.style.removeProperty(prop));

    removeTopZoneHighlight();
    hideHeaderDropZone();
    cleanupTopZoneAfterDrop();
    updateTopZoneLayout();
    updateSidebarVisibility();
    updateZonesToggleUI();
  });
}

// -------------------- defaults + layout --------------------
function applyUserLayoutOrDefault() {
  const layout = readLayout();
  const hasAny = Object.keys(layout).length > 0;

  if (hasAny) {
    const placed = new Set();
    if (!isSmallScreen()) {
      ORDER_TRACKED_ZONES.forEach(zoneId => applyZoneOrder(layout, zoneId, placed));
    }

    getCards().forEach(card => {
      const targetZone = layout[card.id];
      if (!targetZone) return;
      if (placed.has(card.id)) return;
      // On small screens: if saved zone is the sidebar, temporarily place in top cols
      if (isSmallScreen() && targetZone === ZONES.SIDEBAR) {
        const target = (card.id === 'uploadCard') ? ZONES.TOP_LEFT : ZONES.TOP_RIGHT;
        placeCardInZone(card, target, { animate: false });
      } else {
        placeCardInZone(card, targetZone, { animate: false });
      }
    });
    updateTopZoneLayout();
    updateSidebarVisibility();
    return;
  }

  // No saved layout yet: apply defaults
  if (!isSmallScreen()) {
    getCards().forEach(c => placeCardInZone(c, ZONES.SIDEBAR, { animate: false }));
  } else {
    getCards().forEach(c => {
      const zone = (c.id === 'uploadCard') ? ZONES.TOP_LEFT : ZONES.TOP_RIGHT;
      placeCardInZone(c, zone, { animate: false });
    });
  }
  updateTopZoneLayout();
  updateSidebarVisibility();
  saveCurrentLayout(); // initialize baseline so future moves persist
}

// -------------------- public API --------------------
export function loadSidebarOrder() {
  applyUserLayoutOrDefault();
  ensureZonesToggle();
  updateZonesToggleUI();
  applyCollapsedBodyClass();
}

export function loadHeaderOrder() {
  const header = getHeaderDropArea();
  if (!header) return;
  header.innerHTML = '';

  const layout = readLayout();

  if (isZonesCollapsed()) {
    getCards().forEach(insertCardInHeader);
    showHeaderDockPersistent();
    saveHeaderOrder();
    return;
  }

  // Not collapsed: only cards saved to header zone appear as icons
  getCards().forEach(card => {
    if (layout[card.id] === ZONES.HEADER) insertCardInHeader(card);
  });
  if (header.children.length === 0) header.style.display = 'none';
  saveHeaderOrder();
}

export function initDragAndDrop() {
  function run() {
    // 1) Layout on first paint
    applyUserLayoutOrDefault();
    loadHeaderOrder();

    // 2) Paint controls/UI
    ensureZonesToggle();
    updateZonesToggleUI();
    applyCollapsedBodyClass();

    // 3) Make cards draggable
    getCards().forEach(makeCardDraggable);

    // 4) Enforce responsive (and keep doing so)
    let raf = null;
    const onResize = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => enforceResponsiveZones());
    };
    window.addEventListener('resize', onResize);
    enforceResponsiveZones();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
}
