$ErrorActionPreference = 'stop'

try
{
    Import-Module GoCurrent
    $_GoCurrentInstalled = $true
}
catch
{
    $_GoCurrentInstalled = $false
}

function Invoke-ErrorHandler($Error)
{
    $Type = 'unknown'
    if (($Error.Exception -is [LSRetail.GoCurrent.Common.Exceptions.UpdaterException]) -or 
        $Error.Exception -is [System.ServiceModel.FaultException])
    {
        $Type = 'GoCurrent'
    }

    Write-JsonError $Error.Exception.Message $Error.ScriptStackTrace $Type
}

function Write-JsonError($Message, $ScriptStackTrace, $Type)
{
    $Data = @{
        'message' = $Message
        'type' = $Type
        'scriptStackTrace' = $ScriptStackTrace
    }
    throw (ConvertTo-Json $Data -Compress)
}

function Test-GoCurrentInstalled()
{
    return ConvertTo-Json $_GoCurrentInstalled
}

function Install-AsAdmin()
{
    param(
        $ProjectFilePath,
        $DeploymentName,
        $InstanceName,
        $ArgumentsFilePath,
        $OutputPath
    )
    if ([string]::IsNullOrEmpty($ArgumentsFilePath))
    {
        $ArgumentsFilePath = $null
    }
    $DeploymentSet = GetDeployment -ProjectFilePath $ProjectFilePath -DeploymentName $DeploymentName
    $Result = @($deploymentSet.Packages | Install-GoPackage -InstanceName $InstanceName -Subscription ([Guid]::Empty) -Parameters $ArgumentsFilePath)

    Set-Content -Value (ConvertTo-Json $Result -Depth 100 -Compress) -Path $OutputPath
}

function Install-DeploymentSet()
{
    param(
        $ProjectFilePath,
        $DeploymentName,
        $InstanceName,
        $ArgumentsFilePath
    )

    $OutputPath = [System.IO.Path]::GetTempFileName()
    $DeploymentSet = GetDeployment -ProjectFilePath $ProjectFilePath -DeploymentName $DeploymentName
    $Updates = @($DeploymentSet.packages | Get-GoAvailableUpdates -InstanceName $InstanceName -Subscription ([Guid]::Empty) | Where-Object { $_.SelectedPackage -eq $null})
    $Command = "`$ErrorActionPreference='stop';trap{Write-Host `$_ -ForegroundColor Red;Write-Host `$_.ScriptStackTrace -ForegroundColor Red;pause;};Import-Module (Join-Path '$PSScriptRoot' 'GoCurrent.psm1');Install-AsAdmin '$ProjectFilePath' '$DeploymentName' '$InstanceName' '$ArgumentsFilePath' '$OutputPath';"
    $Process = Start-Process powershell $Command -Verb runas -PassThru 

    $Process.WaitForExit()
    if ($Process.ExitCode -ne 0)
    {
        Write-JsonError "Exception occured while installing package group `"$DeploymentName`"." -Type 'User'
    }
    $Data = Get-Content $OutputPath -Raw
    Remove-Item $OutputPath
    return $Data
}

function Get-AvailableUpdates()
{
    param(
        $ProjectFilePath,
        $DeploymentName,
        $InstanceName
    )
    $DeploymentSet = GetDeployment -ProjectFilePath $ProjectFilePath -DeploymentName $DeploymentName
    $Updates = @($DeploymentSet.packages | Get-GoAvailableUpdates -InstanceName $InstanceName -Subscription ([Guid]::Empty) | Where-Object { $_.SelectedPackage -eq $null})
    return (ConvertTo-Json $Updates)
}

function Remove-DeploymentSet()
{
    param(
        $ProjectFilePath,
        $DeploymentName,
        $InstanceName
    )
}

function Test-IsInstance($ProjectFilePath, $DeploymentName)
{
    $DeploymentSet = GetDeployment -ProjectFilePath $ProjectFilePath -DeploymentName $DeploymentName
    $Result = $DeploymentSet.packages | Test-GoIsInstance -Subscription ([Guid]::Empty)
    return (ConvertTo-Json $Result)
}

function GetDeployment($ProjectFilePath, $DeploymentName)
{
    $ProjectFile = Get-Content -Path $ProjectFilePath | ConvertFrom-Json
    foreach ($Set in $ProjectFile.devPackageGroups)
    {
        if ($Set.Name -eq $DeploymentName)
        {
            return $Set
        }
    }
    Write-JsonError "Package group `"$DeploymentName`" does not exists in project file." -Type 'User'
}

function Test-InstanceExists($InstanceName)
{
    return ConvertTo-Json (Test-GoInstanceExists -Instancename $InstanceName)
}

function Test-CanInstall($ProjectFilePath, $DeploymentName)
{
    $DeploymentSet = GetDeployment -ProjectFilePath $ProjectFilePath -DeploymentName $DeploymentName
    $CanInstall = $false
    foreach ($Package in $DeploymentSet.packages)
    {
        $First = Get-GoInstalledPackages -Id $Package.id | Select-Object -First 1
        if (!$First)
        {
            $CanInstall = $true
        }
        elseif (![string]::IsNullOrEmpty($First.InstanceName))
        {
            $CanInstall = $true
        } 
    }

    return ConvertTo-Json $CanInstall
}

function Get-Arguments($ProjectFilePath, $DeploymentName)
{
    $DeploymentSet = GetDeployment -ProjectFilePath $ProjectFilePath -DeploymentName $DeploymentName
    $Arguments = $DeploymentSet.packages | Get-GoArguments -Subscription ([Guid]::Empty)
    return ConvertTo-Json $Arguments
}

function Get-InstalledPackages($Id, $InstanceName)
{
    return ConvertTo-Json @(Get-GoInstalledPackages -Id $Id -InstanceName $InstanceName) -Compress
}