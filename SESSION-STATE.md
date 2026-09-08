# FeedHacker — session state

**This file is the handoff between sessions.** A session has no memory of the last one; this
file *is* that memory. Two rules make it work, and both are standing rules in
[`CLAUDE.md`](CLAUDE.md):

> **Every session STARTS here** — read this file top to bottom, then run the Startup checklist.
> **Every session ENDS here** — before signing off, run the Close-out checklist below.

Companion records: [`RELEASES.md`](RELEASES.md) (per-version ship record) ·
[`CHANGELOG.md`](CHANGELOG.md) (what changed) · [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md) (bugs and
their fixes) · [`best_practices.md`](best_practices.md) (the coding standard) ·
[`TEST_MATRIX.md`](TEST_MATRIX.md) (what a change obliges you to run).

---

## 1. Open items — READ FIRST

The single list of what is still outstanding. Nothing else in this file is a to-do; if it is not
here, it is not open. Close an item by deleting its row and saying so in the Session log.

| # | Open item | Who | Detail |
|---|---|---|---|
| 1 | **Verify the AI-slop fix on a real feed** | maintainer | FH-049 (0.4.9) has still never been measured against a live feed — the two logs sent so far were byte-identical exports of the *same* pre-0.4.9 build. Turn solo off, browse, **Reset AI-slop learning**, then **Export log (JSON)**. Check `version` reads ≥ `0.5.0` before sending. **Decisions should ≈ distinct posts** (it was 300 from 13). If it is still lopsided, the activity-URN lookup is not finding LinkedIn's post ids and the markup needs inspecting. |
| 2 | **0.5.0 is in Google review, not live** | maintainer / next session | Submitted 2026-09-08 20:39 UTC. Confirm with the "Item successfully published" email for **Version 0.5.0**, then mark it ✅ Live in `RELEASES.md`. Until then the slot is **BLOCKED** — a further store upload would fail `ITEM_NOT_UPDATABLE`. |
| 3 | **`CWS_PUBLISHER_ID` is invisible to GitHub Actions** | maintainer | Present in neither tab as far as the workflow can see, so `cancelSubmission` **has never once been called**. Likely the wrong *page*: Settings → Secrets and variables → **Actions** is separate from **Codespaces** and **Dependabot**. Repository (not environment) scope, named exactly `CWS_PUBLISHER_ID`. Only matters when a version is actually stuck in review — every upload so far has gone into a free slot. |
| 4 | **Windows sideload users must re-install once** | maintainer | FH-042. The 0.4.5 updater cannot deliver its own fix, so an affected user re-runs `installer\install.bat` from a current `feedhacker-<version>-win.zip`. |
| 5 | **New-install default is unconfirmed** | maintainer | Shipped as: AI-slop filtering on, every other filter and solo off (today's defaults). The maintainer's phrasing — "neither mute or solo should be on … only the default AI algorithm" — could also mean a new install should filter **nothing** until opted in. One line (`defaultMute` on `sloppy`) if that is what was meant. |

## 2. Current state

| | |
|---|---|
| **Latest version** | **0.5.0** — shipped 2026-09-08 (tag `v0.5.0`, GitHub Release, store upload **submitted for review**) |
| **Store item** | `kccajfoghkplakndamlohpepopdpelkb` |
| **Confirmed live on the store** | 0.4.9 (published 2026-09-08 04:25 UTC) — 0.5.0 is submitted, not yet live |
| **Submission slot** | **BLOCKED** until 0.5.0 clears review |
| **Dev branch** | the harness assigns a per-session `claude/*` branch; reset it from `origin/main` for each change |
| **Review** | no AI reviewer runs on this repo — **green CI is the merge gate** (`REVIEWERS_STATUS.md`) |

## 3. Startup checklist (run every new session)

1. **Read this file** — §1 Open items, then §2 Current state, then §6 Key facts.
2. **Skim the record** — `RELEASES.md`, then the top of `CHANGELOG.md`.
3. **Check what is LIVE on the Chrome Web Store.** Gmail:
   `from:chromewebstore-noreply@google.com newer_than:14d` — the **Version** field of the newest
   "Item successfully published" email is what users are running. Update `RELEASES.md` if it has
   moved since the last session wrote it down.
4. **Check the submission slot.** The store accepts **one pending version at a time**. It is OPEN
   when the newest email is a published/rejected decision for the latest submitted version;
   **BLOCKED** if a version was uploaded and has no decision yet (a new upload then fails
   `ITEM_NOT_UPDATABLE`). GitHub releases are never blocked — only the store upload.
5. **Report and ask.** Summarize what is done and planned for the next release, then ask:
   **ship now, or keep developing?** Never release without an explicit "ship"/"push".

## 4. Close-out checklist (run before ending every session)

The next session starts from what you leave here. Leaving it stale is the whole failure mode.

1. **Update §1 Open items** — delete what closed, add what is newly outstanding, and say who
   each item is waiting on. This is the highest-value thing you will write.
2. **Update §2 Current state** — version, what is confirmed live, dev cycle.
3. **Add a §5 Session log entry** — newest first: the date, what shipped or merged, what was
   diagnosed, and anything a future session would otherwise have to rediscover.
4. **Record outcomes, never predictions** (§44/§45). If you said a workflow or an external
   service would do something, **read its log and write what it actually did.** This has been
   got wrong four times; each needed its own correction PR.
5. **Fold durable lessons outward** — a bug class into `best_practices.md`, a bug into
   `KNOWN_ISSUES.md`, a shipped version into `RELEASES.md`. This file holds *state*, not lessons.
6. **Leave the tree clean** — everything merged to `main` with green CI, or explicitly noted here
   as unfinished with the branch name.

## 5. Session log

Newest first. One entry per session; keep entries short and factual.

### 2026-09-08 — "it hides everything", three releases, and the solo-mode red herring

- **Shipped 0.4.7, 0.4.8, 0.4.9 and 0.5.0**, all four on explicit maintainer instruction.
  0.4.7/0.4.8/0.4.9 confirmed published on the store (22:57, 03:24 and 04:25 UTC); 0.5.0
  **submitted for review** at 20:39 UTC (Release run #23, `Publish successful`) — not yet live.
  The store-cancel step ran and warned `CWS_PUBLISHER_ID is empty` for the **fourth** release
  running, so `cancelSubmission` has still never been called; every upload has gone into a free
  slot instead.
- **Fixed FH-043 … FH-051** — see `KNOWN_ISSUES.md`. The arc: Mute keyed on the wrong author →
  the AI-slop splat unreachable on folded runs → the house style guide scored as evidence of AI
  authorship → the hidden share was a quota rather than a judgement → posts re-judged on every
  LinkedIn re-render (300 decisions from 13 posts) → LinkedIn furniture hidden as posts.
- **The last report was not the AI at all.** "Still hiding nearly 100%" was **solo mode**:
  `"Filtered out"` occurs at exactly one place in the source, and that branch returns before the
  scorer is consulted. Two sessions of scoring work had been aimed at a symptom that had nothing
  to do with scoring. Codified as §51 — grep the strings in a screenshot before reading the model.
- **Added** Unmute all authors, Factory reset, and guards that an upgrade preserves settings.
- **`best_practices.md` §36–§52** written this session; `TEST_MATRIX.md` gained rows for
  destructive controls, install/upgrade, and solo/mute.
- **Method failures worth not repeating:** a store outcome recorded as fact before reading the
  log (three times, corrected in #62, #70, #71); two rounds of scoring fixes validated against a
  corpus written by the person fixing the bug, which by construction could not exhibit the defect
  (§49); and a user-supplied log accepted without checking its `version` field — it was the same
  pre-fix export twice (§49 again).

## 6. Key facts & gotchas (so a new session doesn't relearn them)

- **Ship only on explicit "ship"/"push."** Otherwise keep developing, commit/merge PRs freely
  (green CI), accumulate under the next version.
- **Release mechanism:** run the **Release** workflow via `workflow_dispatch` with `publish: true`
  from `main` (the sandbox token can't push tags, so the workflow tags `v<manifest version>`
  itself, cuts the GitHub Release, and uploads to the store).
- **Designated dev branch:** the session harness assigns a per-session `claude/*` branch. Its PRs
  keep getting merged, so reset the branch from `origin/main` for each new change; force-with-lease
  is fine (it only ever carries already-merged history).
- **Store rejects a new upload while one is in review** (`ITEM_NOT_UPDATABLE`). Don't try to ship
  a new store version until the pending one clears.
- **Installer scripts must be pure ASCII.** Windows PowerShell 5.1 reads a UTF-8-no-BOM `.ps1` as
  Windows-1252, so an em-dash breaks parsing. `test/unit/installer.test.js` guards this.
- **Sideload-only build bits:** the `nativeMessaging` permission + a fixed manifest `key` are
  injected **only** into the sideload builds by `scripts/build.mjs`; the Chrome Web Store zip stays
  minimal (`["storage"]`, no key). A manifest test guards it.
- **MSI job** is best-effort (`continue-on-error`) and often fails — never blocks the release.
- **A user's exported log is only evidence of the build that produced it.** Check its `version`
  field before drawing any conclusion from it.

---

## Archive

Older state, kept for background only. **Nothing below is current** — §1 and §2 above are.

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
