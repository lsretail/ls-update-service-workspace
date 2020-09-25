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
        Get-ChildItem -Path $Dir -Filter '*.xml' -Recurse | Remove-Item
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

function Get-AlDevDependencies
{
    param(
        [Parameter(Mandatory)]
        $Dependencies,
        [Parameter(Mandatory)]
        $ProjectDir,
        [Parameter(Mandatory)]
        $OutputDir
    )

    $PackageIds = $Dependencies | ForEach-Object { $_.Id}
    
    $Deps = ConvertTo-HashtableList $Dependencies

    $Resolved = @($Deps | Get-GocUpdates | Where-Object { $PackageIds.Contains($_.Id)})

    $TempDir = Join-Path $OutputDir 'Temp'
    [System.IO.Directory]::CreateDirectory($TempDir) | Out-Null

    $ScriptFileName = 'ProjectDeploy.ps1'

    foreach ($Package in $Resolved)
    {
        $Files = $Package | Get-GocFile | Where-Object { $_.FilePath -ieq $ScriptFileName }

        if (!$Files)
        {
            continue
        }

        Write-Verbose "Downloading dev dependency for $($Package.Id) v$($Package.version)..."
        $Package | Get-GocFile -Download -OutputDir $TempDir

        $PackageDir = [System.IO.Path]::Combine($TempDir, $Package.Id)

        & (Join-Path $PackageDir $ScriptFileName) -Context @{ProjectDir = $ProjectDir}
    }

    Remove-Item $TempDir -Force -Recurse
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

    if (!$AlPackagesDir)
    {
        $AlPackagesDir = Join-Path $ProjectDir '.alpackages'
    }

    $Arguments = @("/project:`"$ProjectDir`"", "/packagecachepath:`"$AlPackagesDir`"", "/out:`"$FileOutputPath`"")

    if ($AssemblyDir)
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
        $OutputDir,
        $DefaultOutputDir,
        [string] $Target,
        [string] $BranchName,
        [hashtable] $Variables,
        [switch] $Force
    )
    Import-Module LsPackageTools\AppPackageCreator

    $DefaultOutputDir = Split-Path $AlProjectFilePath -Parent
    
    $AlProject = Get-Content -Path $AlProjectFilePath -Raw | ConvertFrom-Json
    $DepdenciesGroup = Get-ProjectFilePackages -Id 'dependencies' -Path $GocProjectFilePath -Target $Target -BranchName $BranchName -Variables $Variables

    $GoCProject = Get-ProjectFile -Path $GocProjectFilePath -Target $Target -BranchName $BranchName -Variables $Variables

    $Dependencies = @()
    foreach ($Dep in $DepdenciesGroup.Packages)
    {
        $NewEntry = @{}
        $Dep.PSObject.properties | ForEach-Object { $NewEntry[$_.Name] = $_.Value }

        $Dependencies += $NewEntry
    }

    $Package = @{
        Id = $GoCProject.Id
        Name = Get-FirstValue $GoCProject.Name, $AlProject.Name
        Description = Get-FirstValue $GoCProject.Description, $AlProject.Description
        Version = Get-FirstValue $GoCProject.Version, $AlProject.Version
        Path = $AppPath
        OutputDir = Get-FirstValue $OutputDir, $GoCProject.OutputDir, $DefaultOutputDir
        Dependencies = $Dependencies
    }

    if ($GoCProject.DisplayName)
    {
        $Package.DisplayName = $GoCProject.DisplayName
    }

    New-AppPackage @Package -Force:$Force
}

function Get-AlProjectDependencies
{
    param(
        [Parameter(Mandatory)]
        $ProjectDir,
        $BranchName,
        $Target,
        [hashtable] $Variables,
        $OutputDir,
        [Array] $CompileModifiers
    )

    $ProjectFilePath = Get-GocProjectFilePath -ProjectDir $ProjectDir

    $DependenciesGroup = Get-ProjectFilePackages -Path $ProjectFilePath -Id 'dependencies' -Target $Target -BranchName $BranchName -Variables $Variables
    $DevDependencies = Get-ProjectFilePackages -Path $ProjectFilePath -Id 'devDependencies' -Target $Target -BranchName $BranchName -Variables $Variables

    if (!$OutputDir)
    {
        $OutputDir = $ProjectDir
    }

    $Dependencies = $DependenciesGroup.Packages
    $AlPackagesDir = (Join-Path $OutputDir '.alpackages')
    $AddinDir = (Join-Path $OutputDir '.netpackages')
    
    Remove-IfExists -Path $AddinDir -Recurse -Force
    Remove-IfExists -Path (Join-Path $AlPackagesDir '*') -Recurse -Force

    Write-Verbose "Dependencies for package:"
    $Dependencies | Format-Table -AutoSize | Out-String | Write-Verbose

    $ModifiedDependencies = $Dependencies    

    if ($DevDependencies -and $DevDependencies.Packages)
    {
        Write-Verbose "Dev dependencies for package:"
        $DevDependencies.Packages | Format-Table -AutoSize | Out-String | Write-Verbose
        $ModifiedDependencies = Get-AlModifiedDependencies -Dependencies $ModifiedDependencies -CompileModifiers $DevDependencies.Packages
    }

    if ($CompileModifiers)
    {
        # We might want to compile with more restricted queries
        $ModifiedDependencies = Get-AlModifiedDependencies -Dependencies $ModifiedDependencies -CompileModifiers $CompileModifiers

        Write-Verbose "Compile Modifiers:"
        $CompileModifiers | Format-Table -AutoSize | Out-String | Write-Verbose
    }

    $ModifiedDependencies | Format-Table -AutoSize | Out-String | Write-Verbose

    Write-Verbose 'Downloading dependencies for app...'
    Get-AlDependencies -Dependencies $ModifiedDependencies -OutputDir $AlPackagesDir
    
    Write-Verbose 'Downloading assemblies for app...'
    Get-AlAddinDependencies -Dependencies $ModifiedDependencies -OutputDir $AddinDir -IncludeServer

    Write-Verbose 'Downloading dev depenencies for app...'
    Get-AlDevDependencies -Dependencies $ModifiedDependencies -ProjectDir $ProjectDir -OutputDir $OutputDir
}

