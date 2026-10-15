<#
.SYNOPSIS
  Builds the Microsoft Store package (MSIX) of Mimer from the Windows release build.

.DESCRIPTION
  Run this on Windows with the Windows SDK installed (it provides makeappx and signtool; GitHub's
  windows-latest runners have it). Build Mimer first (`pnpm tauri build`), then:

    ./scripts/msix/Build-Msix.ps1 -Version 0.8.1

  Without -TestSign the package is UNSIGNED, which is what Partner Center wants: the Store signs it.
  With -TestSign a self-signed test certificate is made and the package is signed with it, so it can
  be installed on a test computer (see Install-TestMsix.ps1). The Store never accepts that copy.

  Name and Publisher must be the values Partner Center shows under "Product identity" once the app
  name is reserved. The defaults are placeholders that are fine for test packages.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$Exe = "src-tauri\target\release\mimer.exe",
  [string]$IconDir = "src-tauri\icons",
  [string]$OutDir = "msix-out",
  [string]$IdentityName = "Jkielsgaard.Mimer",
  [string]$Publisher = "CN=00000000-0000-0000-0000-000000000000",
  [string]$PublisherDisplayName = "Jesper Ahasverusen Kielsgaard",
  [switch]$TestSign
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

# "v0.8.1" or "0.8.1" becomes the four-part version MSIX needs, "0.8.1.0".
if ($Version -notmatch '^v?(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?') {
  throw "Version must look like 0.8.1 (got '$Version')"
}
$fourth = if ($Matches[4]) { $Matches[4] } else { "0" }
$msixVersion = "$($Matches[1]).$($Matches[2]).$($Matches[3]).$fourth"

function Find-SdkTool([string]$name) {
  $found = Get-Command $name -ErrorAction SilentlyContinue
  if ($found) { return $found.Source }
  $roots = @("${env:ProgramFiles(x86)}\Windows Kits\10\bin", "$env:ProgramFiles\Windows Kits\10\bin") |
    Where-Object { Test-Path $_ }
  foreach ($root in $roots) {
    $hit = Get-ChildItem -Path $root -Recurse -Filter $name -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match '\\x64\\' } |
      Sort-Object FullName -Descending | Select-Object -First 1
    if ($hit) { return $hit.FullName }
  }
  throw "$name was not found. Install the Windows 10/11 SDK."
}

if (-not (Test-Path $Exe)) { throw "The program was not found: $Exe. Build Mimer first." }
$makeappx = Find-SdkTool "makeappx.exe"

$stage = Join-Path $OutDir "stage"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $stage "Assets") -Force | Out-Null

# The program and the logos the manifest points at.
Copy-Item $Exe (Join-Path $stage "mimer.exe")
foreach ($logo in @("StoreLogo.png", "Square44x44Logo.png", "Square150x150Logo.png")) {
  $src = Join-Path $IconDir $logo
  if (-not (Test-Path $src)) { throw "Missing logo: $src" }
  Copy-Item $src (Join-Path $stage "Assets\$logo")
}

# Fill in the manifest.
function Escape-Xml([string]$s) { [System.Security.SecurityElement]::Escape($s) }
$manifest = Get-Content (Join-Path $here "AppxManifest.xml.template") -Raw -Encoding UTF8
$manifest = $manifest.Replace("{{NAME}}", (Escape-Xml $IdentityName)).
  Replace("{{PUBLISHER}}", (Escape-Xml $Publisher)).
  Replace("{{PUBLISHER_DISPLAY}}", (Escape-Xml $PublisherDisplayName)).
  Replace("{{VERSION}}", $msixVersion)
if ($manifest -match '\{\{[A-Z_]+\}\}') { throw "The manifest still has an unfilled value: $($Matches[0])" }
[System.IO.File]::WriteAllText((Join-Path $stage "AppxManifest.xml"), $manifest, (New-Object System.Text.UTF8Encoding($false)))

# Pack. makeappx also checks the manifest, so a mistake in it stops here.
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$msix = Join-Path $OutDir "Mimer_${msixVersion}_x64.msix"
if (Test-Path $msix) { Remove-Item $msix -Force }
& $makeappx pack /d $stage /p $msix /o | Out-Host
if ($LASTEXITCODE -ne 0) { throw "makeappx failed ($LASTEXITCODE)" }
Write-Host "Built $msix (unsigned: for the Microsoft Store)"

Copy-Item (Join-Path $here "Install-TestMsix.ps1") $OutDir -Force

if ($TestSign) {
  $signtool = Find-SdkTool "signtool.exe"
  $cert = New-SelfSignedCertificate -Type Custom -Subject $Publisher -KeyUsage DigitalSignature `
    -FriendlyName "Mimer test package" -CertStoreLocation "Cert:\CurrentUser\My" `
    -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
  $password = ConvertTo-SecureString -String ([guid]::NewGuid().ToString()) -Force -AsPlainText
  $pfx = Join-Path $OutDir "mimer-test.pfx"
  Export-PfxCertificate -Cert $cert -FilePath $pfx -Password $password | Out-Null
  Export-Certificate -Cert $cert -FilePath (Join-Path $OutDir "mimer-test.cer") | Out-Null
  $plain = [System.Net.NetworkCredential]::new("", $password).Password
  $testMsix = Join-Path $OutDir "Mimer_${msixVersion}_x64_test.msix"
  Copy-Item $msix $testMsix -Force
  & $signtool sign /fd SHA256 /f $pfx /p $plain $testMsix | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "signtool failed ($LASTEXITCODE)" }
  Remove-Item $pfx -Force
  Remove-Item "Cert:\CurrentUser\My\$($cert.Thumbprint)" -Force
  Write-Host "Built $testMsix (signed with a test certificate: install with Install-TestMsix.ps1)"
}
