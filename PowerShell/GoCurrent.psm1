$ErrorActionPreference = 'stop'

try
{
    $env:PSModulePath = [System.Environment]::GetEnvironmentVariable("PSModulePath", "machine")
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
    throw (ConvertTo-Json $Data -Compress)+"|||"
}

function Test-GoCurrentInstalled()
{
    return ConvertTo-Json $_GoCurrentInstalled
}

function Invoke-AsAdmin()
{
    param(
        [string] $Command,
        [string] $Arguments,
        [string] $ExceptionText
    )
    $OutputPath = [System.IO.Path]::GetTempFileName()
    $Command = "`$ErrorActionPreference='stop';trap{Write-Host `$_ -ForegroundColor Red;Write-Host `$_.ScriptStackTrace -ForegroundColor Red;pause;};Import-Module (Join-Path '$PSScriptRoot' 'GoCurrent.psm1');$Command -OutputPath '$OutputPath' $Arguments;"
    $Process = Start-Process powershell $Command -Verb runas -PassThru

    $Process.WaitForExit()
    if ($Process.ExitCode -ne 0)
    {
        Write-JsonError $ExceptionText -Type 'User'
    }
    $Data = Get-Content $OutputPath -Raw
    Remove-Item $OutputPath
    return $Data

}

function Install-AsAdmin()
{
    param(
        $ProjectFilePath,
        $PackageGroupName,
        $InstanceName,
        $ArgumentsFilePath,
        $OutputPath
    )
    if ([string]::IsNullOrEmpty($ArgumentsFilePath))
    {
        $ArgumentsFilePath = $null
    }
    $PackageGroup = GetPackageGroup -ProjectFilePath $ProjectFilePath -PackageGroup $PackageGroupName
    $Result = @($PackageGroup.Packages | Install-GoPackage -InstanceName $InstanceName -Subscription ([Guid]::Empty) -Parameters $ArgumentsFilePath)

    Set-Content -Value (ConvertTo-Json $Result -Depth 100 -Compress) -Path $OutputPath
}

function Install-PackageGroup()
{
    param(
        $ProjectFilePath,
        $PackageGroupName,
        $InstanceName,
        $ArgumentsFilePath
    )
    $Command = 'Install-AsAdmin'
    $Arguments = "'$ProjectFilePath' '$PackageGroupName' '$InstanceName' '$ArgumentsFilePath'"
    $ExceptionText = "Exception occured while installing package group `"$PackageGroupName`"."
    Invoke-AsAdmin -Command $Command -Arguments $Arguments -ExceptionText $ExceptionText

    return $Data
}

function Get-AvailableUpdates()
{
    param(
        $ProjectFilePath,
        $PackageGroupName,
        $InstanceName
    )
    $PackageGroup = GetPackageGroup -ProjectFilePath $ProjectFilePath -PackageGroup $PackageGroupName
    $Updates = @($PackageGroup.packages | Get-GoAvailableUpdates -InstanceName $InstanceName -Subscription ([Guid]::Empty) | Where-Object { $_.SelectedPackage -eq $null})
    return (ConvertTo-Json $Updates)
}

function Test-IsInstance($ProjectFilePath, $PackageGroupName)
{
    $PackageGroup = GetPackageGroup -ProjectFilePath $ProjectFilePath -PackageGroup $PackageGroupName
    $Result = $PackageGroup.packages | Test-GoIsInstance -Subscription ([Guid]::Empty)
    return (ConvertTo-Json $Result)
}

function GetPackageGroup($ProjectFilePath, $PackageGroupName)
{
    $ProjectFile = Get-Content -Path $ProjectFilePath | ConvertFrom-Json
    foreach ($Set in $ProjectFile.devPackageGroups)
    {
        if ($Set.Name -eq $PackageGroupName)
        {
            return $Set
        }
    }
    Write-JsonError "Package group `"$PackageGroupName`" does not exists in project file." -Type 'User'
}

function Test-InstanceExists($InstanceName)
{
    return ConvertTo-Json (Test-GoInstanceExists -Instancename $InstanceName)
}

