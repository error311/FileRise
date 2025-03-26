// dragAndDrop.js

// Moves cards into the sidebar based on the saved order in localStorage.
export function loadSidebarOrder() {
    const sidebar = document.getElementById('sidebarDropArea');
    if (!sidebar) return;
    const orderStr = localStorage.getItem('sidebarOrder');
    if (orderStr) {
      const order = JSON.parse(orderStr);
      if (order.length > 0) {
        // Ensure main wrapper is visible.
        const mainWrapper = document.querySelector('.main-wrapper');
        if (mainWrapper) {
          mainWrapper.style.display = 'flex';
        }
        // For each saved ID, move the card into the sidebar.
        order.forEach(id => {
          const card = document.getElementById(id);
          if (card && card.parentNode.id !== 'sidebarDropArea') {
            sidebar.appendChild(card);
            // Animate vertical slide for sidebar card
            animateVerticalSlide(card);
          }
        });
      }
    }
    updateSidebarVisibility();
  }
  
  // Internal helper: update sidebar visibility based on its content.
  function updateSidebarVisibility() {
    const sidebar = document.getElementById('sidebarDropArea');
    if (sidebar) {
      const cards = sidebar.querySelectorAll('#uploadCard, #folderManagementCard');
      if (cards.length > 0) {
        sidebar.classList.add('active');
        sidebar.style.display = 'block';
      } else {
        sidebar.classList.remove('active');
        sidebar.style.display = 'none';
      }
      // Save the current order in localStorage.
      saveSidebarOrder();
    }
  }
  
  // Internal helper: update top zone layout (center a card if one column is empty).
  function updateTopZoneLayout() {
    const leftCol = document.getElementById('leftCol');
    const rightCol = document.getElementById('rightCol');
    
    const leftIsEmpty = !leftCol.querySelector('#uploadCard');
    const rightIsEmpty = !rightCol.querySelector('#folderManagementCard');
  
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
  // It sets an initial vertical offset (30px down) and opacity 0, then animates to normal position and full opacity.
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
    const sidebar = document.getElementById('sidebarDropArea');
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
  }
  
  // Internal helper: save the current sidebar card order to localStorage.
  function saveSidebarOrder() {
    const sidebar = document.getElementById('sidebarDropArea');
    if (sidebar) {
      const cards = sidebar.querySelectorAll('#uploadCard, #folderManagementCard');
      const order = Array.from(cards).map(card => card.id);
      localStorage.setItem('sidebarOrder', JSON.stringify(order));
    }
  }
  
  // Helper: move cards from sidebar back to the top drop area when on small screens.
  function moveSidebarCardsToTop() {
    if (window.innerWidth < 1205) {
      const sidebar = document.getElementById('sidebarDropArea');
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
  
  // This sets up all drag-and-drop event listeners for cards.
  export function initDragAndDrop() {
    function run() {
      const draggableCards = document.querySelectorAll('#uploadCard, #folderManagementCard');
      draggableCards.forEach(card => {
        if (!card.dataset.originalContainerId) {
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
            const rect = card.getBoundingClientRect();
            const originX = ((e.clientX - rect.left) / rect.width) * 100;
            const originY = ((e.clientY - rect.top) / rect.height) * 100;
            card.style.transformOrigin = `${originX}% ${originY}%`;
            dragTimer = setTimeout(() => {
              isDragging = true;
              card.classList.add('dragging');
              addTopZoneHighlight();
              const rect = card.getBoundingClientRect();
              initialLeft = rect.left + window.pageXOffset;
              initialTop = rect.top + window.pageYOffset;
              offsetX = e.pageX - initialLeft;
              offsetY = e.pageY - initialTop;
              document.body.appendChild(card);
              card.style.position = 'absolute';
              card.style.left = initialLeft + 'px';
              card.style.top = initialTop + 'px';
              card.style.width = rect.width + 'px';
              card.style.zIndex = '10000';
              const sidebar = document.getElementById('sidebarDropArea');
              if (sidebar) {
                sidebar.classList.add('active');
                sidebar.style.display = 'block';
                sidebar.classList.add('highlight');
              }
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
            card.classList.remove('dragging');
            removeTopZoneHighlight();
            const sidebar = document.getElementById('sidebarDropArea');
            if (sidebar) {
              sidebar.classList.remove('highlight');
            }
            
            const leftCol = document.getElementById('leftCol');
            const rightCol = document.getElementById('rightCol');
            let droppedInSidebar = false;
            let droppedInTop = false;
            
            const sidebarElem = document.getElementById('sidebarDropArea');
            if (sidebarElem) {
              const rect = sidebarElem.getBoundingClientRect();
              if (
                e.clientX >= rect.left &&
                e.clientX <= rect.right &&
                e.clientY >= rect.top &&
                e.clientY <= rect.bottom
              ) {
                insertCardInSidebar(card, e);
                droppedInSidebar = true;
                sidebarElem.blur();
              }
            }
            
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
                  container.appendChild(card);
                  droppedInTop = true;
                  
                  container.style.position = 'relative';
                  card.style.position = 'absolute';
                  card.style.left = '0px';
                  
                  // For top drop, animate vertical slide/fade.
                  card.style.transform = 'translateY(30px)';
                  card.style.opacity = '0';
                  
                  card.offsetWidth; // Force reflow.
                  
                  requestAnimationFrame(() => {
                    card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
                    card.style.transform = 'translateY(0)';
                    card.style.opacity = '1';
                  });
                  
                  setTimeout(() => {
                    card.style.position = '';
                    container.style.position = '';
                    card.style.transition = '';
                    card.style.transform = '';
                    card.style.opacity = '';
                    // Ensure the card returns to full width (via CSS: width: 100%)
                    card.style.width = '';
                  }, 310);
                }
              }
            }
            
            if (droppedInSidebar || droppedInTop) {
              card.style.position = '';
              card.style.left = '';
              card.style.top = '';
              card.style.zIndex = '';
            } else {
              const orig = document.getElementById(card.dataset.originalContainerId);
              if (orig) {
                orig.appendChild(card);
                card.style.position = '';
                card.style.left = '';
                card.style.top = '';
                card.style.zIndex = '';
                card.style.width = '';
              }
            }
            updateTopZoneLayout();
            updateSidebarVisibility();
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