/* i18n.js */
const translations = {
    en: { /* English translations */
      "please_log_in_to_continue": "Please log in to continue.",
      "no_files_selected": "No files selected.",
      "confirm_delete_files": "Are you sure you want to delete {count} selected file(s)?",
      "element_not_found": "Element with id \"{id}\" not found.",
      "search_placeholder": "Search files or tag...",
      "file_name": "File Name",
      "date_modified": "Date Modified",
      "upload_date": "Upload Date",
      "file_size": "File Size",
      "uploader": "Uploader",
      "enter_totp_code": "Enter TOTP Code",
      "use_recovery_code_instead": "Use Recovery Code instead",
      "enter_recovery_code": "Enter Recovery Code",
      "editing": "Editing",
      "decrease_font": "A-",
      "increase_font": "A+",
      "save": "Save",
      "close": "Close",
      "no_files_found": "No files found.",
      "switch_to_table_view": "Switch to Table View",
      "switch_to_gallery_view": "Switch to Gallery View",
      "share_file": "Share File",
      "set_expiration": "Set Expiration:",
      "password_optional": "Password (optional):",
      "generate_share_link": "Generate Share Link",
      "shareable_link": "Shareable Link:",
      "copy_link": "Copy Link",
      "tag_file": "Tag File",
      "tag_name": "Tag Name:",
      "tag_color": "Tag Color:",
      "save_tag": "Save Tag",
      "files_in": "Files in",
      "light_mode": "Light Mode",
      "dark_mode": "Dark Mode",
      "upload_instruction": "Drop files/folders here or click 'Choose files'",
      "no_files_selected_default": "No files selected",
      "choose_files": "Choose files",
      "delete_selected": "Delete Selected",
      "copy_selected": "Copy Selected",
      "move_selected": "Move Selected",
      "tag_selected": "Tag Selected",
      "download_zip": "Download Zip",
      "extract_zip": "Extract Zip",
      "preview": "Preview",
      "edit": "Edit",
      "rename": "Rename",
      "trash_empty": "Trash is empty.",
      "no_trash_selected": "No trash items selected for restore.",
  
      // Additional keys for HTML translations:
      "title": "FileRise",
      "header_title": "FileRise",
      "logout": "Logout",
      "change_password": "Change Password",
      "restore_text": "Restore or",
      "delete_text": "Delete Trash Items",
      "restore_selected": "Restore Selected",
      "restore_all": "Restore All",
      "delete_selected_trash": "Delete Selected",
      "delete_all": "Delete All",
      "upload_header": "Upload Files/Folders",
  
      // Folder Management keys:
      "folder_navigation": "Folder Navigation & Management",
      "create_folder": "Create Folder",
      "create_folder_title": "Create Folder",
      "enter_folder_name": "Enter folder name",
      "cancel": "Cancel",
      "create": "Create",
      "rename_folder": "Rename Folder",
      "rename_folder_title": "Rename Folder",
      "rename_folder_placeholder": "Enter new folder name",
      "delete_folder": "Delete Folder",
      "delete_folder_title": "Delete Folder",
      "delete_folder_message": "Are you sure you want to delete this folder?",
      "folder_help": "Folder Help",
      "folder_help_item_1": "Click on a folder in the tree to view its files.",
      "folder_help_item_2": "Use [-] to collapse and [+] to expand folders.",
      "folder_help_item_3": "Select a folder and click \"Create Folder\" to add a subfolder.",
      "folder_help_item_4": "To rename or delete a folder, select it and then click the appropriate button.",
  
      // File List keys:
      "file_list_title": "Files in (Root)",
      "delete_files": "Delete Files",
      "delete_selected_files_title": "Delete Selected Files",
      "delete_files_message": "Are you sure you want to delete the selected files?",
      "copy_files": "Copy Files",
      "copy_files_title": "Copy Selected Files",
      "copy_files_message": "Select a target folder for copying the selected files:",
      "move_files": "Move Files",
      "move_files_title": "Move Selected Files",
      "move_files_message": "Select a target folder for moving the selected files:",
      "move": "Move",
      "extract_zip_button": "Extract Zip",
      "download_zip_title": "Download Selected Files as Zip",
      "download_zip_prompt": "Enter a name for the zip file:",
      "zip_placeholder": "files.zip",
  
      // Login Form keys:
      "login": "Login",
      "remember_me": "Remember me",
      "login_oidc": "Login with OIDC",
      "basic_http_login": "Use Basic HTTP Login",
  
      // Change Password keys:
      "change_password_title": "Change Password",
      "old_password": "Old Password",
      "new_password": "New Password",
      "confirm_new_password": "Confirm New Password",
  
      // Add User keys:
      "create_new_user_title": "Create New User",
      "username": "Username:",
      "password": "Password:",
      "grant_admin": "Grant Admin Access",
      "save_user": "Save User",
  
      // Remove User keys:
      "remove_user_title": "Remove User",
      "select_user_remove": "Select a user to remove:",
      "delete_user": "Delete User",
  
      // Rename File keys:
      "rename_file_title": "Rename File",
      "rename_file_placeholder": "Enter new file name",
  
      // Custom Confirm Modal keys:
      "yes": "Yes",
      "no": "No",
      "delete": "Delete",
      "download": "Download",
      "upload": "Upload",
      "copy": "Copy",
      "extract": "Extract",
  
      // Dark Mode Toggle
      "dark_mode_toggle": "Dark Mode",
      "light_mode_toggle": "Light Mode"
    },
    es: { /* Spanish translations */
        "please_log_in_to_continue": "Por favor, inicie sesión para continuar.",
        "no_files_selected": "No se seleccionaron archivos.",
        "confirm_delete_files": "¿Está seguro de que desea eliminar {count} archivo(s) seleccionado(s)?",
        "element_not_found": "Elemento con id \"{id}\" no encontrado.",
        "search_placeholder": "Buscar archivos o etiqueta...",
        "file_name": "Nombre del archivo",
        "date_modified": "Fecha de modificación",
        "upload_date": "Fecha de carga",
        "file_size": "Tamaño del archivo",
        "uploader": "Cargado por",
        "enter_totp_code": "Ingrese el código TOTP",
        "use_recovery_code_instead": "Usar código de recuperación en su lugar",
        "enter_recovery_code": "Ingrese el código de recuperación",
        "editing": "Editando",
        "decrease_font": "A-",
        "increase_font": "A+",
        "save": "Guardar",
        "close": "Cerrar",
        "no_files_found": "No se encontraron archivos.",
        "switch_to_table_view": "Cambiar a vista de tabla",
        "switch_to_gallery_view": "Cambiar a vista de galería",
        "share_file": "Compartir archivo",
        "set_expiration": "Establecer vencimiento:",
        "password_optional": "Contraseña (opcional):",
        "generate_share_link": "Generar enlace para compartir",
        "shareable_link": "Enlace para compartir:",
        "copy_link": "Copiar enlace",
        "tag_file": "Etiquetar archivo",
        "tag_name": "Nombre de la etiqueta:",
        "tag_color": "Color de la etiqueta:",
        "save_tag": "Guardar etiqueta",
        "files_in": "Archivos en",
        "light_mode": "Modo claro",
        "dark_mode": "Modo oscuro",
        "upload_instruction": "Suelte archivos/carpetas o haga clic en 'Elegir archivos'",
        "no_files_selected_default": "No se seleccionaron archivos",
        "choose_files": "Elegir archivos",
        "delete_selected": "Eliminar seleccionados",
        "copy_selected": "Copiar seleccionados",
        "move_selected": "Mover seleccionados",
        "tag_selected": "Etiquetar seleccionados",
        "download_zip": "Descargar Zip",
        "extract_zip": "Extraer Zip",
        "preview": "Vista previa",
        "edit": "Editar",
        "rename": "Renombrar",
        "trash_empty": "La papelera está vacía.",
        "no_trash_selected": "No se seleccionaron elementos de la papelera para restaurar.",
      
        // Additional keys for HTML translations:
        "title": "FileRise",
        "header_title": "FileRise",
        "logout": "Cerrar sesión",
        "change_password": "Cambiar contraseña",
        "restore_text": "Restaurar o",
        "delete_text": "Eliminar elementos de la papelera",
        "restore_selected": "Restaurar seleccionados",
        "restore_all": "Restaurar todo",
        "delete_selected_trash": "Eliminar seleccionados",
        "delete_all": "Eliminar todo",
        "upload_header": "Cargar archivos/carpetas",
      
        // Folder Management keys:
        "folder_navigation": "Navegación y gestión de carpetas",
        "create_folder": "Crear carpeta",
        "create_folder_title": "Crear carpeta",
        "enter_folder_name": "Ingrese el nombre de la carpeta",
        "cancel": "Cancelar",
        "create": "Crear",
        "rename_folder": "Renombrar carpeta",
        "rename_folder_title": "Renombrar carpeta",
        "rename_folder_placeholder": "Ingrese el nuevo nombre de la carpeta",
        "delete_folder": "Eliminar carpeta",
        "delete_folder_title": "Eliminar carpeta",
        "delete_folder_message": "¿Está seguro de que desea eliminar esta carpeta?",
        "folder_help": "Ayuda de carpetas",
        "folder_help_item_1": "Haga clic en una carpeta en el árbol para ver sus archivos.",
        "folder_help_item_2": "Utilice [-] para colapsar y [+] para expandir carpetas.",
        "folder_help_item_3": "Seleccione una carpeta y haga clic en \"Crear carpeta\" para agregar una subcarpeta.",
        "folder_help_item_4": "Para renombrar o eliminar una carpeta, selecciónela y luego haga clic en el botón correspondiente.",
      
        // File List keys:
        "file_list_title": "Archivos en (Raíz)",
        "delete_files": "Eliminar archivos",
        "delete_selected_files_title": "Eliminar archivos seleccionados",
        "delete_files_message": "¿Está seguro de que desea eliminar los archivos seleccionados?",
        "copy_files": "Copiar archivos",
        "copy_files_title": "Copiar archivos seleccionados",
        "copy_files_message": "Seleccione una carpeta destino para copiar los archivos seleccionados:",
        "move_files": "Mover archivos",
        "move_files_title": "Mover archivos seleccionados",
        "move_files_message": "Seleccione una carpeta destino para mover los archivos seleccionados:",
        "move": "Mover",
        "extract_zip_button": "Extraer Zip",
        "download_zip_title": "Descargar archivos seleccionados en Zip",
        "download_zip_prompt": "Ingrese un nombre para el archivo Zip:",
        "zip_placeholder": "archivos.zip",
      
        // Login Form keys:
        "login": "Iniciar sesión",
        "remember_me": "Recuérdame",
        "login_oidc": "Iniciar sesión con OIDC",
        "basic_http_login": "Usar autenticación HTTP básica",
      
        // Change Password keys:
        "change_password_title": "Cambiar contraseña",
        "old_password": "Contraseña antigua",
        "new_password": "Nueva contraseña",
        "confirm_new_password": "Confirmar nueva contraseña",
      
        // Add User keys:
        "create_new_user_title": "Crear nuevo usuario",
        "username": "Usuario:",
        "password": "Contraseña:",
        "grant_admin": "Otorgar acceso de administrador",
        "save_user": "Guardar usuario",
      
        // Remove User keys:
        "remove_user_title": "Eliminar usuario",
        "select_user_remove": "Seleccione un usuario para eliminar:",
        "delete_user": "Eliminar usuario",
      
        // Rename File keys:
        "rename_file_title": "Renombrar archivo",
        "rename_file_placeholder": "Ingrese el nuevo nombre del archivo",
      
        // Custom Confirm Modal keys:
        "yes": "Sí",
        "no": "No",
        "delete": "Eliminar",
        "download": "Descargar",
        "upload": "Cargar",
        "copy": "Copiar",
        "extract": "Extraer",
      
        // Dark Mode Toggle
        "dark_mode_toggle": "Modo oscuro"
      },
      fr: { /* French translations */
        "please_log_in_to_continue": "Veuillez vous connecter pour continuer.",
        "no_files_selected": "Aucun fichier sélectionné.",
        "confirm_delete_files": "Êtes-vous sûr de vouloir supprimer {count} fichier(s) sélectionné(s) ?",
        "element_not_found": "Élément avec l'id \"{id}\" non trouvé.",
        "search_placeholder": "Rechercher des fichiers ou un tag...",
        "file_name": "Nom du fichier",
        "date_modified": "Date de modification",
        "upload_date": "Date de téléchargement",
        "file_size": "Taille du fichier",
        "uploader": "Téléversé par",
        "enter_totp_code": "Entrez le code TOTP",
        "use_recovery_code_instead": "Utilisez le code de récupération à la place",
        "enter_recovery_code": "Entrez le code de récupération",
        "editing": "Modification",
        "decrease_font": "A-",
        "increase_font": "A+",
        "save": "Enregistrer",
        "close": "Fermer",
        "no_files_found": "Aucun fichier trouvé.",
        "switch_to_table_view": "Passer à la vue tableau",
        "switch_to_gallery_view": "Passer à la vue galerie",
        "share_file": "Partager le fichier",
        "set_expiration": "Définir l'expiration :",
        "password_optional": "Mot de passe (facultatif) :",
        "generate_share_link": "Générer un lien de partage",
        "shareable_link": "Lien partageable :",
        "copy_link": "Copier le lien",
        "tag_file": "Marquer le fichier",
        "tag_name": "Nom du tag :",
        "tag_color": "Couleur du tag :",
        "save_tag": "Enregistrer le tag",
        "files_in": "Fichiers dans",
        "light_mode": "Mode clair",
        "dark_mode": "Mode sombre",
        "upload_instruction": "Déposez vos fichiers/dossiers ici ou cliquez sur 'Choisir des fichiers'",
        "no_files_selected_default": "Aucun fichier sélectionné",
        "choose_files": "Choisir des fichiers",
        "delete_selected": "Supprimer la sélection",
        "copy_selected": "Copier la sélection",
        "move_selected": "Déplacer la sélection",
        "tag_selected": "Marquer la sélection",
        "download_zip": "Télécharger en Zip",
        "extract_zip": "Extraire le Zip",
        "preview": "Aperçu",
        "edit": "Modifier",
        "rename": "Renommer",
        "trash_empty": "La corbeille est vide.",
        "no_trash_selected": "Aucun élément de la corbeille sélectionné pour restauration.",
      
        // Additional keys for HTML translations:
        "title": "FileRise",
        "header_title": "FileRise",
        "logout": "Se déconnecter",
        "change_password": "Changer le mot de passe",
        "restore_text": "Restaurer ou",
        "delete_text": "Supprimer les éléments de la corbeille",
        "restore_selected": "Restaurer la sélection",
        "restore_all": "Restaurer tout",
        "delete_selected_trash": "Supprimer la sélection",
        "delete_all": "Supprimer tout",
        "upload_header": "Téléverser des fichiers/dossiers",
      
        // Folder Management keys:
        "folder_navigation": "Navigation et gestion des dossiers",
        "create_folder": "Créer un dossier",
        "create_folder_title": "Créer un dossier",
        "enter_folder_name": "Entrez le nom du dossier",
        "cancel": "Annuler",
        "create": "Créer",
        "rename_folder": "Renommer le dossier",
        "rename_folder_title": "Renommer le dossier",
        "rename_folder_placeholder": "Entrez le nouveau nom du dossier",
        "delete_folder": "Supprimer le dossier",
        "delete_folder_title": "Supprimer le dossier",
        "delete_folder_message": "Êtes-vous sûr de vouloir supprimer ce dossier ?",
        "folder_help": "Aide des dossiers",
        "folder_help_item_1": "Cliquez sur un dossier dans l'arborescence pour voir ses fichiers.",
        "folder_help_item_2": "Utilisez [-] pour réduire et [+] pour développer les dossiers.",
        "folder_help_item_3": "Sélectionnez un dossier et cliquez sur \"Créer un dossier\" pour ajouter un sous-dossier.",
        "folder_help_item_4": "Pour renommer ou supprimer un dossier, sélectionnez-le puis cliquez sur le bouton approprié.",
      
        // File List keys:
        "file_list_title": "Fichiers dans (Racine)",
        "delete_files": "Supprimer les fichiers",
        "delete_selected_files_title": "Supprimer les fichiers sélectionnés",
        "delete_files_message": "Êtes-vous sûr de vouloir supprimer les fichiers sélectionnés ?",
        "copy_files": "Copier les fichiers",
        "copy_files_title": "Copier les fichiers sélectionnés",
        "copy_files_message": "Sélectionnez un dossier de destination pour copier les fichiers sélectionnés :",
        "move_files": "Déplacer les fichiers",
        "move_files_title": "Déplacer les fichiers sélectionnés",
        "move_files_message": "Sélectionnez un dossier de destination pour déplacer les fichiers sélectionnés :",
        "move": "Déplacer",
        "extract_zip_button": "Extraire le Zip",
        "download_zip_title": "Télécharger les fichiers sélectionnés en Zip",
        "download_zip_prompt": "Entrez un nom pour le fichier Zip :",
        "zip_placeholder": "fichiers.zip",
      
        // Login Form keys:
        "login": "Connexion",
        "remember_me": "Se souvenir de moi",
        "login_oidc": "Connexion avec OIDC",
        "basic_http_login": "Utiliser l'authentification HTTP basique",
      
        // Change Password keys:
        "change_password_title": "Changer le mot de passe",
        "old_password": "Ancien mot de passe",
        "new_password": "Nouveau mot de passe",
        "confirm_new_password": "Confirmer le nouveau mot de passe",
      
        // Add User keys:
        "create_new_user_title": "Créer un nouvel utilisateur",
        "username": "Nom d'utilisateur :",
        "password": "Mot de passe :",
        "grant_admin": "Accorder les droits d'administrateur",
        "save_user": "Enregistrer l'utilisateur",
      
        // Remove User keys:
        "remove_user_title": "Supprimer l'utilisateur",
        "select_user_remove": "Sélectionnez un utilisateur à supprimer :",
        "delete_user": "Supprimer l'utilisateur",
      
        // Rename File keys:
        "rename_file_title": "Renommer le fichier",
        "rename_file_placeholder": "Entrez le nouveau nom du fichier",
      
        // Custom Confirm Modal keys:
        "yes": "Oui",
        "no": "Non",
        "delete": "Supprimer",
        "download": "Télécharger",
        "upload": "Téléverser",
        "copy": "Copier",
        "extract": "Extraire",
      
        // Dark Mode Toggle
        "dark_mode_toggle": "Mode sombre"
      },
      de: {
        "please_log_in_to_continue": "Bitte melden Sie sich an, um fortzufahren.",
        "no_files_selected": "Keine Dateien ausgewählt.",
        "confirm_delete_files": "Sind Sie sicher, dass Sie {count} ausgewählte Datei(en) löschen möchten?",
        "element_not_found": "Element mit der ID \"{id}\" wurde nicht gefunden.",
        "search_placeholder": "Suche nach Dateien oder Tags...",
        "file_name": "Dateiname",
        "date_modified": "Änderungsdatum",
        "upload_date": "Hochladedatum",
        "file_size": "Dateigröße",
        "uploader": "Hochgeladen von",
        "enter_totp_code": "Geben Sie den TOTP-Code ein",
        "use_recovery_code_instead": "Verwenden Sie stattdessen den Wiederherstellungscode",
        "enter_recovery_code": "Geben Sie den Wiederherstellungscode ein",
        "editing": "Bearbeitung",
        "decrease_font": "A-",
        "increase_font": "A+",
        "save": "Speichern",
        "close": "Schließen",
        "no_files_found": "Keine Dateien gefunden.",
        "switch_to_table_view": "Zur Tabellenansicht wechseln",
        "switch_to_gallery_view": "Zur Galerieansicht wechseln",
        "share_file": "Datei teilen",
        "set_expiration": "Ablauf festlegen:",
        "password_optional": "Passwort (optional):",
        "generate_share_link": "Freigabelink generieren",
        "shareable_link": "Freigabelink:",
        "copy_link": "Link kopieren",
        "tag_file": "Datei taggen",
        "tag_name": "Tagname:",
        "tag_color": "Tagfarbe:",
        "save_tag": "Tag speichern",
        "files_in": "Dateien in",
        "light_mode": "Heller Modus",
        "dark_mode": "Dunkler Modus",
        "upload_instruction": "Ziehen Sie Dateien/Ordner hierher oder klicken Sie auf 'Dateien auswählen'",
        "no_files_selected_default": "Keine Dateien ausgewählt",
        "choose_files": "Dateien auswählen",
        "delete_selected": "Ausgewählte löschen",
        "copy_selected": "Ausgewählte kopieren",
        "move_selected": "Ausgewählte verschieben",
        "tag_selected": "Ausgewählte taggen",
        "download_zip": "Zip herunterladen",
        "extract_zip": "Zip entpacken",
        "preview": "Vorschau",
        "edit": "Bearbeiten",
        "rename": "Umbenennen",
        "trash_empty": "Papierkorb ist leer.",
        "no_trash_selected": "Keine Elemente im Papierkorb für die Wiederherstellung ausgewählt.",
     
        // Additional keys for HTML translations:
        "title": "FileRise",
        "header_title": "FileRise",
        "logout": "Abmelden",
        "change_password": "Passwort ändern",
        "restore_text": "Wiederherstellen oder",
        "delete_text": "Papierkorbeinträge löschen",
        "restore_selected": "Ausgewählte wiederherstellen",
        "restore_all": "Alle wiederherstellen",
        "delete_selected_trash": "Ausgewählte löschen",
        "delete_all": "Alle löschen",
        "upload_header": "Dateien/Ordner hochladen",
     
        // Folder Management keys:
        "folder_navigation": "Ordnernavigation & Verwaltung",
        "create_folder": "Ordner erstellen",
        "create_folder_title": "Ordner erstellen",
        "enter_folder_name": "Geben Sie den Ordnernamen ein",
        "cancel": "Abbrechen",
        "create": "Erstellen",
        "rename_folder": "Ordner umbenennen",
        "rename_folder_title": "Ordner umbenennen",
        "rename_folder_placeholder": "Neuen Ordnernamen eingeben",
        "delete_folder": "Ordner löschen",
        "delete_folder_title": "Ordner löschen",
        "delete_folder_message": "Sind Sie sicher, dass Sie diesen Ordner löschen möchten?",
        "folder_help": "Ordnerhilfe",
        "folder_help_item_1": "Klicken Sie auf einen Ordner, um dessen Dateien anzuzeigen.",
        "folder_help_item_2": "Verwenden Sie [-] um zu minimieren und [+] um zu erweitern.",
        "folder_help_item_3": "Klicken Sie auf \"Ordner erstellen\", um einen Unterordner hinzuzufügen.",
        "folder_help_item_4": "Um einen Ordner umzubenennen oder zu löschen, wählen Sie ihn und klicken Sie auf die entsprechende Schaltfläche.",
     
        // File List keys:
        "file_list_title": "Dateien in (Root)",
        "delete_files": "Dateien löschen",
        "delete_selected_files_title": "Ausgewählte Dateien löschen",
        "delete_files_message": "Sind Sie sicher, dass Sie die ausgewählten Dateien löschen möchten?",
        "copy_files": "Dateien kopieren",
        "copy_files_title": "Ausgewählte Dateien kopieren",
        "copy_files_message": "Wählen Sie einen Zielordner, um die ausgewählten Dateien zu kopieren:",
        "move_files": "Dateien verschieben",
        "move_files_title": "Ausgewählte Dateien verschieben",
        "move_files_message": "Wählen Sie einen Zielordner, um die ausgewählten Dateien zu verschieben:",
        "move": "Verschieben",
        "extract_zip_button": "Zip entpacken",
        "download_zip_title": "Ausgewählte Dateien als Zip herunterladen",
        "download_zip_prompt": "Geben Sie einen Namen für die Zip-Datei ein:",
        "zip_placeholder": "dateien.zip",
     
        // Login Form keys:
        "login": "Anmelden",
        "remember_me": "Angemeldet bleiben",
        "login_oidc": "Mit OIDC anmelden",
        "basic_http_login": "HTTP-Basisauthentifizierung verwenden",
     
        // Change Password keys:
        "change_password_title": "Passwort ändern",
        "old_password": "Altes Passwort",
        "new_password": "Neues Passwort",
        "confirm_new_password": "Neues Passwort bestätigen",
     
        // Add User keys:
        "create_new_user_title": "Neuen Benutzer erstellen",
        "username": "Benutzername:",
        "password": "Passwort:",
        "grant_admin": "Admin-Rechte vergeben",
        "save_user": "Benutzer speichern",
     
        // Remove User keys:
        "remove_user_title": "Benutzer entfernen",
        "select_user_remove": "Wählen Sie einen Benutzer zum Entfernen:",
        "delete_user": "Benutzer löschen",
     
        // Rename File keys:
        "rename_file_title": "Datei umbenennen",
        "rename_file_placeholder": "Neuen Dateinamen eingeben",
     
        // Custom Confirm Modal keys:
        "yes": "Ja",
        "no": "Nein",
        "delete": "Löschen",
        "download": "Herunterladen",
        "upload": "Hochladen",
        "copy": "Kopieren",
        "extract": "Entpacken",
     
        // Dark Mode Toggle
        "dark_mode_toggle": "Dunkler Modus"
      }
  };
  
  let currentLocale = 'en';
  
  export function setLocale(locale) {
    currentLocale = locale;
  }
  
  export function t(key, placeholders) {
    const localeTranslations = translations[currentLocale] || {};
    let translation = localeTranslations[key] || key;
    if (placeholders) {
      Object.keys(placeholders).forEach(ph => {
        translation = translation.replace(`{${ph}}`, placeholders[ph]);
      });
    }
    return translation;
  }

  export function applyTranslations() {
    document.querySelectorAll('[data-i18n-key]').forEach(el => {
      el.innerText = t(el.getAttribute('data-i18n-key'));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
  }