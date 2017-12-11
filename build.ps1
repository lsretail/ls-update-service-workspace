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
    [string] $BuildNumber
)

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

vsce package

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
Import-GoPackage -Path (Get-Item (Join-path $PSScriptRoot '*.zip')).FullName