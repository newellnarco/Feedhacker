# FeedHacker — release record

A running record of **what shipped in each version and where it stands**. Two pipelines run
at different speeds, so they're tracked separately:

- **GitHub Release** — cut immediately by the Release workflow (tag → GitHub Release with
  the prebuilt `feedhacker-<version>.zip` / `-win.zip` assets).
- **Chrome Web Store** — the CI `webstore` job uploads the same version, but Google **reviews**
  it before it goes live, and the store only accepts **one** pending version at a time. So the
  store always lags GitHub, and an upload can be *blocked* while a prior version is in review.

> **Maintenance rule:** only mark a version **✅ Live** in the *Store status* column once it is
> **actually confirmed published on the Chrome Web Store** (Google approved + rolled out) — not
> when it was merely uploaded or submitted. Update this file whenever a version's store state
> changes. Full change lists live in [`CHANGELOG.md`](CHANGELOG.md).

**Chrome Web Store item:** `kccajfoghkplakndamlohpepopdpelkb`
(the listing was moved to this item as of v0.3.0; earlier versions were on the previous item
`djfbniehjjngpkimngegnjdeamfofnoa`.)

## Status board

| Version | GitHub Release | Store status | Store submitted | Notes |
|---|---|---|---|---|
| 0.2.0 | ✅ Released (2026-07-06) | ◻︎ prior item | 2026-07-06 | Last version on the old item `djfbnie…`. |
| 0.3.0 | ✅ Released (2026-07-07) | ⏳ Submitted → review | 2026-07-07 | First upload to the **new** item; auto-published (submitted for review). |
| 0.4.0 | ✅ Released (2026-07-07) | ✅ **Live** (published 2026-07-08) | 2026-07-07 | Confirmed live — Google "Item successfully published" email, Version 0.4.0, 2026-07-08 10:33 UTC. |
| 0.4.1 | ✅ Released (2026-07-07) | ◻︎ Skipped on store | — | Store upload was blocked (`ITEM_NOT_UPDATABLE`); superseded by 0.4.2. Installer ASCII fix lives on the GitHub download. |
| 0.4.2 | ✅ Released (2026-07-08) | ✅ **Live** (published 2026-07-08) | 2026-07-08 | Confirmed live — Google "Item successfully published" email, Version 0.4.2, 2026-07-08 21:57 UTC. Cumulative: everything since 0.4.0. |
| 0.4.3 | ✅ Released (2026-07-09) | ✅ **Live** (published 2026-07-09) | 2026-07-09 | Confirmed live on the store. Context-invalidation teardown + smaller page footprint (bundled banlist, no web-accessible resources). |
| 0.4.4 | ✅ Released (2026-07-09) | ✅ **Live** (published 2026-07-09) | 2026-07-09 | Confirmed live — Google "Item successfully published" email, Version 0.4.4, 2026-07-09 20:56 UTC. Autonomous AI-slop self-calibration (living model), Aggression slider that sticks, curated grouping, click-safe re-apply, observation reaping, accurate in-app docs. (Best-effort `msi` job failed — WiX v7 OSMF EULA gate; `-win.zip` installer unaffected.) |
| 0.4.5 | ✅ Released (2026-07-21) | ✅ **Live** (published 2026-07-21) | 2026-07-21 | Confirmed live — Google "Item successfully published" email, Version 0.4.5, 2026-07-21 18:54 UTC. In-place "Update now" for Chrome Web Store installs (no restart), welcome-page puzzle icon matches Chrome, popup help moved behind a "?" button, Aggression slider label simplified, heartbeat paging false-alarm fix, Advanced removal, scalable `Fh` logo SVG. Plus MAX3/netsniff engineering-discipline adoption (CodeRabbit config, best_practices §19–29, ledger, test matrix). (Best-effort `msi` job failed — WiX gate; `-win.zip` installer unaffected.) |
| 0.4.6 | ✅ Released (2026-07-29) — tag `v0.4.6` @ `92ff8f9` | ⏳ Submitted → review (2026-07-29) | 2026-07-29 | **Shipped via the Release workflow** (`publish: true`): tag → GitHub Release with all four prebuilt zips → store upload. The `webstore` job uploaded `feedhacker-0.4.6-store.zip` with `CWS_AUTO_PUBLISH=true` — log reads "Publishing… / Publish successful", i.e. **submitted for Google review**. **Store fate unknown — treat 0.4.6 as never confirmed live.** No "Item successfully published" email for 0.4.6 ever arrived (the newest publish email is still Version 0.4.5, 2026-07-21) and no rejection email arrived either, yet the store **accepted the 0.4.7 upload on 2026-09-07**, so the pending 0.4.6 submission was no longer holding the slot by then. Whether it published silently, was withdrawn, or was superseded is not established from the evidence we have; 0.4.7 supersedes it either way. Contents: the `Fh` element-mark branding (finally reaching installs), the **Windows auto-update fix** (the updater was selecting the manifest-less `-store-submission.zip`), the installer's honest scheduled-task reporting, and the icon/updater regression guards. ⚠️ **Existing Windows sideload installs need a manual re-install** — see the note below. (Best-effort `msi` job failed again on the WiX gate; never blocks.) |
| 0.4.7 | ✅ Released (2026-09-07) — tag `v0.4.7` @ `f81446e` | ✅ **Live** (published 2026-09-07) | 2026-09-07 | **Shipped via the Release workflow** (`publish: true`) on the maintainer's explicit "ship it": tag → GitHub Release with all four prebuilt zips → store upload. The `webstore` job uploaded `feedhacker-0.4.7-store.zip` with `CWS_AUTO_PUBLISH=true` — log reads "Uploading… / Publishing… / Publish successful", i.e. **submitted for Google review**. **Confirmed live** — Google "Item successfully published" email, Version 0.4.7, 2026-09-07 22:57 UTC. **The slot turned out to be OPEN** — see the 0.4.6 row; the upload was predicted to fail `ITEM_NOT_UPDATABLE` and did not. Contents: the AI-slop splat was unreachable whenever grouping folded a run (FH-044), **Mute** keyed on the collapsed stub's own text or on a reshare's *reactor* and could be lost to a write debounce (FH-043), the grouping toggle is back on the options page, and slop verdicts are serialized (§7). (Best-effort `msi` job failed again on the WiX gate; never blocks.) |
| 0.4.8 | ✅ Released (2026-09-08) — tag `v0.4.8` @ `2ef8e4d` | ✅ **Live** (published 2026-09-08) | 2026-09-08 | **Shipped on the maintainer's explicit "ship it"** into a free slot — 0.4.7 had already published (2026-09-07 22:57 UTC), so nothing was displaced. **The new cancel-pending-submission step did NOT run** — it was `skipped`, because `CWS_PUBLISHER_ID` resolved **empty** in the `webstore` job (log line: `CWS_PUBLISHER_ID:` with no value), so its `if:` guard was false. The upload succeeded anyway (`Uploading feedhacker-0.4.8-store.zip… / Publishing… / Publish successful`), i.e. the slot was free — the same thing that happened with 0.4.7 over 0.4.6. The step remains **unexercised against Google's API**. Fixed in FH-048: the id is now read from either the Variables or the Secrets tab, and a missing id emits a workflow warning instead of vanishing. Contents: the **over-hiding fix** — the house style guide (`claudisms.json`) was being scored as evidence of AI authorship and the em dash was counted twice, so ordinary human posts were hidden (**FH-045**); the hidden share was a **quota** rather than a judgement, so a clean feed still lost ~28% (**FH-046**); grouping capped at 8 posts per summary row (**FH-047**); the feed tops itself up when filtering leaves it thin. Also carries everything from 0.4.7 (the unreachable AI-slop splat, Mute keying on the wrong author, the options-page grouping toggle, serialized slop verdicts). **Confirmed live** — Google "Item successfully published" email, Version 0.4.8, 2026-09-08 03:24 UTC. |
| 0.4.9 | ✅ Released (2026-09-08) — tag `v0.4.9` @ `4541396` | ✅ **Live** (published 2026-09-08) | 2026-09-08 | **Shipped on the maintainer's explicit "push it"**. The `webstore` job log: `Uploading feedhacker-0.4.9-store.zip… / Publishing… / Publish successful` — submitted for Google review, and **published 20 minutes later**. **The cancel step ran but took no action**: it emitted `##[warning]CWS_PUBLISHER_ID is empty, so a version already in review was NOT withdrawn`. The PR #66 fix worked — the step is no longer silently `skipped`, it now says what it did — but the publisher id is still invisible to Actions in **both** the Variables and Secrets tabs, so `cancelSubmission` **has still never been called**. The upload succeeded anyway, as it did for 0.4.7 and 0.4.8: the slot was free. **The fix the exported decision log finally identified:** posts were re-judged on every LinkedIn re-render (**FH-049** — 300 decisions from 13 distinct posts in 11 minutes; one post 42 times in 63 seconds), which flooded the calibration population and the training buffer and made the model more aggressive the longer it ran. Identity is now the activity URN (else a text hash) with a verdict ledger. Also **FH-050**: LinkedIn furniture ("Jobs recommended for you", an emoji strip, a profile headline) was being hidden as posts — 20+ words are now required before anything is hidden as slop. Carries everything from 0.4.7/0.4.8. **Confirmed live** — Google "Item successfully published" email, Version 0.4.9, 2026-09-08 04:25 UTC, roughly 20 minutes after upload. ⚠️ **Still unverified on a real feed** — the fix is proven in tests only; the decisive check is a fresh log export where decisions ≈ distinct posts (was 23:1). Users on a poisoned model should **Reset AI-slop learning** once. |
| 0.5.0 | ✅ Released (2026-09-08) — tag `v0.5.0` | ✅ **Live** (published 2026-09-08) | 2026-09-08 | **Shipped on the maintainer's explicit "ship it".** Contents: **FH-051** — *solo mode* emptied the feed with nothing on screen saying so. Reported as the AI-slop filter "still hiding nearly 100% of all posts", with a screenshot of stacked `8 posts hidden · Filtered out ×8` rows — but the scorer was never involved: `"Filtered out"` occurs at exactly one place in the source, the solo branch, which short-circuits **before** the slop model is consulted. Solo shows only the soloed kinds and hides the rest, so one green `S` in the popup empties a normal feed, and the only exit was knowing to reopen the popup. Stubs now read `"Solo mode: showing only <kinds>"` and both the stub **and the grouped summary row** (all a filtered feed renders) carry a **Show everything** control. Also **Unmute all authors** and a **Factory reset** (Authors + Error log panels) that clears every persisted key and restores the shipped defaults, plus guards locking in that an upgrade preserves settings and a new install gets the defaults. 238 unit+integration, 21 system. **Release run #23** (`workflow_dispatch`, `publish: true`, conclusion **success**): tag `v0.5.0` → GitHub Release with all four prebuilt zips → store upload. `webstore` job log: `Uploading feedhacker-0.5.0-store.zip… / Publishing… / Publish successful` — submitted for Google review, and **published 16 minutes later**. The cancel step ran and reported its own inaction for the **fourth** release running: `##[warning]CWS_PUBLISHER_ID is empty, so a version already in review was NOT withdrawn` — so `cancelSubmission` **has still never been called**. It did not matter: the slot was free (0.4.9 published 04:25 UTC). The best-effort `msi` job failed on the WiX gate as it does every release and blocked nothing. **Confirmed live — but NOT by the evidence this row used to cite** (corrected 2026-09-15). The store listing itself reads **Version 0.5.0, Updated September 8, 2026**, which is what establishes it. There is **no** "Item successfully published" email for 0.5.0 — across every message this account has ever had from `chromewebstore-noreply@google.com`, the newest publish email is still **Version 0.4.9, 2026-09-08 04:25 UTC**. The "20:55:30 UTC, 16 minutes after upload" citation was never real: the `webstore` job finished at **20:39:05 UTC**, and the rest was inferred. This is the **0.4.6 silent-publish pattern again** — this item publishes without always emailing — and the fifth time a store outcome was written down ahead of its evidence (§44/§45). **Check the listing, not the inbox.** |
| 0.6.0 | ✅ Released (2026-09-15) — tag `v0.6.0` @ `382ba04` | ✅ **Live** (confirmed 2026-09-15 19:04 UTC) | 2026-09-15 | **Shipped on the maintainer's explicit "ship it".** Slot confirmed **OPEN** before dispatch by reading the **store listing** (0.5.0, updated 2026-09-08), not the inbox — see the 0.5.0 row. **Release run #24** (`workflow_dispatch`, `publish: true`): `build` ✅, `webstore` ✅, `release` ✅, best-effort `msi` ❌ on the WiX gate as every release (blocks nothing). GitHub Release **published 18:11:27 UTC** with all four prebuilt zips. `webstore` job log: `Uploading feedhacker-0.6.0-store.zip… / Publishing… / Publish successful` at **18:10:48 UTC** — that means **submitted for Google review, NOT approved**. ⚠️ **Do not mark this Live until the store listing itself shows 0.6.0.** **NEW — the cancel step finally reached Google's API, and was refused.** `CWS_PUBLISHER_ID` is no longer empty: it resolved to `project-46303a79-fd20-4ed8-859`, so after five releases of warning it is **visible to Actions at last**. But `cancelSubmission` returned **HTTP 403 `PERMISSION_DENIED`** — *"Permission denied on resource 'publishers/project-46303a79-fd20-4ed8-859/items/kccajfoghkplakndamlohpepopdpelkb' (or it might not exist)."* That value has the shape of a **Google Cloud project id**, not a Chrome Web Store **publisher** id, which is the likely cause. It did not matter here — the slot was free — but the step still cannot withdraw a pending submission (**FH-055**). The step also **mislabelled the refusal**: it printed *"No pending submission cancelled (HTTP 403). This is normal when nothing is in review"*, which is false — a 403 means the request was refused, not that the queue was empty. Contents: **FH-052** the selector-break heartbeat had been disarmed since LinkedIn's redesign; **FH-053** LinkedIn's own feed modules were scanned and hidden as posts; **FH-054** "Reset AI-slop learning" cleared only the weights so the model rebuilt itself; a release note for the ≤0.4.5 Windows sideload re-install (FH-042); and tests pinning the fresh-install / upgrade / factory-reset behaviour that was already correct. 258 unit+integration, 24 system.  **CONFIRMED LIVE 2026-09-15 19:04 UTC by reading the store listing** — it shows *“Version 0.6.0, Updated September 15, 2026”*. Submitted 18:10:48 UTC, so **published inside ~54 minutes**; the exact publish instant is not knowable from the listing and is deliberately not invented here. **CORRECTION (2026-09-15 20:18):** this row briefly claimed no publish email arrived and that 0.6.0 was a “third consecutive silent publish”. **That was wrong.** The email exists — Version 0.6.0, **2026-09-15 18:24:40 UTC**, so it actually published **~14 minutes** after upload, not the “within ~54 minutes” upper bound this row first carried (54 minutes was merely when it was looked at). The search that “proved” its absence was `from:chromewebstore-noreply@google.com newer_than:2d`, and **that message is in Trash, which Gmail excludes from search by default**. The real lesson is narrower than “this item publishes silently” and more useful: **an absent email may simply be an unsearched folder** — only `in:anywhere` makes “no email” mean anything, and even then the listing is the authority. |
| 0.7.0 | ✅ Released (2026-09-15) — tag `v0.7.0` @ `dabdfc1` | ✅ **Live** (published 2026-09-15 19:54:24 UTC) | 2026-09-15 | **Shipped on the maintainer's explicit “ship 0.7.0”** into a slot confirmed OPEN by the listing (0.6.0 live). **Release run #25**: `build` ✅, `webstore` ✅, `release` ✅, best-effort `msi` ❌ on the WiX gate as every release. GitHub Release **published 19:24:58 UTC** with all four prebuilt zips. `webstore` job log: `Uploading feedhacker-0.7.0-store.zip… / Publishing… / Publish successful` at **19:24:28 UTC** — **submitted for Google review, NOT approved**. ⚠️ **Do not mark Live until the store listing itself shows 0.7.0.** **FH-055 recurred, identically:** `CWS_PUBLISHER_ID` again resolved to `project-46303a79-fd20-4ed8-859` and `cancelSubmission` again returned **HTTP 403 `PERMISSION_DENIED`** on the same resource path — second occurrence, so it is reproducible and not a transient. The step again printed *“No pending submission cancelled (HTTP 403). This is normal when nothing is in review”*, which remains false for a 403. It cost nothing again: the slot was free. Contents: **FH-056** — an author mute outranked solo, so solo discarded the very posts it was asked to show (0 visible posts → 1 on the reporter's own capture). 261 unit+integration, 24 system.  **CONFIRMED LIVE** two ways, which is why the correction above was caught: the **store listing** reads *“Version 0.7.0, Updated September 15, 2026”* (read 20:18 UTC), and Google's **“Item successfully published” email for Version 0.7.0 is timestamped 2026-09-15 19:54:24 UTC** — **~30 minutes** after the 19:24:28 upload. |
| 0.9.1 | ⏳ Built, not yet released — `dist/feedhacker-0.9.1-store.zip` | ⏳ Not uploaded — bundle ready at `dist/store-upload/` | — | **Prepared for a MANUAL dashboard upload at the maintainer's request**, not via the Release workflow. Contents: **FH-063** (the interaction hold-off was armed from inside the click handler, so the first click in a while — the one a user notices — was unprotected; pointerdown and focusin now arm it, and a post whose own control has focus is left alone), **FH-064** (Insights renders the per-filter breakdown that `history[day].byId` has always stored and nothing ever displayed), and the **listing-graphics regeneration** below. **The image audit found more than the record claimed.** §1 item 1 named three images showing Solo; checking all ten found **four** wrong: `store/screenshot-1-mixer.png`, `docs/carousel/carousel-2-mixer.png` and `carousel-5-transparent.png` (Solo — and carousel-5 also showed **version 0.4.7** and the extension id of the **old** store item `bbfikimnhcdpgdebiipjbmagbklpbkde`), plus `carousel-3-group.png`, which showed a group row reading “Promoted ×1, AI Slop ×2, Hiring ×1” — a mixed row **FH-061 made impossible in 0.9.0**. Also found: the store description omitted **Company / brand posts**, one of the nine shipped filters, and `options.html` still carried a paragraph explaining Solo's removal. **All four images are regenerated from the BUILT STORE PACKAGE** by the new `npm run store:shots`, which extracts `dist/feedhacker-<v>-store.zip` rather than loading `dist/feedhacker/` — the unpacked tree is the *sideload* build, and screenshotting it had put “Permissions: storage, nativeMessaging” in a listing image directly beside the claim “only permission: storage”. 314 unit+integration, 36 system. |
| 0.9.0 | ✅ Released (2026-09-17) — tag `v0.9.0` @ `f56d393`, GitHub Release published **22:09:24 UTC** | ✅ **Live** — confirmed 2026-09-17 from the **store listing** (“Version 0.9.0, Updated 17 September 2026”, read via `?hl=en-SG`). Review cleared in ~30 minutes, the fastest of the last four | 2026-09-17 | **Shipped on the maintainer's explicit “ship it”.** Release **run #28** (`workflow_dispatch`, `publish: true`, `store: true`, `cancel_pending: true`), conclusion **success**: `build` ✅, `webstore` ✅, `release` ✅, `msi` ❌ (the usual `WIX7015` OSMF EULA; `continue-on-error`, blocks nothing). Four zips attached (`feedhacker-0.9.0.zip`, `-win.zip`, `-store.zip`, `-store-submission.zip`), no MSI. Store upload: `Uploading feedhacker-0.9.0-store.zip… / Publishing… / Publish successful` at **22:09:02 UTC** — **submitted for Google review, NOT approved**. ⚠️ Do not mark Live until the listing itself shows 0.9.0. **——— FH-055 IS FIXED, AND THIS RUN PROVED IT IN PRODUCTION.** Read from the `webstore` job log, the only place a session can read it: `CWS_PUBLISHER_ID: 099a34bd-2c03-4251-a3e0-a4e39f521dad` — a bare publisher UUID, not the old `project-46303a79-fd20-4ed8-859` Cloud-project id that drew an identical **403 `PERMISSION_DENIED`** on runs #24, #25 and #27. The cancel call now **authenticates and answers truthfully**: **HTTP 400 `FAILED_PRECONDITION` / `NOT_CANCELLABLE`**, *“Your item 'kccajfoghkplakndamlohpepopdpelkb' does not have an active submission that can be cancelled.”* That is the 400/404 branch the fix predicted, and it lands on the honest message *“No pending submission cancelled (HTTP 400) — nothing was in review.”* Both halves of FH-055 are now verified against the real API: the reporting half on run #27, the credential half here. **It also independently confirmed the submission slot.** The slot was called OPEN before dispatch by reading the store listing (“Version 0.8.0, Updated 17 September 2026”, `?hl=en-IE`); the API then said the same thing from the other side. Two independent sources agreeing is the first time this project has had that. Contents: **FH-060** (a tab re-applied the feed on its own storage write, re-judging everything every 1.5s — the flood that poisoned the model), the **one-time recovery migration** that clears the mis-tuned model itself on update (no user has to be told), **FH-061** (group rows fold by reason, not adjacency) and **FH-062** (a slop control on shown posts, so the model can be told it missed one). 303 unit+integration, 34 system. |
| 0.8.0 | ✅ Released (2026-09-16) — tag `v0.8.0` @ `48bc6c8`, re-cut @ `1b44eb6` | ✅ **Live** — confirmed 2026-09-17 from the **store listing** (“Version 0.8.0, Updated 17 September 2026”, read via `?hl=en-NZ`) | 2026-09-16 | **Shipped on the maintainer's explicit “ship 0.8.0 to github only, hold the store”** — the first release in this project's history to go to **one** destination. **Release run #26** (`workflow_dispatch`, `publish: true`, **`store: false`**), conclusion **success**: `build` ✅, `webstore` **⏭︎ skipped**, `msi` ❌, `release` ✅. **The store hold is verified, not assumed:** the `webstore` job's conclusion reads `skipped` (created and completed 19:42:33 UTC, zero steps run), so nothing was uploaded, nothing was submitted for review, and **the cancel step did not execute at all** — FH-055 was simply not exercised this release. Tag `v0.8.0` pushed and the **GitHub Release published 19:43:09 UTC**, `draft: false`, with the usual four zips (`feedhacker-0.8.0.zip`, `-win.zip`, `-store.zip`, `-store-submission.zip`) and **no MSI** — the best-effort `msi` job failed as it does every release, this time with the exact error rather than the usual shorthand: `error WIX7015: You must accept the Open Source Maintenance Fee (OSMF) EULA to use WiX Toolset v7` at the `wix build` step (WiX v7.0.0 itself installed fine in 8s). Blocks nothing. **⚠️ Store users remain on 0.7.0 and will not receive this.** That is deliberate and has two reasons: three listing screenshots still show the removed **S** button (§1 open item 1), and 0.8.0 is partly a live test of the filtering changes before they reach every install automatically. **Submission slot: still OPEN** — nothing was put in it. Contents: **FH-057** — solo **set aside** (deferred, not rejected — framing corrected 2026-09-16: this is part of the rework forced by **LinkedIn's feed redesign**, which removed the markup post identity and furniture detection relied on. Solo's fault was its *position* — it short-circuited before the scorer, so the AI never ran and the decision log froze, amplifying the symptom and hiding the cause. Intended to return, rebuilt — roadmap FH-059. **Superseded 2026-09-17: solo was RETIRED permanently** as a separate, later product decision — see KNOWN_ISSUES FH-057 and best_practices §69. Left standing because it accurately records the intention at the time 0.8.0 shipped); every filter is a plain on/off, the popup is regrouped with **AI slop** (learned model + sensitivity) above the plain **Also hide** kinds, and a legacy `solo<Key>` is deleted from live settings on every load *and* evicted from sync once. Plus the FH-055 reporting fix (a refused store request is no longer printed as “nothing in review”), the eleven-file documentation sweep the removal had missed (`manifest.json`'s shipped description and `store/listing.md` among them), and the release-workflow split that made this GitHub-only ship possible. 270 unit+integration, 29 system. **——— STORE UPLOAD, run #27 (2026-09-16 20:01 UTC).** Shipped to the store ~18 minutes after the GitHub-only release, on the maintainer's explicit “push 8.0 to the store … this is part of our text to resolve the latest issues”. Slot confirmed **OPEN** before dispatch by reading the **store listing** (“Version 0.7.0, Updated September 15, 2026”), per the 0.5.0 row's lesson — the listing, not the inbox. `workflow_dispatch`, `publish: true`, **`store: true`**, conclusion **success**: `build` ✅, `webstore` ✅, `release` ✅, `msi` ❌ (`WIX7015` OSMF EULA again). `webstore` log: `Uploading feedhacker-0.8.0-store.zip… / Publishing… / Publish successful` at **20:01:33 UTC** — that means **submitted for Google review, NOT approved**. ⚠️ **Do not mark Live until the store listing itself shows 0.8.0.** The `release` job re-cut the same tag and re-published the same GitHub Release idempotently at 20:01:53 UTC (by design — not a second release). **FH-055 recurred a THIRD time, and the fix shipped in 0.8.0 proved itself in production.** `CWS_PUBLISHER_ID` again resolved to `project-46303a79-fd20-4ed8-859` and `cancelSubmission` again returned **HTTP 403 `PERMISSION_DENIED`** on the same resource path. But this was the **first release to run the corrected message**, and it printed the truth instead of the old lie: `##[warning]cancelSubmission was REFUSED (HTTP 403). This is NOT 'nothing in review' … A value shaped like 'project-<uuid>' is a Google Cloud project id; this API wants the Chrome Web Store PUBLISHER id`. The reporting half of FH-055 is now **verified against the real API**, not just unit-tested; the publisher id itself is still wrong and still the maintainer's to fix. It cost nothing again — the slot was free and the upload went through. **Listing screenshots knowingly NOT regenerated:** three still show the removed **S** button. Raised before the upload and **deliberately deferred by the maintainer** (“we'll make changes to the store carousel if we need to”) — listing assets are an independent publish channel, so they can be corrected at any time without a new package. **——— PUBLISHED.** Google review cleared overnight: on **2026-09-17** the listing reads “Version 0.8.0, Updated 17 September 2026”, so store users now receive 0.8.0 and the submission slot is **OPEN** again. Review took longer than its predecessors (0.6.0 ~14 min, 0.7.0 ~30 min; 0.8.0 was still showing 0.7.0 at 43 min and cleared some time after) — a reminder that “slow” is not “rejected”, and that the wait is not bounded by the last release's wait. Confirmed from the listing, not the inbox. |
| ~~0.4.6 (first attempt)~~ | 🚧 Not tagged | ❌ **Never published** — the 2026-07-23 submission published as **0.4.5** | 2026-07-23 (listing assets only) | New FeedHacker **Fh** element-mark branding across the extension + Chrome Web Store icons (LinkedIn blue; toolbar icons keep transparent corners, the **store icon is opaque** — the store rejects a transparent store icon), simplified `Fh`-only 16/32px toolbar variant, refreshed screenshots + promo tiles, and a brand lockup carrying "created by www.MaxResearchCollective.com". Merged to `main`. **The 0.4.6 *package* never reached the store:** Google's publish email for the 2026-07-23 submission states **Version 0.4.5** (published 2026-07-24 10:39 UTC), i.e. the new *listing assets* went live on top of the old 0.4.5 package. That's why the store page shows the `Fh` icon but installs still show the old "M" — see `KNOWN_ISSUES.md`. **Submission slot is OPEN**; uploading the 0.4.6 package is what makes the new icon reach users. No GitHub tag/Release cut for 0.4.6 either. |

