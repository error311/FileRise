# OIDC & SSO

FileRise supports OpenID Connect (OIDC) providers such as Auth0, Authentik, and Keycloak. OIDC works alongside local users and TOTP.

---

## Basic setup

1. In your IdP, create an OIDC client.
2. Set the redirect URI:

```
https://your-host/api/auth/auth.php?oidc=callback
```

If FileRise is hosted under a subpath, include it:

```
https://your-host/files/api/auth/auth.php?oidc=callback
```

3. In FileRise: **Admin → OIDC & TOTP**
   - Provider URL (issuer URL, without `/.well-known/...`)
   - Client ID / Client Secret
   - Redirect URI
   - Optional: Public client (no secret)

Use **Test OIDC discovery** in the admin panel to validate the issuer URL.

---

## Auto-provisioning users

By default, FileRise can auto-create users on first successful OIDC login.

Advanced override (in `config/config.php` or env):

- `FR_OIDC_AUTO_CREATE` (`true`/`false`)

---

## Admin group mapping

You can map an IdP group to FileRise admin. Configure the group claim and admin group name:

- `FR_OIDC_GROUP_CLAIM` (default `groups`)
- `FR_OIDC_ADMIN_GROUP` (default `filerise-admins`)

If a user is removed from the IdP admin group, FileRise can demote them on next login.

- Admin UI toggle: "Allow demote"
- Env override: `FR_OIDC_ALLOW_DEMOTE=1`

---

## Pro: map IdP groups to FileRise Pro groups

If Pro is active, FileRise can map IdP groups into Pro user groups.

- `FR_OIDC_PRO_GROUP_PREFIX` (optional prefix filter)
- If your IdP only returns groups when a custom scope is requested, add it via `FR_OIDC_EXTRA_SCOPES` (space/comma separated, e.g., `groups`) or the Admin → OIDC field.
- If your group claim name differs, set `FR_OIDC_GROUP_CLAIM` (or the Admin → OIDC field) to match.
- FileRise reads group claims from userinfo and falls back to ID token claims when available.

Example:
- IdP group: `frp_clients_acme`
- Prefix: `frp_`
- Pro group: `clients_acme`

---

## Troubleshooting tips

- Ensure the redirect URI matches exactly what your IdP expects.
- If behind a proxy/subpath, set `FR_PUBLISHED_URL` and `FR_BASE_PATH` if needed.
- For debugging, enable OIDC debug logging in the admin panel or set `FR_OIDC_DEBUG=1`.

---

## Proxy auth headers (advanced)

If your reverse proxy authenticates users, you can disable form login and trust a header (default `X-Remote-User`) via **Admin → Login options**.
