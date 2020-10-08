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