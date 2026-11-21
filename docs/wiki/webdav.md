# WebDAV via curl

FileRise supports WebDAV natively, so you can upload, download, list, and manage files from the command line.

The base endpoint is:

```
https://your-server/webdav.php/
```

(Older installs may still accept `.../webdav.php/uploads/`.)

---

## Download a file

```bash
curl -u username:password -O "https://your-server/webdav.php/path/to/file.txt"
```

Example:

```bash
curl -u demo:demo -O "https://192.168.1.10/webdav.php/reports/report.pdf"
```

---

## Upload a file

```bash
curl -u username:password -T "localfile.txt" "https://your-server/webdav.php/path/to/folder/"
```

Folder URLs should end with `/`.

---

## List directory contents

```bash
curl -u username:password -X PROPFIND -H "Depth: 1" "https://your-server/webdav.php/path/to/folder/"
```

---

## Tips

- URL encode spaces with `%20`.
- Use HTTPS in production.
- Accounts with TOTP enabled cannot use password-only WebDAV Basic authentication.
- WebDAV shares the web login's failed-password limits: 5 failures per IP/username pair and 50 per IP within 30 minutes. Failed and locked-out requests are recorded in `users/fail2ban.log`; valid WebDAV authentication keeps its normal Basic-authentication behavior.
- If a mounted client retains an old password, update its saved credentials and allow an active lockout to expire before retrying. No client reconfiguration is needed when its credentials remain valid.
- WebDAV uploads can be capped via `FR_WEBDAV_MAX_UPLOAD_BYTES`.

---

See also: [WebDAV mounting](https://github.com/error311/FileRise/wiki/WebDAV)
