# How to mount FileRise via WebDAV

FileRise includes a built-in WebDAV endpoint (`/webdav.php`) that honors the same ACLs as the web UI.

---

## Linux (GIO / Nautilus)

```bash
gio mount dav://your-username@your-server/webdav.php/
```

Some distros require `gvfs-backends`.

---

## macOS (Finder)

1. Finder → Go → Connect to Server
2. Enter:

```
dav://your-username@your-server/webdav.php/
```

---

## Windows (File Explorer)

1. File Explorer → This PC → Map Network Drive
2. Folder:

```
https://your-server/webdav.php/
```

3. Check "Connect using different credentials"

### Windows HTTP note

Windows requires HTTPS by default. To allow HTTP, change the `BasicAuthLevel` registry setting:

```
HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\WebClient\Parameters
```

Set `BasicAuthLevel` to `2`, then restart the `WebClient` service.

---

## Notes

- If FileRise is hosted under a subpath (e.g. `/files`), use:
  - `https://your-server/files/webdav.php/`
- Folder-only users are scoped to their folder in WebDAV.
- WebDAV uploads can be capped with `FR_WEBDAV_MAX_UPLOAD_BYTES`.

---

## rclone example

```bash
rclone mount \
  :webdav:/uploads \
  --webdav-url=https://your-server/webdav.php \
  --webdav-user=username \
  --webdav-pass=password
```

---

See also: [WebDAV via curl](https://github.com/error311/FileRise/wiki/Accessing-FileRise-via-curl%C2%A0(WebDAV))
