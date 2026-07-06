# Publishing FeedHacker to the Chrome Web Store

The store is the cleanest install for end users: one click, no dev mode, no admin, and
Google auto-updates everyone when you upload a new version. This folder has **everything
you need** — the extension package, listing copy, privacy policy, screenshots, promo
tiles, and store icon. All you supply is your Google account.

## One-time

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   and pay the **$5 one-time** developer registration fee. Complete any email/identity
   verification.
2. Set your **publisher display name** to **MAX Research Collective** (Account →
   Publisher, or create/join a group publisher with that name). This is what users see
   as the publisher on the listing.

## Each release

0. Bump the version in `manifest.json` (and `package.json`) and add a
   [`CHANGELOG.md`](../CHANGELOG.md) entry for the new version (move items out of
   **Unreleased**). The store rejects an upload whose version isn't higher than the live one.
1. `npm run build` — produces **`dist/feedhacker-<version>-store.zip`** (manifest.json at
   the zip root, which the store requires).
2. In the dashboard: **New item** (first time) or your existing item → **Upload new
   package** → pick that zip.
3. Fill in the listing from [`listing.md`](listing.md): name, summary, description,
   category, and the **permission justifications**.
4. **Privacy practices** tab: answer the disclosures in `listing.md` and paste your
   **privacy policy URL**, then **Save draft** (the publish check reads the saved value).
   Use the hosted **GitHub Pages** copy — Google's checker reliably reaches it, unlike a
   `raw.githubusercontent.com` link (served as `text/plain`, often flagged "not reachable"):
   `https://newellnarco.github.io/Feedhacker/privacy-policy.html`
   To enable it once: repo **Settings → Pages → Deploy from a branch → `main` / `/docs`**
   (the page source lives in [`docs/`](../docs/); [`privacy-policy.md`](privacy-policy.md)
   is the plain-text original).
5. Upload the graphics from this folder: screenshots `store/screenshot-1-mixer.png`,
   `store/screenshot-2-detection.png`, and `store/screenshot-3-stub.png` (1280×800), the promo tiles
   `store/promo-small-440x280.jpg` (440×280) and `store/promo-marquee-1400x560.jpg`
   (1400×560), and the store icon `store/brand/store-icon-128.png` (white background).
6. **Submit for review.** Approval is usually hours to a few days.

> Tip: `npm run build` also produces `dist/feedhacker-<version>-store-submission.zip` — a
> single archive of all listing assets above (no manifest, not the package) for handoff.

## Before you submit — review-risk checklist

- **Minimal permissions.** The only declared permission is `storage`; host access is
  limited to the `www.linkedin.com` content script, and there are **no**
  `optional_host_permissions` and **no** network requests (the curated banlist ships
  inside the package). Use the justification in `listing.md`.
- Do **not** add a self-hosted `update_url` to the manifest — the store manages updates.
  Our store zip has none; keep it that way.
- Keep the "unofficial, not affiliated with LinkedIn" note and don't use LinkedIn's logo.

## After approval

- Users install with one click and Google auto-updates them.
- To ship an update: bump `version` in `manifest.json`, `npm run build`, upload the new
  `-store.zip`, and submit. No CRX, `updates.xml`, or installer needed.

## Automated publishing (CI) — optional

The [Release workflow](../.github/workflows/release.yml) can upload the store package for
you on every version tag, so you never touch the dashboard for a routine update. It's
**opt-in and best-effort**: the `webstore` job runs only when the credentials below are
set, and it can never fail the GitHub Release.

1. **Get Google API credentials once.** Follow the
   [chrome-webstore-upload-keys guide](https://github.com/fregante/chrome-webstore-upload-keys)
   to create an OAuth **client ID**, **client secret**, and **refresh token** with the
   Chrome Web Store API enabled for your developer account.
2. **Add them under repo Settings → Secrets and variables → Actions:**
   - Secrets: `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`.
   - Variable (optional): `CWS_AUTO_PUBLISH = true` to auto-submit for review. Leave it
     unset to upload the new version as a **draft** — then click **Publish** in the
     dashboard when you're ready (the "update on a click" flow).
3. **Release as usual:** bump `manifest.json`/`package.json`, then
   `git tag vX.Y.Z && git push origin vX.Y.Z`. CI builds `feedhacker-<version>-store.zip`
   and uploads it to item `djfbniehjjngpkimngegnjdeamfofnoa`. Once the new version is
   published and approved, **Chrome auto-updates every store user** within hours to a day —
   no action on their part.

> The store requires each upload to have a **higher** `manifest.json` version than the live
> one, which is why the version bump is step one. `manifest.json` and `package.json` are
> kept in lockstep, and a test guards the store-review limits (name/description length,
> narrowed host permission, no self-hosted `update_url`).

> Note: the extension's own **Details & activity → Check for updates** button checks the
> GitHub *releases* feed (for the Developer-mode/sideload builds). Store installs don't
> need it — Chrome updates them automatically — so for a store user that button is just
> informational.
