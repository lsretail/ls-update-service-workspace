$ErrorActionPreference = 'stop'

Import-Module (Join-Path $PSScriptRoot 'ProjectFile.psm1')

Add-Type -AssemblyName 'System.ServiceModel'
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

$_GoCWizardPath = $null

function Invoke-ErrorHandler($Error)
{
    $Type = 'unknown'
    if (($Error.Exception -is [LSRetail.GoCurrent.Common.Exceptions.GoCurrentException]) -or 
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
        $PackageGroupId,
        $InstanceName,
        $ArgumentsFilePath,
        $OutputPath
    )
    if ([string]::IsNullOrEmpty($ArgumentsFilePath))
    {
        $ArgumentsFilePath = $null
    }
    $PackageGroup = GetPackageGroup -ProjectFilePath $ProjectFilePath -PackageGroupId $PackageGroupId
    $Result = @($PackageGroup.Packages | Install-GocPackage -InstanceName $InstanceName -Arguments $ArgumentsFilePath)

    Set-Content -Value (ConvertTo-Json $Result -Depth 100 -Compress) -Path $OutputPath
}

function Install-PackageGroupNew
{
    param(
        $ProjectFilePath,
        $PackageGroupId,
        $InstanceName,
        $ArgumentsJson
    )

    $PackageGroup = GetPackageGroup -ProjectFilePath $ProjectFilePath -PackageGroupId $PackageGroupId

    return Install-Packages -InstanceName $InstanceName -Packages $PackageGroup.Packages -Arguments $PackageGroup.Arguments
}

function Install-Packages
{
    param(
        $InstanceName,
        $Packages,
        $Arguments
    )
    $ToUpdate = @($Packages | Get-GocUpdates -InstanceName $InstanceName)

    $WizardPath = Get-GoCurrentWizardPath

    $Install = @{
        Name = ""
        Description = ""
        PackageGroups = @(
            @{
                Name = ""
                Description = ""
                Packages = $Packages
                Arguments = $Arguments
            }
        )
    }

    $TempFilePath = (Join-Path $env:TEMP "GoCWorkspace\$([System.IO.Path]::GetRandomFileName())")
    [System.IO.Directory]::CreateDirectory((Split-Path $TempFilePath -Parent)) | Out-Null
    (ConvertTo-Json -InputObject $Install -Depth 100 -Compress) | Set-Content -Path $TempFilePath

    $ArgumentList = @('-InstallerMetadata', $TempFilePath, '-SelectFirst')
    if ($InstanceName)
    {
        $ArgumentList += '-InstanceName', $InstanceName, '-UpdateInstance'
    }

    $Process = Start-Process -FilePath $WizardPath -ArgumentList $ArgumentList -PassThru
    $Process.WaitForExit()
    Remove-Item $TempFilePath -Force -ErrorAction SilentlyContinue
    if ($Process.ExitCode -ne 0)
    {
        throw "Error occurred while installing packages."
    }

    #$Installed = @($ToUpdate | Get-GocInstalledPackage)
    $Installed = $ToUpdate | ForEach-Object {
        $InstalledPackage = $_ | Get-GocInstalledPackage
        if (!$InstalledPackage -or $InstalledPackage.Version -ne $_.Version)
        {
            return $null
        }
        return $InstalledPackage
    }
    $Installed = @($Installed | Where-Object { $_ -ne $null })
    return (ConvertTo-Json $Installed -Depth 100 -Compress)
}

function Install-PackageGroup()
{
    param(
        $ProjectFilePath,
        $PackageGroupId,
        $InstanceName,
        $ArgumentsFilePath
    )
    $Command = 'Install-AsAdmin'
    $Arguments = "'$ProjectFilePath' '$PackageGroupId' '$InstanceName' '$ArgumentsFilePath'"
    $ExceptionText = "Exception occured while installing package group `"$PackageGroupId`"."
    Invoke-AsAdmin -Command $Command -Arguments $Arguments -ExceptionText $ExceptionText

    return $Data
}

function Get-AvailableUpdates()
{
    param(
        $ProjectFilePath,
        $PackageGroupId,
        $InstanceName,
        [string[]]$SelectedPackages
    )
    $PackageGroup = GetPackageGroup -ProjectFilePath $ProjectFilePath -PackageGroupId $PackageGroupId -NoThrow

    if (!$PackageGroup)
    {
        return (ConvertTo-Json @())
    }

    # We only want to check optional packages for updates if they where installed, here we filter them out:
    $Packages = $PackageGroup.packages | Where-Object { (!$_.optional) -or ($_.optional -and $SelectedPackages.Contains($_.id)) }

    $Updates = @($Packages | Get-GocUpdates -InstanceName $InstanceName )
    return (ConvertTo-Json $Updates)
}

function Test-IsInstance($ProjectFilePath, $PackageGroupId)
{
    $PackageGroup = GetPackageGroup -ProjectFilePath $ProjectFilePath -PackageGroupId $PackageGroupId -NoThrow
    if (!$PackageGroup)
    {
        return (ConvertTo-Json $false)
    }
    $Result = $PackageGroup.packages | Test-GocIsInstance
    return (ConvertTo-Json $Result)
}

function GetPackageGroup
{
    param(
        [Parameter(Mandatory = $true)]
        $ProjectFilePath,
        [Parameter(Mandatory = $true)]
        $PackageGroupId,
        [switch] $NoThrow
    )
    $Group = Get-PackageGroup -Id $PackageGroupId -Path $ProjectFilePath
    if (!$Group -and !$NoThrow)
    {
        Write-JsonError "Package group `"$PackageGroupId`" does not exists in project file." -Type 'User'
    }
    return $Group
}

