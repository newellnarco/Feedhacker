# FeedHacker — TEST_MATRIX.md

**Blast radius = every module that transitively depends on the one you touched.** That's what a
change can break, so that's what must be green before merge. This matrix maps each change *area*
to its primary tests, its blast radius, and whether it's **fast-track** (merge on green) or must
run its row first.

## Tiers (the triad)

FeedHacker splits tests by level, not by codebase — every area gets covered at the lowest tier
that catches the bug:

- **unit** (`test/unit/*.test.js`) — pure per-module logic; no DOM host, no browser. `npm run test:unit`
- **integration** (`test/integration/*.test.js`) — modules wired together via **jsdom + a mock
  `chrome`** (the compiled SW/content driven end-to-end against fakes). `npm run test:integration`
- **system** (`test/system/*.test.js`) — the **packaged extension** loaded into real headless
  Chromium and driven like a user. `npm run test:system` (builds first)

CI runs the three tiers as three parallel jobs (`.github/workflows/ci.yml`), then `package`.
The suite runs in seconds, so we deliberately **do not shard** further (best_practices §17). CI
fires **once per change** — the `pull_request` event is the review gate; `push` runs only on
`main` (the post-merge gate) — and every checkout uses `persist-credentials: false`.

## Dependency cores — touch these, run everything

A change to a module the whole app imports has repo-wide blast radius:

- **`src/filters.ts`** (`DEFAULTS` / filter list) — read by popup, options, and content. Also owns the **removed-feature migration** (`applyFixed` → `dropLegacySolo`): a setting that no longer exists must be **deleted** from live settings and evicted from sync, never merely ignored — `test/integration/solo-removed.test.js` pins that (§57, FH-057).
- **`src/selectors.ts`** — the LinkedIn DOM contract every scan depends on. Its DOM probes are guarded against **`test/fixtures/linkedin-feed-2026-09.html`**, transcribed from a live home-feed capture. When LinkedIn's markup moves, **re-capture the fixture** — a probe tested only against markup we wrote can't fail when reality changes (§53, FH-052).
- **`src/scorer.ts`** — the AI-slop model consumed by feed + content + options.
- **`scripts/build.mjs`, `manifest.json`, `tsconfig.json`, CI workflow** — build/packaging.

→ For any of these: **run the full triad** (`npm test && npm run test:system`).

## Area → obligation

