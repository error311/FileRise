# Backup and Restore

FileRise stores all persistent data on disk. Back up these paths:

- `/var/www/uploads` (file data)
- `/var/www/users` (users, ACLs, admin config, Pro license)
- `/var/www/metadata` (indexes, tags, logs)

Notes:
- Logs live in `/var/www/metadata/log` and can be rotated/pruned.
- Sessions are ephemeral and do not need backups.

---

## Recommended backup steps

1. Stop the container or web server (best for consistency).
2. Back up the three directories above.
3. Store your `PERSISTENT_TOKENS_KEY` securely (needed to decrypt admin config and tokens).

---

## Restore steps

1. Restore the three directories to the same paths.
2. Ensure ownership/permissions are correct:

```bash
sudo chown -R www-data:www-data /var/www/uploads /var/www/users /var/www/metadata
sudo chmod -R 775 /var/www/uploads /var/www/users /var/www/metadata
```

3. Use the same `PERSISTENT_TOKENS_KEY` as the original instance.
4. Start FileRise.

---

## Encryption at rest

If encryption at rest is enabled:

- `/var/www/uploads` and `/var/www/metadata` must be backed up together.
- Keep your master key (`FR_ENCRYPTION_MASTER_KEY` or `metadata/encryption_master.key`).
- Losing the key makes encrypted data unrecoverable.

---

## Pro notes

Pro bundle and license files live under `/var/www/users` by default. Restoring that directory restores Pro settings as well.
