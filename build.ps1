<#
    .SYNOPSIS
        Create extension and create Go Current package.
    .NOTES
        Requires:
        Node.js (npm)
        npm install -g vsce
        Go Current server
#>

param(
    [string] $GitCommit = $null,
    [string] $BuildNumber = $null,
    [string] $Vsce,
    [string] $Npm
)

Write-Host "vsce: $Vsce"
Write-Host "npm: $Npm"

$ErrorActionPreference = 'stop'


Remove-Item (Join-Path $PSScriptRoot '*.vsix')
Remove-Item (Join-Path $PSScriptRoot '*.zip')

$PackageBackupPath = Join-Path $PSScriptRoot 'package.json.original'
$PackagePath = (Join-Path $PSScriptRoot 'package.json')

$PackageContent = (Get-Content -Path $PackagePath -Raw)
$PackageJson = ConvertFrom-Json -InputObject $PackageContent
$Version = $PackageJson.Version.Replace('+developer', '')

if ($GitCommit -and $BuildNumber)
{
    Copy-Item $PackagePath $PackageBackupPath
    $GitCommit = $GitCommit.Substring(0, 8)
    $Version = "$Version+build-$BuildNumber-$GitCommit"

    $NewPackageContent = $PackageContent.Replace([string]$PackageJson.version, [string]$Version)
    Set-Content -Value $NewPackageContent -Path (Join-Path $PSScriptRoot 'package.json')
}
Push-Location
Set-Location $PSScriptRoot
if (!$Vsce)
{
    $Vsce = 'vsce'
}
if (!$Npm)
{
    $Npm = 'npm'
}
$Process = Start-Process $Npm install -PassThru
$Process.WaitForExit()
if ($Process.ExitCode -ne 0)
{
    throw "npm exited with $($Process.ExitCode)."
}
$Process = Start-Process $Vsce package -PassThru
$Process.WaitForExit()
if ($Process.ExitCode -ne 0)
{
    throw "vsce exited with $($Process.ExitCode)."
}
Pop-Location

if (Test-Path $PackageBackupPath)
{
    Move-Item $PackageBackupPath $PackagePath -Force
}

Import-Module GoCurrentServer
$Package = @{
    'Id' = 'go-current-workspace'
    'Name' = "Go Current Workspace"
    'Version' = (($Version -split '-')[0] -split '\+')[0]
    'IncludePaths' = @(
        (Get-Item (Join-Path $PSScriptRoot "*.vsix")),
        (Join-Path $PSScriptRoot 'package\*')
    )
    'OutputDir' = $PSScriptRoot
    'Commands' = @{
        'Install' = 'Package.psm1:Install-Package'
        'Update' = 'Package.psm1:Install-Package'
    }
}

New-GocsPackage @Package -Force