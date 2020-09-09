$ErrorActionPreference = 'stop'

Import-Module GoCurrent
Import-Module (Join-Path $PSScriptRoot 'ProjectFile.psm1') -Force
Import-Module LsSetupHelper\Release\Version

function Get-AlDependencies
{
    param(
        [Parameter(Mandatory = $true)]
        $Dependencies,
        [Parameter(Mandatory = $true)]
        $OutputDir,
        [switch] $Force
    )
    $PackageIds = $Dependencies | ForEach-Object { $_.Id}
    
    $Deps = ConvertTo-HashtableList $Dependencies

    $Resolved = @($Deps | Get-GocUpdates | Where-Object { $PackageIds.Contains($_.Id)})

    $TempDir = Join-Path $OutputDir 'Temp'
    $GatherDir = Join-Path $TempDir '.gather'
    [System.IO.Directory]::CreateDirectory($TempDir) | Out-Null
    [System.IO.Directory]::CreateDirectory($GatherDir) | Out-Null

    foreach ($Package in $Resolved)
    {
        $Files = $Package | Get-GocFile | Where-Object { $_.FilePath.ToLower().EndsWith('.app')}

        if (!$Files)
        {
            continue
        }

        Write-Verbose "Downloading app for $($Package.Id) v$($Package.version)..."
        $Files | Get-GocFile -Download -OutputDir $TempDir

        foreach ($File in $Files)
        {
            $FileName = [System.IO.Path]::GetFileName($File.FilePath)
            if (Test-Path (Join-Path $GatherDir $FileName))
            {
                throw "Two apps have the same name!"
            }
            Move-Item -Path ([System.IO.Path]::Combine($TempDir, $Package.Id, $File.FilePath)) -Destination (Join-Path $GatherDir $FileName) | Out-Null
        }
    }
    Move-Item -Path (Join-Path $GatherDir '*') -Destination $OutputDir | Out-Null

    Remove-Item $TempDir -Force -Recurse
}

