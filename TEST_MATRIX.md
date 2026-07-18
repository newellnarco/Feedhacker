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
The suite runs in seconds, so we deliberately **do not shard** further (best_practices §17).

## Dependency cores — touch these, run everything

A change to a module the whole app imports has repo-wide blast radius:

- **`src/filters.ts`** (`DEFAULTS` / filter list) — read by popup, options, and content.
- **`src/selectors.ts`** — the LinkedIn DOM contract every scan depends on.
- **`src/scorer.ts`** — the AI-slop model consumed by feed + content + options.
- **`scripts/build.mjs`, `manifest.json`, `tsconfig.json`, CI workflow** — build/packaging.

→ For any of these: **run the full triad** (`npm test && npm run test:system`).

## Area → obligation

| Area | Source | Primary tests | Blast radius | Fast-track? |
|---|---|---|---|---|
| AI-slop model | `scorer.ts`, `sloplog.ts` | `scorer`, `retrain`, `autocalibrate`, `livecalibrate`, `sloplog` (unit) | feed scoring, content calibration, options panel | ❌ run row |
| Feed / DOM layer | `feed.ts` | `feed`, `grouping` (integration) | content re-apply, stub UX, grouping | ❌ run row |
| Content glue (storage/msg) | `content.ts` | `content-boot`, `content-teardown` (integration) | everything on the page | ❌ run row + system |
| Background SW | `background.ts` | `background-badge`, `background-update` (integration) | badge, self-update, store update | ❌ run row |
| Matching / custom filters | `matcher.ts`, `customfilters.ts` | `matcher`, `customfilters` (unit) | which posts are hidden | ❌ run row |
| Authors (mute/allow) | `authors.ts` | `authors` (unit) | author memory | ❌ run row |
| Update check | `update.ts` | `update` (unit) | options "check for updates" | ✅ if isolated |
| Popup / options UI | `popup.ts`, `options.ts`, `*.html`, `styles.css` | drive in real Chromium (system) | UI only; gated by `tsc` + build, not model tests | ✅ if presentational + `tsc`/build green |
| Manifest / packaging | `manifest.json`, `scripts/build.mjs` | `manifest` (unit), `build.system` (system) | the whole packaged product | ❌ run full triad |
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
