# Chrome Web Store listing — FeedHacker

Copy-paste content for the [Developer Dashboard](https://chrome.google.com/webstore/devconsole).
Upload `dist/feedhacker-<version>-store.zip` (built by `npm run build`; manifest.json is
at the zip root, as the store requires).

## Product details

- **Publisher:** MAX Research Collective — set this as your **publisher display name** in
  the Developer Dashboard (Account → Publisher / group publisher). It is an account
  setting, not a manifest field; the manifest carries it as `author` for reference.
- **Name:** FeedHacker
- **Summary** (≤132 chars; matches the manifest description): Mute the noise in your LinkedIn feed: AI slop, promoted posts, engagement bait, hiring, and more — with a Mute/Solo mixer.
- **Category:** Productivity
- **Language:** English

### Detailed description

FeedHacker cleans up your LinkedIn **home feed**. For each post it decides whether the
post matches one of your enabled filters and, if so, collapses it to a small stub (with
a "Show anyway" button) or hides it entirely.

Filters you can Mute or Solo:
• AI slop — posts that read as AI-generated, scored by a structural algorithm that
  learns from your corrections (not just a word list)
• Promoted posts • Newsletter signups • Hiring posts • Reaction reshares
• New-job announcements • Work anniversaries • Training & certification

Each filter has independent **Mute** (hide this kind) and **Solo** (show only this kind)
toggles. Add your own word/regex/hashtag/company filters, mute specific authors, and see
what's been hidden.

Everything runs locally in your browser. FeedHacker does not collect, transmit, or sell
any data. It is unofficial and not affiliated with LinkedIn.

## Single purpose

FeedHacker has one purpose: filter low-signal posts out of the user's LinkedIn home feed
according to filters the user configures.

## Permission justifications

- **storage** — Save the user's filter settings and the locally-learned AI-slop model.
  Nothing is stored remotely.
- **Host access to `www.linkedin.com`** (content script) — Read the posts on the
  LinkedIn feed the user is actively viewing so matching posts can be hidden. The
  extension runs only on `www.linkedin.com`.

The extension requests no host permissions beyond `www.linkedin.com` and makes no
network requests — its curated AI-slop phrase list ships inside the package.

## Data usage disclosures (Privacy practices tab)

- Does the extension collect user data? **No.**
- Remote code? **No** — all code is in the package; no eval of remote scripts.
- Data sold to third parties? **No.**
- Data used only for the single purpose above? **Yes** (and it never leaves the device).
- **Privacy policy URL:** host `store/privacy-policy.md` (e.g. via GitHub Pages or the
  raw file URL) and paste that link.

## Graphics — all provided in this repo

- [x] **Store icon 128×128** — `store/brand/store-icon-128.png` (the FeedHacker **Fh** element
      mark on a **solid white background — no alpha**, which the store's store-icon field
      requires; a transparent-corner icon is rejected). A 120×120 variant is at
      `store/brand/store-icon-120.png`. The in-package toolbar icon is `icons/128.png` (that one
      keeps transparent corners — correct for the toolbar).
- [x] **Brand logo / lockup** — `store/brand/logo-1024.png` (the square Fh mark) and
      `store/brand/logo-lockup-1024.png` (the Fh mark beside the *FeedHacker* wordmark and
      **"created by www.MaxResearchCollective.com"**). Use the lockup wherever the store shows a
      brand image, so the MAX Research Collective credit is visible.
- [x] **Screenshots 1280×800** — `store/screenshot-1-mixer.png` (the Mute/Solo popup),
      `store/screenshot-2-detection.png` (the AI-slop detection panel), and
      `store/screenshot-3-stub.png` (a hidden post collapsed to its stub).
- [x] **Small promo tile 440×280** — `store/promo-small-440x280.jpg`.
- [x] **Marquee promo tile 1400×560** — `store/promo-marquee-1400x560.jpg`.

Screenshots, promo tiles, and the store icon are opaque (no alpha), as the store requires; only
the in-package toolbar icons (`icons/*.png`) use transparency for their rounded corners.
`npm run build` also
bundles this listing text, the privacy policy, and every graphic above into
`dist/feedhacker-<version>-store-submission.zip` (listing assets only — no manifest).
