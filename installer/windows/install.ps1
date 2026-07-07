# FeedHacker - Windows installer (no admin, no build, no source).
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
  Info "Installing the bundled prebuilt extension..."
  Copy-ExtensionInto -Src $bundled -ExtDir $Ext
} else {
  Info "Downloading the latest green release from GitHub..."
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

# --- Native-messaging host: lets the extension's "Update now" button self-update ---
# The extension messages this host, which downloads the latest release and refreshes the
# files; the extension then reloads itself with no Chrome restart. Per-user (HKCU), no
# admin. The extension ID below is fixed by the "key" baked into the sideload build's
# manifest (see scripts/build.mjs) - keep the two in sync.
try {
  $hostName = "com.feedhacker.updater"
  $extId    = "fefpmbcbklcplgfohobiekbndohmfcpi"
  $hostBat  = Join-Path $Inst "updater-host.bat"
  $hostJson = Join-Path $Inst "$hostName.json"
  $spec = [ordered]@{
    name            = $hostName
    description     = "FeedHacker self-update helper"
    path            = $hostBat
    type            = "stdio"
    allowed_origins = @("chrome-extension://$extId/")
  }
  ($spec | ConvertTo-Json) | Set-Content -Path $hostJson -Encoding ASCII
  $reg = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName"
  New-Item -Path $reg -Force | Out-Null
  Set-ItemProperty -Path $reg -Name "(Default)" -Value $hostJson
  Info "Registered the self-update helper - 'Update now' in the extension works without a restart."
} catch { Warn "Could not register the self-update helper; 'Update now' will fall back to update.bat." }

# --- 3. One-time Load unpacked (Chrome blocks silent off-store installs) ---
Set-Clipboard -Value $Ext
$chrome = Find-Chrome
if ($chrome) { Start-Process $chrome "chrome://extensions/" } else { Warn "Chrome not found automatically - open chrome://extensions manually." }

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
Info "Installed. Updates download automatically; or use 'Update now' in the extension's Advanced Settings to update and apply instantly - no restart."
Read-Host "Press Enter to close"
