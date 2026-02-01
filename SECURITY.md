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

- **GHSA-35pp-ggh6-c59c** — `< 2.7.1`: Stored XSS via browser-rendered user uploads (SVG primary; HTML rendering via share links also documented).  
  **Fixed in:** **2.7.1**. Thanks to **[@x0root](https://github.com/x0root)** for responsible disclosure.  
  _Note: Related reports covering the same root cause and affected endpoint(s) were consolidated into this advisory to avoid duplicate tracking/CVEs._

- **GHSA-6p87-q9rh-95wh** — `≤ 1.3.15`: Improper ownership/permission validation allowed cross-tenant file operations.  
  **Fixed in:** **1.5.0** and later.

- **GHSA-jm96-2w52-5qjj** — `v1.4.0`: Insecure folder visibility via name-based mapping and incomplete ACL checks.  
  **Fixed in:** **1.5.0** and later.

Thanks to **[@kiwi865](https://github.com/kiwi865)** & **[@ByteTyson](https://github.com/ByteTyson)** for responsible disclosure of issues.

## Questions

General security questions: **admin@filerise.net**
