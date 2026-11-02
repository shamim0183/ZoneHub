# ZoneHub Master Setup & Installation Wizard
$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$baseDir = Split-Path -Parent $PSScriptRoot
if (-not $baseDir) { $baseDir = (Get-Location).Path }
$configPath = Join-Path $baseDir "hub_config.json"
$iconPath = Join-Path $baseDir "ZoneHubBubble.ico"

Clear-Host
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "         ZoneHub - Master 1-Click Setup & Installer              " -ForegroundColor Yellow
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""

# Detect all Fixed ready drives
$drives = [System.IO.DriveInfo]::GetDrives() | Where-Object { $_.IsReady -and $_.DriveType -eq 'Fixed' }
$bestDrive = $null
$maxFree = 0

foreach ($d in $drives) {
    if ($d.AvailableFreeSpace -gt $maxFree) {
        $maxFree = $d.AvailableFreeSpace
        $bestDrive = $d
    }
}

# If D: exists, prefer D: over C: (system drive) if D: has decent space (>10GB)
$driveD = $drives | Where-Object { $_.Name.StartsWith("D:", [System.StringComparison]::OrdinalIgnoreCase) }
if ($driveD -and $driveD.AvailableFreeSpace -gt 10GB) {
    $recommendedDrive = $driveD
} elseif ($bestDrive) {
    $recommendedDrive = $bestDrive
} else {
    $recommendedDrive = $drives[0]
}

$recFreeGB = [math]::Round($recommendedDrive.AvailableFreeSpace / 1GB, 1)
$recTotalGB = [math]::Round($recommendedDrive.TotalSize / 1GB, 1)
$recLabel = if ($recommendedDrive.VolumeLabel) { "($($recommendedDrive.VolumeLabel))" } else { "" }
$recFolder = Join-Path $recommendedDrive.Name "ZoneHub_Storage"

Write-Host "Detected Optimal Storage Drive:" -ForegroundColor Gray
Write-Host "  -> Drive $($recommendedDrive.Name) $($recLabel) - $recFreeGB GB Free of $recTotalGB GB" -ForegroundColor Green
Write-Host "     Target Folder: $recFolder" -ForegroundColor Gray
Write-Host ""

Write-Host "Choose Setup Option:" -ForegroundColor Yellow
Write-Host "  [1] Express Automatic Setup (Recommended)" -ForegroundColor White
Write-Host "      * Storage on $($recommendedDrive.Name) ($recFreeGB GB Free)" -ForegroundColor Gray
Write-Host "      * Auto-starts on PC Boot (Background service)" -ForegroundColor Gray
Write-Host "      * Floating Desktop Bubble enabled" -ForegroundColor Gray
Write-Host "      * Automatically opens ZoneHub in browser" -ForegroundColor Gray
Write-Host ""
Write-Host "  [2] Custom Setup (Choose specific drive or folder)" -ForegroundColor White
Write-Host "  [3] Exit Setup" -ForegroundColor White
Write-Host ""
Write-Host "------------------------------------------------------------------" -ForegroundColor Cyan

$choice = Read-Host "Select option [1, 2, or 3] (Press Enter for 1)"
if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "1" }

$finalStorageFolder = $recFolder
$enableAutoStart = $true
$enableBubble = $true

if ($choice -eq "3") {
    Write-Host "Setup cancelled. No changes were made." -ForegroundColor Yellow
    return
} elseif ($choice -eq "2") {
    Clear-Host
    Write-Host "==================================================================" -ForegroundColor Cyan
    Write-Host "                    Custom Storage Selection                      " -ForegroundColor Yellow
    Write-Host "==================================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Available PC Drives:" -ForegroundColor Yellow
    
    $driveOpts = @()
    $idx = 1
    foreach ($d in $drives) {
        $fGB = [math]::Round($d.AvailableFreeSpace / 1GB, 1)
        $tGB = [math]::Round($d.TotalSize / 1GB, 1)
        $lbl = if ($d.VolumeLabel) { "($($d.VolumeLabel))" } else { "" }
        $tPath = Join-Path $d.Name "ZoneHub_Storage"
        Write-Host "  [$idx] Drive $($d.Name) $lbl - $fGB GB Free of $tGB GB" -ForegroundColor White
        Write-Host "        Target: $tPath" -ForegroundColor Gray
        $driveOpts += [PSCustomObject]@{ Index = $idx; Path = $tPath; Type = "drive" }
        $idx++
    }
    
    Write-Host "  [$idx] ZoneHub App Folder (Default: $baseDir)" -ForegroundColor White
    $driveOpts += [PSCustomObject]@{ Index = $idx; Path = $baseDir; Type = "app" }
    $idx++

    Write-Host "  [$idx] Custom Path (Enter any folder)" -ForegroundColor White
    Write-Host ""
    $drvChoice = Read-Host "Select drive [1-$idx] (Press Enter for 1)"
    if ([string]::IsNullOrWhiteSpace($drvChoice)) { $drvChoice = "1" }

    $num = 0
    if ([int]::TryParse($drvChoice, [ref]$num)) {
        if ($num -eq $idx) {
            $customPath = Read-Host "Enter full path (e.g. D:\MyOfficeShare)"
            if (-not [string]::IsNullOrWhiteSpace($customPath)) {
                $finalStorageFolder = $customPath.Trim()
            }
        } else {
            $matched = $driveOpts | Where-Object { $_.Index -eq $num }
            if ($matched) { $finalStorageFolder = $matched.Path }
        }
    }

    Write-Host ""
    $autoBootInput = Read-Host "Enable automatic start on PC boot? (Y/N) [Default: Y]"
    if ($autoBootInput -and $autoBootInput.Trim().ToUpper() -eq "N") {
        $enableAutoStart = $false
    }
}

