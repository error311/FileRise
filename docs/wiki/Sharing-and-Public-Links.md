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
- Folder links require full-folder view/sharing authority; Share File with View own does not suffice. Ownership bypass does not supply missing folder view or upload permissions.
- Existing folder links follow their creator's current folder access. Restricted child folders are omitted from browsing and ZIP downloads, and direct access to them is denied. Shared uploads require the creator's Upload/ownership permission in the actual destination, including nested upload paths.
- Tokens and URLs remain stable for authorized links. Links without an identifiable creator, or whose creator was removed or lost the required access, must be recreated by an authorized account. Turning off `canShare` alone still does not revoke existing links.
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
