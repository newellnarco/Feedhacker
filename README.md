# FeedHacker

**Mute the noise in your LinkedIn feed.** FeedHacker is a Chrome (Manifest V3)
extension that hides AI‑generated "slop," promoted posts, engagement‑bait
reshares, newsletter funnels, hiring posts, and other low‑signal content from
your LinkedIn home feed — driven by a per‑filter **Mute / Solo** mixer.

> Unofficial, unaffiliated with LinkedIn. Runs entirely in your browser; nothing
> is sent to any server.

---

## What it does

FeedHacker watches your LinkedIn **home feed** (`linkedin.com/feed/`) and, for
each post, decides whether it matches one of your enabled filters. Matches are
collapsed to a small grey stub ("AI Slop • *why*") with a **Show anyway** button,
or removed entirely if you prefer.

### Filters

| Filter | What it catches |
| --- | --- |
| **AI slop** | Posts that read as AI‑generated, scored by a structural algorithm (see below) — not just a fixed word list. Includes an **Aggressive** mode for broader, higher‑false‑positive rules. |
| **Promoted posts** | Sponsored/"Promoted" posts. |
| **Newsletter signups** | Newsletter subscribe funnels. |
| **Hiring posts** | "We're hiring", `#hiring`, "view job" cards, etc. |
| **Reaction reshares** | "X likes/celebrates/reposted this" engagement‑bait surfacing. |
| **New‑job announcements** | "Excited to announce I've joined…" |
| **Work anniversaries** | "Celebrating N years at…" |
| **Training & certification** | "I'm happy to share I earned…" |

Each filter has two independent toggles:

- **M (Mute)** — hide posts of this kind.
- **S (Solo)** — show *only* posts of soloed kinds and hide everything else.
  Solo wins over mute.

### AI‑slop scoring that learns

Rather than hiding a post the moment a single banned word appears, the AI‑slop
filter **scores** each post across a set of independent structural "tells" that
AI‑written LinkedIn prose leans on, and flags only when the combined evidence
crosses a threshold. Tells include:

- em‑dash density, "not X, but Y" framing, rule‑of‑three cadence,
- rhetorical fragments ("The result?"), emoji/bullet "listicle" layout,
- formal connectives, formula openers ("Here's the thing…"),
- unusually uniform sentence length, and
- the curated phrase banlist (`claudisms.json`) as **one weighted signal** among
  many (curated hits count more than common‑word ones).

It **learns** from you: clicking **Show anyway** on a flagged post teaches a
false positive; clicking **Hide again** after revealing confirms it. Each
correction nudges the model's weights (a one‑step online logistic update) stored
locally, so accuracy improves over time. Reset it any time from the popup or
options page.

### Author actions

Each hidden **post** stub carries two author controls:

- **Unfollow** — drives LinkedIn's *own* post menu to unfollow the author. It
  only ever runs from your click (never in bulk, on a timer, or during scans),
  acts one at a time, and uses realistic, jittered pointer/mouse input so it reads
  as a normal human action rather than automation.
- **Profile ↗** — opens the author's profile in a new tab, where you can block
  or report manually. Blocking is left manual on purpose — FeedHacker never
  automates it — which keeps you clear of automation‑detection risk.

### Extra options

- **Enable / disable** — a master switch in the popup pauses all filtering
  without uninstalling.
- **Name names** — stub shows *who* posted plus the category.
- **Hide Hidden Content** — remove matched posts entirely (no placeholder).
- **Hide AI‑slop comments** — also collapse AI‑slop comments under posts.
- **Toolbar badge** — shows how many posts are hidden on the page, or a red `!`
  if something errored.