Legend: ✅ done · ⏳ in flight (uploaded/awaiting Google) · ❌ failed/blocked · 🚧 unreleased ·
◻︎ n/a or historical.

## What's in each version

Summaries only — see [`CHANGELOG.md`](CHANGELOG.md) for details.

### 0.7.0 — released on GitHub (2026-09-15); LIVE on the store (published 2026-09-15)

One fix, and it is the one the user had been reporting for three rounds.

- **FH-056 — an author mute silently outranked solo.** `consider()` checked the author allow/mute
  lists *before* computing the soloed kinds, and the mute branch returned — so in solo mode a
  muted author's post never reached the solo logic even when it matched. On the reporting feed
  (solo = Hiring, 63 posts, every one hidden) exactly **one** post qualified: *"Disney is hiring!
  Hundreds and hundreds of posted roles."* Its author was muted, so it died in the author block
  and the feed rendered empty — indistinguishable from the hiring filter being broken. It was not:
  `isHiring()` had found the one real ad in 63 posts and correctly rejected that same author's
  three other, non-hiring posts. **In solo mode the soloed kinds are the whitelist**, so a muted
  author's matching post now shows; their other posts are still hidden by solo, so the mute loses
  nothing. Codified as §55.
- **Two things deliberately unchanged**, both verified against the same capture rather than
  assumed: `isHiring()` already means *explicit ad for a real open role* (it rejects new-position
  announcements, anniversaries and commentary), and the AI-slop model does **not** key on the
  topic "AI" — 28 of 63 posts mention AI, 35 do not, mean slop probability **0.168 for both**, and
  none would be hidden as slop.

