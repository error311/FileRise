// dragAndDrop.js
// This file handles drag-and-drop functionality for cards in the sidebar, header and top drop zones.
// It also manages the visibility of the sidebar and header drop zones based on the current state of the application.
// It includes functions to save and load the order of cards in the sidebar and header from localStorage.
// It also includes functions to handle the drag-and-drop events, including mouse movements and drop zones.
// It uses CSS classes to manage the appearance of the sidebar and header drop zones during drag-and-drop operations.

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
  
  // NEW: Load header order from localStorage.
  export function loadHeaderOrder() {
    const headerDropArea = document.getElementById('headerDropArea');
    if (!headerDropArea) return;
    const orderStr = localStorage.getItem('headerOrder');
    if (orderStr) {
      const order = JSON.parse(orderStr);
      if (order.length > 0) {
        order.forEach(id => {
          const card = document.getElementById(id);
          // Only load if card is not already in header drop zone.
          if (card && card.parentNode.id !== 'headerDropArea') {
            insertCardInHeader(card, null);
          }
        });
      }
    }
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
    
  // --- NEW HELPER FUNCTIONS FOR HEADER DROP ZONE ---
  
  // Show header drop zone and add a "drag-active" class so that the pseudo-element appears.
  function showHeaderDropZone() {
    const headerDropArea = document.getElementById('headerDropArea');
    if (headerDropArea) {
      headerDropArea.style.display = 'inline-flex';
      headerDropArea.classList.add('drag-active');
    }
  }
    
  // Hide header drop zone by removing the "drag-active" class.
  // If a header icon is present (i.e. a card was dropped), the drop zone remains visible without the dashed border.
  function hideHeaderDropZone() {
    const headerDropArea = document.getElementById('headerDropArea');
    if (headerDropArea) {
      headerDropArea.classList.remove('drag-active');
      if (headerDropArea.children.length === 0) {
        headerDropArea.style.display = 'none';
      }
    }
  }
    
  // === NEW FUNCTION: Insert card into header drop zone as a material icon ===
  function insertCardInHeader(card, event) {
      const headerDropArea = document.getElementById('headerDropArea');
      if (!headerDropArea) return;
      
      // For folder management and upload cards, preserve the original by moving it to a hidden container.
      if (card.id === 'folderManagementCard' || card.id === 'uploadCard') {
        let hiddenContainer = document.getElementById('hiddenCardsContainer');
        if (!hiddenContainer) {
          hiddenContainer = document.createElement('div');
          hiddenContainer.id = 'hiddenCardsContainer';
          hiddenContainer.style.display = 'none';
          document.body.appendChild(hiddenContainer);
        }
        // Move the original card to the hidden container if it's not already there.
        if (card.parentNode.id !== 'hiddenCardsContainer') {
          hiddenContainer.appendChild(card);
        }
      } else {
        // For other cards, simply remove from current container.
        if (card.parentNode) {
          card.parentNode.removeChild(card);
        }
      }
      
      // Create the header icon button.
      const iconButton = document.createElement('button');
      iconButton.className = 'header-card-icon';
      // Remove default button styling.
      iconButton.style.border = 'none';
      iconButton.style.background = 'none';
      iconButton.style.outline = 'none';
      iconButton.style.cursor = 'pointer';
        
      // Choose an icon based on the card type with 24px size.
      if (card.id === 'uploadCard') {
        iconButton.innerHTML = '<i class="material-icons" style="font-size:24px;">cloud_upload</i>';
      } else if (card.id === 'folderManagementCard') {
        iconButton.innerHTML = '<i class="material-icons" style="font-size:24px;">folder</i>';
      } else {
        iconButton.innerHTML = '<i class="material-icons" style="font-size:24px;">insert_drive_file</i>';
      }
      
      // Save a reference to the card in the icon button.
      iconButton.cardElement = card;
      // Associate this icon with the card for future removal.
      card.headerIconButton = iconButton;
      
      let modal = null;
      let isLocked = false;
      let hoverActive = false;
      
      // showModal: When triggered, ensure the card is attached to the modal.
      function showModal() {
        if (!modal) {
          modal = document.createElement('div');
          modal.className = 'header-card-modal';
          modal.style.position = 'fixed';
          modal.style.top = '55px';
          modal.style.right = '80px';
          modal.style.zIndex = '11000';
          // Render the modal but initially keep it hidden.
          modal.style.display = 'block';
          modal.style.visibility = 'hidden';
          modal.style.opacity = '0';
          modal.style.background = 'none';
          modal.style.border = 'none';
          modal.style.padding = '0';
          modal.style.boxShadow = 'none';
          document.body.appendChild(modal);
          // Attach modal hover events.
          modal.addEventListener('mouseover', handleMouseOver);
          modal.addEventListener('mouseout', handleMouseOut);
          iconButton.modalInstance = modal;
        }
        // If the card isn't already in the modal, remove it from the hidden container and attach it.
        if (!modal.contains(card)) {
          const hiddenContainer = document.getElementById('hiddenCardsContainer');
          if (hiddenContainer && hiddenContainer.contains(card)) {
            hiddenContainer.removeChild(card);
          }
          modal.appendChild(card);
        }
        // Reveal the modal.
        modal.style.visibility = 'visible';
        modal.style.opacity = '1';
      }
      
      // hideModal: Hide the modal and return the card to the hidden container.
      function hideModal() {
        if (modal && !isLocked && !hoverActive) {
          modal.style.visibility = 'hidden';
          modal.style.opacity = '0';
          // Return the card to the hidden container.
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
      
      // Attach hover events to the icon.
      iconButton.addEventListener('mouseover', handleMouseOver);
      iconButton.addEventListener('mouseout', handleMouseOut);
      
      // Toggle the locked state on click so the modal stays open.
      iconButton.addEventListener('click', (e) => {
        isLocked = !isLocked;
        if (isLocked) {
          showModal();
        } else {
          hideModal();
        }
        e.stopPropagation();
      });
      
      // Append the header icon button into the header drop zone.
      headerDropArea.appendChild(iconButton);
      // Save the updated header order.
      saveHeaderOrder();
    }
    
  // === Main Drag and Drop Initialization ===
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
            // Capture the card's initial bounding rectangle.
            const initialRect = card.getBoundingClientRect();
            const originX = ((e.clientX - initialRect.left) / initialRect.width) * 100;
            const originY = ((e.clientY - initialRect.top) / initialRect.height) * 100;
            card.style.transformOrigin = `${originX}% ${originY}%`;
    
            // Store the initial rect so we use it later.
            dragTimer = setTimeout(() => {
              isDragging = true;
              card.classList.add('dragging');
              card.style.pointerEvents = 'none';
              addTopZoneHighlight();
    
              const sidebar = document.getElementById('sidebarDropArea');
              if (sidebar) {
                sidebar.classList.add('active');
                sidebar.style.display = 'block';
                sidebar.classList.add('highlight');
                sidebar.style.height = '800px';
              }
    
              // Show header drop zone while dragging.
              showHeaderDropZone();
    
              // Use the stored initialRect.
              initialLeft = initialRect.left + window.pageXOffset;
              initialTop = initialRect.top + window.pageYOffset;
              offsetX = e.pageX - initialLeft;
              offsetY = e.pageY - initialTop;
    
              // Remove any associated header icon if present.
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
    
              // Append card to body and fix its dimensions.
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
    
            const sidebar = document.getElementById('sidebarDropArea');
            if (sidebar) {
              sidebar.classList.remove('highlight');
              sidebar.style.height = '';
            }
    
            // Remove any existing header icon if present.
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
            const sidebarElem = document.getElementById('sidebarDropArea');
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
                  // Set a fixed width during animation.
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
    
            // Hide header drop zone if no icon is present.
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