# Execute Setup
Write-Host ""
Write-Host "Applying configuration..." -ForegroundColor Cyan

# 1. Ensure Storage Directory exists and test write access
try {
    if (-not (Test-Path $finalStorageFolder)) {
        New-Item -ItemType Directory -Path $finalStorageFolder -Force | Out-Null
    }
    $testFile = Join-Path $finalStorageFolder ".zonehub_test_write"
    [System.IO.File]::WriteAllText($testFile, "test")
    Remove-Item $testFile -Force
    Write-Host "  [OK] Storage directory ready: $finalStorageFolder" -ForegroundColor Green
} catch {
    Write-Host "  [WARN] Could not create $finalStorageFolder, using App directory fallback." -ForegroundColor Yellow
    $finalStorageFolder = $baseDir
}

# 2. Update hub_config.json
try {
    $cfg = @{}
    if (Test-Path $configPath) {
        $raw = Get-Content $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach ($prop in $raw.PSObject.Properties) {
            $cfg[$prop.Name] = $prop.Value
        }
    }
    $cfg["storageDir"] = $finalStorageFolder
    $cfg["updatedAt"] = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $newJson = $cfg | ConvertTo-Json -Compress
    [System.IO.File]::WriteAllText($configPath, $newJson, [System.Text.Encoding]::UTF8)
    Write-Host "  [OK] Saved configuration in hub_config.json" -ForegroundColor Green
} catch {
    Write-Host "  [WARN] Failed to write config: $_" -ForegroundColor Yellow
}

# 3. Create Windows Startup Shortcut if enabled
if ($enableAutoStart) {
    try {
        $wsPath = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\ZoneHub-Service.lnk"
        $vbsPath = Join-Path $baseDir "Run-Background-Service.vbs"
        
        $WshShell = New-Object -ComObject WScript.Shell
        $Shortcut = $WshShell.CreateShortcut($wsPath)
        $Shortcut.TargetPath = "wscript.exe"
        $Shortcut.Arguments = "`"$vbsPath`""
        $Shortcut.WorkingDirectory = $baseDir
        
        if (Test-Path $iconPath) {
            $Shortcut.IconLocation = "$iconPath,0"
        } elseif (Test-Path (Join-Path $baseDir "ZoneHubBubble.exe")) {
            $Shortcut.IconLocation = (Join-Path $baseDir "ZoneHubBubble.exe") + ",0"
        }
        $Shortcut.Save()
        Write-Host "  [OK] Windows Startup shortcut created (Auto-Start on Boot)" -ForegroundColor Green
    } catch {
        Write-Host "  [WARN] Failed to create startup shortcut: $_" -ForegroundColor Yellow
    }
}

# 4. Create Desktop Shortcut for easy access
try {
    $desktopDir = [Environment]::GetFolderPath("Desktop")
    if (Test-Path $desktopDir) {
        $deskLnk = Join-Path $desktopDir "ZoneHub.lnk"
        $WshShell = New-Object -ComObject WScript.Shell
        $deskShortcut = $WshShell.CreateShortcut($deskLnk)
        $deskShortcut.TargetPath = "http://localhost:8080"
        if (Test-Path $iconPath) {
            $deskShortcut.IconLocation = "$iconPath,0"
        }
        $deskShortcut.Save()
        Write-Host "  [OK] Desktop shortcut created" -ForegroundColor Green
    }
} catch {}

# 5. Launch Service
Write-Host "  Starting ZoneHub background service..." -ForegroundColor Cyan
$vbs = Join-Path $baseDir "Run-Background-Service.vbs"
Start-Process "wscript.exe" -ArgumentList "`"$vbs`""

Start-Sleep -Seconds 2

# Open browser
Start-Process "http://localhost:8080"

# Detect IP for display
$localIp = "localhost"
try {
    $ipObj = Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi*", "Ethernet*" | Where-Object { $_.IPAddress -notmatch "^169\.254" -and $_.IPAddress -ne "127.0.0.1" } | Select-Object -First 1
    if ($ipObj) { $localIp = $ipObj.IPAddress }
} catch {}

Clear-Host
Write-Host "==================================================================" -ForegroundColor Green
Write-Host "     [SUCCESS] ZoneHub is Fully Installed & Running Live!        " -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Access Links:" -ForegroundColor Yellow
Write-Host "    * Localhost (This PC):    http://localhost:8080" -ForegroundColor White
Write-Host "    * Office Wi-Fi LAN:       http://$($localIp):8080" -ForegroundColor White
Write-Host ""
Write-Host "  Configuration Summary:" -ForegroundColor Yellow
Write-Host "    * Shared Storage Drive:   $finalStorageFolder" -ForegroundColor White
Write-Host "    * Auto-Start on Boot:     $(if ($enableAutoStart) { 'Enabled (Automatic)' } else { 'Disabled' })" -ForegroundColor White
Write-Host "    * Desktop Bubble:         Enabled (Floating screen widget)" -ForegroundColor White
Write-Host ""
Write-Host "------------------------------------------------------------------" -ForegroundColor Cyan
Write-Host "  You can safely CLOSE this window at any time." -ForegroundColor Gray
Write-Host "  ZoneHub will continue running quietly in the background." -ForegroundColor Gray
Write-Host "==================================================================" -ForegroundColor Green
Write-Host ""