### 0.6.0 — released on GitHub (2026-09-15); LIVE on the store (confirmed 2026-09-15)

Three bugs, and two of them were mechanisms that were supposed to be watching for bugs.

- **FH-052 — the alarm for "LinkedIn changed its markup" was itself broken.** The heartbeat
  fires only on `markers === 0 && content > 0`. `contentCount()` looked for `role="article"` or a
  `data-urn`/`data-id` activity container, and LinkedIn's redesigned feed ships **none** of them:
  zero matches against two live captures holding **8 and 42 rendered posts**. So `content` was
  pinned at 0, the alarm could never fire, and the safety net that would tell us our marker had
  gone stale was dead — silently, with nothing red. Now also counts LinkedIn's per-post overflow
  control, which is its own a11y hook and independent of our marker.
- **FH-053 — LinkedIn's furniture was being treated as posts.** "Who's viewed your profile" and
  "Jobs recommended for you" carry the same hidden `Feed post` heading, so they were judged and
  hidden; one was attributed to the author *"Jobs recommended for youVice President, Apps"*.
  FH-050 had only gated the **AI-slop** path behind a prose minimum — solo and mute run earlier
  and had no gate. The guard needs a known module heading **and** no per-post overflow control,
  and fails closed.
- **FH-054 — "Reset AI-slop learning" did not reset the AI.** It removed the weights alone; the
  training buffer, observation pool, calibration record and self-tuned `slopThreshold` all
  survived, so auto-calibration rebuilt the same model within a scan or two. It now clears all of
  it and restores the AI's tuning from `buildDefaults()` while leaving mute, solo, muted authors,
  custom filters and display settings untouched. **This invalidated the project's own FH-049
  measurement procedure** — any decision-log export taken after a pre-0.6.0 reset was measuring a
  model that had quietly restored itself.