function Get-AlAddinDependencies
{
    param(
        [Parameter(Mandatory = $true)]
        $Dependencies,
        [Parameter(Mandatory = $true)]
        $OutputDir,
        [switch] $IncludeServer,
        [switch] $Force
    )
    $PackageIds = $Dependencies | ForEach-Object { $_.Id}
    
    $Deps = ConvertTo-HashtableList $Dependencies

    $Resolved = @($Deps | Get-GocUpdates | Where-Object { $PackageIds.Contains($_.Id) -or ($IncludeServer -and $_.Id -eq 'bc-server')})

    $TempDir = Join-Path $OutputDir 'Temp'
    $GatherDir = Join-Path $TempDir '.gather'

    foreach ($Package in $Resolved)
    {
        $IsBcServer = $Package.Id -eq 'bc-server'

        if (!$IsBcServer)
        {
            $FoundAddin = $false
            foreach ($File in $Package | Get-GocFile)
            {
                if ($File.FilePath.ToLower().StartsWith('addin\'))
                {
                    $FoundAddin = $true
                    break;
                }
            }

            if (!$FoundAddin)
            {
                continue
            }
        }

        Write-Verbose "Downloading addin files for $($Package.Id) v$($Package.version)..."
        $Package | Get-GocFile -Download -OutputDir $TempDir

        $Dir = [System.IO.Path]::Combine($GatherDir, $Package.Id)
        [System.IO.Directory]::CreateDirectory($Dir) | Out-Null

        if ($IsBcServer)
        {
            Move-Item -Path ([System.IO.Path]::Combine($TempDir, $Package.Id, 'Service', '*')) -Destination $Dir | Out-Null    
        }
        else
        {
            Move-Item -Path ([System.IO.Path]::Combine($TempDir, $Package.Id, 'Addin', '*')) -Destination $Dir | Out-Null    
        }
        
        Get-ChildItem -Path $Dir -Filter '*.txt' -Recurse | Remove-Item
    }
    if (Test-Path $GatherDir)
    {
        Move-Item -Path (Join-Path $GatherDir '*') -Destination $OutputDir | Out-Null
    }

    if (Test-Path $TempDir)
    {
        Remove-Item $TempDir -Force -Recurse
    }
}

function Invoke-AlCompiler
{
    param(
        [Parameter(Mandatory = $true)]
        [string] $ProjectDir,
        [Parameter(Mandatory = $true)]
        [string] $CompilerPath,
        [Parameter(Mandatory = $true)]
        $OutputDir,
        $AlPackagesDir = $null,
        [Array]$AssemblyDir = $null
    )

    $AppJsonPath = Join-Path $ProjectDir 'app.json'
    $AppJson = Get-Content -Path $AppJsonPath -Raw | ConvertFrom-Json

    $FileName = "$($AppJson.publisher)_$($AppJson.name)_$($AppJson.version).app"
    [System.IO.Directory]::CreateDirectory($OutputDir) | Out-Null

    $FileOutputPath = Join-Path $OutputDir $FileName

    $Arguments = @("/project:`"$ProjectDir`"", "/packagecachepath:`"$ProjectDir\.alpackages`"", "/out:`"$FileOutputPath`"")

    if ($AssemblyDir -and (Test-Path $AssemblyDir))
    {
        $Joined = [string]::Join(',', $AssemblyDir)
        $Arguments += "/assemblyprobingpaths:`"$Joined`""
    }

    Write-Verbose "`"$CompilerPath`" $([string]::Join(' ', $Arguments))"

    $Output = & $CompilerPath @Arguments | Out-String

    if ($LASTEXITCODE -ne 0)
    {
        if ($Output)
        {
            Write-Warning $Output
        }
   
        throw "AL Compiler exited with exit code $LASTEXITCODE."
    }
    elseif ($Output)
    {
        Write-Verbose $Output
    }
    $FileOutputPath
}

function Get-AlCompiler
{
    param(
        $InstanceName = 'AlCompiler'
    )

    $PackageId = 'bc-al-compiler'

    $Updates = Get-GocUpdates -Id $PackageId -InstanceName $InstanceName

    if ($Updates)
    {
        Install-GocPackage -Id $PackageId -InstanceName $InstanceName -UpdateInstance | Out-Null
    }

    $InstalledPackage = Get-GocInstalledPackage -InstanceName $InstanceName -Id $PackageId
    return $InstalledPackage.Info.CompilerPath
}

function Remove-IfExists
{
    param([string]$Path)
    if ($Path.EndsWith('*'))
    {
        $Path = Split-Path $Path -Parent
    }
    if (Test-Path $Path)
    {
        Remove-Item $Path -Recurse -Force
    }
}

function New-AlPackage
{
    param(
        [Parameter(Mandatory = $true)]
        $AlProjectFilePath,
        [Parameter(Mandatory = $true)]
        $GocProjectFilePath,
        [Parameter(Mandatory = $true)]
        $AppPath,
        [Alias('PreReleaseTag', 'PreReleaseVersion')]
        $PreReleaseLabel,
        $OverwriteVersion,
        [Parameter(Mandatory = $true)]
        $OutputDir,
        $Target,
        [switch] $Force
    )
    Import-Module LsPackageTools\AppPackageCreator

    $AlProject = Get-Content -Path $AlProjectFilePath -Raw | ConvertFrom-Json
    $GoCProject = Get-Content -Path $GocProjectFilePath -Raw | ConvertFrom-Json
    $DepdenciesGroup = Get-ProjectFilePackages -Id 'dependencies' -Path $GocProjectFilePath -Target $Target

    $Dependencies = @()
    foreach ($Dep in $DepdenciesGroup.Packages)
    {
        $NewEntry = @{}
        $Dep.PSObject.properties | ForEach-Object { $NewEntry[$_.Name] = $_.Value }

        $Dependencies += $NewEntry
    }

    $Package = @{
        Id = $GoCProject.Id
        Name = $AlProject.Name
        Description = $AlProject.Description
        Version = $AlProject.Version
        Path = $AppPath
        OutputDir = $OutputDir
        Dependencies = $Dependencies
    }

    if ($GoCProject.Name)
    {
        $Package.Name = $GoCProject.Name
    }

    if ($GoCProject.Description)
    {
        $Package.Description = $GoCProject.Description
    }

    if ($OverwriteVersion)
    {
        $Package.Version = $OverwriteVersion
    }

    if ($PreReleaseLabel)
    {
        if ($PreReleaseLabel.StartsWith('+'))
        {
            $Package.Version = "$($Package.Version)$PreReleaseLabel"    
        }
        elseif ($PreReleaseLabel.StartsWith('-'))
        {
            $Package.Version = "$($Package.Version)$PreReleaseLabel"
        }
        else 
        {
            $Package.Version = "$($Package.Version)-$PreReleaseLabel"
        }
    }

    if ($GoCProject.DisplayName)
    {
        $Package.DisplayName = $GoCProject.DisplayName
    }

    New-AppPackage @Package -Force:$Force
}

function Invoke-AlProjectBuild
{
    <#
        .SYNOPSIS
            Build specified al project
        
        .PARAMETER ProjectDir
            Specify the project directory (or repository directory).

        .PARAMETER PreReleaseLabel
            Specify a pre-release label, which is added to the version.
            I.e. 1.0-specified-pre-release-label
        
        .PARAMETER OverwriteAppVersion
            Overwrites the version defined in app.json.
        
        .PARAMETER OverwritePackageVersion
            Overwrite the version for the package. 
            By default, it picks the version from app.json
        
        .PARAMETER Target
            Specify a target to compile against. Can be used to resolve
            different dependencies for release, release candidate and development.

        .PARAMETER OutputDir
            Specifies the output directory for the package and artifacts.
        
        .PARAMETER CompileModifiers
            Specifies additional version query for dependencies to compile against.
            For example, the AL package depends on BC >=1.0 <2.0. By default,
            this app will be compiled against 1.0, but you might want to compile against
            the lates 1.X version. You can add a modifier:
            @(
                @{ Id = 'bc-server'; Version = '^'}
            )

            The resulting version query would be "^ >=1.0 <2.0" instead of just  "">=1.0 <2.0".

            This does not affect the dependencies for the package.
        
        .PARAMETER Force
            If specified, it will overwrite any existing files.
    #>
    param(
        [Parameter(Mandatory = $true)]
        $ProjectDir,
        [Alias('PreReleaseTag', 'PreReleaseVersion')]
        $PreReleaseLabel,
        $OverwritePackageVersion,
        $Target,
        $OutputDir,
        [Array] $CompileModifiers,
        [switch] $Force
    )
    
    $PossibleProjectPath = @((Join-Path $ProjectDir '.gocurrent\gocurrent.json'), (Join-Path $ProjectDir 'gocurrent.json'))
    $ProjectFilePath = $PossibleProjectPath | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (!$ProjectFilePath)
    {
        throw "Could not find project file 'gocurrent.json' in project directory."
    }

    $DependenciesGroup = Get-ProjectFilePackages -Path $ProjectFilePath -Id 'dependencies' -Target $Target

    $Dependencies = $DependenciesGroup.Packages
    $AlPackagesDir = (Join-Path $ProjectDir '.alpackages')
    $AddinDir = (Join-Path $ProjectDir '.netpackages')
    if (!$OutputDir)
    {
        $OutputDir = $ProjectDir
    }

    Remove-IfExists -Path $AddinDir -Recurse -Force
    Remove-IfExists -Path (Join-Path $AlPackagesDir '*') -Recurse -Force

    Write-Verbose "Dependencies for package:"
    $Dependencies | Format-Table | Out-String | Write-Verbose

    # We might want to compile with more restricted queries
    $CompileDependencies = Get-AlModifiedDependencies -Dependencies $Dependencies -CompileModifiers $CompileModifiers

    if ($CompileModifiers)
    {
        Write-Verbose "Compile dependencies:"
        $CompileDependencies | Format-Table | Out-String | Write-Verbose
    }

    Write-Verbose 'Downloading dependencies for app...'
    Get-AlDependencies -Dependencies $CompileDependencies -OutputDir $AlPackagesDir
    
    Write-Verbose 'Downloading assemblies for app...'
    Get-AlAddinDependencies -Dependencies $CompileDependencies -OutputDir $AddinDir -IncludeServer
    
    $CompilerPath = Get-AlCompiler

    $AddinDir = @((Join-Path $ProjectDir '.netpackages'), "C:\WINDOWS\Microsoft.NET\assembly")
    Write-Verbose 'Compiling app...'

    $Arguments = @{
        ProjectDir = $ProjectDir
        CompilerPath = $CompilerPath
        OutputDir = $OutputDir
        AssemblyDir = $AddinDir
    }

    $OutputApp = Invoke-AlCompiler @Arguments -Verbose

    Write-Verbose 'Creating app package...'

    $Arguments = @{
        AlProjectFilePath = (Join-Path $ProjectDir 'app.json') 
        GocProjectFilePath = $ProjectFilePath 
        AppPath = $OutputApp
        OutputDir = $OutputDir 
        PreReleaseLabel = $PreReleaseLabel 
        OverwriteVersion = $OverwritePackageVersion
        Force = $Force
        Target = $Target
    }

    New-AlPackage @Arguments
}

function New-AlProjectPackage
{
    param(

    )
}

function Set-AlVersion
{
    param(
        [Parameter(Mandatory = $true)]
        $ProjectDir,
        [Parameter(Mandatory = $true)]
        [string]$Version
    )

    $ProjectFilePath = (Join-Path $ProjectDir 'app.json')

    if (!(Test-Path $ProjectFilePath))
    {
        throw "App project file does not exists: $ProjectFilePath"
    }
    
    $OrigProjectFilePath = (Join-Path $ProjectDir 'app.json.original')

    if (!(Test-Path $OrigProjectFilePath))
    {
        Copy-Item $ProjectFilePath $OrigProjectFilePath
    }

    $Version = Format-Version -Version $Version -Places 4 -DotNetFormat
    
    $ProjectFile = Get-Content -Raw -Path $ProjectFilePath | ConvertFrom-Json
    $ProjectFile.Version = $Version
    ConvertTo-Json $ProjectFile -Depth 50 | Set-Content -Path $ProjectFilePath
}

function Undo-AlVersion
{
    param(
        [Parameter(Mandatory = $true)]
        $ProjectDir
    )

    $ProjectFilePath = (Join-Path $ProjectDir 'app.json')
    $OrigProjectFilePath = (Join-Path $ProjectDir 'app.json.original')

    if (Test-Path $OrigProjectFilePath)
    {
        Move-Item $OrigProjectFilePath $ProjectFilePath -Force
    }
}

function Get-AlModifiedDependencies
{
    param(
        [Array] $Dependencies,
        [Array] $CompileModifiers
    )

    foreach ($Dependency in $Dependencies)
    {
        $Modifier = $CompileModifiers | Where-Object { $_.Id -eq $Dependency.Id }

        if ($Modifier)
        {
            $Query1 = [LSRetail.GoCurrent.Common.SemanticVersioning.VersionQuery]::Parse($Dependency.version)
            $Query2 = [LSRetail.GoCurrent.Common.SemanticVersioning.VersionQuery]::Parse($Modifier.version)
            $Dependency.version = [LSRetail.GoCurrent.Common.SemanticVersioning.VersionQuery]::Intersection(@($Query1, $Query2)).ToString()
        }
        $Dependency
    }
}

function ConvertTo-HashtableList
{
    param(
        [Array]$Object
    )

    foreach ($Item in $Object)
    {
        $Hashtable = @{}
        $Item.psobject.Properties | ForEach-Object { $Hashtable[$_.Name] = $_.Value }
        $Hashtable
    }
}

Export-ModuleMember -Function '*-Al*'