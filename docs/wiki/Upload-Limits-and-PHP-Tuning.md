# Upload limits and PHP tuning

If uploads fail or stall, check PHP and web server limits.

## PHP settings

Update your PHP config (php.ini or pool config) and restart PHP:

- `upload_max_filesize`
- `post_max_size`
- `max_execution_time`
- `max_input_time`
- `memory_limit`

## Nginx

Set `client_max_body_size` to match your PHP limits.

## Apache

Set `LimitRequestBody` if you use it, or leave it unset for large uploads.

## FileRise limits

- Shares can have a max upload size set in Admin -> FileRise Pro.
- WebDAV uploads can be capped with `FR_WEBDAV_MAX_UPLOAD_BYTES`.

## Related

- /docs/?page=logs-and-diagnostics
- /docs/?page=performance-tuning