function Test-CanInstall($ProjectFilePath, $PackageGroupName)
{
    $PackageGroup = GetPackageGroup -ProjectFilePath $ProjectFilePath -PackageGroup $PackageGroupName
    $CanInstall = $false
    foreach ($Package in $PackageGroup.packages)
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

function Get-Arguments($ProjectFilePath, $PackageGroupName)
{
    $PackageGroup = GetPackageGroup -ProjectFilePath $ProjectFilePath -PackageGroup $PackageGroupName
    $Arguments = $PackageGroup.packages | Get-GoArguments -Subscription ([Guid]::Empty)
    return ConvertTo-Json $Arguments
}

function Get-InstalledPackages($Id, $InstanceName)
{
    return ConvertTo-Json @(Get-GoInstalledPackages -Id $Id -InstanceName $InstanceName) -Compress
}

function GetDeployment()
{
    param(
        $WorkspaceDataPath,
        $DeploymentGuid
    )

    $WorkspaceData = Get-Content -Path $WorkspaceDataPath | ConvertFrom-Json
    foreach ($Set in $WorkspaceData.deployments)
    {
        if ($Set.guid -eq $DeploymentGuid)
        {
            return $Set
        }
    }
    Write-JsonError "Deployment `"$DeploymentGuid`" does not exists workspace data file." -Type 'User'

}

function Remove-AsAdmin()
{
    param(
        $OutputPath,
        $WorkspaceDataPath,
        $DeploymentGuid
    )

    $Deployment = GetDeployment -WorkspaceDataPath $WorkspaceDataPath -DeploymentGuid $DeploymentGuid

    if ((![string]::IsNullOrEmpty($Deployment.instanceName)) -and (Test-GoInstanceExists -InstanceName $Deployment.instanceName))
    {
        Remove-GoPackage -InstanceName $Deployment.instanceName
    }

    if ($Deployment.packages.Count -eq 0)
    {
        return
    }

    $NotInstances = $Deployment.packages | Where-Object { !(Test-GoIsInstance -Subscription ([Guid]::Empty) -Id $_.id -Version $_.version)}
    $NotInstances = $NotInstances | Where-Object { (Get-GoInstalledPackages -Id $_.id ) -ne $null }
    $NotInstances | Remove-GoPackage

    Set-Content -Value (ConvertTo-Json $Deployment.name -Depth 100 -Compress) -Path $OutputPath
   }

function Remove-Deployment()
{
    param(
        $WorkspaceDataPath,
        $DeploymentGuid
    )
    $Command = 'Remove-AsAdmin'
    $Arguments = "'$WorkspaceDataPath' '$DeploymentGuid'"
    $ExceptionText = "Exception occured while uninstalling packages."
    Invoke-AsAdmin -Command $Command -Arguments $Arguments -ExceptionText $ExceptionText
}

function Get-AvailableBaseUpdates()
{
    $Packages = @(
        'go-current-wizard',
        'go-current-workspace'
    )
    $Updates = @($Packages | Get-GoAvailableUpdates -Subscription ([Guid]::Empty) | Where-Object { $_.SelectedPackage -eq $null})
    return (ConvertTo-Json $Updates)
}

function Install-BasePackages()
{
    Invoke-AsAdmin -Command 'Install-BaseAsAdmin'
}

function Install-BaseAsAdmin($OutputPath)
{
    $Packages = @(
        'go-current-wizard',
        'go-current-workspace'
    )
    $Result = @($Packages | Install-GoPackage -Subscription ([Guid]::Empty))
    Set-Content -Value (ConvertTo-Json $Result -Depth 100 -Compress) -Path $OutputPath
}

function GetDeployedPackages()
{
    param(
        $WorkspaceDataPath,
        $DeploymentGuid
    )
    $Deployment = GetDeployment -WorkspaceDataPath $WorkspaceDataPath -DeploymentGuid $DeploymentGuid

    if ((![string]::IsNullOrEmpty($Deployment.instanceName)) -and (Test-GoInstanceExists -InstanceName $Deployment.instanceName))
    {
        Get-GoInstalledPackages -InstanceName $Deployment.instanceName
    }

    if ($Deployment.packages.Count -eq 0)
    {
        return
    }

    $NotInstances = $Deployment.packages | Where-Object { !(Test-GoIsInstance -Subscription ([Guid]::Empty) -Id $_.id -Version $_.version)}
    $NotInstances | Where-Object { (Get-GoInstalledPackages -Id $_.id ) -ne $null }
}

function Get-DeployedPackages()
{
    param(
        $WorkspaceDataPath,
        $DeploymentGuid
    )
    return (ConvertTo-Json @(GetDeployedPackages -WorkspaceDataPath $WorkspaceDataPath -DeploymentGuid $DeploymentGuid) -Depth 100 -Compress)
}