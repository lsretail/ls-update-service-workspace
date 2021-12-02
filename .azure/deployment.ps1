param(
    [Parameter(Mandatory = $true)]
    $Workdir,
    $Server = 'localhost',
    $Port = 16550
)

$ErrorActionPreference = 'Stop'

$WorkspaceZip = Get-Item (Join-Path $Workdir '*workspace*.zip')

Import-Module GoCurrentServer

Import-GocsPackage -Path $WorkspaceZip -Server $Server -Port $Port -Force