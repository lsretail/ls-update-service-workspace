
$ErrorActionPreference = 'stop'

function Install-Package()
{
    $FilePath = (Get-Item (Join-Path $PSScriptRoot '*.vsix')).FullName
    $Output = & code --install-extension $FilePath  | Out-String
    if ($LASTEXITCODE -ne 0)
    {
        Write-Host "Was trying to install $FilePath"
        throw "Exit code was ${LASTEXITCODE}: $Output"
    }
}