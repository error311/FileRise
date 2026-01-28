# Instance IDs (Pro plans)

Instance IDs bind Pro licenses to specific FileRise installations. 12-month updates plans require them.

## Find your Instance ID

1. In your FileRise server, open **Admin -> FileRise Pro**.
2. Copy the **Instance ID** shown there.

## Change or add Instance IDs

### Business licenses (up to 3 instances)

- Use `/pro/instances.php` to add new Instance IDs.
- This reissues your license with the added IDs and does not extend your updates window.
- If you need to remove or replace an old Instance ID, email support so we can reissue a clean set.

### Personal licenses (1 instance)

- Personal plans allow 1 Instance ID. If you move servers or need to change it, email support with:
  - Your license key (FRP1...)
  - The new Instance ID
  - Your checkout email

## Recover a lost license

1. Open `/pro/recover.php`.
2. Enter the email used at checkout and your Stripe Checkout Session ID (starts with `cs_`).
3. Submit the form to retrieve your license key.

## Renew updates (12 months)

1. Open `/pro/renew.php`.
2. Paste your current license key and (if needed) Instance IDs.
3. Complete checkout to add 12 more months of updates.

## Related how-tos

- [Renew updates (12 months)](https://filerise.net/pro/renew.php)
- [Pro Sources](https://github.com/error311/FileRise/wiki/Pro-Sources)
- [Backup and restore](https://github.com/error311/FileRise/wiki/Backup-and-Restore)
- [Upgrade and migration](https://github.com/error311/FileRise/wiki/Upgrade-and-Migration)
- [Reverse proxy and subpath guide](https://github.com/error311/FileRise/wiki/Reverse-Proxy-and-Subpath)
- [WebDAV mounting](https://github.com/error311/FileRise/wiki/WebDAV)
