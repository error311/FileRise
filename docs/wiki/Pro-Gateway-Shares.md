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
