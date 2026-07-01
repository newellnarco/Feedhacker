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
collapsed to a small grey stub ("AI Slop • *matched phrase*") with a **Show
anyway** button, or removed entirely if you prefer.

### Filters

| Filter | What it catches |
| --- | --- |
| **AI slop** | Posts containing tell‑tale AI phrasing, drawn from a ~100‑entry banlist (`claudisms.json`) of words, phrases, and structural tics. Includes an **Aggressive** mode for broader, higher‑false‑positive rules. |
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
  Solo wins over mute: if anything is soloed, the feed is filtered down to just
  those kinds.

### Extra options

- **Name names** — stub shows *who* posted plus the category.
- **Hide Hidden Content** — remove matched posts entirely instead of leaving a
  placeholder stub.
- **Hide AI‑slop comments** — also collapse AI‑slop comments under posts.
- **Toolbar badge** — shows how many posts are currently hidden on the page.
- **"Load more posts"** — a grafted button that drives LinkedIn's own
  infinite‑scroll loader so a batch that's entirely filtered doesn't dead‑end
  your feed.

---

## Install (Chrome / unsigned dev build)

This is an unsigned developer build — installing takes about a minute.

1. Unzip `feedhacker-0.1.0.zip` (or clone this repo).
2. Open `chrome://extensions` (paste it into the address bar).
3. Turn on **Developer mode** (top‑right toggle).
4. Click **Load unpacked** and select the unzipped `feedhacker` folder (the one
   containing `manifest.json`).
5. Click the toolbar puzzle icon 🧩 and **pin** FeedHacker.
6. Open your LinkedIn feed, click the FeedHacker icon, and mute the noise.

Works in any Chromium‑based browser that supports Manifest V3 (Chrome, Edge,
Brave, Arc, etc.).

---

## How it works

FeedHacker is split into small, single‑purpose files. The design separates
*pure logic* (unit‑testable, no browser APIs) from the *glue* that touches
Chrome and the live DOM.

```
manifest.json     MV3 config: content scripts, permissions, popup, service worker
inject.js         MAIN-world hook (document_start) — patches IntersectionObserver
matcher.js        pure regex/string matcher over the banlist
feed.js           pure DOM layer — find posts, classify, collapse/reveal
content.js        glue — storage, banlist fetch, MutationObserver, badge, load-more
background.js     service worker — per-tab badge showing hidden count
popup.html/.js    the Mute/Solo mixer UI
styles.css        stub + load-more styling
claudisms.json    the AI-slop banlist (words, phrases, regex tics)
```

**Content‑script pipeline**

1. **`content.js`** (glue) loads your saved settings from `chrome.storage.sync`,
   fetches `claudisms.json`, and hands it to `matcher.js` to compile a list of
   regex matchers.
2. A debounced **`MutationObserver`** (plus a slow 8s safety‑net interval) calls
   into `feed.js` whenever the feed changes.
3. **`feed.js`** finds each post by LinkedIn's hidden `<h2>Feed post</h2>`
   heading (the visible feed CSS classes are hashed and unstable), walks up to
   the post's container, and extracts the post body **excluding comments** so a
   phrase in a comment doesn't flag the post itself.
4. For each active filter it classifies the post (regex against the banlist for
   slop; DOM/text heuristics for promoted, hiring, reshares, etc.) and, on a
   match, **collapses** the post to a stub — or reveals it with an explainer if
   you click "Show anyway."
5. **`background.js`** receives a message with the hidden count and paints the
   toolbar badge for that tab.

**The IntersectionObserver hook (`inject.js`)**

LinkedIn loads more posts via an `IntersectionObserver` on a bottom sentinel;
faking a scroll event doesn't trigger it. So `inject.js` runs in the page's MAIN
world at `document_start`, wraps the native `IntersectionObserver`, and records
the callbacks LinkedIn registers. When you hit **Load more posts** (or scroll
near the bottom), `content.js` dispatches a token‑named event that asks the hook
to invoke LinkedIn's *own* loader callback with a synthetic "intersecting"
entry — calling LinkedIn's real load‑more code directly. A per‑load random token
(shared via a DOM attribute) keeps blind/hardcoded‑name page scripts from
abusing the hook.

**Settings** live in `chrome.storage.sync`, so they follow your Chrome profile
and apply live — toggling a filter re‑reveals everything and re‑applies without
a reload.

---

## Privacy

- No network requests except fetching the bundled `claudisms.json` from the
  extension itself.
- Only permission requested is `storage` (to save your filter settings).
- Runs only on `https://www.linkedin.com/*`, and only acts on the home feed.

---

## Development notes

- Pure logic lives in `matcher.js` and `feed.js`; both export a CommonJS API
  (`module.exports`) so they can be exercised under jsdom without a browser.
- No build step, bundler, or dependencies — load the folder unpacked and edit
  in place.
- To update the slop banlist, edit `claudisms.json` (see the `matchTypes` and
  `fields` docs inside the file).
