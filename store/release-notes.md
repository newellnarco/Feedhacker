# Store release notes — what users see, per version

The Chrome Web Store has **no dedicated "What's new" field**: a listing has one description,
and anything version-specific has to live inside it. So this file holds the short, user-facing
note for each released version, and `npm run store:notes` appends the most recent few to the
description from [`listing.md`](listing.md) to produce the exact text to paste into the
Developer Dashboard.

Three rules keep it useful:

- **Newest first, one `## <version>` heading per released version.** A unit test
  (`test/unit/store-notes.test.js`) fails the build if the version in `manifest.json` has no
  entry here, so the notes cannot silently stop tracking what shipped.
- **Written for a user deciding whether to install or update**, not for a maintainer. Two or
  three lines. What changed for them, not why the code was wrong. The engineering account lives
  in [`../CHANGELOG.md`](../CHANGELOG.md) and the bug ledger.
- **Only what a user can notice.** Internal fixes, test changes and records work do not belong
  in a store listing.

---

## 0.10.0

**Grouping now works on a mixed feed.** *Group flagged posts* only ever folded posts that were
next to each other *and* hidden by the same filter, so on a feed where the kinds alternate it did
nothing and you saw a stub for every post. A run of filtered posts is now tidied into one row per
filter — still never mixing kinds, and still in place, so nothing moves in your feed.

The options page now explains the small splat on posts FeedHacker **shows** you: clicking it
hides the post and tells the filter it missed one. **Show anyway** and **Hide again** are
described there too, so every button in the feed is spelled out in one place.

## 0.9.1

Insights now shows **which filter** hid your posts, not just how many — a per-kind table for
the last 30 days, noisiest first.

Buttons on a hidden post no longer need a second click: the background re-check now gets out of
the way the moment you press a control, instead of a moment after.

## 0.9.0

**Fixes a bug that was quietly making AI-slop detection worse.** FeedHacker was re-checking the
whole feed every 1.5 seconds and counting the same handful of posts over and over, which taught
it that the clearest sign of AI writing was ordinary — so it started catching less. A post is
now judged once, and this update **resets the AI's learning for you automatically**, so
detection starts again from the shipped algorithm. Your mute settings, muted authors and custom
filters are untouched.

Hidden posts are also no longer lumped into one row when they were hidden for different reasons,
and you can now tell FeedHacker it **missed** one: posts it decides to show carry a small slop
button that hides the post and teaches the model in the same click.

## 0.8.0

Every filter is now a simple on/off, and the popup is regrouped to match — **AI slop** at the
top with its own toggle and sensitivity slider, since it is a learned model rather than a fixed
rule, and the plain post kinds below under **Also hide**.

## 0.7.0

Better AI-slop accuracy on short posts and comments, and the sensitivity slider now has a real
effect across its whole range.
