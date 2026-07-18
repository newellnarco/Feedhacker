# the_wall.md — FeedHacker work queue

The running queue we work from. Each item has a short **explanation**, a **code status**
(is it actually in the codebase?), and tracking for **Tested** and **Merged**.

**Process files (adopted from the sibling repos MAX3 / netsniff):**
[`best_practices.md`](best_practices.md) — the numbered rulebook CodeRabbit reads ·
[`KNOWN_ISSUES.md`](KNOWN_ISSUES.md) — the bug ledger ·
[`TEST_MATRIX.md`](TEST_MATRIX.md) — blast-radius test doctrine ·
[`.coderabbit.yaml`](.coderabbit.yaml) — reviews drafts, learns locally. The four-part
review loop and the testing/PR rules live in [`CLAUDE.md`](CLAUDE.md).

## Legend

**Code status** — what a review of the current code shows for each proposed change:

- ✅ **Done** — implemented in the codebase as proposed.
- 🟡 **Similar (not the same)** — the code does something in this area, but not what's
  proposed (different design, or only partly there).
- ⬜ **Backlog** — not in the code yet.

**Tested** — verified working (unit/integration/system tests and/or driven in a real browser).
**Merged** — landed on `main`.

---

## A. Proposed changes from the product page (boobridge.com/feedhacker/product) — ⛔ PENDING

I could **not** fetch <https://www.boobridge.com/feedhacker/product/> from this environment:
the session's egress policy **blocks that host** (the proxy returns `403` on CONNECT for
`www.boobridge.com`, confirmed via `$HTTPS_PROXY/__agentproxy/status`). Per the proxy rules I
must report the blocked host rather than route around it.

**To populate this section:** paste the page's content (or the list of proposed changes) into the
chat, or have `boobridge.com` added to the environment's network allowlist. Then each proposed
change gets a row below, cross-referenced against the code with a status of ✅ Done / 🟡 Similar /
⬜ Backlog — same as Section B.

| # | Proposed change | Explanation | Code status | Tested | Merged |
|---|---|---|---|---|---|
| — | _(awaiting product-page content — host blocked)_ | | | | |

---

## B. Current work queue — internal roadmap, reviewed against the code

These are the app's committed proposals from `roadmap.json`, each checked against the actual code.
The **open** items are the live queue; shipped items are collapsed at the bottom for reference.

### Open (the queue)

| ID | Item | Explanation | Code status | Tested | Merged |
|---|---|---|---|---|---|
| FH-038 | Refresh the first-run welcome page | The welcome page is unchanged since 0.2.0. Swap the decorative emoji (🧩 jigsaw + 📌 pushpin) for Chrome's own puzzle-piece + pin glyphs so the pinning guide matches the real toolbar, and freshen copy that still says "settings" (predates the 0.4.0 "Advanced Settings" rename). | 🟡 Similar — **puzzle-piece done** (swapped 🧩 for Chrome's gray Material "extension" glyph). **Remaining:** pin step still uses 📌; body copy still says "settings". | partial | in PR |
| FH-039 | Overhaul Hidden Post UX | Design doc proposes a clean **one-line** collapsed stub — category (+ Show anyway), author/sample only when opted in, Mute / Visit-profile in an author menu, no icons, never wrapping. | 🟡 Similar (not the same) — a stub exists (`src/feed.ts`) but it's the **icon-button cluster**, which has drifted from the one-line doc. Needs the overhaul. | ⬜ | ⬜ |
| FH-040 | Restore the FeedHacker "Fh" logo | Replace the current dark "M" mark with the original blue **"Fh"** badge that spoofs LinkedIn's "in", across the extension icons (16/32/48/128), the store listing, and the welcome page. | ⬜ Backlog — icons are still the "M" mark; the "Fh" art isn't applied. | ⬜ | ⬜ |
| NS-1 | Custom ast-grep rules for FeedHacker's hot bug-shapes | Add `.coderabbit/ast-grep/*.yml` rules so recurring classes are caught mechanically at $0: (a) a `chrome.*` call not preceded by a liveness/`contextAlive` guard (best_practices §6); (b) assigning user/post text to `innerHTML`/`insertAdjacentHTML` instead of `textContent` (§12); (c) a second `chrome.storage.*.set` on a key that already has a writer (§7). | ⬜ Backlog — only the community `essential_rules` pack is on; no custom rules yet. Needs care to avoid false positives. | ⬜ | ⬜ |
| NS-2 | Path-gate docs-only CI runs | Gate `pull_request.paths` so a docs-/records-only PR spends zero test minutes (and skips the Chromium install). **Blocked on** first confirming the tier jobs are not *required* status checks in branch protection — a path-skipped required check blocks merge forever (see TEST_MATRIX §8). | ⬜ Backlog — CI now fires once per change (push→main + PR) but still runs the full triad on docs-only PRs. | ⬜ | ⬜ |
| NS-3 | `persist-credentials: false` on release.yml checkouts | Harden the release workflow's checkouts too — **carefully**: the publish path tags `v<version>` from inside the Action, so the tagging checkout must keep its credential (or tag via the API). | ⬜ Backlog — `ci.yml` is hardened; `release.yml` left alone to avoid breaking the tag push. | ⬜ | ⬜ |

