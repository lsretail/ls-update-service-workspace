$ErrorActionPreference = 'stop'

trap
{
    Write-Host $_
    Write-Host $_.ScriptStackTrace
}

try
{
    Import-Module GoCurrent
    $_GoCurrentInstalled = $true
}
catch
{
    $_GoCurrentInstalled = $false
}

function Test-GoCurrentInstalled()
{
    return ConvertTo-Json $_GoCurrentInstalled
}

function Install-Perform()
{
    param(
        $ProjectFilePath,
        $DeploymentName,
        $InstanceName
    )
    $DeploymentSet = GetDeployment -ProjectFilePath $ProjectFilePath -DeploymentName $DeploymentName
    $deploymentSet.Packages | Install-GoPackage -InstanceName $InstanceName -Subscription ([Guid]::Empty)
}

function Install-DeploymentSet()
{
    param(
        $ProjectFilePath,
        $DeploymentName,
        $InstanceName
    )

    $DeploymentSet = GetDeployment -ProjectFilePath $ProjectFilePath -DeploymentName $DeploymentName
    $Updates = @($DeploymentSet.packages | Get-GoAvailableUpdates -InstanceName $InstanceName -Subscription ([Guid]::Empty) | Where-Object { $_.SelectedPackage -eq $null})
    $Command = "`$ErrorActionPreference='stop';trap{Write-Host `$_ -ForegroundColor Red;Write-Host `$_.ScriptStackTrace -ForegroundColor Red;pause;};Import-Module (Join-Path '$PSScriptRoot' 'GoCurrent.psm1');Install-Perform '$ProjectFilePath' '$DeploymentName' '$InstanceName';pause;"
    $Process = Start-Process powershell $Command -Verb runas -PassThru

    $Process.WaitForExit()
    if ($Process.ExitCode -ne 0)
    {
        throw "Exception occured while installing package group `"$DeploymentName`".";
    }
    return (ConvertTo-Json $Updates)
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
