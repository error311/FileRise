# Contributing to FileRise

Thank you for your interest in contributing to FileRise! We appreciate your help in making this self-hosted file manager even better.

## Table of Contents

- [Getting Started](#getting-started)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Enhancements](#suggesting-enhancements)
- [Pull Requests](#pull-requests)
- [Coding Guidelines](#coding-guidelines)
- [Documentation](#documentation)
- [Questions and Support](#questions-and-support)
- [Adding New Language Translations](#adding-new-language-translations)

## Getting Started

1. **Fork the Repository**  
   Click the **Fork** button on the top-right of the FileRise GitHub page to create your own copy.

2. **Clone Your Fork**  

   ```bash
   git clone https://github.com/yourusername/FileRise.git
   cd FileRise
   ```

3. **Set Up a Local Environment**
FileRise runs on a standard LAMP stack. Ensure you have PHP, Apache, and the necessary dependencies installed.

4. **Configuration**
Copy any example configuration files (if provided) and adjust them as needed for your local setup.

## Reporting Bugs

If you discover a bug, please open an issue on GitHub and include:

- A clear and descriptive title.
- Detailed steps to reproduce the bug.
- The expected and actual behavior.
- Screenshots or error logs (if applicable).
- Environment details (PHP version, Apache version, OS, etc.).

## Suggesting Enhancements

Have an idea for a new feature or improvement? Before opening a new issue, please check if a similar suggestion already exists. If not, open an issue with:

- A clear description of the enhancement.
- Use cases or examples of how it would be beneficial.
- Any potential drawbacks or alternatives.

## Pull Requests

We welcome pull requests! To submit one, please follow these guidelines:

1. **Create a New Branch**  
   Always create a feature branch from master.

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Your Changes**  
   Commit your changes with clear, descriptive messages. Make sure your code follows the project’s style guidelines.

3. **Write Tests**  
   If applicable, add tests to cover your changes to help us maintain code quality.

4. **Submit the Pull Request**  
   Push your branch to your fork and open a pull request against the master branch in the main repository. Provide a detailed description of your changes and why they’re needed.

## Coding Guidelines

- **Code Style:**  
  Follow the conventions used in the project. Consistent indentation, naming conventions, and clear code organization are key.

- **Documentation:**  
  Update documentation if your changes affect the usage or configuration of FileRise.

- **Commit Messages:**  
  Write meaningful commit messages that clearly describe the purpose of your changes.

## Documentation

If you notice any areas in the documentation that need improvement or updating, please feel free to include those changes in your pull requests. Clear documentation is essential for helping others understand and use FileRise.

## Questions and Support

If you have any questions, ideas, or need support, please open an issue or join our discussion on [GitHub Discussions](https://github.com/error311/FileRise/discussions). We’re here to help and appreciate your contributions.

## Adding New Language Translations

FileRise supports internationalization (i18n) and localization via a central translation file (`i18n.js`). If you would like to contribute a new language translation, please follow these steps:

1. **Update `i18n.js`:**  
   Open the `i18n.js` file located in the `js` directory. Within the `translations` object, add a new property using the appropriate [ISO language code](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes) as the key. Copy the structure from an existing language block and translate each key.

   **Example (for German):**

   ```js
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

---

Thank you for helping to improve FileRise and happy coding!