- **A release note for FH-042**, telling hand-installed Windows users on ≤0.4.5 to re-run
  `installer\install.bat`, and saying plainly that Chrome Web Store users are unaffected.
- **Confirmed, not changed:** fresh install is AI-slop only with nothing soloed, upgrade preserves
  settings, and factory reset returns a clean install. All three were already correct; they now
  have tests pinning the exact shape.

### 0.5.0 — released on GitHub (2026-09-08); LIVE on the store (2026-09-08)

The release that answers "it's still hiding almost everything" — and the answer was not the model.

- **FH-051 — solo mode, not the AI.** The maintainer's screenshot showed row after row of
  `8 posts hidden · Filtered out ×8`. That string appears at **exactly one place** in the source:
  the solo branch of `consider()`, which returns **before** the AI-slop scorer is ever called.
  Solo shows only the kinds you solo and hides everything else, so a single green `S` empties an
  ordinary feed. Two things made it unreadable: the stub said only "Filtered out" — indistinguishable
  from a runaway model — and the sole exit was knowing to reopen the popup. On a heavily filtered
  feed every row is a folded group summary, so even a per-post exit would have been unreachable.
  Stubs now name the mode and the soloed kinds, and the stub *and the group row* carry
  **Show everything**.
- **Unmute all authors** — mutes accumulate for months and clearing them one chip at a time is a
  chore nobody does. The allowlist and per-author learning survive.
