param(
  [string]$OutputDirectory = 'src/about/eyes'
)

Add-Type -AssemblyName System.Drawing

$sourcePath = Join-Path $PSScriptRoot '..\src\about\header.jpg'
$source = [System.Drawing.Bitmap]::new((Resolve-Path $sourcePath).Path)
$tileSize = 224
$irisRadiusX = 21
$irisRadiusY = 18
$healRadiusX = 21
$healRadiusY = 18
$irisPatchSize = 48
$irisPatchCenterX = 24
$irisPatchCenterY = 24
$eyes = @(
  @{ Name = 'left'; X = 940; Y = 780; HorizontalOffsets = @(-34, -26, -17, -8, 0) },
  @{ Name = 'right'; X = 1112; Y = 780; HorizontalOffsets = @(-32, -24, -14, -7, 0) }
)
$axis = @(-1, -0.5, 0, 0.5, 1)

function Get-AxisName([double]$value, [string]$negative, [string]$positive) {
  if ($value -eq 0) { return 'center' }
  $strength = if ([Math]::Abs($value) -eq 1) { 'full' } else { 'half' }
  $direction = if ($value -lt 0) { $negative } else { $positive }
  return "$direction-$strength"
}

function New-HealedEyeBase(
  [System.Drawing.Bitmap]$image,
  [int]$centerX,
  [int]$centerY,
  [int]$radiusX,
  [int]$radiusY
) {
  $healed = $image.Clone()
  $width = 2 * $radiusX + 3
  $height = 2 * $radiusY + 3
  $originX = $centerX - $radiusX - 1
  $originY = $centerY - $radiusY - 1
  $red = [double[][]]::new($width)
  $green = [double[][]]::new($width)
  $blue = [double[][]]::new($width)
  $mask = [bool[][]]::new($width)

  for ($x = 0; $x -lt $width; $x++) {
    $red[$x] = [double[]]::new($height)
    $green[$x] = [double[]]::new($height)
    $blue[$x] = [double[]]::new($height)
    $mask[$x] = [bool[]]::new($height)
    for ($y = 0; $y -lt $height; $y++) {
      $color = $image.GetPixel($originX + $x, $originY + $y)
      $red[$x][$y] = $color.R
      $green[$x][$y] = $color.G
      $blue[$x][$y] = $color.B
      $offsetX = $x - $radiusX - 1
      $offsetY = $y - $radiusY - 1
      $mask[$x][$y] = ($offsetX * $offsetX / ($radiusX * $radiusX)) + ($offsetY * $offsetY / ($radiusY * $radiusY)) -le 1
    }
  }

  for ($iteration = 0; $iteration -lt 100; $iteration++) {
    for ($x = 1; $x -lt ($width - 1); $x++) {
      for ($y = 1; $y -lt ($height - 1); $y++) {
        if (-not $mask[$x][$y]) { continue }
        $red[$x][$y] = ($red[$x - 1][$y] + $red[$x + 1][$y] + $red[$x][$y - 1] + $red[$x][$y + 1]) / 4
        $green[$x][$y] = ($green[$x - 1][$y] + $green[$x + 1][$y] + $green[$x][$y - 1] + $green[$x][$y + 1]) / 4
        $blue[$x][$y] = ($blue[$x - 1][$y] + $blue[$x + 1][$y] + $blue[$x][$y - 1] + $blue[$x][$y + 1]) / 4
      }
    }
  }

  for ($x = 1; $x -lt ($width - 1); $x++) {
    for ($y = 1; $y -lt ($height - 1); $y++) {
      if (-not $mask[$x][$y]) { continue }
      $healed.SetPixel($originX + $x, $originY + $y, [System.Drawing.Color]::FromArgb(
        [int][Math]::Round($red[$x][$y]),
        [int][Math]::Round($green[$x][$y]),
        [int][Math]::Round($blue[$x][$y])
      ))
    }
  }

  return $healed
}

