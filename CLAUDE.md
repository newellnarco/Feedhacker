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

- **CodeRabbit reviews this repo again, throttled and advisory** (re-enabled by the maintainer
  2026-09-27, reversing the 2026-07-29 removal — see [`REVIEWERS_STATUS.md`](REVIEWERS_STATUS.md);
  Greptile and Aikido stay cancelled). Review is still **CI + shift-left self-review against
  [`best_practices.md`](best_practices.md)** first. Do the self-review **before** you push, not
  after: the rulebook is the checklist, and the bot is a second opinion, not a safety net.
  - [`.coderabbit.yaml`](.coderabbit.yaml) reviews **only the opening push of a non-draft PR**
    (`auto_incremental_review: false`, `auto_pause_after_reviewed_commits: 1`, `drafts: false`).
    Don't turn draft or incremental reviews back on; that is what made the old config expensive.
  - **Every review costs quota, and CodeRabbit counts per push.** Batch fixes into one push, and
    don't push within ~5 minutes of a requested review (a superseded review is still charged).
  - **Request a re-review only through the throttle**: `scripts/coderabbit-review.sh <pr>`, or,
    since sessions have no `gh`, the same steps by hand with the GitHub MCP tools — no CodeRabbit
    check still running, no unexpired rate-limit comment (back off with jitter), **at most one
    `@coderabbitai review` per push**, four attempts at most, **never on a timer**.
    **If CodeRabbit is rate limited, wait only when the limit clears within 20 minutes**
    (`CR_MAX_WAIT`, all waits counted); a longer limit, or one naming no time, means proceed
    without a CodeRabbit review (the script exits 4).
    `@coderabbitai rate limit` is free and is how to check the allowance. No other
    `@coderabbitai` commands.
  - Its comments are **advisory and never blocking** — fix real bugs through the loop below.
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
   exactly once, and with only an advisory bot reviewer they're most of the review apparatus.

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

<!-- ACTIONS RULES: the canonical text lives in newellnarco/AlienInterface docs/ACTIONS_RULES.md. Every
     Claude repo of the owner carries this section word for word; change it there first, then everywhere. -->
## GitHub Actions: local first (the owner's hard rules, 2026-10-05)

The month's 3,000 included Actions minutes ran out on day 4. The owner said: *"begin the changes to work
locally across all repos as of now...immediately"*, *"only use hosted when really needed or for
needed items"* and *"make sure all claude repos follow this same hard and fast set of rules."* These
rules bind every Claude session in this repository.

1. **Local first.** Every job's `runs-on` defaults to the owner's PC with this exact expression
   (Muther recognises it byte for byte):
   `${{ (github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository) && (vars.RUNNER && fromJSON(vars.RUNNER) || vars.HOSTED_OK == 'true' && 'ubuntu-latest' || fromJSON('["self-hosted","linux","mother"]')) || 'ubuntu-latest' }}`
   Windows jobs use the same expression with `WINDOWS_RUNNER`, `windows-latest` and
   `["self-hosted","windows","mother"]`. With `RUNNER` unset, a job **waits for the PC**. It never falls
   back to GitHub-hosted by itself.
2. **GitHub-hosted only with `HOSTED_OK=true`.** Only **Muther or the owner** set it. MAX may set it
   only with their permission. It is a **monthly budget** decision, never a one-off OK. Muther sets it
   from the owner's monthly hosted budget and its pace, and may use it for catch-up in the down hours
   when local CI falls behind, never over the budget.
3. **Secrets never run on the owner's PC.** A job that reads a secret other than `GITHUB_TOKEN` stays
   on `ubuntu-latest` and carries a `# HOSTED ONLY: <reason>` comment. Its schedule is as sparse as
   its purpose allows: weekly unless the purpose needs more, and never every few minutes.
4. **Spend no minutes on nothing.**
   - Docs-only changes skip CI.
   - Drafts skip the expensive jobs.
   - The push to `main` after a merge re-runs only what the PC runs.
   - Run the repo's checks locally before pushing, and push once per round.
   - No empty commits or close-and-reopen to re-run CI.
5. **One air-traffic controller.** Muther coordinates every runner on the PC within one cap (MAX
   ONLINE), MAX/Scout's included. MAX asks Muther before running Scout. Nobody else starts, stops,
   renames or deletes a runner, and nobody else sets `RUNNER`, `WINDOWS_RUNNER`, `SCOUT_RUNNER` or
   `HOSTED_OK`.
6. **A new repository** gets a runner from Muther (RUNNER CONTROLS › SET UP RUNNER) before it gets
   workflows. Until then its jobs wait, or the owner allows `HOSTED_OK` for it.
7. **Public repositories** are the exception. Their hosted minutes are free, and a self-hosted runner
   must never run a stranger's code, so they stay on GitHub-hosted runners.
8. **Unsure, or need more budget? Ask Muther.** A session that is unsure how to proceed, or wants
   more hosted minutes, asks Muther how to get it done within the budget. She owns the plan, the cap
   and `HOSTED_OK`. MAX holds anyone who ignores these rules to them (the owner: *"and MAX if they
   need a beat down"*).
