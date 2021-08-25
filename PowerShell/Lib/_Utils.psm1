$ErrorActionPreference = 'stop'

function ConvertFrom-JsonToHashtable
{
    param(
        [Parameter(Mandatory = $true, ValueFromPipeline = $true)]
        $Content
    )
    try {
        # Use this class to perform the deserialization:
        # https://msdn.microsoft.com/en-us/library/system.web.script.serialization.javascriptserializer(v=vs.110).aspx
        Add-Type -AssemblyName "System.Web.Extensions, Version=4.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35" -ErrorAction Stop
    }
    catch {
        throw "Unable to locate the System.Web.Extensions namespace from System.Web.Extensions.dll. Are you using .NET 4.5 or greater?"
    }

    $JsSerializer = New-Object -TypeName System.Web.Script.Serialization.JavaScriptSerializer

    return $JsSerializer.Deserialize($Content, [hashtable])
}

function Get-AlAppJsonPath
{
    param(
        $ProjectDir
    )

    $AppJsonPath = Join-Path $ProjectDir 'app.json'
    if (!(Test-Path $AppJsonPath))
    {
        $AppJsonPath = (Join-Path ([System.IO.Path]::GetDirectoryName($ProjectDir)) 'app.json')
    }

    if (!(Test-Path $AppJsonPath))
    {
        throw "Cant find app.json file: $AppJsonPath"
    }
    return $AppJsonPath
}

function Get-AlAppJson
{
    param($ProjectDir)
    return Get-Content -Path (Get-AlAppJsonPath $ProjectDir) | ConvertFrom-Json
}

function Get-VersionFromAppDependency
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

    if ($AppId -ieq 'application')
    {
        return $AppJson.application
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

function Get-MaxLength
{
    param(
        [string] $Value,
        $Length
    )
    if ($Value.Length -gt $Length)
    {
        return $Value.Substring(0, $Length)
    }
    return $Value
}

function ConvertTo-Title
{
    param($Value)
    return $Value.Substring(0, 1).ToUpper() + $Value.Substring(1, $Value.Length - 1)
}

function Get-AppFromPackage
{
    param(
        [Parameter(Mandatory)]
        $Package,
        [Parameter(Mandatory)]
        $OutputDir,
        $Server
    )

    $File = ($Package | Get-GocFile -Server $Server | Where-Object { $_.FilePath.ToLower().EndsWith('.app')} | Select-Object -First 1)

    if (!$File)
    {
        return $null
    }

    Write-Verbose "  -> $($Package.Id) v$($Package.version)..."
    $File | Get-GocFile -Download -OutputDir $OutputDir

    return Join-Path $OutputDir "$($File.Id)\$($File.FilePath)"
}

function Get-JsonFileFromPackage
{
    param(
        [Parameter(Mandatory)]
        [string] $Id,
        [Parameter(Mandatory)]
        [string] $VersionQuery,
        $FilePath
    )
    $Package = Get-GocPackage -Id $Id -VersionQuery $VersionQuery
    if (!$Package)
    {
        throw "Package $Id ($VersionQuery) does not exists."
    }

    $TempDir = Join-Path $env:TEMP ([IO.Path]::GetRandomFileName())
    [IO.Directory]::CreateDirectory($TempDir) | Out-Null
    try 
    {
        Get-GocFile -Id $Id `
            -Version $Package.Version `
            -FilePath $FilePath `
            -Download `
            -OutputDir $TempDir
        $ManifestPath = [IO.Path]::Combine($TempDir, $Id, $FilePath)
        $Hash = @{}
        (Get-Content $ManifestPath -Raw | ConvertFrom-Json).PSObject.Properties | Foreach-Object { $Hash[$_.Name] = $_.Value }
        $Hash
    }
    finally
    {
        try
        {
            Remove-Item $TempDir -Recurse -Force
        }
        catch
        {
            # Ignore
        }
    }
}

function Get-Value
{
    param(
        [array] $Values,
        $Default
    )

    foreach ($Value in $Values)
    {
        if ($Value)
        {
            return $Value
        }
    }
    return $Default
}