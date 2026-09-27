# Reviewer status

**CodeRabbit reviews this repo again, throttled** (re-enabled 2026-09-27, below). It is
**advisory**: **green CI (three tiers) is still the merge gate**, and **shift-left self-review**
against [`best_practices.md`](best_practices.md), done *before* pushing, is still the first
review. Never wait on a bot comment, and never read its silence as approval.

## CodeRabbit — RE-ENABLED with the slow-lane throttle (2026-09-27)

**The maintainer re-enabled CodeRabbit on FeedHacker on 2026-09-27, explicitly reversing the
2026-07-29 removal below.** It comes back on the standard newellnarco throttle, which is built
to avoid exactly what made the old config expensive (reviewing drafts, and re-reviewing on every
push). The removal section is kept as history; **this section is current.**

### How CodeRabbit counts (why the throttle exists)

Source: <https://docs.coderabbit.ai/management/rate-limits>.

- **One review per push, not per commit.** Three commits pushed together cost one review.
- **A push while a review is running (~5 min) supersedes it, and the superseded review is still
  charged.**
- **These also count as reviews:** marking a draft ready, force-push / rebase / reopen, the
  **Update branch** and **Resolve conflicts** buttons, web-UI edits, and every
  `@coderabbitai review`.
- **Slow lane:** sustained activity over the last 24 h / 7 days lowers the hourly refill rate.
- **A rate limit is a CodeRabbit comment plus a *passing* "Review rate limited" check**, never
  HTTP 429. Anything that automates requests must read the comment.
- **`@coderabbitai rate limit` is free**: it reports the remaining allowance without using a
  review.

### The config ([`.coderabbit.yaml`](.coderabbit.yaml))

- `reviews.auto_review.auto_incremental_review: false`: only the opening push is reviewed
  automatically; later pushes are reviewed only on request.
- `reviews.auto_review.auto_pause_after_reviewed_commits: 1`: if incremental review is ever
  turned back on, it pauses early.
- `reviews.auto_review.drafts: false`: PRs open as drafts while CI runs (`CLAUDE.md`), so the
  review happens once, when the PR is marked ready. Bot authors and `WIP` / `[skip review]` /
  `[no review]` titles are skipped.
- `reviews.request_changes_workflow: false`: the bot never blocks a PR.
- `reviews.path_filters` exclude machine-written output: `package-lock.json`, `build/` (tsc
  output and the generated `banlist.js`), `dist/` plus `*.zip` / `*.msi` (the packaged extension
  from `npm run build` and the release assets), `installer/windows/payload/` (the release-time
  copy of `dist/feedhacker/`), and any minified or vendored code. `types/feedhacker.d.ts` is
  hand-written, so it stays reviewed.
- `reviews.path_instructions` carry the two lessons from its last reviews here: don't suggest
  renumbering `best_practices.md` (the §N numbers are stable identifiers), and don't treat our
  own `manifest.json`, icons or store assets as untrusted input.
