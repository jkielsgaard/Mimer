<#
.SYNOPSIS
  Downloads Foundry Local's native libraries (about 40 MB on Windows) into src-tauri\foundry-native,
  where Mimer's build packs them and a development build finds them.

.DESCRIPTION
  Uses the Foundry Local SDK's own build step (it fetches the "Runtime" package from NuGet), run
  through the small test program in spikes\foundry-local-test. Needs Rust and internet.

    ./scripts/fetch-foundry-native.ps1
    ./scripts/fetch-foundry-native.ps1 -Version 2.2.0
#>
[CmdletBinding()]
param(
  [string]$Version = $(if ($env:FOUNDRY_LOCAL_RUNTIME_VERSION) { $env:FOUNDRY_LOCAL_RUNTIME_VERSION } else { "2.1.0" })
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root "src-tauri\foundry-native"
$manifest = Join-Path $root "spikes\foundry-local-test\Cargo.toml"

Write-Host "Fetching Foundry Local runtime $Version ..."
$env:FOUNDRY_LOCAL_RUNTIME_VERSION = $Version
cargo build --release --manifest-path $manifest
if ($LASTEXITCODE -ne 0) { throw "cargo build failed ($LASTEXITCODE)" }

$target = Join-Path $root "spikes\foundry-local-test\target\release\build"
$out = Get-ChildItem -Path $target -Directory -Filter "foundry-local-sdk-*" |
  ForEach-Object { Join-Path $_.FullName "out" } |
  Where-Object { Test-Path (Join-Path $_ "foundry_local.dll") } |
  Select-Object -Last 1
if (-not $out) { throw "The native libraries were not found in $target" }

New-Item -ItemType Directory -Path $dest -Force | Out-Null
Get-ChildItem -Path $out -Filter *.dll | Copy-Item -Destination $dest -Force
Write-Host "Copied to ${dest}:"
Get-ChildItem $dest | ForEach-Object { Write-Host $_.Name ([math]::Round($_.Length / 1MB, 1)) "MB" }
