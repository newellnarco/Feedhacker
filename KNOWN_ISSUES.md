# FeedHacker — KNOWN_ISSUES.md

The bug ledger / audit trail. Every real bug is recorded here with its **root cause → fix (PR)
→ the regression test that locks it**. This turns a one-off fix into a permanent guardrail, and
(with [`best_practices.md`](best_practices.md)) closes the review loop so a class of bug can't
recur silently. The **Found by** column keeps the AI-reviewer signal comparable.

**Status:** 🔴 open · 🟡 mitigated / accepted · ✅ fixed + tested

## Recurring classes (watch these hardest)

- **Extension-context invalidation** — orphaned content scripts after a Chrome update/reload
  (`chrome-extension://invalid/`). Guard `chrome.*`, tear down cleanly. (best_practices §6)
- **Concurrent `chrome.storage` writers** — two async paths, last-write-wins, dropped data.
  One writer per key. (§7)
- **Re-scoring collapsed stubs from live DOM text** instead of stored features. (§8)
- **Learner overwriting a user control** — bind the control to the value the tuner honors. (§9)
- **Injected controls losing listeners on React re-render** — delegate clicks. (§10)
- **False green / dishonest status or counts.** (§4, §5)
- **Health/heartbeat alarms that can't tell "empty" from "broken"** — fire on positive evidence of
  failure, suppress during loading/paging. (§31)

## Ledger (newest first)

| Status | Bug | Root cause | Found by | Fix (PR) | Regression test |
|---|---|---|---|---|---|
| ✅ | "Fixed" advanced behaviours (self-tune/learn-from-scroll on, filter home-feed-only) weren't actually enforced for existing users after the Advanced UI was removed | Removing the toggles didn't reset persisted `chrome.storage.sync` values; `content.ts` merges stored settings over `DEFAULTS`, so a prior non-default choice survived | CodeRabbit (PR #47) | `Filters.applyFixed` forces `autoCalibrate`/`implicitLearning` ON + `scanEverywhere` OFF on every sync load in content.ts (grouping left user-controlled) | `test/unit/filters.test.js` (`applyFixed …`) |
| ✅ | Heartbeat "No post markers found — selectors may be out of date" false-fired during LinkedIn paging | The heartbeat treated 0 markers as a break; the feed is momentarily empty while LinkedIn pages in more posts, so absence ≠ breakage | user (this session) | Gate the alarm on positive evidence: fire only when the feed rendered posts (selector-independent `contentCount`) but none match our marker, and suppress while loading (`isLoading`) or the tab is inactive (PR #47) | `test/unit/selectors.test.js` (`heartbeatBreak`, `contentCount`, `isLoading`), `test/integration/heartbeat.test.js` |
| ✅ | Welcome-page step icons announced twice by screen readers | Decorative puzzle/pin SVGs (redundant with the adjacent visible "puzzle-piece" / "pin" text) still carried `role="img"` + `aria-label` | CodeRabbit (PR #47) | Mark both `aria-hidden="true"`, drop role/label (welcome.html) | n/a (static welcome.html, no automated a11y tier) — codified as best_practices §30 |
| ✅ | `.coderabbit.yaml` tool settings silently ignored ("Unrecognized key: tools") | Put `gitleaks`/`ast-grep` under a top-level `tools:`; the schema nests them under `reviews.tools` | CodeRabbit (first review, PR #45) | Move the block under `reviews.tools`; add the `$schema` language-server hint | n/a (config); CodeRabbit re-validates on the next push |
| ✅ | CodeRabbit never reviewed our PRs ("Review skipped — Draft detected") | We open PRs as drafts; CodeRabbit skips drafts by default and had no repo config | self (this session) | Add `.coderabbit.yaml` with `auto_review.drafts: true` (+ knowledge_base wiring) | n/a (config); verified — CodeRabbit reviewed PR #45's draft |
| 🟡 | Release `msi` job fails: `WIX7015 … OSMF EULA` | WiX Toolset bumped to v7, which gates behind an Open Source Maintenance Fee EULA in CI | release workflow run | Accepted: the MSI is best-effort; the `-win.zip` installer is the supported Windows path and builds fine. Follow-up: pin WiX v5 or accept the EULA in CI | n/a (build tooling) |
| ✅ | Calibration status overstated observation count | `cal.n` recorded the pre-reap count while the obs buffer was trimmed to `OBS_KEEP`, so an export bundled a larger `n` next to a shorter `observations[]` | Qodo | Record `nKept` alongside `n` (content.ts + options.ts) | `test/unit/livecalibrate.test.js`, `test/unit/autocalibrate.test.js` |
| ✅ | Self-tuning could clobber a concurrent tab's newest observations | Two async writers to `feedhacker:slopobs` (flushObs append + runAutoCalibrate reap), last-write-wins | Qodo | Single obs writer: reap inside flushObs' one write; remove the separate overwrite (PR #40) | `test/unit/autocalibrate.test.js`, `test/unit/livecalibrate.test.js` |
| ✅ | Collapsed/grouped hidden posts re-scored from stub text | `recompute` read live DOM text, which for a collapsed post is the stub UI, not the post | self | Re-score from stored `data-feedhacker-features` (PR #40) | `test/integration/grouping.test.js` ("re-scores from stored features") |
| ✅ | Aggression slider didn't stick | Slider wrote `slopThreshold`, which auto-calibration overwrites every ~45 s | user report | Slider writes `slopTargetFrac` (the target the tuner honors) + a matching threshold (PR #40) | popup behavior + `test/unit/*calibrate` target-frac paths |
| ✅ | Stub action buttons ignored the first click | LinkedIn's React re-render dropped per-button listeners; clicks hit handler-less nodes | user report | Single delegated capture-phase document listener routing by `data-fh-act` (PR #40) | `test/integration/grouping.test.js` (Show-all / ungroup click) |
| ✅ | Orphaned content script churned + logged errors after a Chrome update | Extension-context invalidation left the observer/timers running against a dead context | user report | `teardown()` on context loss — disconnect observer, clear timers/listeners, remove UI, reveal posts (0.4.3) | `test/integration/content-teardown.test.js` |
| 🟡 | `chrome-extension://invalid/` requests + CSP `eval` warnings on LinkedIn | LinkedIn-side: their fetch interceptor probing an invalidated extension context; the `eval` CSP block is their page, not ours | user report | Diagnosed as LinkedIn-side (no functional bug on our side); hardened anyway — bundled banlist, empty `web_accessible_resources`, context teardown (0.4.3) | `test/system/build.system.test.js` (no web-accessible resources) |
