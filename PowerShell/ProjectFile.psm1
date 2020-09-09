$ErrorActionPreference = 'stop'

Import-Module GoCurrent
Import-Module (Join-Path $PSScriptRoot 'Utils.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'Branch.psm1') -Force

$_VariableRegex = [regex]::new('\$\{(?<Name>[a-zA-Z0-9]*)\}')
$_AlAppVersion = 'AlAppVersion'
$_AlAppName = 'AlAppName'
$_AlAppPublisher = 'AlAppPublisher'
$_AlAppId = 'AlAppId'
$_AlAppVariables = @($_AlAppVersion, $_AlAppName, $_AlAppPublisher, $_AlAppId)
$_ReservedVariables = @('ProjectDir') + $_AlAppVariables


function Get-ProjectFilePackages
{
    param(
        [Parameter(Mandatory = $true)]
        [Alias('ProjectFilePath')]
        $Path,
        [Parameter(Mandatory = $true)]
        [Alias('PackageGroupId')]
        $Id,
        $Target,
        $BranchName
    )
    $ProjectDir = Split-Path $Path -Parent
    $ProjectFile = Get-Content -Path $Path -Raw | ConvertFrom-Json
    
    GetPackageGroupFromObj -ProjectFile $ProjectFile -Id $Id -ProjectDir $ProjectDir -Target $Target -BranchName $BranchName
}

function Get-ProjectFilePackage
{
    param(
        [Parameter(Mandatory)]
        $Path
    )
    
}

function Get-ProjectFileCompileModifiers
{
    param(
        [Parameter(Mandatory = $true)]
        [Alias('ProjectFilePath')]
        $Path,
        $Target,
        $BranchName
    )
    $ProjectDir = Split-Path $Path -Parent
    $ProjectFile = Get-Content -Path $Path -Raw | ConvertFrom-Json

    if (!($ProjectFile.CompileModifiers))
    {
        return
    }

    $ProjectFile.versionVariables.PSObject.properties | ForEach-Object { $Variables[$_.Name] = $_.Value }
    $Variables = @{}
    $ResolveCache = @{}

    $BranchToLabelMap = GetBranchLabelMap -ProjectFile $ProjectFile

    if (($ProjectFile.compileModifiers | Select-Object -First 1) -is [array])
    {
        foreach ($CompileModifiers in $ProjectFile.compileModifiers)
        {
            $Packages = New-Object -TypeName System.Collections.ArrayList
            $Packages.AddRange($CompileModifiers) | Out-Null
            Resolve-PackagesVersions -Packages $Packages -Variables $Variables -ResolveCache $ResolveCache -ProjectDir $ProjectDir -Target $Target -BranchName $BranchName -BranchToLabelMap $BranchToLabelMap
            if ($Packages.Count -gt 0)
            {
                @(,$Packages)
            }
        }
    }
    else
    {
        $Packages = New-Object -TypeName System.Collections.ArrayList
        $Packages.AddRange($ProjectFile.compileModifiers) | Out-Null
        Resolve-PackagesVersions -Packages $Packages -Variables $Variables -ResolveCache $ResolveCache -ProjectDir $ProjectDir -Target $Target -BranchName $BranchName -BranchToLabelMap $BranchToLabelMap
        $Packages
    }
}

function GetBranchLabelMap
{
    param(
        [Parameter(Mandatory = $true)]
        $ProjectFile
    )
    $BranchToPreReleaseLabelMap = $null
    if ($null -ne $ProjectFile.branchToPreReleaseLabelMap)
    {
        $BranchToPreReleaseLabelMap = @{}
        $ProjectFile.branchToPreReleaseLabelMap.PSObject.properties | ForEach-Object { 
            $Name = $_.Name
            if ($Name -ieq '${currentBranch}')
            {
                $Name = '%BRANCHNAME%'
            }
            $BranchToPreReleaseLabelMap[$Name] = $_.Value -ireplace [regex]::Escape('${currentBranch}'), '%BRANCHNAME%'
        }
    }

    $BranchToPreReleaseLabelMap
}

function GetPackageGroupFromObj
{
     param(
        [Parameter(Mandatory = $true)]
        $ProjectFile,
        [Parameter(Mandatory = $true)]
        $Id,
        [hashtable] $Variables = $null,
        [hashtable] $ResolveCache = @{},
        $ProjectDir,
        $Target,
        $BranchName
    )

    if ($null -eq $Variables)
    {
        $Variables = @{}
        if ($ProjectFile.versionVariables)
        {
            $ProjectFile.versionVariables.PSObject.properties | ForEach-Object { $Variables[$_.Name] = $_.Value }
        }
    }

    $Packages = New-Object -TypeName System.Collections.ArrayList
    $BranchToLabelMap = GetBranchLabelMap -ProjectFile $ProjectFile

    if ($Id -imatch 'dependencies')
    {
        $Packages.AddRange($ProjectFile.dependencies) | Out-Null
        Resolve-PackagesVersions -Packages $Packages -Variables $Variables -ResolveCache $ResolveCache -ProjectDir $ProjectDir -Target $Target -BranchName $BranchName -BranchToLabelMap $BranchToLabelMap

        $Obj = @{
            'id' = 'dependencies'
            'name' = 'Dependencies'
            'packages' = $Packages
        }
        $Set = New-Object psobject -Property $Obj

        return $Set
    }

    foreach ($Set in $ProjectFile.devPackageGroups)
    {
        if ($Set.Id -ne $Id)
        {
            continue
        }

        foreach ($Entry in $Set.packages)
        {
            if ([bool]($Entry.PSObject.properties.name -contains '$ref'))
            {
                $Out = GetPackageGroupFromObj -ProjectFile $ProjectFile -Id $Entry.'$ref' -ResolveCache $ResolveCache -Variables $Variables -ProjectDir $ProjectDir -Target $Target -BranchName $BranchName
                $Packages.AddRange($Out.Packages) | Out-Null
            }
            else
            {
                $Packages.Add($Entry) | Out-Null
            }
        }
        
        Resolve-PackagesVersions -Packages $Packages -Variables $Variables -ResolveCache $ResolveCache -ProjectDir $ProjectDir -Target $Target -BranchName $BranchName -BranchToLabelMap $BranchToLabelMap
        $Set.packages = $Packages
        return $Set
    }
}

function Resolve-PackagesVersions
{
    param(
        [System.Collections.ArrayList] $Packages,
        [hashtable] $Variables,
        [hashtable] $ResolveCache,
        $ProjectDir,
        $Target,
        $BranchName,
        $BranchToLabelMap
    )

    $ToRemove = @()
    
    foreach ($Package in $Packages)
    {
        $Package.Version = Resolve-VersionTarget -Version $Package.Version -Target $Target
        
        if ($null -eq $Package.Version)
        {
            $ToRemove += $Package
            continue
        }

        if ($Package.Version -is [string])
        {
            $MatchList = $_VariableRegex.Matches($Package.Version)

            for ($Idx = $MatchList.Count - 1; $Idx -ge 0; $Idx--)
            {
                $Match = $MatchList[$Idx]
                $Value = $Package.Version
                $Variable = $Match.Groups['Name'].Value
                $Replacement = $null
    
                if ($ResolveCache.ContainsKey($Variable))
                {
                    $Replacement = $ResolveCache[$Variable]
                }
                elseif ($Variables.ContainsKey($Variable))
                {
                    $Replacement = Resolve-VersionWithFunction -VersionValue $Variables[$Variable] -Target $Target -ProjectDir $ProjectDir -VariableName $Variable -BranchName $BranchName -BranchToLabelMap $BranchToLabelMap
                    $ResolveCache[$Variable] = $Replacement
                }
                
                if ($null -ne $Replacement)
                {
                    $FromIdx = $Match.Index + $Match.Length
                    $Package.Version = $Value.Substring(0, $Match.Index) + $Replacement + $Value.Substring($FromIdx, $Value.Length - $FromIdx) 
                }
            }
        }
        else
        {
            $Package.Version = Resolve-VersionWithFunction -VersionValue $Package.Version -Target $Target -ProjectDir $ProjectDir -PackageId $Package.Id -BranchName $BranchName -BranchToLabelMap $BranchToLabelMap
        }
    }

    foreach ($Package in $ToRemove)
    {
        $Packages.Remove($Package)
    }
}

function Resolve-VariablesInString
{
    param(
        $Value,
        [hashtable] $Variables,
        [hashtable] $ResolveCache,
        $ProjectDir,
        $Target,
        $BranchName,
        $BranchToLabelMap
    )

    $MatchList = $_VariableRegex.Matches($Value)

    for ($Idx = $MatchList.Count - 1; $Idx -ge 0; $Idx--)
    {
        $Match = $MatchList[$Idx]
        $VariableName = $Match.Groups['Name'].Value
        $Replacement = $null

        if ($ResolveCache.ContainsKey($VariableName))
        {
            $Replacement = $ResolveCache[$VariableName]
        }
        elseif ($_AlAppVariables.Contains($VariableName))
        {
            Resolve-AlAppVariables -ProjectDir $ProjectDir -ResolveCache $ResolveCache
            $Replacement = $ResolveCache[$VariableName]
        }
        elseif ($Variables.ContainsKey($VariableName))
        {
            $Replacement = Resolve-VersionWithFunction -VersionValue $Variables[$VariableName] -Target $Target -ProjectDir $ProjectDir -VariableName $VariableName -BranchName $BranchName -BranchToLabelMap $BranchToLabelMap
            $ResolveCache[$VariableName] = $Replacement
        }
        
        if ($null -ne $Replacement)
        {
            $FromIdx = $Match.Index + $Match.Length
            $Value = $Value.Substring(0, $Match.Index) + $Replacement + $Value.Substring($FromIdx, $Value.Length - $FromIdx) 
        }
    }
    return $Value
}

function Resolve-VersionTarget
{
    param(
        $Version,
        $Target
    )

    if ($Version -is [string])
    {
        return $Version
    }

    if ($Target -and ($Target -in $Version.PSobject.Properties.name))
    {
        return $Version.$Target
    }
    elseif ($Version.PSobject.Properties.name -match 'default')
    {
        return $Version.default
    }
    else
    {
        return $Version
    }
}

function Resolve-VersionWithFunction
{
    param(
        $PackageId,
        $VariableName,
        $VersionValue,
        $ProjectDir,
        $Target,
        $BranchName,
        $BranchToLabelMap
    )

    if ($VersionValue.GetType() -eq [string])
    {
        return $VersionValue
    }
    
    if ($null -ne $VersionValue.FromAppId)
    {
        $Arguments = @{
            FromAppId = $VersionValue.FromAppId
            FromAppIdType = $VersionValue.FromAppIdType
            FromAppIdParts = $VersionValue.FromAppIdParts
            ProjectDir = $ProjectDir
        }
        if (!$Arguments.FromAppIdType)
        {
            $Arguments.FromAppIdType = 'fromMinor'
        }
        return Resolve-VariableFromAppJson @Arguments
    }
    elseif ($null -ne $VersionValue.Id)
    {
        $Arguments = @{
            Id = $VersionValue.Id 
            Version = $VersionValue.Version
            ResolverPath = $VersionValue.ResolverPath
            ResolverFunction = $VersionValue.ResolverFunction 
            ProjectDir = $ProjectDir
            Target = $Target
        }
        return Resolve-Variable @Arguments
    }
    elseif ($null -ne $VersionValue.BranchPriorityFilter)
    {
        return Resolve-VariableBranchFilter -BranchName $BranchName -BranchPriorityFilter $VersionValue.BranchPriorityFilter -BranchToLabelMap $BranchToLabelMap
    }
    else
    {
        if (!$PackageId)
        {
            throw "Could not resolve version for variable `"$($Variable)`"."
        }
        if ($Target)
        {
            throw "Package `"$($PackageId)`" does not have a version for selected target `"$Target`" nor `"default`"."
        }
        else
        {
            throw "Package `"$($PackageId)`" does not have a version for target `"default`"."
        }
    }
}

function Resolve-Variable
{
    param(
        [Parameter(Mandatory = $false)]
        $Id,
        $Version = "",
        $ResolverPath,
        $ResolverFunction,
        $ProjectDir,
        [Parameter(Mandatory = $false)]
        $Target
    )

    if (!$ResolverPath)
    {
        $Version = Get-GocUpdates -Id $Id -Version $Version -InstanceName 'this-instance-should-not-exists-at-any-point' | Where-Object { $_.Id -eq $Id} | Select-Object -First 1
        $Version.Version
    }
    else
    {
        $Path = [System.IO.Path]::Combine($ProjectDir, $ResolverPath)
        $Block = {
            Import-Module $Path -Force
            . $ResolverFunction -ProjectDir $ProjectDir -Id $Id -Version $Version -Target $Target
        }
        & $Block
    }
}

function Resolve-VariableFromAppJson
{
    param(
        $FromAppId,
        [ValidateSet('version', 'fromMinor', 'fromMajor', 'fromMinorToNextMajor', 'fromMajorToNextMajor', '')]
        [string]$FromAppIdType,
        $FromAppIdParts,
        $ProjectDir
    )

    if (!$FromAppIdType)
    {
        $FromAppIdType = 'fromMinor'
    }
    if (!$FromAppIdParts)
    {
        $FromAppIdParts = 4
    }

    $AppJsonPath = Get-AlAppJsonPath -ProjectDir $ProjectDir
    $Version = Get-VersionFromDependency -AppJsonPath $AppJsonPath -AppId $FromAppId
    if (!$Version)
    {
        throw "Could not locate dependency with app id `"$FromAppId`" in `"$AppJsonPath`"."
    }

    if ($FromAppIdType -eq 'version')
    {
        $Version = Get-VersionParts -Version $Version -Places $FromAppIdParts
        return $Version
    }

    $Arguments = @{
        FromMajor = ($FromAppIdType -ieq 'fromMajor') -or ($FromAppIdType -ieq 'fromMajorToNextMajor')
        ToNextMajor = ($FromAppIdType -ieq 'fromMinorToNextMajor') -or ($FromAppIdType -ieq 'fromMajorToNextMajor')
    }

    return Get-VersionRangeFromVersion -Version $Version -Places $FromAppIdParts @Arguments
}

function Resolve-AlAppVariables
{
    param(
        [Parameter(Mandatory = $true)]
        [hashtable] $ResolveCache,
        [Parameter(Mandatory = $true)]
        $ProjectDir
    )

    $AppJsonPath = Get-AlAppJsonPath -ProjectDir $ProjectDir

    $AppJson = Get-Content -Raw -Path $AppJsonPath | ConvertFrom-Json
    $ResolveCache[$_AlAppId] = $AppJson.id
    $ResolveCache[$_AlAppVersion] = $AppJson.version
    $ResolveCache[$_AlAppPublisher] = $AppJson.publisher
    $ResolveCache[$_AlAppName] = $AppJson.name
}

function Resolve-VariableBranchFilter
{
    param(
        $BranchName,
        [Array] $BranchPriorityFilter,
        $BranchToLabelMap
    )

    $List = @()

    foreach ($Branch in $BranchPriorityFilter)
    {
        if ($Branch -icontains '${currentBranch}')
        {
            $List += $Branch -ireplace [regex]::Escape('${currentBranch}'), $BranchName
        }
        else
        {
            $List += $Branch
        }
    }

    $Arguments = @{
        BranchName = $List
    }
    if ($BranchToLabelMap)
    {
        $Arguments.BranchToLabelMap = $BranchToLabelMap
    }
    ConvertTo-BranchPriorityPreReleaseFilter @Arguments 
}

Export-ModuleMember -Function '*-ProjectFile*'