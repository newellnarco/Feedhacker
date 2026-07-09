# Changelog

All notable changes to FeedHacker — features and bug fixes, newest first.
Format follows [Keep a Changelog](https://keepachangelog.com/); versions match
`manifest.json` and the Git tags / GitHub Releases.

**Install:** [Chrome Web Store](https://chromewebstore.google.com/detail/feedhacker/kccajfoghkplakndamlohpepopdpelkb)
· [latest release](https://github.com/newellnarco/Feedhacker/releases/latest)

> Maintaining this file: add entries under **Unreleased** as you work, then on
> release rename that heading to the new `vX.Y.Z` (with the date) and start a fresh
> Unreleased block. Keep the version in step with `manifest.json` / `package.json`.

## [0.4.4]

### Added
- **Autonomous AI-slop self-calibration** — to fight false positives without relying on your
  clicks. FeedHacker now reviews the whole population of posts it sees and periodically re-tunes
  the model **on its own**, fully on-device: (1) it **down-weights any structural "tell" that
  fires on most of your feed** — a signal that common is uninformative, which is what stopped one
  tell (an em dash, an emoji) from flagging everything — and (2) it **sets the threshold from the
  score distribution** so only the sloppiest slice (~the top fraction) is hidden, however the
  absolute scores land. Both are recomputed fresh from the shipped defaults each time, so they
  can't drift. On by default; toggle under **Advanced** ("Self-tune the AI-slop model
  automatically").
- **AI-slop decision log** — a local, exportable record of every post flagged and *why*: the
  probability, the tells that fired (with weight + contribution), the matched banlist phrases,
  the author, and a short (~280-char) preview, plus your verdict if you correct it. A new options
  panel shows the auto-calibration status (what it tuned itself to) and recent decisions, with
  **Export log (JSON)** (to send for a deeper, global tune), **Recalibrate model now** (force a
  self-tune), and **Clear log**. Everything stays on your computer until you export it.

### Fixed
- **Stub buttons no longer occasionally ignore the first click.** The action buttons on a
  hidden-post stub (AI-slop confirm, Hide, Show anyway, Mute author, Always show, Hide again)
  each carried their own click listener. When LinkedIn's React re-rendered a post's subtree
  (viewport changes, engagement-count updates, lazy media), it could drop our injected stub and
  its listeners — so a click landed on a handler-less node and appeared to do nothing, and you'd
  click again. Clicks are now handled by a single delegated listener on the document (routed by a
  `data-fh-act` tag), so a rebuilt button keeps working no matter how often LinkedIn re-renders
  around it.

## [0.4.3] — 2026-07-09

### Changed
- **Smaller page footprint on LinkedIn — the banlist now ships bundled.** Previously the
  content script fetched `claudisms.json` from a `web_accessible_resource` at boot, which left
  an extension-origin entry in the page's Resource Timing and made the file enumerable/loadable
  by the site. The banlist is now compiled into a bundled content script (`banlist.js` sets
  `self.FeedHackerBanlist`), so `web_accessible_resources` is empty and FeedHacker exposes no
  extension-origin resource for a site's own telemetry to enumerate (and, after a context swap,
  probe as `chrome-extension://invalid/`). Boot is also slightly faster — no fetch round-trip.

### Fixed
- **Orphaned tabs now shut down cleanly after an extension update.** When Chrome
  auto-updates (or you reload) the extension while a LinkedIn tab is open, the content
  script already running in that tab is orphaned — `chrome.runtime.id` goes away and every
  `chrome.*` call throws "Extension context invalidated". FeedHacker now detects the dead
  context and tears itself down: it disconnects the feed observer, clears its timers and
  scroll listener, removes its injected "Load more" bar, and reveals anything it had
  hidden — instead of churning (and logging its own errors) for the life of the tab. This
  does not affect the harmless `chrome-extension://invalid/` request some sites (LinkedIn
  included) fire from their own `fetch` interceptor against the stale context — that one is
  the page's, not ours, and a plain tab reload clears it.

## [0.4.2]

### Changed
- **Stub layout is now driven by the display toggles.** With neither toggle, a hidden
  post's stub shows just the **rule it violated** (e.g. "AI Slop, Promoted Post") inline
  with the action buttons. **Show author** adds the author on that same line (`Author ·
  Rule`); **Show sample** adds a line of the actual post below it. Previously an AI-slop
  stub always forced the author + first line regardless of the toggles.
- **The AI-slop "splat" button now confirms *and* hides the post.** Since the button is
  already green, clicking it swaps to a **checkmark** (rather than a colour change) as it
  trains the filter and retires the row. Updated the options-page "Post controls" text.

### Fixed
- **Hidden and revealed posts could "pop back."** Clicking **Hide** on a stub (or
  **Show anyway** to reveal a post) could be undone whenever FeedHacker re-applied — which
  happens on any settings change and after **Mute author** / **Always show** clicks. The
  re-apply did a full `reset()` that wiped *all* state and re-scanned, so a Hidden row
  reappeared and a Shown row got re-hidden. Re-applies now **preserve your explicit
  per-post choices**: a row you Hid stays gone and a row you revealed stays shown. A full
  reset (extension disabled, or leaving the feed) still reveals everything as before.
- **"Show sample" showed the author's headline on Promoted posts.** The sample now treats
  a "Promoted" label as the actor-header/body boundary, so it previews the actual post
  text instead of the author's job title.

### Removed
- **"Collapse hidden content" (digest mode).** It only grouped runs of consecutive
  same-category hidden posts and its "Show these" button didn't reliably un-collapse, so
  the checkbox and all of its code were removed.

## [0.4.1]

### Fixed
- **Windows installer failed to run (`install.bat` / `install.ps1` parse errors).** The
  PowerShell scripts contained em-dashes and ellipses; Windows PowerShell 5.1 reads a
  UTF-8-without-BOM `.ps1` as Windows-1252, where a UTF-8 em-dash's trailing byte becomes
  a smart quote that prematurely terminates the string — so the script failed to parse
  ("Unexpected token", "missing terminator"). All installer scripts are now pure ASCII,
  and a test guards against any non-ASCII byte creeping back in.

### Changed
- **Refreshed the Chrome Web Store screenshots** for the v0.4.0 UI: the popup mockup
  (sectioned layout, no Aggressive toggle, Company filter, Show author / Show sample) and
  the hidden-post stub (current icon actions). The detection-panel screenshot is unchanged.

## [0.4.0]

### Added
- **One-click "Update now" (Windows install, no restart).** In **Advanced Settings →
  Updates**, *Check for updates* now reveals an **Update now** button when a newer
  release exists. It drives the whole update from inside the extension: a per-user
  native-messaging helper (registered by the Windows installer, no admin) downloads the
  latest green release, then the extension reloads itself via `chrome.runtime.reload()`
  — the new version applies instantly, with **no Chrome restart** and no waiting for the
  daily task. Windows sideload build only; the Chrome Web Store build is unchanged
  (Google auto-updates store installs) and carries no extra permission.

### Changed
- **Removed the per-filter "Aggressive" (A) toggle.** The AI-slop **sensitivity
  slider** is now the single control for how aggressively slop is filtered. The
  broader "aggressive" phrase rules (common-word matchers that used to be gated
  behind the A toggle) now always participate as *weaker evidence*, and the slider
  governs how much they bite — so lowering sensitivity catches more, raising it
  catches less. Removes the toggle from the popup, its coupling to the AI-slop Mute,
  the `aggressive` setting, and the Aggressive entries in the options-page Actions
  legend and phrase-list note.
- **Popup redesign.** Reorganized the toolbar popup into labelled sections:
  - **Enabled** moved into the header as a prominent master switch.
  - **Posts** header now carries the `M mute · S solo` key (the standalone legend is gone).
  - **AI-slop** gets its own section holding the sensitivity slider and *Hide AI-slop comments*.
  - **Feed display** groups the stub options.
  - Footer link **"Details & activity" → "Advanced Settings"**.
  - Slightly wider popup; each option's label + hint stays on one line (no mid-label wrapping).
- **Clearer display labels.** *Names → "Show author"*, *+ sample → "Show sample"*,
  *Hide Hidden Content → "Hide hidden content"*, *Digest runs → "Collapse hidden content"*.
- **"Show sample" now works on its own** — it no longer requires "Show author"; with
  author off it renders just the sample line + category (previously the checkbox was
  greyed out until author was on).

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

[0.4.2]: https://github.com/newellnarco/Feedhacker/compare/v0.4.1...HEAD
[0.4.1]: https://github.com/newellnarco/Feedhacker/releases/tag/v0.4.1
[0.4.0]: https://github.com/newellnarco/Feedhacker/releases/tag/v0.4.0
[0.3.0]: https://github.com/newellnarco/Feedhacker/releases/tag/v0.3.0
[0.2.0]: https://github.com/newellnarco/Feedhacker/releases/tag/v0.2.0
