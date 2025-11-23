// Admin panel inline CSS moved out of adminPanel.js
// This file is imported for its side effects only.

(function () {
    if (document.getElementById('adminPanelStyles')) return;
    const style = document.createElement('style');
    style.id = 'adminPanelStyles';
    style.textContent = `
      /* Modal sizing */
      #adminPanelModal .modal-content {
        max-width: 1100px;
        width: 50%;
        background: #fff !important;
        color: #000 !important;
        border: 1px solid #ccc !important;
      }
      @media (max-width: 900px) {
        #adminPanelModal .modal-content {
          width: 100%;
          max-width: 100%;
        }
      }
      @media (max-width: 768px) {
        #adminPanelModal .modal-content {
          width: 100%;
          max-width: 100%;
          border-radius: 0;
          height: 100%;
        }
      }
  
      /* Modal header */
      #adminPanelModal .modal-header {
        border-bottom: 1px solid rgba(0,0,0,0.15);
        padding: 0.75rem 1rem;
        align-items: center;
      }
      #adminPanelModal .modal-title {
        font-size: 1rem;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      #adminPanelModal .modal-title .admin-title-badge {
        font-size: 0.75rem;
        font-weight: 500;
        padding: 0.1rem 0.4rem;
        border-radius: 999px;
        border: 1px solid rgba(0,0,0,0.12);
        background: rgba(0,0,0,0.03);
      }
  
      /* Modal body layout */
      #adminPanelModal .modal-body {
        display: flex;
        gap: 1rem;
        padding: 0.75rem 1rem 1rem;
        align-items: flex-start;
      }
      @media (max-width: 768px) {
        #adminPanelModal .modal-body {
          flex-direction: column;
        }
      }
  
      /* Sidebar nav */
      #adminPanelSidebar {
        width: 220px;
        max-width: 220px;
        padding-right: 0.75rem;
        border-right: 1px solid rgba(0,0,0,0.08);
      }
      @media (max-width: 768px) {
        #adminPanelSidebar {
          width: 100%;
          max-width: 100%;
          border-right: none;
          border-bottom: 1px solid rgba(0,0,0,0.08);
          padding-bottom: 0.5rem;
          margin-bottom: 0.5rem;
        }
      }
      #adminPanelSidebar .nav {
        flex-direction: column;
        gap: 0.25rem;
      }
      #adminPanelSidebar .nav-link {
        border-radius: 0.5rem;
        padding: 0.35rem 0.6rem;
        font-size: 0.85rem;
        display: flex;
        align-items: center;
        gap: 0.4rem;
        border: 1px solid transparent;
        color: #333;
      }
      #adminPanelSidebar .nav-link .material-icons {
        font-size: 1rem;
      }
      #adminPanelSidebar .nav-link.active {
        background: rgba(0, 123, 255, 0.08);
        border-color: rgba(0, 123, 255, 0.3);
        color: #0056b3;
      }
      #adminPanelSidebar .nav-link:hover {
        background: rgba(0,0,0,0.03);
      }
  
      /* Content area */
      #adminPanelContent {
        flex: 1;
        min-width: 0;
      }
  
      .admin-section-title {
        font-size: 0.95rem;
        font-weight: 600;
        margin-bottom: 0.35rem;
        display: flex;
        align-items: center;
        gap: 0.35rem;
      }
      .admin-section-title .material-icons {
        font-size: 1rem;
      }
      .admin-section-subtitle {
        font-size: 0.8rem;
        color: rgba(0,0,0,0.6);
        margin-bottom: 0.75rem;
      }
  
      .admin-field-group {
        margin-bottom: 0.9rem;
      }
      .admin-field-group label {
        font-size: 0.8rem;
        font-weight: 500;
        margin-bottom: 0.2rem;
      }
      .admin-field-group small {
        font-size: 0.75rem;
        color: rgba(0,0,0,0.6);
      }
  
      .admin-inline-actions {
        display: flex;
        gap: 0.35rem;
        flex-wrap: wrap;
        align-items: center;
        margin-top: 0.25rem;
      }
  
      .admin-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        border-radius: 999px;
        padding: 0.1rem 0.5rem;
        font-size: 0.7rem;
        background: rgba(0,0,0,0.03);
        border: 1px solid rgba(0,0,0,0.08);
      }
      .admin-badge .material-icons {
        font-size: 0.9rem;
      }
  
      /* Tables */
      .admin-table-sm {
        font-size: 0.8rem;
        margin-bottom: 0.75rem;
      }
      .admin-table-sm th,
      .admin-table-sm td {
        padding: 0.35rem 0.4rem !important;
        vertical-align: middle;
      }
  
      /* Switch alignment */
      .form-check.form-switch .form-check-input {
        cursor: pointer;
      }
  
      /* Pro license textarea */
      #proLicenseInput {
        font-family: var(--filr-font-mono, monospace);
        font-size: 0.75rem;
        min-height: 80px;
        resize: vertical;
      }
  
      /* Pro info alert */
      #proLicenseStatus {
        font-size: 0.8rem;
        padding: 0.4rem 0.6rem;
        margin-bottom: 0.4rem;
      }
  
      /* Client portals */
      #clientPortalsBody .portal-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.75rem;
        padding: 0.35rem 0;
        border-bottom: 1px solid rgba(0,0,0,0.04);
      }
      #clientPortalsBody .portal-row:last-child {
        border-bottom: none;
      }
      #clientPortalsBody .portal-meta {
        font-size: 0.75rem;
        color: rgba(0,0,0,0.7);
      }
      #clientPortalsBody .portal-actions {
        display: flex;
        gap: 0.25rem;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
  
      /* Submissions list */
      #clientPortalsBody .portal-submissions {
        margin-top: 0.25rem;
        padding-top: 0.25rem;
        border-top: 1px dashed rgba(0,0,0,0.08);
      }
      #clientPortalsBody .portal-submissions-title {
        font-size: 0.75rem;
        font-weight: 600;
        margin-bottom: 0.1rem;
        opacity: 0.8;
      }
      #clientPortalsBody .portal-submissions-empty {
        font-size: 0.75rem;
        font-style: italic;
        opacity: 0.6;
      }
      #clientPortalsBody .portal-submissions-item {
        font-size: 0.75rem;
        padding: 0.15rem 0;
        border-bottom: 1px solid rgba(0,0,0,0.05);
      }
      #clientPortalsBody .portal-submissions-item:last-child {
        border-bottom: none;
      }
      #clientPortalsBody .portal-submissions-meta {
        opacity: 0.75;
        font-size: 0.75rem;
      }
  
      /* Dark mode overrides */
      .dark-mode #adminPanelModal .modal-content {
        background: #121212 !important;
        color: #f5f5f5 !important;
        border-color: rgba(255,255,255,0.15) !important;
      }
      .dark-mode #adminPanelModal .modal-header {
        border-bottom-color: rgba(255,255,255,0.15);
      }
      .dark-mode #adminPanelSidebar {
        border-right-color: rgba(255,255,255,0.12);
      }
      .dark-mode #adminPanelSidebar .nav-link {
        color: #f5f5f5;
      }
      .dark-mode #adminPanelSidebar .nav-link:hover {
        background: rgba(255,255,255,0.04);
      }
      .dark-mode #adminPanelSidebar .nav-link.active {
        background: rgba(13,110,253,0.3);
        border-color: rgba(13,110,253,0.7);
        color: #fff;
      }
      .dark-mode .admin-section-subtitle {
        color: rgba(255,255,255,0.6);
      }
      .dark-mode .admin-field-group small {
        color: rgba(255,255,255,0.6);
      }
      .dark-mode .admin-badge {
        background: rgba(255,255,255,0.04);
        border-color: rgba(255,255,255,0.12);
      }
      .dark-mode .admin-table-sm tbody tr:hover td {
        background: rgba(255,255,255,0.02);
      }
      .dark-mode #clientPortalsBody .portal-row {
        border-bottom-color: rgba(255,255,255,0.08);
      }
      .dark-mode #clientPortalsBody .portal-meta {
        color: rgba(255,255,255,0.7);
      }
      .dark-mode #clientPortalsBody .portal-submissions {
        border-top-color: rgba(255,255,255,0.12);
      }
      .dark-mode #clientPortalsBody .portal-submissions-empty {
        color: rgba(255,255,255,0.5);
      }
    `;
    document.head.appendChild(style);
  })();