_NS-* items came from the netsniff PR review (2026-07-18). The high/medium-value items from that
review — CI single-fire, `ci.yml` `persist-credentials: false`, and best_practices §19–29 — are
already applied._

### Shipped (✅ done · tested · merged) — reference

All live in the code and on `main`; version = the release they shipped in.

| ID | Item | Ver |
|---|---|---|
| FH-041 | Move popup help behind a "?" button (no inline help) | 0.4.5 |
| FH-033 | Update now — hot Chrome Web Store update, no restart | 0.4.5 |
| FH-009 | Simpler Aggression slider label (strict/balanced/aggressive) | 0.4.5 |
| FH-004 | Autonomous AI-slop self-calibration (living model) | 0.4.4 |
| FH-005 | Aggression slider that sticks | 0.4.4 |
| FH-006 | AI-slop decision log | 0.4.4 |
| FH-007 | Group runs of hidden posts | 0.4.4 |
| FH-008 | Click-safe re-apply + faster load-more | 0.4.4 |
| FH-031 | Context-invalidation teardown | 0.4.3 |
| FH-032 | Bundled banlist / smaller page footprint | 0.4.3 |
| FH-028 | Toggle-driven stub + splat confirms & hides | 0.4.2 |
| FH-029 | Remove digest / "Collapse hidden content" | 0.4.2 |
| FH-030 | Sticky Hide / Show-anyway | 0.4.2 |
| FH-024 | Remove per-filter Aggressive toggle | 0.4.0 |
| FH-025 | Move the Enable switch into the header | 0.4.0 |
| FH-026 | "Show sample" independent of "Show author" | 0.4.0 |
| FH-027 | One-click Windows self-update | 0.4.0 |
| FH-034 | Group the AI-slop controls into a section | 0.4.0 |
| FH-035 | Fold the M / S key into the Posts header | 0.4.0 |
| FH-036 | Rename "Names" → "Show author" | 0.4.0 |
| FH-037 | Rename "Details & activity" → "Advanced Settings" | 0.4.0 |
| FH-019 | Company / brand posts filter | 0.3.0 |
| FH-020 | "Always show" (whitelist) button | 0.3.0 |
| FH-021 | Stub icon-button controls | 0.3.0 |
| FH-022 | Muted authors soft-blocked | 0.3.0 |
| FH-023 | Heartbeat focus-aware fix | 0.3.0 |
| FH-015 | Detection-transparency panel | 0.2.0 |
| FH-016 | First-run welcome page | 0.2.0 |
| FH-017 | Collapsible options panels | 0.2.0 |
| FH-018 | Remove remote banlist | 0.2.0 |
| FH-010 | Mute / Solo per-filter mixer | 0.1.0 |
| FH-011 | Learning AI-slop scorer | 0.1.0 |
| FH-012 | Author memory (mute + allowlist) | 0.1.0 |
| FH-013 | Custom filters | 0.1.0 |
| FH-014 | "Load more posts" helper | 0.1.0 |

---

_Kept in sync as work moves. `roadmap.json` remains the machine-readable source of truth for
committed items; this file is the human working queue and the home for the product-page items
once they're available._
