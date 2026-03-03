# Pro Automation

Automation in FileRise Pro provides two connected capabilities:

- **Webhooks** for outbound event delivery.
- **Async jobs** for background processing and retries.

You manage both from **Admin Panel -> Automation**.

## Webhooks tab

The Webhooks tab lets you:

- Create and edit webhook endpoints (name, URL, secret, timeout, retry attempts, enabled flag).
- Choose event filters (for example `file.uploaded`, `file.deleted`, `share.created`, `job.failed`).
- Queue a test delivery for an endpoint.
- Review recent deliveries (status code, duration, error snippet).

Security controls are also in this tab:

- Global webhook enable/disable.
- Host allowlist enforcement (exact host and `*.example.com` wildcard support).
- Force-public-target mode to block private/local targets globally.

## Jobs tab

The Jobs tab lets you:

- Queue a ClamAV scan job by source/folder.
- Start the automation worker.
- Set or unset recurring scan interval override.
- Filter jobs by status (`queued`, `running`, `succeeded`, `dead`, `canceled`).
- View job details and retry/cancel jobs.
- Cleanup old finished jobs, logs, delivery records, and stale worker heartbeat entries.

## How it works

- Webhook events are queued as jobs and delivered asynchronously.
- Failed deliveries are retried based on endpoint max-attempt settings.
- Worker heartbeat and queue metrics are surfaced in the Admin panel so you can monitor backlog and health.

## Operational notes

- Keep webhook allowlist enabled unless you explicitly need broad outbound targets.
- Use endpoint secrets so receivers can verify signatures.
- For large environments, monitor queued/running counts and cleanup history regularly.

## Related

- /docs/?page=admin-panel
- /docs/?page=pro-gateway-shares
