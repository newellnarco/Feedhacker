# FeedHacker native-messaging host. Lets the extension's "Update now" button pull the
# latest GREEN release (via lib.ps1) and then reload itself - no Chrome restart.
#
# Chrome speaks native messaging as: a 4-byte little-endian length prefix followed by a
# UTF-8 JSON message, on stdin/stdout. CRITICAL: nothing else may write to stdout, or the
# frame is corrupted - so every log line goes to update.log, never the console. The reply
# is a single framed JSON object: { ok, updated, version } or { ok:false, error }.
#Requires -Version 5.1
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Root = Join-Path $env:LOCALAPPDATA "FeedHacker"
$Ext  = Join-Path $Root "extension"
$Log  = Join-Path $Root "update.log"
function LogLine($m) { try { Add-Content -Path $Log -Value ("{0}  host: {1}" -f (Get-Date -Format s), $m) } catch {} }

function Read-Message {
  $stdin = [Console]::OpenStandardInput()
  $lenBuf = New-Object byte[] 4
  $got = 0
  while ($got -lt 4) { $n = $stdin.Read($lenBuf, $got, 4 - $got); if ($n -le 0) { return $null }; $got += $n }
  $len = [BitConverter]::ToInt32($lenBuf, 0)
  if ($len -le 0) { return "" }
  $buf = New-Object byte[] $len
  $got = 0
  while ($got -lt $len) { $n = $stdin.Read($buf, $got, $len - $got); if ($n -le 0) { break }; $got += $n }
  return [System.Text.Encoding]::UTF8.GetString($buf, 0, $got)
}

function Write-Message($obj) {
  $json = ($obj | ConvertTo-Json -Compress)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $stdout = [Console]::OpenStandardOutput()
  $stdout.Write([BitConverter]::GetBytes([int]$bytes.Length), 0, 4)
  $stdout.Write($bytes, 0, $bytes.Length)
  $stdout.Flush()
}

try {
  [void](Read-Message)   # any message means "update"; contents are not needed
  LogLine "update requested by the extension"
  . (Join-Path $PSScriptRoot "lib.ps1")
  if (-not (Test-Path (Join-Path $Ext "manifest.json"))) {
    Write-Message @{ ok = $false; error = "FeedHacker is not installed at $Ext." }
    exit 0
  }
  $ver = Sync-LatestRelease -Repo "newellnarco/Feedhacker" -ExtDir $Ext -Log { param($m) LogLine $m }
  if ($ver) {
    LogLine "updated to v$ver"
    Write-Message @{ ok = $true; updated = $true; version = "$ver" }
  } else {
    $cur = Get-InstalledVersion -ExtDir $Ext
    LogLine "already on the latest (v$cur)"
    Write-Message @{ ok = $true; updated = $false; version = "$cur" }
  }
} catch {
  LogLine ("ERROR: " + $_.Exception.Message)
  try { Write-Message @{ ok = $false; error = $_.Exception.Message } } catch {}
}
