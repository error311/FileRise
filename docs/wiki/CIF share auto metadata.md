# CIFS/SMB share setup + metadata scan

This guide covers mounting an SMB/CIFS share on the host and using FileRise's metadata scanner.

---

## 1) Mount the CIFS share on the host

```bash
sudo mkdir -p /mnt/filerise_share
sudo mount -t cifs //your-server/share /mnt/filerise_share \
  -o username=youruser,password=yourpass,uid=33,gid=33
```

- `uid`/`gid` should match the `www-data` user inside the container.
- If you use `PUID`/`PGID` in Docker, align these values with the host mount.

---

## 2) Bind the share into FileRise

```yaml
services:
  filerise:
    image: error311/filerise-docker:latest
    volumes:
      - /mnt/filerise_share:/var/www/uploads
    environment:
      SCAN_ON_START: "true"
      CHOWN_ON_START: "true"
      PUID: "33"
      PGID: "33"
```

> Tip: Avoid mounting the root of a huge share. Use a dedicated subfolder instead.

---

## 3) What SCAN_ON_START does

When `SCAN_ON_START=true`, FileRise runs:

```
/var/www/scripts/scan_uploads.php
```

This indexes existing files into `/var/www/metadata` so they appear in the UI.

You can also run it manually:

```bash
docker exec -it <container> php /var/www/scripts/scan_uploads.php
```

---

## Notes

- `SCAN_ON_START` is intended for first run or occasional rescan.
- Once permissions are correct, set `CHOWN_ON_START=false` for faster startups.
