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

Legend: ✅ done · ⏳ in flight (uploaded/awaiting Google) · ❌ failed/blocked · 🚧 unreleased ·
◻︎ n/a or historical.

## What's in each version

Summaries only — see [`CHANGELOG.md`](CHANGELOG.md) for details.

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
