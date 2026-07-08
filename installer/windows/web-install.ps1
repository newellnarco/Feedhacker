# FeedHacker - one-line web installer/updater (Windows, no admin, no manual download).
#
# Installs or updates FeedHacker straight from GitHub: it fetches the installer scripts
# from the repo, then hands off to install.ps1, which pulls the latest GREEN release
# (built and published only after CI passes) - no zip to download by hand, no build.
# Re-running it updates in place: the same command both installs and updates.
#
# Usage (paste into a PowerShell window):
#   irm https://raw.githubusercontent.com/newellnarco/Feedhacker/main/installer/windows/web-install.ps1 | iex
#
# Or download and run with options (e.g. pin a branch/tag, or skip the daily task):
#   powershell -ExecutionPolicy Bypass -File web-install.ps1 -Ref v0.4.3 -NoSchedule
#Requires -Version 5.1
[CmdletBinding()]
param(
  [string]$Repo = "newellnarco/Feedhacker",  # owner/name the scripts are fetched from
  [string]$Ref  = "main",                    # branch or tag to fetch the scripts from
  [switch]$NoSchedule                         # pass through: skip the daily auto-update task
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
# Windows PowerShell 5.1 defaults to TLS 1.0; force 1.2 so raw.githubusercontent works.
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }

Write-Host "[FeedHacker] Fetching the installer from $Repo@$Ref ..." -ForegroundColor Cyan

# Grab the whole installer script set so the installed folder is complete (auto-update
# task, self-update native host, and uninstall all rely on these sitting together).
$scripts = @(
  "install.ps1", "update.ps1", "uninstall.ps1", "lib.ps1", "updater-host.ps1",
  "install.bat", "update.bat", "uninstall.bat", "updater-host.bat"
)
$stage = Join-Path $env:TEMP ("feedhacker_web_" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $stage | Out-Null
$base = "https://raw.githubusercontent.com/$Repo/$Ref/installer/windows"
try {
  foreach ($s in $scripts) {
    Invoke-WebRequest -Uri "$base/$s" -OutFile (Join-Path $stage $s) `
      -Headers @{ "User-Agent" = "FeedHacker-WebInstaller" } -UseBasicParsing
  }
} catch {
  Write-Host "[FeedHacker] ERROR: could not download the installer scripts: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "[FeedHacker] Check your connection, or grab feedhacker-<version>-win.zip from the Releases page instead." -ForegroundColor Yellow
  exit 1
}

# Hand off. install.ps1 finds no bundled extension next to $stage, so it downloads the
# latest green release from GitHub itself (via lib.ps1 -> Sync-LatestRelease).
$installArgs = @{ Repo = $Repo }
if ($NoSchedule) { $installArgs["NoSchedule"] = $true }
& (Join-Path $stage "install.ps1") @installArgs
