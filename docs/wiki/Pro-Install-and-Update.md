# Pro install and update

FileRise Pro can be installed or updated from the UI or manually. Add and save your license first.

## Before you start

- Have your Pro license key (FRP1...).
- In FileRise: Admin -> FileRise Pro -> paste license -> Save license.
- Backup `config/`, `users/`, `metadata/` (and `uploads/` if it stores file data).

## Install or update from the UI

1. Go to Admin -> FileRise Pro.
2. Paste your license key and click Save license (if not already saved).
3. Use the one-click download to fetch the latest Pro bundle (uses your saved license key).
4. Click Install bundle.
5. Refresh the Pro panel and confirm Status: Active.
6. Outbound access to `filerise.net` is required for the one-click download.

### Manual upload (UI)

1. Download the Pro bundle ZIP.
2. Upload the ZIP in the Pro bundle section.
3. Click Install bundle.
4. Refresh the Pro panel and confirm Status: Active.

## Manual install or update

1. Confirm your license is saved in Admin -> FileRise Pro (or add `users/proLicense.json`).
2. Unzip the Pro bundle into your FileRise root so `users/pro/bootstrap_pro.php` exists.
3. Ensure the web server can read the Pro files.
4. Refresh the Pro panel and confirm Status: Active.

## Common issues

- Pro inactive: verify the license is saved and the Pro bundle is installed.
- Updates expired: your current Pro bundle still works; renew to download newer bundles.
- Missing files: confirm `users/pro/` exists and permissions are correct.

## Related

- /docs/?page=pro-license-activation
- /docs/?page=upgrade-and-migration
- /docs/?page=backup-and-restore
