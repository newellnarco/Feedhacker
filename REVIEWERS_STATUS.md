# Reviewer status

**No hosted AI PR reviewer is in use on this repo.** CodeRabbit, Greptile, and Aikido have
all been cancelled. Review going forward: **CI** (three tiers) + **shift-left self-review**
against [`best_practices.md`](best_practices.md), done *before* pushing.

## CodeRabbit — CANCELLED (2026-07-29)

Cancelled by the maintainer. `.coderabbit.yaml` removed, and the standing rules in
[`CLAUDE.md`](CLAUDE.md) no longer route around it — PRs no longer wait on a bot review, so
**green CI is the merge gate** and the self-review against `best_practices.md` is the only
review step. Prior CodeRabbit findings stay credited in
[`KNOWN_ISSUES.md`](KNOWN_ISSUES.md)'s **Found by** column; that history is worth keeping.

**Owner action to finish the cancellation** (cannot be done from code): uninstall the
**CodeRabbit** GitHub App from the account, and remove any required "CodeRabbit" status
check from branch protection — it posts a `CodeRabbit` commit status that would otherwise
sit pending forever on new PRs.

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
