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

FileRise binds each OIDC account using the provider's immutable issuer and subject
identifiers. `preferred_username` is used only to name a new local account.
Verified email can be used when no valid preferred username is available.
Neither claim can attach an unbound OIDC identity to an existing local account.

Bindings are stored in `users/oidc_identities.json`; include this file in backups
with the rest of the users directory.

### Upgrading existing OIDC accounts to v3.23.0

> **Breaking security change:** OIDC accounts used before v3.23.0 do not yet
> have an issuer/subject binding. Their first OIDC login after upgrading cannot
> automatically match the existing local account.

This affects only upgrades of deployments with existing OIDC users. It does not
change local-password accounts, stored files, permissions, TOTP secrets, Docker
volumes, or the OIDC provider configuration.

#### Before upgrading

1. Back up the complete FileRise `users` directory.
2. Open a private browser window and confirm that at least one administrator can
   sign in with a local username and password.
3. Identify accounts that use OIDC exclusively and do not have a known local
   password.
4. While an administrator is still signed in, assign those users temporary
   local passwords or plan an administrator-assisted account migration.
5. If the only administrator uses OIDC, set and test a local administrator
   password before upgrading. Do not rely on an existing browser session as the
   only recovery method.

#### Link each existing account after upgrading

1. Start the normal FileRise OIDC login.
2. Authenticate as the corresponding user at the configured identity provider.
3. When FileRise detects the existing unbound local account, it displays a
   one-time account-link confirmation with the local username fixed and
   read-only.
4. Enter that account's local password. If the account has TOTP enabled,
   complete the existing TOTP prompt as well.
5. FileRise records the immutable issuer/subject binding in
   `users/oidc_identities.json`.
6. Sign out and verify that a new OIDC login returns to the same FileRise
   account with its existing role and permissions.

The guided confirmation is available only after a validated OIDC callback,
expires after five minutes, and works even when ordinary form login is disabled.
Canceling it clears the pending session without modifying the local account.

Repeat the procedure for each existing OIDC account and include
`users/oidc_identities.json` in future backups. Retire any temporary passwords
according to your local credential policy after verifying the bindings.

If a user attempts OIDC login before completing the link, FileRise rejects a
claim that collides with the existing local username. The rejection does not
delete or modify the existing account.

OIDC-only users without a known local password require an administrator-assisted
password reset or migration to a newly auto-provisioned OIDC account. FileRise
deliberately does not perform automatic first-login matching because a mutable
claim cannot prove ownership of an existing account and would recreate the
account-takeover vulnerability.

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
Set `FR_TRUSTED_PROXIES` to the reverse proxy IP or CIDR before enabling this mode; FileRise only accepts the proxy-auth identity header from trusted proxy sources.
