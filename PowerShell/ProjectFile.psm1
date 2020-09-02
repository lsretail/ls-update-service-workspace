$ErrorActionPreference = 'stop'

Import-Module GoCurrent
Import-Module (Join-Path $PSScriptRoot 'Utils.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'Branch.psm1') -Force

$_VariableRegex = [regex]::new('\$\{(?<Name>[a-zA-Z0-9]*)\}')
function Get-PackageGroup
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

function Get-CompileModifiers
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

    $Variables = @{}
    $ProjectFile.versionVariables.PSObject.properties | ForEach-Object { $Variables[$_.Name] = $_.Value }
    $ResolveCache = @{}

    $BranchToLabelMap = GetBranchLabelMap -ProjectFile $ProjectFile

    if (($ProjectFile.compileModifiers | Select-Object -First 1) -is [array])
    {
        foreach ($CompileModifiers in $ProjectFile.compileModifiers)
        {
            $Packages = New-Object -TypeName System.Collections.ArrayList
            $Packages.AddRange($CompileModifiers) | Out-Null
            ReplaceVariables -Packages $Packages -Variables $Variables -ResolveCache $ResolveCache -ProjectDir $ProjectDir -Target $Target -BranchName $BranchName -BranchToLabelMap $BranchToLabelMap
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
        ReplaceVariables -Packages $Packages -Variables $Variables -ResolveCache $ResolveCache -ProjectDir $ProjectDir -Target $Target -BranchName $BranchName -BranchToLabelMap $BranchToLabelMap
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
        ReplaceVariables -Packages $Packages -Variables $Variables -ResolveCache $ResolveCache -ProjectDir $ProjectDir -Target $Target -BranchName $BranchName -BranchToLabelMap $BranchToLabelMap

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
        
        ReplaceVariables -Packages $Packages -Variables $Variables -ResolveCache $ResolveCache -ProjectDir $ProjectDir -Target $Target -BranchName $BranchName -BranchToLabelMap $BranchToLabelMap
        $Set.packages = $Packages
        return $Set
    }
}

function ReplaceVariables
{
    param(
        [System.Collections.ArrayList] $Packages,
        $Variables,
        [hashtable] $ResolveCache,
        $ProjectDir,
        $Target,
        $BranchName,
        $BranchToLabelMap
    )

    $ToRemove = @()
    
    foreach ($Package in $Packages)
    {
        $Package.Version = ResolveVersionTarget -Version $Package.Version -Target $Target
        
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
                    $Replacement = ResolveVersionWithFunction -VersionValue $Variables[$Variable] -Target $Target -ProjectDir $ProjectDir -VariableName $Variable -BranchName $BranchName -BranchToLabelMap $BranchToLabelMap
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
            $Package.Version = ResolveVersionWithFunction -VersionValue $Package.Version -Target $Target -ProjectDir $ProjectDir -PackageId $Package.Id -BranchName $BranchName -BranchToLabelMap $BranchToLabelMap
        }
    }

    foreach ($Package in $ToRemove)
    {
        $Packages.Remove($Package)
    }
}

function ResolveVersionTarget
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

function ResolveVersionWithFunction
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
        return ResolveVariableFromAppJson @Arguments
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
        return ResolveVariable @Arguments
    }
    elseif ($null -ne $VersionValue.BranchPriorityFilter)
    {
        return ResolveVariableBranchFilter -BranchName $BranchName -BranchPriorityFilter $VersionValue.BranchPriorityFilter -BranchToLabelMap $BranchToLabelMap
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

function ResolveVariable
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

function ResolveVariableFromAppJson
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

    $AppJsonPath = Join-Path $ProjectDir 'app.json'
    if (!(Test-Path $AppJsonPath))
    {
        $AppJsonPath = (Join-Path ([System.IO.Path]::GetDirectoryName($ProjectDir)) 'app.json')
    }

    if (!(Test-Path $AppJsonPath))
    {
        throw "Cant find app.json file: $AppJsonPath"
    }

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

function ResolveVariableBranchFilter
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

Export-ModuleMember -Function '*-*'