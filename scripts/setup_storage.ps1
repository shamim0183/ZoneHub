# ZoneHub Storage Drive Setup Script
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$baseDir = Split-Path -Parent $PSScriptRoot
if (-not $baseDir) { $baseDir = (Get-Location).Path }
$configPath = Join-Path $baseDir "hub_config.json"

Clear-Host
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "       ZoneHub - Storage Drive & Hosting Location Setup          " -ForegroundColor Yellow
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""

# Read current storage dir from hub_config.json if present
$currentStorage = $baseDir
if (Test-Path $configPath) {
    try {
        $jsonContent = Get-Content $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($jsonContent.storageDir -and $jsonContent.storageDir.Trim() -ne "") {
            $currentStorage = $jsonContent.storageDir.Trim()
        }
    } catch {}
}

Write-Host "Current Storage Directory:" -ForegroundColor Gray
Write-Host "  -> $currentStorage" -ForegroundColor Green
Write-Host ""

# Detect all Fixed ready drives
$drives = [System.IO.DriveInfo]::GetDrives() | Where-Object { $_.IsReady -and $_.DriveType -eq 'Fixed' }
Write-Host "Available PC Drives:" -ForegroundColor Yellow
$options = @()
$idx = 1

foreach ($d in $drives) {
    $freeGB = [math]::Round($d.AvailableFreeSpace / 1GB, 1)
    $totalGB = [math]::Round($d.TotalSize / 1GB, 1)
    $label = if ($d.VolumeLabel) { "($($d.VolumeLabel))" } else { "" }
    $targetFolder = Join-Path $d.Name "ZoneHub_Storage"
    
    $isCurrent = ($currentStorage.StartsWith($d.Name, [System.StringComparison]::OrdinalIgnoreCase))
    $tag = if ($isCurrent) { " [CURRENT ACTIVE]" } else { "" }

    Write-Host "  [$idx] Drive $($d.Name) $label - $freeGB GB Free of $totalGB GB$tag" -ForegroundColor White
    Write-Host "        Target: $targetFolder" -ForegroundColor Gray
    
    $options += [PSCustomObject]@{
        Index = $idx
        Type = "drive"
        Path = $targetFolder
        DriveName = $d.Name
    }
    $idx++
}

# App default directory option
$appDefault = Join-Path $baseDir "ZoneHub_Storage"
Write-Host "  [$idx] ZoneHub App Folder (Default)" -ForegroundColor White
Write-Host "        Target: $baseDir" -ForegroundColor Gray
$options += [PSCustomObject]@{
    Index = $idx
    Type = "app"
    Path = $baseDir
}
$idx++

# Custom path option
Write-Host "  [$idx] Custom Path (Type your own folder path)" -ForegroundColor White
$options += [PSCustomObject]@{
    Index = $idx
    Type = "custom"
    Path = ""
}

Write-Host ""
Write-Host "------------------------------------------------------------------" -ForegroundColor Cyan
$choice = Read-Host "Select option [1-$idx] (Press Enter to keep current)"

$selectedPath = ""
if ([string]::IsNullOrWhiteSpace($choice)) {
    Write-Host "No change made. Keeping: $currentStorage" -ForegroundColor Yellow
    return
}

$num = 0
if ([int]::TryParse($choice, [ref]$num)) {
    $matched = $options | Where-Object { $_.Index -eq $num }
    if ($matched) {
        if ($matched.Type -eq "custom") {
            $customInput = Read-Host "Enter full folder path (e.g. D:\MyOfficeFiles)"
            if (-not [string]::IsNullOrWhiteSpace($customInput)) {
                $selectedPath = $customInput.Trim()
            } else {
                Write-Host "Invalid path. Setup cancelled." -ForegroundColor Red
                return
            }
        } else {
            $selectedPath = $matched.Path
        }
    } else {
        Write-Host "Invalid selection. Setup cancelled." -ForegroundColor Red
        return
    }
} else {
    Write-Host "Invalid selection. Setup cancelled." -ForegroundColor Red
    return
}

if (-not [string]::IsNullOrWhiteSpace($selectedPath)) {
    try {
        if (-not (Test-Path $selectedPath)) {
            New-Item -ItemType Directory -Path $selectedPath -Force | Out-Null
            Write-Host "[CREATED] Created storage folder: $selectedPath" -ForegroundColor Green
        }

        # Test write access
        $testFile = Join-Path $selectedPath ".zonehub_test_write"
        [System.IO.File]::WriteAllText($testFile, "test")
        Remove-Item $testFile -Force

        # Update hub_config.json
        $cfg = @{}
        if (Test-Path $configPath) {
            try {
                $raw = Get-Content $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
                foreach ($prop in $raw.PSObject.Properties) {
                    $cfg[$prop.Name] = $prop.Value
                }
            } catch {}
        }
        $cfg["storageDir"] = $selectedPath
        $cfg["updatedAt"] = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")

        $newJson = $cfg | ConvertTo-Json -Compress
        [System.IO.File]::WriteAllText($configPath, $newJson, [System.Text.Encoding]::UTF8)

        Write-Host ""
        Write-Host "==================================================================" -ForegroundColor Green
        Write-Host "  [SUCCESS] ZoneHub storage configured successfully!" -ForegroundColor Green
        Write-Host "  Storage Path: $selectedPath" -ForegroundColor Yellow
        Write-Host "==================================================================" -ForegroundColor Green

        # Notify running server if online
        try {
            $res = Invoke-RestMethod -Uri "http://localhost:8080/api/admin/set-storage" -Method Post -Body (@{ path = $selectedPath } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($res.success) {
                Write-Host "  [LIVE UPDATED] Active running server switched immediately!" -ForegroundColor Cyan
            }
        } catch {}

    } catch {
        Write-Host "Error configuring storage path: $_" -ForegroundColor Red
    }
}

