$ErrorActionPreference = 'stop'

Import-Module GoCurrent
Import-Module (Join-Path $PSScriptRoot 'AdminUtils.psm1')
Import-Module (Join-Path $PSScriptRoot 'ErrorHandling.psm1')

function Invoke-AlTest
{
    Start-Sleep 3
    
    $Block = {
        param(
            $InstanceName
        )
        Write-Host 'this is from the block'
        return "this is from the block: $InstanceName"
    }
    $Arguments = @{
        InstanceName = 'this is my instance name'
    }
    return Invoke-AsAdmin -ScriptBlock $Block -Arguments $Arguments
   
}

function Invoke-UpgradeDataAdmin
{
    param(
        [Parameter(Mandatory = $true)]
        $InstanceName
    )

    $Block = {
        param(
            [Parameter(Mandatory)]
            $ScriptDir,
            [Parameter(Mandatory)]
            $InstanceName
        )
        Import-Module (Join-Path $ScriptDir 'AlPsService.psm1')
        Invoke-UpgradeData -InstanceName $InstanceName
    }
    $Arguments = @{
        ScriptDir = $PSScriptRoot
        InstanceName = $InstanceName
    }
    return Invoke-AsAdmin -ScriptBlock $Block -Arguments $Arguments
}

function Invoke-UpgradeData
{
    param(
        [Parameter(Mandatory = $true)]
        $InstanceName
    )

    $Server = Get-GocInstalledPackage -Id 'bc-server' -InstanceName $InstanceName

    if (!$Server)
    {
        return (ConvertTo-Json @() -Compress)
    }

    Import-Module (Join-Path $Server.Info.ServerDir 'Microsoft.Dynamics.Nav.Apps.Management.dll')

    $Apps = Get-NAVAppInfo -ServerInstance $Server.Info.ServerInstance -TenantSpecificProperties -Tenant default
    $Apps = $Apps | Where-Object { $_.ExtensionDataVersion -ne $_.Version}

    $AppsUpgraded = @()

    foreach ($App in $Apps)
    {
        $AppsUpgraded += "$($App.Name) by $($App.Publisher) ($($App.AppId))"
        $App | Start-NAVAppDataUpgrade
    }
    return (ConvertTo-Json $AppsUpgraded -Compress)
}

function Invoke-UnpublishAppAdmin
{
    param(
        [Parameter(Mandatory)]
        $AppId,
        [Parameter(Mandatory)]
        $InstanceName
    )
    $Block = {
        param(
            [Parameter(Mandatory)]
            $ScriptDir,
            [Parameter(Mandatory)]
            $AppId,
            [Parameter(Mandatory)]
            $InstanceName
        )
        Import-Module (Join-Path $ScriptDir 'AlPsService.psm1')
        Invoke-UnpublishApp -AppId $AppId -InstanceName $InstanceName
    }
    $Arguments = @{
        ScriptDir = $PSScriptRoot
        AppId = $AppId
        InstanceName = $InstanceName
    }
    return Invoke-AsAdmin -ScriptBlock $Block -Arguments $Arguments
}

function Invoke-UnpublishApp
{
    param(
        [Parameter(Mandatory)]
        $AppId,
        [Parameter(Mandatory)]
        $InstanceName
    )

    $Server = Get-GocInstalledPackage -Id 'bc-server' -InstanceName $InstanceName

    if (!$Server)
    {
        Write-JsonError -Message "Instance doesn't exists `"$InstanceName`"." -Type 'User'
    }

    Import-Module (Join-Path $Server.Info.ServerDir 'Microsoft.Dynamics.Nav.Apps.Management.dll')

    $ServerInstance = $Server.Info.ServerInstance

    $App = Get-NavAppInfo -ServerInstance $ServerInstance -Id $AppId
    if ($App)
    {
        $App | Uninstall-NavApp -ServerInstance $ServerInstance -Tenant default -Force
        $App | Unpublish-NavApp -ServerInstance $ServerInstance
    }
    else
    {
        Write-JsonError -Message "App doesn't exists in `"$ServerInstance`"." -Type 'User'
    }
}
