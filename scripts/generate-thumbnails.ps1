$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root 'artworks.json'
$thumbnailDirectory = Join-Path $root 'thumbs'
$entries = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json

foreach ($entry in $entries) {
    $expectedThumbnail = "thumbs/$($entry.name)_thumb.jpg"
    if (
        [string]::IsNullOrWhiteSpace($entry.name) -or
        [string]::IsNullOrWhiteSpace($entry.image) -or
        -not $entry.image.StartsWith('src/') -or
        $entry.thumbnail -ne $expectedThumbnail
    ) {
        throw 'artworks.json entries must use src images and matching thumbs/<name>_thumb.jpg paths.'
    }

    $source = Join-Path $root $entry.image
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Source image not found: $($entry.image)"
    }
}

New-Item -ItemType Directory -Path $thumbnailDirectory -Force | Out-Null
Get-ChildItem -LiteralPath $thumbnailDirectory -File | Remove-Item -Force

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object MimeType -eq 'image/jpeg' |
    Select-Object -First 1
$encoderParameters = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
    [System.Drawing.Imaging.Encoder]::Quality,
    [long]82
)

try {
    foreach ($entry in $entries) {
        $source = Join-Path $root $entry.image
        $destination = Join-Path $root $entry.thumbnail
        $sourceImage = [System.Drawing.Image]::FromFile($source)

        try {
            if ($sourceImage.PropertyIdList -contains 0x0112) {
                $orientation = $sourceImage.GetPropertyItem(0x0112).Value[0]
                $rotation = switch ($orientation) {
                    2 { [System.Drawing.RotateFlipType]::RotateNoneFlipX }
                    3 { [System.Drawing.RotateFlipType]::Rotate180FlipNone }
                    4 { [System.Drawing.RotateFlipType]::Rotate180FlipX }
                    5 { [System.Drawing.RotateFlipType]::Rotate90FlipX }
                    6 { [System.Drawing.RotateFlipType]::Rotate90FlipNone }
                    7 { [System.Drawing.RotateFlipType]::Rotate270FlipX }
                    8 { [System.Drawing.RotateFlipType]::Rotate270FlipNone }
                    default { [System.Drawing.RotateFlipType]::RotateNoneFlipNone }
                }
                $sourceImage.RotateFlip($rotation)
            }

            $cropSize = [Math]::Min($sourceImage.Width, $sourceImage.Height)
            $targetSize = [Math]::Min(720, $cropSize)
            $cropX = [Math]::Floor(($sourceImage.Width - $cropSize) / 2)
            $cropY = [Math]::Floor(($sourceImage.Height - $cropSize) / 2)
            $thumbnail = New-Object System.Drawing.Bitmap(
                $targetSize,
                $targetSize,
                [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
            )

            try {
                $graphics = [System.Drawing.Graphics]::FromImage($thumbnail)
                try {
                    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
                    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                    $graphics.DrawImage(
                        $sourceImage,
                        [System.Drawing.Rectangle]::new(0, 0, $targetSize, $targetSize),
                        $cropX,
                        $cropY,
                        $cropSize,
                        $cropSize,
                        [System.Drawing.GraphicsUnit]::Pixel
                    )
                }
                finally {
                    $graphics.Dispose()
                }

                $thumbnail.Save($destination, $jpegCodec, $encoderParameters)
            }
            finally {
                $thumbnail.Dispose()
            }
        }
        finally {
            $sourceImage.Dispose()
        }

        $size = (Get-Item -LiteralPath $destination).Length / 1KB
        Write-Output ('{0}: {1:N1} KB' -f $entry.name, $size)
    }
}
finally {
    $encoderParameters.Dispose()
}
