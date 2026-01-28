# CLI Client (REST/OpenAPI)

FileRise ships an OpenAPI v3 spec and a Redoc UI.

- Live UI: `https://your-host/api.php`
- Live spec (login required): `https://your-host/api.php?spec=1`
- Offline spec: `openapi.json.dist` in the repo root

---

## Option A: Generate from the repo spec

```bash
# from a checkout of the repo
openapi-generator-cli generate \
  -i openapi.json.dist \
  -g bash \
  -o cli/bash-client
```

---

## Option B: Fetch the live spec (authenticated)

```bash
# login to get a session cookie
curl -c cookies.txt -H "Content-Type: application/json" \
  -d '{"username":"YOUR_USER","password":"YOUR_PASS"}' \
  https://your-host/api/auth/auth.php

# fetch the spec using the session cookie
curl -b cookies.txt -o openapi.json \
  https://your-host/api.php?spec=1

# generate a client
openapi-generator-cli generate \
  -i openapi.json \
  -g bash \
  -o cli/bash-client
```

---

## Notes

- The live spec requires a valid session (same as the UI).
- For automation, `openapi.json.dist` is the simplest source.
