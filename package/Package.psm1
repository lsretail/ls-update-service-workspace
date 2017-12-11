
$ErrorActionPreference = 'stop'

function Install-Package()
{
    $Output = & code --install-extension (Get-Item (Join-Path $PSScriptRoot '*.vsix')).FullName | Out-String
    if ($LASTEXITCODE -ne 0)
    {
        throw "Exit code was ${LASTEXITCODE}: $Output"
    }
}