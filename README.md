# FeedHacker

**Mute the noise in your LinkedIn feed.** FeedHacker is a Chrome (Manifest V3)
extension that hides AI‑generated "slop," promoted posts, engagement‑bait
reshares, newsletter funnels, hiring posts, and other low‑signal content from
your LinkedIn home feed — driven by a per‑filter **Mute / Solo** mixer.

> Unofficial, unaffiliated with LinkedIn. Runs entirely in your browser; nothing
> is sent to any server.

**[Install from the Chrome Web Store ↗](https://chromewebstore.google.com/detail/feedhacker/kccajfoghkplakndamlohpepopdpelkb)**
· [Changelog](CHANGELOG.md) · [Releases](https://github.com/newellnarco/Feedhacker/releases/latest)

---

## What it does

FeedHacker watches your LinkedIn **home feed** (`linkedin.com/feed/`) and, for
each post, decides whether it matches one of your enabled filters. Matches are
collapsed to a small grey stub ("AI Slop • *why*") with a **Show anyway** button,
or removed entirely if you prefer.

### Filters

| Filter | What it catches |
| --- | --- |
| **AI slop** | Posts that read as AI‑generated, scored by a structural algorithm (see below) — not just a fixed word list. The model self‑tunes to your feed; the Aggression slider sets how much of it to hide. |
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

Each stub shows the **rule the post violated** inline with its action buttons. Turn on
**Show author** to add who posted, and **Show sample** to preview a line of the post — so
you can judge a borderline AI‑slop call in place without clicking **Show anyway**.

It **tunes itself**: FeedHacker reviews the posts you see and, on its own,
down‑weights tells that fire on most of your feed (so one common signal can't
flag everything) and sets the threshold from the score distribution so only the
sloppiest slice is hidden — no clicking required. The **Aggression** slider picks
how big that slice is. The model is **living**: each cycle it evolves from its
latest weights rather than resetting to the shipped defaults, so it keeps adapting
to your feed across sessions (and reaps old observations after each round so the
buffer stays small).

Your own corrections still count, a little less than the autonomous signal:
clicking **Show anyway** teaches a false positive, the **👍 slop** button or
**Hide again** confirms a true positive, and a post you simply **scroll past**
(still hidden) counts as a weak confirmation. Everything is stored locally;
export/import or reset the model any time. Self‑tuning can be turned off under
**Advanced**, and then your corrections alone drive the weights.

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

- **AI‑slop Aggression slider** — set how much of the feed to hide, from *strict*
  to *aggressive*, in the popup; the self‑tuning model honors it as its target.
- **Filter beyond the home feed** (opt‑in) — also clean permalinks, search
  results, profiles, and company pages.
- **Insights** — the options page keeps 30 days of daily hidden counts and your
  top sources.
- **Export / import the learned model** — back it up or move it between browsers.
- **How AI‑slop detection works** — an options‑page panel that shows every scoring
  signal with its plain‑English description and your current learned weight, plus
  the full curated phrase list (searchable) — so you can see exactly why a post is
  flagged.
- **Actions legend** — an options‑page card explaining what the Mute / Solo
  buttons each affect.

### Extra options

- **Enable / disable** — a master switch in the popup pauses all filtering
  without uninstalling.
- **Show author** — stub shows *who* posted plus the category.
- **Show sample** — previews a line of the hidden post's text in the stub (with the
  author line too when *Show author* is on). Works on its own.
- **Hide hidden content** — remove matched posts entirely (no placeholders).
- **Hide AI‑slop comments** — also collapse AI‑slop comments under posts.
- **Toolbar badge** — shows how many posts are hidden on the page, or a red `!`
  if something errored.
- **Options page** — properties/details, per‑filter activity, and the error log
  (open it from the popup's "Advanced Settings" link).
- **"Load more posts"** — a grafted button that drives LinkedIn's own
  infinite‑scroll loader so a batch that's entirely filtered doesn't dead‑end
  your feed.

---

## Install

**[➡ Install from the Chrome Web Store](https://chromewebstore.google.com/detail/feedhacker/kccajfoghkplakndamlohpepopdpelkb)** —
one click, no dev mode, and Google auto‑updates you. This is the recommended way
to install. (Publishing materials and the release process live in
[`store/`](store/README.md).)

Prefer not to use the store? Grab a prebuilt release — no build, no source, no
account. See **[INSTALL.md](INSTALL.md)** for the full walkthrough (managing,
updating, troubleshooting), and **[CHANGELOG.md](CHANGELOG.md)** for what's new in
each version.

> Off the Web Store, Chrome requires one manual "Load unpacked" step. The options
> below are the closest no‑account path: a prebuilt download plus that single click.

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
feed.js           pure DOM layer — find posts, classify, collapse/reveal
logger.js         pure error-log ring buffer helpers
content.js        glue — storage, banlist, learned weights, authors, errors, observer
background.js     service worker — per-tab badge (hidden count / error state)
popup.html/.js    Mute/Solo mixer + master switch + Aggression slider + links
options.html/.js  details, activity, insights, custom filters, authors, model I/O
styles.css        stub + load-more styling
claudisms.json    the AI-slop phrase banlist (one signal feeding the scorer)
scripts/build.mjs packages the runtime files into dist/ + a zip (cross-platform Node)
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

- No network requests — the curated `claudisms.json` phrase list ships inside the
  extension package and is read locally; nothing is sent or fetched from any server.
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
npm install         # dev-only: typescript, jsdom, playwright
npm run typecheck   # tsc --noEmit
npm test            # unit + integration (node:test + jsdom)
npm run test:system # builds, then drives the extension in real headless Chromium
npm run build       # tsc + package dist/feedhacker/ and a versioned zip (Node)
```

Tests are split by level: `test/unit/` (pure modules), `test/integration/`
(modules wired via jsdom + a mock `chrome`), and `test/system/` (the packaged
extension in a real browser). CI runs each as its own job.

- Pure logic (`filters`, `selectors`, `matcher`, `scorer`, `authors`,
  `customfilters`, `feed`, `logger`) attaches a typed API to the shared global
  and to `module.exports`, so it runs under jsdom (the tests require the compiled
  `build/*.js`).
- CI (`.github/workflows/ci.yml`) runs typecheck, the test suite, and the build
  on every push and PR.
- **Automated code review** — [Qodo Merge](https://qodo-merge-docs.qodo.ai/) reviews
  each PR (summary, security/test notes, inline suggestions), tuned via
  [`.pr_agent.toml`](.pr_agent.toml). It runs through the hosted Qodo Merge GitHub
  App (free for public repos — no API key). Comment `/review`, `/describe`,
  `/improve`, or `/ask` on a PR to trigger it manually.
- To update the slop banlist, edit `claudisms.json` (see the `matchTypes` and
  `fields` docs inside the file).
