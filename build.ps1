<#
    .SYNOPSIS
        Create extension and create Go Current package.
    .NOTES
        Requires: 
        npm install -g vsce
        Go Current server
#>

param(
    [string] $GitCommit,
    [string] $BuildNumber,
    [string] $Vsce
)

$ErrorActionPreference = 'stop'

Import-Module GoCurrentServer

Remove-Item (Join-Path $PSScriptRoot '*.vsix')
Remove-Item (Join-Path $PSScriptRoot '*.zip')

$PackageBackupPath = Join-Path $PSScriptRoot 'package.json.original'
$PackagePath = (Join-Path $PSScriptRoot 'package.json')

$PackageJson = ConvertFrom-Json -InputObject (Get-Content -Path $PackagePath -Raw)

if ($GitCommit -and $BuildNumber)
{
    Copy-Item $PackagePath $PackageBackupPath
    $GitCommit = $GitCommit.Substring(0, 8)
    if ($PackageJson.Version.Contains("-"))
    {
        $PackageJson.Version = "$($PackageJson.Version).$BuildNumber+$GitCommit"
    }
    else
    {
        $PackageJson.Version = "$($PackageJson.Version)+$BuildNumber.$GitCommit"
    }

    Set-Content -Value (ConvertTo-Json -InputObject $PackageJson) -Path (Join-Path $PSScriptRoot 'package.json')
}
Push-Location
Set-Location $PSScriptRoot
if ($Vsce)
{
    $Process = Start-Process $Vsce package -PassThru
}
else
{
    $Process = Start-Process vsce package  -PassThru
}
$Process.WaitForExit()
Pop-Location
if ($Process.ExitCode -ne 0)
{
    throw "vsce exited with ${LASTEXITCODE}: $Output"
}

if (Test-Path $PackageBackupPath)
{
    Move-Item $PackageBackupPath $PackagePath -Force
}

$Package = @{
    'Id' = 'go-current-workspace'
    'Name' = "LS Go Current Workspace"
    'Version' = ($PackageJson.version -split '-')[0]
    'IncludePaths' = @(
        (Get-Item (Join-Path $PSScriptRoot "*-$($PackageJson.Version).vsix")),
        (Join-Path $PSScriptRoot 'package\*')
    )
    'OutputDir' = $PSScriptRoot
    'Commands' = @{
        'Install' = 'Package.psm1:Install-Package'
        'Update' = 'Package.psm1:Install-Package'
    }
}

New-GoPackage @Package -Force