# ACL and Permissions Model

FileRise uses per-folder ACLs that are enforced consistently across the web UI, API, and WebDAV.

---

## Roles and scopes

- **Admin**: full access and configuration rights.
- **Standard user**: access is governed by per-folder ACLs and user flags.

User flags used by the app:

- **Read-only**: blocks write actions (upload/edit/rename/delete/move/copy).
- **Disable upload**: blocks uploads but can still allow non-upload actions depending on ACLs.

---

## Folder ACLs

Per-folder ACLs control what a user can do inside each folder. The UI exposes common capabilities such as:

- View (own/all)
- Upload
- Create
- Edit
- Rename
- Move / Copy
- Delete
- Extract
- Share

Folder ACLs are inherited by default. Admins can override or disable inheritance as needed.

---

## Permission details (Folder Access UI behavior)

These notes describe what the **Folder Access** screen enforces today.

### Quick rules

- **Manage (Owner)** is the umbrella grant. It auto-enables View (all), file-level actions, and Share, and is required for subfolders and moves.
- **Create File / Upload / Edit / Rename / Copy / Delete / Extract** are individual file actions. The UI gates each one on its own toggle.
- **Edit** authorizes changing file contents in the folder regardless of who uploaded the file. File ownership does not replace the Edit requirement.
- **Write** is a shortcut checkbox: it toggles the file-level actions as a group. If any file action is on, Write shows as checked. It does **not** grant extra capabilities beyond those toggles in the UI.
- **Share File** auto-enables View (own). **Share Folder** auto-enables Manage + View (all) and won’t stay on without them.

### Action map (UI gating)

| UI action | Requires | Notes |
|-----------|----------|-------|
| View (all) | View (all) | View (own) is disabled when full view is on. |
| View (own) | View (own) | Upload also auto-enables this if no view is set. |
| Create file | Create File or Manage | If Create File is off, the New button is disabled. |
| Upload file | Upload or Manage | |
| Edit file | Edit or Manage | Applies to file contents regardless of uploader. |
| Rename file | Rename or Manage | |
| Copy file | Copy or Manage | |
| Delete file | Delete or Manage | |
| Extract archive | Extract or Manage | |
| Create folder | Manage | Subfolders require Manage/Owner. |
| Move (files/folders) | Manage | Owner on an ancestor also qualifies. |
| Share file | Share File | Also sets Share (server side). |
| Share folder | Share Folder + Manage + View (all) | UI enforces this combination. |

Notes:

- Account-level flags (Read-only / Disable upload) and source read-only still apply even if ACLs allow an action.
- **Bypass ownership** only relaxes operations that apply a separate ownership restriction. It does not grant a missing folder capability and is not required when the folder's Edit capability authorizes a content edit.
- Replacing an existing filename through an upload is treated as an upload collision and retains its separate ownership protection.

---

## WebDAV behavior

WebDAV uses the same ACLs as the UI. If a user cannot perform an action in the UI, the same action is blocked over WebDAV.

---

## Shares and encrypted folders

- Share links respect ACLs.
- Encrypted-at-rest folders disable WebDAV, sharing, ZIP create/extract, and ONLYOFFICE by design.

---

## Pro groups

In Pro, user groups can be granted folder ACLs. Group permissions are additive and do not reduce existing user access.

If OIDC group mapping is enabled, group membership can be synced automatically from your IdP.

---

## Tips

- Start with a narrow ACL set and add capabilities as needed.
- For help debugging access, confirm folder inheritance and any user flags first.
