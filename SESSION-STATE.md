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

## ⏳ Next session — check first

- **Did v0.4.6 publish on the Chrome Web Store?** It was shipped 2026-07-29 via the Release
  workflow and auto-submitted (`CWS_AUTO_PUBLISH=true`, log: "Publish successful" = *submitted for
  review*, not approved). Search Gmail for the "Item successfully published" email and check the
  **Version** field says **0.4.6**. If yes → mark 0.4.6 ✅ Live in `RELEASES.md`, slot OPEN. If the
  newest email still says 0.4.5, it's **still in review** — slot BLOCKED, don't upload anything.
  **Read the `Version` field, not the listing** — that mix-up is what caused the icon bug (§33).
  As of 2026-07-29 ~22:15 UTC the newest store email was still Version **0.4.5** (2026-07-24), i.e.
  0.4.6 was **still in review**, no rejection.
- **One owner action outstanding:** **Windows sideload users must re-install once** — see FH-042 /
  `KNOWN_ISSUES.md`. The 0.4.5 updater can't deliver its own fix, so tell any affected user to
  re-run `installer\install.bat` from `feedhacker-0.4.6-win.zip`.
- **No AI reviewer runs on this repo.** CodeRabbit was **removed from every repo except `max3` and
  `netsniff`** (maintainer, 2026-07-29), so FeedHacker PRs get no bot review at all. **Green CI is
  the merge gate.** Don't recreate `.coderabbit.yaml`, don't invoke `@coderabbitai` commands (paid
  quota), and don't wait on a bot comment. See `REVIEWERS_STATUS.md`.
- **Next dev cycle is 0.4.7** — `manifest.json`/`package.json` are bumped, `CHANGELOG.md` has an
  empty `[0.4.7] — unreleased` section. Accumulate there; don't release without an explicit "ship".

## Current state — as of 2026-07-29 (post-0.4.6 ship)

- **Latest GitHub release:** **`v0.4.6` (2026-07-29)** — tag `v0.4.6` on `main` @ `92ff8f9`, cut by
  the Release workflow (`publish: true`) with all four prebuilt zips attached. The next dev cycle
  has begun: `manifest.json`/`package.json` are bumped to **0.4.7**.
- **Chrome Web Store:** **0.4.6 uploaded + auto-submitted 2026-07-29** (`webstore` job green; log:
  "Uploading feedhacker-0.4.6-store.zip… / Publishing… / Publish successful" with
  `CWS_AUTO_PUBLISH=true`). That means **submitted for Google review, NOT approved** — the live
  package is still 0.4.5 until the "Item successfully published (Version 0.4.6)" email lands. The
  submission slot is therefore **BLOCKED**.
  (The best-effort `msi` job failed again on the WiX gate and never blocks anything.)
- **What 0.4.6 fixes for users, once approved:**
  - The **`Fh` element-mark icon finally reaches installs.** The listing had shown it since
    2026-07-24, but the store's published *package* was still 0.4.5, so every install kept the old
    MAX "M". Root cause: listing assets and the uploaded package are two independent publish
    channels (`best_practices.md` §33).
  - **Windows auto-update, which was completely broken.** `Sync-LatestRelease` selected the release
    asset with a blacklist, so `feedhacker-<v>-store-submission.zip` (no `manifest.json`) won and
    both the daily task and "Update now" failed every run. Now an anchored allowlist (§34).
  - The installer **no longer falsely claims** it registered the daily update task (§35).
- **Guards added** (branch `claude/chrome-app-icon-mismatch-fkhy9a`, PR #55, squashed to `92ff8f9`):
  `test/unit/brand-assets.test.js` + `test/system/build.system.test.js` pin the store-listing icons
  *and* the icons inside the built package to one brand blue (`test/png.js` holds the constant), and
  `test/unit/installer-update.test.js` locks the updater's asset selection against the real
  four-asset release set. Both verified to fail when the original bugs are reintroduced. Six
  unreferenced pre-rebrand rasters were deleted from the repo root.
- **Review apparatus changed** (maintainer's call, 2026-07-29): **green CI is the merge gate** and
  self-review against `best_practices.md` before pushing is the review step. `.coderabbit.yaml` was
  deleted and stays deleted — it forced draft reviews and re-review-on-every-push, the usage we
  don't want to pay for. Then **CodeRabbit was removed from every repo except `max3` and
  `netsniff`**, so **no AI reviewer runs on FeedHacker at all**. (This flip-flopped three times in
  one session — `REVIEWERS_STATUS.md` records the sequence so it isn't re-litigated. Removed is
  current.) Prior CodeRabbit findings stay credited in `KNOWN_ISSUES.md`'s **Found by** column.
- **Store item ID:** `kccajfoghkplakndamlohpepopdpelkb` (moved to this new item as of 0.3.0;
  the old item was `djfbniehjjngpkimngegnjdeamfofnoa`).
- **Monitoring:** Google's "Item successfully published" email to newellnarco@gmail.com is the
  reliable notification. On a new session, re-run steps 2/3 above (search
  `from:chromewebstore-noreply@google.com newer_than:7d`, read the Version field of the newest
  "published" email).

## Shipped — v0.4.5 (2026-07-21)

- **Released** on GitHub (tag `v0.4.5`) and **uploaded to the Chrome Web Store** (auto-published →
  in review). Full change list under `## [0.4.5] — 2026-07-21` in `CHANGELOG.md`.
- **What shipped** (merged to `main` via PRs #42–#47, plus the `Fh` logo SVG):
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
  - **v0.4.5 UI refresh + heartbeat paging fix + Advanced removal** (#47) — the "No LinkedIn post
    markers found" alarm no longer false-fires during LinkedIn paging (distinguishes a genuine
    selector break from an empty/loading feed).
  - **Scalable `Fh` logo** — a `feedhacker-logo.svg` app icon (FH-040).
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
