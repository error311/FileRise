# Pro gateway shares (SFTP / S3 / MCP)

Gateway Shares supports two workflows:

- **Managed Mode (recommended):** start/stop/restart runtimes from Admin.
- **Manual/Snippet mode (fallback):** generate/test snippets and run runtimes yourself.

## Managed Mode (Admin -> Gateway Shares -> Shares tab)

In the **Shares** tab, you can:

- Start / Stop / Restart a gateway runtime.
- View runtime status (running/stopped, bind, pid, heartbeat, last error).
- Tail bounded logs.
- Toggle per-gateway autostart.
- Delete managed runtime state/logs without deleting the gateway record.

Gateway records remain reusable across both managed and manual mode.

## Share fields: what they mean

The main fields on a gateway share are:

- `gatewayType`
  - Managed mode currently supports `sftp` and `s3`.
- `sourceId`
  - The FileRise source the share is associated with.
  - Use `local` for the default local storage root, or another configured source id such as an SMB source.
- `rootPath`
  - The FileRise logical scope inside that source.
  - Use `root` to represent the whole source.
  - Use a subfolder path such as `projects/acme` to scope the share to that folder inside the source.
- `managedTarget` (optional, but important)
  - The actual filesystem path that the managed `rclone serve ...` runtime will expose.
  - If set, managed mode uses this value directly.
  - If blank, managed mode tries to derive the target path automatically from the source/root settings.
- `mode`
  - `ro` = read only
  - `rw` = read/write
- `listenAddr` / `port`
  - The bind address and port for the managed runtime.

## `rootPath` vs `managedTarget`

These two fields do different jobs:

- `rootPath`
  - FileRise logical scope/path inside the selected source.
  - This is how the share is scoped from the FileRise side.
- `managedTarget`
  - Actual mounted path that the managed runtime serves on disk.
  - This is what `rclone serve sftp ... <target>` or `rclone serve s3 ... <target>` will use.

### Local sources

For `local` sources, managed mode can usually derive the target path automatically:

- `sourceId = local`
- `rootPath = root`
  - serves the local source root
- `rootPath = Documentation`
  - serves the `Documentation` subfolder under that local source root

In those normal local-source cases, `managedTarget` can usually be left blank.

### Non-local sources such as SMB / CIFS

For non-local sources, managed mode requires `managedTarget`.

Current behavior in managed mode is:

- if `managedTarget` is set, it is used directly
- if `managedTarget` is blank and the source is not `local`, managed mode errors

That means SMB/CIFS, SFTP-source, FTP-source, WebDAV-source, and similar non-local source ids need an explicit mounted target path for managed mode.

### SMB example

If your SMB share is mounted on the host/container at:

`/mnt/client-share`

and you want the gateway to expose:

`/mnt/client-share/projects`

then use:

- `sourceId = <your SMB source id>`
- `rootPath = projects`
- `managedTarget = /mnt/client-share/projects`

If you want the whole mounted SMB share, use:

- `sourceId = <your SMB source id>`
- `rootPath = root`
- `managedTarget = /mnt/client-share`

Important:

- `managedTarget` does not mount SMB by itself
- it only tells the managed runtime which already-mounted path to serve
- the path must exist and be visible from the FileRise / managed-runtime environment

## rclone runtime in Managed Mode

Managed mode resolves a runtime `rclone` binary in this order:

1. `FR_PRO_RCLONE_BINARY` (explicit env override)
2. Managed runtime binary at `users/pro/gateway_runtime/bin/rclone`
3. Bundled fallback binary (if package includes a real one)
4. System `rclone` on `PATH`

From the admin panel you can:

- **Download + install rclone** into managed runtime `bin/rclone`
- **Upload custom rclone** into managed runtime `bin/rclone`
- **Check rclone update** (current/latest + update status)

If the bundled file is a placeholder wrapper, Managed status reports that clearly and asks you to install/upload a real binary.

When a managed share starts successfully, the runtime command ends with the resolved target path described above.

## Docker / container networking notes

- Publish each gateway port on the host (example: `-p 2022:2022`).
- Use `0.0.0.0` bind for LAN access; use `127.0.0.1` for local-only.
- If binding a non-loopback address from inside Docker fails, use `0.0.0.0` plus host port publishing.

## MCP runtime (Admin -> Gateway Shares -> MCP tab)

The **MCP** tab provides:

- MCP service config/save (listen address, port, autostart, public bind option).
- Start / Stop / Restart controls.
- Bounded log tail.
- MCP user mapping (token + FileRise user + source/root scope).
- In-panel AI integration template generator (OpenAI / Claude / Gemini / curl starters) with copy/download actions.
- Example queued jobs (cleanup, autotag).

MCP actions are ACL-enforced and scope-limited to mapped FileRise user context.

For AI integration templates and copy/paste starter flows, see [Pro MCP AI quickstart](Pro-MCP-AI-Quickstart).

## Manual/Snippet mode (fallback)

Manual mode is still supported:

- Save gateway records.
- Use **Test** to validate config.
- Generate command / docker-compose / systemd snippets.

`Test` validates config and performs best-effort checks, but does **not** start long-running services.

## SFTP quick start (Docker sidecar)

1. Keep FileRise app container running.
2. Run `rclone` as a sidecar container on the same network.
3. Mount the same storage path expected by your gateway target.
4. Publish the gateway port.
5. Connect clients to `HOST_IP:PORT`.

Example:

```bash
docker run -d \
  --name filerise-gw-test \
  --network filerise-net \
  -p 2022:2022 \
  -v "$HOME/filerise/uploads:/var/www/uploads" \
  rclone/rclone:latest \
  sh -lc "rclone serve sftp '/var/www/uploads/Documentation' --addr 0.0.0.0:2022 --user test --pass test --read-only=false"
```

## Common failures

- `rclone binary not found`:
  - Install via admin panel, upload a binary, set `FR_PRO_RCLONE_BINARY`, or install on system `PATH`.
- `Connection refused`:
  - Runtime is not running, or host port publish is missing.
- `Connection timed out`:
  - Bind/listen mismatch, firewall, or wrong host IP.
- `Port bind failed`:
  - Port already in use or address is not bindable in current runtime.

## Security notes

- Keep bind on `127.0.0.1` unless external access is required.
- Prefer firewall/reverse-proxy controls over exposing raw gateway ports.
- Secrets are encrypted at rest and not echoed after save.