- **Factory reset** (Authors and Error log panels, one shared implementation) — clears every
  persisted key and restores `buildDefaults()`: AI-slop filtering on, nothing else, no solo.
- **Install vs upgrade, now guarded** — an upgrade writes nothing, so stored settings survive; a
  new install gets the shipped defaults. Neither half was locked down before.

The method lesson is §51: the label on screen was a precise index into the code path. Two sessions
of scoring work had been aimed at a symptom that had nothing to do with scoring.

### 0.4.9 — released on GitHub (2026-09-08); LIVE on the store (2026-09-08)

The release that fixes the actual cause of "it hides everything". Diagnosed from the maintainer's
own exported decision log, after two earlier rounds of scoring fixes had treated downstream
symptoms:

- **FH-049** — "judge each post once" was an attribute on the DOM node, and LinkedIn *replaces*
  feed nodes. Every re-render was a brand-new post to us: **300 decisions from 13 distinct posts**
  over 11 minutes, one judged **42 times in 63 seconds**. That flooded the calibration population
  (164 observations → 19 distinct vectors) and the training buffer (95 "slop" vs 17 "not slop"),
  so the model grew more aggressive the longer it ran. Identity now outlives the node.
  Side effect: **"Show anyway" and "Hide" survive a re-render**, which they never did.
