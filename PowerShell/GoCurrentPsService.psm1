$ErrorActionPreference = 'stop'

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

function Get-GoCurrentVersion()
{
    $HasRequiredVersion = $false
    $CurrentVersion = ''
    $RequiredVersion = [Version]::Parse('0.15.11')
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
        [string] $Servers
    )

    $ServersObj = ConvertTo-ServersObj -Servers $Servers

    $ToUpdate = @($Packages | Get-GocUpdates -InstanceName $InstanceName -Server $ServersObj)

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
        $Packages,
        $InstanceName
    )

    if ($InstanceName)
    {
        return ConvertTo-Json (Test-GocInstanceExists -InstanceName $InstanceName) -Compress
    }

    foreach ($Package in $Packages)
    {
        $Installed = $Package | Get-GocInstalledPackage -InstanceName $InstanceName
        if ($Installed)
        {
            return ConvertTo-Json $true -Compress
        }
    }
    return ConvertTo-Json $false -Compress
}

function Get-AvailableBaseUpdates()
{
    $Packages = @(
        'go-current-client',
        'go-current-workspace'
    )
    $Updates = @($Packages | Get-GocUpdates)
    return (ConvertTo-Json $Updates -Compress -Depth 100)
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