$ErrorActionPreference = 'stop'

Import-Module GoCurrent

$_VariableRegex = [regex]::new('\$\{(?<Name>.*)\}')
function Get-PackageGroup
{
    param(
        [Parameter(Mandatory = $true)]
        [Alias('ProjectFilePath')]
        $Path,
        [Parameter(Mandatory = $true)]
        [Alias('PackageGroupId')]
        $Id,
        $Target
    )
    $ProjectDir = Split-Path $Path -Parent
    $ProjectFile = Get-Content -Path $Path -Raw | ConvertFrom-Json
    
    GetPackageGroupFromObj -ProjectFile $ProjectFile -Id $Id -ProjectDir $ProjectDir -Target $Target
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
        $Target
    )

    if ($null -eq $Variables)
    {
        $Variables = @{}
        $ProjectFile.versionVariables.PSObject.properties | ForEach-Object { $Variables[$_.Name] = $_.Value }
    }

    if ($Id -imatch 'dependencies')
    {
        $Obj = @{
            'id' = 'dependencies'
            'name' = 'Dependencies'
            'packages' = $ProjectFile.dependencies
        }
        $Set = New-Object psobject -Property $Obj
        ReplaceVariables -PackageGroup $Set -Variables $Variables -ResolveCache $ResolveCache -ProjectDir $ProjectDir -Target $Target
        return $Set
    }

    foreach ($Set in $ProjectFile.devPackageGroups)
    {
        if ($Set.Id -eq $Id)
        {
            $Packages = @()
            foreach ($Entry in $Set.packages)
            {
                if ([bool]($Entry.PSObject.properties.name -contains '$ref'))
                {
                    $Out = GetPackageGroupFromObj -ProjectFile $ProjectFile -Id $Entry.'$ref' -ResolveCache $ResolveCache -Variables $Variables -ProjectDir $ProjectDir -Target $Target
                    $Packages += $Out.Packages
                }
                else
                {
                    $Packages += $Entry
                }
            }
            $Set.packages = $Packages
            ReplaceVariables -PackageGroup $Set -Variables $Variables -ResolveCache $ResolveCache -ProjectDir $ProjectDir -Target $Target
            return $Set
        }
    }
}

function ReplaceVariables
{
    param(
        $PackageGroup,
        $Variables,
        [hashtable] $ResolveCache,
        $ProjectDir,
        $Target
    )
    
    foreach ($Package in $PackageGroup.Packages)
    {
        $Matches = $_VariableRegex.Matches($Package.Version)
        
        for ($Idx = $Matches.Count - 1; $Idx -ge 0; $Idx--)
        {
            $Match = $Matches[$Idx]
            $Value = $Package.Version
            $Variable = $Match.Groups['Name'].Value
            $Replacement = $null
            if ($ResolveCache.ContainsKey($Variable))
            {
                $Replacement = $ResolveCache[$Variable]
            }
            elseif ($Variables.ContainsKey($Variable))
            {
                $VariableValue = $Variables[$Variable]

                if ($VariableValue.GetType() -eq [string])
                {
                    $Replacement = $VariableValue
                }
                else 
                {
                    $Arguments = @{
                        Id = $VariableValue.Id 
                        Version = $VariableValue.Version
                        ResolverPath = $VariableValue.ResolverPath
                        ResolverFunction = $VariableValue.ResolverFunction 
                        ProjectDir = $ProjectDir
                        Target = $Target
                    }
                    $Replacement = ResolveVariable @Arguments
                }
            }
            
            if ($null -ne $Replacement)
            {
                $FromIdx = $Match.Index + $Match.Length
                $Package.Version = $Value.Substring(0, $Match.Index) + $Replacement + $Value.Substring($FromIdx, $Value.Length - $FromIdx) 
            }
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