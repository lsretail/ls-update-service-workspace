$ErrorActionPreference = 'stop'

Import-Module LsSetupHelper\Utils\Streams

function Export-ArchiveFromApp
{
    param(
        [Parameter(Mandatory = $true)]
        [string] $Path,
        [Parameter(Mandatory = $true)]
        [string] $OutputPath
    )

    try 
    {
        $Path = (Resolve-Path $Path | Select-Object -First 1).ProviderPath
        [System.IO.Stream] $InputStream = [System.IO.File]::OpenRead($Path)

        $Offset = Find-StreamSequence -Stream $InputStream -Sequence @(0x50, 0x4b, 0x03, 0x04)

        if (!$Offset)
        {
            throw "Not able to detect archive within the file."
        }

        [System.IO.Stream] $OutputStream = [System.IO.File]::Create($OutputPath)

        Copy-StreamPart -Input $InputStream -Output $OutputStream -Offset $Offset -Length $InputStream.Length
    }
    catch
    {
        Write-Warning "$_"
        throw "Unsupported format."
    }
    finally 
    {
        if ($InputStream)
        {
            $InputStream.Dispose()
        }
        if ($OutputStream)
        {
            $OutputStream.Dispose()
        }
    }
}

function Get-AppJsonFromApp
{
    param(
        [Parameter(Mandatory)]
        $Path
    )

    $TempDir = [System.IO.Path]::Combine($ENV:TEMP, [System.IO.Path]::GetRandomFileName())
    [System.IO.Directory]::CreateDirectory($TempDir) | Out-Null

    try 
    {
        $ArchivePath = Join-Path $TempDir 'Archive.zip'

        Export-ArchiveFromApp -Path $Path -OutputPath $ArchivePath
    
        $NavxManifestPath = Join-Path $TempDir 'NavxManifest.xml'
    
        Expand-NavxManifestFromArchive -Path $ArchivePath -OutputPath $NavxManifestPath
    
        ConvertTo-AppJson -Path $NavxManifestPath    
    }
    finally
    {
        Remove-Item -Path $TempDir -Recurse   
    }
}

function Export-AppJsonFromApp
{
    param(
        [Parameter(Mandatory = $true)]
        $Path,
        [Parameter(Mandatory = $true)]
        $OutputPath
    )
    $AppJson = Get-AppJsonFromApp -Path $Path

    ConvertTo-Json $AppJson -Depth 10 | Set-Content -Path $OutputPath 
}

function Expand-NavxManifestFromArchive
{
    param(
        $Path,
        $OutputPath
    )

    Add-Type -Assembly System.IO.Compression.FileSystem
    try
    {
        $Zip = [IO.Compression.ZipFile]::OpenRead($Path)
        foreach ($Entry in $Zip.Entries)
        {
            if ($Entry.Name -match 'NavxManifest.xml')
            {
                [System.IO.Compression.ZipFileExtensions]::ExtractToFile($Entry, $OutputPath, $true)            
                return
            }
        }        
    }
    finally
    {
        $zip.Dispose()        
    }
    throw "Could not find NavxManifest.xml in: $Path."
}

function ConvertTo-AppJson
{
    <#
        .SYNOPSIS
            Convert NavxManifest.xml to app.json
    #>
    param(
        $Path
    )

    [xml]$Xml = Get-Content -Path $Path
    
    $Content = Convert-AttributesToHashtable -Attributes $Xml.Package.App.Attributes

    $Content.Dependencies = @()
    foreach ($Dependency in $Xml.Package.Dependencies.ChildNodes)
    {
        $Attributes = Convert-AttributesToHashtable -Attributes $Dependency.Attributes
        $Attributes.AppId = $Attributes.Id
        $Attributes.Version = $Attributes.MinVersion
        $Attributes.Remove('MinVersion')
        $Attributes.Remove('Id')
        $Content.Dependencies += $Attributes
    }

    $Content
}

function Convert-AttributesToHashtable
{
    param(
        $Attributes
    )

    $Content = @{}
    foreach ($Item in $Attributes)
    {
        $Content[$Item.Name] = $Item.Value
    }
    $Content
}