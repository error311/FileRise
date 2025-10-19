# Security Policy

## Supported Versions

We provide security fixes for the latest minor release line.

| Version   | Supported |
|----------|-----------|
| v1.5.x   | ✅        |
| ≤ v1.4.x | ❌        |

> Known issues in ≤ v1.4.x are fixed in **v1.5.0** and later.

## Reporting a Vulnerability

**Please do not open a public issue.** Use one of the private channels below:

1) **GitHub Security Advisory (preferred)**  
   Open a private report here: <https://github.com/error311/FileRise/security/advisories/new>

2) **Email**  
   Send details to **<security@filerise.net>** with subject: `[FileRise] Security Vulnerability Report`.

### What to include

- Affected versions (e.g., v1.4.0), component/endpoint, and impact
- Reproduction steps / PoC
- Any logs, screenshots, or crash traces
- Safe test scope used (see below)

If you’d like encrypted comms, ask for our PGP key in your first email.

## Coordinated Disclosure

- **Acknowledgement:** within **48 hours**  
- **Triage & initial assessment:** within **7 days**  
- **Fix target:** within **30 days** for high-severity issues (may vary by complexity)
- **CVE & advisory:** we publish a GitHub Security Advisory and request a CVE when appropriate.  
  We notify the reporter before public disclosure and credit them (unless they prefer to remain anonymous).

## Safe-Harbor / Rules of Engagement

We support good-faith research. Please:

- Avoid privacy violations, data exfiltration, and service disruption (no DoS, spam, or brute-forcing)
- Don’t access other users’ data beyond what’s necessary to demonstrate the issue
- Don’t run automated scans against production installs you don’t own
- Follow applicable laws and make a good-faith effort to respect data and availability

If you follow these guidelines, we won’t pursue or support legal action.

## Published Advisories

- **GHSA-6p87-q9rh-95wh** — ≤ **1.3.15**: Improper ownership/permission validation allowed cross-tenant file operations.  
- **GHSA-jm96-2w52-5qjj** — **v1.4.0**: Insecure folder visibility via name-based mapping and incomplete ACL checks.  

Both are fixed in **v1.5.0** (ACL hardening). Thanks to **[@kiwi865](https://github.com/kiwi865)** for responsible disclosure.

## Questions

General security questions: **<admin@filerise.net>**
