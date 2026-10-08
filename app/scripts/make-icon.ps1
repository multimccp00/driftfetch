# Builds the app icons from resources/driftfetch-icon.png:
#   resources/icon.ico  Windows icon (exe, installer, shortcuts), 16-256 px
#   public/icon.png     256 px, used by the window, tray and in-app logo. Committed as the D alone on a
#                       transparent background (the navy square is cut away); this script would write the square back.
# Run once after changing the source image: powershell -File scripts/make-icon.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$source = [System.Drawing.Image]::FromFile((Join-Path $root 'resources\driftfetch-icon.png'))

function Resize([int]$size) {
  $bitmap = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bitmap)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($source, 0, 0, $size, $size)
  $g.Dispose()
  $stream = New-Object System.IO.MemoryStream
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
  return ,$stream.ToArray()
}

$sizes = 16, 24, 32, 48, 64, 128, 256
$images = foreach ($size in $sizes) { ,(Resize $size) }

# ICO: header, one 16-byte directory entry per image, then the PNG data.
$out = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter $out
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $dim = if ($sizes[$i] -ge 256) { 0 } else { $sizes[$i] }
  $w.Write([byte]$dim); $w.Write([byte]$dim); $w.Write([byte]0); $w.Write([byte]0)
  $w.Write([uint16]1); $w.Write([uint16]32)
  $w.Write([uint32]$images[$i].Length); $w.Write([uint32]$offset)
  $offset += $images[$i].Length
}
foreach ($image in $images) { $w.Write($image) }
$w.Flush()
[System.IO.File]::WriteAllBytes((Join-Path $root 'resources\icon.ico'), $out.ToArray())
New-Item -ItemType Directory -Force (Join-Path $root 'public') | Out-Null
[System.IO.File]::WriteAllBytes((Join-Path $root 'public\icon.png'), $images[-1])
$source.Dispose()
Write-Output "Wrote resources/icon.ico ($($sizes -join ', ') px) and public/icon.png"
