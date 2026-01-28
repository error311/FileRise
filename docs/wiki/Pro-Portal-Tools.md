# Pro portal guide

The FileRise Pro portal is the self-serve hub for downloads, license recovery, renewals, and Instance ID tools.
Main entry point: `/pro/portal.php`.

## What you need

- License key (starts with `FRP1...`).
- Instance ID(s) from **Admin -> FileRise Pro** (needed for some renewals or reissues).
- Stripe Checkout Session ID (starts with `cs_...`) for license recovery.

## Download the Pro bundle

1. Open `/pro/portal.php` (or `/pro/update.php` for the full install guide).
2. Paste your license key under **Download latest Pro bundle**.
3. Download the ZIP and install it in **Admin -> FileRise Pro**.

Notes:
- Update FileRise core first, then install the matching Pro bundle.
- License validation happens locally; the portal does not store your key.

## Download a license file (FileRise.lic)

1. Open `/pro/portal.php`.
2. Paste your license key under **Download license file**.
3. Upload the `FileRise.lic` file in **Admin -> FileRise Pro** (or use the file-based activation method).

## Recover a lost license

1. Open `/pro/recover.php`.
2. Enter your checkout email and Stripe Checkout Session ID (`cs_...`).
3. Submit, then copy the license or download `FileRise.lic`.

Where to find the session ID:
- In your Stripe receipt email.
- In the thank-you page URL after checkout.

If you no longer have the session ID, email support.

## Renew updates (12 months)

1. Open `/pro/renew.php`.
2. Choose Personal or Business renewal.
3. Paste your current license key.
4. Optional: add Instance ID(s) only if your license predates instance binding.
5. Complete checkout.

Notes:
- Renewals extend updates only; they do not change instance binding.
- Pro keeps working even if you do not renew.

## Add Instance IDs (Business licenses)

1. Open `/pro/instances.php`.
2. Paste your current Business 12-month updates license.
3. Paste new Instance ID(s), one per line or comma-separated.
4. Submit to reissue the license, then replace the key in each FileRise instance.

Notes:
- Business licenses support up to 3 Instance IDs.
- This does not extend your updates window.

## Related

- /docs/?page=pro-license-activation
- /docs/?page=instance-ids
- /docs/?page=pro-install-and-update
- /pro/portal.php
- /pro/recover.php
- /pro/renew.php
- /pro/instances.php
