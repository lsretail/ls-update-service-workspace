$ErrorActionPreference = 'stop'

Import-Module GoCurrent
Import-Module (Join-Path $PSScriptRoot 'AdminUtils.psm1')
Import-Module (Join-Path $PSScriptRoot 'ErrorHandling.psm1')

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
        if ($App.SyncState -ne [Microsoft.Dynamics.Nav.Types.Apps.NavAppSyncState]::Synced)
        {
            $App | Sync-NAVApp -Mode Development -Force
        }
        
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
        return ConvertTo-Json $true -Compress
    }
    else
    {
        return ConvertTo-Json $false -Compress
    }
}

function Invoke-ImportLicenseAdmin
{
    param(
        [Parameter(Mandatory)]
        $InstanceName,
        [Parameter(Mandatory)]
        $FileName        
    )

    $Block = {
        param(
            [Parameter(Mandatory)]
            $ScriptDir,
            [Parameter(Mandatory)]
            $FileName,
            [Parameter(Mandatory)]
            $InstanceName
        )
        Import-Module (Join-Path $ScriptDir 'AlPsService.psm1')
        Invoke-ImportLicense -FileName $FileName -InstanceName $InstanceName

        FileName = $FileName
        InstanceName = $InstanceName
    }

    $Arguments = @{
        ScriptDir = $PSScriptRoot
        FileName = $FileName
        InstanceName = $InstanceName
    }
    return Invoke-AsAdmin -ScriptBlock $Block -Arguments $Arguments
}


function Invoke-ImportLicense
{
    param(
        [Parameter(Mandatory)]
        $InstanceName,
        [Parameter(Mandatory)]
        $FileName        
    )
    
    Write-Host $FileName

    $Server = Get-GocInstalledPackage -Id 'bc-server' -InstanceName $InstanceName

    if (!$Server)
    {
        Write-JsonError -Message "Instance doesn't exists `"$InstanceName`"." -Type 'User'
    }

    Import-Module (Join-Path $Server.Info.ServerDir 'Microsoft.Dynamics.Nav.Management.dll')

    $ServerInstance = $Server.Info.ServerInstance

    Write-EventLog -LogName "Application" -Source "Application Error" -EventID 3001 -EntryType Information -Message $FileName -Category 1 -RawData 10,20
    ##
    # -LicenseData doesn't work

    #Import-NAVServerLicense $ServerInstance -Tenant default -LicenseData ([Byte[]]$(Get-Content -Path $FileName ))
    #Import-NAVServerLicense $ServerInstance -Tenant default -LicenseData ([Byte[]]$(Get-Content -Path "C:\Users\alexandraei\Desktop\5337065.bclicense" -Encoding Byte ))
    
    Import-NAVServerLicense $ServerInstance -Tenant default -LicenseFile $FileName
    #Import-NAVServerLicense $ServerInstance -Tenant default -LicenseFile "C:\Users\alexandraei\Desktop\5337065.flf"
}

function Publish-AppAdmin
{
    param(
        [Parameter(Mandatory)]
        $AppPath,
        [Parameter(Mandatory)]
        $InstanceName
    )
    $Block = {
        param(
            [Parameter(Mandatory)]
            $ScriptDir,
            [Parameter(Mandatory)]
            $AppPath,
            [Parameter(Mandatory)]
            $InstanceName
        )
        Import-Module (Join-Path $ScriptDir 'AlPsService.psm1')
        Publish-App -AppPath $AppPath -InstanceName $InstanceName
    }
    $Arguments = @{
        ScriptDir = $PSScriptRoot
        AppPath = $AppPath
        InstanceName = $InstanceName
    }
    return Invoke-AsAdmin -ScriptBlock $Block -Arguments $Arguments
}

function Publish-App
{
    param(
        [Parameter(Mandatory)]
        $AppPath,
        [Parameter(Mandatory)]
        $InstanceName
    )

    $Server = Get-GocInstalledPackage -Id 'bc-server' -InstanceName $InstanceName

    if (!$Server)
    {
        Write-JsonError -Message "Instance doesn't exists `"$InstanceName`"." -Type 'User'
    }

    Import-Module (Join-Path $Server.Info.ServerDir 'Microsoft.Dynamics.Nav.Apps.Management.dll')
    $SyncMode = 'Development'
    $AllowForceSync = $true

    $ServerInstance = $Server.Info.ServerInstance

    $AppFileInfo = Get-NAVAppInfo -Path $AppPath

    $ExistingApp = $AppFileInfo | Get-NavAppInfo -ServerInstance $ServerInstance -TenantSpecificProperties -Tenant default | Select-Object -First 1


    $AllExisting = Get-NavAppInfo -ServerInstance $ServerInstance -TenantSpecificProperties -Tenant default -Id $AppFileInfo.AppId
    $AllExisting | Uninstall-NAVApp -ServerInstance $ServerInstance -Tenant default -Force

    $App = Publish-NAVApp -ServerInstance $ServerInstance -Path $AppPath -SkipVerification -PassThru
    $App | Sync-NAVApp -ServerInstance $ServerInstance -Mode $SyncMode -Force

    try 
    {
        $App | Sync-NAVApp -ServerInstance $ServerInstance -Mode $SyncMode -Force
    }
    catch 
    {
        if (!$AllowForceSync)
        {
            throw
        }
        $App | Sync-NAVApp -ServerInstance $ServerInstance -Mode ForceSync -Force
    }

    if (!$ExistingApp)
    {
        $App | Install-NAVApp -ServerInstance $ServerInstance -Tenant default
    }
    else 
    {
        $App | Start-NAVAppDataUpgrade -ServerInstance $ServerInstance    
    }
}