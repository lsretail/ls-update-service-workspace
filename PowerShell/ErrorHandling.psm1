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
    if (($ErrorObject.Exception -is [LSRetail.GoCurrent.Common.Exceptions.GoCurrentException]) -or 
        $ErrorObject.Exception -is [System.ServiceModel.FaultException])
    {
        $Type = 'GoCurrent'
    }

    Write-JsonError $ErrorObject.Exception.Message $ErrorObject.ScriptStackTrace $Type
}

function Write-JsonError
{
    param(
        [Parameter(Mandatory)]
        $Message, 
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