- **FH-050** — LinkedIn's own furniture was hidden as posts. 20+ words of prose are now required
  before anything can be hidden as slop; fragments are still observed for calibration.

**Known limitation:** verified in tests (216 unit+integration, 17 system; 5 of 7 new guards fail
pre-fix) but **not on a live feed**. It is live on the store as of 2026-09-08 04:25 UTC; the
decisive evidence is still a fresh log export where decisions ≈ distinct posts.

### 0.4.8 — released on GitHub (2026-09-08); LIVE on the store (2026-09-08)

The "it hides everything" release. User reported FeedHacker was hiding most of an ordinary feed;
root-caused by measurement rather than by reading the model:

- **FH-045** — `claudisms.json` is the project's house **style guide** ("em dashes banned outright",
  "leverage — corporate-speak verb") wired into the AI-slop model on its largest weight, and the em
  dash was scored **twice** (banlist *and* the `emdash` tell). One em dash took an ordinary sentence
  from p=0.168 to p=0.786. Hits are now weighted by how much evidence they actually are; slop recall
  held at 8/8 while human false positives went 1 → 0.
- **FH-046** — the hidden share was a **quota**: a feed with no slop still lost ~28%, and the
  Sensitivity slider was inert. `targetFrac` is now a ceiling; a clean feed loses nothing.
