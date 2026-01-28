# Pro Sources (multi-storage)

FileRise Pro adds Sources, which let you connect multiple storage backends and switch between them in the UI.

Supported sources:
- Local paths
- S3-compatible (AWS S3, MinIO, Wasabi, Backblaze B2 S3, DigitalOcean Spaces, Cloudflare R2)
- SMB/CIFS
- SFTP
- FTP
- WebDAV (Nextcloud, ownCloud, or any WebDAV server)
- Google Drive
- OneDrive (personal, business, SharePoint)
- Dropbox (personal or team)

---

## Quick setup

1. Open Admin -> Sources.
2. Click Add source and choose a type.
3. Enter connection details and click Test.
4. Save when the test passes.

Each source has its own root and trash behavior. ACLs are enforced per source.

---

## Common fields and behavior

- Source ID: unique slug used internally and in URLs.
- Enabled / Read only: disable or lock a source without deleting it.
- Root path or prefix: scope the source to a subfolder (optional).
- Secrets: stored encrypted and never shown after save (leave blank to keep).

Note: Google Drive sources do not support Trash; deletes are permanent.

---

## Source setup details

### Local

#### Fields
- Local path: absolute server path. Blank uses the default uploads root.

#### Steps
1. Choose local.
2. Enter the path and make sure the web server user can read/write it.
3. Test and save.

#### Notes
- FileRise does not chown or fix permissions on external mounts.

---

### S3-compatible (AWS S3, MinIO, etc)

#### Fields
- Bucket (required)
- Region (optional, default is us-east-1)
- Endpoint (required for non-AWS providers)
- Prefix (optional)
- Access key and secret key (required)
- Session token (optional, for temporary credentials)
- Force path-style addressing (optional)

#### Steps
1. Create a bucket and an access key with read/write permissions.
2. Fill in bucket, region, and credentials.
3. For MinIO/Wasabi/R2/Backblaze B2/Spaces, set endpoint and path-style if needed.
4. Test and save.

#### Official docs
- AWS S3: https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html
- MinIO: https://min.io/docs/minio/linux/index.html
- Cloudflare R2: https://developers.cloudflare.com/r2/

---

### SMB/CIFS

#### Fields
- Host (required)
- Share (required)
- Username and password (required)
- Domain (optional)
- SMB version (Auto, SMB3, SMB2, SMB1)
- Root path (optional)

#### Steps
1. Ensure the FileRise server can reach the SMB host (TCP 445).
2. Create a service account with read/write access to the share.
3. Enter host/share and credentials, then test and save.

#### Official docs
- Samba (SMB): https://www.samba.org/samba/docs/

---

### SFTP

#### Fields
- Host and username (required)
- Port (optional, default 22)
- Password or private key (one is required)
- Key passphrase (optional)
- Root path (optional, blank uses login directory)

#### Steps
1. Create a user with access to the target directory.
2. Use a password or an OpenSSH private key.
3. Test and save.

#### Official docs
- OpenSSH SFTP: https://man.openbsd.org/sftp

---

### FTP / FTPS

#### Fields
- Host and username (required)
- Port (optional, default 21)
- Password (required)
- Use FTPS (SSL) (optional)
- Passive mode (recommended)
- Root path (optional)

#### Steps
1. Enable passive mode if the server is behind NAT.
2. Use FTPS if your server supports it.
3. Test and save.

#### Official docs
- RFC 959 (FTP): https://www.rfc-editor.org/rfc/rfc959

---

### WebDAV

#### Fields
- Base URL (required)
- Username and password (required)
- Root path (optional)
- Verify TLS certificate (disable only for self-signed certs)

#### Steps
1. Use the provider's WebDAV base URL (do not embed credentials).
2. Enter username/password and optional root path.
3. Test and save.

#### Official docs
- Nextcloud WebDAV: https://docs.nextcloud.com/server/latest/user_manual/en/files/access_webdav.html
- ownCloud WebDAV: https://doc.owncloud.com/server/latest/user_manual/en/files/access_webdav.html

---

### Google Drive

#### Fields
- Client ID, client secret, refresh token (required)
- Root folder ID (optional, default root)
- Shared drive ID (optional)

