# FeedHacker — working notes for Claude

FeedHacker is a Manifest V3 Chrome extension that filters low-signal posts out of
the LinkedIn home feed (AI slop, promoted, hiring, corporate/brand, and more) with a
Mute/Solo mixer. TypeScript, no bundler; sources in `src/`, built by `npm run build`.

## Start here (standing rule)

**At the start of every session, read [`SESSION-STATE.md`](SESSION-STATE.md) and run its
Startup checklist** (review the record → check the live store version → confirm the store
submission slot is open → report next-release plan and ask ship-or-wait). Keep
`SESSION-STATE.md` and [`RELEASES.md`](RELEASES.md) updated as state changes.

## Pull requests (standing rule)

**Always open PRs under the maintainer's GitHub username (`newellnarco`).** CodeRabbit is
**single-user licensed** to that account, so a PR authored by any other identity won't be
reviewed. PRs created with this session's GitHub token are already `newellnarco`'s — keep it that
way; never open a FeedHacker PR from a different account or bot identity.

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

## Release record (standing rule)

Keep [`RELEASES.md`](RELEASES.md) current. It's the single source of truth for what
shipped in each version and where it stands. **The Chrome Web Store lags GitHub** (Google
review; one pending version at a time), so track the two separately. Update it whenever a
version's state changes, and only mark a version **Live** in the store column once it is
**confirmed published on the Chrome Web Store** — not when it was merely uploaded/submitted.
