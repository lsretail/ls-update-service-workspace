$ErrorActionPreference = 'stop'

function Invoke-ErrorHandler
{
    param(
        $ErrorObject
    )

    if ("$ErrorObject".EndsWith('|||'))
    {
        throw $ErrorObject
    }

    $Type = 'unknown'
    if ((Test-IsGoCException -Exception $ErrorObject.Exception) -or
        (Test-IsFaultException -Exception $ErrorObject.Exception))
    {
        $Type = 'GoCurrent'
    }

    Write-JsonError $ErrorObject.Exception.Message $ErrorObject.ScriptStackTrace $Type
}

function Test-IsGoCException
{
    param(
        $Exception
    )
    try 
    {
        return $Exception -is [LSRetail.GoCurrent.Common.Exceptions.GoCurrentException]
    }
    catch 
    {
        # We end up here if the type hasn't been loaded.
        return $false
    }
}

function Test-IsFaultException
{
    param(
        $Exception
    )
    try 
    {
        return $Exception -is [System.ServiceModel.FaultException]
    }
    catch 
    {
        # We end up here if the type hasn't been loaded.
        return $false
    }
}

function Write-JsonError
{
    param(
        [Parameter(Mandatory)]
        [string] $Message, 
        $ScriptStackTrace, 
        $Type
    )
    $Data = @{
        'message' = $Message
        'type' = $Type
        'scriptStackTrace' = $ScriptStackTrace
    }
    throw "!!!"+(ConvertTo-Json $Data -Compress)+"|||"
}