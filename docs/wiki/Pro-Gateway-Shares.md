# Pro gateway shares (SFTP / S3 / MCP)

Gateway Shares in Pro are control-plane records. They store config, validate it, and generate snippets.

Important: in v1, FileRise does not start or stop long-running gateway services for you.
MCP in v1 is metadata/token scaffolding only; runtime MCP server execution is not shipped yet.

## What "Test" does

- Checks config validity (type, bind, port, credentials).
- Checks `rclone` availability (best effort).
- Checks whether port bind appears available (best effort).
- Returns warnings/errors and generated snippets.

`Test` does not launch `rclone serve ...`.

## SFTP quick start (Docker sidecar, recommended)

1. Keep FileRise running in `filerise-app` (web on `8081`).
2. Run `rclone` as a separate container on the same Docker network.
3. Mount the same uploads volume into the sidecar using the same in-container path expected by the snippet (for local sources this is usually `/var/www/uploads`).
4. Publish the gateway port on the sidecar (`-p 2022:2022`).
5. For LAN access, bind to `0.0.0.0` and connect to `HOST_IP:PORT`.

Example sidecar:

```bash
docker run -d \
  --name filerise-gw-test \
  --network filerise-net \
  -p 2022:2022 \
  -v "$HOME/filerise/uploads:/var/www/uploads" \
  rclone/rclone:latest \
  sh -lc "rclone serve sftp '/var/www/uploads/Documentation' --addr 0.0.0.0:2022 --user test --pass test --read-only=false"
```

## Fallback: run rclone inside the FileRise container

This works, but `apt-get install` in a running container is **not persistent** across recreate/redeploy.

```bash
docker exec -it filerise-app sh -lc "apt-get update && apt-get install -y rclone"
```

If you use this fallback, ensure the FileRise container itself publishes the gateway port (`-p 2022:2022`).

## Common failures

- `rclone not found on PATH (cannot verify)`:
  - Install `rclone` in the runtime where the command executes.
  - For Docker, prefer `rclone/rclone` as a sidecar instead of installing in a running app container.

- `Connection refused`:
  - Gateway service is not running, or Docker port publish is missing.
  - Verify container ports include `2022->2022`.

- `Connection timed out`:
  - Bind/listen mismatch, firewall, or wrong host IP.
  - For LAN clients use `0.0.0.0` bind and connect to host LAN IP.

- `Port bind failed` in Test:
  - Usually means that port is already in use or address is not bindable in current runtime.

## Security notes

- Keep default bind on `127.0.0.1` unless external access is required.
- Prefer firewall/reverse-proxy controls over exposing raw ports.
- Secrets are stored encrypted and are not echoed after save.
