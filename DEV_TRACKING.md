# Items changed / updated in development

## Updates for local development

- Added new config.local.php, which is set to be ignored in the `.gitignore` file.  The content of this are

```php
<?php
// config.local.php

// Local development settings - DO NOT COMMIT
define('UPLOAD_DIR', __DIR__ . '/uploads/');
define('USERS_DIR', __DIR__ .  '/users/');
define('META_DIR', __DIR__ .  '/metadata/');
define('BASE_URL', '<local_address>/');
```

You will need to add this file, ensure your .gitignore is updated to ignore this file.  The config.php file has been changed to look for this file.  You can update the directory and url to match your local dev env (e.g. `/uploads/` => `/project/uploads`)

- Updates to `styles.css` to move the toast from the top right to the bottom left

Moved toast in styles.css for better visibility once logging in as it was covering the navbar icons, and change the opacity for bettery visibility.

```css
#customToast {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: #333;
  color: #fff;
  padding: 15px;
  border-radius: 4px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  opacity: 0;
  transition: opacity 0.5s ease;
  z-index: 9999;
  min-width: 250px;
  display: none;
}

#customToast.show {
  opacity: 0.7;
}
```