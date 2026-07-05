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
- "broetry" (one‑thought‑per‑line) structure, unusually uniform sentence length, and
- the curated phrase banlist (`claudisms.json`) as **one weighted signal** among
  many (curated hits count more than common‑word ones).

It **learns** from you: clicking **Show anyway** teaches a false positive, the
**👍 slop** button or **Hide again** confirms a true positive, and a post you
simply **scroll past** (still hidden) counts as a weak confirmation. Each
correction nudges the model's weights (a one‑step online logistic update) stored
locally, so accuracy improves over time. Tune the cutoff with the sensitivity
slider, and export/import or reset the model any time.

### Author memory

FeedHacker learns which *authors* you don't want to see:

- **Mute author** — a one‑click button on each post stub. Muted authors are
  always hidden, regardless of content.
- **Always show (allowlist)** — trusted authors are never hidden, even if a post
  would otherwise score as slop.
- **Profile ↗** — opens the author's profile in a new tab, where you can
  unfollow/block/report in LinkedIn's own UI. FeedHacker never automates those.
- Muted/allowed lists are managed on the options page, which also shows your
  **top hidden sources**.

### Custom filters

Define your own rules on the options page — **words/phrases, regexes, hashtags,
and companies/authors** — to hide anything the built‑ins miss. They apply on top
of the standard filters.

### More controls

- **AI‑slop sensitivity slider** — dial the confidence threshold from *aggressive*
  to *strict* in the popup.
- **Digest mode** — collapse a run of consecutive hidden posts into a single
  "N low‑signal posts hidden" bar.
- **Filter beyond the home feed** (opt‑in) — also clean permalinks, search
  results, profiles, and company pages.
- **Insights** — the options page keeps 30 days of daily hidden counts and your
  top sources.
- **Export / import the learned model** — back it up or move it between browsers.
- **Remote banlist** (opt‑in, off by default) — point at a URL to pull extra
  banlist entries; fetching asks for permission for that one site only.

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

No build, no source, no account — grab a prebuilt release. See
**[INSTALL.md](INSTALL.md)** for the full walkthrough (managing, updating,
troubleshooting).

> Chrome only allows fully silent, one‑click installs from the Chrome Web Store.
> Until FeedHacker is listed there, the steps below are the closest no‑account
> path: a prebuilt download plus a single "Load unpacked" click.

### Option A — Windows one‑click bundle (recommended)

1. Download **`feedhacker-<version>-win.zip`** from the
   [**latest release**](https://github.com/newellnarco/Feedhacker/releases/latest).
2. Unzip it and double‑click **`installer/install.bat`**.
3. It installs the prebuilt extension, sets up **daily auto‑updates** (pulls each
   new green release from GitHub — no rebuilding), and opens Chrome for the
   one‑time **Load unpacked** click. Done. No admin, no Node, no Git.

### Option B — Prebuilt zip, any Chromium browser (~1 minute)

1. Download **`feedhacker-<version>.zip`** from the
   [latest release](https://github.com/newellnarco/Feedhacker/releases/latest) and
   unzip it (you get a `feedhacker/` folder containing `manifest.json`).
2. Open `chrome://extensions`, turn on **Developer mode** (top‑right).
3. Click **Load unpacked** and select the unzipped **`feedhacker/`** folder.
4. Pin it via the puzzle icon 🧩, open your LinkedIn feed, and mute the noise.

### Option C — Build it yourself (contributors)

```bash
npm install && npm run build   # → dist/feedhacker/ and dist/feedhacker-<version>.zip
```

Then load `dist/feedhacker/` via Option B, steps 2–4. Releases are cut
automatically by CI; see [`.github/workflows/release.yml`](.github/workflows/release.yml).

### Enable, disable, or uninstall

- **Pause:** toggle **Enabled** off in the popup (keeps it installed).
- **Disable/enable fully:** `chrome://extensions` → FeedHacker → the toggle.
- **Uninstall:** `chrome://extensions` → FeedHacker → **Remove** (or right‑click
  the toolbar icon → **Remove from Chrome**).

---

## How it works

FeedHacker separates *pure logic* (unit‑testable, no browser APIs) from the
*glue* that touches Chrome and the live DOM. Sources are **TypeScript** in
`src/*.ts`, compiled to `build/` and packaged into `dist/feedhacker/`. The list
below uses the compiled `.js` names (each has a matching `src/*.ts`).

```
manifest.json     MV3 config: content scripts, permissions, popup, options, worker
inject.js         MAIN-world hook (document_start) — patches IntersectionObserver
filters.js        shared source of truth: filter list, storage keys, DEFAULTS
selectors.js      centralized LinkedIn DOM contract + health probe (heartbeat)
matcher.js        pure regex/string matcher over the banlist
scorer.js         pure structural AI-tell scoring + online learning
authors.js        pure per-author memory (mute/allow, scores, top sources)
customfilters.js  pure compiler+matcher for user-defined filters
feed.js           pure DOM layer — find posts, classify, collapse/reveal, digest
logger.js         pure error-log ring buffer helpers
content.js        glue — storage, banlist, learned weights, authors, errors, observer
background.js     service worker — per-tab badge (hidden count / error state)
popup.html/.js    Mute/Solo mixer + master switch + sensitivity slider + links
options.html/.js  details, activity, insights, custom filters, authors, model I/O
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

TypeScript sources in `src/`, compiled with `tsc` to `build/` (no bundler — the
UMD/IIFE modules load as plain scripts). Shared types live in
`types/feedhacker.d.ts`. Type-checking runs in `strict` mode (including
`strictNullChecks`); `noImplicitAny` is left off because the code intentionally
uses dynamic property access in a few places.

```bash
npm install     # dev-only: typescript + jsdom
npm run typecheck   # tsc --noEmit
npm test        # compiles (pretest), then node:test + jsdom, 71 tests
npm run build   # tsc + package dist/feedhacker/ and a versioned zip
```

- Pure logic (`filters`, `selectors`, `matcher`, `scorer`, `authors`,
  `customfilters`, `feed`, `logger`) attaches a typed API to the shared global
  and to `module.exports`, so it runs under jsdom (the tests require the compiled
  `build/*.js`).
- CI (`.github/workflows/ci.yml`) runs typecheck, the test suite, and the build
  on every push and PR.
- To update the slop banlist, edit `claudisms.json` (see the `matchTypes` and
  `fields` docs inside the file).
