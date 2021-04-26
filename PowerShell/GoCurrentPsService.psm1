$ErrorActionPreference = 'stop'

Import-Module (Join-Path $PSScriptRoot 'ErrorHandling.psm1')
Import-Module (Join-Path $PSScriptRoot 'Utils.psm1')

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

function Get-GoCurrentVersion
{
    $HasRequiredVersion = $false
    $CurrentVersion = ''
    $RequiredVersion = [Version]::Parse('0.19.0')
    if ($_GoCurrentInstalled)
    {
        $CurrentVersion = ((Get-Module -Name 'GoCurrent') | Select-Object -First 1).Version

        $HasRequiredVersion = $CurrentVersion -ge $RequiredVersion
        $CurrentVersion = $CurrentVersion.ToString()
    }
    $RequiredVersion = $RequiredVersion.ToString()

    return ConvertTo-Json -Compress -InputObject @{
        RequiredVersion = $RequiredVersion
        CurrentVersion = $CurrentVersion
        HasRequiredVersion = $HasRequiredVersion
        IsInstalled = $_GoCurrentInstalled
    }
}

function Install-PackagesJson
{
    param(
        $InstanceName,
        $Packages,
        $Servers,
        $Arguments
    )

    $Packages = ConvertFrom-Json $Packages

    return Install-Packages -Servers $Servers -InstanceName $InstanceName -Packages $Packages
}

function Install-Packages
{
    param(
        $InstanceName,
        [Array] $Packages,
        $Arguments,
        [string] $Servers,
        [string] $UpdateInstanceMode = 'Merge'
    )

    if (!$UpdateInstanceMode)
    {
        $UpdateInstanceMode = 'Merge'
    }

    $ServersObj = ConvertTo-ServersObj -Servers $Servers

    $ToUpdate = @($Packages | Get-GocUpdates -InstanceName $InstanceName -Server $ServersObj -UpdateInstanceMode $UpdateInstanceMode)

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

    if ($ServersObj)
    {
        $Install.Servers = $ServersObj
    }

    $TempFilePath = (Join-Path $env:TEMP "GoCWorkspace\$([System.IO.Path]::GetRandomFileName())")
    [System.IO.Directory]::CreateDirectory((Split-Path $TempFilePath -Parent)) | Out-Null
    (ConvertTo-Json -InputObject $Install -Depth 100 -Compress) | Set-Content -Path $TempFilePath

    $ArgumentList = @('-InstallerMetadata', "`"$TempFilePath`"", '-SelectFirst')
    if ($InstanceName)
    {
        $ArgumentList += '-InstanceName', $InstanceName, '-UpdateInstance', '-UpdateInstanceMode', $UpdateInstanceMode
    }

    $Process = Start-Process -FilePath $WizardPath -ArgumentList $ArgumentList -PassThru
    $Process.WaitForExit()

    Remove-Item $TempFilePath -Force -ErrorAction SilentlyContinue

    if ($Process.ExitCode -ne 0)
    {
        throw "Error occurred while installing packages."
    }

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

function Get-Updates
{
    param(
        $Packages,
        $InstanceName,
        [string] $Servers
    )
    $ServersObj = ConvertTo-ServersObj -Servers $Servers
    $Packages = ConvertFrom-Json $Packages

    return ConvertTo-Json (@($Packages | Get-GocUpdates -InstanceName $InstanceName -Server $ServersObj)) -Compress -Depth 100
}

function Get-Package
{
    param(
        $PackageId, 
        $VersionQuery,
        [string] $Servers
    )

    $ServersObj = ConvertTo-ServersObj -Servers $Servers
    return ConvertTo-Json (Get-GocPackage -Id $PackageId -VersionQuery $VersionQuery -Server $ServersObj) -Compress -Depth 100
}

function Test-PackageAvailable
{
    param(
        $PackageId,
        $Servers
    )

    $ServersObj = ConvertTo-ServersObj -Servers $Servers

    try
    {
        Get-GocPackage -Id $PackageId -VersionQuery "" -Server $ServersObj | Out-Null
    }
    catch
    {
        if ($_.Exception -is [LSRetail.GoCurrent.Common.Exceptions.NoPackageInRangeException])
        {
            return (ConvertTo-Json $false -Compress)
        }
        throw
    }
    return (ConvertTo-Json $true -Compress)
}

function Test-InstanceExists($InstanceName)
{
    return ConvertTo-Json (Test-GocInstanceExists -Instancename $InstanceName) -Depth 100 -Compress
}

function Test-IsInstalled
{
    param(
        [array] $Packages,
        $InstanceName,
        [boolean] $Any
    )

    if ($InstanceName)
    {
        return ConvertTo-Json (Test-GocInstanceExists -InstanceName $InstanceName) -Compress
    }

    $AllInstalled = @()
    foreach ($Package in $Packages)
    {
        $Installed = $Package | Get-GocInstalledPackage -InstanceName $InstanceName
        if ($Installed)
        {
            if ($Any)
            {
                return ConvertTo-Json $true -Compress
            }
            else
            {
                $AllInstalled += $Package    
            }
        }
    }
    if ($Any)
    {
        return ConvertTo-Json $false -Compress    
    }
    return ConvertTo-Json ($AllInstalled) -Depth 100 -Compress
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

function Get-Instances
{
    return ConvertTo-Json  @(Get-GocInstalledPackage | Where-Object { $_.InstanceName } | Group-Object -Property 'InstanceName' | Sort-Object -Property 'Name' | ForEach-Object { @(,$_.Group)}) -Depth 100 -Compress
}