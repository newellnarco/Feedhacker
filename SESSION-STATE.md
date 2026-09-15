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
| 1 | **Verify the AI-slop fix on a real feed — the decision log, over time** | maintainer | FH-049. **Partly answered 2026-09-15**: the maintainer's live home-feed DOM capture (42 posts, FeedHacker running) shows **42 posts → 42 distinct `data-feedhacker-key` values, zero duplicates**, so identity is holding *in a single snapshot*. That is not the 300-decisions-from-13-posts measurement, which is a **time series** — only an exported decision log can show a post being re-judged across re-renders. Still wanted: turn solo off, browse, **Reset AI-slop learning**, then **Export log (JSON)**; check `version` reads the installed build before sending. **Decisions should ≈ distinct posts.** The old "if lopsided, the URN lookup is failing" hypothesis is now **settled and can be dropped** — see item 2. **Read this before running it:** the **Reset AI-slop learning** button in that procedure was itself broken until 0.6.0 (**FH-054**) — it cleared the model's weights but kept the training data, observations and self-tuned threshold, so the model rebuilt itself within a scan or two. Any export taken after a pre-0.6.0 reset was measuring a model that had quietly restored itself, and is not evidence either way. Run this on **0.6.0 or later**. |
| 2 | **LinkedIn no longer exposes the activity URN — post identity now rests on the text hash alone** | next session (informational) | Settled 2026-09-15 by inspecting two live home-feed captures: there is **no `data-urn`, no `data-id` and no `role="article"` anywhere on the page**, and `postKey()` fell back to `textHash` for **42 of 42** posts. The id is still recoverable, but only sparsely — 3 posts carried a `/feed/update/urn:li:…` permalink and 5 a `replaceableComment_urn:li:comment:(activity:<postid>,…)` componentkey. **Deliberately not harvested**: the permalink route can pick up the *original* post's id inside a reshare and collide two feed entries onto one verdict, which is worse than the hash. Revisit only if the decision log in item 1 shows identity actually slipping. |
| 3 | **`CWS_PUBLISHER_ID` added — unverified** | next session (passive) | The maintainer added it on 2026-09-08 after it was confirmed absent from both Actions tabs. **Not yet proven working:** no session tool can read repository variables or secret names, so the only evidence will be the next release's `webstore` job log. Expect the env line to show a value (or `***` if it went in the Secrets tab) instead of `CWS_PUBLISHER_ID:` with nothing after it, and the cancel step to print `Cancelled the pending submission` or `No pending submission cancelled (HTTP 404)` — the 404 is normal and correct when nothing is in review — instead of the `::warning` it emitted on 0.4.7–0.5.0. **Nothing waits on this**: the step exists because the maintainer asked whether a pending version could be withdrawn and replaced, and every upload since has gone into a free slot anyway (turnaround 4h → 2h → 20min → 16min), so `cancelSubmission` has never had anything to cancel. Removing the step entirely is a reasonable alternative if it is not worth carrying. |
| 4 | **Windows sideload users must re-install once** | maintainer (now partly self-serving) | FH-042. The 0.4.5 updater cannot deliver its own fix, so an affected user must re-run `installer\install.bat` from a current `feedhacker-<version>-win.zip`. **0.6.0 ships a release note saying exactly this** (`CHANGELOG.md`, which `store/README.md` makes the source of the store's release notes), so anyone who reads the notes is told. It stays open because the people who most need it are precisely the ones **not receiving updates** — a note in a release they never get cannot reach them. Closing it needs a channel they still see (the repo README / releases page, or a direct message), not another release note. |

## 2. Current state

| | |
|---|---|
| **Latest version** | **0.5.0** — shipped and **LIVE** 2026-09-08 (tag `v0.5.0`, GitHub Release, store published 20:55 UTC) |
| **Dev cycle** | **0.6.0 open** — `manifest.json` / `package.json` / `package-lock.json` bumped, `CHANGELOG.md` has a `[0.6.0] — unreleased` section. Nothing tagged; **do not release without an explicit "ship"** |
| **Store item** | `kccajfoghkplakndamlohpepopdpelkb` |
| **Confirmed live on the store** | **0.5.0** — confirmed 2026-09-15 by reading the **store listing** ("Version 0.5.0, Updated September 8, 2026"). **Not** by email: no publish email for 0.5.0 exists, and the 20:55:30 UTC timestamp this file used to cite was inferred. See the 0.5.0 row in `RELEASES.md`. |
| **How to check what is live** | **Read the store listing**, not the inbox: `https://chromewebstore.google.com/detail/feedhacker/kccajfoghkplakndamlohpepopdpelkb`. This item has now published **silently, with no email, twice** (0.4.6 and 0.5.0), so an absent email means nothing either way. |
| **Submission slot** | **OPEN** — nothing pending review |
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

### 2026-09-15 (later) — the maintainer's reset spec, and the button that was lying

Same session as the entry below; kept separate because it came from an explicit behaviour spec
rather than from the captures.

- **The maintainer specified what each reset must do.** Checked each clause against the code
  rather than assuming:

  | Clause | Was it already true? |
  |---|---|
  | Fresh install: AI-slop on, no other mute, nothing soloed | **Yes** — `buildDefaults()`, already tested |
  | Upgrade leaves existing settings alone | **Yes** — `onInstalled` writes nothing, already tested |
  | Factory reset: everything gone, back to AI-only, no muted users | **Yes** — `LOCAL_KEYS` + `sync.clear()` + `buildDefaults()` |
  | Reset AI: wipe learned data, restore the shipped algorithm, **keep** mute/solo | **NO — this was broken** |

  So **open item 5 closes as confirmed, not changed** — three of the four clauses were already
  the shipped behaviour. They now have tests pinning the exact shape, which they did not before.
- **Fixed FH-054 — "Reset AI-slop learning" did not reset the AI.** It removed `WEIGHTS_KEY`
  alone. The training buffer, the observation pool, the calibration record and the tuned
  `slopThreshold` in sync all survived, so auto-calibration rebuilt the same model from the
  leftovers within a scan or two. The code's own comment on "clear log" already claimed this
  button would "wipe the model itself".
  **This one bites item 1**: that procedure says *reset, then export the decision log*. Any
  export taken after a pre-0.6.0 reset measured a model that had quietly restored itself, so it
  is not evidence either way. Item 1 now says to run it on 0.6.0 or later.
- **Fixed FH-053 — LinkedIn's feed modules were being treated as posts.** Closes open item 6.
  The guard needs **both** a known module heading and the absence of a per-post overflow
  control, and fails CLOSED: mistaking a post for a module would silently exempt it from
  filtering, whereas missing a module only keeps today's behaviour. Validated on the live
  captures — 1 of 8 and 2 of 42 containers flagged, exactly the modules present, no false
  positives on the other 40.
- **Item 4 now ships a release note.** 0.6.0's CHANGELOG (which `store/README.md` makes the
  source of the store's release notes) tells hand-installed Windows users on ≤0.4.5 to re-run
  `installer\install.bat`, and says plainly that Chrome Web Store users are unaffected. The item
  stays **open** on purpose: the people who need it are the ones **not receiving updates**, so a
  note in a release they never get cannot reach them.
- **Two of my own test bugs, caught by mutation-testing rather than by the suite going green.**
  Worth recording because both would have shipped as false green: (1) a single-marker test
  document makes `postContainerFor()` walk to the document root, so three cases were asserting
  against `<html>` rather than the post — every test file here must keep **two or more** markers
  on the page; (2) a muted-author case used the display name as the mute key when `keyFor()`
  builds `/in/slug`, so it passed without the fix. Both now fail correctly when the fix is
  removed. Codified as **§54**.

### 2026-09-15 — a dead session, two live DOM captures, and a watchdog that had quietly died

- **Context: this session was asked to pick up a sibling session's work.** `Feedhacker LinkedIn
  bug` (`session_01CtWmAPZukKJt83QZNhkNVr`) ran ~9 minutes and **failed with "Prompt is too
  long"**. It never committed or pushed; its branch `claude/loving-cannon-hn62q0` does not exist
  on the remote and its transcript is not readable from another session. **Its diagnosis is
  unrecoverable** — treat a sibling session's findings as lost unless they are on a branch.
- **The maintainer supplied two live home-feed DOM captures** (one without FeedHacker, one with).
  Those are the first real-markup artifacts this project has had, and they settled three things
  that three prior sessions could only theorise about.
- **"The feed is empty" was NOT the filter — again (§51, third time).** The with-FeedHacker
  capture: **42 posts, all 42 hidden** — **23** by `Solo mode: showing only Hiring posts` and
  **19** by muted authors. Only **one** post in the whole capture classifies as hiring, and its
  author (Richard King) is **himself muted**, so solo=Hiring had literally nothing left to show.
  Working as designed; the 0.5.0 exit UX was rendering correctly (3 group rows, each naming solo
  mode and carrying **Show everything**). No code defect.
- **Fixed FH-052 — the "selectors are out of date" alarm had been dead since LinkedIn's
  redesign.** `heartbeatBreak()` only fires on `markers === 0 && content > 0`, and `contentCount()`
  looked for `role="article"` / `data-urn` / `data-id`. LinkedIn's current feed ships **none of
  them**: **zero matches against 8 and 42 visible posts.** So `content` was pinned at 0, the alarm
  could never fire, and the one mechanism that would tell us our marker had gone stale was itself
  broken — silently, with nothing red. Fixed additively by also counting LinkedIn's per-post
  overflow control (`[aria-label^="Open control menu for post"]`, 7/8 and 40/42). Codified as
  **§53**: a watchdog needs a fixture cut from the real product, because its own tests built the
  `role="article"` markup they tested against and so could never exhibit the bug (§49).
- **Post identity: question closed.** Item 1 used to hypothesise that a lopsided decision count
  meant "the activity-URN lookup is not finding LinkedIn's post ids". Confirmed, and it is not
  fixable the obvious way: **LinkedIn no longer puts the URN on the post container at all**
  (42/42 posts fell back to `textHash`). Harvesting it from reshare permalinks was considered and
  **rejected** — a reshare embeds the *original* post's permalink, so it would collide two feed
  entries onto one verdict. Recorded as open item 2.
- **Encouraging, but not proof:** those 42 posts produced **42 distinct keys, zero duplicates**.
  That is one snapshot, not the time series FH-049 was diagnosed from, so item 1 stays open —
  narrowed to "export the decision log".
- **New finding, not fixed:** LinkedIn furniture ("Who's viewed your profile", "Jobs recommended
  for you") still enters the scan as posts. FH-050 gated only the AI-slop path behind a 20-word
  prose minimum; solo and mute have no such gate. Open item 6.
- **PR [#79](https://github.com/newellnarco/Feedhacker/pull/79) is still open from 2026-09-09** and
  its version-bump half is now duplicated by this session's 0.6.0 bump. It can be closed, or
  merged first and this branch rebased. Flagged to the maintainer; not actioned unilaterally.

### 2026-09-08 — "it hides everything", three releases, and the solo-mode red herring

- **Shipped 0.4.7, 0.4.8, 0.4.9 and 0.5.0**, all four on explicit maintainer instruction.
  0.4.7/0.4.8/0.4.9 confirmed published on the store (22:57, 03:24 and 04:25 UTC); 0.5.0
  **published 20:55:30 UTC**, 16 minutes after upload (Release run #23) — so all four versions
  shipped this session are live.
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
- **All four shipped versions are live on the store** — 0.4.7 (22:57), 0.4.8 (03:24), 0.4.9
  (04:25) and 0.5.0 (20:55 UTC). Review turnaround ran 4h → 2h → 20min → 16min, so every upload
  went into a free slot and the cancel step has never once been needed. The reason it never ran
  was finally pinned down at the end of the session: `CWS_PUBLISHER_ID` was never added to the
  repository at all — Actions → Secrets holds only the three OAuth credentials and Actions →
  Variables only `CWS_AUTO_PUBLISH` — so no amount of tab- or scope-hunting would have found it.
  Three sessions theorised about *where* it was; nobody checked *whether* it was there (§51 again:
  look at the thing before reasoning about it).
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
