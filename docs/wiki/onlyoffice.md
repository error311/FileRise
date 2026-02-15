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
3. Use **Run tests** in the admin panel to validate connectivity.

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