| Area | Source | Primary tests | Blast radius | Fast-track? |
|---|---|---|---|---|
| AI-slop model | `scorer.ts`, `sloplog.ts`, `claudisms.json` | `scorer`, `retrain`, `autocalibrate`, `livecalibrate`, `sloplog`, **`selectivity`** (unit) + `extension` (system) | feed scoring, content calibration, options panel — and **what fraction of a real feed survives** (§39–42) | ❌ run row + system |
| Feed / DOM layer | `feed.ts` | `feed`, `grouping`, `author-identity`, **`post-identity`**, **`furniture`** (integration) + `extension` (system) | content re-apply, stub UX, grouping, who Mute keys on, **how often a post is judged** (§46–48), and **what counts as a post at all** — LinkedIn's own modules wear the same marker (FH-053) | ❌ run row + system |
| Content glue (storage/msg) | `content.ts` | `content-boot`, `content-teardown`, `slop-verdict-queue` (integration) | everything on the page; storage read-modify-write ordering (§7) | ❌ run row + system |
| Background SW | `background.ts` | `background-badge`, `background-update` (integration) | badge, self-update, store update | ❌ run row |
| Matching / custom filters | `matcher.ts`, `customfilters.ts` | `matcher`, `customfilters` (unit) | which posts are hidden | ❌ run row |
| Authors (mute/allow) | `authors.ts` | `authors` (unit), `author-identity` (integration), `extension` (system) | author memory — and the DOM-side identity that feeds it (§36) | ❌ run row + system |
| Update check | `update.ts` | `update` (unit) | options "check for updates" | ✅ if isolated |
| Popup / options UI | `popup.ts`, `options.ts`, `*.html`, `styles.css` | drive in real Chromium (system) | UI only; gated by `tsc` + build, not model tests | ✅ if presentational + `tsc`/build green |
| **Release pipeline** | `.github/workflows/release.yml` | `release-cancel`, `release-gates` (unit) | two different failures. **What the log claims happened** — a step that misreports its own outcome is a false green (§4): FH-048 was a silent skip, FH-055 a refusal printed as “nothing in review”; every status branch needs a case. And **where a run actually publishes** — the job gates are boolean expressions evaluated under four event shapes, and the one that bites has no inputs at all (a tag push, where `inputs.store` is `undefined`); grepping a gate cannot catch that (§59) | ❌ run row |
| **Popup mixer** | `popup.ts`, `popup.html` | `popup.system` (system) | whether a control is actually **wired** — and **synchronised**: the buttons are static markup, so a case that asserts painted state must wait on `#enabled` (set only by the async settings callback), never on the element or on `#filters .frow`, which are both there before any paint (FH-058, §62). The AI-slop toggle is static markup bound by a `querySelectorAll` that also binds generated rows — markup and wiring can disagree, and that shape typechecks, unit-tests green and then does nothing when clicked. Only a browser catches it | ❌ run row + system |
| **Destructive controls** | `options.ts` reset paths, `LOCAL_KEYS`, `SLOP_LOCAL_KEYS` | `factory-reset` (unit), `options.system` (system) | what a reset actually clears **and what it must leave alone** — never "presentational": it deletes user data, so it needs the real button against real storage (§52). The two resets have different scopes and both halves need pinning: **factory reset** clears everything, **Reset AI-slop learning** clears only the AI and must leave mute/solo/authors/custom filters standing (FH-054) | ❌ run row + system |
| **Install / upgrade** | `background.ts` `onInstalled`, `filters.ts` `DEFAULTS` | `install-upgrade` (integration), `filters` (unit) | an upgrade must preserve every stored setting; a new install gets the shipped defaults | ❌ run row |
| **Session handoff docs** | `SESSION-STATE.md`, `CLAUDE.md` | `session-state` (unit) | that the start/close contract survives — sections present and ordered, open items a real table, both ends wired in `CLAUDE.md` | ❌ run row |
| **Mute modes** | `feed.ts` verdict branches, `filters.ts` `labelFor`, `applyFixed` | `solo-removed` (integration), `filters` (unit) | whether a hiding mode explains itself and can be exited from the feed (§50). Solo was **removed** in 0.8.0 (FH-057), so this row now also pins that it stays gone: a stale `solo*` key left in someone's synced settings must hide nothing and override nothing (§57) | ❌ run row |
| Manifest / packaging | `manifest.json`, `scripts/build.mjs` | `manifest` (unit), `build.system` (system) | the whole packaged product | ❌ run full triad |
| Release / store publish | `.github/workflows/release.yml` | `release-cancel`, `release-gates` (unit) | the store-publish path — runs against the maintainer's real credentials and can't be exercised end-to-end from CI, so the shell is extracted from the YAML and executed against a stub `curl`, and the `webstore` job's gate is evaluated rather than matched. A store upload auto-updates **every existing install**, so “did this run publish there?” is not a question to answer by reading | ❌ run row |
| Brand assets / icons | `icons/*`, `store/brand/*`, `feedhacker-logo.*` | `brand-assets` (unit), `build.system` (system) | the icon every install and the store listing show — two separate publish channels (best_practices §33) | ❌ run both tiers |
| Windows installer / updater | `installer/windows/*.ps1`, `*.bat` | `installer`, `installer-update` (unit), `build.system` (system) | the auto-update channel for every sideload install — a bad release-asset match or a lost sideload `key` silently kills updates for all Windows users (§34) | ❌ run both tiers |
| Docs / records only | `*.md`, `roadmap.json`, `the_wall.md` | none (no runtime) | none | ✅ merge on green |

## Rules

1. **Docs-only / records-only PRs are fast-track** — no runtime blast radius, merge as soon as CI
   is green (best_practices §16–18).
2. **Presentational UI changes** (popup/options markup + CSS with no logic change) are gated by
   `tsc --noEmit` + the build, not the model tests — run the system tier and merge on green.
3. **Anything touching a dependency core, or a change that spans areas, runs the full triad.**
4. **A failure in the integration or system tier means the true blast radius was wider than the
   diff** — widen the row (and note the new edge here) rather than papering over it.
5. **Every bug adds a regression test at the tier that would have caught it** (see the
   `KNOWN_ISSUES.md` "Regression test" column for the current set).
6. **Change a CI workflow → groom this matrix in the same PR.** The matrix must never drift from
   the pipeline (that's how a stale "N shards" line happens).
7. **Tests are order-independent.** A test that mutates shared/global state (a `chrome` mock, a
   `self.FeedHacker*` stub, a module singleton) restores it on teardown — don't rely on file order.
8. **Fast-track path-gating caveat.** If we ever gate CI jobs by `paths` so docs-only PRs skip the
   suite, that only works while those jobs are **not required status checks** in branch protection
   — a path-skipped *required* check blocks merge forever. Today CI is not path-gated (see the
   backlog in `the_wall.md`); we merge on a green run.
