$ErrorActionPreference = 'stop'

function Install-Package
{
    Write-Progress -Id 217 -Activity 'Installing LS Retail Update Service Workspace' -Status "Initializing" -PercentComplete 10

    $CodePath = Get-Code

    $FilePath = (Get-Item (Join-Path $PSScriptRoot '*.vsix')).FullName

    $Arguments = @(
        '--install-extension',
        $FilePath
    )

    Write-Progress -Id 217 -Activity 'Installing LS Retail Update Service Workspace' -Status "Installing" -PercentComplete 20

    $ErrorActionPreference = 'continue'
    & $CodePath @Arguments | Write-Host
    $ErrorActionPreference = 'stop'

    Write-Host "Exit code $LASTEXITCODE"

    if ($LASTEXITCODE -ne 0)
    {
        Write-Host "Code path: $CodePath"
        Write-Host "Extension path: $FilePath"
        throw "Error occured while installing LS Retail Update Service Workspace (exit code $LASTEXITCODE)."
    }
    
    Write-Progress -Id 217 -Activity 'Installing LS Retail Update Service Workspace' -Status "Done" -PercentComplete 100
}

function Get-Code
{
    $PossiblePaths = @(
        'C:\Program Files\Microsoft VS Code\bin\code.cmd',
        (Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code\bin\code.cmd')
    )

    $FoundPath = $null
    foreach ($Path in $PossiblePaths)
    {
        if (Test-Path $Path)
        {
            $FoundPath = $Path
            break
        }
    }
    if (!$FoundPath)
    {
        throw "Could not find VS Code installation. Make sure VS Code is installed and then try again."
    }
    return $FoundPath
}

function Remove-Package
{ 
    Write-Progress -Id 217 -Activity 'Removing LS Retail Update Service Workspace' -Status "Removing" -PercentComplete 20
    $CodePath = Get-Code

    $Arguments = @(
        '--uninstall-extension'
        'lsretail.ls-update-service-workspace'
    )

    & $CodePath @Arguments | Write-Host

    Write-Progress -Id 217 -Activity 'Removing LS Retail Update Service Workspace' -Status "Done" -PercentComplete 100
}
