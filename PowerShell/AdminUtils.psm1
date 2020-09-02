$ErrorActionPreference = 'stop'

Import-Module (Join-Path $PSScriptRoot "ErrorHandling.psm1")

try
{
    Import-Module (Join-Path $PSScriptRoot "CheckAdmin.ps1")
    $_isAdmin = $true
}
catch
{
    $_isAdmin = $false
}

function Test-Admin
{
    return $_isAdmin
}

function Test-AdminAsJson
{
    return (ConvertTo-Json $_isAdmin)
}

function Invoke-AsAdmin
{
    param(
        [Parameter(Mandatory = $true)]
        [scriptblock] $ScriptBlock,
        [hashtable] $Arguments,
        [switch] $ShowWindow,
        [switch] $Pause
    )

    if (Test-Admin)
    {
        if ($Arguments)
        {
            & $ScriptBlock @Arguments
        }
        else 
        {
            & $ScriptBlock
        }
    }

    $OutputDir = (Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName()))
    [System.IO.Directory]::CreateDirectory($OutputDir) | Out-Null

    $WindowStyle = 'Hidden'
    $PauseCommand = ''
    if ($ShowWindow)
    {
        $WindowStyle = 'Normal'
        if ($Pause)
        {
            $PauseCommand = 'pause;'
        }
    }

    try
    {
        Set-Content -Path (Join-Path $OutputDir 'ScriptBlock.ps1') -Value $ScriptBlock.ToString()
        if ($Arguments)
        {
            ConvertTo-Json -Depth 100 $Arguments | Set-Content -Path (Join-Path $OutputDir 'Arguments.json')
        }
        
        $Command = "`$ErrorActionPreference='stop';trap{Write-Host `$_ -ForegroundColor Red;Write-Host `$_.ScriptStackTrace -ForegroundColor Red;$PauseCommand};Import-Module (Join-Path '$PSScriptRoot' 'AdminUtils.psm1');Invoke-Admin -Dir $OutputDir;$PauseCommand"
        $Process = Start-Process powershell $Command -Verb runas -PassThru -WindowStyle $WindowStyle
    
        $Process.WaitForExit()
        if ($Process.ExitCode -ne 0)
        {
            $ErrorPath = (Join-Path $OutputDir 'Error.txt')
            $ScriptStackTracePath = (Join-Path $OutputDir 'ScriptStackTrace.txt')
            if (Test-Path $ErrorPath)
            {
                $ErrorMessage = Get-Content -Path $ErrorPath

                if ($ErrorMessage.EndsWith('|||'))
                {
                    throw $ErrorMessage
                }
                $ScriptStackTrace = $null
                if (Test-Path $ScriptStackTracePath)
                {
                    $ScriptStackTrace = Get-Content -Path $ScriptStackTracePath
                }
                Write-JsonError -Message $ErrorMessage -ScriptStackTrace $ScriptStackTrace
            }
            throw "There was an error executing command."
        }
        
        if (Test-Path (Join-Path $OutputDir 'Result.json'))
        {
            return Get-Content -Path (Join-Path $OutputDir 'Result.json')
        }
    }
    finally
    {
        Remove-Item $OutputDir -Recurse -Force
    }
    
}

function Invoke-Admin()
{
    param(
        $Dir
    )
    $BlockPath = Join-Path $Dir 'ScriptBlock.ps1'
    $ArgumentsPath = Join-Path $Dir 'Arguments.json'  

    try
    {
        if (Test-Path $ArgumentsPath)
        {
            $Arguments = ConvertFrom-JsonToHashtable -Content (Get-Content -Path $ArgumentsPath)
            $Result = & $BlockPath @Arguments
        }
        else
        {
            $Result = & $BlockPath
        }   
        $Result | Set-Content -Path (Join-Path $Dir 'Result.json') 
    }
    catch
    {
        Set-Content -Path (Join-Path $Dir 'Error.txt') -Value "$_"
        if (!"$_".EndsWith('|||'))
        {
            Set-Content -Path (Join-Path $Dir 'ScriptStackTrace.txt') -Value $_.ScriptStackTrace
        }
        throw
    }
}

function ConvertFrom-JsonToHashtable($Content)
{
    try {
        # Use this class to perform the deserialization:
        # https://msdn.microsoft.com/en-us/library/system.web.script.serialization.javascriptserializer(v=vs.110).aspx
        Add-Type -AssemblyName "System.Web.Extensions, Version=4.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35" -ErrorAction Stop
    }
    catch {
        throw "Unable to locate the System.Web.Extensions namespace from System.Web.Extensions.dll. Are you using .NET 4.5 or greater?"
    }

    $JsSerializer = New-Object -TypeName System.Web.Script.Serialization.JavaScriptSerializer

    return $JsSerializer.Deserialize($Content, 'Hashtable')
}

Export-ModuleMember -Function 'Invoke-AsAdmin','Test-Admin','Invoke-Admin', 'Test-AdminAsJson'