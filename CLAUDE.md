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

**Always open PRs under the maintainer's GitHub username (`newellnarco`).** Never open a
FeedHacker PR from a different account or bot identity.

- **Verify the identity before you open a PR** — don't assume. Call `get_me` (GitHub MCP) and
  confirm `login` is `newellnarco`. If it returns any other login, **stop and tell the user**
  instead of opening the PR — a PR opened under the wrong account can't be reassigned after the
  fact. PRs created with this session's GitHub token normally already pass this check; run it anyway.

- **No hosted AI PR reviewer is in use** (see [`REVIEWERS_STATUS.md`](REVIEWERS_STATUS.md) —
  CodeRabbit, Greptile, Aikido all cancelled). Review is **CI + shift-left self-review against
  [`best_practices.md`](best_practices.md)**. Do the self-review before you push, not after: the
  rulebook is the checklist, and there is no bot coming behind you to catch what you skip.
- **Open PRs as drafts** while CI runs, then promote to ready + merge once CI is green. There's no
  review to wait for, so green CI is the gate — don't sit on a PR expecting a bot comment.
- **One PR per branch** (reuse over creation). If the branch's PR is already merged, restart the
  branch from the latest default branch for the next change.

## Code review & the learning loop (standing rule)

**Close the loop on every real bug — four things, same PR when practical:**
1. the **fix**;
2. a **regression test** at the tier that would have caught it (see Testing below);
3. a row in [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md) (root cause → fix PR → the test, with a **Found
   by** attribution — keep recording it, it's how we see where bugs actually come from);
4. if it's a general class, a numbered rule in [`best_practices.md`](best_practices.md), the
   project's coding standard. **If the same class bites twice, the standard was missing — add it.**
   Keep `best_practices.md` and `KNOWN_ISSUES.md` current; they are how a bug class gets paid for
   exactly once, and with no bot reviewer they're the whole review apparatus.

## Testing (standing rule)

**Everything built, and every bug fixed, ships the test triad** — unit + integration + system —
at the lowest tier that catches it. A fix without a regression test isn't done. Use
[`TEST_MATRIX.md`](TEST_MATRIX.md) to decide what a change's **blast radius** obliges: touching a
dependency core (`filters.ts`, `selectors.ts`, `scorer.ts`, build/manifest) runs the full triad;
presentational UI is gated by `tsc` + build; docs-/records-only changes run nothing. Don't
over-shard a fast suite — one CI job per tier is enough. **Done means on the live feed:** a
scan/scoring/filter change is finished only when a system-tier test drives it in a real browser,
not merely when a pure-module unit test is green.

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
