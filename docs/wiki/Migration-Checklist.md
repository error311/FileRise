# Migration checklist

Use this when moving FileRise to a new server or path.

## Checklist

- Backup `config/`, `users/`, `metadata/`, and `uploads/` if it stores file data.
- Move the FileRise core files to the new server.
- Restore the backed-up folders to the new FileRise root.
- Update web server config and paths.
- Log in and confirm the UI loads.

## Pro considerations

- If you are using a 12-month updates plan, Instance IDs may change.
- Business licenses can add Instance IDs at /pro/instances.php.
- Personal licenses (1 instance) require support to reissue the license for a new Instance ID.

## Related

- /docs/?page=backup-and-restore
- /docs/?page=upgrade-and-migration
- /docs/?page=instance-ids
