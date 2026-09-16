# FeedHacker — working notes for Claude

FeedHacker is a Manifest V3 Chrome extension that filters low-signal posts out of
the LinkedIn home feed (AI slop, promoted, hiring, corporate/brand, and more) with a
mute mixer (one on/off per kind, plus the AI-slop model with its own toggle and sensitivity
slider). TypeScript, no bundler; sources in `src/`, built by `npm run build`.

## Session continuity (standing rule)

A session has no memory of the last one. [`SESSION-STATE.md`](SESSION-STATE.md) **is** that
memory, and it only works if both ends are honoured:

- **START every session there.** Read it top to bottom — **§1 Open items** first, then §2 Current
  state and §6 Key facts — and run its **§3 Startup checklist** (skim the record → check the live
  store version → confirm the submission slot → report the next-release plan and ask
  ship-or-wait).
- **END every session there.** Before signing off, run its **§4 Close-out checklist**: update §1
  Open items, refresh §2 Current state, and add a dated **§5 Session log** entry. A closing
  session that leaves §1 stale has broken the handoff, whatever else it accomplished.

Two things keep the file trustworthy:

- **§1 Open items is the only to-do list.** If work is outstanding it goes there, with who it is
  waiting on. If it is not there, it is not open.
- **Record outcomes, never predictions** (`best_practices.md` §44/§45). When you claim an
  external system did something — a workflow, the Chrome Web Store — read its log first and write
  what it actually did.

`SESSION-STATE.md` holds *state*. Durable material belongs in its own record:
[`RELEASES.md`](RELEASES.md) (what shipped and where it stands),
[`CHANGELOG.md`](CHANGELOG.md) (what changed), [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md) (bugs and
fixes), [`best_practices.md`](best_practices.md) (lessons as rules).

## Pull requests (standing rule)

**Always open PRs under the maintainer's GitHub username (`newellnarco`).** Never open a
FeedHacker PR from a different account or bot identity.

- **Verify the identity before you open a PR** — don't assume. Call `get_me` (GitHub MCP) and
  confirm `login` is `newellnarco`. If it returns any other login, **stop and tell the user**
  instead of opening the PR — a PR opened under the wrong account can't be reassigned after the
  fact. PRs created with this session's GitHub token normally already pass this check; run it anyway.

- **No AI reviewer runs on this repo** (see [`REVIEWERS_STATUS.md`](REVIEWERS_STATUS.md) —
  CodeRabbit was removed from every repo except `max3`/`netsniff`; Greptile and Aikido cancelled).
  Review is **CI + shift-left self-review against [`best_practices.md`](best_practices.md)**. Do the
  self-review **before** you push, not after: the rulebook is the checklist, and there is no bot
  coming behind you to catch what you skip.
  - `.coderabbit.yaml` is **deliberately absent** — don't recreate it, and never invoke
    `@coderabbitai` commands (they consume paid quota). If a stray bot comment appears, it's
    advisory and never blocking.
- **Open PRs as drafts** while CI runs, then promote to ready + merge once CI is green. **Green CI
  is the merge gate** — never wait on a review comment, and never read silence as approval.
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

## What a session can and cannot reach (standing rule)

**Settled by testing, not assumption — do not re-litigate this, and do not try to route around
it.** These boundaries have cost more than one round-trip with the maintainer.

### GitHub Actions variables and secrets

| | |
|---|---|
| **The workflow** reading `${{ vars.X }}` / `${{ secrets.X }}` | ✅ works — that is ordinary Actions |
| **A session** reading them via the REST API | ❌ **403**, always |
| **A session** reading a *variable's value* out of a finished job log | ✅ **this is the way** |

A session *does* hold a `GITHUB_TOKEN`, and `GET /repos/:o/:r/actions/variables[/NAME]` *is* a real
endpoint — so "we have no token" and "no such API" are both wrong answers. What blocks it is this
environment's **agent proxy**, which refuses GitHub Actions paths outright:

```
HTTP 403  {"message":"Access to this GitHub Actions path is not permitted through this proxy."}
```

That is a deliberate boundary — an agent must not be able to read or write CI credentials — so
treat it as a wall, not an obstacle. There is no `gh` CLI, and the GitHub MCP server exposes no
variables tool.

**To read a variable's current value, read the job log.** A runner prints the `env:` block of each
step, and **variables appear in plain text while secrets are masked to `***`**. From Release run
#27, verbatim:

```
CWS_CLIENT_ID: ***                                   ← secret, masked
CWS_PUBLISHER_ID: project-46303a79-fd20-4ed8-859     ← variable, readable
CWS_AUTO_PUBLISH: true                               ← variable, readable
```

That is exactly how the wrong `CWS_PUBLISHER_ID` was identified (FH-055). So: **a changed variable
is verified by the next run that uses it, never ahead of time.** Say that plainly rather than
claiming you "can't use" the variable — the workflow uses it fine; only the *pre-run lookup* is
unavailable.

### Everything else

- **No `gh` CLI.** Use the `mcp__github__*` tools for all GitHub work.
- **Repo scope** is `newellnarco/feedhacker`. Other repos need `add_repo` first.
- **The GitHub API's job/run status lags**, sometimes by many minutes, and has served a job as
  `in_progress` long after it finished. When status and reality disagree, **read the job log** —
  it is authoritative — or re-read the run rather than trusting a cached `status` field.
- **`WebFetch` caches 15 minutes per URL.** To re-read a page that may have changed (the Chrome
  Web Store listing above all), **vary the URL** (`?hl=en-GB`, `?hl=en-CA`, …) and say which you
  used, or you will report a stale value as a fresh one.
- **The container is ephemeral and starts with no `node_modules`** — run `npm ci` before the first
  build or test.

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
