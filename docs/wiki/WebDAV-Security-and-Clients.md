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

## Limits

- WebDAV uploads can be capped with `FR_WEBDAV_MAX_UPLOAD_BYTES`.
- Encrypted-at-rest folders disable WebDAV by design.

## Related

- /docs/?page=webdav
- /docs/?page=webdav-via-curl
- /docs/?page=security-hardening
