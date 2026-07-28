# Reviewer status

**Greptile and Aikido — CANCELLED (2026-07-28).**

Both hosted PR reviewers were cancelled as **too configuration-heavy / not
functioning without excessive setup** — more configuration than CodeRabbit,
Qodo, or Gemini CI ever required, and judged a failure:

- **Greptile** reviewed PRs only after per-repo config (`triggerOnDrafts`, since
  PRs open as drafts), and gated its status check on a dashboard-only **5/5**
  confidence threshold that blocked otherwise-clean PRs.
- **Aikido** skipped draft PRs by default, and never surfaced its baseline
  findings as GitHub issues without a *separate* Task Trackers → GitHub Issues
  integration — so it produced no actionable output.

**In effect now:** `greptile.json` removed. Review going forward: **CI** +
**CodeRabbit** (where enabled) + **shift-left self-review** against
`best_practices.md`.

**Owner action to finish the cancellation** (cannot be done from code): uninstall
the **Greptile** and **Aikido** GitHub Apps from the account, and remove any
required "Greptile Review" / Aikido status checks from branch protection.
