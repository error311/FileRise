# Sharing and public links

FileRise lets you share files or folders using public links.

## Sharing basics

- Create a share link from the file or folder actions menu.
- Share links can be set to expire and can require a password.
- Anyone with the link can access it, so treat links as public.
- To revoke access, delete the share link or remove the share entry.

## ACLs and sharing

- The account-level **Allow Public Sharing** permission (stored as `canShare`) controls creation of public file, folder and upload/drop links. An explicit disabled setting overrides folder sharing grants, including ownership of the folder or an ancestor. Administrators retain full access.
- A missing setting uses `DEFAULT_CAN_SHARE` (enabled by default); existing explicit settings are preserved.
- Disabling public sharing prevents new links. It does not revoke existing links; delete those share entries separately when revocation is needed.
- Internal authenticated file links are navigation links, not public grants. Creating one requires file read access, and each recipient must sign in and satisfy their own current folder/file access checks. They remain available when public sharing is disabled.
- Encrypted-at-rest folders disable sharing by design.
- Use ACLs to limit which folders a user can see or share.

## Tips

- Use ACLs to limit what users can share.
- Avoid sharing admin-only or sensitive folders.
- Rotate share links if they were posted publicly.
- This control governs FileRise's public-link feature. It cannot prevent an authorized reader from downloading a file and redistributing it elsewhere.

## Related

- /docs/?page=admin-panel
- /docs/?page=acl-and-permissions
- /docs/?page=security-hardening

## Related

- /docs/?page=acl-and-permissions
- /docs/?page=security-hardening
