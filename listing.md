# Chrome Web Store listing — FeedHacker

Copy-paste content for the [Developer Dashboard](https://chrome.google.com/webstore/devconsole).
Upload `dist/feedhacker-<version>-store.zip` (built by `npm run build`; manifest.json is
at the zip root, as the store requires).

## Product details

- **Publisher:** MAX Research Collective — set this as your **publisher display name** in
  the Developer Dashboard (Account → Publisher / group publisher). It is an account
  setting, not a manifest field; the manifest carries it as `author` for reference.
- **Name:** FeedHacker
- **Summary** (≤132 chars): Mute the noise in your LinkedIn feed — AI slop, promoted posts, engagement-bait reshares, and more, with a Mute/Solo mixer.
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
- **`optional_host_permissions: https://raw.githubusercontent.com/*`** — Requested
  **only at runtime, only if** the user clicks "Update banlist now", to fetch the
  curated AI-slop phrase list from the project's own GitHub-hosted file. Scoped to that
  single host, not requested on install, and the fetched list is stored only in the
  user's local browser storage.

## Data usage disclosures (Privacy practices tab)

- Does the extension collect user data? **No.**
- Remote code? **No** — all code is in the package; no eval of remote scripts.
- Data sold to third parties? **No.**
- Data used only for the single purpose above? **Yes** (and it never leaves the device).
- **Privacy policy URL:** host `store/privacy-policy.md` (e.g. via GitHub Pages or the
  raw file URL) and paste that link.

## Graphics checklist (you supply screenshots)

- [x] Store icon 128×128 (icons/128.png)
- [ ] 1–5 screenshots, 1280×800 or 640×400 (e.g. the popup mixer over a LinkedIn feed,
      a collapsed slop stub, the options/insights page)
- [ ] Optional: small promo tile 440×280
