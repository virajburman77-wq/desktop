Add-Type -AssemblyName System.Drawing

$source = "C:\Users\viraj\Downloads\desktop-dev\desktop-dev\docs\assets\vibe-logo.png"
$baseDir = "C:\Users\viraj\Downloads\desktop-dev\desktop-dev"

$sizes = @(16, 22, 24, 32, 48, 64, 70, 128, 150, 256, 512, 1024)
$brandDirs = @("release", "twilight")

foreach ($brand in $brandDirs) {
    $brandPath = "$baseDir\configs\branding\$brand"
    
    foreach ($size in $sizes) {
        $img = [System.Drawing.Image]::FromFile($source)
        $bitmap = New-Object System.Drawing.Bitmap($size, $size)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.DrawImage($img, 0, 0, $size, $size)
        $graphics.Dispose()
        
        if ($size -eq 70) {
            $bitmap.Save("$brandPath\VisualElements_70.png", [System.Drawing.Imaging.ImageFormat]::Png)
            $bitmap.Save("$brandPath\PrivateBrowsing_70.png", [System.Drawing.Imaging.ImageFormat]::Png)
        } elseif ($size -eq 150) {
            $bitmap.Save("$brandPath\VisualElements_150.png", [System.Drawing.Imaging.ImageFormat]::Png)
            $bitmap.Save("$brandPath\PrivateBrowsing_150.png", [System.Drawing.Imaging.ImageFormat]::Png)
        } else {
            $bitmap.Save("$brandPath\logo${size}.png", [System.Drawing.Imaging.ImageFormat]::Png)
        }
        
        if ($size -eq 1024) {
            $bitmap.Save("$brandPath\logo-mac.png", [System.Drawing.Imaging.ImageFormat]::Png)
        }
        
        $bitmap.Dispose()
    }
    
    # logo.png (512 default)
    $img512 = [System.Drawing.Image]::FromFile($source)
    $bmp512 = New-Object System.Drawing.Bitmap(512, 512)
    $g512 = [System.Drawing.Graphics]::FromImage($bmp512)
    $g512.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g512.DrawImage($img512, 0, 0, 512, 512)
    $g512.Dispose()
    $bmp512.Save("$brandPath\logo.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp512.Dispose()
    $img512.Dispose()
}

Write-Output "Logo resizing complete!"
