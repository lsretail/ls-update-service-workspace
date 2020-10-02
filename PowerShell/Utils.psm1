$ErrorActionPreference = 'stop'


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

function ConvertTo-Title
{
    param($Value)
    return $Value.Substring(0, 1).ToUpper() + $Value.Substring(1, $Value.Length - 1)
}

function Test-FileLock
{
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)] 
        $Path
    )
    process
    {
        if ($Path -is [System.IO.FileInfo])
        {
            $Path = $Path.FullName
        }
        try
        { 
            [IO.File]::OpenWrite((Resolve-Path $Path).Path).close();
            $false 
        }
        catch
        {
            return $true
            
        }
    }
}

function Test-DllLockInDir
{
    param(
        $Dir
    )

    if (!(Test-Path $Dir))
    {
        return $false
    }

    $AnyLocked = Get-ChildItem -Path $Dir -Recurse -Filter '*.dll' | Test-FileLock | Where-Object { $_ } | Select-Object -First 1
    if ($AnyLocked)
    {
        return $true
    }
    else
    {
        return $false
    }
}

function ConvertTo-ServersObj
{
    param(
        $Servers
    )
    if ($Servers)
    {
        $ServersObj = @()
        ConvertFrom-Json $Servers | Foreach-Object { 
            $_ | Foreach-Object { 
                $Item = @{}; 
                $ServersObj += $Item
                $_.PSObject.Properties | Foreach-Object { $Item[$_.Name] = $_.Value} 
            }
        }
        return @(,$ServersObj)
    }
    return @()
}