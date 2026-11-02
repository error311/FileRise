# WebDAV security and clients

FileRise includes a built-in WebDAV endpoint at `/webdav.php`. Use HTTPS for all WebDAV access.

## Security recommendations

- Enable HTTPS (TLS) before using WebDAV.
- Disable WebDAV if you do not use it.
- Use dedicated FileRise users for WebDAV access.
- Avoid sharing admin accounts.

## Client setup (quick)

- macOS Finder: Connect to Server -> `https://your-domain/webdav.php`
- Windows: Map a network drive -> `https://your-domain/webdav.php`
- Linux (gio): `gio mount dav://username@your-domain/webdav.php/`

## Permission behavior

WebDAV uses the same folder ACLs as the FileRise interface. A `PUT` to an existing file is a content edit: it requires Folder Edit and is allowed regardless of who originally uploaded the file. The original uploader metadata is preserved. The account-level **Bypass owner-only checks** flag applies only to operations with a separate owner check and is not required for a content edit authorized by Folder Edit.

Creating a new file through WebDAV requires Upload. Replacing an existing filename through the regular upload workflow remains subject to that workflow's separate collision-ownership protection.

## Limits

- WebDAV uploads can be capped with `FR_WEBDAV_MAX_UPLOAD_BYTES`.
- Encrypted-at-rest folders disable WebDAV by design.

## Related

- /docs/?page=webdav
- /docs/?page=webdav-via-curl
- /docs/?page=security-hardening
