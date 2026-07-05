# FeedHacker — shared install/update helpers. Downloads the latest GREEN prebuilt
# release from GitHub (built and published only after CI passes) so end users never
# build from source. Prefers the GitHub REST API (no tools required); falls back to
# the local GitHub CLI (`gh`) when the API is unavailable.
#Requires -Version 5.1
Set-StrictMode -Version Latest

function Get-InstalledVersion {
  param([string]$ExtDir)
  $m = Join-Path $ExtDir "manifest.json"
  if (-not (Test-Path $m)) { return $null }
  try { return (Get-Content $m -Raw | ConvertFrom-Json).version } catch { return $null }
}

# Mirror the contents of a freshly-extracted extension folder into $ExtDir, replacing
# whatever was there so removed files don't linger. $Src holds manifest.json at its root.
function Copy-ExtensionInto {
  param([string]$Src, [string]$ExtDir)
  if (Test-Path $ExtDir) { Remove-Item -Recurse -Force $ExtDir }
  New-Item -ItemType Directory -Force -Path $ExtDir | Out-Null
  Copy-Item -Path (Join-Path $Src "*") -Destination $ExtDir -Recurse -Force
}

# Download + extract the latest release's unpacked-extension zip into $ExtDir.
# Returns the release version string on success, or throws. Skips (returns $null) when
# the installed version already matches the latest and -Force is not set.
function Sync-LatestRelease {
  param(
    [Parameter(Mandatory)] [string]$Repo,      # e.g. "newellnarco/Feedhacker"
    [Parameter(Mandatory)] [string]$ExtDir,
    [switch]$Force,
    [scriptblock]$Log = { param($m) Write-Host $m }
  )
  $api = "https://api.github.com/repos/$Repo/releases/latest"
  $headers = @{ "User-Agent" = "FeedHacker-Updater"; "Accept" = "application/vnd.github+json" }

  $rel = $null
  try { $rel = Invoke-RestMethod -Uri $api -Headers $headers -UseBasicParsing } catch { }
  # Fallback to the local GitHub CLI if the REST call failed (network/rate limit).
  if (-not $rel -and (Get-Command gh -ErrorAction SilentlyContinue)) {
    & $Log "REST API unavailable; trying the local GitHub CLI (gh)…"
    try { $rel = gh api "repos/$Repo/releases/latest" | ConvertFrom-Json } catch { }
  }
  if (-not $rel) { throw "Could not reach GitHub to find the latest release." }

  $tag = ("" + $rel.tag_name).TrimStart("v")
  $installed = Get-InstalledVersion -ExtDir $ExtDir
  if (-not $Force -and $installed -and $tag -and ($installed -eq $tag)) {
    & $Log "Already up to date (v$installed)."
    return $null
  }

  # The unpacked-extension asset is feedhacker-<version>.zip (NOT the -win bundle).
  $asset = $rel.assets | Where-Object { $_.name -like "feedhacker-*.zip" -and $_.name -notlike "*-win.zip" } | Select-Object -First 1
  if (-not $asset) { throw "Latest release has no feedhacker-<version>.zip asset." }

  $tmp = Join-Path $env:TEMP ("feedhacker_" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  try {
    $zip = Join-Path $tmp "extension.zip"
    & $Log "Downloading $($asset.name)…"
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip -Headers @{ "User-Agent" = "FeedHacker-Updater" } -UseBasicParsing
    $unzipped = Join-Path $tmp "unzipped"
    Expand-Archive -Path $zip -DestinationPath $unzipped -Force
    if (-not (Test-Path (Join-Path $unzipped "manifest.json"))) {
      throw "Downloaded archive did not contain manifest.json."
    }
    Copy-ExtensionInto -Src $unzipped -ExtDir $ExtDir
    & $Log "Installed FeedHacker v$tag into $ExtDir"
    return $tag
  } finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  }
}
