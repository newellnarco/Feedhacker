# FeedHacker — Privacy Policy

_Last updated: 2026-07-06_

FeedHacker is a browser extension that filters low-signal posts out of your LinkedIn
home feed. This policy explains what it does and does not do with your data.

## Summary

**FeedHacker does not collect, transmit, or sell any personal data.** Everything it does
happens locally in your browser.

## What FeedHacker stores

FeedHacker uses your browser's local extension storage (`chrome.storage`) to save, on
your device only:

- Your filter settings (which filters are muted/soloed, sensitivity, custom
  word/regex/hashtag/company filters, muted authors).
- A small AI-slop scoring model that adapts to your corrections.
- Local activity counts (how many posts were hidden) shown on the options page.
- A short local error log to help diagnose problems.

This data never leaves your device and is not sent to us or anyone else. Uninstalling
the extension (or clearing its storage) removes it.

## What FeedHacker accesses

- It reads the content of posts on `www.linkedin.com` while you view your feed, in order
  to decide which posts to hide. This reading happens locally and in real time; post
  content is not stored or transmitted.
- **Optional banlist update (off by default):** if you click "Update banlist now" on the
  options page, FeedHacker asks for permission scoped to the project's own files on GitHub
  (`https://raw.githubusercontent.com/newellnarco/Feedhacker/*`) and fetches its curated
  AI-slop phrase list from there. Only then does it make a network request, and only to
  that address. The fetched list is stored locally on your device; no personal data is
  sent, and nothing about you is included in the request.

## What FeedHacker does NOT do

- No analytics, tracking, or telemetry.
- No accounts, no advertising, no selling or sharing of data.
- No remotely-executed code — all logic ships inside the extension package.

## Contact

FeedHacker is published by **MAX Research Collective**.
Questions: open an issue at https://github.com/newellnarco/Feedhacker/issues

FeedHacker is unofficial and not affiliated with, endorsed by, or sponsored by LinkedIn.
