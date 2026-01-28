# Pro client portals

Client portals let you share a branded upload page with customers without exposing the full FileRise UI. Each portal points to a specific folder (and optional Source), with its own upload/download permissions, form, and branding.

---

## Quick setup

1. Go to **Admin -> User Management -> Client Portals** (Pro).
2. Click **Add portal**.
3. Set a **slug** and **folder** (required). Choose a **source** if you use Pro Sources.
4. Enable **Allow upload** and/or **Allow download**.
5. Click **Save settings**.
6. Create a FileRise user for the client and grant folder access (see below).
7. Share the portal URL shown in the portal card.

---

## Portal URL and login

Portal links support two formats:

- Pretty path: `/portal/<slug>` (recommended)
- Query string: `/portal.html?slug=<slug>`

If the user is not signed in, FileRise redirects to `/portal-login.html` and then back to the portal after login.

If you are behind a reverse proxy or subpath, make sure your public base URL is correct so portal links are shareable. See `/docs/?page=reverse-proxy-and-subpath` and `FR_PUBLISHED_URL`.

---

## Access control (important)

Portals always require a FileRise user login. They do not create anonymous access.

You must create users and grant folder permissions for the portal to work:

- Create a user in **Admin -> Manage users** (or use a user group).
- Grant folder access in **Admin -> Folder Access**:
  - For uploads: user needs upload permission.
  - For downloads: user needs read (or read_own) permission.

Portal toggles and ACL both apply:

- Uploads require **Allow upload** and folder upload permission.
- Downloads require **Allow download** and folder read permission.

---

## Core portal fields

Each portal has:

- **Portal slug** (required): becomes part of the URL.
- **Display name**: label shown in the admin list.
- **Source** (optional): select a Pro Source. Local is the default.
- **Folder** (required): upload/download target.
- **Client email** (optional): pre-fills the portal email field. It does not restrict access.
- **Expires** (optional): portal stops working after this date.
- **Allow upload**: enable uploads.
- **Allow download**: enable file listing and downloads.

---

## Branding and instructions

Use these fields to customize the portal page:

- **Portal title**: shown at the top of the portal.
- **Instructions**: short text for the client (what to upload, deadlines, etc.).
- **Accent color**: UI highlight color (CSS hex).
- **Footer text**: small text at the bottom of the portal.
- **Portal logo**: upload a logo image (stored under `uploads/profile_pics`).

---

## Intake form

You can require a short form before uploads:

- Toggle **Require info form before upload**.
- Customize labels, defaults, visibility, and required flags.
- Use a preset (Legal, Tax, Order/RMA) to populate fields quickly.

Form submissions are saved and visible in the portal card:

- **Load submissions** shows recent entries.
- **Export CSV** downloads the submission list.

Submissions are stored under `FR_PRO_BUNDLE_DIR/portals-submissions/<slug>/` (default: `users/pro/portals-submissions/`). Include this in backups if you need the form history.

---

## Upload rules and limits

Optional per-portal limits:

- **Max file size (MB)**
- **Allowed extensions** (comma-separated, no dots)
- **Max uploads per day**

Notes:
- The daily limit is a simple per-browser guard, stored in localStorage. It is not IP-based.
- Leave limits empty or zero to use your global defaults.

---

## Tips and troubleshooting

- **Portal not found / expired**: check the slug and expiration date.
- **Uploads disabled**: confirm Allow upload and folder upload permissions.
- **Downloads missing**: confirm Allow download and folder read permissions.
- **Wrong link behind a proxy**: set `FR_PUBLISHED_URL` and use the pretty path.
- **Source disabled**: only admins can access portals on a disabled source.

---

## Related

- /docs/?page=acl-and-permissions
- /docs/?page=acl-recipes
- /docs/?page=sharing-and-public-links
- /docs/?page=reverse-proxy-and-subpath
