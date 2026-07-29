# Reviewer status

**No AI reviewer runs on this repo.** Review is **CI** (three tiers) + **shift-left
self-review** against [`best_practices.md`](best_practices.md), done *before* pushing.
**Green CI is the merge gate** — there is no bot coming behind you, so the rulebook is the
checklist and the self-review is not optional.

## CodeRabbit — REMOVED from this repo (2026-07-29)

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
> repo was removed from CodeRabbit's list entirely. **The last of those is current.** The bot
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
