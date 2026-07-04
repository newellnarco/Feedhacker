# FeedHacker — auto-update. Pulls the latest from GitHub and rebuilds in place.
# Run by the scheduled task, or manually via update.bat. Chrome loads the rebuilt
# files on its next restart (or click the reload icon on chrome://extensions).
#Requires -Version 5.1
[CmdletBinding()]
param([string]$Branch = "")
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Root = Join-Path $env:LOCALAPPDATA "FeedHacker"
$Repo = Join-Path $Root "repo"
$Log  = Join-Path $Root "update.log"
function Log($m) { $line = "{0}  {1}" -f (Get-Date -Format s), $m; Add-Content -Path $Log -Value $line; Write-Host $line }

try {
  if (-not (Test-Path (Join-Path $Repo ".git"))) { Log "No checkout at $Repo — run install first."; exit 1 }
  if (-not $Branch) { $Branch = (git -C $Repo rev-parse --abbrev-ref HEAD).Trim() }

  Log "Checking origin/$Branch…"
  git -C $Repo fetch origin $Branch | Out-Null
  $local  = (git -C $Repo rev-parse HEAD).Trim()
  $remote = (git -C $Repo rev-parse "origin/$Branch").Trim()
  if ($local -eq $remote) { Log "Already up to date ($local)."; exit 0 }

  Log "Updating $local -> $remote"
  git -C $Repo reset --hard "origin/$Branch" | Out-Null
  Push-Location $Repo
  try { npm ci | Out-Null; npm run build | Out-Null } finally { Pop-Location }
  Log "Rebuilt. Restart Chrome (or reload on chrome://extensions) to apply."
} catch {
  Log ("ERROR: " + $_.Exception.Message)
  exit 1
}
