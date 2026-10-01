# Security hardening

Basic steps to keep your FileRise installation secure.

## Recommended

- Use HTTPS (TLS) for all access, especially WebDAV.
- Keep PHP, your web server, and FileRise up to date.
- Limit admin access to trusted networks or VPNs.
- Use strong admin passwords and rotate them if shared.
- Ensure the web server can read files but cannot write to code paths.
- Back up `config/`, `users/`, and `metadata/` regularly.

## Storage trust boundary

- Treat `uploads/`, `users/`, and `metadata/` as trusted FileRise storage.
- Allow writes only from the FileRise service identity and trusted administrative or backup processes.
- Do not expose these directories as a writable share or allow untrusted operating-system accounts or other applications to create files, links, junctions, or reparse points inside them.
- Use a dedicated subfolder when FileRise stores data on an existing share, and apply the same exclusive-writer rule to that subfolder.
- The supported manual server environment is Linux. Native Windows PHP server installs are not supported as a filesystem security boundary. Windows browsers and WebDAV clients remain supported.
- Apply these rules to host-backed Docker volumes as well as manual installations.

## WebDAV and shares

- Disable WebDAV if you do not use it.
- Treat share links as public URLs; revoke links you no longer need.

## Related

- /docs/?page=nginx-setup
- /docs/?page=reverse-proxy-and-subpath
- /docs/?page=backup-and-restore
