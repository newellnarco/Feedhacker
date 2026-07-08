# FeedHacker — session state & startup checklist

**Read this FIRST at the start of any new session, then run the Startup checklist.** It's the
fast way to get current. Companion files: [`RELEASES.md`](RELEASES.md) (per-version ship record),
[`CHANGELOG.md`](CHANGELOG.md) (changes), [`CLAUDE.md`](CLAUDE.md) (standing rules).

## Startup checklist (run every new session)

1. **Review the record** — this file, then `RELEASES.md` and the top of `CHANGELOG.md`.
2. **Check which version is LIVE on the Chrome Web Store.** Search Gmail:
   `from:chromewebstore-noreply@google.com newer_than:7d`, open the newest thread, read the
   **Version** field of the latest "Item successfully published" email. That version is live.
3. **Check the submission slot is OPEN.** The store accepts only **one pending version at a
   time**. It's OPEN when the newest store email is a *published* (or *rejected*) decision for
   the latest submitted version. It's **BLOCKED** if a version was uploaded but has no
   published/rejected email yet — that version is still **in review**, and any new store upload
   fails `ITEM_NOT_UPDATABLE`. (GitHub releases are never blocked; only the store upload is.)
4. **Report + ask.** Summarize what's done/planned for the next release and which version, then
   **ask the user: ship these changes now, or wait for more?** Never release without an explicit
   "ship"/"push" (see `CLAUDE.md`).

## Current state — as of 2026-07-08

- **Latest GitHub release:** `v0.4.2` (2026-07-08). `main` sits at 0.4.2.
- **Chrome Web Store:** **v0.4.0 is LIVE** (published 2026-07-08 10:33 UTC). **v0.4.2 was
  submitted 2026-07-08 ~21:13 UTC and is IN REVIEW** → **the submission slot is BLOCKED** until
  Google publishes or rejects 0.4.2.
- **Store item ID:** `kccajfoghkplakndamlohpepopdpelkb` (moved to this new item as of 0.3.0;
  the old item was `djfbniehjjngpkimngegnjdeamfofnoa`).
- **Monitoring:** an in-session cron watches Gmail for the 0.4.2 decision, but it dies when the
  session ends — Google's email to newellnarco@gmail.com is the reliable notification. On a new
  session, just re-run step 2/3 above.

## Next release — v0.4.3 (not started)

- **Nothing staged yet.** 0.4.2 just shipped; there are no new changes for 0.4.3.
- When new work begins: bump `manifest.json` + `package.json` to **0.4.3**, and log changes under
  a `## [0.4.3]` section in `CHANGELOG.md` (accumulate everything under that one next version).
- **Backlog / possible follow-ups:** (none committed) — e.g. the best-effort **MSI** installer
  build still fails in CI (WiX); it never blocks a release and isn't needed for auto-updates, so
  it's optional to fix.

## Key facts & gotchas (so a new session doesn't relearn them)

- **Ship only on explicit "ship"/"push."** Otherwise keep developing, commit/merge PRs freely
  (green CI), accumulate under the next version.
- **Release mechanism:** run the **Release** workflow via `workflow_dispatch` with `publish: true`
  from `main` (the sandbox token can't push tags, so the workflow tags `v<manifest version>`
  itself, cuts the GitHub Release, and uploads to the store).
- **Designated dev branch:** `claude/push-v3-chrome-store-9m193x`. Its PRs keep getting merged, so
  reset it from `origin/main` for each new change; force-with-lease is fine (it only ever carries
  already-merged history).
- **Store rejects a new upload while one is in review** (`ITEM_NOT_UPDATABLE`). Don't try to ship
  a new store version until the pending one clears.
- **Installer scripts must be pure ASCII.** Windows PowerShell 5.1 reads a UTF-8-no-BOM `.ps1` as
  Windows-1252, so an em-dash breaks parsing. `test/unit/installer.test.js` guards this.
- **Sideload-only build bits:** the `nativeMessaging` permission + a fixed manifest `key` are
  injected **only** into the sideload builds by `scripts/build.mjs`; the Chrome Web Store zip stays
  minimal (`["storage"]`, no key). A manifest test guards it.
- **MSI job** is best-effort (`continue-on-error`) and often fails — never blocks the release.
