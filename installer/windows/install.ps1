# FeedHacker — Windows installer (no admin, no build, no source).
# Installs the PREBUILT extension into %LOCALAPPDATA%\FeedHacker\extension, registers a
# per-user daily auto-update task (pulls the latest GREEN release from GitHub), then
# guides the one-time "Load unpacked" click Chrome requires for off-store extensions.
#
# Usage:  double-click install.bat, or:
#   powershell -ExecutionPolicy Bypass -File install.ps1 [-NoSchedule]
#Requires -Version 5.1
[CmdletBinding()]
param(
  [string]$Repo = "newellnarco/Feedhacker",
  [switch]$NoSchedule
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
. (Join-Path $PSScriptRoot "lib.ps1")

function Info($m) { Write-Host "[FeedHacker] $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "[FeedHacker] $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "[FeedHacker] ERROR: $m" -ForegroundColor Red; Read-Host "Press Enter to close"; exit 1 }
function Find-Chrome {
  $paths = @(
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:LocalAppData "Google\Chrome\Application\chrome.exe")
  )
  return ($paths | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1)
}

$Root = Join-Path $env:LOCALAPPDATA "FeedHacker"
$Ext  = Join-Path $Root "extension"
$Inst = Join-Path $Root "installer"
New-Item -ItemType Directory -Force -Path $Root, $Inst | Out-Null
Info "Install location: $Root"

# --- 1. Get the prebuilt extension files (NO building) ---
# The Windows bundle ships a ready-built `feedhacker\` folder next to this installer;
# use it for an instant, offline install. Otherwise download the latest GitHub release.
$bundled = Join-Path $PSScriptRoot "..\feedhacker"
if (Test-Path (Join-Path $bundled "manifest.json")) {
  Info "Installing the bundled prebuilt extension…"
  Copy-ExtensionInto -Src $bundled -ExtDir $Ext
} else {
  Info "Downloading the latest green release from GitHub…"
  try { Sync-LatestRelease -Repo $Repo -ExtDir $Ext -Force -Log { param($m) Info $m } | Out-Null }
  catch { Die ("Could not download the extension: " + $_.Exception.Message) }
}
if (-not (Test-Path (Join-Path $Ext "manifest.json"))) { Die "Install did not produce $Ext" }

# Keep the installer scripts at a stable path so the scheduled task can call them.
# Skip when already running from that path (e.g. the MSI-installed layout) to avoid
# a copy-onto-itself error.
if ((Resolve-Path $PSScriptRoot).Path -ne (Resolve-Path $Inst).Path) {
  Copy-Item -Path (Join-Path $PSScriptRoot "*") -Destination $Inst -Recurse -Force
}

# --- 2. Per-user daily auto-update task (no admin) ---
if (-not $NoSchedule) {
  $updater = Join-Path $Inst "update.ps1"
  $taskName = "FeedHacker Auto-Update"
  $cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$updater`" -Repo $Repo"
  try {
    schtasks /Create /F /SC DAILY /ST 09:00 /TN $taskName /TR $cmd | Out-Null
    Info "Registered daily auto-update task '$taskName' (pulls the latest green release)."
  } catch { Warn "Could not register the scheduled task; you can still update by running update.bat." }
}

# --- 3. One-time Load unpacked (Chrome blocks silent off-store installs) ---
Set-Clipboard -Value $Ext
$chrome = Find-Chrome
if ($chrome) { Start-Process $chrome "chrome://extensions/" } else { Warn "Chrome not found automatically — open chrome://extensions manually." }

Write-Host ""
Write-Host "================ ONE-TIME SETUP ================" -ForegroundColor White
Write-Host " The extension folder path is on your clipboard:" -ForegroundColor White
Write-Host "   $Ext" -ForegroundColor Green
Write-Host " In the Chrome 'Extensions' page:" -ForegroundColor White
Write-Host "   1. Turn ON 'Developer mode' (top-right toggle)."
Write-Host "   2. Click 'Load unpacked'."
Write-Host "   3. Paste the path (Ctrl+V) in the dialog and Select Folder."
Write-Host "   4. Click the puzzle icon and pin FeedHacker."
Write-Host "===============================================" -ForegroundColor White
Write-Host ""
Info "Installed. Updates download automatically; new files load when you restart Chrome."
Read-Host "Press Enter to close"
