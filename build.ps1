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
    [string] $GitCommit = $env:bamboo_planRepository_revision,
    [string] $BuildNumber = $env:bamboo.buildNumber,
    [string] $Vsce = $env:bamboo_capability_system_builder_command_vsce,
    [string] $Npm = $env:bamboo_capability_system_builder_command_npm,
    [string] $Branch = $env:bamboo_planRepository_branch,
    [string] $ReleaseBranch = 'master'
)

Write-Host "vsce: $Vsce"
Write-Host "npm: $Npm"

$ErrorActionPreference = 'stop'

function ConvertTo-PackageBranchName
{
    param(
        $GitBranchName
    )
    return $GitBranchName.Replace('origin/', '').Replace('/', '-').Replace('_', '-').ToLower()
}

Remove-Item (Join-Path $PSScriptRoot '*.vsix')
Remove-Item (Join-Path $PSScriptRoot '*.zip')

$PackageBackupPath = Join-Path $PSScriptRoot 'package.json.original'
$PackagePath = (Join-Path $PSScriptRoot 'package.json')

$PackageContent = (Get-Content -Path $PackagePath -Raw)
$PackageJson = ConvertFrom-Json -InputObject $PackageContent
$Version = $PackageJson.Version.Replace('-developer', '')

if ($GitCommit -and $BuildNumber)
{
    Copy-Item $PackagePath $PackageBackupPath
    $GitCommit = $GitCommit.Substring(0, 8)

    Set-Content -Path (Join-Path $PSScriptRoot 'commit') -Value $GitCommit
    if ($Branch -eq $ReleaseBranch)
    {
        $Version = "$Version"
    }
    else
    {
        $BranchName = ConvertTo-PackageBranchName -GitBranchName $Branch
        $Version = "$Version-dev.$BranchName.$BuildNumber+$GitCommit"
    }

    $NewPackageContent = $PackageContent.Replace([string]$PackageJson.version, [string]$Version)
    Set-Content -Value $NewPackageContent -Path (Join-Path $PSScriptRoot 'package.json')
}
Push-Location
Set-Location $PSScriptRoot
if (!$Vsce -or !(Test-Path $Vsce))
{
    Write-Host "Set global vsce"
    $Vsce = 'vsce'
}
if (!$Npm -or !(Test-Path $Npm))
{
    Write-Host "Set global npm"
    $Npm = 'npm'
}

$ErrorActionPreference = 'continue'

& $Npm install | Write-Host

if ($LASTEXITCODE -ne 0)
{
    throw "npm exited with $LASTEXITCODE."
}


& $Vsce package --baseImagesUrl 'https://selfservice.lsretail.com/help/workspace' | Write-Host

if ($LASTEXITCODE -ne 0)
{
    throw "vsce exited with $LASTEXITCODE."
}

$ErrorActionPreference = 'stop'

Pop-Location

if (Test-Path $PackageBackupPath)
{
    Move-Item $PackageBackupPath $PackagePath -Force
}

Import-Module GoCurrentServer
$Package = @{
    'Id' = 'ls-update-service-workspace'
    'Name' = "LS Update Service Workspace"
    'Version' = $Version
    'IncludePaths' = @(
        (Get-Item (Join-Path $PSScriptRoot "*.vsix")),
        (Join-Path $PSScriptRoot 'package\*')
    )
    'OutputDir' = $PSScriptRoot
    'Commands' = @{
        'Install' = 'Package.psm1:Install-Package'
        'Update' = 'Package.psm1:Install-Package'
        'Remove' = 'Package.psm1:Remove-Package'
    }
}

New-GocsPackage @Package -Force