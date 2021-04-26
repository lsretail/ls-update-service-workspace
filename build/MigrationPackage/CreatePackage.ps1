$ErrorActionPreference = 'stop'

Import-Module GoCurrentServer

$GoCurrentWizard = @{
    'Id' = 'go-current-workspace'
    'Name' = 'Go Current Workspace'
    'Version' = '1.2.0'
    'OutputDir' = (Join-Path $PSScriptRoot "Package")
    'Dependencies' = @(
        @{'PackageId' = 'ls-update-service-workspace'; 'version' = "^! >=1.2.0"}
    )
    Commands = @{
        Install = 'Package.psm1:Remove-Package'
        Update = 'Package.psm1:Remove-Package'
    }
    InputPath = @(
        Join-Path $PSScriptRoot 'go-current-workspace\*'
    )
    AlwaysUpdateDependencies = $true
}

New-GocsPackage @GoCurrentWizard -Force | Import-GocsPackage -Server 'gc.lsretail.com'