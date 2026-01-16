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

FileRise supports internationalization (i18n). English (`en`) lives in `public/js/i18n.js`, and additional languages are loaded from separate locale files under:

- `FileRise/public/js/i18n/locales/`

When a translation key is missing in a locale, FileRise automatically falls back to English.

### Supported languages (current)

See `localeLoaders` in:

- `FileRise/public/js/i18n.js`

(Example codes include: `de`, `es`, `fr`, `pl`, `ru`, `ja`, `zh-CN`.)

### How language selection works

- Users can choose a language in the UI (stored in `localStorage`).
- Admins can optionally set a **Default language** used when a user has not chosen one yet.
- Client Portals include a language selector and use the same translation system.

### Add a new language (step-by-step)

1) **Pick a language code**
Use ISO 639-1 codes when possible (e.g., `it`, `pt`, `nl`).  
For region-specific variants, use a BCP-47 tag (e.g., `pt-BR`, `zh-CN`).

2) **Create the locale file**
Add a new file:

- `FileRise/public/js/i18n/locales/<code>.js`

It must export a default object of `key: "translation"` pairs.

Example (`it.js`):
```js
export default {
  "please_log_in_to_continue": "Accedi per continuare.",
  "no_files_selected": "Nessun file selezionato.",
  "download_zip": "Scarica archivio",
};
```

3) **Register the locale loader**
In `FileRise/public/js/i18n.js`, add your language to `localeLoaders`:

```js
const localeLoaders = {
  // ...
  it: () => import(new URL('./i18n/locales/it.js?v={{APP_QVER}}', import.meta.url)),
};
```

4) **Keep placeholders intact**
Some strings contain placeholders like:
- `{count}`, `{id}`, `{name}`, `{folder}`, `{error}`

Do **not** remove or rename placeholders. Translate only the surrounding text.

5) **Avoid HTML in translations**
Translations should be plain text. Do not embed raw HTML tags in locale values.

6) **Test the language**
- Switch the language in the main UI.
- Also test Portals:
  - `/portal/<slug>`
  - `/portal-login.html?...`
- Click through a few key flows to confirm strings render correctly:
  - Login + TOTP prompts
  - Uploads (including error/success toasts)
  - File actions (copy/move/delete/download/archive)
  - Share modals
  - Admin panel (partial coverage is OK; missing keys fall back to English)

### Improving existing translations / missing keys

If you notice untranslated text:
- Prefer adding a new i18n key to English in `public/js/i18n.js` and then translating it in the locale files.
- If you’re not sure where a string is used, search the codebase for the key or the English phrase.

---

Thank you for helping to improve FileRise and happy coding!