function ReplaceVariables
{
    param(
        $PackageGroup,
        $Variables
    )
    foreach ($Package in $PackageGroup.Packages)
    {
        foreach ($Pair in $Variables.PSObject.Properties)
        {
            $Package.Version = $Package.Version.Replace("`${$($Pair.Name)}", $Pair.Value)
        }
    }
}

function Test-InstanceExists($InstanceName)
{
    return ConvertTo-Json (Test-GocInstanceExists -Instancename $InstanceName)
}

function Test-CanInstall($ProjectFilePath, $PackageGroupId)
{
    $PackageGroup = GetPackageGroup -ProjectFilePath $ProjectFilePath -PackageGroupId $PackageGroupId
    foreach ($Package in $PackageGroup.packages)
    {
        $First = Get-GocInstalledPackage -Id $Package.id | Select-Object -First 1
        if (!$First)
        {
            return ConvertTo-Json $true
        }
        elseif (![string]::IsNullOrEmpty($First.InstanceName))
        {
            return ConvertTo-Json $true
        } 
    }    
}

function Test-IsInstalled($Packages, $InstanceName)
{
    <#$PackageGroup = GetPackageGroup -ProjectFilePath $ProjectFilePath -PackageGroupId $PackageGroupId -NoThrow
    if (!$PackageGroup)
    {
        return ConvertTo-Json $false
    }#>
    foreach ($Package in $Packages)
    {
        $Installed = $Package | Get-GocInstalledPackage -InstanceName $InstanceName
        if ($Installed)
        {
            return ConvertTo-Json $true
        }
    }
    return ConvertTo-Json $false
}

function Get-Arguments($ProjectFilePath, $PackageGroupId)
{
    $PackageGroup = GetPackageGroup -ProjectFilePath $ProjectFilePath -PackageGroupId $PackageGroupId
    $Arguments = $PackageGroup.packages | Get-GocArguments
    return ConvertTo-Json $Arguments
}

function Get-InstalledPackages($Id, $InstanceName)
{
    return ConvertTo-Json @(Get-GocInstalledPackage -Id $Id -InstanceName $InstanceName) -Compress
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

    if ((![string]::IsNullOrEmpty($Deployment.instanceName)) -and (Test-GocInstanceExists -InstanceName $Deployment.instanceName))
    {
        Remove-GocPackage -InstanceName $Deployment.instanceName
    }

    if ($Deployment.packages.Count -eq 0)
    {
        return
    }

    $NotInstances = $Deployment.packages | Where-Object { !(Test-GocIsInstance -Id $_.id)}
    $NotInstances = $NotInstances | Where-Object { $null -ne (Get-GocInstalledPackage -Id $_.id ) }
    $NotInstances | Remove-GocPackage

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
        'go-current-client',
        'go-current-workspace'
    )
    $Updates = @($Packages | Get-GocUpdates)
    return (ConvertTo-Json $Updates)
}

function Install-BasePackages()
{
    $Packages = @(
        @{ Id = 'go-current-client'; Version = "" },
        @{ Id = 'go-current-workspace'; Version = "" }
    )
    return Install-Packages -Packages $Packages
}

function Install-BaseAsAdmin($OutputPath)
{
    $Packages = @(
        'go-current-client',
        'go-current-workspace'
    )
    $Result = @($Packages | Install-GocPackage)
    Set-Content -Value (ConvertTo-Json $Result -Depth 100 -Compress) -Path $OutputPath
}

function GetDeployedPackages()
{
    param(
        $WorkspaceDataPath,
        $DeploymentGuid
    )
    $Deployment = GetDeployment -WorkspaceDataPath $WorkspaceDataPath -DeploymentGuid $DeploymentGuid

    if ((![string]::IsNullOrEmpty($Deployment.instanceName)) -and (Test-GocInstanceExists -InstanceName $Deployment.instanceName))
    {
        Get-GocInstalledPackage -InstanceName $Deployment.instanceName
    }

    if ($Deployment.packages.Count -eq 0)
    {
        return
    }

    $NotInstances = $Deployment.packages | Where-Object { !(Test-GocIsInstance -Id $_.id)}
    $NotInstances | Where-Object { $null -ne (Get-GocInstalledPackage -Id $_.id ) }
}

function Get-DeployedPackages()
{
    param(
        $WorkspaceDataPath,
        $DeploymentGuid
    )
    return (ConvertTo-Json @(GetDeployedPackages -WorkspaceDataPath $WorkspaceDataPath -DeploymentGuid $DeploymentGuid) -Depth 100 -Compress)
}

function Invoke-OpenGoCurrentWizard
{
    $WizardPath = Get-GoCurrentWizardPath

    & $WizardPath
}

function Get-GoCurrentWizardPath
{
    if ($null -ne $_GoCWizardPath)
    {
        return $_GoCWizardPath
    }
    $GoCModule = Get-Module GoCurrent | Select-Object -First 1

    $Dir = Split-Path $GoCModule.Path -Parent

    $_GoCWizardPath = Join-Path $Dir 'LSRetail.GoCurrent.Client.Wizard.exe'
    return $_GoCWizardPath
}