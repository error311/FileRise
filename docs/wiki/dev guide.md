# Developer guide

Contributions are welcome. See `CONTRIBUTING.md` for workflow and PR guidelines.

## Repo structure (core)

- `public/` - frontend assets + entrypoints (`index.html`, `api.php`, `webdav.php`)
- `src/controllers/` - request handlers
- `src/models/` - data logic (users, auth, admin config)
- `src/lib/` - shared utilities (ACL, crypto, storage)
- `scripts/` - CLI helpers (e.g., `scan_uploads.php`)

## Local dev quick start

```bash
composer install
php -S 127.0.0.1:8080 -t public
```

For local paths, you can point data directories to a temp location:

```
FR_TEST_UPLOAD_DIR=/tmp/filerise/uploads
FR_TEST_USERS_DIR=/tmp/filerise/users
FR_TEST_META_DIR=/tmp/filerise/metadata
```

## OpenAPI spec

- Source: `src/openapi/` and `public/api/` annotations
- Generate spec:

```bash
./scripts/gen-openapi.sh
```

This writes `openapi.json.dist`.

## Pro note

Pro features live in `FileRisePro/`. Keep core usable without Pro and avoid adding core dependencies on the Pro bundle unless explicitly required.
