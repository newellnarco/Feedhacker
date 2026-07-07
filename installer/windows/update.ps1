# FeedHacker - auto-update. Downloads the latest GREEN release from GitHub (published
# only after CI passes) and refreshes the installed extension in place. No build, no
# source, no admin. Run by the scheduled task, or manually via update.bat. Chrome loads
# the refreshed files on its next restart (or click reload on chrome://extensions).
#Requires -Version 5.1
[CmdletBinding()]
param([string]$Repo = "newellnarco/Feedhacker", [switch]$Force)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
. (Join-Path $PSScriptRoot "lib.ps1")

$Root = Join-Path $env:LOCALAPPDATA "FeedHacker"
$Ext  = Join-Path $Root "extension"
$Log  = Join-Path $Root "update.log"
New-Item -ItemType Directory -Force -Path $Root | Out-Null
function Log($m) { $line = "{0}  {1}" -f (Get-Date -Format s), $m; Add-Content -Path $Log -Value $line; Write-Host $line }

try {
  if (-not (Test-Path (Join-Path $Ext "manifest.json"))) { Log "Not installed at $Ext - run install first."; exit 1 }
  Log "Checking GitHub for the latest green release..."
  $new = Sync-LatestRelease -Repo $Repo -ExtDir $Ext -Force:$Force -Log { param($m) Log $m }
  if ($new) { Log "Updated to v$new. Restart Chrome (or reload on chrome://extensions) to apply." }
} catch {
  Log ("ERROR: " + $_.Exception.Message)
  exit 1
}