function Invoke-AlProjectCompile
{
    [CmdletBinding()]
    param (
        [Parameter(Mandatory)]
        $ProjectDir,
        $CompilerPath,
        $OutputDir = $ProjectDir
    )

    if (!$CompilerPath)
    {
        $CompilerPath = Get-AlCompiler
    }
    
    $AddinDir = @((Join-Path $ProjectDir '.netpackages'), "C:\WINDOWS\Microsoft.NET\assembly")
    Write-Verbose 'Compiling app...'

    $Arguments = @{
        ProjectDir = $ProjectDir
        CompilerPath = $CompilerPath
        OutputDir = $OutputDir
        AssemblyDir = $AddinDir
    }

    return Invoke-AlCompiler @Arguments -Verbose
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
        
        .PARAMETER BranchName
            Specify the Git branch name for you repository (if appropriate).

        .PARAMETER Target
            Specify a target to compile against. Can be used to resolve
            different dependencies for release, release candidate and development.
        
        .PARAMETER Variables
            Specify a hashtable of variables to make available for project file.
            The values specified here, will overwrite any variables specified in the project file.

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
        [Parameter(Mandatory)]
        $ProjectDir,
        $BranchName,
        $Target,
        [hashtable] $Variables,
        $OutputDir = $ProjectDir,
        [Array] $CompileModifiers,
        $CompilerPath,
        [switch] $Force
    )

    $Arguments = @{
        CompileModifiers = $CompileModifiers
        Variables = $Variables
        Target = $Target
        BranchName = $BranchName
        ProjectDir = $ProjectDir
    }

    Get-AlProjectDependencies @Arguments

    $AppPath = Invoke-AlProjectCompile -ProjectDir $ProjectDir -CompilerPath $CompilerPath -OutputDir $OutputDir

    Write-Verbose 'Creating app package...'

    $Arguments = @{
        ProjectDir = $ProjectDir
        AppPath = $AppPath
        Target = $Target 
        BranchName = $BranchName 
        OutputDir = $OutputDir
        Variables = $Variables
        Force = $Force
    }

    New-AlProjectPackage @Arguments

}

function New-AlProjectPackage
{
    param(
        [Parameter(Mandatory = $true)]
        $ProjectDir,
        [Parameter(Mandatory = $true)]
        $AppPath,
        $OutputDir,
        [string] $Target,
        [string] $BranchName,
        [hashtable] $Variables,
        [switch] $Force
    )

    $ProjectFilePath = Get-GocProjectFilePath -ProjectDir $ProjectDir

    $Arguments = @{
        AlProjectFilePath = (Join-Path $ProjectDir 'app.json') 
        GocProjectFilePath = $ProjectFilePath 
        AppPath = $AppPath
        OutputDir = $OutputDir 
        Force = $Force
        Target = $Target
        BranchName = $BranchName
        Variables = $Variables
    }

    New-AlPackage @Arguments
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

    $Used = @()

    foreach ($Dependency in $Dependencies)
    {
        $Modifier = $CompileModifiers | Where-Object { $_.Id -eq $Dependency.Id }

        if ($Modifier)
        {
            $Used += $Modifier
            $Query1 = [LSRetail.GoCurrent.Common.SemanticVersioning.VersionQuery]::Parse($Dependency.version)
            $Query2 = [LSRetail.GoCurrent.Common.SemanticVersioning.VersionQuery]::Parse($Modifier.version)
            $Dependency.version = [LSRetail.GoCurrent.Common.SemanticVersioning.VersionQuery]::Intersection(@($Query1, $Query2)).ToString()
        }
        $Dependency
    }

    foreach ($Item in $CompileModifiers)
    {
        if (!$Used.Contains($Item))
        {
            $Item
        }
    }
}

function Get-GocProjectFilePath
{
    param(
        [Parameter(Mandatory)]
        $ProjectDir
    )
    $PossibleProjectPath = @((Join-Path $ProjectDir '.gocurrent\gocurrent.json'), (Join-Path $ProjectDir 'gocurrent.json'))
    $ProjectFilePath = $PossibleProjectPath | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (!$ProjectFilePath)
    {
        throw "Could not find project file 'gocurrent.json' in project directory."
    }
    return $ProjectFilePath
}

function Get-FirstValue
{
    param(
        [Array] $Values,
        $DefaultValue = $null
    )
    foreach ($Value in $Values)
    {
        if ($Value)
        {
            return $Value
        }
    }
    return $DefaultValue
}

function ConvertTo-HashtableList
{
    param(
        [Array]$Object
    )

    foreach ($Item in $Object)
    {
        if ($Item -is [hashtable])
        {
            $Item
            continue    
        }
        $Hashtable = @{}
        $Item.psobject.Properties | ForEach-Object { $Hashtable[$_.Name] = $_.Value }
        $Hashtable
    }
}

Export-ModuleMember -Function '*-Al*'