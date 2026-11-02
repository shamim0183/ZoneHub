# Generate multi-resolution ZoneHub.ico / ZoneHubBubble.ico
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName PresentationCore, PresentationFramework, WindowsBase, System.Drawing

[System.Threading.Thread]::CurrentThread.SetApartmentState([System.Threading.ApartmentState]::STA)

$sizes = @(256, 128, 64, 48, 32, 16)
$pngFrames = [System.Collections.Generic.List[byte[]]]::new()

foreach ($sz in $sizes) {
    $scale = $sz / 256.0
    $dv = New-Object System.Windows.Media.DrawingVisual
    $dc = $dv.RenderOpen()

    $transform = New-Object System.Windows.Media.ScaleTransform($scale, $scale)
    $dc.PushTransform($transform)

    # Gradient squircle/circle
    $grad = New-Object System.Windows.Media.LinearGradientBrush
    $grad.StartPoint = New-Object System.Windows.Point(0, 0)
    $grad.EndPoint = New-Object System.Windows.Point(1, 1)
    $grad.GradientStops.Add((New-Object System.Windows.Media.GradientStop([System.Windows.Media.Color]::FromRgb(67, 56, 202), 0.0)))
    $grad.GradientStops.Add((New-Object System.Windows.Media.GradientStop([System.Windows.Media.Color]::FromRgb(6, 182, 212), 1.0)))

    $dc.DrawRoundedRectangle($grad, $null, (New-Object System.Windows.Rect(8, 8, 240, 240)), 120, 120)

    # Outer border highlight
    $penBorder = New-Object System.Windows.Media.Pen(
        (New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromArgb(110, 255, 255, 255))), 3.5
    )
    $dc.DrawRoundedRectangle($null, $penBorder, (New-Object System.Windows.Rect(8, 8, 240, 240)), 120, 120)

    # Orbits
    $penOrbitOuter = New-Object System.Windows.Media.Pen(
        (New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromArgb(90, 255, 255, 255))), 5
    )
    $penOrbitOuter.DashStyle = [System.Windows.Media.DashStyles]::Dash
    $dc.DrawEllipse($null, $penOrbitOuter, (New-Object System.Windows.Point(128, 128)), 86, 86)

    $penOrbitInner = New-Object System.Windows.Media.Pen(
        (New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromArgb(115, 255, 255, 255))), 5
    )
    $dc.DrawEllipse($null, $penOrbitInner, (New-Object System.Windows.Point(128, 128)), 54, 54)

    # Network Beams (Lines)
    $penLine = New-Object System.Windows.Media.Pen([System.Windows.Media.Brushes]::White, 8)
    $penLine.StartLineCap = [System.Windows.Media.PenLineCap]::Round
    $penLine.EndLineCap = [System.Windows.Media.PenLineCap]::Round

    $pTop = New-Object System.Windows.Point(128, 70)
    $pLeft = New-Object System.Windows.Point(82, 162)
    $pRight = New-Object System.Windows.Point(174, 162)

    $dc.DrawLine($penLine, $pTop, $pLeft)
    $dc.DrawLine($penLine, $pTop, $pRight)
    $dc.DrawLine($penLine, $pLeft, $pRight)

    # Nodes
    $dc.DrawEllipse([System.Windows.Media.Brushes]::White, $null, (New-Object System.Windows.Point(128, 132)), 11, 11)

    # Top Node (Host)
    $dc.DrawEllipse([System.Windows.Media.Brushes]::White, $null, $pTop, 20, 20)
    $dc.DrawEllipse((New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromRgb(79, 70, 229))), $null, $pTop, 12, 12)

    # Left Node (Cyan)
    $dc.DrawEllipse([System.Windows.Media.Brushes]::White, $null, $pLeft, 18, 18)
    $dc.DrawEllipse((New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromRgb(6, 182, 212))), $null, $pLeft, 11, 11)

    # Right Node (Emerald)
    $dc.DrawEllipse([System.Windows.Media.Brushes]::White, $null, $pRight, 18, 18)
    $dc.DrawEllipse((New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromRgb(16, 185, 129))), $null, $pRight, 11, 11)

    # Online Pulse Dot (Green bottom right)
    $pGreen = New-Object System.Windows.Point(204, 204)
    $dc.DrawEllipse((New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromRgb(11, 15, 25))), $null, $pGreen, 26, 26)
    $dc.DrawEllipse((New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromRgb(34, 197, 94))), $null, $pGreen, 20, 20)

    $dc.Pop()
    $dc.Close()

    $rtb = New-Object System.Windows.Media.Imaging.RenderTargetBitmap($sz, $sz, 96, 96, [System.Windows.Media.PixelFormats]::Pbgra32)
    $rtb.Render($dv)

    $encoder = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
    $encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($rtb))
    $ms = New-Object System.IO.MemoryStream
    $encoder.Save($ms)
    $pngFrames.Add($ms.ToArray())
    $ms.Close()
}

function Save-IcoFile([string]$outputPath, $frames, $frameSizes) {
    $fs = [System.IO.File]::OpenWrite($outputPath)
    $bw = New-Object System.IO.BinaryWriter($fs)

    # ICONDIR
    $bw.Write([uint16]0) # Reserved
    $bw.Write([uint16]1) # Type: 1 = Icon
    $bw.Write([uint16]$frames.Count) # Count

    $offset = 6 + (16 * $frames.Count)

    for ($i = 0; $i -lt $frames.Count; $i++) {
        $data = $frames[$i]
        $sz = $frameSizes[$i]
        $w = if ($sz -ge 256) { [byte]0 } else { [byte]$sz }
        $h = if ($sz -ge 256) { [byte]0 } else { [byte]$sz }

        $bw.Write($w)               # Width
        $bw.Write($h)               # Height
        $bw.Write([byte]0)          # ColorCount
        $bw.Write([byte]0)          # Reserved
        $bw.Write([uint16]1)        # Planes
        $bw.Write([uint16]32)       # BitCount
        $bw.Write([uint32]$data.Length) # BytesInRes
        $bw.Write([uint32]$offset)  # ImageOffset

        $offset += $data.Length
    }

    foreach ($data in $frames) {
        $bw.Write($data)
    }

    $bw.Close()
    $fs.Close()
}

$targetIco = Join-Path $PSScriptRoot "..\ZoneHubBubble.ico"
$targetIco = [System.IO.Path]::GetFullPath($targetIco)
Save-IcoFile $targetIco $pngFrames $sizes

Write-Host "Generated ICO: $targetIco" -ForegroundColor Green

