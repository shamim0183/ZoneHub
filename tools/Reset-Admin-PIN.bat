@echo off
title Reset ZoneHub Admin PIN
cd /d "%~dp0.."

powershell -NoProfile -ExecutionPolicy Bypass -Command "& {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $cfgPath = Join-Path (Get-Location).Path 'hub_config.json'
    $curPin = '1234'
    $cfg = @{}
    if (Test-Path $cfgPath) {
        try {
            $raw = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
            foreach ($prop in $raw.PSObject.Properties) { $cfg[$prop.Name] = $prop.Value }
            if ($cfg.adminPin) { $curPin = $cfg.adminPin }
        } catch {}
    }

    Clear-Host
    Write-Host '==================================================================' -ForegroundColor Cyan
    Write-Host '               ZoneHub - Admin PIN Manager & Reset                ' -ForegroundColor Yellow
    Write-Host '==================================================================' -ForegroundColor Cyan
    Write-Host ''
    Write-Host ('  Current Admin PIN: ' + $curPin) -ForegroundColor Green
    Write-Host ''
    Write-Host '  Enter a new 4-digit PIN (or press Enter to keep/reset to 1234):' -ForegroundColor White
    $inputPin = Read-Host '  New PIN'
    
    if ([string]::IsNullOrWhiteSpace($inputPin)) {
        Write-Host '  Keeping PIN: ' $curPin -ForegroundColor Yellow
        return
    }

    $newPin = $inputPin.Trim()
    if ($newPin.Length -lt 4) {
        Write-Host '  Error: PIN must be at least 4 digits.' -ForegroundColor Red
        return
    }

    $cfg['adminPin'] = $newPin
    $cfg['updatedAt'] = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    $newJson = $cfg | ConvertTo-Json -Compress
    [System.IO.File]::WriteAllText($cfgPath, $newJson, [System.Text.Encoding]::UTF8)

    Write-Host ''
    Write-Host '==================================================================' -ForegroundColor Green
    Write-Host ('  [SUCCESS] Admin PIN successfully changed to: ' + $newPin) -ForegroundColor Green
    Write-Host '==================================================================' -ForegroundColor Green
    Write-Host ''
}"

pause

