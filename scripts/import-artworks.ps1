[CmdletBinding()]
param(
    [Parameter(Position = 0, ValueFromPipeline, ValueFromRemainingArguments)]
    [string[]]$Path
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$sourceDirectory = Join-Path $root 'src'
$manifestPath = Join-Path $root 'artworks.json'
$thumbnailScript = Join-Path $PSScriptRoot 'generate-thumbnails.ps1'
$supportedExtensions = @('.jpg', '.jpeg', '.png')

function Get-ImageFiles {
    param([string[]]$InputPath)

    $files = foreach ($item in $InputPath) {
        $resolvedPath = Resolve-Path -LiteralPath $item -ErrorAction Stop
        if (Test-Path -LiteralPath $resolvedPath -PathType Container) {
            Get-ChildItem -LiteralPath $resolvedPath -File |
                Where-Object { $_.Extension.ToLowerInvariant() -in $supportedExtensions } |
                Sort-Object Name
        }
        elseif ([System.IO.Path]::GetExtension($resolvedPath).ToLowerInvariant() -in $supportedExtensions) {
            Get-Item -LiteralPath $resolvedPath
        }
        else {
            throw "Unsupported image type: $resolvedPath"
        }
    }

    @($files | Sort-Object FullName -Unique)
}

function ConvertTo-Slug {
    param([string]$Title)

    $normalized = $Title.Normalize([Text.NormalizationForm]::FormD)
    $characters = $normalized.ToCharArray() | Where-Object {
        [Globalization.CharUnicodeInfo]::GetUnicodeCategory($_) -ne
            [Globalization.UnicodeCategory]::NonSpacingMark
    }
    $slug = (-join $characters).ToLowerInvariant()
    $slug = $slug -replace "['\u2018\u2019]", ''
    $slug = $slug -replace '[^a-z0-9]+', '_'
    $slug.Trim('_')
}

function Read-Title {
    param([string]$FileName)

    do {
        $title = (Read-Host "Title for $FileName").Trim()
        if (-not $title) {
            Write-Warning 'Title cannot be empty.'
        }
    } until ($title)

    $title
}

function Read-Dimensions {
    param([string]$FileName)

    do {
        $value = Read-Host "Dimensions for $FileName (height x width)"
        $match = [regex]::Match(
            $value,
            '^\s*(?<height>\d+(?:\.\d+)?)\s*["' + [char]0x201D + ']?\s*(?:[xX]|\s+)\s*(?<width>\d+(?:\.\d+)?)\s*["' + [char]0x201D + ']?\s*$'
        )
        if (-not $match.Success) {
            Write-Warning 'Enter dimensions as height x width, for example 24x18 or 24 18.'
        }
    } until ($match.Success)

    @($match.Groups['height'].Value, $match.Groups['width'].Value)
}

if (-not $Path -or $Path.Count -eq 0) {
    $Path = @((Get-Location).Path)
}

$images = @(Get-ImageFiles -InputPath $Path)
if ($images.Count -eq 0) {
    throw "No supported images found. Expected: $($supportedExtensions -join ', ')"
}

$existingNumbers = @(
    Get-ChildItem -LiteralPath $sourceDirectory -Directory |
        Where-Object { $_.Name -match '^(?<number>\d+)_' } |
        ForEach-Object { [int]$Matches['number'] }
)
$highestNumber = if ($existingNumbers.Count -gt 0) {
    [int](($existingNumbers | Measure-Object -Maximum).Maximum)
}
else {
    0
}
$numberWidth = [Math]::Max(2, $highestNumber.ToString().Length)
$parsedEntries = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath | ConvertFrom-Json
$entries = @()
foreach ($entry in $parsedEntries) {
    if ($entry -and $entry.PSObject.Properties['name']) {
        $entries += $entry
    }
}
$newNames = [System.Collections.Generic.List[string]]::new()
$inchMark = [char]0x201D

foreach ($image in $images) {
    $title = Read-Title -FileName $image.Name
    $dimensions = Read-Dimensions -FileName $image.Name
    $slug = ConvertTo-Slug -Title $title
    if (-not $slug) {
        throw "Title must contain at least one letter or number: $title"
    }

    $highestNumber++
    $number = $highestNumber.ToString("D$numberWidth")
    $name = "${number}_$slug"
    $artworkDirectory = Join-Path $sourceDirectory $name
    $imageName = "$name$($image.Extension.ToLowerInvariant())"
    $relativeImagePath = "src/$name/$imageName"
    $relativeDetailsPath = "src/$name/$name.md"

    New-Item -ItemType Directory -Path $artworkDirectory | Out-Null
    Copy-Item -LiteralPath $image.FullName -Destination (Join-Path $artworkDirectory $imageName)
    @(
        $title
        "Oil on Canvas $($dimensions[0])$inchMark x $($dimensions[1])$inchMark"
        (Get-Date).Year
    ) | Set-Content -LiteralPath (Join-Path $artworkDirectory "$name.md") -Encoding UTF8

    $entries += [pscustomobject][ordered]@{
        name = $name
        image = $relativeImagePath
        thumbnail = "thumbs/${name}_thumb.jpg"
        details = $relativeDetailsPath
    }
    $newNames.Add($name)
    Write-Output "Imported $($image.Name) as $name"
}

ConvertTo-Json -InputObject ([object[]]$entries) -Depth 4 |
    Set-Content -LiteralPath $manifestPath -Encoding UTF8
& $thumbnailScript -Name $newNames.ToArray()