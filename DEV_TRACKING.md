# Items changed / updated in development

## Updates for local development

- Added new config.local.php, which is set to be ignored in the `.gitignore` file.  The content of this are

```php
<?php
// config.local.php

// Local development settings - DO NOT COMMIT
define('UPLOAD_DIR', __DIR__ . '/uploads/');
define('USERS_DIR', __DIR__ . '/users/');
define('META_DIR', __DIR__ . '/metadata/');
define('BASE_URL', __DIR__ . '/http://filerise.localhost/');
```

You will need to add this file, ensure your .gitignore is updated to ignore this file.  The config.php file has been changed to look for this file.  You can update the directory and url to match your local dev env (e.g. `/uploads/` => `/project/uploads`)