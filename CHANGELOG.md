# Changelog

All notable changes to FeedHacker — features and bug fixes, newest first.
Format follows [Keep a Changelog](https://keepachangelog.com/); versions match
`manifest.json` and the Git tags / GitHub Releases.

**Install:** [Chrome Web Store](https://chromewebstore.google.com/detail/feedhacker/djfbniehjjngpkimngegnjdeamfofnoa)
· [latest release](https://github.com/newellnarco/Feedhacker/releases/latest)

> Maintaining this file: add entries under **Unreleased** as you work, then on
> release rename that heading to the new `vX.Y.Z` (with the date) and start a fresh
> Unreleased block. Keep the version in step with `manifest.json` / `package.json`.

## [Unreleased]

_Nothing yet._

## [0.3.0] — 2026-07-06

### Fixed
- **Spurious "No LinkedIn post markers found" heartbeat error.** The DOM-break
  heartbeat now only counts empty scans while the feed tab is actually visible and
  focused. Leaving LinkedIn open in a background tab, a minimized window, or while
  switched to another app pauses LinkedIn's feed rendering, so zero markers there is
  expected — it no longer trips the "selectors may be out of date" alarm.

### Added
- **Company / brand posts filter** — Mute (or Solo) posts authored by a LinkedIn
  Company or School page (WSJ, brands, publishers, orgs): corporate content that
  isn't a paid "Promoted" ad and isn't AI slop. Off by default.
- **"Always show" (whitelist) button** on stubs — allowlists the author so their
  posts are never filtered again (and reveals the current post). Whitelisted authors
  get a new collapsed **Whitelist** section on the options page, where they can be
  removed.

### Changed
- **Stronger AI-slop detection for "broetry"** — a new "spaced one-liners" signal
  catches posts that are almost entirely short lines separated by blank lines (the
  airy LinkedIn format the old broetry tell under-scored). Applies to AI-slop
  comments too.
- **Stub controls are now icon buttons** — a compact, right-justified cluster:
  a **green splat** (AI slop — confirm + train), a **grey eye‑with‑strike** (Hide post),
  a **red mic‑slash** (Mute), a **blue eye** (Always show), and a **box‑arrow**
  (Visit profile), each with a hover tooltip. Confirming **AI slop** only trains the
  filter now — it leaves the stub in place (and is idempotent, so a double‑click can't
  overweight one example). **Hide post** retires just that one row (without muting or
  training) and is available on AI‑slop comment stubs too; **Mute** soft‑blocks the
  author; **Always show** reveals the post and drops the stub. A new **Post controls**
  legend on the options page explains all five. The stub no longer prints the "AI Slop"
  category as text — the reason shows on hover (the stub tooltip and the splat icon).
- **Muted authors are now soft-blocked** — their posts are hidden outright (no
  "Muted author" stub), so a muted author simply stops appearing. Unmute from the
  options page.
- Refreshed the Chrome Web Store listing **screenshots** to a 0.2.0/0.3.0 set (the
  Mute/Solo mixer, the AI-slop detection panel, and the hidden-post stub).
- **Docs consistency pass**: removed lingering references to the now-deleted remote
  GitHub banlist (`README.md`, `INSTALL.md`, `store/README.md`), renamed the
  documented "Name names" option to "Names", documented the new "+ sample" option,
  the detection-transparency panel, and the Actions legend, and aligned the privacy
  wording to "no network requests."

## [0.2.0] — 2026-07-06

### Added
- **“How AI-slop detection works” panel** on the options page — a read-only
  transparency view over the scorer: the structural “tells” it looks for (each with a
  plain-English description and your current learned weight) and the full curated
  phrase banlist, grouped by category and filterable with a search box. No new data
  or permissions; it surfaces what the extension already computes.
- **“Actions” card** on the options page (under Properties): a legend for the
  Mute / Solo / Aggressive buttons — the M/S/A chips and a short description of what
  each affects.
- **“+ sample” display option** (popup → Display): adds a line of the hidden post's
  text to the **“Names”** stub, giving a three-line stub — author, sample, category.
  It only applies on top of Names (disabled/grayed while Names is off; cleared when
  Names is turned off).
- **Author + first line on AI‑slop stubs.** Because the AI‑slop filter is a judgment
  call, its collapsed placeholder shows the post author's name and the opening line,
  so you can decide without clicking **Show anyway**. The deterministic filters
  (Promoted, Hiring, etc.) show no preview.
- **Profile link** next to each entry under Insights → Top sources, so you can jump
  to the author's LinkedIn profile to block, mute, or report them there.
- **First-run welcome page** with instructions to pin FeedHacker to the toolbar
  (Chrome doesn't let an extension pin itself). Opens once on install; pinning stays
  optional.
- Options-page sections are now **collapsible panels**; Activity, Insights, the
  detection panel, Custom filters, and Advanced default to collapsed.
- Hosted **GitHub Pages** site under [`docs/`](docs/): a standalone HTML privacy
  policy (`privacy-policy.html`) plus a small landing page.

### Changed
- Popup Display: renamed **“Name names” → “Names”**, and the sample toggle to
  **“+ sample”**, which now reads as an add-on to Names (grayed/disabled until Names
  is on) rather than a standalone three-line mode.
- Popup: **Aggressive (A) is now coupled to the AI-slop Mute (M)** — clicking A also
  turns Mute on, turning Mute off clears Aggressive, and A is dimmed with a hint while
  AI slop isn't muted. Removes the old dead state where A did nothing on its own.
- Clearer wording for the **Solo** action in the Actions card ("show me just this"
  mode, with a concrete example).
- Options page "Updates" text now explains updating per install method (Chrome Web
  Store auto-updates; the Windows installer's daily task needs a Chrome restart to
  apply; Load-unpacked needs a manual download + reload).

### Removed
- The **remote AI-slop banlist** feature: the "Use the latest AI-slop banlist from
  GitHub" toggle, the "Update banlist now" button, the `remoteBanlist` setting, and
  the `raw.githubusercontent.com` optional host permission. The extension now uses
  only its bundled `claudisms.json`.

### Fixed
- **Cross-site-scripting hardening.** The phrase-list search renders its text with
  `textContent` instead of `innerHTML`, so a search query is never parsed as HTML
  (flagged by CodeQL).
- **Options page column alignment.** The numeric headers (**Hidden** / **Shown**)
  in the Activity, Insights, and Top‑sources tables now right‑align over their
  values instead of floating to the left of them.
- Release workflow: the `CWS_AUTO_PUBLISH` variable is now matched
  case-insensitively (`true`/`True`/`TRUE`), so store auto-submit isn't silently
  skipped by capitalization.

### Tooling / release
- Automated **Chrome Web Store** publishing on release (opt‑in via `CWS_*` secrets),
  plus a manual **Run workflow → publish** path so a release can be cut without
  pushing a tag.
- Release workflow hardening: idempotent GitHub Release creation, and a fix for a
  manual publish run producing a draft instead of a published release.
- Automated PR review via **Qodo Merge** (`.pr_agent.toml`).

## [0.1.0] — Initial release

### Added
- Hide low‑signal LinkedIn home‑feed posts via a per‑filter **Mute / Solo** mixer:
  **AI slop** (structural scorer with an Aggressive mode), **Promoted**,
  **Newsletter signups**, **Hiring**, **Reaction reshares**, **New‑job
  announcements**, **Work anniversaries**, and **Training & certification**.
- **Learning AI‑slop filter** — scores structural "tells" and learns from your
  **Show anyway** / **👍 slop** / **Hide again** corrections and scroll‑past signals;
  adjustable sensitivity; export/import/reset of the on‑device model.
- **Author memory** — mute an author (always hide) or allowlist (always show), with
  a Profile ↗ quick‑link; top hidden sources on the options page.
- **Custom filters** — words/phrases, regexes, hashtags, and companies/authors.
- Display and comment options — **Name names**, **Hide Hidden Content**, **Digest**
  runs of hidden posts, **Hide AI‑slop comments**, a toolbar badge, and a **Load
  more posts** helper.
- Runs entirely in the browser (only the `storage` permission); optional remote
  banlist behind a per‑site permission prompt.

[Unreleased]: https://github.com/newellnarco/Feedhacker/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/newellnarco/Feedhacker/releases/tag/v0.3.0
[0.2.0]: https://github.com/newellnarco/Feedhacker/releases/tag/v0.2.0
