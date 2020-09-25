$ErrorActionPreference = 'stop'

Import-Module (Join-Path $PSScriptRoot 'ProjectFile.psm1')
Import-Module (Join-Path $PSScriptRoot 'AlTools.psm1')

$_RequiredFields = @('id', 'version', 'name')

try
{
    $env:PSModulePath = [System.Environment]::GetEnvironmentVariable("PSModulePath", "machine")
    Import-Module GoCurrentServer
    $_GoCurrentInstalled = $true
}
catch
{
    $_GoCurrentInstalled = $false
}

function Get-GoCurrentServerVersion()
{
    $HasRequiredVersion = $false
    $CurrentVersion = ''
    $RequiredVersion = [Version]::Parse('0.15.11')
    if ($_GoCurrentInstalled)
    {
        $CurrentVersion = ((Get-Module -Name 'GoCurrentServer') | Select-Object -First 1).Version

        $HasRequiredVersion = $CurrentVersion -ge $RequiredVersion
        $CurrentVersion = $CurrentVersion.ToString()
    }
    $RequiredVersion = $RequiredVersion.ToString()

    return ConvertTo-Json -Compress -InputObject @{
        RequiredVersion = $RequiredVersion
        CurrentVersion = $CurrentVersion
        HasRequiredVersion = $HasRequiredVersion
        IsInstalled = $_GoCurrentInstalled
    }
}

function Get-Targets
{
    param(
        [Parameter(Mandatory)]
        $ProjectFilePath,
        $Id,
        $UseDevTarget = $false
    )
    return ConvertTo-Json -Depth 100 -Compress -InputObject @(Get-ProjectFileTargets -Path $ProjectFilePath -Id $Id -UseDevTarget:$UseDevTarget)
}

function New-Package
{
    param(
        $ProjectFilePath,
        $Target,
        $BranchName,
        $DefaultOutputDir
    )

    $ProjectFile = Get-ProjectFile -Path $ProjectFilePath -Target $Target -BranchName $BranchName

    foreach ($RequiredField in $_RequiredFields)
    {
        if ($RequiredField -notin $ProjectFile.Keys)
        {
            throw "The property `"$RequiredField`" is missing from your project file (gocurrent.json)."
        }
    }

    if (!$ProjectFile.outputDir)
    {
        $ProjectFile.outputDir = $DefaultOutputDir
    }

    $Package = New-GocsPackage @ProjectFile -Force
    return ConvertTo-Json $Package.Path
}

function New-AlPackage
{
    param(
        [string] $ProjectDir,
        [string] $ProjectFilePath,
        [string] $Target,
        [string] $BranchName
    )

    $ProjectFile = Get-ProjectFile -Path $ProjectFilePath -Target $Target -BranchName $BranchName

    $Package = New-AlProjectPackage -ProjectDir $ProjectDir -AppPath ($ProjectFile.InputPath | Select-Object -First 1) -Target $Target -BranchName $BranchName -Force
    return ConvertTo-Json $Package.Path
}

function Test-NetpackageLocked
{
    param(
        $ProjectDir
    )

    $Dir = Join-path $ProjectDir '.netpackages'
    return Test-DllLockInDir -Dir $Dir | ConvertTo-Json -Compress
}

function Get-Dependencies
{
    param(
        [Parameter(Mandatory)]
        $ProjectDir,
        [Parameter(Mandatory)]
        $ProjectFilePath,
        $BranchName,
        $Target,
        $OutputDir = $null
    )

    $Modifiers = Get-ProjectFileCompileModifiers -Path $ProjectFilePath -Target $Target -BranchName $BranchName -Idx 0

    Get-AlProjectDependencies -ProjectDir $ProjectDir -BranchName $BranchName -Target $Target -Verbose -CompileModifiers $Modifiers -OutputDir $OutputDir
}

function New-TempDir
{
    $Dir = [System.IO.Path]::Combine($env:TEMP, "Workspace", [System.IO.Path]::GetRandomFileName());
    [System.IO.Directory]::CreateDirectory($Dir) | Out-Null
    return (ConvertTo-Json $Dir -Compress)
}

function Invoke-Compile
{
    param(
        [Parameter(Mandatory)]
        [string] $ProjectDir,
        [Parameter(Mandatory)]
        $CompilerPath,
        [Parameter(Mandatory)]
        $DependenciesDir
    )
    
    $AddinDir = @((Join-Path $DependenciesDir '.netpackages'), "C:\WINDOWS\Microsoft.NET\assembly")
    Write-Verbose 'Compiling app...'

    $Arguments = @{
        ProjectDir = $ProjectDir
        CompilerPath = $CompilerPath
        OutputDir = $ProjectDir
        AssemblyDir = $AddinDir
        AlPackagesDir = Join-Path $DependenciesDir '.alpackages'
    }

    $AppPath = Invoke-AlCompiler @Arguments -Verbose

    Write-Host "App created at `"$AppPath`"."
}