
$ErrorActionPreference = 'stop'

function Install-Package()
{
    $FilePath = (Get-Item (Join-Path $PSScriptRoot '*.vsix')).FullName

    Write-Progress -Id 217 -Activity 'Installing extension' -Status "Installing" -PercentComplete 20
    $Process = Start-Process -FilePath 'code' -ArgumentList @('--install-extension', $FilePath) -WindowStyle Hidden -PassThru
    Write-Progress -Id 217 -Activity 'Installing extension' -Status "Done" -PercentComplete 80
    $Process.WaitForExit()
    
    if ($Process.ExitCode -ne 0)
    {
        Write-Host "Was trying to install $FilePath"
        throw "Exit code was ${LASTEXITCODE}: $Output"
    }
}