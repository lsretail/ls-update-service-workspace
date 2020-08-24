$ErrorActionPreference = 'stop'

function Get-VersionFromDependency
{
    <#
        .SYNOPSIS
            Get version from dependency in app.json
        
        .PARAMETER ProjectDir
            Specifies the project directory.
        
        .PARAMETER AppId
            Specifies the app id to search for in app.json.
        
        .NOTES
            Returns $null if specified app id is not found in app.json.
    #>
    param(
        $AppJsonPath,
        $AppId
    )

    $AppJson = Get-Content -Raw -Path $AppJsonPath | ConvertFrom-Json

    if ($AppJson.id -eq $AppId)
    {
        return $AppJson.version
    }

    if ($AppId -ieq 'platform')
    {
        return $AppJson.platform
    }

    $Dependency = $null
    foreach ($Item in $AppJson.Dependencies)
    {
        if (($Item.AppId -eq $AppId) -or ($Item.id -eq $AppId))
        {
            $Dependency = $Item
        }
    }

    return $Dependency.version
}

function Get-VersionRangeFromVersion
{
    <#
        .SYNOPSIS
            Get GoC version range for extension from app.json file.
               
        .PARAMETER Version
            Specifies the version to create a range for.

        .PARAMETER OnlyMajor
            Resolve range from current major version to the next.
            For example, if version in app.json is 15.1.0.0, then
            instead of >=15.1.0.0 <16.0, you'll get >=15.0 <16.0
        
        .PARAMETER OnlyLowerRange
            Returns only the lower limit of the range.
            I.e. for specified 1.0, returns >=1.0

    #>
    param(
        $Version,
        [switch] $FromMajor,
        [switch] $ToNextMajor,
        $Places = $null
    )
    $Parts = $Version.Split('.')
    $Major = [Convert]::ToInt32($Parts[0])
    $NextMajor = $Major + 1
    $Version = Get-VersionParts -Version $Version -Places $Places
    
    $Result = @(">=$($Version)")
    if ($FromMajor)
    {
        $Result = @(">=$Major.0")
    }

    if ($ToNextMajor)
    {
        $Result += "<$NextMajor.0"
    }

    return $Result -join ' '
}

function Get-VersionParts
{
    param(
        $Version,
        $Places
    )
    if ($Places)
    {
        if ($Places -le 1)
        {
            $Places = 2
        }
        $Version = ($Version.Split('.') | Select-Object -First $Places) -Join '.'
    }
    return $Version
}