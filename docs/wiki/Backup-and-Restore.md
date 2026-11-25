# Backup and Restore

FileRise stores all persistent data on disk. Back up these paths:

- `/var/www/uploads` (file data)
- `/var/www/users` (users, ACLs, admin config, Pro license)
- `/var/www/metadata` (indexes, tags, logs)

Notes:
- These are default paths. Use your configured paths or the corresponding Docker volume/bind-mount locations.
- Logs live in `/var/www/metadata/log` and can be rotated/pruned.
- Sessions are ephemeral and do not need backups.

---

## Recommended backup steps

1. Stop FileRise and any background jobs that write to its data directories (best for consistency).
2. Back up the three directories together using a method that preserves file modes, ownership and any deployment-specific ACLs or extended attributes. On Linux, `rsync -aAX --numeric-ids` is one option when run with sufficient privileges and a destination filesystem that supports those attributes. Use preservation options during restore as well; verify your backup tool's settings and destination support.
3. Store your `PERSISTENT_TOKENS_KEY` securely (needed to decrypt admin config and tokens). If FileRise generated this key on disk, include `metadata/persistent_tokens.key` in the backup. Preserve any separately configured encryption master key as described below.
4. Restrict access to the backup itself: it can contain both protected data and the keys needed to decrypt it.

---

## Restore steps

1. Keep FileRise and its background jobs stopped. Restore the three directories to the configured paths, preserving the backed-up file modes and any ACLs or extended attributes.
2. Verify ownership against the actual service UID/GID for your installation. Adjust ownership where needed, accounting for Docker UID/GID mappings and any intentional shared ownership. Do not assume every installation uses `www-data`.
3. Preserve restrictive per-file permissions. Do not apply a blanket recursive `chmod` to these trees or add execute permissions to ordinary data files. Verify that the service can traverse its directories and read/write the data it needs, while retaining your deployment's access restrictions.
4. Before startup, verify that any file-backed keys are owned by the service account and have mode **0600** (owner read/write only). This includes `metadata/encryption_master.key` and `metadata/persistent_tokens.key` when present, plus any configured alternative key-file path. Check parent-directory access and deployment-specific ACLs as well. Correct only the relevant files; do not create empty replacement keys or regenerate missing keys during restore.
5. Use the same `PERSISTENT_TOKENS_KEY` and encryption master key as the original instance, whether supplied through configuration or files. If either required key is missing, recover it from the original installation or secure backup before proceeding.
6. Start FileRise and verify normal sign-in and file access, including encrypted files if enabled.

---

## Encryption at rest

If encryption at rest is enabled:

- `/var/www/uploads` and `/var/www/metadata` must be backed up together.
- Keep your master key (`FR_ENCRYPTION_MASTER_KEY` or `metadata/encryption_master.key`).
- Losing the key makes encrypted data unrecoverable.

---

## Pro notes

Pro bundle and license files live under `/var/www/users` by default. Restoring that directory restores Pro settings as well.
