# Encryption at Rest

FileRise supports folder-level encryption at rest using libsodium secretstream. It encrypts files on disk while allowing normal access through the app.

---

## Requirements

- PHP with libsodium (`sodium` extension) enabled.
- A master key configured via environment variable or key file.

---

## Master key configuration

Option A (recommended for containers):

```
FR_ENCRYPTION_MASTER_KEY=base64:...   # 32-byte key
```

Accepted formats:
- 64 hex characters (32 bytes)
- `base64:...` (32 bytes after decode)

Option B (admin-generated key file):

- File: `/var/www/metadata/encryption_master.key`
- If `FR_ENCRYPTION_MASTER_KEY` is set, the key file is ignored.

---

## Behavior and limitations

Encrypted folders disable:
- WebDAV
- Sharing
- ZIP create/extract
- ONLYOFFICE editing

Encrypted files are decrypted on download. Range requests are intentionally disabled for encrypted files.

---

## Backup and recovery

- Back up `/var/www/uploads` and `/var/www/metadata` together.
- Keep the master key safe. Losing it makes encrypted data unrecoverable.