try {
  foreach ($eye in $eyes) {
    $eyeDirectory = Join-Path $OutputDirectory $eye.Name
    New-Item -ItemType Directory -Path $eyeDirectory -Force | Out-Null

    $cropX = $eye.X - [int]($tileSize / 2)
    $cropY = $eye.Y - [int]($tileSize / 2)
    $cropRectangle = [System.Drawing.Rectangle]::new($cropX, $cropY, $tileSize, $tileSize)
    $sourceCrop = $source.Clone($cropRectangle, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $localCenterX = $eye.X - $cropX
    $localCenterY = $eye.Y - $cropY
    $healedCrop = New-HealedEyeBase $sourceCrop $localCenterX $localCenterY $healRadiusX $healRadiusY

    $patch = [System.Drawing.Bitmap]::new($irisPatchSize, $irisPatchSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    for ($y = 0; $y -lt $irisPatchSize; $y++) {
      for ($x = 0; $x -lt $irisPatchSize; $x++) {
        $sourceX = $eye.X + $x - $irisPatchCenterX
        $sourceY = $eye.Y + $y - $irisPatchCenterY
        $normalizedX = ($x - $irisPatchCenterX) / $irisRadiusX
        $normalizedY = ($y - $irisPatchCenterY) / $irisRadiusY
        $distance = [Math]::Sqrt($normalizedX * $normalizedX + $normalizedY * $normalizedY)
        $alpha = [Math]::Min(255, [Math]::Max(0, [int]((1.08 - $distance) * 320)))
        $color = $source.GetPixel($sourceX, $sourceY)
        $patch.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, $color.R, $color.G, $color.B))
      }
    }

    foreach ($vertical in $axis) {
      $horizontalIndex = 0
      foreach ($horizontal in $axis) {
        $gazeX = $eye.HorizontalOffsets[$horizontalIndex]
        $output = if ($gazeX -eq 0 -and $vertical -eq 0) { $sourceCrop.Clone() } else { $healedCrop.Clone() }
        $localGraphics = [System.Drawing.Graphics]::FromImage($output)
        $localGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None

        $gazeY = [int][Math]::Round($vertical * 5)
        $localGraphics.DrawImageUnscaled($patch, $localCenterX + $gazeX - $irisPatchCenterX, $localCenterY + $gazeY - $irisPatchCenterY)
        $localGraphics.Dispose()

        $horizontalName = Get-AxisName $horizontal 'left' 'right'
        $verticalName = Get-AxisName $vertical 'up' 'down'
        $fileName = if ($horizontal -eq 0 -and $vertical -eq 0) { 'center.png' }
          elseif ($horizontal -eq 0) { "$verticalName.png" }
          elseif ($vertical -eq 0) { "$horizontalName.png" }
          else { "$verticalName-$horizontalName.png" }
        $output.Save((Join-Path $eyeDirectory $fileName), [System.Drawing.Imaging.ImageFormat]::Png)
        $output.Dispose()
        $horizontalIndex++
      }
    }

    $patch.Dispose()
    $healedCrop.Dispose()
    $sourceCrop.Dispose()
  }

  $manifest = @{
    image = 'src/about/header.jpg'
    tileSize = $tileSize
    gazeGrid = @($axis | ForEach-Object { $_ })
    horizontalOffsetsPixels = @{
      leftEye = @(-34, -26, -17, -8, 0)
      rightEye = @(-32, -24, -14, -7, 0)
    }
    verticalOffsetsPixels = 5
    eyes = @('left', 'right')
    baseImageGaze = 'right-full'
    forwardGaze = 'center'
    nearFocus = @{ leftEye = 'right-full'; rightEye = 'left-full' }
    depth = 'The source eyes already look fully screen-right. Project each eye independently: converge inward for nearby targets and use parallel offsets for distant targets.'
  } | ConvertTo-Json -Depth 4
  Set-Content -Path (Join-Path $OutputDirectory 'manifest.json') -Value $manifest -Encoding UTF8
}
finally {
  $source.Dispose()
}