- **FH-047** — a group summary row stands for at most 8 posts.
- The feed tops itself up when filtering leaves the screen thin.
- Release plumbing: a pending store submission is withdrawn before uploading (CWS API v2).

Also carries all of 0.4.7: the AI-slop splat unreachable on folded runs, Mute keying on the
collapsed stub's text or on a reshare's reactor, the options-page grouping toggle, and serialized
slop verdicts.

### 0.4.7 — released on GitHub (2026-09-07); LIVE on the store (2026-09-07)

Three bugs reported from the live feed, plus one found in self-review:

- **The AI-slop splat was unreachable on a heavily filtered feed (FH-044).** Grouping is on by
  default and folds any run of 3+ consecutive hidden posts into one summary row, which carried
  only *Show all* — every per-post control went with the stubs it replaced. The group row now
  carries the splat and confirms every slop post in the run at once; *Show all* still expands to
  individual stubs.
- **Mute didn't stick (FH-043).** The author was re-identified at click time, when a collapsed
  post's `innerText` is FeedHacker's own stub — so it stored an unmatchable key while the row
  still slid away. On reshares it keyed on the reactor rather than the author. And it shared a
  1.5 s write debounce with internal tallies, so a reload could drop it. Identity is now captured
  while the post is visible, the actor's own anchor is chosen, and the decision is saved
  immediately.
- **The "Group flagged posts" toggle is back on the options page** (Feed display panel), synced
  with the popup.
- **Slop verdicts are serialized** — the new bulk confirm would otherwise have raced N storage
  read-modify-writes and kept one training example out of N (`best_practices` §7).

New guards: `test/integration/author-identity.test.js`, `test/integration/slop-verdict-queue.test.js`,
plus group-row cases in `grouping.test.js` and a real-Chromium reshare-mute case in
`extension.system.test.js`. All verified to fail against the pre-fix build.

### 0.4.6 — released on GitHub (2026-07-29); submitted to the store (in review)

> ⚠️ **Existing Windows sideload installs will NOT auto-update to 0.4.6 — they need a manual
> re-install.** Two reasons compound: (1) they're still running 0.4.5's `lib.ps1`, which has the
> broken asset selection, and (2) `Sync-LatestRelease` only refreshes
> `%LOCALAPPDATA%\FeedHacker\extension`, never the installer scripts in
> `%LOCALAPPDATA%\FeedHacker\installer` — so the updater can't deliver its own fix. Fix for an
> affected user: download `feedhacker-0.4.6-win.zip` from the v0.4.6 Release, unzip, and run
> `installer\install.bat` again. From 0.4.6 forward, auto-update works. Tracked as follow-up
> **FH-042** in [`the_wall.md`](the_wall.md) (have the updater refresh its own scripts).

**What shipped (2026-07-29):**
- The **`Fh` element-mark branding actually reaches installs** — 0.4.6's package is now on the
  store (in review) and on GitHub, so the toolbar icon finally matches the listing.
- **Windows auto-update fixed** — `Sync-LatestRelease` was selecting `-store-submission.zip`
  (no `manifest.json`), so the daily task and "Update now" failed on every run.
- **The installer no longer falsely reports** that it registered the daily update task.
- **Regression guards** for both: brand-blue parity across the two publish channels, and the
  updater's release-asset selection.
- **CodeRabbit removed** from the repo; review is CI + self-review against `best_practices.md`.

**Earlier 0.4.6 history (the aborted first attempt):**
- **New FeedHacker brand identity** across the extension and store: the app/store icon is now the
  **"Fh" element mark** (periodic-table cell — atomic number `42`, big `Fh`, name *FeedHacker*) on
  LinkedIn blue, replacing the generic "MAX M" placeholder. `feedhacker-logo.svg` is the source of
  truth; all icon PNGs were regenerated from it. Toolbar icons keep transparent corners; the **store
  icon is opaque white** (no alpha) — the store's store-icon field rejects a transparent icon.