- `knowledge_base.code_guidelines` points at `best_practices.md`, so its findings are grounded in
  the same rulebook we self-review against (`CLAUDE.md` is in CodeRabbit's defaults).

### How to use it

1. **Self-review first, then open the PR as a draft.** Batch fixes into **one push**. Mark the PR
   ready **once**, which triggers the one automatic review.
2. **Ask for a re-review only through the throttle-aware script**, never with raw or repeated
   comments:
   ```bash
   scripts/coderabbit-review.sh <pr>            # waits out a running review, honours rate-limit notices, then asks once
   scripts/coderabbit-review.sh <pr> --full     # full re-review
   scripts/coderabbit-review.sh <pr> --status   # "@coderabbitai rate limit" (free), at most once an hour
   scripts/coderabbit-review.sh <pr> --dry-run  # show what it would post
   ```
   It needs an authenticated `gh` and `jq`. Tunables: `CR_MAX_RETRIES` (4), `CR_BASE_DELAY`
   (120 s), `CR_MAX_DELAY` (3600 s).
3. **Don't push again for ~5 minutes after requesting a review**; that push would supersede the
   review and still be charged.
4. **Agents and automation follow the same logic.** Claude sessions here have **no `gh` CLI**
   (`CLAUDE.md`), so a session that wants a re-review does by hand, with the GitHub MCP tools, what
   the script does: check that no CodeRabbit check is still running on the head commit; read the
   latest CodeRabbit comment and wait out any rate-limit notice (exponential backoff with jitter
   when it names no time); post `@coderabbitai review` **at most once per push**; give up after
   four attempts. **Never request on a timer.** No workflow in `.github/workflows/` requests
   CodeRabbit reviews, and none should.
5. **Findings are advisory.** Fix real bugs through the usual loop (fix, regression test,
   `KNOWN_ISSUES.md` row with **Found by: CodeRabbit**, `best_practices.md` rule if it is a class).
   Green CI still merges the PR.

**Don't touch:** CodeRabbit posts a `CodeRabbit` commit status that can sit pending. It must
**not** be a required status check in branch protection, or it could block merges forever.

## CodeRabbit — REMOVED from this repo (2026-07-29) — SUPERSEDED 2026-09-27

> **History, not current.** Reversed by the maintainer on 2026-09-27; see the section above.
> Kept so the sequence isn't re-litigated.

The maintainer **removed all repos from CodeRabbit except `max3` and `netsniff`**. FeedHacker
is not one of them, so **CodeRabbit no longer reviews this repo at all** and no FeedHacker PR
should expect or wait for its comments. It is still in use on those two sibling repos — so
this file is about FeedHacker only, and CodeRabbit conventions there don't apply here.

- **`.coderabbit.yaml` is deliberately absent and must not be recreated.** The old config
  forced reviews of draft PRs (`auto_review.drafts: true`) and re-reviewed on every push
  (`auto_incremental_review: true`), which is exactly the usage we don't want to pay for.
- **Never spend on review calls** — no paid plan for this repo, and no on-demand
  `@coderabbitai` commands (`review`, `full review`, autofix checkboxes); those consume paid
  quota.
- **If a stray CodeRabbit comment does appear**, treat it as advisory and unblocking. Two
  patterns from its last reviews here that were *not* worth acting on: flagging our own
  committed files (`manifest.json`, our own icons) as untrusted input needing path-traversal
  guards, and markdown-lint nits demanding the numbered rules in `best_practices.md` be
  renumbered — those numbers are stable `§N` identifiers grouped by topic, not an ordered
  list, so renumbering would break cross-references across the docs.
- **One thing to watch:** CodeRabbit posts a `CodeRabbit` commit status that can sit pending.
  If it is ever a *required* status check in branch protection it would block merges forever —
  remove it from the required list.

Prior CodeRabbit findings stay credited in [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md)'s **Found by**
column; that history is worth keeping.

> **History (so a later session doesn't re-litigate this):** within 2026-07-29 the state moved
> three times — CodeRabbit was configured and paid (Pro Plus), then the repo config was deleted
> and it was called cancelled, then it was described as kept on the free tier, and finally the
> repo was removed from CodeRabbit's list entirely. **The last of those held until the 2026-09-27
> re-enable above.** The bot
> self-reported `Plan: Pro Plus` on PRs #55–#57 while all this was in flight, which is why the
> intermediate records were wrong.

## Greptile and Aikido — CANCELLED (2026-07-28)

Both were cancelled as **too configuration-heavy / not functioning without excessive
setup** — more configuration than CodeRabbit, Qodo, or Gemini CI ever required, and judged
a failure:

- **Greptile** reviewed PRs only after per-repo config (`triggerOnDrafts`, since PRs open as
  drafts), and gated its status check on a dashboard-only **5/5** confidence threshold that
  blocked otherwise-clean PRs.
- **Aikido** skipped draft PRs by default, and never surfaced its baseline findings as
  GitHub issues without a *separate* Task Trackers → GitHub Issues integration — so it
  produced no actionable output.

`greptile.json` removed.

**Owner action to finish the cancellation:** uninstall the **Greptile** and **Aikido**
GitHub Apps from the account, and remove any required "Greptile Review" / Aikido status
checks from branch protection.
