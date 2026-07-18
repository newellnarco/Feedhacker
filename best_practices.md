# FeedHacker — best_practices.md

The numbered coding standard for FeedHacker, and the file CodeRabbit reads as its
review criteria (`.coderabbit.yaml` → `knowledge_base.code_guidelines.filePatterns`).

**The loop:** every real bug becomes (1) a fix, (2) a regression test at the right tier
(unit / integration / system), (3) a row in [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md), and
(4) — if it's a general class — a numbered rule here. That way the same class of bug can't
recur silently. When the reviewer flags the same class twice, the standard was missing —
add it.

Rules are terse and checkable against a diff. Newest rules may cite the PR that spawned them.

## Architecture invariants

1. **No bundler, UMD modules.** Sources are TypeScript in `src/`, compiled by `tsc` to
   `build/` and packaged by `scripts/build.mjs`. Each module attaches to `self` (e.g.
   `self.FeedHackerScorer`) and is loaded by `<script>`/`content_scripts` order — do not
   introduce `import`/`export` in shipped code paths that assume ESM at runtime.
2. **Pure core, no `chrome.*` in the DOM/logic layers.** `src/feed.ts` (DOM), `src/scorer.ts`,
   `src/matcher.ts`, `src/filters.ts` must stay free of `chrome.*` so they unit-test under
   jsdom. Storage/messaging lives in the glue layer (`src/content.ts`, `src/background.ts`).
3. **`filters.ts` DEFAULTS is the single source of truth** for settings + defaults; popup,
   options, and content all read from it. Don't hard-code a default in two places.

## Honesty discipline (the signature standard)

4. **Never a false green / silent success.** A check must NOT report success when the thing
   it checks is unreachable, empty, or errored. Litmus test: *what does this return when the
   thing it checks is unavailable?* — it must not be "ok". Distinguish loading / slow /
   unreachable / honestly-empty; degrade toward the safe side.
5. **Report honest counts.** Status/metadata must reflect what actually happened. When a value
   used to compute a result differs from what's retained afterward, record both (e.g. the
   calibration status stores `n` = observations the tune was computed from AND `nKept` =
   observations retained after the reap) so an export is self-consistent.

## Extension-context & storage safety

6. **Guard every `chrome.*` against an invalidated context.** After a Chrome update/reload the
   old content-script context is orphaned (`chrome.runtime.id` becomes undefined and requests
   surface as `chrome-extension://invalid/`). Gate `chrome.*` calls behind a liveness check and
   run a clean `teardown()` (disconnect observers, clear timers/listeners, remove injected UI,
   reveal hidden posts). A dead context must never throw for the life of the tab.
7. **One writer per `chrome.storage` key.** Two async paths writing the same key with
   last-write-wins will drop data (a concurrent tab's newer append gets clobbered). Consolidate
   to a single writer, or gate writers with a flag. (obs-reap race, PR #40.)
8. **Re-score hidden posts from STORED features, not live DOM text.** A collapsed/grouped stub's
   visible text is the stub UI, not the post — re-scoring live text would mis-classify it. Score
   from the features stashed at first scan (`data-feedhacker-features`). (PR #40.)
9. **Settings the user moves must not be overwritten by the learner.** Bind a user control to the
   value the self-tuning honors (the Aggression slider writes `slopTargetFrac`, the target the
   calibrator aims for), not a value the calibrator rewrites each cycle (`slopThreshold`). (PR #40.)

## DOM / UI resilience

10. **Route injected-control clicks through one delegated listener.** LinkedIn's React re-renders
    can drop a stub's per-button listeners, so a click lands on a handler-less node and appears to
    do nothing. Use a single capture-phase `document` listener that routes by a `data-fh-act`
    attribute, so a rebuilt button keeps working. (First-click-ignored, PR #40.)
11. **Self-tuning re-apply must be soft.** A re-scan that tears down on-screen stubs can swallow a
    click that lands mid-rebuild. Re-apply only reveals/hides posts that actually changed, never
    rebuilds a stub that stays hidden, and pauses ~1.5 s after any interaction.
12. **Escape user text before it touches the DOM as markup.** Use `textContent`, never treat a
    search query or post text as HTML.

## Security / footprint

13. **No `web_accessible_resources` a site can enumerate.** Bundle data (the banlist ships as
    `banlist.js` setting `self.FeedHackerBanlist`), so the page can't probe an extension-origin
    resource. Keep `web_accessible_resources` empty.
14. **Never commit secrets, tokens, or the model identifier** into code, comments, commit
    messages, PR bodies, or any packaged artifact. `gitleaks` runs on the diff.
15. **Least privilege in CI and the manifest.** Workflows keep `permissions: contents: read`;
    the manifest requests only the permissions actually used (adding one, e.g. `tabs`, triggers a
    Chrome Web Store re-prompt — avoid unless required).

## Tests & docs discipline

16. **Every change ships the test triad, every bug ships a regression test.** unit = pure module
    logic under jsdom; integration = modules wired via jsdom + a mock `chrome`; system = the
    packaged extension driven in real headless Chromium. Pick the lowest tier that catches it; a
    fix without a regression test isn't done. See [`TEST_MATRIX.md`](TEST_MATRIX.md) for which tests
    a change's blast radius obliges.
17. **Don't over-shard a fast suite.** The whole suite runs in seconds — one job per tier is
    cheaper than a shard matrix that pays setup cost N times. Shard for wall-clock only when the
    suite is genuinely long.
18. **Keep the records in sync in the SAME PR.** A change that alters behavior updates
    `CHANGELOG.md`, and — when relevant — `SESSION-STATE.md`, `RELEASES.md`, `roadmap.json`, and
    `the_wall.md`. A behavior change with stale docs is a drift bug.
