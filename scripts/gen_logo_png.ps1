Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

function New-VibeIconBitmap {
    param([int]$size = 1024)
    
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    
    # Background rounded rect
    $r = $size * 0.22  # border radius
    $margin = $size * 0.02
    $rect = New-Object System.Drawing.RectangleF($margin, $margin, $size - 2*$margin, $size - 2*$margin)
    
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(108, 99, 255)) # #6C63FF
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($rect.X, $rect.Y, $r*2, $r*2, 180, 90)
    $path.AddArc($rect.Right - $r*2, $rect.Y, $r*2, $r*2, 270, 90)
    $path.AddArc($rect.Right - $r*2, $rect.Bottom - $r*2, $r*2, $r*2, 0, 90)
    $path.AddArc($rect.X, $rect.Bottom - $r*2, $r*2, $r*2, 90, 90)
    $path.CloseFigure()
    $g.FillPath($bgBrush, $path)
    
    # V letter
    $penWidth = $size * 0.025
    $whitePen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, $penWidth)
    $whitePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $whitePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $whitePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    
    $cx = $size / 2
    $cy = $size / 2
    $w = $size * 0.58
    
    $p1 = New-Object System.Drawing.PointF($cx - $w/2, $cy + $w/2.8)
    $p2 = New-Object System.Drawing.PointF($cx, $cy - $w/2.8)
    $p3 = New-Object System.Drawing.PointF($cx + $w/2, $cy + $w/2.8)
    $p4 = New-Object System.Drawing.PointF($cx, $cy + $w/5.6)
    
    $pts = @($p1, $p2, $p3, $p4)
    $g.DrawPolygon($whitePen, $pts)
    
    # Fill the V
    $fillBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.FillPolygon($fillBrush, @($p1, $p2, $p3, $p4))
    
    $fillBrush.Dispose()
    $whitePen.Dispose()
    $bgBrush.Dispose()
    $path.Dispose()
    $g.Dispose()
    
    return $bmp
}

$base = "C:\Users\viraj\Downloads\desktop-dev\desktop-dev"
$big = New-VibeIconBitmap -size 1024
$big.Save("$base\docs\assets\vibe-logo.png", [System.Drawing.Imaging.ImageFormat]::Png)
$big.Dispose()
Write-Output "Created high-res logo PNG"

# Now regenerate all size variants
$srcLogo = "$base\docs\assets\vibe-logo.png"
$sourceImg = [System.Drawing.Image]::FromFile($srcLogo)

$sizes = @(16, 22, 24, 32, 48, 64, 70, 128, 150, 256, 512, 1024)
foreach ($brand in @("release", "twilight")) {
    $brandPath = "$base\configs\branding\$brand"
    foreach ($size in $sizes) {
        $bmp = New-Object System.Drawing.Bitmap($size, $size)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.DrawImage($sourceImg, 0, 0, $size, $size)
        $g.Dispose()
        
        if ($size -eq 70) {
            $bmp.Save("$brandPath\VisualElements_70.png", [System.Drawing.Imaging.ImageFormat]::Png)
            $bmp.Save("$brandPath\PrivateBrowsing_70.png", [System.Drawing.Imaging.ImageFormat]::Png)
        } elseif ($size -eq 150) {
            $bmp.Save("$brandPath\VisualElements_150.png", [System.Drawing.Imaging.ImageFormat]::Png)
            $bmp.Save("$brandPath\PrivateBrowsing_150.png", [System.Drawing.Imaging.ImageFormat]::Png)
        } else {
            $bmp.Save("$brandPath\logo${size}.png", [System.Drawing.Imaging.ImageFormat]::Png)
        }
        if ($size -eq 1024) {
            $bmp.Save("$brandPath\logo-mac.png", [System.Drawing.Imaging.ImageFormat]::Png)
        }
        $bmp.Dispose()
    }
}
$sourceImg.Dispose()
Write-Output "All branding PNGs regenerated!"

# Also create logo.png (default 512)
$img512 = [System.Drawing.Image]::FromFile($srcLogo)
$bmp = New-Object System.Drawing.Bitmap(512, 512)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($img512, 0, 0, 512, 512)
$g.Dispose()
foreach ($brand in @("release", "twilight")) {
    $bmp.Save("$base\configs\branding\$brand\logo.png", [System.Drawing.Imaging.ImageFormat]::Png)
}
$bmp.Dispose()
$img512.Dispose()
Write-Output "logo.png created!"
