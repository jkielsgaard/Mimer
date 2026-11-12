<#
.SYNOPSIS
  Downloads Foundry Local's native libraries (about 40 MB on Windows) into src-tauri\foundry-native,
  where Mimer's build packs them and a development build finds them.

.DESCRIPTION
  Uses the Foundry Local SDK's own build step (it fetches the "Runtime" package from NuGet), run
  through the empty crate in scripts\foundry-native-fetch. Needs Rust and internet.

    ./scripts/fetch-foundry-native.ps1
    ./scripts/fetch-foundry-native.ps1 -Version 2.2.0
#>
[CmdletBinding()]
param(
  [string]$Version = $(if ($env:FOUNDRY_LOCAL_RUNTIME_VERSION) { $env:FOUNDRY_LOCAL_RUNTIME_VERSION } else { "2.4.1" })
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root "src-tauri\foundry-native"
$manifest = Join-Path $root "scripts\foundry-native-fetch\Cargo.toml"

Write-Host "Fetching Foundry Local runtime $Version ..."
$env:FOUNDRY_LOCAL_RUNTIME_VERSION = $Version
$target = Join-Path $root "scripts\foundry-native-fetch\target\release\build"
$out = $null
# The SDK's build step only reports a failed download as a warning that cargo hides, so the
# libraries are looked for afterwards; on a miss its own messages are shown and it is tried again.
foreach ($attempt in 1..3) {
  cargo build --release --manifest-path $manifest
  if ($LASTEXITCODE -ne 0) { throw "cargo build failed ($LASTEXITCODE)" }
  $out = Get-ChildItem -Path $target -Directory -Filter "foundry-local-sdk-*" |
    ForEach-Object { Join-Path $_.FullName "out" } |
    Where-Object { Test-Path (Join-Path $_ "foundry_local.dll") } |
    Select-Object -Last 1
  if ($out) { break }
  Write-Host "Attempt ${attempt}: the native libraries were not found. The SDK's build said:"
  Get-ChildItem -Path $target -Directory -Filter "foundry-local-sdk-*" | ForEach-Object {
    $o = Join-Path $_.FullName "output"
    if (Test-Path $o) { Get-Content $o | Write-Host }
  }
  cargo clean --release -p foundry-local-sdk --manifest-path $manifest
  Start-Sleep -Seconds 15
}
if (-not $out) { throw "The native libraries were not found in $target" }

New-Item -ItemType Directory -Path $dest -Force | Out-Null
Get-ChildItem -Path $out -Filter *.dll | Copy-Item -Destination $dest -Force
Write-Host "Copied to ${dest}:"
Get-ChildItem $dest | ForEach-Object { Write-Host $_.Name ([math]::Round($_.Length / 1MB, 1)) "MB" }
