# Reverse Proxy and Subpath Guide

FileRise is proxy-aware and can run under a subpath like `/files`. Use these rules for reliable URLs and auth.

---

## Required settings

- Set `FR_PUBLISHED_URL` to the public URL (e.g. `https://example.com/files`).
- If your proxy **strips the prefix**, set `X-Forwarded-Prefix` or `FR_BASE_PATH`.
- If you are behind a proxy, set `FR_TRUSTED_PROXIES` and `FR_IP_HEADER`.
- Set `SECURE=true` when behind HTTPS.

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
