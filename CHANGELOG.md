# Changelog

All notable changes to FeedHacker — features and bug fixes, newest first.
Format follows [Keep a Changelog](https://keepachangelog.com/); versions match
`manifest.json` and the Git tags / GitHub Releases.

**Install:** [Chrome Web Store](https://chromewebstore.google.com/detail/feedhacker/djfbniehjjngpkimngegnjdeamfofnoa)
· [latest release](https://github.com/newellnarco/Feedhacker/releases/latest)

> Maintaining this file: add entries under **Unreleased** as you work, then on
> release rename that heading to the new `vX.Y.Z` (with the date) and start a fresh
> Unreleased block. Keep the version in step with `manifest.json` / `package.json`.

## [Unreleased]

### Added
- Hosted **GitHub Pages** site under [`docs/`](docs/): a standalone HTML privacy
  policy (`privacy-policy.html`) plus a small landing page. Google's Web Store
  reviewer verifies this reliably, unlike a `raw.githubusercontent.com` link.

### Changed
- Options page "Updates" text now explains updating per install method (Chrome Web
  Store auto-updates; the Windows installer's daily task needs a Chrome restart to
  apply; Load-unpacked needs a manual download + reload), instead of telling
  everyone to download manually.

### Fixed
- Release workflow: the `CWS_AUTO_PUBLISH` variable is now matched
  case-insensitively (`true`/`True`/`TRUE`), so store auto-submit isn't silently
  skipped by capitalization.

## [0.2.0] — 2026-07-06

### Added
- **Author + first line on AI‑slop stubs.** Because the AI‑slop filter is a
  judgment call, its collapsed placeholder now shows the post author's name and
  the opening line of the post, so you can decide whether it's really slop without
  clicking **Show anyway**. The deterministic filters (Promoted, Hiring, etc.) are
  unchanged and show no preview.

### Fixed
- **Options page column alignment.** The numeric headers (**Hidden** / **Shown**)
  in the Activity, Insights, and Top‑sources tables now right‑align over their
  values instead of floating to the left of them.

### Tooling / release
- Automated **Chrome Web Store** publishing on release (opt‑in via `CWS_*` secrets),
  plus a manual **Run workflow → publish** path so a release can be cut without
  pushing a tag.
- Release workflow hardening: idempotent GitHub Release creation, and a fix for a
  manual publish run producing a draft instead of a published release.
- Automated PR review via **Qodo Merge** (`.pr_agent.toml`).

## [0.1.0] — Initial release

### Added
- Hide low‑signal LinkedIn home‑feed posts via a per‑filter **Mute / Solo** mixer:
  **AI slop** (structural scorer with an Aggressive mode), **Promoted**,
  **Newsletter signups**, **Hiring**, **Reaction reshares**, **New‑job
  announcements**, **Work anniversaries**, and **Training & certification**.
- **Learning AI‑slop filter** — scores structural "tells" and learns from your
  **Show anyway** / **👍 slop** / **Hide again** corrections and scroll‑past signals;
  adjustable sensitivity; export/import/reset of the on‑device model.
- **Author memory** — mute an author (always hide) or allowlist (always show), with
  a Profile ↗ quick‑link; top hidden sources on the options page.
- **Custom filters** — words/phrases, regexes, hashtags, and companies/authors.
- Display and comment options — **Name names**, **Hide Hidden Content**, **Digest**
  runs of hidden posts, **Hide AI‑slop comments**, a toolbar badge, and a **Load
  more posts** helper.
- Runs entirely in the browser (only the `storage` permission); optional remote
  banlist behind a per‑site permission prompt.

[Unreleased]: https://github.com/newellnarco/Feedhacker/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/newellnarco/Feedhacker/releases/tag/v0.2.0
