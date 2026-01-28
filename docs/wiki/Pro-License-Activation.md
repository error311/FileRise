# Pro license activation

Activate your Pro license before installing or updating the Pro bundle.

## Activate in the UI

1. Go to Admin -> FileRise Pro.
2. Paste your license key (FRP1...).
3. Click Save license.

## File-based activation (optional)

Create `users/proLicense.json` with:

```json
{
  "license": "FRP1..."
}
```

## If Pro shows inactive

- Confirm the license is saved in Admin -> FileRise Pro.
- Confirm the Pro bundle is installed and readable.
- If your updates window ended, Pro stays active on your current bundle; renew to download newer bundles.

## Instance IDs

12-month updates plans use Instance IDs. See /docs/?page=instance-ids if you move servers or need to change them.

## Recover a lost license

Use /pro/recover.php with the checkout email and your Stripe Checkout Session ID (starts with `cs_`).
