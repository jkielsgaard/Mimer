<#
.SYNOPSIS
  Installs the test copy of the Mimer Store package (the one signed with the test certificate) on a
  Windows test computer, for example Windows Sandbox or a virtual machine. Run it as administrator
  from the folder that has the .msix and .cer files. It is not for your everyday computer.

.PARAMETER Remove
  Removes Mimer again, and the test certificate.
#>
[CmdletBinding()]
param(
  [string]$Folder = $PSScriptRoot,
  [string]$IdentityName = "Jkielsgaard.Mimer",
  [switch]$Remove
)

$ErrorActionPreference = "Stop"

if ($Remove) {
  Get-AppxPackage -Name $IdentityName | Remove-AppxPackage
  Get-ChildItem Cert:\LocalMachine\TrustedPeople | Where-Object { $_.FriendlyName -eq "Mimer test package" } | Remove-Item
  Write-Host "Mimer and the test certificate are removed."
  return
}

$cer = Get-ChildItem -Path $Folder -Filter "*.cer" | Select-Object -First 1
$msix = Get-ChildItem -Path $Folder -Filter "*_test.msix" | Select-Object -First 1
if (-not $cer -or -not $msix) { throw "Put this script next to the *_test.msix and mimer-test.cer files." }

# Windows only installs a package whose signer it trusts.
Import-Certificate -FilePath $cer.FullName -CertStoreLocation Cert:\LocalMachine\TrustedPeople | Out-Null
Add-AppxPackage -Path $msix.FullName
$pkg = Get-AppxPackage -Name $IdentityName
Write-Host "Installed $($pkg.PackageFullName). Start Mimer from the Start menu."
