# Upgrade and Migration

This page covers common upgrade paths for Docker and manual installs.

## PHP runtime security updates

Updating FileRise application files does not update PHP. Docker users need a
rebuilt image containing the patched runtime and must recreate their container;
restarting an existing container keeps its installed PHP packages. Manual installs
must update PHP through their operating system or hosting provider and restart
Apache or every PHP-FPM worker.

For the critical **CVE-2026-109618** and **CVE-2026-109619** disclosed on
21 October 2026, upstream fixes are PHP **8.2.35**, **8.3.36**, **8.4.27**, and
**8.5.12**, or a later release on the corresponding branch. FileRise requires
PHP 8.3 or newer. Distribution packages may backport the fixes while retaining an
older upstream version number; verify the complete package revision against both
vendor CVE records. See the [PHP security announcement](https://www.php.net/archive/2026.php#2026-10-21-5)
and the [OOM](https://github.com/php/php-src/security/advisories/GHSA-w8hw-w9fx-j79w)
and [stale-state](https://github.com/php/php-src/security/advisories/GHSA-6wmf-4rv5-p3rp)
advisories.

The Dockerfile uses Ubuntu 24.04 LTS and its PHP 8.3 packages. Keeping those
versions and applying a verified Ubuntu security backport is the smallest update;
an Ubuntu release upgrade is not required. PHP 8.3 receives upstream security
support through [31 December 2027](https://www.php.net/supported-versions.php).
Ubuntu has now published [USN-8948-1](https://ubuntu.com/security/notices/USN-8948-1),
identifying **`8.3.6-0ubuntu0.24.04.13`** as fixing both CVEs on Ubuntu 24.04.
A fresh ARM64 APT check on 21 October 2026 now offers `.13` for
`libapache2-mod-php8.3`, `php8.3-cli`, and `php8.3-common` from
`ports.ubuntu.com` (noble-security/noble-updates). Verify the actual package
candidate before building and the installed revision afterward on both supported
architectures. `.12` is not the revision identified by this notice. A PHP version
banner showing only `8.3.6` cannot distinguish patched and unpatched Ubuntu builds.

For image maintainers, after the vendor confirms both fixes:

1. Build from the intended FileRise release using fresh base images and package
   layers, for example `docker build --pull --no-cache -t filerise-php-security:local .`.
   Cached `apt-get install` layers can otherwise retain old PHP packages.
   In `filerise-docker/.github/workflows/main.yml`, the corresponding
   `docker/build-push-action` inputs are `pull: true` and `no-cache: true`.
   Existing `cache-to` can export the fresh build. If cache reuse is restored
   afterward, explicitly refresh package layers again for future security updates;
   `pull: true` alone does not refresh APT when the base image is unchanged.
2. Check the complete versions of `libapache2-mod-php8.3`, `php8.3-common`, and
   `php8.3-cli` in the resulting image with `dpkg-query -W`; check both `amd64`
   and `arm64`. Verify the web runtime as well as CLI PHP, including any custom
   INI mounts. The published image digest identifies the artifact actually tested.
3. Test a disposable install with representative copied data: login, normal and
   resumable uploads, password-protected shares, WebDAV, and installed Pro features.
   Keep the previous image and a consistent data/config backup for rollback.
4. Publish the verified image, then have users pull that tag and recreate the
   container with the same data volumes, configuration, and `PERSISTENT_TOKENS_KEY`.
   Retain `metadata/persistent_tokens.key` when using the generated key. Do not
   delete volumes during the update.

FileRise's Docker PHP configuration disables `session.upload_progress.enabled`.
Its upload UI uses browser progress events and resumable chunk tracking, so it
does not need PHP's session upload-progress feature. Manual installs can apply
`session.upload_progress.enabled=Off` in startup `php.ini` or server configuration
and restart all workers; setting it in application code is too late. This blocks
the confirmed session lifecycle path only, **not either vulnerability completely**.
Do not mark an install safe until its PHP runtime contains both fixes. If patching
is unavailable, restrict access to the service at the proxy/firewall or temporarily
take it out of public service; the FileRise login page is not a runtime mitigation.

---

## Docker upgrade

1. Pull the new image tag:

```bash
docker pull error311/filerise-docker:vX.Y.Z
```

2. Recreate the container with the same volumes and env vars.

3. Keep these volumes the same:

- `/var/www/uploads`
- `/var/www/users`
- `/var/www/metadata`

---

## Manual upgrade

### Option A: scripted update (recommended)

If you installed FileRise from the release ZIP, you can use the helper script in your app folder:

```bash
sudo bash /path/to/filerise/scripts/update-filerise.sh vX.Y.Z
```

What it does:

- Creates a backup archive in `/root/backups` (config + data folders).
- Downloads the release ZIP from GitHub.
- Syncs new code into `/var/www` while preserving `config/config.php` and data dirs.
- Runs `composer install` only if `vendor/` is missing.

Requirements: `curl`, `unzip`, `rsync` (and `composer` only if needed).
If your install path is not `/var/www`, edit `WEBROOT` at the top of the script.

### Option B: manual replace

1. Back up:

- `/var/www/uploads`
- `/var/www/users`
- `/var/www/metadata`
- `config/config.php` (if you customized it)

2. Replace the app code with the latest release ZIP.
3. Restore your config and data directories.
4. Verify permissions and restart the web server.

---

## Migration tips

- Keep `PERSISTENT_TOKENS_KEY` the same across restores to avoid invalidating stored secrets.
- If moving to a new host, restore data to the same absolute paths or update `config/config.php`.
- If you use a reverse proxy, confirm `FR_PUBLISHED_URL` and `FR_BASE_PATH` after the move.

---

## Pro notes

If you use Pro:

- Pro bundle and license files live under `/var/www/users` by default.
- Backing up and restoring that directory preserves Pro settings.
