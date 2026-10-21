# Building FeedHacker in the Claude session VM

Owner, 2026-10-21: *"no builds on the pc for any repo"*, *"no js bundles on the pc either. just build in claude's
vm"*. The owner's PC runs only tests, type checks and lint. Every build and every release zip is made in the Claude
session's cloud VM; `.github/workflows/release.yml` only checks and publishes what the VM staged.

## The VM

Versions are the ones this was verified with on 2026-10-21.

| need | version | why |
|---|---|---|
| OS | Ubuntu 24.04.5 LTS, x86_64 | the session VM |
| Node.js | 22 (v22.22.0) | `npm run build`, the tests, the staging script |
| Playwright Chromium | `playwright` 1.61.1 from `package.json` (browsers in `/opt/pw-browsers`) | `npm run test:system` drives the built extension in a real browser |
| git | any | staging the assets on the `installers` branch |
| msitools / wixl | 0.103 (optional) | **not used by the release.** wixl reads only WiX v3; `installer/windows/feedhacker.wxs` is WiX v4, so wixl aborts with `unhandled child Wix node Package`. The MSI is still built by the hosted Windows `msi` job. Install it only to inspect an MSI (`msiinfo`). |
| Disk | under 1 GB free | node_modules (about 300 MB with Playwright's npm package), `dist/` (about 3 MB) |
| Network | npm registry, github.com | `npm ci`, the push to `installers` |

## Setup script (paste into the environment's setup script)

```bash
npm ci
npx playwright install --with-deps chromium
```

Optional, only to inspect MSIs:

```bash
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y msitools wixl
```

## Every push

```bash
npm ci
npm run typecheck
npm test
npm run test:system
```

`npm run test:system` runs `npm run build` first, so it is also the build check.

## A release

Only after the maintainer says **"ship"** (CLAUDE.md § Release policy), on the merged `main` commit, with a clean tree:

```bash
npm ci
node scripts/build-release-vm.mjs
node scripts/stage-release.mjs --dry-run
node scripts/stage-release.mjs
```

- **`build-release-vm.mjs`** runs `scripts/build.mjs` and checks that the four zips exist
  (`feedhacker-<v>.zip`, `-store.zip`, `-win.zip`, `-store-submission.zip`), printing each size and sha256.
- **`stage-release.mjs`** force-writes one orphan commit to the `installers` branch: the four zips (split into
  90 MB parts if one ever grows past that) and `manifest.json` with the version (manifest.json and package.json must
  agree), the source commit and every file's size and sha256. `--dry-run` makes the commit without pushing.
- **Then run the Release workflow.** Its `staged` job refuses assets whose manifest names another commit or version,
  checks every sha256 (`node scripts/stage-release.mjs --check staged`), and passes them on. `msi` (hosted Windows)
  packages them with WiX, `release` cuts the GitHub Release and `webstore` uploads the store zip, as before.