#### Steps
1. Create a Google Cloud project and enable the Google Drive API.
2. Create an OAuth client ID and client secret.
3. Generate a refresh token with scope https://www.googleapis.com/auth/drive.
4. Set Root folder ID to a folder ID from the URL, or leave blank for root.
5. If using a shared drive, set the Shared drive ID.

#### Notes
- Native Google Docs/Sheets/Slides are exported on download.

#### OAuth example
If you want a quick refresh token, the Google OAuth Playground can help:
https://developers.google.com/oauthplayground

Example auth URL (auth code flow, offline access):
```text
https://accounts.google.com/o/oauth2/v2/auth?client_id=CLIENT_ID&response_type=code&access_type=offline&prompt=consent&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive&redirect_uri=REDIRECT_URI
```

Token exchange:
```bash
curl -X POST https://oauth2.googleapis.com/token \
  -d code=AUTH_CODE \
  -d client_id=CLIENT_ID \
  -d client_secret=CLIENT_SECRET \
  -d redirect_uri=REDIRECT_URI \
  -d grant_type=authorization_code
```

#### Official docs
- Drive API: https://developers.google.com/drive/api/guides/about-sdk
- OAuth 2.0: https://developers.google.com/identity/protocols/oauth2

---

### OneDrive (personal, business, SharePoint)

#### Fields
- Client ID, client secret, refresh token (required)
- Tenant (optional; common, organizations, consumers, or tenant ID)
- Drive ID or Site ID (optional, for SharePoint/Business)
- Root path (optional)

#### Steps
1. Register an app in Microsoft Entra ID.
2. Add delegated permissions: Files.ReadWrite.All and offline_access.
3. Create a client secret and obtain a refresh token.
4. If using SharePoint/Business, provide driveId or siteId.
5. Optionally set a root path to scope the source.

#### OAuth example
Authorization URL (v2 endpoint):
```text
https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=CLIENT_ID&response_type=code&redirect_uri=REDIRECT_URI&response_mode=query&scope=offline_access%20Files.ReadWrite.All
```

Token exchange:
```bash
curl -X POST https://login.microsoftonline.com/common/oauth2/v2.0/token \
  -d client_id=CLIENT_ID \
  -d client_secret=CLIENT_SECRET \
  -d code=AUTH_CODE \
  -d redirect_uri=REDIRECT_URI \
  -d grant_type=authorization_code
```

#### Official docs
- App registration: https://learn.microsoft.com/entra/identity-platform/quickstart-register-app
- Microsoft Graph OneDrive: https://learn.microsoft.com/graph/onedrive-concept-overview
- OAuth 2.0 auth code flow: https://learn.microsoft.com/entra/identity-platform/v2-oauth2-auth-code-flow

---

### Dropbox

#### Fields
- App key, app secret, refresh token (required)
- Root path (optional)
- Team member ID (optional, Dropbox Business)
- Root namespace ID (optional, team space root)

#### Steps
1. Create a Dropbox app and enable required scopes: files.content.read, files.content.write, files.metadata.read.
2. Use the OAuth 2.0 authorization code flow to generate a refresh token.
3. Optionally set a root path to scope the source.
4. If using a team space, set Team member ID and Root namespace ID.

#### OAuth example
Authorization URL:
```text
https://www.dropbox.com/oauth2/authorize?client_id=APP_KEY&response_type=code&token_access_type=offline&scope=files.content.read%20files.content.write%20files.metadata.read%20files.metadata.write&redirect_uri=REDIRECT_URI
```

Token exchange:
```bash
curl -u APP_KEY:APP_SECRET \
  -d grant_type=authorization_code \
  -d code=AUTH_CODE \
  -d redirect_uri=REDIRECT_URI \
  https://api.dropboxapi.com/oauth2/token
```

#### Official docs
- App console: https://www.dropbox.com/developers/apps
- OAuth guide: https://www.dropbox.com/developers/reference/oauth-guide
- Scopes: https://www.dropbox.com/developers/documentation/http/documentation#authorization

---

## Search Everywhere

If Pro Search is enabled, FileRise can search across all sources and return results incrementally.

---

## Tips

- Start with read-only credentials to validate connectivity.
- Avoid huge per-request listings for slow remote backends.
- Use the Test button to catch SSL/credential and firewall issues early.
