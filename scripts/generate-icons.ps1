Add-Type -AssemblyName System.Drawing

$sourcePath = Join-Path $PSScriptRoot "..\public\icon.png"
if (-not (Test-Path $sourcePath)) {
    Write-Error "Source icon not found at $sourcePath"
    exit 1
}

$srcImg = [System.Drawing.Image]::FromFile($sourcePath)

$densities = @(
    @{ Name = "mipmap-mdpi"; Size = 48 },
    @{ Name = "mipmap-hdpi"; Size = 72 },
    @{ Name = "mipmap-xhdpi"; Size = 96 },
    @{ Name = "mipmap-xxhdpi"; Size = 144 },
    @{ Name = "mipmap-xxxhdpi"; Size = 192 }
)

$resDir = Join-Path $PSScriptRoot "..\android\app\src\main\res"

foreach ($d in $densities) {
    $dir = Join-Path $resDir $d.Name
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    $size = $d.Size
    $destBitmap = New-Object System.Drawing.Bitmap $size, $size
    $graphics = [System.Drawing.Graphics]::FromImage($destBitmap)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.DrawImage($srcImg, 0, 0, $size, $size)
    $graphics.Dispose()

    # Save ic_launcher.png
    $targetLauncher = Join-Path $dir "ic_launcher.png"
    $destBitmap.Save($targetLauncher, [System.Drawing.Imaging.ImageFormat]::Png)

    # Save ic_launcher_round.png
    $targetRound = Join-Path $dir "ic_launcher_round.png"
    $destBitmap.Save($targetRound, [System.Drawing.Imaging.ImageFormat]::Png)

    # Save ic_launcher_foreground.png
    $targetForeground = Join-Path $dir "ic_launcher_foreground.png"
    $destBitmap.Save($targetForeground, [System.Drawing.Imaging.ImageFormat]::Png)

    $destBitmap.Dispose()
    Write-Output "Generated Android icons for $($d.Name) ($($size)x$($size))"
}

$srcImg.Dispose()
Write-Output "All Android app icons updated successfully!"
