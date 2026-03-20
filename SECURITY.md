# Security Policy

## Supported Versions

FileRise provides security fixes for the **latest minor release line** only.

| Version line | Supported |
|---|---|
| Latest minor release line | ✅ |
| Older minor lines | ❌ |

> If you’re on an older minor line, please upgrade to the latest release to receive security fixes.

## Reporting a Vulnerability

**Please do not open a public issue.** Use one of the private channels below:

1) **GitHub Security Advisory (preferred)**  
   Open a private report here: https://github.com/error311/FileRise/security/advisories/new

2) **Email**  
   Send details to **security@filerise.net** with subject: `[FileRise] Security Vulnerability Report`.

### What to include

- Affected versions, component/endpoint, and impact
- Reproduction steps / PoC
- Any logs, screenshots, or crash traces
- Safe test scope used (see below)

If you’d like encrypted comms, ask for our PGP key in your first email.

## Coordinated Disclosure

- **Acknowledgement:** within **48 hours**
- **Triage & initial assessment:** within **7 days**
- **Fix target:** within **30 days** for high-severity issues (may vary by complexity)
- **CVE & advisory:** we publish a GitHub Security Advisory and request a CVE when appropriate.  
  We aim to notify the reporter before public disclosure and credit them (unless they prefer to remain anonymous).

## Safe-Harbor / Rules of Engagement

We support good-faith research. Please:

- Avoid privacy violations, data exfiltration, and service disruption (no DoS, spam, or brute-forcing)
- Don’t access other users’ data beyond what’s necessary to demonstrate the issue
- Don’t run automated scans against production installs you don’t own
- Follow applicable laws and make a good-faith effort to respect data and availability

If you follow these guidelines, we won’t pursue or support legal action.

## Published Advisories

- **GHSA-hv99-77cw-hvpr** - `<= 3.2.3`: Unauthenticated File Read Due to Insufficient Access Control
  **Fixed in: 3.3.0** and later. Thanks to **Marcel Graf (AWARE7 GmbH) [@ByteTyson](https://github.com/ByteTyson)** for responsible disclosure and verification of the fix.

- **GHSA-h8fw-42v6-gfhv** - `<= 3.2.3`: HTML Injection using color property in file tags
  **Fixed in: 3.3.0** and later. Thanks to **Marcel Graf (AWARE7 GmbH) [@ByteTyson](https://github.com/ByteTyson)** for responsible disclosure and verification of the fix.

- **GHSA-35pp-ggh6-c59c** — `< 2.7.1`: Stored XSS via browser-rendered user uploads (SVG primary; HTML rendering via share links also documented).  
  **Fixed in:** **2.7.1**. Thanks to **[@x0root](https://github.com/x0root)** for responsible disclosure.  
  _Note: Related reports covering the same root cause and affected endpoint(s) were consolidated into this advisory to avoid duplicate tracking/CVEs._

- **GHSA-6p87-q9rh-95wh** — `≤ 1.3.15`: Improper ownership/permission validation allowed cross-tenant file operations.  
  **Fixed in:** **1.5.0** and later.

- **GHSA-jm96-2w52-5qjj** — `v1.4.0`: Insecure folder visibility via name-based mapping and incomplete ACL checks.  
  **Fixed in:** **1.5.0** and later.

- **GHSA-vh5m-w36c-99xv** / **CVE-2026-33070** — `< 3.8.0`: Unauthenticated Share Link Deletion.  
  **Fixed in:** **3.8.0** and later. Thanks to **n0rv-TvT** for responsible disclosure.

- **GHSA-46gv-gf5f-wvr2** / **CVE-2026-33071** — `< 3.8.0`: WebDAV upload path bypasses filename validation enforced by regular uploads.  
  **Fixed in:** **3.8.0** and later. Thanks to **n0rv-TvT** for responsible disclosure.

- **GHSA-f4xx-57cv-mg3x** / **CVE-2026-33072** — `< 3.9.0`: Default Encryption Key Enables Token Forgery and Config Decryption.  
  **Fixed in:** **3.9.0** and later. Thanks to **n0rv-Tv** for responsible disclosure.

- **GHSA-c2jm-4wp9-5vrh** / **CVE-2026-33329** — `< 3.10.0`: Path Traversal in `resumableIdentifier` Leading to Arbitrary File Write, Recursive Directory Deletion, and Limited Existence Oracle.  
  **Fixed in:** **3.10.0** and later. Thanks to **kq5y** for responsible disclosure.

- **GHSA-6c3j-f4x4-36m3** / **CVE-2026-33330** — `< 3.10.0`: FileRise ONLYOFFICE integration allows read-only users to overwrite files via forged save callback.  
  **Fixed in:** **3.10.0** and later. Thanks to **bg0d-glitch** for responsible disclosure.

Thanks to **[@kiwi865](https://github.com/kiwi865)**, **[@ByteTyson](https://github.com/ByteTyson)**, **[@x0root](https://github.com/x0root)**, **n0rv-TvT**, **n0rv-Tv**, **kq5y**, and **bg0d-glitch** for responsible disclosure of issues.

## Questions

General security questions: **admin@filerise.net**
