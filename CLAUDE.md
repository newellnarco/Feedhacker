# FeedHacker — working notes for Claude

FeedHacker is a Manifest V3 Chrome extension that filters low-signal posts out of
the LinkedIn home feed (AI slop, promoted, hiring, corporate/brand, and more) with a
Mute/Solo mixer. TypeScript, no bundler; sources in `src/`, built by `npm run build`.

## Release policy (standing rule)

**Do not cut a release until the user explicitly says "ship."**
"Releasing" means any of: tagging `vX.Y.Z`, publishing a GitHub Release, or uploading
to the Chrome Web Store. Never do these on your own initiative.

Until the user says "ship":
- Keep developing, and **commit and merge PRs freely** (green CI, normal review).
- **Accumulate everything under the next version.** Keep `manifest.json` and
  `package.json` bumped to that next version, and record all changes under that
  version's section in `CHANGELOG.md` (don't split work into a separate "Unreleased"
  section while the version is still unreleased).
- **Tag each PR** with the target-version label (e.g. `v0.3.0`) so it's clear which
  release it's staged for.

When the user says "ship" (and any prior Chrome Web Store submission has cleared
review — the store rejects a new version while one is in review), cut the release via
the **Release** workflow: tag → GitHub Release with prebuilt assets → store upload.
