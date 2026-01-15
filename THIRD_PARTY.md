# Third-Party Notices

FileRise bundles the following third‑party assets. Each item lists the project, version, typical on-disk location in this repo, and its license.

If you believe any attribution is missing or incorrect, please open an issue.

---

## Fonts

- **Roboto (wght 400/500)** — Google Fonts  
  **License:** Apache License 2.0  
  **Files:** `public/css/vendor/roboto.css`, `public/fonts/roboto/*.woff2`

- **Material Icons (ligature font)** — Google Fonts  
  **License:** Apache License 2.0  
  **Files:** `public/css/vendor/material-icons.css`, `public/fonts/material-icons/*.woff2`

> Google fonts/icons © Google. Licensed under Apache 2.0. See `licenses/apache-2.0.txt`.

---

## CSS / JS Libraries (vendored)

- **Bootstrap 4.6.2** — MIT License  
  **Files:** `public/vendor/bootstrap/4.6.2/bootstrap.min.css`

- **CodeMirror 5.65.18** — MIT License  
  **Files:** `public/vendor/codemirror/5.65.18/*`

- **DOMPurify 3.3.1** — Apache License 2.0  
  **Files:** `public/vendor/dompurify/3.3.1/purify.min.js`

- **Fuse.js 7.1.0** — Apache License 2.0  
  **Files:** `public/vendor/fuse/7.1.0/fuse.min.js`

- **Resumable.js 1.1.0** — MIT License  
  **Files:** `public/vendor/resumable/1.1.0/resumable.min.js`

- **ReDoc 2.5.1 (redoc.standalone.js)** — MIT License  
  **Files:** `public/vendor/redoc/redoc.standalone.js`  
  **Notes:** Self-hosted to comply with `script-src 'self'` CSP.

> MIT-licensed code: see `licenses/mit.txt`.  
> Apache-2.0–licensed code: see `licenses/apache-2.0.txt`.

---

### Docker & ClamAV

Used optionally for virus scanning of uploads (via the `clamscan` command).

- **License:** GPL-2.0-only  
- **Copyright:** © Cisco / ClamAV contributors  
- **Home:** <https://www.clamav.net/>
- **Source:** Available via your Linux distribution’s package repositories or from the ClamAV website.  
- **Note:** ClamAV runs as a separate executable and is not part of the FileRise application code.

Additional system packages bundled in the Docker image:

- **FFmpeg** — LGPL-2.1+ (some builds include GPL components)  
  **Home:** <https://ffmpeg.org/>  
  **Source:** Linux distribution package repositories.  
  **Note:** Installed for video thumbnail generation.

- **7-Zip (p7zip)** — LGPL-2.1+ with unRAR restriction  
  **Home:** <https://www.7-zip.org/>  
  **Source:** Linux distribution package repositories.

- **unar (The Unarchiver)** — LGPL-2.1+  
  **Home:** <https://theunarchiver.com/>  
  **Source:** Linux distribution package repositories.

### Base image and system packages

The official Docker image is built on **Ubuntu 24.04** and includes common
system packages (Apache HTTP Server, PHP, OpenSSL, ClamAV, etc.), each under
their respective upstream licenses as distributed by Ubuntu.

---

## PHP libraries (Composer)

The following PHP libraries are installed via Composer and live under `vendor/`:

- **jumbojett/openid-connect-php** – MIT License  
  Used for OpenID Connect / OIDC login.  
  Files: `vendor/jumbojett/openid-connect-php/*`

- **phpseclib/phpseclib** – MIT License  
  Used for cryptographic helpers.  
  Files: `vendor/phpseclib/phpseclib/*`

- **robthree/twofactorauth** – MIT License  
  Used for TOTP-based two-factor authentication (2FA).  
  Files: `vendor/robthree/twofactorauth/*`

- **endroid/qr-code** – MIT License  
  Used to generate QR codes for TOTP provisioning.  
  Files: `vendor/endroid/qr-code/*`

- **sabre/dav** – BSD-3-Clause (“New BSD”)  
  Used to provide the WebDAV server.  
  Files: `vendor/sabre/dav/*`

> MIT-licensed code: see `licenses/mit.txt`.  
> BSD-licensed code: see [bsd-3-clause](https://opensource.org/license/bsd-3-clause/).

---
