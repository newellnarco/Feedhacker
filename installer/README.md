# FeedHacker installer (Windows, no admin, no build)

One-click-ish install of the **prebuilt** extension, with **automatic daily updates
from GitHub**. No Node, no Git, no compiling — the installer uses ready-built files.
Chrome does not allow unsigned extensions to be installed *fully* silently, so there's
exactly one manual step the first time (a "Load unpacked" click); everything else —
installing, updating, scheduling — is automated and needs **no administrator rights**.

## What it does

- **`install.bat`** — copies the prebuilt extension into
  `%LOCALAPPDATA%\FeedHacker\extension` (from the bundled `feedhacker\` folder, or by
  downloading the latest green release if run standalone), registers a per-user **daily
  auto-update** task, then opens `chrome://extensions` and copies the folder path to
  your clipboard for a one-time **Load unpacked**.
- **`update.bat`** — downloads the latest **green** release from GitHub (published only
  after CI passes) and refreshes the installed files in place. The scheduled task runs
  this daily; Chrome loads the new files on next restart.
- **`uninstall.bat`** — removes the auto-update task and opens `chrome://extensions` so
  you can click **Remove**. Add `-Purge` to also delete the local files
  (`uninstall.bat -Purge`).

## Requirements

- Windows 10/11, Google Chrome (or any Chromium browser).
- Nothing else. Updates use the built-in GitHub REST API over HTTPS; if you have the
  GitHub CLI (`gh`) installed and signed in, it's used as a fallback when the API is
  unreachable.

## Fastest: one-line install/update (no download)

Open **PowerShell** (Start → type "PowerShell" → Enter) and paste:

```powershell
irm https://raw.githubusercontent.com/newellnarco/Feedhacker/main/installer/windows/web-install.ps1 | iex
```

This fetches the installer scripts from the repo, downloads the **latest green release**
(no zip to grab by hand), registers the daily auto-update, and guides the one-time
**Load unpacked**. **Run the same command again anytime to update** — it reinstalls the
latest build in place. Options are available when you run the script directly (see
[Options](#options)): `-NoSchedule` to skip the daily task, `-Ref <branch|tag>` to pin a
version of the scripts.

## Or download the bundle

1. Download `feedhacker-<version>-win.zip` from the
   [latest release](https://github.com/newellnarco/Feedhacker/releases/latest) and unzip it.
2. Double-click **`installer\install.bat`**. Approve the PowerShell window if prompted.
3. When Chrome opens `chrome://extensions`: turn on **Developer mode**, click
   **Load unpacked**, and paste the copied path (Ctrl+V) → **Select Folder**.
4. Pin FeedHacker via the puzzle icon. Done.

### Options

```powershell
# One-line web install/update, skipping the daily task or pinning a script version:
powershell -ExecutionPolicy Bypass -File web-install.ps1 -NoSchedule
powershell -ExecutionPolicy Bypass -File web-install.ps1 -Ref v0.4.3

# Install without registering the daily auto-update task:
powershell -ExecutionPolicy Bypass -File install.ps1 -NoSchedule

# Update now (also run daily by the scheduled task):
powershell -ExecutionPolicy Bypass -File update.ps1

# Force a re-download even if versions match:
powershell -ExecutionPolicy Bypass -File update.ps1 -Force
```

## How updates work

The daily task (and `update.bat`) call `update.ps1`, which asks GitHub for the latest
release, compares it to the installed `manifest.json` version, and — if newer —
downloads `feedhacker-<version>.zip` and mirrors it into the same stable folder. Because
the unpacked path never changes, Chrome loads the refreshed version the next time it
starts (or when you click the reload icon on the extension card). Activity is logged to
`%LOCALAPPDATA%\FeedHacker\update.log`.

### Update now, from inside the extension (no restart)

The installer also registers a per-user **native-messaging host**
(`com.feedhacker.updater`, HKCU, no admin) so you don't have to wait for the daily task
or restart Chrome. In the extension's **Advanced Settings → Updates**, click **Check for
updates**; if a newer release exists, an **Update now** button appears. Clicking it messages
the host, which runs the same `update.ps1` download, and then the extension calls
`chrome.runtime.reload()` to load the new files **immediately — no Chrome restart**.

This works only for the Windows sideload build, which alone ships the `nativeMessaging`
permission and a fixed manifest `key` (so the unpacked extension ID is stable — native
messaging must whitelist an exact ID). The Chrome Web Store build omits both; store
installs are auto-updated by Google. `uninstall.bat` removes the host registration.

## Windows `.msi`

Releases also attach a best-effort **`FeedHacker-<version>.msi`** (built in CI with WiX
v5). It lays the prebuilt extension + these scripts into `%LOCALAPPDATA%\FeedHacker` and
adds a Start-Menu "Finish setup" shortcut. It still can't bypass Chrome's one-time
"Load unpacked" for an off-store extension — see below. For most people the one-line web
installer above is simpler; the MSI exists for managed/Add-Remove-Programs setups.

## Why not a true silent .exe/.msi?

Consumer Chrome blocks programmatic install of unsigned, self-hosted extensions. The
only ways around the one-time click are the **Chrome Web Store** (native one-click +
auto-update) or an **enterprise force-install policy** (requires admin and shows
"Installed by your organization"). This tooling gives you the closest no-admin
experience: prebuilt install + auto-update, one manual load.
