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

### Session closed 2026-09-08 (the "it hides everything" session)

**Where things stand:** `main` @ `b127b32`. **0.4.9 is LIVE on the Chrome Web Store**
(Google "Item successfully published", Version 0.4.9, **2026-09-08 04:25 UTC**). The
**submission slot is OPEN** — nothing is pending review.

- **Dev cycle OPEN: 0.5.0.** `manifest.json` / `package.json` / `package-lock.json` are bumped
  and `CHANGELOG.md` has an empty `[0.5.0] — unreleased` section. Land work under that version
  and label PRs `v0.5.0`. **Do not release without an explicit "ship"/"push."**

- **Two owner actions are still open** (nothing in the repo blocks on them):
  1. **Verify FH-049 on a real feed.** 0.4.9 shipped proven in tests only. *Reset AI-slop
     learning* (the stored weights and 112 training examples came from the duplicate flood and
     stay over-aggressive until cleared), browse, then **Export log (JSON)**. **Decisions should
     ≈ distinct posts** — it was 300 from 13. If it is still lopsided, the activity-URN lookup
     is not finding LinkedIn's post ids and the markup needs inspecting. Bring the export; do
     not re-theorise without it (§49).
  2. **`CWS_PUBLISHER_ID` is still invisible to Actions**, from both the Variables and the
     Secrets tab. Most likely the wrong *page*: Settings → Secrets and variables → **Actions**
     has its own Secrets/Variables tabs, separate from the **Codespaces** and **Dependabot**
     pages, and a value added on either of those is invisible to workflows. Check it is on the
     Actions page, at repository (not environment) scope, named exactly `CWS_PUBLISHER_ID`.

**What shipped this session** — three releases in one day, all now live:

| Version | Live on store | Contents |
|---|---|---|
| **0.4.7** | 2026-09-07 22:57 UTC | **FH-044** AI-slop splat unreachable when grouping folded a run · **FH-043** Mute keyed on the collapsed stub's own text, or on a reshare's *reactor*, and could be lost to a write debounce · grouping toggle back on the options page · serialized slop verdicts (§7) |
| **0.4.8** | 2026-09-08 03:24 UTC | **FH-045** the house style guide `claudisms.json` scored as evidence of AI authorship, em dash counted twice (one em dash: p=0.168 → 0.786) · **FH-046** `targetFrac` was a quota, so a clean feed still lost ~28% — now a ceiling · **FH-047** group rows capped at 8 · thin-feed top-up · **FH-048** store-cancel step no longer skips silently |
| **0.4.9** | 2026-09-08 04:25 UTC | **FH-049** posts re-judged on every LinkedIn re-render — 300 decisions from 13 posts, one 42× in 63s — flooding the calibration population and training buffer, so the model grew more aggressive the longer it ran; identity is now the activity URN with a verdict ledger, and user choices survive a re-render · **FH-050** LinkedIn furniture hidden as posts; 20+ words now required |

**What the store actually did**, now that all three have cleared review: every upload went into
a **free slot** and published within hours (0.4.7 ~4h, 0.4.8 ~2h, 0.4.9 ~20min). The
cancel-submission step has therefore **never once been needed**, and `cancelSubmission` has
**never been called** against Google's API — it remains unexercised, not proven working. Do not
describe it as working until a run shows an HTTP response from it.

**Two method lessons, both earned the hard way this session** (see `best_practices.md`):

- **§44/§45 — never record a prediction as an outcome.** It happened *three* times: the 0.4.7
  upload was written up as failing `ITEM_NOT_UPDATABLE` before it succeeded; 0.4.9 was written up
  as "replacing 0.4.8 in the review queue" when nothing was withdrawn; and 0.4.8 carried the same
  claim about 0.4.7. Each needed its own correction PR (#62, #70, #71). Read the log, then write.
- **§49 — ask for the artifact before theorising.** Two full rounds of scoring fixes (0.4.8) were
  validated against a corpus written by the person fixing the bug, which by construction scanned
  each post once and therefore *could not exhibit* the real defect. The maintainer's exported
  decision log found it in minutes. Those rounds were not wasted — FH-045/046/047 are real — but
  they were not the cause.

**PRs merged this session:** #63–#71 (fixes, guards, records). Every bug closed the loop: fix →
regression test at the tier that catches it → `KNOWN_ISSUES.md` row with a **Found by**
attribution → a numbered rule in `best_practices.md` where the class was general
(FH-043 … FH-050; §36–§49).

### Standing items that outlived this session

- **Windows sideload users must re-install once** — FH-042 / `KNOWN_ISSUES.md`. The 0.4.5 updater
  cannot deliver its own fix, so an affected user has to re-run `installer\install.bat` from a
  current `feedhacker-<version>-win.zip`. Still open.
- **0.4.6's store fate was never established** — no publish email and no rejection, yet the slot
  was free for 0.4.7. Superseded three times over now; don't spend time reconstructing it.
- **No AI reviewer runs on this repo.** CodeRabbit was removed from every repo except `max3` and
  `netsniff` (2026-07-29). **Green CI is the merge gate**; review is self-review against
  `best_practices.md` *before* pushing. Don't recreate `.coderabbit.yaml`, don't invoke
  `@coderabbitai` (paid quota), don't wait on a bot comment. See `REVIEWERS_STATUS.md`.
- **The `msi` job is best-effort** and fails on the WiX gate every release. It never blocks.

## Historical — state as of 2026-07-29 (post-0.4.6 ship)

> Superseded by the 2026-09-08 block above: 0.4.7/0.4.8/0.4.9 have all since published and the
> submission slot is OPEN. Kept for the 0.4.6 background only — do not read its "BLOCKED" and
> "latest release" lines as current.

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
