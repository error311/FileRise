# ACL Recipes

These recipes map to the **Folder Access** UI in the Admin Panel. Use them as starting points and adjust per folder.

## Notes

- **Manage (Owner)** grants full access for that folder.
- **Write** is a shortcut that toggles the file actions (Create File, Upload, Edit, Rename, Copy, Delete, Extract).
- **View (own)** limits listings to files the user uploaded.
- Account flags (Read-only, Disable upload, Folder-only) still apply even if ACLs allow an action.

---

## Recipes

### Read-only viewer

- View (all): on
- Everything else: off

### Upload dropbox (per-user)

- Upload: on
- View (own): on (auto-enabled by Upload)
- Everything else: off

### Contributor (upload + edit, no delete)

- View (all): on
- Upload: on
- Create File: on (optional)
- Edit, Rename, Copy: on
- Delete, Extract: off
- Manage: off

### Editor with delete, no sharing

- View (all): on
- Upload, Create File, Edit, Rename, Copy, Delete, Extract: on (or toggle Write)
- Share File / Share Folder: off
- Manage: off

### Folder owner / manager

- Manage (Owner): on

### Share file links only

- View (all): on
- Share File: on
- Manage: off

### Share folder links

- View (all): on
- Share Folder: on (UI will require Manage)
- Manage (Owner): on

### Move items between folders

- Source folder: Delete allowed (or Write)
- Destination folder: Manage required (Move is owner-only today)

---

## Related docs

- [ACL and permissions model](https://github.com/error311/FileRise/wiki/ACL-and-Permissions)
- [Admin Panel](https://github.com/error311/FileRise/wiki/Admin-Panel)
