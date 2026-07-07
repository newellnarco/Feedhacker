# FeedHacker - uninstaller. Removes the auto-update task and (optionally) the local
# files. Chrome cannot remove an unpacked extension programmatically, so it opens
# chrome://extensions for the final one-click Remove.
#
# Usage:  double-click uninstall.bat, or:
#   powershell -ExecutionPolicy Bypass -File uninstall.ps1 [-Purge]
#Requires -Version 5.1
[CmdletBinding()]
param([switch]$Purge)
$ErrorActionPreference = "SilentlyContinue"

function Info($m) { Write-Host "[FeedHacker] $m" -ForegroundColor Cyan }
function Find-Chrome {
  $paths = @(
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:LocalAppData "Google\Chrome\Application\chrome.exe")
  )
  return ($paths | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1)
}

$Root = Join-Path $env:LOCALAPPDATA "FeedHacker"

schtasks /Delete /F /TN "FeedHacker Auto-Update" | Out-Null
Info "Removed the auto-update scheduled task."

Remove-Item -Path "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.feedhacker.updater" -Force -ErrorAction SilentlyContinue | Out-Null
Info "Removed the self-update helper registration."

$chrome = Find-Chrome
if ($chrome) { Start-Process $chrome "chrome://extensions/" }
Write-Host ""
Write-Host "Final step: on the Chrome 'Extensions' page, click 'Remove' on FeedHacker." -ForegroundColor White
Write-Host ""

if ($Purge) {
  Remove-Item -Recurse -Force $Root
  Info "Deleted $Root"
} else {
  Info "Local files kept at $Root. Re-run with -Purge to delete them too."
}
Read-Host "Press Enter to close"