- **Simplified `Fh`-only 16/32px toolbar variant** (`icons/icon-small.svg`) for legibility at small
  sizes; 48/128px keep the full cell.
- **Refreshed store screenshots + promo tiles** with the new branding (current popup UI).
- **Brand lockup with attribution** (`store/brand/logo-lockup.svg` → `logo-lockup-1024.png`): Fh mark
  + *FeedHacker* wordmark + **"created by www.MaxResearchCollective.com"** for the store brand image.
- Merged via PR #50. **The store never got the 0.4.6 package** — the 2026-07-23 submission published
  as **Version 0.4.5** on 2026-07-24, so only the new *listing assets* (icon, screenshots, promo
  tiles) went live. Installed copies therefore still show the old "M" icon. No GitHub tag/Release
  was cut for 0.4.6 either.
- **Icon-mismatch guard added** (this session): `test/unit/brand-assets.test.js` +
  `test/system/build.system.test.js` anchor the store-listing icons and the icons inside the built
  package to one brand constant, and six unreferenced pre-rebrand rasters were deleted from the repo
  root. See `KNOWN_ISSUES.md` and `best_practices.md` §33.

### 0.4.5 — released on GitHub (2026-07-21); LIVE on the store (2026-07-21)
- **"Update now" applies a Chrome Web Store update in place** — no browser restart. Store installs
  can now fetch and apply a published update on the spot (`requestUpdateCheck` → `runtime.reload`),
  then just refresh the LinkedIn tab; if the new version isn't live on the store yet it says so
  plainly instead of failing.
- **Welcome-page puzzle icon matches Chrome's** monochrome "Extensions" glyph (was the colorful 🧩).
- **Popup help moved behind a "?" button** — the two always-on help blurbs no longer take permanent
  space; a small "?" by the Enable toggle reveals the same help on demand.
- **Aggression slider label simplified** to just **strict / balanced / aggressive** (the
  "(~28% hidden)" fraction overflowed and got clipped).
- **MAX3/netsniff engineering discipline adopted:** CodeRabbit config, numbered `best_practices.md`
  rules (§19–29), tree-integrity ledger, and a test matrix.

### 0.4.4 — released on GitHub (2026-07-09); LIVE on the store (2026-07-09)
- **Autonomous AI-slop self-calibration** (living model): reviews the posts you see and, on its
  own, down-weights structural tells that fire on most of the feed and sets the threshold from the
  score distribution so only the sloppiest slice is hidden — no clicking required. Evolves from its
  latest weights across sessions; your corrections nudge it secondarily.
- **Aggression slider that sticks:** now sets the target share of the feed to hide
  (`slopTargetFrac`), which the self-tuning honors, instead of a raw threshold it overwrote.
- **Curated grouping:** 3+ consecutive hidden posts fold into one "N hidden … Show all" row
  (toggle in the popup).
- **Click-safe re-apply + faster load-more:** delegated stub clicks survive React re-renders; the
  self-tune re-applies softly and pauses after clicks; load-more kicks harder.
- **Consolidated, self-reaping learning:** the observation buffer is trimmed to a recent window
  (`OBS_KEEP`) after each calibration so it doesn't keep growing.
- **Accurate in-app documentation:** the "How AI-slop detection works" panel and README now
  describe the self-tuning algorithm.

### 0.4.3 — released on GitHub (2026-07-09); submitted to the store
- **Context-invalidation teardown:** after a Chrome update/reload, the orphaned content script
  now shuts down cleanly (disconnects the observer, clears timers/listeners, removes injected UI,
  reveals hidden posts) instead of churning and logging its own errors for the life of the tab.
- **Smaller page footprint:** the banlist ships bundled (`banlist.js`) instead of being fetched
  from a web-accessible `claudisms.json`, so `web_accessible_resources` is empty — no
  extension-origin resource a site can enumerate. `styles.css` intentionally stays as manifest
  CSS (CSP-exempt).
- Diagnosed the reported `chrome-extension://invalid/` request + CSP `eval` warnings as
  LinkedIn-side (not FeedHacker); no functional bug on our side.

### 0.4.2 — released on GitHub (2026-07-08); LIVE on the store (2026-07-08)
- Hidden/revealed posts no longer "pop back" when settings re-apply (Hide / Show-anyway are sticky).
- Hidden-post **stub redesign**: toggle-driven — rule inline by default; **Show author** adds the
  author inline; **Show sample** adds a post sample on line 2.
- AI-slop **splat** button now **confirms + hides** the row (shows a checkmark).
- Fixed "Show sample" showing the author's headline on Promoted posts.
- **Removed** "Collapse hidden content" (digest mode).

### 0.4.1 — released on GitHub; store upload blocked
- Fixed the Windows installer failing to parse (non-ASCII em-dashes in the PowerShell scripts).
- Refreshed the Chrome Web Store screenshots for the v0.4.0 UI.
- Store note: blocked behind 0.4.0's pending review. The installer bug only affects the Windows
  sideload download (not store installs), so store users are unaffected.

### 0.4.0 — released; submitted to the store
- Removed the per-filter Aggressive (A) toggle; sensitivity slider is the sole aggressiveness control.
- Popup redesign (sectioned layout, header Enable, clearer labels, single-line rows).
- "Show sample" works independently of "Show author".
- One-click **"Update now"** self-update for the Windows install (native-messaging helper → reload,
  no restart); Windows sideload build only, store package unchanged.

### 0.3.0 — released; first upload to the new store item
- Company / brand posts filter; "Always show" (whitelist) button on stubs; stronger broetry
  AI-slop detection; heartbeat false-alarm fix.

### 0.2.0 — last version on the previous store item
- Baseline release.
