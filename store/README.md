# Publishing FeedHacker to the Chrome Web Store

The store is the cleanest install for end users: one click, no dev mode, no admin, and
Google auto-updates everyone when you upload a new version. This folder has everything
except the screenshots (which need real captures) and your Google account.

## One-time

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   and pay the **$5 one-time** developer registration fee. Complete any email/identity
   verification.
2. Set your **publisher display name** to **MAX Research Collective** (Account →
   Publisher, or create/join a group publisher with that name). This is what users see
   as the publisher on the listing.

## Each release

1. `npm run build` — produces **`dist/feedhacker-<version>-store.zip`** (manifest.json at
   the zip root, which the store requires).
2. In the dashboard: **New item** (first time) or your existing item → **Upload new
   package** → pick that zip.
3. Fill in the listing from [`listing.md`](listing.md): name, summary, description,
   category, and the **permission justifications**.
4. **Privacy practices** tab: answer the disclosures in `listing.md` and paste your
   **privacy policy URL**. Host [`privacy-policy.md`](privacy-policy.md) somewhere public
   — e.g. enable GitHub Pages, or use the raw file URL:
   `https://raw.githubusercontent.com/newellnarco/Feedhacker/main/store/privacy-policy.md`
5. Upload **1–5 screenshots** (1280×800 or 640×400) and the 128×128 icon (already in the
   package).
6. **Submit for review.** Approval is usually hours to a few days.

## Before you submit — review-risk checklist

- **Host permission is already narrowed.** `optional_host_permissions` is scoped to
  `https://raw.githubusercontent.com/newellnarco/Feedhacker/*` (not `https://*/*`, and not
  all of raw.githubusercontent.com) and is requested only at runtime when the user clicks
  "Update banlist now". Use the justification in `listing.md`. The fetched banlist is
  stored only in the user's local storage.
- Do **not** add a self-hosted `update_url` to the manifest — the store manages updates.
  Our store zip has none; keep it that way.
- Keep the "unofficial, not affiliated with LinkedIn" note and don't use LinkedIn's logo.

## After approval

- Users install with one click and Google auto-updates them.
- To ship an update: bump `version` in `manifest.json`, `npm run build`, upload the new
  `-store.zip`, and submit. No CRX, `updates.xml`, or installer needed.
