# Security hardening

Basic steps to keep your FileRise installation secure.

## Recommended

- Use HTTPS (TLS) for all access, especially WebDAV.
- Keep PHP, your web server, and FileRise up to date.
- Limit admin access to trusted networks or VPNs.
- Use strong admin passwords and rotate them if shared.
- Ensure the web server can read files but cannot write to code paths.
- Back up `config/`, `users/`, and `metadata/` regularly.

## WebDAV and shares

- Disable WebDAV if you do not use it.
- Treat share links as public URLs; revoke links you no longer need.

## Related

- /docs/?page=nginx-setup
- /docs/?page=reverse-proxy-and-subpath
- /docs/?page=backup-and-restore
