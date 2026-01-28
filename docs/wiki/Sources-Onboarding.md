# Sources onboarding (Pro)

Sources let you connect multiple storage backends (local, S3-compatible, SMB, SFTP, FTP, WebDAV, Google Drive, OneDrive, Dropbox).

## Quick start

1. Go to Admin -> Sources.
2. Click Add source and choose the adapter.
3. Enter the required connection details.
4. Click Test to verify access.
5. Save, then browse the new source in the UI.

## OAuth-based sources

Google Drive, OneDrive, and Dropbox require an OAuth app plus a refresh token.

1. Create an app in the provider console.
2. Grant the required scopes (see Pro Sources for each provider).
3. Complete the OAuth authorization code flow and capture the refresh token.
4. Paste the client/app ID, client/app secret, and refresh token into the source form.

## Tips

- Use a dedicated service account for each source.
- Start with a small folder path for the first test.
- If Test fails, verify credentials, host/endpoint, and firewall rules.

## Related

- /docs/?page=pro-sources
- /docs/?page=search-everywhere