- **Options page** — properties/details, per‑filter activity, and the error log
  (open it from the popup's "Details & activity" link).
- **"Load more posts"** — a grafted button that drives LinkedIn's own
  infinite‑scroll loader so a batch that's entirely filtered doesn't dead‑end
  your feed.

---

## Install

### Option A — Load unpacked (dev build, ~1 minute)

1. Get the folder: unzip `feedhacker-0.1.0.zip`, or clone this repo and run
   `npm run build` (produces `dist/feedhacker/` and `dist/feedhacker-0.1.0.zip`).
2. Open `chrome://extensions` (paste it into the address bar).
3. Turn on **Developer mode** (top‑right toggle).
4. Click **Load unpacked** and select the extension folder (the one containing
   `manifest.json`) — either the repo root or `dist/feedhacker/`.
5. Click the toolbar puzzle icon 🧩 and **pin** FeedHacker.
6. Open your LinkedIn feed, click the FeedHacker icon, and mute the noise.

### Option B — Build a zip to share

```bash
npm run build     # → dist/feedhacker-<version>.zip
```

Unzip it and follow steps 2–6 above. Works in any Chromium‑based browser with
Manifest V3 (Chrome, Edge, Brave, Arc, …).

### Enable, disable, or uninstall

- **Pause:** toggle **Enabled** off in the popup (keeps it installed).
- **Disable/enable fully:** `chrome://extensions` → FeedHacker → the toggle.
- **Uninstall:** `chrome://extensions` → FeedHacker → **Remove** (or right‑click
  the toolbar icon → **Remove from Chrome**).

---

## How it works

FeedHacker separates *pure logic* (unit‑testable, no browser APIs) from the
*glue* that touches Chrome and the live DOM.

```
manifest.json     MV3 config: content scripts, permissions, popup, options, worker
inject.js         MAIN-world hook (document_start) — patches IntersectionObserver
filters.js        shared source of truth: filter list, storage keys, DEFAULTS
matcher.js        pure regex/string matcher over the banlist
scorer.js         pure structural AI-tell scoring + online learning
feed.js           pure DOM layer — find posts, classify, collapse/reveal
logger.js         pure error-log ring buffer helpers
content.js        glue — storage, banlist fetch, learned weights, errors, observer
background.js     service worker — per-tab badge (hidden count / error state)
popup.html/.js    the Mute/Solo mixer + master switch + quick links
options.html/.js  details, per-filter activity, and error log
styles.css        stub + load-more styling
claudisms.json    the AI-slop phrase banlist (one signal feeding the scorer)
scripts/build.sh  packages the runtime files into dist/ + a zip
```

**Content‑script pipeline**

1. `content.js` loads settings from `chrome.storage.sync` and learned slop
   weights from `chrome.storage.local`, fetches `claudisms.json`, and compiles it
   with `matcher.js`.
2. A `MutationObserver` triages each batch (`feed.js` ignores FeedHacker's own DOM
   and attribute‑only churn) and, on real new content, schedules an **idle** scan.
3. `feed.js` finds each post by LinkedIn's hidden `<h2>Feed post</h2>` heading
   (the visible CSS is hashed), extracts the post body **excluding comments**, and
   classifies it — the AI‑slop verdict comes from `scorer.js`.
4. Matches collapse to a stub; **Show anyway / Hide again** feed corrections back
   into the learner.
5. `background.js` paints the badge (hidden count, or a red `!` on error).
6. Errors are captured with timestamps into `chrome.storage.local` and surfaced
   in the popup and options page.

**The IntersectionObserver hook (`inject.js`)** wraps the native observer in the
page's MAIN world to capture LinkedIn's own feed‑loader callback, then invokes it
directly (a token‑named event) so "Load more" drives LinkedIn's real load‑more
code instead of a synthetic scroll.

---

## Privacy

- No network requests except fetching the bundled `claudisms.json`.
- Learned weights, activity stats, and the error log stay in `chrome.storage`
  (local for large/learned data, sync for your toggle settings) — never sent
  anywhere.
- Only permission requested is `storage`. Runs only on
  `https://www.linkedin.com/*`, and only acts on the home feed.

---

## Development

No bundler, no framework — plain files loaded unpacked.

```bash
npm install     # dev-only: jsdom, for the DOM tests
npm test        # node:test + jsdom, 47 tests over the pure modules
npm run build   # package dist/feedhacker/ and a versioned zip
```

- Pure logic (`filters.js`, `matcher.js`, `scorer.js`, `feed.js`, `logger.js`)
  exports a CommonJS API so it runs under jsdom without a browser.
- CI (`.github/workflows/ci.yml`) runs the test suite on every push and PR.
- To update the slop banlist, edit `claudisms.json` (see the `matchTypes` and
  `fields` docs inside the file).
