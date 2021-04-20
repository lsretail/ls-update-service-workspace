$ErrorActionPreference = 'stop'

function ConvertTo-BranchPreReleaseLabel
{
    <#
        .SYNOPSIS
            Convert a branch name to a pre-release label.

        .PARAMETER BranchName
            Branch name to convert.
        
        .PARAMETER BranchToLabelMap
            A hashtable that defines the conversion map.
            Key: Specify a branch name.
            Value: Specify output string, %BRANCHNAME% will be replace with the name specified with -BranchName. 
            Adding "%BRANCHNAME%" as key will catch all branches not defined in the hashtable map.

        .EXAMPLE
            PS> ConvertTo-BranchPreReleaseLabel -BranchName 'master'
            dev.0.master

            PS> ConvertTo-BranchPreReleaseLabel -BranchName 'qwerty'
            dev.branch.qwerty
    #>
    param(
        [Parameter(Mandatory = $true)]
        $BranchName,
        [hashtable] $BranchToLabelMap
    )

    if (!$BranchToLabelMap)
    {
        $BranchToLabelMap = @{
            "master" = "dev.0.%BRANCHNAME%"
            "%BRANCHNAME%" = "dev.branch.%BRANCHNAME%"
        }
    }

    if ($BranchToLabelMap.Contains($BranchName))
    {
        $Label = $BranchToLabelMap[$BranchName]
    }
    elseif (!$BranchToLabelMap.Contains("%BRANCHNAME%"))
    {
        throw "Specified map must include `"%BRANCHNAME%`" key."
    }
    else 
    {
        $Label = $BranchToLabelMap["%BRANCHNAME%"]
    }

    $BranchName = $BranchName.ToLower()
    $Label = $Label.Replace("%BRANCHNAME%", $BranchName)
    $Label = [regex]::Replace($Label, "[^a-zA-Z0-9-.+]", "-")  
    $Label
}

function ConvertTo-PreReleaseLabel
{
    <#
        .SYNOPSIS
            Convert specified label to pre-release label.
        
        .DESCRIPTION
            A utility function to format a pre-release label.

        .EXAMPLE
            PS> ConvertTo-PreReleaseLabel -Label 'this is a beta'
            this-is-a-beta

            PS> ConvertTo-PreReleaseLabel -Label 'alpha'
            alpha
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string] $Label
    )

    return [regex]::Replace($Label, "[^a-zA-Z0-9-.+]", "-")  
}

function ConvertTo-BranchPriorityPreReleaseFilter
{
    param(
        [Array] $BranchName,
        $BranchToLabelMap
    )

    $Labels = @()
    foreach ($Branch in $BranchName)
    {
        if (!$Branch)
        {
            continue
        }
        $Label = ConvertTo-BranchPreReleaseLabel -BranchName $Branch.Trim() -BranchToLabelMap $BranchToLabelMap
        $Label = $Label.Trim()
        $Filter = "*-$Label."
        if (!$Labels.Contains($Filter))
        {
            $Labels += $Filter
        }
    }
    
    "$([string]::Join(' >> ', $Labels))"
}