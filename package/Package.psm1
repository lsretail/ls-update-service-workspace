
$ErrorActionPreference = 'stop'

function Install-Package()
{
    $PossiblePaths = @(
        'C:\Program Files\Microsoft VS Code\bin\code',
        (Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code\bin\code')
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

    $FilePath = (Get-Item (Join-Path $PSScriptRoot '*.vsix')).FullName

    Write-Progress -Id 217 -Activity 'Installing extension' -Status "Installing" -PercentComplete 20
    $Process = Start-Process -FilePath $FoundPath -ArgumentList @('--install-extension', $FilePath) -WindowStyle Hidden -PassThru
    Write-Progress -Id 217 -Activity 'Installing extension' -Status "Done" -PercentComplete 80
    $Process.WaitForExit()
    
    if ($Process.ExitCode -ne 0)
    {
        Write-Host "Was trying to install $FilePath"
        throw "Exit code was ${LASTEXITCODE}: $Output"
    }
}