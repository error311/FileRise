# ONLYOFFICE integration

FileRise can open and edit Office documents using a self-hosted ONLYOFFICE Document Server. This is optional and ACL-aware.

Supported:
- Edit: DOCX, XLSX, PPTX
- View: ODT, ODS, ODP, PDF

---

## Quick setup

1. In FileRise: **Admin → ONLYOFFICE**
2. Configure:
   - Enable ONLYOFFICE
   - Document Server origin (e.g. `https://docs.example.com`)
   - JWT secret (shared with your Document Server)
   - Optional: Public origin (if callbacks must use a different public URL)
3. Ensure outgoing/outbox JWTs are enabled on the Document Server.
4. Use **Run tests** in the admin panel to validate connectivity and confirm callback JWT enforcement is active.
5. Open, edit, and save a test document to verify the Document Server can complete a signed callback.

For a Docker Document Server, configure a stable secret when creating the container:

```yaml
environment:
  JWT_ENABLED: "true"
  JWT_SECRET: "replace-with-the-same-secret-used-by-filerise"
```

For a package installation or an older Document Server, ensure all three values are configured in `/etc/onlyoffice/documentserver/local.json` and restart the ONLYOFFICE services:

```json
{
  "services": {
    "CoAuthoring": {
      "token": {
        "enable": {
          "request": {
            "outbox": true
          }
        }
      },
      "secret": {
        "outbox": {
          "string": "replace-with-the-same-secret-used-by-filerise"
        }
      }
    }
  }
}
```

Do not edit `default.json`; ONLYOFFICE can replace that file during upgrades.

---

## Upgrading to FileRise v3.23.0

FileRise v3.23.0 rejects missing and invalid callback JWTs. Previous FileRise versions accepted an unsigned callback body when the separate FileRise callback URL token was valid.

Before upgrading:

1. Confirm the JWT secret configured in FileRise matches the Document Server's `JWT_SECRET` or outbox secret.
2. Confirm outgoing/outbox request tokens are enabled.
3. Restart the Document Server after changing its JWT configuration.
4. After upgrading FileRise, use **Run tests**, then edit and save a test document.

Existing documents, accounts, and FileRise storage require no migration. A correctly configured Document Server continues working normally.

If saves fail because an older deployment is not sending callback JWTs, correct the Document Server configuration first. As a temporary recovery measure only, set this environment variable on the FileRise container or PHP service:

```text
ONLYOFFICE_ALLOW_UNSIGNED_CALLBACKS=1
```

For a manual FileRise installation, the equivalent temporary override is:

```php
define('ONLYOFFICE_ALLOW_UNSIGNED_CALLBACKS', true);
```

This override restores the old unsigned-body behavior and weakens callback authentication. Keep it enabled only long enough to correct the Document Server, restart it, and confirm a successful signed save. Then remove the override and restart FileRise. The Admin Panel displays a security warning while the override is active.

---

## Content-Security-Policy (CSP)

ONLYOFFICE requires additional CSP rules. The admin panel provides a copy-ready CSP snippet for Apache/Nginx. 

.htaccess edit (change url or copy directly from admin panel)
```
Header always set Content-Security-Policy "default-src 'self'; base-uri 'self'; frame-ancestors 'self'; object-src 'none'; script-src 'self' https://your-onlyoffice-server.example.com https://your-onlyoffice-server.example.com/web-apps/apps/api/documents/api.js; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://your-onlyoffice-server.example.com; media-src 'self' blob:; worker-src 'self' blob:; form-action 'self'; frame-src 'self' https://your-onlyoffice-server.example.com"
```

Nginx
```
# Drop upstream (Apache/.htaccess) headers that conflict with ONLYOFFICE
proxy_hide_header X-Frame-Options;
proxy_hide_header Content-Security-Policy;

# Replace with an ONLYOFFICE-aware CSP at the proxy
add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; frame-ancestors 'self'; object-src 'none'; script-src 'self' https://your-onlyoffice-server.example.com https://your-onlyoffice-server.example.com/web-apps/apps/api/documents/api.js; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://your-onlyoffice-server.example.com; media-src 'self' blob:; worker-src 'self' blob:; form-action 'self'; frame-src 'self' https://your-onlyoffice-server.example.com" always;
```

---

## HTTPS note

If FileRise is served over HTTPS, your Document Server must also be HTTPS to avoid mixed-content blocks.

---

## Encrypted folders

ONLYOFFICE is disabled inside encrypted-at-rest folders by design.

---

## Advanced (optional)

You can lock ONLYOFFICE settings in `config/config.php` by defining:

- `ONLYOFFICE_ENABLED`
- `ONLYOFFICE_DOCS_ORIGIN`
- `ONLYOFFICE_JWT_SECRET`
- `ONLYOFFICE_PUBLIC_ORIGIN`

When any of these are defined, the admin UI reflects the locked values.

`ONLYOFFICE_ALLOW_UNSIGNED_CALLBACKS` is an emergency compatibility override, not a normal integration setting. It defaults to `false` and should not remain enabled.
