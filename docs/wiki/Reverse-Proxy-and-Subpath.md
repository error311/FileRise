# Reverse Proxy and Subpath Guide

FileRise is proxy-aware and can run under a subpath like `/files`. Use these rules for reliable URLs and auth.

---

## Required settings

- Set `FR_PUBLISHED_URL` to the public URL (e.g. `https://example.com/files`).
- If your proxy **strips the prefix**, set `X-Forwarded-Prefix` or `FR_BASE_PATH`.
- If you are behind a proxy, set `FR_TRUSTED_PROXIES` and `FR_IP_HEADER`.
- Set `SECURE=true` when behind HTTPS.

For `FR_TRUSTED_PROXIES`, list only the actual proxy IPs/CIDRs, including each trusted intermediary in a multi-proxy chain. Do not include client networks or use a catch-all range. With `FR_IP_HEADER=X-Forwarded-For`, FileRise walks the chain from right to left and stops at the first untrusted address. Your proxies must append their verified peer address or replace untrusted incoming values; trusting a proxy does not make an unchanged client-supplied header safe.

Single-address headers such as `X-Real-IP` or `CF-Connecting-IP` remain supported through `FR_IP_HEADER` when the trusted proxy controls that header. They must contain one valid IP, not a comma-separated list. Missing headers or malformed values encountered while resolving the trusted chain fall back to the socket peer, which can group rate limits under the proxy's IP. Invalid text to the left of an already identified untrusted client is ignored.

No storage, account, key, or data migration is required for this resolution behavior. If an intermediary is missing from the trust list, FileRise attributes the request to that intermediary instead of trusting addresses supplied through it. Existing rate-limit entries and external fail2ban bans are not cleared by an upgrade.

---

## Nginx reverse proxy (subpath)

Example: proxy to Docker on `127.0.0.1:8080`, mounted at `/files`.

```nginx
location /files/ {
    rewrite ^/files/(.*)$ /$1 break;
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Prefix /files;
}
```

Recommended env:

```
FR_PUBLISHED_URL=https://example.com/files
```

---

## Traefik (Kubernetes)

Use `StripPrefix` and rely on `X-Forwarded-Prefix`:

```yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: filerise-strip-files
spec:
  stripPrefix:
    prefixes:
      - /files
```

---

## Common pitfalls

- Trailing slash in `proxy_pass` can break paths.
- Forgetting `FR_PUBLISHED_URL` results in bad share links.
- If the prefix is stripped but `FR_BASE_PATH` is not set, links may be wrong.
