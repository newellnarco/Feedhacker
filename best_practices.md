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

## Data & parsing (persisted, imported, messaged)

19. **LinkedIn's DOM is a versioned external API — match every known shape, and fail SAFE.** When a
    selector or classifier branches on something LinkedIn emits (a class name, an `aria` string, a
    data attribute, a "Promoted"/"Suggested" label), accept every known encoding, and when the value
    is **unrecognized, take the least-destructive reading: do NOT hide a post you can't confidently
    classify.** A false hide is a cry-wolf that trains the user to disable the filter, which then
    masks real slop. Pin each accepted encoding with a test.
20. **Parse persisted/imported storage JSON per-record — guard the field, not just the top-level
    type, and skip a bad row instead of aborting the batch.** Settings, author lists, calibration
    observations, and any exported-then-reimported blob in `chrome.storage` are hand-editable and
    can carry a wrong-typed field. Wrap **each record's** parse in `try/catch → continue`, validate
    a field's type before `Number()`/`.length`/iteration, and build the record fully before mutating
    an accumulator — one corrupt row must degrade, never crash the scan or the options panel.
21. **Parse boolean/enum settings explicitly — never `Boolean(value)` a stored or messaged flag.**
    Any non-empty string is truthy, so a value of `"false"`/`"0"`/`"off"` becomes `true` and can
    silently re-enable a filter the user turned off. Coerce: real boolean → itself; `undefined`/
    `null` → the default; string → case-insensitive `{"true","1","on"}` vs `{"false","0","off"}`.
22. **Export payloads omit optional fields — never serialize `null`/`undefined`.** Key-absent means
    "unset"; add a key conditionally, and use `!= null` (not truthiness) when `0`/`false` is legal.

## Runtime & network

23. **No expensive/unbounded work synchronously in the MutationObserver / scan callback.** The
    observer fires on every LinkedIn re-render; a heavy per-mutation scan stalls the page. Debounce/
    batch into an animation-frame or idle callback, cap work per pass, and serve **cached** scores
    rather than recomputing (generalizes the soft ~1.5 s re-apply pause, §11).
24. **Every `fetch` gets a timeout; a stall becomes a visible error, not an endless "checking…".**
    The update check (`update.ts`) and any version/store fetch wrap `fetch` in an `AbortController`
    timeout — a backend that accepts the socket but never replies otherwise hangs the UI on its
    spinner, which reads as "still working" when it's actually unreachable (the front-end false
    green). A non-2xx or non-JSON body is a server error, not success and not "offline."

## Accessibility & encapsulation

25. **Injected UI carries an accessible name.** A status dot / stub control we inject into a page
    real users navigate with screen readers needs a `role`/`aria-label` stating its meaning, not a
    bare `title` — colour or glyph alone isn't an accessible name.
26. **Don't reach into another module's private state via the `self.FeedHacker*` globals.** The
    UMD-on-`self` pattern makes internals globally reachable; call a module's public surface, expose
    a helper — don't poke a would-be-private field on `self.FeedHackerScorer` et al.
30. **A decorative icon that just repeats adjacent visible text is `aria-hidden="true"`, not
    labeled** (the complement to §25). An inline glyph sitting right beside the word it depicts —
    the welcome page's puzzle-piece / pin next to the literal "puzzle-piece" / "pin" text — must
    **not** carry `role="img"` + `aria-label`, or a screen reader announces the same thing twice.
    Give an icon an accessible name only when it is the *sole* carrier of its meaning (§25);
    otherwise mark it decorative.
31. **A health/heartbeat alarm fires on positive evidence of failure, not on mere absence.** On a
    SPA feed, "we see nothing" happens constantly and harmlessly — the page is paging/loading. Don't
    treat absence as breakage: gate the alarm on a selector-INDEPENDENT signal that the thing you
    expect is actually there but unrecognized (e.g. the feed rendered posts via `role="article"` /
    activity-URN, yet none match our marker), and suppress it while the app is in a known loading
    state (`aria-busy`, skeleton/loaders) or the tab is inactive. An alarm that can't tell "empty"
    from "broken" is a false-positive generator (this is the diagnostic-side sibling of §4/§5's
    false-green rule).
32. **Removing a setting's UI does not reset its persisted value.** `content.ts` merges stored
    `chrome.storage.sync` over `DEFAULTS`, so a user who previously toggled a control keeps that
    value even after the control is gone. If a behaviour is now *fixed*, ENFORCE it in code — override
    the stored value on every settings load (see `Filters.applyFixed`) or run a one-time migration —
    and don't claim "fixed"/"always on" in a comment while merged storage can still override it. (The
    persisted-state sibling of §4/§5's false-claim rule.)

## More tests & docs

27. **Tests are order-independent.** A test that mutates shared/global state (a stubbed
    `self.FeedHacker*`, the `chrome` mock, a module singleton) must **restore it on teardown**; never
    rely on file order. (Node 22's `node:test` has no shuffle flag, so this is enforced by
    discipline, not a runner option.)
28. **Done means on the live feed.** A scan/scoring/filter change is finished only when a
    **system-tier** test drives it in a real browser on LinkedIn — not merely when a pure-module unit
    test is green. A capability that passes in isolation but isn't consumed by `content.ts` on the
    page isn't shipped.
29. **Change a CI workflow → groom `TEST_MATRIX.md` in the same PR** so the matrix can't drift from
    the pipeline.
