Add-Type -AssemblyName System.Drawing

$outputPath = Join-Path $PSScriptRoot 'high-school-math-test.png'
$bitmap = New-Object System.Drawing.Bitmap 1600, 2200
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.Clear([System.Drawing.Color]::White)

$black = [System.Drawing.Brushes]::Black
$gray = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(70, 70, 70))
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::Black), 3
$thinPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::Gray), 1
$titleFont = New-Object System.Drawing.Font 'Yu Gothic', 34, ([System.Drawing.FontStyle]::Bold)
$headingFont = New-Object System.Drawing.Font 'Yu Gothic', 24, ([System.Drawing.FontStyle]::Bold)
$bodyFont = New-Object System.Drawing.Font 'Yu Gothic', 24
$smallFont = New-Object System.Drawing.Font 'Yu Gothic', 18

$graphics.DrawString('2026年度 高校1年 数学I 1学期中間テスト', $titleFont, $black, 180, 90)
$graphics.DrawString('制限時間 50分   総配点 30点', $headingFont, $black, 430, 165)
$graphics.DrawLine($pen, 100, 230, 1500, 230)

$graphics.DrawString('第1問  次の式を展開し、整理しなさい。                         [5点]', $headingFont, $black, 120, 300)
$graphics.DrawString('(1)  (2x - 3)(x + 4)', $bodyFont, $black, 170, 380)
$graphics.DrawLine($thinPen, 170, 500, 1430, 500)

$graphics.DrawString('第2問  二次関数について、問いに答えなさい。                 [10点]', $headingFont, $black, 120, 590)
$graphics.DrawString('y = x² - 4x + 3 の頂点と軸を求め、グラフをかきなさい。', $bodyFont, $black, 170, 670)
$graphics.DrawRectangle($thinPen, 260, 760, 1080, 350)
$graphics.DrawLine($thinPen, 800, 780, 800, 1090)
$graphics.DrawLine($thinPen, 280, 935, 1320, 935)

$graphics.DrawString('第3問  △ABCについて、余弦定理を用いて辺aを求めなさい。     [10点]', $headingFont, $black, 120, 1190)
$graphics.DrawString('b = 5,  c = 7,  A = 60°', $bodyFont, $black, 170, 1270)
$points = [System.Drawing.Point[]]@(
    (New-Object System.Drawing.Point 500,1540),
    (New-Object System.Drawing.Point 850,1360),
    (New-Object System.Drawing.Point 1120,1540)
)
$graphics.DrawPolygon($pen, $points)
$graphics.DrawString('A', $smallFont, $black, 820, 1315)
$graphics.DrawString('B', $smallFont, $black, 455, 1540)
$graphics.DrawString('C', $smallFont, $black, 1130, 1540)
$graphics.DrawString('c = 7', $smallFont, $gray, 600, 1400)
$graphics.DrawString('b = 5', $smallFont, $gray, 970, 1400)

$graphics.DrawString('第4問  次のデータの平均値と中央値を求めなさい。             [5点]', $headingFont, $black, 120, 1700)
$graphics.DrawString('2,  4,  4,  6,  9', $bodyFont, $black, 170, 1780)
$graphics.DrawLine($thinPen, 170, 1900, 1430, 1900)
$graphics.DrawString('※ 答えだけでなく、途中の計算も記入すること。', $smallFont, $gray, 120, 2010)

$bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$smallFont.Dispose(); $bodyFont.Dispose(); $headingFont.Dispose(); $titleFont.Dispose()
$thinPen.Dispose(); $pen.Dispose(); $gray.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
Write-Output $outputPath
