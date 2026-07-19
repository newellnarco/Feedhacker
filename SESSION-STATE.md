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

## Current state — as of 2026-07-19

- **Latest GitHub release:** `v0.4.4` (2026-07-09). `main` is bumped to **0.4.5** (in dev — see
  Next release).
- **Chrome Web Store:** **v0.4.4 is LIVE** (confirmed published 2026-07-09 20:56 UTC — Google
  "Item successfully published" email, Version 0.4.4). The submission slot is **OPEN** (newest
  store decision is a publish, nothing in review).
- **Store item ID:** `kccajfoghkplakndamlohpepopdpelkb` (moved to this new item as of 0.3.0;
  the old item was `djfbniehjjngpkimngegnjdeamfofnoa`).
- **Monitoring:** Google's "Item successfully published" email to newellnarco@gmail.com is the
  reliable notification. On a new session, re-run steps 2/3 above (search
  `from:chromewebstore-noreply@google.com newer_than:7d`, read the Version field of the newest
  "published" email).

## Next release — v0.4.5 (in progress, not shipped)

- **Staged so far** (all under `## [0.4.5]` in `CHANGELOG.md`; `manifest.json` + `package.json`
  at **0.4.5**; merged to `main` via PRs #42–#46):
  - **In-place "Update now" for Chrome Web Store installs** (#42) — store users who hit *Check for
    updates* can now fetch and apply a published update on the spot via Chrome's own update API
    (`requestUpdateCheck` → `runtime.reload`), then just refresh the LinkedIn tab — no browser
    restart. If the new version is on GitHub but not yet live on the store (still in Google review),
    it says so plainly instead of failing.
  - **Popup help moved behind a "?" button** (#43) — the two always-on help blurbs (the "How it
    works" line and the Aggression note) are gone from the default view; a small **?** by the Enable
    toggle reveals the same help in a popup on demand (close with ×, click-outside, or Esc). Also:
    the Aggression slider label now shows plainly **strict / balanced / aggressive** (the
    "(~28% hidden)" fraction overflowed the row and got clipped).
  - **Welcome-page refresh** (#44) — the pinning-guide puzzle-piece icon now uses Chrome's own
    monochrome gray "Extensions" glyph (was the colorful 🧩), so the step reads true to the real
    toolbar button.
  - **MAX3/netsniff engineering discipline adopted** (#45, #46) — CodeRabbit config, numbered
    `best_practices.md` rules (§19–29), a tree-integrity ledger, a test matrix, and CI hardening
    from applying the PR-review findings.
- Keep accumulating further work under 0.4.5 until the user says "ship."
- **Backlog / possible follow-ups:**
  - The best-effort **MSI** installer build still fails in CI (WiX `Build MSI` step); it's
    `continue-on-error` and never blocks a release, so it's optional to fix.
  - The `chrome-extension://invalid/` request some users see on LinkedIn is LinkedIn-side (their
    fetch interceptor hitting a stale reference after a context swap) — FeedHacker no longer
    contributes an enumerable resource to it (0.4.3). Nothing further actionable on our side.

## Key facts & gotchas (so a new session doesn't relearn them)

- **Ship only on explicit "ship"/"push."** Otherwise keep developing, commit/merge PRs freely
  (green CI), accumulate under the next version.
- **Release mechanism:** run the **Release** workflow via `workflow_dispatch` with `publish: true`
  from `main` (the sandbox token can't push tags, so the workflow tags `v<manifest version>`
  itself, cuts the GitHub Release, and uploads to the store).
- **Designated dev branch:** the session harness assigns a per-session `claude/*` branch (this
  session: `claude/new-session-asycej`). Its PRs keep getting merged, so reset the branch from
  `origin/main` for each new change; force-with-lease is fine (it only ever carries already-merged
  history).
- **Store rejects a new upload while one is in review** (`ITEM_NOT_UPDATABLE`). Don't try to ship
  a new store version until the pending one clears.
- **Installer scripts must be pure ASCII.** Windows PowerShell 5.1 reads a UTF-8-no-BOM `.ps1` as
  Windows-1252, so an em-dash breaks parsing. `test/unit/installer.test.js` guards this.
- **Sideload-only build bits:** the `nativeMessaging` permission + a fixed manifest `key` are
  injected **only** into the sideload builds by `scripts/build.mjs`; the Chrome Web Store zip stays
  minimal (`["storage"]`, no key). A manifest test guards it.
- **MSI job** is best-effort (`continue-on-error`) and often fails — never blocks the release.
