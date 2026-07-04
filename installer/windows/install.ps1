# FeedHacker — Windows installer (no admin required).
# Clones/builds FeedHacker into %LOCALAPPDATA%\FeedHacker, registers a per-user
# daily auto-update task, then guides the one-time "Load unpacked" (Chrome does not
# allow unsigned extensions to be installed silently). Re-running updates in place.
#
# Usage:  double-click install.bat, or:
#   powershell -ExecutionPolicy Bypass -File install.ps1 [-Branch main] [-NoSchedule]
#Requires -Version 5.1
[CmdletBinding()]
param(
  [string]$RepoUrl = "https://github.com/newellnarco/Feedhacker.git",
  [string]$Branch  = "main",
  [switch]$NoSchedule
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Info($m) { Write-Host "[FeedHacker] $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "[FeedHacker] $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "[FeedHacker] ERROR: $m" -ForegroundColor Red; Read-Host "Press Enter to close"; exit 1 }
function Have($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Update-Path {
  $m = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $u = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$m;$u"
}
function Find-Chrome {
  $paths = @(
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:LocalAppData "Google\Chrome\Application\chrome.exe")
  )
  return ($paths | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1)
}

$Root = Join-Path $env:LOCALAPPDATA "FeedHacker"
$Repo = Join-Path $Root "repo"
$Ext  = Join-Path $Repo "dist\feedhacker"

Info "Install location: $Root"

# --- 1. Prerequisites (Git + Node.js). Try winget if missing. ---
if (-not (Have git)) {
  Warn "Git not found."
  if (Have winget) { Info "Installing Git via winget…"; winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements | Out-Null; Update-Path }
  if (-not (Have git)) { Die "Git is required. Install it from https://git-scm.com/download/win , reopen this window, and re-run." }
}
if (-not (Have node)) {
  Warn "Node.js not found."
  if (Have winget) { Info "Installing Node.js LTS via winget…"; winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements | Out-Null; Update-Path }
  if (-not (Have node)) { Die "Node.js LTS is required. Install it from https://nodejs.org , reopen this window, and re-run." }
}

# --- 2. Clone or update the repository ---
New-Item -ItemType Directory -Force -Path $Root | Out-Null
if (Test-Path (Join-Path $Repo ".git")) {
  Info "Updating existing checkout…"
  git -C $Repo fetch origin $Branch
  git -C $Repo checkout $Branch
  git -C $Repo reset --hard "origin/$Branch"
} else {
  Info "Cloning $RepoUrl ($Branch)…"
  git clone --branch $Branch $RepoUrl $Repo
}

# --- 3. Build the extension ---
Push-Location $Repo
try {
  Info "Installing dependencies (npm ci)…"
  npm ci
  Info "Building (npm run build)…"
  npm run build
} finally { Pop-Location }
if (-not (Test-Path (Join-Path $Ext "manifest.json"))) { Die "Build did not produce $Ext" }

# --- 4. Per-user daily auto-update task (no admin) ---
if (-not $NoSchedule) {
  $updater = Join-Path $Repo "installer\windows\update.ps1"
  $taskName = "FeedHacker Auto-Update"
  $cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$updater`" -Branch $Branch"
  try {
    schtasks /Create /F /SC DAILY /ST 09:00 /TN $taskName /TR $cmd | Out-Null
    Info "Registered daily auto-update task '$taskName' (updates from GitHub, then rebuilds)."
  } catch { Warn "Could not register the scheduled task; you can still update by running update.bat." }
}

# --- 5. One-time Load unpacked ---
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
Info "Installed. Updates apply automatically; new files load when you restart Chrome."
Read-Host "Press Enter to close"
