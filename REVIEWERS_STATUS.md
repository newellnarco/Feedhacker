# Reviewer status

**No AI reviewer is the merge gate on this repo.** Review is **CI** (three tiers) +
**shift-left self-review** against [`best_practices.md`](best_practices.md), done *before*
pushing. CodeRabbit is kept on the **free tier** as an advisory extra; Greptile and Aikido
are cancelled outright.

## CodeRabbit — FREE TIER ONLY, advisory (as of 2026-07-29)

The maintainer downgraded to the **free tier** (it costs nothing on a public repo) rather
than uninstalling the App. Ground rules:

- **Never spend money on review calls.** No paid plan, and no on-demand `@coderabbitai`
  commands (`review`, `full review`, autofix checkboxes) — those consume paid quota. Expect
  coverage to be **very limited**; that's fine and intended.
- **It is not the gate.** **Green CI is the merge gate.** Never hold a PR waiting for a
  CodeRabbit comment, and never treat its silence as approval.
- **Its findings are advisory.** Read them, take what's genuinely right, skip the rest. It is
  prone to flagging our own committed files (a `manifest.json`, our own icons) as untrusted
  input, and to markdown-lint nits about the numbered rules — those numbers are stable `§N`
  identifiers grouped by topic, not an ordered list, so **don't renumber or reorder them**.
- **`.coderabbit.yaml` is deliberately absent.** The old config forced draft reviews
  (`auto_review.drafts: true`) and re-reviewed every push (`auto_incremental_review: true`) —
  precisely the volume we don't want to buy. **Don't recreate it.** With no repo config it
  falls back to the account's Organization UI settings.
- **Drafts keep it cheap.** CodeRabbit skips draft PRs by default, and our flow opens every PR
  as a draft while CI runs — so most PRs cost nothing. (Observed: it skipped PR #56 with
  "Review skipped — Draft detected".)

Prior CodeRabbit findings stay credited in [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md)'s **Found by**
column; that history is worth keeping.

**One owner action, if it ever bites:** CodeRabbit posts a `CodeRabbit` commit status that can
sit pending on a PR. If it is ever a *required* status check in branch protection it would
block merges — remove it from the required list.

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
