# FeedHacker installer (Windows, no admin)

One-click-ish install for the unpacked dev build, with **automatic updates from
GitHub**. Chrome does not allow unsigned extensions to be installed *fully*
silently, so there's exactly one manual step the first time (a "Load unpacked"
click); everything else — building, updating, scheduling — is automated and needs
**no administrator rights**.

## What it does

- **`install.bat`** — installs Node/Git via `winget` if missing, clones the repo
  to `%LOCALAPPDATA%\FeedHacker\repo`, runs `npm ci && npm run build`, registers a
  per-user **daily auto-update** task, then opens `chrome://extensions` and copies
  the built folder path to your clipboard for a one-time **Load unpacked**.
- **`update.bat`** — pulls the latest from GitHub and rebuilds in place now.
  (The scheduled task runs this daily; Chrome loads the new files on next restart.)
- **`uninstall.bat`** — removes the auto-update task and opens
  `chrome://extensions` so you can click **Remove**. Add `-Purge` to also delete
  the local files (`uninstall.bat -Purge`).

## Requirements

- Windows 10/11, Google Chrome (or any Chromium browser).
- **Node.js LTS** and **Git**. The installer tries to install them with `winget`
  if they're missing; otherwise install from [nodejs.org](https://nodejs.org) and
  [git-scm.com](https://git-scm.com/download/win), reopen the window, and re-run.

## Use

1. Double-click **`install.bat`**. Approve the PowerShell window if prompted.
2. When Chrome opens `chrome://extensions`: turn on **Developer mode**, click
   **Load unpacked**, and paste the copied path (Ctrl+V) → **Select Folder**.
3. Pin FeedHacker via the puzzle icon. Done.

### Options

```powershell
# Install from a specific branch (until the PR is merged into main):
powershell -ExecutionPolicy Bypass -File install.ps1 -Branch claude/code-eval-readme-gjclyd

# Skip creating the scheduled task:
powershell -ExecutionPolicy Bypass -File install.ps1 -NoSchedule
```

## How updates work

The daily task (and `update.bat`) run `git fetch` → `reset --hard origin/<branch>`
→ `npm ci` → `npm run build` into the same stable folder. Because the unpacked
path never changes, Chrome loads the rebuilt version the next time it starts (or
when you click the reload icon on the extension card). Update activity is logged
to `%LOCALAPPDATA%\FeedHacker\update.log`.

## Why not a true silent .exe?

Consumer Chrome blocks programmatic install of unsigned, self-hosted extensions.
The only ways around the one-time click are the **Chrome Web Store** (native
one-click + auto-update) or an **enterprise force-install policy** (requires admin
and shows "Installed by your organization"). This tooling gives you the closest
no-admin experience: automated build + auto-update, one manual load.
